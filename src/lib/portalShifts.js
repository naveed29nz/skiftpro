/**
 * Employee-dashboard shift reads.
 * The viewer's stores are the teams on their own published, non-cancelled
 * shifts today. A colleague is included only when that colleague's shift today
 * is at one of those stores. Membership in a store is not a store.
 */

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function nonemptyTeam(team) {
  if (typeof team !== 'string') return '';
  return team.trim();
}

function isPublished(shift) {
  return shift?.published === true;
}

function isCancelled(shift) {
  return shift?.status === 'cancelled';
}

function sameOrg(shift, orgId) {
  return Boolean(orgId) && shift?.org_id === orgId;
}

/**
 * Personal shift read. Both org_id and worker_id are part of the filter, and
 * the cache key includes the signed-in user and the worker, so one person's
 * rows are not reused for someone else.
 */
export function ownShiftQuery(userId, orgId, workerId) {
  return {
    queryKey: ['shifts', userId ?? null, orgId ?? null, workerId ?? null, 'mine'],
    filter: { org_id: orgId ?? null, worker_id: workerId ?? null },
  };
}

/**
 * The signed-in worker's shifts on one date. Used to pick a store, not to
 * read colleagues. Pay fields are not part of the filter.
 */
export function todayOwnShiftQuery(userId, orgId, workerId, today) {
  return {
    queryKey: ['shifts', userId ?? null, orgId ?? null, workerId ?? null, 'today-store', today ?? null],
    filter: {
      org_id: orgId ?? null,
      worker_id: workerId ?? null,
      date: today ?? null,
    },
  };
}

/**
 * Colleague roster for the team plan, swaps, and colleagues today.
 * It is not filtered by worker and it does not ask for pay fields.
 */
export function rosterShiftQuery(userId, orgId) {
  return {
    queryKey: ['shifts', userId ?? null, orgId ?? null, 'roster'],
    filter: { org_id: orgId ?? null },
  };
}

/**
 * Shifts the portal may use for the signed-in worker's hours and pay.
 * Org and worker both have to match. Colleague rows stay out.
 * @param {any[] | null | undefined} shifts
 * @param {{ workerId?: string, orgId?: string, isAdmin?: boolean }} [options]
 */
export function filterOwnPortalShifts(shifts, { workerId, orgId, isAdmin = false } = {}) {
  if (!workerId || !orgId) return [];
  return asArray(shifts).filter((shift) => (
    shift?.worker_id === workerId
    && sameOrg(shift, orgId)
    && !isCancelled(shift)
    && (isAdmin || shift?.published !== false)
  ));
}

/**
 * Teams where this worker has a published, non-cancelled shift today.
 * An empty team does not count, and there is no membership fallback.
 * @param {any[] | null | undefined} shifts
 * @param {{ workerId?: string, orgId?: string, today?: string }} [options]
 */
export function viewerStoreTeams(shifts, { workerId, orgId, today } = {}) {
  const teams = new Set();
  if (!workerId || !orgId || !today) return teams;
  for (const shift of asArray(shifts)) {
    if (shift?.worker_id !== workerId) continue;
    if (shift?.date !== today) continue;
    if (!sameOrg(shift, orgId)) continue;
    if (!isPublished(shift) || isCancelled(shift)) continue;
    const team = nonemptyTeam(shift.team);
    if (team) teams.add(team);
  }
  return teams;
}

function publicWorker(worker) {
  if (!worker || worker.id == null || worker.id === '') return null;
  return {
    id: worker.id,
    name: worker.name ?? '',
    position: worker.position ?? '',
    color: worker.color ?? '',
  };
}

function publicColleague(shift, worker) {
  const person = publicWorker(worker);
  const team = nonemptyTeam(shift?.team);
  if (!person || !team || shift?.id == null) return null;
  return {
    id: shift.id,
    worker_id: shift.worker_id,
    start_time: shift.start_time ?? '',
    end_time: shift.end_time ?? '',
    team,
    worker: person,
  };
}

/**
 * Colleagues working the viewer's stores today.
 * `viewerShifts` is the viewer's own read. When it is omitted, stores are
 * derived from `shifts` rows that belong to the viewer. Returned rows contain
 * only planning fields: id, worker_id, name, position, color, start, end, team.
 * @param {{
 *   shifts?: any[] | null,
 *   workers?: any[] | null,
 *   viewerShifts?: any[] | null,
 *   currentWorkerId?: string,
 *   currentWorkerOrgId?: string,
 *   today?: string,
 * }} [input]
 */
export function selectColleaguesToday({
  shifts,
  workers,
  viewerShifts,
  currentWorkerId,
  currentWorkerOrgId,
  today,
} = {}) {
  const stores = viewerStoreTeams(viewerShifts ?? shifts, {
    workerId: currentWorkerId,
    orgId: currentWorkerOrgId,
    today,
  });
  if (stores.size === 0 || !currentWorkerId || !currentWorkerOrgId) return [];

  const byId = new Map();
  for (const worker of asArray(workers)) {
    if (worker?.id != null) byId.set(worker.id, worker);
  }

  const rows = [];
  for (const shift of asArray(shifts)) {
    if (shift?.date !== today) continue;
    if (shift.worker_id === currentWorkerId) continue;
    if (!sameOrg(shift, currentWorkerOrgId)) continue;
    if (!isPublished(shift) || isCancelled(shift)) continue;
    const team = nonemptyTeam(shift.team);
    if (!team || !stores.has(team)) continue;
    const row = publicColleague(shift, byId.get(shift.worker_id));
    if (row) rows.push(row);
  }

  rows.sort((a, b) => (
    String(a.start_time).localeCompare(String(b.start_time))
    || String(a.worker.name).localeCompare(String(b.worker.name))
    || String(a.id).localeCompare(String(b.id))
  ));
  return rows;
}

function startSortKey(start) {
  return typeof start === 'string' && start.trim() ? start.trim() : '99:99';
}

/**
 * Store (shift.team) of the worker's own published, non-cancelled shift today.
 * The team has to be one of `teams`. An empty list does not become team1,
 * and a shift at a store they are not on does not count. When several of
 * their stores match, the earliest start time wins.
 * @param {any[] | null | undefined} shifts
 * @param {{ workerId?: string, orgId?: string, today?: string, teams?: string[] }} [options]
 * @returns {string | null}
 */
export function defaultStoreFromTodayShift(shifts, { workerId, orgId, today, teams } = {}) {
  const allowed = new Set();
  for (const team of asArray(teams)) {
    const key = nonemptyTeam(team);
    if (key) allowed.add(key);
  }
  if (!workerId || !orgId || !today || allowed.size === 0) return null;

  const matches = [];
  for (const shift of asArray(shifts)) {
    if (shift?.worker_id !== workerId) continue;
    if (shift?.date !== today) continue;
    if (!sameOrg(shift, orgId)) continue;
    if (!isPublished(shift) || isCancelled(shift)) continue;
    const team = nonemptyTeam(shift.team);
    if (!team || !allowed.has(team)) continue;
    matches.push({ team, start: startSortKey(shift.start_time) });
  }
  if (matches.length === 0) return null;
  matches.sort((a, b) => a.start.localeCompare(b.start) || a.team.localeCompare(b.team));
  return matches[0].team;
}
