// Definición de Roles
export enum RolUsuario {
  GERENCIA = 'GERENCIA',
  INGENIERO_BIOMEDICO = 'INGENIERO_BIOMEDICO',
  AUXILIAR_ADMINISTRATIVA = 'AUXILIAR_ADMINISTRATIVA',
  VISITADOR = 'VISITADOR',
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
  MEDICUC = 'MEDICUC',
  PACIENTE = 'PACIENTE',
  ALQUILADO = 'ALQUILADO',
  EMPLEADO = 'EMPLEADO',
  // Legacy
  PROPIO = 'PROPIO',
  EXTERNO = 'EXTERNO',
}

export interface HojaVidaCaracteristicasFisicas {
  altoCm?: string;
  anchoCm?: string;
  profundidadCm?: string;
  pesoKg?: string;
  temperaturaC?: string;
  capacidad?: string;
}

export interface HojaVidaCaracteristicasElectricas {
  voltajeV?: string;
  corrienteA?: string;
  potenciaW?: string;
  frecuenciaHz?: string;
  tecnologiaPredominante?: string;
}

export interface HojaVidaOtrosSuministros {
  oxigenoO2?: string;
  aire?: string;
  agua?: string;
}

export interface HojaVidaFijos {
  definicion?: string;
  recomendacionesFabricante?: string;
  periodicidadMantenimiento?: string;
  calibracion?: string;
  tecnicaLimpiezaDesinfeccion?: string;
  caracteristicasFisicas?: HojaVidaCaracteristicasFisicas;
  caracteristicasElectricas?: HojaVidaCaracteristicasElectricas;
  otrosSuministros?: HojaVidaOtrosSuministros;
}

export interface HojaVidaDatosEquipo {
  empresa?: string;
  sede?: string;
  direccionEmpresa?: string;
  fabricante?: string;
  servicio?: string;
  tipoEquipo?: string;
  registroInvima?: string;
  clasificacionBiomedica?: string;
  riesgo?: string;
  componentes?: string;
  formaAdquisicion?: string;
  costoAdquisicion?: string;
  fechaInstalacion?: string;
  vidaUtil?: string;
  proveedor?: string;
  estadoEquipo?: string;
  garantia?: string;
  fechaVencimiento?: string;
  accesorios?: string;
  manuales?: string;
  manualesCuales?: string;
}

export interface TipoEquipo {
  id: string;
  nombre: string;
  fijos: HojaVidaFijos;
  createdAt?: string;
  updatedAt?: string;
}

// Estados de Acta Interna (Biomédico -> Auxiliar)
export enum EstadoActaInterna {
  ENVIADA = 'ENVIADA',
  ACEPTADA = 'ACEPTADA',
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

export interface Profesional {
  id: string;
  consecutivo: number;
  nombre: string;
  cedula: string;
  direccion: string;
  telefono: string;
  cargo: string;
  createdAt?: string;
  createdByUid?: string;
  createdByNombre?: string;
}

// Modelo de Paciente Actualizado
export interface Paciente {
  id: string; // ID interno (UUID)
  consecutivo: number; // ID visible (Contador 1, 2, 3...)
  nombreCompleto: string;
  tipoDocumento: 'CC' | 'TI' | 'CE' | 'RC';
  numeroDocumento: string;
  direccion: string;
  // Barrio o municipio (opcional, para rutero).
  barrio?: string;
  // Zona del rutero (opcional).
  zona?: 'GIRON' | 'BGA1' | 'BGA2' | 'PIEDECUESTA' | 'FLORIDABLANCA';
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

