import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultStoreFromTodayShift,
  filterOwnPortalShifts,
  ownShiftQuery,
  rosterShiftQuery,
  selectColleaguesToday,
  todayOwnShiftQuery,
  viewerStoreTeams,
} from './portalShifts.js';

const TODAY = '2026-11-07';
const ORG = 'org-n417';
const OTHER_ORG = 'org-other';
const ALINA = 'alina';
const AHMED = 'ahmed';

function worker(id, name, teams, extra = {}) {
  return {
    id,
    name,
    position: 'Ansatt',
    color: '#3B82F6',
    teams,
    team: teams[0] || 'team1',
    email: `${id}@example.com`,
    phone: '000',
    hourly_rate: 'do-not-leak',
    employment_percentage: 100,
    ...extra,
  };
}

function shift(id, workerId, team, extra = {}) {
  return {
    id,
    org_id: ORG,
    worker_id: workerId,
    worker_name: workerId,
    date: TODAY,
    start_time: '10:00',
    end_time: '15:00',
    team,
    status: 'scheduled',
    published: true,
    notes: 'private-note',
    hourly_rate: 'do-not-leak',
    pay: 1550,
    wage: 1550,
    hours_approved: true,
    hours_approved_at: '2026-11-07T18:00:00Z',
    hours_approved_by: 'admin',
    created_by: 'admin',
    break_minutes: 30,
    shift_label: 'middle',
    ...extra,
  };
}

const workers = [
  worker(ALINA, 'Alina', ['team2']),
  worker(AHMED, 'Ahmed', ['team1', 'team2']),
  worker('amir', 'Amir', ['team2']),
  worker('elif', 'Elif', ['team2']),
  worker('alvin', 'Alvin', ['team2']),
  worker('jehanzeb', 'Jehanzeb', ['team2']),
  worker('mohammad', 'Mohammad', ['team2']),
  worker('guest', 'Guest', []),
];

function names(rows) {
  return rows.map((row) => row.worker.name);
}

test('the personal shift query filters by org and worker and keys the cache by user', () => {
  const query = ownShiftQuery('user-alina', ORG, ALINA);
  assert.deepEqual(query.filter, { org_id: ORG, worker_id: ALINA });
  assert.deepEqual(query.queryKey, ['shifts', 'user-alina', ORG, ALINA, 'mine']);
  assert.ok(query.queryKey.includes('user-alina'));
  assert.ok(query.queryKey.includes(ALINA));
  assert.equal(Object.hasOwn(query.filter, 'hourly_rate'), false);
  assert.equal(Object.hasOwn(query.filter, 'pay'), false);

  const otherUser = ownShiftQuery('user-ahmed', ORG, ALINA);
  const otherWorker = ownShiftQuery('user-alina', ORG, AHMED);
  assert.notDeepEqual(query.queryKey, otherUser.queryKey);
  assert.notDeepEqual(query.queryKey, otherWorker.queryKey);

  const roster = rosterShiftQuery('user-alina', ORG);
  assert.deepEqual(roster.filter, { org_id: ORG });
  assert.equal(Object.hasOwn(roster.filter, 'worker_id'), false);
  assert.equal(Object.hasOwn(roster.filter, 'hourly_rate'), false);
  assert.notDeepEqual(roster.queryKey, query.queryKey);
  assert.deepEqual(roster.queryKey, ['shifts', 'user-alina', ORG, 'roster']);
});

test('Ahmed is left out of Alina’s N.417 list when his shift is at N.500', () => {
  const shifts = [
    shift('alina-417', ALINA, 'team2', { start_time: '10:00', end_time: '15:00' }),
    shift('ahmed-500', AHMED, 'team1', { start_time: '15:00', end_time: '22:00' }),
    shift('amir-417', 'amir', 'team2', { start_time: '09:00', end_time: '14:00' }),
    shift('elif-417', 'elif', 'team2', { start_time: '12:00', end_time: '18:00' }),
    shift('alvin-417', 'alvin', 'team2', { start_time: '10:00', end_time: '16:00' }),
    shift('jehanzeb-417', 'jehanzeb', 'team2', { start_time: '11:00', end_time: '17:00' }),
    shift('mohammad-417', 'mohammad', 'team2', { start_time: '15:00', end_time: '21:00' }),
  ];

  const rows = selectColleaguesToday({
    shifts,
    workers,
    currentWorkerId: ALINA,
    currentWorkerOrgId: ORG,
    today: TODAY,
  });

  assert.deepEqual(names(rows), ['Amir', 'Alvin', 'Jehanzeb', 'Elif', 'Mohammad']);
  assert.equal(rows.some((row) => row.worker_id === AHMED), false);
  assert.equal(rows.some((row) => row.worker_id === ALINA), false);
  assert.deepEqual(
    rows.map((row) => [row.worker.name, row.start_time, row.end_time, row.team]),
    [
      ['Amir', '09:00', '14:00', 'team2'],
      ['Alvin', '10:00', '16:00', 'team2'],
      ['Jehanzeb', '11:00', '17:00', 'team2'],
      ['Elif', '12:00', '18:00', 'team2'],
      ['Mohammad', '15:00', '21:00', 'team2'],
    ],
  );
});

