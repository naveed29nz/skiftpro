import test from 'node:test';
import assert from 'node:assert/strict';
import { groupShiftVisible, shiftIsOnSelectedTeam } from './groupShifts.js';

const ahmed = { id: 'ahmed', name: 'Ahmed Baker', teams: ['team-n500', 'team-n417'] };
const morningAt417 = {
  id: 's-417',
  worker_id: 'ahmed',
  shift_label: 'morning',
  team: 'team-n417',
  start_time: '05:30',
  end_time: '11:00',
  date: '2026-10-26',
};
const morningAt500 = {
  ...morningAt417,
  id: 's-500',
  team: 'team-n500',
  start_time: '08:00',
  end_time: '14:00',
};

test('another department is excluded from the shift-group view while that store is selected', () => {
  assert.equal(shiftIsOnSelectedTeam(morningAt417, ahmed, 'team-n500'), false);
  assert.equal(groupShiftVisible({
    shift: morningAt417,
    worker: ahmed,
    filterTeam: 'team-n500',
  }), false);
  assert.equal(groupShiftVisible({
    shift: morningAt500,
    worker: ahmed,
    filterTeam: 'team-n500',
  }), true);
});

test('an untagged shift follows the worker primary team, matching the employee week view', () => {
  const untagged = { ...morningAt417, team: '' };
  assert.equal(shiftIsOnSelectedTeam(untagged, ahmed, 'team-n500'), true);
  assert.equal(shiftIsOnSelectedTeam(untagged, { teams: ['team-n417', 'team-n500'] }, 'team-n500'), false);
});

test('section totals ignore other-department shifts', () => {
  const shifts = [
    morningAt417,
    morningAt500,
    { ...morningAt417, id: 's-417b', date: '2026-10-27' },
  ];
  const visible = shifts.filter((shift) => groupShiftVisible({
    shift,
    worker: ahmed,
    filterTeam: 'team-n500',
  }));
  assert.deepEqual(visible.map((shift) => shift.id), ['s-500']);
});

test('alle team still includes shifts from every department', () => {
  assert.equal(groupShiftVisible({
    shift: morningAt417,
    worker: ahmed,
    filterTeam: 'all',
  }), true);
});

test('a butikksjef does not see another store in the shift groups', () => {
  assert.equal(groupShiftVisible({
    shift: morningAt417,
    worker: ahmed,
    filterTeam: 'team-n500',
    isAdmin: false,
    myTeams: ['team-n500'],
  }), false);
  assert.equal(groupShiftVisible({
    shift: morningAt500,
    worker: { id: 'local', teams: ['team-n500'] },
    filterTeam: 'team-n500',
    isAdmin: false,
    myTeams: ['team-n417'],
  }), false);
});

test('a missing worker is not placed in a shift group', () => {
  assert.equal(groupShiftVisible({
    shift: morningAt500,
    worker: null,
    filterTeam: 'team-n500',
  }), false);
});
