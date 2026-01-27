import React, { useEffect, useMemo, useRef, useState } from 'react';
import Layout from '../components/Layout';
import SignatureImageInput from '../components/SignatureImageInput';
import MantenimientoFormat from '../components/MantenimientoFormat';
import { confirmDialog, toast } from '../services/feedback';
import { useAuth } from '../contexts/AuthContext';
import {
  EstadoMantenimiento,
  EstadoAsignacion,
  RolUsuario,
  TipoMantenimiento,
  type Asignacion,
  type EquipoBiomedico,
  type Mantenimiento,
  type MantenimientoHistorial,
  type Paciente,
  type TipoEquipo,
} from '../types';
import {
  addMantenimientoHistorial,
  createMantenimiento,
  subscribeAsignaciones,
  subscribeEquipos,
  subscribeMantenimientos,
  subscribePacientes,
  subscribeTiposEquipo,
  updateMantenimiento,
} from '../services/firestoreData';

type MantenimientoForm = Omit<Mantenimiento, 'consecutivo'> & { consecutivo?: number };

const ESTADOS_LABEL: Record<EstadoMantenimiento, string> = {
  [EstadoMantenimiento.EN_PROCESO]: 'EN PROCESO',
  [EstadoMantenimiento.CERRADO_PENDIENTE_ACEPTACION]: 'PENDIENTE ACEPTACIÓN',
  [EstadoMantenimiento.ACEPTADO]: 'ACEPTADO',
};

const formatDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
};

