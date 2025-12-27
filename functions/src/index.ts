import {setGlobalOptions} from "firebase-functions";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {auth as authTriggers} from "firebase-functions/v1";
import {initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {FieldValue, getFirestore} from "firebase-admin/firestore";

setGlobalOptions({maxInstances: 10, region: "us-central1"});

initializeApp();

const db = getFirestore();
const auth = getAuth();

const ALLOWED_ROLES = [
  "GERENCIA",
  "AUXILIAR_ADMINISTRATIVA",
  "INGENIERO_BIOMEDICO",
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

  await userRef.set(
    {
      nombre: user.displayName ?? user.email ?? "Usuario",
      email: user.email ?? null,
      rol: null,
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
  };

  const email = typeof data.email === "string" ? data.email.trim() : "";
  const password = typeof data.password === "string" ? data.password : "";
  const nombre = typeof data.nombre === "string" ? data.nombre.trim() : "";
  assertAllowedRole(data.rol);

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
  };
  const uid = typeof data.uid === "string" ? data.uid.trim() : "";
  assertAllowedRole(data.rol);
  const nombre = typeof data.nombre === "string" ? data.nombre.trim() : "";

  if (!uid) throw new HttpsError("invalid-argument", "uid es requerido.");

  await db.doc(`users/${uid}`).set(
    {
      rol: data.rol,
      ...(nombre ? {nombre} : {}),
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
    typeof data.ciudad === "string" ? data.ciudad.trim() : "S/D";
  const sede = typeof data.sede === "string" ? data.sede.trim() : "S/D";
  const area = typeof data.area === "string" ? data.area.trim() : "S/D";
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

  await batch.commit();
  return {ok: true};
});
