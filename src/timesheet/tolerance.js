// Compare clocked times with the planned shift. This does not calculate pay.

import { isFullDayAbsence } from '../utils/shiftLabels.js';

export const TOLERANCE_MINUTES = [0, 15, 30, 60];
export const DEFAULT_TOLERANCE_MINUTES = 30;
const LEDIG = 'ledig';

export function readToleranceMinutes(storage) {
  const stored = storage?.getItem?.('timesheet_tolerance_minutes');
  if (stored == null || stored === '') return DEFAULT_TOLERANCE_MINUTES;
  const raw = Number(stored);
  return TOLERANCE_MINUTES.includes(raw) ? raw : DEFAULT_TOLERANCE_MINUTES;
}

export function writeToleranceMinutes(storage, minutes) {
  if (!TOLERANCE_MINUTES.includes(minutes)) return;
  storage?.setItem?.('timesheet_tolerance_minutes', String(minutes));
}

function parseHm(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function localParts(date) {
  return {
    y: date.getFullYear(),
    m: date.getMonth() + 1,
    d: date.getDate(),
    minutes: date.getHours() * 60 + date.getMinutes(),
  };
}

export function clockMinutes(iso, shiftDate) {
  if (!iso || !shiftDate) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = localParts(date);
  const key = `${parts.y}-${String(parts.m).padStart(2, '0')}-${String(parts.d).padStart(2, '0')}`;
  const [y, m, d] = String(shiftDate).slice(0, 10).split('-').map(Number);
  const shift = new Date(y, m - 1, d);
  const clock = new Date(parts.y, parts.m - 1, parts.d);
  const dayDelta = Math.round((clock.getTime() - shift.getTime()) / 86400000);
  if (!key) return null;
  return dayDelta * 1440 + parts.minutes;
}

export function plannedWindow(shift) {
  const start = parseHm(shift?.start_time);
  let end = parseHm(shift?.end_time);
  if (start == null || end == null) return null;
  if (end <= start) end += 1440;
  return { start, end };
}

function clockWindow(stamp, shift) {
  if (!stamp) return { inn: null, out: null };
  const inn = clockMinutes(stamp.stamp_in, shift.date);
  let out = clockMinutes(stamp.stamp_out, shift.date);
  const planned = plannedWindow(shift);
  if (inn != null && out != null && out <= inn && planned && planned.end > 1440) out += 1440;
  return { inn, out };
}

export function toleranceVerdict(shift, stamp, toleranceMinutes, today) {
  const empty = { comparable: false, outside: false, within: false, deviation: null };
  if (!shift || shift.status === 'cancelled') return empty;
  if (shift.all_day || isFullDayAbsence(shift.shift_label)) return empty;
  if (!shift.worker_id || shift.worker_id === LEDIG) return empty;
  const date = String(shift.date || '').slice(0, 10);
  if (!date || !today || date > today) return empty;
  const planned = plannedWindow(shift);
  const clock = clockWindow(stamp, shift);
  if (!planned || clock.inn == null || clock.out == null) {
    return { comparable: true, outside: true, within: false, deviation: null, reason: 'missing' };
  }
  const startDiff = Math.abs(clock.inn - planned.start);
  const endDiff = Math.abs(clock.out - planned.end);
  const deviation = Math.max(startDiff, endDiff);
  const within = deviation <= toleranceMinutes;
  return { comparable: true, outside: !within, within, deviation, startDiff, endDiff };
}

export function shiftMatchesTeam(shift, filterTeam, worker) {
  if (!filterTeam || filterTeam === 'all') {
    if (!worker) return true;
    const workerTeams = worker.teams?.length ? worker.teams : ['team1'];
    if (shift.team) return workerTeams.includes(shift.team);
    return true;
  }
  if (!worker) return Boolean(shift.team) && shift.team === filterTeam;
  if (shift.team) return shift.team === filterTeam;
  return (worker.teams?.[0] || 'team1') === filterTeam;
}

export function shiftInScope(shift, { filterTeam = 'all', filterWorker = 'all', workers = [] } = {}) {
  if (filterWorker !== 'all' && shift.worker_id !== filterWorker) return false;
  const worker = workers.find((item) => item.id === shift.worker_id);
  return shiftMatchesTeam(shift, filterTeam, worker);
}

export function summarizeTolerance(shifts, resolveStamp, minutes, today, scope) {
  let within = 0;
  let outside = 0;
  const withinShifts = [];
  for (const shift of shifts || []) {
    if (!shiftInScope(shift, scope)) continue;
    const verdict = toleranceVerdict(shift, resolveStamp(shift), minutes, today);
    if (verdict.within && shift.hours_approved !== true) {
      within += 1;
      withinShifts.push(shift);
    } else if (verdict.outside) {
      outside += 1;
    }
  }
  return { within, outside, withinShifts };
}

export function workersWithOutsideShifts(workers, shifts, resolveStamp, minutes, today) {
  return (workers || []).filter((worker) => (shifts || []).some((shift) => {
    if (shift.worker_id !== worker.id) return false;
    return toleranceVerdict(shift, resolveStamp(shift), minutes, today).outside;
  }));
}
