import {setGlobalOptions} from "firebase-functions";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {
  onDocumentCreated,
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";
import {auth as authTriggers} from "firebase-functions/v1";
import {initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {
  FieldValue,
  getFirestore,
  type Query,
  type QueryDocumentSnapshot,
  type Transaction,
} from "firebase-admin/firestore";

setGlobalOptions({maxInstances: 10, region: "us-central1"});

initializeApp();

const db = getFirestore();
const auth = getAuth();

const ALLOWED_ROLES = [
  "GERENCIA",
  "AUXILIAR_ADMINISTRATIVA",
  "INGENIERO_BIOMEDICO",
  "VISITADOR",
] as const;

type AllowedRole = (typeof ALLOWED_ROLES)[number];

/**
 * Valida que el rol sea uno de los permitidos.
 * @param {unknown} value Rol recibido.
 */
function assertAllowedRole(value: unknown): asserts value is AllowedRole {
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

/**
 * Valida si el caller es "admin".
 * Para simplificar: un admin es quien tenga un doc en /admins/{uid}
 * con enabled: true (lo creas manualmente una sola vez desde la consola).
 * @param {string} uid UID del usuario autenticado que invoca la función.
 */
async function assertCallerIsAdmin(uid: string) {
  const snap = await db.doc(`admins/${uid}`).get();
  const enabled = snap.exists && snap.data()?.enabled === true;
  if (!enabled) {
    throw new HttpsError(
      "permission-denied",
      "No autorizado (admin requerido).",
    );
  }
}

/**
 * Obtiene el rol del usuario desde /users/{uid}.rol.
 * Retorna null si no existe o no es un rol permitido.
 * @param {string} uid UID del usuario.
 * @return {Promise<AllowedRole|null>} Rol permitido o null.
 */
async function getUserRole(uid: string): Promise<AllowedRole | null> {
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

/**
 * Valida que el caller tenga el rol indicado.
 * @param {string} uid UID del usuario autenticado.
 * @param {AllowedRole} role Rol requerido.
 */
async function assertCallerHasRole(uid: string, role: AllowedRole) {
  const callerRole = await getUserRole(uid);
  if (callerRole !== role) {
    throw new HttpsError(
      "permission-denied",
      `No autorizado (${role} requerido).`,
    );
  }
}

/**
 * Valida si el caller es admin o si tiene un rol permitido.
 * @param {string} uid UID del usuario autenticado.
 * @param {AllowedRole} role Rol requerido si no es admin.
 */
async function assertCallerIsAdminOrHasRole(uid: string, role: AllowedRole) {
  const adminSnap = await db.doc(`admins/${uid}`).get();
  const enabled = adminSnap.exists && adminSnap.data()?.enabled === true;
  if (enabled) return;
  await assertCallerHasRole(uid, role);
}

const COUNTERS_COLLECTION = "counters";
const TIPO_DOCUMENTO_VALUES = ["CC", "TI", "CE", "RC"] as const;
const ESTADO_PACIENTE_VALUES = ["ACTIVO", "EGRESADO"] as const;
const ESTADO_EQUIPO_VALUES = [
  "DISPONIBLE",
  "ASIGNADO",
  "MANTENIMIENTO",
  "DADO_DE_BAJA",
] as const;
const TIPO_PROPIEDAD_VALUES = [
  "MEDICUC",
  "PACIENTE",
  "ALQUILADO",
  "EMPLEADO",
] as const;
const DEFAULT_EMPRESA_ID = "MEDICUC";
const DEFAULT_SEDE_ID = "BUCARAMANGA";

type OrgContext = {
  empresaId: string;
  sedeId: string;
};

/**
 * Convierte un valor a string trim + UPPERCASE.
 * @param {unknown} value Valor recibido.
 * @return {string} String normalizado.
 */
function upperTrim(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

/**
 * Valida/corrige tipo de propiedad legado.
 * @param {unknown} value Tipo recibido.
 * @return {"MEDICUC"|"PACIENTE"|"ALQUILADO"|"EMPLEADO"} Tipo normalizado.
 */
function normalizeTipoPropiedad(value: unknown) {
  const raw = upperTrim(value);
  if (raw === "PROPIO") return "MEDICUC";
  if (raw === "EXTERNO") return "ALQUILADO";
  if ((TIPO_PROPIEDAD_VALUES as readonly string[]).includes(raw)) {
    return raw as "MEDICUC" | "PACIENTE" | "ALQUILADO" | "EMPLEADO";
  }
  throw new HttpsError(
    "invalid-argument",
    "tipoPropiedad inválido. Valores permitidos: " +
      "MEDICUC, PACIENTE, ALQUILADO, EMPLEADO.",
  );
}

/**
 * Normaliza IDs de contexto organizacional.
 * @param {unknown} value Valor recibido.
 * @param {string} fallback Fallback por defecto.
 * @return {string} ID normalizado.
 */
function normalizeOrgId(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toUpperCase();
  return normalized || fallback;
}

/**
 * Construye contexto org con defaults.
 * @param {Record<string, unknown>|undefined} data Doc fuente.
 * @return {OrgContext} Contexto normalizado.
 */
function buildOrgContext(data?: Record<string, unknown>): OrgContext {
  return {
    empresaId: normalizeOrgId(data?.empresaId, DEFAULT_EMPRESA_ID),
    sedeId: normalizeOrgId(data?.sedeId, DEFAULT_SEDE_ID),
  };
}

/**
 * Lee contexto org del usuario.
 * @param {string} uid UID de usuario.
 * @return {Promise<OrgContext>} Contexto normalizado.
 */
async function getUserOrgContext(uid: string): Promise<OrgContext> {
  const snap = await db.doc(`users/${uid}`).get();
  const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};
  return buildOrgContext(data);
}

/**
 * Obtiene consecutivo en transacción con fallback a max existente.
 * Si el contador no existe, se inicializa con el max actual de la colección.
 * @param {Transaction} tx Transacción activa.
 * @param {string} counterKey Key del contador.
 * @param {string} collectionName Colección objetivo.
 * @return {Promise<number>} Siguiente consecutivo.
 */
async function nextConsecutivoInTx(
  tx: Transaction,
  counterKey: string,
  collectionName: string,
): Promise<number> {
  const counterRef = db.doc(`${COUNTERS_COLLECTION}/${counterKey}`);
  const counterSnap = await tx.get(counterRef);
  const counterValue = counterSnap.data()?.value;
  const hasNumericCounter =
    typeof counterValue === "number" && Number.isFinite(counterValue);
  let current = hasNumericCounter ? counterValue : null;

  if (current === null) {
    const lastSnap = await tx.get(
      db.collection(collectionName).orderBy("consecutivo", "desc").limit(1),
    );
    const lastValue = lastSnap.docs[0]?.data()?.consecutivo;
    current =
      typeof lastValue === "number" && Number.isFinite(lastValue) ?
        lastValue :
        0;
  }

  const next = current + 1;
  tx.set(
    counterRef,
    {
      value: next,
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
  return next;
}

/**
 * Obtiene código de inventario en transacción por prefijo.
 * Si no existe contador, se calcula con el max actual para evitar colisiones.
 * @param {Transaction} tx Transacción activa.
 * @param {"MEDICUC"|"PACIENTE"|"ALQUILADO"|"EMPLEADO"} tipo Tipo de propiedad.
 * @return {Promise<string>} Código generado, p. ej. MBG-001.
 */
async function nextCodigoInventarioInTx(
  tx: Transaction,
  tipo: "MEDICUC" | "PACIENTE" | "ALQUILADO" | "EMPLEADO",
): Promise<string> {
  const prefix = tipo === "PACIENTE" ?
    "MBP-" :
    tipo === "ALQUILADO" ?
      "MBA-" :
      tipo === "EMPLEADO" ?
        "MBE-" :
        "MBG-";
  const counterKey = `equipos_codigo_${prefix.replace("-", "")}`;
  const counterRef = db.doc(`${COUNTERS_COLLECTION}/${counterKey}`);
  const counterSnap = await tx.get(counterRef);
  const counterValue = counterSnap.data()?.value;
  const hasNumericCounter =
    typeof counterValue === "number" && Number.isFinite(counterValue);
  let current = hasNumericCounter ? counterValue : null;

  if (current === null) {
    const allSnap = await tx.get(db.collection("equipos"));
    let max = 0;
    for (const d of allSnap.docs) {
      const code = d.data()?.codigoInventario;
      if (typeof code !== "string" || !code.startsWith(prefix)) continue;
      const rawN = code.slice(prefix.length);
      const n = Number.parseInt(rawN, 10);
      if (!Number.isFinite(n) || n <= 0) continue;
      if (n > max) max = n;
    }
    current = max;
  }

  let next = current + 1;
  let codigo = `${prefix}${String(next).padStart(3, "0")}`;
  let hasCollision = true;
  while (hasCollision) {
    const collision = await tx.get(
      db.collection("equipos")
        .where("codigoInventario", "==", codigo)
        .limit(1),
    );
    hasCollision = !collision.empty;
    if (!hasCollision) break;
    next += 1;
    codigo = `${prefix}${String(next).padStart(3, "0")}`;
  }

  tx.set(
    counterRef,
    {
      value: next,
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
  return codigo;
}

/**
 * Lee todos los documentos de un query en páginas para evitar truncamiento
 * por límites fijos.
 * @param {Query} baseQuery Query base con orden estable.
 * @param {number} pageSize Tamaño de página.
 * @return {Promise<QueryDocumentSnapshot[]>} Documentos acumulados.
 */
async function getAllDocsPaged(
  baseQuery: Query,
  pageSize = 500,
): Promise<QueryDocumentSnapshot[]> {
  const docs: QueryDocumentSnapshot[] = [];
  let q = baseQuery.limit(pageSize);
  let hasMore = true;
  while (hasMore) {
    const snap = await q.get();
    if (snap.empty) break;
    docs.push(...snap.docs);
    if (snap.size < pageSize) {
      hasMore = false;
      continue;
    }
    const lastDoc = snap.docs[snap.docs.length - 1];
    if (!lastDoc) {
      hasMore = false;
      continue;
    }
    q = baseQuery.startAfter(lastDoc).limit(pageSize);
  }
  return docs;
}

/**
 * Carga documentos por ID en lotes y devuelve mapa id -> data.
 * @param {string} collectionName Nombre de colección.
 * @param {string[]} ids IDs a consultar.
 * @return {Promise<Map<string, Record<string, unknown>>>} Mapa de datos.
 */
async function getDocDataMapByIds(
  collectionName: string,
  ids: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  const uniqueIds = Array.from(
    new Set(ids.filter((id) => typeof id === "string" && id.trim())),
  );
  if (!uniqueIds.length) return out;

  const chunkSize = 300;
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    const refs = chunk.map((id) => db.doc(`${collectionName}/${id}`));
    const snaps = await db.getAll(...refs);
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const data = snap.data();
      if (!data) continue;
      out.set(snap.id, data as Record<string, unknown>);
    }
  }
  return out;
}

/**
 * 1) AUTOMATIZACIÓN BÁSICA:
 * Cuando se crea un usuario en Authentication (por consola/admin), creamos su
 * perfil en Firestore para que no tengas que hacerlo manualmente.
 *
 * El rol queda sin asignar (null) y tú lo defines luego.
 */
export const syncUserProfile = authTriggers.user().onCreate(async (user) => {
  const userRef = db.doc(`users/${user.uid}`);
  const existing = await userRef.get();
  if (existing.exists) return;

  const defaultScope = [
    {empresaId: DEFAULT_EMPRESA_ID, sedeId: DEFAULT_SEDE_ID},
  ];

  await userRef.set(
    {
      nombre: user.displayName ?? user.email ?? "Usuario",
      email: user.email ?? null,
      rol: null,
      empresaId: DEFAULT_EMPRESA_ID,
      sedeId: DEFAULT_SEDE_ID,
      scope: defaultScope,
      isGlobalRead: false,
      createdAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
});

/**
 * 2) AUTOMATIZACIÓN COMPLETA (ADMIN):
 * Crea un usuario (Auth) + crea su doc en /users/{uid} con rol.
 */
export const adminCreateUser = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError(
      "unauthenticated",
      "Debes iniciar sesión para usar esta función.",
    );
  }
  await assertCallerIsAdmin(request.auth.uid);

  const data = request.data as {
    email?: unknown;
    password?: unknown;
    nombre?: unknown;
    rol?: unknown;
    empresaId?: unknown;
    sedeId?: unknown;
    isGlobalRead?: unknown;
  };

  const email = typeof data.email === "string" ? data.email.trim() : "";
  const password = typeof data.password === "string" ? data.password : "";
  const nombre = typeof data.nombre === "string" ? data.nombre.trim() : "";
  assertAllowedRole(data.rol);
  const org = buildOrgContext({
    empresaId: data.empresaId,
    sedeId: data.sedeId,
  });
  const isGlobalRead =
    data.rol === "GERENCIA" || data.isGlobalRead === true;

  if (!email) throw new HttpsError("invalid-argument", "email es requerido.");
  if (password.length < 6) {
    throw new HttpsError(
      "invalid-argument",
      "password debe tener mínimo 6 caracteres.",
    );
  }

  try {
    const user = await auth.createUser({
      email,
      password,
      displayName: nombre || undefined,
    });

    await db.doc(`users/${user.uid}`).set(
      {
        nombre: nombre || user.displayName || user.email || "Usuario",
        email: user.email ?? null,
        rol: data.rol,
        empresaId: org.empresaId,
        sedeId: org.sedeId,
        scope: [{empresaId: org.empresaId, sedeId: org.sedeId}],
        isGlobalRead,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: request.auth.uid,
      },
      {merge: true},
    );

    return {uid: user.uid};
  } catch (err: unknown) {
    // Mensajes típicos: auth/email-already-exists, auth/invalid-password, etc.
    const maybeCode =
      typeof err === "object" && err !== null && "code" in err ?
        (err as {code?: unknown}).code :
        null;
    const code = typeof maybeCode === "string" ? maybeCode : "unknown";
    throw new HttpsError(
      "internal",
      `No se pudo crear el usuario. Detalle: ${code}`,
    );
  }
});

/**
 * 3) ADMIN: asignar/actualizar rol de un usuario existente
 * (creado por consola o por la función).
 */
export const adminSetUserRole = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError(
      "unauthenticated",
      "Debes iniciar sesión para usar esta función.",
    );
  }
  await assertCallerIsAdmin(request.auth.uid);

  const data = request.data as {
    uid?: unknown;
    rol?: unknown;
    nombre?: unknown;
    empresaId?: unknown;
    sedeId?: unknown;
    isGlobalRead?: unknown;
  };
  const uid = typeof data.uid === "string" ? data.uid.trim() : "";
  if (!uid) throw new HttpsError("invalid-argument", "uid es requerido.");
  assertAllowedRole(data.rol);
  const nombre = typeof data.nombre === "string" ? data.nombre.trim() : "";
  const currentSnap = await db.doc(`users/${uid}`).get();
  const currentData = currentSnap.exists ?
    (currentSnap.data() as Record<string, unknown>) :
    {};
  const org = buildOrgContext({
    empresaId: data.empresaId ?? currentData.empresaId,
    sedeId: data.sedeId ?? currentData.sedeId,
  });
  const isGlobalRead =
    data.rol === "GERENCIA" || data.isGlobalRead === true;

  await db.doc(`users/${uid}`).set(
    {
      rol: data.rol,
      ...(nombre ? {nombre} : {}),
      empresaId: org.empresaId,
      sedeId: org.sedeId,
      scope: [{empresaId: org.empresaId, sedeId: org.sedeId}],
      isGlobalRead,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: request.auth.uid,
    },
    {merge: true},
  );

  return {ok: true};
});

/**
 * 3.1) LISTAR AUXILIARES (para selección en la app).
 * Retorna usuarios con rol AUXILIAR_ADMINISTRATIVA.
 *
 * Se expone como callable para evitar abrir lectura masiva de /users en rules.
 */
export const listAuxiliares = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError(
      "unauthenticated",
      "Debes iniciar sesión para usar esta función.",
    );
  }

  await assertCallerIsAdminOrHasRole(
    request.auth.uid,
    "INGENIERO_BIOMEDICO",
  );

  const snap = await db
    .collection("users")
    .where("rol", "==", "AUXILIAR_ADMINISTRATIVA")
    .limit(200)
    .get();

  const users = snap.docs
    .map((d) => {
      const data = d.data() as Record<string, unknown>;
      const nombre = typeof data.nombre === "string" ? data.nombre : "";
      const email = typeof data.email === "string" ? data.email : "";
      return {uid: d.id, nombre, email};
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  return {users};
});

/**
 * Completa contexto organizacional en una colección operativa.
 * @param {string} collectionName Nombre de colección.
 * @return {Promise<number>} Cantidad de documentos actualizados.
 */
async function backfillCollectionOrgContext(
  collectionName: string,
): Promise<number> {
  const snap = await db.collection(collectionName).get();
  let updated = 0;
  let writes = 0;
  let batch = db.batch();

  for (const docSnap of snap.docs) {
    const data = docSnap.data() as Record<string, unknown>;
    const org = buildOrgContext(data);
    const currentEmpresa = normalizeOrgId(data.empresaId, org.empresaId);
    const currentSede = normalizeOrgId(data.sedeId, org.sedeId);
    const needsUpdate =
      currentEmpresa !== org.empresaId ||
      currentSede !== org.sedeId ||
      typeof data.empresaId !== "string" ||
      typeof data.sedeId !== "string";
    if (!needsUpdate) continue;

    batch.set(
      docSnap.ref,
      {
        empresaId: org.empresaId,
        sedeId: org.sedeId,
      },
      {merge: true},
    );
    updated += 1;
    writes += 1;

    if (writes >= 400) {
      await batch.commit();
      batch = db.batch();
      writes = 0;
    }
  }

  if (writes > 0) await batch.commit();
  return updated;
}

/**
 * Completa contexto organizacional y scope en documentos de usuarios.
 * @return {Promise<number>} Cantidad de documentos actualizados.
 */
async function backfillUsersOrgContext(): Promise<number> {
  const snap = await db.collection("users").get();
  let updated = 0;
  let writes = 0;
  let batch = db.batch();

  for (const docSnap of snap.docs) {
    const data = docSnap.data() as Record<string, unknown>;
    const org = buildOrgContext(data);
    const role = typeof data.rol === "string" ? data.rol : "";
    const isGlobalRead =
      data.isGlobalRead === true || role === "GERENCIA";
    const currentScope = Array.isArray(data.scope) ? data.scope : [];
    const hasAnyScope = currentScope.length > 0;
    const needsUpdate =
      typeof data.empresaId !== "string" ||
      typeof data.sedeId !== "string" ||
      data.isGlobalRead !== isGlobalRead ||
      !hasAnyScope;
    if (!needsUpdate) continue;

    batch.set(
      docSnap.ref,
      {
        empresaId: org.empresaId,
        sedeId: org.sedeId,
        scope: [{empresaId: org.empresaId, sedeId: org.sedeId}],
        isGlobalRead,
      },
      {merge: true},
    );
    updated += 1;
    writes += 1;

    if (writes >= 400) {
      await batch.commit();
      batch = db.batch();
      writes = 0;
    }
  }

  if (writes > 0) await batch.commit();
  return updated;
}

export const seedOrgCatalogPhase1 = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError(
      "unauthenticated",
      "Debes iniciar sesión para usar esta función.",
    );
  }
  await assertCallerIsAdmin(request.auth.uid);

  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(
    db.doc("empresas/MEDICUC"),
    {nombre: "MEDICUC", activo: true, updatedAt: now},
    {merge: true},
  );
  batch.set(
    db.doc("empresas/ALIADOS"),
    {nombre: "ALIADOS", activo: true, updatedAt: now},
    {merge: true},
  );
  batch.set(
    db.doc("sedes/BUCARAMANGA"),
    {
      empresaId: "MEDICUC",
      nombre: "BUCARAMANGA",
      activo: true,
      usaConsultorios: false,
      updatedAt: now,
    },
    {merge: true},
  );
  batch.set(
    db.doc("sedes/ALIADOS_BGA"),
    {
      empresaId: "ALIADOS",
      nombre: "ALIADOS BUCARAMANGA",
      activo: true,
      usaConsultorios: true,
      updatedAt: now,
    },
    {merge: true},
  );
  await batch.commit();
  return {ok: true};
});

