import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from './firebase';
import {
  EstadoActaInterna,
  EstadoAsignacion,
  EstadoEquipo,
  EstadoPaciente,
  EstadoReporteEquipo,
  EstadoMantenimiento,
  TipoPropiedad,
  EstadoSolicitudEquipoPaciente,
  type Mantenimiento,
  type MantenimientoHistorial,
  type ReporteEquipo,
  type SolicitudEquipoPaciente,
  type ActaInterna,
  type Asignacion,
  type AsignacionProfesional,
  type EquipoFoto,
  type EquipoBiomedico,
  type HojaVidaDatosEquipo,
  type HojaVidaFijos,
  type Paciente,
  type Profesional,
  type TipoEquipo,
} from '../types';

const pacientesCol = collection(db, 'pacientes');
const profesionalesCol = collection(db, 'profesionales');
const equiposCol = collection(db, 'equipos');
const asignacionesCol = collection(db, 'asignaciones');
const asignacionesProfesionalesCol = collection(db, 'asignaciones_profesionales');
const actasInternasCol = collection(db, 'actas_internas');
const reportesEquiposCol = collection(db, 'reportes_equipos');
const mantenimientosCol = collection(db, 'mantenimientos');
const solicitudesEquiposPacienteCol = collection(db, 'solicitudes_equipos_paciente');
const tiposEquipoCol = collection(db, 'tipos_equipo');

function assertRoleString(value: string, allowed: readonly string[], fieldName: string) {
  if (!allowed.includes(value)) {
    throw new Error(`${fieldName} inválido: "${value}". Valores permitidos: ${allowed.join(', ')}`);
  }
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefinedDeep(v)) as any;
  }
  if (value && typeof value === 'object') {
    const out: any = {};
    for (const [key, val] of Object.entries(value as any)) {
      if (val === undefined) continue;
      out[key] = stripUndefinedDeep(val);
    }
    return out;
  }
  return value;
}

const upper = (value: string) => value.toUpperCase();
const upperOptional = (value?: string | null) => (typeof value === 'string' ? value.toUpperCase() : value);

const upperHojaVidaFijos = (value?: HojaVidaFijos) => {
  if (!value) return undefined;
  return {
    direccionEmpresa: upperOptional(value.direccionEmpresa),
    fabricante: upperOptional(value.fabricante),
    clasificacionBiomedica: upperOptional(value.clasificacionBiomedica),
    componentes: upperOptional(value.componentes),
    vidaUtil: upperOptional(value.vidaUtil),
    definicion: upperOptional(value.definicion),
    recomendacionesFabricante: upperOptional(value.recomendacionesFabricante),
    periodicidadMantenimiento: upperOptional(value.periodicidadMantenimiento),
    calibracion: upperOptional(value.calibracion),
    tecnicaLimpiezaDesinfeccion: upperOptional(value.tecnicaLimpiezaDesinfeccion),
    caracteristicasFisicas: value.caracteristicasFisicas
      ? {
          altoCm: upperOptional(value.caracteristicasFisicas.altoCm),
          anchoCm: upperOptional(value.caracteristicasFisicas.anchoCm),
          profundidadCm: upperOptional(value.caracteristicasFisicas.profundidadCm),
          pesoKg: upperOptional(value.caracteristicasFisicas.pesoKg),
          temperaturaC: upperOptional(value.caracteristicasFisicas.temperaturaC),
          capacidad: upperOptional(value.caracteristicasFisicas.capacidad),
        }
      : undefined,
    caracteristicasElectricas: value.caracteristicasElectricas
      ? {
          voltajeV: upperOptional(value.caracteristicasElectricas.voltajeV),
          corrienteA: upperOptional(value.caracteristicasElectricas.corrienteA),
          potenciaW: upperOptional(value.caracteristicasElectricas.potenciaW),
          frecuenciaHz: upperOptional(value.caracteristicasElectricas.frecuenciaHz),
          tecnologiaPredominante: upperOptional(value.caracteristicasElectricas.tecnologiaPredominante),
        }
      : undefined,
    otrosSuministros: value.otrosSuministros
      ? {
          oxigenoO2: upperOptional(value.otrosSuministros.oxigenoO2),
          aire: upperOptional(value.otrosSuministros.aire),
          agua: upperOptional(value.otrosSuministros.agua),
        }
      : undefined,
  } as HojaVidaFijos;
};

const upperHojaVidaDatos = (value?: HojaVidaDatosEquipo) => {
  if (!value) return undefined;
  return {
    empresa: upperOptional(value.empresa),
    sede: upperOptional(value.sede),
    direccionEmpresa: upperOptional(value.direccionEmpresa),
    fabricante: upperOptional(value.fabricante),
    servicio: upperOptional(value.servicio),
    tipoEquipo: upperOptional(value.tipoEquipo),
    registroInvima: upperOptional(value.registroInvima),
    clasificacionBiomedica: upperOptional(value.clasificacionBiomedica),
    riesgo: upperOptional(value.riesgo),
    componentes: upperOptional(value.componentes),
    formaAdquisicion: upperOptional(value.formaAdquisicion),
    costoAdquisicion: upperOptional(value.costoAdquisicion),
    fechaInstalacion: value.fechaInstalacion,
    vidaUtil: upperOptional(value.vidaUtil),
    proveedor: upperOptional(value.proveedor),
    estadoEquipo: upperOptional(value.estadoEquipo),
    garantia: upperOptional(value.garantia),
    fechaVencimiento: value.fechaVencimiento,
    accesorios: upperOptional(value.accesorios),
    manuales: upperOptional(value.manuales),
    manualesCuales: upperOptional(value.manualesCuales),
  } as HojaVidaDatosEquipo;
};

