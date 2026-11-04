/**
 * Subscription cancellation (oppsigelsesprotokoll).
 *
 * Notice is 30 days and starts on the 1st of the month after the request,
 * in Europe/Oslo. The subscription ends when those 30 days have passed.
 * Customer data is kept 60 days after that. The deletion date is only a
 * record: nothing here deletes customer data.
 *
 * The SQL functions in
 * supabase/migrations/20261104120000_subscription_cancellation.sql
 * use the same day arithmetic and the same Norwegian sentences.
 */

export const NOTICE_DAYS = 30;
export const RETENTION_DAYS = 60;
export const TIME_ZONE = 'Europe/Oslo';
export const CONTACT_EMAIL = 'post@zastek.no';

export const NOTICE_SENTENCE = 'Oppsigelsesfristen er 30 dager. Den begynner den 1. i måneden etter at oppsigelsen er sendt, og abonnementet opphører når de 30 dagene er gått.';
export const RETENTION_SENTENCE = 'Kundedata oppbevares i 60 dager etter at abonnementet er avsluttet.';
export const MANUAL_DELETION_SENTENCE = 'SkiftPro sletter ikke data automatisk. Vi registrerer slettedatoen, og en superadministrator hos Zastek AS sletter kundedata manuelt.';
export const ACCESS_SENTENCE = 'Dere kan bruke SkiftPro ut dagen abonnementet opphører. Zastek AS stenger tilgangen etter den dagen. Appen gjør det ikke av seg selv.';

const MONTHS = [
  'januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember',
];

export const CANCELLATION_REASONS = [
  { code: 'pris', label: 'Prisen passer ikke lenger' },
  { code: 'funksjoner', label: 'Vi savner funksjoner vi trenger' },
  { code: 'bytte', label: 'Vi bytter til et annet system' },
  { code: 'stenger', label: 'Virksomheten legges ned eller reduseres' },
  { code: 'midlertidig', label: 'Vi trenger en pause, ikke en avslutning' },
  { code: 'support', label: 'Vi er ikke fornøyde med oppfølgingen' },
  { code: 'annet', label: 'Annen grunn' },
];

