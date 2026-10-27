export const WORKER_ORDER_STORAGE_KEY = 'timesheet_worker_order';

/** Alle team is its own list. Each store (team1–team10) keeps a separate list. */
export function teamOrderKey(filterTeam) {
  if (!filterTeam || filterTeam === 'all') return 'all';
  return filterTeam;
}

export function readLocalWorkerOrder(storage) {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(WORKER_ORDER_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id) => typeof id === 'string' && id);
  } catch {
    return [];
  }
}

export function writeLocalWorkerOrder(storage, ids) {
  if (!storage) return;
  storage.setItem(WORKER_ORDER_STORAGE_KEY, JSON.stringify(ids));
}

export function normalizeIdList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((id) => typeof id === 'string' && id);
}

/**
 * Saved ids stay in that order. Workers missing from the saved list, including
 * people hired after the last drag, are appended in their current list order.
 */
export function mergeWorkerOrder(workerIds, savedIds) {
  const visible = new Set(workerIds);
  const seen = new Set();
  const ordered = [];
  for (const id of savedIds || []) {
    if (!visible.has(id) || seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  for (const id of workerIds) {
    if (!seen.has(id)) ordered.push(id);
  }
  return ordered;
}

export function applyWorkerOrder(workers, savedIds) {
  const byId = new Map((workers || []).map((worker) => [worker.id, worker]));
  return mergeWorkerOrder((workers || []).map((worker) => worker.id), savedIds)
    .map((id) => byId.get(id));
}

/**
 * First visit for a store: reuse this browser's old list, limited to the
 * people in that store, then put everyone else at the bottom.
 * Returns null when this browser has no order that belongs to the store.
 */
export function seedOrderFromLocal(workerIds, localIds) {
  const visible = new Set(workerIds);
  const seen = new Set();
  const seeded = [];
  for (const id of localIds || []) {
    if (!visible.has(id) || seen.has(id)) continue;
    seen.add(id);
    seeded.push(id);
  }
  if (seeded.length === 0) return null;
  return [...seeded, ...workerIds.filter((id) => !seen.has(id))];
}

export function moveRowIds(ids, sourceIndex, destinationIndex) {
  if (!Array.isArray(ids)) return [];
  if (sourceIndex === destinationIndex) return ids.slice();
  if (sourceIndex < 0 || destinationIndex < 0 || sourceIndex >= ids.length || destinationIndex >= ids.length) {
    return ids.slice();
  }
  const next = ids.slice();
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(destinationIndex, 0, moved);
  return next;
}

/** Real employees only. Ledig, former and inactive rows stay out of the saved list. */
export function persistedWorkerIds(orderedIds, virtualIds) {
  const virtual = new Set(virtualIds || []);
  const seen = new Set();
  const ids = [];
  for (const id of orderedIds || []) {
    if (!id || virtual.has(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function isMissingOrderTable(error) {
  const message = String(error?.message || error?.details?.message || '');
  const code = String(error?.code || error?.details?.code || '');
  return code === '42P01'
    || code === 'PGRST205'
    || /could not find the table/i.test(message)
    || /timesheet_worker_orders/i.test(message) && /does not exist|schema cache/i.test(message);
}

export function isUniqueViolation(error) {
  const message = String(error?.message || error?.details?.message || '');
  const code = String(error?.code || error?.details?.code || '');
  return code === '23505' || /duplicate key/i.test(message);
}
