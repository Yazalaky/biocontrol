import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { toast } from '../services/feedback';
import {
  RolUsuario,
  TipoPropiedad,
  type CalibracionEquipo,
  type EquipoBiomedico,
  type TipoEquipo,
} from '../types';
import {
  addCalibracionEquipo,
  subscribeCalibracionesEquipo,
  subscribeEquipos,
  subscribeTiposEquipo,
  updateCalibracionCertificado,
  updateCalibracionFields,
} from '../services/firestoreData';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { storage } from '../services/firebase';

type EstadoFiltro = 'ALL' | 'POR_VENCER' | 'VENCIDAS' | 'SIN_REGISTRO';

const toISODate = (value: Date) => value.toISOString().slice(0, 10);

const formatDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
};

const addMonths = (date: Date, months: number) => {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) {
    d.setDate(0);
  }
  return d;
};

const VALID_PERIODICIDADES = new Set(['ANUAL', 'SEMESTRAL', 'TRIMESTRAL', 'MENSUAL']);

const computeNextDate = (fecha: string, periodicidad?: string) => {
  if (!fecha || !periodicidad) return '';
  const base = new Date(fecha);
  if (Number.isNaN(base.getTime())) return '';
  const upper = periodicidad.toUpperCase();
  if (!VALID_PERIODICIDADES.has(upper)) return '';
  let next = new Date(base);
  if (upper === 'ANUAL') next = addMonths(base, 12);
  if (upper === 'SEMESTRAL') next = addMonths(base, 6);
  if (upper === 'TRIMESTRAL') next = addMonths(base, 3);
  if (upper === 'MENSUAL') next = addMonths(base, 1);
  return toISODate(next);
};

const diffDays = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const delta = date.getTime() - start.getTime();
  return Math.ceil(delta / (1000 * 60 * 60 * 24));
};

