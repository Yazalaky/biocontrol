/* eslint-disable require-jsdoc */

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
  normalizeOrgId,
  normalizeScope,
  readStoredOrgContextOrThrow,
} from "./core/access";
import {withAdminIncidentLogging} from "./core/incidents";
import {auth, db} from "./core/runtime";

const LEGACY_ORG_COLLECTIONS = [
  "users",
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
] as const;

type LegacyOrgCollection = (typeof LEGACY_ORG_COLLECTIONS)[number];

type StrictOrgContext = {
  empresaId: string;
  sedeId: string;
};

type LegacySuggestion = {
  org: StrictOrgContext | null;
  source: string;
};

function isLegacyOrgCollection(value: unknown): value is LegacyOrgCollection {
  return (
    typeof value === "string" &&
    (LEGACY_ORG_COLLECTIONS as readonly string[]).includes(value)
  );
}

function readStrictOrgContext(
  data?: Record<string, unknown> | null,
): StrictOrgContext | null {
  if (!data) return null;
  const empresaId =
    typeof data.empresaId === "string" ?
      data.empresaId.trim().toUpperCase() :
      "";
  const sedeId =
    typeof data.sedeId === "string" ?
      data.sedeId.trim().toUpperCase() :
      "";
  if (!empresaId || !sedeId) return null;
  return {empresaId, sedeId};
}

function readScopeOrgCandidate(
  data?: Record<string, unknown> | null,
): StrictOrgContext | null {
  const scope = Array.isArray(data?.scope) ? data.scope : [];
  for (const item of scope) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const empresaId =
      typeof entry.empresaId === "string" ?
        entry.empresaId.trim().toUpperCase() :
        "";
    const sedeId =
      typeof entry.sedeId === "string" ?
        entry.sedeId.trim().toUpperCase() :
        "";
    if (!empresaId || !sedeId) continue;
    return {empresaId, sedeId};
  }
  return null;
}

function buildLegacyPreview(
  collectionName: string,
  docId: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const preview: Record<string, unknown> = {id: docId, collectionName};
  const keys = [
    "consecutivo",
    "nombre",
    "nombreCompleto",
    "estado",
    "codigoInventario",
    "serial",
    "idPaciente",
    "idEquipo",
    "idAsignacion",
  ];
  for (const key of keys) {
    if (data[key] === undefined) continue;
    preview[key] = data[key];
  }
  return preview;
}

async function loadDocOrg(
  collectionName: string,
  docId: string,
): Promise<StrictOrgContext | null> {
  if (!docId.trim()) return null;
  const snap = await db.doc(`${collectionName}/${docId}`).get();
  if (!snap.exists) return null;
  return readStrictOrgContext(snap.data() as Record<string, unknown>);
}

