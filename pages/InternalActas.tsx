import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import Layout from '../components/Layout';
import SignaturePad from '../components/SignaturePad';
import InternalActaFormat from '../components/InternalActaFormat';
import SignatureImageInput from '../components/SignatureImageInput';
import { useAuth } from '../contexts/AuthContext';
import { firebaseFunctions } from '../services/firebaseFunctions';
import {
  EstadoActaInterna,
  EstadoAsignacion,
  EstadoEquipo,
  RolUsuario,
  type ActaInterna,
  type Asignacion,
  type EquipoBiomedico,
} from '../types';
import { subscribeActasInternas, subscribeAsignaciones, subscribeEquipos } from '../services/firestoreData';

const isoFromDate = (dateStr: string) => {
  const d = new Date(`${dateStr}T12:00:00`);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
};

const todayInput = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const InternalActas: React.FC = () => {
  const { usuario, hasRole } = useAuth();
  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  const [actas, setActas] = useState<ActaInterna[]>([]);
  const [equipos, setEquipos] = useState<EquipoBiomedico[]>([]);
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);

  const isIngeniero = usuario?.rol === RolUsuario.INGENIERO_BIOMEDICO;
  const isAuxiliar = usuario?.rol === RolUsuario.AUXILIAR_ADMINISTRATIVA;

  // Modal: detalle/aceptación
  const [openActa, setOpenActa] = useState<ActaInterna | null>(null);
  const [firmaRecibe, setFirmaRecibe] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  // Modal: creación
  const [createOpen, setCreateOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createFecha, setCreateFecha] = useState<string>(todayInput());
  const [createCiudad, setCreateCiudad] = useState<string>('');
  const [createSede, setCreateSede] = useState<string>('');
  const [createArea] = useState<string>('Biomedica');
  const [createCargoRecibe] = useState<string>('Auxiliar Administrativa');
  const [createRecibeUid, setCreateRecibeUid] = useState<string>('');
  const [createRecibeEmail, setCreateRecibeEmail] = useState<string>('');
  const [createObs, setCreateObs] = useState<string>('');
  const [createEquipoQuery, setCreateEquipoQuery] = useState<string>('');
  const [createSelectedEquipoIds, setCreateSelectedEquipoIds] = useState<string[]>([]);
  const [firmaEntrega, setFirmaEntrega] = useState<string | null>(null);
  const [auxiliares, setAuxiliares] = useState<Array<{ uid: string; nombre: string; email: string }>>([]);
  const [auxLoading, setAuxLoading] = useState(false);
  const [auxLoadError, setAuxLoadError] = useState<string | null>(null);

  // Preview/print
  const actaViewportRef = useRef<HTMLDivElement>(null);
  const actaMeasureRef = useRef<HTMLDivElement>(null);
  const [actaPreviewScale, setActaPreviewScale] = useState(1);

  useEffect(() => {
    setFirestoreError(null);
    const unsubActas = subscribeActasInternas(setActas, (e) => {
      console.error('Firestore subscribeActasInternas error:', e);
      setFirestoreError(`No tienes permisos para leer "actas_internas" en Firestore. Detalle: ${e.message}`);
    });
    const unsubEquipos = subscribeEquipos(setEquipos, () => {});
    const unsubAsignaciones = subscribeAsignaciones(setAsignaciones, () => {});
    return () => {
      unsubActas();
      unsubEquipos();
      unsubAsignaciones();
    };
  }, []);

  // Cargar auxiliares solo cuando abrimos el modal de creación (y solo para biomédico/admin).
  useEffect(() => {
    if (!createOpen) return;
    if (!hasRole([RolUsuario.INGENIERO_BIOMEDICO])) return;

    setAuxLoadError(null);
    setAuxLoading(true);
    const run = async () => {
      try {
        const fn = httpsCallable(firebaseFunctions, 'listAuxiliares');
        const res = await fn({});
        const data = res.data as { users?: Array<{ uid?: unknown; nombre?: unknown; email?: unknown }> };
        const users = Array.isArray(data.users) ? data.users : [];
        const parsed = users
          .map((u) => ({
            uid: typeof u.uid === 'string' ? u.uid : '',
            nombre: typeof u.nombre === 'string' ? u.nombre : '',
            email: typeof u.email === 'string' ? u.email : '',
          }))
          .filter((u) => u.uid && u.nombre);
        setAuxiliares(parsed);

        // Auto-seleccionar el primer auxiliar si aún no hay selección.
        if (!createRecibeUid && parsed.length > 0) {
          setCreateRecibeUid(parsed[0].uid);
          setCreateRecibeEmail(parsed[0].email || '');
        }
      } catch (e: any) {
        console.error('listAuxiliares error:', e);
        setAuxLoadError(e?.message || 'No se pudieron cargar los auxiliares.');
      } finally {
        setAuxLoading(false);
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createOpen]);

  const selectedAux = useMemo(() => {
    if (!createRecibeUid) return null;
    return auxiliares.find((a) => a.uid === createRecibeUid) || null;
  }, [auxiliares, createRecibeUid]);

  const actasVisibles = useMemo(() => {
    if (!usuario?.id) return [];
    if (usuario.rol === RolUsuario.INGENIERO_BIOMEDICO) {
      return actas.filter((a) => a.entregaUid === usuario.id);
    }
    if (usuario.rol === RolUsuario.AUXILIAR_ADMINISTRATIVA) {
      return actas.filter((a) => a.recibeUid === usuario.id);
    }
    return actas;
  }, [actas, usuario?.id, usuario?.rol]);

  const equiposById = useMemo(() => new Map(equipos.map((e) => [e.id, e])), [equipos]);
  const activeAsignacionByEquipo = useMemo(() => {
    const map = new Map<string, Asignacion>();
    for (const a of asignaciones) {
      if (a.estado === EstadoAsignacion.ACTIVA) map.set(a.idEquipo, a);
    }
    return map;
  }, [asignaciones]);

  const equiposTransferibles = useMemo(() => {
    // Solo equipos no asignados a paciente (DISPONIBLE efectivo) y no en acta interna pendiente.
    return equipos.filter((e) => {
      if (activeAsignacionByEquipo.has(e.id)) return false;
      const effective = e.estado;
      if (effective !== EstadoEquipo.DISPONIBLE) return false;
      if (e.actaInternaPendienteId) return false;
      // Si hay custodio, solo el ingeniero custodio arma el acta (cuando aplique).
      if (isIngeniero && e.custodioUid && e.custodioUid !== usuario?.id) return false;
      return true;
    });
  }, [equipos, activeAsignacionByEquipo, isIngeniero, usuario?.id]);

  const equiposFiltrados = useMemo(() => {
    const q = createEquipoQuery.trim().toLowerCase();
    if (!q) return [];
    const selected = new Set(createSelectedEquipoIds);
    return equiposTransferibles
      .filter((e) => !selected.has(e.id))
      .filter((e) => {
        return (
          (e.codigoInventario || '').toLowerCase().includes(q) ||
          (e.numeroSerie || '').toLowerCase().includes(q) ||
          (e.nombre || '').toLowerCase().includes(q) ||
          (e.marca || '').toLowerCase().includes(q) ||
          (e.modelo || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 25);
  }, [createEquipoQuery, createSelectedEquipoIds, equiposTransferibles]);

  const openActaDraft: ActaInterna | null = useMemo(() => {
    if (!createOpen) return null;
    const items = createSelectedEquipoIds
      .map((idEquipo) => {
        const e = equiposById.get(idEquipo);
        if (!e) return null;
        return {
          idEquipo,
          codigoInventario: e.codigoInventario,
          numeroSerie: e.numeroSerie,
          nombre: e.nombre,
          marca: e.marca,
          modelo: e.modelo,
          estado: e.estado,
        };
      })
      .filter(Boolean) as any;

    return {
      id: 'draft',
      consecutivo: 0,
      fecha: isoFromDate(createFecha),
      ciudad: createCiudad,
      sede: createSede,
      area: createArea,
      cargoRecibe: createCargoRecibe,
      observaciones: createObs,
      entregaUid: usuario?.id || '',
      entregaNombre: usuario?.nombre || 'INGENIERO_BIOMEDICO',
      recibeUid: createRecibeUid,
      recibeNombre: selectedAux?.nombre || 'AUXILIAR ADMINISTRATIVA',
      recibeEmail: createRecibeEmail || selectedAux?.email || undefined,
      estado: EstadoActaInterna.ENVIADA,
      items,
      firmaEntrega: firmaEntrega || undefined,
      firmaRecibe: undefined,
    };
  }, [
    createOpen,
    createFecha,
    createCiudad,
    createSede,
    createArea,
    createObs,
    createRecibeEmail,
    createRecibeUid,
    createSelectedEquipoIds,
    equiposById,
    firmaEntrega,
    usuario?.id,
    usuario?.nombre,
    selectedAux?.email,
    selectedAux?.nombre,
  ]);

  // Auto-escalado en la vista previa (sin recortes)
  useLayoutEffect(() => {
    const actaData = openActa || openActaDraft;
    if (!actaData) return;

    const viewport = actaViewportRef.current;
    const measure = actaMeasureRef.current;
    if (!viewport || !measure) return;

    const computeScale = () => {
      const container = document.getElementById('internal-acta-print-container');
      const rect = (container || viewport).getBoundingClientRect();

      // Margen de seguridad para evitar overflow por redondeos, bordes y zoom del navegador.
      const safe = 12;
      const availableW = Math.max(0, rect.width - safe);
      const availableH = Math.max(0, rect.height - safe);

      const pageEl = measure.querySelector('.acta-page') as HTMLElement | null;
      const pageW = pageEl?.offsetWidth || measure.offsetWidth;
      const pageH = pageEl?.offsetHeight || measure.offsetHeight;
      if (!availableW || !availableH || !pageW || !pageH) return;

      const scale = Math.min(availableW / pageW, availableH / pageH, 1);
      setActaPreviewScale(Number(scale.toFixed(4)));

      // Asegura que la vista previa quede arriba (evita quedarse "a la mitad" si había scroll previo).
      if (container && 'scrollTop' in container) {
        (container as HTMLElement).scrollTop = 0;
        (container as HTMLElement).scrollLeft = 0;
      }
    };

    computeScale();
    const ro = new ResizeObserver(() => computeScale());
    ro.observe(viewport);
    ro.observe(measure);

    const vv = window.visualViewport;
    if (vv) vv.addEventListener('resize', computeScale);

    return () => {
      ro.disconnect();
      if (vv) vv.removeEventListener('resize', computeScale);
    };
  }, [openActa, openActaDraft]);

  const closeDetails = () => {
    setOpenActa(null);
    setFirmaRecibe(null);
    setActaPreviewScale(1);
  };

  const handlePrint = () => {
    const actaEl = document.querySelector('#internal-acta-print-container .acta-page') as HTMLElement | null;
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

  const resetCreate = () => {
    setCreateFecha(todayInput());
    setCreateCiudad('');
    setCreateSede('');
    setCreateRecibeUid('');
    setCreateRecibeEmail('');
    setCreateObs('');
    setCreateEquipoQuery('');
    setCreateSelectedEquipoIds([]);
    setFirmaEntrega(null);
  };

  const handleCreate = async () => {
    if (!isIngeniero) return;
    if (!createRecibeUid) {
      alert('Selecciona el Auxiliar Administrativa (receptor).');
      return;
    }
    if (createSelectedEquipoIds.length === 0) {
      alert('Selecciona al menos 1 equipo para el acta.');
      return;
    }
    if (!firmaEntrega) {
      alert('La firma del biomédico es obligatoria para enviar el acta.');
      return;
    }

    setCreateSaving(true);
    try {
      const fn = httpsCallable(firebaseFunctions, 'createInternalActa');
      const res = await fn({
        recibeUid: createRecibeUid,
        // Email solo para notificación/auditoría (NO se imprime en el acta).
        recibeEmail: createRecibeEmail.trim() || selectedAux?.email || undefined,
        ciudad: createCiudad.trim(),
        sede: createSede.trim(),
        area: createArea.trim(),
        cargoRecibe: createCargoRecibe.trim(),
        observaciones: createObs,
        fechaIso: isoFromDate(createFecha),
        equipoIds: createSelectedEquipoIds,
        firmaEntrega,
      });
      const data = res.data as any;
      alert(`Acta interna enviada.\n\nActa No. ${data?.consecutivo ?? ''}`);
      setCreateOpen(false);
      resetCreate();
    } catch (err: any) {
      console.error('Error createInternalActa:', err);
      alert(`${err?.code ? `${err.code}: ` : ''}${err?.message || 'No se pudo crear el acta.'}`);
    } finally {
      setCreateSaving(false);
    }
  };

  const handleAccept = async () => {
    if (!isAuxiliar) return;
    if (!openActa) return;
    if (openActa.estado !== EstadoActaInterna.ENVIADA) return;
    if (!firmaRecibe) {
      alert('Debes firmar para aceptar el acta.');
      return;
    }

    setAccepting(true);
    try {
      const fn = httpsCallable(firebaseFunctions, 'acceptInternalActa');
      await fn({ actaId: openActa.id, firmaRecibe });
      alert('Acta aceptada. Los equipos ya están disponibles para entrega a pacientes.');
      closeDetails();
    } catch (err: any) {
      console.error('Error acceptInternalActa:', err);
      alert(`${err?.code ? `${err.code}: ` : ''}${err?.message || 'No se pudo aceptar el acta.'}`);
    } finally {
      setAccepting(false);
    }
  };

  return (
    <Layout title="Actas Internas">
      {firestoreError && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded p-3 text-sm">
          {firestoreError}
        </div>
      )}

      <div className="mb-6 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Entrega biomédico → auxiliar</h3>
          <p className="text-sm text-gray-500">
            Los equipos nuevos no quedan disponibles para pacientes hasta que el Auxiliar acepte (firma) el acta.
          </p>
        </div>
        {hasRole([RolUsuario.INGENIERO_BIOMEDICO]) && (
          <button onClick={() => setCreateOpen(true)} className="md-btn md-btn-filled w-full md:w-auto">
            + Nueva Acta
          </button>
        )}
      </div>

      <div className="md-card p-4 overflow-auto">
        <table className="w-full text-sm min-w-[780px]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b">
              <th className="py-3 px-2">Acta</th>
              <th className="py-3 px-2">Fecha</th>
              <th className="py-3 px-2">Entrega</th>
              <th className="py-3 px-2">Recibe</th>
              <th className="py-3 px-2">Equipos</th>
              <th className="py-3 px-2">Estado</th>
              <th className="py-3 px-2">Acción</th>
            </tr>
          </thead>
          <tbody>
            {actasVisibles.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-gray-500">
                  No hay actas internas registradas.
                </td>
              </tr>
            ) : (
              actasVisibles.map((a) => (
                <tr key={a.id} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="py-3 px-2 font-mono">{String(a.consecutivo).padStart(3, '0')}</td>
                  <td className="py-3 px-2">{new Date(a.fecha).toLocaleDateString()}</td>
                  <td className="py-3 px-2">{a.entregaNombre}</td>
                  <td className="py-3 px-2">{a.recibeNombre}</td>
                  <td className="py-3 px-2">{a.items?.length || 0}</td>
                  <td className="py-3 px-2">
                    <span
                      className={`text-[10px] uppercase px-2 py-1 rounded-full border ${
                        a.estado === EstadoActaInterna.ACEPTADA
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-amber-200 bg-amber-50 text-amber-800'
                      }`}
                    >
                      {a.estado}
                    </span>
                  </td>
                  <td className="py-3 px-2">
                    <button
                      onClick={() => {
                        setOpenActa(a);
                        setFirmaRecibe(a.firmaRecibe || null);
                      }}
                      className="md-btn md-btn-outlined"
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Crear */}
      {createOpen && openActaDraft && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-gray-900">Nueva acta interna</div>
                <div className="text-xs text-gray-500">Completa los datos, selecciona equipos y firma.</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setCreateOpen(false); resetCreate(); }} className="md-btn md-btn-outlined">
                  Cerrar
                </button>
                <button onClick={handleCreate} disabled={createSaving} className="md-btn md-btn-filled">
                  {createSaving ? 'Enviando...' : 'Enviar acta'}
                </button>
              </div>
            </div>

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-[360px_1fr] overflow-hidden">
              {/* Panel izquierdo */}
              <div className="border-r p-4 overflow-auto">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Auxiliar Administrativa (receptor)</label>
                    <select
                      className="w-full border p-2.5 rounded-md bg-white"
                      value={createRecibeUid}
                      onChange={(e) => {
                        const uid = e.target.value;
                        setCreateRecibeUid(uid);
                        const found = auxiliares.find((a) => a.uid === uid);
                        if (found?.email) setCreateRecibeEmail(found.email);
                      }}
                      disabled={auxLoading}
                    >
                      {auxLoading ? (
                        <option value="">Cargando auxiliares...</option>
                      ) : auxiliares.length === 0 ? (
                        <option value="">No hay auxiliares con rol AUXILIAR_ADMINISTRATIVA</option>
                      ) : (
                        auxiliares.map((a) => (
                          <option key={a.uid} value={a.uid}>
                            {a.nombre}
                          </option>
                        ))
                      )}
                    </select>
                    {auxLoadError ? (
                      <p className="text-xs text-red-600 mt-1">{auxLoadError}</p>
                    ) : (
                      <p className="text-xs text-gray-500 mt-1">
                        Se listan usuarios con rol <code>AUXILIAR_ADMINISTRATIVA</code> desde Firestore.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Email (solo notificación)</label>
                    <input
                      className="w-full border p-2.5 rounded-md"
                      placeholder="auxiliar@dominio.com"
                      value={createRecibeEmail}
                      onChange={(e) => setCreateRecibeEmail(e.target.value)}
                    />
                    <p className="text-xs text-gray-500 mt-1">Este correo no se imprime en el acta.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Fecha</label>
                      <input type="date" className="w-full border p-2.5 rounded-md" value={createFecha} onChange={(e) => setCreateFecha(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Area</label>
                      <input className="w-full border p-2.5 rounded-md bg-gray-50" value={createArea} disabled />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Ciudad</label>
                      <input className="w-full border p-2.5 rounded-md" value={createCiudad} onChange={(e) => setCreateCiudad(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Sede</label>
                      <input className="w-full border p-2.5 rounded-md" value={createSede} onChange={(e) => setCreateSede(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Cargo (quien recibe)</label>
                    <input className="w-full border p-2.5 rounded-md bg-gray-50" value={createCargoRecibe} disabled />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Equipos</label>
                    <div className="md-search">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="7" />
                        <path d="M21 21l-4.3-4.3" />
                      </svg>
                      <input
                        type="text"
                        placeholder="Buscar por MBG, serie, nombre..."
                        value={createEquipoQuery}
                        onChange={(e) => setCreateEquipoQuery(e.target.value)}
                      />
                    </div>
                    {createEquipoQuery.trim() && (
                      <div className="mt-2 border rounded-lg overflow-hidden">
                        {equiposFiltrados.length === 0 ? (
                          <div className="p-3 text-sm text-gray-500">Sin resultados.</div>
                        ) : (
                          <div className="max-h-56 overflow-auto">
                            {equiposFiltrados.map((e) => (
                              <button
                                key={e.id}
                                type="button"
                                onClick={() => {
                                  setCreateSelectedEquipoIds((prev) => [...prev, e.id]);
                                  setCreateEquipoQuery('');
                                }}
                                className="w-full text-left p-3 hover:bg-gray-50 border-b last:border-b-0"
                              >
                                <div className="text-xs font-mono text-gray-500">{e.codigoInventario} · {e.numeroSerie}</div>
                                <div className="text-sm font-semibold text-gray-900">{e.nombre}</div>
                                <div className="text-xs text-gray-600">{e.marca} · {e.modelo}</div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {createSelectedEquipoIds.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {createSelectedEquipoIds.map((id) => {
                          const e = equiposById.get(id);
                          if (!e) return null;
                          return (
                            <div key={id} className="flex items-center justify-between border rounded-lg p-2">
                              <div>
                                <div className="text-xs font-mono text-gray-500">{e.codigoInventario}</div>
                                <div className="text-sm font-semibold">{e.nombre}</div>
                              </div>
                              <button
                                type="button"
                                className="text-xs text-red-600 hover:underline"
                                onClick={() => setCreateSelectedEquipoIds((prev) => prev.filter((x) => x !== id))}
                              >
                                Quitar
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Observaciones</label>
                    <textarea className="w-full border p-2.5 rounded-md" rows={3} value={createObs} onChange={(e) => setCreateObs(e.target.value)} />
                  </div>

                  <div>
                    <SignatureImageInput
                      value={firmaEntrega}
                      onChange={setFirmaEntrega}
                      required
                      label="Firma Biomédico"
                      helperText="Sube una imagen PNG o JPG/JPEG con tu firma."
                    />
                  </div>
                </div>
              </div>

              {/* Vista previa */}
              <div className="bg-gray-100 p-4 overflow-hidden" ref={actaViewportRef}>
                <div
                  id="internal-acta-print-container"
                  className="w-full h-full flex items-start justify-center overflow-hidden"
                >
                  <div style={{ transform: `scale(${actaPreviewScale})`, transformOrigin: 'top center' }}>
                    <div ref={actaMeasureRef}>
                      <InternalActaFormat acta={openActaDraft} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detalle / Aceptación */}
      {openActa && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-gray-900">
                  Acta interna #{String(openActa.consecutivo).padStart(3, '0')}
                </div>
                <div className="text-xs text-gray-500">
                  Estado: {openActa.estado} · Equipos: {openActa.items?.length || 0}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={closeDetails} className="md-btn md-btn-outlined">
                  Cerrar
                </button>
                <button onClick={handlePrint} className="md-btn md-btn-filled">
                  Imprimir / Guardar PDF
                </button>
              </div>
            </div>

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-[360px_1fr] overflow-hidden">
              {/* Panel izquierdo */}
              <div className="border-r p-4 overflow-auto">
                <div className="space-y-4">
                  <div className="md-card p-4">
                    <div className="text-sm font-semibold text-gray-900 mb-1">Resumen</div>
                    <div className="text-sm text-gray-600">
                      <div><span className="font-medium">Entrega:</span> {openActa.entregaNombre}</div>
                      <div><span className="font-medium">Recibe:</span> {openActa.recibeNombre}</div>
                      <div><span className="font-medium">Ciudad:</span> {openActa.ciudad}</div>
                      <div><span className="font-medium">Sede:</span> {openActa.sede}</div>
                      <div><span className="font-medium">Área:</span> {openActa.area}</div>
                    </div>
                  </div>

                  {isAuxiliar && openActa.estado === EstadoActaInterna.ENVIADA && (
                    <div className="md-card p-4">
                      <div className="text-sm font-semibold text-gray-900">Firma Auxiliar (aceptación)</div>
                      <p className="text-xs text-gray-500 mt-1">
                        La aceptación es total: al firmar, todos los equipos quedarán habilitados para entrega a pacientes.
                      </p>
                      <div className="mt-3">
                        <SignaturePad onEnd={setFirmaRecibe} />
                      </div>
                      <button
                        onClick={handleAccept}
                        disabled={accepting}
                        className="md-btn md-btn-filled w-full mt-3"
                      >
                        {accepting ? 'Aceptando...' : 'Aceptar acta y habilitar equipos'}
                      </button>
                    </div>
                  )}

                  {openActa.estado === EstadoActaInterna.ACEPTADA && (
                    <div className="text-xs text-gray-500">
                      Esta acta ya fue aceptada. Por control, la firma no se puede modificar.
                    </div>
                  )}
                </div>
              </div>

              {/* Vista previa */}
              <div className="bg-gray-100 p-4 overflow-hidden" ref={actaViewportRef}>
                <div
                  id="internal-acta-print-container"
                  className="w-full h-full flex items-start justify-center overflow-hidden"
                >
                  <div style={{ transform: `scale(${actaPreviewScale})`, transformOrigin: 'top center' }}>
                    <div ref={actaMeasureRef}>
                      <InternalActaFormat acta={openActa} />
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
};

export default InternalActas;
