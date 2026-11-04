/**
 * Teams the signed-in person may use as a store filter.
 * Superadmin and organization owner (platform role admin) keep the historical
 * team1 fallback so screens that treat "no worker row" as "see the org" stay
 * put. Everyone else must not be placed on team1 while their worker row is
 * still loading, and must not be invented onto team1 after it loads.
 */
export function resolveMyTeams(worker, { ready = false, seesAllTeams = false } = {}) {
  if (seesAllTeams) {
    return worker?.teams?.length ? [...worker.teams] : ['team1'];
  }
  if (!ready) return [];
  return Array.isArray(worker?.teams) ? worker.teams.filter(Boolean) : [];
}

/**
 * Next store filter, or null when the current selection should stay.
 * Non-admins wait until the worker row is ready. A selected team that is not
 * one of theirs is replaced with their first team. "all" stays available only
 * where the screen still offers it.
 */
export function nextTeamFilter({
  ready,
  seesAllTeams = false,
  myTeams = [],
  filterTeam,
  teamDefaultSet = false,
  adminDefault = 'all',
  allowAll = false,
}) {
  if (!ready) return null;
  if (seesAllTeams) return teamDefaultSet ? null : adminDefault;
  if (!myTeams.length) return null;
  const selectionOk = myTeams.includes(filterTeam) || (allowAll && filterTeam === 'all');
  if (!teamDefaultSet || !selectionOk) return myTeams[0];
  return null;
}
