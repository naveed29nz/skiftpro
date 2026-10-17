import test from 'node:test';
import assert from 'node:assert/strict';
import { mapSigningError } from './signingErrors.js';

test('wrong, expired and exhausted codes get a clear Norwegian message', () => {
  assert.equal(mapSigningError('Feil engangskode'), 'Feil kode. Sjekk e-posten og prøv igjen.');
  assert.equal(mapSigningError('Engangskoden er ugyldig eller utløpt'), 'Koden er utløpt. Be om en ny kode.');
  assert.equal(mapSigningError('For mange forsøk. Be om en ny kode.'), 'For mange forsøk. Be om en ny kode.');
  assert.equal(mapSigningError('Fant ikke avtalen'), 'Fant ikke avtalen');
  assert.equal(mapSigningError(''), 'Signeringen feilet');
});
