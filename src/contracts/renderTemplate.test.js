import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTemplate } from './renderTemplate.js';

const SAMPLE = `Hei {{navn}}
{{#tariff}}
Tariffavtale gjelder.
{{/tariff}}
{{^tariff}}
Overtidstillegg er minst 40 prosent.
{{/tariff}}
{{#under_18}}
Aml. kapittel 11 gjelder.
{{/under_18}}
{{#otp}}
Pensjon hos {{otp_leverandor}}.
{{/otp}}
{{^tariff}}
{{#ub_tillegg}}
{{navn}}: {{sats}} fra kl {{fra_kl}}–{{til_kl}}
{{/ub_tillegg}}
{{/tariff}}
Timelønn {{timelonn}}.
`;

test('conditional blocks follow tariff, age and otp flags', () => {
  const withTariff = renderTemplate(SAMPLE, {
    navn: 'Ola',
    tariff: true,
    under_18: false,
    otp: true,
    otp_leverandor: 'DNB-LIV',
    ub_tillegg: [{ navn: 'Kveld', sats: '20 %', fra_kl: '21:00', til_kl: '23:00' }],
    timelonn: '210.00',
  });
  assert.match(withTariff.text, /Tariffavtale gjelder/);
  assert.doesNotMatch(withTariff.text, /40 prosent/);
  assert.doesNotMatch(withTariff.text, /kapittel 11/);
  assert.match(withTariff.text, /Pensjon hos DNB-LIV/);
  assert.doesNotMatch(withTariff.text, /Kveld/);
  assert.deepEqual(withTariff.missing, []);

  const without = renderTemplate(SAMPLE, {
    navn: 'Kari',
    tariff: false,
    under_18: true,
    otp: false,
    ub_tillegg: [{ navn: 'Kveld', sats: '20 %', fra_kl: '21:00', til_kl: '23:00' }],
    timelonn: '190.00',
  });
  assert.match(without.text, /40 prosent/);
  assert.match(without.text, /kapittel 11/);
  assert.doesNotMatch(without.text, /Pensjon hos/);
  assert.match(without.text, /Kveld: 20 % fra kl 21:00–23:00/);
  assert.deepEqual(without.missing, []);
});

test('escapes values so a template cannot inject markup', () => {
  const { text } = renderTemplate('Navn: {{navn}}\n', {
    navn: '<script>alert("x")</script> & co',
  });
  assert.equal(
    text,
    'Navn: &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co\n',
  );
  assert.doesNotMatch(text, /<script>/);
});

test('reports missing fields and leaves them blank', () => {
  const { text, missing } = renderTemplate('Hei {{navn}}, lønn {{timelonn}}.\n', { navn: 'Ola' });
  assert.equal(text, 'Hei Ola, lønn .\n');
  assert.deepEqual(missing, ['timelonn']);
});

test('does not treat fields inside a dropped block as missing', () => {
  const { missing, text } = renderTemplate('{{#otp}}Hos {{otp_leverandor}}{{/otp}}\nFerdig\n', { otp: false });
  assert.deepEqual(missing, []);
  assert.match(text, /Ferdig/);
  assert.doesNotMatch(text, /otp_leverandor/);
});

test('empty ub list drops the block', () => {
  const { text } = renderTemplate('{{#ub_tillegg}}{{navn}}{{/ub_tillegg}}Slutt\n', { ub_tillegg: [] });
  assert.match(text, /^Slutt/);
});
