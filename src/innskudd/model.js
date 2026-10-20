/** Pure Loomis innskudd rules. No Power BI and no network. */

export const NOTE_DENOMS = [
  { key: 'seddel_1000', label: '1000 kr', value: 1000 },
  { key: 'seddel_500', label: '500 kr', value: 500 },
  { key: 'seddel_200', label: '200 kr', value: 200 },
  { key: 'seddel_100', label: '100 kr', value: 100 },
];

/** Current Narvesen kundenummer. A configured team kundenr overrides this. */
export const KNOWN_KUNDENR_BY_STORE = {
  'N.417': '20052971',
  'N.500': '20048196',
  'N.586': '20057557',
  'N.897': '20057456',
};

export const UNCOUNTED_AFTER_DAYS = 5;

export const PERIODS = [
  { id: '7', label: 'Siste 7 dager', days: 7 },
  { id: '30', label: 'Siste 30 dager', days: 30 },
  { id: '90', label: 'Siste 90 dager', days: 90 },
  { id: '365', label: 'Siste 12 måneder', days: 365 },
];

const TONE = {
  registrert: 'slate',
  sendt: 'blue',
  godkjent: 'green',
  avvik: 'red',
  ikke_talt: 'amber',
  kun_loomis: 'red',
};

export function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function formatAmount(value) {
  const n = roundMoney(value);
  const digits = Number.isInteger(n) ? 0 : 2;
  return new Intl.NumberFormat('nb-NO', {
    minimumFractionDigits: digits,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatKr(value) {
  return `${formatAmount(value)} kr`;
}

export function formatDiff(value) {
  if (value == null || Number.isNaN(Number(value))) return '–';
  const n = roundMoney(value);
  if (n === 0) return '0';
  const abs = formatAmount(Math.abs(n));
  return n > 0 ? `+${abs}` : `−${abs}`;
}

export function formatShortDate(iso) {
  if (!iso) return '?';
  const match = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return String(iso);
  return `${Number(match[3])}.${match[2]}`;
}

export function todayIso(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysIso(iso, days) {
  const match = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return iso;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(fromIso, toIso) {
  const from = String(fromIso || '').slice(0, 10);
  const to = String(toIso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

export function isNineDigitBag(value) {
  return /^\d{9}$/.test(String(value || '').trim());
}

export function shortName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].slice(0, 1)}.`;
}

export function emptyCounts() {
  return { seddel_1000: '', seddel_500: '', seddel_200: '', seddel_100: '', mynt: '' };
}

export function bagTotals(counts) {
  let notes = 0;
  let sum = 0;
  for (const denom of NOTE_DENOMS) {
    const raw = counts?.[denom.key];
    const n = raw === '' || raw == null ? 0 : Number(raw);
    const count = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
    notes += count;
    sum += count * denom.value;
  }
  const myntRaw = counts?.mynt;
  const myntN = myntRaw === '' || myntRaw == null ? 0 : Number(String(myntRaw).replace(',', '.'));
  const mynt = Number.isFinite(myntN) ? roundMoney(Math.max(0, myntN)) : 0;
  return {
    antallSedler: notes,
    mynt,
    belop: roundMoney(sum + mynt),
    lines: NOTE_DENOMS.map((denom) => {
      const raw = counts?.[denom.key];
      const n = raw === '' || raw == null ? 0 : Number(raw);
      const count = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
      return { ...denom, count, sum: count * denom.value };
    }),
  };
}

export function knownKundenrForName(name) {
  return KNOWN_KUNDENR_BY_STORE[String(name || '').trim()] || '';
}

export function effectiveKundenr(team) {
  const explicit = String(team?.kundenr || '').trim();
  if (explicit) return explicit;
  return knownKundenrForName(team?.label);
}

export function teamsFromWorkplace(wp, workers = []) {
  if (!wp) return [];
  const declared = wp.active_teams_count || 1;
  const list = [];
  for (let i = 1; i <= 10; i += 1) {
    const key = `team${i}`;
    const fallback = `Team ${i}`;
    const label = wp[`${key}_name`] || fallback;
    const custom = label && label !== fallback;
    const hasWorkers = workers.some((w) => (w.teams || (w.team ? [w.team] : ['team1'])).includes(key));
    if (i <= declared || custom || hasWorkers) {
      list.push({
        key,
        label,
        kundenr: wp[`${key}_loomis_kundenr`] || '',
      });
    }
  }
  return list;
}

export function teamForKundenr(kundenr, teams) {
  const nr = String(kundenr || '').trim();
  if (!nr) return null;
  const configured = (teams || []).find((team) => effectiveKundenr(team) === nr);
  if (configured) return configured;
  const knownName = Object.entries(KNOWN_KUNDENR_BY_STORE).find(([, value]) => value === nr)?.[0];
  if (!knownName) return null;
  return { key: null, label: knownName, kundenr: nr };
}

function statusOf(key, employee, admin, extra = {}) {
  return {
    key,
    employee,
    admin,
    tone: TONE[key],
    matched: Boolean(extra.matched),
    age: extra.age ?? null,
    diff: Object.prototype.hasOwnProperty.call(extra, 'diff') ? extra.diff : null,
    loomisAmount: Object.prototype.hasOwnProperty.call(extra, 'loomisAmount') ? extra.loomisAmount : null,
  };
}

export function registrationStatus(registration, loomis, today) {
  const age = daysBetween(registration?.dato, today);
  if (!loomis) {
    if (age != null && age > UNCOUNTED_AFTER_DAYS) {
      return statusOf('ikke_talt', `Ikke talt · ${age} dager`, `Ikke talt · ${age} dager`, { matched: false, age });
    }
    return statusOf('registrert', 'Registrert', 'Registrert', { matched: false, age });
  }
  const counted = loomis.status === 'Bokført';
  if (!counted) {
    if (age != null && age > UNCOUNTED_AFTER_DAYS) {
      return statusOf('ikke_talt', `Ikke talt · ${age} dager`, `Ikke talt · ${age} dager`, { matched: true, age });
    }
    return statusOf('sendt', 'Sendt til Loomis', 'Sendt til Loomis', { matched: true, age });
  }
  const store = roundMoney(registration?.belop);
  const approved = roundMoney(loomis.total);
  const diff = roundMoney(approved - store);
  if (diff === 0) {
    return statusOf('godkjent', `Godkjent av Loomis · ${formatKr(approved)}`, 'Godkjent', {
      matched: true,
      diff,
      loomisAmount: approved,
      age,
    });
  }
  return statusOf('avvik', `Avvik · Loomis ${formatKr(approved)}`, 'Avvik', {
    matched: true,
    diff,
    loomisAmount: approved,
    age,
  });
}

function inPeriod(iso, fromIso, toIso) {
  const day = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  return day >= fromIso && day <= toIso;
}

function storeMatches(filter, team, label) {
  if (!filter || filter === 'all') return true;
  return filter === team || filter === label;
}

export function buildInnskuddRows({
  registrations = [],
  deposits = [],
  teams = [],
  today,
  storeKey = 'all',
  periodDays = 30,
}) {
  const from = addDaysIso(today, -periodDays);
  const byPose = new Map();
  for (const deposit of deposits) {
    const pose = String(deposit.bilagsnr || '').trim();
    if (pose) byPose.set(pose, deposit);
  }
  const matchedPoses = new Set(
    registrations
      .map((row) => String(row.posenummer || '').trim())
      .filter((pose) => pose && byPose.has(pose)),
  );

  const rows = [];
  for (const registration of registrations) {
    if (!inPeriod(registration.dato, from, today)) continue;
    const team = teams.find((item) => item.key === registration.team);
    const label = team?.label || registration.butikk || registration.team;
    if (!storeMatches(storeKey, registration.team, label)) continue;
    const loomis = byPose.get(String(registration.posenummer || '').trim()) || null;
    const status = registrationStatus(registration, loomis, today);
    const loomisAmount = status.loomisAmount ?? (loomis && loomis.status === 'Bokført' ? roundMoney(loomis.total) : null);
    rows.push({
      id: registration.id,
      kind: 'store',
      team: registration.team,
      butikk: label,
      posenummer: registration.posenummer,
      dato: registration.dato,
      datoLabel: formatShortDate(registration.dato),
      registrertAv: registration.registrert_navn || '',
      registrertKort: shortName(registration.registrert_navn),
      belopButikk: roundMoney(registration.belop),
      godkjentLoomis: loomisAmount,
      diff: status.diff ?? null,
      status,
      registration,
    });
  }

  for (const deposit of deposits) {
    const pose = String(deposit.bilagsnr || '').trim();
    if (pose && matchedPoses.has(pose)) continue;
    const store = teamForKundenr(deposit.kundenr, teams)
      || teams.find((item) => item.key && item.key === deposit.team)
      || null;
    const label = store?.label || 'Ukjent butikk';
    const teamKey = store?.key || deposit.team || null;
    if (!storeMatches(storeKey, teamKey, label)) continue;
    const when = deposit.telledato || deposit.bokforingsdato || null;
    if (when && !inPeriod(when, from, today)) continue;
    const amount = deposit.total == null ? null : roundMoney(deposit.total);
    rows.push({
      id: `loomis-${deposit.id || deposit.innskuddnr}`,
      kind: 'loomis-only',
      team: teamKey,
      butikk: label,
      posenummer: pose || '–',
      dato: when,
      datoLabel: when ? formatShortDate(when) : '?',
      registrertAv: '',
      registrertKort: '',
      belopButikk: null,
      godkjentLoomis: amount,
      diff: amount,
      status: statusOf('kun_loomis', 'Kun i Loomis', 'Kun i Loomis', { matched: false }),
      deposit,
    });
  }

  rows.sort((a, b) => String(b.dato || '').localeCompare(String(a.dato || '')) || String(a.posenummer).localeCompare(String(b.posenummer)));
  return rows;
}

export function summarizeRows(rows) {
  return {
    registrert: rows.filter((row) => row.kind === 'store').length,
    godkjent: rows.filter((row) => row.status.key === 'godkjent').length,
    ikkeTalt: rows.filter((row) => row.status.key === 'ikke_talt').length,
    kunLoomis: rows.filter((row) => row.status.key === 'kun_loomis').length,
  };
}

export function canEditRegistration(registration, deposits, user) {
  if (!registration || !user) return false;
  const loomis = deposits.find((deposit) => String(deposit.bilagsnr || '').trim() === String(registration.posenummer || '').trim());
  if (loomis) return false;
  const role = user.role;
  if (role === 'admin' || role === 'sub_admin') return true;
  if (registration.ansatt_id && user.workerId && registration.ansatt_id === user.workerId) return true;
  if (registration.created_by && user.id && registration.created_by === user.id) return true;
  return false;
}
