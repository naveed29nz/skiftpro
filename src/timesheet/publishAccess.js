import { effectiveAppRole } from '../utils/wageAccess.js';

// Publishing uses the same effective role as the rest of the app.
// profiles.role stays "user" when a store manager is appointed on the worker
// row (workers.role / team_roles). A platform admin is never downgraded.
const PUBLISH_ROLES = new Set(['admin', 'sub_admin', 'butikksjef']);

export function canPublishShiftDrafts(profile, worker) {
  return PUBLISH_ROLES.has(effectiveAppRole(profile, worker));
}

function assignedWorker(workers, shift) {
  return (workers || []).find((worker) => worker.id === shift.worker_id) || null;
}

// Same week-draft filter the timesheet used before store managers could publish.
// Open shifts stay out. A selected store keeps that store only.
function isWeekDraft(shift, { workers, filterTeam, openWorkerId }) {
  if (shift?.published) return false;
  if (openWorkerId && shift?.worker_id === openWorkerId) return false;
  const worker = assignedWorker(workers, shift);
  if (!filterTeam || filterTeam === 'all') {
    if (!worker) return true;
    const workerTeams = worker.teams || ['team1'];
    if (shift.team) return workerTeams.includes(shift.team);
    return true;
  }
  if (!worker) return false;
  if (shift.team) return shift.team === filterTeam;
  return (worker.teams?.[0] || 'team1') === filterTeam;
}

// Store a draft is published into. An untagged shift follows the employee's first store.
export function draftStore(shift, worker) {
  if (shift?.team) return shift.team;
  const teams = worker?.teams?.length ? worker.teams : [];
  return teams[0] || '';
}

/**
 * Drafts the signed-in person may publish.
 * Admin and department admin publish the drafts in the current store filter.
 * A butikksjef publishes only stores on their own worker row.
 * Employees get nothing.
 */
export function publishableDraftShifts(shifts, {
  profile = null,
  manager = null,
  workers = [],
  filterTeam = 'all',
  myTeams = [],
  openWorkerId = 'ledig',
} = {}) {
  if (!canPublishShiftDrafts(profile, manager)) return [];
  const role = effectiveAppRole(profile, manager);
  return (shifts || []).filter((shift) => {
    if (!isWeekDraft(shift, { workers, filterTeam, openWorkerId })) return false;
    if (role !== 'butikksjef') return true;
    const team = draftStore(shift, assignedWorker(workers, shift));
    return Boolean(team) && myTeams.includes(team);
  });
}
