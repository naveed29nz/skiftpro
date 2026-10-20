import { normalizeLoomisStatus, parseLoomisDate, parseMoney } from './loomisValues.js';

const HEADER_FIELDS = {
  innskuddnr: 'innskuddnr',
  batchnr: 'batchnr',
  referanse: 'referanse',
  kundenr: 'kundenr',
  kundenummer: 'kundenr',
  registrert: 'registrert',
  telledato: 'telledato',
  bokforingsdato: 'bokforingsdato',
  total: 'total',
  belop: 'total',
  bilagsnr: 'bilagsnr',
  bilagsnummer: 'bilagsnr',
  status: 'status',
};

export function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/å/g, 'a')
    .replace(/[^a-z0-9]/g, '');
}

function headerIndex(row) {
  const index = {};
  row.forEach((cell, i) => {
    const field = HEADER_FIELDS[normalizeHeader(cell)];
    if (field && index[field] == null) index[field] = i;
  });
  return index;
}

function looksLikeHeader(row) {
  const index = headerIndex(row || []);
  return index.innskuddnr != null && (index.bilagsnr != null || index.total != null || index.kundenr != null);
}

export function rowsFromSheet(matrix) {
  const grid = Array.isArray(matrix) ? matrix : [];
  let headerAt = -1;
  const scan = Math.min(grid.length, 15);
  for (let i = 0; i < scan; i += 1) {
    if (looksLikeHeader(grid[i])) {
      headerAt = i;
      break;
    }
  }
  if (headerAt < 0) {
    return { rows: [], skipped: 0, error: 'Fant ikke kolonnene fra Loomis-eksporten (Innskuddnr, Bilagsnr, Total, Status).' };
  }
  const columns = headerIndex(grid[headerAt]);
  const rows = [];
  let skipped = 0;
  for (let i = headerAt + 1; i < grid.length; i += 1) {
    const line = grid[i] || [];
    const blank = line.every((cell) => cell == null || String(cell).trim() === '');
    if (blank) continue;
    const innskuddnr = String(line[columns.innskuddnr] ?? '').trim();
    if (!innskuddnr) {
      skipped += 1;
      continue;
    }
    const registrertRaw = columns.registrert == null ? '' : line[columns.registrert];
    const status = columns.status == null ? null : normalizeLoomisStatus(line[columns.status]);
    rows.push({
      innskuddnr,
      batchnr: columns.batchnr == null ? null : emptyToNull(line[columns.batchnr]),
      referanse: columns.referanse == null ? null : emptyToNull(line[columns.referanse]),
      kundenr: columns.kundenr == null ? null : emptyToNull(line[columns.kundenr]),
      registrert: registrertRaw == null || registrertRaw === '' ? null : String(registrertRaw).trim(),
      telledato: columns.telledato == null ? null : parseLoomisDate(line[columns.telledato]),
      bokforingsdato: columns.bokforingsdato == null ? null : parseLoomisDate(line[columns.bokforingsdato]),
      total: columns.total == null ? null : parseMoney(line[columns.total]),
      bilagsnr: columns.bilagsnr == null ? null : digitsOrText(line[columns.bilagsnr]),
      status,
    });
  }
  return { rows, skipped, error: null };
}

function emptyToNull(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function digitsOrText(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  const text = String(value).trim();
  return text || null;
}

export async function parseLoomisWorkbook(data) {
  const loaded = await import('xlsx');
  const XLSX = loaded.default?.read ? loaded.default : loaded;
  const workbook = XLSX.read(data, { type: 'array', cellDates: true });
  const name = workbook.SheetNames[0];
  if (!name) return { rows: [], skipped: 0, error: 'Filen har ingen ark.' };
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true, defval: null });
  return rowsFromSheet(matrix);
}
