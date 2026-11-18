type PacienteRutero = {
  id: string;
  numeroDocumento?: string;
};

type ZonaRutero = 'GIRON' | 'BGA1' | 'BGA2' | 'PIEDECUESTA' | 'FLORIDABLANCA';

export type ActualizacionRutero = {
  barrio?: string;
  direccion?: string;
  telefono?: string;
  zona?: ZonaRutero | null;
};

type ResultadoFila = { fila: number; documento: string };
type FilaFallida = ResultadoFila & { motivo: string };

export type ResultadoImportacionRutero = {
  actualizados: ResultadoFila[];
  noEncontrados: ResultadoFila[];
  fallidos: FilaFallida[];
};

const ZONAS: ZonaRutero[] = ['GIRON', 'BGA1', 'BGA2', 'PIEDECUESTA', 'FLORIDABLANCA'];

function normalizeDocumento(value: string): string {
  const raw = value.trim();
  if (/^\d+(\.\d+)?e\+\d+$/i.test(raw)) {
    const numero = Number(raw);
    if (Number.isFinite(numero)) return Math.trunc(numero).toString();
  }
  return raw.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

// La plantilla admite coma o punto y coma, campos entre comillas y saltos de línea.
function parseRuteroCsv(raw: string): Array<{ fila: number; columnas: string[] }> {
  const text = raw.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = firstLine.includes(';') ? ';' : ',';
  const rows: Array<{ fila: number; columnas: string[] }> = [];
  let columnas: string[] = [];
  let campo = '';
  let enComillas = false;
  let line = 1;
  let rowLine = 1;

  const finishRow = () => {
    columnas.push(campo.trim());
    if (columnas.some((value) => value !== '')) rows.push({ fila: rowLine, columnas });
    columnas = [];
    campo = '';
    rowLine = line + 1;
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      if (enComillas && text[i + 1] === '"') {
        campo += '"';
        i += 1;
      } else {
        enComillas = !enComillas;
      }
    } else if (ch === '\n') {
      if (enComillas) campo += '\n';
      else finishRow();
      line += 1;
    } else if (ch === '\r' && text[i + 1] === '\n') {
      // El salto de línea se procesa en la siguiente iteración.
    } else if (!enComillas && ch === delimiter) {
      columnas.push(campo.trim());
      campo = '';
    } else {
      campo += ch;
    }
  }
  if (enComillas) throw new Error('El CSV contiene un campo con comillas sin cerrar.');
  if (campo || columnas.length) finishRow();
  return rows;
}

export async function importarRuteroCsv(
  text: string,
  pacientes: PacienteRutero[],
  actualizar: (pacienteId: string, cambios: ActualizacionRutero) => Promise<void>,
): Promise<ResultadoImportacionRutero> {
  const rows = parseRuteroCsv(text);
  if (rows.length < 2) throw new Error('El archivo no tiene datos para importar.');

  const headers = rows[0]!.columnas.map((value) => value.toLowerCase());
  const idxDoc = headers.indexOf('documento');
  const idxBarrio = headers.indexOf('barriomunicipio');
  const idxDireccion = headers.indexOf('direccion');
  const idxTelefono = headers.indexOf('telefono');
  const idxZona = headers.indexOf('zona');
  if (idxDoc < 0) throw new Error('No se encontró la columna Documento en el CSV.');
  if ([idxBarrio, idxDireccion, idxTelefono, idxZona].every((index) => index < 0)) {
    throw new Error('El CSV no contiene columnas de rutero para actualizar.');
  }

  const byDocument = new Map<string, PacienteRutero>();
  for (const paciente of pacientes) {
    if (typeof paciente.numeroDocumento === 'string' && paciente.numeroDocumento) {
      byDocument.set(paciente.numeroDocumento.toUpperCase(), paciente);
    }
  }
  const resultado: ResultadoImportacionRutero = { actualizados: [], noEncontrados: [], fallidos: [] };

  for (const { fila, columnas } of rows.slice(1)) {
    const documento = normalizeDocumento(columnas[idxDoc] || '');
    const registro = { fila, documento };
    if (columnas.length !== headers.length) {
      resultado.fallidos.push({ ...registro, motivo: 'La cantidad de columnas no coincide con el encabezado.' });
      continue;
    }
    if (!documento) {
      resultado.fallidos.push({ ...registro, motivo: 'Falta el documento del paciente.' });
      continue;
    }
    const paciente = byDocument.get(documento);
    if (!paciente) {
      resultado.noEncontrados.push(registro);
      continue;
    }

    // Solo se construyen los cuatro campos autorizados para el visitador.
    const cambios: ActualizacionRutero = {};
    if (idxBarrio >= 0) cambios.barrio = (columnas[idxBarrio] || '').toUpperCase();
    if (idxDireccion >= 0) cambios.direccion = (columnas[idxDireccion] || '').toUpperCase();
    if (idxTelefono >= 0) cambios.telefono = (columnas[idxTelefono] || '').toUpperCase();
    if (idxZona >= 0) {
      const zona = (columnas[idxZona] || '').replace(/\s+/g, '').toUpperCase();
      if (zona && !ZONAS.includes(zona as ZonaRutero)) {
        resultado.fallidos.push({ ...registro, motivo: `Zona no válida: ${zona}.` });
        continue;
      }
      cambios.zona = zona ? zona as ZonaRutero : null;
    }

    try {
      await actualizar(paciente.id, cambios);
      resultado.actualizados.push(registro);
    } catch (error: unknown) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      const motivo = code === 'permission-denied'
        ? 'No se pudo actualizar. Verifica la sede y, si el paciente no tiene zona, incluye la columna Zona aunque esté vacía.'
        : error instanceof Error && error.message ? error.message : 'No se pudo actualizar el paciente.';
      resultado.fallidos.push({ ...registro, motivo });
    }
  }
  return resultado;
}
