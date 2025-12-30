import React, { useEffect, useMemo, useState } from 'react';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { collection, doc } from 'firebase/firestore';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { db, storage } from '../services/firebase';
import {
  cerrarReporteEquipo,
  createReporteEquipo,
  subscribeAsignacionesActivas,
  subscribeEquiposAsignadosActivos,
  subscribePacientesConAsignacionActiva,
  subscribeReportesEquipos,
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
      return () => {
        unsubPacientes();
        unsubEquipos();
        unsubAsignaciones();
      };
    }

    if (isBiomedico) {
      const unsubReportes = subscribeReportesEquipos(setReportes, (e) => {
        console.error('subscribeReportesEquipos error:', e);
        setFirestoreError(`No tienes permisos para leer reportes. Detalle: ${e.message}`);
      });
      return () => unsubReportes();
    }
  }, [isVisitador, isBiomedico]);

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
        alert(`Archivo no soportado: ${f.name}. Usa PNG o JPG/JPEG.`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        alert(`"${f.name}" supera ${MAX_MB}MB. Reduce el tamaño y vuelve a intentar.`);
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

  const submitReporte = async () => {
    if (!usuario) return;
    if (!openCreate) return;
    if (!descripcion.trim()) {
      alert('Escribe una descripción del hallazgo/falla.');
      return;
    }
    if (files.length === 0) {
      alert('Debes adjuntar al menos 1 foto.');
      return;
    }
    if (files.length > MAX_FOTOS) {
      alert(`Máximo ${MAX_FOTOS} fotos por reporte.`);
      return;
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
      alert('Reporte creado correctamente. Se notificará al biomédico por email (si está configurado).');
      resetCreate();
    } catch (e: any) {
      console.error('submitReporte error:', e);
      alert(`${e?.code ? `${e.code}: ` : ''}${e?.message || 'No se pudo crear el reporte.'}`);
      setCreating(false);
    }
  };

  // BIOMEDICO: ver/cerrar reportes
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

  useEffect(() => {
    let canceled = false;
    const loadUrls = async () => {
      setFotoUrls({});
      const r = openReporte;
      if (!r) return;
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
      alert('Agrega una nota de cierre (qué se encontró/qué se hizo).');
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
      alert('Reporte cerrado correctamente.');
      setOpenReporte(null);
      setCierreNotas('');
    } catch (e: any) {
      console.error('closeReporte error:', e);
      alert(`${e?.code ? `${e.code}: ` : ''}${e?.message || 'No se pudo cerrar el reporte.'}`);
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
                    Este reporte ya está cerrado.
                    {openReporte.cierreNotas ? (
                      <div className="mt-2 whitespace-pre-wrap text-gray-700">{openReporte.cierreNotas}</div>
                    ) : null}
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