async function inferLegacyDocOrg(
  collectionName: LegacyOrgCollection,
  docId: string,
  data: Record<string, unknown>,
): Promise<LegacySuggestion> {
  const direct = readStrictOrgContext(data);
  if (direct) return {org: direct, source: "CAMPOS_EXISTENTES"};

  if (collectionName === "users") {
    const scopeOrg = readScopeOrgCandidate(data);
    if (scopeOrg) return {org: scopeOrg, source: "USERS_SCOPE"};
  }

  const currentEmpresa =
    typeof data.empresaId === "string" ?
      data.empresaId.trim().toUpperCase() :
      "";
  const currentSede =
    typeof data.sedeId === "string" ?
      data.sedeId.trim().toUpperCase() :
      "";
  if (currentEmpresa && currentSede) {
    return {
      org: {empresaId: currentEmpresa, sedeId: currentSede},
      source: "CAMPOS_PARCIALES",
    };
  }

  const idPaciente =
    typeof data.idPaciente === "string" ? data.idPaciente.trim() : "";
  if (idPaciente) {
    const pacienteOrg = await loadDocOrg("pacientes", idPaciente);
    if (pacienteOrg) {
      return {org: pacienteOrg, source: "PACIENTE_RELACIONADO"};
    }
  }

  const idEquipo =
    typeof data.idEquipo === "string" ? data.idEquipo.trim() : "";
  if (idEquipo) {
    const equipoOrg = await loadDocOrg("equipos", idEquipo);
    if (equipoOrg) return {org: equipoOrg, source: "EQUIPO_RELACIONADO"};
  }

  const idAsignacion =
    typeof data.idAsignacion === "string" ? data.idAsignacion.trim() : "";
  if (idAsignacion) {
    const asignacionOrg = await loadDocOrg("asignaciones", idAsignacion);
    if (asignacionOrg) {
      return {org: asignacionOrg, source: "ASIGNACION_RELACIONADA"};
    }
  }

  const idAsignacionProfesional =
    typeof data.idAsignacionProfesional === "string" ?
      data.idAsignacionProfesional.trim() :
      "";
  if (idAsignacionProfesional) {
    const asignacionProfesionalOrg = await loadDocOrg(
      "asignaciones_profesionales",
      idAsignacionProfesional,
    );
    if (asignacionProfesionalOrg) {
      return {
        org: asignacionProfesionalOrg,
        source: "ASIGNACION_PROFESIONAL_RELACIONADA",
      };
    }
  }

  const items = Array.isArray(data.items) ? data.items : [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const itemEquipoId =
      typeof (item as {idEquipo?: unknown}).idEquipo === "string" ?
        ((item as {idEquipo: string}).idEquipo).trim() :
        "";
    if (!itemEquipoId) continue;
    const itemEquipoOrg = await loadDocOrg("equipos", itemEquipoId);
    if (itemEquipoOrg) {
      return {org: itemEquipoOrg, source: "ACTA_INTERNA_ITEM_EQUIPO"};
    }
  }

  return {org: null, source: "SIN_SUGERENCIA"};
}

function onCallLogged<T, R>(
  config: {
    functionName: string;
    module: string;
    action: string;
    omitPayloadKeys?: string[];
  },
  handler: Parameters<typeof withAdminIncidentLogging<T, R>>[1],
) {
  return onCall(withAdminIncidentLogging<T, R>(config, handler));
}

export const adminCreateUser = onCallLogged(
  {
    functionName: "adminCreateUser",
    module: "ADMIN",
    action: "CREAR_USUARIO",
    omitPayloadKeys: ["password"],
  },
  async (request) => {
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
    const explicitOrg = readStrictOrgContext({
      empresaId: data.empresaId,
      sedeId: data.sedeId,
    });
    const fallbackOrg =
      explicitOrg ?? readScopeOrgCandidate({scope: data.scope});
    if (!fallbackOrg) {
      throw new HttpsError(
        "invalid-argument",
        "Debes indicar un scope valido o empresaId/sedeId validos " +
          "para el usuario.",
      );
    }
    const org = fallbackOrg;
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
  },
);

export const adminSetUserRole = onCallLogged(
  {
    functionName: "adminSetUserRole",
    module: "ADMIN",
    action: "ACTUALIZAR_ROL",
  },
  async (request) => {
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
    const explicitOrg = readStrictOrgContext({
      empresaId: data.empresaId ?? currentData.empresaId,
      sedeId: data.sedeId ?? currentData.sedeId,
    });
    const fallbackOrg =
      explicitOrg ??
      readScopeOrgCandidate({scope: data.scope ?? currentData.scope});
    if (!fallbackOrg) {
      throw new HttpsError(
        "failed-precondition",
        "El usuario no tiene un contexto organizacional valido. " +
          "Corrige scope o empresaId/sedeId antes de actualizar el rol.",
      );
    }
    const org = fallbackOrg;
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
  },
);

export const listAuxiliares = onCallLogged(
  {
    functionName: "listAuxiliares",
    module: "ADMIN",
    action: "LISTAR_AUXILIARES",
  },
  async (request) => {
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
  },
);

