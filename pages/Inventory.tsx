import React, { useMemo, useState, useEffect, useRef } from 'react';
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import Layout from '../components/Layout';
import { confirmDialog, toast } from '../services/feedback';
import {
  EquipoBiomedico,
  EstadoAsignacion,
  EstadoEquipo,
  HojaVidaFijos,
  HojaVidaDatosEquipo,
  RolUsuario,
  TipoPropiedad,
  TipoEquipo,
  type Asignacion,
  type AsignacionProfesional,
  type Paciente,
  type Profesional,
  type ReporteEquipo,
  type SolicitudEquipoPaciente,
} from '../types';
import { useAuth } from '../contexts/AuthContext';
import StatusBadge from '../components/StatusBadge';
import SignatureImageInput from '../components/SignatureImageInput';
import HojaVidaFormat from '../components/HojaVidaFormat';
import { firebaseFunctions } from '../services/firebaseFunctions';
import { storage } from '../services/firebase';
import {
  saveEquipo,
  isNumeroSerieDisponible,
  deleteEquipo,
  updateEquipoFoto,
  clearEquipoFoto,
  subscribeAsignaciones,
  subscribeAsignacionesProfesionales,
  subscribeEquipos,
  subscribePacientes,
  subscribeTiposEquipo,
  saveTipoEquipo,
  deleteTipoEquipo,
  subscribeProfesionales,
  subscribeReportesEquipos,
  subscribeSolicitudesEquiposPacientePendientes,
} from '../services/firestoreData';

