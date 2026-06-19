/* eslint-disable require-jsdoc */

import {HttpsError} from "firebase-functions/v2/https";

import {
  ALLOWED_ROLES,
  type AllowedRole,
  db,
  DEFAULT_EMPRESA_ID,
  DEFAULT_SEDE_ID,
  type OrgContext,
  TIPO_ACTIVO_VALUES,
  TIPO_PROPIEDAD_VALUES,
  type TipoActivoInventario,
  type TipoPropiedad,
  type UserAccessContext,
} from "./runtime";

export function assertAllowedRole(
  value: unknown,
): asserts value is AllowedRole {
  if (
    typeof value !== "string" ||
    !(ALLOWED_ROLES as readonly string[]).includes(value)
  ) {
    throw new HttpsError(
      "invalid-argument",
      `Rol inválido. Valores permitidos: ${ALLOWED_ROLES.join(", ")}`,
    );
  }
}

export async function assertCallerIsAdmin(uid: string) {
  const enabled = await isCallerAdminEnabled(uid);
  if (!enabled) {
    throw new HttpsError(
      "permission-denied",
      "No autorizado (admin requerido).",
    );
  }
}

export async function getUserRole(uid: string): Promise<AllowedRole | null> {
  const snap = await db.doc(`users/${uid}`).get();
  const role = snap.exists ? snap.data()?.rol : null;
  if (
    typeof role === "string" &&
    (ALLOWED_ROLES as readonly string[]).includes(role)
  ) {
    return role as AllowedRole;
  }
  return null;
}

export async function assertCallerHasRole(uid: string, role: AllowedRole) {
  const callerRole = await getUserRole(uid);
  if (callerRole !== role) {
    throw new HttpsError(
      "permission-denied",
      `No autorizado (${role} requerido).`,
    );
  }
}

export async function assertCallerIsAdminOrHasRole(
  uid: string,
  role: AllowedRole,
) {
  const enabled = await isCallerAdminEnabled(uid);
  if (enabled) return;
  await assertCallerHasRole(uid, role);
}

export function upperTrim(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function normalizeTipoPropiedad(value: unknown) {
  const raw = upperTrim(value);
  if (raw === "PROPIO") return "MEDICUC";
  if (raw === "EXTERNO") return "ALQUILADO";
  if ((TIPO_PROPIEDAD_VALUES as readonly string[]).includes(raw)) {
    return raw as TipoPropiedad;
  }
  throw new HttpsError(
    "invalid-argument",
    "tipoPropiedad inválido. Valores permitidos: " +
      "MEDICUC, PACIENTE, ALQUILADO, EMPLEADO.",
  );
}

export function normalizeTipoActivo(value: unknown): TipoActivoInventario {
  const raw = upperTrim(value || "BIOMEDICO");
  if ((TIPO_ACTIVO_VALUES as readonly string[]).includes(raw)) {
    return raw as TipoActivoInventario;
  }
  throw new HttpsError(
    "invalid-argument",
    "tipoActivo inválido. Valores permitidos: " +
      "BIOMEDICO, NO_BIOMEDICO, MOBILIARIO.",
  );
}

export function normalizeOrgId(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toUpperCase();
  return normalized || fallback;
}

export function buildOrgContext(data?: Record<string, unknown>): OrgContext {
  return {
    empresaId: normalizeOrgId(data?.empresaId, DEFAULT_EMPRESA_ID),
    sedeId: normalizeOrgId(data?.sedeId, DEFAULT_SEDE_ID),
  };
}

export function isSameOrg(a: OrgContext, b: OrgContext): boolean {
  return a.empresaId === b.empresaId && a.sedeId === b.sedeId;
}

export function orgContextKey(org: OrgContext): string {
  return `${org.empresaId}::${org.sedeId}`;
}

export function normalizeScope(
  value: unknown,
  fallback: OrgContext,
): OrgContext[] {
  const raw = Array.isArray(value) ? value : [];
  const parsed = raw
    .filter((item) => item && typeof item === "object")
    .map((item) => buildOrgContext(item as Record<string, unknown>));
  const base = parsed.length > 0 ? parsed : [fallback];
  const out: OrgContext[] = [];
  const keys = new Set<string>();
  for (const item of [...base, fallback]) {
    const key = orgContextKey(item);
    if (keys.has(key)) continue;
    keys.add(key);
    out.push(item);
  }
  return out;
}

export function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefined(item))
      .filter((item) => item !== undefined);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const cleaned = stripUndefined(item);
      if (cleaned === undefined) continue;
      out[key] = cleaned;
    }
    return out;
  }
  return value;
}

export function hasOrgAccess(
  access: UserAccessContext,
  targetOrg: OrgContext,
): boolean {
  if (access.isGlobalRead) return true;
  if (isSameOrg(access, targetOrg)) return true;
  return access.scope.some((item) => isSameOrg(item, targetOrg));
}

export function assertHasOrgAccessOrThrow(
  access: UserAccessContext,
  targetOrg: OrgContext,
  message: string,
) {
  if (hasOrgAccess(access, targetOrg)) return;
  throw new HttpsError("permission-denied", message);
}

export async function isCallerAdminEnabled(uid: string): Promise<boolean> {
  const snap = await db.doc(`admins/${uid}`).get();
  return snap.exists && snap.data()?.enabled === true;
}

export async function getUserOrgContext(uid: string): Promise<OrgContext> {
  const snap = await db.doc(`users/${uid}`).get();
  const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};
  return buildOrgContext(data);
}

export async function getUserAccessContext(
  uid: string,
): Promise<UserAccessContext> {
  const snap = await db.doc(`users/${uid}`).get();
  const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};
  const primary = buildOrgContext(data);
  const role = typeof data.rol === "string" ? data.rol : "";
  return {
    ...primary,
    isGlobalRead:
      data.isGlobalRead === true || role === "GERENCIA",
    scope: normalizeScope(data.scope, primary),
  };
}
