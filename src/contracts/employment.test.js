import test from 'node:test';
import assert from 'node:assert/strict';
import { fodselsnummerValid } from './fodselsnummer.js';
import { ansettelsestypePatch, contractTeamKey, customerAdminOptions, employerCompanyName, employerContractAddress, employerOrgNumber, employerSignerName, employmentHourValues, initialEmploymentHours, missingEmploymentFields, resolveEmployerSignerName, stillingsprosentText, storeFieldsForWorker, workerFormProblems } from './employment.js';

const settings = {
  selskap: 'Kiosk AS',
  org_nr: '999999999',
  adresse: 'Firma 1',
  signatur_navn: 'Kari',
  signatur_stilling: 'Daglig leder',
  alminnelig_ukentlig_arbeidstid: 37.5,
};

function worker(teams) {
  return {
    name: 'Ola Nordmann',
    email: 'ola@example.com',
    birth_date: '2000-01-01',
    tiltredelsesdato: '2026-01-01',
    ansettelsestype: 'fast',
    employment_percentage: 100,
    timer_per_uke: 37.5,
    timer_per_dag: 7.5,
    hourly_rate: 200,
    provetid_mnd: 6,
    address: 'Gate 1, 0001 Oslo',
    phone: '900 00 000',
    fodselsnummer: '15059000060',
    teams,
  };
}

test('ekstrahjelp clears stillingsprosent and average hours and stores them as null', () => {
  const current = {
    ansettelsestype: 'fast',
    employment_percentage: 80,
    timer_per_uke: 30,
    timer_per_dag: 6,
    provetid_mnd: 6,
  };
  const cleared = ansettelsestypePatch('tilkalling', current);
  assert.equal(cleared.ansettelsestype, 'tilkalling');
  assert.equal(cleared.employment_percentage, '');
  assert.equal(cleared.timer_per_uke, '');
  assert.equal(cleared.timer_per_dag, '');

  const back = ansettelsestypePatch('fast', cleared);
  assert.equal(back.ansettelsestype, 'fast');
  assert.equal(back.provetid_mnd, 6);
  assert.equal(Object.hasOwn(back, 'employment_percentage'), false);

  assert.deepEqual(employmentHourValues('tilkalling', {
    employment_percentage: 80,
    timer_per_uke: 30,
    timer_per_dag: 6,
  }), { employment_percentage: null, timer_per_uke: null, timer_per_dag: null });
  assert.deepEqual(employmentHourValues('fast', {
    employment_percentage: 50,
    timer_per_uke: 18.75,
    timer_per_dag: 4,
  }), { employment_percentage: 50, timer_per_uke: 18.75, timer_per_dag: 4 });

  assert.deepEqual(initialEmploymentHours({ ansettelsestype: 'tilkalling', employment_percentage: 100, timer_per_uke: 37.5 }), {
    employment_percentage: '',
    timer_per_uke: '',
    timer_per_dag: '',
  });
  assert.equal(initialEmploymentHours({ ansettelsestype: 'fast' }).employment_percentage, 100);
});

test('the employee list hides stillingsprosent for ekstrahjelp', () => {
  assert.equal(stillingsprosentText({ ansettelsestype: 'tilkalling', employment_percentage: 100 }), null);
  assert.equal(stillingsprosentText({ ansettelsestype: 'tilkalling', employment_percentage: null }), null);
  assert.equal(stillingsprosentText({ ansettelsestype: 'fast', employment_percentage: 60 }), '60%');
  assert.equal(stillingsprosentText({ ansettelsestype: 'fast', employment_percentage: null }), '100%');
});