test('a colleague is included from the shift store even with no matching membership', () => {
  const rows = selectColleaguesToday({
    shifts: [
      shift('alina-417', ALINA, 'team2'),
      shift('guest-417', 'guest', 'team2', { start_time: '08:00', end_time: '12:00' }),
    ],
    workers,
    currentWorkerId: ALINA,
    currentWorkerOrgId: ORG,
    today: TODAY,
  });

  assert.deepEqual(names(rows), ['Guest']);
  assert.equal(rows[0].worker.teams, undefined);
  assert.deepEqual(rows[0].worker, {
    id: 'guest',
    name: 'Guest',
    position: 'Ansatt',
    color: '#3B82F6',
  });
});

test('a viewer working two stores sees colleagues at each store, with that shift’s time', () => {
  const rows = selectColleaguesToday({
    shifts: [
      shift('alina-417', ALINA, 'team2', { start_time: '10:00', end_time: '15:00' }),
      shift('alina-500', ALINA, 'team1', { start_time: '16:00', end_time: '20:00' }),
      shift('ahmed-500', AHMED, 'team1', { start_time: '15:00', end_time: '22:00' }),
      shift('amir-417', 'amir', 'team2', { start_time: '09:00', end_time: '14:00' }),
      shift('ahmed-417', 'ahmed-other', 'team2', { start_time: '08:00', end_time: '10:00' }),
    ],
    workers: [
      ...workers,
      worker('ahmed-other', 'Ahmed Other', ['team9']),
    ],
    currentWorkerId: ALINA,
    currentWorkerOrgId: ORG,
    today: TODAY,
  });

  assert.deepEqual(
    rows.map((row) => [row.worker.name, row.start_time, row.end_time, row.team]),
    [
      ['Ahmed Other', '08:00', '10:00', 'team2'],
      ['Amir', '09:00', '14:00', 'team2'],
      ['Ahmed', '15:00', '22:00', 'team1'],
    ],
  );
});

test('two shifts for one colleague keep each shift’s own time', () => {
  const rows = selectColleaguesToday({
    shifts: [
      shift('alina-417', ALINA, 'team2'),
      shift('amir-early', 'amir', 'team2', { start_time: '08:00', end_time: '12:00' }),
      shift('amir-late', 'amir', 'team2', { start_time: '13:00', end_time: '17:00' }),
      shift('amir-other-store', 'amir', 'team1', { start_time: '18:00', end_time: '22:00' }),
    ],
    workers,
    currentWorkerId: ALINA,
    currentWorkerOrgId: ORG,
    today: TODAY,
  });

  assert.deepEqual(
    rows.map((row) => [row.id, row.start_time, row.end_time]),
    [
      ['amir-early', '08:00', '12:00'],
      ['amir-late', '13:00', '17:00'],
    ],
  );
});

test('a viewer with no published shift today gets an empty list', () => {
  const colleagues = [
    shift('amir-417', 'amir', 'team2'),
    shift('elif-417', 'elif', 'team2'),
  ];
  assert.deepEqual(selectColleaguesToday({
    shifts: colleagues,
    workers,
    currentWorkerId: ALINA,
    currentWorkerOrgId: ORG,
    today: TODAY,
  }), []);

  assert.deepEqual(selectColleaguesToday({
    shifts: [
      shift('alina-cancelled', ALINA, 'team2', { status: 'cancelled' }),
      ...colleagues,
    ],
    workers,
    currentWorkerId: ALINA,
    currentWorkerOrgId: ORG,
    today: TODAY,
  }), []);

  assert.deepEqual(selectColleaguesToday({
    shifts: [
      shift('alina-draft', ALINA, 'team2', { published: false }),
      ...colleagues,
    ],
    workers,
    currentWorkerId: ALINA,
    currentWorkerOrgId: ORG,
    today: TODAY,
  }), []);

  assert.deepEqual(selectColleaguesToday({
    shifts: [
      shift('alina-yesterday', ALINA, 'team2', { date: '2026-11-06' }),
      ...colleagues,
    ],
    workers,
    currentWorkerId: ALINA,
    currentWorkerOrgId: ORG,
    today: TODAY,
  }), []);
});

