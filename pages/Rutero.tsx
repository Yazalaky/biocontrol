import React, { useMemo, useRef, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import Layout from '../components/Layout';
import { toast } from '../services/feedback';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../services/firebase';
import {
  subscribeAsignacionesActivas,
  subscribeEquiposAsignadosActivos,
  subscribePacientesActivos,
} from '../services/firestoreData';
import {
  EstadoAsignacion,
  EstadoPaciente,
  RolUsuario,
  type Asignacion,
  type EquipoBiomedico,
  type Paciente,
} from '../types';

const ZONAS = ['GIRON', 'BGA1', 'BGA2', 'PIEDECUESTA', 'FLORIDABLANCA'] as const;
type ZonaFiltro = (typeof ZONAS)[number] | 'TODAS' | 'SIN_ZONA';

const Rutero: React.FC = () => {
  const { usuario } = useAuth();
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [missingDocs, setMissingDocs] = useState<string[]>([]);
  const [equipos, setEquipos] = useState<EquipoBiomedico[]>([]);
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  const [zonaFiltro, setZonaFiltro] = useState<ZonaFiltro>('TODAS');
  const [search, setSearch] = useState('');

  const [editing, setEditing] = useState<Paciente | null>(null);
  const [editZona, setEditZona] = useState('');
  const [editDireccion, setEditDireccion] = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [editBarrio, setEditBarrio] = useState('');
  const [saving, setSaving] = useState(false);

  const importInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setFirestoreError(null);
    const unsubPacientes = subscribePacientesActivos(setPacientes, (e) => {
      console.error('subscribePacientesActivos error:', e);
      setFirestoreError(`No tienes permisos para leer pacientes. Detalle: ${e.message}`);
    });
    const unsubEquipos = subscribeEquiposAsignadosActivos(setEquipos, (e) => {
      console.error('subscribeEquiposAsignadosActivos error:', e);
      setFirestoreError(`No tienes permisos para leer equipos. Detalle: ${e.message}`);
    });
    const unsubAsignaciones = subscribeAsignacionesActivas(setAsignaciones, (e) => {
      console.error('subscribeAsignacionesActivas error:', e);
      setFirestoreError(`No tienes permisos para leer asignaciones. Detalle: ${e.message}`);
    });
    return () => {
      unsubPacientes();
      unsubEquipos();
      unsubAsignaciones();
    };
  }, []);

  if (!usuario || usuario.rol !== RolUsuario.VISITADOR) {
    return (
      <Layout title="Rutero">
        <div className="bg-white p-6 rounded-lg shadow max-w-2xl">
          <h3 className="font-bold text-gray-900 mb-2">Acceso restringido</h3>
          <p className="text-sm text-gray-600">
            Esta sección es solo para el rol <code className="px-1">VISITADOR</code>.
          </p>
        </div>
      </Layout>
    );
  }

  const equiposById = useMemo(() => new Map(equipos.map((e) => [e.id, e])), [equipos]);
  const asignacionByPaciente = useMemo(() => {
    const map = new Map<string, Asignacion>();
    for (const a of asignaciones) {
      if (a.estado === EstadoAsignacion.ACTIVA && !map.has(a.idPaciente)) {
        map.set(a.idPaciente, a);
      }
    }
    return map;
  }, [asignaciones]);

  const pacientesActivos = useMemo(
    () => pacientes.filter((p) => p.estado === EstadoPaciente.ACTIVO),
    [pacientes],
  );

  const rows = useMemo(() => {
    return pacientesActivos.map((p) => {
      const asignacion = asignacionByPaciente.get(p.id);
      const equipo = asignacion ? equiposById.get(asignacion.idEquipo) : undefined;
      return { paciente: p, asignacion, equipo };
    });
  }, [pacientesActivos, asignacionByPaciente, equiposById]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter(({ paciente, equipo }) => {
      const zona = paciente.zona || '';
      if (zonaFiltro === 'SIN_ZONA') {
        if (zona) return false;
      } else if (zonaFiltro !== 'TODAS' && zona !== zonaFiltro) {
        return false;
      }

      if (!term) return true;
      const matchEquipo = equipo
        ? `${equipo.codigoInventario} ${equipo.nombre} ${equipo.numeroSerie}`.toLowerCase()
        : '';
      return (
        paciente.nombreCompleto.toLowerCase().includes(term) ||
        paciente.numeroDocumento.toLowerCase().includes(term) ||
        (paciente.direccion || '').toLowerCase().includes(term) ||
        (paciente.telefono || '').toLowerCase().includes(term) ||
        (paciente.barrio || '').toLowerCase().includes(term) ||
        matchEquipo.includes(term)
      );
    });
  }, [rows, zonaFiltro, search]);

  const openEdit = (p: Paciente) => {
    setEditing(p);
    setEditZona(p.zona || '');
    setEditDireccion(p.direccion || '');
    setEditTelefono(p.telefono || '');
    setEditBarrio(p.barrio || '');
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const zona = editZona ? editZona.toUpperCase() : null;
      const direccion = (editDireccion || '').toUpperCase();
      const telefono = (editTelefono || '').toUpperCase();
      const barrio = (editBarrio || '').toUpperCase();
      await updateDoc(doc(db, 'pacientes', editing.id), {
        zona,
        direccion,
        telefono,
        barrio,
      } as any);
      toast({ tone: 'success', message: 'Rutero actualizado correctamente.' });
      setEditing(null);
    } catch (err: any) {
      console.error('saveEdit error:', err);
      toast({ tone: 'error', message: err?.message || 'No se pudo actualizar el rutero.' });
    } finally {
      setSaving(false);
    }
  };

  const csvEscape = (value: string) => `"${(value || '').replace(/"/g, '""')}"`;

  const exportCsv = () => {
    const headers = ['Documento', 'Nombre', 'BarrioMunicipio', 'Direccion', 'Telefono', 'Zona', 'Equipo'];
    const lines = [headers.join(',')];
    for (const row of filteredRows) {
      const { paciente, equipo } = row;
      const equipoLabel = equipo ? `${equipo.codigoInventario} - ${equipo.nombre}` : 'SIN EQUIPO';
      lines.push(
        [
          paciente.numeroDocumento || '',
          paciente.nombreCompleto || '',
          paciente.barrio || '',
          paciente.direccion || '',
          paciente.telefono || '',
          paciente.zona || '',
          equipoLabel,
        ].map(csvEscape).join(','),
      );
    }
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rutero_${zonaFiltro.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadTemplate = () => {
    const headers = ['Documento', 'Nombre', 'BarrioMunicipio', 'Direccion', 'Telefono', 'Zona'];
    const example = [
      '1095945840',
      'Rodolofo Serrano Castro',
      'Valle de los Caballeros',
      'Manzana J # 17-51',
      '3163186059',
      'GIRON',
    ];
    const csv = [headers.join(','), example.map(csvEscape).join(',')].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_rutero_biocontrol.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadMissing = () => {
    if (missingDocs.length === 0) return;
    const headers = ['Documento'];
    const lines = [headers.join(','), ...missingDocs.map((d) => csvEscape(d))];
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rutero_no_encontrados_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const normalizeZona = (value: string) => {
    const raw = value.replace(/\s+/g, '').toUpperCase();
    if (raw === 'GIRON') return 'GIRON';
    if (raw === 'BGA1') return 'BGA1';
    if (raw === 'BGA2') return 'BGA2';
    if (raw === 'PIEDECUESTA') return 'PIEDECUESTA';
    if (raw === 'FLORIDABLANCA') return 'FLORIDABLANCA';
    return '';
  };

  const normalizeDocumento = (value: string) => {
    const raw = (value || '').trim();
    if (!raw) return '';
    if (/^\d+(\.\d+)?e\+\d+$/i.test(raw)) {
      const num = Number(raw);
      if (Number.isFinite(num)) return Math.trunc(num).toString();
    }
    return raw.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  };

  const importCsv = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      toast({ tone: 'warning', message: 'El archivo no tiene datos para importar.' });
      return;
    }
    const delimiter = lines[0].includes(';') ? ';' : ',';
    const header = lines[0].split(delimiter).map((h) => h.trim().toLowerCase());
    const idx = (name: string) => header.indexOf(name);
    const idxDoc = idx('documento');
    const idxNombre = idx('nombre');
    const idxBarrio = idx('barriomunicipio');
    const idxDireccion = idx('direccion');
    const idxTelefono = idx('telefono');
    const idxZona = idx('zona');

    if (idxDoc === -1) {
      toast({ tone: 'error', message: 'No se encontró la columna Documento en el CSV.' });
      return;
    }

    const pacientesByDoc = new Map(pacientesActivos.map((p) => [p.numeroDocumento.toUpperCase(), p]));
    let updated = 0;
    let missing = 0;
    const missingList: string[] = [];
    for (const line of lines.slice(1)) {
      const cols = line.split(delimiter).map((c) => c.trim());
      const docNumber = normalizeDocumento(cols[idxDoc] || '');
      if (!docNumber) continue;
      const paciente = pacientesByDoc.get(docNumber);
      if (!paciente) {
        missing++;
        missingList.push(docNumber);
        continue;
      }
      const payload: any = {};
      if (idxNombre !== -1 && cols[idxNombre]) payload.nombreCompleto = cols[idxNombre].toUpperCase();
      if (idxBarrio !== -1) payload.barrio = (cols[idxBarrio] || '').toUpperCase();
      if (idxDireccion !== -1) payload.direccion = (cols[idxDireccion] || '').toUpperCase();
      if (idxTelefono !== -1) payload.telefono = (cols[idxTelefono] || '').toUpperCase();
      if (idxZona !== -1) {
        const zona = normalizeZona(cols[idxZona] || '');
        payload.zona = zona || null;
      }
      await updateDoc(doc(db, 'pacientes', paciente.id), payload);
      updated++;
    }

    setMissingDocs(missingList);
    toast({
      tone: 'success',
      message: `Importación completa. Actualizados: ${updated}. No encontrados: ${missing}.`,
    });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importCsv(file);
    } catch (err: any) {
      console.error('importCsv error:', err);
      toast({ tone: 'error', message: err?.message || 'No se pudo importar el rutero.' });
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  return (
    <Layout title="Rutero">
      {firestoreError && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded p-3 text-sm">
          {firestoreError}
        </div>
      )}

      <div className="md-card p-4 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-bold text-gray-900">Rutero por zona</div>
            <div className="text-xs text-gray-500">Pacientes activos del sistema.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="md-btn md-btn-outlined" onClick={downloadTemplate} type="button">
              Plantilla CSV
            </button>
            <label className="md-btn md-btn-outlined cursor-pointer">
              Importar CSV
              <input ref={importInputRef} type="file" accept=".csv" onChange={handleImport} className="hidden" />
            </label>
            <button className="md-btn md-btn-filled" onClick={exportCsv} type="button">
              Exportar Excel (CSV)
            </button>
          </div>
        </div>
      </div>

      <div className="md-card p-4 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className={`md-btn ${zonaFiltro === 'TODAS' ? 'md-btn-filled' : 'md-btn-outlined'}`}
            onClick={() => setZonaFiltro('TODAS')}
            type="button"
          >
            Todas
          </button>
          {ZONAS.map((z) => (
            <button
              key={z}
              className={`md-btn ${zonaFiltro === z ? 'md-btn-filled' : 'md-btn-outlined'}`}
              onClick={() => setZonaFiltro(z)}
              type="button"
            >
              {z}
            </button>
          ))}
          <button
            className={`md-btn ${zonaFiltro === 'SIN_ZONA' ? 'md-btn-filled' : 'md-btn-outlined'}`}
            onClick={() => setZonaFiltro('SIN_ZONA')}
            type="button"
          >
            Sin zona
          </button>
        </div>
        <div className="mt-3">
          <input
            className="w-full border rounded-md px-3 py-2"
            placeholder="Buscar por paciente, documento, dirección, equipo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {missingDocs.length > 0 && (
        <div className="md-card p-4 mb-4 border border-amber-200 bg-amber-50">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-amber-900">Pacientes no encontrados</div>
              <div className="text-xs text-amber-800">
                Estos documentos no existen en la base de pacientes activos. Crea el paciente y vuelve a importar si aplica.
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-amber-900">
                {missingDocs.slice(0, 20).map((doc) => (
                  <span key={doc} className="px-2 py-1 rounded-full border border-amber-200 bg-white">
                    {doc}
                  </span>
                ))}
                {missingDocs.length > 20 && (
                  <span className="px-2 py-1 rounded-full border border-amber-200 bg-white">
                    +{missingDocs.length - 20} más
                  </span>
                )}
              </div>
            </div>
            <button className="md-btn md-btn-outlined" onClick={downloadMissing} type="button">
              Descargar pendientes
            </button>
          </div>
        </div>
      )}

      <div className="md-card p-4 overflow-auto">
        <table className="w-full text-sm min-w-[980px]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b">
              <th className="py-3 px-2">Documento</th>
              <th className="py-3 px-2">Paciente</th>
              <th className="py-3 px-2">Barrio/Municipio</th>
              <th className="py-3 px-2">Dirección</th>
              <th className="py-3 px-2">Teléfono</th>
              <th className="py-3 px-2">Zona</th>
              <th className="py-3 px-2">Equipo</th>
              <th className="py-3 px-2">Acción</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-gray-500">
                  No hay pacientes para mostrar.
                </td>
              </tr>
            ) : (
              filteredRows.map(({ paciente, equipo }) => (
                <tr key={paciente.id} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="py-3 px-2">{paciente.numeroDocumento}</td>
                  <td className="py-3 px-2 font-semibold text-gray-900">{paciente.nombreCompleto}</td>
                  <td className="py-3 px-2">{paciente.barrio || '—'}</td>
                  <td className="py-3 px-2">{paciente.direccion}</td>
                  <td className="py-3 px-2">{paciente.telefono}</td>
                  <td className="py-3 px-2">
                    <span className="px-2 py-1 rounded-full text-xs border border-blue-200 bg-blue-50 text-blue-700">
                      {paciente.zona || 'SIN ZONA'}
                    </span>
                  </td>
                  <td className="py-3 px-2">
                    {equipo ? (
                      <>
                        <div className="font-mono text-xs text-gray-500">{equipo.codigoInventario}</div>
                        <div className="font-semibold text-gray-900">{equipo.nombre}</div>
                      </>
                    ) : (
                      <span className="text-xs text-gray-500">Sin equipo</span>
                    )}
                  </td>
                  <td className="py-3 px-2">
                    <button className="md-btn md-btn-outlined" onClick={() => openEdit(paciente)} type="button">
                      Editar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-gray-900">Editar rutero</div>
                <div className="text-xs text-gray-500">{editing.nombreCompleto}</div>
              </div>
              <button className="md-btn md-btn-outlined" onClick={() => setEditing(null)} type="button">
                Cerrar
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Zona</label>
                <select className="w-full border p-2.5 rounded-md" value={editZona} onChange={(e) => setEditZona(e.target.value)}>
                  <option value="">Sin zona</option>
                  {ZONAS.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Barrio / Municipio</label>
                <input className="w-full border p-2.5 rounded-md" value={editBarrio} onChange={(e) => setEditBarrio(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Dirección</label>
                <input className="w-full border p-2.5 rounded-md" value={editDireccion} onChange={(e) => setEditDireccion(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Teléfono</label>
                <input className="w-full border p-2.5 rounded-md" value={editTelefono} onChange={(e) => setEditTelefono(e.target.value)} />
              </div>
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <button className="md-btn md-btn-outlined" onClick={() => setEditing(null)} type="button">
                Cancelar
              </button>
              <button className="md-btn md-btn-filled" onClick={saveEdit} disabled={saving} type="button">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Rutero;
