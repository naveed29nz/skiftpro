/**
 * Payroll export rows. The receiving payroll system is not chosen yet, so the
 * column set is explicit and the caller can turn columns on or off.
 * Night, Sunday and holiday hours are supplements and may overlap each other
 * and the weekday hours they are paid on top of.
 */

export const PAYROLL_COLUMNS = [
  { key: 'employee', label: 'Ansatt', group: 'identitet' },
  { key: 'employee_id', label: 'Ansatt-id', group: 'identitet' },
  { key: 'position', label: 'Stilling', group: 'identitet' },
  { key: 'period', label: 'Periode', group: 'identitet' },
  { key: 'team', label: 'Avdeling', group: 'identitet' },
  { key: 'normal_hours', label: 'Vanlige timer', group: 'timer' },
  { key: 'break_hours', label: 'Pause trukket', group: 'timer' },
  { key: 'night_hours', label: 'Nattillegg timer', group: 'timer' },
  { key: 'sunday_hours', label: 'Søndagstillegg timer', group: 'timer' },
  { key: 'holiday_hours', label: 'Helligdagstillegg timer', group: 'timer' },
  { key: 'sick_hours', label: 'Syk timer', group: 'fravær' },
  { key: 'ferie_hours', label: 'Ferie timer', group: 'fravær' },
  { key: 'total_hours', label: 'Totale timer', group: 'timer' },
  { key: 'hourly_rate', label: 'Timesats', group: 'lønn' },
  { key: 'base_pay', label: 'Grunnlønn', group: 'lønn' },
  { key: 'night_pay', label: 'Nattillegg kr', group: 'lønn' },
  { key: 'sunday_pay', label: 'Søndagstillegg kr', group: 'lønn' },
  { key: 'holiday_pay', label: 'Helligdagstillegg kr', group: 'lønn' },
  { key: 'total_pay', label: 'Total lønn', group: 'lønn' },
  { key: 'payroll_tax', label: 'Sosiale avgifter', group: 'lønn' },
  { key: 'total_cost', label: 'Total kostnad', group: 'lønn' },
];

export const DEFAULT_PAYROLL_COLUMN_KEYS = PAYROLL_COLUMNS.map((column) => column.key);

const HOUR_KEYS = new Set([
  'normal_hours', 'break_hours', 'night_hours', 'sunday_hours', 'holiday_hours',
  'sick_hours', 'ferie_hours', 'total_hours',
]);

const MONEY_KEYS = new Set([
  'hourly_rate', 'base_pay', 'night_pay', 'sunday_pay', 'holiday_pay',
  'total_pay', 'payroll_tax', 'total_cost',
]);

export function resolvePayrollColumns(selectedKeys) {
  const wanted = Array.isArray(selectedKeys) && selectedKeys.length > 0
    ? selectedKeys
    : DEFAULT_PAYROLL_COLUMN_KEYS;
  const picked = PAYROLL_COLUMNS.filter((column) => wanted.includes(column.key));
  return picked.length > 0 ? picked : PAYROLL_COLUMNS;
}

export function payrollRowFromWorker(entry, meta, taxRate = 0.243) {
  const breakdowns = entry.breakdowns || [];
  const sum = (field) => breakdowns.reduce((total, row) => total + (Number(row[field]) || 0), 0);
  const normalHours = sum('regularHours');
  const sundayHours = sum('sundayHours');
  const holidayHours = sum('holidayHours');
  const sickHours = sum('sickHours');
  const ferieHours = sum('ferieHours');
  const nightPay = sum('nightBonus');
  const sundayPay = sum('sundayBonus');
  const holidayPay = sum('holidayBonus');
  const totalPay = breakdowns.reduce((total, row) => total + (Number(row.pay) || 0), 0);
  const tax = totalPay * taxRate;
  return {
    employee: entry.worker?.name || '',
    employee_id: entry.worker?.id || '',
    position: entry.worker?.position || '',
    period: meta.period || '',
    team: meta.team || '',
    normal_hours: normalHours,
    break_hours: sum('breakHours'),
    night_hours: sum('nightHours'),
    sunday_hours: sundayHours,
    holiday_hours: holidayHours,
    sick_hours: sickHours,
    ferie_hours: ferieHours,
    total_hours: normalHours + sundayHours + holidayHours + sickHours + ferieHours,
    hourly_rate: Number(entry.worker?.hourly_rate) || 0,
    base_pay: totalPay - nightPay - sundayPay - holidayPay,
    night_pay: nightPay,
    sunday_pay: sundayPay,
    holiday_pay: holidayPay,
    total_pay: totalPay,
    payroll_tax: tax,
    total_cost: totalPay + tax,
  };
}

function csvCell(column, value) {
  if (HOUR_KEYS.has(column.key)) return Number(value || 0).toFixed(2).replace('.', ',');
  if (MONEY_KEYS.has(column.key)) return Number(value || 0).toFixed(2).replace('.', ',');
  const text = String(value ?? '');
  if (/[;"\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function payrollCsv(rows, columns, meta = {}) {
  const sep = ';';
  const lines = [
    ['SkiftPro lønnseksport', meta.period || '', meta.team || ''].join(sep),
    ['Forklaring', 'Vanlige timer er hverdager etter ubetalt pause. Natt-, søndag- og helligdagstimer er tillegg og kan overlappe. Syk og ferie telles for seg og er ikke vanlige timer.'].join(sep),
    columns.map((column) => column.label).join(sep),
    ...rows.map((row) => columns.map((column) => csvCell(column, row[column.key])).join(sep)),
  ];
  return lines.join('\n');
}

export function payrollSheetRows(rows, columns) {
  return [
    columns.map((column) => column.label),
    ...rows.map((row) => columns.map((column) => {
      const value = row[column.key];
      if (HOUR_KEYS.has(column.key) || MONEY_KEYS.has(column.key)) return Number(value || 0);
      return value ?? '';
    })),
  ];
}
