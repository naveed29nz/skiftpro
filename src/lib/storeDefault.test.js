import test from 'node:test';
import assert from 'node:assert/strict';
import { assignedTeamKeys, chooseDefaultStore, nextLoddtellingStore } from './storeDefault.js';

test('membership is the teams on the worker, with no team1 invented', () => {
  assert.deepEqual(assignedTeamKeys(null), []);
  assert.deepEqual(assignedTeamKeys({}), []);
  assert.deepEqual(assignedTeamKeys({ teams: [] }), []);
  assert.deepEqual(assignedTeamKeys({ team: 'team1' }), []);
  assert.deepEqual(assignedTeamKeys({ teams: [' team4 ', '', 'team2', '   '] }), ['team4', 'team2']);
});

test('the store default stays on the existing fallback when today’s shift is not selectable', () => {
  assert.equal(chooseDefaultStore({
    options: ['team2', 'team4'],
    preferred: null,
    fallback: 'team2',
  }), 'team2');
  assert.equal(chooseDefaultStore({
    options: ['team2'],
    preferred: 'team4',
    fallback: 'team2',
  }), 'team2');
  assert.equal(chooseDefaultStore({
    options: ['team2', 'team4'],
    preferred: 'team4',
    fallback: 'team2',
  }), 'team4');
  assert.equal(chooseDefaultStore({
    options: [],
    preferred: 'team1',
    fallback: '',
  }), '');
  assert.equal(chooseDefaultStore(), '');
});

test('loddtelling keeps a chosen store and does not invent team1', () => {
  assert.equal(nextLoddtellingStore({
    current: '',
    myTeams: ['team2', 'team4'],
    pickerKeys: ['team2', 'team4'],
    preferred: 'team4',
  }), 'team4');

  assert.equal(nextLoddtellingStore({
    current: 'team2',
    chosen: true,
    myTeams: ['team2', 'team4'],
    pickerKeys: ['team2', 'team4'],
    preferred: 'team4',
  }), 'team2');

  assert.equal(nextLoddtellingStore({
    current: '',
    myTeams: ['team2'],
    pickerKeys: ['team2'],
    preferred: 'team4',
  }), 'team2');

  assert.equal(nextLoddtellingStore({
    current: '',
    myTeams: [],
    pickerKeys: ['team1', 'team2'],
    preferred: 'team1',
  }), '');

  assert.equal(nextLoddtellingStore({
    current: 'team9',
    seesAll: true,
    myTeams: ['team4'],
    pickerKeys: ['team1', 'team4', 'team9'],
    preferred: null,
  }), 'team9');

  assert.equal(nextLoddtellingStore({
    current: '',
    seesAll: true,
    myTeams: ['team4', 'team2'],
    pickerKeys: ['team1', 'team2', 'team4'],
    preferred: 'team2',
  }), 'team2');
});
