import assert from 'node:assert/strict';
import { compileFilter, parseSort } from '../src/api/entityQuery.js';

const week = compileFilter({
  org_id: 'org-1',
  date: { $gte: '2026-01-05', $lte: '2026-01-11' },
  status: { $ne: 'cancelled' },
});
assert.equal(week.empty, false);
assert.deepEqual(week.clauses, [
  { column: 'org_id', op: 'eq', value: 'org-1' },
  { column: 'date', op: 'gte', value: '2026-01-05' },
  { column: 'date', op: 'lte', value: '2026-01-11' },
  { column: 'status', op: 'neq', value: 'cancelled' },
]);

const ids = compileFilter({ id: { $in: ['a', 'b'] } });
assert.deepEqual(ids.clauses, [{ column: 'id', op: 'in', value: ['a', 'b'] }]);

const none = compileFilter({ id: { $in: [] } });
assert.equal(none.empty, true);

const alias = compileFilter({ created_by_id: 'user-1' });
assert.deepEqual(alias.clauses, [{ column: 'created_by', op: 'eq', value: 'user-1' }]);

assert.deepEqual(parseSort('-created_date'), { column: 'created_date', ascending: false });
assert.deepEqual(parseSort('date'), { column: 'date', ascending: true });
assert.deepEqual(parseSort(undefined), { column: 'created_date', ascending: false });

assert.throws(() => compileFilter({ 'org_id;drop': 'x' }), /Invalid filter column/);
assert.throws(() => parseSort('-created date'), /Invalid sort column/);

console.log('entity query checks passed');
