/** Employment-contract field rules shared by the worker form. */

export const ANSETTELSESTYPER = [
  { value: 'fast', label: 'Fast ansettelse (heltid/deltid)', template: 'fast' },
  { value: 'midlertidig_vikar', label: 'Midlertidig vikar (aml. § 14-9 (2) b)', template: 'midlertidig_vikar' },
  { value: 'tilkalling', label: 'Tilkalling / ekstrahjelp (rammeavtale)', template: 'tilkalling_ramme' },
  { value: 'butikksjef_ledende', label: 'Butikksjef, ledende stilling (aml. § 10-12 (2))', template: 'butikksjef_ledende' },
];

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
export function missingEmploymentFields({ worker, settings, workplace, checklist, showWages }) {
  const missing = [];
  const type = worker?.ansettelsestype || 'fast';
  const need = (ok, label) => { if (!ok) missing.push(label); };

  need(String(worker?.name || '').trim(), 'Fullt navn');
  need(String(worker?.email || '').trim(), 'E-post');
  need(worker?.birth_date, 'Fødselsdato');
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

  need(String(settings?.selskap || '').trim(), 'Arbeidsgivers juridiske navn');
  need(String(settings?.org_nr || '').trim(), 'Organisasjonsnummer');
  need(String(settings?.adresse || '').trim(), 'Arbeidsgivers adresse');
  need(String(settings?.signatur_navn || '').trim(), 'Signaturberettiget navn');
  need(String(settings?.signatur_stilling || '').trim(), 'Signaturberettiget stilling');
  need(settings?.alminnelig_ukentlig_arbeidstid, 'Alminnelig ukentlig arbeidstid');
  const sted = workplace?.workplace_address || workplace?.workplace_name;
  need(String(sted || '').trim(), 'Arbeidssted');
  need(workplace?.apningstid_fra, 'Åpningstid fra');
  need(workplace?.apningstid_til, 'Åpningstid til');

  if (type === 'butikksjef_ledende') {
    const unanswered = BUTIKKSJEF_CHECKLIST.filter((item) => checklist?.[item.key] !== true);
    if (unanswered.length) {
      missing.push('Butikksjef-sjekklisten må være ja på alle punkter. Ellers gjelder overtidsreglene, og denne malen skal ikke brukes.');
    }
  }
  return missing;
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