const OFFERS = {
  pris: {
    id: 'prisavtale',
    title: 'Vi kan se på prisen før dere sier opp',
    body: 'Abonnementet prises per butikk, og beløpet avtales når betalingen settes opp. Skriv til oss med hvor mange butikker dere har og hva som gjør prisen vanskelig. Vi svarer med et konkret tilbud. Oppsigelsen sendes ikke hvis dere velger å ta kontakt.',
    stayLabel: 'Behold abonnementet og skriv til oss',
    continueLabel: 'Nei takk, fortsett oppsigelsen',
    mailSubject: 'Pris på SkiftPro før oppsigelse',
    mailBody: 'Hei,\n\nVi vurderer å si opp SkiftPro for {{organisasjon}}, men vil gjerne se på prisen først.\n\nAntall butikker:\nDet som gjør prisen vanskelig:\n\nVennlig hilsen',
  },
  funksjoner: {
    id: 'behov',
    title: 'Fortell oss hva som mangler',
    body: 'Skriv hvilke oppgaver dere ikke får gjort i SkiftPro. Vi bruker det når vi prioriterer det som bygges videre. Oppsigelsen sendes ikke hvis dere velger å beskrive behovet.',
    stayLabel: 'Behold abonnementet og beskriv behovet',
    continueLabel: 'Nei takk, fortsett oppsigelsen',
    mailSubject: 'Funksjoner vi savner i SkiftPro',
    mailBody: 'Hei,\n\nVi vurderer å si opp SkiftPro for {{organisasjon}} fordi vi savner funksjoner.\n\nDette får vi ikke gjort i dag:\n\nVennlig hilsen',
  },
  bytte: {
    id: 'overgang',
    title: 'Ta med lønnsgrunnlaget før dere bytter',
    body: 'Under Lønn kan administrator laste ned lønnsgrunnlaget for en måned som CSV eller Excel. Ansattene ligger under Ansatte. Trenger dere en gjennomgang før byttet, skriv til oss. Oppsigelsen sendes ikke hvis dere velger å ta kontakt først.',
    stayLabel: 'Behold abonnementet og ta kontakt',
    continueLabel: 'Nei takk, fortsett oppsigelsen',
    mailSubject: 'Overgang fra SkiftPro',
    mailBody: 'Hei,\n\nVi vurderer å bytte fra SkiftPro for {{organisasjon}} og vil gjerne ha en gjennomgang før vi sier opp.\n\nVennlig hilsen',
  },
  stenger: {
    id: 'behold',
    title: 'La avtalen stå hvis dere bare reduserer',
    body: 'Hvis virksomheten tar en pause eller driver videre med færre butikker, kan abonnementet stå. Da slipper dere å legge inn ansatte, vakter og avtaler på nytt. Oppsigelsen sendes ikke hvis dere velger å beholde avtalen.',
    stayLabel: 'Behold abonnementet',
    continueLabel: 'Virksomheten avsluttes, fortsett oppsigelsen',
    mailSubject: 'Færre butikker i SkiftPro',
    mailBody: 'Hei,\n\n{{organisasjon}} skal redusere driften, og vi vil beholde SkiftPro for butikkene som fortsetter.\n\nVennlig hilsen',
  },
  midlertidig: {
    id: 'pause',
    title: 'Behold avtalen gjennom pausen',
    body: 'SkiftPro har ingen pause som skrur av fakturaen av seg selv. Den sikre måten å ta en pause på, uten å miste ansatte og vakter, er å la abonnementet stå. Skriv til oss hvis butikken er stengt en periode, så ser vi på fakturaen sammen med dere. Oppsigelsen sendes ikke hvis dere velger å beholde avtalen.',
    stayLabel: 'Behold abonnementet',
    continueLabel: 'Nei takk, fortsett oppsigelsen',
    mailSubject: 'Pause i SkiftPro',
    mailBody: 'Hei,\n\n{{organisasjon}} trenger en pause i SkiftPro, og vi vil beholde avtalen mens vi er borte.\n\nPeriode:\n\nVennlig hilsen',
  },
  support: {
    id: 'oppfolging',
    title: 'La oss ta oppfølgingen før dere sier opp',
    body: 'Skriv hva som har sviktet, så tar vi det derfra. Oppsigelsen sendes ikke hvis dere velger å ta kontakt.',
    stayLabel: 'Behold abonnementet og skriv til oss',
    continueLabel: 'Nei takk, fortsett oppsigelsen',
    mailSubject: 'Oppfølging før oppsigelse av SkiftPro',
    mailBody: 'Hei,\n\nVi vurderer å si opp SkiftPro for {{organisasjon}} på grunn av oppfølgingen.\n\nDette har sviktet:\n\nVennlig hilsen',
  },
  annet: {
    id: 'dialog',
    title: 'Skriv til oss før oppsigelsen sendes',
    body: 'Hvis det finnes en annen løsning enn å avslutte, vil vi høre den. Oppsigelsen sendes ikke hvis dere velger å ta kontakt.',
    stayLabel: 'Behold abonnementet og skriv til oss',
    continueLabel: 'Nei takk, fortsett oppsigelsen',
    mailSubject: 'Før vi sier opp SkiftPro',
    mailBody: 'Hei,\n\nVi vurderer å si opp SkiftPro for {{organisasjon}}.\n\nBakgrunn:\n\nVennlig hilsen',
  },
};

export const WIZARD_STEPS = [
  { id: 'reason', label: 'Årsak' },
  { id: 'offer', label: 'Alternativ' },
  { id: 'confirm', label: 'Bekreftelse' },
  { id: 'receipt', label: 'Kvittering' },
];

