import React, { useEffect, useMemo, useRef, useState } from 'react';
import Layout from '../components/Layout';
import { toast } from '../services/feedback';
import ActaProfesionalFormat from '../components/ActaProfesionalFormat';
import SignaturePad from '../components/SignaturePad';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../contexts/AuthContext';
import {
  asignarEquipoProfesional,
  devolverEquipoProfesional,
  guardarFirmaAuxiliarProfesional,
  guardarFirmaProfesional,
  saveProfesional,
  subscribeAsignaciones,
  subscribeAsignacionesProfesionales,
  subscribeEquipos,
  subscribeProfesionales,
} from '../services/firestoreData';
import {
  EstadoAsignacion,
  EstadoEquipo,
  RolUsuario,
  type Asignacion,
  type AsignacionProfesional,
  type EquipoBiomedico,
  type Profesional,
} from '../types';

const Professionals: React.FC = () => {
  const { usuario, hasRole } = useAuth();
  const canManage = usuario?.rol === RolUsuario.AUXILIAR_ADMINISTRATIVA;

  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [equipos, setEquipos] = useState<EquipoBiomedico[]>([]);
  const [asignacionesPacientes, setAsignacionesPacientes] = useState<Asignacion[]>([]);
  const [asignacionesProfesionales, setAsignacionesProfesionales] = useState<AsignacionProfesional[]>([]);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProfesional, setSelectedProfesional] = useState<Profesional | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'create' | 'details'>('list');

  // Profesional form
  const [formData, setFormData] = useState<Partial<Profesional>>({});

  // Assignment form
  const [equipoQuery, setEquipoQuery] = useState('');
  const [equipoSeleccionado, setEquipoSeleccionado] = useState('');
  const [equipoPickerOpen, setEquipoPickerOpen] = useState(false);
  const [obsEntrega, setObsEntrega] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [sede, setSede] = useState('');

  const [fechaEntregaOriginal, setFechaEntregaOriginal] = useState<string>(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

  const getTodayYmd = () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Return state
  const [asignacionADevolver, setAsignacionADevolver] = useState<AsignacionProfesional | null>(null);
  const [obsDevolucion, setObsDevolucion] = useState('');
  const [estadoDevolucion, setEstadoDevolucion] = useState<EstadoEquipo>(EstadoEquipo.DISPONIBLE);

  // Acta preview
  const [actaData, setActaData] = useState<{
    asig: AsignacionProfesional;
    equipo: EquipoBiomedico;
    tipo: 'ENTREGA' | 'DEVOLUCION';
  } | null>(null);
  const [professionalSignature, setProfessionalSignature] = useState<string | null>(null);
  const [adminSignature, setAdminSignature] = useState<string | null>(null);
  const [savingProfessionalSig, setSavingProfessionalSig] = useState(false);
  const [savingAdminSig, setSavingAdminSig] = useState(false);

  const actaViewportRef = useRef<HTMLDivElement>(null);
  const actaMeasureRef = useRef<HTMLDivElement>(null);
  const [actaPreviewScale, setActaPreviewScale] = useState(1);

  // Load admin signature from localStorage on mount (aux only)
  useEffect(() => {
    if (!canManage) return;
    const savedSig = localStorage.getItem('biocontrol_admin_sig');
    if (savedSig) setAdminSignature(savedSig);
  }, [canManage]);

  useEffect(() => {
    if (!hasRole([RolUsuario.AUXILIAR_ADMINISTRATIVA, RolUsuario.GERENCIA, RolUsuario.INGENIERO_BIOMEDICO])) {
      setFirestoreError('No tienes permisos para acceder a Profesionales.');
      return;
    }

    setFirestoreError(null);
    const unsubProfesionales = subscribeProfesionales(setProfesionales, (e) => {
      console.error('Firestore subscribeProfesionales error:', e);
      setFirestoreError(`No tienes permisos para leer "profesionales" en Firestore. Detalle: ${e.message}`);
    });
    const unsubEquipos = subscribeEquipos(setEquipos, (e) => {
      console.error('Firestore subscribeEquipos error:', e);
      setFirestoreError(`No tienes permisos para leer "equipos" en Firestore. Detalle: ${e.message}`);
    });
    const unsubAsignacionesPacientes = subscribeAsignaciones(setAsignacionesPacientes, (e) => {
      console.error('Firestore subscribeAsignaciones(pacientes) error:', e);
      setFirestoreError(`No tienes permisos para leer "asignaciones" en Firestore. Detalle: ${e.message}`);
    });
    const unsubAsignacionesProfesionales = subscribeAsignacionesProfesionales(setAsignacionesProfesionales, (e) => {
      console.error('Firestore subscribeAsignacionesProfesionales error:', e);
      setFirestoreError(
        `No tienes permisos para leer "asignaciones_profesionales" en Firestore. Detalle: ${e.message}`,
      );
    });

    return () => {
      unsubProfesionales();
      unsubEquipos();
      unsubAsignacionesPacientes();
      unsubAsignacionesProfesionales();
    };
  }, []);

  const profesionalesFiltrados = useMemo(() => {
    if (!searchTerm.trim()) return profesionales;
    const term = searchTerm.trim().toLowerCase();
    return profesionales.filter((p) => {
      return p.nombre.toLowerCase().includes(term) || p.cedula.toLowerCase().includes(term);
    });
  }, [profesionales, searchTerm]);

  const equiposById = useMemo(() => new Map(equipos.map((e) => [e.id, e])), [equipos]);

  const activeEquipoIds = useMemo(() => {
    const ids = new Set<string>();
    for (const a of asignacionesPacientes) if (a.estado === EstadoAsignacion.ACTIVA) ids.add(a.idEquipo);
    for (const a of asignacionesProfesionales) if (a.estado === EstadoAsignacion.ACTIVA) ids.add(a.idEquipo);
    return ids;
  }, [asignacionesPacientes, asignacionesProfesionales]);

  const lastFinalEstadoByEquipo = useMemo(() => {
    const map = new Map<string, { date: number; estadoFinal: EstadoEquipo }>();
    for (const a of asignacionesPacientes) {
      if (a.estado !== EstadoAsignacion.FINALIZADA) continue;
      if (!a.estadoFinalEquipo) continue;
      const date = new Date(a.fechaDevolucion || a.fechaAsignacion).getTime();
      const prev = map.get(a.idEquipo);
      if (!prev || date > prev.date) map.set(a.idEquipo, { date, estadoFinal: a.estadoFinalEquipo as EstadoEquipo });
    }
    for (const a of asignacionesProfesionales) {
      if (a.estado !== EstadoAsignacion.FINALIZADA) continue;
      if (!a.estadoFinalEquipo) continue;
      const date = new Date(a.fechaDevolucion || a.fechaEntregaOriginal).getTime();
      const prev = map.get(a.idEquipo);
      if (!prev || date > prev.date) map.set(a.idEquipo, { date, estadoFinal: a.estadoFinalEquipo as EstadoEquipo });
    }
    return map;
  }, [asignacionesPacientes, asignacionesProfesionales]);

  const equiposDisponibles = useMemo(() => {
    return equipos.filter((e) => {
      if (activeEquipoIds.has(e.id)) return false;
      const lastFinal = lastFinalEstadoByEquipo.get(e.id);
      const effective = lastFinal?.estadoFinal || e.estado;
      if (effective !== EstadoEquipo.DISPONIBLE) return false;

      // Respeta control de acta interna (legacy)
      if (e.disponibleParaEntrega === false) return false;
      if (e.actaInternaPendienteId) return false;
      return true;
    });
  }, [equipos, activeEquipoIds, lastFinalEstadoByEquipo]);

  const equiposDisponiblesFiltrados = useMemo(() => {
    const q = equipoQuery.trim().toLowerCase();
    if (!q) return [];
    return equiposDisponibles
      .filter((eq) => {
        return (
          (eq.codigoInventario || '').toLowerCase().includes(q) ||
          (eq.numeroSerie || '').toLowerCase().includes(q) ||
          (eq.nombre || '').toLowerCase().includes(q) ||
          (eq.marca || '').toLowerCase().includes(q) ||
          (eq.modelo || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 30);
  }, [equiposDisponibles, equipoQuery]);

  const asignacionesDelProfesional = useMemo(() => {
    if (!selectedProfesional) return [];
    return asignacionesProfesionales
      .filter((a) => a.idProfesional === selectedProfesional.id)
      .sort((a, b) => {
        const da = new Date(a.fechaEntregaOriginal).getTime();
        const db = new Date(b.fechaEntregaOriginal).getTime();
        return db - da;
      });
  }, [asignacionesProfesionales, selectedProfesional]);

  const openCreate = () => {
    setFormData({});
    setViewMode('create');
  };

  const openDetails = (p: Profesional) => {
    setSelectedProfesional(p);
    setViewMode('details');
    setEquipoQuery('');
    setEquipoSeleccionado('');
    setEquipoPickerOpen(false);
  };

  const isoFromDate = (dateStr: string) => {
    const d = new Date(`${dateStr}T12:00:00`);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  };

  const handleSaveProfesional = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    try {
      await saveProfesional({
        id: formData.id || '',
        consecutivo: formData.consecutivo || 0,
        nombre: formData.nombre || '',
        cedula: formData.cedula || '',
        direccion: formData.direccion || '',
        telefono: formData.telefono || '',
        cargo: formData.cargo || '',
        createdByUid: usuario?.id,
        createdByNombre: usuario?.nombre,
      });
      setViewMode('list');
      setFormData({});
    } catch (err: any) {
      console.error('Error guardando profesional:', err);
      toast({ tone: 'error', message: err?.message || 'No se pudo guardar el profesional.' });
    }
  };

  const handleAsignar = async () => {
    if (!selectedProfesional || !canManage) return;
    if (!equipoSeleccionado) return;
    if (!fechaEntregaOriginal) {
      toast({ tone: 'warning', message: 'Selecciona la fecha de entrega original.' });
      return;
    }

    try {
      const equipo = equiposById.get(equipoSeleccionado);
      const nuevaAsignacion = await asignarEquipoProfesional({
        idProfesional: selectedProfesional.id,
        idEquipo: equipoSeleccionado,
        fechaEntregaOriginalIso: isoFromDate(fechaEntregaOriginal),
        ciudad,
        sede,
        observacionesEntrega: obsEntrega,
        usuarioAsigna: usuario?.nombre || 'Auxiliar',
        uidAsigna: usuario?.id,
        firmaAuxiliar: adminSignature || undefined,
      });

      toast({
        tone: 'success',
        title: 'Asignacion exitosa',
        message: `ACTA DE ENTREGA N° ${nuevaAsignacion.consecutivo}\nProfesional: ${selectedProfesional.nombre}`,
      });

      setObsEntrega('');
      setEquipoSeleccionado('');
      setEquipoQuery('');
      setEquipoPickerOpen(false);

      if (equipo) {
        setActaData({ asig: nuevaAsignacion, equipo, tipo: 'ENTREGA' });
        setProfessionalSignature(null);
      }
    } catch (err: any) {
      console.error('Error asignando equipo a profesional:', err);
      toast({ tone: 'error', message: `${err?.code ? `${err.code}: ` : ''}${err?.message || 'No se pudo asignar el equipo.'}` });
    }
  };

  const handleDevolucion = async () => {
    if (!asignacionADevolver || !canManage) return;
    try {
      await devolverEquipoProfesional({
        idAsignacion: asignacionADevolver.id,
        observacionesDevolucion: obsDevolucion,
        estadoFinalEquipo: estadoDevolucion,
      });
      toast({ tone: 'success', message: 'Equipo devuelto. Acta de devolucion generada y almacenada en historial.' });
      setAsignacionADevolver(null);
      setObsDevolucion('');
    } catch (err: any) {
      console.error('Error registrando devolución (profesional):', err);
      toast({ tone: 'error', message: `${err?.code ? `${err.code}: ` : ''}${err?.message || 'No se pudo registrar la devolucion.'}` });
    }
  };

  const handleVerActa = (asig: AsignacionProfesional, tipo: 'ENTREGA' | 'DEVOLUCION') => {
    const equipo = equiposById.get(asig.idEquipo);
    if (!equipo) return;

    setActaData({ asig, equipo, tipo });
    const savedSig = tipo === 'ENTREGA' ? asig.firmaProfesionalEntrega : asig.firmaProfesionalDevolucion;
    setProfessionalSignature(savedSig || null);
    if (asig.firmaAuxiliar) setAdminSignature(asig.firmaAuxiliar);
  };

  const handleGuardarFirmaProfesional = async () => {
    if (!canManage) return;
    if (!actaData) return;
    setSavingProfessionalSig(true);
    try {
      await guardarFirmaProfesional({
        idAsignacion: actaData.asig.id,
        tipoActa: actaData.tipo,
        dataUrl: professionalSignature,
      });
      toast({ tone: 'success', message: 'Firma del profesional guardada correctamente.' });
    } catch (err: any) {
      console.error('Error guardando firma profesional:', err);
      toast({ tone: 'error', message: `${err?.code ? `${err.code}: ` : ''}${err?.message || 'No se pudo guardar la firma del profesional.'}` });
    } finally {
      setSavingProfessionalSig(false);
    }
  };

  const handleGuardarFirmaAuxiliar = async () => {
    if (!canManage) return;
    if (!actaData) return;
    if (!adminSignature) return;
    if (actaData.asig.firmaAuxiliar) return;

    setSavingAdminSig(true);
    try {
      await guardarFirmaAuxiliarProfesional({ idAsignacion: actaData.asig.id, dataUrl: adminSignature });
      setActaData((prev) => {
        if (!prev) return prev;
        return { ...prev, asig: { ...prev.asig, firmaAuxiliar: adminSignature } };
      });
      toast({ tone: 'success', message: 'Firma del auxiliar guardada correctamente.' });
    } catch (err: any) {
      console.error('Error guardando firma auxiliar (profesional):', err);
      toast({ tone: 'error', message: `${err?.code ? `${err.code}: ` : ''}${err?.message || 'No se pudo guardar la firma del auxiliar.'}` });
    } finally {
      setSavingAdminSig(false);
    }
  };

  const handleAdminSigUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canManage) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const res = evt.target?.result as string;
      setAdminSignature(res);
      localStorage.setItem('biocontrol_admin_sig', res);

      if (actaData && !actaData.asig.firmaAuxiliar) {
        try {
          await guardarFirmaAuxiliarProfesional({ idAsignacion: actaData.asig.id, dataUrl: res });
          setActaData((prev) => {
            if (!prev) return prev;
            return { ...prev, asig: { ...prev.asig, firmaAuxiliar: res } };
          });
        } catch (err: any) {
          console.error('Error guardando firma auxiliar (upload profesional):', err);
          toast({ tone: 'error', message: err?.message || 'No se pudo guardar la firma del auxiliar en Firestore.' });
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePrint = () => {
    const actaEl = document.querySelector('#acta-print-container .acta-page') as HTMLElement | null;
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

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      document.body.classList.remove('printing-acta');
      printRoot.remove();
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
    setTimeout(cleanup, 2000);
  };

  // Scale preview to viewport
  useEffect(() => {
    if (!actaData) return;
    const viewport = actaViewportRef.current;
    const measure = actaMeasureRef.current;
    if (!viewport || !measure) return;

    const resize = () => {
      const vw = viewport.clientWidth - 32;
      const vh = viewport.clientHeight - 32;
      const mw = measure.scrollWidth;
      const mh = measure.scrollHeight;
      if (!mw || !mh) return;
      const scale = Math.min(vw / mw, vh / mh, 1);
      setActaPreviewScale(Number(scale.toFixed(4)));
    };

    const t = setTimeout(resize, 0);
    window.addEventListener('resize', resize);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', resize);
    };
  }, [actaData]);

  if (viewMode === 'create') {
    return (
      <Layout title="Profesionales">
        {firestoreError && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded p-3 text-sm">
            {firestoreError}
          </div>
        )}
        <div className="md-card p-6 max-w-2xl">
          <h3 className="text-lg font-bold text-gray-900 mb-1">Nuevo profesional</h3>
          <p className="text-sm text-gray-500 mb-6">Registra datos básicos para entrega/devolución de equipos.</p>
          <form onSubmit={handleSaveProfesional} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Nombre</label>
                <input
                  className="mt-1 w-full border p-2 rounded"
                  value={formData.nombre || ''}
                  onChange={(e) => setFormData((p) => ({ ...p, nombre: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Cédula</label>
                <input
                  className="mt-1 w-full border p-2 rounded"
                  value={formData.cedula || ''}
                  onChange={(e) => setFormData((p) => ({ ...p, cedula: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Teléfono</label>
                <input
                  className="mt-1 w-full border p-2 rounded"
                  value={formData.telefono || ''}
                  onChange={(e) => setFormData((p) => ({ ...p, telefono: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Cargo</label>
                <input
                  className="mt-1 w-full border p-2 rounded"
                  value={formData.cargo || ''}
                  onChange={(e) => setFormData((p) => ({ ...p, cargo: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Dirección</label>
                <input
                  className="mt-1 w-full border p-2 rounded"
                  value={formData.direccion || ''}
                  onChange={(e) => setFormData((p) => ({ ...p, direccion: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setViewMode('list')} className="md-btn md-btn-outlined">
                Cancelar
              </button>
              <button type="submit" className="md-btn md-btn-filled" disabled={!canManage}>
                Guardar
              </button>
            </div>
            {!canManage && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
                Solo el rol AUXILIAR_ADMINISTRATIVA puede crear/editar profesionales.
              </p>
            )}
          </form>
        </div>
      </Layout>
    );
  }

  if (viewMode === 'details' && selectedProfesional) {
    return (
      <Layout title={`Profesional: ${selectedProfesional.nombre}`}>
        {firestoreError && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded p-3 text-sm">
            {firestoreError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="md-card p-6 lg:col-span-1">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{selectedProfesional.nombre}</h3>
                <p className="text-sm text-gray-500 mt-1">
                  <span className="font-mono">ID:</span> {String(selectedProfesional.consecutivo).padStart(3, '0')}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-2 text-sm text-gray-700">
              <p>
                <strong>Cédula:</strong> {selectedProfesional.cedula}
              </p>
              <p>
                <strong>Dirección:</strong> {selectedProfesional.direccion || 'NR'}
              </p>
              <p>
                <strong>Teléfono:</strong> {selectedProfesional.telefono || 'NR'}
              </p>
              <p>
                <strong>Cargo:</strong> {selectedProfesional.cargo || 'NR'}
              </p>
            </div>

            <div className="mt-6">
              <button onClick={() => setViewMode('list')} className="w-full py-2 text-gray-600 hover:text-gray-900 border rounded">
                &larr; Volver al listado
              </button>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            {canManage && (
              <div className="md-card p-6">
                <h3 className="text-md font-bold mb-4">Nueva Entrega de Equipo</h3>
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Fecha de actualización</label>
                      <input
                        type="date"
                        className="mt-1 w-full border p-2 rounded bg-gray-50 text-gray-700"
                        value={getTodayYmd()}
                        disabled
                      />
                      <p className="text-xs text-gray-500 mt-1">Se asigna automáticamente al crear el acta.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Fecha de entrega original</label>
                      <input
                        type="date"
                        className="mt-1 w-full border p-2 rounded"
                        value={fechaEntregaOriginal}
                        onChange={(e) => setFechaEntregaOriginal(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Ciudad</label>
                      <input
                        className="mt-1 w-full border p-2 rounded"
                        placeholder="Ej: Bucaramanga"
                        value={ciudad}
                        onChange={(e) => setCiudad(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Sede</label>
                      <input
                        className="mt-1 w-full border p-2 rounded"
                        placeholder="Ej: Principal"
                        value={sede}
                        onChange={(e) => setSede(e.target.value)}
                      />
                    </div>
                    <div className="md:col-span-4">
                      <label className="block text-sm font-medium text-gray-700">Buscar equipo (MBG o serie)</label>
                      <div className="relative">
                        <input
                          className="mt-1 w-full border p-2 rounded"
                          placeholder="Ej: MBG-015 o 250103654"
                          value={equipoQuery}
                          onChange={(e) => {
                            setEquipoQuery(e.target.value);
                            setEquipoPickerOpen(true);
                            setEquipoSeleccionado('');
                          }}
                          onFocus={() => setEquipoPickerOpen(true)}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            const q = equipoQuery.trim().toLowerCase();
                            if (!q) return;
                            const matches = equiposDisponibles.filter((eq) => {
                              return (
                                (eq.codigoInventario || '').toLowerCase() === q || (eq.numeroSerie || '').toLowerCase() === q
                              );
                            });
                            if (matches.length === 1) {
                              const chosen = matches[0];
                              setEquipoSeleccionado(chosen.id);
                              setEquipoQuery(`${chosen.codigoInventario || ''} • ${chosen.numeroSerie || ''} • ${chosen.nombre}`);
                              setEquipoPickerOpen(false);
                            }
                          }}
                        />
                        {equipoPickerOpen && equipoQuery.trim() && (
                          <div className="absolute z-10 mt-1 w-full bg-white border rounded shadow max-h-64 overflow-y-auto">
                            {equiposDisponiblesFiltrados.length === 0 ? (
                              <div className="p-3 text-sm text-gray-500">Sin resultados.</div>
                            ) : (
                              equiposDisponiblesFiltrados.map((eq) => (
                                <button
                                  type="button"
                                  key={eq.id}
                                  className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-b-0"
                                  onClick={() => {
                                    setEquipoSeleccionado(eq.id);
                                    setEquipoQuery(`${eq.codigoInventario || ''} • ${eq.numeroSerie || ''} • ${eq.nombre}`);
                                    setEquipoPickerOpen(false);
                                  }}
                                >
                                  <div className="text-sm font-semibold text-gray-900">
                                    {eq.codigoInventario} — {eq.nombre}
                                  </div>
                                  <div className="text-xs text-gray-500 font-mono">
                                    Serie: {eq.numeroSerie} · {eq.marca} {eq.modelo}
                                  </div>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="md:col-span-4">
                      <label className="block text-sm font-medium text-gray-700">Observaciones iniciales</label>
                      <input
                        className="mt-1 w-full border p-2 rounded"
                        placeholder="Observaciones..."
                        value={obsEntrega}
                        onChange={(e) => setObsEntrega(e.target.value)}
                      />
                    </div>
                    <div className="md:col-span-4 flex justify-end">
                      <button
                        onClick={handleAsignar}
                        disabled={!equipoSeleccionado || !fechaEntregaOriginal}
                        className="md-btn md-btn-filled"
                        title="Asignar y generar acta de entrega"
                      >
                        Asignar y Firmar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tabla de asignaciones */}
            <div className="md-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-md font-bold text-gray-900">Equipos Entregados</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b text-gray-600">
                      <th className="p-2 text-left">Acta #</th>
                      <th className="p-2 text-left">Equipo</th>
                      <th className="p-2 text-left">Fecha Entrega</th>
                      <th className="p-2 text-left">Estado</th>
                      <th className="p-2 text-left">Acción</th>
                      <th className="p-2 text-left">Documentos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asignacionesDelProfesional.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-gray-500">
                          Sin asignaciones.
                        </td>
                      </tr>
                    ) : (
                      asignacionesDelProfesional.map((asig) => {
                        const eq = equiposById.get(asig.idEquipo);
                        return (
                          <tr key={asig.id} className="border-b hover:bg-gray-50">
                            <td className="p-2 font-mono">{String(asig.consecutivo).padStart(4, '0')}</td>
                            <td className="p-2">
                              <div className="font-semibold text-gray-900">{eq?.nombre || 'Equipo'}</div>
                              <div className="text-xs text-gray-500 font-mono">
                                {eq?.codigoInventario} · Serie: {eq?.numeroSerie}
                              </div>
                            </td>
                            <td className="p-2">{new Date(asig.fechaEntregaOriginal).toLocaleDateString()}</td>
                            <td className="p-2">
                              <StatusBadge status={asig.estado === EstadoAsignacion.ACTIVA ? EstadoEquipo.ASIGNADO : EstadoEquipo.DISPONIBLE} />
                            </td>
                            <td className="p-2">
                              {canManage && asig.estado === EstadoAsignacion.ACTIVA ? (
                                <button
                                  onClick={() => {
                                    setAsignacionADevolver(asig);
                                    setObsDevolucion('');
                                    setEstadoDevolucion(EstadoEquipo.DISPONIBLE);
                                  }}
                                  className="text-xs font-semibold text-red-600 hover:text-red-800 underline"
                                >
                                  Registrar devolución
                                </button>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                            <td className="p-2">
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => handleVerActa(asig, 'ENTREGA')}
                                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline"
                                >
                                  Ver acta entrega
                                </button>
                                {asig.estado === EstadoAsignacion.FINALIZADA && (
                                  <button
                                    onClick={() => handleVerActa(asig, 'DEVOLUCION')}
                                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline"
                                  >
                                    Ver acta devolución
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Modal devolución */}
        {asignacionADevolver && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg w-full max-w-md">
              <h3 className="text-lg font-bold mb-4">Registrar Devolución</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium">Estado del equipo al recibir:</label>
                  <select
                    className="w-full border p-2 rounded"
                    value={estadoDevolucion}
                    onChange={(e) => setEstadoDevolucion(e.target.value as EstadoEquipo)}
                  >
                    <option value={EstadoEquipo.DISPONIBLE}>Disponible (Buen estado)</option>
                    <option value={EstadoEquipo.MANTENIMIENTO}>Requiere Mantenimiento</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium">Observaciones:</label>
                  <textarea
                    className="w-full border p-2 rounded"
                    rows={3}
                    value={obsDevolucion}
                    onChange={(e) => setObsDevolucion(e.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setAsignacionADevolver(null)} className="md-btn md-btn-outlined">
                    Cancelar
                  </button>
                  <button onClick={handleDevolucion} className="md-btn md-btn-filled">
                    Confirmar Devolución
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal acta */}
        {actaData && selectedProfesional && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 overflow-y-auto">
            <div className="relative bg-white w-full max-w-5xl my-4 rounded shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
              <div className="p-4 border-b flex justify-between items-center bg-gray-50 flex-shrink-0">
                <div>
                  <h3 className="font-bold text-gray-800">Vista Previa: Acta de {actaData.tipo.toLowerCase()}</h3>
                  <p className="text-xs text-gray-500">Configure las firmas antes de imprimir.</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setActaData(null)}
                    className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-white"
                  >
                    Cerrar
                  </button>
                  <button
                    onClick={handlePrint}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center font-bold shadow"
                  >
                    Imprimir / Guardar PDF
                  </button>
                </div>
              </div>

              <div className="flex flex-1 overflow-hidden">
                <div className="w-80 bg-gray-50 border-r border-gray-200 p-4 overflow-y-auto no-print">
                  <h4 className="font-bold text-gray-700 mb-4 border-b pb-2">Configurar Firmas</h4>

                  {/* Firma Profesional */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-600 mb-2">Firma Profesional</label>
                    {(() => {
                      const savedSig =
                        actaData.tipo === 'ENTREGA'
                          ? actaData.asig.firmaProfesionalEntrega
                          : actaData.asig.firmaProfesionalDevolucion;
                      const locked = !!savedSig;

                      return (
                        <>
                          <div className="bg-white">
                            {locked ? (
                              <div className="border border-gray-300 rounded bg-white p-2">
                                <img
                                  src={savedSig}
                                  alt="Firma guardada del profesional"
                                  className="w-full h-40 object-contain"
                                />
                              </div>
                            ) : canManage ? (
                              <SignaturePad onEnd={setProfessionalSignature} />
                            ) : (
                              <div className="border border-gray-300 rounded bg-white p-4 text-center text-sm text-gray-500">
                                Sin firma registrada.
                                <div className="text-xs text-gray-400 mt-1">
                                  Solo el rol AUXILIAR_ADMINISTRATIVA puede registrar/guardar firmas.
                                </div>
                              </div>
                            )}
                          </div>

                          <p className="text-xs text-gray-400 mt-1">
                            {locked
                              ? 'Esta acta ya tiene firma registrada. Por control, la firma no se puede modificar.'
                              : 'El profesional puede firmar usando el mouse o el dedo en pantallas táctiles.'}
                          </p>

                          {!locked && canManage && (
                            <>
                              <div className="mt-3 flex gap-2">
                                <button
                                  type="button"
                                  onClick={handleGuardarFirmaProfesional}
                                  disabled={savingProfessionalSig || !professionalSignature}
                                  className="flex-1 bg-blue-600 text-white px-3 py-2 rounded text-sm disabled:opacity-60"
                                  title={
                                    !professionalSignature
                                      ? 'Firme primero para habilitar el guardado'
                                      : 'Guardar la firma en Firestore para esta acta'
                                  }
                                >
                                  {savingProfessionalSig ? 'Guardando...' : 'Guardar firma'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setProfessionalSignature(null)}
                                  className="px-3 py-2 rounded text-sm border border-gray-300 text-gray-700 hover:bg-white"
                                >
                                  Limpiar
                                </button>
                              </div>
                              <p className="text-[11px] text-gray-500 mt-2">
                                La firma se guarda en Firestore dentro de la asignación (
                                {actaData.tipo === 'ENTREGA' ? 'firmaProfesionalEntrega' : 'firmaProfesionalDevolucion'}).
                              </p>
                            </>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {/* Firma Auxiliar */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-600 mb-2">Firma Auxiliar Admin</label>
                    {(() => {
                      const savedAdminSig = actaData.asig.firmaAuxiliar || null;
                      const locked = !!savedAdminSig;
                      const effectiveAdminSig = locked ? savedAdminSig : canManage ? adminSignature : null;

                      return (
                        <>
                          {effectiveAdminSig ? (
                            <div className="mb-2 bg-white p-2 border rounded relative">
                              <img src={effectiveAdminSig} className="h-16 mx-auto object-contain" alt="Admin Sig" />
                              {canManage && !locked && (
                                <button
                                  onClick={() => {
                                    setAdminSignature(null);
                                    localStorage.removeItem('biocontrol_admin_sig');
                                  }}
                                  className="absolute top-0 right-0 bg-red-100 text-red-600 p-1 rounded-bl text-xs"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="mb-2 border border-gray-300 rounded bg-white p-3 text-center text-sm text-gray-500">
                              Sin firma digital registrada.
                            </div>
                          )}

                          {locked ? (
                            <p className="text-xs text-gray-400 mt-1">
                              Esta acta ya tiene firma del auxiliar registrada. Por control, no se puede modificar.
                            </p>
                          ) : canManage ? (
                            <>
                              <div className="border-2 border-dashed border-gray-300 rounded p-4 text-center hover:bg-white transition-colors cursor-pointer relative">
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                  onChange={handleAdminSigUpload}
                                />
                                <span className="text-xs text-gray-500">Cargar imagen de firma</span>
                              </div>

                              {adminSignature && !savedAdminSig && (
                                <div className="mt-3 flex gap-2">
                                  <button
                                    type="button"
                                    onClick={handleGuardarFirmaAuxiliar}
                                    disabled={savingAdminSig}
                                    className="flex-1 bg-blue-600 text-white px-3 py-2 rounded text-sm disabled:opacity-60"
                                  >
                                    {savingAdminSig ? 'Guardando...' : 'Guardar firma'}
                                  </button>
                                </div>
                              )}

                              <p className="text-xs text-gray-400 mt-1">
                                Cargue una imagen (PNG/JPG) con la firma escaneada. Se guardará en Firestore para el acta.
                              </p>
                            </>
                          ) : (
                            <p className="text-xs text-gray-400 mt-1">
                              Solo el rol AUXILIAR_ADMINISTRATIVA puede registrar/guardar esta firma.
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Vista Previa */}
                <div className="flex-1 overflow-hidden bg-gray-200">
                  <div ref={actaViewportRef} className="w-full h-full p-4 flex justify-center items-start overflow-hidden">
                    <div className="transition-transform" style={{ transform: `scale(${actaPreviewScale})`, transformOrigin: 'top center' }}>
                      <div id="acta-print-container" ref={actaMeasureRef} className="bg-white shadow-lg">
                        <ActaProfesionalFormat
                          profesional={selectedProfesional}
                          equipo={actaData.equipo}
                          asignacion={actaData.asig}
                          tipoActa={actaData.tipo}
                          professionalSignature={professionalSignature}
                          adminSignature={actaData.asig.firmaAuxiliar ? actaData.asig.firmaAuxiliar : canManage ? adminSignature : null}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Layout>
    );
  }

  // LIST
  return (
    <Layout title="Profesionales">
      {firestoreError && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded p-3 text-sm">
          {firestoreError}
        </div>
      )}

      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="w-full md:max-w-xl">
          <div className="md-search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              type="text"
              placeholder="Buscar por nombre o cédula..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <button onClick={openCreate} className="md-btn md-btn-filled">
              + Nuevo Profesional
            </button>
          </div>
        )}
      </div>

      <div className="md-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-gray-600">
                <th className="p-3 text-left">ID</th>
                <th className="p-3 text-left">Nombre</th>
                <th className="p-3 text-left">Cédula</th>
                <th className="p-3 text-left">Cargo</th>
                <th className="p-3 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {profesionalesFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500">
                    No hay profesionales registrados.
                  </td>
                </tr>
              ) : (
                profesionalesFiltrados.map((p) => (
                  <tr key={p.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-mono">{String(p.consecutivo).padStart(3, '0')}</td>
                    <td className="p-3 font-semibold text-gray-900">{p.nombre}</td>
                    <td className="p-3">{p.cedula}</td>
                    <td className="p-3">{p.cargo || '—'}</td>
                    <td className="p-3">
                      <button onClick={() => openDetails(p)} className="text-indigo-600 hover:text-indigo-800 underline font-semibold">
                        Gestionar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
};

export default Professionals;
