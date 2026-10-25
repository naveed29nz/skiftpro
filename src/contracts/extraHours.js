/**
 * Extra-hours period math shared by the settings preview and unit tests.
 * The database function check_overtime_for_shift is the source of truth:
 * weekly basis is timer per uke when set, otherwise stillingsprosent of the
 * full-time week, and a month uses days in that month divided by 7.
 */

import { renderTemplate } from './renderTemplate.js';

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function contractedWeeklyHours({
  timerPerUke = null,
  employmentPercentage = null,
  fullTimeWeeklyHours = null,
} = {}) {
  const fullTime = Number(fullTimeWeeklyHours);
  const full = Number.isFinite(fullTime) && fullTime > 0 ? fullTime : 37.5;
  if (timerPerUke != null && timerPerUke !== '') return Number(timerPerUke);
  const percentage = employmentPercentage == null || employmentPercentage === ''
    ? 100
    : Number(employmentPercentage);
  return full * (percentage / 100);
}

export function monthlyExtraHours({
  year,
  month,
  workedHours,
  timerPerUke = null,
  employmentPercentage = null,
  fullTimeWeeklyHours = null,
} = {}) {
  const days = daysInMonth(year, month);
  const weeks = days / 7;
  const weekly = contractedWeeklyHours({ timerPerUke, employmentPercentage, fullTimeWeeklyHours });
  const agreed = weekly * weeks;
  const worked = Number(workedHours) || 0;
  const extra = Math.max(worked - agreed, 0);
  return {
    days,
    weeks,
    weekly,
    agreed,
    worked,
    extra,
    exceeds: worked > agreed + 0.01,
    start: `${year}-${String(month).padStart(2, '0')}-01`,
    end: `${year}-${String(month).padStart(2, '0')}-${String(days).padStart(2, '0')}`,
  };
}

export function formatNoNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, '').replace('.', ',');
}

export function formatNoDate(isoDate) {
  const [year, month, day] = String(isoDate).split('-');
  return `${day}.${month}.${year}`;
}

export const MERARBEID_TEMPLATE = `AVTALE OM MERARBEID / TILLEGGSTIMER

mellom
{{selskap}}
(Arbeidsgiveren)
og
{{navn}}
(Arbeidstakeren)

Dette er en avtale om merarbeid i et bestående arbeidsforhold. Den oppretter ikke et nytt midlertidig ansettelsesforhold og erstatter ikke ansettelsesavtalen mellom partene{{#har_hovedavtale}}, inngått {{hovedavtale_dato}}{{/har_hovedavtale}}.

Periode

Merarbeidet gjelder fra {{periode_fra}} til {{periode_til}}.

I perioden er arbeidstaker satt opp med {{timer_i_perioden}} timer. Avtalt arbeidstid etter stillingsprosenten er {{avtalte_timer}} timer i perioden. Timene utover avtalt arbeidstid er {{merarbeid_timer}} timer.

Lønn

Timelønn for merarbeidet er den samme som i ansettelsesavtalen, NOK {{timelonn}} per time. Denne avtalen lovfester ikke bort overtidstillegg. Overtidsarbeid som er pålagt eller godkjent, og som går utover grensene i arbeidsmiljøloven eller tariffavtale, godtgjøres etter de reglene som gjelder.
{{^tariff}}
For overtidsarbeid utbetales overtidstillegg med minst 40 prosent i henhold til arbeidsmiljøloven § 10-6.
{{/tariff}}
{{#tariff}}
For overtidsarbeid utbetales overtidstillegg i henhold til den til enhver tid gjeldende tariffavtale.
{{/tariff}}

Arbeidssted er for tiden {{sted}}.

Signatur

Avtalen signeres elektronisk i SkiftPro.

For {{selskap}}
Navn: {{signatur_navn}}
Stilling: {{signatur_stilling}}

Arbeidstaker
Navn: {{navn}}
`;

export function merarbeidAgreementText({
  company,
  workerName,
  place,
  hourlyRate,
  balance,
  signatoryName = '',
  signatoryRole = '',
  tariff = false,
  hasMainContract = false,
  mainContractDate = '',
}) {
  return renderTemplate(MERARBEID_TEMPLATE, {
    selskap: company,
    navn: workerName,
    periode_fra: formatNoDate(balance.start),
    periode_til: formatNoDate(balance.end),
    timer_i_perioden: formatNoNumber(balance.worked),
    avtalte_timer: formatNoNumber(balance.agreed),
    merarbeid_timer: formatNoNumber(balance.extra),
    timelonn: formatNoNumber(hourlyRate),
    sted: place,
    signatur_navn: signatoryName,
    signatur_stilling: signatoryRole,
    tariff,
    har_hovedavtale: hasMainContract,
    hovedavtale_dato: mainContractDate,
  }).text;
}
