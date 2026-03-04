import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { confirmDialog, toast } from '../services/feedback';
import { useAuth } from '../contexts/AuthContext';
import {
  EstadoEquipo,
  RolUsuario,
  TipoActivoInventario,
  type Consultorio,
  type ConsultorioMovimientoEquipo,
  type EquipoBiomedico,
} from '../types';
import {
  deleteConsultorio,
  saveConsultorio,
  subscribeConsultorios,
  subscribeEquipos,
  updateEquipoConsultorio,
} from '../services/firestoreData';

type HistorialRow = {
  key: string;
  consultorioId: string;
  fecha: string;
  accion: ConsultorioMovimientoEquipo['accion'];
  equipoId: string;
  equipoCodigo: string;
  equipoNombre: string;
  actorNombre: string;
  fromNombre: string;
  toNombre: string;
};

const parseMessage = (err: unknown, fallback: string) => {
  if (typeof err === 'object' && err && typeof (err as any).message === 'string') {
    return (err as any).message as string;
  }
  return fallback;
};

const normalizeTipoActivo = (tipo?: TipoActivoInventario) => {
  if (tipo === TipoActivoInventario.NO_BIOMEDICO) return TipoActivoInventario.NO_BIOMEDICO;
  if (tipo === TipoActivoInventario.MOBILIARIO) return TipoActivoInventario.MOBILIARIO;
  return TipoActivoInventario.BIOMEDICO;
};

const tipoActivoLabel = (tipo?: TipoActivoInventario) => {
  const normalized = normalizeTipoActivo(tipo);
  if (normalized === TipoActivoInventario.NO_BIOMEDICO) return 'NO BIOMEDICO';
  if (normalized === TipoActivoInventario.MOBILIARIO) return 'MOBILIARIO';
  return 'BIOMEDICO';
};

const parseHistorial = (raw: unknown): ConsultorioMovimientoEquipo[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const accion = row.accion === 'ASIGNAR' || row.accion === 'QUITAR' ? row.accion : null;
      const fecha = typeof row.fecha === 'string' ? row.fecha : '';
      if (!accion || !fecha) return null;
      return {
        accion,
        fecha,
        fromConsultorioId: typeof row.fromConsultorioId === 'string' ? row.fromConsultorioId : undefined,
        fromConsultorioNombre: typeof row.fromConsultorioNombre === 'string' ? row.fromConsultorioNombre : undefined,
        toConsultorioId: typeof row.toConsultorioId === 'string' ? row.toConsultorioId : undefined,
        toConsultorioNombre: typeof row.toConsultorioNombre === 'string' ? row.toConsultorioNombre : undefined,
        actorUid: typeof row.actorUid === 'string' ? row.actorUid : undefined,
        actorNombre: typeof row.actorNombre === 'string' ? row.actorNombre : undefined,
      } as ConsultorioMovimientoEquipo;
    })
    .filter((x): x is ConsultorioMovimientoEquipo => !!x);
};

