import { collection, documentId, where, type QueryConstraint } from 'firebase/firestore';

import { db } from '../firebase';
import { getStoredAccessProfile, getStoredOrgContextStrict, withOrgContext } from '../orgContext';
import type { OrgContext } from '../../types';

export const tiposEquipoCol = collection(db, 'tipos_equipo');
export const consultoriosCol = collection(db, 'consultorios');

export function stripUndefinedDeep<T>(value: T): T {
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

export const withContext = <T extends object>(payload: T, context?: Partial<OrgContext>) =>
  stripUndefinedDeep(withOrgContext(payload, context));

export const orgScopeConstraints = (): QueryConstraint[] => {
  const { isGlobalRead } = getStoredAccessProfile();
  if (isGlobalRead) return [];
  const context = getStoredOrgContextStrict();
  if (!context) {
    return [
      where('empresaId', '==', '__INVALID_ORG__'),
      where('sedeId', '==', '__INVALID_ORG__'),
    ];
  }
  return [
    where('empresaId', '==', context.empresaId),
    where('sedeId', '==', context.sedeId),
  ];
};

export const empresasScopeConstraints = (): QueryConstraint[] => {
  const { isGlobalRead } = getStoredAccessProfile();
  if (isGlobalRead) return [];
  const context = getStoredOrgContextStrict();
  if (!context) return [where(documentId(), '==', '__INVALID_ORG__')];
  return [where(documentId(), '==', context.empresaId)];
};

export const sedesScopeConstraints = (): QueryConstraint[] => {
  const { isGlobalRead } = getStoredAccessProfile();
  if (isGlobalRead) return [];
  const context = getStoredOrgContextStrict();
  if (!context) {
    return [
      where('empresaId', '==', '__INVALID_ORG__'),
      where(documentId(), '==', '__INVALID_ORG__'),
    ];
  }
  return [
    where('empresaId', '==', context.empresaId),
    where(documentId(), '==', context.sedeId),
  ];
};

export const upper = (value: string) => value.toUpperCase();
export const upperOptional = (value?: string | null) => (typeof value === 'string' ? value.toUpperCase() : value);
