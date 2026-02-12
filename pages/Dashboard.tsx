import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import {
  EstadoAsignacion,
  EstadoEquipo,
  EstadoPaciente,
  RolUsuario,
  TipoPropiedad,
  TipoMantenimiento,
  type Asignacion,
  type AsignacionProfesional,
  type EquipoBiomedico,
  type Mantenimiento,
  type Paciente,
  type CalibracionEquipo,
} from '../types';
import StatusBadge from '../components/StatusBadge';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import {
  subscribeAsignaciones,
  subscribeAsignacionesProfesionales,
  subscribeEquipos,
  subscribeCalibraciones,
  subscribeMantenimientos,
  subscribePacientes,
} from '../services/firestoreData';

const StatIcon = ({ type }: { type: 'patients' | 'equipos' | 'assigned' | 'maintenance' }) => {
  switch (type) {
    case 'patients':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'equipos':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 16V8a2 2 0 0 0-1-1.73L13 2.27a2 2 0 0 0-2 0L4 6.27A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.73Z" />
          <path d="M3.3 7l8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </svg>
      );
    case 'assigned':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 21s8-4 8-10V5l-8-3-8 3v6c0 6 8 10 8 10Z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case 'maintenance':
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l2.1-2.1a6 6 0 0 1-7.5 7.5l-6.6 6.6a2 2 0 0 1-2.8-2.8l6.6-6.6A6 6 0 0 1 15 4.2l-2.1 2.1Z" />
        </svg>
      );
  }
};

