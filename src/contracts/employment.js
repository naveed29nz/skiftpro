/** Employment-contract field rules shared by the worker form. */

import { fodselsnummerValid } from './fodselsnummer.js';

export const ANSETTELSESTYPER = [
  { value: 'fast', label: 'Fast ansettelse (heltid/deltid)', template: 'fast' },
  { value: 'midlertidig_vikar', label: 'Midlertidig vikar (aml. § 14-9 (2) b)', template: 'midlertidig_vikar' },
  { value: 'tilkalling', label: 'Tilkalling / ekstrahjelp (rammeavtale)', template: 'tilkalling_ramme' },
  { value: 'butikksjef_ledende', label: 'Butikksjef, ledende stilling (aml. § 10-12 (2))', template: 'butikksjef_ledende' },
];

/** Option value for Tilkalling / ekstrahjelp on the employee card. */
export const EKSTRAHJELP_TYPE = 'tilkalling';

export const EKSTRAHJELP_HOURS_HINT = 'Gjelder ikke for ekstrahjelp';

export function isEkstrahjelp(ansettelsestype) {
  return ansettelsestype === EKSTRAHJELP_TYPE;
}

/** Empty hour fields for a new or edited card. Ekstrahjelp never starts at 100 %. */
export function initialEmploymentHours(worker) {
  if (isEkstrahjelp(worker?.ansettelsestype)) {
    return { employment_percentage: '', timer_per_uke: '', timer_per_dag: '' };
  }
  return {
    employment_percentage: worker?.employment_percentage ?? 100,
    timer_per_uke: worker?.timer_per_uke ?? '',
    timer_per_dag: worker?.timer_per_dag ?? '',
  };
}

/** Switching to ekstrahjelp drops stillingsprosent and average hours. Other types keep what is typed. */
export function ansettelsestypePatch(value, current) {
  const next = {
    ansettelsestype: value,
    provetid_mnd: value === 'fast' || value === 'butikksjef_ledende' ? 6 : current?.provetid_mnd,
  };
  if (isEkstrahjelp(value)) {
    next.employment_percentage = '';
    next.timer_per_uke = '';
    next.timer_per_dag = '';
  }
  return next;
}

/** Values written to the worker. Ekstrahjelp stores null so percentage math stays unused. */
export function employmentHourValues(ansettelsestype, hours) {
  if (isEkstrahjelp(ansettelsestype)) {
    return { employment_percentage: null, timer_per_uke: null, timer_per_dag: null };
  }
  return {
    employment_percentage: hours?.employment_percentage ?? null,
    timer_per_uke: hours?.timer_per_uke ?? null,
    timer_per_dag: hours?.timer_per_dag ?? null,
  };
}

/** List-card text. Null means the row should stay hidden. */
export function stillingsprosentText(worker) {
  if (isEkstrahjelp(worker?.ansettelsestype)) return null;
  const value = worker?.employment_percentage;
  if (value == null || value === '') return '100%';
  return `${value}%`;
}

export const BUTIKKSJEF_CHECKLIST = [
  { key: 'lederfunksjoner', label: 'Har arbeidstakeren en stilling med klare lederfunksjoner, for eksempel budsjettansvar, resultatansvar og personalansvar?' },
  { key: 'egen_arbeidstid', label: 'Kan arbeidstakeren kontrollere sin egen arbeidstid? Personen kan stå på bemanningsplanen, men avgjør selv når og om det er behov for avvik. Stillingen er også unntatt fra registrering av arbeidstid.' },
  { key: 'frivillig_stempling', label: 'Er det frivillig for arbeidstakeren å stemple?' },
  { key: 'egen_innsats', label: 'Avgjør arbeidstakeren behovet for egen arbeidsinnsats?' },
  { key: 'delegerer', label: 'Prioriterer, delegerer og avgjør arbeidstakeren selv når og hvordan arbeidet skal utføres, uten at arbeidsgiver kontrollerer når og hvor lenge arbeidet pågår?' },
  { key: 'sammenlignbart_ansvar', label: 'Kan ansvaret for stillingen sammenlignes med kjøpmannens ansvar?' },
  { key: 'fleksibilitet', label: 'Krever stillingen så stor fleksibilitet at arbeidstidsbestemmelsene blir uhensiktsmessige å anvende?' },
  { key: 'lonn_speiler_ansvar', label: 'Gjenspeiler lønnen arbeidsoppgaver og ansvar?' },
];

