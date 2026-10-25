import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTemplate } from './renderTemplate.js';
import {
  DEFAULT_EKSTRAHJELP_PERIODE,
  MERARBEID_TEMPLATE,
  MONTHLY_CONTRACT_EXAMPLE,
  daysInMonth,
  evaluateMonth,
  formatNoDate,
  formatNoNumber,
  isEkstrahjelpStilling,
  monthBounds,
  monthlyContractPreview,
  normalizeEkstrahjelpPeriode,
  weeklyContractedHours,
  weeksInMonth,
} from './ekstrahjelpPeriod.js';

test('the period defaults to calendar month', () => {
  assert.equal(DEFAULT_EKSTRAHJELP_PERIODE, 'maned');
  assert.equal(normalizeEkstrahjelpPeriode(undefined), 'maned');
  assert.equal(normalizeEkstrahjelpPeriode(''), 'maned');
  assert.equal(normalizeEkstrahjelpPeriode('år'), 'maned');
  assert.equal(normalizeEkstrahjelpPeriode('uke'), 'uke');
});

test('weeks in the month are days divided by seven', () => {
  assert.equal(daysInMonth(2026, 9), 31);
  assert.equal(weeksInMonth(2026, 9), 31 / 7);
  assert.equal(daysInMonth(2026, 10), 30);
  assert.equal(weeksInMonth(2026, 10), 30 / 7);
  assert.equal(daysInMonth(2026, 1), 28);
  assert.equal(weeksInMonth(2026, 1), 4);
  assert.equal(daysInMonth(2024, 1), 29);
  assert.deepEqual(monthBounds(2026, 10), { start: '2026-11-01', end: '2026-11-30' });
  assert.deepEqual(monthBounds(2026, 1), { start: '2026-02-01', end: '2026-02-28' });
});

test('weekly hours prefer timer per uke, otherwise stillingsprosent of full time', () => {
  assert.equal(weeklyContractedHours({ timerPerUke: 20, stillingsprosent: 80, fullTimeHoursPerWeek: 37.5 }), 20);
  assert.equal(weeklyContractedHours({ timerPerUke: null, stillingsprosent: 50, fullTimeHoursPerWeek: 37.5 }), 18.75);
  assert.equal(weeklyContractedHours({ stillingsprosent: null, fullTimeHoursPerWeek: 40 }), 40);
});

test('a long week offset by a short week in the same month does not create a contract', () => {
  const february = evaluateMonth({
    year: 2026,
    monthIndex: 1,
    timerPerUke: 20,
    stillingsprosent: 50,
    workedHours: 80,
  });
  assert.equal(february.contractedHours, 80);
  assert.equal(february.shouldCreate, false);
  assert.equal(february.excessHours, 0);
  assert.equal(february.start, '2026-02-01');
  assert.equal(february.end, '2026-02-28');
});

test('one monthly contract covers only the hours above the month total', () => {
  const november = evaluateMonth(MONTHLY_CONTRACT_EXAMPLE);
  assert.equal(november.shouldCreate, true);
  assert.equal(november.days, 30);
  assert.equal(november.weeklyHours, 20);
  assert.equal(formatNoNumber(november.contractedHours), '85,71');
  assert.equal(formatNoNumber(november.workedHours), '96');
  assert.equal(november.excessHours, 10.29);
  assert.equal(formatNoNumber(november.excessHours), '10,29');
  assert.equal(formatNoDate(november.start), '01.11.2026');
  assert.equal(formatNoDate(november.end), '30.11.2026');

  const { text } = renderTemplate(MERARBEID_TEMPLATE, monthlyContractPreview().fields);
  assert.match(text, /fra 01\.11\.2026 til 30\.11\.2026/);
  assert.match(text, /satt opp med 96 timer/);
  assert.match(text, /Avtalt arbeidstid etter stillingsprosenten er 85,71 timer/);
  assert.match(text, /er 10,29 timer/);
  assert.doesNotMatch(text, /sendt/);
});

test('ekstrahjelp and full-time employees are excluded', () => {
  assert.equal(isEkstrahjelpStilling('tilkalling'), true);
  assert.equal(isEkstrahjelpStilling('fast'), false);
  const ekstra = evaluateMonth({
    year: 2026,
    monthIndex: 10,
    ansettelsestype: 'tilkalling',
    timerPerUke: null,
    stillingsprosent: null,
    workedHours: 120,
  });
  assert.equal(ekstra.shouldCreate, false);
  assert.equal(ekstra.reason, 'ekstrahjelp');

  const full = evaluateMonth({
    year: 2026,
    monthIndex: 10,
    timerPerUke: 37.5,
    stillingsprosent: 100,
    workedHours: 200,
  });
  assert.equal(full.shouldCreate, false);
  assert.equal(full.reason, 'full-time');
});

test('stillingsprosent alone is the weekly basis when timer per uke is empty', () => {
  const march = evaluateMonth({
    year: 2026,
    monthIndex: 1,
    timerPerUke: null,
    stillingsprosent: 50,
    fullTimeHoursPerWeek: 37.5,
    workedHours: 80,
  });
  assert.equal(march.weeklyHours, 18.75);
  assert.equal(march.contractedHours, 75);
  assert.equal(march.excessHours, 5);
  assert.equal(march.shouldCreate, true);
});
