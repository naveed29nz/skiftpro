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

/** Droppable id for one day-cell in «Sorter etter vakt». Empty label is «Uten vakttype». */
export function groupShiftDroppableId(label, dayStr) {
  return `groupshift__${label || ''}__${dayStr}`;
}

/**
 * Fields written when a shift is dragged onto another shift-type row.
 * The row's type becomes the shift's type. Null when the drop is the same cell.
 */
export function groupShiftDropFields(shift, droppableId) {
  if (!shift || typeof droppableId !== 'string' || !droppableId.startsWith('groupshift__')) return null;
  const rest = droppableId.slice('groupshift__'.length);
  const splitAt = rest.lastIndexOf('__');
  if (splitAt < 0) return null;
  const shiftLabel = rest.slice(0, splitAt);
  const date = rest.slice(splitAt + 2);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if ((shift.shift_label || '') === shiftLabel && shift.date === date) return null;
  return { shift_label: shiftLabel, date };
}
