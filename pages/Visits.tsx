import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { collection, doc, getDocs, limit, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import Layout from '../components/Layout';
import { toast } from '../services/feedback';
import SignaturePad from '../components/SignaturePad';
import { useAuth } from '../contexts/AuthContext';
import { db, storage } from '../services/firebase';
import { firebaseFunctions } from '../services/firebaseFunctions';
import {
  cerrarReporteEquipo,
  createReporteEquipo,
  createSolicitudEquipoPaciente,
  iniciarReporteEnProceso,
  agregarNotaReporte,
  marcarReporteVistoPorVisitador,
  subscribeAsignacionesActivas,
  subscribeEquiposAsignadosActivos,
  subscribePacientesConAsignacionActiva,
  subscribeReportesEquipos,
  subscribeReportesEquiposByUser,
  subscribeSolicitudesEquiposPacienteByUser,
} from '../services/firestoreData';
import {
  EstadoAsignacion,
  EstadoActaInterna,
  EstadoReporteEquipo,
  EstadoSolicitudEquipoPaciente,
  RolUsuario,
  TipoPropiedad,
  type Asignacion,
  type EquipoBiomedico,
  type Paciente,
  type ReporteEquipo,
  type ReporteFoto,
  type SolicitudEquipoPaciente,
} from '../types';

const MAX_FOTOS = 5;
const MAX_MB = 5;
const MAX_BYTES = MAX_MB * 1024 * 1024;
const MIN_SOLICITUD_FOTOS = 3;

type PacienteLite = {
  id: string;
  nombreCompleto: string;
  numeroDocumento: string;
};

function todayInput() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function isoFromDate(dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00`);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function isAllowedImage(file: File) {
  return ['image/png', 'image/jpeg'].includes(file.type);
}

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.\-]+/g, '_').slice(0, 80);
}

const Visits: React.FC = () => {
  const { usuario } = useAuth();
  const isVisitador = usuario?.rol === RolUsuario.VISITADOR;
  const isBiomedico = usuario?.rol === RolUsuario.INGENIERO_BIOMEDICO;

  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  // VISITADOR data
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [equipos, setEquipos] = useState<EquipoBiomedico[]>([]);
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [pacientesSinAsignacion, setPacientesSinAsignacion] = useState<PacienteLite[]>([]);
  const [loadingPacientesSinAsignacion, setLoadingPacientesSinAsignacion] = useState(false);
  const [solicitudes, setSolicitudes] = useState<SolicitudEquipoPaciente[]>([]);

  // BIOMEDICO data
  const [reportes, setReportes] = useState<ReporteEquipo[]>([]);

  useEffect(() => {
    setFirestoreError(null);

    if (isVisitador) {
      const unsubPacientes = subscribePacientesConAsignacionActiva(setPacientes, (e) => {
        console.error('subscribePacientesConAsignacionActiva error:', e);
        setFirestoreError(`No tienes permisos para leer pacientes activos. Detalle: ${e.message}`);
      });
      const unsubEquipos = subscribeEquiposAsignadosActivos(setEquipos, (e) => {
        console.error('subscribeEquiposAsignadosActivos error:', e);
        setFirestoreError(`No tienes permisos para leer equipos asignados. Detalle: ${e.message}`);
      });
      const unsubAsignaciones = subscribeAsignacionesActivas(setAsignaciones, (e) => {
        console.error('subscribeAsignacionesActivas error:', e);
        setFirestoreError(`No tienes permisos para leer asignaciones activas. Detalle: ${e.message}`);
      });
      const unsubReportes = usuario?.id
        ? subscribeReportesEquiposByUser(
            usuario.id,
            setReportes,
            (e) => setFirestoreError(`No tienes permisos para leer tus reportes. Detalle: ${e.message}`),
          )
        : () => {};
      const unsubSolicitudes = usuario?.id
        ? subscribeSolicitudesEquiposPacienteByUser(
            usuario.id,
            setSolicitudes,
            (e) => setFirestoreError(`No tienes permisos para leer tus solicitudes. Detalle: ${e.message}`),
          )
        : () => {};

      const loadPacientesSinAsignacion = async () => {
        setLoadingPacientesSinAsignacion(true);
        try {
          const fn = httpsCallable(firebaseFunctions, 'listPacientesSinAsignacion');
          const res = await fn();
          const data = res.data as { pacientes?: Array<{ id?: string; nombre?: string; doc?: string }> };
          const items = (data.pacientes || [])
            .map((p) => ({
              id: p.id || '',
              nombreCompleto: p.nombre || '',
              numeroDocumento: p.doc || '',
            }))
            .filter((p) => p.id);
          setPacientesSinAsignacion(items);
        } catch (err: any) {
          console.error('listPacientesSinAsignacion error:', err);
          setFirestoreError(
            `No se pudo cargar pacientes sin asignacion. Detalle: ${err?.message || 'Error desconocido'}`,
          );
        } finally {
          setLoadingPacientesSinAsignacion(false);
        }
      };

      loadPacientesSinAsignacion();
      return () => {
        unsubPacientes();
        unsubEquipos();
        unsubAsignaciones();
        unsubReportes();
        unsubSolicitudes();
      };
    }

    if (isBiomedico) {
      const unsubReportes = subscribeReportesEquipos(setReportes, (e) => {
        console.error('subscribeReportesEquipos error:', e);
        setFirestoreError(`No tienes permisos para leer reportes. Detalle: ${e.message}`);
      });
      return () => unsubReportes();
    }
  }, [isVisitador, isBiomedico, usuario?.id]);

  const pacientesById = useMemo(() => new Map(pacientes.map((p) => [p.id, p])), [pacientes]);
  const equiposById = useMemo(() => new Map(equipos.map((e) => [e.id, e])), [equipos]);

  // VISITADOR: listado de asignaciones activas (join)
  const asignacionesActivasEnriquecidas = useMemo(() => {
    if (!isVisitador) return [];
    return asignaciones
      .filter((a) => a.estado === EstadoAsignacion.ACTIVA)
      .map((a) => {
        const paciente = pacientesById.get(a.idPaciente);
        const equipo = equiposById.get(a.idEquipo);
        return { a, paciente, equipo };
      })
      .filter((x) => x.paciente && x.equipo);
  }, [asignaciones, pacientesById, equiposById, isVisitador]);

  const matchesQuery = (q: string, paciente: Paciente, equipo: EquipoBiomedico) => {
    if (!q) return true;
    const term = q.toLowerCase();
    return (
      paciente.nombreCompleto.toLowerCase().includes(term) ||
      paciente.numeroDocumento.includes(term) ||
      equipo.codigoInventario.toLowerCase().includes(term) ||
      equipo.numeroSerie.toLowerCase().includes(term) ||
      equipo.nombre.toLowerCase().includes(term)
    );
  };

  const matchesPacienteQuery = (q: string, paciente: PacienteLite) => {
    if (!q) return true;
    const term = q.toLowerCase();
    return (
      paciente.nombreCompleto.toLowerCase().includes(term) ||
      paciente.numeroDocumento.includes(term)
    );
  };

  const solicitudStatusMeta = (solicitud: SolicitudEquipoPaciente) => {
    if (solicitud.estado === EstadoSolicitudEquipoPaciente.APROBADA) {
      if (
        solicitud.tipoPropiedad === TipoPropiedad.ALQUILADO &&
        solicitud.actaInternaEstado === EstadoActaInterna.ENVIADA
      ) {
        return {
          label: 'APROBADA · ACTA INTERNA PENDIENTE',
          className: 'bg-amber-50 text-amber-800 border-amber-200',
        };
      }
      return { label: 'APROBADA', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    }
    return { label: 'PENDIENTE', className: 'bg-amber-50 text-amber-700 border-amber-200' };
  };

  const [pendingSearch, setPendingSearch] = useState('');
  const pendingFirmasAll = useMemo(
    () => asignacionesActivasEnriquecidas.filter(({ a }) => !a.firmaPacienteEntrega),
    [asignacionesActivasEnriquecidas],
  );
  const pendingFirmasFiltered = useMemo(() => {
    const q = pendingSearch.trim().toLowerCase();
    return pendingFirmasAll.filter(({ paciente, equipo }) => matchesQuery(q, paciente!, equipo!));
  }, [pendingFirmasAll, pendingSearch]);

  const [search, setSearch] = useState('');
  const filteredAsignaciones = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return asignacionesActivasEnriquecidas;
    return asignacionesActivasEnriquecidas.filter(({ paciente, equipo }) => matchesQuery(q, paciente!, equipo!));
  }, [asignacionesActivasEnriquecidas, search]);

  const [pacientesSinAsignacionSearch, setPacientesSinAsignacionSearch] = useState('');
  const pacientesSinAsignacionFiltered = useMemo(() => {
    const q = pacientesSinAsignacionSearch.trim().toLowerCase();
    return pacientesSinAsignacion.filter((p) => matchesPacienteQuery(q, p));
  }, [pacientesSinAsignacion, pacientesSinAsignacionSearch]);

  const [visitadorTab, setVisitadorTab] = useState<'PENDIENTES' | 'HISTORIAL' | 'REPORTES'>('PENDIENTES');

  // Tabs y detalle de reportes (VISITADOR y BIOMEDICO)
  const [reporteTab, setReporteTab] = useState<'ABIERTO' | 'EN_PROCESO' | 'CERRADO'>('ABIERTO');
  const reportesFiltrados = useMemo(() => {
    const wanted =
      reporteTab === 'ABIERTO'
        ? EstadoReporteEquipo.ABIERTO
        : reporteTab === 'EN_PROCESO'
          ? EstadoReporteEquipo.EN_PROCESO
          : EstadoReporteEquipo.CERRADO;
    return reportes
      .filter((r) => r.estado === wanted)
      .sort((a, b) => new Date(b.fechaVisita).getTime() - new Date(a.fechaVisita).getTime());
  }, [reportes, reporteTab]);
  const reportesCountAbiertos = useMemo(
    () => reportes.filter((r) => r.estado === EstadoReporteEquipo.ABIERTO).length,
    [reportes],
  );
  const reportesCountProceso = useMemo(
    () => reportes.filter((r) => r.estado === EstadoReporteEquipo.EN_PROCESO).length,
    [reportes],
  );
  const reportesCountCerrados = useMemo(
    () => reportes.filter((r) => r.estado === EstadoReporteEquipo.CERRADO).length,
    [reportes],
  );
  const reporteTabLabel = reporteTab === 'EN_PROCESO' ? 'en proceso' : reporteTab.toLowerCase();

  const [openReporte, setOpenReporte] = useState<ReporteEquipo | null>(null);
  const [fotoUrls, setFotoUrls] = useState<Record<string, string>>({});
  const [cierreNotas, setCierreNotas] = useState('');
  const [diagnostico, setDiagnostico] = useState('');
  const [planReparacion, setPlanReparacion] = useState('');
  const [notaProceso, setNotaProceso] = useState('');
  const [closing, setClosing] = useState(false);
  const [startingProceso, setStartingProceso] = useState(false);
  const [addingNota, setAddingNota] = useState(false);

  const historialReporte = useMemo(() => {
    if (!openReporte) return [];
    if (Array.isArray(openReporte.historial) && openReporte.historial.length) {
      return [...openReporte.historial].sort(
        (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
      );
    }
    const fallback = [];
    if (openReporte.fechaVisita && openReporte.descripcion) {
      fallback.push({
        fecha: openReporte.fechaVisita,
        estado: EstadoReporteEquipo.ABIERTO,
        nota: openReporte.descripcion,
        porNombre: openReporte.creadoPorNombre,
      });
    }
    if (openReporte.enProcesoAt && (openReporte.diagnostico || openReporte.planReparacion)) {
      fallback.push({
        fecha: openReporte.enProcesoAt,
        estado: EstadoReporteEquipo.EN_PROCESO,
        nota: `Inicio de proceso: ${openReporte.diagnostico || ''}${
          openReporte.planReparacion ? `\nPlan: ${openReporte.planReparacion}` : ''
        }`,
        porNombre: openReporte.enProcesoPorNombre || 'Biomedico',
      });
    }
    if (openReporte.cerradoAt && openReporte.cierreNotas) {
      fallback.push({
        fecha: openReporte.cerradoAt,
        estado: EstadoReporteEquipo.CERRADO,
        nota: openReporte.cierreNotas,
        porNombre: openReporte.cerradoPorNombre || 'Biomedico',
      });
    }
    return fallback.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }, [openReporte]);

  // Modal crear reporte (VISITADOR)
  const [creating, setCreating] = useState(false);
  const [openCreate, setOpenCreate] = useState<{
    asignacion: Asignacion;
    paciente: Paciente;
    equipo: EquipoBiomedico;
  } | null>(null);
  const [fechaVisita, setFechaVisita] = useState(todayInput());
  const [descripcion, setDescripcion] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  const [openSolicitud, setOpenSolicitud] = useState<PacienteLite | null>(null);
  const [solicitudTipo, setSolicitudTipo] = useState<TipoPropiedad>(TipoPropiedad.PACIENTE);
  const [solicitudEquipoNombre, setSolicitudEquipoNombre] = useState('');
  const [solicitudEmpresa, setSolicitudEmpresa] = useState('');
  const [solicitudObservaciones, setSolicitudObservaciones] = useState('');
  const [solicitudFiles, setSolicitudFiles] = useState<File[]>([]);
  const [solicitudSaving, setSolicitudSaving] = useState(false);
  const solicitudCameraRef = useRef<HTMLInputElement>(null);

  const previews = useMemo(() => files.map((f) => ({ file: f, url: URL.createObjectURL(f) })), [files]);
  useEffect(() => {
    return () => {
      for (const p of previews) URL.revokeObjectURL(p.url);
    };
  }, [previews]);

  const solicitudPreviews = useMemo(
    () => solicitudFiles.map((f) => ({ file: f, url: URL.createObjectURL(f) })),
    [solicitudFiles],
  );
  useEffect(() => {
    return () => {
      for (const p of solicitudPreviews) URL.revokeObjectURL(p.url);
    };
  }, [solicitudPreviews]);

  useEffect(() => {
    if (!openReporte) {
      setDiagnostico('');
      setPlanReparacion('');
      setCierreNotas('');
      setNotaProceso('');
      return;
    }
    setDiagnostico(openReporte.diagnostico || '');
    setPlanReparacion(openReporte.planReparacion || '');
    setCierreNotas(openReporte.cierreNotas || '');
    setNotaProceso('');
  }, [openReporte?.id]);

  useEffect(() => {
    if (!openReporte) return;
    const latest = reportes.find((r) => r.id === openReporte.id);
    if (latest && latest !== openReporte) {
      setOpenReporte(latest);
    }
  }, [reportes, openReporte?.id]);

  const onPickFiles = (picked: FileList | null) => {
    if (!picked) return;
    const list = Array.from(picked);

    const merged = [...files];
    for (const f of list) {
      if (merged.length >= MAX_FOTOS) break;
      if (!isAllowedImage(f)) {
        toast({ tone: 'warning', message: `Archivo no soportado: ${f.name}. Usa PNG o JPG/JPEG.` });
        continue;
      }
      if (f.size > MAX_BYTES) {
        toast({ tone: 'warning', message: `"${f.name}" supera ${MAX_MB}MB. Reduce el tamaño y vuelve a intentar.` });
        continue;
      }
      merged.push(f);
    }

    if (merged.length > MAX_FOTOS) merged.length = MAX_FOTOS;
    setFiles(merged);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const resetCreate = () => {
    setOpenCreate(null);
    setFechaVisita(todayInput());
    setDescripcion('');
    setFiles([]);
    setCreating(false);
  };

  const onPickSolicitudFiles = (picked: FileList | null) => {
    if (!picked) return;
    const list = Array.from(picked);
    const merged = [...solicitudFiles];
    for (const f of list) {
      if (merged.length >= MAX_FOTOS) break;
      if (!isAllowedImage(f)) {
        toast({ tone: 'warning', message: `Archivo no soportado: ${f.name}. Usa PNG o JPG/JPEG.` });
        continue;
      }
      if (f.size > MAX_BYTES) {
        toast({ tone: 'warning', message: `"${f.name}" supera ${MAX_MB}MB. Reduce el tamaño y vuelve a intentar.` });
        continue;
      }
      merged.push(f);
    }
    if (merged.length > MAX_FOTOS) merged.length = MAX_FOTOS;
    setSolicitudFiles(merged);
  };

  const removeSolicitudFile = (index: number) => {
    setSolicitudFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const resetSolicitud = () => {
    setOpenSolicitud(null);
    setSolicitudTipo(TipoPropiedad.PACIENTE);
    setSolicitudEquipoNombre('');
    setSolicitudEmpresa('');
    setSolicitudObservaciones('');
    setSolicitudFiles([]);
    setSolicitudSaving(false);
  };

  const submitSolicitud = async () => {
    if (!usuario || !openSolicitud) return;
    if (!solicitudEquipoNombre.trim()) {
      toast({ tone: 'warning', message: 'Escribe el nombre del equipo.' });
      return;
    }
    if (solicitudTipo === TipoPropiedad.ALQUILADO && !solicitudEmpresa.trim()) {
      toast({ tone: 'warning', message: 'Escribe la empresa que alquila el equipo.' });
      return;
    }
    if (solicitudFiles.length < MIN_SOLICITUD_FOTOS) {
      toast({
        tone: 'warning',
        message: `Debes adjuntar al menos ${MIN_SOLICITUD_FOTOS} fotos.`,
      });
      return;
    }
    if (solicitudFiles.length > MAX_FOTOS) {
      toast({ tone: 'warning', message: `Máximo ${MAX_FOTOS} fotos.` });
      return;
    }
    const alreadyPending = solicitudes.find(
      (s) => s.idPaciente === openSolicitud.id && s.estado === EstadoSolicitudEquipoPaciente.PENDIENTE,
    );
    if (alreadyPending) {
      toast({
        tone: 'warning',
        message: 'Ya existe una solicitud pendiente para este paciente.',
      });
      return;
    }

    setSolicitudSaving(true);
    try {
      const solicitudId = doc(collection(db, 'solicitudes_equipos_paciente')).id;
      const fotos: ReporteFoto[] = [];
      for (let i = 0; i < solicitudFiles.length; i += 1) {
        const f = solicitudFiles[i]!;
        const safeName = sanitizeFileName(f.name || `foto-${i + 1}.jpg`);
        const storagePath = `solicitudes_equipos_paciente/${usuario.id}/${solicitudId}/${Date.now()}-${i + 1}-${safeName}`;
        const refFile = storageRef(storage, storagePath);
        await uploadBytes(refFile, f, { contentType: f.type });
        fotos.push({ path: storagePath, name: f.name, size: f.size, contentType: f.type });
      }

      const solicitud: SolicitudEquipoPaciente = {
        id: solicitudId,
        estado: EstadoSolicitudEquipoPaciente.PENDIENTE,
        idPaciente: openSolicitud.id,
        pacienteNombre: openSolicitud.nombreCompleto,
        pacienteDocumento: openSolicitud.numeroDocumento,
        tipoPropiedad: solicitudTipo,
        equipoNombre: solicitudEquipoNombre.trim(),
        empresaAlquiler: solicitudTipo === TipoPropiedad.ALQUILADO ? solicitudEmpresa.trim() : undefined,
        observaciones: solicitudObservaciones.trim() || undefined,
        fotos,
        creadoPorUid: usuario.id,
        creadoPorNombre: usuario.nombre,
        createdAt: new Date().toISOString(),
      };

      await createSolicitudEquipoPaciente(solicitud);
      toast({
        tone: 'success',
        message: 'Solicitud enviada al biomédico.',
      });
      resetSolicitud();
    } catch (e: any) {
      console.error('submitSolicitud error:', e);
      toast({
        tone: 'error',
        message: `${e?.code ? `${e.code}: ` : ''}${e?.message || 'No se pudo enviar la solicitud.'}`,
      });
      setSolicitudSaving(false);
    }
  };

  // Modal firma de ENTREGA (VISITADOR)
  const [openFirma, setOpenFirma] = useState<{
    asignacion: Asignacion;
    paciente: Paciente;
    equipo: EquipoBiomedico;
  } | null>(null);
  const [firmaEntrega, setFirmaEntrega] = useState<string | null>(null);
  const [savingFirma, setSavingFirma] = useState(false);
  const [openFirmaView, setOpenFirmaView] = useState<{
    asignacion: Asignacion;
    paciente: Paciente;
    equipo: EquipoBiomedico;
  } | null>(null);

  const resetFirma = () => {
    setOpenFirma(null);
    setFirmaEntrega(null);
    setSavingFirma(false);
  };

  const closeFirmaView = () => setOpenFirmaView(null);

  const saveFirmaEntrega = async () => {
    if (!usuario) return;
    if (!openFirma) return;
    if (!firmaEntrega) {
      toast({ tone: 'warning', message: 'El paciente debe firmar antes de guardar.' });
      return;
    }
    if (openFirma.asignacion.firmaPacienteEntrega) {
      toast({ tone: 'warning', message: 'Esta asignacion ya tiene firma registrada. No se puede modificar.' });
      resetFirma();
      return;
    }

    const nombreCaptura = (usuario.nombre || '').trim() || 'VISITADOR';
    setSavingFirma(true);
    try {
      const fn = httpsCallable(firebaseFunctions, 'guardarFirmaEntregaVisitador');
      await fn({
        idAsignacion: openFirma.asignacion.id,
        firmaEntrega,
        capturadoPorNombre: nombreCaptura,
      });
      toast({ tone: 'success', message: 'Firma registrada correctamente.' });
      resetFirma();
    } catch (e: any) {
      console.error('saveFirmaEntrega error:', e);
      toast({ tone: 'error', message: `${e?.code ? `${e.code}: ` : ''}${e?.message || 'No se pudo guardar la firma.'}` });
      setSavingFirma(false);
    }
  };

  const openReporteByAsignacion = (idAsignacion: string) => {
    const r = reportes.find(
      (x) => x.idAsignacion === idAsignacion && x.estado !== EstadoReporteEquipo.CERRADO,
    );
    if (r) {
      setOpenReporte(r);
      return true;
    }
    return false;
  };

  const submitReporte = async () => {
    if (!usuario) return;
    if (!openCreate) return;
    if (!descripcion.trim()) {
      toast({ tone: 'warning', message: 'Escribe una descripcion del hallazgo/falla.' });
      return;
    }
    if (files.length === 0) {
      toast({ tone: 'warning', message: 'Debes adjuntar al menos 1 foto.' });
      return;
    }
    if (files.length > MAX_FOTOS) {
      toast({ tone: 'warning', message: `Maximo ${MAX_FOTOS} fotos por reporte.` });
      return;
    }

    // Bloqueo de duplicados: 1 reporte ABIERTO por idAsignacion (para evitar reportes repetidos de la misma falla).
    // Hacemos doble validación: (1) memoria y (2) consulta a Firestore (por si aún no cargó la suscripción).
    const alreadyOpenLocal = reportes.find(
      (r) => r.idAsignacion === openCreate.asignacion.id && r.estado !== EstadoReporteEquipo.CERRADO,
    );
    if (alreadyOpenLocal) {
      toast({
        tone: 'warning',
        title: 'Reporte duplicado',
        message: 'Ya existe un reporte ABIERTO o EN PROCESO para esta asignacion. Revisa el detalle para evitar duplicados.',
      });
      setOpenReporte(alreadyOpenLocal);
      resetCreate();
      return;
    }
    try {
      const q = query(
        collection(db, 'reportes_equipos'),
        where('idAsignacion', '==', openCreate.asignacion.id),
        where('estado', 'in', [EstadoReporteEquipo.ABIERTO, EstadoReporteEquipo.EN_PROCESO]),
        where('creadoPorUid', '==', usuario.id),
        limit(1),
      );
      const snap = await getDocs(q);
      const doc0 = snap.docs[0];
      if (doc0) {
        const existing = { id: doc0.id, ...(doc0.data() as Omit<ReporteEquipo, 'id'>) };
        toast({
          tone: 'warning',
          title: 'Reporte duplicado',
          message: 'Ya existe un reporte ABIERTO o EN PROCESO para esta asignacion. Revisa el detalle para evitar duplicados.',
        });
        setOpenReporte(existing);
        resetCreate();
        return;
      }
    } catch {
      // Si falla la consulta, seguimos y la seguridad final la imponen las rules (y el flujo normal).
    }

    setCreating(true);
    try {
      const reporteId = doc(collection(db, 'reportes_equipos')).id;

      const fotos: ReporteFoto[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i]!;
        const safeName = sanitizeFileName(f.name || `foto-${i + 1}.jpg`);
        const storagePath = `reportes_equipos/${usuario.id}/${reporteId}/${Date.now()}-${i + 1}-${safeName}`;
        const refFile = storageRef(storage, storagePath);
        await uploadBytes(refFile, f, { contentType: f.type });
        fotos.push({ path: storagePath, name: f.name, size: f.size, contentType: f.type });
      }

      const { asignacion, paciente, equipo } = openCreate;
      const reporte: ReporteEquipo = {
        id: reporteId,
        estado: EstadoReporteEquipo.ABIERTO,
        idAsignacion: asignacion.id,
        idPaciente: paciente.id,
        idEquipo: equipo.id,
        fechaVisita: isoFromDate(fechaVisita),
        descripcion: descripcion.trim(),
        fotos,
        creadoPorUid: usuario.id,
        creadoPorNombre: usuario.nombre,
        pacienteNombre: paciente.nombreCompleto,
        pacienteDocumento: paciente.numeroDocumento,
        equipoCodigoInventario: equipo.codigoInventario,
        equipoNombre: equipo.nombre,
        equipoSerie: equipo.numeroSerie,
      };

      await createReporteEquipo(reporte);
      toast({
        tone: 'success',
        title: 'Reporte creado',
        message: 'Se notificara al biomedico por email (si esta configurado).',
      });
      resetCreate();
    } catch (e: any) {
      console.error('submitReporte error:', e);
      toast({ tone: 'error', message: `${e?.code ? `${e.code}: ` : ''}${e?.message || 'No se pudo crear el reporte.'}` });
      setCreating(false);
    }
  };

  useEffect(() => {
    let canceled = false;
    const loadUrls = async () => {
      setFotoUrls({});
      const r = openReporte;
      if (!r) return;

      // VISITADOR: al abrir un reporte cerrado propio, lo marca como leído (badge "cerrados sin leer").
      if (
        isVisitador &&
        r.estado === EstadoReporteEquipo.CERRADO &&
        !r.vistoPorVisitadorAt &&
        r.creadoPorUid === usuario.id
      ) {
        try {
          await marcarReporteVistoPorVisitador({ idReporte: r.id });
          if (!canceled) {
            setOpenReporte((prev) => (prev ? { ...prev, vistoPorVisitadorAt: new Date().toISOString() } : prev));
          }
        } catch (err) {
          console.warn('marcarReporteVistoPorVisitador failed', err);
        }
      }

      const entries: Array<[string, string]> = [];
      for (const f of r.fotos || []) {
        try {
          const url = await getDownloadURL(storageRef(storage, f.path));
          entries.push([f.path, url]);
        } catch (err) {
          console.warn('getDownloadURL failed', f.path, err);
        }
      }
      if (!canceled) setFotoUrls(Object.fromEntries(entries));
    };
    loadUrls().catch(() => {});
    return () => {
      canceled = true;
    };
  }, [openReporte]);

  const startProcesoReporte = async () => {
    if (!usuario) return;
    if (!openReporte) return;
    if (!diagnostico.trim() || !planReparacion.trim()) {
      toast({ tone: 'warning', message: 'Completa diagnóstico y plan de reparación antes de continuar.' });
      return;
    }
    setStartingProceso(true);
    try {
      await iniciarReporteEnProceso({
        idReporte: openReporte.id,
        diagnostico: diagnostico.trim(),
        planReparacion: planReparacion.trim(),
        porUid: usuario.id,
        porNombre: usuario.nombre,
      });
      toast({ tone: 'success', message: 'Reporte actualizado a EN PROCESO.' });
    } catch (e: any) {
      console.error('startProcesoReporte error:', e);
      toast({ tone: 'error', message: `${e?.code ? `${e.code}: ` : ''}${e?.message || 'No se pudo iniciar el proceso.'}` });
    } finally {
      setStartingProceso(false);
    }
  };

  const addNotaProceso = async () => {
    if (!usuario) return;
    if (!openReporte) return;
    if (!notaProceso.trim()) {
      toast({ tone: 'warning', message: 'Escribe una nota de avance.' });
      return;
    }
    setAddingNota(true);
    try {
      await agregarNotaReporte({
        idReporte: openReporte.id,
        nota: notaProceso.trim(),
        porUid: usuario.id,
        porNombre: usuario.nombre,
      });
      toast({ tone: 'success', message: 'Avance registrado.' });
      setNotaProceso('');
    } catch (e: any) {
      console.error('addNotaProceso error:', e);
      toast({ tone: 'error', message: `${e?.code ? `${e.code}: ` : ''}${e?.message || 'No se pudo registrar el avance.'}` });
    } finally {
      setAddingNota(false);
    }
  };

  const closeReporte = async () => {
    if (!usuario) return;
    if (!openReporte) return;
    if (openReporte.estado !== EstadoReporteEquipo.EN_PROCESO) {
      toast({ tone: 'warning', message: 'Primero debes pasar el reporte a EN PROCESO.' });
      return;
    }
    if (!cierreNotas.trim()) {
      toast({ tone: 'warning', message: 'Agrega una nota de cierre (que se encontro/que se hizo).' });
      return;
    }
    setClosing(true);
    try {
      await cerrarReporteEquipo({
        idReporte: openReporte.id,
        cierreNotas: cierreNotas.trim(),
        cerradoPorUid: usuario.id,
        cerradoPorNombre: usuario.nombre,
      });
      toast({ tone: 'success', message: 'Reporte cerrado correctamente.' });
      setOpenReporte(null);
      setCierreNotas('');
    } catch (e: any) {
      console.error('closeReporte error:', e);
      toast({ tone: 'error', message: `${e?.code ? `${e.code}: ` : ''}${e?.message || 'No se pudo cerrar el reporte.'}` });
    } finally {
      setClosing(false);
    }
  };

  if (!usuario) return null;
  if (!isVisitador && !isBiomedico) {
    return (
      <Layout title="Visitas">
        <div className="bg-white p-6 rounded-lg shadow max-w-2xl">
          <h3 className="font-bold text-gray-900 mb-2">Acceso restringido</h3>
          <p className="text-sm text-gray-600">
            Esta sección es solo para el rol <code className="px-1">VISITADOR</code> y{' '}
            <code className="px-1">INGENIERO_BIOMEDICO</code>.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={isVisitador ? 'Visitas domiciliarias' : 'Reportes de Mantenimiento'}>
      {firestoreError && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded p-3 text-sm">
          {firestoreError}
        </div>
      )}

      {isVisitador && (
        <div className="space-y-4">
          <div className="md-card p-2 flex flex-wrap gap-2">
            <button
              className={`md-btn ${visitadorTab === 'PENDIENTES' ? 'md-btn-filled' : 'md-btn-outlined'}`}
              onClick={() => setVisitadorTab('PENDIENTES')}
              type="button"
            >
              Pendientes
            </button>
            <button
              className={`md-btn ${visitadorTab === 'HISTORIAL' ? 'md-btn-filled' : 'md-btn-outlined'}`}
              onClick={() => setVisitadorTab('HISTORIAL')}
              type="button"
            >
              Historial
            </button>
            <button
              className={`md-btn ${visitadorTab === 'REPORTES' ? 'md-btn-filled' : 'md-btn-outlined'}`}
              onClick={() => setVisitadorTab('REPORTES')}
              type="button"
            >
              Reportes
            </button>
          </div>

          {visitadorTab === 'PENDIENTES' && (
            <div className="space-y-4">
              {/* Firmas de entrega pendientes (VISITADOR) */}
              <div className="md-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-gray-900">Firmas de entrega pendientes</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Captura la firma del paciente en el domicilio para dejar evidencia en el acta de entrega.
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    Pendientes:{' '}
                    {pendingFirmasFiltered.length}
                    {pendingSearch.trim() ? ` / ${pendingFirmasAll.length}` : ''}
                  </div>
                </div>

                <div className="mt-3 md-search max-w-xl">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M21 21l-4.3-4.3" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Buscar por paciente, documento, MBG o serie..."
                    value={pendingSearch}
                    onChange={(e) => setPendingSearch(e.target.value)}
                  />
                </div>

                <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {pendingFirmasAll.length === 0 ? (
                    <div className="text-sm text-gray-500">No hay firmas pendientes.</div>
                  ) : pendingFirmasFiltered.length === 0 ? (
                    <div className="text-sm text-gray-500">No hay firmas pendientes con ese filtro.</div>
                  ) : (
                    pendingFirmasFiltered
                      .slice(0, 6)
                      .map(({ a, paciente, equipo }) => (
                        <div key={a.id} className="border rounded-lg p-3 bg-white">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-bold text-gray-900">{paciente!.nombreCompleto}</div>
                              <div className="text-xs text-gray-500">
                                Doc: {paciente!.numeroDocumento} · Equipo:{' '}
                                <span className="font-mono">{equipo!.codigoInventario}</span>
                              </div>
                              <div className="text-xs text-gray-500">
                                {equipo!.nombre} · Serie: <span className="font-mono">{equipo!.numeroSerie}</span>
                              </div>
                            </div>
                            <button
                              className="md-btn md-btn-outlined"
                              onClick={() => {
                                setOpenFirma({ asignacion: a, paciente: paciente!, equipo: equipo! });
                                setFirmaEntrega(null);
                              }}
                              type="button"
                            >
                              Capturar firma
                            </button>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>

              {/* Equipos del paciente por registrar (VISITADOR) */}
              <div className="md-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-gray-900">Equipos del paciente por registrar</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Pacientes sin asignación activa. Registra el equipo como propio o alquilado.
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    Total: {pacientesSinAsignacionFiltered.length}
                    {pacientesSinAsignacionSearch.trim()
                      ? ` / ${pacientesSinAsignacion.length}`
                      : ''}
                  </div>
                </div>

                <div className="mt-3 md-search max-w-xl">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M21 21l-4.3-4.3" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Buscar por paciente o cédula..."
                    value={pacientesSinAsignacionSearch}
                    onChange={(e) => setPacientesSinAsignacionSearch(e.target.value)}
                  />
                </div>

                <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {loadingPacientesSinAsignacion ? (
                    <div className="text-sm text-gray-500">Cargando pacientes...</div>
                  ) : pacientesSinAsignacion.length === 0 ? (
                    <div className="text-sm text-gray-500">No hay pacientes sin asignación activa.</div>
                  ) : pacientesSinAsignacionFiltered.length === 0 ? (
                    <div className="text-sm text-gray-500">No hay pacientes con ese filtro.</div>
                  ) : (
                    pacientesSinAsignacionFiltered.slice(0, 8).map((p) => {
                      const pendiente = solicitudes.find(
                        (s) => s.idPaciente === p.id && s.estado === EstadoSolicitudEquipoPaciente.PENDIENTE,
                      );
                      return (
                        <div key={p.id} className="border rounded-lg p-3 bg-white">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-bold text-gray-900">{p.nombreCompleto}</div>
                              <div className="text-xs text-gray-500">Doc: {p.numeroDocumento}</div>
                              {pendiente ? (
                                <div className="text-xs text-amber-700 mt-1">Solicitud pendiente</div>
                              ) : null}
                            </div>
                            <button
                              className="md-btn md-btn-outlined"
                          onClick={() => {
                            setOpenSolicitud(p);
                            setSolicitudTipo(TipoPropiedad.PACIENTE);
                            setSolicitudEquipoNombre('');
                            setSolicitudEmpresa('');
                            setSolicitudObservaciones('');
                            setSolicitudFiles([]);
                          }}
                              type="button"
                              disabled={!!pendiente}
                            >
                              Registrar equipo
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {visitadorTab === 'HISTORIAL' && (
            <div className="space-y-4">
              {/* Solicitudes enviadas (VISITADOR) */}
              <div className="md-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-gray-900">Solicitudes enviadas</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Historial de registros enviados al biomédico.
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">Total: {solicitudes.length}</div>
                </div>

                <div className="mt-3 space-y-2">
                  {solicitudes.length === 0 ? (
                    <div className="text-sm text-gray-500">Aún no has creado solicitudes.</div>
                  ) : (
                solicitudes.slice(0, 6).map((s) => {
                  const meta = solicitudStatusMeta(s);
                  return (
                        <div key={s.id} className="border rounded-lg p-3 bg-white">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-bold text-gray-900">{s.pacienteNombre}</div>
                          <div className="text-xs text-gray-500">
                            Doc: {s.pacienteDocumento} · Tipo: {s.tipoPropiedad}
                          </div>
                          {s.equipoNombre && (
                            <div className="text-xs text-gray-500">Equipo: {s.equipoNombre}</div>
                          )}
                          {s.tipoPropiedad === TipoPropiedad.ALQUILADO && s.empresaAlquiler && (
                            <div className="text-xs text-gray-500">
                              Empresa: <span className="font-medium">{s.empresaAlquiler}</span>
                            </div>
                          )}
                              {s.aprobadoAt ? (
                                <div className="text-xs text-gray-500 mt-1">
                                  Aprobada: {new Date(s.aprobadoAt).toLocaleDateString()}
                                </div>
                              ) : null}
                            </div>
                            <span className={`px-2 py-1 rounded-full text-xs border ${meta.className}`}>
                              {meta.label}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Firmas capturadas (VISITADOR) */}
              <div className="md-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-gray-900">Firmas capturadas</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Historial de firmas de entrega registradas por ti.
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    Total:{' '}
                    {
                      asignacionesActivasEnriquecidas.filter(
                        ({ a }) => !!a.firmaPacienteEntrega && a.firmaPacienteEntregaCapturadaPorUid === usuario.id,
                      ).length
                    }
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {asignacionesActivasEnriquecidas.filter(
                    ({ a }) => !!a.firmaPacienteEntrega && a.firmaPacienteEntregaCapturadaPorUid === usuario.id,
                  ).length === 0 ? (
                    <div className="text-sm text-gray-500">Aún no has capturado firmas.</div>
                  ) : (
                    asignacionesActivasEnriquecidas
                      .filter(({ a }) => !!a.firmaPacienteEntrega && a.firmaPacienteEntregaCapturadaPorUid === usuario.id)
                      .slice(0, 6)
                      .map(({ a, paciente, equipo }) => (
                        <div key={a.id} className="border rounded-lg p-3 bg-white">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-bold text-gray-900">{paciente!.nombreCompleto}</div>
                              <div className="text-xs text-gray-500">
                                Equipo: <span className="font-mono">{equipo!.codigoInventario}</span> ·{' '}
                                {a.firmaPacienteEntregaCapturadaAt
                                  ? `Capturada: ${new Date(a.firmaPacienteEntregaCapturadaAt).toLocaleDateString()}`
                                  : 'Capturada'}
                              </div>
                            </div>
                            <button
                              className="md-btn md-btn-outlined"
                              onClick={() => setOpenFirmaView({ asignacion: a, paciente: paciente!, equipo: equipo! })}
                              type="button"
                            >
                              Ver firma
                            </button>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>
          )}

          {visitadorTab === 'REPORTES' && (
            <div className="space-y-4">
              {/* Resumen/historial del visitador */}
              <div className="md-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-gray-900">Mis reportes</div>
                    <div className="text-xs text-gray-500">
                      Abiertos: {reportesCountAbiertos} · En proceso: {reportesCountProceso} · Cerrados: {reportesCountCerrados}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className={`md-btn ${reporteTab === 'ABIERTO' ? 'md-btn-filled' : 'md-btn-outlined'}`}
                      onClick={() => setReporteTab('ABIERTO')}
                      type="button"
                    >
                      Abiertos
                    </button>
                    <button
                      className={`md-btn ${reporteTab === 'EN_PROCESO' ? 'md-btn-filled' : 'md-btn-outlined'}`}
                      onClick={() => setReporteTab('EN_PROCESO')}
                      type="button"
                    >
                      En proceso
                    </button>
                    <button
                      className={`md-btn ${reporteTab === 'CERRADO' ? 'md-btn-filled' : 'md-btn-outlined'}`}
                      onClick={() => setReporteTab('CERRADO')}
                      type="button"
                    >
                      Cerrados
                    </button>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {reportesFiltrados.length === 0 ? (
                    <div className="text-sm text-gray-500">
                      Sin reportes {reporteTabLabel}.
                    </div>
                  ) : (
                    reportesFiltrados.slice(0, 8).map((r) => (
                      <button
                        key={r.id}
                        className="w-full text-left border rounded-lg p-3 hover:bg-gray-50"
                        onClick={() => setOpenReporte(r)}
                        type="button"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-gray-900">
                              {r.equipoCodigoInventario} · {r.pacienteNombre}
                            </div>
                            <div className="text-xs text-gray-500">
                              {new Date(r.fechaVisita).toLocaleDateString()} · {r.estado}
                              {r.cerradoAt ? ` · Cerrado: ${new Date(r.cerradoAt).toLocaleDateString()}` : ''}
                            </div>
                            {r.cierreNotas ? <div className="text-xs text-gray-600 mt-1">{r.cierreNotas}</div> : null}
                          </div>
                          <span className="text-xs font-semibold text-indigo-600 underline">Ver</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="md-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-gray-900">Crear reporte</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Selecciona una asignación activa para reportar hallazgos o fallas del equipo.
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    Total: {filteredAsignaciones.length}
                    {search.trim() ? ` / ${asignacionesActivasEnriquecidas.length}` : ''}
                  </div>
                </div>

                <div className="mt-3 md-search max-w-xl">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M21 21l-4.3-4.3" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Buscar por paciente, documento, MBG o serie..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                <div className="mt-4">
                  {filteredAsignaciones.length === 0 ? (
                    <div className="text-sm text-gray-600">
                      No hay asignaciones activas visibles para tu usuario.
                      <div className="text-xs text-gray-500 mt-2">
                        Si ya existen asignaciones en el sistema, pide al administrador que ejecute la función de “recalcular flags VISITADOR”.
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {filteredAsignaciones.map(({ a, paciente, equipo }) => (
                        <div key={a.id} className="border rounded-lg p-3 bg-white">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-bold text-gray-900">{paciente!.nombreCompleto}</div>
                              <div className="text-xs text-gray-500">
                                Doc: {paciente!.numeroDocumento} · Equipo: <span className="font-mono">{equipo!.codigoInventario}</span>
                              </div>
                              <div className="text-xs text-gray-500">
                                {equipo!.nombre} · Serie: <span className="font-mono">{equipo!.numeroSerie}</span>
                              </div>
                            </div>
                            <button
                              className="md-btn md-btn-filled"
                              onClick={() => {
                                // Bloqueo de duplicados por idAsignacion: si ya existe reporte abierto, mostramos el existente.
                                if (openReporteByAsignacion(a.id)) return;
                                setOpenCreate({ asignacion: a, paciente: paciente!, equipo: equipo! });
                                setFechaVisita(todayInput());
                                setDescripcion('');
                                setFiles([]);
                              }}
                              type="button"
                            >
                              Reportar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

	      {/* Modal firma de entrega (VISITADOR) */}
      {openFirma && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
	          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-auto">
	            <div className="p-4 border-b flex items-center justify-between">
	              <div>
	                <div className="text-lg font-bold text-gray-900">Capturar firma · Acta de entrega</div>
	                <div className="text-xs text-gray-500">
	                  Paciente: {openFirma.paciente.nombreCompleto} · Equipo:{' '}
	                  <span className="font-mono">{openFirma.equipo.codigoInventario}</span>
	                </div>
	              </div>
	              <button className="md-btn md-btn-outlined" onClick={resetFirma} disabled={savingFirma} type="button">
	                Cerrar
	              </button>
	            </div>

	            <div className="p-4 space-y-4">
	              <div className="md-card p-4">
	                <div className="text-sm font-semibold text-gray-900 mb-2">Firma del paciente</div>
	                <SignaturePad onEnd={setFirmaEntrega} />
	                <div className="text-xs text-gray-500 mt-2">
	                  Esta firma quedará como evidencia en el acta de entrega. No se podrá modificar después de guardarla.
	                </div>
	              </div>

	              <div className="flex justify-end gap-2">
	                <button className="md-btn md-btn-outlined" onClick={resetFirma} disabled={savingFirma} type="button">
	                  Cancelar
	                </button>
	                <button className="md-btn md-btn-filled" onClick={saveFirmaEntrega} disabled={savingFirma} type="button">
	                  {savingFirma ? 'Guardando...' : 'Guardar firma'}
	                </button>
	              </div>
	            </div>
	          </div>
	        </div>
	      )}

	      {isBiomedico && (
	        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              className={`md-btn ${reporteTab === 'ABIERTO' ? 'md-btn-filled' : 'md-btn-outlined'}`}
              onClick={() => setReporteTab('ABIERTO')}
            >
              Abiertos
            </button>
            <button
              className={`md-btn ${reporteTab === 'EN_PROCESO' ? 'md-btn-filled' : 'md-btn-outlined'}`}
              onClick={() => setReporteTab('EN_PROCESO')}
            >
              En proceso
            </button>
            <button
              className={`md-btn ${reporteTab === 'CERRADO' ? 'md-btn-filled' : 'md-btn-outlined'}`}
              onClick={() => setReporteTab('CERRADO')}
            >
              Cerrados
            </button>
          </div>

          <div className="md-card p-4 overflow-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b">
                  <th className="py-3 px-2">Fecha</th>
                  <th className="py-3 px-2">Equipo</th>
                  <th className="py-3 px-2">Paciente</th>
                  <th className="py-3 px-2">Visitador</th>
                  <th className="py-3 px-2">Acción</th>
                </tr>
              </thead>
              <tbody>
                {reportesFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-500">
                      No hay reportes {reporteTabLabel}.
                    </td>
                  </tr>
                ) : (
                  reportesFiltrados.map((r) => (
                    <tr key={r.id} className="border-b last:border-b-0 hover:bg-gray-50">
                      <td className="py-3 px-2">{new Date(r.fechaVisita).toLocaleDateString()}</td>
                      <td className="py-3 px-2">
                        <div className="font-mono text-xs text-gray-500">{r.equipoCodigoInventario}</div>
                        <div className="font-semibold text-gray-900">{r.equipoNombre}</div>
                      </td>
                      <td className="py-3 px-2">
                        <div className="font-semibold text-gray-900">{r.pacienteNombre}</div>
                        <div className="text-xs text-gray-500">{r.pacienteDocumento}</div>
                      </td>
                      <td className="py-3 px-2">{r.creadoPorNombre}</td>
                      <td className="py-3 px-2">
                        <button className="md-btn md-btn-outlined" onClick={() => setOpenReporte(r)}>
                          Ver
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal ver firma (VISITADOR) */}
      {openFirmaView && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-gray-900">Firma registrada · Acta de entrega</div>
                <div className="text-xs text-gray-500">
                  Paciente: {openFirmaView.paciente.nombreCompleto} · Equipo:{' '}
                  <span className="font-mono">{openFirmaView.equipo.codigoInventario}</span>
                </div>
              </div>
              <button className="md-btn md-btn-outlined" onClick={closeFirmaView} type="button">
                Cerrar
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="md-card p-4">
                {openFirmaView.asignacion.firmaPacienteEntrega ? (
                  <img
                    src={openFirmaView.asignacion.firmaPacienteEntrega}
                    alt="Firma paciente"
                    className="w-full max-h-[420px] object-contain bg-white"
                  />
                ) : (
                  <div className="text-sm text-gray-500">Sin firma registrada.</div>
                )}
                <div className="text-xs text-gray-500 mt-2">
                  {openFirmaView.asignacion.firmaPacienteEntregaCapturadaAt
                    ? `Capturada: ${new Date(openFirmaView.asignacion.firmaPacienteEntregaCapturadaAt).toLocaleString()}`
                    : 'Capturada'}
                  {openFirmaView.asignacion.firmaPacienteEntregaCapturadaPorNombre
                    ? ` · Por: ${openFirmaView.asignacion.firmaPacienteEntregaCapturadaPorNombre}`
                    : ''}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal crear reporte (VISITADOR) */}
      {openCreate && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-gray-900">Nuevo reporte</div>
                <div className="text-xs text-gray-500">
                  {openCreate.equipo.codigoInventario} · {openCreate.paciente.nombreCompleto}
                </div>
              </div>
              <button className="md-btn md-btn-outlined" onClick={resetCreate} disabled={creating}>
                Cerrar
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Fecha de visita</label>
                  <input
                    type="date"
                    className="w-full border p-2.5 rounded-md"
                    value={fechaVisita}
                    onChange={(e) => setFechaVisita(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Fotos (máx {MAX_FOTOS})</label>
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    multiple
                    className="w-full border p-2.5 rounded-md bg-white"
                    onChange={(e) => onPickFiles(e.target.files)}
                    disabled={creating}
                  />
                  <div className="text-xs text-gray-500 mt-1">Máximo {MAX_MB}MB por foto.</div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Descripción</label>
                <textarea
                  className="w-full border p-2.5 rounded-md"
                  rows={4}
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Describe el estado del equipo, fallas encontradas, etc."
                />
              </div>

              {files.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {previews.map((p, idx) => (
                    <div key={idx} className="border rounded-lg overflow-hidden bg-gray-50">
                      <img src={p.url} alt={`Foto ${idx + 1}`} className="w-full h-32 object-cover" />
                      <div className="p-2 flex items-center justify-between gap-2">
                        <div className="text-xs text-gray-500 truncate">{p.file.name}</div>
                        <button className="text-xs text-red-600 hover:underline" onClick={() => removeFile(idx)} type="button">
                          Quitar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button className="md-btn md-btn-outlined" onClick={resetCreate} disabled={creating}>
                  Cancelar
                </button>
                <button className="md-btn md-btn-filled" onClick={submitReporte} disabled={creating}>
                  {creating ? 'Guardando...' : 'Guardar reporte'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal solicitud equipo paciente (VISITADOR) */}
      {openSolicitud && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-gray-900">Registrar equipo del paciente</div>
                <div className="text-xs text-gray-500">
                  {openSolicitud.nombreCompleto} · Doc: {openSolicitud.numeroDocumento}
                </div>
              </div>
              <button className="md-btn md-btn-outlined" onClick={resetSolicitud} disabled={solicitudSaving}>
                Cerrar
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Tipo de propiedad</label>
                  <select
                    className="w-full border p-2.5 rounded-md"
                    value={solicitudTipo}
                    onChange={(e) => {
                      const next = e.target.value as TipoPropiedad;
                      setSolicitudTipo(next);
                      if (next !== TipoPropiedad.ALQUILADO) {
                        setSolicitudEmpresa('');
                      }
                    }}
                    disabled={solicitudSaving}
                  >
                    <option value={TipoPropiedad.PACIENTE}>Paciente</option>
                    <option value={TipoPropiedad.ALQUILADO}>Alquilado</option>
                    <option value={TipoPropiedad.MEDICUC}>Medicuc</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Nombre del equipo</label>
                  <input
                    className="w-full border p-2.5 rounded-md"
                    value={solicitudEquipoNombre}
                    onChange={(e) => setSolicitudEquipoNombre(e.target.value)}
                    placeholder="Ej: Concentrador de oxígeno"
                    disabled={solicitudSaving}
                  />
                </div>
                {solicitudTipo === TipoPropiedad.ALQUILADO && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Empresa que alquila</label>
                    <input
                      className="w-full border p-2.5 rounded-md"
                      value={solicitudEmpresa}
                      onChange={(e) => setSolicitudEmpresa(e.target.value)}
                      placeholder="Ej: Empresa X"
                      disabled={solicitudSaving}
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Fotos del equipo (mín {MIN_SOLICITUD_FOTOS}, máx {MAX_FOTOS})
                  </label>
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    multiple
                    className="w-full border p-2.5 rounded-md bg-white"
                    onChange={(e) => onPickSolicitudFiles(e.target.files)}
                    disabled={solicitudSaving}
                  />
                  <input
                    ref={solicitudCameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => onPickSolicitudFiles(e.target.files)}
                    disabled={solicitudSaving}
                  />
                  <div className="text-xs text-gray-500 mt-1">Máximo {MAX_MB}MB por foto.</div>
                  <button
                    type="button"
                    className="md-btn md-btn-outlined mt-2"
                    onClick={() => solicitudCameraRef.current?.click()}
                    disabled={solicitudSaving}
                  >
                    Tomar foto
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Observaciones (opcional)</label>
                <textarea
                  className="w-full border p-2.5 rounded-md"
                  rows={3}
                  value={solicitudObservaciones}
                  onChange={(e) => setSolicitudObservaciones(e.target.value)}
                  placeholder="Ej: equipo propio del paciente, modelo visible en etiqueta, etc."
                  disabled={solicitudSaving}
                />
              </div>

              {solicitudFiles.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {solicitudPreviews.map((p, idx) => (
                    <div key={idx} className="border rounded-lg overflow-hidden bg-gray-50">
                      <img src={p.url} alt={`Foto ${idx + 1}`} className="w-full h-32 object-cover" />
                      <div className="p-2 flex items-center justify-between gap-2">
                        <div className="text-xs text-gray-500 truncate">{p.file.name}</div>
                        <button
                          className="text-xs text-red-600 hover:underline"
                          onClick={() => removeSolicitudFile(idx)}
                          type="button"
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button className="md-btn md-btn-outlined" onClick={resetSolicitud} disabled={solicitudSaving}>
                  Cancelar
                </button>
                <button className="md-btn md-btn-filled" onClick={submitSolicitud} disabled={solicitudSaving}>
                  {solicitudSaving ? 'Enviando...' : 'Enviar solicitud'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal detalle reporte (BIOMEDICO) */}
      {openReporte && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-gray-900">
                  Reporte · {openReporte.equipoCodigoInventario} · {openReporte.pacienteNombre}
                </div>
                <div className="text-xs text-gray-500">
                  Fecha visita: {new Date(openReporte.fechaVisita).toLocaleDateString()} · Creado por: {openReporte.creadoPorNombre}
                </div>
              </div>
              <button className="md-btn md-btn-outlined" onClick={() => setOpenReporte(null)}>
                Cerrar
              </button>
            </div>

            <div className="p-4 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
              <div className="space-y-4">
                <div className="md-card p-4">
                  <div className="text-sm font-semibold text-gray-900 mb-1">Descripción</div>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap">{openReporte.descripcion}</div>
                </div>

                <div className="md-card p-4">
                  <div className="text-sm font-semibold text-gray-900 mb-3">Fotos</div>
                  {openReporte.fotos?.length ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {openReporte.fotos.map((f, idx) => (
                        <a key={f.path} href={fotoUrls[f.path]} target="_blank" rel="noreferrer" className="block border rounded-lg overflow-hidden bg-gray-50">
                          {fotoUrls[f.path] ? (
                            <img src={fotoUrls[f.path]} alt={`Foto ${idx + 1}`} className="w-full h-56 object-cover" />
                          ) : (
                            <div className="h-56 flex items-center justify-center text-sm text-gray-400">Cargando...</div>
                          )}
                          <div className="p-2 text-xs text-gray-500 truncate">{f.name}</div>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">Sin fotos.</div>
                  )}
                </div>

                <div className="md-card p-4">
                  <div className="text-sm font-semibold text-gray-900 mb-2">Historial de reparación</div>
                  {historialReporte.length ? (
                    <div className="space-y-2">
                      {historialReporte.map((h, idx) => (
                        <div key={`${h.fecha}-${idx}`} className="border rounded-lg p-3 bg-gray-50">
                          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                            <span>{new Date(h.fecha).toLocaleString()}</span>
                            <span className="font-semibold text-gray-700">{h.estado}</span>
                          </div>
                          <div className="text-sm text-gray-800 whitespace-pre-wrap">{h.nota}</div>
                          <div className="text-xs text-gray-500 mt-2">Por: {h.porNombre}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">Sin historial registrado.</div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                {isBiomedico ? (
                  openReporte.estado === EstadoReporteEquipo.ABIERTO ? (
                    <div className="md-card p-4">
                      <div className="text-sm font-semibold text-gray-900">Iniciar proceso</div>
                      <div className="text-xs text-gray-500 mt-1">
                        Registra diagnóstico y plan de reparación para pasar a <b>EN PROCESO</b>.
                      </div>
                      <div className="mt-3">
                        <label className="block text-sm font-medium text-gray-700">Diagnóstico</label>
                        <textarea
                          className="w-full border p-2.5 rounded-md"
                          rows={3}
                          value={diagnostico}
                          onChange={(e) => setDiagnostico(e.target.value)}
                          placeholder="Ej: Falla en fuente de poder / sensor sin lectura..."
                        />
                      </div>
                      <div className="mt-3">
                        <label className="block text-sm font-medium text-gray-700">Plan de reparación</label>
                        <textarea
                          className="w-full border p-2.5 rounded-md"
                          rows={3}
                          value={planReparacion}
                          onChange={(e) => setPlanReparacion(e.target.value)}
                          placeholder="Ej: Cambiar cable, revisar batería, pruebas funcionales..."
                        />
                      </div>
                      <button
                        className="md-btn md-btn-filled w-full mt-3"
                        onClick={startProcesoReporte}
                        disabled={startingProceso}
                      >
                        {startingProceso ? 'Guardando...' : 'Pasar a EN PROCESO'}
                      </button>
                    </div>
                  ) : openReporte.estado === EstadoReporteEquipo.EN_PROCESO ? (
                    <>
                      <div className="md-card p-4">
                        <div className="text-sm font-semibold text-gray-900">En proceso</div>
                        <div className="text-xs text-gray-500 mt-1">
                          Diagnóstico y plan registrados para este reporte.
                        </div>
                        <div className="mt-3">
                          <div className="text-xs font-semibold text-gray-600 mb-1">Diagnóstico</div>
                          <div className="text-sm text-gray-800 whitespace-pre-wrap">
                            {openReporte.diagnostico || diagnostico || '—'}
                          </div>
                        </div>
                        <div className="mt-3">
                          <div className="text-xs font-semibold text-gray-600 mb-1">Plan de reparación</div>
                          <div className="text-sm text-gray-800 whitespace-pre-wrap">
                            {openReporte.planReparacion || planReparacion || '—'}
                          </div>
                        </div>
                      </div>

                      <div className="md-card p-4">
                        <div className="text-sm font-semibold text-gray-900">Registrar avance</div>
                        <div className="mt-2">
                          <textarea
                            className="w-full border p-2.5 rounded-md"
                            rows={3}
                            value={notaProceso}
                            onChange={(e) => setNotaProceso(e.target.value)}
                            placeholder="Ej: Se realizó limpieza interna / se cambió cable / se probaron sensores..."
                          />
                        </div>
                        <button
                          className="md-btn md-btn-outlined w-full mt-3"
                          onClick={addNotaProceso}
                          disabled={addingNota}
                        >
                          {addingNota ? 'Guardando...' : 'Guardar avance'}
                        </button>
                      </div>

                      <div className="md-card p-4">
                        <div className="text-sm font-semibold text-gray-900">Cerrar reporte</div>
                        <div className="text-xs text-gray-500 mt-1">
                          Al cerrar, el reporte queda en estado <b>CERRADO</b> y no se puede modificar.
                        </div>
                        <div className="mt-3">
                          <label className="block text-sm font-medium text-gray-700">Nota de cierre</label>
                          <textarea
                            className="w-full border p-2.5 rounded-md"
                            rows={4}
                            value={cierreNotas}
                            onChange={(e) => setCierreNotas(e.target.value)}
                            placeholder="Ej: Se reemplazó cable / equipo enviado a mantenimiento / prueba funcional OK..."
                          />
                        </div>
                        <button className="md-btn md-btn-filled w-full mt-3" onClick={closeReporte} disabled={closing}>
                          {closing ? 'Cerrando...' : 'Cerrar reporte'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="md-card p-4 text-sm text-gray-600">
                      <div className="font-semibold text-gray-900">Reporte cerrado</div>
                      <div className="text-xs text-gray-500 mt-1">
                        Cerrado por: {openReporte.cerradoPorNombre || '—'} ·{' '}
                        {openReporte.cerradoAt ? new Date(openReporte.cerradoAt).toLocaleDateString() : '—'}
                      </div>
                      {openReporte.cierreNotas ? (
                        <div className="mt-3 whitespace-pre-wrap text-gray-700">{openReporte.cierreNotas}</div>
                      ) : (
                        <div className="mt-3 text-gray-500">Sin nota de cierre.</div>
                      )}
                    </div>
                  )
                ) : openReporte.estado === EstadoReporteEquipo.CERRADO ? (
                  <div className="md-card p-4 text-sm text-gray-600">
                    <div className="font-semibold text-gray-900">Reporte cerrado</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Cerrado por: {openReporte.cerradoPorNombre || '—'} ·{' '}
                      {openReporte.cerradoAt ? new Date(openReporte.cerradoAt).toLocaleDateString() : '—'}
                    </div>
                    {openReporte.cierreNotas ? (
                      <div className="mt-3 whitespace-pre-wrap text-gray-700">{openReporte.cierreNotas}</div>
                    ) : (
                      <div className="mt-3 text-gray-500">Sin nota de cierre.</div>
                    )}
                  </div>
                ) : openReporte.estado === EstadoReporteEquipo.EN_PROCESO ? (
                  <div className="md-card p-4 text-sm text-gray-600">
                    <div className="font-semibold text-gray-900">Reporte en proceso</div>
                    <div className="text-xs text-gray-500 mt-1">
                      El biomédico está trabajando el reporte. Aquí verás la respuesta cuando lo cierre.
                    </div>
                    {openReporte.diagnostico ? (
                      <div className="mt-3 whitespace-pre-wrap text-gray-700">{openReporte.diagnostico}</div>
                    ) : null}
                  </div>
                ) : (
                  <div className="md-card p-4 text-sm text-gray-600">
                    <div className="font-semibold text-gray-900">Reporte en revisión</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Este reporte está <b>ABIERTO</b>. Cuando el biomédico lo avance/cierre, aquí verás la respuesta.
                    </div>
                    <div className="mt-3 text-xs text-gray-500">
                      Evita crear otro reporte para la misma asignación mientras esté abierto.
                    </div>
                  </div>
                )}
              </div>
	            </div>
	          </div>
	        </div>
	      )}
    </Layout>
  );
};

export default Visits;
