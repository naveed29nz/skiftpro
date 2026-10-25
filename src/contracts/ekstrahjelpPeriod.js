/** Period rules for automatic merarbeid (ekstrahjelp) drafts.
 * The database function check_overtime_for_shift is the source of truth.
 * These helpers mirror that formula so the settings preview and unit tests
 * use the same month length, weekly basis, and excess rounding.
 */

export const EKSTRAHJELP_PERIODE_UKE = 'uke';
export const EKSTRAHJELP_PERIODE_MANED = 'maned';
export const DEFAULT_EKSTRAHJELP_PERIODE = EKSTRAHJELP_PERIODE_MANED;

/** Stilling Ekstrahjelp on the employee card. It has no stillingsprosent. */
export const EKSTRAHJELP_STILLING = 'tilkalling';

export function normalizeEkstrahjelpPeriode(value) {
  return value === EKSTRAHJELP_PERIODE_UKE ? EKSTRAHJELP_PERIODE_UKE : EKSTRAHJELP_PERIODE_MANED;
}

export function isEkstrahjelpStilling(ansettelsestype) {
  return ansettelsestype === EKSTRAHJELP_STILLING;
}

export function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Weeks in the calendar month: days / 7, not a rounded week count. */
export function weeksInMonth(year, monthIndex) {
  return daysInMonth(year, monthIndex) / 7;
}

export function monthBounds(year, monthIndex) {
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0));
  const iso = (date) => date.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

/**
 * Same weekly basis as the shift trigger.
 * Timer per uke wins when it is filled in. Otherwise stillingsprosent of the
 * organization's timer per uke (alminnelig ukentlig arbeidstid, default 37,5).
 * A missing percentage is 100, matching the previous weekly function.
 */
export function weeklyContractedHours(input = {}) {
  const timerPerUke = input.timerPerUke;
  const stillingsprosent = input.stillingsprosent;
  const fullTimeHoursPerWeek = input.fullTimeHoursPerWeek ?? 37.5;
  if (timerPerUke != null && timerPerUke !== '') {
    const hours = Number(timerPerUke);
    if (Number.isFinite(hours)) return hours;
  }
  const full = Number(fullTimeHoursPerWeek);
  const base = Number.isFinite(full) && full > 0 ? full : 37.5;
  const pct = stillingsprosent == null || stillingsprosent === '' ? 100 : Number(stillingsprosent);
  const percent = Number.isFinite(pct) ? pct : 100;
  return base * (percent / 100);
}

function roundHalfAway(value, digits = 2) {
  const factor = 10 ** digits;
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round((Math.abs(value) * factor) + 1e-8) / factor;
}

/** Norwegian number text, same trimming as public.format_no_number. */
export function formatNoNumber(value) {
  const rounded = roundHalfAway(Number(value) || 0, 2);
  const [whole, frac] = rounded.toFixed(2).split('.');
  if (frac === '00') return whole;
  return `${whole},${frac}`;
}

export function formatNoDate(iso) {
  const [year, month, day] = String(iso || '').split('-');
  if (!year || !month || !day) return '';
  return `${day}.${month}.${year}`;
}

/**
 * Compare worked hours in one calendar month with contracted monthly hours.
 * A week over the stilling is not enough: short weeks in the same month
 * reduce the total. A contract is due only when the month total is over.
 */
export function evaluateMonth(input = {}) {
  const year = input.year;
  const monthIndex = input.monthIndex;
  const timerPerUke = input.timerPerUke;
  const stillingsprosent = input.stillingsprosent;
  const fullTimeHoursPerWeek = input.fullTimeHoursPerWeek ?? 37.5;
  const ansettelsestype = input.ansettelsestype;
  const bounds = monthBounds(year, monthIndex);
  const days = daysInMonth(year, monthIndex);
  const weeks = days / 7;
  const weeklyHours = weeklyContractedHours({ timerPerUke, stillingsprosent, fullTimeHoursPerWeek });
  const worked = Number(input.workedHours) || 0;
  const base = {
    skipped: false,
    reason: '',
    shouldCreate: false,
    days,
    weeks,
    weeklyHours,
    contractedHours: weeklyHours * weeks,
    workedHours: worked,
    excessHours: 0,
    ...bounds,
  };
  if (isEkstrahjelpStilling(ansettelsestype)) {
    return { ...base, skipped: true, reason: 'ekstrahjelp', contractedHours: 0 };
  }
  const full = Number(fullTimeHoursPerWeek);
  const fullTime = Number.isFinite(full) && full > 0 ? full : 37.5;
  if (weeklyHours + 0.01 >= fullTime) {
    return { ...base, skipped: true, reason: 'full-time' };
  }
  const shouldCreate = worked > base.contractedHours + 0.01;
  return {
    ...base,
    shouldCreate,
    excessHours: shouldCreate ? roundHalfAway(worked - base.contractedHours, 2) : 0,
  };
}

export const MERARBEID_TEMPLATE = `AVTALE OM MERARBEID / TILLEGGSTIMER

mellom
{{selskap}}
(Arbeidsgiveren)
og
{{navn}}
(Arbeidstakeren)

Dette er en avtale om merarbeid i et bestående arbeidsforhold. Den oppretter ikke et nytt midlertidig ansettelsesforhold og erstatter ikke ansettelsesavtalen mellom partene.

Periode

Merarbeidet gjelder fra {{periode_fra}} til {{periode_til}}.

I perioden er arbeidstaker satt opp med {{timer_i_perioden}} timer. Avtalt arbeidstid etter stillingsprosenten er {{avtalte_timer}} timer i perioden. Timene utover avtalt arbeidstid er {{merarbeid_timer}} timer.

Lønn

Timelønn for merarbeidet er den samme som i ansettelsesavtalen, NOK {{timelonn}} per time. Denne avtalen lovfester ikke bort overtidstillegg.

Arbeidssted er for tiden {{sted}}.

Signatur

Avtalen signeres elektronisk i SkiftPro.

For {{selskap}}: {{signatur_navn}}

Arbeidstaker
Navn: {{navn}}
`;

/** November 2026 example used by the settings preview and the unit test. */
export const MONTHLY_CONTRACT_EXAMPLE = {
  year: 2026,
  monthIndex: 10,
  timerPerUke: 20,
  stillingsprosent: 50,
  fullTimeHoursPerWeek: 37.5,
  workedHours: 96,
  workerName: 'Kari Nordmann',
  company: 'Kiosk AS',
  place: 'Karl Johans gate 1, Oslo',
  hourlyRate: 220,
  signer: 'Ola Hansen',
};

export function monthlyContractPreview(example = MONTHLY_CONTRACT_EXAMPLE) {
  const evaluation = evaluateMonth(example);
  const fields = {
    selskap: example.company,
    navn: example.workerName,
    periode_fra: formatNoDate(evaluation.start),
    periode_til: formatNoDate(evaluation.end),
    timer_i_perioden: formatNoNumber(evaluation.workedHours),
    avtalte_timer: formatNoNumber(evaluation.contractedHours),
    merarbeid_timer: formatNoNumber(evaluation.excessHours),
    timelonn: formatNoNumber(example.hourlyRate),
    sted: example.place,
    signatur_navn: example.signer,
  };
  return { evaluation, fields };
}