const Consultorios: React.FC = () => {
  const { hasRole, activeOrgContext, usuario } = useAuth();
  const [consultorios, setConsultorios] = useState<Consultorio[]>([]);
  const [equipos, setEquipos] = useState<EquipoBiomedico[]>([]);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  const [consultorioSearchTerm, setConsultorioSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [consultorioForm, setConsultorioForm] = useState<Consultorio>({
    id: '',
    nombre: '',
    servicio: '',
    activo: true,
  });
  const [saving, setSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [bulkLoadingConsultorioId, setBulkLoadingConsultorioId] = useState<string | null>(null);

  const [expandedConsultorioId, setExpandedConsultorioId] = useState<string | null>(null);
  const [selectedEquiposByConsultorio, setSelectedEquiposByConsultorio] = useState<Record<string, string[]>>({});
  const [availableSearchByConsultorio, setAvailableSearchByConsultorio] = useState<Record<string, string>>({});

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

  const consultoriosFiltrados = useMemo(() => {
    const term = consultorioSearchTerm.trim().toLowerCase();
    const sorted = [...consultorios].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
    if (!term) return sorted;
    return sorted.filter((c) => {
      return (c.nombre || '').toLowerCase().includes(term) || (c.servicio || '').toLowerCase().includes(term);
    });
  }, [consultorios, consultorioSearchTerm]);

  const equiposSinConsultorio = useMemo(
    () =>
      [...equipos]
        .filter((eq) => !eq.consultorioId)
        .sort((a, b) => (a.codigoInventario || '').localeCompare(b.codigoInventario || '')),
    [equipos],
  );

  const statsByConsultorio = useMemo(() => {
    const out = new Map<string, {
      total: number;
      biomedico: number;
      noBiomedico: number;
      mobiliario: number;
    }>();

    for (const eq of equipos) {
      if (!eq.consultorioId) continue;
      const current = out.get(eq.consultorioId) || {
        total: 0,
        biomedico: 0,
        noBiomedico: 0,
        mobiliario: 0,
      };
      current.total += 1;
      const tipo = normalizeTipoActivo(eq.tipoActivo);
      if (tipo === TipoActivoInventario.BIOMEDICO) current.biomedico += 1;
      if (tipo === TipoActivoInventario.NO_BIOMEDICO) current.noBiomedico += 1;
      if (tipo === TipoActivoInventario.MOBILIARIO) current.mobiliario += 1;
      out.set(eq.consultorioId, current);
    }

    return out;
  }, [equipos]);

  const linkedEquiposByConsultorio = useMemo(() => {
    const out = new Map<string, EquipoBiomedico[]>();
    for (const eq of equipos) {
      if (!eq.consultorioId) continue;
      const current = out.get(eq.consultorioId) || [];
      current.push(eq);
      out.set(eq.consultorioId, current);
    }
    for (const [id, arr] of out.entries()) {
      arr.sort((a, b) => (a.codigoInventario || '').localeCompare(b.codigoInventario || ''));
      out.set(id, arr);
    }
    return out;
  }, [equipos]);

  const historialByConsultorio = useMemo(() => {
    const out = new Map<string, HistorialRow[]>();

    for (const eq of equipos) {
      const historial = parseHistorial((eq as any).consultorioHistorial);
      for (const h of historial) {
        const relatedIds = new Set<string>();
        if (h.fromConsultorioId) relatedIds.add(h.fromConsultorioId);
        if (h.toConsultorioId) relatedIds.add(h.toConsultorioId);

        for (const consultorioId of relatedIds) {
          const current = out.get(consultorioId) || [];
          current.push({
            key: `${eq.id}-${h.fecha}-${h.accion}-${consultorioId}`,
            consultorioId,
            fecha: h.fecha,
            accion: h.accion,
            equipoId: eq.id,
            equipoCodigo: eq.codigoInventario,
            equipoNombre: eq.nombre,
            actorNombre: h.actorNombre || 'SIN REGISTRO',
            fromNombre: h.fromConsultorioNombre || 'SIN CONSULTORIO',
            toNombre: h.toConsultorioNombre || 'SIN CONSULTORIO',
          });
          out.set(consultorioId, current);
        }
      }
    }

    for (const [id, rows] of out.entries()) {
      rows.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
      out.set(id, rows);
    }

    return out;
  }, [equipos]);

  const getVisibleEquiposDisponibles = (consultorioId: string) => {
    const term = (availableSearchByConsultorio[consultorioId] || '').trim().toLowerCase();
    if (!term) return equiposSinConsultorio;
    return equiposSinConsultorio.filter((eq) => {
      return (
        (eq.codigoInventario || '').toLowerCase().includes(term) ||
        (eq.nombre || '').toLowerCase().includes(term) ||
        (eq.numeroSerie || '').toLowerCase().includes(term)
      );
    });
  };

  const openCreate = () => {
    setConsultorioForm({ id: '', nombre: '', servicio: '', activo: true });
    setIsModalOpen(true);
  };

  const openEdit = (consultorio: Consultorio) => {
    setConsultorioForm({
      id: consultorio.id,
      nombre: consultorio.nombre || '',
      servicio: consultorio.servicio || '',
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

    setSaving(true);
    try {
      await saveConsultorio(consultorioForm, activeOrgContext);
      setIsModalOpen(false);
      toast({ tone: 'success', message: 'Consultorio guardado correctamente.' });
    } catch (err) {
      console.error('saveConsultorio failed', {
        err,
        activeOrgContext,
        consultorio: consultorioForm,
      });
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
          ? {
              id: consultorio.id,
              nombre: consultorio.nombre,
            }
          : null,
        {
          uid: usuario?.id,
          nombre: usuario?.nombre,
        },
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

  const toggleSelectEquipo = (consultorioId: string, equipoId: string, checked: boolean) => {
    setSelectedEquiposByConsultorio((prev) => {
      const current = new Set(prev[consultorioId] || []);
      if (checked) current.add(equipoId);
      else current.delete(equipoId);
      return { ...prev, [consultorioId]: Array.from(current) };
    });
  };

  const selectAllVisible = (consultorioId: string) => {
    const ids = getVisibleEquiposDisponibles(consultorioId).map((eq) => eq.id);
    setSelectedEquiposByConsultorio((prev) => ({ ...prev, [consultorioId]: ids }));
  };

  const clearSelection = (consultorioId: string) => {
    setSelectedEquiposByConsultorio((prev) => ({ ...prev, [consultorioId]: [] }));
  };

  const handleBulkAssign = async (consultorio: Consultorio) => {
    if (!canEdit) return;
    const selectedIds = selectedEquiposByConsultorio[consultorio.id] || [];
    if (selectedIds.length === 0) {
      toast({ tone: 'warning', message: 'Selecciona al menos un equipo para asignar.' });
      return;
    }
    if (consultorio.activo === false) {
      toast({ tone: 'warning', message: 'El consultorio está inactivo y no permite nuevas asignaciones.' });
      return;
    }

    setBulkLoadingConsultorioId(consultorio.id);
    let okCount = 0;
    let failCount = 0;

    for (const id of selectedIds) {
      const equipo = equipos.find((eq) => eq.id === id);
      if (!equipo) {
        failCount += 1;
        continue;
      }
      if (equipo.estado === EstadoEquipo.DADO_DE_BAJA) {
        failCount += 1;
        continue;
      }
      try {
        await updateEquipoConsultorio(
          equipo.id,
          {
            id: consultorio.id,
            nombre: consultorio.nombre,
          },
          {
            uid: usuario?.id,
            nombre: usuario?.nombre,
          },
        );
        okCount += 1;
      } catch {
        failCount += 1;
      }
    }

    setBulkLoadingConsultorioId(null);
    setSelectedEquiposByConsultorio((prev) => ({ ...prev, [consultorio.id]: [] }));

    if (failCount > 0) {
      toast({
        tone: 'warning',
        message: `Asignación masiva finalizada. Exitosos: ${okCount}. Fallidos: ${failCount}.`,
      });
    } else {
      toast({
        tone: 'success',
        message: `Asignación masiva completada (${okCount} equipos).`,
      });
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
              Cada cajón muestra sus equipos y permite asignación masiva o individual.
            </div>
          </div>
          {canEdit && (
            <button type="button" className="md-btn md-btn-filled" onClick={openCreate}>
              Nuevo consultorio
            </button>
          )}
        </div>

        <div className="mt-4">
          <input
            type="text"
            className="w-full md:max-w-md border p-2 rounded"
            placeholder="Buscar consultorio por nombre o servicio..."
            value={consultorioSearchTerm}
            onChange={(e) => setConsultorioSearchTerm(e.target.value)}
          />
        </div>

        <div className="mt-4 space-y-3">
          {consultoriosFiltrados.length === 0 ? (
            <div className="text-sm text-gray-500">No hay consultorios que coincidan con la búsqueda.</div>
          ) : (
            consultoriosFiltrados.map((consultorio) => {
              const isOpen = expandedConsultorioId === consultorio.id;
              const linked = linkedEquiposByConsultorio.get(consultorio.id) || [];
              const stats = statsByConsultorio.get(consultorio.id) || {
                total: 0,
                biomedico: 0,
                noBiomedico: 0,
                mobiliario: 0,
              };
              const historial = historialByConsultorio.get(consultorio.id) || [];
              const visibleDisponibles = getVisibleEquiposDisponibles(consultorio.id);
              const selectedIds = selectedEquiposByConsultorio[consultorio.id] || [];

              return (
                <div key={consultorio.id} className="border rounded-lg bg-white">
                  <button
                    type="button"
                    onClick={() => setExpandedConsultorioId((prev) => (prev === consultorio.id ? null : consultorio.id))}
                    className="w-full p-4 flex items-start justify-between gap-3 text-left"
                  >
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{consultorio.nombre}</div>
                      <div className="text-xs text-gray-600 mt-0.5">Servicio: {consultorio.servicio}</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                        <span className="px-2 py-1 rounded border bg-slate-50 text-slate-700">Total: {stats.total}</span>
                        <span className="px-2 py-1 rounded border bg-blue-50 text-blue-700">Biomédico: {stats.biomedico}</span>
                        <span className="px-2 py-1 rounded border bg-emerald-50 text-emerald-700">No biomédico: {stats.noBiomedico}</span>
                        <span className="px-2 py-1 rounded border bg-amber-50 text-amber-700">Mobiliario: {stats.mobiliario}</span>
                        <span
                          className={`px-2 py-1 rounded border ${
                            consultorio.activo !== false
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-gray-100 text-gray-600 border-gray-200'
                          }`}
                        >
                          {consultorio.activo !== false ? 'ACTIVO' : 'INACTIVO'}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs text-gray-500">{isOpen ? 'Ocultar' : 'Ver equipos'}</span>
                  </button>

                  {isOpen && (
                    <div className="border-t p-4 space-y-4">
                      <div>
                        <div className="text-xs font-semibold text-gray-700 mb-2">
                          Equipos en este consultorio ({linked.length})
                        </div>
                        {linked.length === 0 ? (
                          <div className="text-sm text-gray-500">No hay equipos asignados.</div>
                        ) : (
                          <div className="space-y-2">
                            {linked.map((eq) => (
                              <div key={eq.id} className="border rounded p-2 flex flex-col md:flex-row md:items-center justify-between gap-2">
                                <div>
                                  <div className="text-sm font-semibold text-gray-900">
                                    {eq.codigoInventario} · {eq.nombre}
                                  </div>
                                  <div className="text-xs text-gray-600">
                                    Tipo: {tipoActivoLabel(eq.tipoActivo)} · Estado: {eq.estado}
                                  </div>
                                </div>
                                {canEdit && (
                                  <button
                                    type="button"
                                    className="md-btn md-btn-outlined border-red-200 text-red-700 hover:bg-red-50"
                                    onClick={() => handleSetEquipoConsultorio(eq, null)}
                                    disabled={actionLoadingId === eq.id}
                                  >
                                    {actionLoadingId === eq.id ? 'Guardando...' : 'Quitar'}
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {canEdit && (
                        <div className="border rounded-lg p-3 bg-slate-50 space-y-3">
                          <div className="text-xs font-semibold text-gray-700">Asignación masiva de equipos</div>
                          <input
                            type="text"
                            className="w-full border p-2 rounded"
                            placeholder="Filtrar equipos sin consultorio por código, nombre o serie..."
                            value={availableSearchByConsultorio[consultorio.id] || ''}
                            onChange={(e) =>
                              setAvailableSearchByConsultorio((prev) => ({
                                ...prev,
                                [consultorio.id]: e.target.value,
                              }))
                            }
                            disabled={consultorio.activo === false}
                          />
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="md-btn md-btn-outlined"
                              onClick={() => selectAllVisible(consultorio.id)}
                              disabled={consultorio.activo === false || visibleDisponibles.length === 0}
                            >
                              Seleccionar visibles
                            </button>
                            <button
                              type="button"
                              className="md-btn md-btn-outlined"
                              onClick={() => clearSelection(consultorio.id)}
                              disabled={(selectedIds.length === 0) || consultorio.activo === false}
                            >
                              Limpiar selección
                            </button>
                            <button
                              type="button"
                              className="md-btn md-btn-filled"
                              onClick={() => handleBulkAssign(consultorio)}
                              disabled={consultorio.activo === false || selectedIds.length === 0}
                            >
                              {bulkLoadingConsultorioId === consultorio.id
                                ? 'Asignando...'
                                : `Asignar seleccionados (${selectedIds.length})`}
                            </button>
                          </div>

                          <div className="max-h-56 overflow-auto border rounded bg-white p-2 space-y-1">
                            {visibleDisponibles.length === 0 ? (
                              <div className="text-xs text-gray-500">No hay equipos sin consultorio disponibles.</div>
                            ) : (
                              visibleDisponibles.map((eq) => {
                                const isSelected = selectedIds.includes(eq.id);
                                const isBlocked = eq.estado === EstadoEquipo.DADO_DE_BAJA;
                                return (
                                  <label
                                    key={eq.id}
                                    className={`flex items-center justify-between gap-2 px-2 py-1 rounded ${
                                      isBlocked ? 'bg-rose-50' : 'hover:bg-gray-50'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={(e) =>
                                          toggleSelectEquipo(consultorio.id, eq.id, e.target.checked)
                                        }
                                        disabled={isBlocked || consultorio.activo === false}
                                      />
                                      <span className="text-xs truncate">
                                        {eq.codigoInventario} · {eq.nombre}
                                      </span>
                                    </div>
                                    <span className="text-[11px] text-gray-500">
                                      {tipoActivoLabel(eq.tipoActivo)}
                                      {isBlocked ? ' · BAJA' : ''}
                                    </span>
                                  </label>
                                );
                              })
                            )}
                          </div>

                          {consultorio.activo === false && (
                            <p className="text-xs text-amber-700">Consultorio inactivo: no se permiten nuevas asignaciones.</p>
                          )}
                        </div>
                      )}

                      <div className="border rounded-lg p-3 bg-white space-y-2">
                        <div className="text-xs font-semibold text-gray-700">Historial de movimientos</div>
                        {historial.length === 0 ? (
                          <div className="text-xs text-gray-500">Sin movimientos registrados.</div>
                        ) : (
                          <div className="max-h-52 overflow-auto space-y-2">
                            {historial.slice(0, 30).map((row) => (
                              <div key={row.key} className="border rounded p-2 text-xs">
                                <div className="font-semibold text-gray-900">
                                  {new Date(row.fecha).toLocaleString()} · {row.accion}
                                </div>
                                <div className="text-gray-700">
                                  Equipo: {row.equipoCodigo} · {row.equipoNombre}
                                </div>
                                <div className="text-gray-600">
                                  De: {row.fromNombre} · A: {row.toNombre}
                                </div>
                                <div className="text-gray-500">Por: {row.actorNombre}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {canEdit && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="md-btn md-btn-outlined"
                            onClick={() => openEdit(consultorio)}
                          >
                            Editar consultorio
                          </button>
                          <button
                            type="button"
                            className="md-btn md-btn-outlined border-red-200 text-red-700 hover:bg-red-50"
                            onClick={() => handleDeleteConsultorio(consultorio)}
                          >
                            Eliminar consultorio
                          </button>
                        </div>
                      )}
                    </div>
                  )}
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
                <input
                  className="w-full border p-2 rounded"
                  value={consultorioForm.nombre}
                  onChange={(e) => setConsultorioForm((prev) => ({ ...prev, nombre: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Servicio</label>
                <input
                  className="w-full border p-2 rounded"
                  value={consultorioForm.servicio}
                  onChange={(e) => setConsultorioForm((prev) => ({ ...prev, servicio: e.target.value }))}
                  placeholder="Ej: MEDICINA GENERAL"
                />
              </div>
              <label className="flex items-center gap-2 border rounded p-2">
                <input
                  type="checkbox"
                  checked={consultorioForm.activo !== false}
                  onChange={(e) => setConsultorioForm((prev) => ({ ...prev, activo: e.target.checked }))}
                />
                <span className="text-sm">Consultorio activo</span>
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 border rounded hover:bg-gray-100"
                onClick={() => setIsModalOpen(false)}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-60"
                onClick={handleSaveConsultorio}
                disabled={saving}
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Consultorios;