async function getNextNumber(
  collectionName: 'pacientes' | 'profesionales' | 'asignaciones' | 'asignaciones_profesionales' | 'mantenimientos',
): Promise<number> {
  const col =
    collectionName === 'pacientes'
      ? pacientesCol
      : collectionName === 'profesionales'
        ? profesionalesCol
        : collectionName === 'asignaciones_profesionales'
          ? asignacionesProfesionalesCol
          : collectionName === 'mantenimientos'
            ? mantenimientosCol
            : asignacionesCol;
  const q = query(col, orderBy('consecutivo', 'desc'), limit(1));
  const snap = await getDocs(q);
  const last = snap.docs[0]?.data()?.consecutivo;
  return (typeof last === 'number' && Number.isFinite(last) ? last : 0) + 1;
}

async function getNextCode(prefix: string): Promise<string> {
  const q = query(equiposCol);
  const snap = await getDocs(q);
  const used = new Set<number>();
  let max = 0;
  for (const docSnap of snap.docs) {
    const code = docSnap.data()?.codigoInventario;
    if (typeof code !== 'string' || !code.startsWith(prefix)) continue;
    const n = parseInt(code.slice(prefix.length), 10);
    if (!Number.isFinite(n) || n <= 0) continue;
    used.add(n);
    if (n > max) max = n;
  }
  for (let i = 1; i <= max + 1; i += 1) {
    if (!used.has(i)) {
      return `${prefix}${String(i).padStart(3, '0')}`;
    }
  }
  return `${prefix}001`;
}

const normalizeTipoPropiedad = (tipo?: TipoPropiedad) => {
  if (tipo === TipoPropiedad.PROPIO) return TipoPropiedad.MEDICUC;
  if (tipo === TipoPropiedad.EXTERNO) return TipoPropiedad.ALQUILADO;
  return tipo || TipoPropiedad.MEDICUC;
};

const prefixForTipo = (tipo?: TipoPropiedad) => {
  const normalized = normalizeTipoPropiedad(tipo);
  switch (normalized) {
    case TipoPropiedad.PACIENTE:
      return 'MBP-';
    case TipoPropiedad.ALQUILADO:
      return 'MBA-';
    case TipoPropiedad.EMPLEADO:
      return 'MBE-';
    case TipoPropiedad.MEDICUC:
    default:
      return 'MBG-';
  }
};

export function subscribePacientes(onData: (pacientes: Paciente[]) => void, onError?: (e: Error) => void) {
  const q = query(pacientesCol, orderBy('consecutivo', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      const pacientes = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Paciente, 'id'>) }));
      onData(pacientes);
    },
    (err) => onError?.(err as unknown as Error),
  );
}

export function subscribePacientesActivos(
  onData: (pacientes: Paciente[]) => void,
  onError?: (e: Error) => void,
) {
  const q = query(pacientesCol, where('estado', '==', EstadoPaciente.ACTIVO), orderBy('consecutivo', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      const pacientes = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Paciente, 'id'>) }));
      onData(pacientes);
    },
    (err) => onError?.(err as unknown as Error),
  );
}

export function subscribeProfesionales(
  onData: (profesionales: Profesional[]) => void,
  onError?: (e: Error) => void,
) {
  const q = query(profesionalesCol, orderBy('consecutivo', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      const profesionales = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Profesional, 'id'>) }));
      onData(profesionales);
    },
    (err) => onError?.(err as unknown as Error),
  );
}

export function subscribeTiposEquipo(onData: (tipos: TipoEquipo[]) => void, onError?: (e: Error) => void) {
  const q = query(tiposEquipoCol, orderBy('nombre', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      const tipos = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TipoEquipo, 'id'>) }));
      onData(tipos);
    },
    (err) => onError?.(err as unknown as Error),
  );
}

export async function saveTipoEquipo(tipo: TipoEquipo) {
  if (!tipo.nombre) {
    throw new Error('El tipo de equipo debe tener nombre.');
  }

  const payload: Omit<TipoEquipo, 'id'> = {
    nombre: upper(tipo.nombre),
    fijos: upperHojaVidaFijos(tipo.fijos) || {},
    trabajoRealizadoDefault: upperOptional(tipo.trabajoRealizadoDefault),
    updatedAt: new Date().toISOString(),
  };

  if (tipo.id) {
    const ref = doc(tiposEquipoCol, tipo.id);
    await updateDoc(ref, stripUndefinedDeep(payload) as any);
    return;
  }

  await addDoc(
    tiposEquipoCol,
    stripUndefinedDeep({ ...payload, createdAt: new Date().toISOString() }) as any,
  );
}

export async function deleteTipoEquipo(id: string) {
  const ref = doc(tiposEquipoCol, id);
  await deleteDoc(ref);
}

export function subscribeEquipos(onData: (equipos: EquipoBiomedico[]) => void, onError?: (e: Error) => void) {
  const q = query(equiposCol, orderBy('codigoInventario', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      const equipos = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EquipoBiomedico, 'id'>) }));
      onData(equipos);
    },
    (err) => onError?.(err as unknown as Error),
  );
}

export function subscribeAsignaciones(onData: (asignaciones: Asignacion[]) => void, onError?: (e: Error) => void) {
  const q = query(asignacionesCol, orderBy('fechaAsignacion', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      const asignaciones = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Asignacion, 'id'>) }));
      onData(asignaciones);
    },
    (err) => onError?.(err as unknown as Error),
  );
}

export function subscribeAsignacionesProfesionales(
  onData: (asignaciones: AsignacionProfesional[]) => void,
  onError?: (e: Error) => void,
) {
  const q = query(asignacionesProfesionalesCol, orderBy('fechaEntregaOriginal', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      const asignaciones = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<AsignacionProfesional, 'id'>),
      }));
      onData(asignaciones);
    },
    (err) => onError?.(err as unknown as Error),
  );
}

