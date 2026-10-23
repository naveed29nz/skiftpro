import test from 'node:test';
import assert from 'node:assert/strict';
import { payrollCsv, payrollRowFromWorker, resolvePayrollColumns } from './payrollExport.js';

test('export row keeps supplements separate from normal, sick and ferie hours', () => {
  const row = payrollRowFromWorker({
    worker: { id: 'w1', name: 'Ada', position: 'Medarbeider', hourly_rate: 200 },
    breakdowns: [
      { regularHours: 7.5, breakHours: 0.5, nightHours: 0, sundayHours: 0, holidayHours: 0, sickHours: 0, ferieHours: 0, nightBonus: 0, sundayBonus: 0, holidayBonus: 0, pay: 1500 },
      { regularHours: 0, breakHours: 0, nightHours: 2, sundayHours: 2, holidayHours: 0, sickHours: 0, ferieHours: 0, nightBonus: 200, sundayBonus: 200, holidayBonus: 0, pay: 800 },
      { regularHours: 0, breakHours: 0, nightHours: 0, sundayHours: 0, holidayHours: 0, sickHours: 7.5, ferieHours: 0, nightBonus: 0, sundayBonus: 0, holidayBonus: 0, pay: 1500 },
      { regularHours: 0, breakHours: 0, nightHours: 0, sundayHours: 0, holidayHours: 0, sickHours: 0, ferieHours: 7.5, nightBonus: 0, sundayBonus: 0, holidayBonus: 0, pay: 1500 },
    ],
  }, { period: '2026-10', team: 'N.417' });

  assert.equal(row.normal_hours, 7.5);
  assert.equal(row.break_hours, 0.5);
  assert.equal(row.night_hours, 2);
  assert.equal(row.sunday_hours, 2);
  assert.equal(row.sick_hours, 7.5);
  assert.equal(row.ferie_hours, 7.5);
  assert.equal(row.total_hours, 24.5);
  assert.equal(row.night_pay, 200);
  assert.equal(row.sunday_pay, 200);
  assert.equal(row.total_pay, 5300);
});

test('column selection keeps the defined order and the csv explains overlaps', () => {
  const columns = resolvePayrollColumns(['ferie_hours', 'employee', 'normal_hours']);
  assert.deepEqual(columns.map((column) => column.key), ['employee', 'normal_hours', 'ferie_hours']);
  const csv = payrollCsv([{ employee: 'Ada; Nord', normal_hours: 7.5, ferie_hours: 0 }], columns, { period: '2026-10' });
  assert.match(csv, /kan overlappe/);
  assert.match(csv, /"Ada; Nord";7,50;0,00/);
});
