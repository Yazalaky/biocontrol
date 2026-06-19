import type {OrgContext} from '../types';

export const DEFAULT_EMPRESA_ID = 'MEDICUC';
export const DEFAULT_SEDE_ID = 'BUCARAMANGA';
const ACTIVE_ORG_STORAGE_KEY = 'biocontrol_active_org_context';
const ACCESS_PROFILE_STORAGE_KEY = 'biocontrol_access_profile';

const getSessionStorage = () => {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage;
};

const sanitizeId = (value: unknown, fallback: string) => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toUpperCase();
  return normalized || fallback;
};

const sanitizeIdStrict = (value: unknown) => {
  if (typeof value !== 'string') return '';
  return value.trim().toUpperCase();
};

export const getDefaultOrgContext = (): OrgContext => ({
  empresaId: DEFAULT_EMPRESA_ID,
  sedeId: DEFAULT_SEDE_ID,
});

export const normalizeOrgContext = (value: Partial<OrgContext> | null | undefined): OrgContext => ({
  empresaId: sanitizeId(value?.empresaId, DEFAULT_EMPRESA_ID),
  sedeId: sanitizeId(value?.sedeId, DEFAULT_SEDE_ID),
});

export const tryNormalizeOrgContext = (
  value: Partial<OrgContext> | null | undefined,
): OrgContext | null => {
  const empresaId = sanitizeIdStrict(value?.empresaId);
  const sedeId = sanitizeIdStrict(value?.sedeId);
  if (!empresaId || !sedeId) return null;
  return { empresaId, sedeId };
};

export const hasValidOrgContext = (
  value: Partial<OrgContext> | null | undefined,
): value is OrgContext => {
  return !!tryNormalizeOrgContext(value);
};

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

export const getStoredOrgContextStrict = (): OrgContext | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OrgContext>;
    return tryNormalizeOrgContext(parsed);
  } catch {
    return null;
  }
};

export const setStoredOrgContext = (context: Partial<OrgContext>) => {
  if (typeof window === 'undefined') return;
  const normalized = tryNormalizeOrgContext(context);
  if (!normalized) return;
  localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, JSON.stringify(normalized));
};

export type StoredAccessProfile = {
  isGlobalRead: boolean;
};

export const getStoredAccessProfile = (): StoredAccessProfile => {
  const storage = getSessionStorage();
  if (!storage) return { isGlobalRead: false };
  try {
    const raw = storage.getItem(ACCESS_PROFILE_STORAGE_KEY);
    if (!raw) return { isGlobalRead: false };
    const parsed = JSON.parse(raw) as Partial<StoredAccessProfile>;
    return { isGlobalRead: parsed.isGlobalRead === true };
  } catch {
    return { isGlobalRead: false };
  }
};

export const setStoredAccessProfile = (profile: Partial<StoredAccessProfile>) => {
  const storage = getSessionStorage();
  if (!storage) return;
  storage.setItem(
    ACCESS_PROFILE_STORAGE_KEY,
    JSON.stringify({ isGlobalRead: profile.isGlobalRead === true }),
  );
};

export const clearStoredAccessProfile = () => {
  const storage = getSessionStorage();
  if (!storage) return;
  storage.removeItem(ACCESS_PROFILE_STORAGE_KEY);
};

export const withOrgContext = <T extends object>(
  payload: T,
  context?: Partial<OrgContext> | null,
): T & OrgContext => {
  const base = context ? tryNormalizeOrgContext(context) : getStoredOrgContextStrict();
  if (!base) {
    throw new Error(
      'No hay un contexto organizacional válido. Recarga la sesión una vez y, si el problema continúa, contacta al administrador.',
    );
  }
  return {
    ...payload,
    empresaId: base.empresaId,
    sedeId: base.sedeId,
  };
};
