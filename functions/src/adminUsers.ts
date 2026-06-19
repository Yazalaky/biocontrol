import {FieldValue, type Query} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {
  assertAllowedRole,
  assertCallerIsAdmin,
  assertCallerIsAdminOrHasRole,
  assertHasOrgAccessOrThrow,
  buildOrgContext,
  getUserAccessContext,
  isCallerAdminEnabled,
  normalizeScope,
} from "./core/access";
import {auth, db} from "./core/runtime";

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
    scope?: unknown;
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
  const scope = normalizeScope(data.scope, org);
  const primaryOrg = scope[0];
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
        empresaId: primaryOrg.empresaId,
        sedeId: primaryOrg.sedeId,
        scope,
        isGlobalRead,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: request.auth.uid,
      },
      {merge: true},
    );

    return {uid: user.uid};
  } catch (err: unknown) {
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
    scope?: unknown;
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
  const scope = normalizeScope(data.scope ?? currentData.scope, org);
  const primaryOrg = scope[0];
  const isGlobalRead =
    data.rol === "GERENCIA" || data.isGlobalRead === true;

  await db.doc(`users/${uid}`).set(
    {
      rol: data.rol,
      ...(nombre ? {nombre} : {}),
      empresaId: primaryOrg.empresaId,
      sedeId: primaryOrg.sedeId,
      scope,
      isGlobalRead,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: request.auth.uid,
    },
    {merge: true},
  );

  return {ok: true};
});

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
  const callerUid = request.auth.uid;
  const isAdminCaller = await isCallerAdminEnabled(callerUid);
  const callerAccess = await getUserAccessContext(callerUid);
  const payload = request.data as {empresaId?: unknown; sedeId?: unknown};
  const requestedOrg = buildOrgContext({
    empresaId: payload?.empresaId ?? callerAccess.empresaId,
    sedeId: payload?.sedeId ?? callerAccess.sedeId,
  });

  let usersQuery: Query = db
    .collection("users")
    .where("rol", "==", "AUXILIAR_ADMINISTRATIVA");
  if (!isAdminCaller && !callerAccess.isGlobalRead) {
    assertHasOrgAccessOrThrow(
      callerAccess,
      requestedOrg,
      "No puedes listar auxiliares fuera de tu alcance.",
    );
    usersQuery = usersQuery
      .where("empresaId", "==", requestedOrg.empresaId)
      .where("sedeId", "==", requestedOrg.sedeId);
  } else if (
    typeof payload?.empresaId === "string" &&
    typeof payload?.sedeId === "string"
  ) {
    usersQuery = usersQuery
      .where("empresaId", "==", requestedOrg.empresaId)
      .where("sedeId", "==", requestedOrg.sedeId);
  }

  const snap = await usersQuery.limit(200).get();

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