export const backfillOrgContextPhase1 = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError(
      "unauthenticated",
      "Debes iniciar sesión para usar esta función.",
    );
  }
  await assertCallerIsAdmin(request.auth.uid);

  const collections = [
    "pacientes",
    "profesionales",
    "equipos",
    "asignaciones",
    "asignaciones_profesionales",
    "actas_profesionales",
    "actas_internas",
    "reportes_equipos",
    "mantenimientos",
    "solicitudes_equipos_paciente",
  ];
  const stats: Record<string, number> = {};
  for (const name of collections) {
    stats[name] = await backfillCollectionOrgContext(name);
  }
  stats.users = await backfillUsersOrgContext();
  return {ok: true, stats};
});

/**
 * 3.2) Crear paciente (transaccional).
 * Asigna consecutivo único y evita colisiones por concurrencia.
 */
export const createPaciente = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError(
      "unauthenticated",
      "Debes iniciar sesión para usar esta función.",
    );
  }
  await assertCallerHasRole(request.auth.uid, "AUXILIAR_ADMINISTRATIVA");
  const callerOrg = await getUserOrgContext(request.auth.uid);

  const raw = (request.data as {paciente?: unknown})?.paciente;
  if (!raw || typeof raw !== "object") {
    throw new HttpsError("invalid-argument", "paciente es requerido.");
  }
  const paciente = raw as Record<string, unknown>;
  const orgContext = buildOrgContext({
    empresaId: paciente.empresaId ?? callerOrg.empresaId,
    sedeId: paciente.sedeId ?? callerOrg.sedeId,
  });

  const nombreCompleto = upperTrim(paciente.nombreCompleto);
  const tipoDocumento = upperTrim(paciente.tipoDocumento);
  const numeroDocumento = upperTrim(paciente.numeroDocumento);
  const direccion = upperTrim(paciente.direccion);
  const eps =
    typeof paciente.eps === "string" ? paciente.eps.trim() : "";
  const regimenRaw = upperTrim(paciente.regimen);
  const fechaInicioPrograma =
    typeof paciente.fechaInicioPrograma === "string" ?
      paciente.fechaInicioPrograma.trim() :
      "";
  const horasPrestadas = upperTrim(paciente.horasPrestadas);
  const tipoServicio = upperTrim(paciente.tipoServicio);
  const diagnostico = upperTrim(paciente.diagnostico);
  const telefono = upperTrim(paciente.telefono);
  const nombreFamiliar = upperTrim(paciente.nombreFamiliar);
  const telefonoFamiliar = upperTrim(paciente.telefonoFamiliar);
  const estado = upperTrim(paciente.estado || "ACTIVO");

  if (!nombreCompleto) {
    throw new HttpsError(
      "invalid-argument",
      "paciente.nombreCompleto es requerido.",
    );
  }
  if (!(TIPO_DOCUMENTO_VALUES as readonly string[]).includes(tipoDocumento)) {
    throw new HttpsError(
      "invalid-argument",
      "tipoDocumento inválido. Valores permitidos: CC, TI, CE, RC.",
    );
  }
  if (!numeroDocumento) {
    throw new HttpsError(
      "invalid-argument",
      "paciente.numeroDocumento es requerido.",
    );
  }
  if (!direccion || !eps || !fechaInicioPrograma || !horasPrestadas) {
    throw new HttpsError(
      "invalid-argument",
      "Faltan campos requeridos del paciente.",
    );
  }
  if (!tipoServicio || !diagnostico || !telefono) {
    throw new HttpsError(
      "invalid-argument",
      "Faltan campos clínicos requeridos del paciente.",
    );
  }
  if (!nombreFamiliar || !telefonoFamiliar) {
    throw new HttpsError(
      "invalid-argument",
      "Faltan datos del familiar/acudiente.",
    );
  }
  if (
    !(ESTADO_PACIENTE_VALUES as readonly string[]).includes(estado)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "estado inválido. Valores permitidos: ACTIVO, EGRESADO.",
    );
  }

  const regimen =
    regimenRaw &&
      ["CONTRIBUTIVO", "SUBSIDIADO", "ESPECIAL"].includes(regimenRaw) ?
      regimenRaw :
      undefined;
  const zona = upperTrim(paciente.zona);
  if (
    zona &&
    !["GIRON", "BGA1", "BGA2", "PIEDECUESTA", "FLORIDABLANCA"].includes(zona)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "zona inválida. Valores permitidos: " +
        "GIRON, BGA1, BGA2, PIEDECUESTA, FLORIDABLANCA.",
    );
  }

  const pacienteData: Record<string, unknown> = {
    ...orgContext,
    nombreCompleto,
    tipoDocumento,
    numeroDocumento,
    direccion,
    eps,
    fechaInicioPrograma,
    horasPrestadas,
    tipoServicio,
    diagnostico,
    telefono,
    nombreFamiliar,
    telefonoFamiliar,
    estado,
    barrio: upperTrim(paciente.barrio) || undefined,
    zona: zona || undefined,
    regimen,
    documentoFamiliar: upperTrim(paciente.documentoFamiliar) || undefined,
    parentescoFamiliar: upperTrim(paciente.parentescoFamiliar) || undefined,
    fechaSalida:
      typeof paciente.fechaSalida === "string" ?
        paciente.fechaSalida.trim() :
        undefined,
  };

  const created = await db.runTransaction(async (tx) => {
    const dupSnap = await tx.get(
      db.collection("pacientes")
        .where("numeroDocumento", "==", numeroDocumento)
        .limit(1),
    );
    if (!dupSnap.empty) {
      throw new HttpsError(
        "already-exists",
        `Ya existe un paciente con documento ${numeroDocumento}.`,
      );
    }

    const consecutivo = await nextConsecutivoInTx(
      tx,
      "pacientes_consecutivo",
      "pacientes",
    );
    const pacienteRef = db.collection("pacientes").doc();
    tx.set(pacienteRef, {
      ...pacienteData,
      consecutivo,
      createdAt: FieldValue.serverTimestamp(),
    });
    return {id: pacienteRef.id, consecutivo};
  });

  return created;
});