const Mantenimientos: React.FC = () => {
  const { usuario, hasRole } = useAuth();
  const isBiomedico = hasRole([RolUsuario.INGENIERO_BIOMEDICO]);
  const isAuxiliar = hasRole([RolUsuario.AUXILIAR_ADMINISTRATIVA]);

  const [equipos, setEquipos] = useState<EquipoBiomedico[]>([]);
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [tiposEquipo, setTiposEquipo] = useState<TipoEquipo[]>([]);
  const [mantenimientos, setMantenimientos] = useState<Mantenimiento[]>([]);
  const [search, setSearch] = useState('');
  const [estadoFilter, setEstadoFilter] = useState<EstadoMantenimiento | 'ALL'>(
    isAuxiliar ? EstadoMantenimiento.CERRADO_PENDIENTE_ACEPTACION : 'ALL',
  );

  const [openForm, setOpenForm] = useState(false);
  const [form, setForm] = useState<MantenimientoForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [notaProceso, setNotaProceso] = useState('');
  const [equipoQuery, setEquipoQuery] = useState('');
  const [equipoPickerOpen, setEquipoPickerOpen] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = subscribeMantenimientos(setMantenimientos, (e) => {
      console.error('Error subscribe mantenimientos:', e);
      toast({ tone: 'error', message: 'No se pudieron cargar los mantenimientos.' });
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!isBiomedico) return undefined;
    const unsubEquipos = subscribeEquipos(setEquipos);
    const unsubPacientes = subscribePacientes(setPacientes);
    const unsubAsignaciones = subscribeAsignaciones(setAsignaciones);
    const unsubTipos = subscribeTiposEquipo(setTiposEquipo);
    return () => {
      unsubEquipos();
      unsubPacientes();
      unsubAsignaciones();
      unsubTipos();
    };
  }, [isBiomedico]);

  const pacientesById = useMemo(() => new Map(pacientes.map((p) => [p.id, p])), [pacientes]);
  const tiposEquipoById = useMemo(() => new Map(tiposEquipo.map((t) => [t.id, t])), [tiposEquipo]);

  const activeAsignacionByEquipo = useMemo(() => {
    const map = new Map<string, Asignacion>();
    for (const a of asignaciones) {
      if (a.estado === EstadoAsignacion.ACTIVA) {
        map.set(a.idEquipo, a);
      }
    }
    return map;
  }, [asignaciones]);

  const filteredMantenimientos = useMemo(() => {
    const term = search.trim().toLowerCase();
    return mantenimientos.filter((m) => {
      if (estadoFilter !== 'ALL' && m.estado !== estadoFilter) return false;
      if (!term) return true;
      return (
        (m.codigoInventario || '').toLowerCase().includes(term) ||
        (m.equipoNombre || '').toLowerCase().includes(term) ||
        (m.serie || '').toLowerCase().includes(term) ||
        String(m.consecutivo || '').includes(term)
      );
    });
  }, [mantenimientos, search, estadoFilter]);

  const resetForm = () => {
    setForm(null);
    setNotaProceso('');
    setEquipoQuery('');
    setEquipoPickerOpen(false);
  };

  const openNew = () => {
    if (!isBiomedico || !usuario) return;
    const today = new Date().toISOString().slice(0, 10);
    const initial: MantenimientoForm = {
      id: '',
      consecutivo: undefined,
      tipo: TipoMantenimiento.PREVENTIVO,
      estado: EstadoMantenimiento.CERRADO_PENDIENTE_ACEPTACION,
      fecha: today,
      equipoId: '',
      codigoInventario: '',
      equipoNombre: '',
      marca: '',
      modelo: '',
      serie: '',
      ubicacion: 'BODEGA',
      sede: 'BUCARAMANGA',
      ciudad: '',
      direccion: 'BODEGA',
      telefono: '',
      email: '',
      trabajoRealizado: '',
      fallaReportada: '',
      fallaEncontrada: '',
      repuestos: [],
      hh: '',
      hp: '',
      costo: '',
      observaciones: '',
      firmaBiomedico: undefined,
      firmaAuxiliar: undefined,
      creadoPorUid: usuario.id,
      creadoPorNombre: usuario.nombre,
      historial: [],
    };
    setForm(initial);
    setOpenForm(true);
  };

  const openExisting = (m: Mantenimiento) => {
    setForm({ ...m, id: m.id });
    setOpenForm(true);
  };

  const closeForm = () => {
    setOpenForm(false);
    resetForm();
  };

  const applyEquipo = (equipo: EquipoBiomedico) => {
    const asignacion = activeAsignacionByEquipo.get(equipo.id);
    const paciente = asignacion ? pacientesById.get(asignacion.idPaciente) : undefined;
    const tipoPlantilla = equipo.tipoEquipoId ? tiposEquipoById.get(equipo.tipoEquipoId) : undefined;
    setForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        equipoId: equipo.id,
        codigoInventario: equipo.codigoInventario,
        equipoNombre: equipo.nombre,
        marca: equipo.marca,
        modelo: equipo.modelo,
        serie: equipo.numeroSerie,
        ubicacion: paciente?.direccion || equipo.ubicacionActual || 'BODEGA',
        direccion: paciente?.direccion || equipo.hojaVidaDatos?.direccionEmpresa || equipo.ubicacionActual || 'BODEGA',
        ciudad: paciente?.barrio || prev.ciudad || '',
        sede: prev.sede || equipo.hojaVidaDatos?.sede || 'BUCARAMANGA',
        telefono: paciente?.telefono || prev.telefono || '',
        trabajoRealizado: prev.trabajoRealizado || tipoPlantilla?.trabajoRealizadoDefault || '',
      };
    });
  };

  const equiposFiltrados = useMemo(() => {
    const term = equipoQuery.trim().toLowerCase();
    if (!term) return [];
    return equipos.filter((eq) => {
      return (
        eq.codigoInventario.toLowerCase().includes(term) ||
        eq.numeroSerie.toLowerCase().includes(term) ||
        eq.nombre.toLowerCase().includes(term) ||
        eq.marca.toLowerCase().includes(term)
      );
    });
  }, [equipos, equipoQuery]);

  const handleSave = async () => {
    if (!form || !usuario) return;
    if (!form.equipoId) {
      toast({ tone: 'warning', message: 'Selecciona un equipo.' });
      return;
    }
    if (form.tipo === TipoMantenimiento.PREVENTIVO && !form.firmaBiomedico) {
      toast({ tone: 'warning', message: 'La firma del biomédico es obligatoria para el mantenimiento preventivo.' });
      return;
    }
    setSaving(true);
    try {
      if (!form.id) {
        const { id: _id, consecutivo: _consecutivo, ...rest } = form;
        const estado =
          form.tipo === TipoMantenimiento.PREVENTIVO
            ? EstadoMantenimiento.CERRADO_PENDIENTE_ACEPTACION
            : EstadoMantenimiento.EN_PROCESO;
        const nuevo = await createMantenimiento({
          ...rest,
          estado,
          fecha: form.fecha || new Date().toISOString().slice(0, 10),
          creadoPorUid: usuario.id,
          creadoPorNombre: usuario.nombre,
        } as Omit<Mantenimiento, 'id' | 'consecutivo'>);
        setForm({ ...nuevo });
        toast({ tone: 'success', message: 'Mantenimiento creado.' });
      } else {
        const { id: mantenimientoId, consecutivo: _consecutivo, ...patch } = form;
        await updateMantenimiento(mantenimientoId, patch);
        toast({ tone: 'success', message: 'Mantenimiento actualizado.' });
      }
    } catch (err: any) {
      console.error('Error guardando mantenimiento:', err);
      toast({ tone: 'error', message: err?.message || 'No se pudo guardar el mantenimiento.' });
    } finally {
      setSaving(false);
    }
  };

  const handleAgregarAvance = async () => {
    if (!form?.id || !usuario) return;
    if (!notaProceso.trim()) {
      toast({ tone: 'warning', message: 'Escribe el avance antes de guardar.' });
      return;
    }
    const entry: MantenimientoHistorial = {
      fecha: new Date().toISOString(),
      estado: EstadoMantenimiento.EN_PROCESO,
      nota: notaProceso,
      porUid: usuario.id,
      porNombre: usuario.nombre,
    };
    try {
      await addMantenimientoHistorial(form.id, entry);
      setForm((prev) => ({
        ...(prev as MantenimientoForm),
        historial: [...(prev?.historial || []), entry],
      }));
      setNotaProceso('');
      toast({ tone: 'success', message: 'Avance registrado.' });
    } catch (err: any) {
      console.error('Error guardando avance:', err);
      toast({ tone: 'error', message: err?.message || 'No se pudo guardar el avance.' });
    }
  };

  const handleCerrarCorrectivo = async () => {
    if (!form?.id || !usuario) return;
    if (!form.firmaBiomedico) {
      toast({ tone: 'warning', message: 'La firma del biomédico es obligatoria para cerrar.' });
      return;
    }
    const ok = await confirmDialog({
      title: 'Cerrar mantenimiento',
      message: 'Se enviará al auxiliar para aceptación. ¿Deseas continuar?',
      confirmText: 'Cerrar',
      cancelText: 'Cancelar',
    });
    if (!ok) return;
    const nowIso = new Date().toISOString();
    const entry: MantenimientoHistorial = {
      fecha: nowIso,
      estado: EstadoMantenimiento.CERRADO_PENDIENTE_ACEPTACION,
      nota: form.observaciones || form.trabajoRealizado || 'Mantenimiento cerrado.',
      porUid: usuario.id,
      porNombre: usuario.nombre,
    };
    try {
      await updateMantenimiento(form.id, {
        estado: EstadoMantenimiento.CERRADO_PENDIENTE_ACEPTACION,
        fechaCierre: nowIso,
      });
      await addMantenimientoHistorial(form.id, entry);
      setForm((prev) => ({
        ...(prev as MantenimientoForm),
        estado: EstadoMantenimiento.CERRADO_PENDIENTE_ACEPTACION,
        fechaCierre: nowIso,
        historial: [...(prev?.historial || []), entry],
      }));
      toast({ tone: 'success', message: 'Mantenimiento cerrado y enviado.' });
    } catch (err: any) {
      console.error('Error cerrando mantenimiento:', err);
      toast({ tone: 'error', message: err?.message || 'No se pudo cerrar el mantenimiento.' });
    }
  };

  const handleAceptar = async () => {
    if (!form?.id || !usuario) return;
    if (!form.firmaAuxiliar) {
      toast({ tone: 'warning', message: 'Debes subir la firma para aceptar.' });
      return;
    }
    setAccepting(true);
    try {
      const nowIso = new Date().toISOString();
      await updateMantenimiento(form.id, {
        estado: EstadoMantenimiento.ACEPTADO,
        firmaAuxiliar: form.firmaAuxiliar,
        aceptadoPorUid: usuario.id,
        aceptadoPorNombre: usuario.nombre,
        fechaAceptacion: nowIso,
      });
      setForm((prev) => ({
        ...(prev as MantenimientoForm),
        estado: EstadoMantenimiento.ACEPTADO,
        fechaAceptacion: nowIso,
      }));
      toast({ tone: 'success', message: 'Mantenimiento aceptado.' });
    } catch (err: any) {
      console.error('Error aceptando mantenimiento:', err);
      toast({ tone: 'error', message: err?.message || 'No se pudo aceptar el mantenimiento.' });
    } finally {
      setAccepting(false);
    }
  };

  const handlePrint = async () => {
    const actaEl = printRef.current?.querySelector('.acta-page') as HTMLElement | null;
    if (!actaEl) {
      window.print();
      return;
    }
    const existing = document.getElementById('acta-print-root');
    existing?.remove();
    const printRoot = document.createElement('div');
    printRoot.id = 'acta-print-root';
    printRoot.appendChild(actaEl.cloneNode(true));
    document.body.appendChild(printRoot);
    document.body.classList.add('printing-acta');

    const cleanup = () => {
      document.body.classList.remove('printing-acta');
      printRoot.remove();
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
    setTimeout(cleanup, 1000);
  };

  const historialOrdenado = useMemo(() => {
    if (!form?.historial?.length) return [];
    return [...form.historial].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }, [form?.historial]);

  return (
    <Layout title="Mantenimientos preventivos y correctivos">
      <div className="space-y-6">
        <div className="md-card p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="text-sm text-gray-600">
              Registro de mantenimiento preventivo y correctivo de equipos biomédicos.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 px-4 rounded-full border border-gray-200 w-full md:w-72"
              placeholder="Buscar por consecutivo, MBG, serie o equipo..."
            />
            {isBiomedico && (
              <button className="md-btn md-btn-filled" onClick={openNew}>
                Nuevo mantenimiento
              </button>
            )}
          </div>
        </div>

        <div className="md-card p-4">
          <div className="flex flex-wrap gap-2">
            <button
              className={`md-filter-chip ${estadoFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setEstadoFilter('ALL')}
            >
              Todos
            </button>
            <button
              className={`md-filter-chip ${estadoFilter === EstadoMantenimiento.EN_PROCESO ? 'active' : ''}`}
              onClick={() => setEstadoFilter(EstadoMantenimiento.EN_PROCESO)}
            >
              En proceso
            </button>
            <button
              className={`md-filter-chip ${
                estadoFilter === EstadoMantenimiento.CERRADO_PENDIENTE_ACEPTACION ? 'active' : ''
              }`}
              onClick={() => setEstadoFilter(EstadoMantenimiento.CERRADO_PENDIENTE_ACEPTACION)}
            >
              Pendientes
            </button>
            <button
              className={`md-filter-chip ${estadoFilter === EstadoMantenimiento.ACEPTADO ? 'active' : ''}`}
              onClick={() => setEstadoFilter(EstadoMantenimiento.ACEPTADO)}
            >
              Aceptados
            </button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-gray-500 border-b">
                <tr>
                  <th className="text-left py-2 px-2">#</th>
                  <th className="text-left py-2 px-2">Fecha</th>
                  <th className="text-left py-2 px-2">Equipo</th>
                  <th className="text-left py-2 px-2">Tipo</th>
                  <th className="text-left py-2 px-2">Estado</th>
                  <th className="text-right py-2 px-2">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filteredMantenimientos.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-gray-500 py-6">
                      No hay mantenimientos para mostrar.
                    </td>
                  </tr>
                )}
                {filteredMantenimientos.map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="py-2 px-2 font-semibold">{m.consecutivo}</td>
                    <td className="py-2 px-2">{formatDate(m.fecha)}</td>
                    <td className="py-2 px-2">
                      <div className="font-semibold">{m.equipoNombre}</div>
                      <div className="text-xs text-gray-500">
                        {m.codigoInventario} • {m.serie}
                      </div>
                    </td>
                    <td className="py-2 px-2">
                      {m.tipo === TipoMantenimiento.PREVENTIVO ? 'Preventivo' : 'Correctivo'}
                    </td>
                    <td className="py-2 px-2">
                      <span className="inline-flex px-2 py-1 rounded-full bg-gray-100 text-xs font-semibold">
                        {ESTADOS_LABEL[m.estado]}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right">
                      <button className="md-btn md-btn-outlined" onClick={() => openExisting(m)}>
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {openForm && form && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[94vh] overflow-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-gray-900">
                  Mantenimiento {form.consecutivo ? `#${form.consecutivo}` : 'nuevo'}
                </div>
                <div className="text-xs text-gray-500">
                  {form.codigoInventario ? `${form.codigoInventario} · ${form.equipoNombre}` : 'Selecciona un equipo'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="md-btn md-btn-outlined" onClick={closeForm}>
                  Cerrar
                </button>
              </div>
            </div>

            <div className="p-4 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
              <div className="space-y-4">
                {isBiomedico && !form.id && (
                  <div className="md-card p-4">
                    <label className="block text-sm font-medium text-gray-700">Buscar equipo (MBG o serie)</label>
                    <div className="relative">
                      <input
                        className="mt-1 w-full border p-2 rounded"
                        placeholder="Ej: MBG-015 o 250103654"
                        value={equipoQuery}
                        onChange={(e) => {
                          setEquipoQuery(e.target.value);
                          setEquipoPickerOpen(true);
                        }}
                        onFocus={() => setEquipoPickerOpen(true)}
                      />
                      {equipoPickerOpen && equipoQuery.trim() && (
                        <div className="absolute z-10 mt-1 w-full bg-white border rounded shadow max-h-64 overflow-y-auto">
                          {equiposFiltrados.length === 0 ? (
                            <div className="p-3 text-sm text-gray-500">No hay equipos que coincidan.</div>
                          ) : (
                            <ul className="divide-y">
                              {equiposFiltrados.map((eq) => (
                                <li key={eq.id}>
                                  <button
                                    type="button"
                                    className="w-full text-left p-3 hover:bg-gray-50"
                                    onClick={() => {
                                      applyEquipo(eq);
                                      setEquipoQuery(
                                        `${eq.codigoInventario} • ${eq.numeroSerie} • ${eq.nombre}`,
                                      );
                                      setEquipoPickerOpen(false);
                                    }}
                                  >
                                    <div className="text-sm font-semibold text-gray-900">
                                      {eq.nombre}{' '}
                                      <span className="font-mono text-xs text-gray-600">{eq.codigoInventario}</span>
                                    </div>
                                    <div className="text-xs text-gray-600">
                                      Serie: <span className="font-mono">{eq.numeroSerie}</span> • {eq.marca}{' '}
                                      {eq.modelo ? `• ${eq.modelo}` : ''}
                                    </div>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="md-card p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Fecha</label>
                      <input
                        type="date"
                        className="mt-1 w-full border p-2 rounded"
                        value={form.fecha || ''}
                        onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                        disabled={!isBiomedico}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Tipo mantenimiento</label>
                      <select
                        className="mt-1 w-full border p-2 rounded"
                        value={form.tipo}
                        onChange={(e) => {
                          const tipo = e.target.value as TipoMantenimiento;
                          if (!form.id) {
                            const nuevoEstado =
                              tipo === TipoMantenimiento.PREVENTIVO
                                ? EstadoMantenimiento.CERRADO_PENDIENTE_ACEPTACION
                                : EstadoMantenimiento.EN_PROCESO;
                            setForm({ ...form, tipo, estado: nuevoEstado });
                          } else {
                            setForm({ ...form, tipo });
                          }
                        }}
                        disabled={!isBiomedico}
                      >
                        <option value={TipoMantenimiento.PREVENTIVO}>Preventivo</option>
                        <option value={TipoMantenimiento.CORRECTIVO}>Correctivo</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Sede</label>
                      <input
                        className="mt-1 w-full border p-2 rounded"
                        value={form.sede || ''}
                        onChange={(e) => setForm({ ...form, sede: e.target.value })}
                        disabled={!isBiomedico}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Ciudad</label>
                      <input
                        className="mt-1 w-full border p-2 rounded"
                        value={form.ciudad || ''}
                        onChange={(e) => setForm({ ...form, ciudad: e.target.value })}
                        disabled={!isBiomedico}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Teléfono</label>
                      <input
                        className="mt-1 w-full border p-2 rounded"
                        value={form.telefono || ''}
                        onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                        disabled={!isBiomedico}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Dirección</label>
                      <input
                        className="mt-1 w-full border p-2 rounded"
                        value={form.direccion || ''}
                        onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                        disabled={!isBiomedico}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Email</label>
                      <input
                        className="mt-1 w-full border p-2 rounded"
                        value={form.email || ''}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        disabled={!isBiomedico}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Equipo</label>
                      <input className="mt-1 w-full border p-2 rounded bg-gray-50" value={form.equipoNombre || ''} disabled />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Marca</label>
                      <input className="mt-1 w-full border p-2 rounded bg-gray-50" value={form.marca || ''} disabled />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Modelo</label>
                      <input className="mt-1 w-full border p-2 rounded bg-gray-50" value={form.modelo || ''} disabled />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Serie</label>
                      <input className="mt-1 w-full border p-2 rounded bg-gray-50" value={form.serie || ''} disabled />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Ubicación</label>
                      <input className="mt-1 w-full border p-2 rounded" value={form.ubicacion || ''} disabled={!isBiomedico} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">N° Activo</label>
                      <input className="mt-1 w-full border p-2 rounded bg-gray-50" value={form.codigoInventario || ''} disabled />
                    </div>
                  </div>
                </div>

                <div className="md-card p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Falla reportada</label>
                      <textarea
                        className="mt-1 w-full border p-2 rounded"
                        rows={3}
                        value={form.fallaReportada || ''}
                        onChange={(e) => setForm({ ...form, fallaReportada: e.target.value })}
                        disabled={!isBiomedico}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Falla encontrada</label>
                      <textarea
                        className="mt-1 w-full border p-2 rounded"
                        rows={3}
                        value={form.fallaEncontrada || ''}
                        onChange={(e) => setForm({ ...form, fallaEncontrada: e.target.value })}
                        disabled={!isBiomedico}
                      />
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-700">Trabajo realizado</label>
                    <textarea
                      className="mt-1 w-full border p-2 rounded"
                      rows={4}
                      value={form.trabajoRealizado || ''}
                      onChange={(e) => setForm({ ...form, trabajoRealizado: e.target.value })}
                      disabled={!isBiomedico}
                    />
                  </div>
                </div>

                <div className="md-card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold text-gray-900">Repuestos</div>
                    {isBiomedico && (
                      <button
                        className="md-btn md-btn-outlined"
                        type="button"
                        onClick={() => {
                          const repuestos = form.repuestos ? [...form.repuestos] : [];
                          repuestos.push({ cantidad: 1, descripcion: '' });
                          setForm({ ...form, repuestos });
                        }}
                      >
                        Agregar
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {(form.repuestos || []).length === 0 && (
                      <div className="text-sm text-gray-500">Sin repuestos.</div>
                    )}
                    {(form.repuestos || []).map((r, idx) => (
                      <div key={idx} className="grid grid-cols-[80px_1fr_auto] gap-2 items-center">
                        <input
                          type="number"
                          min={0}
                          className="border p-2 rounded"
                          value={r.cantidad}
                          disabled={!isBiomedico}
                          onChange={(e) => {
                            const repuestos = [...(form.repuestos || [])];
                            repuestos[idx] = { ...repuestos[idx], cantidad: Number(e.target.value) };
                            setForm({ ...form, repuestos });
                          }}
                        />
                        <input
                          className="border p-2 rounded"
                          value={r.descripcion}
                          disabled={!isBiomedico}
                          onChange={(e) => {
                            const repuestos = [...(form.repuestos || [])];
                            repuestos[idx] = { ...repuestos[idx], descripcion: e.target.value };
                            setForm({ ...form, repuestos });
                          }}
                        />
                        {isBiomedico && (
                          <button
                            type="button"
                            className="text-xs text-red-600 hover:underline"
                            onClick={() => {
                              const repuestos = [...(form.repuestos || [])];
                              repuestos.splice(idx, 1);
                              setForm({ ...form, repuestos });
                            }}
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="md-card p-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">HH</label>
                      <input
                        className="mt-1 w-full border p-2 rounded"
                        value={form.hh || ''}
                        onChange={(e) => setForm({ ...form, hh: e.target.value })}
                        disabled={!isBiomedico}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">HP</label>
                      <input
                        className="mt-1 w-full border p-2 rounded"
                        value={form.hp || ''}
                        onChange={(e) => setForm({ ...form, hp: e.target.value })}
                        disabled={!isBiomedico}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Costo</label>
                      <input
                        className="mt-1 w-full border p-2 rounded"
                        value={form.costo || ''}
                        onChange={(e) => setForm({ ...form, costo: e.target.value })}
                        disabled={!isBiomedico}
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-700">Observaciones / Recomendaciones</label>
                    <textarea
                      className="mt-1 w-full border p-2 rounded"
                      rows={3}
                      value={form.observaciones || ''}
                      onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
                      disabled={!isBiomedico}
                    />
                  </div>
                </div>

                {isBiomedico && (
                  <div className="md-card p-4">
                    <div className="text-sm font-semibold text-gray-900 mb-2">Firma del biomédico</div>
                    <SignatureImageInput
                      value={form.firmaBiomedico || null}
                      onChange={(value) => setForm({ ...form, firmaBiomedico: value || undefined })}
                      label="Firma biomédico"
                      helperText="Sube una imagen PNG o JPG/JPEG con tu firma."
                    />
                  </div>
                )}

                {form.tipo === TipoMantenimiento.CORRECTIVO && isBiomedico && (
                  <div className="md-card p-4 space-y-3">
                    <div className="text-sm font-semibold text-gray-900">En proceso</div>
                    <textarea
                      className="w-full border p-2 rounded"
                      rows={3}
                      value={notaProceso}
                      onChange={(e) => setNotaProceso(e.target.value)}
                      placeholder="Detalle del avance..."
                    />
                    <div className="flex flex-col md:flex-row gap-2">
                      <button className="md-btn md-btn-outlined" onClick={handleAgregarAvance}>
                        Guardar avance
                      </button>
                      {form.estado === EstadoMantenimiento.EN_PROCESO && (
                        <button className="md-btn md-btn-filled" onClick={handleCerrarCorrectivo}>
                          Cerrar mantenimiento
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {historialOrdenado.length > 0 && (
                  <div className="md-card p-4">
                    <div className="text-sm font-semibold text-gray-900 mb-2">Historial</div>
                    <div className="space-y-2">
                      {historialOrdenado.map((h, idx) => (
                        <div key={`${h.fecha}-${idx}`} className="border rounded-lg p-3 bg-gray-50">
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span>{formatDate(h.fecha)}</span>
                            <span className="font-semibold text-gray-700">{ESTADOS_LABEL[h.estado]}</span>
                          </div>
                          <div className="text-sm text-gray-800 whitespace-pre-wrap mt-1">{h.nota}</div>
                          <div className="text-xs text-gray-500 mt-2">Por: {h.porNombre}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(isBiomedico || isAuxiliar || isGerencia) && (
                  <div className="flex flex-col md:flex-row justify-end gap-2">
                    {isBiomedico && (
                      <button className="md-btn md-btn-filled" onClick={handleSave} disabled={saving}>
                        {saving ? 'Guardando...' : form.id ? 'Guardar cambios' : 'Crear mantenimiento'}
                      </button>
                    )}
                    <button className="md-btn md-btn-outlined" onClick={handlePrint}>
                      Imprimir / Guardar PDF
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {isAuxiliar && form.estado === EstadoMantenimiento.CERRADO_PENDIENTE_ACEPTACION && (
                  <div className="md-card p-4">
                    <div className="text-sm font-semibold text-gray-900">Aceptar mantenimiento</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Sube la firma para aceptar el mantenimiento.
                    </div>
                    <div className="mt-3">
                      <SignatureImageInput
                        value={form.firmaAuxiliar || null}
                        onChange={(value) => setForm({ ...form, firmaAuxiliar: value || undefined })}
                        label="Firma auxiliar"
                        helperText="Sube una imagen PNG o JPG/JPEG con la firma."
                      />
                    </div>
                    <button
                      className="md-btn md-btn-filled w-full mt-3"
                      onClick={handleAceptar}
                      disabled={accepting || !form.firmaAuxiliar}
                    >
                      {accepting ? 'Aceptando...' : 'Aceptar mantenimiento'}
                    </button>
                  </div>
                )}

                <div className="md-card p-4">
                  <div className="text-sm font-semibold text-gray-900 mb-2">Estado</div>
                  <div className="text-sm text-gray-700">{ESTADOS_LABEL[form.estado]}</div>
                  {form.fechaCierre && (
                    <div className="text-xs text-gray-500 mt-1">Cierre: {formatDate(form.fechaCierre)}</div>
                  )}
                  {form.fechaAceptacion && (
                    <div className="text-xs text-gray-500 mt-1">Aceptación: {formatDate(form.fechaAceptacion)}</div>
                  )}
                </div>
              </div>
            </div>

            <div id="mantenimiento-print-container" ref={printRef} className="fixed -left-[9999px] top-0">
              <MantenimientoFormat mantenimiento={form as Mantenimiento} />
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Mantenimientos;
