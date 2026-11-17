/* eslint-disable require-jsdoc */

import {FieldValue} from "firebase-admin/firestore";
import {HttpsError, type CallableRequest} from "firebase-functions/v2/https";

import {db} from "./runtime";

type IncidentConfig = {
  functionName: string;
  module: string;
  action: string;
  omitPayloadKeys?: string[];
};

type CallableHandler<T, R> = (
  request: CallableRequest<T>,
) => R | Promise<R>;

function summarizePayload(
  payload: unknown,
  omittedKeys: string[],
): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const keys = Object.keys(payload as Record<string, unknown>);
  const omitted = new Set(omittedKeys.map((key) => key.toLowerCase()));
  const visibleKeys = keys.filter((key) => !omitted.has(key.toLowerCase()));

  return {
    keys: visibleKeys.slice(0, 50),
    keyCount: keys.length,
    omittedKeyCount: keys.length - visibleKeys.length,
  };
}

function getErrorDetails(error: unknown) {
  if (error instanceof HttpsError) {
    const category = error.code === "internal" ?
      "INTERNAL_ERROR" :
      "CALLABLE_ERROR";
    return {
      category,
      errorCode: error.code,
      errorMessage: error.message.slice(0, 500),
      suggestedFix: error.code === "internal" ?
        "Revisa los logs de Functions y el contexto de la operación." :
        "Verifica los datos enviados, el rol y el contexto organizacional.",
    };
  }

  return {
    category: "INTERNAL_ERROR",
    errorCode: "internal",
    errorMessage: "Ocurrió un error interno. Revisa los logs de Functions.",
    suggestedFix: "Revisa los logs de Functions y el contexto de la operación.",
  };
}

export function withAdminIncidentLogging<T, R>(
  config: IncidentConfig,
  handler: CallableHandler<T, R>,
): CallableHandler<T, R> {
  return async (request) => {
    try {
      return await handler(request);
    } catch (error) {
      try {
        const uid = request.auth?.uid ?? "";
        let userProfile: Record<string, unknown> = {};
        if (uid) {
          try {
            const userSnap = await db.doc(`users/${uid}`).get();
            if (userSnap.exists) {
              userProfile = userSnap.data() as Record<string, unknown>;
            }
          } catch {
            // La escritura del incidente debe continuar aunque falle el perfil.
          }
        }

        const details = getErrorDetails(error);
        const tokenEmail = request.auth?.token.email;
        await db.collection("admin_incidentes").add({
          status: "ABIERTO",
          ...details,
          functionName: config.functionName,
          module: config.module,
          action: config.action,
          userUid: uid,
          userEmail:
            typeof userProfile.email === "string" ?
              userProfile.email :
              typeof tokenEmail === "string" ? tokenEmail : "",
          userNombre:
            typeof userProfile.nombre === "string" ? userProfile.nombre : "",
          userRole:
            typeof userProfile.rol === "string" ? userProfile.rol : "",
          empresaId:
            typeof userProfile.empresaId === "string" ?
              userProfile.empresaId :
              "",
          sedeId:
            typeof userProfile.sedeId === "string" ? userProfile.sedeId : "",
          payloadSummary: summarizePayload(
            request.data,
            config.omitPayloadKeys ?? [],
          ),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } catch (loggingError) {
        console.error("No se pudo registrar el incidente de la Function.", {
          functionName: config.functionName,
          loggingError,
        });
      }

      throw error;
    }
  };
}
