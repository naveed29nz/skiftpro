/** Date, money and status normalizers for a Loomis kundeportal export. */

export function normalizeLoomisStatus(value) {
  const text = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ø/g, 'o');
  if (!text) return null;
  if (text.startsWith('bokf')) return 'Bokført';
  if (text.startsWith('synk')) return 'Synkronisert';
  return null;
}

export function parseLoomisDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    // Excel 1900 date system. 25569 is 1970-01-01.
    const utc = new Date(Math.round((value - 25569) * 86400000));
    return utc.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const no = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (no) return `${no[3]}-${no[2].padStart(2, '0')}-${no[1].padStart(2, '0')}`;
  return null;
}

export function parseMoney(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Math.round(value * 100) / 100;
  }
  let text = String(value).trim().replace(/\s/g, '').replace(/kr/gi, '');
  if (!text) return null;
  if (text.includes(',')) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) {
    text = text.replace(/\./g, '');
  }
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}
