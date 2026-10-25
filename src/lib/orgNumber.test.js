import test from 'node:test';
import assert from 'node:assert/strict';
import {
  businessSignupMetadata,
  companyDetailsError,
  completeOrganizationArgs,
  lookupCompanyName,
  needsCompanyDetails,
  orgNumberValid,
  startOrganizationArgs,
} from './orgNumber.js';

test('organisation number accepts 9 digits with a mod11 check digit', () => {
  assert.equal(orgNumberValid('123456785'), true);
  assert.equal(orgNumberValid('999999999'), true);
  assert.equal(orgNumberValid('999 999 999'), true);
  assert.equal(orgNumberValid('111111111'), true);
  assert.equal(orgNumberValid('123'), false);
  assert.equal(orgNumberValid('123456789'), false);
  assert.equal(orgNumberValid('000000060'), false);
  assert.equal(orgNumberValid(''), false);
  assert.equal(orgNumberValid(null), false);
});

test('company details are required before a business account is created', () => {
  const valid = {
    companyName: 'Narvesen Moss jbst',
    orgNumber: '123456785',
    contactName: 'Omar Altarshan',
    phone: '90011222',
    storeCount: '2',
  };
  assert.equal(companyDetailsError(valid), '');
  assert.equal(companyDetailsError({ ...valid, companyName: '  ' }), 'Firmanavn mangler.');
  assert.equal(companyDetailsError({ ...valid, orgNumber: '123456789' }), 'Organisasjonsnummeret må være 9 siffer med gyldig kontrollsiffer.');
  assert.equal(companyDetailsError({ ...valid, contactName: '' }), 'Kontaktperson mangler.');
  assert.equal(companyDetailsError({ ...valid, phone: ' ' }), 'Telefon mangler.');
  assert.equal(companyDetailsError({ ...valid, storeCount: '0' }), 'Antall butikker må være et tall fra 1 til 100.');
  assert.equal(companyDetailsError({ ...valid, storeCount: '101' }), 'Antall butikker må være et tall fra 1 til 100.');
});

test('business signup metadata keeps the person and the company apart', () => {
  const metadata = businessSignupMetadata({
    companyName: ' Narvesen Moss jbst ',
    orgNumber: '123 456 785',
    contactName: ' Omar Altarshan ',
    phone: ' 90011222 ',
    storeCount: '3',
  });
  assert.equal(metadata.full_name, 'Omar Altarshan');
  assert.equal(metadata.company_name, 'Narvesen Moss jbst');
  assert.equal(metadata.org_number, '123456785');
  assert.equal(metadata.contact_phone, '90011222');
  assert.equal(metadata.store_count, '3');
  assert.equal(metadata.signup, 'self_serve');
  assert.equal(metadata.signup_kind, 'business');
  assert.notEqual(metadata.full_name, metadata.company_name);

  const start = startOrganizationArgs({
    companyName: 'Narvesen Moss jbst',
    orgNumber: '123456785',
    contactName: 'Omar Altarshan',
    phone: '90011222',
    storeCount: '3',
  });
  assert.deepEqual(start, {
    p_name: 'Narvesen Moss jbst',
    p_org_number: '123456785',
    p_phone: '90011222',
    p_store_name: 'Narvesen Moss jbst',
    p_contact_name: 'Omar Altarshan',
    p_store_count: 3,
  });
  assert.deepEqual(completeOrganizationArgs({
    companyName: 'Narvesen Moss jbst',
    orgNumber: '123456785',
    contactName: 'Omar Altarshan',
    phone: '90011222',
    storeCount: '3',
  }), {
    p_name: 'Narvesen Moss jbst',
    p_org_number: '123456785',
    p_contact_name: 'Omar Altarshan',
    p_phone: '90011222',
    p_store_count: 3,
  });
});

test('only the org admin is asked to complete a missing organisation number', () => {
  const org = {
    id: 'fabe5f2d',
    name: 'Omar Altarshan',
    admin_user_id: 'admin-1',
    admin_email: 'Omar@Butikk.no',
    org_number: null,
  };
  assert.equal(needsCompanyDetails(org, { userId: 'admin-1', userEmail: 'omar@butikk.no' }), true);
  assert.equal(needsCompanyDetails(org, { userId: 'someone', userEmail: 'omar@butikk.no' }), true);
  assert.equal(needsCompanyDetails(org, { userId: 'employee-1', userEmail: 'ansatt@butikk.no' }), false);
  assert.equal(needsCompanyDetails(org, { userId: 'admin-1', userEmail: 'omar@butikk.no', impersonating: true }), false);
  assert.equal(needsCompanyDetails({ ...org, org_number: '123456785' }, { userId: 'admin-1' }), false);
  assert.equal(needsCompanyDetails({ ...org, org_number: '123' }, { userId: 'admin-1' }), true);
  assert.equal(needsCompanyDetails(null, { userId: 'admin-1' }), false);
});

test('company name lookup reads Brreg navn and ignores failures', async () => {
  assert.equal(await lookupCompanyName('123', async () => {
    throw new Error('should not be called');
  }), null);

  const fetched = [];
  const name = await lookupCompanyName('123456785', async (url) => {
    fetched.push(url);
    return { ok: true, json: async () => ({ navn: ' Narvesen Moss jbst ' }) };
  });
  assert.equal(name, 'Narvesen Moss jbst');
  assert.equal(fetched[0], 'https://data.brreg.no/enhetsregisteret/api/enheter/123456785');

  assert.equal(await lookupCompanyName('123456785', async () => ({ ok: false })), null);
  assert.equal(await lookupCompanyName('123456785', async () => {
    throw new Error('offline');
  }), null);
});
