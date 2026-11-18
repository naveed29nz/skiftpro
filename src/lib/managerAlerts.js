// Actionable items for butikksjef and above. Computed from shifts and
// contracts the caller already fetched under RLS. Nothing here sends mail.

const UNSIGNED = new Set(['sendt', 'apnet']);
const COUNTERSIGN = new Set(['signert_ansatt']);
const CLOSED = new Set(['avvist', 'trukket', 'utlopt', 'utkast']);
const LEDIG = 'ledig';

export function ageLabel(days) {
  const n = Math.max(0, Number(days) || 0);
  if (n === 0) return 'i dag';
  if (n === 1) return '1 dag';
  return `${n} dager`;
}

export function isMissingRelation(error) {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.code || ''}`;
  return /does not exist|schema cache|PGRST205|42P01|PGRST202/i.test(message);
}

function day(iso) {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function iso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(isoDay, n) {
  const date = day(isoDay);
  if (!date) return '';
  date.setDate(date.getDate() + n);
  return iso(date);
}

function dayDiff(later, earlier) {
  const a = day(later);
  const b = day(earlier);
  if (!a || !b) return 0;
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function weekStart(isoDay) {
  const date = day(isoDay);
  if (!date) return '';
  const dow = date.getDay();
  const delta = dow === 0 ? 6 : dow - 1;
  date.setDate(date.getDate() - delta);
  return iso(date);
}

function isoWeek(isoDay) {
  const date = day(isoDay);
  if (!date) return 0;
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function workerTeams(worker) {
  if (Array.isArray(worker?.teams) && worker.teams.length) return worker.teams;
  return ['team1'];
}

function inScope(team, teams) {
  if (teams == null) return true;
  return Boolean(team) && teams.includes(team);
}

function storeName(team, teamNames) {
  const name = teamNames?.[team];
  if (name && String(name).trim()) return String(name).trim();
  return 'Butikken';
}

function timesheetHref(week, team) {
  const params = new URLSearchParams();
  if (week) params.set('week', week);
  if (team) params.set('team', team);
  const query = params.toString();
  return query ? `/Timesheet?${query}` : '/Timesheet';
}

function contractHref(name) {
  const params = new URLSearchParams();
  if (name) params.set('q', name);
  const query = params.toString();
  return query ? `/Contracts?${query}` : '/Contracts';
}

function sentDay(contract) {
  return String(contract.sent_at || contract.updated_date || contract.created_date || '').slice(0, 10);
}

export function presentAlerts(alerts, states) {
  const byKey = new Map((states || []).map((row) => [row.alert_key, row]));
  return (alerts || []).map((alert) => {
    const state = byKey.get(alert.key);
    return {
      ...alert,
      read: Boolean(state?.read_at),
      dismissed: Boolean(state?.dismissed_at),
    };
  }).filter((alert) => !alert.dismissed);
}

export function unreadCount(alerts) {
  return (alerts || []).reduce((sum, alert) => sum + (alert.read || alert.dismissed ? 0 : 1), 0);
}

/**
 * teams === null means every store in the org (admin, sub-admin, super-admin).
 * teams === [] means the viewer has no store yet, so the list stays empty.
 */
export function buildManagerAlerts({
  today,
  orgId,
  teams = null,
  teamNames = {},
  contracts = [],
  shifts = [],
  workers = [],
}) {
  const workerById = new Map(workers.map((worker) => [worker.id, worker]));
  const sameOrg = (row) => !orgId || !row?.org_id || row.org_id === orgId;
  const items = [];

  for (const contract of contracts) {
    if (!sameOrg(contract)) continue;
    const worker = workerById.get(contract.worker_id);
    const team = workerTeams(worker).find((key) => inScope(key, teams)) || workerTeams(worker)[0];
    if (!workerInScope(worker, teams)) continue;
    const name = contract.worker_name || worker?.name || 'Ansatt';

    if (UNSIGNED.has(contract.status) || COUNTERSIGN.has(contract.status)) {
      const sent = sentDay(contract);
      const age = sent ? dayDiff(today, sent) : 0;
      const waitingOnEmployer = COUNTERSIGN.has(contract.status);
      items.push({
        key: `unsigned:${contract.id}`,
        kind: 'unsigned',
        title: waitingOnEmployer
          ? `${name}: venter på signatur fra arbeidsgiver`
          : `${name}: avtale er sendt, men ikke signert`,
        detail: waitingOnEmployer
          ? `Ansatt har signert. Sendt ${ageLabel(age)}.`
          : `Sendt ${ageLabel(age)}.`,
        age,
        href: contractHref(name),
        sort: `1-${String(10000 - age).padStart(5, '0')}`,
      });
    }

    const end = String(contract.end_date || '').slice(0, 10);
    const daysLeft = end ? dayDiff(end, today) : null;
    if (end && daysLeft != null && daysLeft >= 0 && daysLeft <= 7 && !CLOSED.has(contract.status)) {
      items.push({
        key: `expiring:${contract.id}:${end}`,
        kind: 'expiring',
        title: `${name}: avtale utløper ${daysLeft === 0 ? 'i dag' : `om ${ageLabel(daysLeft)}`}`,
        detail: `${storeName(team, teamNames)}. Sluttdato ${end.split('-').reverse().join('.')}.`,
        age: daysLeft,
        href: contractHref(name),
        sort: `2-${String(daysLeft).padStart(3, '0')}`,
      });
    }
  }

  const drafts = new Map();
  const opens = new Map();
  const hours = new Map();
  const draftUntil = addDays(today, 13);
  const openUntil = addDays(today, 6);
  const hoursFrom = addDays(today, -14);

  for (const shift of shifts) {
    if (!sameOrg(shift) || shift.status === 'cancelled') continue;
    const worker = workerById.get(shift.worker_id);
    const team = shift.team || workerTeams(worker)[0];
    if (!inScope(team, teams)) continue;
    const date = String(shift.date || '').slice(0, 10);
    if (!date) continue;
    const assigned = shift.worker_id && shift.worker_id !== LEDIG;

    if (!shift.published && assigned && date >= today && date <= draftUntil) {
      const week = weekStart(date);
      const key = `${team}|${week}`;
      const bucket = drafts.get(key) || { team, week, count: 0 };
      bucket.count += 1;
      drafts.set(key, bucket);
    }

    if (!assigned && date >= today && date <= openUntil) {
      const bucket = opens.get(team) || { team, count: 0, earliest: date };
      bucket.count += 1;
      if (date < bucket.earliest) bucket.earliest = date;
      opens.set(team, bucket);
    }

    if (assigned && date >= hoursFrom && date <= today && shift.hours_approved !== true) {
      const week = weekStart(date);
      const key = `${team}|${week}`;
      const bucket = hours.get(key) || { team, week, count: 0 };
      bucket.count += 1;
      hours.set(key, bucket);
    }
  }

  for (const bucket of drafts.values()) {
    const weekNo = isoWeek(bucket.week);
    items.push({
      key: `draft:${bucket.team}:${bucket.week}:${bucket.count}`,
      kind: 'draft',
      title: `${storeName(bucket.team, teamNames)}: ${bucket.count} vakter i uke ${weekNo} er fortsatt Utkast`,
      detail: 'Ansatte ser ikke vaktene før de publiseres.',
      href: timesheetHref(bucket.week, bucket.team),
      sort: `3-${bucket.week}`,
    });
  }

  for (const bucket of opens.values()) {
    items.push({
      key: `open:${bucket.team}:${bucket.count}:${bucket.earliest}`,
      kind: 'open',
      title: `${storeName(bucket.team, teamNames)}: ${bucket.count} ledige vakter de neste 7 dagene`,
      detail: 'Vaktene har ingen ansatt.',
      href: timesheetHref(weekStart(bucket.earliest), bucket.team),
      sort: `4-${bucket.earliest}`,
    });
  }

  for (const bucket of hours.values()) {
    const weekNo = isoWeek(bucket.week);
    items.push({
      key: `hours:${bucket.team}:${bucket.week}:${bucket.count}`,
      kind: 'hours',
      title: `${storeName(bucket.team, teamNames)}: ${bucket.count} vakter i uke ${weekNo} er ikke godkjent`,
      detail: 'Timer venter på godkjenning i Timelister.',
      href: timesheetHref(bucket.week, bucket.team),
      sort: `5-${bucket.week}`,
    });
  }

  items.sort((a, b) => a.sort.localeCompare(b.sort));
  return items;
}

function workerInScope(worker, teams) {
  if (teams == null) return true;
  if (!worker) return false;
  return workerTeams(worker).some((team) => teams.includes(team));
}