/**
 * 3.3) Crear equipo (transaccional).
 * Genera código inventario único por prefijo (MBG/MBP/MBA/MBE).
 */
export const createEquipo = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError(
      "unauthenticated",
      "Debes iniciar sesión para usar esta función.",
    );
  }
  await assertCallerHasRole(request.auth.uid, "INGENIERO_BIOMEDICO");
  const callerOrg = await getUserOrgContext(request.auth.uid);

  const raw = (request.data as {equipo?: unknown})?.equipo;
  if (!raw || typeof raw !== "object") {
    throw new HttpsError("invalid-argument", "equipo es requerido.");
  }
  const equipo = raw as Record<string, unknown>;
  const orgContext = buildOrgContext({
    empresaId: equipo.empresaId ?? callerOrg.empresaId,
    sedeId: equipo.sedeId ?? callerOrg.sedeId,
  });

  const numeroSerie = upperTrim(equipo.numeroSerie);
  const nombre = upperTrim(equipo.nombre);
  const marca = upperTrim(equipo.marca);
  const modelo = upperTrim(equipo.modelo);
  const estado = upperTrim(equipo.estado || "DISPONIBLE");
  const tipoPropiedad = normalizeTipoPropiedad(equipo.tipoPropiedad);
  const observaciones = upperTrim(equipo.observaciones);
  const fechaIngreso =
    typeof equipo.fechaIngreso === "string" && equipo.fechaIngreso.trim() ?
      equipo.fechaIngreso.trim() :
      new Date().toISOString();

  if (!numeroSerie || !nombre || !marca || !modelo) {
    throw new HttpsError(
      "invalid-argument",
      "Faltan campos requeridos del equipo.",
    );
  }
  if (
    !(ESTADO_EQUIPO_VALUES as readonly string[]).includes(estado)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "estado inválido. Valores permitidos: DISPONIBLE, ASIGNADO, " +
        "MANTENIMIENTO, DADO_DE_BAJA.",
    );
  }

  const created = await db.runTransaction(async (tx) => {
    const dupSerieSnap = await tx.get(
      db.collection("equipos")
        .where("numeroSerie", "==", numeroSerie)
        .limit(1),
    );
    if (!dupSerieSnap.empty) {
      throw new HttpsError(
        "already-exists",
        `El serial ${numeroSerie} ya existe en inventario.`,
      );
    }

    const codigoInventario = await nextCodigoInventarioInTx(tx, tipoPropiedad);
    const equipoRef = db.collection("equipos").doc();
    const payload: Record<string, unknown> = {
      ...orgContext,
      codigoInventario,
      numeroSerie,
      nombre,
      marca,
      modelo,
      estado,
      tipoPropiedad,
      observaciones,
      fechaIngreso,
      disponibleParaEntrega:
        typeof equipo.disponibleParaEntrega === "boolean" ?
          equipo.disponibleParaEntrega :
          false,
      ubicacionActual:
        typeof equipo.ubicacionActual === "string" &&
          equipo.ubicacionActual.trim() ?
          upperTrim(equipo.ubicacionActual) :
          "BODEGA",
      tipoEquipoId:
        typeof equipo.tipoEquipoId === "string" && equipo.tipoEquipoId.trim() ?
          equipo.tipoEquipoId.trim() :
          undefined,
      hojaVidaDatos:
        typeof equipo.hojaVidaDatos === "object" && equipo.hojaVidaDatos ?
          equipo.hojaVidaDatos :
          undefined,
      hojaVidaOverrides:
        typeof equipo.hojaVidaOverrides === "object" &&
          equipo.hojaVidaOverrides ?
          equipo.hojaVidaOverrides :
          undefined,
      calibracionPeriodicidad:
        typeof equipo.calibracionPeriodicidad === "string" &&
          equipo.calibracionPeriodicidad.trim() ?
          upperTrim(equipo.calibracionPeriodicidad) :
          undefined,
      fechaMantenimiento:
        typeof equipo.fechaMantenimiento === "string" &&
          equipo.fechaMantenimiento.trim() ?
          equipo.fechaMantenimiento.trim() :
          undefined,
      fechaBaja:
        typeof equipo.fechaBaja === "string" && equipo.fechaBaja.trim() ?
          equipo.fechaBaja.trim() :
          undefined,
      custodioUid:
        typeof equipo.custodioUid === "string" && equipo.custodioUid.trim() ?
          equipo.custodioUid.trim() :
          undefined,
      empresaAlquiler:
        tipoPropiedad === "ALQUILADO" &&
          typeof equipo.empresaAlquiler === "string" &&
          equipo.empresaAlquiler.trim() ?
          upperTrim(equipo.empresaAlquiler) :
          undefined,
      datosPropietario:
        typeof equipo.datosPropietario === "object" &&
          equipo.datosPropietario ?
          equipo.datosPropietario :
          undefined,
      createdAt: FieldValue.serverTimestamp(),
    };

    tx.set(equipoRef, payload);
    return {id: equipoRef.id, codigoInventario};
  });

  return created;
});

/**
 * 3.4) Crear asignación de paciente (transaccional).
 * Asigna consecutivo único y evita doble asignación activa del mismo equipo.
 */
