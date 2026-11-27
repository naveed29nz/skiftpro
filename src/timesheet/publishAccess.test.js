import test from 'node:test';
import assert from 'node:assert/strict';
import { canSeeWageCosts } from '../utils/wageAccess.js';
import { canPublishShiftDrafts, publishableDraftShifts } from './publishAccess.js';

const profile = { role: 'user', email: 'aqsa@example.com' };
const aqsa = {
  role: 'butikksjef',
  teams: ['team3'],
  team_roles: { team3: 'butikksjef' },
};
const employee = {
  role: 'user',
  teams: ['team3'],
  team_roles: { team3: 'user' },
};
const workers = [
  { id: 'w-own', teams: ['team3'] },
  { id: 'w-other', teams: ['team1'] },
];

function draft(id, team, workerId) {
  return { id, team, worker_id: workerId, published: false, status: 'scheduled' };
}

test('a butikksjef appointed on the worker row can publish, and still cannot see wages', () => {
  assert.equal(canPublishShiftDrafts(profile, aqsa), true);
  assert.equal(canSeeWageCosts(profile, aqsa), false);
  assert.equal(canPublishShiftDrafts({ role: 'butikksjef' }, aqsa), true);
  assert.equal(canPublishShiftDrafts({ role: 'admin' }, null), true);
  assert.equal(canPublishShiftDrafts({ role: 'sub_admin' }, null), true);
  assert.equal(canPublishShiftDrafts(
    { role: 'user' },
    { role: 'user', teams: ['team1'], team_roles: { team1: 'sub_admin' } },
  ), true);
});

test('an employee cannot publish drafts', () => {
  assert.equal(canPublishShiftDrafts(profile, employee), false);
  assert.equal(canPublishShiftDrafts(profile, null), false);
  const drafts = publishableDraftShifts(
    [draft('own', 'team3', 'w-own')],
    { profile, manager: employee, workers, filterTeam: 'team3', myTeams: ['team3'] },
  );
  assert.deepEqual(drafts, []);
});

test('a butikksjef publishes drafts in the stores she manages and not other stores', () => {
  const shifts = [
    draft('own', 'team3', 'w-own'),
    draft('other', 'team1', 'w-other'),
    draft('open', 'team3', 'ledig'),
    { ...draft('live', 'team3', 'w-own'), published: true },
    draft('untagged', null, 'w-own'),
    draft('untagged-other', '', 'w-other'),
  ];
  const ids = publishableDraftShifts(shifts, {
    profile,
    manager: aqsa,
    workers,
    filterTeam: 'team3',
    myTeams: ['team3'],
  }).map((shift) => shift.id);
  assert.deepEqual(ids, ['own', 'untagged']);

  const otherStore = publishableDraftShifts(shifts, {
    profile,
    manager: aqsa,
    workers,
    filterTeam: 'all',
    myTeams: ['team3'],
  }).map((shift) => shift.id);
  assert.deepEqual(otherStore, ['own', 'untagged']);

  const wrongTab = publishableDraftShifts(shifts, {
    profile,
    manager: aqsa,
    workers,
    filterTeam: 'team1',
    myTeams: ['team3'],
  });
  assert.deepEqual(wrongTab, []);
});

test('an organization admin still publishes every draft in the selected week', () => {
  const shifts = [draft('a', 'team3', 'w-own'), draft('b', 'team1', 'w-other')];
  const ids = publishableDraftShifts(shifts, {
    profile: { role: 'admin' },
    manager: null,
    workers,
    filterTeam: 'all',
    myTeams: ['team1'],
  }).map((shift) => shift.id);
  assert.deepEqual(ids, ['a', 'b']);
});