const Dashboard: React.FC = () => {
  const { hasRole } = useAuth();
  const isBiomedico = hasRole([RolUsuario.INGENIERO_BIOMEDICO]);

  const [stats, setStats] = useState({
    pacientesActivos: 0,
    pacientesConActaActiva: 0,
    totalEquipos: 0,
    equiposDisponibles: 0,
    equiposAsignadosPacientes: 0,
    equiposAsignadosProfesionales: 0,
    equiposAsignados: 0,
    equiposMantenimiento: 0,
    equiposBaja: 0
  });

  const [recentAssignments, setRecentAssignments] = useState<any[]>([]);
  const [equiposData, setEquiposData] = useState<EquipoBiomedico[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | 'ALL' | null>(null);
  const [mantenimientos, setMantenimientos] = useState<Mantenimiento[]>([]);
  const [selectedYearMantenimiento, setSelectedYearMantenimiento] = useState<number | 'ALL' | null>(null);
  const [calibraciones, setCalibraciones] = useState<CalibracionEquipo[]>([]);
  const [selectedYearCalibracion, setSelectedYearCalibracion] = useState<number | 'ALL' | null>(null);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const [showCalibPopup, setShowCalibPopup] = useState(false);

  const parseCosto = (value?: string) => {
    if (!value) return null;
    const cleaned = value.replace(/[^\d]/g, '');
    if (!cleaned) return null;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  };

  const getIngresoYear = (value?: string) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.getFullYear();
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(value);

  const availableYears = React.useMemo(() => {
    const years = new Set<number>();
    for (const eq of equiposData) {
      if (eq.tipoPropiedad !== TipoPropiedad.MEDICUC) continue;
      const costo = parseCosto(eq.hojaVidaDatos?.costoAdquisicion);
      if (!costo) continue;
      const year = getIngresoYear(eq.fechaIngreso);
      if (year) years.add(year);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [equiposData]);

  const availableYearsMantenimiento = React.useMemo(() => {
    const years = new Set<number>();
    for (const m of mantenimientos) {
      if (m.tipo !== TipoMantenimiento.CORRECTIVO) continue;
      const costo = parseCosto(m.costo);
      if (!costo) continue;
      const year = getIngresoYear(m.fecha);
      if (year) years.add(year);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [mantenimientos]);

  const availableYearsCalibracion = React.useMemo(() => {
    const years = new Set<number>();
    const equiposById = new Map(equiposData.map((e) => [e.id, e]));
    for (const c of calibraciones) {
      const eq = equiposById.get(c.equipoId);
      if (!eq || eq.tipoPropiedad !== TipoPropiedad.MEDICUC) continue;
      const costo = parseCosto(c.costo);
      if (!costo) continue;
      const year = getIngresoYear(c.fecha);
      if (year) years.add(year);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [calibraciones, equiposData]);

  useEffect(() => {
    if (availableYears.length === 0) {
      if (selectedYear !== null) setSelectedYear(null);
      return;
    }
    if (!selectedYear || (selectedYear !== 'ALL' && !availableYears.includes(selectedYear))) {
      setSelectedYear('ALL');
    }
  }, [availableYears, selectedYear]);

  useEffect(() => {
    if (availableYearsMantenimiento.length === 0) {
      if (selectedYearMantenimiento !== null) setSelectedYearMantenimiento(null);
      return;
    }
    if (!selectedYearMantenimiento || (selectedYearMantenimiento !== 'ALL' && !availableYearsMantenimiento.includes(selectedYearMantenimiento))) {
      setSelectedYearMantenimiento('ALL');
    }
  }, [availableYearsMantenimiento, selectedYearMantenimiento]);

  useEffect(() => {
    if (availableYearsCalibracion.length === 0) {
      if (selectedYearCalibracion !== null) setSelectedYearCalibracion(null);
      return;
    }
    if (!selectedYearCalibracion || (selectedYearCalibracion !== 'ALL' && !availableYearsCalibracion.includes(selectedYearCalibracion))) {
      setSelectedYearCalibracion('ALL');
    }
  }, [availableYearsCalibracion, selectedYearCalibracion]);

  const costoTotalYear = React.useMemo(() => {
    if (!selectedYear) return 0;
    let total = 0;
    for (const eq of equiposData) {
      if (eq.tipoPropiedad !== TipoPropiedad.MEDICUC) continue;
      const costo = parseCosto(eq.hojaVidaDatos?.costoAdquisicion);
      if (!costo) continue;
      const year = getIngresoYear(eq.fechaIngreso);
      if (selectedYear !== 'ALL' && year !== selectedYear) continue;
      total += costo;
    }
    return total;
  }, [equiposData, selectedYear]);

  const costoTotalCount = React.useMemo(() => {
    if (!selectedYear) return 0;
    let count = 0;
    for (const eq of equiposData) {
      if (eq.tipoPropiedad !== TipoPropiedad.MEDICUC) continue;
      const costo = parseCosto(eq.hojaVidaDatos?.costoAdquisicion);
      if (!costo) continue;
      const year = getIngresoYear(eq.fechaIngreso);
      if (selectedYear !== 'ALL' && year !== selectedYear) continue;
      count += 1;
    }
    return count;
  }, [equiposData, selectedYear]);

  const costoMantenimientoTotal = React.useMemo(() => {
    if (!selectedYearMantenimiento) return 0;
    let total = 0;
    for (const m of mantenimientos) {
      if (m.tipo !== TipoMantenimiento.CORRECTIVO) continue;
      const costo = parseCosto(m.costo);
      if (!costo) continue;
      const year = getIngresoYear(m.fecha);
      if (selectedYearMantenimiento !== 'ALL' && year !== selectedYearMantenimiento) continue;
      total += costo;
    }
    return total;
  }, [mantenimientos, selectedYearMantenimiento]);

  const costoMantenimientoCount = React.useMemo(() => {
    if (!selectedYearMantenimiento) return 0;
    let count = 0;
    for (const m of mantenimientos) {
      if (m.tipo !== TipoMantenimiento.CORRECTIVO) continue;
      const costo = parseCosto(m.costo);
      if (!costo) continue;
      const year = getIngresoYear(m.fecha);
      if (selectedYearMantenimiento !== 'ALL' && year !== selectedYearMantenimiento) continue;
      count += 1;
    }
    return count;
  }, [mantenimientos, selectedYearMantenimiento]);

  const costoCalibracionTotal = React.useMemo(() => {
    if (!selectedYearCalibracion) return 0;
    let total = 0;
    const equiposById = new Map(equiposData.map((e) => [e.id, e]));
    for (const c of calibraciones) {
      const eq = equiposById.get(c.equipoId);
      if (!eq || eq.tipoPropiedad !== TipoPropiedad.MEDICUC) continue;
      const costo = parseCosto(c.costo);
      if (!costo) continue;
      const year = getIngresoYear(c.fecha);
      if (selectedYearCalibracion !== 'ALL' && year !== selectedYearCalibracion) continue;
      total += costo;
    }
    return total;
  }, [calibraciones, equiposData, selectedYearCalibracion]);

  const costoCalibracionCount = React.useMemo(() => {
    if (!selectedYearCalibracion) return 0;
    let count = 0;
    const equiposById = new Map(equiposData.map((e) => [e.id, e]));
    for (const c of calibraciones) {
      const eq = equiposById.get(c.equipoId);
      if (!eq || eq.tipoPropiedad !== TipoPropiedad.MEDICUC) continue;
      const costo = parseCosto(c.costo);
      if (!costo) continue;
      const year = getIngresoYear(c.fecha);
      if (selectedYearCalibracion !== 'ALL' && year !== selectedYearCalibracion) continue;
      count += 1;
    }
    return count;
  }, [calibraciones, equiposData, selectedYearCalibracion]);

  const calibracionesProximas = React.useMemo(() => {
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() + 30);
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return equiposData
      .filter((eq) => eq.tipoPropiedad === TipoPropiedad.MEDICUC)
      .map((eq) => {
        if (!eq.calibracionProxima) return null;
        const next = new Date(eq.calibracionProxima);
        if (Number.isNaN(next.getTime())) return null;
        if (next.getTime() > end.getTime()) return null;
        const days = Math.ceil((next.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        return { eq, days, next };
      })
      .filter(Boolean) as { eq: EquipoBiomedico; days: number; next: Date }[];
  }, [equiposData]);

  useEffect(() => {
    if (!isBiomedico) return;
    if (calibracionesProximas.length === 0) return;
    const todayKey = new Date().toISOString().slice(0, 10);
    const dismissed = localStorage.getItem('calibraciones_popup_dismissed');
    if (dismissed === todayKey) return;
    setShowCalibPopup(true);
  }, [isBiomedico, calibracionesProximas]);

  useEffect(() => {
    let pacientes: Paciente[] = [];
    let equipos: EquipoBiomedico[] = [];
    let asignaciones: Asignacion[] = [];
    let asignacionesProfesionales: AsignacionProfesional[] = [];

    const recompute = () => {
      const activosPacientes = new Set<string>();
      const activosProfesionales = new Set<string>();
      const pacientesConActaActiva = new Set<string>();
      for (const a of asignaciones) {
        if (a.estado === EstadoAsignacion.ACTIVA) {
          activosPacientes.add(a.idEquipo);
          pacientesConActaActiva.add(a.idPaciente);
        }
      }
      for (const a of asignacionesProfesionales) {
        if (a.estado === EstadoAsignacion.ACTIVA) activosProfesionales.add(a.idEquipo);
      }
      const activos = new Set<string>([...activosPacientes, ...activosProfesionales]);
      const lastFinalEstadoByEquipo = new Map<string, { date: number; estadoFinal: EstadoEquipo }>();
      for (const a of asignaciones) {
        if (a.estado !== EstadoAsignacion.FINALIZADA) continue;
        if (!a.estadoFinalEquipo) continue;
        const date = new Date(a.fechaDevolucion || a.fechaAsignacion).getTime();
        const prev = lastFinalEstadoByEquipo.get(a.idEquipo);
        if (!prev || date > prev.date) lastFinalEstadoByEquipo.set(a.idEquipo, { date, estadoFinal: a.estadoFinalEquipo as EstadoEquipo });
      }
      for (const a of asignacionesProfesionales) {
        if (a.estado !== EstadoAsignacion.FINALIZADA) continue;
        if (!a.estadoFinalEquipo) continue;
        const date = new Date(a.fechaDevolucion || a.fechaEntregaOriginal).getTime();
        const prev = lastFinalEstadoByEquipo.get(a.idEquipo);
        if (!prev || date > prev.date) lastFinalEstadoByEquipo.set(a.idEquipo, { date, estadoFinal: a.estadoFinalEquipo as EstadoEquipo });
      }

      const effectiveEstado = (equipo: EquipoBiomedico): EstadoEquipo => {
        if (activos.has(equipo.id)) return EstadoEquipo.ASIGNADO;
        const last = lastFinalEstadoByEquipo.get(equipo.id);
        return last?.estadoFinal || equipo.estado;
      };

      const estados = equipos.map(effectiveEstado);
      setStats({
        pacientesActivos: pacientes.filter((p) => p.estado === EstadoPaciente.ACTIVO).length,
        pacientesConActaActiva: pacientesConActaActiva.size,
        totalEquipos: equipos.length,
        equiposDisponibles: estados.filter((s) => s === EstadoEquipo.DISPONIBLE).length,
        equiposAsignadosPacientes: activosPacientes.size,
        equiposAsignadosProfesionales: activosProfesionales.size,
        equiposAsignados: estados.filter((s) => s === EstadoEquipo.ASIGNADO).length,
        equiposMantenimiento: estados.filter((s) => s === EstadoEquipo.MANTENIMIENTO).length,
        equiposBaja: estados.filter((s) => s === EstadoEquipo.DADO_DE_BAJA).length,
      });

      // Últimas 5 asignaciones (por fechaAsignacion ISO)
      const sorted = [...asignaciones].sort(
        (a, b) => new Date(b.fechaAsignacion).getTime() - new Date(a.fechaAsignacion).getTime(),
      );
      const enriched = sorted.slice(0, 5).map((a) => {
        const p = pacientes.find((pat) => pat.id === a.idPaciente);
        const e = equipos.find((eq) => eq.id === a.idEquipo);
        return {
          ...a,
          nombrePaciente: p ? p.nombreCompleto : 'Desconocido',
          nombreEquipo: e ? e.nombre : 'Desconocido',
        };
      });
      setRecentAssignments(enriched);
    };

    setFirestoreError(null);

    const unsubPacientes = subscribePacientes((p) => {
      pacientes = p;
      recompute();
    }, (e) => {
      console.error('Firestore subscribePacientes error:', e);
      setFirestoreError(`No tienes permisos para leer "pacientes" en Firestore. Detalle: ${e.message}`);
    });
    const unsubEquipos = subscribeEquipos((e) => {
      equipos = e;
      setEquiposData(e);
      recompute();
    }, (e) => {
      console.error('Firestore subscribeEquipos error:', e);
      setFirestoreError(`No tienes permisos para leer "equipos" en Firestore. Detalle: ${e.message}`);
    });
    const unsubAsignaciones = subscribeAsignaciones((a) => {
      asignaciones = a;
      recompute();
    }, (e) => {
      console.error('Firestore subscribeAsignaciones error:', e);
      setFirestoreError(`No tienes permisos para leer "asignaciones" en Firestore. Detalle: ${e.message}`);
    });
    const unsubAsignacionesProfesionales = subscribeAsignacionesProfesionales((a) => {
      asignacionesProfesionales = a;
      recompute();
    }, (e) => {
      console.error('Firestore subscribeAsignacionesProfesionales error:', e);
      setFirestoreError(`No tienes permisos para leer "asignaciones_profesionales" en Firestore. Detalle: ${e.message}`);
    });
    const unsubMantenimientos = subscribeMantenimientos(setMantenimientos, (e) => {
      console.error('Firestore subscribeMantenimientos error:', e);
    });
    const unsubCalibraciones = subscribeCalibraciones(setCalibraciones, (e) => {
      console.error('Firestore subscribeCalibraciones error:', e);
    });

    return () => {
      unsubPacientes();
      unsubEquipos();
      unsubAsignaciones();
      unsubAsignacionesProfesionales();
      unsubMantenimientos();
      unsubCalibraciones();
    };
  }, []);

  const dataChart = [
    { name: 'Disponibles', value: stats.equiposDisponibles, color: '#4ade80' }, // Green
    { name: 'Asignados', value: stats.equiposAsignados, color: '#60a5fa' }, // Blue
    { name: 'Mantenimiento', value: stats.equiposMantenimiento, color: '#facc15' }, // Yellow
    { name: 'Baja', value: stats.equiposBaja, color: '#f87171' }, // Red
  ].filter(d => d.value > 0);

  const StatCard = ({
    title,
    value,
    accent,
    icon,
    subtitle,
  }: {
    title: string;
    value: React.ReactNode;
    accent: string;
    icon: 'patients' | 'equipos' | 'assigned' | 'maintenance';
    subtitle: string;
  }) => (
    <div className="md-card p-4 sm:p-5 relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: accent }} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">{title}</p>
          <p className="mt-2 text-2xl sm:text-3xl font-extrabold text-gray-900">{value}</p>
          <p className="mt-2 text-sm text-gray-500">{subtitle}</p>
        </div>
        <div
          className="h-11 w-11 rounded-2xl flex items-center justify-center"
          style={{ background: `${accent}20`, color: accent }}
        >
          <StatIcon type={icon} />
        </div>
      </div>
    </div>
  );

  return (
    <Layout title="Dashboard Gerencial">
      {firestoreError && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded p-3 text-sm">
          {firestoreError}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-6 mb-8">
        <StatCard
          title="Pacientes Activos"
          value={stats.pacientesActivos}
          accent="#22c55e"
          icon="patients"
          subtitle="Usuarios en programa"
        />
        <StatCard
          title="Total Equipos"
          value={stats.totalEquipos}
          accent="#2563eb"
          icon="equipos"
          subtitle="Inventario registrado"
        />
        <div className="md-card p-4 sm:p-5 relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: '#0ea5e9' }} />
          <div className="flex items-start justify-between">
            <div className="w-full">
              <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">Costo equipos (MEDICUC)</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-xl sm:text-2xl font-extrabold text-gray-900">
                  {selectedYear ? formatCurrency(costoTotalYear) : '—'}
                </p>
                <select
                  className="border rounded px-2 py-1 text-xs text-gray-700 bg-white"
                  value={selectedYear ?? ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSelectedYear(value === 'ALL' ? 'ALL' : Number(value));
                  }}
                  disabled={availableYears.length === 0}
                >
                  {availableYears.length === 0 && <option value="">Año</option>}
                  {availableYears.length > 0 && (
                    <option value="ALL">Todo</option>
                  )}
                  {availableYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-2 text-sm text-gray-500">
                {selectedYear === 'ALL'
                  ? `Total general · ${costoTotalCount} equipos`
                  : `Por año de ingreso · ${costoTotalCount} equipos`}
              </p>
            </div>
            <div
              className="h-11 w-11 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(14,165,233,0.15)', color: '#0ea5e9' }}
            >
              <StatIcon type="equipos" />
            </div>
          </div>
        </div>
        <div className="md-card p-4 sm:p-5 relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: '#ef4444' }} />
          <div className="flex items-start justify-between">
            <div className="w-full">
              <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">Costo mantenimientos</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-xl sm:text-2xl font-extrabold text-gray-900">
                  {selectedYearMantenimiento ? formatCurrency(costoMantenimientoTotal) : '—'}
                </p>
                <select
                  className="border rounded px-2 py-1 text-xs text-gray-700 bg-white"
                  value={selectedYearMantenimiento ?? ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSelectedYearMantenimiento(value === 'ALL' ? 'ALL' : Number(value));
                  }}
                  disabled={availableYearsMantenimiento.length === 0}
                >
                  {availableYearsMantenimiento.length === 0 && <option value="">Año</option>}
                  {availableYearsMantenimiento.length > 0 && (
                    <option value="ALL">Todo</option>
                  )}
                  {availableYearsMantenimiento.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-2 text-sm text-gray-500">
                {selectedYearMantenimiento === 'ALL'
                  ? `Total general · ${costoMantenimientoCount} mantenimientos`
                  : `Por año · ${costoMantenimientoCount} mantenimientos`}
              </p>
            </div>
            <div
              className="h-11 w-11 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
            >
              <StatIcon type="maintenance" />
            </div>
          </div>
        </div>
        <div className="md-card p-4 sm:p-5 relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: '#10b981' }} />
          <div className="flex items-start justify-between">
            <div className="w-full">
              <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">Costo calibraciones</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-xl sm:text-2xl font-extrabold text-gray-900">
                  {selectedYearCalibracion ? formatCurrency(costoCalibracionTotal) : '—'}
                </p>
                <select
                  className="border rounded px-2 py-1 text-xs text-gray-700 bg-white"
                  value={selectedYearCalibracion ?? ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSelectedYearCalibracion(value === 'ALL' ? 'ALL' : Number(value));
                  }}
                  disabled={availableYearsCalibracion.length === 0}
                >
                  {availableYearsCalibracion.length === 0 && <option value="">Año</option>}
                  {availableYearsCalibracion.length > 0 && (
                    <option value="ALL">Todo</option>
                  )}
                  {availableYearsCalibracion.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-2 text-sm text-gray-500">
                {selectedYearCalibracion === 'ALL'
                  ? `Total general · ${costoCalibracionCount} calibraciones`
                  : `Por año · ${costoCalibracionCount} calibraciones`}
              </p>
            </div>
            <div
              className="h-11 w-11 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}
            >
              <StatIcon type="maintenance" />
            </div>
          </div>
        </div>
        <StatCard
          title="Pacientes con Acta Activa"
          value={stats.pacientesConActaActiva}
          accent="#14b8a6"
          icon="patients"
          subtitle="Con al menos una asignación activa"
        />
        <StatCard
          title="Equipos Asignados (Pacientes)"
          value={stats.equiposAsignadosPacientes}
          accent="#2563eb"
          icon="assigned"
          subtitle="Activos en pacientes"
        />
        <StatCard
          title="Equipos Asignados (Profesionales)"
          value={stats.equiposAsignadosProfesionales}
          accent="#7c3aed"
          icon="assigned"
          subtitle="Activos en profesionales"
        />
        <StatCard
          title="En Mantenimiento"
          value={stats.equiposMantenimiento}
          accent="#f59e0b"
          icon="maintenance"
          subtitle="Requieren revisión"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Chart */}
        <div className="md-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <span className="inline-flex h-9 w-9 rounded-2xl items-center justify-center" style={{ background: 'rgba(37,99,235,0.12)', color: '#2563eb' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3v18h18" />
                  <path d="M7 14l4-4 3 3 6-6" />
                </svg>
              </span>
              Distribución de Equipos
            </h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={dataChart}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {dataChart.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="md-card p-6 overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <span className="inline-flex h-9 w-9 rounded-2xl items-center justify-center" style={{ background: 'rgba(124,58,237,0.12)', color: '#7c3aed' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 8v4l3 3" />
                  <path d="M3.05 11a9 9 0 1 1 .5 4" />
                  <path d="M3 16v5h5" />
                </svg>
              </span>
              Últimas Asignaciones
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Paciente</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Equipo</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {recentAssignments.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                      {new Date(a.fechaAsignacion).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 font-medium">
                      {a.nombrePaciente}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                      {a.nombreEquipo}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <StatusBadge status={a.estado} />
                    </td>
                  </tr>
                ))}
                {recentAssignments.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-sm text-gray-500">
                      No hay actividad reciente.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showCalibPopup && isBiomedico && calibracionesProximas.length > 0 && (
        <div className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl">
            <div className="text-lg font-bold text-gray-900">Calibraciones próximas a vencer</div>
            <div className="mt-1 text-sm text-gray-500">
              Equipos MEDICUC con calibración dentro de los próximos 30 días.
            </div>
            <div className="mt-4 max-h-64 overflow-auto space-y-2">
              {calibracionesProximas.map(({ eq, days, next }) => (
                <div key={eq.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
                  <div>
                    <div className="font-semibold text-gray-800">{eq.codigoInventario} · {eq.nombre}</div>
                    <div className="text-xs text-gray-500">Próxima: {next.toLocaleDateString()}</div>
                  </div>
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full ${days < 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    {days < 0 ? `VENCIDA (${Math.abs(days)}d)` : `POR VENCER (${days}d)`}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                className="md-btn md-btn-outlined"
                onClick={() => {
                  localStorage.setItem('calibraciones_popup_dismissed', new Date().toISOString().slice(0, 10));
                  setShowCalibPopup(false);
                }}
              >
                Cerrar
              </button>
              <button
                type="button"
                className="md-btn md-btn-filled"
                onClick={() => {
                  localStorage.setItem('calibraciones_popup_dismissed', new Date().toISOString().slice(0, 10));
                  setShowCalibPopup(false);
                  window.location.hash = '#/calibraciones';
                }}
              >
                Ver calibraciones
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Dashboard;
