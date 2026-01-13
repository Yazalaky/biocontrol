import React, { useMemo, useState, useEffect, useRef } from 'react';
import Layout from '../components/Layout';
import { toast } from '../services/feedback';
import {
  EquipoBiomedico,
  EstadoAsignacion,
  EstadoEquipo,
  RolUsuario,
  TipoPropiedad,
  type Asignacion,
  type AsignacionProfesional,
  type Paciente,
  type Profesional,
} from '../types';
import { useAuth } from '../contexts/AuthContext';
import StatusBadge from '../components/StatusBadge';
import {
  saveEquipo,
  subscribeAsignaciones,
  subscribeAsignacionesProfesionales,
  subscribeEquipos,
  subscribePacientes,
  subscribeProfesionales,
} from '../services/firestoreData';

const Inventory: React.FC = () => {
  const { hasRole, usuario } = useAuth();
  const [equipos, setEquipos] = useState<EquipoBiomedico[]>([]);
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [asignacionesProfesionales, setAsignacionesProfesionales] = useState<AsignacionProfesional[]>([]);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  
  // Search State
  const [searchTerm, setSearchTerm] = useState('');

  // Import State
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal Edit/Create State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<EquipoBiomedico>>({
    tipoPropiedad: TipoPropiedad.PROPIO,
    fechaIngreso: new Date().toISOString(),
    disponibleParaEntrega: false,
  });

  // Modal History State
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyEquipo, setHistoryEquipo] = useState<{ equipo: EquipoBiomedico, data: any[] } | null>(null);

  // Stats para contadores
  const [assignmentCounts, setAssignmentCounts] = useState<{[key: string]: number}>({});

  useEffect(() => {
    setFirestoreError(null);

    const unsubEquipos = subscribeEquipos(setEquipos, (e) => {
      console.error('Firestore subscribeEquipos error:', e);
      setFirestoreError(`No tienes permisos para leer "equipos" en Firestore. Detalle: ${e.message}`);
    });
    const unsubPacientes = subscribePacientes(setPacientes, (e) => {
      console.error('Firestore subscribePacientes error:', e);
      setFirestoreError(`No tienes permisos para leer "pacientes" en Firestore. Detalle: ${e.message}`);
    });
    const unsubAsignaciones = subscribeAsignaciones(setAsignaciones, (e) => {
      console.error('Firestore subscribeAsignaciones error:', e);
      setFirestoreError(`No tienes permisos para leer "asignaciones" en Firestore. Detalle: ${e.message}`);
    });
    const unsubProfesionales = subscribeProfesionales(setProfesionales, () => {});
    const unsubAsignacionesProfesionales = subscribeAsignacionesProfesionales(setAsignacionesProfesionales, (e) => {
      console.error('Firestore subscribeAsignacionesProfesionales error:', e);
      setFirestoreError(
        `No tienes permisos para leer "asignaciones_profesionales" en Firestore. Detalle: ${e.message}`,
      );
    });

    return () => {
      unsubEquipos();
      unsubPacientes();
      unsubAsignaciones();
      unsubProfesionales();
      unsubAsignacionesProfesionales();
    };
  }, []);

  useEffect(() => {
    const counts: { [key: string]: number } = {};
    for (const a of asignaciones) {
      const equipoId = a.idEquipo;
      counts[equipoId] = (counts[equipoId] || 0) + 1;
    }
    for (const a of asignacionesProfesionales) {
      const equipoId = a.idEquipo;
      counts[equipoId] = (counts[equipoId] || 0) + 1;
    }
    setAssignmentCounts(counts);
  }, [asignaciones, asignacionesProfesionales]);

  const canEdit = hasRole([RolUsuario.INGENIERO_BIOMEDICO]);
  const pacientesById = useMemo(() => new Map(pacientes.map((p) => [p.id, p])), [pacientes]);
  const profesionalesById = useMemo(() => new Map(profesionales.map((p) => [p.id, p])), [profesionales]);
  const activeAsignacionByEquipo = useMemo(() => {
    const map = new Map<string, { tipo: 'PACIENTE' | 'PROFESIONAL'; asignacion: Asignacion | AsignacionProfesional }>();
    for (const a of asignaciones) {
      if (a.estado === EstadoAsignacion.ACTIVA) map.set(a.idEquipo, { tipo: 'PACIENTE', asignacion: a });
    }
    for (const a of asignacionesProfesionales) {
      if (a.estado === EstadoAsignacion.ACTIVA) map.set(a.idEquipo, { tipo: 'PROFESIONAL', asignacion: a });
    }
    return map;
  }, [asignaciones, asignacionesProfesionales]);
  const lastFinalEstadoByEquipo = useMemo(() => {
    const map = new Map<string, { date: number; estadoFinal: EstadoEquipo }>();
    for (const a of asignaciones) {
      if (a.estado !== EstadoAsignacion.FINALIZADA) continue;
      if (!a.estadoFinalEquipo) continue;
      const date = new Date(a.fechaDevolucion || a.fechaAsignacion).getTime();
      const prev = map.get(a.idEquipo);
      if (!prev || date > prev.date) {
        map.set(a.idEquipo, { date, estadoFinal: a.estadoFinalEquipo as EstadoEquipo });
      }
    }
    for (const a of asignacionesProfesionales) {
      if (a.estado !== EstadoAsignacion.FINALIZADA) continue;
      if (!a.estadoFinalEquipo) continue;
      const date = new Date(a.fechaDevolucion || a.fechaEntregaOriginal).getTime();
      const prev = map.get(a.idEquipo);
      if (!prev || date > prev.date) {
        map.set(a.idEquipo, { date, estadoFinal: a.estadoFinalEquipo as EstadoEquipo });
      }
    }
    return map;
  }, [asignaciones, asignacionesProfesionales]);

  // Filtro de Equipos (Buscador)
  const filteredEquipos = equipos.filter(e => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      e.codigoInventario.toLowerCase().includes(term) ||
      e.numeroSerie.toLowerCase().includes(term) ||
      e.nombre.toLowerCase().includes(term) ||
      e.marca.toLowerCase().includes(term)
    );
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;

    const newEquipo: EquipoBiomedico = {
      id: formData.id || '',
      codigoInventario: formData.codigoInventario || '', // Si es nuevo, db lo ignora y genera uno.
      numeroSerie: formData.numeroSerie || '',
      nombre: formData.nombre || '',
      marca: formData.marca || '',
      modelo: formData.modelo || '',
      estado: formData.estado || EstadoEquipo.DISPONIBLE,
      fechaIngreso: formData.fechaIngreso ? formData.fechaIngreso : new Date().toISOString(),
      // Control (acta interna): equipos nuevos quedan NO disponibles para entrega hasta aceptación.
      disponibleParaEntrega: typeof formData.disponibleParaEntrega === 'boolean' ? formData.disponibleParaEntrega : undefined,
      custodioUid: formData.custodioUid || (formData.id ? undefined : usuario?.id),
      observaciones: formData.observaciones || '',
      ubicacionActual: formData.ubicacionActual || 'Bodega',
      tipoPropiedad: formData.tipoPropiedad || TipoPropiedad.PROPIO,
      datosPropietario: formData.tipoPropiedad === TipoPropiedad.EXTERNO ? formData.datosPropietario : undefined
    };
    try {
      await saveEquipo(newEquipo);
      setIsModalOpen(false);
      setFormData({ tipoPropiedad: TipoPropiedad.PROPIO, fechaIngreso: new Date().toISOString(), disponibleParaEntrega: false });
    } catch (err: any) {
      console.error('Error guardando equipo:', err);
      toast({ tone: 'error', message: `${err?.code ? `${err.code}: ` : ''}${err?.message || 'No se pudo guardar el equipo.'}` });
    }
  };

  const isoToDateInput = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const openEdit = (equipo: EquipoBiomedico) => {
    if (!canEdit) return;
    setFormData({ ...equipo, fechaIngreso: equipo.fechaIngreso || new Date().toISOString() });
    setIsModalOpen(true);
  };

  const openHistory = (equipo: EquipoBiomedico) => {
    const historialPacientes = asignaciones
      .filter((a) => a.idEquipo === equipo.id)
      .map((h) => {
        const paciente = pacientesById.get(h.idPaciente);
        return {
          id: h.id,
          tipo: 'PACIENTE' as const,
          fecha: h.fechaAsignacion,
          fechaFin: h.fechaDevolucion,
          estado: h.estado,
          consecutivo: h.consecutivo,
          nombre: paciente ? paciente.nombreCompleto : 'Paciente Eliminado',
          doc: paciente ? paciente.numeroDocumento : 'N/A',
          observacionesEntrega: h.observacionesEntrega,
          observacionesDevolucion: h.observacionesDevolucion,
          estadoFinalEquipo: h.estadoFinalEquipo,
        };
      });

    const historialProfesionales = asignacionesProfesionales
      .filter((a) => a.idEquipo === equipo.id)
      .map((h) => {
        const prof = profesionalesById.get(h.idProfesional);
        return {
          id: h.id,
          tipo: 'PROFESIONAL' as const,
          fecha: h.fechaEntregaOriginal,
          fechaFin: h.fechaDevolucion,
          estado: h.estado,
          consecutivo: h.consecutivo,
          nombre: prof ? prof.nombre : 'Profesional Eliminado',
          doc: prof ? prof.cedula : 'N/A',
          observacionesEntrega: h.observacionesEntrega,
          observacionesDevolucion: h.observacionesDevolucion,
          estadoFinalEquipo: h.estadoFinalEquipo,
        };
      });

    const enriched = [...historialPacientes, ...historialProfesionales].sort(
      (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
    );

    setHistoryEquipo({ equipo, data: enriched });
    setIsHistoryOpen(true);
  };

  const handleOwnerChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      datosPropietario: {
        nombre: '',
        nit: '',
        telefono: '',
        ...(prev.datosPropietario || {}),
        [field]: value
      }
    }));
  };

  const handleDownloadTemplate = () => {
    // Se eliminó "CodigoInventario" porque ahora es automático
    const headers = [
      "NumeroSerie",
      "Nombre",
      "Marca",
      "Modelo",
      "TipoPropiedad (PROPIO/EXTERNO)",
      "UbicacionInicial",
      "Observaciones",
      "Propietario_Nombre",
      "Propietario_NIT",
      "Propietario_Telefono",
      "FechaIngreso (YYYY-MM-DD)"
    ];

    const exampleRow = [
      "SN-123456",
      "Concentrador de Oxigeno",
      "Everflo",
      "Respironics",
      "PROPIO",
      "Bodega",
      "Equipo nuevo",
      "", "", "",
      "2020-01-15"
    ];

    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n" 
      + exampleRow.join(",");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "plantilla_equipos_biocontrol.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEdit) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      (async () => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.split('\n');
      const dataLines = lines.slice(1).filter(line => line.trim() !== '');

      let successCount = 0;
      let errorCount = 0;
      let errorMessages: string[] = [];

      for (const [index, line] of dataLines.entries()) {
        const columns = line.split(','); 
        if (columns.length < 4) continue; // Mínimo serie, nombre, marca, modelo

        // Índices ajustados al remover CodigoInventario
        const tipoPropiedad = columns[4]?.trim().toUpperCase() === 'EXTERNO' ? TipoPropiedad.EXTERNO : TipoPropiedad.PROPIO;
        const fechaIngresoStr = columns[10]?.trim();
        const fechaIngresoIso = (() => {
          if (!fechaIngresoStr) return new Date().toISOString();
          const d = new Date(`${fechaIngresoStr}T12:00:00`);
          return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
        })();

        const importedEquipo: EquipoBiomedico = {
          id: '', 
          codigoInventario: '', // Se generará automáticamente
          numeroSerie: columns[0]?.trim() || '',
          nombre: columns[1]?.trim() || 'Sin Nombre',
          marca: columns[2]?.trim() || '',
          modelo: columns[3]?.trim() || '',
          tipoPropiedad: tipoPropiedad,
          fechaIngreso: fechaIngresoIso,
          ubicacionActual: columns[5]?.trim() || 'Bodega',
          observaciones: columns[6]?.trim() || '',
          estado: EstadoEquipo.DISPONIBLE,
          disponibleParaEntrega: false,
          custodioUid: usuario?.id,
          datosPropietario: tipoPropiedad === TipoPropiedad.EXTERNO ? {
             nombre: columns[7]?.trim() || '',
             nit: columns[8]?.trim() || '',
             telefono: columns[9]?.trim() || ''
          } : undefined
        };

        try {
          if (!importedEquipo.numeroSerie || !importedEquipo.nombre) {
             throw new Error(`Fila ${index + 2}: Falta serie o nombre`);
          }
          await saveEquipo(importedEquipo);
          successCount++;
        } catch (err: any) {
          errorCount++;
          errorMessages.push(`Fila ${index + 2} (${importedEquipo.nombre}): ${err.message}`);
        }
      }

      let message = `Proceso completado.\n\nImportados exitosamente: ${successCount}\nFallidos: ${errorCount}`;
      if (errorCount > 0) {
        message += `\n\nErrores:\n${errorMessages.slice(0, 5).join('\n')}${errorMessages.length > 5 ? '\n...' : ''}`;
      }
      toast({ tone: errorCount > 0 ? 'warning' : 'success', title: 'Importacion CSV', message });
      if (fileInputRef.current) fileInputRef.current.value = ''; 
      })().catch((err) => toast({ tone: 'error', message: err?.message || 'Error importando CSV' }));
    };
    reader.readAsText(file);
  };

  return (
    <Layout title="Inventario Biomédico">
      {firestoreError && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded p-3 text-sm">
          {firestoreError}
        </div>
      )}
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="w-full md:max-w-xl">
          <div className="md-search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              type="text"
              placeholder="Buscar por código, serie o nombre..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {canEdit && (
          <div className="flex gap-2">
            <input 
              type="file" 
              accept=".csv" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleImportCSV} 
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="md-btn md-btn-tonal"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              Importar
            </button>
            <button 
              onClick={handleDownloadTemplate}
              className="md-btn md-btn-outlined"
              title="Descargar plantilla CSV (Sin columna de Código)"
            >
               <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
               Plantilla
            </button>
            <button 
              onClick={() => { setFormData({ tipoPropiedad: TipoPropiedad.PROPIO, fechaIngreso: new Date().toISOString() }); setIsModalOpen(true); }}
              className="md-btn md-btn-filled"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Nuevo Equipo
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredEquipos.map(equipo => (
          (() => {
            const active = activeAsignacionByEquipo.get(equipo.id);
            const lastFinal = lastFinalEstadoByEquipo.get(equipo.id);
            const status = active ? EstadoEquipo.ASIGNADO : (lastFinal?.estadoFinal || equipo.estado);
            const ubicacion = (() => {
              if (!active) return equipo.ubicacionActual;
              if (active.tipo === 'PACIENTE') {
                const a = active.asignacion as Asignacion;
                return pacientesById.get(a.idPaciente)?.nombreCompleto || equipo.ubicacionActual;
              }
              const a = active.asignacion as AsignacionProfesional;
              return profesionalesById.get(a.idProfesional)?.nombre || equipo.ubicacionActual;
            })();
            return (
          <div key={equipo.id} className="md-card p-5 hover:shadow-[var(--md-shadow-2)] transition-shadow relative">
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-600 border border-gray-200">
                  {equipo.codigoInventario}
                </span>
                {equipo.disponibleParaEntrega === false && (
                  <span className="text-[10px] uppercase px-2 py-1 rounded-full border border-amber-200 bg-amber-50 text-amber-800">
                    Pendiente acta interna
                  </span>
                )}
              </div>
              <StatusBadge status={status} />
            </div>
            <h3 className="text-lg font-bold text-gray-900">{equipo.nombre}</h3>
            <div className="flex flex-col text-sm text-gray-600 mb-1">
              <span>{equipo.marca} - {equipo.modelo}</span>
              <span className="text-xs text-gray-400 font-mono mt-0.5">S/N: {equipo.numeroSerie}</span>
            </div>
            
            <div className="mt-2 flex items-center">
              {equipo.tipoPropiedad === TipoPropiedad.EXTERNO ? (
                <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-orange-100 text-orange-800 border border-orange-200">
                  Externo
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-blue-50 text-blue-800 border border-blue-100">
                  Propio
                </span>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 text-sm space-y-1">
              <p><span className="font-semibold text-gray-500">Ubicación:</span> {ubicacion}</p>
              <p className="truncate"><span className="font-semibold text-gray-500">Obs:</span> {equipo.observaciones}</p>
              {equipo.fechaIngreso && (
                <p className="text-xs text-gray-500 mt-2">
                  <span className="font-semibold">Ingreso:</span> {new Date(equipo.fechaIngreso).toLocaleDateString('es-CO')}
                </p>
              )}
              {equipo.tipoPropiedad === TipoPropiedad.EXTERNO && equipo.datosPropietario && (
                 <p className="text-xs text-orange-700 mt-2 bg-orange-50 p-1 rounded">
                   <strong>Propietario:</strong> {equipo.datosPropietario.nombre}
                 </p>
              )}
            </div>

            {/* Contador de Historial */}
            <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-gray-500 font-medium bg-gray-50 px-2 py-1 rounded">
	                    Historial: {assignmentCounts[equipo.id] || 0} registros
	                </span>
                <button 
                    onClick={() => openHistory(equipo)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold underline"
                >
                    Ver Hoja de Vida
                </button>
            </div>

            {canEdit && (
              <button 
                onClick={() => openEdit(equipo)}
                className="mt-4 w-full md-btn md-btn-outlined"
              >
                Editar / Cambiar Estado
              </button>
            )}
          </div>
            );
          })()
        ))}
        {filteredEquipos.length === 0 && (
          <div className="col-span-full py-12 text-center text-gray-500">
             No se encontraron equipos con los criterios de búsqueda.
          </div>
        )}
      </div>

      {/* Modal Crear/Editar */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white p-6 rounded-lg w-full max-w-lg my-8">
            <h3 className="text-xl font-bold mb-4">{formData.id ? 'Editar Equipo' : 'Nuevo Equipo'}</h3>
            <form onSubmit={handleSave} className="space-y-4">
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium">Código Inventario</label>
                    <input 
                      className="w-full border p-2 rounded bg-gray-100 text-gray-600 cursor-not-allowed" 
                      value={formData.id ? formData.codigoInventario : 'Autogenerado (MBG-XXX)'} 
                      disabled 
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      {formData.id ? 'No editable' : 'Se asignará automáticamente al guardar'}
                    </p>
                </div>
                <div>
                    <label className="block text-sm font-medium">Número de Serie</label>
                    <input className="w-full border p-2 rounded" value={formData.numeroSerie || ''} onChange={e => setFormData({...formData, numeroSerie: e.target.value})} required />
                </div>
              </div>

              <div>
                  <label className="block text-sm font-medium">Nombre del Equipo</label>
                  <input className="w-full border p-2 rounded" value={formData.nombre || ''} onChange={e => setFormData({...formData, nombre: e.target.value})} required />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium">Marca</label>
                    <input className="w-full border p-2 rounded" value={formData.marca || ''} onChange={e => setFormData({...formData, marca: e.target.value})} required />
                </div>
                <div>
                    <label className="block text-sm font-medium">Modelo</label>
                    <input className="w-full border p-2 rounded" value={formData.modelo || ''} onChange={e => setFormData({...formData, modelo: e.target.value})} required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium">Fecha de Ingreso</label>
                  <input
                    type="date"
                    className="w-full border p-2 rounded"
                    value={isoToDateInput(formData.fechaIngreso)}
                    onChange={(e) => {
                      const dateStr = e.target.value;
                      const d = new Date(`${dateStr}T12:00:00`);
                      setFormData({
                        ...formData,
                        fechaIngreso: Number.isNaN(d.getTime()) ? undefined : d.toISOString(),
                      });
                    }}
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">Registra el año/fecha real de ingreso al inventario.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium">Ubicación Inicial</label>
                  <input
                    className="w-full border p-2 rounded"
                    value={formData.ubicacionActual || ''}
                    onChange={(e) => setFormData({ ...formData, ubicacionActual: e.target.value })}
                    placeholder="Ej: Bodega"
                  />
                  <p className="text-xs text-gray-400 mt-1">Si está vacío, se guardará como “Bodega”.</p>
                </div>
              </div>

              {/* Selección de Propiedad */}
              <div>
                <label className="block text-sm font-medium mb-1">Propiedad del Equipo</label>
                <div className="flex gap-4">
                  <label className="flex items-center space-x-2 border p-2 rounded w-full cursor-pointer hover:bg-gray-50">
                    <input 
                      type="radio" 
                      name="tipoPropiedad"
                      value={TipoPropiedad.PROPIO}
                      checked={formData.tipoPropiedad === TipoPropiedad.PROPIO}
                      onChange={() => setFormData({...formData, tipoPropiedad: TipoPropiedad.PROPIO})}
                    />
                    <span>Propio (Medicuc)</span>
                  </label>
                  <label className="flex items-center space-x-2 border p-2 rounded w-full cursor-pointer hover:bg-gray-50">
                    <input 
                      type="radio" 
                      name="tipoPropiedad"
                      value={TipoPropiedad.EXTERNO}
                      checked={formData.tipoPropiedad === TipoPropiedad.EXTERNO}
                      onChange={() => setFormData({...formData, tipoPropiedad: TipoPropiedad.EXTERNO})}
                    />
                    <span>Externo</span>
                  </label>
                </div>
              </div>

              {/* Campos Condicionales para Externos */}
              {formData.tipoPropiedad === TipoPropiedad.EXTERNO && (
                <div className="bg-orange-50 p-4 rounded border border-orange-200 space-y-3">
                  <h4 className="text-sm font-bold text-orange-800">Datos del Propietario</h4>
                  <div>
                    <label className="block text-xs font-medium text-gray-700">Nombre Completo / Razón Social</label>
                    <input 
                      required 
                      className="w-full border p-2 rounded text-sm focus:ring-orange-500"
                      value={formData.datosPropietario?.nombre || ''} 
                      onChange={e => handleOwnerChange('nombre', e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700">Cédula o NIT</label>
                      <input 
                        required 
                        className="w-full border p-2 rounded text-sm focus:ring-orange-500"
                        value={formData.datosPropietario?.nit || ''} 
                        onChange={e => handleOwnerChange('nit', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700">Teléfono</label>
                      <input 
                        required 
                        className="w-full border p-2 rounded text-sm focus:ring-orange-500"
                        value={formData.datosPropietario?.telefono || ''} 
                        onChange={e => handleOwnerChange('telefono', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}
              
              {/* Cambio de Estado - Solo visible al editar */}
              {formData.id && (
                <div>
                   <label className="block text-sm font-medium text-red-600">Estado Técnico</label>
                   <select 
                     className="w-full border p-2 rounded bg-red-50"
                     value={formData.estado}
                     onChange={e => setFormData({...formData, estado: e.target.value as EstadoEquipo})}
                   >
                     <option value={EstadoEquipo.DISPONIBLE}>Disponible</option>
                     <option value={EstadoEquipo.MANTENIMIENTO}>En Mantenimiento</option>
                     <option value={EstadoEquipo.DADO_DE_BAJA}>Dar de Baja</option>
                     <option value={EstadoEquipo.ASIGNADO} disabled>Asignado (Automático)</option>
                   </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium">Observaciones</label>
                <textarea className="w-full border p-2 rounded" rows={3} value={formData.observaciones || ''} onChange={e => setFormData({...formData, observaciones: e.target.value})} />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border rounded hover:bg-gray-100">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Historial / Hoja de Vida */}
      {isHistoryOpen && historyEquipo && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-gray-50 rounded-t-lg">
                <div>
                    <h3 className="text-xl font-bold text-gray-800">Hoja de Vida del Equipo</h3>
                    <p className="text-sm text-gray-600">{historyEquipo.equipo.nombre} - {historyEquipo.equipo.marca} {historyEquipo.equipo.modelo}</p>
                    <p className="text-xs font-mono text-gray-500 mt-1">S/N: {historyEquipo.equipo.numeroSerie} | Inv: {historyEquipo.equipo.codigoInventario}</p>
                </div>
                <button onClick={() => setIsHistoryOpen(false)} className="text-gray-400 hover:text-gray-600">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
                {historyEquipo.data.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                        <p>Este equipo no tiene historial de asignaciones registrado.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center mb-2">
	                            <h4 className="font-semibold text-gray-700">Historial de Uso ({historyEquipo.data.length} registros)</h4>
	                        </div>
	                        <div className="border rounded-lg overflow-hidden">
	                            <table className="min-w-full divide-y divide-gray-200">
	                                <thead className="bg-gray-50">
	                                    <tr>
	                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Acta #</th>
	                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
	                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Receptor</th>
	                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fecha Inicio</th>
	                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fecha Fin</th>
	                                    </tr>
	                                </thead>
	                                <tbody className="bg-white divide-y divide-gray-200">
	                                    {historyEquipo.data.map((h, idx) => (
	                                        <tr key={h.id || idx} className="hover:bg-gray-50">
	                                            <td className="px-4 py-2 text-xs font-mono font-bold text-gray-600">
	                                                {h.consecutivo ? String(h.consecutivo).padStart(4, '0') : '-'}
	                                            </td>
	                                            <td className="px-4 py-2 text-xs font-semibold">
	                                              <span
	                                                className={
	                                                  h.tipo === 'PROFESIONAL'
	                                                    ? 'px-2 py-0.5 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-800'
	                                                    : 'px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800'
	                                                }
	                                              >
	                                                {h.tipo}
	                                              </span>
	                                            </td>
	                                            <td className="px-4 py-2 text-sm text-gray-900">
	                                              <div className="font-medium">{h.nombre}</div>
	                                              <div className="text-xs text-gray-500">{h.doc}</div>
	                                            </td>
	                                            <td className="px-4 py-2 text-sm text-gray-500">
	                                              {new Date(h.fecha).toLocaleDateString()}
	                                            </td>
	                                            <td className="px-4 py-2 text-sm text-gray-500">
	                                              {h.fechaFin ? (
	                                                new Date(h.fechaFin).toLocaleDateString()
	                                              ) : (
	                                                <span className="text-green-600 text-xs font-bold border border-green-200 bg-green-50 px-1 rounded">
	                                                  ACTUAL
	                                                </span>
	                                              )}
	                                            </td>
	                                        </tr>
	                                    ))}
	                                </tbody>
	                            </table>
                        </div>
                    </div>
                )}
            </div>

            <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-lg flex justify-end">
                <button onClick={() => setIsHistoryOpen(false)} className="px-4 py-2 bg-white border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50">
                    Cerrar
                </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Inventory;
