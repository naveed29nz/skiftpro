import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAFFING_BUDGET_FETCH_LIMIT,
  filterStaffingPlan,
  resolveStaffingBudget,
  staffingBudgetQuery,
  staffingBudgetQueryKey,
} from './staffingBudget.js';

const DEMO = 'de30000000000000000000a1';
const NAS = '6a2b315a825e7ecca4d5f246';

function row(overrides) {
  return {
    org_id: DEMO,
    team: 'team1',
    hour: 10,
    mon: 2, tue: 2, wed: 2, thu: 2, fri: 2, sat: 1, sun: 1,
    week_override: null,
    year_override: null,
    ...overrides,
  };
}

test('staffing budgets are requested for one org, not the newest rows across customers', () => {
  assert.equal(staffingBudgetQuery(null), null);
  assert.equal(staffingBudgetQuery(''), null);
  const query = staffingBudgetQuery(DEMO);
  assert.deepEqual(query.filters, { org_id: DEMO });
  assert.equal(query.sort, '-created_date');
  assert.ok(query.limit >= 5000);
  assert.equal(query.limit, STAFFING_BUDGET_FETCH_LIMIT);
  assert.deepEqual(staffingBudgetQueryKey(DEMO), ['staffing-budget', DEMO]);
  assert.deepEqual(staffingBudgetQueryKey(null), ['staffing-budget', null]);
});

test('a store key from another customer cannot fill this customer’s forecast', () => {
  const mixed = [
    row({ org_id: NAS, mon: 9, tue: 9, wed: 9, thu: 9, fri: 9, sat: 9, sun: 9 }),
    row({ org_id: null, mon: 8 }),
    row({ hour: 11, mon: 1.5 }),
  ];
  const budget = resolveStaffingBudget(mixed, { team: 'team1', orgId: DEMO, week: 45, year: 2026 });
  assert.equal(budget[10], undefined);
  assert.equal(budget[11].mon, 1.5);
  assert.deepEqual(
    resolveStaffingBudget(mixed, { team: 'team1', orgId: null, week: 45, year: 2026 }),
    {},
  );
  assert.deepEqual(filterStaffingPlan(mixed, { orgId: DEMO, team: 'team1' }).map((item) => item.hour), [11]);
});

test('this week’s override replaces only that hour and only for this org', () => {
  const records = [
    row({ hour: 7, mon: 3 }),
    row({ hour: 16, mon: 3 }),
    row({ org_id: NAS, hour: 7, mon: 9, week_override: 46, year_override: 2026 }),
    row({ hour: 7, mon: 4, week_override: 46, year_override: 2026 }),
    row({ hour: 7, mon: 5, week_override: 47, year_override: 2026 }),
  ];
  const current = resolveStaffingBudget(records, { team: 'team1', orgId: DEMO, week: 46, year: 2026 });
  assert.equal(current[7].mon, 4);
  assert.equal(current[16].mon, 3);
  const otherWeek = resolveStaffingBudget(records, { team: 'team1', orgId: DEMO, week: 45, year: 2026 });
  assert.equal(otherWeek[7].mon, 3);

  const overrideGrid = filterStaffingPlan(records, {
    orgId: DEMO,
    team: 'team1',
    useWeekOverride: true,
    week: 46,
    year: 2026,
  });
  assert.deepEqual(overrideGrid.map((item) => item.hour), [7]);
});