export function osloDate(instant) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError('Ugyldig tidspunkt');
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  const year = value('year');
  const month = value('month');
  const day = value('day');
  if (!year || !month || !day) throw new TypeError('Ugyldig tidspunkt');
  return `${year}-${month}-${day}`;
}

export function addCalendarDays(ymd, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
  if (!match) throw new TypeError('Ugyldig dato');
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(utc.getTime())) throw new TypeError('Ugyldig dato');
  utc.setUTCDate(utc.getUTCDate() + days);
  const year = utc.getUTCFullYear();
  const month = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const day = String(utc.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function firstOfNextMonth(ymd) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
  if (!match) throw new TypeError('Ugyldig dato');
  let year = Number(match[1]);
  let month = Number(match[2]) + 1;
  if (month === 13) {
    month = 1;
    year += 1;
  }
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

export function cancellationSchedule(requestedAt = new Date()) {
  const requestedOn = osloDate(requestedAt);
  const noticeStartsOn = firstOfNextMonth(requestedOn);
  const subscriptionEndsOn = addCalendarDays(noticeStartsOn, NOTICE_DAYS);
  const dataDeletionOn = addCalendarDays(subscriptionEndsOn, RETENTION_DAYS);
  return { requestedOn, noticeStartsOn, subscriptionEndsOn, dataDeletionOn };
}

export function formatLongDate(ymd) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
  if (!match) return '';
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return '';
  return `${Number(match[3])}. ${month} ${match[1]}`;
}

