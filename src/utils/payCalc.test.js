import test from 'node:test';
import assert from 'node:assert/strict';
import {
  automaticBreakMinutes,
  calcHours,
  effectiveBreakMinutes,
  getShiftBreakdown,
  nightMinutes,
} from './payCalc.js';

const osloTeam2 = {
  full_time_hours_per_week: 37.5,
  team2_break_rules: [{ after_minutes: 360, break_minutes: 30 }],
  team2_night_from: '21:00',
  team2_night_to: '06:00',
  team2_night_extra_type: 'percentage',
  team2_night_extra_amount: 50,
  team2_sunday_extra_type: 'percentage',
  team2_sunday_extra_amount: 50,
};

test('Oslo S Nord N.417 rule deducts 30 minutes only when the shift is longer than 6 hours', () => {
  const rules = osloTeam2.team2_break_rules.map((rule) => ({
    afterMinutes: rule.after_minutes,
    breakMinutes: rule.break_minutes,
  }));
  assert.equal(automaticBreakMinutes(360, rules), 0);
  assert.equal(automaticBreakMinutes(361, rules), 30);
  const longShift = {
    date: '2026-10-21',
    start_time: '08:00',
    end_time: '16:00',
    team: 'team2',
    break_manual: false,
    break_minutes: 0,
  };
  assert.equal(effectiveBreakMinutes(longShift, osloTeam2, 'team2'), 30);
  assert.equal(calcHours(longShift, osloTeam2, 'team2'), 7.5);
  const exact = { ...longShift, end_time: '14:00' };
  assert.equal(calcHours(exact, osloTeam2, 'team2'), 6);
});

test('a manual break overrides the store rule', () => {
  const shift = {
    date: '2026-10-21',
    start_time: '08:00',
    end_time: '16:00',
    team: 'team2',
    break_manual: true,
    break_minutes: 15,
  };
  assert.equal(effectiveBreakMinutes(shift, osloTeam2, 'team2'), 15);
  assert.equal(calcHours(shift, osloTeam2, 'team2'), 7.75);
});

test('the highest matching break rule wins', () => {
  const rules = [
    { afterMinutes: 360, breakMinutes: 30 },
    { afterMinutes: 540, breakMinutes: 60 },
  ];
  assert.equal(automaticBreakMinutes(480, rules), 30);
  assert.equal(automaticBreakMinutes(600, rules), 60);
});

test('night hours follow the store window and the unpaid break is removed from the end', () => {
  const night = {
    date: '2026-10-21',
    start_time: '22:00',
    end_time: '06:30',
    team: 'team2',
    break_manual: true,
    break_minutes: 30,
  };
  assert.equal(nightMinutes(night, osloTeam2, 'team2'), 480);
  const evening = {
    date: '2026-10-21',
    start_time: '18:00',
    end_time: '23:00',
    team: 'team2',
    break_manual: true,
    break_minutes: 0,
  };
  assert.equal(nightMinutes(evening, osloTeam2, 'team2'), 120);
  const day = {
    date: '2026-10-21',
    start_time: '08:00',
    end_time: '16:00',
    team: 'team2',
    break_manual: true,
    break_minutes: 0,
  };
  assert.equal(nightMinutes(day, osloTeam2, 'team2'), 0);
});

test('night supplement is 50 percent on top of weekday pay', () => {
  const shift = {
    date: '2026-10-21',
    start_time: '18:00',
    end_time: '23:00',
    team: 'team2',
    break_manual: true,
    break_minutes: 0,
    shift_label: 'evening',
  };
  const breakdown = getShiftBreakdown(shift, 200, 'team2', [], osloTeam2, []);
  assert.equal(breakdown.hours, 5);
  assert.equal(breakdown.regularHours, 5);
  assert.equal(breakdown.nightHours, 2);
  assert.equal(breakdown.nightBonus, 200);
  assert.equal(breakdown.pay, 1200);
});

test('sunday and night supplements stack, and sick does not get either', () => {
  const sundayNight = {
    date: '2026-10-25',
    start_time: '21:00',
    end_time: '23:00',
    team: 'team2',
    break_manual: true,
    break_minutes: 0,
  };
  const worked = getShiftBreakdown(sundayNight, 200, 'team2', [], osloTeam2, []);
  assert.equal(worked.sundayHours, 2);
  assert.equal(worked.nightHours, 2);
  assert.equal(worked.sundayBonus, 200);
  assert.equal(worked.nightBonus, 200);
  assert.equal(worked.regularHours, 0);

  const sick = { ...sundayNight, shift_label: 'sick' };
  const absence = getShiftBreakdown(sick, 200, 'team2', [], osloTeam2, []);
  assert.equal(absence.isSick, true);
  assert.equal(absence.sickHours, 2);
  assert.equal(absence.nightBonus, 0);
  assert.equal(absence.sundayBonus, 0);
  assert.equal(absence.pay, 400);
});

test('ferie can be a full day without clock times and is counted apart from work', () => {
  const ferie = {
    date: '2026-07-01',
    start_time: '00:00',
    end_time: '00:00',
    shift_label: 'ferie',
    all_day: true,
    team: 'team2',
  };
  const breakdown = getShiftBreakdown(ferie, 200, 'team2', [], osloTeam2, []);
  assert.equal(breakdown.isFerie, true);
  assert.equal(breakdown.ferieHours, 7.5);
  assert.equal(breakdown.regularHours, 0);
  assert.equal(breakdown.nightHours, 0);
  assert.equal(breakdown.breakHours, 0);
  assert.equal(breakdown.pay, 1500);
});