test('cancelled, unpublished, other-org, and missing-team shifts are excluded', () => {
  const rows = selectColleaguesToday({
    shifts: [
      shift('alina-417', ALINA, 'team2'),
      shift('cancelled', 'amir', 'team2', { status: 'cancelled', start_time: '08:00' }),
      shift('draft', 'elif', 'team2', { published: false, start_time: '08:30' }),
      shift('unpublished-missing', 'alvin', 'team2', { published: undefined, start_time: '08:45' }),
      shift('other-org', 'jehanzeb', 'team2', { org_id: OTHER_ORG, start_time: '09:00' }),
      shift('no-team', 'mohammad', '', { start_time: '09:30' }),
      shift('blank-team', 'guest', '   ', { start_time: '09:45' }),
      shift('tomorrow', 'amir', 'team2', { date: '2026-11-08', start_time: '10:00' }),
      shift('kept', 'elif', 'team2', { id: 'kept', start_time: '12:00', end_time: '18:00', published: true, status: 'scheduled' }),
    ],
    workers,
    currentWorkerId: ALINA,
    currentWorkerOrgId: ORG,
    today: TODAY,
  });

  assert.deepEqual(rows.map((row) => row.id), ['kept']);
  assert.equal(viewerStoreTeams([
    shift('missing-team', ALINA, null),
    shift('blank', ALINA, '  '),
  ], { workerId: ALINA, orgId: ORG, today: TODAY }).size, 0);
});

test('stores come from the viewer’s own shifts, not from a roster row', () => {
  const rows = selectColleaguesToday({
    viewerShifts: [
      shift('alina-417', ALINA, 'team2', { start_time: '10:00', end_time: '15:00' }),
    ],
    shifts: [
      shift('roster-says-500', ALINA, 'team1', { start_time: '18:00', end_time: '22:00' }),
      shift('ahmed-500', AHMED, 'team1', { start_time: '15:00', end_time: '22:00' }),
      shift('amir-417', 'amir', 'team2', { start_time: '09:00', end_time: '14:00' }),
    ],
    workers,
    currentWorkerId: ALINA,
    currentWorkerOrgId: ORG,
    today: TODAY,
  });

  assert.deepEqual(names(rows), ['Amir']);
  assert.equal(rows[0].start_time, '09:00');
  assert.equal(rows[0].end_time, '14:00');
});

test('colleague rows return only public planning fields', () => {
  const sourceShift = shift('amir-417', 'amir', 'team2', { start_time: '09:00', end_time: '14:00' });
  const sourceWorker = workers.find((person) => person.id === 'amir');
  const rows = selectColleaguesToday({
    shifts: [shift('alina-417', ALINA, 'team2'), sourceShift],
    workers,
    currentWorkerId: ALINA,
    currentWorkerOrgId: ORG,
    today: TODAY,
  });

  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.notEqual(row, sourceShift);
  assert.notEqual(row.worker, sourceWorker);
  assert.deepEqual(Object.keys(row).sort(), ['end_time', 'id', 'start_time', 'team', 'worker', 'worker_id']);
  assert.deepEqual(Object.keys(row.worker).sort(), ['color', 'id', 'name', 'position']);
  for (const key of ['hourly_rate', 'pay', 'wage', 'notes', 'hours_approved', 'hours_approved_at', 'hours_approved_by', 'created_by', 'email', 'phone', 'teams']) {
    assert.equal(Object.hasOwn(row, key), false);
    assert.equal(Object.hasOwn(row.worker, key), false);
  }
});

test('own shifts stay isolated when the roster includes other workers’ pay', () => {
  const roster = [
    shift('alina-417', ALINA, 'team2'),
    shift('alina-other-org', ALINA, 'team2', { org_id: OTHER_ORG }),
    shift('alina-cancelled', ALINA, 'team2', { status: 'cancelled' }),
    shift('ahmed-500', AHMED, 'team1', { hourly_rate: 'ahmed-wage', pay: 9999 }),
    shift('no-org', ALINA, 'team2', { org_id: '' }),
  ];

  const own = filterOwnPortalShifts(roster, { workerId: ALINA, orgId: ORG, isAdmin: false });
  assert.deepEqual(own.map((row) => row.id), ['alina-417']);

  const withDraft = filterOwnPortalShifts([
    ...roster,
    shift('alina-draft', ALINA, 'team2', { published: false }),
  ], { workerId: ALINA, orgId: ORG, isAdmin: false });
  assert.deepEqual(withDraft.map((row) => row.id), ['alina-417']);

  const admin = filterOwnPortalShifts([
    shift('alina-draft', ALINA, 'team2', { published: false }),
    shift('ahmed-500', AHMED, 'team1'),
  ], { workerId: ALINA, orgId: ORG, isAdmin: true });
  assert.deepEqual(admin.map((row) => row.id), ['alina-draft']);

  assert.deepEqual(filterOwnPortalShifts(roster, { workerId: '', orgId: ORG }), []);
  assert.deepEqual(filterOwnPortalShifts(roster, { workerId: ALINA, orgId: '' }), []);
});