export async function saveProfesional(profesional: Profesional) {
  if (!profesional.nombre || !profesional.cedula) {
    throw new Error('El profesional debe tener nombre y cédula.');
  }

  const normalized: Profesional = {
    ...profesional,
    nombre: upper(profesional.nombre),
    cedula: upper(profesional.cedula),
    direccion: upper(profesional.direccion),
    telefono: upper(profesional.telefono),
    cargo: upper(profesional.cargo),
  };

  if (normalized.id) {
    const ref = doc(profesionalesCol, normalized.id);
    const { id, ...rest } = normalized;
    await updateDoc(ref, stripUndefinedDeep(rest) as any);
    return;
  }

  const consecutivo = await getNextNumber('profesionales');
  const { id: _id, ...rest } = normalized;
  await addDoc(
    profesionalesCol,
    stripUndefinedDeep({ ...rest, consecutivo, createdAt: new Date().toISOString() }) as any,
  );
}

export async function asignarEquipoProfesional(params: {
  idProfesional: string;
  idEquipo: string;
  fechaEntregaOriginalIso: string;
  ciudad?: string;
  sede?: string;
  observacionesEntrega: string;
  usuarioAsigna: string;
  uidAsigna?: string;
  firmaAuxiliar?: string;
}): Promise<AsignacionProfesional> {
  const {
    idProfesional,
    idEquipo,
    fechaEntregaOriginalIso,
    ciudad,
    sede,
    observacionesEntrega,
    usuarioAsigna,
    uidAsigna,
    firmaAuxiliar,
  } = params;

  // Bloqueo: no permitir si está activo en pacientes o profesionales.
  const activePacienteQ = query(
    asignacionesCol,
    where('idEquipo', '==', idEquipo),
    where('estado', '==', EstadoAsignacion.ACTIVA),
    limit(1),
  );
  const activeProfesionalQ = query(
    asignacionesProfesionalesCol,
    where('idEquipo', '==', idEquipo),
    where('estado', '==', EstadoAsignacion.ACTIVA),
    limit(1),
  );

  const [activePacienteSnap, activeProfesionalSnap] = await Promise.all([
    getDocs(activePacienteQ),
    getDocs(activeProfesionalQ),
  ]);
  if (!activePacienteSnap.empty || !activeProfesionalSnap.empty) {
    throw new Error('El equipo no está disponible');
  }

  const consecutivo = await getNextNumber('asignaciones_profesionales');
  const nowIso = new Date().toISOString();

  const asignacion: Omit<AsignacionProfesional, 'id'> = {
    consecutivo,
    idProfesional,
    idEquipo,
    fechaEntregaOriginal: fechaEntregaOriginalIso,
    fechaActualizacionEntrega: nowIso,
    ciudad: upperOptional(ciudad) || '',
    sede: upperOptional(sede) || '',
    estado: EstadoAsignacion.ACTIVA,
    observacionesEntrega: upper(observacionesEntrega),
    firmaAuxiliar,
    usuarioAsigna: upper(usuarioAsigna),
    uidAsigna,
  };

  const docRef = await addDoc(asignacionesProfesionalesCol, stripUndefinedDeep(asignacion) as any);
  return { id: docRef.id, ...asignacion };
}

export async function devolverEquipoProfesional(params: {
  idAsignacion: string;
  observacionesDevolucion: string;
  estadoFinalEquipo: EstadoEquipo;
}) {
  const { idAsignacion, observacionesDevolucion, estadoFinalEquipo } = params;
  assertRoleString(estadoFinalEquipo, Object.values(EstadoEquipo), 'estadoFinalEquipo');

  const ref = doc(asignacionesProfesionalesCol, idAsignacion);
  await updateDoc(
    ref,
    stripUndefinedDeep({
      fechaDevolucion: new Date().toISOString(),
      estado: EstadoAsignacion.FINALIZADA,
      observacionesDevolucion: upper(observacionesDevolucion),
      estadoFinalEquipo,
    }) as any,
  );
}

export async function guardarFirmaProfesional(params: {
  idAsignacion: string;
  tipoActa: 'ENTREGA' | 'DEVOLUCION';
  dataUrl: string | null;
}) {
  const { idAsignacion, tipoActa, dataUrl } = params;
  const ref = doc(asignacionesProfesionalesCol, idAsignacion);
  const fieldName = tipoActa === 'ENTREGA' ? 'firmaProfesionalEntrega' : 'firmaProfesionalDevolucion';
  await updateDoc(ref, {
    [fieldName]: dataUrl ? dataUrl : deleteField(),
  } as any);
}

export async function guardarFirmaAuxiliarProfesional(params: { idAsignacion: string; dataUrl: string | null }) {
  const ref = doc(asignacionesProfesionalesCol, params.idAsignacion);
  await updateDoc(ref, {
    firmaAuxiliar: params.dataUrl ? params.dataUrl : deleteField(),
  } as any);
}

// Subscriptions específicas para el rol VISITADOR (evita permission-denied por queries sin filtro).
export function subscribePacientesConAsignacionActiva(
  onData: (pacientes: Paciente[]) => void,
  onError?: (e: Error) => void,
) {
  const q = query(
    pacientesCol,
    where('tieneAsignacionActiva', '==', true),
    where('estado', '==', EstadoPaciente.ACTIVO),
  );
  return onSnapshot(
    q,
    (snap) => {
      const pacientes = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Paciente, 'id'>) }));
      onData(pacientes);
    },
    (err) => onError?.(err as unknown as Error),
  );
}

export function subscribeEquiposAsignadosActivos(
  onData: (equipos: EquipoBiomedico[]) => void,
  onError?: (e: Error) => void,
) {
  const q = query(equiposCol, where('asignadoActivo', '==', true));
  return onSnapshot(
    q,
    (snap) => {
      const equipos = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EquipoBiomedico, 'id'>) }));
      onData(equipos);
    },
    (err) => onError?.(err as unknown as Error),
  );
}

