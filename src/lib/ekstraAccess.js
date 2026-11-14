import { isEkstrahjelp } from '../contracts/employment.js';
import { effectiveAppRole } from '../utils/wageAccess.js';

/** Routes an ekstrahjelp user may open, in menu order. */
export const EKSTRA_PATHS = ['/WorkerPortal', '/Dagsoppgjor', '/Loddtelling', '/Innskudd'];

/**
 * Tilkalling with no manager role. Same gate as the menu: role user and
 * ansettelsestype tilkalling. A platform admin or a store manager stays a manager.
 */
export function isEkstraOnlyAccount(profile, worker) {
  if (!worker || !isEkstrahjelp(worker.ansettelsestype)) return false;
  return effectiveAppRole(profile, worker) === 'user';
}

export function ekstraMenuItems(items) {
  return (items || []).filter((item) => EKSTRA_PATHS.includes(item?.path));
}

/**
 * Page guard for role user. Ekstrahjelp keeps the worker pages that are
 * actually enabled, and never Resultat or the manager pages. Other employees
 * still get Resultat when the worker flag says so.
 */
export function userPageAllowList({ ekstraOnly = false, workerAllowed = [], canSeeResultat = false } = {}) {
  const pages = (Array.isArray(workerAllowed) ? workerAllowed : []).filter((path) => typeof path === 'string');
  if (ekstraOnly) return pages.filter((path) => EKSTRA_PATHS.includes(path));
  return canSeeResultat ? [...pages, '/Resultat'] : pages;
}

function sameId(left, right) {
  if (left == null || right == null || left === '' || right === '') return false;
  return String(left) === String(right);
}

/**
 * A settlement row belongs to this person when the employee id matches,
 * or when that id is empty and they created the row.
 * @param {any} row
 * @param {{ workerId?: string, userId?: string }} [actor]
 */
export function ownsSettlement(row, { workerId, userId } = {}) {
  if (!row) return false;
  if (row.ansatt_id) return sameId(row.ansatt_id, workerId);
  return sameId(row.created_by, userId);
}

/**
 * Ekstrahjelp lists and exports only their own dagsoppgjør.
 * @param {any[] | null | undefined} records
 * @param {{ ekstraOnly?: boolean, workerId?: string, userId?: string }} [actor]
 */
export function visibleSettlements(records, { ekstraOnly = false, workerId, userId } = {}) {
  const rows = Array.isArray(records) ? records : [];
  if (!ekstraOnly) return rows;
  return rows.filter((row) => ownsSettlement(row, { workerId, userId }));
}

/**
 * @param {any} row
 * @param {{ workerId?: string, userId?: string }} actor
 */
function ownsInnskudd(row, { workerId, userId }) {
  if (!row) return false;
  return sameId(row.ansatt_id, workerId) || sameId(row.created_by, userId);
}

/** Filters that read this person's bags and nobody else's. */
export function ownInnskuddFilters(orgId, workerId, userId) {
  if (!orgId) return [];
  const filters = [];
  if (workerId) filters.push({ org_id: orgId, ansatt_id: workerId });
  if (userId) filters.push({ org_id: orgId, created_by: String(userId) });
  return filters;
}

export function mergeOwnRows(groups) {
  const byId = new Map();
  const loose = [];
  for (const group of groups || []) {
    for (const row of group || []) {
      if (!row) continue;
      if (row.id) byId.set(row.id, row);
      else loose.push(row);
    }
  }
  return [...byId.values(), ...loose];
}

const OTHER_PERSON_FIELDS = ['email', 'phone', 'address', 'hourly_rate'];

/**
 * Drop other people's names and pay before an ekstrahjelp screen keeps the rows.
 * Own rows stay intact. Cash amounts are store data and are kept.
 * @param {any[] | null | undefined} rows
 * @param {{ ekstraOnly?: boolean, workerId?: string, userId?: string }} [actor]
 */
export function redactInnskuddForEkstra(rows, { ekstraOnly = false, workerId, userId } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (!ekstraOnly) return list;
  return list.map((row) => {
    if (!row || ownsInnskudd(row, { workerId, userId })) return row;
    const next = { ...row, registrert_navn: '' };
    for (const field of OTHER_PERSON_FIELDS) delete next[field];
    return next;
  });
}

/** Team detection only needs membership, not contact details or pay. */
export function teamsOnlyWorkers(workers) {
  return (workers || []).map((worker) => ({
    teams: worker?.teams,
    team: worker?.team,
  }));
}

/** Email of whoever submitted a lottery week. Hidden from ekstrahjelp. */
export function loddtellingLockerLabel(updatedBy, { ekstraOnly = false } = {}) {
  if (ekstraOnly || !updatedBy) return '';
  return String(updatedBy);
}

export function stripLoddtellingAttribution(rows, { ekstraOnly = false } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (!ekstraOnly) return list;
  return list.map((row) => {
    if (!row || !row.updated_by) return row;
    const next = { ...row };
    delete next.updated_by;
    return next;
  });
}