export const createAsignacionPaciente = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError(
      "unauthenticated",
      "Debes iniciar sesión para usar esta función.",
    );
  }
  await assertCallerHasRole(request.auth.uid, "AUXILIAR_ADMINISTRATIVA");
  const callerOrg = await getUserOrgContext(request.auth.uid);

  const raw = (request.data as {asignacion?: unknown})?.asignacion;
  if (!raw || typeof raw !== "object") {
    throw new HttpsError("invalid-argument", "asignacion es requerida.");
  }
  const data = raw as Record<string, unknown>;
  const requestedOrg = buildOrgContext({
    empresaId: data.empresaId ?? callerOrg.empresaId,
    sedeId: data.sedeId ?? callerOrg.sedeId,
  });

  const idPaciente = assertNonEmptyString(data.idPaciente, "idPaciente");
  const idEquipo = assertNonEmptyString(data.idEquipo, "idEquipo");
  const usuarioAsigna = upperTrim(data.usuarioAsigna);
  if (!usuarioAsigna) {
    throw new HttpsError("invalid-argument", "usuarioAsigna es requerido.");
  }
  const fechaAsignacion =
    typeof data.fechaAsignacionIso === "string" &&
      data.fechaAsignacionIso.trim() ?
      data.fechaAsignacionIso.trim() :
      new Date().toISOString();

  const assignment = await db.runTransaction(async (tx) => {
    const [pacienteSnap, equipoSnap] = await Promise.all([
      tx.get(db.doc(`pacientes/${idPaciente}`)),
      tx.get(db.doc(`equipos/${idEquipo}`)),
    ]);

    if (!pacienteSnap.exists) {
      throw new HttpsError("not-found", "El paciente no existe.");
    }
    if (!equipoSnap.exists) {
      throw new HttpsError("not-found", "El equipo no existe.");
    }
    const pacienteData = pacienteSnap.data() as Record<string, unknown>;
    const equipoData = equipoSnap.data() as Record<string, unknown>;
    const pacienteOrg = buildOrgContext(pacienteData);
    const equipoOrg = buildOrgContext(equipoData);
    if (
      pacienteOrg.empresaId !== equipoOrg.empresaId ||
      pacienteOrg.sedeId !== equipoOrg.sedeId
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Paciente y equipo pertenecen a contextos distintos.",
      );
    }
    const asignacionOrg =
      pacienteOrg.empresaId === equipoOrg.empresaId &&
      pacienteOrg.sedeId === equipoOrg.sedeId ?
        pacienteOrg :
        requestedOrg;

    const [activePacienteSnap, activeProfesionalSnap] = await Promise.all([
      tx.get(
        db.collection("asignaciones")
          .where("idEquipo", "==", idEquipo)
          .where("estado", "==", "ACTIVA")
          .limit(1),
      ),
      tx.get(
        db.collection("asignaciones_profesionales")
          .where("idEquipo", "==", idEquipo)
          .where("estado", "==", "ACTIVA")
          .limit(1),
      ),
    ]);
    if (!activePacienteSnap.empty || !activeProfesionalSnap.empty) {
      throw new HttpsError(
        "failed-precondition",
        "El equipo no está disponible.",
      );
    }

    const consecutivo = await nextConsecutivoInTx(
      tx,
      "asignaciones_consecutivo",
      "asignaciones",
    );
    const nowIso = new Date().toISOString();
    const asignacionRef = db.collection("asignaciones").doc();
    const asignacion = {
      ...asignacionOrg,
      consecutivo,
      idPaciente,
      idEquipo,
      fechaAsignacion,
      fechaActualizacionEntrega: nowIso,
      estado: "ACTIVA",
      observacionesEntrega: upperTrim(data.observacionesEntrega),
      firmaAuxiliar:
        typeof data.firmaAuxiliar === "string" && data.firmaAuxiliar.trim() ?
          data.firmaAuxiliar.trim() :
          undefined,
      usuarioAsigna,
      auxiliarNombre:
        typeof data.auxiliarNombre === "string" && data.auxiliarNombre.trim() ?
          upperTrim(data.auxiliarNombre) :
          undefined,
      auxiliarUid:
        typeof data.auxiliarUid === "string" && data.auxiliarUid.trim() ?
          data.auxiliarUid.trim() :
          undefined,
      createdAt: FieldValue.serverTimestamp(),
    };
    tx.set(asignacionRef, asignacion);

    return {
      id: asignacionRef.id,
      ...asignacionOrg,
      consecutivo,
      idPaciente,
      idEquipo,
      fechaAsignacion,
      fechaActualizacionEntrega: nowIso,
      estado: "ACTIVA",
      observacionesEntrega: upperTrim(data.observacionesEntrega),
      firmaAuxiliar:
        typeof data.firmaAuxiliar === "string" && data.firmaAuxiliar.trim() ?
          data.firmaAuxiliar.trim() :
          undefined,
      usuarioAsigna,
      auxiliarNombre:
        typeof data.auxiliarNombre === "string" && data.auxiliarNombre.trim() ?
          upperTrim(data.auxiliarNombre) :
          undefined,
      auxiliarUid:
        typeof data.auxiliarUid === "string" && data.auxiliarUid.trim() ?
          data.auxiliarUid.trim() :
          undefined,
    };
  });

  return {asignacion: assignment};
});

/**
 * 3.5) LISTAR PACIENTES SIN ASIGNACION ACTIVA (VISITADOR).
 * Retorna id, nombreCompleto y numeroDocumento.
 *
 * Se expone como callable para evitar abrir lectura masiva en rules.
 */
export const listPacientesSinAsignacion = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError(
      "unauthenticated",
      "Debes iniciar sesión para usar esta función.",
    );
  }

  await assertCallerHasRole(request.auth.uid, "VISITADOR");

  const [activeDocs, pacientesDocs] = await Promise.all([
    getAllDocsPaged(
      db.collection("asignaciones")
        .where("estado", "==", "ACTIVA")
        .orderBy("__name__"),
    ),
    getAllDocsPaged(db.collection("pacientes").orderBy("__name__")),
  ]);

  const activeSet = new Set<string>();
  for (const docSnap of activeDocs) {
    const data = docSnap.data() as Record<string, unknown>;
    const idPaciente =
      typeof data.idPaciente === "string" ? data.idPaciente : "";
    if (idPaciente) activeSet.add(idPaciente);
  }

  const pacientes = [] as Array<{id: string; nombre: string; doc: string}>;
  const addPaciente = (docSnap: QueryDocumentSnapshot) => {
    const data = docSnap.data() as Record<string, unknown>;
    const nombre =
      typeof data.nombreCompleto === "string" ? data.nombreCompleto : "";
    const doc =
      typeof data.numeroDocumento === "string" ? data.numeroDocumento : "";
    pacientes.push({id: docSnap.id, nombre, doc});
  };

  for (const docSnap of pacientesDocs) {
    if (activeSet.has(docSnap.id)) continue;
    addPaciente(docSnap);
  }

  pacientes.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  return {pacientes};
});

/**
 * Lista historial completo de firmas de entrega capturadas por el visitador.
 * Incluye asignaciones activas y finalizadas.
 */
export const listFirmasCapturadasVisitador = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError(
      "unauthenticated",
      "Debes iniciar sesión para usar esta función.",
    );
  }
  const callerUid = request.auth.uid;
  await assertCallerHasRole(callerUid, "VISITADOR");

  const asignacionesSnap = await db
    .collection("asignaciones")
    .where("firmaPacienteEntregaCapturadaPorUid", "==", callerUid)
    .get();

  const baseRows = asignacionesSnap.docs
    .map((docSnap) => {
      const d = docSnap.data() as Record<string, unknown>;
      const firma =
        typeof d.firmaPacienteEntrega === "string" ?
          d.firmaPacienteEntrega :
          "";
      if (!firma) return null;
      const idPaciente = typeof d.idPaciente === "string" ? d.idPaciente : "";
      const idEquipo = typeof d.idEquipo === "string" ? d.idEquipo : "";
      const estado = typeof d.estado === "string" ? d.estado : "";
      const capturadaAt =
        typeof d.firmaPacienteEntregaCapturadaAt === "string" ?
          d.firmaPacienteEntregaCapturadaAt :
          "";
      const capturadaPor =
        typeof d.firmaPacienteEntregaCapturadaPorNombre === "string" ?
          d.firmaPacienteEntregaCapturadaPorNombre :
          "";
      return {
        idAsignacion: docSnap.id,
        idPaciente,
        idEquipo,
        estado,
        firmaPacienteEntrega: firma,
        firmaPacienteEntregaCapturadaAt: capturadaAt,
        firmaPacienteEntregaCapturadaPorNombre: capturadaPor,
      };
    })
    .filter((row): row is NonNullable<typeof row> => !!row);

  baseRows.sort((a, b) => {
    const ta = new Date(a.firmaPacienteEntregaCapturadaAt || 0).getTime();
    const tb = new Date(b.firmaPacienteEntregaCapturadaAt || 0).getTime();
    return tb - ta;
  });

  const pacienteMap = await getDocDataMapByIds(
    "pacientes",
    baseRows.map((r) => r.idPaciente),
  );
  const equipoMap = await getDocDataMapByIds(
    "equipos",
    baseRows.map((r) => r.idEquipo),
  );

  const firmas = baseRows.map((r) => {
    const paciente = pacienteMap.get(r.idPaciente);
    const equipo = equipoMap.get(r.idEquipo);
    const pacienteNombre =
      typeof paciente?.nombreCompleto === "string" ?
        paciente.nombreCompleto :
        "PACIENTE";
    const pacienteDocumento =
      typeof paciente?.numeroDocumento === "string" ?
        paciente.numeroDocumento :
        "";
    const equipoCodigo =
      typeof equipo?.codigoInventario === "string" ?
        equipo.codigoInventario :
        "";
    const equipoNombre =
      typeof equipo?.nombre === "string" ? equipo.nombre : "EQUIPO";

    return {
      idAsignacion: r.idAsignacion,
      estado: r.estado,
      pacienteNombre,
      pacienteDocumento,
      equipoCodigoInventario: equipoCodigo,
      equipoNombre,
      firmaPacienteEntrega: r.firmaPacienteEntrega,
      firmaPacienteEntregaCapturadaAt: r.firmaPacienteEntregaCapturadaAt || "",
      firmaPacienteEntregaCapturadaPorNombre:
        r.firmaPacienteEntregaCapturadaPorNombre || "",
    };
  });

  return {firmas};
});

/**
 * Recalcula flags para VISITADOR basándose en asignaciones activas.
 * Útil como paso de migración inicial (cuando ya existen asignaciones previas).
 *
 * @return {Promise<Object>} Resultado con conteos.
 */
