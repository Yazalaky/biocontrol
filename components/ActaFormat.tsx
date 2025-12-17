import React, { useState } from 'react';
import { Paciente, EquipoBiomedico, Asignacion } from '../types';

interface ActaFormatProps {
  paciente: Paciente;
  equipo: EquipoBiomedico;
  asignacion: Asignacion;
  tipoActa: 'ENTREGA' | 'DEVOLUCION';
  patientSignature?: string | null;
  adminSignature?: string | null;
}

const ActaFormat: React.FC<ActaFormatProps> = ({ paciente, equipo, asignacion, tipoActa, patientSignature, adminSignature }) => {
  const fecha = new Date(tipoActa === 'ENTREGA' ? asignacion.fechaAsignacion : (asignacion.fechaDevolucion || new Date().toISOString()));
  const logoCandidates = ['/medicuc-logo.png', '/medicuc-logo.jpg', '/medicuc-logo.svg'] as const;
  const [logoIndex, setLogoIndex] = useState(0);
  const [logoFailed, setLogoFailed] = useState(false);
  const logoSrc = logoCandidates[logoIndex];

  return (
    <div className="bg-white text-black p-8 text-xs font-sans max-w-[210mm] mx-auto border border-gray-300 shadow-none print:border-none print:shadow-none">
      
      {/* HEADER */}
      <div className="border-2 border-black mb-4 flex">
        <div className="w-1/4 border-r-2 border-black p-2 flex items-center justify-center">
          {/* Logo */}
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
          <h2 className="font-bold text-sm">FORMATO DE ENTREGA Y DEVOLUCION DE EQUIPOS PAD</h2>
          <p className="font-semibold text-xs mt-1">GTE-GTE-FT-16, VERSION 1</p>
          <p className="font-bold text-xs mt-1">GESTIÓN DE LA TECNOLOGÍA</p>
        </div>
      </div>

      {/* DATOS DEL PACIENTE */}
      <div className="bg-gray-300 font-bold text-center border-x-2 border-t-2 border-black py-1 uppercase text-[10px]">
        Datos del Paciente
      </div>
      <div className="border-2 border-black mb-4">
        {/* Fila 1 */}
        <div className="flex border-b border-black">
          <div className="w-[10%] border-r border-black p-1 font-semibold bg-gray-100">Fecha</div>
          <div className="w-[15%] border-r border-black p-1">{fecha.toLocaleDateString()}</div>
          <div className="w-[10%] border-r border-black p-1 font-semibold bg-gray-100">Acta</div>
          <div className="w-[10%] border-r border-black p-1 text-center text-red-600 font-bold">{String(asignacion.consecutivo).padStart(4, '0')}</div>
          <div className="w-[10%] border-r border-black p-1 font-semibold bg-gray-100">Sede</div>
          <div className="w-[15%] border-r border-black p-1">Cúcuta</div>
          <div className="w-[10%] border-r border-black p-1 font-semibold bg-gray-100">Eps</div>
          <div className="w-[15%] border-r border-black p-1">{paciente.eps}</div>
          <div className="w-[5%] border-r border-black p-1 font-semibold bg-gray-100">DX</div>
        </div>
        {/* Fila 2 */}
        <div className="flex border-b border-black">
            <div className="w-[15%] border-r border-black p-1 font-semibold bg-gray-100">Identificación</div>
            <div className="w-[20%] border-r border-black p-1">{paciente.numeroDocumento}</div>
            <div className="w-[15%] border-r border-black p-1 font-semibold bg-gray-100">Nombre</div>
            <div className="w-[50%] p-1">{paciente.nombreCompleto}</div>
        </div>
         {/* Fila 3 */}
         <div className="flex border-b border-black">
            <div className="w-[15%] border-r border-black p-1 font-semibold bg-gray-100">Dirección</div>
            <div className="w-[50%] border-r border-black p-1">{paciente.direccion}</div>
            <div className="w-[15%] border-r border-black p-1 font-semibold bg-gray-100">Teléfono</div>
            <div className="w-[20%] p-1">{paciente.telefono}</div>
        </div>
        {/* Fila 4 - Novedad */}
        <div className="flex">
            <div className="w-[20%] border-r border-black p-1 font-bold bg-gray-100">TIPO DE NOVEDAD</div>
            <div className="w-[15%] border-r border-black p-1 flex items-center justify-center gap-2">
                <span>ENTREGA</span>
                <div className="w-4 h-4 border border-black flex items-center justify-center">
                    {tipoActa === 'ENTREGA' ? 'X' : ''}
                </div>
            </div>
            <div className="w-[15%] border-r border-black p-1 flex items-center justify-center gap-2">
                <span>DEVOLUCION</span>
                <div className="w-4 h-4 border border-black flex items-center justify-center">
                    {tipoActa === 'DEVOLUCION' ? 'X' : ''}
                </div>
            </div>
            <div className="w-[25%] border-r border-black p-1 font-semibold bg-gray-100 text-center">Tiempo de tenencia del equipo</div>
            <div className="w-[25%] p-1 text-center italic">{paciente.horasPrestadas || 'Según contrato'}</div>
        </div>
      </div>

      <p className="text-justify mb-2 text-[10px] leading-tight">
        <strong>MEDICUC IPS LTDA</strong>, a través de la Coordinadora PAD se permite hacer entrega de equipos para cumplir con la adecuada prestación del servicio de salud a los usuarios en el programa de atención domiciliaria.
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
            {/* Solo mostramos el equipo de la asignación actual */}
            <tr className="border-b border-black h-8">
                <td className="border-r border-black p-1">{equipo.nombre}</td>
                <td className="border-r border-black p-1 text-center">{equipo.marca}</td>
                <td className="border-r border-black p-1 text-center">{equipo.numeroSerie}</td>
                <td className="border-r border-black p-1 text-center">{equipo.modelo}</td>
                <td className="p-1 text-center">{tipoActa === 'ENTREGA' ? 'BUENO' : '---'}</td>
            </tr>
            {/* Filas vacías de relleno como el formato original */}
            <tr className="border-b border-black h-6"><td className="border-r border-black"></td><td className="border-r border-black"></td><td className="border-r border-black"></td><td className="border-r border-black"></td><td></td></tr>
            <tr className="border-b border-black h-6"><td className="border-r border-black"></td><td className="border-r border-black"></td><td className="border-r border-black"></td><td className="border-r border-black"></td><td></td></tr>
        </tbody>
      </table>

      <div className="border-2 border-black mb-4 p-1 min-h-[60px]">
        <p className="font-bold underline text-[10px]">Observaciones</p>
        <p className="text-[10px] italic">
            {tipoActa === 'ENTREGA' ? asignacion.observacionesEntrega : asignacion.observacionesDevolucion}
            {equipo.codigoInventario && ` - Código Inventario: ${equipo.codigoInventario}`}
            {equipo.tipoPropiedad === 'EXTERNO' && ` - PROPIEDAD DE TERCERO: ${equipo.datosPropietario?.nombre}`}
        </p>
      </div>

      {/* Clausulas */}
      <div className="text-[9px] text-justify mb-6 space-y-2">
        <p>El responsable se compromete a darle buen uso a los equipos e instrumentos entregados, a ser utilizados únicamente con el paciente en mención o en caso de entrega a profesionales sólo para el uso a usuarios de <strong>MEDICUC IPS LTDA</strong>.</p>
        <p>El responsable reconoce y acepta que deberá entregar el equipo descrito en el acta al egreso del PAD y/o terminación del contrato.</p>
        <p>El responsable deberá dar cumplimiento a la periodicidad de control o mantenimiento ante la IPS, así mismo notificar a <strong>MEDICUC IPS</strong> cuando el equipo presente un mal funcionamiento o daños para realizar la respectiva acción correctiva.</p>
      </div>

      <p className="mb-4 text-[10px]">En constancia firman,</p>

      {/* Firmas */}
      <div className="grid grid-cols-2 gap-8 border-2 border-black p-4">
        
        {/* Columna Medicuc */}
        <div>
           <div className="flex mb-2 items-center">
                <span className="font-bold mr-2 w-16">Medicuc</span>
                <div className="border border-black px-2 text-[10px] mr-2 flex items-center gap-1">
                    Entrega {tipoActa === 'ENTREGA' ? <span className="font-bold">X</span> : <span className="text-white">.</span>}
                </div>
                <div className="border border-black px-2 text-[10px] flex items-center gap-1">
                    Recibe {tipoActa === 'DEVOLUCION' ? <span className="font-bold">X</span> : <span className="text-white">.</span>}
                </div>
           </div>
           
           <div className="border border-black mt-2">
              <div className="flex border-b border-black">
                 <div className="w-1/3 p-1 bg-gray-100 font-semibold border-r border-black text-[9px]">Nombre y apellidos</div>
                 <div className="w-2/3 p-1 text-[9px]">{asignacion.usuarioAsigna}</div>
              </div>
              <div className="flex border-b border-black">
                 <div className="w-1/3 p-1 bg-gray-100 font-semibold border-r border-black text-[9px]">Identificacion</div>
                 <div className="w-2/3 p-1 text-[9px]"></div>
              </div>
              <div className="flex border-b border-black">
                 <div className="w-1/3 p-1 bg-gray-100 font-semibold border-r border-black text-[9px]">Cargo</div>
                 <div className="w-2/3 p-1 text-[9px]">Aux. Administrativa</div>
              </div>
              <div className="flex min-h-[50px] relative">
                 <div className="w-1/3 p-1 bg-gray-100 font-semibold border-r border-black text-[9px] flex items-center">Firma</div>
                 <div className="w-2/3 p-1 flex items-center justify-center overflow-hidden">
                    {adminSignature ? (
                        <img src={adminSignature} alt="Firma Admin" className="max-h-12 max-w-full object-contain" />
                    ) : (
                        <span className="text-[8px] text-gray-300 italic">Sin firma digital</span>
                    )}
                 </div>
              </div>
           </div>
           
           <div className="mt-2 border border-black min-h-[40px] p-1">
             <span className="font-bold text-[9px]">OBSERVACION:</span>
           </div>
        </div>

        {/* Columna Paciente */}
        <div>
           <div className="flex mb-2 items-center">
                <span className="font-bold mr-2 w-24">Paciente o familiar</span>
                <div className="border border-black px-2 text-[10px] mr-2 flex items-center gap-1">
                    Recibe {tipoActa === 'ENTREGA' ? <span className="font-bold">X</span> : <span className="text-white">.</span>}
                </div>
                <div className="border border-black px-2 text-[10px] flex items-center gap-1">
                    Devolucion {tipoActa === 'DEVOLUCION' ? <span className="font-bold">X</span> : <span className="text-white">.</span>}
                </div>
           </div>

           <div className="border border-black mt-2">
              <div className="flex border-b border-black">
                 <div className="w-1/3 p-1 bg-gray-100 font-semibold border-r border-black text-[9px]">Nombre y apellidos</div>
                 <div className="w-2/3 p-1 text-[9px]">{paciente.nombreFamiliar || paciente.nombreCompleto}</div>
              </div>
              <div className="flex border-b border-black">
                 <div className="w-1/3 p-1 bg-gray-100 font-semibold border-r border-black text-[9px]">Identificacion</div>
                 <div className="w-2/3 p-1 text-[9px]">{paciente.documentoFamiliar}</div>
              </div>
              <div className="flex border-b border-black">
                 <div className="w-1/3 p-1 bg-gray-100 font-semibold border-r border-black text-[9px]">Parentezco</div>
                 <div className="w-2/3 p-1 text-[9px]">{paciente.parentescoFamiliar}</div>
              </div>
              <div className="flex min-h-[50px] relative">
                 <div className="w-1/3 p-1 bg-gray-100 font-semibold border-r border-black text-[9px] flex items-center">Firma</div>
                 <div className="w-2/3 p-1 flex items-center justify-center overflow-hidden">
                    {patientSignature ? (
                        <img src={patientSignature} alt="Firma Paciente" className="max-h-12 max-w-full object-contain" />
                    ) : (
                        <span className="text-[8px] text-gray-300 italic">Sin firma digital</span>
                    )}
                 </div>
              </div>
           </div>

           <div className="mt-2 border border-black min-h-[40px] p-1">
             <span className="font-bold text-[9px]">OBSERVACION:</span>
           </div>
        </div>

      </div>
    </div>
  );
};

export default ActaFormat;