export const STILLINGSPROSENT_HELP = 'Stillingsprosent = snitt timer per uke × 100 / alminnelig ukentlig arbeidstid. Uten tariff brukes 40 timer (38 hvis den ansatte skal jobbe minst hver tredje søndag). Med tariff brukes 37,5 timer (35,5 ved søndagsarbeid minst hver tredje søndag). Eksempel med tariff: 20 × 100 / 37,5 = 53,33 %.';

export const PROVETID_HELP = 'Prøvetid kan avtales i inntil 6 måneder. Ved midlertidig ansettelse kan prøvetiden ikke være lenger enn halvparten av ansettelsens lengde. Prøvetiden kan forlenges ved fravær som ikke skyldes arbeidsgiver, men bare etter skriftlig beskjed før prøvetiden løper ut. Fjern prøvetid ved endring av avtale når den ansatte allerede har vært ansatt i mer enn 6 måneder.';

export const BUTIKKSJEF_HELP = 'En butikksjef er ledende stilling bare når stillingens faktiske oppgaver oppfyller kravene. Tittelen er ikke nok. Hvis du er i tvil, gjelder arbeidstids- og overtidsreglene, og denne malen skal ikke brukes.';

export const MERARBEID_INFO = 'Dette er merarbeid i et bestående arbeidsforhold, ikke et nytt midlertidig ansettelsesforhold. Deltidsansatte kan ha fortrinnsrett til utvidet stilling etter arbeidsmiljøloven § 14-3. Nyere rettspraksis kan gi deltidsansatte krav på overtidstillegg når de jobber utover egen stillingsprosent. Overtidstillegg kan ikke avtales bort.';

export function templateKeyFor(ansettelsestype) {
  return ANSETTELSESTYPER.find((row) => row.value === ansettelsestype)?.template || 'fast';
}

export function monthsBetween(start, end) {
  if (!start || !end) return null;
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return null;
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + (b.getDate() >= a.getDate() ? 0 : -1);
}

export function suggestPercentage(timerPerUke, alminnelig) {
  const hours = Number(timerPerUke);
  const base = Number(alminnelig);
  if (!hours || !base) return '';
  return Math.round((hours * 100 / base) * 100) / 100;
}

/**
 * Fields that must be present before an employment contract can be created.
 * Returns Norwegian labels. Wage fields are only required when the caller
 * may read wages; a store manager never gets that far.
 */
function filled(value) {
  return String(value || '').trim();
}

/** First team on the worker, when it is team1–team10. */
export function contractTeamKey(worker) {
  const first = Array.isArray(worker?.teams) ? worker.teams[0] : '';
  return /^team(10|[1-9])$/.test(first || '') ? first : '';
}

/**
 * Arbeidsgivers adresse. The worker's own store address wins.
 * Employer settings are used only when that store has no address.
 * Workplace name, company name, and contact name are not an address.
 */
export function employerContractAddress(worker, workplace, settings) {
  const team = contractTeamKey(worker);
  const teamAddress = team ? filled(workplace?.[`${team}_address`]) : '';
  return teamAddress || filled(settings?.adresse);
}

/**
 * Workplace text for an agreement. The worker's own store wins.
 * Empty store fields fall back to the company-wide workplace.
 */
export function storeFieldsForWorker(worker, workplace) {
  const team = contractTeamKey(worker);
  const teamAddress = team ? filled(workplace?.[`${team}_address`]) : '';
  const teamName = team ? filled(workplace?.[`${team}_name`]) : '';
  const teamFrom = team ? filled(workplace?.[`${team}_apningstid_fra`]) : '';
  const teamTo = team ? filled(workplace?.[`${team}_apningstid_til`]) : '';
  return {
    team,
    sted: teamAddress || filled(workplace?.workplace_address) || filled(workplace?.workplace_name) || teamName,
    apningstid_fra: teamFrom || filled(workplace?.apningstid_fra),
    apningstid_til: teamTo || filled(workplace?.apningstid_til),
    apningstider: team ? filled(workplace?.[`${team}_apningstider`]) : '',
    notater: team ? filled(workplace?.[`${team}_notes`]) : '',
  };
}

/** Customer-card company name, then the employer-settings company name. */
export function employerCompanyName(settings, organizationName) {
  return String(organizationName || '').trim() || String(settings?.selskap || '').trim();
}

/** Customer-card organization number, then the employer-settings number. */
export function employerOrgNumber(settings, organizationOrgNumber) {
  return String(organizationOrgNumber || '').trim() || String(settings?.org_nr || '').trim();
}

