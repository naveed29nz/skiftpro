import { format } from 'date-fns';
import { nb } from 'date-fns/locale';

function finiteNumber(value) {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function formatHours(value, { plus = false } = {}) {
  const n = finiteNumber(value);
  if (n == null) return plus ? '+' : '–';
  const text = `${n.toFixed(1)}t`;
  return plus ? `+${text}` : text;
}

function asDate(value, { dateOnly = false } = {}) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const date = dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T00:00:00`)
    : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatContractDay(value) {
  const date = asDate(value, { dateOnly: true });
  if (!date) return '';
  return format(date, 'd. MMM', { locale: nb });
}

export function formatContractDateTime(value) {
  const date = asDate(value);
  if (!date) return '';
  return format(date, 'd. MMM yyyy HH:mm', { locale: nb });
}

export function contractPdfName(contract) {
  const name = String(contract?.worker_name || 'avtale')
    .replace(/[^\wæøåÆØÅ.\- ]+/g, '')
    .trim() || 'avtale';
  const start = contract?.start_date ? String(contract.start_date).slice(0, 10) : 'uten-dato';
  return `kontrakt-${name}-${start}.pdf`;
}

export function pdfBlobFromInvoke(data) {
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return data.type === 'application/pdf' ? data : new Blob([data], { type: 'application/pdf' });
  }
  if (data instanceof ArrayBuffer) return new Blob([data], { type: 'application/pdf' });
  if (ArrayBuffer.isView(data)) return new Blob([data], { type: 'application/pdf' });
  if (typeof data === 'string' && data.length > 0) return new Blob([data], { type: 'application/pdf' });
  throw new Error('PDF-svaret var tomt');
}

export function downloadBlob(blob, filename, doc = globalThis.document) {
  if (!doc?.body || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('Nedlasting er ikke tilgjengelig');
  }
  const url = URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  doc.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** count=exact is 0 only when the delete matched nothing. A missing count is not a miss. */
export function deleteMatchedNothing(count) {
  return count === 0;
}
