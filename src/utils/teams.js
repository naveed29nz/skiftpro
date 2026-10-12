/**
 * Detect active teams from WorkplaceSetting, combining three sources:
 *  1. declared via active_teams_count
 *  2. any team with a non-default custom name (e.g. "N.500", "N.417")
 *  3. any team with at least one assigned worker
 * Returns a list ordered team1 -> team10, excluding teams that have none of the above.
 */
export function getActiveTeams(wpSettings, workers = []) {
  if (!wpSettings) return [];
  const declaredCount = wpSettings.active_teams_count || 1;
  const list = [];
  for (let i = 1; i <= 10; i++) {
    const key = `team${i}`;
    const defaultName = `Team ${i}`;
    const name = wpSettings[`${key}_name`] || defaultName;
    const isCustomName = name && name !== defaultName;
    const hasWorkers = workers.some(w =>
      (w.teams || (w.team ? [w.team] : ['team1'])).includes(key)
    );
    if (i <= declaredCount || isCustomName || hasWorkers) {
      list.push({ key, label: name });
    }
  }
  return list;
}

export function getTeamNamesMap(wpSettings, workers = []) {
  const map = {};
  getActiveTeams(wpSettings, workers).forEach(t => { map[t.key] = t.label; });
  return map;
}