const Calibraciones: React.FC = () => {
  const { usuario, hasRole, isAdmin } = useAuth();
  const isBiomedico = hasRole([RolUsuario.INGENIERO_BIOMEDICO]);

  const [equipos, setEquipos] = useState<EquipoBiomedico[]>([]);
  const [tiposEquipo, setTiposEquipo] = useState<TipoEquipo[]>([]);
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<EstadoFiltro>('ALL');

  const [openModal, setOpenModal] = useState(false);
  const [selectedEquipo, setSelectedEquipo] = useState<EquipoBiomedico | null>(null);
  const [historial, setHistorial] = useState<CalibracionEquipo[]>([]);
  const [fechaCalibracion, setFechaCalibracion] = useState('');
  const [costo, setCosto] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<CalibracionEquipo | null>(null);
  const [replacing, setReplacing] = useState(false);
  const replaceInputRef = React.useRef<HTMLInputElement>(null);
  const [editingCostoId, setEditingCostoId] = useState<string | null>(null);
  const [editingCostoValue, setEditingCostoValue] = useState('');

  useEffect(() => {
    const unsubEquipos = subscribeEquipos(setEquipos, (e) => {
      console.error('Error cargando equipos:', e);
      toast({ tone: 'error', message: 'No se pudieron cargar los equipos.' });
    });
    const unsubTipos = subscribeTiposEquipo(setTiposEquipo);
    return () => {
      unsubEquipos();
      unsubTipos();
    };
  }, []);

  const tiposById = useMemo(() => new Map(tiposEquipo.map((t) => [t.id, t])), [tiposEquipo]);

  const resolvePeriodicidad = (equipo: EquipoBiomedico) => {
    const base =
      equipo.calibracionPeriodicidad ||
      equipo.hojaVidaOverrides?.calibracion ||
      (equipo.tipoEquipoId ? tiposById.get(equipo.tipoEquipoId)?.fijos?.calibracion : undefined) ||
      '';
    const upper = base.trim().toUpperCase();
    if (!upper) return '';
    if (!VALID_PERIODICIDADES.has(upper)) return '';
    return upper;
  };

  const equiposCalibrables = useMemo(() => {
    const term = search.trim().toLowerCase();
    const baseList = equipos
      .filter((eq) => eq.tipoPropiedad === TipoPropiedad.MEDICUC)
      .map((eq) => {
        const periodicidad = resolvePeriodicidad(eq);
        if (!periodicidad) return null;
        const proximaFecha = eq.calibracionProxima || computeNextDate(eq.calibracionUltima || '', periodicidad);
        const dias = diffDays(proximaFecha);
        return { eq, periodicidad, proximaFecha, dias };
      })
      .filter(Boolean) as { eq: EquipoBiomedico; periodicidad: string; proximaFecha: string; dias: number | null }[];

    return baseList
      .filter(({ eq }) => {
        if (!term) return true;
        return (
          (eq.codigoInventario || '').toLowerCase().includes(term) ||
          (eq.nombre || '').toLowerCase().includes(term) ||
          (eq.numeroSerie || '').toLowerCase().includes(term)
        );
      })
      .filter(({ eq, dias }) => {
        if (filtro === 'ALL') return true;
        if (filtro === 'SIN_REGISTRO') return !eq.calibracionUltima;
        if (filtro === 'VENCIDAS') return typeof dias === 'number' && dias < 0;
        if (filtro === 'POR_VENCER') return typeof dias === 'number' && dias >= 0 && dias <= 30;
        return true;
      });
  }, [equipos, search, filtro, tiposById]);

  useEffect(() => {
    if (!selectedEquipo?.id || !openModal) return undefined;
    const unsub = subscribeCalibracionesEquipo(selectedEquipo.id, setHistorial, (e) => {
      console.error('Error cargando calibraciones:', e);
      toast({ tone: 'error', message: 'No se pudo cargar el historial de calibraciones.' });
    });
    return () => unsub();
  }, [selectedEquipo?.id, openModal]);

  const openForEquipo = (eq: EquipoBiomedico) => {
    setSelectedEquipo(eq);
    setFechaCalibracion(new Date().toISOString().slice(0, 10));
    setCosto('');
    setObservaciones('');
    setFile(null);
    setHistorial([]);
    setOpenModal(true);
  };

  const closeModal = () => {
    setOpenModal(false);
    setSelectedEquipo(null);
    setHistorial([]);
  };

  const handleFile = (next?: File | null) => {
    if (!next) {
      setFile(null);
      return;
    }
    if (next.type !== 'application/pdf') {
      toast({ tone: 'warning', message: 'El certificado debe ser un PDF.' });
      return;
    }
    if (next.size > 10 * 1024 * 1024) {
      toast({ tone: 'warning', message: 'El PDF supera 10MB.' });
      return;
    }
    setFile(next);
  };

  const handleReplaceClick = (item: CalibracionEquipo) => {
    if (!isBiomedico) return;
    setReplaceTarget(item);
    replaceInputRef.current?.click();
  };

  const handleReplaceFile = async (next?: File | null) => {
    if (!next || !selectedEquipo || !replaceTarget || !usuario) return;
    if (next.type !== 'application/pdf') {
      toast({ tone: 'warning', message: 'El certificado debe ser un PDF.' });
      return;
    }
    if (next.size > 10 * 1024 * 1024) {
      toast({ tone: 'warning', message: 'El PDF supera 10MB.' });
      return;
    }
    setReplacing(true);
    try {
      const storagePath = `calibraciones/${selectedEquipo.id}/${Date.now()}_${next.name}`;
      const refFile = storageRef(storage, storagePath);
      await uploadBytes(refFile, next, { contentType: next.type || 'application/pdf' });
      const url = await getDownloadURL(refFile);
      const shouldSync = selectedEquipo.calibracionUltima === replaceTarget.fecha;
      await updateCalibracionCertificado({
        equipoId: selectedEquipo.id,
        calibracionId: replaceTarget.id,
        certificado: {
          path: storagePath,
          name: next.name,
          size: next.size,
          contentType: next.type || 'application/pdf',
          url,
        },
        syncEquipo: shouldSync,
      });
      toast({ tone: 'success', message: 'Certificado actualizado.' });
    } catch (err) {
      console.error('Error reemplazando certificado:', err);
      toast({ tone: 'error', message: 'No se pudo reemplazar el certificado.' });
    } finally {
      setReplacing(false);
      setReplaceTarget(null);
      if (replaceInputRef.current) replaceInputRef.current.value = '';
    }
  };

  const startEditCosto = (item: CalibracionEquipo) => {
    if (!isBiomedico) return;
    setEditingCostoId(item.id);
    setEditingCostoValue(item.costo || '');
  };

  const cancelEditCosto = () => {
    setEditingCostoId(null);
    setEditingCostoValue('');
  };

  const saveEditCosto = async (item: CalibracionEquipo) => {
    if (!selectedEquipo) return;
    const value = editingCostoValue.trim();
    if (!value) {
      toast({ tone: 'warning', message: 'Escribe el costo.' });
      return;
    }
    try {
      await updateCalibracionFields({
        equipoId: selectedEquipo.id,
        calibracionId: item.id,
        costo: value,
      });
      toast({ tone: 'success', message: 'Costo actualizado.' });
      cancelEditCosto();
    } catch (err) {
      console.error('Error actualizando costo:', err);
      toast({ tone: 'error', message: 'No se pudo actualizar el costo.' });
    }
  };

  const handleSave = async () => {
    if (!selectedEquipo || !usuario) return;
    const periodicidad = resolvePeriodicidad(selectedEquipo);
    if (!periodicidad) {
      toast({ tone: 'warning', message: 'Este equipo no tiene periodicidad de calibración.' });
      return;
    }
    if (!fechaCalibracion) {
      toast({ tone: 'warning', message: 'Selecciona la fecha de calibración.' });
      return;
    }
    if (!file) {
      toast({ tone: 'warning', message: 'Adjunta el certificado en PDF.' });
      return;
    }
    if (!costo.trim()) {
      toast({ tone: 'warning', message: 'Escribe el costo de la calibración.' });
      return;
    }
    setSaving(true);
    try {
      const storagePath = `calibraciones/${selectedEquipo.id}/${Date.now()}_${file.name}`;
      const refFile = storageRef(storage, storagePath);
      await uploadBytes(refFile, file, { contentType: file.type || 'application/pdf' });
      const url = await getDownloadURL(refFile);
      const proximaFecha = computeNextDate(fechaCalibracion, periodicidad);
      await addCalibracionEquipo({
        equipoId: selectedEquipo.id,
        fecha: fechaCalibracion,
        proximaFecha,
        periodicidad,
        costo: costo.trim(),
        observaciones,
        certificado: {
          path: storagePath,
          name: file.name,
          size: file.size,
          contentType: file.type || 'application/pdf',
          url,
        },
        creadoPorUid: usuario.id,
        creadoPorNombre: usuario.nombre,
      });
      toast({ tone: 'success', message: 'Calibración registrada.' });
      setFile(null);
      setObservaciones('');
      setCosto('');
    } catch (err) {
      console.error('Error guardando calibración:', err);
      toast({ tone: 'error', message: 'No se pudo guardar la calibración.' });
    } finally {
      setSaving(false);
    }
  };

  const openCertificado = async (cert?: { path?: string; url?: string }) => {
    if (!cert?.path && !cert?.url) return;
    try {
      if (cert.url) {
        window.open(cert.url, '_blank');
        return;
      }
      if (cert.path) {
        const url = await getDownloadURL(storageRef(storage, cert.path));
        window.open(url, '_blank');
      }
    } catch (err) {
      console.error('Error abriendo certificado:', err);
      toast({ tone: 'error', message: 'No se pudo abrir el certificado.' });
    }
  };

  const puedeVer = hasRole([
    RolUsuario.INGENIERO_BIOMEDICO,
    RolUsuario.AUXILIAR_ADMINISTRATIVA,
    RolUsuario.GERENCIA,
  ]) || isAdmin;

  if (!puedeVer) {
    return (
      <Layout title="Calibraciones">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
          No tienes permisos para ver calibraciones.
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Calibraciones">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl flex-1">
            <div className="text-lg font-bold text-gray-900">Calibraciones</div>
            <div className="text-sm text-gray-500">Equipos MEDICUC con calibración definida.</div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {([
                { id: 'ALL', label: 'Todas' },
                { id: 'POR_VENCER', label: 'Por vencer (30 días)' },
                { id: 'VENCIDAS', label: 'Vencidas' },
                { id: 'SIN_REGISTRO', label: 'Sin registro' },
              ] as { id: EstadoFiltro; label: string }[]).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFiltro(item.id)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                    filtro === item.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex-1 max-w-md">
              <div className="relative">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por código, nombre o serie..."
                  className="w-full rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-auto rounded-xl border border-gray-200">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left">Activo</th>
                  <th className="px-3 py-2 text-left">Equipo</th>
                  <th className="px-3 py-2 text-left">Serie</th>
                  <th className="px-3 py-2 text-left">Periodicidad</th>
                  <th className="px-3 py-2 text-left">Última</th>
                  <th className="px-3 py-2 text-left">Próxima</th>
                  <th className="px-3 py-2 text-left">Estado</th>
                  <th className="px-3 py-2 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {equiposCalibrables.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-gray-500">
                      No hay equipos con calibración registrada.
                    </td>
                  </tr>
                )}
                {equiposCalibrables.map(({ eq, periodicidad, proximaFecha, dias }) => {
                  const estadoLabel =
                    eq.calibracionUltima
                      ? dias === null
                        ? 'SIN FECHA'
                        : dias < 0
                          ? `VENCIDA (${Math.abs(dias)}d)`
                          : dias <= 30
                            ? `POR VENCER (${dias}d)`
                            : `VIGENTE (${dias}d)`
                      : 'SIN REGISTRO';
                  return (
                    <tr key={eq.id} className="border-t">
                      <td className="px-3 py-2 font-semibold text-gray-700">{eq.codigoInventario}</td>
                      <td className="px-3 py-2">{eq.nombre}</td>
                      <td className="px-3 py-2 text-gray-500">{eq.numeroSerie || '—'}</td>
                      <td className="px-3 py-2">{periodicidad}</td>
                      <td className="px-3 py-2">{formatDate(eq.calibracionUltima)}</td>
                      <td className="px-3 py-2">{formatDate(proximaFecha)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            estadoLabel.includes('VENCIDA')
                              ? 'bg-red-100 text-red-700'
                              : estadoLabel.includes('POR VENCER')
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {estadoLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            className="rounded-full border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                            onClick={() => openForEquipo(eq)}
                          >
                            {isBiomedico ? 'Registrar' : 'Ver'}
                          </button>
                          {(() => {
                            const hasPdf = Boolean(eq.calibracionCertificado?.path || eq.calibracionCertificado?.url);
                            return (
                              <button
                                type="button"
                                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${
                                  hasPdf
                                    ? 'border-gray-200 text-gray-700 hover:bg-gray-50'
                                    : 'border-gray-100 text-gray-400 bg-gray-100 cursor-not-allowed'
                                }`}
                                onClick={() => hasPdf && openCertificado(eq.calibracionCertificado)}
                                disabled={!hasPdf}
                              >
                                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" />
                                  <path d="M14 2v6h6" />
                                  <path d="M8 13h8" />
                                  <path d="M8 17h8" />
                                </svg>
                                Ver PDF
                              </button>
                            );
                          })()}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {openModal && selectedEquipo && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-gray-900">Calibración · {selectedEquipo.codigoInventario}</div>
                <div className="text-sm text-gray-500">{selectedEquipo.nombre}</div>
              </div>
              <button
                type="button"
                className="rounded-full border border-gray-200 px-3 py-1 text-sm text-gray-600"
                onClick={closeModal}
              >
                Cerrar
              </button>
            </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
              <div className="rounded-xl border border-gray-200 p-4">
                <div className="text-sm font-semibold text-gray-700">Historial de calibraciones</div>
                <div className="mt-3 space-y-3">
                  {historial.length === 0 && (
                    <div className="text-sm text-gray-500">Sin historial registrado.</div>
                  )}
                  {historial.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-700">{formatDate(item.fecha)}</span>
                        <span className="text-xs text-gray-500">{item.periodicidad || '—'}</span>
                      </div>
                      {item.costo ? (
                        <div className="mt-1 text-xs text-gray-600">Costo: {item.costo}</div>
                      ) : null}
                      {item.observaciones ? (
                        <div className="mt-1 text-xs text-gray-600">{item.observaciones}</div>
                      ) : null}
                      {isBiomedico && editingCostoId === item.id ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={editingCostoValue}
                            onChange={(e) => setEditingCostoValue(e.target.value)}
                            className="rounded-md border border-gray-200 px-2 py-1 text-xs"
                            placeholder="Costo"
                          />
                          <button
                            type="button"
                            className="rounded-md bg-blue-600 px-2 py-1 text-xs font-semibold text-white"
                            onClick={() => saveEditCosto(item)}
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600"
                            onClick={cancelEditCosto}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : null}
                      <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                        <span>Por: {item.creadoPorNombre}</span>
                        {item.certificado?.path || item.certificado?.url ? (
                          <button
                            type="button"
                            className="text-blue-600 hover:underline"
                            onClick={() => openCertificado(item.certificado)}
                          >
                            Ver certificado
                          </button>
                        ) : null}
                        {isBiomedico ? (
                          <button
                            type="button"
                            className="text-gray-600 hover:underline"
                            onClick={() => handleReplaceClick(item)}
                            disabled={replacing}
                          >
                            {replacing && replaceTarget?.id === item.id ? 'Actualizando...' : 'Reemplazar PDF'}
                          </button>
                        ) : null}
                        {isBiomedico && editingCostoId !== item.id ? (
                          <button
                            type="button"
                            className="text-gray-600 hover:underline"
                            onClick={() => startEditCosto(item)}
                          >
                            {item.costo ? 'Editar costo' : 'Agregar costo'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 p-4">
                <div className="text-sm font-semibold text-gray-700">Registrar calibración</div>
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Periodicidad</label>
                    <input
                      value={resolvePeriodicidad(selectedEquipo)}
                      disabled
                      className="w-full rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Fecha de calibración</label>
                    <input
                      type="date"
                      value={fechaCalibracion}
                      onChange={(e) => setFechaCalibracion(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      disabled={!isBiomedico}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Certificado (PDF)</label>
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => handleFile(e.target.files?.[0] || null)}
                      className="w-full text-sm"
                      disabled={!isBiomedico}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Costo</label>
                    <input
                      type="text"
                      value={costo}
                      onChange={(e) => setCosto(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      disabled={!isBiomedico}
                      placeholder="Ej: 50000"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Observaciones</label>
                    <textarea
                      rows={3}
                      value={observaciones}
                      onChange={(e) => setObservaciones(e.target.value.toUpperCase())}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      disabled={!isBiomedico}
                    />
                  </div>
                  <button
                    type="button"
                    className="md-btn md-btn-filled w-full"
                    disabled={!isBiomedico || saving}
                    onClick={handleSave}
                  >
                    {saving ? 'Guardando...' : 'Guardar calibración'}
                  </button>
                </div>
              </div>
            </div>
            <input
              ref={replaceInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => handleReplaceFile(e.target.files?.[0] || null)}
            />
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Calibraciones;
