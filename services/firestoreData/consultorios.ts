import { addDoc, deleteDoc, deleteField, doc, onSnapshot, query, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { firebaseFunctions } from '../firebaseFunctions';
import type { Consultorio, OrgContext } from '../../types';
import { consultoriosCol, orgScopeConstraints, upper, upperOptional, withContext } from './shared';

export function subscribeConsultorios(
  onData: (consultorios: Consultorio[]) => void,
  onError?: (e: Error) => void,
) {
  const q = query(consultoriosCol, ...orgScopeConstraints());
  return onSnapshot(
    q,
    (snap) => {
      const consultorios = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Consultorio, 'id'>) }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      onData(consultorios);
    },
    (err) => onError?.(err as unknown as Error),
  );
}

export async function saveConsultorio(consultorio: Consultorio, context?: Partial<OrgContext>) {
  if (!consultorio.nombre?.trim()) {
    throw new Error('El consultorio debe tener nombre.');
  }
  if (!consultorio.servicio?.trim()) {
    throw new Error('El consultorio debe tener servicio.');
  }

  const payload: Omit<Consultorio, 'id'> = {
    nombre: upper(consultorio.nombre),
    servicio: upper(consultorio.servicio),
    ubicacion: upperOptional(consultorio.ubicacion),
    activo: consultorio.activo !== false,
    updatedAt: new Date().toISOString(),
  };

  if (consultorio.id) {
    const ref = doc(consultoriosCol, consultorio.id);
    const updatePayload = withContext(payload, context) as any;
    if (!consultorio.ubicacion?.trim()) {
      updatePayload.ubicacion = deleteField();
    }
    await updateDoc(ref, updatePayload);
    return consultorio.id;
  }

  const docRef = await addDoc(
    consultoriosCol,
    withContext({
      ...payload,
      createdAt: new Date().toISOString(),
    }, context) as any,
  );
  return docRef.id;
}

export async function deleteConsultorio(id: string) {
  const ref = doc(consultoriosCol, id);
  await deleteDoc(ref);
}

export async function updateEquipoConsultorio(
  equipoId: string,
  consultorio?: Pick<Consultorio, 'id' | 'nombre'> | null,
  actor?: { uid?: string; nombre?: string },
) {
  const fn = httpsCallable(firebaseFunctions, 'setEquipoConsultorio');
  await fn({
    equipoId,
    consultorioId: consultorio?.id || null,
    actorNombre: upperOptional(actor?.nombre) || null,
  });
}