test('an ekstrahjelp contract does not require stillingsprosent or average hours', () => {
  const ekstra = {
    ...worker(['team1']),
    ansettelsestype: 'tilkalling',
    employment_percentage: null,
    timer_per_uke: null,
    timer_per_dag: null,
    provetid_mnd: null,
  };
  const missing = missingEmploymentFields({
    worker: ekstra,
    settings,
    workplace: { workplace_address: 'Gate 1', apningstid_fra: '07:00', apningstid_til: '23:00' },
    showWages: true,
  });
  assert.equal(missing.includes('Stillingsprosent'), false);
  assert.equal(missing.includes('Timer per uke (snitt)'), false);
  assert.equal(missing.includes('Timer per dag (snitt)'), false);

  const fastMissing = missingEmploymentFields({
    worker: { ...worker(['team1']), employment_percentage: null, timer_per_uke: null, timer_per_dag: null },
    settings,
    workplace: { workplace_address: 'Gate 1', apningstid_fra: '07:00', apningstid_til: '23:00' },
    showWages: true,
  });
  assert.equal(fastMissing.includes('Stillingsprosent'), true);
  assert.equal(fastMissing.includes('Timer per uke (snitt)'), true);
  assert.equal(fastMissing.includes('Timer per dag (snitt)'), true);
});

const workplace = { workplace_address: 'Gate 1', apningstid_fra: '07:00', apningstid_til: '23:00' };

test('saving ekstrahjelp allows empty hours, and a stored break rule does not block the card', () => {
  const ekstra = {
    ...worker(['team1']),
    ansettelsestype: 'tilkalling',
    employment_percentage: null,
    timer_per_uke: null,
    timer_per_dag: null,
    provetid_mnd: null,
    break_after_hours: 6,
    break_length_minutes: 30,
  };
  const shared = { showWages: true, sendContract: true, settings, workplace, signerName: 'Kari' };
  assert.deepEqual(workerFormProblems({ worker: ekstra, ...shared }), []);
  assert.deepEqual(workerFormProblems({
    worker: { ...ekstra, break_after_hours: null, break_length_minutes: null },
    ...shared,
  }), []);
  assert.deepEqual(workerFormProblems({
    worker: { ...ekstra, break_after_hours: 6, break_length_minutes: null },
    ...shared,
  }), []);
});

test('saving a fast employee names the missing hours instead of blocking silently', () => {
  const fast = {
    ...worker(['team1']),
    employment_percentage: null,
    timer_per_uke: null,
    timer_per_dag: null,
    break_after_hours: null,
    break_length_minutes: null,
  };
  const shared = { showWages: true, settings, workplace, signerName: 'Kari' };
  const sending = workerFormProblems({ worker: fast, sendContract: true, ...shared });
  assert.equal(sending.includes('Stillingsprosent'), true);
  assert.equal(sending.includes('Timer per uke (snitt)'), true);
  assert.equal(sending.includes('Timer per dag (snitt)'), true);
  assert.deepEqual(workerFormProblems({ worker: fast, sendContract: false, ...shared }), []);
  const withBreak = workerFormProblems({
    worker: { ...worker(['team1']), break_after_hours: 6, break_length_minutes: 30 },
    sendContract: true,
    ...shared,
  });
  assert.deepEqual(withBreak, []);
  assert.equal(workerFormProblems({
    worker: { ...fast, name: '', hourly_rate: '' },
    sendContract: false,
    showWages: true,
  }).includes('Navn'), true);
});

test('Heider Iqbal ekstrahjelp with break 6/30 can be saved, and a bad fødselsnummer is named', () => {
  const heider = {
    name: 'Heider Iqbal',
    position: 'Selger',
    hourly_rate: 185,
    email: 'haiqaiqbal07@gmail.com',
    phone: '96873009',
    ansettelsestype: 'tilkalling',
    employment_percentage: null,
    timer_per_uke: null,
    timer_per_dag: null,
    birth_date: '2007-06-13',
    fodselsnummer: '13060782169',
    address: 'bjørndalsjordet 33, 1270 oslo',
    tiltredelsesdato: '2026-11-01',
    break_after_hours: 6,
    break_length_minutes: 30,
    teams: ['team1'],
  };
  assert.equal(fodselsnummerValid('13060782169'), true);
  assert.deepEqual(employmentHourValues('tilkalling', {
    employment_percentage: null,
    timer_per_uke: null,
    timer_per_dag: null,
  }), { employment_percentage: null, timer_per_uke: null, timer_per_dag: null });
  const shared = { showWages: true, sendContract: true, settings, workplace, signerName: 'Kari' };
  assert.deepEqual(workerFormProblems({ worker: heider, ...shared }), []);
  const badNumber = workerFormProblems({
    worker: { ...heider, fodselsnummer: '13060782160' },
    ...shared,
  });
  assert.equal(badNumber.includes('Fødselsnummer må være 11 gyldige sifre'), true);
  assert.equal(badNumber.includes('Fødselsnummer'), false);
});

