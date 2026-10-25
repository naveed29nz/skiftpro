/**
 * Shared pay calculation.
 * Hours deduct the effective unpaid break. Sunday, holiday and night
 * supplements stack when they apply. A supplement the worker has turned off
 * (workers.disabled_extras) contributes neither hours nor pay: those hours
 * stay regular. Night applies only when the store has nattillegg on and the
 * worker has not disabled it. Sick and ferie are counted apart from work.
 */

function getEaster(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addD(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }

function fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getNorwegianPublicHolidays(year) {
  const easter = getEaster(year);
  return [
    fmt(new Date(year, 0, 1)),
    fmt(addD(easter, -3)),
    fmt(addD(easter, -2)),
    fmt(easter),
    fmt(addD(easter, 1)),
    fmt(new Date(year, 4, 1)),
    fmt(new Date(year, 4, 17)),
    fmt(addD(easter, 39)),
    fmt(addD(easter, 49)),
    fmt(addD(easter, 50)),
    fmt(new Date(year, 11, 25)),
    fmt(new Date(year, 11, 26)),
  ];
}

export function getWorkerTeamKey(worker) {
  return (worker?.teams || ['team1'])[0] || 'team1';
}

export function getTeamExtra(wpSettings, teamKey, type) {
  const extraType = wpSettings?.[`${teamKey}_${type}_extra_type`] || 'none';
  const extraAmount = parseFloat(wpSettings?.[`${teamKey}_${type}_extra_amount`]) || 0;
  return { extraType, extraAmount };
}

export function calcExtraAmount(basePay, hours, extraType, extraAmount) {
  if (extraType === 'percentage') return basePay * (extraAmount / 100);
  if (extraType === 'fixed') return hours * extraAmount;
  return 0;
}

export function isAbsenceLabel(label) {
  return label === 'sick' || label === 'ferie';
}

function clockMinutes(time) {
  if (!time || typeof time !== 'string' || !time.includes(':')) return null;
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function fullDayHours(wpSettings) {
  const weekly = Number(wpSettings?.full_time_hours_per_week);
  const hours = Number.isFinite(weekly) && weekly > 0 ? weekly : 37.5;
  return hours / 5;
}

/** Clock length in minutes. An overnight shift that ends at the start time counts as 24 hours. */
export function grossMinutes(shift) {
  const start = clockMinutes(shift?.start_time);
  const end = clockMinutes(shift?.end_time);
  if (start == null || end == null) return 0;
  let total = end - start;
  if (total <= 0) total += 24 * 60;
  return total;
}

export function autoBreakEnabled(wpSettings, teamKey) {
  return wpSettings?.[`${teamKey || 'team1'}_auto_break`] === true;
}

export function nightEnabled(wpSettings, teamKey) {
  return wpSettings?.[`${teamKey || 'team1'}_night_enabled`] === true;
}

export function breakRulesForTeam(wpSettings, teamKey) {
  const key = teamKey || 'team1';
  if (!autoBreakEnabled(wpSettings, key)) return [];
  const raw = wpSettings?.[`${key}_break_rules`];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((rule) => ({
      afterMinutes: Number(rule?.after_minutes) || 0,
      breakMinutes: Number(rule?.break_minutes) || 0,
    }))
    .filter((rule) => rule.afterMinutes > 0 && rule.breakMinutes > 0)
    .sort((a, b) => a.afterMinutes - b.afterMinutes);
}

/** Highest matching rule. A shift of exactly the threshold does not match. */
export function automaticBreakMinutes(gross, rules) {
  let chosen = 0;
  for (const rule of rules || []) {
    if (gross > rule.afterMinutes) chosen = rule.breakMinutes;
  }
  return chosen;
}

/**
 * Personal break rule. Both fields must be filled. An empty pair means the
 * department rule still applies. A length of 0 turns automatic break off
 * for this employee. Returns null when there is no override.
 */
export function workerBreakOverride(worker) {
  if (!worker || typeof worker !== 'object') return null;
  const afterRaw = worker.break_after_hours;
  const lengthRaw = worker.break_length_minutes;
  if (afterRaw == null || afterRaw === '' || lengthRaw == null || lengthRaw === '') return null;
  const afterHours = Number(afterRaw);
  const breakMinutes = Number(lengthRaw);
  if (!Number.isFinite(afterHours) || afterHours <= 0) return null;
  if (!Number.isFinite(breakMinutes) || breakMinutes < 0) return null;
  if (breakMinutes === 0) return [];
  return [{ afterMinutes: Math.round(afterHours * 60), breakMinutes }];
}

export function effectiveBreakMinutes(shift, wpSettings, teamKey, worker) {
  if (!shift || shift.all_day) return 0;
  if (shift.break_manual === true) return Math.max(0, Number(shift.break_minutes) || 0);
  const override = workerBreakOverride(worker);
  const rules = override == null
    ? breakRulesForTeam(wpSettings, shift.team || teamKey || 'team1')
    : override;
  if (rules.length === 0) {
    if (override != null || shift.break_manual === false) return 0;
    return Math.max(0, Number(shift.break_minutes) || 0);
  }
  return automaticBreakMinutes(grossMinutes(shift), rules);
}

export function nightSupplement(wpSettings, teamKey) {
  const key = teamKey || 'team1';
  const from = wpSettings?.[`${key}_night_from`] || '21:00';
  const to = wpSettings?.[`${key}_night_to`] || '06:00';
  if (!nightEnabled(wpSettings, key)) {
    return { extraType: 'none', extraAmount: 0, from, to };
  }
  const storedType = wpSettings?.[`${key}_night_extra_type`];
  const extraType = !storedType || storedType === 'none' ? 'percentage' : storedType;
  const raw = wpSettings?.[`${key}_night_extra_amount`];
  const extraAmount = raw == null || raw === '' ? 50 : Number(raw) || 0;
  return { extraType, extraAmount, from, to };
}

function nightOverlapMinutes(start, end, from, to) {
  const windows = to <= from
    ? [[from, 1440], [1440, 1440 + to], [0, to]]
    : [[from, to], [from + 1440, to + 1440]];
  let total = 0;
  for (const [winStart, winEnd] of windows) {
    const left = Math.max(start, winStart);
    const right = Math.min(end, winEnd);
    if (right > left) total += right - left;
  }
  return total;
}

export function nightMinutes(shift, wpSettings, teamKey, worker) {
  if (!shift || shift.all_day || isAbsenceLabel(shift.shift_label)) return 0;
  const start = clockMinutes(shift.start_time);
  if (start == null) return 0;
  const gross = grossMinutes(shift);
  const breakMinutes = Math.min(gross, effectiveBreakMinutes(shift, wpSettings, teamKey, worker));
  const worked = gross - breakMinutes;
  if (worked <= 0) return 0;
  const night = nightSupplement(wpSettings, shift.team || teamKey);
  if (night.extraType === 'none') return 0;
  const from = clockMinutes(night.from);
  const to = clockMinutes(night.to);
  if (from == null || to == null || from === to) return 0;
  return nightOverlapMinutes(start, start + worked, from, to);
}

export function calcHours(shift, wpSettings, teamKey, worker) {
  if (shift?.all_day) return fullDayHours(wpSettings);
  const gross = grossMinutes(shift);
  const breakMinutes = Math.min(gross, effectiveBreakMinutes(shift, wpSettings, teamKey, worker));
  return Math.max(0, (gross - breakMinutes) / 60);
}

const EMPTY_SPLIT = {
  grossHours: 0,
  breakHours: 0,
  nightHours: 0,
  sundayHours: 0,
  holidayHours: 0,
  sickHours: 0,
  ferieHours: 0,
  nightBonus: 0,
  sundayBonus: 0,
  holidayBonus: 0,
};

/**
 * Full shift pay breakdown.
 * Night hours are a supplement on top of weekday, Sunday or holiday pay.
 * disabledExtras lists supplements that do not apply to this worker
 * ('sunday', 'holiday', 'night'). Checked off means the hours are regular.
 */
export function getShiftBreakdown(shift, workerRate, teamKey, holidays, wpSettings, disabledExtras = [], worker = null) {
  const resolvedTeam = shift?.team || teamKey || 'team1';
  const hours = calcHours(shift, wpSettings, resolvedTeam, worker);
  const rate = Number(workerRate) || 0;
  const date = new Date(`${shift.date}T00:00:00`);
  const gross = shift?.all_day ? hours : grossMinutes(shift) / 60;
  const breakHours = shift?.all_day ? 0 : Math.max(0, gross - hours);

  if (isAbsenceLabel(shift.shift_label)) {
    const basePay = hours * rate;
    const isFerie = shift.shift_label === 'ferie';
    return {
      shift,
      hours,
      label: isFerie ? 'Ferie' : 'Syk',
      isExtra: false,
      isSick: !isFerie,
      isFerie,
      isAllDay: Boolean(shift.all_day),
      basePay,
      extraBonus: 0,
      pay: basePay,
      regularHours: 0,
      extraHours: 0,
      ...EMPTY_SPLIT,
      grossHours: shift.all_day ? hours : gross,
      breakHours: shift.all_day ? 0 : Math.max(0, gross - hours),
      sickHours: isFerie ? 0 : hours,
      ferieHours: isFerie ? hours : 0,
    };
  }

  const isSunday = date.getDay() === 0;
  const holiday = holidays?.find((h) => h.date === shift.date);
  const norwegianHolidays = getNorwegianPublicHolidays(date.getFullYear());
  const isNorwegianHoliday = !holiday && norwegianHolidays.includes(shift.date);

  let basePay = hours * rate;
  let sundayBonus = 0;
  let holidayBonus = 0;
  let label = 'Vanlig';
  let isExtra = false;
  let sundayHours = 0;
  let holidayHours = 0;

  const holidayOff = disabledExtras.includes('holiday');
  const sundayOff = disabledExtras.includes('sunday');

  if (holiday && !holidayOff) {
    isExtra = true;
    holidayHours = hours;
    const multiplier = holiday.pay_multiplier || 2;
    basePay = hours * rate * multiplier;
    label = `Helligdag: ${holiday.name} ×${multiplier}`;
    const et = holiday.extra_type;
    const ea = holiday.extra_amount || 0;
    if (et === 'percentage') holidayBonus += basePay * (ea / 100);
    else if (et === 'fixed_per_shift' || et === 'fixed_per_day') holidayBonus += ea;
    const { extraType, extraAmount } = getTeamExtra(wpSettings, resolvedTeam, 'holiday');
    holidayBonus += calcExtraAmount(basePay, hours, extraType, extraAmount);
  } else if (!holiday && isNorwegianHoliday && !holidayOff) {
    isExtra = true;
    holidayHours = hours;
    const { extraType, extraAmount } = getTeamExtra(wpSettings, resolvedTeam, 'holiday');
    holidayBonus += calcExtraAmount(basePay, hours, extraType, extraAmount);
  } else if (!holiday && !isNorwegianHoliday && isSunday && !sundayOff) {
    label = 'Søndag';
    isExtra = true;
    sundayHours = hours;
    const { extraType, extraAmount } = getTeamExtra(wpSettings, resolvedTeam, 'sunday');
    sundayBonus += calcExtraAmount(basePay, hours, extraType, extraAmount);
  }

  const nightApplies = !disabledExtras.includes('night');
  const nightHours = nightApplies ? nightMinutes(shift, wpSettings, resolvedTeam, worker) / 60 : 0;
  let nightBonus = 0;
  if (nightHours > 0) {
    const night = nightSupplement(wpSettings, resolvedTeam);
    nightBonus = calcExtraAmount(nightHours * rate, nightHours, night.extraType, night.extraAmount);
  }
  const extraBonus = sundayBonus + holidayBonus + nightBonus;

  return {
    shift,
    hours,
    label,
    isExtra,
    isSick: false,
    isFerie: false,
    isAllDay: false,
    basePay,
    extraBonus,
    pay: basePay + extraBonus,
    regularHours: isExtra ? 0 : hours,
    extraHours: isExtra ? hours : 0,
    ...EMPTY_SPLIT,
    grossHours: gross,
    breakHours,
    nightHours,
    sundayHours,
    holidayHours,
    nightBonus,
    sundayBonus,
    holidayBonus,
  };
}