export function subscribeAsignacionesActivas(
  onData: (asignaciones: Asignacion[]) => void,
  onError?: (e: Error) => void,
) {
  const q = query(asignacionesCol, where('estado', '==', EstadoAsignacion.ACTIVA));
  return onSnapshot(
    q,
    (snap) => {
      const asignaciones = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Asignacion, 'id'>) }));
      onData(asignaciones);
    },
    (err) => onError?.(err as unknown as Error),
  );
}

export function subscribeActasInternas(onData: (actas: ActaInterna[]) => void, onError?: (e: Error) => void) {
  const q = query(actasInternasCol, orderBy('fecha', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const actas = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ActaInterna, 'id'>) }));
      onData(actas);
    },
    (err) => onError?.(err as unknown as Error),
  );
}

export function subscribeReportesEquipos(
  onData: (reportes: ReporteEquipo[]) => void,
  onError?: (e: Error) => void,
) {
  const q = query(reportesEquiposCol);
  return onSnapshot(
    q,
    (snap) => {
      const reportes = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ReporteEquipo, 'id'>) }));
      onData(reportes);
    },
    (err) => onError?.(err as unknown as Error),
  );
}

export function subscribeMantenimientos(
  onData: (mantenimientos: Mantenimiento[]) => void,
  onError?: (e: Error) => void,
) {
  const q = query(mantenimientosCol, orderBy('consecutivo', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const mantenimientos = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Mantenimiento, 'id'>) }));
      onData(mantenimientos);
    },
    (err) => onError?.(err as unknown as Error),
  );
}

export function subscribeMantenimientosByEstado(
  estado: EstadoMantenimiento,
  onData: (mantenimientos: Mantenimiento[]) => void,
  onError?: (e: Error) => void,
) {
  const q = query(mantenimientosCol, where('estado', '==', estado), orderBy('consecutivo', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const mantenimientos = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Mantenimiento, 'id'>) }));
      onData(mantenimientos);
    },
    (err) => onError?.(err as unknown as Error),
  );
}

export function subscribeMantenimientosPendientesCount(
  onCount: (count: number) => void,
  onError?: (e: Error) => void,
) {
  const q = query(mantenimientosCol, where('estado', '==', EstadoMantenimiento.CERRADO_PENDIENTE_ACEPTACION));
  return onSnapshot(
    q,
    (snap) => onCount(snap.size),
    (err) => onError?.(err as unknown as Error),
  );
}

export function subscribeReportesEquiposByUser(
  uid: string,
  onData: (reportes: ReporteEquipo[]) => void,
  onError?: (e: Error) => void,
) {
  const q = query(reportesEquiposCol, where('creadoPorUid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const reportes = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ReporteEquipo, 'id'>) }));
      onData(reportes);
    },
    (err) => onError?.(err as unknown as Error),
  );
}

export function subscribeReportesEquiposAbiertosCount(
  onCount: (count: number) => void,
  onError?: (e: Error) => void,
) {
  const q = query(
    reportesEquiposCol,
    where('estado', 'in', [EstadoReporteEquipo.ABIERTO, EstadoReporteEquipo.EN_PROCESO]),
  );
  return onSnapshot(
    q,
    (snap) => onCount(snap.size),
    (err) => onError?.(err as unknown as Error),
  );
}

export function subscribeReportesCerradosSinLeerCount(
  uid: string,
  onCount: (count: number) => void,
  onError?: (e: Error) => void,
) {
  const q = query(
    reportesEquiposCol,
    where('creadoPorUid', '==', uid),
    where('estado', '==', EstadoReporteEquipo.CERRADO),
    where('vistoPorVisitadorAt', '==', null),
  );
  return onSnapshot(
    q,
    (snap) => onCount(snap.size),
    (err) => onError?.(err as unknown as Error),
  );
}

export async function marcarReporteVistoPorVisitador(params: { idReporte: string; vistoAtIso?: string }) {
  const ref = doc(reportesEquiposCol, params.idReporte);
  await updateDoc(
    ref,
    stripUndefinedDeep({
      vistoPorVisitadorAt: params.vistoAtIso || new Date().toISOString(),
    }) as any,
  );
}

export async function createReporteEquipo(reporte: ReporteEquipo) {
  const ref = doc(reportesEquiposCol, reporte.id);
  const { id, historial, ...rest } = reporte;
  const normalizedRest: Omit<ReporteEquipo, 'id' | 'historial'> = {
    ...rest,
    descripcion: upper(reporte.descripcion),
    pacienteNombre: upper(reporte.pacienteNombre),
    pacienteDocumento: upper(reporte.pacienteDocumento),
    equipoCodigoInventario: upper(reporte.equipoCodigoInventario),
    equipoNombre: upper(reporte.equipoNombre),
    equipoSerie: upper(reporte.equipoSerie),
    creadoPorNombre: upper(reporte.creadoPorNombre),
    diagnostico: upperOptional(reporte.diagnostico),
    planReparacion: upperOptional(reporte.planReparacion),
    cierreNotas: upperOptional(reporte.cierreNotas),
    enProcesoPorNombre: upperOptional(reporte.enProcesoPorNombre),
    cerradoPorNombre: upperOptional(reporte.cerradoPorNombre),
  };
  const normalizedHistorial =
    historial?.map((entry) => ({
      ...entry,
      nota: upper(entry.nota),
      porNombre: upper(entry.porNombre),
    })) || undefined;
  const nowIso = new Date().toISOString();
  const historialFinal =
    normalizedHistorial && normalizedHistorial.length
      ? normalizedHistorial
      : [
          {
            fecha: nowIso,
            estado: reporte.estado,
            nota: upper(reporte.descripcion),
            porUid: reporte.creadoPorUid,
            porNombre: upper(reporte.creadoPorNombre),
          },
        ];
  const payload = stripUndefinedDeep({
    ...normalizedRest,
    historial: historialFinal,
  }) as any;
  payload.createdAt = serverTimestamp();
  await setDoc(ref, payload);
}

