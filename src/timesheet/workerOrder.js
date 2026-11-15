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

/** Accept a JS array, a JSON array, or a Postgres text[] literal. */
export function parseWorkerIdList(value) {
  if (Array.isArray(value)) return normalizeIdList(value);
  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    try {
      return normalizeIdList(JSON.parse(trimmed));
    } catch {
      return [];
    }
  }
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return normalizeIdList(inner.split(',').map((part) => part.trim().replace(/^"(.*)"$/, '$1')));
  }
  return [];
}

export function sameIds(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((id, index) => id === b[index]);
}

/**
 * Stable order for people who are not in the saved list.
 * The workers query is created_date descending with no tie-break, so equal
 * timestamps come back in a different order on the next fetch.
 */
export function stableWorkerIds(workers) {
  return [...(workers || [])]
    .filter((worker) => worker && typeof worker.id === 'string' && worker.id)
    .sort((a, b) => {
      const byName = String(a.name || '').localeCompare(String(b.name || ''), 'nb', { sensitivity: 'base' });
      if (byName !== 0) return byName;
      return String(a.id).localeCompare(String(b.id));
    })
    .map((worker) => worker.id);
}

/**
 * Ids to show for one store.
 * While the server result is still unknown, return null so the caller keeps
 * the order it already showed. This browser's localStorage list must not flash
 * over the shared order, and it must not be what a drag saves.
 * A draft (the user's latest drag) wins over the row we have loaded.
 * A loaded row wins over localStorage. localStorage is only a display source
 * when the order table is missing, or the one-time seed when the store has no row.
 */
export function resolveDisplayedOrder({
  status,
  rows,
  orderKey,
  workerIds,
  draftIds,
  localIds,
}) {
  const base = workerIds || [];
  if (Array.isArray(draftIds) && draftIds.length > 0) return mergeWorkerOrder(base, draftIds);
  if (status === 'loading') return null;
  if (status === 'ready') {
    const row = (rows || []).find((item) => item && item.team_key === orderKey);
    if (row) return mergeWorkerOrder(base, parseWorkerIdList(row.worker_ids));
    return seedOrderFromLocal(base, localIds) || base;
  }
  if (localIds && localIds.length) return mergeWorkerOrder(base, localIds);
  return base;
}

/**
 * First visit to a store with no server row: copy this browser's old list once.
 * Never seed while a drag is in progress, and never seed over a row that exists.
 */
export function shouldSeedServerOrder({
  status,
  rows,
  orderKey,
  draftIds,
  localIds,
  workerIds,
}) {
  if (status !== 'ready') return null;
  if (Array.isArray(draftIds) && draftIds.length > 0) return null;
  if ((rows || []).some((row) => row && row.team_key === orderKey)) return null;
  return seedOrderFromLocal(workerIds, localIds);
}

/**
 * An empty order read must not wipe rows already loaded. PostgREST answers
 * 200 [] when the request has no user JWT, and that is indistinguishable from
 * "this store has no saved order".
 * `forced` is [teamKey, ids] this session has dragged or is still saving.
 * A stale response does not replace those ids.
 */
export function keepOrderSnapshot(previous, next, forced) {
  if (!next || next.available === false) return next ?? previous;
  const prevRows = previous?.available ? (previous.rows || []) : [];
  const nextRows = next.rows || [];
  if (prevRows.length > 0 && nextRows.length === 0) return previous;
  const pinned = typeof forced === 'function' ? forced() : forced;
  if (!Array.isArray(pinned) || pinned.length === 0) return next;
  const byKey = new Map(nextRows.map((row) => [row.team_key, row]));
  let changed = false;
  for (const [key, ids] of pinned) {
    const row = byKey.get(key);
    if (row && sameIds(parseWorkerIdList(row.worker_ids), ids)) continue;
    const prev = prevRows.find((item) => item && item.team_key === key);
    byKey.set(key, { ...(row || prev || {}), team_key: key, worker_ids: ids });
    changed = true;
  }
  if (!changed) return next;
  return { available: true, rows: [...byKey.values()] };
}

/**
 * One writer per page for the store order.
 * Only the latest drag for a store is written. An older response cannot publish.
 * A seed insert that loses the unique key adopts the server row and does not
 * overwrite it. A drag that loses the unique key updates that row.
 */
export function createOrderSaver({ readRow, createRow, updateRow, publish, onError }) {
  let desired = new Map();
  let running = false;
  const inflight = new Map();
  const confirmed = new Map();

  function authoritativeIds() {
    const map = new Map(confirmed);
    for (const [key, ids] of inflight) map.set(key, ids);
    for (const [key, job] of desired) map.set(key, job.ids);
    return [...map.entries()];
  }

  function reconcile(rows) {
    for (const [key, ids] of confirmed) {
      const row = (rows || []).find((item) => item && item.team_key === key);
      if (row && sameIds(parseWorkerIdList(row.worker_ids), ids)) confirmed.delete(key);
    }
  }

  function superseded(orderKey, ids) {
    const latest = desired.get(orderKey);
    return Boolean(latest && !sameIds(latest.ids, ids));
  }

  async function writeOne(orderKey, ids, source) {
    inflight.set(orderKey, ids);
    try {
      let existing = await readRow(orderKey);
      if (superseded(orderKey, ids)) return;
      if (existing?.id && source === 'seed') {
        publish(orderKey, parseWorkerIdList(existing.worker_ids), existing);
        return;
      }
      try {
        const saved = existing?.id
          ? await updateRow(existing.id, ids)
          : await createRow(orderKey, ids);
        if (superseded(orderKey, ids)) return;
        if (source === 'drag') confirmed.set(orderKey, ids.slice());
        publish(orderKey, ids, saved);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        existing = await readRow(orderKey);
        if (superseded(orderKey, ids)) return;
        if (!existing?.id) throw error;
        if (source === 'seed') {
          publish(orderKey, parseWorkerIdList(existing.worker_ids), existing);
          return;
        }
        const saved = await updateRow(existing.id, ids);
        if (superseded(orderKey, ids)) return;
        confirmed.set(orderKey, ids.slice());
        publish(orderKey, ids, saved);
      }
    } catch (error) {
      if (superseded(orderKey, ids)) return;
      if (source === 'drag' && onError) onError(orderKey, ids, error);
    } finally {
      if (sameIds(inflight.get(orderKey), ids)) inflight.delete(orderKey);
    }
  }

  async function flush() {
    if (running) return;
    running = true;
    try {
      while (desired.size) {
        const batch = desired;
        desired = new Map();
        for (const [orderKey, job] of batch) {
          await writeOne(orderKey, job.ids, job.source);
        }
      }
    } finally {
      running = false;
      if (desired.size) await flush();
    }
  }

  return {
    push(orderKey, ids, source = 'drag') {
      desired.set(orderKey, { ids: ids.slice(), source });
      return flush();
    },
    isPending(orderKey) {
      return desired.has(orderKey) || inflight.has(orderKey);
    },
    pendingIds(orderKey) {
      return desired.get(orderKey)?.ids || inflight.get(orderKey) || null;
    },
    authoritativeIds,
    reconcile,
  };
}
