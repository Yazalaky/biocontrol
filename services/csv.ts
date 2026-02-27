/**
 * Parser CSV robusto:
 * - soporta comas dentro de comillas
 * - soporta comillas escapadas ("")
 * - soporta saltos de línea dentro de campos entre comillas
 */
export function parseCsvRows(rawText: string): string[][] {
  const text = (rawText || '').replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    if (ch === '\r') {
      continue;
    }
    field += ch;
  }

  const hasTrailingData = field.length > 0 || row.length > 0;
  if (hasTrailingData) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
