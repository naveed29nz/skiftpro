import test from 'node:test';
import assert from 'node:assert/strict';
import {
  confirmationTypeLabel,
  employeeSignedLine,
  employerPlainTitle,
  employerSignedLine,
  formatOsloDateTime,
  mailedCopyNotice,
  signedCopySentence,
} from './confirmation.js';

test('Oslo confirmation time is a readable date without UTC', () => {
  assert.equal(formatOsloDateTime('2026-10-18T14:02:00.000Z'), '18. oktober 2026 kl. 16:02');
  assert.equal(formatOsloDateTime('2026-10-18T16:07:00.000Z'), '18. oktober 2026 kl. 18:07');
  assert.equal(formatOsloDateTime(''), '');
  assert.equal(formatOsloDateTime('ikke-en-dato'), '');
  assert.equal(formatOsloDateTime('2026-10-18T14:02:00.000Z').includes('UTC'), false);
});

test('confirmation type is a human label, not the template key and version', () => {
  assert.equal(confirmationTypeLabel('fast'), 'Fast ansettelse');
  assert.equal(confirmationTypeLabel('midlertidig_vikar'), 'Midlertidig vikar');
  assert.equal(confirmationTypeLabel(''), 'Arbeidsavtale');
  assert.equal(confirmationTypeLabel('fast').includes('versjon'), false);
});

test('signature lines name the person, the company and the Oslo time', () => {
  assert.equal(
    employeeSignedLine('Kari Nordmann', '2026-10-18T14:02:00.000Z'),
    'Signert av ansatt: Kari Nordmann, 18. oktober 2026 kl. 16:02',
  );
  assert.equal(
    employerSignedLine({
      company: 'Butikkdrift Nas AS',
      person: 'Naveed Zafar',
      iso: '2026-10-18T16:07:00.000Z',
    }),
    'Signert av arbeidsgiver: For Butikkdrift Nas AS: Naveed Zafar, 18. oktober 2026 kl. 18:07',
  );
});

test('the email sentence lists only addresses that were actually used', () => {
  assert.equal(
    signedCopySentence(['kari@example.com', 'kopi@butikk.no']),
    'En PDF-kopi er sendt på e-post til kari@example.com og kopi@butikk.no',
  );
  assert.equal(
    signedCopySentence(['kari@example.com', '  kari@example.com  ']),
    'En PDF-kopi er sendt på e-post til kari@example.com',
  );
  assert.equal(signedCopySentence(['kari@example.com']), 'En PDF-kopi er sendt på e-post til kari@example.com');
  assert.equal(signedCopySentence([]), '');
  assert.equal(signedCopySentence([null, '  ']), '');
});

test('the email sentence stays hidden until the signed PDF exists', () => {
  assert.equal(mailedCopyNotice({
    archived: false,
    workerEmail: 'kari@example.com',
    copyEmail: 'kopi@butikk.no',
  }), '');
  assert.equal(mailedCopyNotice({
    archived: true,
    workerEmail: 'kari@example.com',
    copyEmail: 'kopi@butikk.no',
  }), 'En PDF-kopi er sendt på e-post til kari@example.com og kopi@butikk.no');
  assert.equal(mailedCopyNotice({ archived: true, workerEmail: '', copyEmail: '' }), '');
});

test('partial employer states use a plain title', () => {
  assert.equal(employerPlainTitle('signert_ansatt'), 'Venter på din signatur');
  assert.equal(employerPlainTitle('sendt'), 'Venter på at den ansatte signerer');
  assert.equal(employerPlainTitle('apnet'), 'Venter på at den ansatte signerer');
  assert.equal(employerPlainTitle('signert'), '');
  assert.equal(employerPlainTitle('godkjent'), '');
});
