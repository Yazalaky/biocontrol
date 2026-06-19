import React, { useEffect, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { firebaseFunctions } from '../services/firebaseFunctions';
import { RolUsuario } from '../types';

type AllowedRole =
  | RolUsuario.GERENCIA
  | RolUsuario.AUXILIAR_ADMINISTRATIVA
  | RolUsuario.INGENIERO_BIOMEDICO
  | RolUsuario.VISITADOR;

type AdminIncidentStatus = 'ABIERTO' | 'RESUELTO';

type AdminIncident = {
  id: string;
  status: AdminIncidentStatus;
  category: string;
  functionName: string;
  module: string;
  action: string;
  errorCode: string;
  errorMessage: string;
  suggestedFix: string;
  userUid?: string;
  userEmail?: string;
  userNombre?: string;
  userRole?: string;
  empresaId?: string;
  sedeId?: string;
  payloadSummary?: unknown;
  createdAt?: string | null;
  updatedAt?: string | null;
  resolvedAt?: string | null;
  resolvedByUid?: string;
  resolvedByNombre?: string;
};

type LegacyOrgDoc = {
  collectionName: string;
  docId: string;
  currentEmpresaId?: string;
  currentSedeId?: string;
  suggestedEmpresaId?: string;
  suggestedSedeId?: string;
  suggestionSource?: string;
  preview?: Record<string, unknown>;
};

function parseCallableError(err: any): string {
  const code = typeof err?.code === 'string' ? err.code : null;
  const message = typeof err?.message === 'string' ? err.message : 'Error desconocido';
  return code ? `${code}: ${message}` : message;
}

function parseScopeInput(text: string): Array<{ empresaId: string; sedeId: string }> {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const parsed = lines
    .map((line) => {
      const normalized = line.replace(',', ':');
      const [empresaRaw = '', sedeRaw = ''] = normalized.split(':');
      const empresaId = empresaRaw.trim().toUpperCase();
      const sedeId = sedeRaw.trim().toUpperCase();
      if (!empresaId || !sedeId) return null;
      return { empresaId, sedeId };
    })
    .filter((item): item is { empresaId: string; sedeId: string } => !!item);
  const keys = new Set<string>();
  return parsed.filter((item) => {
    const key = `${item.empresaId}::${item.sedeId}`;
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}

function formatDateTime(value?: string | null): string {
  if (!value) return 'Sin fecha';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('es-CO');
}

function formatPayloadSummary(value: unknown): string {
  if (value == null) return 'Sin payload';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

const Admin: React.FC = () => {
  const { isAdmin } = useAuth();

  const roles = useMemo(
    () =>
      [
        { value: RolUsuario.GERENCIA, label: 'GERENCIA (solo lectura)' },
        { value: RolUsuario.AUXILIAR_ADMINISTRATIVA, label: 'AUXILIAR_ADMINISTRATIVA (pacientes + asignaciones)' },
        { value: RolUsuario.INGENIERO_BIOMEDICO, label: 'INGENIERO_BIOMEDICO (inventario completo)' },
        { value: RolUsuario.VISITADOR, label: 'VISITADOR (reportes + fotos)' },
      ] as const,
    [],
  );

  // Crear usuario
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState<AllowedRole>(RolUsuario.AUXILIAR_ADMINISTRATIVA);
  const [createScopeText, setCreateScopeText] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdUid, setCreatedUid] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  // Asignar rol
  const [targetUid, setTargetUid] = useState('');
  const [targetNombre, setTargetNombre] = useState('');
  const [targetRol, setTargetRol] = useState<AllowedRole>(RolUsuario.GERENCIA);
  const [targetScopeText, setTargetScopeText] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignOk, setAssignOk] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Recalcular flags VISITADOR
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildMsg, setRebuildMsg] = useState<string | null>(null);
  const [rebuildErr, setRebuildErr] = useState<string | null>(null);

  const [incidentes, setIncidentes] = useState<AdminIncident[]>([]);
  const [loadingIncidentes, setLoadingIncidentes] = useState(false);
  const [incidentesError, setIncidentesError] = useState<string | null>(null);
  const [incidentesStatusFilter, setIncidentesStatusFilter] = useState<'ABIERTO' | 'TODOS'>('ABIERTO');
  const [resolvingIncidentId, setResolvingIncidentId] = useState<string | null>(null);
  const [legacyDocs, setLegacyDocs] = useState<LegacyOrgDoc[]>([]);
  const [loadingLegacyDocs, setLoadingLegacyDocs] = useState(false);
  const [legacyDocsError, setLegacyDocsError] = useState<string | null>(null);
  const [savingLegacyDocKey, setSavingLegacyDocKey] = useState<string | null>(null);
  const [legacyDrafts, setLegacyDrafts] = useState<Record<string, { empresaId: string; sedeId: string }>>({});

  const getLegacyKey = (doc: LegacyOrgDoc) => `${doc.collectionName}::${doc.docId}`;

  const loadIncidentes = async (status: 'ABIERTO' | 'TODOS' = incidentesStatusFilter) => {
    setLoadingIncidentes(true);
    setIncidentesError(null);
    try {
      const fn = httpsCallable(firebaseFunctions, 'listAdminIncidentes');
      const res = await fn({ status, limit: 50 });
      const rows = (res.data as { incidentes?: unknown })?.incidentes;
      setIncidentes(Array.isArray(rows) ? (rows as AdminIncident[]) : []);
    } catch (err: any) {
      setIncidentesError(parseCallableError(err));
    } finally {
      setLoadingIncidentes(false);
    }
  };

  const loadLegacyDocs = async () => {
    setLoadingLegacyDocs(true);
    setLegacyDocsError(null);
    try {
      const fn = httpsCallable(firebaseFunctions, 'listLegacyOrgDocs');
      const res = await fn({ limit: 150 });
      const rows = (res.data as { docs?: unknown })?.docs;
      const docs = Array.isArray(rows) ? (rows as LegacyOrgDoc[]) : [];
      setLegacyDocs(docs);
      setLegacyDrafts(
        docs.reduce<Record<string, { empresaId: string; sedeId: string }>>((acc, doc) => {
          acc[getLegacyKey(doc)] = {
            empresaId: doc.suggestedEmpresaId || doc.currentEmpresaId || '',
            sedeId: doc.suggestedSedeId || doc.currentSedeId || '',
          };
          return acc;
        }, {}),
      );
    } catch (err: any) {
      setLegacyDocsError(parseCallableError(err));
    } finally {
      setLoadingLegacyDocs(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    void loadIncidentes(incidentesStatusFilter);
    void loadLegacyDocs();
  }, [isAdmin, incidentesStatusFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreatedUid(null);
    setCreating(true);
    try {
      const fn = httpsCallable(firebaseFunctions, 'adminCreateUser');
      const scope = parseScopeInput(createScopeText);
      const res = await fn({
        email: email.trim(),
        password,
        nombre: nombre.trim().toUpperCase(),
        rol,
        ...(scope.length > 0 ? { scope } : {}),
      });
      const uid = (res.data as any)?.uid;
      if (typeof uid === 'string') setCreatedUid(uid);
      else setCreatedUid('Creado (UID no retornado)');
      setEmail('');
      setPassword('');
      setNombre('');
      setCreateScopeText('');
    } catch (err: any) {
      setCreateError(parseCallableError(err));
    } finally {
      setCreating(false);
    }
  };

  const handleAssignRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssignError(null);
    setAssignOk(null);
    setAssigning(true);
    try {
      const fn = httpsCallable(firebaseFunctions, 'adminSetUserRole');
      const scope = parseScopeInput(targetScopeText);
      await fn({
        uid: targetUid.trim(),
        rol: targetRol,
        nombre: targetNombre.trim().toUpperCase(),
        ...(scope.length > 0 ? { scope } : {}),
      });
      setAssignOk('Rol actualizado correctamente.');
    } catch (err: any) {
      setAssignError(parseCallableError(err));
    } finally {
      setAssigning(false);
    }
  };

  const handleResolveIncident = async (incidentId: string) => {
    setResolvingIncidentId(incidentId);
    setIncidentesError(null);
    try {
      const fn = httpsCallable(firebaseFunctions, 'resolveAdminIncidente');
      await fn({ incidenteId: incidentId });
      await loadIncidentes(incidentesStatusFilter);
    } catch (err: any) {
      setIncidentesError(parseCallableError(err));
    } finally {
      setResolvingIncidentId(null);
    }
  };

  const handleSaveLegacyDoc = async (doc: LegacyOrgDoc) => {
    const key = getLegacyKey(doc);
    const draft = legacyDrafts[key];
    setSavingLegacyDocKey(key);
    setLegacyDocsError(null);
    try {
      const fn = httpsCallable(firebaseFunctions, 'fixLegacyOrgDoc');
      await fn({
        collectionName: doc.collectionName,
        docId: doc.docId,
        empresaId: draft?.empresaId?.trim().toUpperCase(),
        sedeId: draft?.sedeId?.trim().toUpperCase(),
      });
      await loadLegacyDocs();
    } catch (err: any) {
      setLegacyDocsError(parseCallableError(err));
    } finally {
      setSavingLegacyDocKey(null);
    }
  };

  if (!isAdmin) {
    return (
      <Layout title="Admin">
        <div className="bg-white p-6 rounded-lg shadow max-w-2xl">
          <h3 className="font-bold text-gray-900 mb-2">Acceso restringido</h3>
          <p className="text-sm text-gray-600">
            Esta sección es solo para administradores. Si necesitas acceso, crea el documento
            <code className="px-1">admins/&lt;tuUid&gt;</code> en Firestore con el campo
            <code className="px-1">enabled: true</code>.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Administración">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="font-bold text-gray-900 mb-1">Crear usuario</h3>
          <p className="text-xs text-gray-500 mb-4">
            Crea un usuario en Authentication y su perfil en Firestore con rol.
          </p>

          {createError && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded p-3 text-sm">
              {createError}
            </div>
          )}
          {createdUid && (
            <div className="mb-4 bg-green-50 border border-green-200 text-green-800 rounded p-3 text-sm">
              Usuario creado. UID: <span className="font-mono break-all">{createdUid}</span>
            </div>
          )}

          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input
                className="mt-1 w-full border p-2 rounded"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Contraseña</label>
              <input
                className="mt-1 w-full border p-2 rounded"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                required
                minLength={6}
              />
              <p className="text-xs text-gray-500 mt-1">Mínimo 6 caracteres.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Nombre</label>
              <input
                className="mt-1 w-full border p-2 rounded"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Carlos Higuera"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Rol</label>
              <select className="mt-1 w-full border p-2 rounded" value={rol} onChange={(e) => setRol(e.target.value as AllowedRole)}>
                {roles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Scope</label>
              <textarea
                className="mt-1 w-full border p-2 rounded font-mono text-xs"
                value={createScopeText}
                onChange={(e) => setCreateScopeText(e.target.value)}
                placeholder={'MEDICUC:BUCARAMANGA\nALIADOS:ALIADOS_CUC'}
                rows={3}
              />
              <p className="text-xs text-gray-500 mt-1">
                Una sede por línea, formato EMPRESA:SEDE. Este campo es obligatorio para crear el usuario sin ambigüedad.
              </p>
            </div>
            <button
              type="submit"
              disabled={creating}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-60"
            >
              {creating ? 'Creando...' : 'Crear usuario'}
            </button>
          </form>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="font-bold text-gray-900 mb-1">Asignar / cambiar rol</h3>
          <p className="text-xs text-gray-500 mb-4">
            Útil si creaste el usuario en consola y solo quieres asignar rol o corregir el nombre.
          </p>

          {assignError && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded p-3 text-sm">
              {assignError}
            </div>
          )}
          {assignOk && (
            <div className="mb-4 bg-green-50 border border-green-200 text-green-800 rounded p-3 text-sm">
              {assignOk}
            </div>
          )}

          <form onSubmit={handleAssignRole} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">UID del usuario</label>
              <input
                className="mt-1 w-full border p-2 rounded font-mono"
                value={targetUid}
                onChange={(e) => setTargetUid(e.target.value)}
                placeholder="Ej: 04mRmSGsnffNmvJQnuOofjEULi73"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Nombre (opcional)</label>
              <input
                className="mt-1 w-full border p-2 rounded"
                value={targetNombre}
                onChange={(e) => setTargetNombre(e.target.value)}
                placeholder="Ej: CLAIRET SOLANO"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Rol</label>
              <select
                className="mt-1 w-full border p-2 rounded"
                value={targetRol}
                onChange={(e) => setTargetRol(e.target.value as AllowedRole)}
              >
                {roles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Scope</label>
              <textarea
                className="mt-1 w-full border p-2 rounded font-mono text-xs"
                value={targetScopeText}
                onChange={(e) => setTargetScopeText(e.target.value)}
                placeholder={'MEDICUC:BUCARAMANGA\nALIADOS:ALIADOS_CUC'}
                rows={3}
              />
              <p className="text-xs text-gray-500 mt-1">
                Si lo llenas, reemplaza el scope actual del usuario. Si el perfil no tiene contexto válido, debes corregirlo aquí.
              </p>
            </div>
            <button
              type="submit"
              disabled={assigning}
              className="w-full bg-slate-800 text-white px-4 py-2 rounded disabled:opacity-60"
            >
              {assigning ? 'Guardando...' : 'Guardar rol'}
            </button>
          </form>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="font-bold text-gray-900 mb-1">VISITADOR: Recalcular flags</h3>
          <p className="text-xs text-gray-500 mb-4">
            Paso recomendado al activar el rol VISITADOR si ya existen asignaciones previas.
          </p>

          {rebuildErr && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded p-3 text-sm">
              {rebuildErr}
            </div>
          )}
          {rebuildMsg && (
            <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded p-3 text-sm">
              {rebuildMsg}
            </div>
          )}

          <button
            className="md-btn md-btn-filled w-full"
            disabled={rebuilding}
            onClick={async () => {
              setRebuildErr(null);
              setRebuildMsg(null);
              setRebuilding(true);
              try {
                const fn = httpsCallable(firebaseFunctions, 'rebuildVisitadorFlags');
                const res = await fn({});
                const data = res.data as any;
                setRebuildMsg(
                  `OK. Pacientes activos: ${data?.pacientesActivos ?? 0} · Equipos activos: ${data?.equiposActivos ?? 0}`,
                );
              } catch (err: any) {
                setRebuildErr(parseCallableError(err));
              } finally {
                setRebuilding(false);
              }
            }}
          >
            {rebuilding ? 'Recalculando...' : 'Recalcular ahora'}
          </button>

          <div className="text-xs text-gray-500 mt-3">
            Esto actualiza <code className="px-1">pacientes.tieneAsignacionActiva</code> y{' '}
            <code className="px-1">equipos.asignadoActivo</code> basándose en asignaciones activas.
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow lg:col-span-2">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
            <div>
              <h3 className="font-bold text-gray-900 mb-1">Corrección de documentos legacy</h3>
              <p className="text-xs text-gray-500">
                Lista documentos sin <code className="px-1">empresaId/sedeId</code> válidos y te permite corregirlos desde aquí.
              </p>
            </div>
            <button
              type="button"
              className="bg-slate-800 text-white px-4 py-2 rounded disabled:opacity-60"
              disabled={loadingLegacyDocs}
              onClick={() => void loadLegacyDocs()}
            >
              {loadingLegacyDocs ? 'Buscando...' : 'Actualizar lista'}
            </button>
          </div>

          {legacyDocsError && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded p-3 text-sm">
              {legacyDocsError}
            </div>
          )}

          {!loadingLegacyDocs && legacyDocs.length === 0 && (
            <div className="border border-dashed border-emerald-300 bg-emerald-50 rounded p-4 text-sm text-emerald-800">
              No hay documentos legacy pendientes por corregir.
            </div>
          )}

          <div className="space-y-4">
            {legacyDocs.map((doc) => {
              const key = getLegacyKey(doc);
              const draft = legacyDrafts[key] ?? { empresaId: '', sedeId: '' };
              return (
                <div key={key} className="border border-amber-200 bg-amber-50/40 rounded-lg p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-2 mb-2">
                        <span className="px-2 py-1 rounded text-xs font-semibold bg-amber-100 text-amber-900">
                          LEGACY
                        </span>
                        <span className="px-2 py-1 rounded text-xs font-semibold bg-slate-100 text-slate-800">
                          {doc.collectionName}
                        </span>
                        <span className="px-2 py-1 rounded text-xs bg-white border border-slate-200 text-slate-700 font-mono">
                          {doc.docId}
                        </span>
                      </div>
                      <div className="text-sm text-slate-700">
                        Actual: {doc.currentEmpresaId || 'SIN_EMPRESA'} / {doc.currentSedeId || 'SIN_SEDE'}
                      </div>
                      <div className="text-sm text-slate-700">
                        Sugerencia: {doc.suggestedEmpresaId || 'SIN_EMPRESA'} / {doc.suggestedSedeId || 'SIN_SEDE'}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Fuente de sugerencia: {doc.suggestionSource || 'SIN_SUGERENCIA'}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="bg-emerald-600 text-white px-4 py-2 rounded disabled:opacity-60"
                      disabled={savingLegacyDocKey === key || !draft.empresaId.trim() || !draft.sedeId.trim()}
                      onClick={() => void handleSaveLegacyDoc(doc)}
                    >
                      {savingLegacyDocKey === key ? 'Guardando...' : 'Guardar corrección'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Empresa</label>
                      <input
                        className="mt-1 w-full border p-2 rounded font-mono"
                        value={draft.empresaId}
                        onChange={(e) =>
                          setLegacyDrafts((prev) => ({
                            ...prev,
                            [key]: { ...draft, empresaId: e.target.value.toUpperCase() },
                          }))
                        }
                        placeholder="MEDICUC"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Sede</label>
                      <input
                        className="mt-1 w-full border p-2 rounded font-mono"
                        value={draft.sedeId}
                        onChange={(e) =>
                          setLegacyDrafts((prev) => ({
                            ...prev,
                            [key]: { ...draft, sedeId: e.target.value.toUpperCase() },
                          }))
                        }
                        placeholder="BUCARAMANGA"
                      />
                    </div>
                  </div>

                  {doc.suggestedEmpresaId && doc.suggestedSedeId && (
                    <button
                      type="button"
                      className="mt-3 text-sm text-blue-700 hover:text-blue-900"
                      onClick={() =>
                        setLegacyDrafts((prev) => ({
                          ...prev,
                          [key]: {
                            empresaId: doc.suggestedEmpresaId || '',
                            sedeId: doc.suggestedSedeId || '',
                          },
                        }))
                      }
                    >
                      Usar sugerencia automática
                    </button>
                  )}

                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-medium text-slate-700">
                      Ver resumen del documento
                    </summary>
                    <pre className="mt-2 bg-slate-950 text-slate-100 rounded p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">
                      {formatPayloadSummary(doc.preview)}
                    </pre>
                  </details>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow lg:col-span-2">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
            <div>
              <h3 className="font-bold text-gray-900 mb-1">Panel de incidentes</h3>
              <p className="text-xs text-gray-500">
                Muestra errores registrados por Cloud Functions para ayudarte a corregir datos, contexto y permisos.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                className="border p-2 rounded text-sm"
                value={incidentesStatusFilter}
                onChange={(e) => setIncidentesStatusFilter(e.target.value as 'ABIERTO' | 'TODOS')}
              >
                <option value="ABIERTO">Solo abiertos</option>
                <option value="TODOS">Todos</option>
              </select>
              <button
                type="button"
                className="bg-slate-800 text-white px-4 py-2 rounded disabled:opacity-60"
                disabled={loadingIncidentes}
                onClick={() => void loadIncidentes(incidentesStatusFilter)}
              >
                {loadingIncidentes ? 'Actualizando...' : 'Actualizar'}
              </button>
            </div>
          </div>

          {incidentesError && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded p-3 text-sm">
              {incidentesError}
            </div>
          )}

          {!loadingIncidentes && incidentes.length === 0 && (
            <div className="border border-dashed border-slate-300 rounded p-4 text-sm text-slate-600">
              No hay incidentes para el filtro seleccionado.
            </div>
          )}

          <div className="space-y-4">
            {incidentes.map((incidente) => (
              <div key={incidente.id} className="border border-slate-200 rounded-lg p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2 mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${incidente.status === 'ABIERTO' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>
                        {incidente.status}
                      </span>
                      <span className="px-2 py-1 rounded text-xs font-semibold bg-slate-100 text-slate-800">
                        {incidente.module || 'SIN_MODULO'}
                      </span>
                      <span className="px-2 py-1 rounded text-xs bg-red-50 text-red-800 border border-red-200">
                        {incidente.errorCode || 'ERROR'}
                      </span>
                    </div>
                    <h4 className="font-semibold text-slate-900 break-all">
                      {incidente.action || incidente.functionName || 'Incidente sin acción'}
                    </h4>
                    <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">
                      {incidente.errorMessage || 'Sin mensaje técnico'}
                    </p>
                  </div>

                  {incidente.status === 'ABIERTO' && (
                    <button
                      type="button"
                      className="bg-emerald-600 text-white px-4 py-2 rounded disabled:opacity-60"
                      disabled={resolvingIncidentId === incidente.id}
                      onClick={() => void handleResolveIncident(incidente.id)}
                    >
                      {resolvingIncidentId === incidente.id ? 'Resolviendo...' : 'Marcar resuelto'}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mt-4 text-sm">
                  <div>
                    <div className="text-xs text-slate-500">Fecha</div>
                    <div className="font-medium text-slate-800">{formatDateTime(incidente.createdAt)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Usuario</div>
                    <div className="font-medium text-slate-800">{incidente.userNombre || incidente.userEmail || incidente.userUid || 'Sin usuario'}</div>
                    <div className="text-xs text-slate-500">{incidente.userRole || 'Sin rol'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Contexto</div>
                    <div className="font-medium text-slate-800">
                      {incidente.empresaId || 'SIN_EMPRESA'} / {incidente.sedeId || 'SIN_SEDE'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Categoría</div>
                    <div className="font-medium text-slate-800">{incidente.category || 'SIN_CATEGORIA'}</div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-xs text-slate-500 mb-1">Sugerencia de corrección</div>
                  <div className="bg-slate-50 border border-slate-200 rounded p-3 text-sm text-slate-700 whitespace-pre-wrap">
                    {incidente.suggestedFix || 'Sin sugerencia'}
                  </div>
                </div>

                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">
                    Ver payload resumido
                  </summary>
                  <pre className="mt-2 bg-slate-950 text-slate-100 rounded p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">
                    {formatPayloadSummary(incidente.payloadSummary)}
                  </pre>
                </details>

                {incidente.status === 'RESUELTO' && (
                  <div className="mt-4 text-xs text-slate-500">
                    Resuelto por {incidente.resolvedByNombre || incidente.resolvedByUid || 'ADMIN'} el {formatDateTime(incidente.resolvedAt)}.
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Admin;
