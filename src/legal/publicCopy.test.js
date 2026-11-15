import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DATA_LOCATION_ANSWER,
  DPA_CLOSING,
  DPA_INTRO,
  LEGAL_UPDATED,
  RETENTION_PARAGRAPH,
  SECURITY_POINTS,
  SUBPROCESSORS,
} from './publicCopy.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function source(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

test('subscription data is kept 60 days and deleted manually', () => {
  assert.match(RETENTION_PARAGRAPH, /60 dager etter at abonnementet er avsluttet/);
  assert.match(RETENTION_PARAGRAPH, /slettes deretter manuelt/);
  assert.match(RETENTION_PARAGRAPH, /ikke automatisk/);
  assert.match(RETENTION_PARAGRAPH, /eksport/);
  assert.match(RETENTION_PARAGRAPH, /tidligere sletting/);
  assert.match(RETENTION_PARAGRAPH, /Skriftlig bekreftelse på sletting/);
  assert.doesNotMatch(RETENTION_PARAGRAPH, /90 dager/);
});

test('subprocessors name purpose and place, and Resend is not planned for later', () => {
  const text = SUBPROCESSORS.map((item) => item.text).join('\n');
  assert.deepEqual(
    SUBPROCESSORS.map((item) => item.name),
    ['Supabase', 'Vercel', 'Resend', 'Stripe', 'Posten'],
  );
  assert.match(text, /database, autentisering og fillagring/);
  assert.match(text, /eu-central-1 \(Frankfurt, EU\)/);
  assert.match(text, /hosting av nettappen/);
  assert.match(text, /utsending av e-post/);
  assert.match(text, /Amerikansk selskap/);
  assert.match(text, /standardkontraktsklausuler \(SCC\)/);
  assert.match(text, /Stripe, betaling/);
  assert.match(text, /Posten Signering/);
  assert.match(text, /arbeidsavtaler/);
  assert.match(text, /Norge/);
  assert.doesNotMatch(text, /senere|planlagt|ISO|SOC|Narvesen|kun i EU|bare i EU/i);
});

test('the data-location answer names Frankfurt and transfers outside the EU', () => {
  assert.match(DATA_LOCATION_ANSWER, /Databasen ligger i EU \(Frankfurt\)/);
  assert.match(DATA_LOCATION_ANSWER, /utenfor EU/);
  assert.match(DATA_LOCATION_ANSWER, /standardkontraktsklausuler \(SCC\)/);
  assert.doesNotMatch(DATA_LOCATION_ANSWER, /Alle data lagres sikkert i EU/);
});

test('security claims stay inside what the product does', () => {
  const text = SECURITY_POINTS.join('\n');
  assert.match(text, /TLS/);
  assert.match(text, /kryptert i ro/);
  assert.match(text, /Fødselsnummer lagres kryptert/);
  assert.match(text, /radnivåsikkerhet/);
  assert.match(text, /rolle/);
  assert.match(text, /kryptert sikkerhetskopi/);
  assert.match(text, /uten ugrunnet opphold/);
  assert.match(text, /Zastek AS/);
  assert.match(text, /Norsk rett/);
  assert.doesNotMatch(text, /ISO|SOC|Narvesen/i);
});

test('the DPA is final and the legal date is 15 November 2026', () => {
  assert.equal(LEGAL_UPDATED, '15. november 2026');
  assert.equal(
    DPA_INTRO,
    'Denne avtalen er mellom kunden (behandlingsansvarlig) og Zastek AS, org.nr. 938 291 144, post@zastek.no (databehandler), for bruk av SkiftPro.',
  );
  assert.equal(DPA_CLOSING, 'Kunden kan be om en signert versjon på post@zastek.no.');
  assert.doesNotMatch(`${DPA_INTRO}\n${DPA_CLOSING}`, /utkast|jurist|bindende avtale|juridisk/i);
});

test('the public pages share the list and drop the old claims', () => {
  const personvern = source('pages/Personvern.jsx');
  const vilkar = source('pages/Vilkar.jsx');
  const dpa = source('pages/Databehandleravtale.jsx');
  const landing = source('pages/Landing.jsx');
  const footer = source('components/LegalFooter.jsx');
  const app = source('App.jsx');

  for (const page of [personvern, vilkar, dpa]) {
    assert.match(page, /SubprocessorList/);
    assert.match(page, /RETENTION_PARAGRAPH/);
    assert.doesNotMatch(page, /tas i bruk senere|planlagt tatt i bruk|innen 90 dager/);
  }
  assert.match(dpa, /DPA_INTRO/);
  assert.match(dpa, /90 dager/);
  assert.doesNotMatch(personvern, /Vi ber ikke om fødselsnummer/);
  assert.match(landing, /DATA_LOCATION_ANSWER/);
  assert.match(landing, /to="\/sikkerhet"/);
  assert.match(footer, /to="\/sikkerhet"/);
  assert.match(app, /path="\/sikkerhet"/);
  assert.match(source('pages/Sikkerhet.jsx'), /SECURITY_POINTS/);
  const legalPage = source('components/legal/LegalPage.jsx');
  assert.match(legalPage, /Sist oppdatert/);
  assert.doesNotMatch(legalPage, /utkast|arbeidsutkast|jurist|juridisk/i);
});
