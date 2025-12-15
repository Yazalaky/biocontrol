import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { db } from '../services/db';
import { EstadoEquipo, EstadoPaciente } from '../types';
import StatusBadge from '../components/StatusBadge';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

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

  useEffect(() => {
    // Cargar datos
    const pacientes = db.getPacientes();
    const equipos = db.getEquipos();
    const asignaciones = db.getAllAsignaciones();

    setStats({
      pacientesActivos: pacientes.filter(p => p.estado === EstadoPaciente.ACTIVO).length,
      totalEquipos: equipos.length,
      equiposDisponibles: equipos.filter(e => e.estado === EstadoEquipo.DISPONIBLE).length,
      equiposAsignados: equipos.filter(e => e.estado === EstadoEquipo.ASIGNADO).length,
      equiposMantenimiento: equipos.filter(e => e.estado === EstadoEquipo.MANTENIMIENTO).length,
      equiposBaja: equipos.filter(e => e.estado === EstadoEquipo.DADO_DE_BAJA).length,
    });

    // Enriquecer asignaciones para mostrar nombres
    const enriched = asignaciones.slice(-5).reverse().map(a => {
      const p = pacientes.find(pat => pat.id === a.idPaciente);
      const e = equipos.find(eq => eq.id === a.idEquipo);
      return {
        ...a,
        nombrePaciente: p ? p.nombreCompleto : 'Desconocido', // Actualizado a nombreCompleto
        nombreEquipo: e ? e.nombre : 'Desconocido'
      };
    });
    setRecentAssignments(enriched);
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