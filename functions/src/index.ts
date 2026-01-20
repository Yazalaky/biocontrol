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
  type QueryDocumentSnapshot,
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
 * 3.2) LISTAR PACIENTES SIN ASIGNACION ACTIVA (VISITADOR).
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

  const [falseSnap, nullSnap, activeSnap, pacientesSnap] = await Promise.all([
    db.collection("pacientes")
      .where("tieneAsignacionActiva", "==", false)
      .limit(500)
      .get(),
    db.collection("pacientes")
      .where("tieneAsignacionActiva", "==", null)
      .limit(500)
      .get(),
    db.collection("asignaciones")
      .where("estado", "==", "ACTIVA")
      .limit(2000)
      .get(),
    db.collection("pacientes")
      .limit(2000)
      .get(),
  ]);

  const activeSet = new Set<string>();
  for (const docSnap of activeSnap.docs) {
    const data = docSnap.data() as Record<string, unknown>;
    const idPaciente =
      typeof data.idPaciente === "string" ? data.idPaciente : "";
    if (idPaciente) activeSet.add(idPaciente);
  }

  const map = new Map<string, {id: string; nombre: string; doc: string}>();
  const addPaciente = (docSnap: QueryDocumentSnapshot) => {
    const data = docSnap.data() as Record<string, unknown>;
    const nombre =
      typeof data.nombreCompleto === "string" ? data.nombreCompleto : "";
    const doc =
      typeof data.numeroDocumento === "string" ? data.numeroDocumento : "";
    map.set(docSnap.id, {id: docSnap.id, nombre, doc});
  };

  for (const docSnap of falseSnap.docs) addPaciente(docSnap);
  for (const docSnap of nullSnap.docs) addPaciente(docSnap);

  for (const docSnap of pacientesSnap.docs) {
    if (activeSet.has(docSnap.id)) continue;
    if (map.has(docSnap.id)) continue;
    addPaciente(docSnap);
  }

  const pacientes = Array.from(map.values()).sort((a, b) =>
    a.nombre.localeCompare(b.nombre, "es"),
  );

  return {pacientes};
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

  let asignacionId = "";
  let actaInternaId = "";
  if (tipoPropiedad === "PACIENTE" || tipoPropiedad === "MEDICUC") {
    const activeSnap = await db.collection("asignaciones")
      .where("idEquipo", "==", equipoId)
      .where("estado", "==", "ACTIVA")
      .limit(1)
      .get();
    if (!activeSnap.empty) {
      throw new HttpsError(
        "failed-precondition",
        "El equipo ya tiene una asignación activa.",
      );
    }
    const pacienteSnap = await db.collection("asignaciones")
      .where("idPaciente", "==", idPaciente)
      .where("estado", "==", "ACTIVA")
      .limit(1)
      .get();
    if (!pacienteSnap.empty) {
      throw new HttpsError(
        "failed-precondition",
        "El paciente ya tiene una asignación activa.",
      );
    }

    const lastSnap = await db.collection("asignaciones")
      .orderBy("consecutivo", "desc")
      .limit(1)
      .get();
    const last = lastSnap.docs[0]?.data()?.consecutivo;
    const consecutivo =
      typeof last === "number" && Number.isFinite(last) ? last + 1 : 1;

    const nowIso = new Date().toISOString();
    const asignacion = {
      consecutivo,
      idPaciente,
      idEquipo: equipoId,
      fechaAsignacion: nowIso,
      fechaActualizacionEntrega: nowIso,
      estado: "ACTIVA",
      observacionesEntrega: observaciones || "Registro por visitador.",
      usuarioAsigna: aprobadoPorNombre,
      auxiliarNombre: auxNombre || undefined,
      auxiliarUid: auxUid || undefined,
    };
    const ref = await db.collection("asignaciones").add(asignacion);
    asignacionId = ref.id;
  }

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

  await solicitudRef.update({
    estado: "APROBADA",
    aprobadoAt: new Date().toISOString(),
    aprobadoPorUid: callerUid,
    aprobadoPorNombre,
    equipoId,
    ...(asignacionId ? {asignacionId} : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {ok: true, asignacionId, actaInternaId};
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
