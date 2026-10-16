import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTRACT_EMAILS,
  CONTRACT_SIGN_ORIGIN,
  formatNorwegianDate,
  renderContractEmail,
  signedCopyRecipient,
  signingLink,
} from '../../supabase/functions/_shared/contractEmails.js';

test('signing link points at the public contract page and does not sign by itself', () => {
  const link = signingLink('contract 1', 'abc/def');
  assert.equal(link, `${CONTRACT_SIGN_ORIGIN}/signer/contract%201?tilgang=abc%2Fdef`);
  assert.equal(CONTRACT_SIGN_ORIGIN, 'https://skiftpro.com');
});

test('signed-copy address prefers the customer card, then admin, then contact', () => {
  assert.equal(signedCopyRecipient({
    signert_kopi_epost: 'kopi@kunde.no',
    admin_email: 'admin@kunde.no',
    contact_email: 'post@kunde.no',
  }), 'kopi@kunde.no');
  assert.equal(signedCopyRecipient({
    signert_kopi_epost: '  ',
    admin_email: 'admin@kunde.no',
    contact_email: 'post@kunde.no',
  }), 'admin@kunde.no');
  assert.equal(signedCopyRecipient({
    admin_email: '',
    contact_email: 'post@kunde.no',
  }), 'post@kunde.no');
  assert.equal(signedCopyRecipient({}), '');
});

test('norwegian date is day.month.year in Oslo', () => {
  assert.equal(formatNorwegianDate('2026-10-16T12:00:00Z'), '16.10.2026');
  assert.equal(formatNorwegianDate(''), '');
});

test('email templates fill the placeholders', () => {
  const text = renderContractEmail(CONTRACT_EMAILS.signingInvite.body, {
    navn: 'Ola',
    selskap: 'Butikkdrift Nas AS',
    lenke: 'https://skiftpro.com/signer/1?tilgang=token',
    frist: '30.10.2026',
  });
  assert.equal(text.includes('{{'), false);
  assert.equal(text.includes('Ola'), true);
  assert.equal(text.includes('https://skiftpro.com/signer/1?tilgang=token'), true);
  assert.equal(
    renderContractEmail(CONTRACT_EMAILS.otp.body, { kode: '123456' }),
    'Koden din er 123456. Den er gyldig i 10 minutter og kan brukes fem ganger.',
  );
});
