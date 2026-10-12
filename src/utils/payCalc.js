/**
 * Shared pay calculation utility.
 * Calculates pay for a shift considering team-specific sunday/holiday extras.
 */

// --- Norwegian Public Holiday computation ---
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
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
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

export function calcHours(shift) {
  const [sh, sm] = shift.start_time.split(':').map(Number);
  const [eh, em] = shift.end_time.split(':').map(Number);
  let total = (eh * 60 + em) - (sh * 60 + sm) - (shift.break_minutes || 0);
  if (total < 0) total += 24 * 60; // overnight shift crossing midnight
  return Math.max(0, total / 60);
}

/**
 * Get the team key for a worker (first team in their teams array).
 */
export function getWorkerTeamKey(worker) {
  return (worker?.teams || ['team1'])[0] || 'team1';
}

/**
 * Get team-specific extra pay settings from wpSettings for a given teamKey and type (sunday/holiday).
 */
export function getTeamExtra(wpSettings, teamKey, type) {
  const extraType = wpSettings?.[`${teamKey}_${type}_extra_type`] || 'none';
  const extraAmount = parseFloat(wpSettings?.[`${teamKey}_${type}_extra_amount`]) || 0;
  return { extraType, extraAmount };
}

/**
 * Calculate extra pay amount for a given base pay and team extra settings.
 */
export function calcExtraAmount(basePay, hours, extraType, extraAmount) {
  if (extraType === 'percentage') return basePay * (extraAmount / 100);
  if (extraType === 'fixed') return hours * extraAmount;
  return 0;
}

/**
 * Full shift pay breakdown.
 * @param {object} shift
 * @param {number} workerRate - hourly rate in kr
 * @param {string} teamKey - 'team1'|'team2'|'team3'
 * @param {array} holidays - holiday records
 * @param {object} wpSettings - workplace settings object (wpSettings[0])
 */
export function getShiftBreakdown(shift, workerRate, teamKey, holidays, wpSettings, disabledExtras = []) {
  const hours = calcHours(shift);
  const date = new Date(shift.date + 'T00:00:00');

  // Syk: betales som vanlig timepris, men markeres separat og teller ikke som
  // vanlig arbeidstid eller ekstratid. Ingen søndags/helligdagstillegg for syke vakter.
  if (shift.shift_label === 'sick') {
    const basePay = hours * workerRate;
    return {
      shift,
      hours,
      label: 'Syk',
      isExtra: false,
      isSick: true,
      basePay,
      extraBonus: 0,
      pay: basePay,
      regularHours: 0,
      extraHours: 0,
      sickHours: hours,
    };
  }

  const isSunday = date.getDay() === 0;
  const holiday = holidays?.find(h => h.date === shift.date);
  const year = date.getFullYear();
  const norwegianHolidays = getNorwegianPublicHolidays(year);
  const isNorwegianHoliday = !holiday && norwegianHolidays.includes(shift.date);

  let basePay = hours * workerRate;
  let extraBonus = 0;
  let label = 'Vanlig';
  let isExtra = false;

  if (holiday) {
    isExtra = true;
    if (disabledExtras.includes('holiday')) {
      label = `Helligdag: ${holiday.name} (ingen tillegg)`;
      // basePay stays as normal hours * rate
    } else {
      const multiplier = holiday.pay_multiplier || 2;
      basePay = hours * workerRate * multiplier;
      label = `Helligdag: ${holiday.name} ×${multiplier}`;
      // Holiday entity extra (old system)
      const et = holiday.extra_type;
      const ea = holiday.extra_amount || 0;
      if (et === 'percentage') extraBonus += basePay * (ea / 100);
      else if (et === 'fixed_per_shift' || et === 'fixed_per_day') extraBonus += ea;
      // Team holiday extra (new system)
      const { extraType, extraAmount } = getTeamExtra(wpSettings, teamKey, 'holiday');
      extraBonus += calcExtraAmount(basePay, hours, extraType, extraAmount);
    }
  } else if (isNorwegianHoliday) {
    isExtra = true;
    if (!disabledExtras.includes('holiday')) {
      const { extraType, extraAmount } = getTeamExtra(wpSettings, teamKey, 'holiday');
      extraBonus += calcExtraAmount(basePay, hours, extraType, extraAmount);
    }
  } else if (isSunday) {
    label = 'Søndag';
    isExtra = true;
    if (!disabledExtras.includes('sunday')) {
      const { extraType, extraAmount } = getTeamExtra(wpSettings, teamKey, 'sunday');
      extraBonus += calcExtraAmount(basePay, hours, extraType, extraAmount);
    }
  }

  return {
    shift,
    hours,
    label,
    isExtra,
    basePay,
    extraBonus,
    pay: basePay + extraBonus,
    regularHours: isExtra ? 0 : hours,
    extraHours: isExtra ? hours : 0,
  };
}