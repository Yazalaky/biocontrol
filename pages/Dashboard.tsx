import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { EstadoAsignacion, EstadoEquipo, EstadoPaciente, type Asignacion, type EquipoBiomedico, type Paciente } from '../types';
import StatusBadge from '../components/StatusBadge';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { subscribeAsignaciones, subscribeEquipos, subscribePacientes } from '../services/firestoreData';

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({
    pacientesActivos: 0,
    totalEquipos: 0,
    equiposDisponibles: 0,
    equiposAsignados: 0,
    equiposMantenimiento: 0,
    equiposBaja: 0
  });

  const [recentAssignments, setRecentAssignments] = useState<any[]>([]);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  useEffect(() => {
    let pacientes: Paciente[] = [];
    let equipos: EquipoBiomedico[] = [];
    let asignaciones: Asignacion[] = [];

    const recompute = () => {
      const activos = new Set(asignaciones.filter((a) => a.estado === EstadoAsignacion.ACTIVA).map((a) => a.idEquipo));
      const lastFinalEstadoByEquipo = new Map<string, { date: number; estadoFinal: EstadoEquipo }>();
      for (const a of asignaciones) {
        if (a.estado !== EstadoAsignacion.FINALIZADA) continue;
        if (!a.estadoFinalEquipo) continue;
        const date = new Date(a.fechaDevolucion || a.fechaAsignacion).getTime();
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
        totalEquipos: equipos.length,
        equiposDisponibles: estados.filter((s) => s === EstadoEquipo.DISPONIBLE).length,
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

    return () => {
      unsubPacientes();
      unsubEquipos();
      unsubAsignaciones();
    };
  }, []);

  const dataChart = [
    { name: 'Disponibles', value: stats.equiposDisponibles, color: '#4ade80' }, // Green
    { name: 'Asignados', value: stats.equiposAsignados, color: '#60a5fa' }, // Blue
    { name: 'Mantenimiento', value: stats.equiposMantenimiento, color: '#facc15' }, // Yellow
    { name: 'Baja', value: stats.equiposBaja, color: '#f87171' }, // Red
  ].filter(d => d.value > 0);

  const StatCard = ({ title, value, color }: { title: string, value: number, color: string }) => (
    <div className={`bg-white rounded-lg shadow p-6 border-l-4 ${color}`}>
      <div className="flex items-center">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-500 truncate">{title}</p>
          <p className="mt-1 text-3xl font-semibold text-gray-900">{value}</p>
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard title="Pacientes Activos" value={stats.pacientesActivos} color="border-green-500" />
        <StatCard title="Total Equipos" value={stats.totalEquipos} color="border-blue-500" />
        <StatCard title="Equipos Asignados" value={stats.equiposAsignados} color="border-indigo-500" />
        <StatCard title="En Mantenimiento" value={stats.equiposMantenimiento} color="border-yellow-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Distribución de Equipos</h3>
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
        <div className="bg-white rounded-lg shadow p-6 overflow-hidden">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Últimas Asignaciones</h3>
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
                  <tr key={a.id}>
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
    </Layout>
  );
};

export default Dashboard;
