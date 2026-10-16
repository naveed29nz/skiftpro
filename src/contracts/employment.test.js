import test from 'node:test';
import assert from 'node:assert/strict';
import { contractTeamKey, customerAdminOptions, employerCompanyName, employerContractAddress, employerOrgNumber, employerSignerName, missingEmploymentFields, resolveEmployerSignerName, storeFieldsForWorker } from './employment.js';

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
    teams,
  };
}

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
  assert.ok(missing.includes('Åpningstid fra'));
  assert.ok(missing.includes('Åpningstid til'));
  assert.equal(missing.some((label) => /åpningstider/i.test(label)), false);
});
