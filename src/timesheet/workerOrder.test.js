import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyWorkerOrder,
  isMissingOrderTable,
  isUniqueViolation,
  mergeWorkerOrder,
  moveRowIds,
  persistedWorkerIds,
  readLocalWorkerOrder,
  seedOrderFromLocal,
  teamOrderKey,
  writeLocalWorkerOrder,
} from './workerOrder.js';

const workers = [
  { id: 'a', name: 'Ada' },
  { id: 'b', name: 'Bo' },
  { id: 'c', name: 'Cia' },
];

test('each store has its own order key and Alle team is separate', () => {
  assert.equal(teamOrderKey('team2'), 'team2');
  assert.equal(teamOrderKey('all'), 'all');
  assert.equal(teamOrderKey(''), 'all');
  assert.equal(teamOrderKey(undefined), 'all');
});

test('a saved order is kept and a new employee goes to the bottom', () => {
  assert.deepEqual(mergeWorkerOrder(['a', 'b', 'c', 'd'], ['c', 'a']), ['c', 'a', 'b', 'd']);
  assert.deepEqual(
    applyWorkerOrder([...workers, { id: 'd', name: 'Dina' }], ['c', 'a']).map((worker) => worker.name),
    ['Cia', 'Ada', 'Bo', 'Dina'],
  );
});

test('team orders do not leak into each other', () => {
  const team1 = mergeWorkerOrder(['a', 'b'], ['b', 'a']);
  const team2 = mergeWorkerOrder(['c', 'a'], ['a', 'c']);
  assert.deepEqual(team1, ['b', 'a']);
  assert.deepEqual(team2, ['a', 'c']);
});

test('the first load seeds a store from this browser and leaves unknown people at the bottom', () => {
  const storage = new Map();
  storage.getItem = (key) => (storage.has(key) ? storage.get(key) : null);
  storage.setItem = (key, value) => { storage.set(key, value); };
  writeLocalWorkerOrder(storage, ['c', 'gone', 'a', 'b']);
  assert.deepEqual(readLocalWorkerOrder(storage), ['c', 'gone', 'a', 'b']);
  assert.deepEqual(seedOrderFromLocal(['a', 'b', 'd'], readLocalWorkerOrder(storage)), ['a', 'b', 'd']);
  assert.deepEqual(seedOrderFromLocal(['c', 'a'], readLocalWorkerOrder(storage)), ['c', 'a']);
  assert.equal(seedOrderFromLocal(['d', 'e'], readLocalWorkerOrder(storage)), null);
  assert.deepEqual(readLocalWorkerOrder({ getItem: () => '{' }), []);
});

test('dragging a row keeps real employees and drops virtual rows', () => {
  const moved = moveRowIds(['a', 'b', 'ledig'], 0, 2);
  assert.deepEqual(moved, ['b', 'ledig', 'a']);
  assert.deepEqual(persistedWorkerIds(moved, ['ledig']), ['b', 'a']);
  assert.deepEqual(moveRowIds(['a', 'b'], 1, 1), ['a', 'b']);
});

test('a missing order table is not a unique-key clash', () => {
  assert.equal(isMissingOrderTable({ code: 'PGRST205', message: "Could not find the table 'public.timesheet_worker_orders' in the schema cache" }), true);
  assert.equal(isMissingOrderTable({ code: '42P01', message: 'relation "public.timesheet_worker_orders" does not exist' }), true);
  assert.equal(isUniqueViolation({ code: '23505', message: 'duplicate key value violates unique constraint' }), true);
  assert.equal(isUniqueViolation({ code: 'PGRST205', message: 'schema cache' }), false);
});
