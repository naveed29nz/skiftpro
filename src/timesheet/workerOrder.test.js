import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyWorkerOrder,
  createOrderSaver,
  isMissingOrderTable,
  isUniqueViolation,
  keepOrderSnapshot,
  mergeWorkerOrder,
  moveRowIds,
  parseWorkerIdList,
  persistedWorkerIds,
  readLocalWorkerOrder,
  resolveDisplayedOrder,
  seedOrderFromLocal,
  shouldSeedServerOrder,
  stableWorkerIds,
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

test('a loaded store order beats this browser and a drag beats the loaded row', () => {
  const rows = [
    { team_key: 'team1', worker_ids: '{c,a,b}' },
    { team_key: 'team2', worker_ids: ['d', 'c'] },
  ];
  assert.deepEqual(parseWorkerIdList('{c,a,b}'), ['c', 'a', 'b']);
  assert.deepEqual(parseWorkerIdList('["d","c"]'), ['d', 'c']);
  assert.deepEqual(resolveDisplayedOrder({
    status: 'ready',
    rows,
    orderKey: 'team1',
    workerIds: ['a', 'b', 'c'],
    localIds: ['a', 'b', 'c'],
  }), ['c', 'a', 'b']);
  assert.deepEqual(resolveDisplayedOrder({
    status: 'ready',
    rows,
    orderKey: 'team2',
    workerIds: ['c', 'd'],
    localIds: ['c', 'd'],
  }), ['d', 'c']);
  assert.deepEqual(resolveDisplayedOrder({
    status: 'ready',
    rows,
    orderKey: 'team1',
    workerIds: ['a', 'b', 'c'],
    draftIds: ['b', 'c', 'a'],
    localIds: ['a', 'b', 'c'],
  }), ['b', 'c', 'a']);
  assert.equal(resolveDisplayedOrder({
    status: 'loading',
    rows: [],
    orderKey: 'team1',
    workerIds: ['a', 'b', 'c'],
    localIds: ['c', 'b', 'a'],
  }), null);
});

test('the order does not follow the week or the other store, and new people stay after the saved list', () => {
  const saved = ['c', 'a'];
  const workers = [
    { id: 'b', name: 'Bo' },
    { id: 'd', name: 'Dina' },
    { id: 'a', name: 'Ada' },
    { id: 'c', name: 'Cia' },
  ];
  const flipped = [workers[3], workers[1], workers[0], workers[2]];
  const asc = stableWorkerIds(workers);
  const desc = stableWorkerIds(flipped);
  assert.deepEqual(mergeWorkerOrder(asc, saved), mergeWorkerOrder(desc, saved));
  assert.deepEqual(mergeWorkerOrder(asc, saved), ['c', 'a', 'b', 'd']);
  assert.equal(shouldSeedServerOrder({
    status: 'ready',
    rows: [{ team_key: 'team1', worker_ids: ['c', 'a'] }],
    orderKey: 'team1',
    localIds: ['a', 'b', 'c'],
    workerIds: asc,
  }), null);
  assert.equal(shouldSeedServerOrder({
    status: 'loading',
    rows: [],
    orderKey: 'team2',
    localIds: ['d', 'c'],
    workerIds: ['c', 'd'],
  }), null);
  assert.deepEqual(shouldSeedServerOrder({
    status: 'ready',
    rows: [],
    orderKey: 'team2',
    draftIds: ['d', 'c'],
    localIds: ['c', 'd'],
    workerIds: ['c', 'd'],
  }), null);
});

test('an empty read does not wipe a saved order, and a stale read does not undo a drag', () => {
  const previous = { available: true, rows: [{ team_key: 'team1', worker_ids: ['b', 'a'] }] };
  assert.equal(keepOrderSnapshot(previous, { available: true, rows: [] }), previous);
  assert.deepEqual(keepOrderSnapshot(undefined, { available: true, rows: [] }).rows, []);
  const kept = keepOrderSnapshot(previous, {
    available: true,
    rows: [{ team_key: 'team1', worker_ids: ['a', 'b'] }],
  }, () => [['team1', ['b', 'a']]]);
  assert.deepEqual(kept.rows[0].worker_ids, ['b', 'a']);
  assert.deepEqual(keepOrderSnapshot(previous, {
    available: true,
    rows: [{ team_key: 'team1', worker_ids: ['b', 'a'] }],
  }, () => [['team1', ['b', 'a']]]).rows[0].worker_ids, ['b', 'a']);
});

test('a slower save cannot publish over a newer drag, and a seed cannot replace the server row', async () => {
  const published = [];
  let release = () => {};
  const gate = new Promise((resolve) => { release = resolve; });
  let reads = 0;
  const updates = [];
  const saver = createOrderSaver({
    readRow: async () => {
      reads += 1;
      if (reads === 1) await gate;
      return null;
    },
    createRow: async (_key, ids) => ({ id: 'row-1', worker_ids: ids }),
    updateRow: async (id, ids) => {
      updates.push(ids);
      return { id, worker_ids: ids };
    },
    publish: (_key, ids) => { published.push(ids); },
  });
  const first = saver.push('team1', ['a', 'b'], 'drag');
  await Promise.resolve();
  const second = saver.push('team1', ['b', 'a'], 'drag');
  release();
  await first;
  await second;
  assert.deepEqual(published, [['b', 'a']]);
  assert.deepEqual(updates, []);

  const adopted = [];
  const seedSaver = createOrderSaver({
    readRow: async () => ({ id: 'row-2', worker_ids: '{server,order}' }),
    createRow: async () => { throw new Error('seed must not insert over a row'); },
    updateRow: async () => { throw new Error('seed must not update a row'); },
    publish: (_key, ids) => { adopted.push(ids); },
  });
  await seedSaver.push('team2', ['local', 'order'], 'seed');
  assert.deepEqual(adopted, [['server', 'order']]);

  let looked = false;
  const raced = createOrderSaver({
    readRow: async () => {
      if (!looked) {
        looked = true;
        return null;
      }
      return { id: 'row-3', worker_ids: ['old'] };
    },
    createRow: async () => {
      const error = new Error('duplicate key value violates unique constraint');
      error.code = '23505';
      throw error;
    },
    updateRow: async (id, ids) => ({ id, worker_ids: ids }),
    publish: (_key, ids) => { published.push(ids); },
  });
  await raced.push('team1', ['b', 'a'], 'drag');
  assert.deepEqual(raced.authoritativeIds(), [['team1', ['b', 'a']]]);
  const stale = keepOrderSnapshot(
    { available: true, rows: [{ team_key: 'team1', worker_ids: ['b', 'a'] }] },
    { available: true, rows: [{ team_key: 'team1', worker_ids: ['a', 'b'] }] },
    () => raced.authoritativeIds(),
  );
  assert.deepEqual(stale.rows[0].worker_ids, ['b', 'a']);
  raced.reconcile([{ team_key: 'team1', worker_ids: ['b', 'a'] }]);
  assert.deepEqual(raced.authoritativeIds(), []);
});
