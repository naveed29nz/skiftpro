import test from 'node:test';
import assert from 'node:assert/strict';
import { isFullDayAbsence, isSick, shiftLabelChoices, shiftLabelName } from './shiftLabels.js';

test('new sick labels are sick, and the legacy value still reads as Syk', () => {
  assert.equal(isSick('sick'), true);
  assert.equal(isSick('sick_self'), true);
  assert.equal(isSick('sick_doctor'), true);
  assert.equal(isSick('ferie'), false);
  assert.equal(isSick('morning'), false);
  assert.equal(shiftLabelName('sick'), 'Syk');
  assert.equal(shiftLabelName('sick_self'), 'Egenmelding');
  assert.equal(shiftLabelName('sick_doctor'), 'Sykmelding');
  assert.equal(isFullDayAbsence('sick_doctor'), true);
  assert.equal(isFullDayAbsence('evening'), false);
});

test('Syk is only offered while an existing shift still uses the legacy label', () => {
  const fresh = shiftLabelChoices('none').map((option) => option.value);
  assert.deepEqual(fresh, ['none', 'morning', 'middle', 'evening', 'sick_self', 'sick_doctor', 'ferie']);
  assert.equal(fresh.includes('sick'), false);

  const legacy = shiftLabelChoices('sick');
  assert.equal(legacy.find((option) => option.value === 'sick')?.label, '🤒 Syk');
  const labels = legacy.map((option) => option.label);
  assert.equal(labels.includes('🤒 Egenmelding'), true);
  assert.equal(labels.includes('🏥 Sykmelding'), true);

  const renamed = shiftLabelChoices('evening', { noneLabel: 'Vanlig vakt' });
  assert.equal(renamed[0].label, 'Vanlig vakt');
  assert.equal(renamed.some((option) => option.value === 'sick'), false);
});
