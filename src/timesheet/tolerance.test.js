import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TOLERANCE_MINUTES,
  readToleranceMinutes,
  summarizeTolerance,
  toleranceVerdict,
  workersWithOutsideShifts,
  writeToleranceMinutes,
} from './tolerance.js';

const TODAY = '2026-11-18';

function at(day, hours, minutes) {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes).toISOString();
}

const day = new Date(2026, 10, 17);

function shift(extra = {}) {
  return {
    id: 's1',
    worker_id: 'jonas',
    date: '2026-11-17',
    start_time: '08:00',
    end_time: '16:00',
    team: 'team1',
    status: 'scheduled',
    ...extra,
  };
}

function stamp(inH, inM, outH, outM, outDay = day) {
  return { stamp_in: at(day, inH, inM), stamp_out: at(outDay, outH, outM) };
}

test('default tolerance is 30 minutes and only the known steps are stored', () => {
  const memory = new Map();
  const storage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  };
  assert.equal(readToleranceMinutes(storage), DEFAULT_TOLERANCE_MINUTES);
  writeToleranceMinutes(storage, 15);
  assert.equal(readToleranceMinutes(storage), 15);
  writeToleranceMinutes(storage, 45);
  assert.equal(readToleranceMinutes(storage), 15);
});

test('a clocking inside 30 minutes is within tolerance, and 31 minutes is not', () => {
  const inside = toleranceVerdict(shift(), stamp(8, 10, 16, 5), 30, TODAY);
  assert.equal(inside.within, true);
  assert.equal(inside.outside, false);
  assert.equal(inside.deviation, 10);
  const edge = toleranceVerdict(shift(), stamp(8, 30, 16, 0), 30, TODAY);
  assert.equal(edge.within, true);
  const outside = toleranceVerdict(shift(), stamp(8, 31, 16, 0), 30, TODAY);
  assert.equal(outside.within, false);
  assert.equal(outside.outside, true);
  assert.equal(outside.deviation, 31);
});

test('zero tolerance only accepts an exact match', () => {
  assert.equal(toleranceVerdict(shift(), stamp(8, 0, 16, 0), 0, TODAY).within, true);
  assert.equal(toleranceVerdict(shift(), stamp(8, 1, 16, 0), 0, TODAY).within, false);
});

test('a missing clock-out is outside tolerance and is not bulk-approved', () => {
  const verdict = toleranceVerdict(shift(), { stamp_in: at(day, 8, 0) }, 60, TODAY);
  assert.equal(verdict.outside, true);
  assert.equal(verdict.within, false);
  assert.equal(verdict.reason, 'missing');
});

test('overnight shifts compare the clock-out on the next morning', () => {
  const night = shift({ start_time: '22:00', end_time: '06:00' });
  const next = new Date(2026, 10, 18);
  const verdict = toleranceVerdict(night, {
    stamp_in: at(day, 22, 5),
    stamp_out: at(next, 6, 10),
  }, 15, TODAY);
  assert.equal(verdict.within, true);
  assert.equal(verdict.deviation, 10);
});

test('absence, future, cancelled and open shifts are not deviations', () => {
  assert.equal(toleranceVerdict(shift({ shift_label: 'ferie', all_day: true }), null, 30, TODAY).comparable, false);
  assert.equal(toleranceVerdict(shift({ shift_label: 'sick_self' }), null, 30, TODAY).comparable, false);
  assert.equal(toleranceVerdict(shift({ date: '2026-11-19' }), null, 30, TODAY).comparable, false);
  assert.equal(toleranceVerdict(shift({ status: 'cancelled' }), null, 30, TODAY).comparable, false);
  assert.equal(toleranceVerdict(shift({ worker_id: 'ledig' }), null, 30, TODAY).comparable, false);
});

test('bulk approval uses the current store filter and skips approved or outside rows', () => {
  const shifts = [
    shift({ id: 'in', worker_id: 'jonas' }),
    shift({ id: 'out', worker_id: 'nora', start_time: '10:00', end_time: '18:00' }),
    shift({ id: 'done', worker_id: 'jonas', hours_approved: true }),
    shift({ id: 'other-store', worker_id: 'jonas', team: 'team2' }),
  ];
  const stamps = {
    'jonas__2026-11-17': stamp(8, 4, 16, 2),
    'nora__2026-11-17': stamp(10, 50, 18, 40),
  };
  const summary = summarizeTolerance(
    shifts,
    (row) => stamps[`${row.worker_id}__${row.date}`],
    30,
    TODAY,
    {
      filterTeam: 'team1',
      filterWorker: 'all',
      workers: [
        { id: 'jonas', teams: ['team1'] },
        { id: 'nora', teams: ['team1'] },
      ],
    },
  );
  assert.deepEqual(summary.withinShifts.map((row) => row.id), ['in']);
  assert.equal(summary.outside, 1);
});

test('showing only deviations keeps the existing employee order', () => {
  const workers = [
    { id: 'ada', name: 'Ada' },
    { id: 'bo', name: 'Bo' },
    { id: 'cia', name: 'Cia' },
  ];
  const shifts = [
    shift({ id: 'a', worker_id: 'ada' }),
    shift({ id: 'c', worker_id: 'cia', start_time: '10:00', end_time: '18:00' }),
  ];
  const stamps = {
    ada: stamp(8, 0, 16, 0),
    cia: stamp(10, 45, 18, 0),
  };
  const shown = workersWithOutsideShifts(
    workers,
    shifts,
    (row) => stamps[row.worker_id],
    30,
    TODAY,
  );
  assert.deepEqual(shown.map((worker) => worker.id), ['cia']);
});
