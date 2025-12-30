import React, { useMemo, useState } from 'react';
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

function parseCallableError(err: any): string {
  const code = typeof err?.code === 'string' ? err.code : null;
  const message = typeof err?.message === 'string' ? err.message : 'Error desconocido';
  return code ? `${code}: ${message}` : message;
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
  const [creating, setCreating] = useState(false);
  const [createdUid, setCreatedUid] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  // Asignar rol
  const [targetUid, setTargetUid] = useState('');
  const [targetNombre, setTargetNombre] = useState('');
  const [targetRol, setTargetRol] = useState<AllowedRole>(RolUsuario.GERENCIA);
  const [assigning, setAssigning] = useState(false);
  const [assignOk, setAssignOk] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Recalcular flags VISITADOR
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildMsg, setRebuildMsg] = useState<string | null>(null);
  const [rebuildErr, setRebuildErr] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreatedUid(null);
    setCreating(true);
    try {
      const fn = httpsCallable(firebaseFunctions, 'adminCreateUser');
      const res = await fn({
        email: email.trim(),
        password,
        nombre: nombre.trim(),
        rol,
      });
      const uid = (res.data as any)?.uid;
      if (typeof uid === 'string') setCreatedUid(uid);
      else setCreatedUid('Creado (UID no retornado)');
      setEmail('');
      setPassword('');
      setNombre('');
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
      await fn({
        uid: targetUid.trim(),
        rol: targetRol,
        nombre: targetNombre.trim(),
      });
      setAssignOk('Rol actualizado correctamente.');
    } catch (err: any) {
      setAssignError(parseCallableError(err));
    } finally {
      setAssigning(false);
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
      </div>
    </Layout>
  );
};

export default Admin;
