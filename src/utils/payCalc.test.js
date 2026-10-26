import test from 'node:test';
import assert from 'node:assert/strict';
import {
  automaticBreakMinutes,
  calcHours,
  effectiveBreakMinutes,
  getShiftBreakdown,
  nightMinutes,
  workerBreakOverride,
} from './payCalc.js';

const osloTeam2 = {
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

const storeFiveAndAHalf = {
  ...osloTeam2,
  team2_break_rules: [{ after_minutes: 330, break_minutes: 30 }],
};

test('a store rule of 30 minutes after 5.5 hours does not apply at exactly 5.5 hours', () => {
  const exact = {
    date: '2026-10-21',
    start_time: '08:00',
    end_time: '13:30',
    team: 'team2',
    break_manual: false,
    break_minutes: 0,
  };
  const longer = { ...exact, end_time: '14:00' };
  assert.equal(effectiveBreakMinutes(exact, storeFiveAndAHalf, 'team2'), 0);
  assert.equal(calcHours(exact, storeFiveAndAHalf, 'team2'), 5.5);
  assert.equal(effectiveBreakMinutes(longer, storeFiveAndAHalf, 'team2'), 30);
  assert.equal(calcHours(longer, storeFiveAndAHalf, 'team2'), 5.5);
});

test('an employee break override replaces the store rule', () => {
  const elif = { break_after_hours: 6, break_length_minutes: 30 };
  assert.deepEqual(workerBreakOverride(elif), [{ afterMinutes: 360, breakMinutes: 30 }]);
  assert.equal(workerBreakOverride({}), null);
  assert.equal(workerBreakOverride({ break_after_hours: 6 }), null);
  const sixHours = {
    date: '2026-10-21',
    start_time: '08:00',
    end_time: '14:00',
    team: 'team2',
    break_manual: false,
    break_minutes: 0,
  };
  const pastSix = { ...sixHours, end_time: '14:30' };
  assert.equal(effectiveBreakMinutes(sixHours, storeFiveAndAHalf, 'team2'), 30);
  assert.equal(effectiveBreakMinutes(sixHours, storeFiveAndAHalf, 'team2', elif), 0);
  assert.equal(calcHours(sixHours, storeFiveAndAHalf, 'team2', elif), 6);
  assert.equal(effectiveBreakMinutes(pastSix, storeFiveAndAHalf, 'team2', elif), 30);
  assert.equal(calcHours(pastSix, storeFiveAndAHalf, 'team2', elif), 6);
  const manual = { ...pastSix, break_manual: true, break_minutes: 15 };
  assert.equal(effectiveBreakMinutes(manual, storeFiveAndAHalf, 'team2', elif), 15);
  const breakdown = getShiftBreakdown(pastSix, 200, 'team2', [], storeFiveAndAHalf, [], elif);
  assert.equal(breakdown.hours, 6);
  assert.equal(breakdown.breakHours, 0.5);
  const noBreak = { break_after_hours: 6, break_length_minutes: 0 };
  assert.equal(effectiveBreakMinutes(pastSix, storeFiveAndAHalf, 'team2', noBreak), 0);
  const storeOff = { ...storeFiveAndAHalf, team2_auto_break: false };
  assert.equal(effectiveBreakMinutes(pastSix, storeOff, 'team2', elif), 30);
  assert.deepEqual(workerBreakOverride({ break_after_hours: 5.5, break_length_minutes: 30 }), [{ afterMinutes: 330, breakMinutes: 30 }]);
});

test('a sick shift longer than 6 hours takes the same 30 minute break and no holiday supplement', () => {
  const holidays = [{ date: '2026-05-01', name: 'Arbeidernes dag', pay_multiplier: 2, extra_type: 'percentage', extra_amount: 50 }];
  const settings = {
    ...osloTeam2,
    team2_holiday_extra_type: 'percentage',
    team2_holiday_extra_amount: 100,
  };
  const timed = {
    date: '2026-05-01',
    start_time: '08:00',
    end_time: '16:00',
    team: 'team2',
    break_manual: false,
    break_minutes: 0,
  };
  const exact = { ...timed, end_time: '14:00' };
  const sick = { ...timed, shift_label: 'sick' };
  const sickExact = { ...exact, shift_label: 'sick' };
  const sickAllDayWithTimes = { ...sick, all_day: true };
  const sickWholeDay = {
    ...sick,
    all_day: true,
    start_time: '00:00',
    end_time: '00:00',
  };

  assert.equal(effectiveBreakMinutes(exact, settings, 'team2'), 0);
  assert.equal(effectiveBreakMinutes(timed, settings, 'team2'), 30);
  assert.equal(effectiveBreakMinutes(sickExact, settings, 'team2'), 0);
  assert.equal(effectiveBreakMinutes(sick, settings, 'team2'), 30);
  assert.equal(effectiveBreakMinutes(sickAllDayWithTimes, settings, 'team2'), 30);
  assert.equal(effectiveBreakMinutes(sickWholeDay, settings, 'team2'), 0);

  const sickPay = getShiftBreakdown(sick, 200, 'team2', holidays, settings, []);
  assert.equal(sickPay.label, 'Syk');
  assert.equal(sickPay.isSick, true);
  assert.equal(sickPay.hours, 7.5);
  assert.equal(sickPay.sickHours, 7.5);
  assert.equal(sickPay.breakHours, 0.5);
  assert.equal(sickPay.holidayHours, 0);
  assert.equal(sickPay.holidayBonus, 0);
  assert.equal(sickPay.sundayHours, 0);
  assert.equal(sickPay.nightHours, 0);
  assert.equal(sickPay.regularHours, 0);
  assert.equal(sickPay.pay, 1500);

  const worked = getShiftBreakdown(timed, 200, 'team2', holidays, settings, []);
  assert.equal(worked.holidayHours, 7.5);
  assert.equal(worked.sickHours, 0);
  assert.equal(worked.basePay, 3000);
  assert.equal(worked.holidayBonus, 4500);
  assert.equal(worked.pay, 7500);

  const sickSundayHoliday = getShiftBreakdown({
    date: '2026-05-17',
    start_time: '10:00',
    end_time: '16:00',
    team: 'team2',
    break_manual: false,
    break_minutes: 0,
    shift_label: 'sick',
  }, 200, 'team2', [], settings, []);
  assert.equal(sickSundayHoliday.sickHours, 6);
  assert.equal(sickSundayHoliday.breakHours, 0);
  assert.equal(sickSundayHoliday.holidayHours, 0);
  assert.equal(sickSundayHoliday.sundayHours, 0);
  assert.equal(sickSundayHoliday.pay, 1200);

  const wholeDay = getShiftBreakdown(sickWholeDay, 200, 'team2', holidays, settings, []);
  assert.equal(wholeDay.sickHours, 7.5);
  assert.equal(wholeDay.breakHours, 0);
  assert.equal(wholeDay.holidayHours, 0);
  assert.equal(wholeDay.holidayBonus, 0);
  assert.equal(wholeDay.pay, 1500);
});

test('egenmelding and sykmelding follow the sick break and get no supplements', () => {
  const holidays = [{ date: '2026-05-01', name: 'Arbeidernes dag', pay_multiplier: 2, extra_type: 'percentage', extra_amount: 50 }];
  const settings = {
    ...osloTeam2,
    team2_holiday_extra_type: 'percentage',
    team2_holiday_extra_amount: 100,
  };
  const timed = {
    date: '2026-05-01',
    start_time: '08:00',
    end_time: '16:00',
    team: 'team2',
    break_manual: false,
    break_minutes: 0,
  };
  const cases = [
    ['sick_self', 'Egenmelding', 'egenmeldingHours', 'sykmeldingHours'],
    ['sick_doctor', 'Sykmelding', 'sykmeldingHours', 'egenmeldingHours'],
  ];
  for (const [label, name, ownField, otherField] of cases) {
    const shift = { ...timed, shift_label: label };
    assert.equal(effectiveBreakMinutes(shift, settings, 'team2'), 30);
    assert.equal(effectiveBreakMinutes({ ...shift, all_day: true }, settings, 'team2'), 30);
    assert.equal(effectiveBreakMinutes({ ...shift, all_day: true, start_time: '00:00', end_time: '00:00' }, settings, 'team2'), 0);
    const pay = getShiftBreakdown(shift, 200, 'team2', holidays, settings, []);
    assert.equal(pay.label, name);
    assert.equal(pay.isSick, true);
    assert.equal(pay.hours, 7.5);
    assert.equal(pay.sickHours, 7.5);
    assert.equal(pay[ownField], 7.5);
    assert.equal(pay[otherField], 0);
    assert.equal(pay.holidayHours, 0);
    assert.equal(pay.sundayHours, 0);
    assert.equal(pay.nightHours, 0);
    assert.equal(pay.regularHours, 0);
    assert.equal(pay.pay, 1500);
  }

  const legacy = getShiftBreakdown({ ...timed, shift_label: 'sick' }, 200, 'team2', holidays, settings, []);
  assert.equal(legacy.label, 'Syk');
  assert.equal(legacy.sickHours, 7.5);
  assert.equal(legacy.egenmeldingHours, 0);
  assert.equal(legacy.sykmeldingHours, 0);

  const sundayHoliday = getShiftBreakdown({
    date: '2026-05-17',
    start_time: '21:00',
    end_time: '23:00',
    team: 'team2',
    break_manual: true,
    break_minutes: 0,
    shift_label: 'sick_self',
  }, 200, 'team2', [], settings, []);
  assert.equal(sundayHoliday.sickHours, 2);
  assert.equal(sundayHoliday.egenmeldingHours, 2);
  assert.equal(sundayHoliday.sundayHours, 0);
  assert.equal(sundayHoliday.holidayHours, 0);
  assert.equal(sundayHoliday.nightHours, 0);
  assert.equal(sundayHoliday.pay, 400);
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

test('break rules and night supplement stay off until the store enables them', () => {
  const stored = {
    ...osloTeam2,
    team2_auto_break: false,
    team2_night_enabled: false,
  };
  const shift = {
    date: '2026-10-21',
    start_time: '22:00',
    end_time: '06:30',
    team: 'team2',
    break_manual: false,
    break_minutes: 30,
  };
  assert.equal(effectiveBreakMinutes(shift, stored, 'team2'), 0);
  assert.equal(calcHours(shift, stored, 'team2'), 8.5);
  assert.equal(nightMinutes(shift, stored, 'team2'), 0);
  const breakdown = getShiftBreakdown(shift, 200, 'team2', [], stored, []);
  assert.equal(breakdown.breakHours, 0);
  assert.equal(breakdown.nightHours, 0);
  assert.equal(breakdown.nightBonus, 0);
  assert.equal(effectiveBreakMinutes(shift, {}, 'team2'), 0);
  assert.equal(nightMinutes(shift, {}, 'team2'), 0);
});

test('sunday hours stay regular when the worker has søndagstillegg turned off', () => {
  const sunday = {
    date: '2026-10-25',
    start_time: '10:00',
    end_time: '16:00',
    team: 'team2',
    break_manual: true,
    break_minutes: 0,
  };
  const off = getShiftBreakdown(sunday, 230, 'team2', [], osloTeam2, ['sunday', 'holiday']);
  assert.equal(off.hours, 6);
  assert.equal(off.sundayHours, 0);
  assert.equal(off.sundayBonus, 0);
  assert.equal(off.holidayHours, 0);
  assert.equal(off.regularHours, 6);
  assert.equal(off.extraHours, 0);
  assert.equal(off.isExtra, false);
  assert.equal(off.label, 'Vanlig');
  assert.equal(off.pay, 1380);

  const on = getShiftBreakdown(sunday, 230, 'team2', [], osloTeam2, []);
  assert.equal(on.sundayHours, 6);
  assert.equal(on.sundayBonus, 690);
  assert.equal(on.regularHours, 0);
  assert.equal(on.pay, 2070);
});

test('a holiday the worker has turned off is paid as regular hours without the multiplier', () => {
  const shift = {
    date: '2026-10-22',
    start_time: '10:00',
    end_time: '16:00',
    team: 'team2',
    break_manual: true,
    break_minutes: 0,
  };
  const holidays = [{ date: '2026-10-22', name: 'Egen dag', pay_multiplier: 2 }];
  const settings = {
    ...osloTeam2,
    team2_holiday_extra_type: 'percentage',
    team2_holiday_extra_amount: 50,
  };
  const off = getShiftBreakdown(shift, 200, 'team2', holidays, settings, ['holiday']);
  assert.equal(off.holidayHours, 0);
  assert.equal(off.holidayBonus, 0);
  assert.equal(off.sundayHours, 0);
  assert.equal(off.regularHours, 6);
  assert.equal(off.basePay, 1200);
  assert.equal(off.pay, 1200);
  assert.equal(off.label, 'Vanlig');

  const on = getShiftBreakdown(shift, 200, 'team2', holidays, settings, []);
  assert.equal(on.holidayHours, 6);
  assert.equal(on.regularHours, 0);
  assert.equal(on.basePay, 2400);
  assert.equal(on.holidayBonus, 1200);
  assert.equal(on.pay, 3600);
});

test('a public holiday stays regular when helligdagstillegg is off, including when that day is a Sunday', () => {
  const labourDay = {
    date: '2026-05-01',
    start_time: '08:00',
    end_time: '16:00',
    team: 'team2',
    break_manual: true,
    break_minutes: 0,
  };
  const settings = {
    ...osloTeam2,
    team2_holiday_extra_type: 'percentage',
    team2_holiday_extra_amount: 50,
  };
  const off = getShiftBreakdown(labourDay, 200, 'team2', [], settings, ['holiday']);
  assert.equal(off.holidayHours, 0);
  assert.equal(off.holidayBonus, 0);
  assert.equal(off.regularHours, 8);
  assert.equal(off.pay, 1600);

  const on = getShiftBreakdown(labourDay, 200, 'team2', [], settings, []);
  assert.equal(on.holidayHours, 8);
  assert.equal(on.holidayBonus, 800);
  assert.equal(on.regularHours, 0);

  const constitutionDay = { ...labourDay, date: '2026-05-17' };
  const sundayHolidayOff = getShiftBreakdown(constitutionDay, 200, 'team2', [], settings, ['holiday']);
  assert.equal(sundayHolidayOff.holidayHours, 0);
  assert.equal(sundayHolidayOff.sundayHours, 0);
  assert.equal(sundayHolidayOff.regularHours, 8);
  assert.equal(sundayHolidayOff.pay, 1600);
});

test('night supplement applies only when the store and the worker both have it on', () => {
  const evening = {
    date: '2026-10-21',
    start_time: '18:00',
    end_time: '23:00',
    team: 'team2',
    break_manual: true,
    break_minutes: 0,
    shift_label: 'evening',
  };
  const workerOff = getShiftBreakdown(evening, 200, 'team2', [], osloTeam2, ['night']);
  assert.equal(workerOff.nightHours, 0);
  assert.equal(workerOff.nightBonus, 0);
  assert.equal(workerOff.regularHours, 5);
  assert.equal(workerOff.pay, 1000);

  const bothOn = getShiftBreakdown(evening, 200, 'team2', [], osloTeam2, []);
  assert.equal(bothOn.nightHours, 2);
  assert.equal(bothOn.nightBonus, 200);

  const storeOff = {
    ...osloTeam2,
    team2_night_enabled: false,
  };
  const workerOnStoreOff = getShiftBreakdown(evening, 200, 'team2', [], storeOff, []);
  assert.equal(workerOnStoreOff.nightHours, 0);
  assert.equal(workerOnStoreOff.nightBonus, 0);
  assert.equal(workerOnStoreOff.pay, 1000);

  const sundayNight = {
    date: '2026-10-25',
    start_time: '21:00',
    end_time: '23:00',
    team: 'team2',
    break_manual: true,
    break_minutes: 0,
  };
  const sundayOffNightOn = getShiftBreakdown(sundayNight, 200, 'team2', [], osloTeam2, ['sunday']);
  assert.equal(sundayOffNightOn.sundayHours, 0);
  assert.equal(sundayOffNightOn.sundayBonus, 0);
  assert.equal(sundayOffNightOn.regularHours, 2);
  assert.equal(sundayOffNightOn.nightHours, 2);
  assert.equal(sundayOffNightOn.nightBonus, 200);
  assert.equal(sundayOffNightOn.pay, 600);
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