test('contract team is the first team1–team10 value', () => {
  assert.equal(contractTeamKey({ teams: ['team2', 'team1'] }), 'team2');
  assert.equal(contractTeamKey({ teams: ['team10'] }), 'team10');
  assert.equal(contractTeamKey({ teams: ['kiosk', 'team1'] }), '');
  assert.equal(contractTeamKey({ teams: [] }), '');
});

test('the worker store overrides the company workplace', () => {
  const fields = storeFieldsForWorker(worker(['team2']), {
    workplace_address: 'Firmaadresse 1',
    workplace_name: 'Kiosk',
    apningstid_fra: '08:00',
    apningstid_til: '16:00',
    team2_address: 'Butikkveien 2',
    team2_apningstid_fra: '10:00',
    team2_apningstid_til: '22:00',
    team2_apningstider: 'man–lør 10–22',
    team2_notes: 'Inngang fra bakgården',
    team2_name: 'Butikk 2',
  });
  assert.deepEqual(fields, {
    team: 'team2',
    sted: 'Butikkveien 2',
    apningstid_fra: '10:00',
    apningstid_til: '22:00',
    apningstider: 'man–lør 10–22',
    notater: 'Inngang fra bakgården',
  });
});

test('empty store fields fall back to the company workplace', () => {
  const fields = storeFieldsForWorker(worker(['team1']), {
    workplace_address: 'Firmaadresse 1',
    workplace_name: 'Kiosk',
    apningstid_fra: '08:00',
    apningstid_til: '16:00',
    team1_name: 'Team 1',
    team1_address: '  ',
    team1_apningstid_fra: '',
    team1_apningstid_til: '',
    team2_address: 'Butikkveien 2',
    team2_apningstider: 'skal ikke brukes',
  });
  assert.equal(fields.sted, 'Firmaadresse 1');
  assert.equal(fields.apningstid_fra, '08:00');
  assert.equal(fields.apningstid_til, '16:00');
  assert.equal(fields.apningstider, '');
  assert.equal(fields.notater, '');
});

test('opening hours fall back one side at a time', () => {
  const fields = storeFieldsForWorker(worker(['team2']), {
    apningstid_fra: '08:00',
    apningstid_til: '16:00',
    team2_apningstid_fra: '10:00',
  });
  assert.equal(fields.apningstid_fra, '10:00');
  assert.equal(fields.apningstid_til, '16:00');
});

test('employer address is the store address, then the settings address', () => {
  assert.equal(employerContractAddress(worker(['team2']), {
    workplace_address: 'Firmaadresse 1',
    workplace_name: 'Kiosk',
    team2_name: 'Butikk 2',
    team2_address: 'Butikkveien 2',
  }, settings), 'Butikkveien 2');
  assert.equal(employerContractAddress(worker(['team2']), {
    workplace_address: 'Firmaadresse 1',
    team2_address: '  ',
  }, settings), 'Firma 1');
  assert.equal(employerContractAddress(worker(['team2']), {
    workplace_name: 'Kiosk',
    workplace_address: 'Firmaadresse 1',
    team2_name: 'Butikk 2',
  }, { adresse: '' }), '');
});

test('a store address satisfies the contract when employer settings have no address', () => {
  const missing = missingEmploymentFields({
    worker: worker(['team2']),
    settings: { ...settings, adresse: '' },
    workplace: {
      team2_address: 'Butikkveien 2',
      team2_apningstid_fra: '10:00',
      team2_apningstid_til: '22:00',
    },
    showWages: true,
  });
  assert.equal(missing.includes('Arbeidsgivers adresse'), false);
});

test('workplace name is not arbeidsgivers adresse', () => {
  const missing = missingEmploymentFields({
    worker: worker(['team1']),
    settings: { ...settings, adresse: '  ' },
    workplace: {
      workplace_name: 'Kiosk',
      workplace_address: 'Firmaadresse 1',
      apningstid_fra: '08:00',
      apningstid_til: '16:00',
      team1_address: '',
    },
    showWages: true,
  });
  assert.equal(missing.includes('Arbeidsgivers adresse'), true);
  assert.equal(missing.includes('Arbeidssted'), false);
});

