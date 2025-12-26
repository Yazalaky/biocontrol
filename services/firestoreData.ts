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
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from './firebase';
import {
  EstadoAsignacion,
  EstadoEquipo,
  EstadoPaciente,
  type Asignacion,
  type EquipoBiomedico,
  type Paciente,
} from '../types';

const pacientesCol = collection(db, 'pacientes');
const equiposCol = collection(db, 'equipos');
const asignacionesCol = collection(db, 'asignaciones');

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
  await addDoc(equiposCol, stripUndefinedDeep({ ...rest, codigoInventario }) as any);
}

export async function asignarEquipo(params: {
  idPaciente: string;
  idEquipo: string;
  observacionesEntrega: string;
  usuarioAsigna: string;
}): Promise<Asignacion> {
  const { idPaciente, idEquipo, observacionesEntrega, usuarioAsigna } = params;

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

  const asignacion: Omit<Asignacion, 'id'> = {
    consecutivo,
    idPaciente,
    idEquipo,
    fechaAsignacion: nowIso,
    estado: EstadoAsignacion.ACTIVA,
    observacionesEntrega,
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
