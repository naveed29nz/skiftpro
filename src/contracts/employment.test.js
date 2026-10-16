import test from 'node:test';
import assert from 'node:assert/strict';
import { contractTeamKey, employerCompanyName, employerOrgNumber, employerSignerName, missingEmploymentFields, storeFieldsForWorker } from './employment.js';

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

test('the signature line is the explicit signatory or the owner, never the contact', () => {
  assert.equal(employerSignerName({ signatur_navn: 'Kari Person' }, 'Naveed Zafar'), 'Kari Person');
  assert.equal(employerSignerName({ signatur_navn: '  ' }, 'Naveed Zafar'), 'Naveed Zafar');
  assert.equal(employerSignerName({ signatur_navn: '' }, ''), '');
});

test('owner name satisfies the signature requirement without using the contact', () => {
  const missing = missingEmploymentFields({
    worker: worker(['team2']),
    settings: { ...settings, selskap: '', org_nr: '', signatur_navn: '', signatur_stilling: '' },
    organizationName: 'Butikkdrift Nas AS',
    organizationOrgNumber: '912345678',
    ownerFullName: 'Naveed Zafar',
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

test('a missing owner name is required when no explicit signatory is set', () => {
  const missing = missingEmploymentFields({
    worker: worker(['team2']),
    settings: { ...settings, signatur_navn: '' },
    organizationName: 'Butikkdrift Nas AS',
    organizationOrgNumber: '912345678',
    ownerFullName: '',
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