export async function iniciarReporteEnProceso(params: {
  idReporte: string;
  diagnostico: string;
  planReparacion: string;
  porUid: string;
  porNombre: string;
}) {
  const nowIso = new Date().toISOString();
  const ref = doc(reportesEquiposCol, params.idReporte);
  await updateDoc(ref, {
    estado: EstadoReporteEquipo.EN_PROCESO,
    diagnostico: upper(params.diagnostico),
    planReparacion: upper(params.planReparacion),
    enProcesoAt: nowIso,
    enProcesoPorUid: params.porUid,
    enProcesoPorNombre: upper(params.porNombre),
    historial: arrayUnion({
      fecha: nowIso,
      estado: EstadoReporteEquipo.EN_PROCESO,
      nota: `Inicio de proceso: ${upper(params.diagnostico)}\nPlan: ${upper(params.planReparacion)}`,
      porUid: params.porUid,
      porNombre: upper(params.porNombre),
    }),
  } as any);
}

export async function agregarNotaReporte(params: {
  idReporte: string;
  nota: string;
  porUid: string;
  porNombre: string;
}) {
  const nowIso = new Date().toISOString();
  const ref = doc(reportesEquiposCol, params.idReporte);
  await updateDoc(ref, {
    historial: arrayUnion({
      fecha: nowIso,
      estado: EstadoReporteEquipo.EN_PROCESO,
      nota: upper(params.nota),
      porUid: params.porUid,
      porNombre: upper(params.porNombre),
    }),
  } as any);
}

export async function cerrarReporteEquipo(params: {
  idReporte: string;
  cierreNotas: string;
  cerradoPorUid: string;
  cerradoPorNombre: string;
}) {
  const nowIso = new Date().toISOString();
  const ref = doc(reportesEquiposCol, params.idReporte);
  await updateDoc(ref, {
    estado: EstadoReporteEquipo.CERRADO,
    cierreNotas: upper(params.cierreNotas),
    cerradoAt: nowIso,
    cerradoPorUid: params.cerradoPorUid,
    cerradoPorNombre: upper(params.cerradoPorNombre),
    historial: arrayUnion({
      fecha: nowIso,
      estado: EstadoReporteEquipo.CERRADO,
      nota: upper(params.cierreNotas),
      porUid: params.cerradoPorUid,
      porNombre: upper(params.cerradoPorNombre),
    }),
  } as any);
}

const normalizeMantenimientoPayload = (value: Omit<Mantenimiento, 'id'>): Omit<Mantenimiento, 'id'> => {
  return stripUndefinedDeep({
    ...value,
    codigoInventario: upper(value.codigoInventario),
    equipoNombre: upper(value.equipoNombre),
    marca: upperOptional(value.marca),
    modelo: upperOptional(value.modelo),
    serie: upperOptional(value.serie),
    ubicacion: upperOptional(value.ubicacion),
    sede: upperOptional(value.sede),
    ciudad: upperOptional(value.ciudad),
    direccion: upperOptional(value.direccion),
    telefono: upperOptional(value.telefono),
    email: upperOptional(value.email),
    trabajoRealizado: upperOptional(value.trabajoRealizado),
    fallaReportada: upperOptional(value.fallaReportada),
    fallaEncontrada: upperOptional(value.fallaEncontrada),
    observaciones: upperOptional(value.observaciones),
    repuestos: value.repuestos?.map((r) => ({
      cantidad: r.cantidad,
      descripcion: upperOptional(r.descripcion) || '',
      valor: Number.isFinite(r.valor) ? r.valor : 0,
    })),
    creadoPorNombre: upper(value.creadoPorNombre),
    aceptadoPorNombre: upperOptional(value.aceptadoPorNombre),
    historial: value.historial?.map((h) => ({
      ...h,
      nota: upper(h.nota),
      porNombre: upper(h.porNombre),
    })),
  }) as Omit<Mantenimiento, 'id'>;
};

const normalizeMantenimientoUpdate = (value: Partial<Mantenimiento>): Partial<Mantenimiento> => {
  const normalized: Partial<Mantenimiento> = {
    ...value,
    codigoInventario: value.codigoInventario !== undefined ? upper(value.codigoInventario) : undefined,
    equipoNombre: value.equipoNombre !== undefined ? upper(value.equipoNombre) : undefined,
    marca: value.marca !== undefined ? upperOptional(value.marca) : undefined,
    modelo: value.modelo !== undefined ? upperOptional(value.modelo) : undefined,
    serie: value.serie !== undefined ? upperOptional(value.serie) : undefined,
    ubicacion: value.ubicacion !== undefined ? upperOptional(value.ubicacion) : undefined,
    sede: value.sede !== undefined ? upperOptional(value.sede) : undefined,
    ciudad: value.ciudad !== undefined ? upperOptional(value.ciudad) : undefined,
    direccion: value.direccion !== undefined ? upperOptional(value.direccion) : undefined,
    telefono: value.telefono !== undefined ? upperOptional(value.telefono) : undefined,
    email: value.email !== undefined ? upperOptional(value.email) : undefined,
    trabajoRealizado: value.trabajoRealizado !== undefined ? upperOptional(value.trabajoRealizado) : undefined,
    fallaReportada: value.fallaReportada !== undefined ? upperOptional(value.fallaReportada) : undefined,
    fallaEncontrada: value.fallaEncontrada !== undefined ? upperOptional(value.fallaEncontrada) : undefined,
    observaciones: value.observaciones !== undefined ? upperOptional(value.observaciones) : undefined,
    repuestos: value.repuestos
      ? value.repuestos.map((r) => ({
          cantidad: r.cantidad,
          descripcion: upperOptional(r.descripcion) || '',
          valor: Number.isFinite(r.valor) ? r.valor : 0,
        }))
      : undefined,
    creadoPorNombre: value.creadoPorNombre !== undefined ? upperOptional(value.creadoPorNombre) : undefined,
    aceptadoPorNombre: value.aceptadoPorNombre !== undefined ? upperOptional(value.aceptadoPorNombre) : undefined,
    historial: value.historial
      ? value.historial.map((h) => ({
          ...h,
          nota: upper(h.nota),
          porNombre: upper(h.porNombre),
        }))
      : undefined,
  };
  return stripUndefinedDeep(normalized);
};