export const rebuildVisitadorFlags = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError(
      "unauthenticated",
      "Debes iniciar sesión para usar esta función.",
    );
  }

  await assertCallerIsAdminOrHasRole(
    request.auth.uid,
    "INGENIERO_BIOMEDICO",
  );

  const activeSnap = await db
    .collection("asignaciones")
    .where("estado", "==", "ACTIVA")
    .get();

  const pacientesSet = new Set<string>();
  const equiposSet = new Set<string>();
  for (const docSnap of activeSnap.docs) {
    const d = docSnap.data() as Record<string, unknown>;
    const idPaciente = typeof d.idPaciente === "string" ? d.idPaciente : "";
    const idEquipo = typeof d.idEquipo === "string" ? d.idEquipo : "";
    if (idPaciente) pacientesSet.add(idPaciente);
    if (idEquipo) equiposSet.add(idEquipo);
  }

  const commitBatches = async (
    ops: Array<{refPath: string; data: Record<string, unknown>}>,
  ) => {
    const chunkSize = 400;
    for (let i = 0; i < ops.length; i += chunkSize) {
      const chunk = ops.slice(i, i + chunkSize);
      const batch = db.batch();
      for (const op of chunk) {
        batch.set(db.doc(op.refPath), op.data, {merge: true});
      }
      await batch.commit();
    }
  };

  // 1) Marcar true para los que están activos
  await Promise.all([
    commitBatches(
      Array.from(pacientesSet).map((id) => ({
        refPath: `pacientes/${id}`,
        data: {
          tieneAsignacionActiva: true,
          updatedAt: FieldValue.serverTimestamp(),
        },
      })),
    ),
    commitBatches(
      Array.from(equiposSet).map((id) => ({
        refPath: `equipos/${id}`,
        data: {
          asignadoActivo: true,
          updatedAt: FieldValue.serverTimestamp(),
        },
      })),
    ),
  ]);

  // 2) Marcar false solo para docs que estaban true pero ya no están activos
  const pacientesTrueSnap = await db
    .collection("pacientes")
    .where("tieneAsignacionActiva", "==", true)
    .get();
  const equiposTrueSnap = await db
    .collection("equipos")
    .where("asignadoActivo", "==", true)
    .get();

  const pacientesToFalse = pacientesTrueSnap.docs
    .filter((d) => !pacientesSet.has(d.id))
    .map((d) => ({
      refPath: `pacientes/${d.id}`,
      data: {
        tieneAsignacionActiva: false,
        updatedAt: FieldValue.serverTimestamp(),
      },
    }));

  const equiposToFalse = equiposTrueSnap.docs
    .filter((d) => !equiposSet.has(d.id))
    .map((d) => ({
      refPath: `equipos/${d.id}`,
      data: {
        asignadoActivo: false,
        updatedAt: FieldValue.serverTimestamp(),
      },
    }));

  await Promise.all([
    commitBatches(pacientesToFalse),
    commitBatches(equiposToFalse),
  ]);

  return {
    ok: true,
    pacientesActivos: pacientesSet.size,
    equiposActivos: equiposSet.size,
  };
});

/**
 * 3.3) VISITADOR: guardar firma de entrega del paciente.
 * Actualiza la asignación activa con firma y auditoría.
 */
