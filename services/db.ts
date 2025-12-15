import { 
  Paciente, 
  EquipoBiomedico, 
  Asignacion, 
  EstadoPaciente, 
  EstadoEquipo, 
  EstadoAsignacion,
  RolUsuario,
  Usuario,
  TipoPropiedad
} from '../types';

/**
 * Esta clase simula una base de datos y la lógica del Backend (Node/Express).
 * Utiliza LocalStorage para persistir datos durante la sesión.
 */
class MockDatabase {
  private pacientes: Paciente[] = [];
  private equipos: EquipoBiomedico[] = [];
  private asignaciones: Asignacion[] = [];

  constructor() {
    this.load();
    if (this.pacientes.length === 0) {
      this.seed();
    }
  }

  private load() {
    const p = localStorage.getItem('biocontrol_pacientes');
    const e = localStorage.getItem('biocontrol_equipos');
    const a = localStorage.getItem('biocontrol_asignaciones');
    
    if (p) this.pacientes = JSON.parse(p);
    if (e) this.equipos = JSON.parse(e);
    if (a) this.asignaciones = JSON.parse(a);
  }

  private save() {
    localStorage.setItem('biocontrol_pacientes', JSON.stringify(this.pacientes));
    localStorage.setItem('biocontrol_equipos', JSON.stringify(this.equipos));
    localStorage.setItem('biocontrol_asignaciones', JSON.stringify(this.asignaciones));
  }

  private seed() {
    // Datos de prueba iniciales actualizados al nuevo modelo
    this.pacientes = [
      { 
        id: '1', 
        consecutivo: 1,
        nombreCompleto: 'Juan Pérez', 
        tipoDocumento: 'CC', 
        numeroDocumento: '12345678', 
        direccion: 'Calle 123 # 45-67',
        eps: 'Salud Total',
        telefono: '3001234567', 
        nombreFamiliar: 'Ana Pérez',
        telefonoFamiliar: '3109876543',
        documentoFamiliar: '60345123',
        parentescoFamiliar: 'Esposa',
        estado: EstadoPaciente.ACTIVO, 
        fechaInicioPrograma: new Date().toISOString(),
        horasPrestadas: '12 Horas Diarias',
        tipoServicio: 'Domiciliario',
        diagnostico: 'Apnea del sueño'
      },
      { 
        id: '2', 
        consecutivo: 2,
        nombreCompleto: 'Maria Gomez', 
        tipoDocumento: 'CC', 
        numeroDocumento: '87654321', 
        direccion: 'Carrera 80 # 10-20',
        eps: 'Nueva Eps',
        telefono: '3151234567', 
        nombreFamiliar: 'Carlos Gomez',
        telefonoFamiliar: '3201112233',
        documentoFamiliar: '1098765432',
        parentescoFamiliar: 'Hijo',
        estado: EstadoPaciente.ACTIVO, 
        fechaInicioPrograma: new Date().toISOString(),
        horasPrestadas: '24 Horas (Internación)',
        tipoServicio: 'Hospitalario',
        diagnostico: 'Insuficiencia Respiratoria'
      },
    ];
    // Se actualiza prefijo a MBG
    this.equipos = [
      { id: '101', codigoInventario: 'MBG-001', numeroSerie: 'SN-M10-9988', nombre: 'Monitor Signos Vitales', marca: 'Mindray', modelo: 'iMEC 10', estado: EstadoEquipo.DISPONIBLE, observaciones: 'Buen estado', ubicacionActual: 'Bodega', tipoPropiedad: TipoPropiedad.PROPIO },
      { id: '102', codigoInventario: 'MBG-002', numeroSerie: 'SN-BB-7766', nombre: 'Bomba de Infusión', marca: 'B. Braun', modelo: 'Infusomat', estado: EstadoEquipo.DISPONIBLE, observaciones: 'Calibración pendiente', ubicacionActual: 'Bodega', tipoPropiedad: TipoPropiedad.PROPIO },
      { id: '103', codigoInventario: 'MBG-003', numeroSerie: 'SN-DR-5544', nombre: 'Ventilador Mecánico', marca: 'Dräger', modelo: 'Savina', estado: EstadoEquipo.MANTENIMIENTO, observaciones: 'En revisión técnica', ubicacionActual: 'Taller', tipoPropiedad: TipoPropiedad.PROPIO },
    ];
    this.save();
  }

  // --- MÉTODOS DE PACIENTES ---
  getPacientes() { return [...this.pacientes]; }
  
