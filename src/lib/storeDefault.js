/**
 * Stores the signed-in person is actually on.
 * Missing or empty membership is an empty list. team1 is not invented here.
 */
export function assignedTeamKeys(worker) {
  if (!Array.isArray(worker?.teams)) return [];
  return worker.teams
    .filter((team) => typeof team === 'string')
    .map((team) => team.trim())
    .filter(Boolean);
}

/**
 * Preferred store when it is one of `options`, otherwise the screen's
 * existing default. Does not invent a store.
 */
export function chooseDefaultStore({ options = [], preferred = null, fallback = '' } = {}) {
  const keys = (Array.isArray(options) ? options : []).filter((key) => typeof key === 'string' && key);
  if (preferred && keys.includes(preferred)) return preferred;
  return fallback;
}

/**
 * Initial butikk on Loddtelling.
 * A store the person already picked stays. Today's shift store is used when
 * it is one of their teams and the picker can show it. Otherwise the first
 * of `myTeams` — the same default the page used before. No extra team1.
 */
export function nextLoddtellingStore({
  current = '',
  chosen = false,
  seesAll = false,
  myTeams = [],
  pickerKeys = [],
  preferred = null,
} = {}) {
  const mine = (Array.isArray(myTeams) ? myTeams : []).filter((team) => typeof team === 'string' && team.trim());
  const picker = (Array.isArray(pickerKeys) ? pickerKeys : []).filter((team) => typeof team === 'string' && team.trim());
  const selectable = picker.length ? picker : mine;
  const currentOk = Boolean(current) && (seesAll || mine.includes(current));
  if (chosen && currentOk) return current;
  if (preferred && mine.includes(preferred) && selectable.includes(preferred)) return preferred;
  if (currentOk) return current;
  return mine[0] || '';
}
