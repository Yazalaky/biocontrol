import React from 'react';
import { EstadoAsignacion, EstadoEquipo, EstadoPaciente } from '../types';

interface Props {
  status: string;
}

const StatusBadge: React.FC<Props> = ({ status }) => {
  let colorClass = 'bg-gray-100 text-gray-800';

  switch (status) {
    case EstadoPaciente.ACTIVO:
    case EstadoEquipo.DISPONIBLE:
    case EstadoAsignacion.ACTIVA:
      colorClass = 'bg-green-100 text-green-800';
      break;
    case EstadoEquipo.ASIGNADO:
      colorClass = 'bg-blue-100 text-blue-800';
      break;
    case EstadoEquipo.MANTENIMIENTO:
      colorClass = 'bg-yellow-100 text-yellow-800';
      break;
    case EstadoPaciente.EGRESADO:
    case EstadoEquipo.DADO_DE_BAJA:
    case EstadoAsignacion.FINALIZADA:
      colorClass = 'bg-red-100 text-red-800';
      break;
  }

  return (
    <span className={`px-2.5 py-1 inline-flex text-xs leading-4 font-semibold rounded-full border border-black/5 ${colorClass}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
};

export default StatusBadge;