export async function createMantenimiento(mantenimiento: Omit<Mantenimiento, 'id' | 'consecutivo'>) {
  const consecutivo = await getNextNumber('mantenimientos');
  const ref = doc(mantenimientosCol);
  const payload = normalizeMantenimientoPayload({
    ...mantenimiento,
    consecutivo,
  });
  await setDoc(ref, payload as any);
  return { id: ref.id, ...payload };
}

export async function updateMantenimiento(id: string, patch: Partial<Mantenimiento>) {
  const ref = doc(mantenimientosCol, id);
  await updateDoc(ref, normalizeMantenimientoUpdate(patch) as any);
}

export async function addMantenimientoHistorial(
  id: string,
  entry: MantenimientoHistorial,
) {
  const ref = doc(mantenimientosCol, id);
  await updateDoc(ref, {
    historial: arrayUnion({
      ...entry,
      nota: upper(entry.nota),
      porNombre: upper(entry.porNombre),
    }),
  } as any);
}

export async function createSolicitudEquipoPaciente(solicitud: SolicitudEquipoPaciente) {
  const ref = doc(solicitudesEquiposPacienteCol, solicitud.id);
  const { id, createdAt, ...rest } = solicitud;
  const normalizedRest: Omit<SolicitudEquipoPaciente, 'id' | 'createdAt'> = {
    ...rest,
    pacienteNombre: upper(rest.pacienteNombre),
    pacienteDocumento: upper(rest.pacienteDocumento),
    equipoNombre: upperOptional(rest.equipoNombre),
    empresaAlquiler: upperOptional(rest.empresaAlquiler),
    observaciones: upperOptional(rest.observaciones),
    creadoPorNombre: upper(rest.creadoPorNombre),
    aprobadoPorNombre: upperOptional(rest.aprobadoPorNombre),
  };
  await setDoc(
    ref,
    stripUndefinedDeep({
      ...normalizedRest,
      createdAt: createdAt || new Date().toISOString(),
    }) as any,
  );
}

export function subscribeSolicitudesEquiposPacienteByUser(
  uid: string,
  onData: (solicitudes: SolicitudEquipoPaciente[]) => void,
  onError?: (e: Error) => void,
) {
  const q = query(solicitudesEquiposPacienteCol, where('creadoPorUid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const solicitudes = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SolicitudEquipoPaciente, 'id'>) }));
      solicitudes.sort(
        (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
      );
      onData(solicitudes);
    },
    (err) => onError?.(err as unknown as Error),
  );
}

export function subscribeSolicitudesEquiposPacientePendientes(
  onData: (solicitudes: SolicitudEquipoPaciente[]) => void,
  onError?: (e: Error) => void,
) {
  const q = query(solicitudesEquiposPacienteCol, where('estado', '==', EstadoSolicitudEquipoPaciente.PENDIENTE));
  return onSnapshot(
    q,
    (snap) => {
      const solicitudes = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SolicitudEquipoPaciente, 'id'>) }));
      solicitudes.sort(
        (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
      );
      onData(solicitudes);
    },
    (err) => onError?.(err as unknown as Error),
  );
}

export function subscribeActasInternasPendientesCount(
  recibeUid: string,
  onCount: (count: number) => void,
  onError?: (e: Error) => void,
) {
  const q = query(
    actasInternasCol,
    where('recibeUid', '==', recibeUid),
    where('estado', '==', EstadoActaInterna.ENVIADA),
  );
  return onSnapshot(
    q,
    (snap) => {
      onCount(snap.size);
    },
    (err) => onError?.(err as unknown as Error),
  );
}

export function subscribeEntregasByMonth(
  startIsoInclusive: string,
  endIsoExclusive: string,
  onData: (asignaciones: Asignacion[]) => void,
  onError?: (e: Error) => void,
) {
  const q = query(
    asignacionesCol,
    where('fechaAsignacion', '>=', startIsoInclusive),
    where('fechaAsignacion', '<', endIsoExclusive),
    orderBy('fechaAsignacion', 'asc'),
  );
  return onSnapshot(
    q,
    (snap) => {
      const asignaciones = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Asignacion, 'id'>) }));
      onData(asignaciones);
    },
    (err) => onError?.(err as unknown as Error),
  );
}

export function subscribeDevolucionesByMonth(
  startIsoInclusive: string,
  endIsoExclusive: string,
  onData: (asignaciones: Asignacion[]) => void,
  onError?: (e: Error) => void,
) {
  const q = query(
    asignacionesCol,
    where('fechaDevolucion', '>=', startIsoInclusive),
    where('fechaDevolucion', '<', endIsoExclusive),
    orderBy('fechaDevolucion', 'asc'),
  );
  return onSnapshot(
    q,
    (snap) => {
      const asignaciones = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Asignacion, 'id'>) }));
      onData(asignaciones);
    },
    (err) => onError?.(err as unknown as Error),
  );
}