export const listLegacyOrgDocs = onCallLogged(
  {
    functionName: "listLegacyOrgDocs",
    module: "ADMIN",
    action: "LISTAR_LEGACY_ORG",
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError(
        "unauthenticated",
        "Debes iniciar sesión para usar esta función.",
      );
    }
    await assertCallerIsAdmin(request.auth.uid);

    const rawLimit =
      typeof (request.data as {limit?: unknown})?.limit === "number" ?
        (request.data as {limit?: number}).limit :
        100;
    const limit = Math.max(1, Math.min(300, rawLimit ?? 100));
    const rows: Array<Record<string, unknown>> = [];

    for (const collectionName of LEGACY_ORG_COLLECTIONS) {
      if (rows.length >= limit) break;
      const snap = await db.collection(collectionName).limit(limit).get();
      for (const docSnap of snap.docs) {
        if (rows.length >= limit) break;
        const data = docSnap.data() as Record<string, unknown>;
        if (readStrictOrgContext(data)) continue;
        const suggestion = await inferLegacyDocOrg(
          collectionName,
          docSnap.id,
          data,
        );
        rows.push({
          collectionName,
          docId: docSnap.id,
          currentEmpresaId:
            typeof data.empresaId === "string" ?
              data.empresaId.trim().toUpperCase() :
              "",
          currentSedeId:
            typeof data.sedeId === "string" ?
              data.sedeId.trim().toUpperCase() :
              "",
          suggestedEmpresaId: suggestion.org?.empresaId ?? "",
          suggestedSedeId: suggestion.org?.sedeId ?? "",
          suggestionSource: suggestion.source,
          preview: buildLegacyPreview(collectionName, docSnap.id, data),
        });
      }
    }

    return {docs: rows};
  },
);

export const fixLegacyOrgDoc = onCallLogged(
  {
    functionName: "fixLegacyOrgDoc",
    module: "ADMIN",
    action: "CORREGIR_LEGACY_ORG",
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError(
        "unauthenticated",
        "Debes iniciar sesión para usar esta función.",
      );
    }
    await assertCallerIsAdmin(request.auth.uid);

    const data = request.data as {
      collectionName?: unknown;
      docId?: unknown;
      empresaId?: unknown;
      sedeId?: unknown;
    };
    if (!isLegacyOrgCollection(data.collectionName)) {
      throw new HttpsError("invalid-argument", "collectionName no es valido.");
    }
    const docId = typeof data.docId === "string" ? data.docId.trim() : "";
    if (!docId) {
      throw new HttpsError("invalid-argument", "docId es requerido.");
    }
    const org = readStoredOrgContextOrThrow(
      {
        empresaId: normalizeOrgId(data.empresaId, ""),
        sedeId: normalizeOrgId(data.sedeId, ""),
      },
      `${data.collectionName}/${docId}`,
    );

    const ref = db.doc(`${data.collectionName}/${docId}`);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError(
        "not-found",
        "El documento que intentas corregir no existe.",
      );
    }

    const currentData = snap.data() as Record<string, unknown>;
    const patch: Record<string, unknown> = {
      empresaId: org.empresaId,
      sedeId: org.sedeId,
      legacyOrgFixedAt: FieldValue.serverTimestamp(),
      legacyOrgFixedBy: request.auth.uid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: request.auth.uid,
    };

    if (data.collectionName === "users") {
      const currentScope = normalizeScope(currentData.scope, org);
      const hasPrimary = currentScope.some(
        (item) =>
          item.empresaId === org.empresaId &&
          item.sedeId === org.sedeId,
      );
      patch.scope = hasPrimary ? currentScope : [org, ...currentScope];
      const role = typeof currentData.rol === "string" ? currentData.rol : "";
      patch.isGlobalRead =
        currentData.isGlobalRead === true || role === "GERENCIA";
    }

    await ref.set(patch, {merge: true});
    return {ok: true};
  },
);
