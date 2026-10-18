const TYPE_LABELS = {
  fast: 'Fast ansettelse',
  midlertidig_vikar: 'Midlertidig vikar',
  tilkalling_ramme: 'Tilkalling',
  butikksjef_ledende: 'Butikksjef, ledende',
  merarbeid: 'Merarbeid',
  bilag: 'Bilag',
  ekstrahjelp: 'Ekstrahjelp',
};

const AWAITING_EMPLOYEE = new Set(['utkast', 'sendt', 'apnet']);

function part(parts, type) {
  return parts.find((item) => item.type === type)?.value || '';
}

/** Readable Europe/Oslo time, e.g. "18. oktober 2026 kl. 16:02". */
export function formatOsloDateTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('nb-NO', {
    timeZone: 'Europe/Oslo',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const day = part(parts, 'day').replace(/\D/g, '');
  const month = part(parts, 'month').replace(/\.$/, '');
  const year = part(parts, 'year').replace(/\D/g, '');
  const hour = part(parts, 'hour').replace(/\D/g, '').padStart(2, '0');
  const minute = part(parts, 'minute').replace(/\D/g, '').padStart(2, '0');
  if (!day || !month || !year || hour.length !== 2 || minute.length !== 2) return '';
  return `${day}. ${month} ${year} kl. ${hour}:${minute}`;
}

/** Human contract type for the confirmation. Never the template key or version. */
export function confirmationTypeLabel(type) {
  const key = String(type || '').trim();
  if (!key) return 'Arbeidsavtale';
  return TYPE_LABELS[key] || key.replace(/_/g, ' ');
}

export function employeeSignedLine(name, iso) {
  const who = String(name || '').trim() || '–';
  const when = formatOsloDateTime(iso);
  return when ? `Signert av ansatt: ${who}, ${when}` : `Signert av ansatt: ${who}`;
}

export function employerSignedLine({ company, person, iso } = {}) {
  const org = String(company || '').trim() || '–';
  const who = String(person || '').trim() || '–';
  const when = formatOsloDateTime(iso);
  const base = `Signert av arbeidsgiver: For ${org}: ${who}`;
  return when ? `${base}, ${when}` : base;
}

/** Notice shown only after the signed PDF is stored, which is when the mail is sent. */
export function mailedCopyNotice({ archived = false, workerEmail = '', copyEmail = '' } = {}) {
  if (!archived) return '';
  return signedCopySentence([workerEmail, copyEmail]);
}

export function signedCopySentence(addresses) {
  const seen = new Set();
  const recipients = [];
  for (const value of addresses || []) {
    const email = String(value || '').trim();
    const key = email.toLowerCase();
    if (!email || seen.has(key)) continue;
    seen.add(key);
    recipients.push(email);
  }
  if (recipients.length === 0) return '';
  if (recipients.length === 1) return `En PDF-kopi er sendt på e-post til ${recipients[0]}`;
  return `En PDF-kopi er sendt på e-post til ${recipients[0]} og ${recipients[1]}`;
}

/** Plain employer heading for a contract that is not signed by both parties. */
export function employerPlainTitle(status) {
  if (status === 'signert_ansatt') return 'Venter på din signatur';
  if (AWAITING_EMPLOYEE.has(status)) return 'Venter på at den ansatte signerer';
  if (status === 'avvist') return 'Avtalen er avvist';
  if (status === 'utlopt') return 'Avtalen er utløpt';
  if (status === 'trukket') return 'Avtalen er trukket';
  return '';
}
