import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { confirmDialog, toast } from '../services/feedback';
import { useAuth } from '../contexts/AuthContext';
import { EstadoEquipo, RolUsuario, type Consultorio, type EquipoBiomedico } from '../types';
import {
  deleteConsultorio,
  saveConsultorio,
  subscribeConsultorios,
  subscribeEquipos,
  updateEquipoConsultorio,
} from '../services/firestoreData';

const parseMessage = (err: unknown, fallback: string) => {
  if (typeof err === 'object' && err && typeof (err as any).message === 'string') {
    return (err as any).message as string;
  }
  return fallback;
};

const Consultorios: React.FC = () => {
  const { hasRole, activeOrgContext } = useAuth();
  const [consultorios, setConsultorios] = useState<Consultorio[]>([]);
  const [equipos, setEquipos] = useState<EquipoBiomedico[]>([]);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [consultorioForm, setConsultorioForm] = useState<Consultorio>({
    id: '',
    nombre: '',
    servicio: '',
    ubicacion: '',
    activo: true,
  });
  const [saving, setSaving] = useState(false);
  const [gestionConsultorio, setGestionConsultorio] = useState<Consultorio | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const isAliadosContext = activeOrgContext.empresaId === 'ALIADOS';
  const canEdit = hasRole([RolUsuario.INGENIERO_BIOMEDICO]);
  const canRead = hasRole([
    RolUsuario.INGENIERO_BIOMEDICO,
    RolUsuario.AUXILIAR_ADMINISTRATIVA,
    RolUsuario.GERENCIA,
  ]);

  useEffect(() => {
    if (!isAliadosContext || !canRead) return;
    setFirestoreError(null);
    const unsubConsultorios = subscribeConsultorios(
      setConsultorios,
      (e) => setFirestoreError(`No tienes permisos para leer consultorios. Detalle: ${e.message}`),
    );
    const unsubEquipos = subscribeEquipos(
      setEquipos,
      (e) => setFirestoreError(`No tienes permisos para leer equipos. Detalle: ${e.message}`),
    );
    return () => {
      unsubConsultorios();
      unsubEquipos();
    };
  }, [isAliadosContext, canRead]);

  const statsByConsultorio = useMemo(() => {
    const out = new Map<string, { total: number; disponible: number; asignado: number; mantenimiento: number; baja: number }>();
    for (const eq of equipos) {
      if (!eq.consultorioId) continue;
      const current = out.get(eq.consultorioId) || {
        total: 0,
        disponible: 0,
        asignado: 0,
        mantenimiento: 0,
        baja: 0,
      };
      current.total += 1;
      if (eq.estado === EstadoEquipo.DISPONIBLE) current.disponible += 1;
      if (eq.estado === EstadoEquipo.ASIGNADO) current.asignado += 1;
      if (eq.estado === EstadoEquipo.MANTENIMIENTO) current.mantenimiento += 1;
      if (eq.estado === EstadoEquipo.DADO_DE_BAJA) current.baja += 1;
      out.set(eq.consultorioId, current);
    }
    return out;
  }, [equipos]);

  const gestionRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return [...equipos]
      .filter((eq) => {
        if (!gestionConsultorio) return false;
        if (!term) return true;
        return (
          (eq.codigoInventario || '').toLowerCase().includes(term) ||
          (eq.nombre || '').toLowerCase().includes(term) ||
          (eq.numeroSerie || '').toLowerCase().includes(term) ||
          (eq.consultorioNombre || '').toLowerCase().includes(term)
        );
      })
      .sort((a, b) => (a.codigoInventario || '').localeCompare(b.codigoInventario || ''));
  }, [equipos, gestionConsultorio, searchTerm]);

  const openCreate = () => {
    setConsultorioForm({ id: '', nombre: '', servicio: '', ubicacion: '', activo: true });
    setIsModalOpen(true);
  };

  const openEdit = (consultorio: Consultorio) => {
    setConsultorioForm({
      id: consultorio.id,
      nombre: consultorio.nombre || '',
      servicio: consultorio.servicio || '',
      ubicacion: consultorio.ubicacion || '',
      activo: consultorio.activo !== false,
    });
    setIsModalOpen(true);
  };

  const handleSaveConsultorio = async () => {
    if (!canEdit) return;
    if (!consultorioForm.nombre.trim()) {
      toast({ tone: 'warning', message: 'Escribe el nombre del consultorio.' });
      return;
    }
    if (!consultorioForm.servicio.trim()) {
      toast({ tone: 'warning', message: 'Escribe el servicio del consultorio.' });
      return;
    }
    if (!consultorioForm.ubicacion.trim()) {
      toast({ tone: 'warning', message: 'Escribe la ubicación del consultorio.' });
      return;
    }

    setSaving(true);
    try {
      await saveConsultorio(consultorioForm);
      setIsModalOpen(false);
      toast({ tone: 'success', message: 'Consultorio guardado correctamente.' });
    } catch (err) {
      toast({ tone: 'error', message: parseMessage(err, 'No se pudo guardar el consultorio.') });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConsultorio = async (consultorio: Consultorio) => {
    if (!canEdit) return;
    const equiposVinculados = equipos.filter((e) => e.consultorioId === consultorio.id).length;
    if (equiposVinculados > 0) {
      toast({
        tone: 'warning',
        message: `No puedes eliminarlo. Tiene ${equiposVinculados} equipo(s) vinculados.`,
      });
      return;
    }
    const ok = await confirmDialog({
      title: 'Eliminar consultorio',
      message: `Se eliminará ${consultorio.nombre}.`,
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteConsultorio(consultorio.id);
      toast({ tone: 'success', message: 'Consultorio eliminado.' });
    } catch (err) {
      toast({ tone: 'error', message: parseMessage(err, 'No se pudo eliminar el consultorio.') });
    }
  };

  const handleSetEquipoConsultorio = async (equipo: EquipoBiomedico, consultorio: Consultorio | null) => {
    if (!canEdit) return;
    if (consultorio && equipo.estado === EstadoEquipo.DADO_DE_BAJA) {
      toast({
        tone: 'warning',
        message: 'No puedes asignar a consultorio un equipo que está dado de baja.',
      });
      return;
    }
    if (consultorio && equipo.consultorioId && equipo.consultorioId !== consultorio.id) {
      toast({
        tone: 'warning',
        message: 'Este equipo ya está en otro consultorio. Debes quitarlo primero.',
      });
      return;
    }
    setActionLoadingId(equipo.id);
    try {
      await updateEquipoConsultorio(
        equipo.id,
        consultorio
          ? { id: consultorio.id, nombre: consultorio.nombre, ubicacion: consultorio.ubicacion }
          : null,
      );
      toast({
        tone: 'success',
        message: consultorio
          ? `${equipo.codigoInventario} vinculado a ${consultorio.nombre}.`
          : `${equipo.codigoInventario} quitado del consultorio.`,
      });
    } catch (err) {
      toast({ tone: 'error', message: parseMessage(err, 'No se pudo actualizar el consultorio del equipo.') });
    } finally {
      setActionLoadingId(null);
    }
  };

  if (!isAliadosContext) {
    return (
      <Layout title="Consultorios">
        <div className="md-card p-4 text-sm text-gray-600">
          Este módulo aplica para contextos con consulta externa (actualmente Aliados).
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Consultorios">
      {firestoreError && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded p-3 text-sm">{firestoreError}</div>
      )}

      <div className="md-card p-4 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-gray-900">Consultorios (Aliados)</div>
            <div className="text-xs text-gray-500 mt-0.5">
              Gestión independiente de consultorios y ubicación de equipos.
            </div>
          </div>
          {canEdit && (
            <button type="button" className="md-btn md-btn-filled" onClick={openCreate}>
              Nuevo consultorio
            </button>
          )}
        </div>

        <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
          {consultorios.length === 0 ? (
            <div className="text-sm text-gray-500">No hay consultorios registrados.</div>
          ) : (
            consultorios.map((c) => {
              const linked = equipos
                .filter((e) => e.consultorioId === c.id)
                .sort((a, b) => (a.codigoInventario || '').localeCompare(b.codigoInventario || ''));
              const stats = statsByConsultorio.get(c.id) || {
                total: 0,
                disponible: 0,
                asignado: 0,
                mantenimiento: 0,
                baja: 0,
              };
              return (
                <div key={c.id} className="border rounded-lg p-3 bg-white">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{c.nombre}</div>
                      <div className="text-xs text-gray-600 mt-0.5">
                        Servicio: {c.servicio} · Ubicación: {c.ubicacion}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">Equipos vinculados: {linked.length}</div>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-1 rounded-full border ${
                        c.activo !== false
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-gray-200 bg-gray-100 text-gray-600'
                      }`}
                    >
                      {c.activo !== false ? 'ACTIVO' : 'INACTIVO'}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2 text-[11px]">
                    <div className="border rounded p-2 bg-slate-50"><div className="text-gray-500">Total</div><div className="font-semibold text-gray-900">{stats.total}</div></div>
                    <div className="border rounded p-2 bg-emerald-50"><div className="text-emerald-700">Disponibles</div><div className="font-semibold text-emerald-900">{stats.disponible}</div></div>
                    <div className="border rounded p-2 bg-blue-50"><div className="text-blue-700">Asignados</div><div className="font-semibold text-blue-900">{stats.asignado}</div></div>
                    <div className="border rounded p-2 bg-amber-50"><div className="text-amber-700">Mantto</div><div className="font-semibold text-amber-900">{stats.mantenimiento}</div></div>
                    <div className="border rounded p-2 bg-rose-50"><div className="text-rose-700">Baja</div><div className="font-semibold text-rose-900">{stats.baja}</div></div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="md-btn md-btn-outlined" onClick={() => setGestionConsultorio(c)}>
                      Gestionar equipos
                    </button>
                    {canEdit && (
                      <>
                        <button type="button" className="md-btn md-btn-outlined" onClick={() => openEdit(c)}>
                          Editar
                        </button>
                        <button
                          type="button"
                          className="md-btn md-btn-outlined border-red-200 text-red-700 hover:bg-red-50"
                          onClick={() => handleDeleteConsultorio(c)}
                        >
                          Eliminar
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-lg p-6">
            <h3 className="text-xl font-bold mb-4">{consultorioForm.id ? 'Editar Consultorio' : 'Nuevo Consultorio'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium">Nombre</label>
                <input className="w-full border p-2 rounded" value={consultorioForm.nombre} onChange={(e) => setConsultorioForm((prev) => ({ ...prev, nombre: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium">Servicio</label>
                <input className="w-full border p-2 rounded" value={consultorioForm.servicio} onChange={(e) => setConsultorioForm((prev) => ({ ...prev, servicio: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium">Ubicación</label>
                <input className="w-full border p-2 rounded" value={consultorioForm.ubicacion} onChange={(e) => setConsultorioForm((prev) => ({ ...prev, ubicacion: e.target.value }))} />
              </div>
              <label className="flex items-center gap-2 border rounded p-2">
                <input type="checkbox" checked={consultorioForm.activo !== false} onChange={(e) => setConsultorioForm((prev) => ({ ...prev, activo: e.target.checked }))} />
                <span className="text-sm">Consultorio activo</span>
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="px-4 py-2 border rounded hover:bg-gray-100" onClick={() => setIsModalOpen(false)} disabled={saving}>Cancelar</button>
              <button type="button" className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-60" onClick={handleSaveConsultorio} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {gestionConsultorio && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-5xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-bold text-gray-900">Gestión rápida · {gestionConsultorio.nombre}</div>
                <div className="text-xs text-gray-500">
                  Asigna o quita equipos. Para cambiar de consultorio, primero debes quitar el equipo.
                </div>
              </div>
              <button type="button" className="md-btn md-btn-outlined" onClick={() => setGestionConsultorio(null)}>
                Cerrar
              </button>
            </div>

            <div className="p-4 border-b">
              <input
                type="text"
                className="w-full border p-2 rounded"
                placeholder="Buscar por código, nombre o serie..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="p-4 overflow-auto">
              {gestionRows.length === 0 ? (
                <div className="text-sm text-gray-500">No hay equipos para mostrar.</div>
              ) : (
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Código</th>
                      <th className="px-3 py-2 text-left">Equipo</th>
                      <th className="px-3 py-2 text-left">Serie</th>
                      <th className="px-3 py-2 text-left">Consultorio actual</th>
                      <th className="px-3 py-2 text-left">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {gestionRows.map((eq) => {
                      const isCurrent = eq.consultorioId === gestionConsultorio.id;
                      const isOtherConsultorio = !!eq.consultorioId && !isCurrent;
                      const isBajaAndAssign = !isCurrent && eq.estado === EstadoEquipo.DADO_DE_BAJA;
                      const disabledAssign = (!isCurrent && gestionConsultorio.activo === false)
                        || isOtherConsultorio
                        || isBajaAndAssign;
                      const currentLabel = eq.consultorioNombre || 'SIN CONSULTORIO';
                      const actionLabel = isCurrent
                        ? 'Quitar'
                        : isOtherConsultorio
                          ? 'Bloqueado'
                          : isBajaAndAssign
                            ? 'No aplica'
                            : 'Asignar aquí';
                      return (
                        <tr key={eq.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-mono text-xs">{eq.codigoInventario}</td>
                          <td className="px-3 py-2">
                            <div className="font-medium text-gray-900">{eq.nombre}</div>
                            <div className="text-xs text-gray-500">{eq.marca} · {eq.modelo}</div>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-600">{eq.numeroSerie || '—'}</td>
                          <td className="px-3 py-2 text-xs text-gray-700">{currentLabel}</td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className={`md-btn ${isCurrent ? 'md-btn-outlined border-red-200 text-red-700 hover:bg-red-50' : 'md-btn-filled'} ${
                                disabledAssign ? 'opacity-60 cursor-not-allowed' : ''
                              }`}
                              onClick={() => handleSetEquipoConsultorio(eq, isCurrent ? null : gestionConsultorio)}
                              disabled={actionLoadingId === eq.id || disabledAssign}
                            >
                              {actionLoadingId === eq.id ? 'Guardando...' : actionLabel}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Consultorios;
