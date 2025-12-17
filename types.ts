// Definición de Roles
export enum RolUsuario {
  GERENCIA = 'GERENCIA',
  INGENIERO_BIOMEDICO = 'INGENIERO_BIOMEDICO',
  AUXILIAR_ADMINISTRATIVA = 'AUXILIAR_ADMINISTRATIVA',
}

// Estados del Paciente
export enum EstadoPaciente {
  ACTIVO = 'ACTIVO',
  EGRESADO = 'EGRESADO',
}

export type EPS = 'Nueva Eps' | 'Salud Total' | 'Fomag' | 'Particular' | 'Seguros Bolivar';

// Estados del Equipo
export enum EstadoEquipo {
  DISPONIBLE = 'DISPONIBLE',
  ASIGNADO = 'ASIGNADO',
  MANTENIMIENTO = 'MANTENIMIENTO',
  DADO_DE_BAJA = 'DADO_DE_BAJA',
}

export enum TipoPropiedad {
  PROPIO = 'PROPIO',
  EXTERNO = 'EXTERNO',
}

// Estados de la Asignación
export enum EstadoAsignacion {
  ACTIVA = 'ACTIVA',
  FINALIZADA = 'FINALIZADA',
}

// Modelo de Usuario
export interface Usuario {
  id: string;
  nombre: string;
  rol: RolUsuario;
}

// Modelo de Paciente Actualizado
export interface Paciente {
  id: string; // ID interno (UUID)
  consecutivo: number; // ID visible (Contador 1, 2, 3...)
  nombreCompleto: string;
  tipoDocumento: 'CC' | 'TI' | 'CE' | 'RC';
  numeroDocumento: string;
  direccion: string;
  eps: EPS;
  fechaInicioPrograma: string; // ISO Date
  horasPrestadas: string; // Texto libre
  tipoServicio: string;
  diagnostico: string;
  telefono: string; // Teléfono del paciente
  
  // Datos Familiar
  nombreFamiliar: string;
  telefonoFamiliar: string;
  documentoFamiliar?: string; // Nuevo
  parentescoFamiliar?: string; // Nuevo

  estado: EstadoPaciente;
  fechaSalida?: string; // ISO Date
}

// Modelo de Equipo Biomédico
export interface EquipoBiomedico {
  id: string;
  codigoInventario: string;
  numeroSerie: string; 
  nombre: string;
  marca: string;
  modelo: string;
  estado: EstadoEquipo;
  ubicacionActual?: string; 
  observaciones: string;
  tipoPropiedad: TipoPropiedad;
  datosPropietario?: {
    nombre: string;
    nit: string;
    telefono: string;
  };
}

// Modelo de Asignación
export interface Asignacion {
  id: string;
  consecutivo: number; 
  idPaciente: string;
  idEquipo: string;
  fechaAsignacion: string;
  fechaDevolucion?: string;
  estado: EstadoAsignacion;
  observacionesEntrega: string;
  observacionesDevolucion?: string;
  // Estado final del equipo registrado al devolver (cuando estado = FINALIZADA)
  estadoFinalEquipo?: EstadoEquipo;
  usuarioAsigna: string; 
}

// Modelo de Acta
export interface Acta {
  id: string;
  tipo: 'ENTREGA' | 'DEVOLUCION';
  fecha: string;
  contenido: string; 
}
