import test from 'node:test';
import assert from 'node:assert/strict';
import { isShiftDropTarget, sameShiftCell, shiftCopyRecord, shiftMoveFields } from './placeShift.js';

const shift = {
  id: 's1',
  org_id: 'org-a',
  worker_id: 'w1',
  worker_name: 'Ada',
  date: '2026-10-12',
  start_time: '08:00',
  end_time: '16:00',
  break_minutes: 30,
  notes: 'kasse',
  shift_label: 'morning',
  team: 'team1',
  published: true,
  status: 'scheduled',
};

test('move fields match the desktop drag update', () => {
  const fields = shiftMoveFields({
    shift,
    newWorkerId: 'w2',
    newDate: '2026-10-14',
    newWorker: { id: 'w2', name: 'Bo' },
    filterTeam: 'all',
    ledigWorkerId: 'ledig',
    ledigWorkerName: 'Ledig vakt',
  });
  assert.deepEqual(fields, {
    date: '2026-10-14',
    worker_id: 'w2',
    worker_name: 'Bo',
  });
});

test('a department view tags the moved shift with that team', () => {
  const fields = shiftMoveFields({
    shift,
    newWorkerId: 'w2',
    newDate: '2026-10-14',
    newWorker: { name: 'Bo' },
    filterTeam: 'team2',
    ledigWorkerId: 'ledig',
    ledigWorkerName: 'Ledig vakt',
  });
  assert.equal(fields.team, 'team2');
});

test('moving onto the open-shift row uses the ledig name', () => {
  const fields = shiftMoveFields({
    shift,
    newWorkerId: 'ledig',
    newDate: '2026-10-13',
    newWorker: undefined,
    filterTeam: 'all',
    ledigWorkerId: 'ledig',
    ledigWorkerName: 'Ledig vakt',
  });
  assert.equal(fields.worker_name, 'Ledig vakt');
  assert.equal(fields.worker_id, 'ledig');
});

test('copy keeps the shift times and lands on the chosen cell as a draft', () => {
  const fields = shiftMoveFields({
    shift,
    newWorkerId: 'w3',
    newDate: '2026-10-15',
    newWorker: { name: 'Cai' },
    filterTeam: 'team1',
    ledigWorkerId: 'ledig',
    ledigWorkerName: 'Ledig vakt',
  });
  assert.deepEqual(shiftCopyRecord(shift, fields), {
    org_id: 'org-a',
    worker_id: 'w3',
    worker_name: 'Cai',
    date: '2026-10-15',
    start_time: '08:00',
    end_time: '16:00',
    break_minutes: 30,
    break_manual: true,
    all_day: false,
    notes: 'kasse',
    shift_label: 'morning',
    status: 'scheduled',
    published: false,
    team: 'team1',
  });
});

test('copy without a department filter keeps the original team', () => {
  const fields = shiftMoveFields({
    shift,
    newWorkerId: 'w3',
    newDate: '2026-10-15',
    newWorker: { name: 'Cai' },
    filterTeam: 'all',
    ledigWorkerId: 'ledig',
    ledigWorkerName: 'Ledig vakt',
  });
  assert.equal(shiftCopyRecord(shift, fields).team, 'team1');
});

test('inactive and former rows are not drop targets', () => {
  assert.equal(isShiftDropTarget({ id: 'w', isInactive: true }), false);
  assert.equal(isShiftDropTarget({ id: 'w', isFormer: true }), false);
  assert.equal(isShiftDropTarget({ id: 'ledig', isVirtual: true, isLedig: true }), true);
  assert.equal(isShiftDropTarget(null), false);
});

test('the source cell is not a target', () => {
  assert.equal(sameShiftCell(shift, 'w1', '2026-10-12'), true);
  assert.equal(sameShiftCell(shift, 'w2', '2026-10-12'), false);
  assert.equal(sameShiftCell(shift, 'w1', '2026-10-13'), false);
});
