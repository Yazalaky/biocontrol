import {setGlobalOptions} from "firebase-functions";
import {HttpsError, onCall} from "firebase-functions/v2/https";
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