const Inventory: React.FC = () => {
  const { hasRole, usuario } = useAuth();
  const [equipos, setEquipos] = useState<EquipoBiomedico[]>([]);
  const [tiposEquipo, setTiposEquipo] = useState<TipoEquipo[]>([]);
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [asignacionesProfesionales, setAsignacionesProfesionales] = useState<AsignacionProfesional[]>([]);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const [solicitudesPendientes, setSolicitudesPendientes] = useState<SolicitudEquipoPaciente[]>([]);
  const [reportesEquipos, setReportesEquipos] = useState<ReporteEquipo[]>([]);
  const [openSolicitud, setOpenSolicitud] = useState<SolicitudEquipoPaciente | null>(null);
  const [solicitudFotoUrls, setSolicitudFotoUrls] = useState<Record<string, string>>({});
  const [solicitudContext, setSolicitudContext] = useState<SolicitudEquipoPaciente | null>(null);
  const [equipoFotoFile, setEquipoFotoFile] = useState<File | null>(null);
  const [equipoFotoPreview, setEquipoFotoPreview] = useState<string | null>(null);
  const [removeEquipoFoto, setRemoveEquipoFoto] = useState(false);
  const [historyFotoDataUrl, setHistoryFotoDataUrl] = useState<string | null>(null);
  
  // Search State
  const [searchTerm, setSearchTerm] = useState('');

  // Import State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hojaVidaPrintRef = useRef<HTMLDivElement>(null);

  // Modal Edit/Create State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<EquipoBiomedico>>({
    tipoPropiedad: TipoPropiedad.MEDICUC,
    fechaIngreso: new Date().toISOString(),
    disponibleParaEntrega: false,
    hojaVidaDatos: {
      empresa: 'MEDICUC IPS',
      sede: 'BUCARAMANGA',
    },
  });
  const [autoActaFirma, setAutoActaFirma] = useState<string | null>(null);
  const [serialError, setSerialError] = useState<string | null>(null);
  const [serialChecking, setSerialChecking] = useState(false);
  const [isTiposOpen, setIsTiposOpen] = useState(false);
  const [tipoForm, setTipoForm] = useState<TipoEquipo>({
    id: '',
    nombre: '',
    fijos: {},
    trabajoRealizadoDefault: '',
  });
  const [tipoSaving, setTipoSaving] = useState(false);

  // Modal History State
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyEquipo, setHistoryEquipo] = useState<{
    equipo: EquipoBiomedico;
    data: any[];
    reportes: any[];
  } | null>(null);

  // Stats para contadores
  const [assignmentCounts, setAssignmentCounts] = useState<{[key: string]: number}>({});
  const canEdit = hasRole([RolUsuario.INGENIERO_BIOMEDICO]);
  const canReadReportes = hasRole([RolUsuario.INGENIERO_BIOMEDICO, RolUsuario.GERENCIA]);
  const EMPRESA_DEFAULT = 'MEDICUC IPS';
  const SEDE_DEFAULT = 'BUCARAMANGA';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('biocontrol_biomedico_sig');
    if (saved) setAutoActaFirma(saved);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (autoActaFirma) {
      localStorage.setItem('biocontrol_biomedico_sig', autoActaFirma);
    } else {
      localStorage.removeItem('biocontrol_biomedico_sig');
    }
  }, [autoActaFirma]);

  useEffect(() => {
    if (!equipoFotoFile) {
      setEquipoFotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(equipoFotoFile);
    setEquipoFotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [equipoFotoFile]);

  useEffect(() => {
    const url = historyEquipo?.equipo?.fotoEquipo?.url;
    if (!url) {
      setHistoryFotoDataUrl(null);
      return;
    }
    let alive = true;
    const load = async () => {
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('No se pudo cargar la imagen');
        const blob = await resp.blob();
        const reader = new FileReader();
        reader.onload = () => {
          if (!alive) return;
          setHistoryFotoDataUrl(typeof reader.result === 'string' ? reader.result : null);
        };
        reader.onerror = () => {
          if (!alive) return;
          setHistoryFotoDataUrl(null);
        };
        reader.readAsDataURL(blob);
      } catch (err) {
        console.warn('No se pudo convertir la imagen a data URL:', err);
        if (alive) setHistoryFotoDataUrl(null);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, [historyEquipo?.equipo?.fotoEquipo?.url]);

  const normalizeTipoPropiedad = (tipo?: TipoPropiedad) => {
    if (tipo === TipoPropiedad.PROPIO) return TipoPropiedad.MEDICUC;
    if (tipo === TipoPropiedad.EXTERNO) return TipoPropiedad.ALQUILADO;
    return tipo || TipoPropiedad.MEDICUC;
  };

  const propiedadMeta = (tipo?: TipoPropiedad) => {
    const normalized = normalizeTipoPropiedad(tipo);
    switch (normalized) {
      case TipoPropiedad.PACIENTE:
        return { label: 'PACIENTE', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
      case TipoPropiedad.ALQUILADO:
        return { label: 'ALQUILADO', className: 'bg-amber-50 text-amber-800 border-amber-200' };
      case TipoPropiedad.EMPLEADO:
        return { label: 'EMPLEADO', className: 'bg-indigo-50 text-indigo-800 border-indigo-200' };
      case TipoPropiedad.MEDICUC:
      default:
        return { label: 'MEDICUC', className: 'bg-blue-50 text-blue-800 border-blue-200' };
    }
  };

  useEffect(() => {
    setFirestoreError(null);

    const unsubEquipos = subscribeEquipos(setEquipos, (e) => {
      console.error('Firestore subscribeEquipos error:', e);
      setFirestoreError(`No tienes permisos para leer "equipos" en Firestore. Detalle: ${e.message}`);
    });
    const unsubTipos = subscribeTiposEquipo(setTiposEquipo, (e) => {
      console.error('Firestore subscribeTiposEquipo error:', e);
      setFirestoreError(`No tienes permisos para leer "tipos_equipo" en Firestore. Detalle: ${e.message}`);
    });
    const unsubPacientes = subscribePacientes(setPacientes, (e) => {
      console.error('Firestore subscribePacientes error:', e);
      setFirestoreError(`No tienes permisos para leer "pacientes" en Firestore. Detalle: ${e.message}`);
    });
    const unsubAsignaciones = subscribeAsignaciones(setAsignaciones, (e) => {
      console.error('Firestore subscribeAsignaciones error:', e);
      setFirestoreError(`No tienes permisos para leer "asignaciones" en Firestore. Detalle: ${e.message}`);
    });
    const unsubProfesionales = subscribeProfesionales(setProfesionales, () => {});
    const unsubAsignacionesProfesionales = subscribeAsignacionesProfesionales(setAsignacionesProfesionales, (e) => {
      console.error('Firestore subscribeAsignacionesProfesionales error:', e);
      setFirestoreError(
        `No tienes permisos para leer "asignaciones_profesionales" en Firestore. Detalle: ${e.message}`,
      );
    });
    return () => {
      unsubEquipos();
      unsubTipos();
      unsubPacientes();
      unsubAsignaciones();
      unsubProfesionales();
      unsubAsignacionesProfesionales();
    };
  }, []);

  useEffect(() => {
    if (!canReadReportes) return;
    const unsub = subscribeReportesEquipos(
      setReportesEquipos,
      (e) => console.error('Firestore subscribeReportesEquipos error:', e),
    );
    return () => unsub();
  }, [canReadReportes]);

  useEffect(() => {
    if (usuario?.rol !== RolUsuario.INGENIERO_BIOMEDICO) return;
    const unsubSolicitudes = subscribeSolicitudesEquiposPacientePendientes(setSolicitudesPendientes, (e) => {
      console.error('Firestore subscribeSolicitudesEquiposPacientePendientes error:', e);
      setFirestoreError(`No tienes permisos para leer solicitudes. Detalle: ${e.message}`);
    });
    return () => unsubSolicitudes();
  }, [usuario?.rol]);

  useEffect(() => {
    const counts: { [key: string]: number } = {};
    for (const a of asignaciones) {
      const equipoId = a.idEquipo;
      counts[equipoId] = (counts[equipoId] || 0) + 1;
    }
    for (const a of asignacionesProfesionales) {
      const equipoId = a.idEquipo;
      counts[equipoId] = (counts[equipoId] || 0) + 1;
    }
    setAssignmentCounts(counts);
  }, [asignaciones, asignacionesProfesionales]);

  useEffect(() => {
    if (!openSolicitud?.fotos?.length) {
      setSolicitudFotoUrls({});
      return;
    }
    let alive = true;
    const load = async () => {
      const next: Record<string, string> = {};
      for (const f of openSolicitud.fotos || []) {
        if (!f?.path) continue;
        try {
          const url = await getDownloadURL(storageRef(storage, f.path));
          if (alive) next[f.path] = url;
        } catch (err) {
          console.error('Error cargando foto solicitud:', err);
        }
      }
      if (alive) setSolicitudFotoUrls(next);
    };
    load();
    return () => {
      alive = false;
    };
  }, [openSolicitud]);

  const propiedadLocked = !!solicitudContext;
  const pacientesById = useMemo(() => new Map(pacientes.map((p) => [p.id, p])), [pacientes]);
  const profesionalesById = useMemo(() => new Map(profesionales.map((p) => [p.id, p])), [profesionales]);
  const tiposEquipoById = useMemo(() => new Map(tiposEquipo.map((t) => [t.id, t])), [tiposEquipo]);
  const tipoSeleccionado = formData.tipoEquipoId ? tiposEquipoById.get(formData.tipoEquipoId) : undefined;
  const equipoFotoUrl = removeEquipoFoto ? '' : (equipoFotoPreview || formData.fotoEquipo?.url || '');
  const activeAsignacionByEquipo = useMemo(() => {
    const map = new Map<string, { tipo: 'PACIENTE' | 'PROFESIONAL'; asignacion: Asignacion | AsignacionProfesional }>();
    for (const a of asignaciones) {
      if (a.estado === EstadoAsignacion.ACTIVA) map.set(a.idEquipo, { tipo: 'PACIENTE', asignacion: a });
    }
    for (const a of asignacionesProfesionales) {
      if (a.estado === EstadoAsignacion.ACTIVA) map.set(a.idEquipo, { tipo: 'PROFESIONAL', asignacion: a });
    }
    return map;
  }, [asignaciones, asignacionesProfesionales]);
  const lastFinalEstadoByEquipo = useMemo(() => {
    const map = new Map<string, { date: number; estadoFinal: EstadoEquipo }>();
    for (const a of asignaciones) {
      if (a.estado !== EstadoAsignacion.FINALIZADA) continue;
      if (!a.estadoFinalEquipo) continue;
      const date = new Date(a.fechaDevolucion || a.fechaAsignacion).getTime();
      const prev = map.get(a.idEquipo);
      if (!prev || date > prev.date) {
        map.set(a.idEquipo, { date, estadoFinal: a.estadoFinalEquipo as EstadoEquipo });
      }
    }
    for (const a of asignacionesProfesionales) {
      if (a.estado !== EstadoAsignacion.FINALIZADA) continue;
      if (!a.estadoFinalEquipo) continue;
      const date = new Date(a.fechaDevolucion || a.fechaEntregaOriginal).getTime();
      const prev = map.get(a.idEquipo);
      if (!prev || date > prev.date) {
        map.set(a.idEquipo, { date, estadoFinal: a.estadoFinalEquipo as EstadoEquipo });
      }
    }
    return map;
  }, [asignaciones, asignacionesProfesionales]);

  const [statusFilter, setStatusFilter] = useState<EstadoEquipo | 'ALL'>('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    if (typeof window === 'undefined') return 'grid';
    const saved = localStorage.getItem('biocontrol_inventory_view');
    return saved === 'list' ? 'list' : 'grid';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('biocontrol_inventory_view', viewMode);
  }, [viewMode]);

  const getEffectiveStatus = (equipo: EquipoBiomedico) => {
    const active = activeAsignacionByEquipo.get(equipo.id);
    const lastFinal = lastFinalEstadoByEquipo.get(equipo.id);
    return active ? EstadoEquipo.ASIGNADO : (lastFinal?.estadoFinal || equipo.estado);
  };

  const getEquipoMeta = (equipo: EquipoBiomedico) => {
    const active = activeAsignacionByEquipo.get(equipo.id);
    const status = getEffectiveStatus(equipo);
    const propiedad = propiedadMeta(equipo.tipoPropiedad);
    const tipoNormalizado = normalizeTipoPropiedad(equipo.tipoPropiedad);
    const ubicacion = (() => {
      if (!active) return equipo.ubicacionActual;
      if (active.tipo === 'PACIENTE') {
        const a = active.asignacion as Asignacion;
        return pacientesById.get(a.idPaciente)?.nombreCompleto || equipo.ubicacionActual;
      }
      const a = active.asignacion as AsignacionProfesional;
      return profesionalesById.get(a.idProfesional)?.nombre || equipo.ubicacionActual;
    })();
    return { status, propiedad, tipoNormalizado, ubicacion };
  };

  // Filtro de Equipos (Buscador + Estado)
  const filteredEquipos = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return equipos.filter((e) => {
      const statusOk = statusFilter === 'ALL' || getEffectiveStatus(e) === statusFilter;
      if (!statusOk) return false;
      if (!term) return true;
      return (
        e.codigoInventario.toLowerCase().includes(term) ||
        e.numeroSerie.toLowerCase().includes(term) ||
        e.nombre.toLowerCase().includes(term) ||
        e.marca.toLowerCase().includes(term)
      );
    });
  }, [equipos, searchTerm, statusFilter, activeAsignacionByEquipo, lastFinalEstadoByEquipo]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    if (serialChecking) {
      toast({ tone: 'warning', message: 'Espera a que termine la validacion del serial.' });
      return;
    }
    if (serialError) {
      toast({ tone: 'warning', message: serialError });
      return;
    }
    if (formData.estado === EstadoEquipo.MANTENIMIENTO && !formData.fechaMantenimiento) {
      toast({ tone: 'warning', message: 'Selecciona la fecha de mantenimiento.' });
      return;
    }
    if (formData.estado === EstadoEquipo.DADO_DE_BAJA && !formData.fechaBaja) {
      toast({ tone: 'warning', message: 'Selecciona la fecha de baja.' });
      return;
    }
    if (formData.tipoPropiedad === TipoPropiedad.ALQUILADO && !formData.empresaAlquiler?.trim()) {
      toast({ tone: 'warning', message: 'Escribe la empresa de alquiler.' });
      return;
    }
    if (
      solicitudContext &&
      formData.tipoPropiedad === TipoPropiedad.ALQUILADO &&
      !autoActaFirma
    ) {
      toast({ tone: 'warning', message: 'La firma del biomédico es obligatoria para crear el acta interna.' });
      return;
    }

    const isNew = !formData.id;
    const baseDisponible =
      typeof formData.disponibleParaEntrega === 'boolean' ? formData.disponibleParaEntrega : undefined;
    const disponibleParaEntrega =
      isNew && formData.tipoPropiedad === TipoPropiedad.PACIENTE ? true : baseDisponible;

    const calibracionPeriodicidad =
      (formData.hojaVidaOverrides?.calibracion ?? tipoSeleccionado?.fijos?.calibracion ?? '').trim();

    const newEquipo: EquipoBiomedico = {
      id: formData.id || '',
      codigoInventario: formData.codigoInventario || '', // Si es nuevo, db lo ignora y genera uno.
      numeroSerie: formData.numeroSerie || '',
      nombre: formData.nombre || '',
      marca: formData.marca || '',
      modelo: formData.modelo || '',
      estado: formData.estado || EstadoEquipo.DISPONIBLE,
      tipoEquipoId: formData.tipoEquipoId || undefined,
      hojaVidaDatos: formData.hojaVidaDatos || undefined,
      hojaVidaOverrides: formData.hojaVidaOverrides || undefined,
      calibracionPeriodicidad: calibracionPeriodicidad || undefined,
      fechaIngreso: formData.fechaIngreso ? formData.fechaIngreso : new Date().toISOString(),
      fechaMantenimiento: formData.fechaMantenimiento,
      fechaBaja: formData.fechaBaja,
      // Control (acta interna): equipos nuevos quedan NO disponibles para entrega hasta aceptación.
      disponibleParaEntrega,
      custodioUid: formData.custodioUid || (formData.id ? undefined : usuario?.id),
      observaciones: formData.observaciones || '',
      ubicacionActual: formData.ubicacionActual || 'Bodega',
      tipoPropiedad: formData.tipoPropiedad || TipoPropiedad.MEDICUC,
      empresaAlquiler:
        formData.tipoPropiedad === TipoPropiedad.ALQUILADO ? formData.empresaAlquiler || '' : undefined,
    };
    try {
      const createdId = await saveEquipo(newEquipo);
      const equipoId = formData.id || createdId;
      if (equipoFotoFile && equipoId) {
        if (equipoFotoFile.size > 5 * 1024 * 1024) {
          toast({ tone: 'warning', message: 'La imagen supera 5MB. Usa una más liviana.' });
        } else {
          try {
            if (formData.fotoEquipo?.path) {
              try {
                await deleteObject(storageRef(storage, formData.fotoEquipo.path));
              } catch (err) {
                const code = (err as { code?: string })?.code;
                if (code !== 'storage/object-not-found') {
                  console.warn('No se pudo eliminar la imagen anterior:', err);
                }
              }
            }
            const uniqueName = `${Date.now()}_${Math.random().toString(36).slice(2)}_${equipoFotoFile.name}`;
            const storagePath = `equipos/${equipoId}/${uniqueName}`;
            const refFile = storageRef(storage, storagePath);
            await uploadBytes(refFile, equipoFotoFile, { contentType: equipoFotoFile.type });
            const url = await getDownloadURL(refFile);
            await updateEquipoFoto(equipoId, {
              path: storagePath,
              name: equipoFotoFile.name,
              size: equipoFotoFile.size,
              contentType: equipoFotoFile.type || 'image/jpeg',
              url,
            });
          } catch (err) {
            console.error('Error subiendo imagen del equipo:', err);
            toast({ tone: 'warning', message: 'El equipo se guardó, pero no se pudo subir la imagen.' });
          }
        }
      } else if (removeEquipoFoto && equipoId && formData.fotoEquipo?.path) {
        try {
          await deleteObject(storageRef(storage, formData.fotoEquipo.path));
        } catch (err) {
          console.warn('No se pudo eliminar la imagen:', err);
        }
        try {
          await clearEquipoFoto(equipoId);
        } catch (err) {
          console.warn('No se pudo limpiar la imagen del equipo:', err);
        }
      }
      if (solicitudContext && createdId) {
        try {
          const fn = httpsCallable(firebaseFunctions, 'approveSolicitudEquipoPaciente');
          const payload: Record<string, unknown> = {
            solicitudId: solicitudContext.id,
            equipoId: createdId,
          };
          if (solicitudContext.tipoPropiedad === TipoPropiedad.ALQUILADO) {
            payload.firmaEntrega = autoActaFirma;
          }
          await fn(payload);
          if (solicitudContext.tipoPropiedad === TipoPropiedad.ALQUILADO) {
            toast({
              tone: 'success',
              message: 'Equipo creado. Acta interna enviada al auxiliar para aceptación.',
            });
          } else {
            toast({
              tone: 'success',
              message: 'Equipo creado y asignado automáticamente al paciente.',
            });
          }
          setSolicitudesPendientes((prev) => prev.filter((s) => s.id !== solicitudContext.id));
          setSolicitudContext(null);
          setOpenSolicitud(null);
          setSolicitudFotoUrls({});
        } catch (err: any) {
          console.error('Error aprobando solicitud:', err);
          toast({
            tone: 'error',
            message: `${err?.code ? `${err.code}: ` : ''}${err?.message || 'No se pudo aprobar la solicitud.'}`,
          });
          return;
        }
      }
      setIsModalOpen(false);
      setFormData({
        tipoPropiedad: TipoPropiedad.MEDICUC,
        fechaIngreso: new Date().toISOString(),
        disponibleParaEntrega: false,
        hojaVidaDatos: {
          empresa: EMPRESA_DEFAULT,
          sede: SEDE_DEFAULT,
        },
      });
      setEquipoFotoFile(null);
      setEquipoFotoPreview(null);
      setRemoveEquipoFoto(false);
      setSerialError(null);
    } catch (err: any) {
      console.error('Error guardando equipo:', err);
      toast({ tone: 'error', message: `${err?.code ? `${err.code}: ` : ''}${err?.message || 'No se pudo guardar el equipo.'}` });
    }
  };

  const handleSerieBlur = async () => {
    const rawSerie = formData.numeroSerie || '';
    const serie = rawSerie.trim();
    if (serie !== rawSerie) {
      setFormData({ ...formData, numeroSerie: serie });
    }
    if (!serie) {
      setSerialError(null);
      return;
    }
    setSerialChecking(true);
    try {
      const ok = await isNumeroSerieDisponible(serie, formData.id);
      if (!ok) {
        const msg = `El serial ${serie} ya existe en el inventario.`;
        setSerialError(msg);
        toast({ tone: 'warning', message: msg });
      } else {
        setSerialError(null);
      }
    } catch (err: any) {
      console.error('Error validando serial:', err);
      setSerialError('No se pudo validar el serial en este momento.');
    } finally {
      setSerialChecking(false);
    }
  };

  const isoToDateInput = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const formatDate = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString();
  };

  const mergeHojaVidaFijos = (base?: HojaVidaFijos, override?: HojaVidaFijos): HojaVidaFijos => ({
    direccionEmpresa: override?.direccionEmpresa ?? base?.direccionEmpresa,
    fabricante: override?.fabricante ?? base?.fabricante,
    clasificacionBiomedica: override?.clasificacionBiomedica ?? base?.clasificacionBiomedica,
    componentes: override?.componentes ?? base?.componentes,
    vidaUtil: override?.vidaUtil ?? base?.vidaUtil,
    definicion: override?.definicion ?? base?.definicion,
    recomendacionesFabricante: override?.recomendacionesFabricante ?? base?.recomendacionesFabricante,
    periodicidadMantenimiento: override?.periodicidadMantenimiento ?? base?.periodicidadMantenimiento,
    calibracion: override?.calibracion ?? base?.calibracion,
    tecnicaLimpiezaDesinfeccion: override?.tecnicaLimpiezaDesinfeccion ?? base?.tecnicaLimpiezaDesinfeccion,
    caracteristicasFisicas: {
      ...base?.caracteristicasFisicas,
      ...override?.caracteristicasFisicas,
    },
    caracteristicasElectricas: {
      ...base?.caracteristicasElectricas,
      ...override?.caracteristicasElectricas,
    },
    otrosSuministros: {
      ...base?.otrosSuministros,
      ...override?.otrosSuministros,
    },
  });

  const servicioAsignacionActual = useMemo(() => {
    if (!formData.id) return '';
    const asignacion = asignaciones.find(
      (a) => a.idEquipo === formData.id && a.estado === EstadoAsignacion.ACTIVA,
    );
    if (!asignacion) return '';
    const paciente = pacientesById.get(asignacion.idPaciente);
    return paciente?.servicio || '';
  }, [formData.id, asignaciones, pacientesById]);

  const updateHojaVidaDatos = (patch: Partial<HojaVidaDatosEquipo>) => {
    setFormData((prev) => ({
      ...prev,
      hojaVidaDatos: {
        ...(prev.hojaVidaDatos || {}),
        ...patch,
      },
    }));
  };

  const updateHojaVidaOverrides = (patch: Partial<HojaVidaFijos>) => {
    setFormData((prev) => ({
      ...prev,
      hojaVidaOverrides: {
        ...(prev.hojaVidaOverrides || {}),
        ...patch,
      },
    }));
  };

  const updateTipoFijos = (patch: Partial<HojaVidaFijos>) => {
    setTipoForm((prev) => ({
      ...prev,
      fijos: {
        ...(prev.fijos || {}),
        ...patch,
      },
    }));
  };

  const openEdit = (equipo: EquipoBiomedico) => {
    if (!canEdit) return;
    setSolicitudContext(null);
    setFormData({
      ...equipo,
      tipoPropiedad: normalizeTipoPropiedad(equipo.tipoPropiedad),
      fechaIngreso: equipo.fechaIngreso || new Date().toISOString(),
    });
    setEquipoFotoFile(null);
    setEquipoFotoPreview(null);
    setRemoveEquipoFoto(false);
    setSerialError(null);
    setIsModalOpen(true);
  };

  const openCreateFromSolicitud = (solicitud: SolicitudEquipoPaciente) => {
    if (!canEdit) return;
    setSolicitudContext(solicitud);
    setFormData({
      nombre: solicitud.equipoNombre || '',
      numeroSerie: '',
      tipoPropiedad: solicitud.tipoPropiedad,
      fechaIngreso: new Date().toISOString(),
      disponibleParaEntrega:
        solicitud.tipoPropiedad === TipoPropiedad.PACIENTE || solicitud.tipoPropiedad === TipoPropiedad.MEDICUC,
      empresaAlquiler: solicitud.tipoPropiedad === TipoPropiedad.ALQUILADO ? '' : undefined,
      hojaVidaDatos: {
        empresa: EMPRESA_DEFAULT,
        sede: SEDE_DEFAULT,
      },
    });
    setEquipoFotoFile(null);
    setEquipoFotoPreview(null);
    setRemoveEquipoFoto(false);
    setSerialError(null);
    setIsModalOpen(true);
  };

  const openTiposEquipo = (tipo?: TipoEquipo) => {
    if (!canEdit) return;
    if (tipo) {
      setTipoForm({
        ...tipo,
        fijos: tipo.fijos || {},
        trabajoRealizadoDefault: tipo.trabajoRealizadoDefault || '',
      });
    } else {
      setTipoForm({ id: '', nombre: '', fijos: {}, trabajoRealizadoDefault: '' });
    }
    setIsTiposOpen(true);
  };

  const closeTiposEquipo = () => {
    setIsTiposOpen(false);
    setTipoForm({ id: '', nombre: '', fijos: {}, trabajoRealizadoDefault: '' });
  };

  const handleSaveTipoEquipo = async () => {
    if (!canEdit) return;
    if (!tipoForm.nombre.trim()) {
      toast({ tone: 'warning', message: 'El tipo de equipo debe tener nombre.' });
      return;
    }
    setTipoSaving(true);
    try {
      await saveTipoEquipo(tipoForm);
      toast({ tone: 'success', message: 'Tipo de equipo guardado.' });
      closeTiposEquipo();
    } catch (err: any) {
      console.error('Error guardando tipo de equipo:', err);
      toast({ tone: 'error', message: err?.message || 'No se pudo guardar el tipo de equipo.' });
    } finally {
      setTipoSaving(false);
    }
  };

  const handleDeleteTipoEquipo = async (tipo: TipoEquipo) => {
    if (!canEdit) return;
    const ok = await confirmDialog({
      title: 'Eliminar tipo de equipo',
      message: `Se eliminará la plantilla "${tipo.nombre}".`,
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteTipoEquipo(tipo.id);
      toast({ tone: 'success', message: 'Tipo de equipo eliminado.' });
    } catch (err: any) {
      console.error('Error eliminando tipo de equipo:', err);
      toast({ tone: 'error', message: err?.message || 'No se pudo eliminar el tipo de equipo.' });
    }
  };

  const handleMigrarFijos = async () => {
    if (!canEdit) return;
    if (tiposEquipo.length === 0) {
      toast({ tone: 'info', message: 'No hay tipos de equipo para migrar.' });
      return;
    }
    const ok = await confirmDialog({
      title: 'Migrar datos fijos por tipo',
      message:
        'Se tomarán datos existentes de los equipos para completar Dirección, Fabricante, Clasificación, Componentes y Vida útil en cada tipo (solo si están vacíos). ¿Deseas continuar?',
      confirmText: 'Migrar',
      cancelText: 'Cancelar',
    });
    if (!ok) return;

    const firstNonEmpty = (values: Array<string | undefined | null>) => {
      for (const v of values) {
        if (typeof v === 'string' && v.trim()) return v;
      }
      return undefined;
    };

    let updated = 0;
    for (const tipo of tiposEquipo) {
      const equiposTipo = equipos.filter((e) => e.tipoEquipoId === tipo.id);
      if (equiposTipo.length === 0) continue;

      const base = tipo.fijos || {};
      const patch: Partial<HojaVidaFijos> = {};

      if (!base.direccionEmpresa) {
        patch.direccionEmpresa = firstNonEmpty(equiposTipo.map((e) => e.hojaVidaDatos?.direccionEmpresa));
      }
      if (!base.fabricante) {
        patch.fabricante = firstNonEmpty(equiposTipo.map((e) => e.hojaVidaDatos?.fabricante));
      }
      if (!base.clasificacionBiomedica) {
        patch.clasificacionBiomedica = firstNonEmpty(
          equiposTipo.map((e) => e.hojaVidaDatos?.clasificacionBiomedica),
        );
      }
      if (!base.componentes) {
        patch.componentes = firstNonEmpty(equiposTipo.map((e) => e.hojaVidaDatos?.componentes));
      }
      if (!base.vidaUtil) {
        patch.vidaUtil = firstNonEmpty(equiposTipo.map((e) => e.hojaVidaDatos?.vidaUtil));
      }

      if (Object.values(patch).some((v) => typeof v === 'string' && v.trim())) {
        try {
          await saveTipoEquipo({
            ...tipo,
            fijos: { ...(tipo.fijos || {}), ...patch },
          });
          updated += 1;
        } catch (err) {
          console.error('Error migrando tipo:', tipo.nombre, err);
        }
      }
    }

    if (updated > 0) {
      toast({ tone: 'success', message: `Migración completada. Tipos actualizados: ${updated}.` });
    } else {
      toast({ tone: 'info', message: 'No hubo cambios para migrar.' });
    }
  };

  const openHistory = (equipo: EquipoBiomedico) => {
    const historialPacientes = asignaciones
      .filter((a) => a.idEquipo === equipo.id)
      .map((h) => {
        const paciente = pacientesById.get(h.idPaciente);
        return {
          id: h.id,
          tipo: 'PACIENTE' as const,
          fecha: h.fechaAsignacion,
          fechaFin: h.fechaDevolucion,
          estado: h.estado,
          consecutivo: h.consecutivo,
          nombre: paciente ? paciente.nombreCompleto : 'Paciente Eliminado',
          doc: paciente ? paciente.numeroDocumento : 'N/A',
          observacionesEntrega: h.observacionesEntrega,
          observacionesDevolucion: h.observacionesDevolucion,
          estadoFinalEquipo: h.estadoFinalEquipo,
        };
      });

    const historialProfesionales = asignacionesProfesionales
      .filter((a) => a.idEquipo === equipo.id)
      .map((h) => {
        const prof = profesionalesById.get(h.idProfesional);
        return {
          id: h.id,
          tipo: 'PROFESIONAL' as const,
          fecha: h.fechaEntregaOriginal,
          fechaFin: h.fechaDevolucion,
          estado: h.estado,
          consecutivo: h.consecutivo,
          nombre: prof ? prof.nombre : 'Profesional Eliminado',
          doc: prof ? prof.cedula : 'N/A',
          observacionesEntrega: h.observacionesEntrega,
          observacionesDevolucion: h.observacionesDevolucion,
          estadoFinalEquipo: h.estadoFinalEquipo,
        };
      });

    const historialEstado = [];
    if (equipo.fechaMantenimiento) {
      historialEstado.push({
        id: `mantenimiento-${equipo.id}`,
        tipo: 'MANTENIMIENTO' as const,
        fecha: equipo.fechaMantenimiento,
        fechaFin: equipo.fechaMantenimiento,
        nombre: 'Mantenimiento',
        doc: '-',
      });
    }
    if (equipo.fechaBaja) {
      historialEstado.push({
        id: `baja-${equipo.id}`,
        tipo: 'BAJA' as const,
        fecha: equipo.fechaBaja,
        fechaFin: equipo.fechaBaja,
        nombre: 'Baja del equipo',
        doc: '-',
      });
    }

    const historialReportes = reportesEquipos
      .filter((r) => r.idEquipo === equipo.id)
      .flatMap((r) => {
        const base = Array.isArray(r.historial) && r.historial.length ? r.historial : null;
        const fallback = [
          {
            fecha: r.fechaVisita,
            estado: r.estado,
            nota: r.descripcion,
            porUid: r.creadoPorUid,
            porNombre: r.creadoPorNombre,
          },
        ];
        const items = base || fallback;
        return items.map((h, idx) => ({
          id: `${r.id}-${idx}`,
          fecha: h.fecha,
          estado: h.estado,
          nota: h.nota,
          porNombre: h.porNombre,
          pacienteNombre: r.pacienteNombre,
        }));
      })
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  const enriched = [...historialPacientes, ...historialProfesionales, ...historialEstado].sort(
    (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
  );

  setHistoryEquipo({ equipo, data: enriched, reportes: historialReportes });
  setIsHistoryOpen(true);
};

  const handlePrintHojaVida = async () => {
    const actaEl = hojaVidaPrintRef.current?.querySelector('.acta-page') as HTMLElement | null;
    if (!actaEl) {
      window.print();
      return;
    }

    const existing = document.getElementById('acta-print-root');
    existing?.remove();

    const printRoot = document.createElement('div');
    printRoot.id = 'acta-print-root';
    printRoot.style.position = 'fixed';
    printRoot.style.left = '-9999px';
    printRoot.style.top = '0';
    printRoot.appendChild(actaEl.cloneNode(true));
    document.body.appendChild(printRoot);

    const waitForImages = (root: HTMLElement, timeoutMs = 2000) => {
      const images = Array.from(root.querySelectorAll('img'));
      if (images.length === 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        let pending = images.length;
        let finished = false;
        const done = () => {
          if (finished) return;
          finished = true;
          resolve();
        };
        const check = () => {
          pending -= 1;
          if (pending <= 0) done();
        };
        for (const img of images) {
          if (img.complete && img.naturalWidth > 0) {
            check();
            continue;
          }
          const onLoad = () => {
            img.removeEventListener('load', onLoad);
            img.removeEventListener('error', onError);
            check();
          };
          const onError = () => {
            img.removeEventListener('load', onLoad);
            img.removeEventListener('error', onError);
            check();
          };
          img.addEventListener('load', onLoad);
          img.addEventListener('error', onError);
        }
        setTimeout(done, timeoutMs);
      });
    };

    await waitForImages(printRoot);
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

  const handleDownloadHojaVidaPdf = async () => {
    const actaEl = hojaVidaPrintRef.current?.querySelector('.acta-page') as HTMLElement | null;
    if (!actaEl) {
      toast({ tone: 'warning', message: 'No se pudo generar el PDF.' });
      return;
    }

    const win = window as any;
    const html2canvas = win.html2canvas as ((el: HTMLElement, opts?: any) => Promise<HTMLCanvasElement>) | undefined;
    const JsPdf = win.jspdf?.jsPDF;

    if (!html2canvas || !JsPdf) {
      toast({ tone: 'warning', message: 'El módulo de PDF no está disponible en este momento.' });
      return;
    }

    try {
      const canvas = await html2canvas(actaEl, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new JsPdf({ orientation: 'portrait', unit: 'in', format: 'letter' });
      const pageW = 8.5;
      const pageH = 11;
      const imgW = pageW;
      const imgH = (canvas.height / canvas.width) * imgW;
      const y = imgH > pageH ? 0 : (pageH - imgH) / 2;
      pdf.addImage(imgData, 'PNG', 0, y, imgW, Math.min(imgH, pageH));
      const codigo = historyEquipo?.equipo?.codigoInventario || 'equipo';
      pdf.save(`Hoja_Vida_${codigo}.pdf`);
    } catch (err) {
      console.error('Error generando PDF:', err);
      toast({ tone: 'error', message: 'No se pudo generar el PDF. Intenta nuevamente.' });
    }
  };

  const historyTipo = historyEquipo?.equipo?.tipoEquipoId
    ? tiposEquipoById.get(historyEquipo.equipo.tipoEquipoId)
    : undefined;
  const historyFijos = mergeHojaVidaFijos(historyTipo?.fijos, historyEquipo?.equipo?.hojaVidaOverrides);
  const historyDatos = historyEquipo?.equipo?.hojaVidaDatos;
  const historyAsignacionActiva = historyEquipo
    ? asignaciones.find((a) => a.idEquipo === historyEquipo.equipo.id && a.estado === EstadoAsignacion.ACTIVA)
    : undefined;
  const historyPaciente = historyAsignacionActiva ? pacientesById.get(historyAsignacionActiva.idPaciente) : undefined;
  const historyServicio = historyDatos?.servicio || '—';
  const historyUbicacion =
    historyPaciente?.direccion || historyEquipo?.equipo?.ubicacionActual || 'BODEGA';

  const handleDeleteEquipo = async (equipo: EquipoBiomedico) => {
    if (!canEdit) return;
    if (activeAsignacionByEquipo.has(equipo.id)) {
      toast({ tone: 'warning', message: 'No puedes eliminar un equipo con asignacion activa.' });
      return;
    }
    if ((assignmentCounts[equipo.id] || 0) > 0) {
      toast({ tone: 'warning', message: 'No puedes eliminar un equipo con historial de asignaciones.' });
      return;
    }
    if (equipo.actaInternaPendienteId) {
      toast({ tone: 'warning', message: 'Este equipo tiene un acta interna pendiente. Anula el acta primero.' });
      return;
    }

    const ok = await confirmDialog({
      title: 'Eliminar equipo',
      message: `Se eliminara el equipo ${equipo.codigoInventario} (${equipo.numeroSerie}). Esta accion no se puede deshacer.`,
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      tone: 'danger',
    });
    if (!ok) return;

    try {
      await deleteEquipo(equipo.id);
      toast({ tone: 'success', message: 'Equipo eliminado correctamente.' });
    } catch (err: any) {
      console.error('Error eliminando equipo:', err);
      toast({ tone: 'error', message: err?.message || 'No se pudo eliminar el equipo.' });
    }
  };

  const handleDownloadTemplate = () => {
    // Se eliminó "CodigoInventario" porque ahora es automático
    const headers = [
      "NumeroSerie",
      "Nombre",
      "Marca",
      "Modelo",
      "TipoPropiedad (MEDICUC/PACIENTE/ALQUILADO/EMPLEADO)",
      "EmpresaAlquiler (solo ALQUILADO)",
      "UbicacionInicial",
      "Observaciones",
      "FechaIngreso (YYYY-MM-DD)",
    ];

    const exampleRow = [
      "SN-123456",
      "Concentrador de Oxigeno",
      "Everflo",
      "Respironics",
      "MEDICUC",
      "",
      "Bodega",
      "Equipo nuevo",
      "2020-01-15",
    ];

    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n" 
      + exampleRow.join(",");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "plantilla_equipos_biocontrol.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEdit) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      (async () => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.split('\n');
      const dataLines = lines.slice(1).filter(line => line.trim() !== '');

      let successCount = 0;
      let errorCount = 0;
      let errorMessages: string[] = [];

      for (const [index, line] of dataLines.entries()) {
        const columns = line.split(','); 
        if (columns.length < 4) continue; // Mínimo serie, nombre, marca, modelo

        // Índices ajustados al remover CodigoInventario
        const rawTipo = (columns[4] || '').trim().toUpperCase();
        let tipoPropiedad: TipoPropiedad = TipoPropiedad.MEDICUC;
        if (rawTipo === 'PACIENTE') tipoPropiedad = TipoPropiedad.PACIENTE;
        else if (rawTipo === 'ALQUILADO' || rawTipo === 'EXTERNO') tipoPropiedad = TipoPropiedad.ALQUILADO;
        else if (rawTipo === 'EMPLEADO') tipoPropiedad = TipoPropiedad.EMPLEADO;
        else if (rawTipo === 'MEDICUC' || rawTipo === 'PROPIO') tipoPropiedad = TipoPropiedad.MEDICUC;
        const fechaIngresoStr = columns[8]?.trim();
        const fechaIngresoIso = (() => {
          if (!fechaIngresoStr) return new Date().toISOString();
          const d = new Date(`${fechaIngresoStr}T12:00:00`);
          return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
        })();

        const importedEquipo: EquipoBiomedico = {
          id: '', 
          codigoInventario: '', // Se generará automáticamente
          numeroSerie: columns[0]?.trim() || '',
          nombre: columns[1]?.trim() || 'Sin Nombre',
          marca: columns[2]?.trim() || '',
          modelo: columns[3]?.trim() || '',
          tipoPropiedad: tipoPropiedad,
          empresaAlquiler: tipoPropiedad === TipoPropiedad.ALQUILADO ? columns[5]?.trim() || '' : undefined,
          fechaIngreso: fechaIngresoIso,
          ubicacionActual: columns[6]?.trim() || 'Bodega',
          observaciones: columns[7]?.trim() || '',
          estado: EstadoEquipo.DISPONIBLE,
          disponibleParaEntrega: tipoPropiedad === TipoPropiedad.PACIENTE,
          custodioUid: usuario?.id,
        };

        try {
          if (!importedEquipo.numeroSerie || !importedEquipo.nombre) {
             throw new Error(`Fila ${index + 2}: Falta serie o nombre`);
          }
          await saveEquipo(importedEquipo);
          successCount++;
        } catch (err: any) {
          errorCount++;
          errorMessages.push(`Fila ${index + 2} (${importedEquipo.nombre}): ${err.message}`);
        }
      }

      let message = `Proceso completado.\n\nImportados exitosamente: ${successCount}\nFallidos: ${errorCount}`;
      if (errorCount > 0) {
        message += `\n\nErrores:\n${errorMessages.slice(0, 5).join('\n')}${errorMessages.length > 5 ? '\n...' : ''}`;
      }
      toast({ tone: errorCount > 0 ? 'warning' : 'success', title: 'Importacion CSV', message });
      if (fileInputRef.current) fileInputRef.current.value = ''; 
      })().catch((err) => toast({ tone: 'error', message: err?.message || 'Error importando CSV' }));
    };
    reader.readAsText(file);
  };

  return (
    <Layout title="Inventario Biomédico">
      {firestoreError && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded p-3 text-sm">
          {firestoreError}
        </div>
      )}
      {canEdit && solicitudesPendientes.length > 0 && (
        <div className="md-card p-3 mb-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="text-sm text-gray-700">
            Tienes <span className="font-semibold">{solicitudesPendientes.length}</span> solicitudes pendientes para
            crear equipos en inventario.
          </div>
          <button
            type="button"
            className="md-btn md-btn-outlined"
            onClick={() => {
              const target = document.getElementById('solicitudes-paciente');
              target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            Ver solicitudes
          </button>
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
              placeholder="Buscar por código, serie o nombre..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500">Filtrar por estado:</span>
              {[
                { label: 'Todos', value: 'ALL' },
                { label: 'Disponible', value: EstadoEquipo.DISPONIBLE },
                { label: 'Asignado', value: EstadoEquipo.ASIGNADO },
                { label: 'Mantenimiento', value: EstadoEquipo.MANTENIMIENTO },
                { label: 'De baja', value: EstadoEquipo.DADO_DE_BAJA },
              ].map((opt) => {
                const active = statusFilter === opt.value;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setStatusFilter(opt.value as EstadoEquipo | 'ALL')}
                    className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition ${
                      active
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition ${
                  viewMode === 'grid'
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                Cuadrícula
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition ${
                  viewMode === 'list'
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                Lista
              </button>
            </div>
          </div>
        </div>

        {canEdit && (
          <div className="flex gap-2">
            <input 
              type="file" 
              accept=".csv" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleImportCSV} 
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="md-btn md-btn-tonal"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              Importar
            </button>
            <button 
              onClick={handleDownloadTemplate}
              className="md-btn md-btn-outlined"
              title="Descargar plantilla CSV (Sin columna de Código)"
            >
               <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
               Plantilla
            </button>
            <button 
              onClick={() => {
                setSolicitudContext(null);
                setFormData({
                  tipoPropiedad: TipoPropiedad.MEDICUC,
                  fechaIngreso: new Date().toISOString(),
                  disponibleParaEntrega: false,
                  hojaVidaDatos: {
                    empresa: EMPRESA_DEFAULT,
                    sede: SEDE_DEFAULT,
                  },
                });
                setIsModalOpen(true);
              }}
              className="md-btn md-btn-filled"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Nuevo Equipo
            </button>
          </div>
        )}
      </div>

      {canEdit && (
        <div id="solicitudes-paciente" className="md-card p-4 mb-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-gray-900">Solicitudes de equipos del paciente</div>
              <div className="text-xs text-gray-500 mt-0.5">
                Registros enviados por el visitador para crear equipos en el inventario.
              </div>
            </div>
            <div className="text-xs text-gray-500">Pendientes: {solicitudesPendientes.length}</div>
          </div>

          <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
            {solicitudesPendientes.length === 0 ? (
              <div className="text-sm text-gray-500">No hay solicitudes pendientes.</div>
            ) : (
              solicitudesPendientes.slice(0, 6).map((s) => (
                <div key={s.id} className="border rounded-lg p-3 bg-white">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-gray-900">{s.pacienteNombre}</div>
                      <div className="text-xs text-gray-500">
                        Doc: {s.pacienteDocumento} · Tipo: {s.tipoPropiedad}
                      </div>
                      <div className="text-xs text-gray-500">
                        Fotos: {s.fotos?.length || 0}
                      </div>
                    </div>
                    <button
                      className="md-btn md-btn-outlined"
                      onClick={() => setOpenSolicitud(s)}
                      type="button"
                    >
                      Revisar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEquipos.map((equipo) => {
            const { status, propiedad, tipoNormalizado, ubicacion } = getEquipoMeta(equipo);
            return (
              <div key={equipo.id} className="md-card p-5 hover:shadow-[var(--md-shadow-2)] transition-shadow relative">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-600 border border-gray-200">
                      {equipo.codigoInventario}
                    </span>
                    {equipo.disponibleParaEntrega === false && (
                      <span className="text-[10px] uppercase px-2 py-1 rounded-full border border-amber-200 bg-amber-50 text-amber-800">
                        Pendiente acta interna
                      </span>
                    )}
                  </div>
                  <StatusBadge status={status} />
                </div>
                <h3 className="text-lg font-bold text-gray-900">{equipo.nombre}</h3>
                <div className="flex flex-col text-sm text-gray-600 mb-1">
                  <span>{equipo.marca} - {equipo.modelo}</span>
                  <span className="text-xs text-gray-400 font-mono mt-0.5">S/N: {equipo.numeroSerie}</span>
                </div>
                
                <div className="mt-2 flex items-center">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${propiedad.className}`}
                  >
                    {propiedad.label}
                  </span>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100 text-sm space-y-1">
                  <p><span className="font-semibold text-gray-500">Ubicación:</span> {ubicacion}</p>
                  <p className="truncate"><span className="font-semibold text-gray-500">Obs:</span> {equipo.observaciones}</p>
                  {equipo.fechaIngreso && (
                    <p className="text-xs text-gray-500 mt-2">
                      <span className="font-semibold">Ingreso:</span> {new Date(equipo.fechaIngreso).toLocaleDateString('es-CO')}
                    </p>
                  )}
                  {tipoNormalizado === TipoPropiedad.ALQUILADO && equipo.empresaAlquiler && (
                     <p className="text-xs text-amber-700 mt-2 bg-amber-50 p-1 rounded">
                       <strong>Empresa alquiler:</strong> {equipo.empresaAlquiler}
                     </p>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-gray-500 font-medium bg-gray-50 px-2 py-1 rounded">
                        Historial: {assignmentCounts[equipo.id] || 0} registros
                    </span>
                    <button 
                        onClick={() => openHistory(equipo)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold underline"
                    >
                        Ver Hoja de Vida
                    </button>
                </div>

                {canEdit && (
                  <div className="mt-4 grid grid-cols-1 gap-2">
                    <button onClick={() => openEdit(equipo)} className="w-full md-btn md-btn-outlined">
                      Editar / Cambiar Estado
                    </button>
                    <button
                      onClick={() => handleDeleteEquipo(equipo)}
                      className="w-full md-btn md-btn-outlined border-red-200 text-red-700 hover:bg-red-50"
                    >
                      Eliminar equipo
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {filteredEquipos.length === 0 && (
            <div className="col-span-full py-12 text-center text-gray-500">
              No se encontraron equipos con los criterios de búsqueda.
            </div>
          )}
        </div>
      ) : (
        <div className="md-card p-0 overflow-auto">
          {filteredEquipos.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              No se encontraron equipos con los criterios de búsqueda.
            </div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">Código</th>
                  <th className="px-4 py-3 text-left">Equipo</th>
                  <th className="px-4 py-3 text-left">Serie</th>
                  <th className="px-4 py-3 text-left">Ubicación</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-left">Propiedad</th>
                  <th className="px-4 py-3 text-left">Ingreso</th>
                  <th className="px-4 py-3 text-left">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filteredEquipos.map((equipo) => {
                  const { status, propiedad, tipoNormalizado, ubicacion } = getEquipoMeta(equipo);
                  return (
                    <tr key={equipo.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 align-top">
                        <div className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-600 inline-block border border-gray-200">
                          {equipo.codigoInventario}
                        </div>
                        {equipo.disponibleParaEntrega === false && (
                          <div className="mt-2 text-[10px] uppercase px-2 py-1 rounded-full border border-amber-200 bg-amber-50 text-amber-800 inline-block">
                            Pendiente acta interna
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">{equipo.nombre}</div>
                        <div className="text-xs text-gray-500">{equipo.marca} - {equipo.modelo}</div>
                        {tipoNormalizado === TipoPropiedad.ALQUILADO && equipo.empresaAlquiler && (
                          <div className="text-[11px] text-amber-700 mt-1">{equipo.empresaAlquiler}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-500">
                        {equipo.numeroSerie}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{ubicacion}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={status} />
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${propiedad.className}`}>
                          {propiedad.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {equipo.fechaIngreso ? new Date(equipo.fechaIngreso).toLocaleDateString('es-CO') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => openHistory(equipo)} className="md-btn md-btn-outlined">
                            Hoja de Vida
                          </button>
                          {canEdit && (
                            <>
                              <button onClick={() => openEdit(equipo)} className="md-btn md-btn-outlined">
                                Editar
                              </button>
                              <button
                                onClick={() => handleDeleteEquipo(equipo)}
                                className="md-btn md-btn-outlined border-red-200 text-red-700 hover:bg-red-50"
                              >
                                Eliminar
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {openSolicitud && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-gray-900">Solicitud de equipo del paciente</div>
                <div className="text-xs text-gray-500">
                  {openSolicitud.pacienteNombre} · Doc: {openSolicitud.pacienteDocumento}
                </div>
              </div>
              <button className="md-btn md-btn-outlined" onClick={() => setOpenSolicitud(null)} type="button">
                Cerrar
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="md-card p-4">
                <div className="text-sm text-gray-700">
                  <span className="font-semibold">Tipo propiedad:</span> {openSolicitud.tipoPropiedad}
                </div>
                {openSolicitud.equipoNombre && (
                  <div className="text-sm text-gray-700 mt-2">
                    <span className="font-semibold">Equipo reportado:</span> {openSolicitud.equipoNombre}
                  </div>
                )}
                {openSolicitud.tipoPropiedad === TipoPropiedad.ALQUILADO && openSolicitud.empresaAlquiler && (
                  <div className="text-sm text-gray-700 mt-2">
                    <span className="font-semibold">Empresa de alquiler:</span> {openSolicitud.empresaAlquiler}
                  </div>
                )}
                {openSolicitud.observaciones && (
                  <div className="text-sm text-gray-700 mt-2">
                    <span className="font-semibold">Observaciones:</span> {openSolicitud.observaciones}
                  </div>
                )}
                {openSolicitud.createdAt && (
                  <div className="text-xs text-gray-500 mt-2">
                    Creada: {new Date(openSolicitud.createdAt).toLocaleDateString()}
                  </div>
                )}
              </div>

              <div className="md-card p-4">
                <div className="text-sm font-semibold text-gray-900 mb-3">Fotos</div>
                {openSolicitud.fotos?.length ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {openSolicitud.fotos.map((f, idx) => (
                      <a
                        key={f.path || idx}
                        href={f.path ? solicitudFotoUrls[f.path] : undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="block border rounded-lg overflow-hidden bg-gray-50"
                      >
                        {f.path && solicitudFotoUrls[f.path] ? (
                          <img
                            src={solicitudFotoUrls[f.path]}
                            alt={`Foto ${idx + 1}`}
                            className="w-full h-56 object-cover"
                          />
                        ) : (
                          <div className="h-56 flex items-center justify-center text-sm text-gray-400">
                            Cargando...
                          </div>
                        )}
                        <div className="p-2 text-xs text-gray-500 truncate">{f.name}</div>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">Sin fotos.</div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <button
                  className="md-btn md-btn-outlined"
                  onClick={() => setOpenSolicitud(null)}
                  type="button"
                >
                  Cerrar
                </button>
                <button
                  className="md-btn md-btn-filled"
                  onClick={() => {
                    if (!openSolicitud) return;
                    openCreateFromSolicitud(openSolicitud);
                    setOpenSolicitud(null);
                  }}
                  type="button"
                >
                  Crear equipo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Crear/Editar */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4">
          <div className="bg-white p-6 rounded-lg w-full max-w-3xl max-h-[calc(100vh-2rem)] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">{formData.id ? 'Editar Equipo' : 'Nuevo Equipo'}</h3>
            {solicitudContext && (
              <div className="mb-4 border border-blue-100 bg-blue-50 text-blue-800 rounded-lg p-3 text-xs">
                Creando equipo desde solicitud de paciente:{' '}
                <span className="font-semibold">{solicitudContext.pacienteNombre}</span> ·{' '}
                {solicitudContext.pacienteDocumento} · Tipo: {solicitudContext.tipoPropiedad}
                <div className="mt-1 text-[11px] text-blue-700">El tipo de propiedad queda fijo según la solicitud.</div>
              </div>
            )}
            <form onSubmit={handleSave} className="space-y-4">
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium">Código Inventario</label>
                    <input 
                      className="w-full border p-2 rounded bg-gray-100 text-gray-600 cursor-not-allowed" 
                      value={formData.id ? formData.codigoInventario : 'Autogenerado (MBG/MBP/MBA/MBE)'} 
                      disabled 
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      {formData.id ? 'No editable' : 'Se asignará automáticamente al guardar'}
                    </p>
                </div>
                <div>
                    <label className="block text-sm font-medium">Número de Serie</label>
                    <input
                      className="w-full border p-2 rounded"
                      value={formData.numeroSerie || ''}
                      onChange={(e) => {
                        setFormData({ ...formData, numeroSerie: e.target.value });
                        if (serialError) setSerialError(null);
                      }}
                      onBlur={handleSerieBlur}
                      required
                    />
                    {serialChecking && (
                      <p className="text-xs text-gray-500 mt-1">Validando serial...</p>
                    )}
                    {serialError && !serialChecking && (
                      <p className="text-xs text-red-600 mt-1">{serialError}</p>
                    )}
                </div>
              </div>

              <div>
                  <label className="block text-sm font-medium">Nombre del Equipo</label>
                  <input className="w-full border p-2 rounded" value={formData.nombre || ''} onChange={e => setFormData({...formData, nombre: e.target.value})} required />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium">Marca</label>
                    <input className="w-full border p-2 rounded" value={formData.marca || ''} onChange={e => setFormData({...formData, marca: e.target.value})} required />
                </div>
                <div>
                    <label className="block text-sm font-medium">Modelo</label>
                    <input className="w-full border p-2 rounded" value={formData.modelo || ''} onChange={e => setFormData({...formData, modelo: e.target.value})} required />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium">Tipo de equipo (plantilla)</label>
                <div className="flex flex-wrap gap-2">
                  <select
                    className="flex-1 border p-2 rounded min-w-[220px]"
                    value={formData.tipoEquipoId || ''}
                    onChange={(e) => setFormData({ ...formData, tipoEquipoId: e.target.value || undefined })}
                  >
                    <option value="">-- Seleccionar tipo --</option>
                    {tiposEquipo.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="md-btn md-btn-outlined"
                    onClick={() => openTiposEquipo()}
                  >
                    Gestionar tipos
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Selecciona una plantilla para autocompletar los datos fijos de hoja de vida.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium">Fecha de Ingreso</label>
                  <input
                    type="date"
                    className="w-full border p-2 rounded"
                    value={isoToDateInput(formData.fechaIngreso)}
                    onChange={(e) => {
                      const dateStr = e.target.value;
                      const d = new Date(`${dateStr}T12:00:00`);
                      setFormData({
                        ...formData,
                        fechaIngreso: Number.isNaN(d.getTime()) ? undefined : d.toISOString(),
                      });
                    }}
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">Registra el año/fecha real de ingreso al inventario.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium">Ubicación Inicial</label>
                  <input
                    className="w-full border p-2 rounded"
                    value={formData.ubicacionActual || ''}
                    onChange={(e) => setFormData({ ...formData, ubicacionActual: e.target.value })}
                    placeholder="Ej: Bodega"
                  />
                  <p className="text-xs text-gray-400 mt-1">Si está vacío, se guardará como “Bodega”.</p>
                </div>
              </div>

              <div className="border rounded-lg p-3 bg-gray-50">
                <label className="block text-sm font-medium">Imagen del equipo</label>
                <div className="mt-2 flex flex-col md:flex-row gap-4 items-start">
                  <div className="w-40 h-28 border rounded bg-white flex items-center justify-center overflow-hidden">
                    {equipoFotoUrl ? (
                      <img
                        src={equipoFotoUrl}
                        alt="Equipo"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-xs text-gray-400">Sin imagen</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={(e) => {
                        setEquipoFotoFile(e.target.files?.[0] || null);
                        setRemoveEquipoFoto(false);
                      }}
                    />
                    <p className="text-xs text-gray-400 mt-1">PNG o JPG, máximo 5MB.</p>
                    {removeEquipoFoto && (
                      <p className="text-xs text-red-600 mt-1">La imagen se eliminará al guardar.</p>
                    )}
                    {!removeEquipoFoto && (equipoFotoUrl || formData.fotoEquipo?.path) && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {equipoFotoFile && (
                          <button
                            type="button"
                            className="md-btn md-btn-outlined"
                            onClick={() => {
                              setEquipoFotoFile(null);
                              setEquipoFotoPreview(null);
                            }}
                          >
                            Quitar selección
                          </button>
                        )}
                        <button
                          type="button"
                          className="md-btn md-btn-outlined border-red-200 text-red-700 hover:bg-red-50"
                          onClick={() => {
                            setEquipoFotoFile(null);
                            setEquipoFotoPreview(null);
                            setRemoveEquipoFoto(true);
                          }}
                        >
                          Eliminar imagen
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <details className="border rounded-lg p-3 bg-gray-50">
                <summary className="text-sm font-semibold text-gray-800 cursor-pointer">
                  Hoja de vida (datos variables)
                </summary>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium">Empresa</label>
                    <input
                      className="w-full border p-2 rounded"
                      value={formData.hojaVidaDatos?.empresa || EMPRESA_DEFAULT}
                      onChange={(e) => updateHojaVidaDatos({ empresa: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium">Sede</label>
                    <input
                      className="w-full border p-2 rounded"
                      value={formData.hojaVidaDatos?.sede || SEDE_DEFAULT}
                      onChange={(e) => updateHojaVidaDatos({ sede: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium">Servicio</label>
                    <select
                      className="w-full border p-2 rounded"
                      value={formData.hojaVidaDatos?.servicio || ''}
                      onChange={(e) => updateHojaVidaDatos({ servicio: e.target.value })}
                    >
                      <option value="">Selecciona...</option>
                      <option value="ATENCION DOMICILIARIA">ATENCION DOMICILIARIA</option>
                      <option value="CONSULTA EXTERNA">CONSULTA EXTERNA</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium">Tipo equipo</label>
                    <select
                      className="w-full border p-2 rounded"
                      value={formData.hojaVidaDatos?.tipoEquipo || ''}
                      onChange={(e) => updateHojaVidaDatos({ tipoEquipo: e.target.value })}
                    >
                      <option value="">Selecciona...</option>
                      <option value="MOVIL">MOVIL</option>
                      <option value="FIJO">FIJO</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium">Registro INVIMA</label>
                    <input
                      className="w-full border p-2 rounded"
                      value={formData.hojaVidaDatos?.registroInvima || ''}
                      onChange={(e) => updateHojaVidaDatos({ registroInvima: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium">Riesgo</label>
                    <select
                      className="w-full border p-2 rounded"
                      value={formData.hojaVidaDatos?.riesgo || ''}
                      onChange={(e) => updateHojaVidaDatos({ riesgo: e.target.value })}
                    >
                      <option value="">Selecciona...</option>
                      <option value="CLASE I">CLASE I</option>
                      <option value="CLASE IIA">CLASE IIA</option>
                      <option value="CLASE IIB">CLASE IIB</option>
                      <option value="CLASE III">CLASE III</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium">Forma de adquisición</label>
                    <select
                      className="w-full border p-2 rounded"
                      value={formData.hojaVidaDatos?.formaAdquisicion || ''}
                      onChange={(e) => updateHojaVidaDatos({ formaAdquisicion: e.target.value })}
                    >
                      <option value="">Selecciona...</option>
                      <option value="COMPRA">COMPRA</option>
                      <option value="TRASLADO">TRASLADO</option>
                      <option value="DONACION">DONACION</option>
                      <option value="ARRENDAMIENTO">ARRENDAMIENTO</option>
                      <option value="COMODATO">COMODATO</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium">Costo de adquisición</label>
                    <input
                      className="w-full border p-2 rounded"
                      value={formData.hojaVidaDatos?.costoAdquisicion || ''}
                      onChange={(e) => updateHojaVidaDatos({ costoAdquisicion: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium">Fecha de instalación</label>
                    <input
                      type="date"
                      className="w-full border p-2 rounded"
                      value={isoToDateInput(formData.hojaVidaDatos?.fechaInstalacion)}
                      onChange={(e) => {
                        const dateStr = e.target.value;
                        const d = new Date(`${dateStr}T12:00:00`);
                        updateHojaVidaDatos({
                          fechaInstalacion: Number.isNaN(d.getTime()) ? undefined : d.toISOString(),
                        });
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium">Proveedor</label>
                    <input
                      className="w-full border p-2 rounded"
                      value={formData.hojaVidaDatos?.proveedor || ''}
                      onChange={(e) => updateHojaVidaDatos({ proveedor: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium">Estado del equipo</label>
                    <input
                      className="w-full border p-2 rounded"
                      value={formData.hojaVidaDatos?.estadoEquipo || ''}
                      onChange={(e) => updateHojaVidaDatos({ estadoEquipo: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium">Garantía</label>
                    <input
                      className="w-full border p-2 rounded"
                      value={formData.hojaVidaDatos?.garantia || ''}
                      onChange={(e) => updateHojaVidaDatos({ garantia: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium">Fecha de vencimiento</label>
                    <input
                      type="date"
                      className="w-full border p-2 rounded"
                      value={isoToDateInput(formData.hojaVidaDatos?.fechaVencimiento)}
                      onChange={(e) => {
                        const dateStr = e.target.value;
                        const d = new Date(`${dateStr}T12:00:00`);
                        updateHojaVidaDatos({
                          fechaVencimiento: Number.isNaN(d.getTime()) ? undefined : d.toISOString(),
                        });
                      }}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium">Accesorios</label>
                    <input
                      className="w-full border p-2 rounded"
                      value={formData.hojaVidaDatos?.accesorios || ''}
                      onChange={(e) => updateHojaVidaDatos({ accesorios: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium">Manuales (SI/NO)</label>
                    <select
                      className="w-full border p-2 rounded"
                      value={formData.hojaVidaDatos?.manuales || ''}
                      onChange={(e) => updateHojaVidaDatos({ manuales: e.target.value })}
                    >
                      <option value="">Selecciona...</option>
                      <option value="SI">SI</option>
                      <option value="NO">NO</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium">Manuales (cuáles)</label>
                    <input
                      className="w-full border p-2 rounded"
                      value={formData.hojaVidaDatos?.manualesCuales || ''}
                      onChange={(e) => updateHojaVidaDatos({ manualesCuales: e.target.value })}
                    />
                  </div>
                </div>
              </details>

              <details className="border rounded-lg p-3">
                <summary className="text-sm font-semibold text-gray-800 cursor-pointer">
                  Datos fijos por tipo (override opcional)
                </summary>
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium">Dirección (empresa)</label>
                      <input
                        className="w-full border p-2 rounded"
                        value={
                          formData.hojaVidaOverrides?.direccionEmpresa ??
                          tipoSeleccionado?.fijos?.direccionEmpresa ??
                          formData.hojaVidaDatos?.direccionEmpresa ??
                          ''
                        }
                        onChange={(e) => updateHojaVidaOverrides({ direccionEmpresa: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium">Fabricante</label>
                      <input
                        className="w-full border p-2 rounded"
                        value={
                          formData.hojaVidaOverrides?.fabricante ??
                          tipoSeleccionado?.fijos?.fabricante ??
                          formData.hojaVidaDatos?.fabricante ??
                          ''
                        }
                        onChange={(e) => updateHojaVidaOverrides({ fabricante: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium">Clasificación biomédica</label>
                      <select
                        className="w-full border p-2 rounded"
                        value={
                          formData.hojaVidaOverrides?.clasificacionBiomedica ??
                          tipoSeleccionado?.fijos?.clasificacionBiomedica ??
                          formData.hojaVidaDatos?.clasificacionBiomedica ??
                          ''
                        }
                        onChange={(e) => updateHojaVidaOverrides({ clasificacionBiomedica: e.target.value })}
                      >
                        <option value="">Selecciona...</option>
                        <option value="DIAGNOSTICO">DIAGNOSTICO</option>
                        <option value="TRATAMIENTO Y MANTENIMIENTO DE LA VIDA">TRATAMIENTO Y MANTENIMIENTO DE LA VIDA</option>
                        <option value="PREVENCION">PREVENCION</option>
                        <option value="REHABILITACION">REHABILITACION</option>
                        <option value="ANALISIS DE LABORATORIO">ANALISIS DE LABORATORIO</option>
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium">Componentes</label>
                      <input
                        className="w-full border p-2 rounded"
                        value={
                          formData.hojaVidaOverrides?.componentes ??
                          tipoSeleccionado?.fijos?.componentes ??
                          formData.hojaVidaDatos?.componentes ??
                          ''
                        }
                        onChange={(e) => updateHojaVidaOverrides({ componentes: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium">Vida útil</label>
                      <input
                        className="w-full border p-2 rounded"
                        value={
                          formData.hojaVidaOverrides?.vidaUtil ??
                          tipoSeleccionado?.fijos?.vidaUtil ??
                          formData.hojaVidaDatos?.vidaUtil ??
                          ''
                        }
                        onChange={(e) => updateHojaVidaOverrides({ vidaUtil: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium">Definición</label>
                    <textarea
                      className="w-full border p-2 rounded"
                      rows={2}
                      value={formData.hojaVidaOverrides?.definicion ?? tipoSeleccionado?.fijos?.definicion ?? ''}
                      onChange={(e) => updateHojaVidaOverrides({ definicion: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium">Recomendaciones del fabricante</label>
                    <textarea
                      className="w-full border p-2 rounded"
                      rows={2}
                      value={formData.hojaVidaOverrides?.recomendacionesFabricante ?? tipoSeleccionado?.fijos?.recomendacionesFabricante ?? ''}
                      onChange={(e) => updateHojaVidaOverrides({ recomendacionesFabricante: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium">Periodicidad mantenimiento</label>
                      <input
                        className="w-full border p-2 rounded"
                        value={formData.hojaVidaOverrides?.periodicidadMantenimiento ?? tipoSeleccionado?.fijos?.periodicidadMantenimiento ?? ''}
                        onChange={(e) => updateHojaVidaOverrides({ periodicidadMantenimiento: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium">Calibración</label>
                      <input
                        className="w-full border p-2 rounded"
                        value={formData.hojaVidaOverrides?.calibracion ?? tipoSeleccionado?.fijos?.calibracion ?? ''}
                        onChange={(e) => updateHojaVidaOverrides({ calibracion: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium">Técnica de limpieza y desinfección</label>
                    <textarea
                      className="w-full border p-2 rounded"
                      rows={2}
                      value={formData.hojaVidaOverrides?.tecnicaLimpiezaDesinfeccion ?? tipoSeleccionado?.fijos?.tecnicaLimpiezaDesinfeccion ?? ''}
                      onChange={(e) => updateHojaVidaOverrides({ tecnicaLimpiezaDesinfeccion: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="font-semibold text-xs text-gray-700 col-span-2">Características físicas</div>
                    <input
                      className="w-full border p-2 rounded"
                      placeholder="Alto (cm)"
                      value={formData.hojaVidaOverrides?.caracteristicasFisicas?.altoCm ?? tipoSeleccionado?.fijos?.caracteristicasFisicas?.altoCm ?? ''}
                      onChange={(e) =>
                        updateHojaVidaOverrides({
                          caracteristicasFisicas: {
                            ...(formData.hojaVidaOverrides?.caracteristicasFisicas || tipoSeleccionado?.fijos?.caracteristicasFisicas || {}),
                            altoCm: e.target.value,
                          },
                        })
                      }
                    />
                    <input
                      className="w-full border p-2 rounded"
                      placeholder="Ancho (cm)"
                      value={formData.hojaVidaOverrides?.caracteristicasFisicas?.anchoCm ?? tipoSeleccionado?.fijos?.caracteristicasFisicas?.anchoCm ?? ''}
                      onChange={(e) =>
                        updateHojaVidaOverrides({
                          caracteristicasFisicas: {
                            ...(formData.hojaVidaOverrides?.caracteristicasFisicas || tipoSeleccionado?.fijos?.caracteristicasFisicas || {}),
                            anchoCm: e.target.value,
                          },
                        })
                      }
                    />
                    <input
                      className="w-full border p-2 rounded"
                      placeholder="Profundidad (cm)"
                      value={formData.hojaVidaOverrides?.caracteristicasFisicas?.profundidadCm ?? tipoSeleccionado?.fijos?.caracteristicasFisicas?.profundidadCm ?? ''}
                      onChange={(e) =>
                        updateHojaVidaOverrides({
                          caracteristicasFisicas: {
                            ...(formData.hojaVidaOverrides?.caracteristicasFisicas || tipoSeleccionado?.fijos?.caracteristicasFisicas || {}),
                            profundidadCm: e.target.value,
                          },
                        })
                      }
                    />
                    <input
                      className="w-full border p-2 rounded"
                      placeholder="Peso (kg)"
                      value={formData.hojaVidaOverrides?.caracteristicasFisicas?.pesoKg ?? tipoSeleccionado?.fijos?.caracteristicasFisicas?.pesoKg ?? ''}
                      onChange={(e) =>
                        updateHojaVidaOverrides({
                          caracteristicasFisicas: {
                            ...(formData.hojaVidaOverrides?.caracteristicasFisicas || tipoSeleccionado?.fijos?.caracteristicasFisicas || {}),
                            pesoKg: e.target.value,
                          },
                        })
                      }
                    />
                    <input
                      className="w-full border p-2 rounded"
                      placeholder="Temperatura (°C)"
                      value={formData.hojaVidaOverrides?.caracteristicasFisicas?.temperaturaC ?? tipoSeleccionado?.fijos?.caracteristicasFisicas?.temperaturaC ?? ''}
                      onChange={(e) =>
                        updateHojaVidaOverrides({
                          caracteristicasFisicas: {
                            ...(formData.hojaVidaOverrides?.caracteristicasFisicas || tipoSeleccionado?.fijos?.caracteristicasFisicas || {}),
                            temperaturaC: e.target.value,
                          },
                        })
                      }
                    />
                    <input
                      className="w-full border p-2 rounded"
                      placeholder="Capacidad"
                      value={formData.hojaVidaOverrides?.caracteristicasFisicas?.capacidad ?? tipoSeleccionado?.fijos?.caracteristicasFisicas?.capacidad ?? ''}
                      onChange={(e) =>
                        updateHojaVidaOverrides({
                          caracteristicasFisicas: {
                            ...(formData.hojaVidaOverrides?.caracteristicasFisicas || tipoSeleccionado?.fijos?.caracteristicasFisicas || {}),
                            capacidad: e.target.value,
                          },
                        })
                      }
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="font-semibold text-xs text-gray-700 col-span-2">Características eléctricas</div>
                    <input
                      className="w-full border p-2 rounded"
                      placeholder="Voltaje (V)"
                      value={formData.hojaVidaOverrides?.caracteristicasElectricas?.voltajeV ?? tipoSeleccionado?.fijos?.caracteristicasElectricas?.voltajeV ?? ''}
                      onChange={(e) =>
                        updateHojaVidaOverrides({
                          caracteristicasElectricas: {
                            ...(formData.hojaVidaOverrides?.caracteristicasElectricas || tipoSeleccionado?.fijos?.caracteristicasElectricas || {}),
                            voltajeV: e.target.value,
                          },
                        })
                      }
                    />
                    <input
                      className="w-full border p-2 rounded"
                      placeholder="Corriente (A)"
                      value={formData.hojaVidaOverrides?.caracteristicasElectricas?.corrienteA ?? tipoSeleccionado?.fijos?.caracteristicasElectricas?.corrienteA ?? ''}
                      onChange={(e) =>
                        updateHojaVidaOverrides({
                          caracteristicasElectricas: {
                            ...(formData.hojaVidaOverrides?.caracteristicasElectricas || tipoSeleccionado?.fijos?.caracteristicasElectricas || {}),
                            corrienteA: e.target.value,
                          },
                        })
                      }
                    />
                    <input
                      className="w-full border p-2 rounded"
                      placeholder="Potencia (W)"
                      value={formData.hojaVidaOverrides?.caracteristicasElectricas?.potenciaW ?? tipoSeleccionado?.fijos?.caracteristicasElectricas?.potenciaW ?? ''}
                      onChange={(e) =>
                        updateHojaVidaOverrides({
                          caracteristicasElectricas: {
                            ...(formData.hojaVidaOverrides?.caracteristicasElectricas || tipoSeleccionado?.fijos?.caracteristicasElectricas || {}),
                            potenciaW: e.target.value,
                          },
                        })
                      }
                    />
                    <input
                      className="w-full border p-2 rounded"
                      placeholder="Frecuencia (Hz)"
                      value={formData.hojaVidaOverrides?.caracteristicasElectricas?.frecuenciaHz ?? tipoSeleccionado?.fijos?.caracteristicasElectricas?.frecuenciaHz ?? ''}
                      onChange={(e) =>
                        updateHojaVidaOverrides({
                          caracteristicasElectricas: {
                            ...(formData.hojaVidaOverrides?.caracteristicasElectricas || tipoSeleccionado?.fijos?.caracteristicasElectricas || {}),
                            frecuenciaHz: e.target.value,
                          },
                        })
                      }
                    />
                    <input
                      className="w-full border p-2 rounded col-span-2"
                      placeholder="Tecnología predominante"
                      value={formData.hojaVidaOverrides?.caracteristicasElectricas?.tecnologiaPredominante ?? tipoSeleccionado?.fijos?.caracteristicasElectricas?.tecnologiaPredominante ?? ''}
                      onChange={(e) =>
                        updateHojaVidaOverrides({
                          caracteristicasElectricas: {
                            ...(formData.hojaVidaOverrides?.caracteristicasElectricas || tipoSeleccionado?.fijos?.caracteristicasElectricas || {}),
                            tecnologiaPredominante: e.target.value,
                          },
                        })
                      }
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="font-semibold text-xs text-gray-700 col-span-3">Otros suministros</div>
                    <input
                      className="w-full border p-2 rounded"
                      placeholder="Oxígeno O2"
                      value={formData.hojaVidaOverrides?.otrosSuministros?.oxigenoO2 ?? tipoSeleccionado?.fijos?.otrosSuministros?.oxigenoO2 ?? ''}
                      onChange={(e) =>
                        updateHojaVidaOverrides({
                          otrosSuministros: {
                            ...(formData.hojaVidaOverrides?.otrosSuministros || tipoSeleccionado?.fijos?.otrosSuministros || {}),
                            oxigenoO2: e.target.value,
                          },
                        })
                      }
                    />
                    <input
                      className="w-full border p-2 rounded"
                      placeholder="Aire"
                      value={formData.hojaVidaOverrides?.otrosSuministros?.aire ?? tipoSeleccionado?.fijos?.otrosSuministros?.aire ?? ''}
                      onChange={(e) =>
                        updateHojaVidaOverrides({
                          otrosSuministros: {
                            ...(formData.hojaVidaOverrides?.otrosSuministros || tipoSeleccionado?.fijos?.otrosSuministros || {}),
                            aire: e.target.value,
                          },
                        })
                      }
                    />
                    <input
                      className="w-full border p-2 rounded"
                      placeholder="Agua"
                      value={formData.hojaVidaOverrides?.otrosSuministros?.agua ?? tipoSeleccionado?.fijos?.otrosSuministros?.agua ?? ''}
                      onChange={(e) =>
                        updateHojaVidaOverrides({
                          otrosSuministros: {
                            ...(formData.hojaVidaOverrides?.otrosSuministros || tipoSeleccionado?.fijos?.otrosSuministros || {}),
                            agua: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                </div>
              </details>

              {/* Selección de Propiedad */}
              <div>
                <label className="block text-sm font-medium mb-1">Propiedad del Equipo</label>
                <div className="grid grid-cols-2 gap-3">
                  <label
                    className={`flex items-center space-x-2 border p-2 rounded w-full ${
                      propiedadLocked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="tipoPropiedad"
                      value={TipoPropiedad.MEDICUC}
                      checked={formData.tipoPropiedad === TipoPropiedad.MEDICUC}
                      onChange={() => setFormData({ ...formData, tipoPropiedad: TipoPropiedad.MEDICUC })}
                      disabled={propiedadLocked}
                    />
                    <span>Medicuc</span>
                  </label>
                  <label
                    className={`flex items-center space-x-2 border p-2 rounded w-full ${
                      propiedadLocked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="tipoPropiedad"
                      value={TipoPropiedad.PACIENTE}
                      checked={formData.tipoPropiedad === TipoPropiedad.PACIENTE}
                      onChange={() => setFormData({ ...formData, tipoPropiedad: TipoPropiedad.PACIENTE })}
                      disabled={propiedadLocked}
                    />
                    <span>Paciente</span>
                  </label>
                  <label
                    className={`flex items-center space-x-2 border p-2 rounded w-full ${
                      propiedadLocked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="tipoPropiedad"
                      value={TipoPropiedad.ALQUILADO}
                      checked={formData.tipoPropiedad === TipoPropiedad.ALQUILADO}
                      onChange={() => setFormData({ ...formData, tipoPropiedad: TipoPropiedad.ALQUILADO })}
                      disabled={propiedadLocked}
                    />
                    <span>Alquilado</span>
                  </label>
                  <label
                    className={`flex items-center space-x-2 border p-2 rounded w-full ${
                      propiedadLocked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="tipoPropiedad"
                      value={TipoPropiedad.EMPLEADO}
                      checked={formData.tipoPropiedad === TipoPropiedad.EMPLEADO}
                      onChange={() => setFormData({ ...formData, tipoPropiedad: TipoPropiedad.EMPLEADO })}
                      disabled={propiedadLocked}
                    />
                    <span>Empleado</span>
                  </label>
                </div>
              </div>

              {formData.tipoPropiedad === TipoPropiedad.ALQUILADO && (
                <div className="bg-amber-50 p-4 rounded border border-amber-200 space-y-3">
                  <h4 className="text-sm font-bold text-amber-800">Empresa de alquiler</h4>
                  <div>
                    <label className="block text-xs font-medium text-gray-700">Nombre de la empresa</label>
                    <input
                      required
                      className="w-full border p-2 rounded text-sm focus:ring-amber-500"
                      value={formData.empresaAlquiler || ''}
                      onChange={(e) => setFormData({ ...formData, empresaAlquiler: e.target.value })}
                    />
                  </div>
                  {solicitudContext && !formData.id && (
                    <SignatureImageInput
                      value={autoActaFirma}
                      onChange={setAutoActaFirma}
                      required
                      label="Firma Biomédico (acta interna)"
                      helperText="Se usará para generar el acta interna automáticamente."
                    />
                  )}
                </div>
              )}
              
              {/* Cambio de Estado - Solo visible al editar */}
              {formData.id && (
                <div>
                   <label className="block text-sm font-medium text-red-600">Estado Técnico</label>
                   <select 
                     className="w-full border p-2 rounded bg-red-50"
                     value={formData.estado}
                     onChange={e => setFormData({...formData, estado: e.target.value as EstadoEquipo})}
                   >
                     <option value={EstadoEquipo.DISPONIBLE}>Disponible</option>
                     <option value={EstadoEquipo.MANTENIMIENTO}>En Mantenimiento</option>
                     <option value={EstadoEquipo.DADO_DE_BAJA}>Dar de Baja</option>
                     <option value={EstadoEquipo.ASIGNADO} disabled>Asignado (Automático)</option>
                   </select>
                </div>
              )}

              {formData.estado === EstadoEquipo.MANTENIMIENTO && (
                <div>
                  <label className="block text-sm font-medium">Fecha de mantenimiento</label>
                  <input
                    type="date"
                    className="w-full border p-2 rounded"
                    value={isoToDateInput(formData.fechaMantenimiento)}
                    onChange={(e) => {
                      const dateStr = e.target.value;
                      const d = new Date(`${dateStr}T12:00:00`);
                      setFormData({
                        ...formData,
                        fechaMantenimiento: Number.isNaN(d.getTime()) ? undefined : d.toISOString(),
                      });
                    }}
                    required
                  />
                </div>
              )}

              {formData.estado === EstadoEquipo.DADO_DE_BAJA && (
                <div>
                  <label className="block text-sm font-medium">Fecha de baja</label>
                  <input
                    type="date"
                    className="w-full border p-2 rounded"
                    value={isoToDateInput(formData.fechaBaja)}
                    onChange={(e) => {
                      const dateStr = e.target.value;
                      const d = new Date(`${dateStr}T12:00:00`);
                      setFormData({
                        ...formData,
                        fechaBaja: Number.isNaN(d.getTime()) ? undefined : d.toISOString(),
                      });
                    }}
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium">Observaciones</label>
                <textarea className="w-full border p-2 rounded" rows={3} value={formData.observaciones || ''} onChange={e => setFormData({...formData, observaciones: e.target.value})} />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setSolicitudContext(null);
                    setEquipoFotoFile(null);
                    setEquipoFotoPreview(null);
                    setRemoveEquipoFoto(false);
                  }}
                  className="px-4 py-2 border rounded hover:bg-gray-100"
                >
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Historial / Hoja de Vida */}
      {isHistoryOpen && historyEquipo && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-gray-50 rounded-t-lg">
                <div>
                    <h3 className="text-xl font-bold text-gray-800">Hoja de Vida del Equipo</h3>
                    <p className="text-sm text-gray-600">{historyEquipo.equipo.nombre} - {historyEquipo.equipo.marca} {historyEquipo.equipo.modelo}</p>
                    <p className="text-xs font-mono text-gray-500 mt-1">S/N: {historyEquipo.equipo.numeroSerie} | Inv: {historyEquipo.equipo.codigoInventario}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={handlePrintHojaVida} className="md-btn md-btn-filled">
                    Imprimir / Guardar PDF
                  </button>
                  <button onClick={() => setIsHistoryOpen(false)} className="text-gray-400 hover:text-gray-600">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
                <div className="md-card p-4 mb-4">
                  <div className="text-sm font-semibold text-gray-800 mb-2">Datos técnicos</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <div><span className="text-gray-500">Empresa:</span> {historyDatos?.empresa || EMPRESA_DEFAULT}</div>
                    <div><span className="text-gray-500">Sede:</span> {historyDatos?.sede || SEDE_DEFAULT}</div>
                    <div className="md:col-span-2"><span className="text-gray-500">Dirección:</span> {historyFijos.direccionEmpresa || historyDatos?.direccionEmpresa || '—'}</div>
                    <div><span className="text-gray-500">Equipo:</span> {historyEquipo.equipo.nombre}</div>
                    <div><span className="text-gray-500">Tipo plantilla:</span> {historyTipo?.nombre || '—'}</div>
                    <div className="md:col-span-2"><span className="text-gray-500">Definición:</span> {historyFijos.definicion || '—'}</div>
                    <div><span className="text-gray-500">Marca:</span> {historyEquipo.equipo.marca}</div>
                    <div><span className="text-gray-500">Modelo:</span> {historyEquipo.equipo.modelo}</div>
                    <div><span className="text-gray-500">Serie:</span> {historyEquipo.equipo.numeroSerie || '—'}</div>
                    <div><span className="text-gray-500">Fabricante:</span> {historyFijos.fabricante || historyDatos?.fabricante || '—'}</div>
                    <div><span className="text-gray-500">Servicio:</span> {historyServicio}</div>
                    <div><span className="text-gray-500">Ubicación:</span> {historyUbicacion}</div>
                    <div><span className="text-gray-500">Tipo equipo:</span> {historyDatos?.tipoEquipo || '—'}</div>
                    <div><span className="text-gray-500">Registro INVIMA:</span> {historyDatos?.registroInvima || '—'}</div>
                    <div><span className="text-gray-500">N° Inventario:</span> {historyEquipo.equipo.codigoInventario}</div>
                    <div><span className="text-gray-500">Clasificación biomédica:</span> {historyFijos.clasificacionBiomedica || historyDatos?.clasificacionBiomedica || '—'}</div>
                    <div><span className="text-gray-500">Riesgo:</span> {historyDatos?.riesgo || '—'}</div>
                    <div className="md:col-span-2"><span className="text-gray-500">Componentes:</span> {historyFijos.componentes || historyDatos?.componentes || '—'}</div>
                  </div>
                </div>

                <div className="md-card p-4 mb-4">
                  <div className="text-sm font-semibold text-gray-800 mb-2">Generalidades</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <div><span className="text-gray-500">Forma adquisición:</span> {historyDatos?.formaAdquisicion || '—'}</div>
                    <div><span className="text-gray-500">Costo adquisición:</span> {historyDatos?.costoAdquisicion || '—'}</div>
                    <div><span className="text-gray-500">Fecha instalación:</span> {formatDate(historyDatos?.fechaInstalacion)}</div>
                    <div><span className="text-gray-500">Vida útil:</span> {historyFijos.vidaUtil || historyDatos?.vidaUtil || '—'}</div>
                    <div><span className="text-gray-500">Proveedor:</span> {historyDatos?.proveedor || '—'}</div>
                    <div><span className="text-gray-500">Estado del equipo:</span> {historyDatos?.estadoEquipo || '—'}</div>
                    <div><span className="text-gray-500">Garantía:</span> {historyDatos?.garantia || '—'}</div>
                    <div><span className="text-gray-500">Fecha vencimiento:</span> {formatDate(historyDatos?.fechaVencimiento)}</div>
                    <div className="md:col-span-2"><span className="text-gray-500">Accesorios:</span> {historyDatos?.accesorios || '—'}</div>
                    <div><span className="text-gray-500">Manuales:</span> {historyDatos?.manuales || '—'}</div>
                    <div><span className="text-gray-500">Manuales (cuáles):</span> {historyDatos?.manualesCuales || '—'}</div>
                  </div>
                </div>

                <div className="md-card p-4 mb-4">
                  <div className="text-sm font-semibold text-gray-800 mb-2">Datos fijos por tipo</div>
                  <div className="grid grid-cols-1 gap-2 text-sm">
                    <div><span className="text-gray-500">Recomendaciones fabricante:</span> {historyFijos.recomendacionesFabricante || '—'}</div>
                    <div><span className="text-gray-500">Periodicidad mantenimiento:</span> {historyFijos.periodicidadMantenimiento || '—'}</div>
                    <div><span className="text-gray-500">Calibración:</span> {historyFijos.calibracion || '—'}</div>
                    <div><span className="text-gray-500">Técnica limpieza/desinfección:</span> {historyFijos.tecnicaLimpiezaDesinfeccion || '—'}</div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <div className="md:col-span-2 font-semibold text-gray-700">Características físicas</div>
                    <div><span className="text-gray-500">Alto (cm):</span> {historyFijos.caracteristicasFisicas?.altoCm || '—'}</div>
                    <div><span className="text-gray-500">Ancho (cm):</span> {historyFijos.caracteristicasFisicas?.anchoCm || '—'}</div>
                    <div><span className="text-gray-500">Profundidad (cm):</span> {historyFijos.caracteristicasFisicas?.profundidadCm || '—'}</div>
                    <div><span className="text-gray-500">Peso (kg):</span> {historyFijos.caracteristicasFisicas?.pesoKg || '—'}</div>
                    <div><span className="text-gray-500">Temperatura (°C):</span> {historyFijos.caracteristicasFisicas?.temperaturaC || '—'}</div>
                    <div><span className="text-gray-500">Capacidad:</span> {historyFijos.caracteristicasFisicas?.capacidad || '—'}</div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <div className="md:col-span-2 font-semibold text-gray-700">Características eléctricas</div>
                    <div><span className="text-gray-500">Voltaje (V):</span> {historyFijos.caracteristicasElectricas?.voltajeV || '—'}</div>
                    <div><span className="text-gray-500">Corriente (A):</span> {historyFijos.caracteristicasElectricas?.corrienteA || '—'}</div>
                    <div><span className="text-gray-500">Potencia (W):</span> {historyFijos.caracteristicasElectricas?.potenciaW || '—'}</div>
                    <div><span className="text-gray-500">Frecuencia (Hz):</span> {historyFijos.caracteristicasElectricas?.frecuenciaHz || '—'}</div>
                    <div className="md:col-span-2"><span className="text-gray-500">Tecnología:</span> {historyFijos.caracteristicasElectricas?.tecnologiaPredominante || '—'}</div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                    <div className="md:col-span-3 font-semibold text-gray-700">Otros suministros</div>
                    <div><span className="text-gray-500">Oxígeno O2:</span> {historyFijos.otrosSuministros?.oxigenoO2 || '—'}</div>
                    <div><span className="text-gray-500">Aire:</span> {historyFijos.otrosSuministros?.aire || '—'}</div>
                    <div><span className="text-gray-500">Agua:</span> {historyFijos.otrosSuministros?.agua || '—'}</div>
                  </div>
                </div>

                {historyEquipo.data.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                        <p>Este equipo no tiene historial registrado.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center mb-2">
	                            <h4 className="font-semibold text-gray-700">Historial ({historyEquipo.data.length} registros)</h4>
	                        </div>
	                        <div className="border rounded-lg overflow-hidden">
	                            <table className="min-w-full divide-y divide-gray-200">
	                                <thead className="bg-gray-50">
	                                    <tr>
	                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Acta #</th>
	                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
	                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Receptor</th>
	                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fecha Inicio</th>
	                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fecha Fin</th>
	                                    </tr>
	                                </thead>
	                                <tbody className="bg-white divide-y divide-gray-200">
	                                    {historyEquipo.data.map((h, idx) => (
	                                        <tr key={h.id || idx} className="hover:bg-gray-50">
	                                            <td className="px-4 py-2 text-xs font-mono font-bold text-gray-600">
	                                                {h.consecutivo ? String(h.consecutivo).padStart(4, '0') : '-'}
	                                            </td>
	                                            <td className="px-4 py-2 text-xs font-semibold">
	                                              <span
	                                                className={
	                                                  h.tipo === 'PROFESIONAL'
	                                                    ? 'px-2 py-0.5 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-800'
	                                                    : h.tipo === 'MANTENIMIENTO'
	                                                      ? 'px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-800'
	                                                      : h.tipo === 'BAJA'
	                                                        ? 'px-2 py-0.5 rounded-full border border-red-200 bg-red-50 text-red-700'
	                                                        : 'px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800'
	                                                }
	                                              >
	                                                {h.tipo}
	                                              </span>
	                                            </td>
	                                            <td className="px-4 py-2 text-sm text-gray-900">
	                                              {h.tipo === 'MANTENIMIENTO' || h.tipo === 'BAJA' ? (
	                                                <div className="text-sm text-gray-600">{h.nombre}</div>
	                                              ) : (
	                                                <>
	                                                  <div className="font-medium">{h.nombre}</div>
	                                                  <div className="text-xs text-gray-500">{h.doc}</div>
	                                                </>
	                                              )}
	                                            </td>
	                                            <td className="px-4 py-2 text-sm text-gray-500">
	                                              {new Date(h.fecha).toLocaleDateString()}
	                                            </td>
	                                            <td className="px-4 py-2 text-sm text-gray-500">
	                                              {h.tipo === 'MANTENIMIENTO' || h.tipo === 'BAJA' ? (
	                                                '-'
	                                              ) : h.fechaFin ? (
	                                                new Date(h.fechaFin).toLocaleDateString()
	                                              ) : (
	                                                <span className="text-green-600 text-xs font-bold border border-green-200 bg-green-50 px-1 rounded">
	                                                  ACTUAL
	                                                </span>
	                                              )}
	                                            </td>
	                                        </tr>
	                                    ))}
	                                </tbody>
	                            </table>
                        </div>

                        <div className="mt-6">
                          <h4 className="font-semibold text-gray-700 mb-2">
                            Reportes de falla ({historyEquipo.reportes.length} registros)
                          </h4>
                          {historyEquipo.reportes.length === 0 ? (
                            <div className="text-sm text-gray-500">Sin reportes registrados.</div>
                          ) : (
                            <div className="space-y-2">
                              {historyEquipo.reportes.map((r) => (
                                <div key={r.id} className="border rounded-lg p-3 bg-gray-50">
                                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                                    <span>{new Date(r.fecha).toLocaleString()}</span>
                                    <span className="font-semibold text-gray-700">{r.estado}</span>
                                  </div>
                                  <div className="text-sm text-gray-800 whitespace-pre-wrap">{r.nota}</div>
                                  <div className="text-xs text-gray-500 mt-2">
                                    Paciente: {r.pacienteNombre} · Por: {r.porNombre}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                    </div>
                )}
                <div id="hoja-vida-print-container" ref={hojaVidaPrintRef} className="fixed -left-[9999px] top-0">
                  <HojaVidaFormat
                    equipo={historyEquipo.equipo}
                    datos={historyDatos}
                    fijos={historyFijos}
                    ubicacion={historyUbicacion}
                    servicio={historyServicio}
                    tipoNombre={historyTipo?.nombre}
                    imagenUrl={historyFotoDataUrl || historyEquipo.equipo.fotoEquipo?.url}
                  />
                </div>
            </div>

            <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-lg flex justify-end">
                <button onClick={() => setIsHistoryOpen(false)} className="px-4 py-2 bg-white border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50">
                    Cerrar
                </button>
            </div>
          </div>
        </div>
      )}

      {isTiposOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-gray-900">Tipos de equipo</div>
                <div className="text-xs text-gray-500">Plantillas para hoja de vida.</div>
              </div>
              <button className="md-btn md-btn-outlined" onClick={closeTiposEquipo} type="button">
                Cerrar
              </button>
            </div>

            <div className="p-4 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-800">Plantillas</div>
                  <div className="flex gap-2">
                    <button className="md-btn md-btn-outlined" onClick={handleMigrarFijos} type="button">
                      Migrar datos
                    </button>
                    <button className="md-btn md-btn-outlined" onClick={() => openTiposEquipo()} type="button">
                      Nuevo tipo
                    </button>
                  </div>
                </div>
                {tiposEquipo.length === 0 ? (
                  <div className="text-sm text-gray-500">No hay tipos registrados.</div>
                ) : (
                  tiposEquipo.map((t) => (
                    <div key={t.id} className="border rounded-lg p-3 flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-gray-900">{t.nombre}</div>
                        <div className="text-xs text-gray-500">
                          {t.fijos?.recomendacionesFabricante || t.fijos?.periodicidadMantenimiento ? 'Con ficha' : 'Sin ficha'}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button className="md-btn md-btn-outlined" onClick={() => openTiposEquipo(t)} type="button">
                          Editar
                        </button>
                        <button
                          className="md-btn md-btn-outlined border-red-200 text-red-700 hover:bg-red-50"
                          onClick={() => handleDeleteTipoEquipo(t)}
                          type="button"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-3">
                <div className="text-sm font-semibold text-gray-800">
                  {tipoForm.id ? 'Editar tipo' : 'Nuevo tipo'}
                </div>
                <div>
                  <label className="block text-xs font-medium">Nombre del tipo</label>
                  <input
                    className="w-full border p-2 rounded"
                    value={tipoForm.nombre}
                    onChange={(e) => setTipoForm({ ...tipoForm, nombre: e.target.value })}
                    placeholder="Ej: SUCCIONADOR"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium">Dirección (empresa)</label>
                    <input
                      className="w-full border p-2 rounded"
                      value={tipoForm.fijos?.direccionEmpresa || ''}
                      onChange={(e) => updateTipoFijos({ direccionEmpresa: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium">Fabricante</label>
                    <input
                      className="w-full border p-2 rounded"
                      value={tipoForm.fijos?.fabricante || ''}
                      onChange={(e) => updateTipoFijos({ fabricante: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium">Clasificación biomédica</label>
                    <select
                      className="w-full border p-2 rounded"
                      value={tipoForm.fijos?.clasificacionBiomedica || ''}
                      onChange={(e) => updateTipoFijos({ clasificacionBiomedica: e.target.value })}
                    >
                      <option value="">Selecciona...</option>
                      <option value="DIAGNOSTICO">DIAGNOSTICO</option>
                      <option value="TRATAMIENTO Y MANTENIMIENTO DE LA VIDA">TRATAMIENTO Y MANTENIMIENTO DE LA VIDA</option>
                      <option value="PREVENCION">PREVENCION</option>
                      <option value="REHABILITACION">REHABILITACION</option>
                      <option value="ANALISIS DE LABORATORIO">ANALISIS DE LABORATORIO</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium">Componentes</label>
                    <input
                      className="w-full border p-2 rounded"
                      value={tipoForm.fijos?.componentes || ''}
                      onChange={(e) => updateTipoFijos({ componentes: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium">Vida útil</label>
                    <input
                      className="w-full border p-2 rounded"
                      value={tipoForm.fijos?.vidaUtil || ''}
                      onChange={(e) => updateTipoFijos({ vidaUtil: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium">Definición</label>
                  <textarea
                    className="w-full border p-2 rounded"
                    rows={2}
                    value={tipoForm.fijos?.definicion || ''}
                    onChange={(e) => updateTipoFijos({ definicion: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium">Trabajo realizado (default mantenimiento)</label>
                  <textarea
                    className="w-full border p-2 rounded"
                    rows={2}
                    value={tipoForm.trabajoRealizadoDefault || ''}
                    onChange={(e) => setTipoForm({ ...tipoForm, trabajoRealizadoDefault: e.target.value })}
                    placeholder="Texto sugerido para mantenimiento preventivo/correctivo."
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium">Recomendaciones del fabricante</label>
                  <textarea
                    className="w-full border p-2 rounded"
                    rows={2}
                    value={tipoForm.fijos?.recomendacionesFabricante || ''}
                    onChange={(e) => updateTipoFijos({ recomendacionesFabricante: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium">Periodicidad mantenimiento</label>
                    <input
                      className="w-full border p-2 rounded"
                      value={tipoForm.fijos?.periodicidadMantenimiento || ''}
                      onChange={(e) => updateTipoFijos({ periodicidadMantenimiento: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium">Calibración</label>
                    <input
                      className="w-full border p-2 rounded"
                      value={tipoForm.fijos?.calibracion || ''}
                      onChange={(e) => updateTipoFijos({ calibracion: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium">Técnica de limpieza y desinfección</label>
                  <textarea
                    className="w-full border p-2 rounded"
                    rows={2}
                    value={tipoForm.fijos?.tecnicaLimpiezaDesinfeccion || ''}
                    onChange={(e) => updateTipoFijos({ tecnicaLimpiezaDesinfeccion: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="font-semibold text-xs text-gray-700 col-span-2">Características físicas</div>
                  <input
                    className="w-full border p-2 rounded"
                    placeholder="Alto (cm)"
                    value={tipoForm.fijos?.caracteristicasFisicas?.altoCm || ''}
                    onChange={(e) =>
                      updateTipoFijos({
                        caracteristicasFisicas: {
                          ...(tipoForm.fijos?.caracteristicasFisicas || {}),
                          altoCm: e.target.value,
                        },
                      })
                    }
                  />
                  <input
                    className="w-full border p-2 rounded"
                    placeholder="Ancho (cm)"
                    value={tipoForm.fijos?.caracteristicasFisicas?.anchoCm || ''}
                    onChange={(e) =>
                      updateTipoFijos({
                        caracteristicasFisicas: {
                          ...(tipoForm.fijos?.caracteristicasFisicas || {}),
                          anchoCm: e.target.value,
                        },
                      })
                    }
                  />
                  <input
                    className="w-full border p-2 rounded"
                    placeholder="Profundidad (cm)"
                    value={tipoForm.fijos?.caracteristicasFisicas?.profundidadCm || ''}
                    onChange={(e) =>
                      updateTipoFijos({
                        caracteristicasFisicas: {
                          ...(tipoForm.fijos?.caracteristicasFisicas || {}),
                          profundidadCm: e.target.value,
                        },
                      })
                    }
                  />
                  <input
                    className="w-full border p-2 rounded"
                    placeholder="Peso (kg)"
                    value={tipoForm.fijos?.caracteristicasFisicas?.pesoKg || ''}
                    onChange={(e) =>
                      updateTipoFijos({
                        caracteristicasFisicas: {
                          ...(tipoForm.fijos?.caracteristicasFisicas || {}),
                          pesoKg: e.target.value,
                        },
                      })
                    }
                  />
                  <input
                    className="w-full border p-2 rounded"
                    placeholder="Temperatura (°C)"
                    value={tipoForm.fijos?.caracteristicasFisicas?.temperaturaC || ''}
                    onChange={(e) =>
                      updateTipoFijos({
                        caracteristicasFisicas: {
                          ...(tipoForm.fijos?.caracteristicasFisicas || {}),
                          temperaturaC: e.target.value,
                        },
                      })
                    }
                  />
                  <input
                    className="w-full border p-2 rounded"
                    placeholder="Capacidad"
                    value={tipoForm.fijos?.caracteristicasFisicas?.capacidad || ''}
                    onChange={(e) =>
                      updateTipoFijos({
                        caracteristicasFisicas: {
                          ...(tipoForm.fijos?.caracteristicasFisicas || {}),
                          capacidad: e.target.value,
                        },
                      })
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="font-semibold text-xs text-gray-700 col-span-2">Características eléctricas</div>
                  <input
                    className="w-full border p-2 rounded"
                    placeholder="Voltaje (V)"
                    value={tipoForm.fijos?.caracteristicasElectricas?.voltajeV || ''}
                    onChange={(e) =>
                      updateTipoFijos({
                        caracteristicasElectricas: {
                          ...(tipoForm.fijos?.caracteristicasElectricas || {}),
                          voltajeV: e.target.value,
                        },
                      })
                    }
                  />
                  <input
                    className="w-full border p-2 rounded"
                    placeholder="Corriente (A)"
                    value={tipoForm.fijos?.caracteristicasElectricas?.corrienteA || ''}
                    onChange={(e) =>
                      updateTipoFijos({
                        caracteristicasElectricas: {
                          ...(tipoForm.fijos?.caracteristicasElectricas || {}),
                          corrienteA: e.target.value,
                        },
                      })
                    }
                  />
                  <input
                    className="w-full border p-2 rounded"
                    placeholder="Potencia (W)"
                    value={tipoForm.fijos?.caracteristicasElectricas?.potenciaW || ''}
                    onChange={(e) =>
                      updateTipoFijos({
                        caracteristicasElectricas: {
                          ...(tipoForm.fijos?.caracteristicasElectricas || {}),
                          potenciaW: e.target.value,
                        },
                      })
                    }
                  />
                  <input
                    className="w-full border p-2 rounded"
                    placeholder="Frecuencia (Hz)"
                    value={tipoForm.fijos?.caracteristicasElectricas?.frecuenciaHz || ''}
                    onChange={(e) =>
                      updateTipoFijos({
                        caracteristicasElectricas: {
                          ...(tipoForm.fijos?.caracteristicasElectricas || {}),
                          frecuenciaHz: e.target.value,
                        },
                      })
                    }
                  />
                  <input
                    className="w-full border p-2 rounded col-span-2"
                    placeholder="Tecnología predominante"
                    value={tipoForm.fijos?.caracteristicasElectricas?.tecnologiaPredominante || ''}
                    onChange={(e) =>
                      updateTipoFijos({
                        caracteristicasElectricas: {
                          ...(tipoForm.fijos?.caracteristicasElectricas || {}),
                          tecnologiaPredominante: e.target.value,
                        },
                      })
                    }
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="font-semibold text-xs text-gray-700 col-span-3">Otros suministros</div>
                  <input
                    className="w-full border p-2 rounded"
                    placeholder="Oxígeno O2"
                    value={tipoForm.fijos?.otrosSuministros?.oxigenoO2 || ''}
                    onChange={(e) =>
                      updateTipoFijos({
                        otrosSuministros: {
                          ...(tipoForm.fijos?.otrosSuministros || {}),
                          oxigenoO2: e.target.value,
                        },
                      })
                    }
                  />
                  <input
                    className="w-full border p-2 rounded"
                    placeholder="Aire"
                    value={tipoForm.fijos?.otrosSuministros?.aire || ''}
                    onChange={(e) =>
                      updateTipoFijos({
                        otrosSuministros: {
                          ...(tipoForm.fijos?.otrosSuministros || {}),
                          aire: e.target.value,
                        },
                      })
                    }
                  />
                  <input
                    className="w-full border p-2 rounded"
                    placeholder="Agua"
                    value={tipoForm.fijos?.otrosSuministros?.agua || ''}
                    onChange={(e) =>
                      updateTipoFijos({
                        otrosSuministros: {
                          ...(tipoForm.fijos?.otrosSuministros || {}),
                          agua: e.target.value,
                        },
                      })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border-t flex justify-end gap-2">
              <button className="md-btn md-btn-outlined" onClick={closeTiposEquipo} type="button">
                Cancelar
              </button>
              <button
                className="md-btn md-btn-filled"
                onClick={handleSaveTipoEquipo}
                disabled={tipoSaving}
                type="button"
              >
                {tipoSaving ? 'Guardando...' : 'Guardar tipo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Inventory;
