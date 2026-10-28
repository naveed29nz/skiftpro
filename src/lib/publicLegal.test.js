import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

const files = [
  'src/pages/Personvern.jsx',
  'src/pages/PersonvernKunder.jsx',
  'src/pages/PersonvernAnsatte.jsx',
  'src/pages/Underleverandorer.jsx',
  'src/pages/Databehandleravtale.jsx',
  'src/pages/Sikkerhet.jsx',
  'src/pages/Login.jsx',
  'src/pages/Landing.jsx',
  'src/legal/subprocessors.js',
  'src/legal/routes.js',
  'src/components/legal/LegalPage.jsx',
  'src/components/LegalFooter.jsx',
];

const forbidden = [
  /må bekreftes/i,
  /utkast/i,
  /tas i bruk senere/i,
  /gjennomgås av jurist/i,
  /gjennomgås juridisk/i,
  /venter på hemmeligheter/i,
  /gratisplan/i,
  /ber ikke om fødselsnummer/i,
];

test('public trust pages do not show internal markers', () => {
  for (const file of files) {
    const text = readFileSync(join(root, file), 'utf8');
    for (const pattern of forbidden) {
      assert.equal(pattern.test(text), false, `${file} matches ${pattern}`);
    }
  }
});

test('the trust center states the controller split, fødselsnummer and security measures', () => {
  const ansatte = readFileSync(join(root, 'src/pages/PersonvernAnsatte.jsx'), 'utf8');
  assert.match(ansatte, /Arbeidsgiveren din er behandlingsansvarlig/);
  assert.match(ansatte, /som er databehandler/);
  assert.match(ansatte, /Fødselsnummer, lagret kryptert/);

  const kunder = readFileSync(join(root, 'src/pages/PersonvernKunder.jsx'), 'utf8');
  assert.match(kunder, /Zastek AS behandler som behandlingsansvarlig/);

  const sikkerhet = readFileSync(join(root, 'src/pages/Sikkerhet.jsx'), 'utf8');
  for (const measure of ['Frankfurt', 'Radnivåsikkerhet', 'Kryptering', 'Sikkerhetskopi', 'Tilgangsstyring']) {
    assert.match(sikkerhet, new RegExp(measure));
  }

  const under = readFileSync(join(root, 'src/pages/Underleverandorer.jsx'), 'utf8');
  assert.match(under, /minst 30 dager/);
  const suppliers = readFileSync(join(root, 'src/legal/subprocessors.js'), 'utf8');
  assert.match(suppliers, /Resend/);
  assert.match(suppliers, /name: 'Supabase Inc.'/);

  const login = readFileSync(join(root, 'src/pages/Login.jsx'), 'utf8');
  assert.match(login, /Jeg aksepterer/);
  assert.match(login, /databehandleravtalen/);
  assert.match(login, /versjon \{DPA_VERSION\}/);
});
