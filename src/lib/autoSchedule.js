// @ts-nocheck
// Deterministic draft planner and employee ranking.
// No external API. The caller must already have limited rows to one org.

import { isFullDayAbsence } from '../utils/shiftLabels.js';
import { resolveStaffingBudget } from './staffingBudget.js';

export const MAX_WEEKLY_HOURS = 40;
export const MIN_REST_HOURS = 11;
export const HISTORY_WEEKS = 4;
export const MAX_PLAN_DAYS = 28;
export const AUTO_DRAFT_NOTE = 'Auto-planlagt utkast';
export const OPEN_SHIFT_NOTE = `${AUTO_DRAFT_NOTE} · ingen kvalifisert ansatt`;
export const OPEN_WORKER_ID = 'ledig';
export const OPEN_WORKER_NAME = 'Ledig vakt';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const NAMED_LABELS = new Set(['morning', 'middle', 'evening']);

const BLOCK_TEXT = {
  team: 'Tilhører ikke denne butikken',
  inactive: 'Er ikke aktiv',
  unavailable: 'Har meldt seg utilgjengelig',
  absence: 'Har ferie eller annet fravær denne dagen',
  overlap: 'Har en vakt som overlapper',
  hours: 'Ville passert 40 timer denne uka',
  rest: 'Mindre enn 11 timer hvile',
};

const BLOCK_SUMMARY = {
  team: 'butikktilhørighet',
  inactive: 'inaktiv ansatt',
  unavailable: 'utilgjengelighet',
  absence: 'ferie eller fravær',
  overlap: 'overlappende vakt',
  hours: '40-timersgrensen',
  rest: 'hviletid under 11 timer',
};

export function isAutoDraft(shift) {
  return Boolean(shift)
    && shift.published === false
    && shift.status !== 'cancelled'
    && typeof shift.notes === 'string'
    && shift.notes.startsWith(AUTO_DRAFT_NOTE);
}

export function formatHours(hours) {
  const n = Math.round((Number(hours) || 0) * 10) / 10;
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1).replace('.', ',');
}

