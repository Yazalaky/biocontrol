import React, { useMemo, useRef, useState } from 'react';
import Layout from '../components/Layout';
import { toast } from '../services/feedback';
import { EstadoAsignacion, type Asignacion, type EquipoBiomedico, type Paciente } from '../types';
import {
  subscribeDevolucionesByMonth,
  subscribeEntregasByMonth,
  subscribeEquipos,
  subscribePacientes,
} from '../services/firestoreData';

function monthToRangeIso(month: string): { start: string; end: string } {
  const [yStr, mStr] = month.split('-');
  const year = Number(yStr);
  const monthIndex = Number(mStr) - 1; // 0-based
  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0));
  return { start: start.toISOString(), end: end.toISOString() };
}

function isoToDateLabel(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('es-CO');
}

function padActa(n?: number): string {
  if (typeof n !== 'number') return '-';
  return String(n).padStart(4, '0');
}

function escapeCsv(value: unknown): string {
  const s = value == null ? '' : String(value);
  const escaped = s.replace(/"/g, '""');
  return `"${escaped}"`;
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) {
    toast({ tone: 'warning', message: 'No hay datos para exportar.' });
    return;
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(escapeCsv).join(','),
    ...rows.map((r) => headers.map((h) => escapeCsv((r as any)[h])).join(',')),
  ];

  // BOM para que Excel abra bien acentos (UTF-8).
  const csv = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const Reports: React.FC = () => {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [month, setMonth] = useState(defaultMonth);
  const { start, end } = useMemo(() => monthToRangeIso(month), [month]);

  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [equipos, setEquipos] = useState<EquipoBiomedico[]>([]);
  const [entregas, setEntregas] = useState<Asignacion[]>([]);
  const [devoluciones, setDevoluciones] = useState<Asignacion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const printRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setError(null);
    const unsubs: Array<() => void> = [];

    unsubs.push(
      subscribePacientes(setPacientes, (e) => setError(e.message)),
      subscribeEquipos(setEquipos, (e) => setError(e.message)),
      subscribeEntregasByMonth(start, end, setEntregas, (e) => setError(e.message)),
      subscribeDevolucionesByMonth(start, end, setDevoluciones, (e) => setError(e.message)),
    );

    return () => unsubs.forEach((u) => u());
  }, [start, end]);

  const pacientesById = useMemo(() => new Map(pacientes.map((p) => [p.id, p])), [pacientes]);
  const equiposById = useMemo(() => new Map(equipos.map((e) => [e.id, e])), [equipos]);

  const entregasSummary = useMemo(() => {
    const patientIds = new Set(entregas.map((a) => a.idPaciente));
    const equipoIds = new Set(entregas.map((a) => a.idEquipo));
    const activas = entregas.filter((a) => a.estado === EstadoAsignacion.ACTIVA).length;
    return { total: entregas.length, pacientes: patientIds.size, equipos: equipoIds.size, activas };
  }, [entregas]);

  const devolucionesSummary = useMemo(() => {
    const patientIds = new Set(devoluciones.map((a) => a.idPaciente));
    const equipoIds = new Set(devoluciones.map((a) => a.idEquipo));
    return { total: devoluciones.length, pacientes: patientIds.size, equipos: equipoIds.size };
  }, [devoluciones]);

  const exportEntregasExcel = () => {
    const rows = entregas.map((a) => {
      const p = pacientesById.get(a.idPaciente);
      const e = equiposById.get(a.idEquipo);
      return {
        Mes: month,
        Acta: padActa(a.consecutivo),
        'Fecha entrega': isoToDateLabel(a.fechaAsignacion),
        Paciente: p?.nombreCompleto || '—',
        'Documento paciente': p?.numeroDocumento || '—',
        Equipo: e?.nombre || '—',
        'Código inventario': e?.codigoInventario || '—',
        Serie: e?.numeroSerie || '—',
        Marca: e?.marca || '—',
        Modelo: e?.modelo || '—',
        Estado: a.estado || '—',
        'Auxiliar (usuarioAsigna)': a.usuarioAsigna || '—',
      };
    });
    downloadCsv(`entregas_${month}.csv`, rows);
  };

  const exportDevolucionesExcel = () => {
    const rows = devoluciones.map((a) => {
      const p = pacientesById.get(a.idPaciente);
      const e = equiposById.get(a.idEquipo);
      return {
        Mes: month,
        Acta: padActa(a.consecutivo),
        'Fecha devolución': isoToDateLabel(a.fechaDevolucion),
        'Fecha entrega': isoToDateLabel(a.fechaAsignacion),
        Paciente: p?.nombreCompleto || '—',
        'Documento paciente': p?.numeroDocumento || '—',
        Equipo: e?.nombre || '—',
        'Código inventario': e?.codigoInventario || '—',
        Serie: e?.numeroSerie || '—',
        Marca: e?.marca || '—',
        Modelo: e?.modelo || '—',
        'Estado final equipo': a.estadoFinalEquipo || '—',
        Observaciones: a.observacionesDevolucion || '—',
      };
    });
    downloadCsv(`devoluciones_${month}.csv`, rows);
  };

  const handlePrintPdf = () => {
    const el = printRef.current;
    if (!el) return;

    const existing = document.getElementById('reports-print-root');
    existing?.remove();

    const printRoot = document.createElement('div');
    printRoot.id = 'reports-print-root';
    printRoot.appendChild(el.cloneNode(true));
    document.body.appendChild(printRoot);
    document.body.classList.add('printing-reports');

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      document.body.classList.remove('printing-reports');
      printRoot.remove();
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup);
    window.print();
    setTimeout(cleanup, 2000);
  };

  return (
    <Layout title="Informes Mensuales">
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded p-3 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-4 mb-6 flex flex-col md:flex-row gap-3 md:items-end md:justify-between">
        <div>
          <label className="block text-sm font-medium text-gray-700">Mes del informe</label>
          <input
            type="month"
            className="mt-1 border p-2 rounded"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <p className="text-xs text-gray-500 mt-1">
            Entregas: por <span className="font-mono">fechaAsignacion</span> / Devoluciones: por{' '}
            <span className="font-mono">fechaDevolucion</span>
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-2">
          <button onClick={exportEntregasExcel} className="px-4 py-2 bg-emerald-600 text-white rounded">
            Exportar Entregas (Excel)
          </button>
          <button onClick={exportDevolucionesExcel} className="px-4 py-2 bg-emerald-700 text-white rounded">
            Exportar Devoluciones (Excel)
          </button>
          <button onClick={handlePrintPdf} className="px-4 py-2 bg-blue-600 text-white rounded">
            Imprimir / Guardar PDF
          </button>
        </div>
      </div>

      <div ref={printRef} className="bg-white rounded-lg shadow p-6">
        <div className="mb-6">
          <h3 className="text-lg font-bold text-gray-900">Informe Mensual</h3>
          <p className="text-sm text-gray-600">
            Periodo: <span className="font-medium">{month}</span>
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="border rounded p-4">
            <h4 className="font-bold text-gray-800 mb-2">Entregas</h4>
            <div className="text-sm text-gray-700 space-y-1">
              <div>Total entregas: <span className="font-semibold">{entregasSummary.total}</span></div>
              <div>Pacientes únicos: <span className="font-semibold">{entregasSummary.pacientes}</span></div>
              <div>Equipos únicos: <span className="font-semibold">{entregasSummary.equipos}</span></div>
              <div>Activas (sin devolución): <span className="font-semibold">{entregasSummary.activas}</span></div>
            </div>
          </div>

          <div className="border rounded p-4">
            <h4 className="font-bold text-gray-800 mb-2">Devoluciones</h4>
            <div className="text-sm text-gray-700 space-y-1">
              <div>Total devoluciones: <span className="font-semibold">{devolucionesSummary.total}</span></div>
              <div>Pacientes únicos: <span className="font-semibold">{devolucionesSummary.pacientes}</span></div>
              <div>Equipos únicos: <span className="font-semibold">{devolucionesSummary.equipos}</span></div>
            </div>
          </div>
        </div>

        <h4 className="font-bold text-gray-900 mb-2">Detalle de Entregas</h4>
        <div className="overflow-x-auto mb-8">
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="border px-2 py-1 text-left">Acta</th>
                <th className="border px-2 py-1 text-left">Fecha</th>
                <th className="border px-2 py-1 text-left">Paciente</th>
                <th className="border px-2 py-1 text-left">Documento</th>
                <th className="border px-2 py-1 text-left">Equipo</th>
                <th className="border px-2 py-1 text-left">Código</th>
                <th className="border px-2 py-1 text-left">Serie</th>
                <th className="border px-2 py-1 text-left">Estado</th>
              </tr>
            </thead>
            <tbody>
              {entregas.length === 0 ? (
                <tr>
                  <td className="border px-2 py-2 text-center text-gray-500" colSpan={8}>
                    No hay entregas en este mes.
                  </td>
                </tr>
              ) : (
                entregas.map((a) => {
                  const p = pacientesById.get(a.idPaciente);
                  const e = equiposById.get(a.idEquipo);
                  return (
                    <tr key={a.id}>
                      <td className="border px-2 py-1">{padActa(a.consecutivo)}</td>
                      <td className="border px-2 py-1">{isoToDateLabel(a.fechaAsignacion)}</td>
                      <td className="border px-2 py-1">{p?.nombreCompleto || '—'}</td>
                      <td className="border px-2 py-1">{p?.numeroDocumento || '—'}</td>
                      <td className="border px-2 py-1">{e?.nombre || '—'}</td>
                      <td className="border px-2 py-1 font-mono">{e?.codigoInventario || '—'}</td>
                      <td className="border px-2 py-1 font-mono">{e?.numeroSerie || '—'}</td>
                      <td className="border px-2 py-1">{a.estado}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <h4 className="font-bold text-gray-900 mb-2">Detalle de Devoluciones</h4>
        <div className="overflow-x-auto">
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="border px-2 py-1 text-left">Acta</th>
                <th className="border px-2 py-1 text-left">Fecha devolución</th>
                <th className="border px-2 py-1 text-left">Paciente</th>
                <th className="border px-2 py-1 text-left">Documento</th>
                <th className="border px-2 py-1 text-left">Equipo</th>
                <th className="border px-2 py-1 text-left">Código</th>
                <th className="border px-2 py-1 text-left">Serie</th>
                <th className="border px-2 py-1 text-left">Estado final</th>
              </tr>
            </thead>
            <tbody>
              {devoluciones.length === 0 ? (
                <tr>
                  <td className="border px-2 py-2 text-center text-gray-500" colSpan={8}>
                    No hay devoluciones en este mes.
                  </td>
                </tr>
              ) : (
                devoluciones.map((a) => {
                  const p = pacientesById.get(a.idPaciente);
                  const e = equiposById.get(a.idEquipo);
                  return (
                    <tr key={a.id}>
                      <td className="border px-2 py-1">{padActa(a.consecutivo)}</td>
                      <td className="border px-2 py-1">{isoToDateLabel(a.fechaDevolucion)}</td>
                      <td className="border px-2 py-1">{p?.nombreCompleto || '—'}</td>
                      <td className="border px-2 py-1">{p?.numeroDocumento || '—'}</td>
                      <td className="border px-2 py-1">{e?.nombre || '—'}</td>
                      <td className="border px-2 py-1 font-mono">{e?.codigoInventario || '—'}</td>
                      <td className="border px-2 py-1 font-mono">{e?.numeroSerie || '—'}</td>
                      <td className="border px-2 py-1">{a.estadoFinalEquipo || '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
};

export default Reports;
