import React, { useState } from 'react';
import type { EquipoBiomedico, HojaVidaDatosEquipo, HojaVidaFijos } from '../types';

interface HojaVidaFormatProps {
  equipo: EquipoBiomedico;
  datos?: HojaVidaDatosEquipo;
  fijos?: HojaVidaFijos;
  ubicacion?: string;
  servicio?: string;
  tipoNombre?: string;
  imagenUrl?: string | null;
}

const HojaVidaFormat: React.FC<HojaVidaFormatProps> = ({
  equipo,
  datos,
  fijos,
  ubicacion,
  servicio,
  tipoNombre,
  imagenUrl,
}) => {
  const logoCandidates = ['/medicuc-logo.png', '/medicuc-logo.jpg', '/medicuc-logo.svg'] as const;
  const [logoIndex, setLogoIndex] = useState(0);
  const [logoFailed, setLogoFailed] = useState(false);
  const logoSrc = logoCandidates[logoIndex];

  const formatDate = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString();
  };

  const empresa = datos?.empresa || 'MEDICUC IPS';
  const sede = datos?.sede || 'BUCARAMANGA';
  const direccionEmpresa = datos?.direccionEmpresa || '—';
  const definicion = fijos?.definicion || '—';
  const servicioTexto = servicio || datos?.servicio || '—';
  const ubicacionTexto = ubicacion || 'BODEGA';

  return (
    <div className="hoja-vida-page acta-page force-light bg-white text-black p-6 text-[10px] font-sans w-[8.5in] min-h-[11in] mx-auto border border-gray-300 shadow-none print:border-none print:shadow-none">
      <div className="border-2 border-black mb-3 flex">
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
              <div className="text-lg font-bold text-orange-600 tracking-tighter">medicuc</div>
              <div className="text-[8px] text-gray-500">IPS</div>
            </div>
          )}
        </div>
        <div className="w-3/4 text-center p-2">
          <div className="font-bold text-sm">HOJA DE VIDA DE EQUIPO</div>
          <div className="font-semibold text-[10px] mt-1">GTE-GTE-FT-02, VERSION 1</div>
          <div className="font-bold text-[10px] mt-1">GESTIÓN DE LA TECNOLOGÍA</div>
        </div>
      </div>

      <div className="border-2 border-black mb-3">
        <div className="bg-[#b85a1a] text-white font-bold text-center text-[10px] py-1">DATOS TÉCNICOS</div>
        <div className="flex">
          <div className="flex-1">
            <table className="w-full border-collapse text-[9px]">
              <tbody>
                <tr>
                  <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100 w-[18%]">Empresa</td>
                  <td className="border border-black px-1 py-0.5 w-[32%]">{empresa}</td>
                  <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100 w-[18%]">Sede</td>
                  <td className="border border-black px-1 py-0.5 w-[32%]">{sede}</td>
                </tr>
                <tr>
                  <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Dirección</td>
                  <td className="border border-black px-1 py-0.5" colSpan={3}>
                    {direccionEmpresa}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Nombre del equipo</td>
                  <td className="border border-black px-1 py-0.5 font-semibold" colSpan={3}>
                    {equipo.nombre}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Definición</td>
                  <td className="border border-black px-1 py-0.5" colSpan={3}>
                    {definicion}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Marca</td>
                  <td className="border border-black px-1 py-0.5">{equipo.marca}</td>
                  <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Modelo</td>
                  <td className="border border-black px-1 py-0.5">{equipo.modelo}</td>
                </tr>
                <tr>
                  <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Serie</td>
                  <td className="border border-black px-1 py-0.5 text-red-600 font-bold">{equipo.numeroSerie || '—'}</td>
                  <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Fabricante</td>
                  <td className="border border-black px-1 py-0.5">{datos?.fabricante || '—'}</td>
                </tr>
                <tr>
                  <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Servicio</td>
                  <td className="border border-black px-1 py-0.5">{servicioTexto}</td>
                  <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Ubicación</td>
                  <td className="border border-black px-1 py-0.5">{ubicacionTexto}</td>
                </tr>
                <tr>
                  <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Tipo equipo</td>
                  <td className="border border-black px-1 py-0.5">{datos?.tipoEquipo || '—'}</td>
                  <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Registro INVIMA</td>
                  <td className="border border-black px-1 py-0.5">{datos?.registroInvima || '—'}</td>
                </tr>
                <tr>
                  <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">N° Inventario</td>
                  <td className="border border-black px-1 py-0.5">{equipo.codigoInventario}</td>
                  <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Tipo plantilla</td>
                  <td className="border border-black px-1 py-0.5">{tipoNombre || '—'}</td>
                </tr>
                <tr>
                  <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Clasificación Biomédica</td>
                  <td className="border border-black px-1 py-0.5">{datos?.clasificacionBiomedica || '—'}</td>
                  <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Riesgo</td>
                  <td className="border border-black px-1 py-0.5">{datos?.riesgo || '—'}</td>
                </tr>
                <tr>
                  <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Componentes</td>
                  <td className="border border-black px-1 py-0.5" colSpan={3}>
                    {datos?.componentes || '—'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="w-40 border-l border-black p-2 flex items-center justify-center">
            {imagenUrl ? (
              <img
                src={imagenUrl}
                alt="Equipo"
                className="w-full h-full object-contain"
                crossOrigin="anonymous"
              />
            ) : (
              <div className="text-[9px] text-gray-500 text-center">SIN IMAGEN</div>
            )}
          </div>
        </div>
      </div>

      <div className="border-2 border-black mb-3">
        <div className="bg-[#b85a1a] text-white font-bold text-center text-[10px] py-1">GENERALIDADES</div>
        <table className="w-full border-collapse text-[9px]">
          <tbody>
            <tr>
              <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100 w-[20%]">Forma de adquisición</td>
              <td className="border border-black px-1 py-0.5 w-[30%]">{datos?.formaAdquisicion || '—'}</td>
              <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100 w-[20%]">Costo de adquisición</td>
              <td className="border border-black px-1 py-0.5 w-[30%]">{datos?.costoAdquisicion || '—'}</td>
            </tr>
            <tr>
              <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Fecha de instalación</td>
              <td className="border border-black px-1 py-0.5">{formatDate(datos?.fechaInstalacion)}</td>
              <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Vida útil</td>
              <td className="border border-black px-1 py-0.5">{datos?.vidaUtil || '—'}</td>
            </tr>
            <tr>
              <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Proveedor</td>
              <td className="border border-black px-1 py-0.5">{datos?.proveedor || '—'}</td>
              <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Estado del equipo</td>
              <td className="border border-black px-1 py-0.5">{datos?.estadoEquipo || '—'}</td>
            </tr>
            <tr>
              <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Garantía</td>
              <td className="border border-black px-1 py-0.5">{datos?.garantia || '—'}</td>
              <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Fecha de vencimiento</td>
              <td className="border border-black px-1 py-0.5">{formatDate(datos?.fechaVencimiento)}</td>
            </tr>
            <tr>
              <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Accesorios</td>
              <td className="border border-black px-1 py-0.5" colSpan={3}>
                {datos?.accesorios || '—'}
              </td>
            </tr>
            <tr>
              <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Manuales</td>
              <td className="border border-black px-1 py-0.5">{datos?.manuales || '—'}</td>
              <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Cuáles</td>
              <td className="border border-black px-1 py-0.5">{datos?.manualesCuales || '—'}</td>
            </tr>
            <tr>
              <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Recomendaciones del fabricante</td>
              <td className="border border-black px-1 py-0.5" colSpan={3}>
                {fijos?.recomendacionesFabricante || '—'}
              </td>
            </tr>
            <tr>
              <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Periodicidad del mant.</td>
              <td className="border border-black px-1 py-0.5">{fijos?.periodicidadMantenimiento || '—'}</td>
              <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Calibración</td>
              <td className="border border-black px-1 py-0.5">{fijos?.calibracion || '—'}</td>
            </tr>
            <tr>
              <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Técnica de limpieza y desinfección</td>
              <td className="border border-black px-1 py-0.5" colSpan={3}>
                {fijos?.tecnicaLimpiezaDesinfeccion || '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="border-2 border-black mb-3">
        <div className="bg-[#b85a1a] text-white font-bold text-center text-[10px] py-1">CARACTERÍSTICAS FÍSICAS</div>
        <div className="text-center font-semibold border-b border-black py-0.5 text-[9px]">DIMENSIONES</div>
        <table className="w-full border-collapse text-[9px]">
          <tbody>
            <tr>
              <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Alto (cm)</td>
              <td className="border border-black px-1 py-0.5">{fijos?.caracteristicasFisicas?.altoCm || '—'}</td>
              <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Ancho (cm)</td>
              <td className="border border-black px-1 py-0.5">{fijos?.caracteristicasFisicas?.anchoCm || '—'}</td>
              <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Profundidad (cm)</td>
              <td className="border border-black px-1 py-0.5">{fijos?.caracteristicasFisicas?.profundidadCm || '—'}</td>
            </tr>
            <tr>
              <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Peso (kg)</td>
              <td className="border border-black px-1 py-0.5">{fijos?.caracteristicasFisicas?.pesoKg || '—'}</td>
              <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Temperatura (°C)</td>
              <td className="border border-black px-1 py-0.5">{fijos?.caracteristicasFisicas?.temperaturaC || '—'}</td>
              <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Capacidad</td>
              <td className="border border-black px-1 py-0.5">{fijos?.caracteristicasFisicas?.capacidad || '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="border-2 border-black mb-3">
        <div className="bg-[#b85a1a] text-white font-bold text-center text-[10px] py-1">CARACTERÍSTICAS ELÉCTRICAS</div>
        <table className="w-full border-collapse text-[9px]">
          <tbody>
            <tr>
              <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Voltaje (V)</td>
              <td className="border border-black px-1 py-0.5">{fijos?.caracteristicasElectricas?.voltajeV || '—'}</td>
              <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Corriente (A)</td>
              <td className="border border-black px-1 py-0.5">{fijos?.caracteristicasElectricas?.corrienteA || '—'}</td>
              <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Potencia (W)</td>
              <td className="border border-black px-1 py-0.5">{fijos?.caracteristicasElectricas?.potenciaW || '—'}</td>
              <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Frecuencia (Hz)</td>
              <td className="border border-black px-1 py-0.5">{fijos?.caracteristicasElectricas?.frecuenciaHz || '—'}</td>
            </tr>
            <tr>
              <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Tecnología predominante</td>
              <td className="border border-black px-1 py-0.5" colSpan={7}>
                {fijos?.caracteristicasElectricas?.tecnologiaPredominante || '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="border-2 border-black">
        <div className="bg-[#b85a1a] text-white font-bold text-center text-[10px] py-1">OTROS SUMINISTROS</div>
        <table className="w-full border-collapse text-[9px]">
          <tbody>
            <tr>
              <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Oxígeno O2</td>
              <td className="border border-black px-1 py-0.5">{fijos?.otrosSuministros?.oxigenoO2 || '—'}</td>
              <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Aire</td>
              <td className="border border-black px-1 py-0.5">{fijos?.otrosSuministros?.aire || '—'}</td>
              <td className="border border-black px-1 py-0.5 font-semibold bg-gray-100">Agua</td>
              <td className="border border-black px-1 py-0.5">{fijos?.otrosSuministros?.agua || '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HojaVidaFormat;