function normalizedEmail(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * A customer admin is this organization's primary admin, the invited admin
 * email, or a department admin (admin/sub_admin) employed by this customer.
 * A platform super-admin and another customer's admin do not qualify.
 */
export function isCustomerAdminProfile(profile, organization, workers) {
  if (!profile?.id || !organization) return false;
  if (organization.admin_user_id && profile.id === organization.admin_user_id) return true;
  const email = normalizedEmail(profile.email);
  if (email && email === normalizedEmail(organization.admin_email)) return true;
  if (!email || !organization.id) return false;
  return (workers || []).some((worker) => {
    if (worker.org_id !== organization.id) return false;
    if (normalizedEmail(worker.email) !== email) return false;
    if (worker.role === 'admin' || worker.role === 'sub_admin') return true;
    return Object.values(worker.team_roles || {}).some((role) => role === 'admin' || role === 'sub_admin');
  });
}

/** Admins who may sign for this customer. The primary admin is marked. */
export function customerAdminOptions(organization, profiles, workers) {
  if (!organization) return [];
  const primaryId = organization.admin_user_id || '';
  const adminEmail = normalizedEmail(organization.admin_email);
  const options = [];
  const seen = new Set();
  const sorted = [...(profiles || [])].sort((a, b) => String(a.created_date || '').localeCompare(String(b.created_date || '')));
  for (const profile of sorted) {
    if (!profile?.id || seen.has(profile.id) || !isCustomerAdminProfile(profile, organization, workers)) continue;
    seen.add(profile.id);
    options.push({
      id: profile.id,
      fullName: String(profile.full_name || '').trim(),
      email: profile.email || '',
      primary: Boolean(primaryId && profile.id === primaryId) || (!primaryId && Boolean(adminEmail) && normalizedEmail(profile.email) === adminEmail),
    });
  }
  options.sort((a, b) => Number(b.primary) - Number(a.primary) || a.fullName.localeCompare(b.fullName, 'nb'));
  return options;
}

/** Profile name of the admin selected on the customer card, or the primary admin. */
export function selectedCustomerAdminName(organization, profiles, workers) {
  const options = customerAdminOptions(organization, profiles, workers);
  const chosen = options.find((option) => option.id === organization?.employer_signatory_user_id);
  const primary = options.find((option) => option.primary);
  return String(chosen?.fullName || primary?.fullName || '').trim();
}

/**
 * Signature person. The customer-card admin name wins, then the selected
 * admin's profile name, then the explicit employer-settings text.
 * The contact name is not used.
 */
export function employerSignerName({ cardAdminName, selectedAdminName, explicitName }) {
  return String(cardAdminName || '').trim()
    || String(selectedAdminName || '').trim()
    || String(explicitName || '').trim();
}

export function resolveEmployerSignerName({ organization, profiles, workers, settings }) {
  return employerSignerName({
    cardAdminName: organization?.admin_signerer_navn,
    selectedAdminName: selectedCustomerAdminName(organization, profiles, workers),
    explicitName: settings?.signatur_navn,
  });
}

export function missingEmploymentFields({
  worker,
  settings,
  workplace,
  checklist,
  showWages,
  organizationName,
  organizationOrgNumber,
  signerName,
}) {
  const missing = [];
  const type = worker?.ansettelsestype || 'fast';
  const need = (ok, label) => { if (!ok) missing.push(label); };

  need(String(worker?.name || '').trim(), 'Fullt navn');
  need(String(worker?.email || '').trim(), 'E-post');
  need(worker?.birth_date, 'Fødselsdato');
  need(fodselsnummerValid(worker?.fodselsnummer), 'Fødselsnummer');
  need(String(worker?.address || '').trim(), 'Adresse');
  need(String(worker?.phone || '').trim(), 'Mobilnummer');
  need(worker?.tiltredelsesdato, 'Tiltredelsesdato');
  if (type === 'midlertidig_vikar') need(worker?.opphorsdato, 'Opphørsdato');

  const needsPercentage = type === 'fast' || type === 'midlertidig_vikar' || type === 'butikksjef_ledende';
  if (needsPercentage) need(worker?.employment_percentage !== '' && worker?.employment_percentage != null, 'Stillingsprosent');
  if (type !== 'tilkalling') {
    need(worker?.timer_per_uke !== '' && worker?.timer_per_uke != null, 'Timer per uke (snitt)');
    need(worker?.timer_per_dag !== '' && worker?.timer_per_dag != null, 'Timer per dag (snitt)');
  }
  if (showWages) need(worker?.hourly_rate !== '' && Number(worker?.hourly_rate) > 0, 'Timelønn');
  if (type === 'butikksjef_ledende') need(String(worker?.arbeidsoppgaver || '').trim(), 'Arbeidsoppgaver');

  if (type === 'fast' || type === 'butikksjef_ledende') {
    need(Number(worker?.provetid_mnd) === 6, 'Prøvetid på 6 måneder');
  }
  if (type === 'midlertidig_vikar') {
    const months = Number(worker?.provetid_mnd);
    const duration = monthsBetween(worker?.tiltredelsesdato, worker?.opphorsdato);
    need(months >= 0 && months <= 6 && months !== '' && worker?.provetid_mnd != null, 'Prøvetid mellom 0 og 6 måneder');
    if (duration != null && months > duration / 2) {
      missing.push(`Prøvetid kan ikke være lenger enn halvparten av ansettelsen (${duration} måneder)`);
    }
  }

  need(employerCompanyName(settings, organizationName), 'Arbeidsgivers juridiske navn');
  need(employerOrgNumber(settings, organizationOrgNumber), 'Organisasjonsnummer');
  need(employerContractAddress(worker, workplace, settings), 'Arbeidsgivers adresse');
  if (signerName != null) need(String(signerName).trim(), 'Signaturberettiget navn');
  need(settings?.alminnelig_ukentlig_arbeidstid, 'Alminnelig ukentlig arbeidstid');
  const store = storeFieldsForWorker(worker, workplace);
  need(store.sted, 'Arbeidssted');

  if (type === 'butikksjef_ledende') {
    const unanswered = BUTIKKSJEF_CHECKLIST.filter((item) => checklist?.[item.key] !== true);
    if (unanswered.length) {
      missing.push('Butikksjef-sjekklisten må være ja på alle punkter. Ellers gjelder overtidsreglene, og denne malen skal ikke brukes.');
    }
  }
  return missing;
}

/**
 * Reasons the employee card cannot be saved. Ekstrahjelp does not need
 * stillingsprosent or average hours. Contract gaps are included only when
 * the card is about to send an agreement.
 */
export function workerFormProblems({
  worker,
  showWages = false,
  sendContract = false,
  settings = null,
  workplace = null,
  checklist = null,
  organizationName = '',
  organizationOrgNumber = '',
  signerName = null,
}) {
  const problems = [];
  if (!String(worker?.name || '').trim()) problems.push('Navn');
  if (showWages) {
    const rate = worker?.hourly_rate;
    if (rate === '' || rate == null || !(Number(rate) > 0)) problems.push('Timelønn');
    const email = String(worker?.email || '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push('E-post må være en gyldig adresse');
    if (String(worker?.fodselsnummer || '').trim() && !fodselsnummerValid(worker.fodselsnummer)) {
      problems.push('Fødselsnummer må være 11 gyldige sifre');
    }
  }
  if (sendContract) {
    const gaps = missingEmploymentFields({
      worker,
      settings,
      workplace,
      checklist,
      showWages,
      organizationName,
      organizationOrgNumber,
      signerName,
    });
    for (const gap of gaps) {
      if (gap === 'Fødselsnummer' && problems.some((item) => item.startsWith('Fødselsnummer'))) continue;
      if (!problems.includes(gap)) problems.push(gap);
    }
  }
  return problems;
}

export function isUnder18(birthDate, onDate) {
  if (!birthDate) return false;
  const birth = new Date(`${birthDate}T00:00:00`);
  const on = new Date(`${(onDate || new Date().toISOString().slice(0, 10))}T00:00:00`);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(on.getTime())) return false;
  const limit = new Date(on);
  limit.setFullYear(limit.getFullYear() - 18);
  return birth > limit;
}

/** aml. § 14-5: written contract as soon as possible, and within 7 days when the employment lasts more than one month. */
export function contractDeadlineState(worker, contracts, today = new Date()) {
  if (!worker?.tiltredelsesdato) return null;
  const start = new Date(`${worker.tiltredelsesdato}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = worker.opphorsdato ? new Date(`${worker.opphorsdato}T00:00:00`) : null;
  if (end && !Number.isNaN(end.getTime())) {
    const span = (end - start) / (1000 * 60 * 60 * 24);
    if (span <= 31) return null;
  }
  const signed = (contracts || []).some((c) => (
    c.worker_id === worker.id
    && (c.status === 'signert' || c.status === 'godkjent')
    && ['fast', 'midlertidig_vikar', 'tilkalling_ramme', 'butikksjef_ledende'].includes(c.template_key || c.contract_type)
  ));
  if (signed) return null;
  const due = new Date(start);
  due.setDate(due.getDate() + 7);
  const todayMid = new Date(today);
  todayMid.setHours(0, 0, 0, 0);
  if (todayMid < start) return { level: 'soon', due };
  if (todayMid <= due) return { level: 'due', due };
  return { level: 'overdue', due };
}