test('address falls back through company name and then the team name', () => {
  const named = storeFieldsForWorker(worker(['team2']), {
    workplace_name: 'Kiosk',
    team2_name: 'Butikk 2',
  });
  assert.equal(named.sted, 'Kiosk');
  const teamOnly = storeFieldsForWorker(worker(['team2']), { team2_name: 'Butikk 2' });
  assert.equal(teamOnly.sted, 'Butikk 2');
});

test('a filled store satisfies the missing-field check without a company workplace', () => {
  const missing = missingEmploymentFields({
    worker: worker(['team2']),
    settings,
    workplace: {
      workplace_name: '',
      workplace_address: '',
      apningstid_fra: '',
      apningstid_til: '',
      team1_name: '',
      team2_address: 'Butikkveien 2',
      team2_apningstid_fra: '10:00',
      team2_apningstid_til: '22:00',
    },
    showWages: true,
  });
  assert.deepEqual(missing, []);
});

test('the contract party is the customer-card company and organization number', () => {
  assert.equal(employerCompanyName({ selskap: 'Annet AS' }, 'Butikkdrift Nas AS'), 'Butikkdrift Nas AS');
  assert.equal(employerCompanyName({ selskap: 'Annet AS' }, '  '), 'Annet AS');
  assert.equal(employerOrgNumber({ org_nr: '000' }, '912 345 678'), '912 345 678');
  assert.equal(employerOrgNumber({ org_nr: '999999999' }, ''), '999999999');
});

const customer = {
  id: 'org-nas',
  name: 'Butikkdrift Nas AS',
  admin_user_id: 'naveed',
  admin_email: 'naveed@example.com',
  contact_name: 'ZAS',
  employer_signatory_user_id: '',
};
const signatoryProfiles = [
  { id: 'super', email: 'super@example.com', full_name: 'Plattform Super', role: 'admin', created_date: '2020-01-01' },
  { id: 'other', email: 'other@example.com', full_name: 'Admin Annen', role: 'admin', created_date: '2020-01-02' },
  { id: 'naveed', email: 'naveed@example.com', full_name: 'Naveed Zafar', role: 'admin', created_date: '2020-01-03' },
  { id: 'dept', email: 'dept@example.com', full_name: 'Kari Avdeling', role: 'user', created_date: '2020-01-04' },
  { id: 'zas', email: 'zas@example.com', full_name: 'ZAS', role: 'user', created_date: '2020-01-05' },
];
const signatoryWorkers = [
  { org_id: 'org-nas', email: 'dept@example.com', role: 'sub_admin', team_roles: { team1: 'sub_admin' } },
  { org_id: 'org-nas', email: 'sjef@example.com', role: 'butikksjef', team_roles: { team1: 'butikksjef' } },
  { org_id: 'org-other', email: 'other@example.com', role: 'admin', team_roles: {} },
];

test('the signature line uses the customer-card admin name, then the selected profile, then explicit text', () => {
  assert.equal(employerSignerName({
    cardAdminName: 'Naveed Zafar',
    selectedAdminName: 'Kari Avdeling',
    explicitName: 'Kari Person',
  }), 'Naveed Zafar');
  assert.equal(employerSignerName({
    cardAdminName: '  ',
    selectedAdminName: 'Kari Avdeling',
    explicitName: 'Kari Person',
  }), 'Kari Avdeling');
  assert.equal(employerSignerName({
    cardAdminName: '',
    selectedAdminName: '',
    explicitName: 'Kari Person',
  }), 'Kari Person');
  assert.equal(employerSignerName({ cardAdminName: '', selectedAdminName: '', explicitName: '' }), '');
});

test('the customer card only offers this customer’s admins', () => {
  const options = customerAdminOptions(customer, signatoryProfiles, signatoryWorkers);
  assert.deepEqual(options.map((option) => option.fullName), ['Naveed Zafar', 'Kari Avdeling']);
  assert.equal(options[0].primary, true);
  assert.equal(options.some((option) => option.fullName === 'ZAS'), false);
  assert.equal(options.some((option) => option.fullName === 'Plattform Super'), false);
  assert.equal(options.some((option) => option.fullName === 'Admin Annen'), false);
});

