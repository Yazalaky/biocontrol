import React, { useState } from 'react';
import { TipoMantenimiento, type Mantenimiento } from '../types';

interface Props {
  mantenimiento: Mantenimiento;
}

const formatDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
};

const MantenimientoFormat: React.FC<Props> = ({ mantenimiento }) => {
  const logoCandidates = ['/medicuc-logo.png', '/medicuc-logo.jpg', '/medicuc-logo.svg'] as const;
  const [logoIndex, setLogoIndex] = useState(0);
  const [logoFailed, setLogoFailed] = useState(false);
  const logoSrc = logoCandidates[logoIndex];

  const repuestos = mantenimiento.repuestos && mantenimiento.repuestos.length
    ? mantenimiento.repuestos
    : [{ cantidad: 1, descripcion: 'NINGUNO' }];

  return (
    <div className="acta-page force-light bg-white text-black p-6 text-[10px] font-sans w-[8.5in] min-h-[11in] mx-auto border border-gray-300 shadow-none print:border-none print:shadow-none">
      <div className="border-2 border-black">
        <div className="grid grid-cols-[160px_1fr]">
          <div className="border-r-2 border-black p-2 flex items-center justify-center">
            {!logoFailed && logoSrc ? (
              <img
                src={logoSrc}
                alt="Medicuc IPS"
                className="max-h-12 object-contain"
                onError={() => {
                  setLogoIndex((i) => {
                    const next = i + 1;
                    if (next < logoCandidates.length) return next;
                    setLogoFailed(true);
                    return i;
                  });
                }}
              />
            ) : (
              <div className="text-sm font-bold text-orange-600 tracking-tighter">medicuc</div>
            )}
          </div>
          <div className="p-2 text-center">
            <div className="font-bold text-sm">REPORTE DE SERVICIO</div>
            <div className="text-[9px]">GTE-GTE-FT-05, VERSION 1</div>
            <div className="font-semibold text-[9px]">GESTIÓN DE LA TECNOLOGÍA</div>
          </div>
        </div>
      </div>

      <div className="border-2 border-black mt-3">
        <div className="bg-orange-700 text-white text-center text-[10px] font-bold py-1">DATOS TÉCNICOS</div>
        <table className="w-full border-collapse text-[9px]">
          <tbody>
            <tr>
              <td className="border border-black px-2 py-1 font-semibold">Sede</td>
              <td className="border border-black px-2 py-1">{mantenimiento.sede || '—'}</td>
              <td className="border border-black px-2 py-1 font-semibold">Fecha</td>
              <td className="border border-black px-2 py-1">{formatDate(mantenimiento.fecha)}</td>
              <td className="border border-black px-2 py-1 font-semibold">No.</td>
              <td className="border border-black px-2 py-1 text-red-600 font-bold">
                {mantenimiento.consecutivo || '—'}
              </td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 font-semibold">Dirección</td>
              <td className="border border-black px-2 py-1">{mantenimiento.direccion || '—'}</td>
              <td className="border border-black px-2 py-1 font-semibold">Teléfono</td>
              <td className="border border-black px-2 py-1">{mantenimiento.telefono || '—'}</td>
              <td className="border border-black px-2 py-1 font-semibold">Email</td>
              <td className="border border-black px-2 py-1">{mantenimiento.email || '—'}</td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 font-semibold">Ciudad</td>
              <td className="border border-black px-2 py-1">{mantenimiento.ciudad || '—'}</td>
              <td className="border border-black px-2 py-1 font-semibold">Equipo</td>
              <td className="border border-black px-2 py-1">{mantenimiento.equipoNombre || '—'}</td>
              <td className="border border-black px-2 py-1 font-semibold">Marca</td>
              <td className="border border-black px-2 py-1">{mantenimiento.marca || '—'}</td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 font-semibold">Modelo</td>
              <td className="border border-black px-2 py-1">{mantenimiento.modelo || '—'}</td>
              <td className="border border-black px-2 py-1 font-semibold">Serie</td>
              <td className="border border-black px-2 py-1">{mantenimiento.serie || '—'}</td>
              <td className="border border-black px-2 py-1 font-semibold">Ubicación</td>
              <td className="border border-black px-2 py-1">{mantenimiento.ubicacion || '—'}</td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 font-semibold">N° Activo</td>
              <td className="border border-black px-2 py-1">{mantenimiento.codigoInventario || '—'}</td>
              <td className="border border-black px-2 py-1 font-semibold">Tipo</td>
              <td className="border border-black px-2 py-1" colSpan={3}>
                <span
                  className={`inline-flex px-2 py-0.5 rounded text-[9px] font-bold ${
                    mantenimiento.tipo === TipoMantenimiento.CORRECTIVO
                      ? 'bg-red-600 text-white'
                      : 'bg-green-600 text-white'
                  }`}
                >
                  {mantenimiento.tipo === TipoMantenimiento.CORRECTIVO ? 'CORRECTIVO' : 'PREVENTIVO'}
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="border-t-2 border-black text-center text-[9px] font-bold py-1">
          FALLA REPORTADA
        </div>
        <div className="border-t border-black px-2 py-2 min-h-[28px]">
          {mantenimiento.fallaReportada || '—'}
        </div>
        <div className="border-t-2 border-black text-center text-[9px] font-bold py-1">
          FALLA ENCONTRADA
        </div>
        <div className="border-t border-black px-2 py-2 min-h-[28px]">
          {mantenimiento.fallaEncontrada || '—'}
        </div>
        <div className="border-t-2 border-black text-center text-[9px] font-bold py-1">
          TRABAJO REALIZADO
        </div>
        <div className="border-t border-black px-2 py-2 min-h-[50px]">
          {mantenimiento.trabajoRealizado || '—'}
        </div>
        <div className="border-t-2 border-black text-center text-[9px] font-bold py-1">
          REPUESTOS DESCRIPCIÓN
        </div>
        <table className="w-full border-collapse text-[9px]">
          <thead>
            <tr>
              <th className="border border-black px-2 py-1 w-12">Cant.</th>
              <th className="border border-black px-2 py-1 text-left">Descripción</th>
              <th className="border border-black px-2 py-1 w-24">Valor unitario</th>
            </tr>
          </thead>
          <tbody>
            {repuestos.map((r, idx) => (
              <tr key={`${r.descripcion}-${idx}`}>
                <td className="border border-black px-2 py-1 text-center">{r.cantidad}</td>
                <td className="border border-black px-2 py-1">{r.descripcion || '—'}</td>
                <td className="border border-black px-2 py-1 text-right">
                  {Number.isFinite(r.valor) ? r.valor : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t-2 border-black text-center text-[9px] font-bold py-1">
          TIEMPO INTERVENCIÓN / COSTOS
        </div>
        <table className="w-full border-collapse text-[9px]">
          <tbody>
            <tr>
              <td className="border border-black px-2 py-1 font-semibold">HH</td>
              <td className="border border-black px-2 py-1">{mantenimiento.hh || '—'}</td>
              <td className="border border-black px-2 py-1 font-semibold">HP</td>
              <td className="border border-black px-2 py-1">{mantenimiento.hp || '—'}</td>
              <td className="border border-black px-2 py-1 font-semibold">Costo</td>
              <td className="border border-black px-2 py-1">{mantenimiento.costo || '—'}</td>
            </tr>
          </tbody>
        </table>
        <div className="border-t-2 border-black text-center text-[9px] font-bold py-1">
          OBSERVACIONES Y/O RECOMENDACIONES GENERALES
        </div>
        <div className="border-t border-black px-2 py-2 min-h-[32px]">
          {mantenimiento.observaciones || '—'}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8 mt-6 text-[9px]">
        <div className="text-center">
          <div className="border-b border-black min-h-[60px] flex items-center justify-center">
            {mantenimiento.firmaBiomedico ? (
              <img src={mantenimiento.firmaBiomedico} alt="Firma técnico" className="max-h-16 object-contain" />
            ) : (
              <span className="text-gray-400">Firma técnico</span>
            )}
          </div>
          <div className="mt-1">FIRMA DEL TÉCNICO</div>
          <div className="text-[8px] mt-1">{mantenimiento.creadoPorNombre || '—'}</div>
        </div>
        <div className="text-center">
          <div className="border-b border-black min-h-[60px] flex items-center justify-center">
            {mantenimiento.firmaAuxiliar ? (
              <img src={mantenimiento.firmaAuxiliar} alt="Firma recibe" className="max-h-16 object-contain" />
            ) : (
              <span className="text-gray-400">Firma recibe</span>
            )}
          </div>
          <div className="mt-1">FIRMA DE QUIEN RECIBE</div>
          <div className="text-[8px] mt-1">{mantenimiento.aceptadoPorNombre || '—'}</div>
        </div>
      </div>
    </div>
  );
};

export default MantenimientoFormat;