export async function savePaciente(paciente: Paciente) {
  assertRoleString(paciente.estado, Object.values(EstadoPaciente), 'estado');

  const numeroDocumento = upper(paciente.numeroDocumento);
  const duplicadoQ = query(pacientesCol, where('numeroDocumento', '==', numeroDocumento));
  const duplicadoSnap = await getDocs(duplicadoQ);
  const duplicatedDoc = duplicadoSnap.docs.find((d) => d.id !== paciente.id);
  if (duplicatedDoc) {
    throw new Error(`Error: El paciente con número de documento ${numeroDocumento} ya existe en el sistema.`);
  }

  const normalized: Paciente = {
    ...paciente,
    nombreCompleto: upper(paciente.nombreCompleto),
    numeroDocumento,
    direccion: upper(paciente.direccion),
    barrio: upperOptional(paciente.barrio),
    horasPrestadas: upper(paciente.horasPrestadas),
    tipoServicio: upper(paciente.tipoServicio),
    diagnostico: upper(paciente.diagnostico),
    telefono: upper(paciente.telefono),
    nombreFamiliar: upper(paciente.nombreFamiliar),
    telefonoFamiliar: upper(paciente.telefonoFamiliar),
    documentoFamiliar: upperOptional(paciente.documentoFamiliar),
    parentescoFamiliar: upperOptional(paciente.parentescoFamiliar),
  };

  if (normalized.id) {
    const ref = doc(pacientesCol, normalized.id);
    const { id, ...rest } = normalized;
    await updateDoc(ref, stripUndefinedDeep(rest) as any);
    return;
  }

  const consecutivo = await getNextNumber('pacientes');
  const { id: _id, ...rest } = normalized;
  await addDoc(pacientesCol, stripUndefinedDeep({ ...rest, consecutivo }) as any);
}

export async function saveEquipo(equipo: EquipoBiomedico): Promise<string | undefined> {
  assertRoleString(equipo.estado, Object.values(EstadoEquipo), 'estado');
  const numeroSerie = (equipo.numeroSerie || '').trim().toUpperCase();
  if (numeroSerie) {
    const duplicadoSerieQ = query(equiposCol, where('numeroSerie', '==', numeroSerie));
    const duplicadoSerieSnap = await getDocs(duplicadoSerieQ);
    const duplicatedSerieDoc = duplicadoSerieSnap.docs.find((d) => d.id !== equipo.id);
    if (duplicatedSerieDoc) {
      throw new Error(`Error: El serial ${numeroSerie} ya está en uso.`);
    }
  }

  const codigoInventario = upper(equipo.codigoInventario);
  const normalized: EquipoBiomedico = {
    ...equipo,
    codigoInventario,
    numeroSerie,
    nombre: upper(equipo.nombre),
    marca: upper(equipo.marca),
    modelo: upper(equipo.modelo),
    ubicacionActual: upperOptional(equipo.ubicacionActual),
    observaciones: upper(equipo.observaciones),
    tipoEquipoId: equipo.tipoEquipoId,
    hojaVidaDatos: upperHojaVidaDatos(equipo.hojaVidaDatos),
    hojaVidaOverrides: upperHojaVidaFijos(equipo.hojaVidaOverrides),
    empresaAlquiler: upperOptional(equipo.empresaAlquiler),
    datosPropietario: equipo.datosPropietario
      ? {
          nombre: upper(equipo.datosPropietario.nombre),
          nit: upper(equipo.datosPropietario.nit),
          telefono: upper(equipo.datosPropietario.telefono),
        }
      : undefined,
  };

  if (normalized.id) {
    const duplicadoQ = query(equiposCol, where('codigoInventario', '==', codigoInventario));
    const duplicadoSnap = await getDocs(duplicadoQ);
    const duplicatedDoc = duplicadoSnap.docs.find((d) => d.id !== normalized.id);
    if (duplicatedDoc) {
      throw new Error(`Error: El código ${codigoInventario} ya está en uso.`);
    }

    const ref = doc(equiposCol, normalized.id);
    const { id, ...rest } = normalized;
    const payload = stripUndefinedDeep({ ...rest, numeroSerie, codigoInventario }) as any;
    if (normalizeTipoPropiedad(normalized.tipoPropiedad) !== TipoPropiedad.ALQUILADO) {
      payload.empresaAlquiler = deleteField();
    }
    await updateDoc(ref, payload);
    return;
  }

  const codigoInventarioNew = await getNextCode(prefixForTipo(normalized.tipoPropiedad));
  const { id: _id, ...rest } = normalized;
  // Por defecto, los equipos nuevos no quedan disponibles para entrega (legacy: equipos antiguos no tienen el campo).
  const disponibleParaEntrega =
    typeof normalized.disponibleParaEntrega === 'boolean' ? normalized.disponibleParaEntrega : false;
  const ref = await addDoc(
    equiposCol,
    stripUndefinedDeep({
      ...rest,
      codigoInventario: codigoInventarioNew,
      disponibleParaEntrega,
      numeroSerie,
    }) as any,
  );
  return ref.id;
}

export async function updateEquipoFoto(id: string, foto: EquipoFoto) {
  const ref = doc(equiposCol, id);
  await updateDoc(ref, stripUndefinedDeep({ fotoEquipo: foto }) as any);
}

export async function clearEquipoFoto(id: string) {
  const ref = doc(equiposCol, id);
  await updateDoc(ref, { fotoEquipo: deleteField() } as any);
}

export async function isNumeroSerieDisponible(numeroSerie: string, excludeId?: string) {
  const serie = (numeroSerie || '').trim().toUpperCase();
  if (!serie) return true;
  const duplicadoSerieQ = query(equiposCol, where('numeroSerie', '==', serie));
  const duplicadoSerieSnap = await getDocs(duplicadoSerieQ);
  const duplicatedSerieDoc = duplicadoSerieSnap.docs.find((d) => d.id !== (excludeId || ''));
  return !duplicatedSerieDoc;
}

