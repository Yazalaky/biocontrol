import { addDoc, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';

import type { HojaVidaFijos, TipoEquipo } from '../../types';
import { stripUndefinedDeep, tiposEquipoCol, upper, upperOptional } from './shared';

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
  };
};

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
