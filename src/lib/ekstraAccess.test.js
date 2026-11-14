import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleNavItems } from './featureFlags.js';
import {
  EKSTRA_PATHS,
  ekstraMenuItems,
  isEkstraOnlyAccount,
  loddtellingLockerLabel,
  mergeOwnRows,
  ownInnskuddFilters,
  redactInnskuddForEkstra,
  stripLoddtellingAttribution,
  teamsOnlyWorkers,
  userPageAllowList,
  visibleSettlements,
} from './ekstraAccess.js';

const workerNav = [
  { path: '/WorkerPortal', label: 'Min side' },
  { path: '/Dagsoppgjor', label: 'Dagsoppgjør' },
  { path: '/Loddtelling', label: 'Loddtelling' },
  { path: '/Innskudd', label: 'Innskudd' },
  { path: '/Resultat', label: 'Resultat' },
  { path: '/Timesheet', label: 'Timelister' },
  { path: '/Salary', label: 'Lønn' },
];

test('ekstrahjelp is role user with ansettelsestype tilkalling', () => {
  assert.deepEqual(EKSTRA_PATHS, ['/WorkerPortal', '/Dagsoppgjor', '/Loddtelling', '/Innskudd']);
  const ekstra = { ansettelsestype: 'tilkalling', role: 'user', teams: ['team2'] };
  assert.equal(isEkstraOnlyAccount({ role: 'user' }, ekstra), true);
  assert.equal(isEkstraOnlyAccount({ role: 'user' }, { ...ekstra, ansettelsestype: 'fast' }), false);
  assert.equal(isEkstraOnlyAccount({ role: 'admin' }, ekstra), false);
  assert.equal(isEkstraOnlyAccount({ role: 'user' }, { ...ekstra, role: 'butikksjef' }), false);
  assert.equal(isEkstraOnlyAccount({ role: 'user' }, {
    ...ekstra,
    role: 'user',
    team_roles: { team2: 'sub_admin' },
  }), false);
  assert.equal(isEkstraOnlyAccount({ role: 'user' }, null), false);
});

test('the menu and the page guard add the three store pages and nothing else', () => {
  assert.deepEqual(ekstraMenuItems(workerNav).map((item) => item.path), EKSTRA_PATHS);

  const flagsOff = ['/WorkerPortal', '/Loddtelling', '/Innskudd'];
  assert.deepEqual(userPageAllowList({
    ekstraOnly: true,
    workerAllowed: flagsOff,
    canSeeResultat: true,
  }), flagsOff);

  const flagsOn = ['/WorkerPortal', '/Dagsoppgjor', '/Loddtelling', '/Innskudd'];
  assert.deepEqual(userPageAllowList({
    ekstraOnly: true,
    workerAllowed: [...flagsOn, '/Resultat', '/Timesheet'],
    canSeeResultat: true,
  }), flagsOn);

  assert.deepEqual(userPageAllowList({
    ekstraOnly: false,
    workerAllowed: flagsOff,
    canSeeResultat: true,
  }), [...flagsOff, '/Resultat']);

  const blocked = ['/Dashboard', '/Workers', '/Timesheet', '/Tasks', '/Salary', '/Settings', '/Contracts', '/Ukeplan', '/Resultat'];
  const allowed = userPageAllowList({ ekstraOnly: true, workerAllowed: flagsOn, canSeeResultat: true });
  for (const path of blocked) assert.equal(allowed.includes(path), false);

  const visible = visibleNavItems(ekstraMenuItems(workerNav)).map((item) => item.path);
  assert.deepEqual(visible, ['/WorkerPortal', '/Loddtelling', '/Innskudd']);
  const withFlags = visibleNavItems(ekstraMenuItems(workerNav), { dagsoppgjor: true, resultat: true }).map((item) => item.path);
  assert.deepEqual(withFlags, EKSTRA_PATHS);
});

