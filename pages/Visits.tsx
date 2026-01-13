import React, { useEffect, useMemo, useState } from 'react';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { collection, doc, getDocs, limit, query, where } from 'firebase/firestore';
import Layout from '../components/Layout';
import { toast } from '../services/feedback';
import SignaturePad from '../components/SignaturePad';
import { useAuth } from '../contexts/AuthContext';
import { db, storage } from '../services/firebase';
import {
  cerrarReporteEquipo,
  createReporteEquipo,
  guardarFirmaEntregaVisitador,
  marcarReporteVistoPorVisitador,
  subscribeAsignacionesActivas,
  subscribeEquiposAsignadosActivos,
  subscribePacientesConAsignacionActiva,
  subscribeReportesEquipos,
  subscribeReportesEquiposByUser,
} from '../services/firestoreData';
import {
  EstadoAsignacion,
  EstadoReporteEquipo,
  RolUsuario,
  type Asignacion,
  type EquipoBiomedico,
  type Paciente,
  type ReporteEquipo,
  type ReporteFoto,
} from '../types';

const MAX_FOTOS = 5;
const MAX_MB = 5;
const MAX_BYTES = MAX_MB * 1024 * 1024;

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
      return () => {
        unsubPacientes();
        unsubEquipos();
        unsubAsignaciones();
        unsubReportes();
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

  const [search, setSearch] = useState('');
  const filteredAsignaciones = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return asignacionesActivasEnriquecidas;
    return asignacionesActivasEnriquecidas.filter(({ paciente, equipo }) => {
      const p = paciente!;
      const e = equipo!;
      return (
        p.nombreCompleto.toLowerCase().includes(q) ||
        p.numeroDocumento.includes(q) ||
        e.codigoInventario.toLowerCase().includes(q) ||
        e.numeroSerie.toLowerCase().includes(q) ||
        e.nombre.toLowerCase().includes(q)
      );
    });
  }, [asignacionesActivasEnriquecidas, search]);

  // Tabs y detalle de reportes (VISITADOR y BIOMEDICO)
  const [tab, setTab] = useState<'ABIERTO' | 'CERRADO'>('ABIERTO');
  const reportesFiltrados = useMemo(() => {
    const wanted = tab === 'ABIERTO' ? EstadoReporteEquipo.ABIERTO : EstadoReporteEquipo.CERRADO;
    return reportes
      .filter((r) => r.estado === wanted)
      .sort((a, b) => new Date(b.fechaVisita).getTime() - new Date(a.fechaVisita).getTime());
  }, [reportes, tab]);

  const [openReporte, setOpenReporte] = useState<ReporteEquipo | null>(null);
  const [fotoUrls, setFotoUrls] = useState<Record<string, string>>({});
  const [cierreNotas, setCierreNotas] = useState('');
  const [closing, setClosing] = useState(false);

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

  const previews = useMemo(() => files.map((f) => ({ file: f, url: URL.createObjectURL(f) })), [files]);
  useEffect(() => {
    return () => {
      for (const p of previews) URL.revokeObjectURL(p.url);
    };
  }, [previews]);

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

    setSavingFirma(true);
    try {
      await guardarFirmaEntregaVisitador({
        idAsignacion: openFirma.asignacion.id,
        dataUrl: firmaEntrega,
        capturadoPorUid: usuario.id,
        capturadoPorNombre: usuario.nombre,
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
    const r = reportes.find((x) => x.idAsignacion === idAsignacion && x.estado === EstadoReporteEquipo.ABIERTO);
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
      (r) => r.idAsignacion === openCreate.asignacion.id && r.estado === EstadoReporteEquipo.ABIERTO,
    );
    if (alreadyOpenLocal) {
      toast({
        tone: 'warning',
        title: 'Reporte duplicado',
        message: 'Ya existe un reporte ABIERTO para esta asignacion. Revisa el detalle del reporte para ver el estado y evitar duplicados.',
      });
      setOpenReporte(alreadyOpenLocal);
      resetCreate();
      return;
    }
    try {
      const q = query(
        collection(db, 'reportes_equipos'),
        where('idAsignacion', '==', openCreate.asignacion.id),
        where('estado', '==', EstadoReporteEquipo.ABIERTO),
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
          message: 'Ya existe un reporte ABIERTO para esta asignacion. Revisa el detalle del reporte para ver el estado y evitar duplicados.',
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

  const closeReporte = async () => {
    if (!usuario) return;
    if (!openReporte) return;
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
    <Layout title={isVisitador ? 'Visitas domiciliarias' : 'Reportes de visita'}>
      {firestoreError && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded p-3 text-sm">
          {firestoreError}
        </div>
      )}

      {isVisitador && (
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
                {asignacionesActivasEnriquecidas.filter(({ a }) => !a.firmaPacienteEntrega).length}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
              {asignacionesActivasEnriquecidas.filter(({ a }) => !a.firmaPacienteEntrega).length === 0 ? (
                <div className="text-sm text-gray-500">No hay firmas pendientes.</div>
              ) : (
                asignacionesActivasEnriquecidas
                  .filter(({ a }) => !a.firmaPacienteEntrega)
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

          {/* Resumen/historial del visitador */}
          <div className="md-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-gray-900">Mis reportes</div>
                <div className="text-xs text-gray-500">
                  Abiertos: {reportes.filter((r) => r.estado === EstadoReporteEquipo.ABIERTO).length} · Cerrados:{' '}
                  {reportes.filter((r) => r.estado === EstadoReporteEquipo.CERRADO).length}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className={`md-btn ${tab === 'ABIERTO' ? 'md-btn-filled' : 'md-btn-outlined'}`}
                  onClick={() => setTab('ABIERTO')}
                  type="button"
                >
                  Abiertos
                </button>
                <button
                  className={`md-btn ${tab === 'CERRADO' ? 'md-btn-filled' : 'md-btn-outlined'}`}
                  onClick={() => setTab('CERRADO')}
                  type="button"
                >
                  Cerrados
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {reportesFiltrados.length === 0 ? (
                <div className="text-sm text-gray-500">Sin reportes {tab === 'ABIERTO' ? 'abiertos' : 'cerrados'}.</div>
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

          <div className="md-search max-w-xl">
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

          {filteredAsignaciones.length === 0 ? (
            <div className="md-card p-6 text-sm text-gray-600">
              No hay asignaciones activas visibles para tu usuario.
              <div className="text-xs text-gray-500 mt-2">
                Si ya existen asignaciones en el sistema, pide al administrador que ejecute la función de “recalcular flags VISITADOR”.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredAsignaciones.map(({ a, paciente, equipo }) => (
                <div key={a.id} className="md-card p-4">
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
	                    >
                      Reportar
                    </button>
                  </div>
                </div>
              ))}
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
              className={`md-btn ${tab === 'ABIERTO' ? 'md-btn-filled' : 'md-btn-outlined'}`}
              onClick={() => setTab('ABIERTO')}
            >
              Abiertos
            </button>
            <button
              className={`md-btn ${tab === 'CERRADO' ? 'md-btn-filled' : 'md-btn-outlined'}`}
              onClick={() => setTab('CERRADO')}
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
                      No hay reportes {tab.toLowerCase()}.
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
              </div>

              <div className="space-y-4">
	                {openReporte.estado === EstadoReporteEquipo.ABIERTO ? (
	                  isBiomedico ? (
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
	                          placeholder="Ej: Se reemplazó cable / equipo enviado a mantenimiento / se realizó prueba funcional..."
	                        />
	                      </div>
	                      <button className="md-btn md-btn-filled w-full mt-3" onClick={closeReporte} disabled={closing}>
	                        {closing ? 'Cerrando...' : 'Cerrar reporte'}
	                      </button>
	                    </div>
	                  ) : (
	                    <div className="md-card p-4 text-sm text-gray-600">
	                      <div className="font-semibold text-gray-900">Reporte en revisión</div>
	                      <div className="text-xs text-gray-500 mt-1">
	                        Este reporte está <b>ABIERTO</b>. Cuando el biomédico lo cierre, aquí verás la respuesta.
	                      </div>
	                      <div className="mt-3 text-xs text-gray-500">
	                        Evita crear otro reporte para la misma asignación mientras esté abierto.
	                      </div>
	                    </div>
	                  )
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
