import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contractedWeeklyHours,
  daysInMonth,
  formatNoNumber,
  merarbeidAgreementText,
  monthlyExtraHours,
} from './extraHours.js';

test('a month uses calendar days divided by seven', () => {
  assert.equal(daysInMonth(2026, 10), 31);
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2024, 2), 29);
});

test('weekly basis prefers timer per uke and otherwise uses stillingsprosent', () => {
  assert.equal(contractedWeeklyHours({ timerPerUke: 20, employmentPercentage: 50, fullTimeWeeklyHours: 37.5 }), 20);
  assert.equal(contractedWeeklyHours({ timerPerUke: null, employmentPercentage: 50, fullTimeWeeklyHours: 37.5 }), 18.75);
  assert.equal(contractedWeeklyHours({ employmentPercentage: 80 }), 30);
});

test('weeks over the weekly rate do not exceed a month that nets under the quota', () => {
  const balance = monthlyExtraHours({
    year: 2026,
    month: 10,
    workedHours: 48,
    timerPerUke: 20,
    employmentPercentage: 50,
    fullTimeWeeklyHours: 37.5,
  });
  assert.equal(balance.exceeds, false);
  assert.equal(formatNoNumber(balance.agreed), '88,57');
  assert.equal(balance.start, '2026-10-01');
  assert.equal(balance.end, '2026-10-31');
});

test('one month over the quota stores the excess above contracted monthly hours', () => {
  const balance = monthlyExtraHours({
    year: 2026,
    month: 10,
    workedHours: 96,
    timerPerUke: 20,
  });
  assert.equal(balance.exceeds, true);
  assert.equal(formatNoNumber(balance.worked), '96');
  assert.equal(formatNoNumber(balance.agreed), '88,57');
  assert.equal(formatNoNumber(balance.extra), '7,43');
  assert.ok(Math.abs(balance.extra - 7.428571) < 0.0001);
});

test('stillingsprosent times full-time week times weeks is the monthly quota', () => {
  const under = monthlyExtraHours({
    year: 2026,
    month: 10,
    workedHours: 80,
    timerPerUke: null,
    employmentPercentage: 50,
    fullTimeWeeklyHours: 37.5,
  });
  const over = monthlyExtraHours({
    year: 2026,
    month: 10,
    workedHours: 88,
    timerPerUke: null,
    employmentPercentage: 50,
    fullTimeWeeklyHours: 37.5,
  });
  assert.equal(under.exceeds, false);
  assert.equal(over.exceeds, true);
  assert.equal(formatNoNumber(over.agreed), '83,04');
  assert.equal(formatNoNumber(over.extra), '4,96');
});

test('monthly agreement text names the calendar month and the excess and is not a sent notice', () => {
  const balance = monthlyExtraHours({
    year: 2026,
    month: 10,
    workedHours: 96,
    timerPerUke: 20,
  });
  const text = merarbeidAgreementText({
    company: 'Kiosken Oslo AS',
    workerName: 'Ola Nordmann',
    place: 'Kiosk Karl Johan',
    hourlyRate: 210,
    balance,
    signatoryName: 'Naveed Zafar',
    signatoryRole: 'Daglig leder',
  });
  assert.match(text, /01\.10\.2026/);
  assert.match(text, /31\.10\.2026/);
  assert.match(text, /96 timer/);
  assert.match(text, /88,57 timer/);
  assert.match(text, /7,43 timer/);
  assert.doesNotMatch(text, /sendt/i);
});