test('today’s store query reads only that worker’s shifts and no pay fields', () => {
  const query = todayOwnShiftQuery('user-alina', ORG, ALINA, TODAY);
  assert.deepEqual(query.filter, { org_id: ORG, worker_id: ALINA, date: TODAY });
  assert.equal(Object.hasOwn(query.filter, 'hourly_rate'), false);
  assert.equal(Object.hasOwn(query.filter, 'pay'), false);
  assert.deepEqual(query.queryKey, ['shifts', 'user-alina', ORG, ALINA, 'today-store', TODAY]);
  assert.notDeepEqual(query.queryKey, todayOwnShiftQuery('user-ahmed', ORG, ALINA, TODAY).queryKey);
  assert.notDeepEqual(query.queryKey, ownShiftQuery('user-alina', ORG, ALINA).queryKey);
});

test('today’s published shift picks that store when it is one of their teams', () => {
  const shifts = [
    shift('alina-417', ALINA, 'team2', { start_time: '10:00' }),
    shift('ahmed-500', AHMED, 'team1', { start_time: '08:00' }),
    shift('alina-other-org', ALINA, 'team4', { org_id: OTHER_ORG }),
  ];
  assert.equal(defaultStoreFromTodayShift(shifts, {
    workerId: ALINA,
    orgId: ORG,
    today: TODAY,
    teams: ['team4', 'team2'],
  }), 'team2');
});

test('a shift at a store they are not on does not change the default', () => {
  assert.equal(defaultStoreFromTodayShift([
    shift('alina-500', ALINA, 'team1'),
  ], {
    workerId: ALINA,
    orgId: ORG,
    today: TODAY,
    teams: ['team2'],
  }), null);
});

test('missing membership does not fall back to team1', () => {
  const atTeam1 = [shift('alina-500', ALINA, 'team1')];
  assert.equal(defaultStoreFromTodayShift(atTeam1, {
    workerId: ALINA,
    orgId: ORG,
    today: TODAY,
    teams: [],
  }), null);
  assert.equal(defaultStoreFromTodayShift(atTeam1, {
    workerId: ALINA,
    orgId: ORG,
    today: TODAY,
  }), null);
  assert.equal(defaultStoreFromTodayShift([
    shift('blank', ALINA, '   '),
    shift('missing', ALINA, null),
  ], {
    workerId: ALINA,
    orgId: ORG,
    today: TODAY,
    teams: ['team1', 'team2'],
  }), null);
});

test('cancelled, unpublished, other-day and other-worker shifts are not a default store', () => {
  const teams = ['team2', 'team1'];
  const base = { workerId: ALINA, orgId: ORG, today: TODAY, teams };
  assert.equal(defaultStoreFromTodayShift([
    shift('cancelled', ALINA, 'team2', { status: 'cancelled' }),
  ], base), null);
  assert.equal(defaultStoreFromTodayShift([
    shift('draft', ALINA, 'team2', { published: false }),
  ], base), null);
  assert.equal(defaultStoreFromTodayShift([
    shift('missing-flag', ALINA, 'team2', { published: undefined }),
  ], base), null);
  assert.equal(defaultStoreFromTodayShift([
    shift('yesterday', ALINA, 'team2', { date: '2026-11-06' }),
  ], base), null);
  assert.equal(defaultStoreFromTodayShift([
    shift('ahmed', AHMED, 'team2'),
  ], base), null);
  assert.equal(defaultStoreFromTodayShift(null, base), null);
});

test('two stores today use the earliest shift, and a missing clock time does not beat a real one', () => {
  assert.equal(defaultStoreFromTodayShift([
    shift('late', ALINA, 'team2', { start_time: '15:00' }),
    shift('early', ALINA, 'team4', { start_time: '08:00' }),
    shift('colleague-earlier', AHMED, 'team1', { start_time: '06:00' }),
  ], {
    workerId: ALINA,
    orgId: ORG,
    today: TODAY,
    teams: ['team2', 'team4'],
  }), 'team4');

  assert.equal(defaultStoreFromTodayShift([
    shift('untimed', ALINA, 'team2', { start_time: '' }),
    shift('timed', ALINA, 'team4', { start_time: '12:00' }),
  ], {
    workerId: ALINA,
    orgId: ORG,
    today: TODAY,
    teams: ['team2', 'team4'],
  }), 'team4');

  assert.equal(defaultStoreFromTodayShift([
    shift('same-a', ALINA, 'team4', { start_time: '09:00' }),
    shift('same-b', ALINA, 'team2', { start_time: '09:00' }),
  ], {
    workerId: ALINA,
    orgId: ORG,
    today: TODAY,
    teams: ['team4', 'team2'],
  }), 'team2');
});