  // Campo para control de acceso del rol VISITADOR (solo pacientes con asignación activa).
  tieneAsignacionActiva?: boolean;
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
  fotoEquipo?: EquipoFoto;
  // Plantilla (tipo de equipo) y datos de hoja de vida.
  tipoEquipoId?: string;
  hojaVidaDatos?: HojaVidaDatosEquipo;
  hojaVidaOverrides?: HojaVidaFijos;
  // Fecha de ingreso del equipo al inventario (ISO string).
  fechaIngreso?: string;
  // Fecha de mantenimiento (ISO string).
  fechaMantenimiento?: string;
  // Fecha de baja (ISO string).
  fechaBaja?: string;
  // Control de disponibilidad para entregas a pacientes (Legacy: si no existe, se asume true).
  disponibleParaEntrega?: boolean;
  // UID del custodio actual (opcional, Legacy: si no existe, no se filtra por custodio).
  custodioUid?: string;
  // Si existe, indica que el equipo está en una acta interna pendiente de aceptación.
  actaInternaPendienteId?: string;
  // Campo para control de acceso del rol VISITADOR (solo equipos con asignación activa).
  asignadoActivo?: boolean;
  ubicacionActual?: string; 
  observaciones: string;
  tipoPropiedad: TipoPropiedad;
  // Empresa de alquiler (solo cuando tipoPropiedad = ALQUILADO).
  empresaAlquiler?: string;
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
  // Fecha en la que se generó/actualizó la entrega en el sistema (ISO). No cambia con el tiempo (opción A).
  fechaActualizacionEntrega?: string;
  fechaDevolucion?: string;
  estado: EstadoAsignacion;
  observacionesEntrega: string;
  observacionesDevolucion?: string;
  // Estado final del equipo registrado al devolver (cuando estado = FINALIZADA)
  estadoFinalEquipo?: EstadoEquipo;
  // Firmas (DataURL base64) guardadas en Firestore
  firmaPacienteEntrega?: string;
  firmaPacienteDevolucion?: string;
  // Auditoría de firma capturada por VISITADOR (solo entrega).
  firmaPacienteEntregaCapturadaAt?: string;
  firmaPacienteEntregaCapturadaPorUid?: string;
  firmaPacienteEntregaCapturadaPorNombre?: string;
  // Firma del auxiliar (DataURL base64) guardada en Firestore para auditoría/consistencia del acta.
  firmaAuxiliar?: string;
  // Datos del auxiliar para impresión del acta.
  auxiliarNombre?: string;
  auxiliarUid?: string;
  usuarioAsigna: string; 
}

export interface AsignacionProfesional {
  id: string;
  consecutivo: number;
  idProfesional: string;
  idEquipo: string;
  // Fecha real/histórica de entrega (manual).
  fechaEntregaOriginal: string;
  // Fecha en la que se generó/actualizó la entrega en el sistema (ISO). No cambia con el tiempo (opción A).
  fechaActualizacionEntrega: string;
  ciudad?: string;
  sede?: string;
  estado: EstadoAsignacion;
  observacionesEntrega: string;
  observacionesDevolucion?: string;
  fechaDevolucion?: string;
  // Estado final del equipo al devolver (para métricas/historial).
  estadoFinalEquipo?: EstadoEquipo;
  // Firmas (DataURL base64)
  firmaProfesionalEntrega?: string;
  firmaProfesionalDevolucion?: string;
  firmaAuxiliar?: string;
  usuarioAsigna: string;
  uidAsigna?: string;
}

// Modelo de Acta
export interface Acta {
  id: string;
  tipo: 'ENTREGA' | 'DEVOLUCION';
  fecha: string;
  contenido: string; 
}

export interface ActaInternaItem {
  idEquipo: string;
  codigoInventario: string;
  numeroSerie: string;
  nombre: string;
  marca: string;
  modelo: string;
  // Estado técnico del equipo al momento de la entrega interna (opcional).
  estado?: string;
}

export interface ActaInterna {
  id: string;
  consecutivo: number;
  fecha: string; // ISO
  ciudad: string;
  sede: string;
  area: string;
  cargoRecibe: string;
  observaciones: string;
  entregaUid: string;
  entregaNombre: string;
  recibeUid: string;
  recibeNombre: string;
  recibeEmail?: string;
  solicitudIds?: string[];
  estado: EstadoActaInterna;
  items: ActaInternaItem[];
  firmaEntrega?: string;
  firmaRecibe?: string;
}

export enum EstadoReporteEquipo {
  ABIERTO = 'ABIERTO',
  EN_PROCESO = 'EN_PROCESO',
  CERRADO = 'CERRADO',
}

export enum EstadoSolicitudEquipoPaciente {
  PENDIENTE = 'PENDIENTE',
  APROBADA = 'APROBADA',
}

export interface ReporteFoto {
  path: string; // Ruta en Storage
  name: string; // Nombre original
  size: number; // bytes
  contentType: string;
}

export interface EquipoFoto {
  path: string; // Ruta en Storage
  name: string; // Nombre original
  size: number; // bytes
  contentType: string;
  url?: string; // URL de descarga (cacheable)
}

export interface ReporteEquipoHistorial {
  fecha: string; // ISO
  estado: EstadoReporteEquipo;
  nota: string;
  porUid: string;
  porNombre: string;
}

export interface ReporteEquipo {
  id: string;
  estado: EstadoReporteEquipo;
  idAsignacion: string;
  idPaciente: string;
  idEquipo: string;
  fechaVisita: string; // ISO
  descripcion: string;
  fotos: ReporteFoto[];

  creadoPorUid: string;
  creadoPorNombre: string;

  // Marca de leído por VISITADOR (cuando el biomédico cierra y el visitador abre el detalle).
  vistoPorVisitadorAt?: string;

  // Snapshot mínimo para reportes/email (no depende de joins).
  pacienteNombre: string;
  pacienteDocumento: string;
  equipoCodigoInventario: string;
  equipoNombre: string;
  equipoSerie: string;

  // Proceso de reparación (biomédico)
  diagnostico?: string;
  planReparacion?: string;
  enProcesoAt?: string;
  enProcesoPorUid?: string;
  enProcesoPorNombre?: string;
  historial?: ReporteEquipoHistorial[];

  // Campos de cierre (solo biomédico)
  cerradoAt?: string;
  cerradoPorUid?: string;
  cerradoPorNombre?: string;
  cierreNotas?: string;
}

export interface SolicitudEquipoPaciente {
  id: string;
  estado: EstadoSolicitudEquipoPaciente;
  idPaciente: string;
  pacienteNombre: string;
  pacienteDocumento: string;
  tipoPropiedad: TipoPropiedad;
  equipoNombre?: string;
  empresaAlquiler?: string;
  observaciones?: string;
  fotos: ReporteFoto[];
  creadoPorUid: string;
  creadoPorNombre: string;
  createdAt?: string;
  aprobadoAt?: string;
  aprobadoPorUid?: string;
  aprobadoPorNombre?: string;
  equipoId?: string;
  asignacionId?: string;
  actaInternaId?: string;
  actaInternaEstado?: EstadoActaInterna;
}
