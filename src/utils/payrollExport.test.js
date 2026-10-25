import test from 'node:test';
import assert from 'node:assert/strict';
import { payrollCsv, payrollRowFromWorker, resolvePayrollColumns } from './payrollExport.js';
import { getShiftBreakdown } from './payCalc.js';

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

test('export keeps sunday, holiday and night at zero when the worker has them turned off', () => {
  const settings = {
    full_time_hours_per_week: 37.5,
    team2_night_enabled: true,
    team2_night_from: '21:00',
    team2_night_to: '06:00',
    team2_night_extra_type: 'percentage',
    team2_night_extra_amount: 50,
    team2_sunday_extra_type: 'percentage',
    team2_sunday_extra_amount: 50,
    team2_holiday_extra_type: 'percentage',
    team2_holiday_extra_amount: 100,
  };
  const disabled = ['sunday', 'holiday', 'night'];
  const shifts = [
    { date: '2026-10-25', start_time: '10:00', end_time: '16:00', team: 'team2', break_manual: true, break_minutes: 0 },
    { date: '2026-05-01', start_time: '08:00', end_time: '16:00', team: 'team2', break_manual: true, break_minutes: 0 },
    { date: '2026-10-21', start_time: '18:00', end_time: '23:00', team: 'team2', break_manual: true, break_minutes: 0 },
  ];
  const breakdowns = shifts.map((shift) => getShiftBreakdown(shift, 230, 'team2', [], settings, disabled));
  const row = payrollRowFromWorker({
    worker: { id: 'w-asaad', name: 'Asaad Abdulbaki', position: 'Fast ansatt', hourly_rate: 230 },
    breakdowns,
  }, { period: '2026-10', team: 'N.417' });

  assert.equal(row.sunday_hours, 0);
  assert.equal(row.holiday_hours, 0);
  assert.equal(row.night_hours, 0);
  assert.equal(row.sunday_pay, 0);
  assert.equal(row.holiday_pay, 0);
  assert.equal(row.night_pay, 0);
  assert.equal(row.normal_hours, 19);
  assert.equal(row.total_hours, 19);
  assert.equal(row.total_pay, 4370);
});

test('a sick shift on a holiday stays in sick hours and drops the holiday supplement', () => {
  const settings = {
    full_time_hours_per_week: 37.5,
    team2_auto_break: true,
    team2_break_rules: [{ after_minutes: 360, break_minutes: 30 }],
    team2_holiday_extra_type: 'percentage',
    team2_holiday_extra_amount: 100,
  };
  const holidays = [{ date: '2026-05-01', name: 'Arbeidernes dag', pay_multiplier: 2, extra_type: 'percentage', extra_amount: 50 }];
  const shifts = [
    { date: '2026-05-01', start_time: '08:00', end_time: '16:00', team: 'team2', break_manual: false, break_minutes: 0, shift_label: 'sick' },
    { date: '2026-05-17', start_time: '08:00', end_time: '16:00', team: 'team2', break_manual: false, break_minutes: 0, shift_label: '' },
  ];
  const breakdowns = shifts.map((shift) => getShiftBreakdown(shift, 200, 'team2', holidays, settings, []));
  const row = payrollRowFromWorker({
    worker: { id: 'w1', name: 'Ada', position: 'Medarbeider', hourly_rate: 200 },
    breakdowns,
  }, { period: '2026-05', team: 'N.417' });

  assert.equal(row.sick_hours, 7.5);
  assert.equal(row.break_hours, 1);
  assert.equal(row.holiday_hours, 7.5);
  assert.equal(row.holiday_pay, 1500);
  assert.equal(breakdowns[0].holidayHours, 0);
  assert.equal(breakdowns[0].holidayBonus, 0);
  assert.equal(breakdowns[0].sickHours, 7.5);
});

test('column selection keeps the defined order and the csv explains overlaps', () => {
  const columns = resolvePayrollColumns(['ferie_hours', 'employee', 'normal_hours']);
  assert.deepEqual(columns.map((column) => column.key), ['employee', 'normal_hours', 'ferie_hours']);
  const csv = payrollCsv([{ employee: 'Ada; Nord', normal_hours: 7.5, ferie_hours: 0 }], columns, { period: '2026-10' });
  assert.match(csv, /kan overlappe/);
  assert.match(csv, /"Ada; Nord";7,50;0,00/);
});
