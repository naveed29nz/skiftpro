import { getShiftBreakdown } from '../utils/payCalc.js';

export const BREAKDOWN_FIELDS = [
  'hours',
  'label',
  'isExtra',
  'isSick',
  'isFerie',
  'isAllDay',
  'basePay',
  'extraBonus',
  'pay',
  'regularHours',
  'extraHours',
  'grossHours',
  'breakHours',
  'nightHours',
  'sundayHours',
  'holidayHours',
  'sickHours',
  'egenmeldingHours',
  'sykmeldingHours',
  'ferieHours',
  'nightBonus',
  'sundayBonus',
  'holidayBonus',
];

export function payrollBreakdown(shift, worker, holidays, workplace) {
  const teamKey = shift?.team || worker?.teams?.[0] || worker?.team || 'team1';
  const raw = getShiftBreakdown(
    shift,
    worker?.hourly_rate || 0,
    teamKey,
    holidays,
    workplace,
    worker?.disabled_extras || [],
    worker,
  );
  const row = {
    shiftId: shift?.id || null,
    workerId: shift?.worker_id || null,
    shiftLabel: shift?.shift_label || '',
  };
  for (const key of BREAKDOWN_FIELDS) row[key] = raw[key];
  return row;
}

export function payrollBreakdowns({ shifts = [], workers = [], holidays = [], workplace = null } = {}) {
  const byWorker = new Map(workers.map((worker) => [worker.id, worker]));
  return shifts
    .filter((shift) => shift && shift.status !== 'cancelled')
    .map((shift) => payrollBreakdown(shift, byWorker.get(shift.worker_id) || null, holidays, workplace));
}
