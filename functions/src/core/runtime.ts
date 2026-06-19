import {initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";

initializeApp();

export const db = getFirestore();
export const auth = getAuth();

export const ALLOWED_ROLES = [
  "GERENCIA",
  "AUXILIAR_ADMINISTRATIVA",
  "INGENIERO_BIOMEDICO",
  "VISITADOR",
] as const;

export type AllowedRole = (typeof ALLOWED_ROLES)[number];

export const COUNTERS_COLLECTION = "counters";
export const TIPO_DOCUMENTO_VALUES = ["CC", "TI", "CE", "RC"] as const;
export const ESTADO_PACIENTE_VALUES = ["ACTIVO", "EGRESADO"] as const;
export const ESTADO_EQUIPO_VALUES = [
  "DISPONIBLE",
  "ASIGNADO",
  "MANTENIMIENTO",
  "DADO_DE_BAJA",
] as const;
export const TIPO_PROPIEDAD_VALUES = [
  "MEDICUC",
  "PACIENTE",
  "ALQUILADO",
  "EMPLEADO",
] as const;
export const TIPO_ACTIVO_VALUES = [
  "BIOMEDICO",
  "NO_BIOMEDICO",
  "MOBILIARIO",
] as const;
export const DEFAULT_EMPRESA_ID = "MEDICUC";
export const DEFAULT_SEDE_ID = "BUCARAMANGA";

export type OrgContext = {
  empresaId: string;
  sedeId: string;
};

export type UserAccessContext = OrgContext & {
  isGlobalRead: boolean;
  scope: OrgContext[];
};

export type TipoPropiedad =
  | "MEDICUC"
  | "PACIENTE"
  | "ALQUILADO"
  | "EMPLEADO";

export type TipoActivoInventario = "BIOMEDICO" | "NO_BIOMEDICO" | "MOBILIARIO";