test('the customer-card admin name signs, not the contact or the profile', () => {
  const fromCard = resolveEmployerSignerName({
    organization: { ...customer, admin_signerer_navn: 'Naveed Zafar', employer_signatory_user_id: 'dept', contact_name: 'ZAS' },
    profiles: signatoryProfiles,
    workers: signatoryWorkers,
    settings: { signatur_navn: 'Kari Person' },
  });
  assert.equal(fromCard, 'Naveed Zafar');
});

test('a chosen admin signs when the customer card has no admin name', () => {
  const chosen = resolveEmployerSignerName({
    organization: { ...customer, admin_signerer_navn: '', employer_signatory_user_id: 'dept', contact_name: 'ZAS' },
    profiles: signatoryProfiles,
    workers: signatoryWorkers,
    settings: { signatur_navn: 'Kari Person' },
  });
  assert.equal(chosen, 'Kari Avdeling');

  const primary = resolveEmployerSignerName({
    organization: { ...customer, employer_signatory_user_id: 'other' },
    profiles: signatoryProfiles,
    workers: signatoryWorkers,
    settings: { signatur_navn: 'Kari Person' },
  });
  assert.equal(primary, 'Naveed Zafar');

  const explicit = resolveEmployerSignerName({
    organization: { ...customer, admin_user_id: '', admin_email: '' },
    profiles: signatoryProfiles,
    workers: signatoryWorkers,
    settings: { signatur_navn: 'Kari Person' },
  });
  assert.equal(explicit, 'Kari Person');
});

test('the customer admin name satisfies the signature requirement without using the contact', () => {
  const missing = missingEmploymentFields({
    worker: worker(['team2']),
    settings: { ...settings, selskap: '', org_nr: '', signatur_navn: 'Kari Person', signatur_stilling: '' },
    organizationName: 'Butikkdrift Nas AS',
    organizationOrgNumber: '912345678',
    signerName: 'Naveed Zafar',
    workplace: {
      workplace_address: 'Firmaadresse 1',
      apningstid_fra: '08:00',
      apningstid_til: '16:00',
    },
    showWages: true,
  });
  assert.equal(missing.includes('Arbeidsgivers juridiske navn'), false);
  assert.equal(missing.includes('Organisasjonsnummer'), false);
  assert.equal(missing.includes('Signaturberettiget navn'), false);
});

test('a missing signer name is required when no admin or explicit signatory is known', () => {
  const missing = missingEmploymentFields({
    worker: worker(['team2']),
    settings: { ...settings, signatur_navn: '' },
    organizationName: 'Butikkdrift Nas AS',
    organizationOrgNumber: '912345678',
    signerName: '',
    workplace: {
      workplace_address: 'Firmaadresse 1',
      apningstid_fra: '08:00',
      apningstid_til: '16:00',
    },
    showWages: true,
  });
  assert.equal(missing.includes('Signaturberettiget navn'), true);
});

test('missing workplace is reported when neither the team nor the company has it', () => {
  const missing = missingEmploymentFields({
    worker: worker(['team1']),
    settings,
    workplace: {
      workplace_name: '',
      workplace_address: '',
      apningstid_fra: '',
      apningstid_til: '',
      team1_name: '',
    },
    showWages: true,
  });
  assert.ok(missing.includes('Arbeidssted'));
  assert.equal(missing.includes('Åpningstid fra'), false);
  assert.equal(missing.includes('Åpningstid til'), false);
  assert.equal(missing.some((label) => /åpningstider/i.test(label)), false);
});

test('fødselsnummer, address and mobile are required', () => {
  const missing = missingEmploymentFields({
    worker: { ...worker(['team1']), fodselsnummer: '12345678901', address: ' ', phone: '' },
    settings,
    workplace: { workplace_address: 'Firmaadresse 1' },
    showWages: true,
  });
  assert.ok(missing.includes('Fødselsnummer'));
  assert.ok(missing.includes('Adresse'));
  assert.ok(missing.includes('Mobilnummer'));
  assert.equal(missing.includes('Åpningstid fra'), false);
});