export const guardarFirmaEntregaVisitador = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError(
      "unauthenticated",
      "Debes iniciar sesión para usar esta función.",
    );
  }

  const callerUid = request.auth.uid;
  await assertCallerHasRole(callerUid, "VISITADOR");

  const data = request.data as {
    idAsignacion?: unknown;
    firmaEntrega?: unknown;
    capturadoPorNombre?: unknown;
  };
  const idAsignacion = assertNonEmptyString(data.idAsignacion, "idAsignacion");
  const firmaEntrega = assertNonEmptyString(data.firmaEntrega, "firmaEntrega");
  const capturadoPorNombre =
    typeof data.capturadoPorNombre === "string" ?
      data.capturadoPorNombre.trim() :
      "";
  if (!capturadoPorNombre) {
    throw new HttpsError(
      "invalid-argument",
      "capturadoPorNombre es requerido.",
    );
  }

  const asignacionRef = db.doc(`asignaciones/${idAsignacion}`);
  const asignacionSnap = await asignacionRef.get();
  if (!asignacionSnap.exists) {
    throw new HttpsError("not-found", "La asignación no existe.");
  }

  const asignacion = asignacionSnap.data() as Record<string, unknown>;
  const estado = typeof asignacion.estado === "string" ? asignacion.estado : "";
  if (estado !== "ACTIVA") {
    throw new HttpsError(
      "failed-precondition",
      "La asignación no está en estado ACTIVA.",
    );
  }

  const firmaActual =
    typeof asignacion.firmaPacienteEntrega === "string" ?
      asignacion.firmaPacienteEntrega.trim() :
      "";
  if (firmaActual) {
    throw new HttpsError(
      "failed-precondition",
      "La asignación ya tiene firma registrada.",
    );
  }

  let auxiliarNombre = "";
  let auxiliarUid = "";
  const auxActual =
    typeof asignacion.auxiliarNombre === "string" ?
      asignacion.auxiliarNombre.trim() :
      "";
  if (!auxActual) {
    const auxSnap = await db
      .collection("users")
      .where("rol", "==", "AUXILIAR_ADMINISTRATIVA")
      .limit(1)
      .get();
    if (!auxSnap.empty) {
      const auxDoc = auxSnap.docs[0];
      const auxData = auxDoc.data() as Record<string, unknown>;
      auxiliarUid = auxDoc.id;
      auxiliarNombre =
        typeof auxData.nombre === "string" ? auxData.nombre : "";
    }
  }

  await asignacionRef.update({
    firmaPacienteEntrega: firmaEntrega,
    firmaPacienteEntregaCapturadaAt: new Date().toISOString(),
    firmaPacienteEntregaCapturadaPorUid: callerUid,
    firmaPacienteEntregaCapturadaPorNombre: capturadoPorNombre,
    ...(auxiliarNombre ? {auxiliarNombre} : {}),
    ...(auxiliarUid ? {auxiliarUid} : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {ok: true};
});

/**
 * 4) INVENTARIO: por defecto, los equipos nuevos NO quedan disponibles para
 * entrega a pacientes hasta que exista una acta interna aceptada.
 *
 * Legacy: equipos ya existentes (antes de esta función) no tienen el campo y
 * por eso en el cliente se asume "true".
 */
export const defaultEquipoDisponibilidad = onDocumentCreated(
  "equipos/{equipoId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data() as Record<string, unknown>;

    // Si el campo ya existe (true/false), no tocamos nada.
    if (Object.prototype.hasOwnProperty.call(data, "disponibleParaEntrega")) {
      return;
    }

    await snap.ref.set(
      {
        disponibleParaEntrega: false,
        createdAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  },
);

/**
 * Mantiene flags para el rol VISITADOR:
 * - pacientes/{id}.tieneAsignacionActiva
 * - equipos/{id}.asignadoActivo
 *
 * Se actualizan cuando se crean/finalizan asignaciones.
 */
export const onAsignacionCreatedUpdateFlags = onDocumentCreated(
  "asignaciones/{asigId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data() as Record<string, unknown>;
    const estado = typeof data.estado === "string" ? data.estado : "";
    if (estado !== "ACTIVA") return;

    const idPaciente =
      typeof data.idPaciente === "string" ? data.idPaciente : "";
    const idEquipo = typeof data.idEquipo === "string" ? data.idEquipo : "";

    const ops: Promise<unknown>[] = [];
    if (idPaciente) {
      ops.push(
        db.doc(`pacientes/${idPaciente}`).set(
          {
            tieneAsignacionActiva: true,
            updatedAt: FieldValue.serverTimestamp(),
          },
          {merge: true},
        ),
      );
    }
    if (idEquipo) {
      ops.push(
        db.doc(`equipos/${idEquipo}`).set(
          {
            asignadoActivo: true,
            updatedAt: FieldValue.serverTimestamp(),
          },
          {merge: true},
        ),
      );
    }
    await Promise.all(ops);
  },
);

export const onAsignacionUpdatedUpdateFlags = onDocumentUpdated(
  "asignaciones/{asigId}",
  async (event) => {
    const before = event.data?.before?.data() as
      | Record<string, unknown>
      | undefined;
    const after = event.data?.after?.data() as
      | Record<string, unknown>
      | undefined;
    if (!before || !after) return;

    const beforeEstado = typeof before.estado === "string" ? before.estado : "";
    const afterEstado = typeof after.estado === "string" ? after.estado : "";
    if (beforeEstado === afterEstado) return;

    const idPaciente =
      typeof after.idPaciente === "string" ? after.idPaciente : "";
    const idEquipo = typeof after.idEquipo === "string" ? after.idEquipo : "";

    const recomputePaciente = async () => {
      if (!idPaciente) return;
      const q = await db
        .collection("asignaciones")
        .where("idPaciente", "==", idPaciente)
        .where("estado", "==", "ACTIVA")
        .limit(1)
        .get();
      const hasActive = !q.empty;
      await db.doc(`pacientes/${idPaciente}`).set(
        {
          tieneAsignacionActiva: hasActive,
          updatedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
    };

    const recomputeEquipo = async () => {
      if (!idEquipo) return;
      const q = await db
        .collection("asignaciones")
        .where("idEquipo", "==", idEquipo)
        .where("estado", "==", "ACTIVA")
        .limit(1)
        .get();
      const hasActive = !q.empty;
      await db.doc(`equipos/${idEquipo}`).set(
        {
          asignadoActivo: hasActive,
          updatedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
    };

    await Promise.all([recomputePaciente(), recomputeEquipo()]);
  },
);

type InternalActaEstado = "ENVIADA" | "ACEPTADA";

/**
 * Valida que un campo sea string no vacío.
 * @param {unknown} value Valor recibido.
 * @param {string} field Nombre del campo.
 * @return {string} String limpio.
 */
function assertNonEmptyString(value: unknown, field: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) {
    throw new HttpsError("invalid-argument", `${field} es requerido.`);
  }
  return v;
}

/**
 * 5) ACTA INTERNA (Biomédico -> Auxiliar): crear acta con varios equipos.
 * Crea doc en /actas_internas y marca cada equipo como pendiente de aceptación
 * (disponibleParaEntrega=false, actaInternaPendienteId=...).
 */
export const createInternalActa = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError(
      "unauthenticated",
      "Debes iniciar sesión para usar esta función.",
    );
  }

  const callerUid = request.auth.uid;
  await assertCallerHasRole(callerUid, "INGENIERO_BIOMEDICO");
  const orgContext = await getUserOrgContext(callerUid);

  const data = request.data as {
    recibeEmail?: unknown;
    recibeUid?: unknown;
    ciudad?: unknown;
    sede?: unknown;
    area?: unknown;
    cargoRecibe?: unknown;
    observaciones?: unknown;
    fechaIso?: unknown;
    equipoIds?: unknown;
    firmaEntrega?: unknown;
  };

  const ciudad =
    typeof data.ciudad === "string" ? data.ciudad.trim() : "";
  const sede = typeof data.sede === "string" ? data.sede.trim() : "";
  const area =
    typeof data.area === "string" && data.area.trim() ?
      data.area.trim() :
      "Biomedica";
  const cargoRecibe = assertNonEmptyString(data.cargoRecibe, "cargoRecibe");
  const observaciones =
    typeof data.observaciones === "string" ? data.observaciones.trim() : "";
  const firmaEntrega =
    typeof data.firmaEntrega === "string" ? data.firmaEntrega.trim() : "";
  if (!firmaEntrega) {
    throw new HttpsError(
      "invalid-argument",
      "firmaEntrega es requerida (firma del biomédico).",
    );
  }

  const fechaIsoRaw =
    typeof data.fechaIso === "string" ? data.fechaIso.trim() : "";
  const fechaIso = (() => {
    const d = fechaIsoRaw ? new Date(fechaIsoRaw) : new Date();
    return Number.isNaN(d.getTime()) ?
      new Date().toISOString() :
      d.toISOString();
  })();

  const equipoIds = Array.isArray(data.equipoIds) ?
    data.equipoIds.filter((x) => typeof x === "string" && x.trim()) :
    [];
  if (equipoIds.length === 0) {
    throw new HttpsError(
      "invalid-argument",
      "Debes seleccionar al menos 1 equipo.",
    );
  }
  if (equipoIds.length > 200) {
    throw new HttpsError(
      "invalid-argument",
      "Máximo 200 equipos por acta.",
    );
  }

  // Resolver auxiliar receptor (por UID o email)
  let recibeUid = typeof data.recibeUid === "string" ?
    data.recibeUid.trim() :
    "";
  let recibeEmail = typeof data.recibeEmail === "string" ?
    data.recibeEmail.trim() :
    "";

  if (!recibeUid && !recibeEmail) {
    throw new HttpsError(
      "invalid-argument",
      "recibeEmail o recibeUid es requerido.",
    );
  }

  if (!recibeUid && recibeEmail) {
    try {
      const auxUser = await auth.getUserByEmail(recibeEmail);
      recibeUid = auxUser.uid;
    } catch {
      throw new HttpsError(
        "not-found",
        "No existe un usuario en Authentication con ese email.",
      );
    }
  }

  const auxRole = await getUserRole(recibeUid);
  if (auxRole !== "AUXILIAR_ADMINISTRATIVA") {
    throw new HttpsError(
      "failed-precondition",
      "El usuario receptor no tiene rol AUXILIAR_ADMINISTRATIVA en Firestore.",
    );
  }

  const entregaSnap = await db.doc(`users/${callerUid}`).get();
  const entregaNombre =
    entregaSnap.exists && typeof entregaSnap.data()?.nombre === "string" ?
      (entregaSnap.data()?.nombre as string) :
      "INGENIERO_BIOMEDICO";

  const recibeSnap = await db.doc(`users/${recibeUid}`).get();
  const recibeNombre =
    recibeSnap.exists && typeof recibeSnap.data()?.nombre === "string" ?
      (recibeSnap.data()?.nombre as string) :
      "AUXILIAR_ADMINISTRATIVA";
  if (!recibeEmail) {
    const maybeEmail = recibeSnap.exists ? recibeSnap.data()?.email : null;
    if (typeof maybeEmail === "string") recibeEmail = maybeEmail;
  }

  // Validar equipos + armar snapshot de items
  const equipoRefs = equipoIds.map((id) => db.doc(`equipos/${id}`));
  const equipoSnaps = await Promise.all(equipoRefs.map((r) => r.get()));

  const items = equipoSnaps.map((snap) => {
    if (!snap.exists) {
      throw new HttpsError("not-found", "Uno de los equipos no existe.");
    }
    const d = snap.data() as Record<string, unknown>;
    const pendiente = d.actaInternaPendienteId;
    if (typeof pendiente === "string" && pendiente.trim()) {
      const codigo = String(d.codigoInventario || snap.id);
      throw new HttpsError(
        "failed-precondition",
        `El equipo ${codigo} ya está en un acta interna pendiente.`,
      );
    }
    return {
      idEquipo: snap.id,
      codigoInventario: String(d.codigoInventario || ""),
      numeroSerie: String(d.numeroSerie || ""),
      nombre: String(d.nombre || ""),
      marca: String(d.marca || ""),
      modelo: String(d.modelo || ""),
      estado: typeof d.estado === "string" ? d.estado : "",
    };
  });

  // Consecutivo (simple: max+1)
  const lastSnap = await db
    .collection("actas_internas")
    .orderBy("consecutivo", "desc")
    .limit(1)
    .get();
  const last = lastSnap.docs[0]?.data()?.consecutivo;
  const consecutivo = (typeof last === "number" && Number.isFinite(last) ?
    last :
    0) + 1;

  const actaRef = db.collection("actas_internas").doc();
  const batch = db.batch();

  const estado: InternalActaEstado = "ENVIADA";
  batch.set(actaRef, {
    ...orgContext,
    consecutivo,
    fecha: fechaIso,
    ciudad,
    sede,
    area,
    cargoRecibe,
    observaciones,
    entregaUid: callerUid,
    entregaNombre,
    recibeUid,
    recibeNombre,
    ...(recibeEmail ? {recibeEmail} : {}),
    estado,
    items,
    firmaEntrega,
    createdAt: FieldValue.serverTimestamp(),
  });

  for (const snap of equipoSnaps) {
    batch.update(snap.ref, {
      disponibleParaEntrega: false,
      custodioUid: callerUid,
      actaInternaPendienteId: actaRef.id,
      actaInternaPendienteRecibeUid: recibeUid,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();

  return {id: actaRef.id, consecutivo};
});

/**
 * 6) ACTA INTERNA: aceptar acta (firma) y habilitar equipos para entrega.
 * Aceptación total: si falla un equipo, no se acepta nada (batch).
 */
export const acceptInternalActa = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError(
      "unauthenticated",
      "Debes iniciar sesión para usar esta función.",
    );
  }

  const callerUid = request.auth.uid;
  await assertCallerHasRole(callerUid, "AUXILIAR_ADMINISTRATIVA");

  const data = request.data as {actaId?: unknown; firmaRecibe?: unknown};
  const actaId = assertNonEmptyString(data.actaId, "actaId");
  const firmaRecibe =
    typeof data.firmaRecibe === "string" ? data.firmaRecibe : "";
  if (!firmaRecibe) {
    throw new HttpsError("invalid-argument", "firmaRecibe es requerida.");
  }

  const actaRef = db.doc(`actas_internas/${actaId}`);
  const actaSnap = await actaRef.get();
  if (!actaSnap.exists) {
    throw new HttpsError("not-found", "El acta no existe.");
  }

  const acta = actaSnap.data() as Record<string, unknown>;
  const estado = acta.estado as InternalActaEstado | undefined;
  if (estado !== "ENVIADA") {
    throw new HttpsError(
      "failed-precondition",
      "Esta acta ya fue aceptada o no está en estado ENVIADA.",
    );
  }

  const recibeUid =
    typeof acta.recibeUid === "string" ? acta.recibeUid : "";
  if (recibeUid !== callerUid) {
    throw new HttpsError(
      "permission-denied",
      "No eres el receptor asignado para esta acta.",
    );
  }

  const items = Array.isArray(acta.items) ? acta.items : [];
  if (items.length === 0) {
    throw new HttpsError(
      "failed-precondition",
      "El acta no tiene equipos asociados.",
    );
  }
  if (items.length > 200) {
    throw new HttpsError(
      "failed-precondition",
      "Esta acta supera el límite de 200 equipos.",
    );
  }

  const batch = db.batch();
  batch.update(actaRef, {
    estado: "ACEPTADA",
    firmaRecibe,
    acceptedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  type ActaItem = {idEquipo?: unknown};
  for (const it of items as ActaItem[]) {
    const idEquipo = typeof it.idEquipo === "string" ? it.idEquipo : "";
    if (!idEquipo) continue;
    const equipoRef = db.doc(`equipos/${idEquipo}`);
    batch.update(equipoRef, {
      disponibleParaEntrega: true,
      custodioUid: callerUid,
      actaInternaPendienteId: FieldValue.delete(),
      actaInternaPendienteRecibeUid: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  const solicitudIds = Array.isArray(acta.solicitudIds) ?
    acta.solicitudIds.filter((x) => typeof x === "string") :
    [];
  for (const solicitudId of solicitudIds) {
    const solicitudRef = db.doc(`solicitudes_equipos_paciente/${solicitudId}`);
    batch.update(solicitudRef, {
      actaInternaEstado: "ACEPTADA",
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  return {ok: true};
});

/**
 * 7) ACTA INTERNA: anular acta enviada (borra el doc y libera equipos).
 * Solo permite anular si el acta está en estado ENVIADA.
 */
export const cancelInternalActa = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError(
      "unauthenticated",
      "Debes iniciar sesión para usar esta función.",
    );
  }

  const callerUid = request.auth.uid;
  await assertCallerHasRole(callerUid, "INGENIERO_BIOMEDICO");

  const data = request.data as {actaId?: unknown};
  const actaId = assertNonEmptyString(data.actaId, "actaId");

  const actaRef = db.doc(`actas_internas/${actaId}`);
  const actaSnap = await actaRef.get();
  if (!actaSnap.exists) {
    throw new HttpsError("not-found", "El acta no existe.");
  }

  const acta = actaSnap.data() as Record<string, unknown>;
  const estado = acta.estado as InternalActaEstado | undefined;
  if (estado !== "ENVIADA") {
    throw new HttpsError(
      "failed-precondition",
      "Solo se pueden anular actas en estado ENVIADA.",
    );
  }

  const entregaUid =
    typeof acta.entregaUid === "string" ? acta.entregaUid : "";
  if (entregaUid && entregaUid !== callerUid) {
    throw new HttpsError(
      "permission-denied",
      "Solo el biomédico que creó el acta puede anularla.",
    );
  }

  const items = Array.isArray(acta.items) ? acta.items : [];

  const batch = db.batch();
  batch.delete(actaRef);

  type ActaItem = {idEquipo?: unknown};
  for (const it of items as ActaItem[]) {
    const idEquipo = typeof it.idEquipo === "string" ? it.idEquipo : "";
    if (!idEquipo) continue;
    const equipoRef = db.doc(`equipos/${idEquipo}`);
    batch.update(equipoRef, {
      actaInternaPendienteId: FieldValue.delete(),
      actaInternaPendienteRecibeUid: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  return {ok: true, equipos: items.length};
});

/**
 * 8) SOLICITUDES: aprobar solicitud de equipo del paciente.
 * Crea asignación automática si la propiedad es PACIENTE.
 */
export const approveSolicitudEquipoPaciente = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError(
      "unauthenticated",
      "Debes iniciar sesión para usar esta función.",
    );
  }

  const callerUid = request.auth.uid;
  await assertCallerHasRole(callerUid, "INGENIERO_BIOMEDICO");

  const data = request.data as {
    solicitudId?: unknown;
    equipoId?: unknown;
    firmaEntrega?: unknown;
  };
  const solicitudId = assertNonEmptyString(data.solicitudId, "solicitudId");
  const equipoId = assertNonEmptyString(data.equipoId, "equipoId");
  const firmaEntrega =
    typeof data.firmaEntrega === "string" ? data.firmaEntrega.trim() : "";

  const solicitudRef = db.doc(`solicitudes_equipos_paciente/${solicitudId}`);
  const equipoRef = db.doc(`equipos/${equipoId}`);

  const [solicitudSnap, equipoSnap, userSnap] = await Promise.all([
    solicitudRef.get(),
    equipoRef.get(),
    db.doc(`users/${callerUid}`).get(),
  ]);

  if (!solicitudSnap.exists) {
    throw new HttpsError("not-found", "La solicitud no existe.");
  }
  if (!equipoSnap.exists) {
    throw new HttpsError("not-found", "El equipo no existe.");
  }

  const solicitud = solicitudSnap.data() as Record<string, unknown>;
  const solicitudOrg = buildOrgContext(solicitud);
  const estado = typeof solicitud.estado === "string" ? solicitud.estado : "";
  if (estado !== "PENDIENTE") {
    throw new HttpsError(
      "failed-precondition",
      "La solicitud no está en estado PENDIENTE.",
    );
  }

  const idPaciente =
    typeof solicitud.idPaciente === "string" ? solicitud.idPaciente : "";
  const tipoPropiedad =
    typeof solicitud.tipoPropiedad === "string" ? solicitud.tipoPropiedad : "";
  const observaciones =
    typeof solicitud.observaciones === "string" ? solicitud.observaciones : "";
  if (!idPaciente) {
    throw new HttpsError(
      "failed-precondition",
      "La solicitud no tiene paciente válido.",
    );
  }
  if (
    tipoPropiedad !== "PACIENTE" &&
    tipoPropiedad !== "ALQUILADO" &&
    tipoPropiedad !== "MEDICUC"
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Tipo de propiedad inválido en la solicitud.",
    );
  }

  const equipoData = equipoSnap.data() as Record<string, unknown>;
  const equipoTipo =
    typeof equipoData.tipoPropiedad === "string" ?
      equipoData.tipoPropiedad :
      "";
  if (equipoTipo && equipoTipo !== tipoPropiedad) {
    throw new HttpsError(
      "failed-precondition",
      "La propiedad del equipo no coincide con la solicitud.",
    );
  }

  const userData = userSnap.data() as Record<string, unknown>;
  const aprobadoPorNombre =
    typeof userData.nombre === "string" ? userData.nombre : "Biomedico";

  const auxSnap = await db
    .collection("users")
    .where("rol", "==", "AUXILIAR_ADMINISTRATIVA")
    .limit(1)
    .get();
  const auxDoc = auxSnap.empty ? null : auxSnap.docs[0];
  const auxData = auxDoc ? (auxDoc.data() as Record<string, unknown>) : {};
  const auxUid = auxDoc ? auxDoc.id : "";
  const auxNombre =
    typeof auxData.nombre === "string" ? auxData.nombre : "";
  const auxEmail =
    typeof auxData.email === "string" ? auxData.email : "";

  if (tipoPropiedad === "PACIENTE" || tipoPropiedad === "MEDICUC") {
    const txResult = await db.runTransaction(async (tx) => {
      const [solicitudTxSnap, equipoTxSnap] = await Promise.all([
        tx.get(solicitudRef),
        tx.get(equipoRef),
      ]);

      if (!solicitudTxSnap.exists) {
        throw new HttpsError("not-found", "La solicitud no existe.");
      }
      if (!equipoTxSnap.exists) {
        throw new HttpsError("not-found", "El equipo no existe.");
      }

      const solicitudTx = solicitudTxSnap.data() as Record<string, unknown>;
      const estadoTx =
        typeof solicitudTx.estado === "string" ? solicitudTx.estado : "";
      const equipoIdTx =
        typeof solicitudTx.equipoId === "string" ? solicitudTx.equipoId : "";
      const asignacionIdTx =
        typeof solicitudTx.asignacionId === "string" ?
          solicitudTx.asignacionId :
          "";

      if (estadoTx === "APROBADA") {
        if (equipoIdTx && equipoIdTx !== equipoId) {
          throw new HttpsError(
            "failed-precondition",
            "La solicitud ya fue aprobada con otro equipo.",
          );
        }
        return {asignacionId: asignacionIdTx, alreadyApproved: true};
      }
      if (estadoTx !== "PENDIENTE") {
        throw new HttpsError(
          "failed-precondition",
          "La solicitud no está en estado PENDIENTE.",
        );
      }

      const idPacienteTx =
        typeof solicitudTx.idPaciente === "string" ?
          solicitudTx.idPaciente :
          "";
      if (!idPacienteTx) {
        throw new HttpsError(
          "failed-precondition",
          "La solicitud no tiene paciente válido.",
        );
      }
      const tipoPropiedadTx =
        typeof solicitudTx.tipoPropiedad === "string" ?
          solicitudTx.tipoPropiedad :
          "";
      if (
        tipoPropiedadTx !== "PACIENTE" &&
        tipoPropiedadTx !== "ALQUILADO" &&
        tipoPropiedadTx !== "MEDICUC"
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Tipo de propiedad inválido en la solicitud.",
        );
      }

      const equipoDataTx = equipoTxSnap.data() as Record<string, unknown>;
      const equipoTipoTx =
        typeof equipoDataTx.tipoPropiedad === "string" ?
          equipoDataTx.tipoPropiedad :
          "";
      if (equipoTipoTx && equipoTipoTx !== tipoPropiedadTx) {
        throw new HttpsError(
          "failed-precondition",
          "La propiedad del equipo no coincide con la solicitud.",
        );
      }

      const [activeSnap, pacienteSnap] = await Promise.all([
        tx.get(
          db.collection("asignaciones")
            .where("idEquipo", "==", equipoId)
            .where("estado", "==", "ACTIVA")
            .limit(1),
        ),
        tx.get(
          db.collection("asignaciones")
            .where("idPaciente", "==", idPacienteTx)
            .where("estado", "==", "ACTIVA")
            .limit(1),
        ),
      ]);
      if (!activeSnap.empty) {
        throw new HttpsError(
          "failed-precondition",
          "El equipo ya tiene una asignación activa.",
        );
      }
      if (!pacienteSnap.empty) {
        throw new HttpsError(
          "failed-precondition",
          "El paciente ya tiene una asignación activa.",
        );
      }

      const consecutivo = await nextConsecutivoInTx(
        tx,
        "asignaciones_consecutivo",
        "asignaciones",
      );
      const nowIso = new Date().toISOString();
      const asignacionRef = db.collection("asignaciones").doc();
      tx.set(asignacionRef, {
        ...solicitudOrg,
        consecutivo,
        idPaciente: idPacienteTx,
        idEquipo: equipoId,
        fechaAsignacion: nowIso,
        fechaActualizacionEntrega: nowIso,
        estado: "ACTIVA",
        observacionesEntrega: observaciones || "Registro por visitador.",
        usuarioAsigna: aprobadoPorNombre,
        auxiliarNombre: auxNombre || undefined,
        auxiliarUid: auxUid || undefined,
        createdAt: FieldValue.serverTimestamp(),
      });

      tx.update(solicitudRef, {
        ...solicitudOrg,
        estado: "APROBADA",
        aprobadoAt: nowIso,
        aprobadoPorUid: callerUid,
        aprobadoPorNombre,
        equipoId,
        asignacionId: asignacionRef.id,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {asignacionId: asignacionRef.id, alreadyApproved: false};
    });

    return {
      ok: true,
      asignacionId: txResult.asignacionId || "",
      actaInternaId: "",
      alreadyApproved: txResult.alreadyApproved,
    };
  }

  let actaInternaId = "";
  if (tipoPropiedad === "ALQUILADO") {
    if (!firmaEntrega) {
      throw new HttpsError(
        "invalid-argument",
        "firmaEntrega es requerida para crear el acta interna.",
      );
    }

    if (!auxDoc) {
      throw new HttpsError(
        "failed-precondition",
        "No hay auxiliares disponibles para recibir el acta interna.",
      );
    }
    const recibeUid = auxUid;
    const recibeNombre = auxNombre || "AUXILIAR ADMINISTRATIVA";
    const recibeEmail = auxEmail;

    const pendiente = equipoData.actaInternaPendienteId;
    if (typeof pendiente === "string" && pendiente.trim()) {
      throw new HttpsError(
        "failed-precondition",
        "El equipo ya está en un acta interna pendiente.",
      );
    }

    const lastSnap = await db
      .collection("actas_internas")
      .orderBy("consecutivo", "desc")
      .limit(1)
      .get();
    const last = lastSnap.docs[0]?.data()?.consecutivo;
    const consecutivo =
      typeof last === "number" && Number.isFinite(last) ? last + 1 : 1;

    const actaRef = db.collection("actas_internas").doc();
    actaInternaId = actaRef.id;
    const actaItems = [
      {
        idEquipo: equipoId,
        codigoInventario: String(equipoData.codigoInventario || ""),
        numeroSerie: String(equipoData.numeroSerie || ""),
        nombre: String(equipoData.nombre || ""),
        marca: String(equipoData.marca || ""),
        modelo: String(equipoData.modelo || ""),
        estado: typeof equipoData.estado === "string" ? equipoData.estado : "",
      },
    ];

    const batch = db.batch();
    batch.set(actaRef, {
      ...solicitudOrg,
      consecutivo,
      fecha: new Date().toISOString(),
      ciudad: "",
      sede: "",
      area: "Biomedica",
      cargoRecibe: "Auxiliar Administrativa",
      observaciones,
      entregaUid: callerUid,
      entregaNombre: aprobadoPorNombre,
      recibeUid,
      recibeNombre,
      ...(recibeEmail ? {recibeEmail} : {}),
      estado: "ENVIADA",
      items: actaItems,
      firmaEntrega,
      solicitudIds: [solicitudId],
      createdAt: FieldValue.serverTimestamp(),
    });
    batch.update(equipoRef, {
      disponibleParaEntrega: false,
      custodioUid: callerUid,
      actaInternaPendienteId: actaRef.id,
      actaInternaPendienteRecibeUid: recibeUid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.update(solicitudRef, {
      ...solicitudOrg,
      estado: "APROBADA",
      aprobadoAt: new Date().toISOString(),
      aprobadoPorUid: callerUid,
      aprobadoPorNombre,
      equipoId,
      actaInternaId: actaRef.id,
      actaInternaEstado: "ENVIADA",
      updatedAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();

    return {ok: true, actaInternaId};
  }
  throw new HttpsError("internal", "Tipo de propiedad no soportado.");
});

/**
 * Crea reporte de visita/falla (VISITADOR) con anti-duplicado global por
 * asignación: solo puede existir 1 reporte ABIERTO/EN_PROCESO por idAsignacion.
 */
export const createReporteEquipo = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError(
      "unauthenticated",
      "Debes iniciar sesión para usar esta función.",
    );
  }
  const callerUid = request.auth.uid;
  await assertCallerHasRole(callerUid, "VISITADOR");

  const raw = (request.data as {reporte?: unknown})?.reporte;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new HttpsError("invalid-argument", "reporte es requerido.");
  }
  const reporte = raw as Record<string, unknown>;

  const reporteId = assertNonEmptyString(
    reporte.reporteId ?? reporte.id,
    "reporteId",
  );
  const idAsignacion = assertNonEmptyString(
    reporte.idAsignacion,
    "idAsignacion",
  );
  const idPaciente = assertNonEmptyString(reporte.idPaciente, "idPaciente");
  const idEquipo = assertNonEmptyString(reporte.idEquipo, "idEquipo");
  const descripcion = upperTrim(reporte.descripcion);
  if (!descripcion) {
    throw new HttpsError("invalid-argument", "descripcion es requerida.");
  }

  const fechaVisita =
    typeof reporte.fechaVisita === "string" && reporte.fechaVisita.trim() ?
      reporte.fechaVisita.trim() :
      new Date().toISOString();
  const pacienteNombre = upperTrim(reporte.pacienteNombre);
  const pacienteDocumento = upperTrim(reporte.pacienteDocumento);
  const equipoCodigoInventario = upperTrim(reporte.equipoCodigoInventario);
  const equipoNombre = upperTrim(reporte.equipoNombre);
  const equipoSerie = upperTrim(reporte.equipoSerie);

  if (
    !pacienteNombre ||
    !pacienteDocumento ||
    !equipoCodigoInventario ||
    !equipoNombre ||
    !equipoSerie
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Faltan datos de snapshot (paciente/equipo).",
    );
  }

  const fotosRaw = Array.isArray(reporte.fotos) ? reporte.fotos : [];
  if (fotosRaw.length < 1 || fotosRaw.length > 5) {
    throw new HttpsError(
      "invalid-argument",
      "Debes adjuntar entre 1 y 5 fotos.",
    );
  }
  const expectedPrefix = `reportes_equipos/${callerUid}/${reporteId}/`;
  const fotos = fotosRaw.map((item, idx) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new HttpsError(
        "invalid-argument",
        `fotos[${idx}] es inválida.`,
      );
    }
    const foto = item as Record<string, unknown>;
    const path = assertNonEmptyString(foto.path, `fotos[${idx}].path`);
    const name = assertNonEmptyString(foto.name, `fotos[${idx}].name`);
    const contentType = assertNonEmptyString(
      foto.contentType,
      `fotos[${idx}].contentType`,
    );
    const size =
      typeof foto.size === "number" && Number.isFinite(foto.size) ?
        foto.size :
        Number.NaN;

    if (!path.startsWith(expectedPrefix)) {
      throw new HttpsError(
        "invalid-argument",
        `fotos[${idx}].path no coincide con el reporte.`,
      );
    }
    if (contentType !== "image/jpeg" && contentType !== "image/png") {
      throw new HttpsError(
        "invalid-argument",
        `fotos[${idx}].contentType inválido.`,
      );
    }
    if (!Number.isFinite(size) || size <= 0 || size > 5 * 1024 * 1024) {
      throw new HttpsError(
        "invalid-argument",
        `fotos[${idx}].size inválido.`,
      );
    }
    return {path, name, size, contentType};
  });

  const callerSnap = await db.doc(`users/${callerUid}`).get();
  const callerData = callerSnap.data() as Record<string, unknown> | undefined;
  const tokenName =
    typeof request.auth.token.name === "string" ?
      request.auth.token.name :
      "";
  const tokenEmail =
    typeof request.auth.token.email === "string" ?
      request.auth.token.email :
      "";
  const createdByName =
    upperTrim(callerData?.nombre || tokenName || tokenEmail) || "VISITADOR";

  const txResult = await db.runTransaction(async (tx) => {
    const [asignacionSnap, existingSnap, reportByIdSnap] = await Promise.all([
      tx.get(db.doc(`asignaciones/${idAsignacion}`)),
      tx.get(
        db.collection("reportes_equipos")
          .where("idAsignacion", "==", idAsignacion),
      ),
      tx.get(db.doc(`reportes_equipos/${reporteId}`)),
    ]);

    if (!asignacionSnap.exists) {
      throw new HttpsError("not-found", "La asignación no existe.");
    }
    const asignacionData = asignacionSnap.data() as Record<string, unknown>;
    const estadoAsignacion =
      typeof asignacionData.estado === "string" ? asignacionData.estado : "";
    const idPacienteAsignacion =
      typeof asignacionData.idPaciente === "string" ?
        asignacionData.idPaciente :
        "";
    const idEquipoAsignacion =
      typeof asignacionData.idEquipo === "string" ?
        asignacionData.idEquipo :
        "";
    if (estadoAsignacion !== "ACTIVA") {
      throw new HttpsError(
        "failed-precondition",
        "La asignación no está activa.",
      );
    }
    if (
      idPacienteAsignacion !== idPaciente ||
      idEquipoAsignacion !== idEquipo
    ) {
      throw new HttpsError(
        "failed-precondition",
        "La asignación no coincide con paciente/equipo.",
      );
    }
    const asignacionOrg = buildOrgContext(asignacionData);

    let existingOwnId = "";
    for (const docSnap of existingSnap.docs) {
      const data = docSnap.data() as Record<string, unknown>;
      const estado = typeof data.estado === "string" ? data.estado : "";
      if (estado !== "ABIERTO" && estado !== "EN_PROCESO") {
        continue;
      }
      const creadoPorUid =
        typeof data.creadoPorUid === "string" ? data.creadoPorUid : "";
      if (creadoPorUid === callerUid) {
        existingOwnId = docSnap.id;
        break;
      }
      throw new HttpsError(
        "failed-precondition",
        "Ya existe un reporte activo para esta asignación.",
      );
    }
    if (existingOwnId) {
      return {reporteId: existingOwnId, alreadyExists: true};
    }

    if (reportByIdSnap.exists) {
      const data = reportByIdSnap.data() as Record<string, unknown>;
      const estado = typeof data.estado === "string" ? data.estado : "";
      const prevAsignacion =
        typeof data.idAsignacion === "string" ? data.idAsignacion : "";
      const prevUid =
        typeof data.creadoPorUid === "string" ? data.creadoPorUid : "";
      const isSameOpenReport =
        (estado === "ABIERTO" || estado === "EN_PROCESO") &&
        prevAsignacion === idAsignacion &&
        prevUid === callerUid;
      if (isSameOpenReport) {
        return {reporteId, alreadyExists: true};
      }
      throw new HttpsError(
        "already-exists",
        "El identificador del reporte ya existe.",
      );
    }

    const nowIso = new Date().toISOString();
    const historial = [
      {
        fecha: nowIso,
        estado: "ABIERTO",
        nota: descripcion,
        porUid: callerUid,
        porNombre: createdByName,
      },
    ];
    tx.set(db.doc(`reportes_equipos/${reporteId}`), {
      ...asignacionOrg,
      estado: "ABIERTO",
      idAsignacion,
      idPaciente,
      idEquipo,
      fechaVisita,
      descripcion,
      fotos,
      creadoPorUid: callerUid,
      creadoPorNombre: createdByName,
      pacienteNombre,
      pacienteDocumento,
      equipoCodigoInventario,
      equipoNombre,
      equipoSerie,
      historial,
      createdAt: FieldValue.serverTimestamp(),
    });

    return {reporteId, alreadyExists: false};
  });

  return {
    ok: true,
    reporteId: txResult.reporteId,
    alreadyExists: txResult.alreadyExists,
  };
});

/**
 * Reportes de visita/falla (VISITADOR -> Biomedico)
 * Al crear un reporte, insertamos un doc en /mail (Trigger Email Extension).
 */
export const onReporteEquipoCreatedNotify = onDocumentCreated(
  "reportes_equipos/{reporteId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const d = snap.data() as Record<string, unknown>;

    const equipoCodigo =
      typeof d.equipoCodigoInventario === "string" ?
        d.equipoCodigoInventario :
        "";
    const equipoNombre =
      typeof d.equipoNombre === "string" ? d.equipoNombre : "";
    const pacienteNombre =
      typeof d.pacienteNombre === "string" ? d.pacienteNombre : "";
    const pacienteDocumento =
      typeof d.pacienteDocumento === "string" ? d.pacienteDocumento : "";
    const descripcion =
      typeof d.descripcion === "string" ? d.descripcion : "";
    const fechaVisita =
      typeof d.fechaVisita === "string" ? d.fechaVisita : "";

    // Buscar biomédicos para notificar
    const usersSnap = await db
      .collection("users")
      .where("rol", "==", "INGENIERO_BIOMEDICO")
      .get();
    const recipients = usersSnap.docs
      .map((u) => u.data()?.email)
      .filter((e) => typeof e === "string" && e.includes("@")) as string[];

    if (recipients.length === 0) return;

    const subject =
      `BioControl: Reporte de visita (${equipoCodigo || "Equipo"})`;
    const pacienteLine = pacienteDocumento ?
      `${pacienteNombre} (${pacienteDocumento})` :
      pacienteNombre;
    const textLines = [
      "Se ha creado un nuevo reporte de visita/falla.",
      "",
      `Paciente: ${pacienteLine}`,
      `Equipo: ${equipoCodigo} - ${equipoNombre}`,
      `Fecha visita: ${fechaVisita}`,
      "",
      "Descripción:",
      descripcion,
      "",
      "Ingresa a BioControl para ver el detalle y cerrar el reporte.",
    ];

    // Requiere Trigger Email Extension configurada (colección /mail).
    await db.collection("mail").add({
      to: recipients,
      message: {
        subject,
        text: textLines.join("\n"),
      },
      createdAt: FieldValue.serverTimestamp(),
      source: "reportes_equipos",
      reporteId: snap.id,
    });
  },
);

/**
 * Solicitudes de equipos del paciente (VISITADOR -> Biomedico)
 * Al crear una solicitud, insertamos un doc en /mail (Trigger Email).
 */
export const onSolicitudEquipoPacienteCreatedNotify = onDocumentCreated(
  "solicitudes_equipos_paciente/{solicitudId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const d = snap.data() as Record<string, unknown>;

    const pacienteNombre =
      typeof d.pacienteNombre === "string" ? d.pacienteNombre : "";
    const pacienteDocumento =
      typeof d.pacienteDocumento === "string" ? d.pacienteDocumento : "";
    const tipoPropiedad =
      typeof d.tipoPropiedad === "string" ? d.tipoPropiedad : "";
    const equipoNombre =
      typeof d.equipoNombre === "string" ? d.equipoNombre : "";
    const empresaAlquiler =
      typeof d.empresaAlquiler === "string" ? d.empresaAlquiler : "";
    const observaciones =
      typeof d.observaciones === "string" ? d.observaciones : "";

    const usersSnap = await db
      .collection("users")
      .where("rol", "==", "INGENIERO_BIOMEDICO")
      .get();
    const recipients = usersSnap.docs
      .map((u) => u.data()?.email)
      .filter((e) => typeof e === "string" && e.includes("@")) as string[];

    if (recipients.length === 0) return;

    const tipoLabel = tipoPropiedad || "PACIENTE";
    const pacienteLine = pacienteDocumento ?
      `${pacienteNombre} (${pacienteDocumento})` :
      pacienteNombre;
    const textLines = [
      "Nueva solicitud de equipo del paciente.",
      "",
      `Paciente: ${pacienteLine}`,
      `Tipo propiedad: ${tipoLabel}`,
      `Equipo reportado: ${equipoNombre || "Sin nombre"}`,
      tipoPropiedad === "ALQUILADO" && empresaAlquiler ?
        `Empresa: ${empresaAlquiler}` :
        "",
      observaciones ? `Observaciones: ${observaciones}` : "",
      "",
      "Ingresa a BioControl para revisar la solicitud.",
    ].filter((l) => l !== "");

    await db.collection("mail").add({
      to: recipients,
      message: {
        subject: `BioControl: Solicitud equipo ${tipoLabel}`,
        text: textLines.join("\n"),
      },
      createdAt: FieldValue.serverTimestamp(),
      source: "solicitudes_equipos_paciente",
      solicitudId: snap.id,
    });
  },
);
