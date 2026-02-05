import React, { useState } from 'react';
import { type ActaProfesional, type Profesional } from '../types';

interface ActaProfesionalGroupFormatProps {
  profesional: Profesional;
  acta: ActaProfesional;
  tipoActa: 'ENTREGA';
  professionalSignature?: string | null;
  adminSignature?: string | null;
}

const ActaProfesionalGroupFormat: React.FC<ActaProfesionalGroupFormatProps> = ({
  profesional,
  acta,
  tipoActa,
  professionalSignature,
  adminSignature,
}) => {
  const fechaEntregaOriginal = new Date(acta.fechaEntregaOriginal);
  const fechaActualizacionEntrega = new Date(acta.fechaActualizacionEntrega || acta.fechaEntregaOriginal);

  const logoCandidates = ['/medicuc-logo.png', '/medicuc-logo.jpg', '/medicuc-logo.svg'] as const;
  const [logoIndex, setLogoIndex] = useState(0);
  const [logoFailed, setLogoFailed] = useState(false);
  const logoSrc = logoCandidates[logoIndex];

  return (
    <div className="acta-page force-light bg-white text-black p-8 text-xs font-sans w-[8.5in] min-h-[11in] mx-auto border border-gray-300 shadow-none print:border-none print:shadow-none">
      {/* HEADER */}
      <div className="border-2 border-black mb-4 flex">
        <div className="w-1/4 border-r-2 border-black p-2 flex items-center justify-center">
          {!logoFailed && logoSrc ? (
            <img
              src={logoSrc}
              alt="Medicuc IPS"
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
          {logoFailed && (
            <div className="text-center leading-tight">
              <h1 className="text-xl font-bold text-orange-600 tracking-tighter">medicuc</h1>
              <p className="text-[8px] text-gray-500">IPS</p>
            </div>
          )}
        </div>
        <div className="w-3/4 text-center p-2">
          <h2 className="font-bold text-sm">FORMATO DE ENTREGA Y DEVOLUCIÓN DE EQUIPOS</h2>
          <p className="font-semibold text-xs mt-1">GESTIÓN DE LA TECNOLOGÍA</p>
        </div>
      </div>

      {/* DATOS DEL PROFESIONAL */}
      <div className="bg-gray-300 font-bold text-center border-x-2 border-t-2 border-black py-1 uppercase text-[10px]">
        Datos del Profesional
      </div>
      <div className="border-2 border-black mb-4">
        <div className="flex border-b border-black">
          <div className="w-[15%] border-r border-black p-1 font-semibold bg-gray-100">Fecha actualización</div>
          <div className="w-[10%] border-r border-black p-1">{fechaActualizacionEntrega.toLocaleDateString()}</div>
          <div className="w-[10%] border-r border-black p-1 font-semibold bg-gray-100">Acta</div>
          <div className="w-[10%] border-r border-black p-1 text-center text-red-600 font-bold">
            {String(acta.consecutivo).padStart(4, '0')}
          </div>
          <div className="w-[10%] border-r border-black p-1 font-semibold bg-gray-100">Ciudad</div>
          <div className="w-[20%] border-r border-black p-1">{acta.ciudad || ''}</div>
          <div className="w-[10%] border-r border-black p-1 font-semibold bg-gray-100">Sede</div>
          <div className="w-[15%] p-1">{acta.sede || ''}</div>
        </div>

        <div className="flex border-b border-black">
          <div className="w-[20%] border-r border-black p-1 font-semibold bg-gray-100">Fecha entrega original</div>
          <div className="w-[80%] p-1">{fechaEntregaOriginal.toLocaleDateString()}</div>
        </div>

        <div className="flex border-b border-black">
          <div className="w-[15%] border-r border-black p-1 font-semibold bg-gray-100">Identificación</div>
          <div className="w-[20%] border-r border-black p-1">{profesional.cedula}</div>
          <div className="w-[15%] border-r border-black p-1 font-semibold bg-gray-100">Nombre</div>
          <div className="w-[50%] p-1">{profesional.nombre}</div>
        </div>

        <div className="flex border-b border-black">
          <div className="w-[15%] border-r border-black p-1 font-semibold bg-gray-100">Dirección</div>
          <div className="w-[50%] border-r border-black p-1">{profesional.direccion}</div>
          <div className="w-[15%] border-r border-black p-1 font-semibold bg-gray-100">Teléfono</div>
          <div className="w-[20%] p-1">{profesional.telefono}</div>
        </div>

        <div className="flex border-b border-black">
          <div className="w-[15%] border-r border-black p-1 font-semibold bg-gray-100">Cargo</div>
          <div className="w-[85%] p-1">{profesional.cargo}</div>
        </div>

        <div className="flex">
          <div className="w-[20%] border-r border-black p-1 font-bold bg-gray-100">TIPO DE NOVEDAD</div>
          <div className="w-[20%] border-r border-black p-1 flex items-center justify-center gap-2">
            <span>ENTREGA</span>
            <div className="w-4 h-4 border border-black flex items-center justify-center">
              {tipoActa === 'ENTREGA' ? 'X' : ''}
            </div>
          </div>
          <div className="w-[20%] border-r border-black p-1 flex items-center justify-center gap-2">
            <span>DEVOLUCIÓN</span>
            <div className="w-4 h-4 border border-black flex items-center justify-center"></div>
          </div>
          <div className="w-[40%] p-1 text-center italic">Entrega a profesional (múltiples equipos)</div>
        </div>
      </div>

      <p className="text-justify mb-2 text-[10px] leading-tight">
        <strong>MEDICUC IPS LTDA</strong> entrega equipos biomédicos para apoyar la adecuada prestación del servicio.
      </p>

      {/* DATOS DE LOS EQUIPOS */}
      <div className="bg-gray-300 font-bold text-center border-x-2 border-t-2 border-black py-1 uppercase text-[10px]">
        Datos de los Equipos
      </div>
      <table className="w-full border-2 border-black mb-1 text-[10px]">
        <thead>
          <tr className="bg-gray-100 border-b border-black">
            <th className="border-r border-black p-1 w-1/4">Equipo</th>
            <th className="border-r border-black p-1 w-1/5">Marca</th>
            <th className="border-r border-black p-1 w-1/5">Serie</th>
            <th className="border-r border-black p-1 w-1/5">Modelo</th>
            <th className="p-1 w-[15%]">Estado</th>
          </tr>
        </thead>
        <tbody>
          {acta.items.map((item) => (
            <tr key={item.idEquipo} className="border-b border-black h-8">
              <td className="border-r border-black p-1">{item.nombre}</td>
              <td className="border-r border-black p-1 text-center">{item.marca}</td>
              <td className="border-r border-black p-1 text-center">{item.numeroSerie}</td>
              <td className="border-r border-black p-1 text-center">{item.modelo}</td>
              <td className="p-1 text-center">{item.estado || 'BUENO'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="border-2 border-black mb-4 p-1 min-h-[60px]">
        <p className="font-bold underline text-[10px]">Observaciones</p>
        <p className="text-[10px] italic">{acta.observacionesEntrega}</p>
      </div>

      <p className="mb-4 text-[10px]">En constancia firman,</p>

      <div className="grid grid-cols-2 gap-8 border-2 border-black p-4">
        <div>
          <div className="flex mb-2 items-center">
            <span className="font-bold mr-2 w-16">Medicuc</span>
            <div className="border border-black px-2 text-[10px] mr-2 flex items-center gap-1">
              Entrega {tipoActa === 'ENTREGA' ? <span className="font-bold">X</span> : <span className="text-white">.</span>}
            </div>
            <div className="border border-black px-2 text-[10px] flex items-center gap-1">
              Recibe <span className="text-white">.</span>
            </div>
          </div>

          <div className="border border-black mt-2">
            <div className="flex border-b border-black">
              <div className="w-1/3 p-1 bg-gray-100 font-semibold border-r border-black text-[9px]">Nombre y apellidos</div>
              <div className="w-2/3 p-1 text-[9px]">{acta.usuarioAsigna}</div>
            </div>
            <div className="flex border-b border-black">
              <div className="w-1/3 p-1 bg-gray-100 font-semibold border-r border-black text-[9px]">Cargo</div>
              <div className="w-2/3 p-1 text-[9px]">Auxiliar Administrativa</div>
            </div>
            <div className="flex min-h-[50px] relative">
              <div className="w-1/3 p-1 bg-gray-100 font-semibold border-r border-black text-[9px] flex items-center">Firma</div>
              <div className="w-2/3 p-1 flex items-center justify-center overflow-hidden">
                {adminSignature ? (
                  <img src={adminSignature} alt="Firma Auxiliar" className="max-h-12 max-w-full object-contain" />
                ) : (
                  <span className="text-[8px] text-gray-300 italic">Sin firma digital</span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-2 border border-black min-h-[40px] p-1">
            <span className="font-bold text-[9px]">OBSERVACIÓN:</span>
          </div>
        </div>

        <div>
          <div className="flex mb-2 items-center">
            <span className="font-bold mr-2">Profesional</span>
            <div className="border border-black px-2 text-[10px] mr-2 flex items-center gap-1">
              Recibe {tipoActa === 'ENTREGA' ? <span className="font-bold">X</span> : <span className="text-white">.</span>}
            </div>
            <div className="border border-black px-2 text-[10px] flex items-center gap-1">
              Devolución <span className="text-white">.</span>
            </div>
          </div>

          <div className="border border-black mt-2">
            <div className="flex border-b border-black">
              <div className="w-1/3 p-1 bg-gray-100 font-semibold border-r border-black text-[9px]">Nombre y apellidos</div>
              <div className="w-2/3 p-1 text-[9px]">{profesional.nombre}</div>
            </div>
            <div className="flex border-b border-black">
              <div className="w-1/3 p-1 bg-gray-100 font-semibold border-r border-black text-[9px]">Identificación</div>
              <div className="w-2/3 p-1 text-[9px]">{profesional.cedula}</div>
            </div>
            <div className="flex border-b border-black">
              <div className="w-1/3 p-1 bg-gray-100 font-semibold border-r border-black text-[9px]">Cargo</div>
              <div className="w-2/3 p-1 text-[9px]">{profesional.cargo}</div>
            </div>
            <div className="flex min-h-[50px] relative">
              <div className="w-1/3 p-1 bg-gray-100 font-semibold border-r border-black text-[9px] flex items-center">Firma</div>
              <div className="w-2/3 p-1 flex items-center justify-center overflow-hidden">
                {professionalSignature ? (
                  <img src={professionalSignature} alt="Firma Profesional" className="max-h-12 max-w-full object-contain" />
                ) : (
                  <span className="text-[8px] text-gray-300 italic">Sin firma digital</span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-2 border border-black min-h-[40px] p-1">
            <span className="font-bold text-[9px]">OBSERVACIÓN:</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ActaProfesionalGroupFormat;
