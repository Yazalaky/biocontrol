import type {OrgContext} from '../types';

export const DEFAULT_EMPRESA_ID = 'MEDICUC';
export const DEFAULT_SEDE_ID = 'BUCARAMANGA';
const ACTIVE_ORG_STORAGE_KEY = 'biocontrol_active_org_context';

const sanitizeId = (value: unknown, fallback: string) => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toUpperCase();
  return normalized || fallback;
};

export const getDefaultOrgContext = (): OrgContext => ({
  empresaId: DEFAULT_EMPRESA_ID,
  sedeId: DEFAULT_SEDE_ID,
});

export const normalizeOrgContext = (value: Partial<OrgContext> | null | undefined): OrgContext => ({
  empresaId: sanitizeId(value?.empresaId, DEFAULT_EMPRESA_ID),
  sedeId: sanitizeId(value?.sedeId, DEFAULT_SEDE_ID),
});

export const getStoredOrgContext = (): OrgContext => {
  if (typeof window === 'undefined') return getDefaultOrgContext();
  try {
    const raw = localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
    if (!raw) return getDefaultOrgContext();
    const parsed = JSON.parse(raw) as Partial<OrgContext>;
    return normalizeOrgContext(parsed);
  } catch {
    return getDefaultOrgContext();
  }
};

export const setStoredOrgContext = (context: Partial<OrgContext>) => {
  if (typeof window === 'undefined') return;
  const normalized = normalizeOrgContext(context);
  localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, JSON.stringify(normalized));
};

export const withOrgContext = <T extends object>(
  payload: T,
  context?: Partial<OrgContext> | null,
): T & OrgContext => {
  const base = context ? normalizeOrgContext(context) : getStoredOrgContext();
  return {
    ...payload,
    empresaId: base.empresaId,
    sedeId: base.sedeId,
  };
};
