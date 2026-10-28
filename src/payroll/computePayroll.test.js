import test from 'node:test';
import assert from 'node:assert/strict';
import { getShiftBreakdown } from '../utils/payCalc.js';
import { payrollBreakdown, payrollBreakdowns } from './computePayroll.js';

const settings = {
  full_time_hours_per_week: 37.5,
  team2_auto_break: true,
  team2_break_rules: [{ after_minutes: 360, break_minutes: 30 }],
  team2_night_enabled: true,
  team2_night_from: '21:00',
  team2_night_to: '06:00',
  team2_night_extra_type: 'percentage',
  team2_night_extra_amount: 50,
  team2_sunday_extra_type: 'percentage',
  team2_sunday_extra_amount: 50,
};

const shift = {
  id: 's1',
  worker_id: 'w1',
  date: '2026-10-18',
  start_time: '16:00',
  end_time: '23:00',
  team: 'team2',
  break_manual: false,
  break_minutes: 0,
  status: 'planned',
};

const worker = { id: 'w1', hourly_rate: 200, teams: ['team2'], disabled_extras: [] };

test('the server payload matches getShiftBreakdown field for field', () => {
  const local = getShiftBreakdown(shift, 200, 'team2', [], settings, [], worker);
  const remote = payrollBreakdown(shift, worker, [], settings);
  for (const key of ['hours', 'pay', 'breakHours', 'nightHours', 'nightBonus', 'regularHours']) {
    assert.equal(remote[key], local[key], key);
  }
  assert.equal(remote.shiftId, 's1');
  assert.equal(remote.pay, local.pay);
});

test('cancelled shifts are left out of the payroll list', () => {
  const rows = payrollBreakdowns({
    shifts: [shift, { ...shift, id: 'gone', status: 'cancelled' }],
    workers: [worker],
    holidays: [],
    workplace: settings,
  });
  assert.deepEqual(rows.map((row) => row.shiftId), ['s1']);
});
