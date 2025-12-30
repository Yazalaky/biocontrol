import {
  addDoc,
  collection,
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
  type ReporteEquipo,
  type ActaInterna,
  type Asignacion,
  type EquipoBiomedico,
  type Paciente,
} from '../types';

const pacientesCol = collection(db, 'pacientes');
const equiposCol = collection(db, 'equipos');
const asignacionesCol = collection(db, 'asignaciones');
const actasInternasCol = collection(db, 'actas_internas');
const reportesEquiposCol = collection(db, 'reportes_equipos');

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

async function getNextNumber(collectionName: 'pacientes' | 'asignaciones'): Promise<number> {
  const col = collectionName === 'pacientes' ? pacientesCol : asignacionesCol;
  const q = query(col, orderBy('consecutivo', 'desc'), limit(1));
  const snap = await getDocs(q);
  const last = snap.docs[0]?.data()?.consecutivo;
  return (typeof last === 'number' && Number.isFinite(last) ? last : 0) + 1;
}

async function getNextMbgCode(): Promise<string> {
  const prefix = 'MBG-';
  const q = query(equiposCol, orderBy('codigoInventario', 'desc'), limit(1));
  const snap = await getDocs(q);
  const last = snap.docs[0]?.data()?.codigoInventario;
  if (typeof last !== 'string' || !last.startsWith(prefix)) return `${prefix}001`;
  const maybeNumber = parseInt(last.slice(prefix.length), 10);
  const next = Number.isFinite(maybeNumber) ? maybeNumber + 1 : 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

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

// Subscriptions específicas para el rol VISITADOR (evita permission-denied por queries sin filtro).
export function subscribePacientesConAsignacionActiva(
  onData: (pacientes: Paciente[]) => void,
  onError?: (e: Error) => void,
) {
  const q = query(pacientesCol, where('tieneAsignacionActiva', '==', true));
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

export async function createReporteEquipo(reporte: ReporteEquipo) {
  const ref = doc(reportesEquiposCol, reporte.id);
  const { id, ...rest } = reporte;
  await setDoc(ref, stripUndefinedDeep({ ...rest, createdAt: serverTimestamp() }) as any);
}

export async function cerrarReporteEquipo(params: {
  idReporte: string;
  cierreNotas: string;
  cerradoPorUid: string;
  cerradoPorNombre: string;
}) {
  const ref = doc(reportesEquiposCol, params.idReporte);
  await updateDoc(
    ref,
    stripUndefinedDeep({
      estado: EstadoReporteEquipo.CERRADO,
      cierreNotas: params.cierreNotas,
      cerradoAt: new Date().toISOString(),
      cerradoPorUid: params.cerradoPorUid,
      cerradoPorNombre: params.cerradoPorNombre,
    }) as any,
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

  const duplicadoQ = query(pacientesCol, where('numeroDocumento', '==', paciente.numeroDocumento));
  const duplicadoSnap = await getDocs(duplicadoQ);
  const duplicatedDoc = duplicadoSnap.docs.find((d) => d.id !== paciente.id);
  if (duplicatedDoc) {
    throw new Error(`Error: El paciente con número de documento ${paciente.numeroDocumento} ya existe en el sistema.`);
  }

  if (paciente.id) {
    const ref = doc(pacientesCol, paciente.id);
    const { id, ...rest } = paciente;
    await updateDoc(ref, stripUndefinedDeep(rest) as any);
    return;
  }

  const consecutivo = await getNextNumber('pacientes');
  const { id: _id, ...rest } = paciente;
  await addDoc(pacientesCol, stripUndefinedDeep({ ...rest, consecutivo }) as any);
}

export async function saveEquipo(equipo: EquipoBiomedico) {
  assertRoleString(equipo.estado, Object.values(EstadoEquipo), 'estado');

  if (equipo.id) {
    const duplicadoQ = query(equiposCol, where('codigoInventario', '==', equipo.codigoInventario));
    const duplicadoSnap = await getDocs(duplicadoQ);
    const duplicatedDoc = duplicadoSnap.docs.find((d) => d.id !== equipo.id);
    if (duplicatedDoc) {
      throw new Error(`Error: El código ${equipo.codigoInventario} ya está en uso.`);
    }

    const ref = doc(equiposCol, equipo.id);
    const { id, ...rest } = equipo;
    await updateDoc(ref, stripUndefinedDeep(rest) as any);
    return;
  }

  const codigoInventario = await getNextMbgCode();
  const { id: _id, ...rest } = equipo;
  // Por defecto, los equipos nuevos no quedan disponibles para entrega (legacy: equipos antiguos no tienen el campo).
  const disponibleParaEntrega =
    typeof equipo.disponibleParaEntrega === 'boolean' ? equipo.disponibleParaEntrega : false;
  await addDoc(
    equiposCol,
    stripUndefinedDeep({ ...rest, codigoInventario, disponibleParaEntrega }) as any,
  );
}

export async function asignarEquipo(params: {
  idPaciente: string;
  idEquipo: string;
  observacionesEntrega: string;
  usuarioAsigna: string;
  firmaAuxiliar?: string;
  fechaAsignacionIso?: string;
}): Promise<Asignacion> {
  const { idPaciente, idEquipo, observacionesEntrega, usuarioAsigna, firmaAuxiliar, fechaAsignacionIso } =
    params;

  const activeEquipoQ = query(
    asignacionesCol,
    where('idEquipo', '==', idEquipo),
    where('estado', '==', EstadoAsignacion.ACTIVA),
    limit(1),
  );
  const activeEquipoSnap = await getDocs(activeEquipoQ);
  if (!activeEquipoSnap.empty) throw new Error('El equipo no está disponible');

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
    observacionesEntrega,
    firmaAuxiliar,
    usuarioAsigna,
  };

  const docRef = await addDoc(asignacionesCol, asignacion as any);
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
      observacionesDevolucion,
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

export async function guardarFirmaAuxiliar(params: { idAsignacion: string; dataUrl: string | null }) {
  const ref = doc(asignacionesCol, params.idAsignacion);
  await updateDoc(ref, {
    firmaAuxiliar: params.dataUrl ? params.dataUrl : deleteField(),
  } as any);
}
