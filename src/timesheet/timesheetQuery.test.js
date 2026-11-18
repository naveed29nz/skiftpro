import test from 'node:test';
import assert from 'node:assert/strict';
import { readTimesheetLocation } from './timesheetQuery.js';

test('a timesheet link opens the store and the Monday of that week', () => {
  const result = readTimesheetLocation('?week=2026-11-23&team=team1');
  assert.equal(result.team, 'team1');
  assert.equal(result.weekStart.getFullYear(), 2026);
  assert.equal(result.weekStart.getMonth(), 10);
  assert.equal(result.weekStart.getDate(), 23);
  assert.equal(result.selectedDay.getDate(), 23);
});

test('a mid-week date snaps to Monday and a bad team is ignored', () => {
  const result = readTimesheetLocation('?week=2026-11-19&team=team99');
  assert.equal(result.team, null);
  assert.equal(result.weekStart.getDate(), 16);
  assert.equal(result.selectedDay.getDate(), 19);
});

test('empty or invalid query does not invent a week', () => {
  assert.deepEqual(readTimesheetLocation(''), { weekStart: null, selectedDay: null, team: null });
  assert.equal(readTimesheetLocation('?week=tomorrow&team=all').weekStart, null);
  assert.equal(readTimesheetLocation('?team=all').team, 'all');
});