  savePaciente(paciente: Paciente) {
    const existeDuplicado = this.pacientes.find(p => 
      p.numeroDocumento === paciente.numeroDocumento && p.id !== paciente.id
    );

    if (existeDuplicado) {
      throw new Error(`Error: El paciente con número de documento ${paciente.numeroDocumento} ya existe en el sistema.`);
    }

    const idx = this.pacientes.findIndex(p => p.id === paciente.id);
    if (idx >= 0) {
      this.pacientes[idx] = paciente;
    } else {
      const maxConsecutivo = this.pacientes.reduce((max, p) => (p.consecutivo > max ? p.consecutivo : max), 0);
      
      this.pacientes.push({ 
        ...paciente, 
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5), // ID único
        consecutivo: maxConsecutivo + 1 
      });
    }
    this.save();
  }

  // --- MÉTODOS DE EQUIPOS ---
  getEquipos() { return [...this.equipos]; }

  saveEquipo(equipo: EquipoBiomedico) {
    const idx = this.equipos.findIndex(e => e.id === equipo.id);
    
    // Si estamos editando (existe ID)
    if (idx >= 0) {
      // Validar que no estemos duplicando el código manualmente (aunque el frontend lo deshabilite)
      const existeDuplicado = this.equipos.find(e => 
        e.codigoInventario === equipo.codigoInventario && e.id !== equipo.id
      );
      if (existeDuplicado) {
        throw new Error(`Error: El código ${equipo.codigoInventario} ya está en uso.`);
      }
      this.equipos[idx] = equipo;
    } else {
      // CREACIÓN: Generación Automática de MBG-XXX
      
      // Filtrar solo los que siguen el patrón MBG
      const prefix = 'MBG-';
      const mbgEquipos = this.equipos.filter(e => e.codigoInventario.startsWith(prefix));
      
      // Encontrar el número máximo actual
      const maxNumber = mbgEquipos.reduce((max, curr) => {
        // Extraer la parte numérica '001' de 'MBG-001'
        const parts = curr.codigoInventario.split('-');
        if (parts.length === 2) {
            const num = parseInt(parts[1], 10);
            return !isNaN(num) && num > max ? num : max;
        }
        return max;
      }, 0);

      const nextNumber = maxNumber + 1;
      const nuevoCodigo = `${prefix}${String(nextNumber).padStart(3, '0')}`;

      this.equipos.push({ 
        ...equipo, 
        codigoInventario: nuevoCodigo, // Asignar automático
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5) 
      });
    }
    this.save();
  }

  // --- LÓGICA DE NEGOCIO (Simulation de Controladores Backend) ---

  asignarEquipo(idPaciente: string, idEquipo: string, obs: string, usuario: string): Asignacion {
    const equipo = this.equipos.find(e => e.id === idEquipo);
    const paciente = this.pacientes.find(p => p.id === idPaciente);

    if (!equipo || !paciente) throw new Error("Entidad no encontrada");
    if (equipo.estado !== EstadoEquipo.DISPONIBLE) throw new Error("El equipo no está disponible");
    if (paciente.estado !== EstadoPaciente.ACTIVO) throw new Error("El paciente no está activo");

    const maxConsecutivo = this.asignaciones.reduce((max, current) => {
      return (current.consecutivo || 0) > max ? (current.consecutivo || 0) : max;
    }, 0);
    const nuevoConsecutivo = maxConsecutivo + 1;

    equipo.estado = EstadoEquipo.ASIGNADO;
    equipo.ubicacionActual = paciente.nombreCompleto;
    
    const asignacion: Asignacion = {
      id: Date.now().toString(),
      consecutivo: nuevoConsecutivo,
      idPaciente,
      idEquipo,
      fechaAsignacion: new Date().toISOString(),
      estado: EstadoAsignacion.ACTIVA,
      observacionesEntrega: obs,
      usuarioAsigna: usuario
    };

    this.asignaciones.push(asignacion);
    this.save();
    return asignacion;
  }

  devolverEquipo(idAsignacion: string, obsDevolucion: string, estadoFinalEquipo: EstadoEquipo): Asignacion {
    const asignacion = this.asignaciones.find(a => a.id === idAsignacion);
    if (!asignacion) throw new Error("Asignación no encontrada");
    if (asignacion.estado !== EstadoAsignacion.ACTIVA) throw new Error("La asignación ya está finalizada");

    const equipo = this.equipos.find(e => e.id === asignacion.idEquipo);
    if (equipo) {
      equipo.estado = estadoFinalEquipo; 
      equipo.ubicacionActual = 'Bodega / Taller';
    }

    asignacion.fechaDevolucion = new Date().toISOString();
    asignacion.estado = EstadoAsignacion.FINALIZADA;
    asignacion.observacionesDevolucion = obsDevolucion;

    this.save();
    return asignacion;
  }

  getAsignacionesPorPaciente(idPaciente: string) {
    return this.asignaciones.filter(a => a.idPaciente === idPaciente);
  }

  getHistorialEquipo(idEquipo: string) {
    return this.asignaciones
      .filter(a => a.idEquipo === idEquipo)
      .sort((a, b) => new Date(b.fechaAsignacion).getTime() - new Date(a.fechaAsignacion).getTime());
  }

  getPacienteById(id: string) {
    return this.pacientes.find(p => p.id === id);
  }

  getAllAsignaciones() {
    return [...this.asignaciones];
  }

  validarSalidaPaciente(idPaciente: string): boolean {
    const activas = this.asignaciones.filter(a => a.idPaciente === idPaciente && a.estado === EstadoAsignacion.ACTIVA);
    if (activas.length > 0) return false;

    const paciente = this.pacientes.find(p => p.id === idPaciente);
    if (paciente) {
      paciente.estado = EstadoPaciente.EGRESADO;
      paciente.fechaSalida = new Date().toISOString();
      this.save();
    }
    return true;
  }
}

export const db = new MockDatabase();

export const mockLogin = async (rol: RolUsuario): Promise<Usuario> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        id: 'u1',
        nombre: 'Usuario Prueba',
        rol: rol
      });
    }, 500);
  });
};