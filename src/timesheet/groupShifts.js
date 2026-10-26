/**
 * A shift counts for the selected department in the same way the employee
 * week view treats it as this department's own shift. Other departments are
 * the grey ghosts in that view. "Alle team" keeps every shift.
 */
export function shiftIsOnSelectedTeam(shift, worker, filterTeam) {
  if (!filterTeam || filterTeam === 'all') return true;
  if (shift?.team) return shift.team === filterTeam;
  return ((worker?.teams || ['team1'])[0] || 'team1') === filterTeam;
}

/**
 * Sorter etter vakt. The worker must be visible, and the shift itself must
 * belong to the selected department. Shifts tagged to another store are left
 * out of both the cards and the section totals.
 */
export function groupShiftVisible({ shift, worker, filterTeam, isAdmin = true, myTeams = [] }) {
  if (!worker) return false;
  const adminTeams = worker.teams || ['team1'];
  if (!isAdmin && !myTeams.some((team) => adminTeams.includes(team))) return false;
  const memberTeams = worker.teams || (worker.team ? [worker.team] : ['team1']);
  if (filterTeam !== 'all' && !memberTeams.includes(filterTeam)) return false;
  return shiftIsOnSelectedTeam(shift, worker, filterTeam);
}