export function formatOsloDateTime(instant) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('nb-NO', {
    timeZone: TIME_ZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function reasonByCode(code) {
  return CANCELLATION_REASONS.find((reason) => reason.code === code) || null;
}

export function offerForReason(code) {
  return OFFERS[code] || null;
}

export function validateCancellationInput({ reasonCode, reasonDetail }) {
  const reason = reasonByCode(reasonCode);
  if (!reason) return { ok: false, message: 'Velg hvorfor dere sier opp.' };
  const detail = String(reasonDetail || '').trim();
  if (detail.length > 2000) return { ok: false, message: 'Teksten kan være på maks 2000 tegn.' };
  if (reason.code === 'annet' && detail.length < 10) {
    return { ok: false, message: 'Beskriv grunnen med minst ti tegn.' };
  }
  return { ok: true, reason, detail: reason.code === 'annet' ? detail : null };
}

export function confirmationText({ organizationName, schedule }) {
  const name = String(organizationName || '').trim() || 'kunden';
  return `Jeg er administrator for ${name} og bekrefter at abonnementet sies opp. Oppsigelsen begynner ${formatLongDate(schedule.noticeStartsOn)}, abonnementet opphører ${formatLongDate(schedule.subscriptionEndsOn)}, og planlagt slettedato er ${formatLongDate(schedule.dataDeletionOn)}. Data slettes ikke automatisk.`;
}

export function offerMailto(offer, organizationName) {
  const name = String(organizationName || '').trim() || 'vår virksomhet';
  const body = String(offer?.mailBody || '').replaceAll('{{organisasjon}}', name);
  const subject = String(offer?.mailSubject || 'Før vi sier opp SkiftPro');
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function canWithdrawCancellation(record, now = new Date()) {
  if (!record || record.status !== 'scheduled' || !record.subscription_ends_on) return false;
  return osloDate(now) <= record.subscription_ends_on;
}

export function canMarkDataDeleted(record, now = new Date()) {
  if (!record || record.status !== 'scheduled' || !record.data_deletion_on) return false;
  return osloDate(now) >= record.data_deletion_on;
}

export function cancellationStatusLabel(status) {
  if (status === 'scheduled') return 'Planlagt';
  if (status === 'withdrawn') return 'Angret';
  if (status === 'data_deleted') return 'Sletting registrert';
  return 'Ukjent';
}

export function openCancellation(rows) {
  return (rows || []).find((row) => row?.status === 'scheduled') || null;
}

export function sortCancellations(rows) {
  const rank = { scheduled: 0, data_deleted: 1, withdrawn: 2 };
  return [...(rows || [])].sort((a, b) => {
    const byStatus = (rank[a?.status] ?? 9) - (rank[b?.status] ?? 9);
    if (byStatus !== 0) return byStatus;
    return String(a?.data_deletion_on || '').localeCompare(String(b?.data_deletion_on || ''));
  });
}

export function buildPreviewCancellation({
  organizationName,
  requesterName,
  requesterEmail,
  reasonCode,
  reasonDetail,
  requestedAt = new Date(),
}) {
  const checked = validateCancellationInput({ reasonCode, reasonDetail });
  if (!checked.ok) throw new Error(checked.message);
  const when = requestedAt instanceof Date ? requestedAt : new Date(requestedAt);
  const schedule = cancellationSchedule(when);
  const offer = offerForReason(checked.reason.code);
  return {
    id: 'preview',
    org_name: organizationName,
    status: 'scheduled',
    reason_code: checked.reason.code,
    reason_label: checked.reason.label,
    reason_detail: checked.detail,
    offer_id: offer.id,
    offer_choice: 'declined',
    requested_at: when.toISOString(),
    requested_by_name: requesterName,
    requested_by_email: requesterEmail,
    notice_starts_on: schedule.noticeStartsOn,
    subscription_ends_on: schedule.subscriptionEndsOn,
    data_deletion_on: schedule.dataDeletionOn,
    receipt_number: `OP-${schedule.requestedOn.slice(0, 4)}-01042`,
    acknowledgement: confirmationText({ organizationName, schedule }),
    data_deleted_at: null,
    preview: true,
  };
}

const STORAGE_MISSING = /subscription_cancellations|submit_subscription_cancellation|withdraw_subscription_cancellation|mark_subscription_data_deleted|schema cache|could not find the function|does not exist/i;

export function isCancellationStorageMissing(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || error || '');
  return code === 'PGRST205' || code === '42P01' || code === '42883' || STORAGE_MISSING.test(message);
}

export const STORAGE_MISSING_MESSAGE = `Oppsigelsen ble ikke lagret. Databasen er ikke oppdatert med oppsigelsesprotokollen ennå. Skriv til ${CONTACT_EMAIL}, så registrerer vi den.`;

export function cancellationErrorMessage(error) {
  const message = String(error?.message || '');
  if (isCancellationStorageMissing(error)) return STORAGE_MISSING_MESSAGE;
  const known = [
    'Det finnes allerede en oppsigelse',
    'Bare administratoren',
    'Bare en superadministrator',
    'Oppsigelsen kan ikke angres',
    'Oppsigelsen er angret',
    'Slettingen er allerede registrert',
    'Slettedatoen er ikke nådd',
    'Abonnementet er allerede avsluttet',
    'Velg hvorfor dere sier opp',
    'Beskriv grunnen',
    'Teksten kan være',
    'Fant ikke kunden',
    'Fant ikke oppsigelsen',
  ];
  if (known.some((part) => message.includes(part))) return message.replace(/^.*?:\s*/, '');
  return `Oppsigelsen ble ikke lagret. Prøv igjen, eller skriv til ${CONTACT_EMAIL}.`;
}

export function customerFacingCopy() {
  const strings = [
    NOTICE_SENTENCE,
    RETENTION_SENTENCE,
    MANUAL_DELETION_SENTENCE,
    ACCESS_SENTENCE,
    STORAGE_MISSING_MESSAGE,
  ];
  for (const reason of CANCELLATION_REASONS) strings.push(reason.label);
  for (const offer of Object.values(OFFERS)) {
    strings.push(offer.title, offer.body, offer.stayLabel, offer.continueLabel, offer.mailSubject, offer.mailBody);
  }
  return strings;
}