export async function deleteEquipo(id: string) {
  const ref = doc(equiposCol, id);
  await deleteDoc(ref);
}

export async function asignarEquipo(params: {
  idPaciente: string;
  idEquipo: string;
  observacionesEntrega: string;
  usuarioAsigna: string;
  firmaAuxiliar?: string;
  auxiliarNombre?: string;
  auxiliarUid?: string;
  fechaAsignacionIso?: string;
}): Promise<Asignacion> {
  const {
    idPaciente,
    idEquipo,
    observacionesEntrega,
    usuarioAsigna,
    firmaAuxiliar,
    auxiliarNombre,
    auxiliarUid,
    fechaAsignacionIso,
  } = params;

  const activeEquipoQ = query(
    asignacionesCol,
    where('idEquipo', '==', idEquipo),
    where('estado', '==', EstadoAsignacion.ACTIVA),
    limit(1),
  );
  const activeEquipoProfesionalQ = query(
    asignacionesProfesionalesCol,
    where('idEquipo', '==', idEquipo),
    where('estado', '==', EstadoAsignacion.ACTIVA),
    limit(1),
  );
  const [activeEquipoSnap, activeEquipoProfesionalSnap] = await Promise.all([
    getDocs(activeEquipoQ),
    getDocs(activeEquipoProfesionalQ),
  ]);
  if (!activeEquipoSnap.empty || !activeEquipoProfesionalSnap.empty) throw new Error('El equipo no está disponible');

  const consecutivo = await getNextNumber('asignaciones');
  const nowIso = new Date().toISOString();
  const fechaAsignacion = fechaAsignacionIso || nowIso;

  const asignacion: Omit<Asignacion, 'id'> = {
    consecutivo,
    idPaciente,
    idEquipo,
    fechaAsignacion,
    fechaActualizacionEntrega: nowIso,
    estado: EstadoAsignacion.ACTIVA,
    observacionesEntrega: upper(observacionesEntrega),
    firmaAuxiliar,
    usuarioAsigna: upper(usuarioAsigna),
    auxiliarNombre: auxiliarNombre ? upper(auxiliarNombre) : undefined,
    auxiliarUid,
  };

  const docRef = await addDoc(asignacionesCol, stripUndefinedDeep(asignacion) as any);
  return { id: docRef.id, ...asignacion };
}

export async function devolverEquipo(params: {
  idAsignacion: string;
  observacionesDevolucion: string;
  estadoFinalEquipo: EstadoEquipo;
}) {
  const { idAsignacion, observacionesDevolucion, estadoFinalEquipo } = params;
  assertRoleString(estadoFinalEquipo, Object.values(EstadoEquipo), 'estadoFinalEquipo');

  const ref = doc(asignacionesCol, idAsignacion);
  await updateDoc(
    ref,
    stripUndefinedDeep({
      fechaDevolucion: new Date().toISOString(),
      estado: EstadoAsignacion.FINALIZADA,
      observacionesDevolucion: upper(observacionesDevolucion),
      estadoFinalEquipo,
    }) as any,
  );
}

export async function validarSalidaPaciente(idPaciente: string): Promise<boolean> {
  const activasQ = query(
    asignacionesCol,
    where('idPaciente', '==', idPaciente),
    where('estado', '==', EstadoAsignacion.ACTIVA),
    limit(1),
  );
  const activasSnap = await getDocs(activasQ);
  if (!activasSnap.empty) return false;

  const ref = doc(pacientesCol, idPaciente);
  await updateDoc(
    ref,
    stripUndefinedDeep({
      estado: EstadoPaciente.EGRESADO,
      fechaSalida: new Date().toISOString(),
    }) as any,
  );
  return true;
}

export async function guardarFirmaPaciente(params: {
  idAsignacion: string;
  tipoActa: 'ENTREGA' | 'DEVOLUCION';
  dataUrl: string | null;
}) {
  const { idAsignacion, tipoActa, dataUrl } = params;
  const ref = doc(asignacionesCol, idAsignacion);
  const fieldName = tipoActa === 'ENTREGA' ? 'firmaPacienteEntrega' : 'firmaPacienteDevolucion';
  await updateDoc(ref, {
    [fieldName]: dataUrl ? dataUrl : deleteField(),
  } as any);
}

export async function guardarFirmaAuxiliar(params: {
  idAsignacion: string;
  dataUrl: string | null;
  auxiliarNombre?: string;
  auxiliarUid?: string;
}) {
  const ref = doc(asignacionesCol, params.idAsignacion);
  await updateDoc(
    ref,
    stripUndefinedDeep({
      firmaAuxiliar: params.dataUrl ? params.dataUrl : deleteField(),
      auxiliarNombre: params.auxiliarNombre ? upper(params.auxiliarNombre) : undefined,
      auxiliarUid: params.auxiliarUid || undefined,
    }) as any,
  );
}

export async function guardarFirmaEntregaVisitador(params: {
  idAsignacion: string;
  dataUrl: string;
  capturadoPorUid: string;
  capturadoPorNombre: string;
}) {
  const ref = doc(asignacionesCol, params.idAsignacion);
  await updateDoc(
    ref,
    stripUndefinedDeep({
      firmaPacienteEntrega: params.dataUrl,
      firmaPacienteEntregaCapturadaAt: new Date().toISOString(),
      firmaPacienteEntregaCapturadaPorUid: params.capturadoPorUid,
      firmaPacienteEntregaCapturadaPorNombre: upper(params.capturadoPorNombre),
    }) as any,
  );
}