test('ekstrahjelp dagsoppgjør keeps only their own rows', () => {
  const rows = [
    { id: 'own', ansatt_id: 'w-me', ansatt_navn: 'Meg', created_by: 'u-me', droppet_belop: 100 },
    { id: 'legacy', ansatt_id: '', ansatt_navn: 'Meg', created_by: 'u-me', droppet_belop: 40 },
    { id: 'other', ansatt_id: 'w-other', ansatt_navn: 'Kari', hourly_rate: 220, created_by: 'u-other', droppet_belop: 900 },
    { id: 'typed-other', ansatt_id: 'w-other', ansatt_navn: 'Kari', created_by: 'u-me' },
  ];
  const visible = visibleSettlements(rows, { ekstraOnly: true, workerId: 'w-me', userId: 'u-me' });
  assert.deepEqual(visible.map((row) => row.id), ['own', 'legacy']);
  assert.equal(visible.some((row) => row.ansatt_navn === 'Kari'), false);
  assert.equal(visible.some((row) => row.hourly_rate != null), false);

  assert.deepEqual(
    visibleSettlements(rows, { ekstraOnly: false, workerId: 'w-me', userId: 'u-me' }).map((row) => row.id),
    rows.map((row) => row.id),
  );
});

test('ekstrahjelp innskudd reads and shows only their own name', () => {
  assert.deepEqual(ownInnskuddFilters('org-1', 'w-me', 'u-me'), [
    { org_id: 'org-1', ansatt_id: 'w-me' },
    { org_id: 'org-1', created_by: 'u-me' },
  ]);
  assert.deepEqual(ownInnskuddFilters('', 'w-me', 'u-me'), []);
  assert.equal(ownInnskuddFilters('org-1', 'w-me', 'u-me').some((filter) => filter.ansatt_id === 'w-other'), false);

  const merged = mergeOwnRows([
    [{ id: 'a', ansatt_id: 'w-me', registrert_navn: 'Meg' }],
    [{ id: 'a', ansatt_id: 'w-me', registrert_navn: 'Meg' }, { id: 'b', created_by: 'u-me', registrert_navn: 'Meg' }],
  ]);
  assert.deepEqual(merged.map((row) => row.id), ['a', 'b']);

  const other = { id: 'other', ansatt_id: 'w-other', registrert_navn: 'Kari Nordmann', belop: 20, hourly_rate: 199, email: 'kari@example.com' };
  const redacted = redactInnskuddForEkstra([
    { id: 'mine', ansatt_id: 'w-me', registrert_navn: 'Meg', belop: 10 },
    other,
  ], { ekstraOnly: true, workerId: 'w-me', userId: 'u-me' });
  assert.equal(redacted[0].registrert_navn, 'Meg');
  assert.equal(redacted[1].registrert_navn, '');
  assert.equal(redacted[1].belop, 20);
  assert.equal(Object.hasOwn(redacted[1], 'hourly_rate'), false);
  assert.equal(Object.hasOwn(redacted[1], 'email'), false);
  assert.equal(other.registrert_navn, 'Kari Nordmann');
  assert.equal(other.hourly_rate, 199);
});

test('ekstrahjelp team detection drops contact details and pay, and the lottery email stays hidden', () => {
  const stripped = teamsOnlyWorkers([{
    id: 'w-other',
    name: 'Kari',
    email: 'kari@example.com',
    phone: '999',
    address: 'Gate 1',
    hourly_rate: 220,
    teams: ['team4'],
    team: 'team4',
  }]);
  assert.deepEqual(stripped, [{ teams: ['team4'], team: 'team4' }]);
  assert.equal(Object.hasOwn(stripped[0], 'email'), false);
  assert.equal(Object.hasOwn(stripped[0], 'hourly_rate'), false);
  assert.equal(Object.hasOwn(stripped[0], 'name'), false);

  assert.equal(loddtellingLockerLabel('kari@example.com', { ekstraOnly: true }), '');
  assert.equal(loddtellingLockerLabel('kari@example.com', { ekstraOnly: false }), 'kari@example.com');
  const rows = stripLoddtellingAttribution([
    { id: 'week', updated_by: 'kari@example.com', loddtype: 'Mega' },
  ], { ekstraOnly: true });
  assert.equal(Object.hasOwn(rows[0], 'updated_by'), false);
  assert.equal(rows[0].loddtype, 'Mega');
});