export function contractWeeklyHours(worker, fullTimeHours = 37.5) {
  const full = Number(fullTimeHours) > 0 ? Number(fullTimeHours) : 37.5;
  const explicit = Number(worker?.timer_per_uke);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  if (worker?.ansettelsestype === 'tilkalling') return 0;
  const pct = Number(worker?.employment_percentage);
  if (Number.isFinite(pct) && pct >= 0) return full * (Math.min(pct, 100) / 100);
  return full;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

export function normalizeTime(value) {
  if (!value || typeof value !== 'string') return '00:00';
  const [hRaw, mRaw] = value.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '00:00';
  return `${pad(Math.min(23, Math.max(0, h)))}:${pad(Math.min(59, Math.max(0, m)))}`;
}

function clockMinutes(value) {
  const [h, m] = normalizeTime(value).split(':').map(Number);
  return h * 60 + m;
}

export function addDays(dateStr, days) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export function weekdayIndex(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 6 : day - 1;
}

export function eachDate(fromDate, toDate) {
  const dates = [];
  if (!fromDate || !toDate || fromDate > toDate) return dates;
  let cursor = fromDate;
  while (cursor <= toDate && dates.length <= 62) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function weekKey(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${pad(week)}`;
}

function isoWeekParts(dateStr) {
  const key = weekKey(dateStr);
  const [year, week] = key.split('-W');
  return { year: Number(year), week: Number(week) };
}

function isAbsenceShift(shift) {
  if (!shift) return false;
  if (shift.all_day) return true;
  return isFullDayAbsence(shift.shift_label);
}

function isWorkShift(shift) {
  return Boolean(shift) && shift.status !== 'cancelled' && !isAbsenceShift(shift);
}

export function scheduleHours(shift) {
  if (!isWorkShift(shift)) return 0;
  const start = clockMinutes(shift.start_time);
  let end = clockMinutes(shift.end_time);
  if (end <= start) end += 24 * 60;
  const gross = end - start;
  const breakMinutes = Math.min(gross, Math.max(0, Number(shift.break_minutes) || 0));
  return Math.max(0, (gross - breakMinutes) / 60);
}

function grossHours(shift) {
  const start = clockMinutes(shift.start_time);
  let end = clockMinutes(shift.end_time);
  if (end <= start) end += 24 * 60;
  return (end - start) / 60;
}

function defaultBreak(startTime, endTime) {
  return grossHours({ start_time: startTime, end_time: endTime, status: 'scheduled' }) > 6 ? 30 : 0;
}

function intervalOf(shift) {
  const day = String(shift.date).split('-').map(Number);
  const origin = Date.UTC(day[0], day[1] - 1, day[2]) / 60000;
  const start = origin + clockMinutes(shift.start_time);
  let end = origin + clockMinutes(shift.end_time);
  if (end <= start) end += 24 * 60;
  return { start, end };
}

function overlapMinutes(a, b) {
  const left = intervalOf(a);
  const right = intervalOf(b);
  return Math.max(0, Math.min(left.end, right.end) - Math.max(left.start, right.start));
}

function workerTeams(worker) {
  if (Array.isArray(worker?.teams) && worker.teams.length) return worker.teams;
  return ['team1'];
}

function resolveTeam(shift, workers) {
  if (shift?.team) return shift.team;
  const worker = (workers || []).find((item) => item.id === shift?.worker_id);
  return workerTeams(worker)[0];
}

function onTeam(worker, team) {
  return workerTeams(worker).includes(team);
}

function sameOrg(row, orgId) {
  if (!orgId || !row?.org_id) return true;
  return row.org_id === orgId;
}

function paintHours(cov, startMin, endMin) {
  for (let hour = 0; hour < 24; hour += 1) {
    const left = hour * 60;
    const right = left + 60;
    if (startMin < right && endMin > left) cov[hour] += 1;
  }
}

function addSameDayCoverage(cov, shift) {
  const start = clockMinutes(shift.start_time);
  const end = clockMinutes(shift.end_time);
  paintHours(cov, start, end <= start ? 24 * 60 : end);
}

function addSpillCoverage(cov, shift) {
  const start = clockMinutes(shift.start_time);
  const end = clockMinutes(shift.end_time);
  if (end > start || end === 0) return;
  paintHours(cov, 0, end);
}

function coverageForDate(slotsByDate, date) {
  const cov = Array(24).fill(0);
  for (const slot of slotsByDate[date] || []) addSameDayCoverage(cov, slot);
  for (const slot of slotsByDate[addDays(date, -1)] || []) addSpillCoverage(cov, slot);
  return cov;
}

function coverageFromShifts(shifts, date, team, workers) {
  const cov = Array(24).fill(0);
  for (const shift of shifts) {
    if (!isWorkShift(shift) || resolveTeam(shift, workers) !== team) continue;
    if (shift.date === date) addSameDayCoverage(cov, shift);
    else if (shift.date === addDays(date, -1)) addSpillCoverage(cov, shift);
  }
  return cov;
}

function hoursTouched(shift) {
  const start = clockMinutes(shift.start_time);
  const end = clockMinutes(shift.end_time);
  const hours = [];
  const stop = end <= start ? 24 * 60 : end;
  for (let hour = 0; hour < 24; hour += 1) {
    const left = hour * 60;
    if (start < left + 60 && stop > left) hours.push({ date: shift.date, hour });
  }
  if (end <= start && end > 0) {
    const next = addDays(shift.date, 1);
    for (let hour = 0; hour < 24; hour += 1) {
      const left = hour * 60;
      if (end > left) hours.push({ date: next, hour });
    }
  }
  return hours;
}

function requiredPeople(value) {
  const n = Number(value) || 0;
  if (n < 0.5) return 0;
  return Math.round(n);
}

function requiredArray(budgetMap, date) {
  const key = DAY_KEYS[weekdayIndex(date)];
  const required = Array(24).fill(0);
  if (!budgetMap) return required;
  for (let hour = 0; hour < 24; hour += 1) {
    required[hour] = requiredPeople(budgetMap[hour]?.[key]);
  }
  return required;
}

function budgetMapActive(map) {
  if (!map) return false;
  return Object.values(map).some((days) => DAY_KEYS.some((key) => Number(days?.[key]) > 0));
}

function rawBudgetHours(budgetMap, date) {
  if (!budgetMap) return 0;
  const key = DAY_KEYS[weekdayIndex(date)];
  let sum = 0;
  for (let hour = 0; hour < 24; hour += 1) sum += Number(budgetMap[hour]?.[key]) || 0;
  return sum;
}

function inferLabel(startTime) {
  const hour = clockMinutes(startTime) / 60;
  if (hour < 11) return 'morning';
  if (hour >= 15) return 'evening';
  return 'middle';
}

function makeSlot({ date, start, end, label, source, strength }) {
  const startTime = normalizeTime(start);
  const endTime = normalizeTime(end);
  return {
    date,
    start_time: startTime,
    end_time: endTime,
    shift_label: label || '',
    break_minutes: defaultBreak(startTime, endTime),
    source: source || 'history',
    strength: strength || 0,
  };
}

function longestDeficit(coverage, required) {
  let best = null;
  let hour = 0;
  while (hour < 24) {
    if (coverage[hour] < required[hour]) {
      const start = hour;
      while (hour < 24 && coverage[hour] < required[hour]) hour += 1;
      const length = hour - start;
      if (!best || length > best.length) best = { start, length };
    } else {
      hour += 1;
    }
  }
  return best;
}

function deficitCount(coverage, required) {
  let count = 0;
  for (let hour = 0; hour < 24; hour += 1) {
    if (coverage[hour] < required[hour]) count += required[hour] - coverage[hour];
  }
  return count;
}

function buildHistorySlots(dates, historyShifts, team, workers) {
  const perWeek = new Map();
  for (const shift of historyShifts) {
    if (!isWorkShift(shift) || resolveTeam(shift, workers) !== team) continue;
    const key = weekKey(shift.date);
    const signature = [
      weekdayIndex(shift.date),
      normalizeTime(shift.start_time),
      normalizeTime(shift.end_time),
      shift.shift_label || '',
    ].join('|');
    if (!perWeek.has(key)) perWeek.set(key, new Map());
    const bucket = perWeek.get(key);
    bucket.set(signature, (bucket.get(signature) || 0) + 1);
  }

  const observed = perWeek.size;
  const totals = new Map();
  for (const bucket of perWeek.values()) {
    for (const [signature, count] of bucket) {
      const row = totals.get(signature) || { weeks: 0, count: 0 };
      row.weeks += 1;
      row.count += count;
      totals.set(signature, row);
    }
  }

  const patterns = [];
  for (const [signature, row] of totals) {
    if (observed === 0 || row.weeks * 2 < observed) continue;
    const [weekday, start, end, label] = signature.split('|');
    patterns.push({
      weekday: Number(weekday),
      start,
      end,
      label,
      copies: Math.max(1, Math.round(row.count / observed)),
      weeks: row.weeks,
    });
  }
  patterns.sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.label.localeCompare(b.label));

  const slotsByDate = {};
  for (const date of dates) {
    slotsByDate[date] = [];
    const weekday = weekdayIndex(date);
    for (const pattern of patterns) {
      if (pattern.weekday !== weekday) continue;
      for (let copy = 0; copy < pattern.copies; copy += 1) {
        slotsByDate[date].push(makeSlot({
          date,
          start: pattern.start,
          end: pattern.end,
          label: pattern.label,
          source: 'history',
          strength: pattern.weeks,
        }));
      }
    }
  }
  return { slotsByDate, observed, patterns };
}

function preferredLength(historyShifts, team, workers) {
  const lengths = historyShifts
    .filter((shift) => isWorkShift(shift) && resolveTeam(shift, workers) === team)
    .map(grossHours)
    .filter((hours) => hours >= 3 && hours <= 12);
  if (!lengths.length) return 8;
  const sorted = [...lengths].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.min(9, Math.max(4, Math.round(median)));
}

function timeFromHour(hour) {
  if (hour >= 24) return '00:00';
  return `${pad(hour)}:00`;
}

function adjustToBudget(slotsByDate, dates, budgetFor, preferred, hasBudget) {
  if (!hasBudget) return;
  const requiredFor = (date) => requiredArray(budgetFor(date), date);

  for (const date of dates) {
    let guard = 0;
    while (guard < 16) {
      guard += 1;
      const required = requiredFor(date);
      const surplus = (slotsByDate[date] || []).filter((slot) => {
        if (slot.source !== 'history') return false;
        const pieces = hoursTouched(slot).filter((piece) => dates.includes(piece.date) || piece.date === date);
        if (!pieces.length) return false;
        return pieces.every((piece) => {
          const coverage = coverageForDate(slotsByDate, piece.date);
          return coverage[piece.hour] > requiredFor(piece.date)[piece.hour];
        });
      });
      if (!surplus.length) break;
      surplus.sort((a, b) => a.strength - b.strength || b.start_time.localeCompare(a.start_time));
      slotsByDate[date] = slotsByDate[date].filter((slot) => slot !== surplus[0]);
    }

    guard = 0;
    while (guard < 8) {
      guard += 1;
      const required = requiredFor(date);
      const before = coverageForDate(slotsByDate, date);
      const run = longestDeficit(before, required);
      if (!run) break;
      let start = run.start;
      let end = run.start + Math.min(run.length, preferred);
      while (end - start < Math.min(4, preferred) && end < 24 && required[end] > 0) end += 1;
      while (end - start < Math.min(4, preferred) && start > 0 && required[start - 1] > 0) start -= 1;
      if (end <= start) break;
      const slot = makeSlot({
        date,
        start: timeFromHour(start),
        end: timeFromHour(end),
        label: inferLabel(timeFromHour(start)),
        source: 'budget',
        strength: 0,
      });
      slotsByDate[date].push(slot);
      const after = deficitCount(coverageForDate(slotsByDate, date), required);
      if (after >= deficitCount(before, required)) {
        slotsByDate[date].pop();
        break;
      }
    }
  }
}

function slotFilled(slot, existing, team, workers, used) {
  let best = -1;
  let bestRatio = 0;
  existing.forEach((shift, index) => {
    if (used.has(index) || !isWorkShift(shift) || resolveTeam(shift, workers) !== team) return;
    const length = intervalOf(slot).end - intervalOf(slot).start;
    const shared = overlapMinutes(slot, shift);
    const ratio = length > 0 ? shared / length : 0;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = index;
    }
  });
  if (best >= 0 && bestRatio >= 0.5) {
    used.add(best);
    return true;
  }
  return false;
}

function stillNeeded(slot, desired, existing, team, workers) {
  const have = coverageFromShifts(existing, slot.date, team, workers);
  const need = Array(24).fill(0);
  for (const item of desired) {
    if (item.date === slot.date) addSameDayCoverage(need, item);
    if (item.date === addDays(slot.date, -1)) addSpillCoverage(need, item);
  }
  return hoursTouched(slot)
    .filter((piece) => piece.date === slot.date)
    .some((piece) => have[piece.hour] < need[piece.hour]);
}

function labelNoun(label, count) {
  const noun = label === 'evening'
    ? 'kveldsvakter'
    : label === 'morning'
      ? 'morgenvakter'
      : label === 'middle'
        ? 'mellomvakter'
        : 'lignende vakter';
  return `Har jobbet ${count} ${noun} siste ${HISTORY_WEEKS} uker`;
}

function historyStats(worker, slot, historyShifts) {
  const from = addDays(slot.date, -7 * HISTORY_WEEKS);
  let labelCount = 0;
  let timeCount = 0;
  const slotStart = clockMinutes(slot.start_time);
  for (const shift of historyShifts || []) {
    if (!isWorkShift(shift) || shift.worker_id !== worker.id) continue;
    if (shift.date < from || shift.date >= slot.date) continue;
    if (NAMED_LABELS.has(slot.shift_label) && shift.shift_label === slot.shift_label) labelCount += 1;
    const sameDay = weekdayIndex(shift.date) === weekdayIndex(slot.date);
    const close = Math.abs(clockMinutes(shift.start_time) - slotStart) <= 90;
    if (sameDay && close) timeCount += 1;
  }
  return { labelCount, timeCount };
}

function unavailableOn(availability, workerId, date) {
  return (availability || []).some((row) => row.worker_id === workerId && row.date === date && row.status === 'unavailable');
}

function availableOn(availability, workerId, date) {
  return (availability || []).some((row) => row.worker_id === workerId && row.date === date && row.status === 'available');
}

function absenceOn(shifts, workerId, date) {
  return (shifts || []).find((shift) => (
    shift.worker_id === workerId
    && shift.date === date
    && shift.status !== 'cancelled'
    && isAbsenceShift(shift)
  ));
}

function workerShifts(shifts, workerId, exceptId) {
  return (shifts || []).filter((shift) => (
    shift.worker_id === workerId
    && (!exceptId || shift.id !== exceptId)
    && isWorkShift(shift)
  ));
}

function weeklyHours(shifts, workerId, date, exceptId) {
  const key = weekKey(date);
  return workerShifts(shifts, workerId, exceptId)
    .filter((shift) => weekKey(shift.date) === key)
    .reduce((sum, shift) => sum + scheduleHours(shift), 0);
}

/**
 * When every recorded week in the history window is over 40 hours, and at
 * least two weeks are recorded, auto-planning may follow that pattern.
 * The cap is the median of those weeks. A single busy week does not qualify.
 */
export function historicalWeeklyCap(workerId, historyShifts, fromDate) {
  if (!workerId || !fromDate) return null;
  const start = addDays(fromDate, -7 * HISTORY_WEEKS);
  const totals = new Map();
  for (const shift of historyShifts || []) {
    if (shift.worker_id !== workerId || !isWorkShift(shift)) continue;
    if (shift.date < start || shift.date >= fromDate) continue;
    const key = weekKey(shift.date);
    totals.set(key, (totals.get(key) || 0) + scheduleHours(shift));
  }
  const weeks = [...totals.values()];
  if (weeks.length < 2) return null;
  if (weeks.some((hours) => hours <= MAX_WEEKLY_HOURS + 0.05)) return null;
  const sorted = [...weeks].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const cap = Math.round(median * 10) / 10;
  return cap > MAX_WEEKLY_HOURS ? cap : null;
}

function restProblem(shifts, workerId, slot, exceptId) {
  const slotInterval = intervalOf(slot);
  let previous = null;
  let next = null;
  for (const shift of workerShifts(shifts, workerId, exceptId)) {
    const span = intervalOf(shift);
    if (span.end <= slotInterval.start && (!previous || span.end > intervalOf(previous).end)) previous = shift;
    if (span.start >= slotInterval.end && (!next || span.start < intervalOf(next).start)) next = shift;
  }
  const problems = [];
  if (previous) {
    const hours = (slotInterval.start - intervalOf(previous).end) / 60;
    if (hours < MIN_REST_HOURS) problems.push({ hours, shift: previous });
  }
  if (next) {
    const hours = (intervalOf(next).start - slotInterval.end) / 60;
    if (hours < MIN_REST_HOURS) problems.push({ hours, shift: next });
  }
  problems.sort((a, b) => a.hours - b.hours);
  return problems[0] || null;
}

function overlapping(shifts, workerId, slot, exceptId) {
  return workerShifts(shifts, workerId, exceptId).find((shift) => overlapMinutes(slot, shift) > 0) || null;
}

function sameDayWork(shifts, workerId, slot, exceptId) {
  return workerShifts(shifts, workerId, exceptId).find((shift) => shift.date === slot.date) || null;
}

function clockLabel(shift) {
  return `${normalizeTime(shift.start_time)}–${normalizeTime(shift.end_time)}`;
}

function evaluateWorker(worker, slot, ctx) {
  const blocks = [];
  const warnings = [];
  if (!onTeam(worker, slot.team || ctx.team)) blocks.push({ code: 'team', text: BLOCK_TEXT.team });
  if (worker.status === 'inactive' || worker.isVirtual) blocks.push({ code: 'inactive', text: BLOCK_TEXT.inactive });
  if (unavailableOn(ctx.availability, worker.id, slot.date)) blocks.push({ code: 'unavailable', text: BLOCK_TEXT.unavailable });
  if (absenceOn(ctx.shifts, worker.id, slot.date)) blocks.push({ code: 'absence', text: BLOCK_TEXT.absence });

  const clash = overlapping(ctx.shifts, worker.id, slot, slot.id);
  if (clash) warnings.push(`Har en vakt som overlapper (${clockLabel(clash)})`);
  if (clash) blocks.push({ code: 'overlap', text: BLOCK_TEXT.overlap });

  const dayShift = !clash && sameDayWork(ctx.shifts, worker.id, slot, slot.id);
  if (dayShift) warnings.push(`Har allerede en vakt denne dagen (${clockLabel(dayShift)})`);

  const already = weeklyHours(ctx.shifts, worker.id, slot.date, slot.id);
  const added = scheduleHours({ ...slot, status: 'scheduled' });
  const projected = already + added;
  const cap = ctx.manual ? MAX_WEEKLY_HOURS : (ctx.hourCapFor?.(worker.id) || MAX_WEEKLY_HOURS);
  if (projected > cap + 0.05) {
    if (ctx.manual) {
      warnings.push(`Blir ${formatHours(projected)} t denne uka (over 40 t). Du kan likevel tildele vakten.`);
    } else {
      blocks.push({ code: 'hours', text: BLOCK_TEXT.hours });
      warnings.push(`Blir ${formatHours(projected)} t denne uka (over ${formatHours(cap)} t)`);
    }
  }

  const rest = restProblem(ctx.shifts, worker.id, slot, slot.id);
  if (rest) {
    blocks.push({ code: 'rest', text: BLOCK_TEXT.rest });
    warnings.push(`Bare ${formatHours(rest.hours)} t hvile mot vakt ${clockLabel(rest.shift)}`);
  }

  for (const block of blocks) {
    if (['team', 'inactive', 'unavailable', 'absence'].includes(block.code) && !warnings.includes(block.text)) {
      warnings.unshift(block.text);
    }
  }

  const stats = historyStats(worker, slot, ctx.historyShifts);
  const reasons = [];
  if (NAMED_LABELS.has(slot.shift_label) && stats.labelCount > 0) reasons.push(labelNoun(slot.shift_label, stats.labelCount));
  else if (stats.timeCount > 0) reasons.push(labelNoun('', stats.timeCount));
  reasons.push(`${formatHours(already)} t denne uka`);
  const contract = contractWeeklyHours(worker, ctx.fullTimeHours);
  if (contract > 0) reasons.push(`Kontrakt ${formatHours(contract)} t`);

  let score = null;
  if (blocks.length === 0) {
    score = 0;
    if (NAMED_LABELS.has(slot.shift_label) && stats.labelCount > 0) score += stats.labelCount * 5;
    else score += stats.timeCount * 3;
    score += (contract - already) * 4;
    if (contract > 0 && projected > contract) score -= 10;
    if (availableOn(ctx.availability, worker.id, slot.date)) {
      score += 3;
      reasons.push('Har meldt seg tilgjengelig');
    }
    if (dayShift) score -= 8;
    if (ctx.manual && projected > MAX_WEEKLY_HOURS + 0.05) score -= 40;
  }

  return {
    workerId: worker.id,
    name: worker.name || 'Ansatt',
    score,
    blocked: blocks.length > 0,
    block: blocks[0] || null,
    warnings,
    reasons: reasons.slice(0, 3),
    weeklyHours: already,
    projectedHours: projected,
    contractHours: contract,
  };
}

function activeWorkers(workers) {
  return (workers || []).filter((worker) => worker && worker.id && worker.id !== OPEN_WORKER_ID && !worker.isVirtual && worker.status !== 'inactive');
}

export function rankEmployees({
  workers,
  shifts,
  historyShifts,
  availability,
  team,
  candidate,
  fullTimeHours = 37.5,
  orgId,
  limit = 5,
} = {}) {
  const slot = {
    id: candidate?.id,
    date: candidate?.date,
    start_time: normalizeTime(candidate?.start_time || '08:00'),
    end_time: normalizeTime(candidate?.end_time || '16:00'),
    shift_label: candidate?.shift_label && candidate.shift_label !== 'none' ? candidate.shift_label : '',
    break_minutes: Number(candidate?.break_minutes) || 0,
    team: candidate?.team && candidate.team !== 'all' ? candidate.team : team,
    status: 'scheduled',
  };
  const scopedWorkers = activeWorkers(workers).filter((worker) => sameOrg(worker, orgId));
  const scopedShifts = (shifts || []).filter((shift) => sameOrg(shift, orgId) && shift.id !== candidate?.id);
  const history = (historyShifts || scopedShifts).filter((shift) => sameOrg(shift, orgId));
  const ctx = {
    team: slot.team,
    shifts: scopedShifts,
    historyShifts: history,
    availability: (availability || []).filter((row) => sameOrg(row, orgId)),
    fullTimeHours,
    manual: true,
  };
  const evaluated = scopedWorkers.map((worker) => evaluateWorker(worker, slot, ctx));
  const suggestions = evaluated
    .filter((row) => row.score != null)
    .sort((a, b) => b.score - a.score || a.weeklyHours - b.weeklyHours || a.workerId.localeCompare(b.workerId))
    .slice(0, limit)
    .map((row) => ({
      workerId: row.workerId,
      name: row.name,
      score: row.score,
      reasons: row.reasons,
      warnings: row.warnings,
      weeklyHours: row.weeklyHours,
      contractHours: row.contractHours,
    }));
  const byWorkerId = {};
  for (const row of evaluated) {
    byWorkerId[row.workerId] = {
      warnings: row.warnings,
      blocked: row.blocked,
      reasons: row.reasons,
      weeklyHours: row.weeklyHours,
    };
  }
  return { suggestions, byWorkerId };
}

function budgetForDateFactory({ budgets, budgetByHourDay, team, orgId }) {
  const cache = new Map();
  const direct = budgetMapActive(budgetByHourDay);
  return {
    hasBudget: direct || (budgets || []).some((row) => row?.team === team && (!orgId || row.org_id === orgId)),
    forDate(date) {
      if (direct && !(budgets || []).length) return budgetByHourDay;
      const parts = isoWeekParts(date);
      const key = `${parts.year}-${parts.week}`;
      if (!cache.has(key)) {
        cache.set(key, resolveStaffingBudget(budgets || [], {
          team,
          orgId,
          week: parts.week,
          year: parts.year,
        }));
      }
      const resolved = cache.get(key);
      return budgetMapActive(resolved) ? resolved : (direct ? budgetByHourDay : resolved);
    },
  };
}

function payloadFor(slot, worker, team, orgId, open) {
  return {
    ...(orgId ? { org_id: orgId } : {}),
    worker_id: open ? OPEN_WORKER_ID : worker.id,
    worker_name: open ? OPEN_WORKER_NAME : (worker.name || 'Ansatt'),
    date: slot.date,
    start_time: slot.start_time,
    end_time: slot.end_time,
    break_minutes: slot.break_minutes,
    break_manual: true,
    all_day: false,
    notes: open ? OPEN_SHIFT_NOTE : AUTO_DRAFT_NOTE,
    shift_label: slot.shift_label || '',
    status: 'scheduled',
    team,
    published: false,
  };
}

function emptyPlan(warning) {
  return {
    shifts: [],
    deleteIds: [],
    openCount: 0,
    assignedCount: 0,
    createdCount: 0,
    before: { shiftCount: 0, hours: 0 },
    after: { shiftCount: 0, hours: 0 },
    hoursByWorker: [],
    wage: { plannedCost: null, budgetCost: null, budgetHours: 0, plannedHours: 0, ratesMissing: true },
    warnings: warning ? [warning] : [],
    usedHistory: false,
    usedBudget: false,
    historyWeeksUsed: 0,
    raisedCaps: [],
  };
}

/**
 * Build unpublished draft shifts for one store and date range.
 * Existing shifts are kept. Published shifts are never deleted.
 * With replaceDrafts, only unpublished auto-planner drafts in the range are replaced.
 */
export function planDraft({
  team,
  fromDate,
  toDate,
  workers = [],
  shifts = [],
  availability = [],
  budgets = [],
  budgetByHourDay = null,
  replaceDrafts = false,
  lockedDates = [],
  fullTimeHours = 37.5,
  orgId,
} = {}) {
  if (!team || team === 'all') return emptyPlan('Velg én butikk før du lager utkast.');
  const dates = eachDate(fromDate, toDate).filter((date) => !(lockedDates || []).includes(date));
  const lockedSkipped = eachDate(fromDate, toDate).filter((date) => (lockedDates || []).includes(date));
  if (!fromDate || !toDate || fromDate > toDate) return emptyPlan('Velg en gyldig periode.');
  if (eachDate(fromDate, toDate).length > MAX_PLAN_DAYS) return emptyPlan(`Perioden kan være maks ${MAX_PLAN_DAYS} dager.`);
  if (!dates.length) return emptyPlan('Hele perioden er i en låst lønnsperiode.');

  const scopedWorkers = (workers || []).filter((worker) => sameOrg(worker, orgId));
  const scopedShifts = (shifts || []).filter((shift) => sameOrg(shift, orgId));
  const scopedAvailability = (availability || []).filter((row) => sameOrg(row, orgId));
  const historyStart = addDays(fromDate, -7 * HISTORY_WEEKS);
  const historyShifts = scopedShifts.filter((shift) => shift.date >= historyStart && shift.date < fromDate);
  const rangeShifts = scopedShifts.filter((shift) => shift.date >= fromDate && shift.date <= toDate);

  const deleteIds = replaceDrafts
    ? rangeShifts
      .filter((shift) => (
        shift.id
        && isAutoDraft(shift)
        && isWorkShift(shift)
        && resolveTeam(shift, scopedWorkers) === team
        && !lockedSkipped.includes(shift.date)
      ))
      .map((shift) => shift.id)
      .sort()
    : [];
  const deleteSet = new Set(deleteIds);
  const kept = scopedShifts.filter((shift) => !deleteSet.has(shift.id));

  const { slotsByDate, observed } = buildHistorySlots(dates, historyShifts, team, scopedWorkers);
  const budget = budgetForDateFactory({ budgets, budgetByHourDay, team, orgId });
  adjustToBudget(slotsByDate, dates, budget.forDate, preferredLength(historyShifts, team, scopedWorkers), budget.hasBudget);

  const gaps = [];
  for (const date of dates) {
    const desired = slotsByDate[date] || [];
    const used = new Set();
    for (const slot of desired) {
      if (slotFilled(slot, kept, team, scopedWorkers, used)) continue;
      if (!stillNeeded(slot, desired, kept, team, scopedWorkers)) continue;
      gaps.push({ ...slot, team });
    }
  }
  gaps.sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time) || b.end_time.localeCompare(a.end_time));

  const assigned = [];
  const created = [];
  const openReasons = [];
  const pool = activeWorkers(scopedWorkers).filter((worker) => onTeam(worker, team));
  const raisedCaps = pool
    .map((worker) => ({
      workerId: worker.id,
      name: worker.name || 'Ansatt',
      cap: historicalWeeklyCap(worker.id, historyShifts, fromDate),
    }))
    .filter((row) => row.cap);
  const capByWorker = new Map(raisedCaps.map((row) => [row.workerId, row.cap]));

  for (const slot of gaps) {
    const live = kept.concat(assigned);
    const ctx = {
      team,
      shifts: live,
      historyShifts,
      availability: scopedAvailability,
      fullTimeHours,
      hourCapFor: (workerId) => capByWorker.get(workerId) || MAX_WEEKLY_HOURS,
    };
    const ranked = pool
      .map((worker) => evaluateWorker(worker, slot, ctx))
      .filter((row) => row.score != null)
      .sort((a, b) => b.score - a.score || a.weeklyHours - b.weeklyHours || a.workerId.localeCompare(b.workerId));
    if (!ranked.length) {
      const blocks = pool.map((worker) => evaluateWorker(worker, slot, ctx).block?.code).filter(Boolean);
      openReasons.push(blocks);
      created.push(payloadFor(slot, null, team, orgId, true));
      continue;
    }
    const winner = pool.find((worker) => worker.id === ranked[0].workerId);
    const row = payloadFor(slot, winner, team, orgId, false);
    created.push(row);
    assigned.push(row);
  }

  const teamWork = (list) => list.filter((shift) => isWorkShift(shift) && shift.date >= fromDate && shift.date <= toDate && resolveTeam(shift, scopedWorkers) === team);
  const beforeShifts = teamWork(kept);
  const afterShifts = beforeShifts.concat(created);
  const sumHours = (list) => list.reduce((sum, shift) => sum + scheduleHours(shift), 0);
  const beforeHours = sumHours(beforeShifts);
  const afterHours = sumHours(afterShifts);

  const hoursByWorker = [];
  const weekKeys = [...new Set(dates.map(weekKey))];
  for (const worker of pool) {
    const added = created
      .filter((shift) => shift.worker_id === worker.id)
      .reduce((sum, shift) => sum + scheduleHours(shift), 0);
    if (added <= 0) continue;
    let weekHours = 0;
    for (const key of weekKeys) {
      const hours = kept.concat(created)
        .filter((shift) => shift.worker_id === worker.id && isWorkShift(shift) && weekKey(shift.date) === key)
        .reduce((sum, shift) => sum + scheduleHours(shift), 0);
      if (hours > weekHours) weekHours = hours;
    }
    hoursByWorker.push({
      workerId: worker.id,
      name: worker.name || 'Ansatt',
      addedHours: added,
      weekHours,
      contractHours: contractWeeklyHours(worker, fullTimeHours),
    });
  }
  hoursByWorker.sort((a, b) => a.name.localeCompare(b.name, 'nb') || a.workerId.localeCompare(b.workerId));

  let budgetHours = 0;
  if (budget.hasBudget) {
    for (const date of dates) budgetHours += rawBudgetHours(budget.forDate(date), date);
  }
  const rates = pool.map((worker) => Number(worker.hourly_rate)).filter((rate) => Number.isFinite(rate) && rate > 0);
  const average = rates.length ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length : null;
  let plannedCost = 0;
  let missingRate = false;
  for (const shift of afterShifts) {
    if (shift.worker_id === OPEN_WORKER_ID) continue;
    const worker = scopedWorkers.find((item) => item.id === shift.worker_id);
    const rate = Number(worker?.hourly_rate);
    if (!Number.isFinite(rate) || rate <= 0) {
      missingRate = true;
      continue;
    }
    plannedCost += scheduleHours(shift) * rate;
  }

  const warnings = [];
  if (lockedSkipped.length) warnings.push(`Hoppet over låst lønnsperiode: ${lockedSkipped.join(', ')}.`);
  if (observed === 0 && budget.hasBudget) warnings.push('Ingen historikk de siste 4 ukene. Utkastet følger prognosen.');
  if (observed === 0 && !budget.hasBudget) warnings.push('Fant ingen vaktmønster de siste 4 ukene og ingen prognose.');
  if (replaceDrafts && deleteIds.length) warnings.push(`Erstatter ${deleteIds.length} auto-utkast. Manuelle utkast og publiserte vakter beholdes.`);
  for (const row of raisedCaps) {
    warnings.push(`${row.name} har vanligvis ${formatHours(row.cap)} t/uke de siste 4 ukene. Auto-planlegging bruker det som tak i stedet for 40 t.`);
  }
  if (!created.length && !deleteIds.length) warnings.push('Ingen hull å fylle. Eksisterende vakter dekker perioden.');
  if (!pool.length && created.length) warnings.push('Ingen aktive ansatte på butikken. Alle nye vakter står ledige.');
  const openCount = created.filter((shift) => shift.worker_id === OPEN_WORKER_ID).length;
  if (openCount > 0 && pool.length) {
    const tally = {};
    for (const blocks of openReasons) {
      const code = blocks[0];
      if (code) tally[code] = (tally[code] || 0) + 1;
    }
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    const reason = top ? BLOCK_SUMMARY[top[0]] : 'reglene';
    warnings.push(`${openCount} ${openCount === 1 ? 'vakt står ledig' : 'vakter står ledige'}. Vanligste grunn: ${reason}.`);
  }
  if (budget.hasBudget && budgetHours > 0) {
    const diff = afterHours - budgetHours;
    if (diff > 1) warnings.push(`Planen ligger ${formatHours(diff)} t over prognosen.`);
    else if (diff < -1) warnings.push(`Planen ligger ${formatHours(Math.abs(diff))} t under prognosen.`);
  }
  for (const row of hoursByWorker) {
    if (row.weekHours > MAX_WEEKLY_HOURS + 0.05) {
      warnings.push(`${row.name} er planlagt til ${formatHours(row.weekHours)} t denne uka, over 40 t, fordi det følger mønstret fra de siste 4 ukene.`);
    } else if (row.weekHours >= 38) {
      warnings.push(`${row.name} er nær 40 t (${formatHours(row.weekHours)} t).`);
    }
  }

  return {
    shifts: created,
    deleteIds,
    openCount,
    assignedCount: created.length - openCount,
    createdCount: created.length,
    before: { shiftCount: beforeShifts.length, hours: beforeHours },
    after: { shiftCount: afterShifts.length, hours: afterHours },
    hoursByWorker,
    wage: {
      plannedCost: missingRate && plannedCost === 0 ? null : plannedCost,
      budgetCost: average == null ? null : budgetHours * average,
      budgetHours,
      plannedHours: afterHours,
      ratesMissing: missingRate || average == null,
    },
    warnings,
    usedHistory: observed > 0,
    usedBudget: budget.hasBudget,
    historyWeeksUsed: observed,
    raisedCaps,
  };
}

export function autoDraftIds(shifts, { team, fromDate, toDate, workers, orgId } = {}) {
  return (shifts || [])
    .filter((shift) => {
      if (!isAutoDraft(shift) || !sameOrg(shift, orgId)) return false;
      if (team && team !== 'all' && resolveTeam(shift, workers || []) !== team) return false;
      if (fromDate && shift.date < fromDate) return false;
      if (toDate && shift.date > toDate) return false;
      return true;
    })
    .map((shift) => shift.id)
    .filter(Boolean);
}
