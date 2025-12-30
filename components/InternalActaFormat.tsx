import React, { useState } from 'react';
import { EstadoActaInterna, type ActaInterna } from '../types';

interface InternalActaFormatProps {
  acta: ActaInterna;
}

const InternalActaFormat: React.FC<InternalActaFormatProps> = ({ acta }) => {
  const fecha = new Date(acta.fecha || new Date().toISOString());
  const logoCandidates = ['/redinsalud-logo.png', '/redinsalud-logo.jpg', '/redinsalud-logo.svg'] as const;
  const [logoIndex, setLogoIndex] = useState(0);
  const [logoFailed, setLogoFailed] = useState(false);
  const logoSrc = logoCandidates[logoIndex];

  return (
    <div className="acta-page force-light bg-white text-black font-sans w-[8.5in] min-h-[11in] mx-auto border border-gray-300 shadow-none print:border-none print:shadow-none">
      {/* Encabezado */}
      <div className="border border-black mx-[0.35in] mt-[0.35in]">
        <div className="flex">
          <div className="w-[28%] border-r border-black p-2 flex items-center justify-center">
            {!logoFailed && logoSrc ? (
              <img
                src={logoSrc}
                alt="redinsalud"
                className="max-h-12 w-auto object-contain"
                onError={() => {
                  setLogoIndex((i) => {
                    const next = i + 1;
                    if (next < logoCandidates.length) return next;
                    setLogoFailed(true);
                    return i;
                  });
                }}
              />
            ) : null}
            {logoFailed && <div className="text-sm font-bold">redinsalud</div>}
          </div>
          <div className="w-[72%] p-2 text-center">
            <div className="font-bold text-[12px]">FORMATO DE ENTREGA DE EQUIPOS</div>
            <div className="font-semibold text-[10px] mt-1">GTE-GTE-FT-17, VERSION 1</div>
            <div className="font-bold text-[10px] mt-1">GESTIÓN DE LA TECNOLOGÍA</div>
          </div>
        </div>
      </div>

      {/* Bloque superior */}
      <div className="mx-[0.35in] mt-2 border border-black">
        <div className="grid grid-cols-12 border-b border-black text-[10px]">
          <div className="col-span-2 border-r border-black p-1 font-semibold bg-white">Fecha</div>
          <div className="col-span-3 border-r border-black p-1 bg-white text-black">{fecha.toLocaleDateString()}</div>
          <div className="col-span-2 border-r border-black p-1 font-semibold bg-white">Acta No.</div>
          <div className="col-span-1 border-r border-black p-1 bg-white text-black text-center font-bold">{String(acta.consecutivo || 0)}</div>
          <div className="col-span-2 border-r border-black p-1 font-semibold bg-white">Ciudad</div>
          <div className="col-span-2 p-1 bg-white text-black font-semibold">{acta.ciudad || ''}</div>
        </div>
        <div className="grid grid-cols-12 border-b border-black text-[10px]">
          <div className="col-span-2 border-r border-black p-1 font-semibold bg-white">Sede</div>
          <div className="col-span-4 border-r border-black p-1 bg-white text-black font-semibold">{acta.sede || ''}</div>
          <div className="col-span-2 border-r border-black p-1 font-semibold bg-white">Area</div>
          <div className="col-span-4 p-1 bg-white text-black font-semibold">{acta.area || 'Biomedica'}</div>
        </div>
        <div className="grid grid-cols-12 text-[10px]">
          <div className="col-span-6 border-r border-black p-1 font-semibold bg-white">
            Nombres y Apellidos de quien recibe
          </div>
          <div className="col-span-3 border-r border-black p-1 bg-white text-black font-semibold">
            {acta.recibeNombre || ''}
          </div>
          <div className="col-span-1 border-r border-black p-1 font-semibold bg-white text-center">Cargo</div>
          <div className="col-span-2 p-1 bg-white text-black font-semibold leading-tight break-words">
            {acta.cargoRecibe || 'Auxiliar Administrativa'}
          </div>
        </div>
      </div>

      {/* Tabla equipos */}
      <div className="mx-[0.35in] mt-2 border border-black">
        <div className="grid grid-cols-12 text-[10px] font-semibold">
          <div className="col-span-2 border-r border-black p-1 bg-white">ACTIVO</div>
          <div className="col-span-3 border-r border-black p-1 bg-white">EQUIPO</div>
          <div className="col-span-2 border-r border-black p-1 bg-white">Marca</div>
          <div className="col-span-2 border-r border-black p-1 bg-white">Serie</div>
          <div className="col-span-2 border-r border-black p-1 bg-white">Modelo</div>
          <div className="col-span-1 p-1 bg-white">Estado</div>
        </div>
        <div className="border-t border-black">
          {(acta.items || []).length ? (
            acta.items.map((it, idx) => (
              <div key={`${it.idEquipo}-${idx}`} className="grid grid-cols-12 text-[10px] border-t border-black">
                <div className="col-span-2 border-r border-black p-1 bg-white">{it.codigoInventario}</div>
                <div className="col-span-3 border-r border-black p-1 bg-white">{it.nombre}</div>
                <div className="col-span-2 border-r border-black p-1 bg-white">{it.marca}</div>
                <div className="col-span-2 border-r border-black p-1 bg-white">{it.numeroSerie}</div>
                <div className="col-span-2 border-r border-black p-1 bg-white">{it.modelo}</div>
                <div className="col-span-1 p-1 bg-white">
                  {it.estado === 'DISPONIBLE' || !it.estado ? 'NUEVO' : it.estado}
                </div>
              </div>
            ))
          ) : (
            <div className="p-3 text-center text-gray-700 bg-white">Sin equipos.</div>
          )}
        </div>

        <div className="border-t border-black p-2 bg-white text-[10px] min-h-[70px]">
          <span className="font-semibold">Observaciones:</span>{' '}
          <span className="whitespace-pre-wrap break-words">{acta.observaciones || ''}</span>
        </div>
      </div>

      {/* Condiciones */}
      <div className="mx-[0.35in] mt-3 text-[9px] leading-snug">
        <div className="mb-1">
          En esta acta de entrega el responsable de los activos fijos tangibles debe tener conocimiento de las siguientes condiciones:
        </div>
        <div className="space-y-1">
          <div className="flex gap-2">
            <span className="w-4">a.</span>
            <span>
              Tiene la responsabilidad del uso y custodia de los bienes anteriormente detallados y asignados en esta dependencia
            </span>
          </div>
          <div className="flex gap-2">
            <span className="w-4">b.</span>
            <span>
              Velar que los referidos bienes están destinados única y exclusivamente para fines institucionales
            </span>
          </div>
          <div className="flex gap-2">
            <span className="w-4">c.</span>
            <span>
              Adoptar todas las medidas para que estos bienes no estén expuestos a situaciones de deterioro, robo o hurto.
            </span>
          </div>
          <div className="flex gap-2">
            <span className="w-4">d.</span>
            <span>Velar porque los bienes no sean sometidos a usos inadecuados</span>
          </div>
          <div className="flex gap-2">
            <span className="w-4">e.</span>
            <span>
              En los casos que corresponda, solicitar su mantenimiento (vehículos o maquinaria especializada)
            </span>
          </div>
          <div className="flex gap-2">
            <span className="w-4">f.</span>
            <span>
              Cuando sea necesario trasladar alguno de estos bienes dentro o fuera de la sede o departamentos de la IPS solicitar al área de mantenimiento e infraestructura y/o TIC´s, según sea el caso mediante correo electrónico institucional
            </span>
          </div>
          <div className="flex gap-2">
            <span className="w-4">g.</span>
            <span>
              Toda vez que el uso inadecuado o negligente de los bienes produzca su pérdida o daño, el valor total o parcial de los bienes afectados debe ser restituido
            </span>
          </div>
          <div className="flex gap-2">
            <span className="w-4">h.</span>
            <span>
              Este documento anula y reemplaza cualquier formato de entrega de activos fijos tangibles anteriores a la fecha
            </span>
          </div>
        </div>
      </div>

      {/* Firmas */}
      <div className="mx-[0.35in] mt-6 grid grid-cols-2 gap-10">
        <div>
          <div className="h-12 flex items-center justify-center overflow-hidden">
            {acta.firmaEntrega ? (
              <img src={acta.firmaEntrega} alt="Firma entrega" className="max-h-12 max-w-full object-contain" />
            ) : (
              <span className="text-[8px] text-gray-400 italic">Firma pendiente</span>
            )}
          </div>
          <div className="border-t border-black mt-1 pt-1 text-[9px]">
            <div className="font-semibold">Firma de quien entrega</div>
            <div>Nombre: {acta.entregaNombre || ''}</div>
            <div>Cargo: BIOMEDICO</div>
          </div>
        </div>
        <div>
          <div className="h-12 flex items-center justify-center overflow-hidden">
            {acta.firmaRecibe ? (
              <img src={acta.firmaRecibe} alt="Firma recibe" className="max-h-12 max-w-full object-contain" />
            ) : (
              <span className="text-[8px] text-gray-400 italic">Firma pendiente</span>
            )}
          </div>
          <div className="border-t border-black mt-1 pt-1 text-[9px]">
            <div className="font-semibold">Firma de quien recibe</div>
            <div>Nombre: {acta.recibeNombre || ''}</div>
            <div>Cargo: {acta.cargoRecibe || 'Auxiliar Administrativa'}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InternalActaFormat;
