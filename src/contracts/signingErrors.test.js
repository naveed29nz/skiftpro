import test from 'node:test';
import assert from 'node:assert/strict';
import { mapSigningError } from './signingErrors.js';

test('wrong, expired and exhausted codes get a clear Norwegian message', () => {
  assert.equal(
    mapSigningError('Feil kode, prøv igjen – du har 4 forsøk igjen'),
    'Feil kode, prøv igjen – du har 4 forsøk igjen',
  );
  assert.equal(mapSigningError('Feil engangskode'), 'Feil kode, prøv igjen.');
  assert.equal(mapSigningError('Engangskoden er ugyldig eller utløpt'), 'Koden er utløpt, send ny kode');
  assert.equal(mapSigningError('Koden er utløpt, send ny kode'), 'Koden er utløpt, send ny kode');
  assert.equal(mapSigningError('For mange forsøk. Be om en ny kode.'), 'For mange forsøk. Be om en ny kode.');
  assert.equal(mapSigningError('Load failed'), 'Kunne ikke kontakte serveren. Sjekk nettverket og prøv igjen.');
  assert.equal(mapSigningError('Ny kode kan sendes om 30 sekunder'), 'Ny kode kan sendes om 30 sekunder');
  assert.equal(mapSigningError('Avtalen er allerede signert av begge parter'), 'Avtalen er allerede signert av begge parter');
  assert.equal(
    mapSigningError('Arbeidsgiver kan motsignere når den ansatte har signert'),
    'Venter på at den ansatte signerer',
  );
  assert.equal(mapSigningError('Fant ikke avtalen'), 'Fant ikke avtalen');
  assert.equal(mapSigningError(''), 'Signeringen feilet');
});
