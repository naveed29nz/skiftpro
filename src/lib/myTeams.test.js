import test from 'node:test';
import assert from 'node:assert/strict';
import { nextTeamFilter, resolveMyTeams } from './myTeams.js';

test('a butikksjef is not placed on team1 while the worker row is loading', () => {
  assert.deepEqual(resolveMyTeams(null, { ready: false, seesAllTeams: false }), []);
  assert.deepEqual(
    resolveMyTeams({ teams: ['team4'] }, { ready: true, seesAllTeams: false }),
    ['team4'],
  );
  assert.deepEqual(resolveMyTeams({ teams: [] }, { ready: true, seesAllTeams: false }), []);
});

test('superadmin and owner keep the team1 fallback', () => {
  assert.deepEqual(resolveMyTeams(null, { ready: false, seesAllTeams: true }), ['team1']);
  assert.deepEqual(resolveMyTeams(null, { ready: true, seesAllTeams: true }), ['team1']);
  assert.deepEqual(
    resolveMyTeams({ teams: ['team4'] }, { ready: true, seesAllTeams: true }),
    ['team4'],
  );
});

test('the store filter waits for the worker and replaces a stuck team1', () => {
  assert.equal(nextTeamFilter({
    ready: false,
    seesAllTeams: false,
    myTeams: [],
    filterTeam: 'all',
    teamDefaultSet: false,
  }), null);

  assert.equal(nextTeamFilter({
    ready: true,
    seesAllTeams: false,
    myTeams: ['team4'],
    filterTeam: 'team1',
    teamDefaultSet: true,
    allowAll: false,
  }), 'team4');

  assert.equal(nextTeamFilter({
    ready: true,
    seesAllTeams: false,
    myTeams: ['team4', 'team2'],
    filterTeam: 'team2',
    teamDefaultSet: true,
    allowAll: false,
  }), null);
});

test('owners default once and keep a store they picked afterwards', () => {
  assert.equal(nextTeamFilter({
    ready: true,
    seesAllTeams: true,
    myTeams: ['team1'],
    filterTeam: 'all',
    teamDefaultSet: false,
    adminDefault: 'all',
  }), 'all');
  assert.equal(nextTeamFilter({
    ready: true,
    seesAllTeams: true,
    myTeams: ['team1'],
    filterTeam: 'team4',
    teamDefaultSet: true,
    adminDefault: 'all',
  }), null);
});
