import React, { useMemo, useState, useEffect, useRef, useLayoutEffect } from 'react';
import Layout from '../components/Layout';
import { Paciente, EstadoPaciente, Asignacion, EquipoBiomedico, EstadoEquipo, EstadoAsignacion, RolUsuario, EPS } from '../types';
import { useAuth } from '../contexts/AuthContext';
import StatusBadge from '../components/StatusBadge';
import ActaFormat from '../components/ActaFormat';
import SignaturePad from '../components/SignaturePad';
import {
  asignarEquipo,
  devolverEquipo,
  guardarFirmaAuxiliar,
  guardarFirmaPaciente,
  savePaciente,
  subscribeAsignaciones,
  subscribeEquipos,
  subscribePacientes,
  validarSalidaPaciente,
} from '../services/firestoreData';

const Patients: React.FC = () => {
  const { usuario } = useAuth();
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [equipos, setEquipos] = useState<EquipoBiomedico[]>([]);
  const [allAsignaciones, setAllAsignaciones] = useState<Asignacion[]>([]);
  const [selectedPaciente, setSelectedPaciente] = useState<Paciente | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'create' | 'details'>('list');
  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  // Search State
  const [searchTerm, setSearchTerm] = useState('');

  const canManage = usuario?.rol === RolUsuario.AUXILIAR_ADMINISTRATIVA;

  // Form State
  const [formData, setFormData] = useState<Partial<Paciente>>({});
  
  // Import State
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Assignment State
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [equipoSeleccionado, setEquipoSeleccionado] = useState('');
  const [equipoQuery, setEquipoQuery] = useState('');
  const [equipoPickerOpen, setEquipoPickerOpen] = useState(false);
  const [obsAsignacion, setObsAsignacion] = useState('');
  const [fechaAsignacion, setFechaAsignacion] = useState<string>(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const getTodayYmd = () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };
  
  // Return State
  const [asignacionADevolver, setAsignacionADevolver] = useState<Asignacion | null>(null);
  const [obsDevolucion, setObsDevolucion] = useState('');
  const [estadoDevolucion, setEstadoDevolucion] = useState<EstadoEquipo>(EstadoEquipo.DISPONIBLE);

  // Print Acta State & Signatures
  const [actaData, setActaData] = useState<{asig: Asignacion, equipo: EquipoBiomedico, tipo: 'ENTREGA' | 'DEVOLUCION'} | null>(null);
  const [patientSignature, setPatientSignature] = useState<string | null>(null);
  const [adminSignature, setAdminSignature] = useState<string | null>(null);
  const [savingPatientSig, setSavingPatientSig] = useState(false);
  const [savingAdminSig, setSavingAdminSig] = useState(false);
  const actaViewportRef = useRef<HTMLDivElement>(null);
  const actaMeasureRef = useRef<HTMLDivElement>(null);
  const [actaPreviewScale, setActaPreviewScale] = useState(1);

  // Load Admin Signature from LocalStorage on mount
  useEffect(() => {
    if (!canManage) return;
    const savedSig = localStorage.getItem('biocontrol_admin_sig');
    if (savedSig) setAdminSignature(savedSig);
  }, [canManage]);

  useEffect(() => {
    setFirestoreError(null);

    const unsubPacientes = subscribePacientes(setPacientes, (e) => {
      console.error('Firestore subscribePacientes error:', e);
      setFirestoreError(`No tienes permisos para leer "pacientes" en Firestore. Detalle: ${e.message}`);
    });
    const unsubEquipos = subscribeEquipos(setEquipos, (e) => {
      console.error('Firestore subscribeEquipos error:', e);
      setFirestoreError(`No tienes permisos para leer "equipos" en Firestore. Detalle: ${e.message}`);
    });
    const unsubAsignaciones = subscribeAsignaciones(setAllAsignaciones, (e) => {
      console.error('Firestore subscribeAsignaciones error:', e);
      setFirestoreError(`No tienes permisos para leer "asignaciones" en Firestore. Detalle: ${e.message}`);
    });

    return () => {
      unsubPacientes();
      unsubEquipos();
      unsubAsignaciones();
    };
  }, []);

  const pacientesById = useMemo(() => new Map(pacientes.map((p) => [p.id, p])), [pacientes]);
  const equiposById = useMemo(() => new Map(equipos.map((e) => [e.id, e])), [equipos]);
  const activeAsignacionByEquipo = useMemo(() => {
    const map = new Map<string, Asignacion>();
    for (const a of allAsignaciones) {
      if (a.estado === EstadoAsignacion.ACTIVA) map.set(a.idEquipo, a);
    }
    return map;
  }, [allAsignaciones]);
  const lastFinalEstadoByEquipo = useMemo(() => {
    const map = new Map<string, { date: number; estadoFinal: EstadoEquipo }>();
    for (const a of allAsignaciones) {
      if (a.estado !== EstadoAsignacion.FINALIZADA) continue;
      if (!a.estadoFinalEquipo) continue;
      const date = new Date(a.fechaDevolucion || a.fechaAsignacion).getTime();
      const prev = map.get(a.idEquipo);
      if (!prev || date > prev.date) {
        map.set(a.idEquipo, { date, estadoFinal: a.estadoFinalEquipo as EstadoEquipo });
      }
    }
    return map;
  }, [allAsignaciones]);

  const equiposDisponibles = useMemo(() => {
    return equipos.filter((e) => {
      const active = activeAsignacionByEquipo.has(e.id);
      if (active) return false;
      const lastFinal = lastFinalEstadoByEquipo.get(e.id);
      const effective = lastFinal?.estadoFinal || e.estado;
      if (effective !== EstadoEquipo.DISPONIBLE) return false;

      // Control de actas internas (Legacy):
      // - Si disponibleParaEntrega no existe => se asume true (equipos antiguos).
      // - Si existe y es false => NO se puede entregar a pacientes.
      // - Si tiene acta interna pendiente => NO se puede entregar.
      const entregable = e.disponibleParaEntrega !== false && !e.actaInternaPendienteId;
      if (!entregable) return false;

      // Si hay múltiples auxiliares, cada uno solo puede entregar equipos que estén
      // bajo su custodia (o legacy sin custodioUid).
      if (canManage) {
        const custodioOk = !e.custodioUid || e.custodioUid === usuario?.id;
        if (!custodioOk) return false;
      }

      return true;
    });
  }, [equipos, activeAsignacionByEquipo, lastFinalEstadoByEquipo, canManage, usuario?.id]);

  const equiposDisponiblesFiltrados = useMemo(() => {
    const q = equipoQuery.trim().toLowerCase();
    if (!q) return [];
    const matches = equiposDisponibles.filter((e) => {
      return (
        (e.codigoInventario || '').toLowerCase().includes(q) ||
        (e.numeroSerie || '').toLowerCase().includes(q) ||
        (e.nombre || '').toLowerCase().includes(q)
      );
    });
    return matches.slice(0, 20);
  }, [equipoQuery, equiposDisponibles]);

  useEffect(() => {
    if (selectedPaciente) {
      const asigs = allAsignaciones.filter((a) => a.idPaciente === selectedPaciente.id);
      const enriched = asigs.map(a => ({
        ...a,
        nombreEquipo: equiposById.get(a.idEquipo)?.nombre || 'Equipo'
      }));
      setAsignaciones(enriched as any);
    }
  }, [selectedPaciente, allAsignaciones, equiposById]);

  // Auto-escalado para que el acta completa quepa en la vista previa (sin recortes ni scroll horizontal).
  useLayoutEffect(() => {
    if (!actaData) return;

    const viewport = actaViewportRef.current;
    const measure = actaMeasureRef.current;
    if (!viewport || !measure) return;

    const computeScale = () => {
      const rect = viewport.getBoundingClientRect();
      const style = getComputedStyle(viewport);
      const paddingX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      const paddingY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);

      const availableW = Math.max(0, rect.width - paddingX);
      const availableH = Math.max(0, rect.height - paddingY);

      const pageW = measure.offsetWidth;
      const pageH = measure.offsetHeight;

      if (!availableW || !availableH || !pageW || !pageH) return;

      // No agrandamos (máx 1). Solo reducimos si hace falta.
      const scale = Math.min(availableW / pageW, availableH / pageH, 1);
      setActaPreviewScale(Number(scale.toFixed(4)));
    };

    computeScale();

    const ro = new ResizeObserver(() => computeScale());
    ro.observe(viewport);
    ro.observe(measure);

    return () => ro.disconnect();
  }, [actaData]);

  // Filtro de Pacientes (Buscador)
  const filteredPacientes = pacientes.filter(p => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      p.nombreCompleto.toLowerCase().includes(term) ||
      p.numeroDocumento.includes(term) ||
      p.eps.toLowerCase().includes(term)
    );
  });

  const initials = (fullName: string) => {
    const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] || 'P';
    const last = (parts.length > 1 ? parts[parts.length - 1]?.[0] : '') || '';
    return (first + last).toUpperCase();
  };

  const handleSavePaciente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;

    const newPaciente: Paciente = {
      // Si existe ID, lo mantiene para editar. Si no, va vacío para crear.
      id: formData.id || '', 
      // Si existe consecutivo (edición), lo mantiene. Si no, 0 (el backend lo recalcula si es nuevo).
      consecutivo: formData.consecutivo || 0, 
      nombreCompleto: formData.nombreCompleto || '',
      tipoDocumento: formData.tipoDocumento as any || 'CC',
      numeroDocumento: formData.numeroDocumento || '',
      direccion: formData.direccion || '',
      eps: formData.eps || 'Particular',
      fechaInicioPrograma: formData.fechaInicioPrograma || new Date().toISOString(),
      horasPrestadas: formData.horasPrestadas || '', 
      tipoServicio: formData.tipoServicio || '',
      diagnostico: formData.diagnostico || '',
      telefono: formData.telefono || '',
      nombreFamiliar: formData.nombreFamiliar || '',
      telefonoFamiliar: formData.telefonoFamiliar || '',
      documentoFamiliar: formData.documentoFamiliar || '',
      parentescoFamiliar: formData.parentescoFamiliar || '',
      estado: formData.estado || EstadoPaciente.ACTIVO, 
    };

    try {
      await savePaciente(newPaciente);
      // Si estábamos editando, actualizamos el seleccionado
      if (formData.id && selectedPaciente && selectedPaciente.id === formData.id) {
          setSelectedPaciente(newPaciente);
          setViewMode('details');
      } else {
          setViewMode('list');
      }
    } catch (err: any) {
      console.error('Error guardando paciente:', err);
      alert(`${err?.code ? `${err.code}: ` : ''}${err?.message || 'No se pudo guardar el paciente.'}`); // Mostrar error de duplicado o sistema
    }
  };

  const handleEditPaciente = () => {
    if (!selectedPaciente) return;
    setFormData({ ...selectedPaciente });
    setViewMode('create');
  };

  const handleDownloadTemplate = () => {
    // Definir cabeceras del CSV
    const headers = [
      "NombreCompleto",
      "TipoDocumento",
      "NumeroDocumento",
      "Direccion",
      "TelefonoPaciente",
      "NombreFamiliar",
      "TelefonoFamiliar",
      "DocumentoFamiliar",
      "ParentescoFamiliar",
      "EPS",
      "FechaInicio (YYYY-MM-DD)",
      "HorasPrestadas (Texto)",
      "TipoServicio",
      "Diagnostico"
    ];

    // Datos de ejemplo
    const exampleRow = [
      "Pepito Perez",
      "CC",
      "123456789",
      "Calle 123 #45-67",
      "3001234567",
      "Maria Perez",
      "3109876543",
      "1090111222",
      "Esposa",
      "Salud Total",
      "2023-10-01",
      "12 Horas Diarias",
      "Domiciliario",
      "EPOC"
    ];

    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n" 
      + exampleRow.join(",");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "plantilla_pacientes_biocontrol.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Función para importar CSV
  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canManage) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      (async () => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.split('\n');
      // Ignorar cabecera (index 0)
      const dataLines = lines.slice(1).filter(line => line.trim() !== '');

      let successCount = 0;
      let errorCount = 0;
      let errorMessages: string[] = [];

      for (const [index, line] of dataLines.entries()) {
        const columns = line.split(','); 
        if (columns.length < 5) continue; 

        // Actualizado para nuevos campos
        const importedPaciente: Paciente = {
          id: '',
          consecutivo: 0,
          nombreCompleto: columns[0]?.trim() || 'Sin Nombre',
          tipoDocumento: (columns[1]?.trim() as any) || 'CC',
          numeroDocumento: columns[2]?.trim() || '',
          direccion: columns[3]?.trim() || '',
          telefono: columns[4]?.trim() || '',
          nombreFamiliar: columns[5]?.trim() || '',
          telefonoFamiliar: columns[6]?.trim() || '',
          documentoFamiliar: columns[7]?.trim() || '',
          parentescoFamiliar: columns[8]?.trim() || '',
          eps: (columns[9]?.trim() as EPS) || 'Particular',
          fechaInicioPrograma: columns[10]?.trim() ? new Date(columns[10].trim()).toISOString() : new Date().toISOString(),
          horasPrestadas: columns[11]?.trim() || '',
          tipoServicio: columns[12]?.trim() || '',
          diagnostico: columns[13]?.trim() || '',
          estado: EstadoPaciente.ACTIVO
        };

        try {
          if (!importedPaciente.numeroDocumento || !importedPaciente.nombreCompleto) {
            throw new Error(`Fila ${index + 2}: Falta documento o nombre`);
          }
          await savePaciente(importedPaciente);
          successCount++;
        } catch (err: any) {
          errorCount++;
          errorMessages.push(`Fila ${index + 2} (${importedPaciente.nombreCompleto}): ${err.message}`);
        }
      }

      let message = `Proceso completado.\n\nImportados exitosamente: ${successCount}\nFallidos: ${errorCount}`;
      if (errorCount > 0) {
        message += `\n\nErrores:\n${errorMessages.slice(0, 5).join('\n')}${errorMessages.length > 5 ? '\n...' : ''}`;
      }
      alert(message);
      if (fileInputRef.current) fileInputRef.current.value = ''; 
      })().catch((err) => alert(err?.message || 'Error importando CSV'));
    };
    reader.readAsText(file);
  };

  const handleAsignar = async () => {
    if (!selectedPaciente || !equipoSeleccionado || !canManage) return;
    if (!fechaAsignacion) {
      alert('Selecciona la fecha de asignación antes de continuar.');
      return;
    }
    try {
      const isoFromDate = (dateStr: string) => {
        // Usamos mediodía local para evitar problemas de zona horaria al convertir a ISO.
        // Ej: "2025-01-01T12:00:00" -> ISO UTC, mantiene el mismo día para reportes mensuales.
        const d = new Date(`${dateStr}T12:00:00`);
        return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
      };

      const equipo = equiposById.get(equipoSeleccionado);
      const nuevaAsignacion = await asignarEquipo({
        idPaciente: selectedPaciente.id,
        idEquipo: equipoSeleccionado,
        observacionesEntrega: obsAsignacion,
        usuarioAsigna: usuario?.nombre || 'Admin',
        firmaAuxiliar: adminSignature || undefined,
        fechaAsignacionIso: isoFromDate(fechaAsignacion),
      });
      alert(
        `Asignación exitosa.\n\nACTA DE ENTREGA N° ${nuevaAsignacion.consecutivo}\nPaciente: ${selectedPaciente.nombreCompleto}`,
      );
      setObsAsignacion('');
      setEquipoSeleccionado('');
      setEquipoQuery('');
      setEquipoPickerOpen(false);

      // Abrir automáticamente la vista previa del acta para firmar (flujo "Asignar y Firmar").
      if (equipo) {
        setActaData({ asig: nuevaAsignacion, equipo, tipo: 'ENTREGA' });
        setPatientSignature(null);
      }
    } catch (err: any) {
      console.error('Error asignando equipo:', err);
      alert(`${err?.code ? `${err.code}: ` : ''}${err?.message || 'No se pudo asignar el equipo.'}`);
    }
  };

  const handleDevolucion = async () => {
    if (!asignacionADevolver || !canManage) return;
    try {
      await devolverEquipo({
        idAsignacion: asignacionADevolver.id,
        observacionesDevolucion: obsDevolucion,
        estadoFinalEquipo: estadoDevolucion,
      });
      alert('Equipo devuelto. Acta de devolución generada y almacenada en historial.');
      setAsignacionADevolver(null);
      setObsDevolucion('');
    } catch (err: any) {
      console.error('Error registrando devolución:', err);
      alert(`${err?.code ? `${err.code}: ` : ''}${err?.message || 'No se pudo registrar la devolución.'}`);
    }
  };

  const handleSalidaPaciente = async () => {
    if (!selectedPaciente || !canManage) return;
    let success = false;
    try {
      success = await validarSalidaPaciente(selectedPaciente.id);
    } catch (err: any) {
      console.error('Error registrando salida:', err);
      alert(`${err?.code ? `${err.code}: ` : ''}${err?.message || 'No se pudo registrar la salida.'}`);
      return;
    }
    if (!success) {
      alert("No se puede dar salida: El paciente tiene equipos asignados pendientes de devolución.");
    } else {
      alert("Salida registrada exitosamente.");
      setViewMode('list');
    }
  };

  const handleVerActa = (asig: Asignacion, tipo: 'ENTREGA' | 'DEVOLUCION') => {
    const equipo = equiposById.get(asig.idEquipo);
    
    if (equipo) {
      setActaData({ asig, equipo, tipo });
      const savedSig = tipo === 'ENTREGA' ? asig.firmaPacienteEntrega : asig.firmaPacienteDevolucion;
      setPatientSignature(savedSig || null);
      if (asig.firmaAuxiliar) setAdminSignature(asig.firmaAuxiliar);
    }
  };

  const handleGuardarFirmaPaciente = async () => {
    if (!canManage) return;
    if (!actaData) return;

    setSavingPatientSig(true);
    try {
      await guardarFirmaPaciente({
        idAsignacion: actaData.asig.id,
        tipoActa: actaData.tipo,
        dataUrl: patientSignature,
      });
      alert('Firma del paciente/familiar guardada correctamente.');
    } catch (err: any) {
      console.error('Error guardando firma paciente:', err);
      alert(`${err?.code ? `${err.code}: ` : ''}${err?.message || 'No se pudo guardar la firma del paciente/familiar.'}`);
    } finally {
      setSavingPatientSig(false);
    }
  };

  const handleGuardarFirmaAuxiliar = async () => {
    if (!canManage) return;
    if (!actaData) return;
    if (!adminSignature) return;
    if (actaData.asig.firmaAuxiliar) return;

    setSavingAdminSig(true);
    try {
      await guardarFirmaAuxiliar({ idAsignacion: actaData.asig.id, dataUrl: adminSignature });
      setActaData((prev) => {
        if (!prev) return prev;
        return { ...prev, asig: { ...prev.asig, firmaAuxiliar: adminSignature } };
      });
      alert('Firma del auxiliar guardada correctamente.');
    } catch (err: any) {
      console.error('Error guardando firma auxiliar:', err);
      alert(`${err?.code ? `${err.code}: ` : ''}${err?.message || 'No se pudo guardar la firma del auxiliar.'}`);
    } finally {
      setSavingAdminSig(false);
    }
  };

  const handleAdminSigUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canManage) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const res = evt.target?.result as string;
      setAdminSignature(res);
      localStorage.setItem('biocontrol_admin_sig', res);

      // Si estamos en una acta y aún no hay firma guardada para esta asignación, la persistimos en Firestore.
      if (actaData && !actaData.asig.firmaAuxiliar) {
        try {
          await guardarFirmaAuxiliar({ idAsignacion: actaData.asig.id, dataUrl: res });
          setActaData((prev) => {
            if (!prev) return prev;
            return { ...prev, asig: { ...prev.asig, firmaAuxiliar: res } };
          });
        } catch (err: any) {
          console.error('Error guardando firma auxiliar (upload):', err);
          alert(
            `${err?.code ? `${err.code}: ` : ''}${
              err?.message || 'No se pudo guardar la firma del auxiliar en Firestore.'
            }`,
          );
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePrint = () => {
    const actaEl = document.querySelector('#acta-print-container .acta-page') as HTMLElement | null;
    if (!actaEl) {
      window.print();
      return;
    }

    // Creamos un contenedor dedicado para impresión (fuera del modal/flex), para evitar offsets/escala en el PDF.
    const existing = document.getElementById('acta-print-root');
    existing?.remove();

    const printRoot = document.createElement('div');
    printRoot.id = 'acta-print-root';
    printRoot.appendChild(actaEl.cloneNode(true));
    document.body.appendChild(printRoot);
    document.body.classList.add('printing-acta');

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      document.body.classList.remove('printing-acta');
      printRoot.remove();
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup);
    window.print();

    // Fallback (hay navegadores que no disparan afterprint al guardar como PDF)
    setTimeout(cleanup, 2000);
  };

  // --- RENDERS ---

  if (viewMode === 'create') {
    if (!canManage) {
        setViewMode('list');
        return null;
    }
    const isEditing = !!formData.id;

    return (
      <Layout title={isEditing ? "Editar Paciente" : "Registrar Paciente"}>
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-6 border-b pb-4">
             <h3 className="text-xl font-bold text-gray-800">
               {isEditing ? `Editando Ficha: ${formData.nombreCompleto}` : "Ficha de Ingreso"}
             </h3>
             <span className={`text-sm px-3 py-1 rounded-full border ${isEditing ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
               {isEditing ? `ID: ${String(formData.consecutivo).padStart(3, '0')}` : "ID Generado Automáticamente"}
             </span>
          </div>
          
          <form onSubmit={handleSavePaciente} className="space-y-6">
            
            {/* Sección Personal */}
            <div>
              <h4 className="text-sm uppercase tracking-wide text-gray-500 font-bold mb-3">Datos Personales</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Nombre Completo</label>
                  <input required className="w-full border p-2.5 rounded-md focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ej: Juan Carlos Pérez Gómez" value={formData.nombreCompleto || ''} onChange={e => setFormData({...formData, nombreCompleto: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Tipo Documento</label>
                  <select className="w-full border p-2.5 rounded-md" value={formData.tipoDocumento || 'CC'} onChange={e => setFormData({...formData, tipoDocumento: e.target.value as any})}>
                    <option value="CC">Cédula de Ciudadanía</option>
                    <option value="TI">Tarjeta Identidad</option>
                    <option value="CE">Cédula Extranjería</option>
                    <option value="RC">Registro Civil</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Número de Identificación</label>
                  <input required className="w-full border p-2.5 rounded-md" value={formData.numeroDocumento || ''} onChange={e => setFormData({...formData, numeroDocumento: e.target.value})} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Dirección de Residencia</label>
                  <input required className="w-full border p-2.5 rounded-md" placeholder="Ej: Calle 100 # 20-30 Apto 201" value={formData.direccion || ''} onChange={e => setFormData({...formData, direccion: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Teléfono Paciente</label>
                  <input required className="w-full border p-2.5 rounded-md" value={formData.telefono || ''} onChange={e => setFormData({...formData, telefono: e.target.value})} />
                </div>
              </div>
            </div>

            {/* Sección Contacto Familiar */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h4 className="text-sm uppercase tracking-wide text-gray-700 font-bold mb-3">Contacto Familiar / Acudiente</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Nombre Familiar</label>
                  <input required className="w-full border p-2.5 rounded-md bg-white" placeholder="Ej: Maria Perez" value={formData.nombreFamiliar || ''} onChange={e => setFormData({...formData, nombreFamiliar: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Teléfono Familiar</label>
                  <input required className="w-full border p-2.5 rounded-md bg-white" placeholder="Ej: 310..." value={formData.telefonoFamiliar || ''} onChange={e => setFormData({...formData, telefonoFamiliar: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Documento Familiar</label>
                  <input required className="w-full border p-2.5 rounded-md bg-white" placeholder="Ej: 1098..." value={formData.documentoFamiliar || ''} onChange={e => setFormData({...formData, documentoFamiliar: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Parentesco</label>
                  <input required className="w-full border p-2.5 rounded-md bg-white" placeholder="Ej: Esposa, Hijo, Madre..." value={formData.parentescoFamiliar || ''} onChange={e => setFormData({...formData, parentescoFamiliar: e.target.value})} />
                </div>
              </div>
            </div>

            {/* Sección Administrativa / Clínica */}
            <div>
              <h4 className="text-sm uppercase tracking-wide text-gray-500 font-bold mb-3 mt-4">Información del Programa</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700">EPS</label>
                  <select required className="w-full border p-2.5 rounded-md" value={formData.eps || ''} onChange={e => setFormData({...formData, eps: e.target.value as EPS})}>
                    <option value="">-- Seleccione EPS --</option>
                    <option value="Nueva Eps">Nueva Eps</option>
                    <option value="Salud Total">Salud Total</option>
                    <option value="Fomag">Fomag</option>
                    <option value="Particular">Particular</option>
                    <option value="Seguros Bolivar">Seguros Bolivar</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Fecha de Inicio del Programa</label>
                  <input type="date" required className="w-full border p-2.5 rounded-md" value={formData.fechaInicioPrograma ? formData.fechaInicioPrograma.substring(0, 10) : ''} onChange={e => setFormData({...formData, fechaInicioPrograma: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Horas Prestadas (Detalle)</label>
                  <input type="text" required className="w-full border p-2.5 rounded-md" placeholder="Ej: 12 Horas, Internación..." value={formData.horasPrestadas || ''} onChange={e => setFormData({...formData, horasPrestadas: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Tipo de Servicio</label>
                  <input placeholder="Ej: Domiciliario, Cuidado Crónico..." className="w-full border p-2.5 rounded-md" value={formData.tipoServicio || ''} onChange={e => setFormData({...formData, tipoServicio: e.target.value})} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Diagnóstico</label>
                  <textarea rows={2} className="w-full border p-2.5 rounded-md" value={formData.diagnostico || ''} onChange={e => setFormData({...formData, diagnostico: e.target.value})} />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t mt-6">
              <button type="button" onClick={() => { setViewMode(isEditing ? 'details' : 'list'); setFormData({}); }} className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 font-medium">Cancelar</button>
              <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium shadow-sm">{isEditing ? 'Guardar Cambios' : 'Guardar Paciente'}</button>
            </div>
          </form>
        </div>
      </Layout>
    );
  }

  if (viewMode === 'details' && selectedPaciente) {
    return (
      <Layout title={`Detalle: ${selectedPaciente.nombreCompleto}`}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Info Paciente */}
          <div className="bg-white p-6 rounded-lg shadow h-fit">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-bold">{selectedPaciente.nombreCompleto}</h3>
                <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">ID: {String(selectedPaciente.consecutivo).padStart(3, '0')}</span>
              </div>
              <StatusBadge status={selectedPaciente.estado} />
            </div>
            
            <div className="space-y-4 text-sm mt-4">
                <div className="bg-blue-50 p-3 rounded border border-blue-100">
                    <p className="text-blue-900 font-semibold mb-1">Información Clínica</p>
                    <p><strong>EPS:</strong> {selectedPaciente.eps}</p>
                    <p><strong>Diagnóstico:</strong> {selectedPaciente.diagnostico}</p>
                    <p><strong>Servicio:</strong> {selectedPaciente.tipoServicio}</p>
                    <p><strong>Horas:</strong> {selectedPaciente.horasPrestadas}</p>
                </div>

                <div className="bg-gray-50 p-3 rounded border border-gray-200">
                    <p className="text-gray-800 font-semibold mb-1">Contacto Familiar</p>
                    <p><strong>Familiar:</strong> {selectedPaciente.nombreFamiliar}</p>
                    <p><strong>Teléfono:</strong> {selectedPaciente.telefonoFamiliar}</p>
                    <p><strong>Doc:</strong> {selectedPaciente.documentoFamiliar || 'N/A'}</p>
                    <p><strong>Parentesco:</strong> {selectedPaciente.parentescoFamiliar || 'N/A'}</p>
                </div>
                
                <div>
                    <p><strong>Identificación:</strong> {selectedPaciente.tipoDocumento} {selectedPaciente.numeroDocumento}</p>
                    <p><strong>Dirección:</strong> {selectedPaciente.direccion}</p>
                    <p><strong>Tel. Paciente:</strong> {selectedPaciente.telefono}</p>
                    <p><strong>Fecha Inicio:</strong> {new Date(selectedPaciente.fechaInicioPrograma).toLocaleDateString()}</p>
                    {selectedPaciente.fechaSalida && <p><strong>Salida:</strong> {new Date(selectedPaciente.fechaSalida).toLocaleDateString()}</p>}
                </div>
            </div>

            <div className="mt-6 flex flex-col gap-2">
                {selectedPaciente.estado === EstadoPaciente.ACTIVO && canManage && (
                <>
                    <button 
                        onClick={handleEditPaciente}
                        className="w-full py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded hover:bg-amber-100 font-medium flex items-center justify-center"
                    >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        Editar Información
                    </button>
                    <button 
                        onClick={handleSalidaPaciente} 
                        className="w-full py-2 bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100 font-medium"
                    >
                        Registrar Salida (Egreso)
                    </button>
                </>
                )}
                <button onClick={() => setViewMode('list')} className="w-full py-2 text-gray-600 hover:text-gray-900 border rounded">
                &larr; Volver al listado
                </button>
            </div>
          </div>

          {/* Asignaciones (Código idéntico, solo cambia referencia a nombres) */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Formulario Asignación - SOLO ADMIN */}
            {selectedPaciente.estado === EstadoPaciente.ACTIVO && canManage && (
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-md font-bold mb-4">Nueva Asignación de Equipo</h3>
                <div className="flex flex-col gap-4">
	                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
	                    <div className="md:col-span-1">
	                      <label className="block text-sm font-medium text-gray-700">Fecha de actualización</label>
	                      <input
	                        type="date"
	                        className="mt-1 w-full border p-2 rounded bg-gray-50 text-gray-700"
	                        value={getTodayYmd()}
	                        disabled
	                      />
	                      <p className="text-xs text-gray-500 mt-1">
	                        Se asigna automáticamente al crear el acta en el sistema.
	                      </p>
	                    </div>

	                    <div className="md:col-span-1">
	                      <label className="block text-sm font-medium text-gray-700">Fecha de entrega original</label>
	                      <input
	                        type="date"
	                        className="mt-1 w-full border p-2 rounded"
	                        value={fechaAsignacion}
	                        onChange={(e) => setFechaAsignacion(e.target.value)}
	                      />
	                      <p className="text-xs text-gray-500 mt-1">
	                        Diligencia manualmente la fecha real de entrega (útil para entregas antiguas).
	                      </p>
	                    </div>

	                    <div className="md:col-span-2">
	                      <label className="block text-sm font-medium text-gray-700">Buscar equipo (MBG o serie)</label>
	                      <div className="relative">
                        <input
                          className="mt-1 w-full border p-2 rounded"
                          placeholder="Ej: MBG-015 o 250103654"
                          value={equipoQuery}
                          onChange={(e) => {
                            setEquipoQuery(e.target.value);
                            setEquipoPickerOpen(true);
                            setEquipoSeleccionado('');
                          }}
                          onFocus={() => setEquipoPickerOpen(true)}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            const q = equipoQuery.trim().toLowerCase();
                            if (!q) return;
                            const matches = equiposDisponibles.filter((eq) => {
                              return (
                                (eq.codigoInventario || '').toLowerCase() === q ||
                                (eq.numeroSerie || '').toLowerCase() === q
                              );
                            });
                            if (matches.length === 1) {
                              const chosen = matches[0];
                              setEquipoSeleccionado(chosen.id);
                              setEquipoQuery(
                                `${chosen.codigoInventario || ''} • ${chosen.numeroSerie || ''} • ${chosen.nombre}`,
                              );
                              setEquipoPickerOpen(false);
                            }
                          }}
                        />

                        {equipoPickerOpen && equipoQuery.trim() && (
                          <div className="absolute z-10 mt-1 w-full bg-white border rounded shadow max-h-64 overflow-y-auto">
                            {equiposDisponiblesFiltrados.length === 0 ? (
                              <div className="p-3 text-sm text-gray-500">
                                No hay equipos disponibles que coincidan.
                              </div>
                            ) : (
                              <ul className="divide-y">
                                {equiposDisponiblesFiltrados.map((eq) => (
                                  <li key={eq.id}>
                                    <button
                                      type="button"
                                      className="w-full text-left p-3 hover:bg-gray-50"
                                      onClick={() => {
                                        setEquipoSeleccionado(eq.id);
                                        setEquipoQuery(
                                          `${eq.codigoInventario || ''} • ${eq.numeroSerie || ''} • ${eq.nombre}`,
                                        );
                                        setEquipoPickerOpen(false);
                                      }}
                                    >
                                      <div className="text-sm font-semibold text-gray-900">
                                        {eq.nombre}{' '}
                                        <span className="font-mono text-xs text-gray-600">
                                          {eq.codigoInventario}
                                        </span>
                                      </div>
                                      <div className="text-xs text-gray-600">
                                        Serie: <span className="font-mono">{eq.numeroSerie}</span> • {eq.marca}{' '}
                                        {eq.modelo ? `• ${eq.modelo}` : ''}
                                      </div>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>

                      {equipoSeleccionado && (
                        <div className="mt-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            Equipo seleccionado:{' '}
                            <span className="font-semibold">
                              {equiposById.get(equipoSeleccionado)?.codigoInventario}
                            </span>{' '}
                            <span className="text-gray-600">
                              ({equiposById.get(equipoSeleccionado)?.numeroSerie})
                            </span>
                          </div>
                          <button
                            type="button"
                            className="text-gray-700 hover:underline"
                            onClick={() => {
                              setEquipoSeleccionado('');
                              setEquipoQuery('');
                              setEquipoPickerOpen(false);
                            }}
                          >
                            Limpiar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row gap-4">
                    <input
                      placeholder="Observaciones iniciales..."
                      className="border p-2 rounded flex-1"
                      value={obsAsignacion}
                      onChange={(e) => setObsAsignacion(e.target.value)}
                    />
                    <button
                      onClick={handleAsignar}
                      disabled={!equipoSeleccionado || !fechaAsignacion}
                      className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
                    >
                      Asignar y Firmar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Listado Histórico */}
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-md font-bold mb-4">Equipos Asignados</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="p-2">Acta #</th>
                      <th className="p-2">Equipo</th>
                      <th className="p-2">Fecha Asignación</th>
                      <th className="p-2">Estado</th>
                      <th className="p-2">Acción</th>
                      <th className="p-2">Documentos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {asignaciones.map((asig: any) => (
                      <tr key={asig.id}>
                        <td className="p-2 font-mono text-xs font-bold text-gray-600">
                          {asig.consecutivo ? String(asig.consecutivo).padStart(4, '0') : 'N/A'}
                        </td>
                        <td className="p-2">{asig.nombreEquipo}</td>
                        <td className="p-2">{new Date(asig.fechaAsignacion).toLocaleDateString()}</td>
                        <td className="p-2"><StatusBadge status={asig.estado} /></td>
                        <td className="p-2">
                          {asig.estado === EstadoAsignacion.ACTIVA && canManage && (
                            <button 
                              onClick={() => setAsignacionADevolver(asig)}
                              className="text-blue-600 hover:underline"
                            >
                              Devolver
                            </button>
                          )}
                        </td>
                        <td className="p-2 flex gap-2">
                            {/* Botón Ver Acta Entrega */}
                            <button 
                                onClick={() => handleVerActa(asig, 'ENTREGA')}
                                className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded border border-indigo-200"
                                title="Ver Acta de Entrega"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                <span className="text-xs">Entrega</span>
                            </button>
                            
                            {/* Botón Ver Acta Devolución (Solo si está finalizada) */}
                            {asig.estado === EstadoAsignacion.FINALIZADA && (
                                <button 
                                    onClick={() => handleVerActa(asig, 'DEVOLUCION')}
                                    className="text-orange-600 hover:text-orange-800 flex items-center gap-1 bg-orange-50 px-2 py-1 rounded border border-orange-200"
                                    title="Ver Acta de Devolución"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    <span className="text-xs">Devolución</span>
                                </button>
                            )}
                        </td>
                      </tr>
                    ))}
                    {asignaciones.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-gray-500">Sin asignaciones.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Devolución */}
        {asignacionADevolver && canManage && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg max-w-md w-full">
              <h3 className="text-lg font-bold mb-4">Registrar Devolución</h3>
              <p className="text-sm text-gray-600 mb-4">
                Equipo: {asignacionADevolver && (asignacionADevolver as any).nombreEquipo}
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium">Estado del equipo al recibir:</label>
                  <select 
                    className="w-full border p-2 rounded" 
                    value={estadoDevolucion}
                    onChange={(e) => setEstadoDevolucion(e.target.value as EstadoEquipo)}
                  >
                    <option value={EstadoEquipo.DISPONIBLE}>Disponible (Buen estado)</option>
                    <option value={EstadoEquipo.MANTENIMIENTO}>Requiere Mantenimiento</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium">Observaciones:</label>
                  <textarea 
                    className="w-full border p-2 rounded" 
                    rows={3}
                    value={obsDevolucion}
                    onChange={e => setObsDevolucion(e.target.value)}
                  ></textarea>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setAsignacionADevolver(null)} className="px-4 py-2 border rounded">Cancelar</button>
                  <button onClick={handleDevolucion} className="px-4 py-2 bg-green-600 text-white rounded">Confirmar Devolución</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal Vista Previa de Acta (Para Imprimir y Firmar) */}
        {actaData && selectedPaciente && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 overflow-y-auto">
             <div className="relative bg-white w-full max-w-5xl my-4 rounded shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 flex-shrink-0">
                    <div>
                        <h3 className="font-bold text-gray-800">Vista Previa: Acta de {actaData.tipo.toLowerCase()}</h3>
                        <p className="text-xs text-gray-500">Configure las firmas antes de imprimir.</p>
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setActaData(null)}
                            className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-white"
                        >
                            Cerrar
                        </button>
                        <button 
                            onClick={handlePrint}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center font-bold shadow"
                        >
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                            Imprimir / Guardar PDF
                        </button>
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Panel de Firmas (Sidebar) */}
                    <div className="w-80 bg-gray-50 border-r border-gray-200 p-4 overflow-y-auto no-print">
                        <h4 className="font-bold text-gray-700 mb-4 border-b pb-2">Configurar Firmas</h4>
                        
	                        {/* Firma Paciente */}
	                        <div className="mb-6">
	                            <label className="block text-sm font-medium text-gray-600 mb-2">Firma Paciente/Familiar</label>
	                            {(() => {
	                              const savedSig =
	                                actaData.tipo === 'ENTREGA'
	                                  ? actaData.asig.firmaPacienteEntrega
	                                  : actaData.asig.firmaPacienteDevolucion;
	                              const locked = !!savedSig;

	                              return (
	                                <>
	                                  <div className="bg-white">
	                                    {locked ? (
	                                      <div className="border border-gray-300 rounded bg-white p-2">
	                                        <img
	                                          src={savedSig}
	                                          alt="Firma guardada del paciente/familiar"
	                                          className="w-full h-40 object-contain"
	                                        />
	                                      </div>
	                                    ) : canManage ? (
	                                      <SignaturePad onEnd={setPatientSignature} />
	                                    ) : (
	                                      <div className="border border-gray-300 rounded bg-white p-4 text-center text-sm text-gray-500">
	                                        Sin firma registrada.
	                                        <div className="text-xs text-gray-400 mt-1">
	                                          Solo el rol AUXILIAR_ADMINISTRATIVA puede registrar/guardar firmas.
	                                        </div>
	                                      </div>
	                                    )}
	                                  </div>

                                  <p className="text-xs text-gray-400 mt-1">
                                    {locked
                                      ? 'Esta acta ya tiene firma registrada. Por control, la firma no se puede modificar.'
                                      : 'El paciente puede firmar usando el mouse o el dedo en pantallas táctiles.'}
                                  </p>

	                                  {!locked && canManage && (
	                                    <>
	                                      <div className="mt-3 flex gap-2">
	                                        <button
	                                          type="button"
	                                          onClick={handleGuardarFirmaPaciente}
                                          disabled={savingPatientSig || !patientSignature}
                                          className="flex-1 bg-blue-600 text-white px-3 py-2 rounded text-sm disabled:opacity-60"
                                          title={
                                            !patientSignature
                                              ? 'Firme primero para habilitar el guardado'
                                              : 'Guardar la firma en Firestore para esta acta'
                                          }
                                        >
                                          {savingPatientSig ? 'Guardando...' : 'Guardar firma'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setPatientSignature(null)}
                                          className="px-3 py-2 rounded text-sm border border-gray-300 text-gray-700 hover:bg-white"
                                        >
                                          Limpiar
                                        </button>
                                      </div>
                                      <p className="text-[11px] text-gray-500 mt-2">
                                        La firma se guarda en Firestore dentro de la asignación (
                                        {actaData.tipo === 'ENTREGA' ? 'firmaPacienteEntrega' : 'firmaPacienteDevolucion'}).
                                      </p>
                                    </>
	                                  )}
	                                </>
	                              );
	                            })()}
	                        </div>

	                        {/* Firma Admin */}
	                        <div className="mb-6">
	                            <label className="block text-sm font-medium text-gray-600 mb-2">Firma Auxiliar Admin</label>

	                            {(() => {
	                              const savedAdminSig = actaData.asig.firmaAuxiliar || null;
	                              const locked = !!savedAdminSig;
	                              const effectiveAdminSig = locked ? savedAdminSig : canManage ? adminSignature : null;

	                              return (
	                                <>
	                                  {effectiveAdminSig ? (
	                                    <div className="mb-2 bg-white p-2 border rounded relative">
	                                      <img
	                                        src={effectiveAdminSig}
	                                        className="h-16 mx-auto object-contain"
	                                        alt="Firma Auxiliar"
	                                      />
	                                      {canManage && !locked && (
	                                        <button
	                                          onClick={() => {
	                                            setAdminSignature(null);
	                                            localStorage.removeItem('biocontrol_admin_sig');
	                                          }}
	                                          className="absolute top-0 right-0 bg-red-100 text-red-600 p-1 rounded-bl text-xs"
	                                        >
	                                          ✕
	                                        </button>
	                                      )}
	                                    </div>
	                                  ) : (
	                                    <div className="mb-2 border border-gray-300 rounded bg-white p-3 text-center text-sm text-gray-500">
	                                      Sin firma digital registrada.
	                                    </div>
	                                  )}

	                                  {locked ? (
	                                    <p className="text-xs text-gray-400 mt-1">
	                                      Esta acta ya tiene firma del auxiliar registrada. Por control, no se puede modificar.
	                                    </p>
	                                  ) : canManage ? (
	                                    <>
	                                      <div className="border-2 border-dashed border-gray-300 rounded p-4 text-center hover:bg-white transition-colors cursor-pointer relative">
	                                        <input
	                                          type="file"
	                                          accept="image/*"
	                                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
	                                          onChange={handleAdminSigUpload}
	                                        />
	                                        <svg
	                                          className="w-8 h-8 mx-auto text-gray-400 mb-1"
	                                          fill="none"
	                                          stroke="currentColor"
	                                          viewBox="0 0 24 24"
	                                        >
	                                          <path
	                                            strokeLinecap="round"
	                                            strokeLinejoin="round"
	                                            strokeWidth={2}
	                                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
	                                          />
	                                        </svg>
	                                        <span className="text-xs text-gray-500">Cargar imagen de firma</span>
	                                      </div>

	                                      {adminSignature && !savedAdminSig && (
	                                        <div className="mt-3 flex gap-2">
	                                          <button
	                                            type="button"
	                                            onClick={handleGuardarFirmaAuxiliar}
	                                            disabled={savingAdminSig}
	                                            className="flex-1 bg-blue-600 text-white px-3 py-2 rounded text-sm disabled:opacity-60"
	                                            title="Guardar la firma del auxiliar en Firestore para esta asignación"
	                                          >
	                                            {savingAdminSig ? 'Guardando...' : 'Guardar firma'}
	                                          </button>
	                                        </div>
	                                      )}

	                                      <p className="text-xs text-gray-400 mt-1">
	                                        Cargue una imagen (PNG/JPG) con la firma escaneada. Se guardará en Firestore para el acta
	                                        y también en este dispositivo para futuras actas.
	                                      </p>
	                                    </>
	                                  ) : (
	                                    <p className="text-xs text-gray-400 mt-1">
	                                      Solo el rol AUXILIAR_ADMINISTRATIVA puede registrar/guardar esta firma.
	                                    </p>
	                                  )}
	                                </>
	                              );
	                            })()}
	                        </div>

                        <div className="bg-blue-50 p-3 rounded text-xs text-blue-800 border border-blue-100">
                            <strong>Nota:</strong> Las firmas se insertarán automáticamente en los recuadros correspondientes del formato al imprimir.
                        </div>
                    </div>

                    {/* Vista Previa del Acta */}
                    <div className="flex-1 overflow-hidden bg-gray-200">
                        <div
                          ref={actaViewportRef}
                          className="w-full h-full p-4 flex justify-center items-start overflow-hidden"
                        >
                          <div
                            className="transition-transform"
                            style={{ transform: `scale(${actaPreviewScale})`, transformOrigin: 'top center' }}
                          >
                            <div id="acta-print-container" ref={actaMeasureRef} className="bg-white shadow-lg">
	                              <ActaFormat 
	                                  paciente={selectedPaciente}
	                                  equipo={actaData.equipo}
	                                  asignacion={actaData.asig}
	                                  tipoActa={actaData.tipo}
	                                  patientSignature={patientSignature}
	                                  adminSignature={
	                                    actaData.asig.firmaAuxiliar ? actaData.asig.firmaAuxiliar : canManage ? adminSignature : null
	                                  }
	                              />
	                            </div>
	                          </div>
	                        </div>
                    </div>
                </div>
             </div>
          </div>
        )}
      </Layout>
    );
  }

  // Lista por defecto
  return (
    <Layout title="Gestión de Pacientes">
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
              placeholder="Buscar por nombre, EPS o documento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        {canManage && (
          <div className="flex flex-wrap gap-2">
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
              Importar CSV
            </button>
            <button 
              onClick={handleDownloadTemplate}
              className="md-btn md-btn-outlined"
              title="Descargar formato CSV para llenado masivo"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Plantilla CSV
            </button>
            <button 
              onClick={() => { setFormData({}); setViewMode('create'); }}
              className="md-btn md-btn-filled"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Nuevo Paciente
            </button>
          </div>
        )}
      </div>

      {/* Mobile list (cards) */}
      <div className="md:hidden space-y-3">
        {filteredPacientes.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => { setSelectedPaciente(p); setViewMode('details'); }}
            className="md-card w-full p-4 text-left"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0"
                  style={{ background: 'rgba(37,99,235,0.12)', color: 'var(--md-primary)' }}
                >
                  {initials(p.nombreCompleto)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded border border-gray-200 text-gray-600">
                      {String(p.consecutivo).padStart(3, '0')}
                    </span>
                    <StatusBadge status={p.estado} />
                  </div>
                  <div className="mt-2 font-semibold text-gray-900 truncate">{p.nombreCompleto}</div>
                  <div className="text-sm text-gray-500 truncate">{p.tipoDocumento} {p.numeroDocumento}</div>
                </div>
              </div>

              <svg className="w-5 h-5 text-gray-400 flex-shrink-0 mt-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </div>

            <div className="mt-3 text-sm text-gray-600">
              <div className="font-semibold text-blue-700">{p.eps}</div>
              <div className="text-xs text-gray-500">
                {p.tipoServicio} {p.horasPrestadas ? `(${p.horasPrestadas})` : ''}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                Inicio: {new Date(p.fechaInicioPrograma).toLocaleDateString()}
              </div>
              <div className="mt-2 text-sm font-semibold text-blue-600">
                {canManage ? 'Gestionar' : 'Ver Detalles'}
              </div>
            </div>
          </button>
        ))}

        {filteredPacientes.length === 0 && (
          <div className="md-card p-6 text-center text-gray-500">
            No se encontraron pacientes que coincidan con la búsqueda.
          </div>
        )}
      </div>

      {/* Desktop/tablet table */}
      <div className="hidden md:block md-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Paciente / Doc</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">EPS / Servicio</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Inicio</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredPacientes.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-600">
                    {String(p.consecutivo).padStart(3, '0')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div
                        className="h-9 w-9 rounded-full flex items-center justify-center font-bold text-xs"
                        style={{ background: 'rgba(37,99,235,0.12)', color: 'var(--md-primary)' }}
                      >
                        {initials(p.nombreCompleto)}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">{p.nombreCompleto}</div>
                        <div className="text-sm text-gray-500">{p.tipoDocumento} {p.numeroDocumento}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="font-semibold text-blue-700">{p.eps}</div>
                    <div className="text-xs">{p.tipoServicio} ({p.horasPrestadas})</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={p.estado} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(p.fechaInicioPrograma).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => { setSelectedPaciente(p); setViewMode('details'); }}
                      className="text-blue-600 hover:text-blue-900 font-semibold"
                    >
                      {canManage ? 'Gestionar' : 'Ver Detalles'}
                    </button>
                  </td>
                </tr>
              ))}
              {filteredPacientes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    No se encontraron pacientes que coincidan con la búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
};

export default Patients;
