import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_DRAFT_NOTE,
  HISTORY_WEEKS,
  MAX_WEEKLY_HOURS,
  OPEN_SHIFT_NOTE,
  OPEN_WORKER_ID,
  addDays,
  autoDraftIds,
  contractWeeklyHours,
  formatHours,
  isAutoDraft,
  planDraft,
  rankEmployees,
  weekdayIndex,
} from './autoSchedule.js';

const TEAM = 'team1';
const ORG = 'de30000000000000000000a1';
const OTHER = '6a2b315a825e7ecca4d5f246';
const WEEK = '2026-11-16';

function worker(id, extra = {}) {
  return {
    id,
    org_id: ORG,
    name: extra.name || id,
    status: 'active',
    teams: ['team1'],
    employment_percentage: 100,
    timer_per_uke: 37.5,
    hourly_rate: 200,
    ...extra,
  };
}

function shift(id, extra = {}) {
  return {
    id,
    org_id: ORG,
    worker_id: extra.worker_id || 'a',
    worker_name: extra.worker_name || extra.worker_id || 'a',
    date: extra.date || WEEK,
    start_time: extra.start_time || '08:00',
    end_time: extra.end_time || '16:00',
    break_minutes: extra.break_minutes ?? 30,
    shift_label: extra.shift_label ?? 'morning',
    status: extra.status || 'scheduled',
    team: extra.team || TEAM,
    published: extra.published ?? true,
    notes: extra.notes || '',
    ...extra,
  };
}

function repeatHistory({ weeks = 4, workerId = 'a', label = 'morning', start = '08:00', end = '16:00', weekdays = [0, 1, 2, 3, 4] } = {}) {
  const rows = [];
  for (let week = weeks; week >= 1; week -= 1) {
    const monday = addDays(WEEK, -7 * week);
    for (const weekday of weekdays) {
      const date = addDays(monday, weekday);
      rows.push(shift(`${workerId}-${date}-${start}`, {
        worker_id: workerId,
        date,
        start_time: start,
        end_time: end,
        shift_label: label,
        published: true,
      }));
    }
  }
  return rows;
}

test('weekday and contract hours are stable', () => {
  assert.equal(weekdayIndex('2026-11-16'), 0);
  assert.equal(weekdayIndex('2026-11-18'), 2);
  assert.equal(weekdayIndex('2026-11-22'), 6);
  assert.equal(contractWeeklyHours({ timer_per_uke: 30, employment_percentage: 100 }), 30);
  assert.equal(contractWeeklyHours({ ansettelsestype: 'tilkalling', employment_percentage: 100 }), 0);
  assert.equal(contractWeeklyHours({ employment_percentage: 50 }, 37.5), 18.75);
  assert.equal(formatHours(32), '32');
  assert.equal(formatHours(32.5), '32,5');
  assert.equal(HISTORY_WEEKS, 4);
  assert.equal(MAX_WEEKLY_HOURS, 40);
});

test('a repeated weekday pattern becomes unpublished drafts and prefers the person who worked it', () => {
  const plan = planDraft({
    orgId: ORG,
    team: TEAM,
    fromDate: WEEK,
    toDate: addDays(WEEK, 6),
    workers: [worker('a', { name: 'Ada' }), worker('b', { name: 'Bo' })],
    shifts: repeatHistory({ workerId: 'a' }),
  });

  assert.equal(plan.usedHistory, true);
  assert.equal(plan.historyWeeksUsed, 4);
  assert.equal(plan.createdCount, 5);
  assert.equal(plan.openCount, 0);
  assert.equal(plan.deleteIds.length, 0);
  assert.ok(plan.shifts.every((row) => row.published === false));
  assert.ok(plan.shifts.every((row) => row.notes === AUTO_DRAFT_NOTE));
  assert.equal(plan.shifts[0].worker_id, 'a');
  assert.equal(plan.shifts.filter((row) => row.worker_id === 'a').length, 4);
  assert.equal(plan.shifts.filter((row) => row.worker_id === 'b').length, 1);
  assert.deepEqual(plan.shifts.map((row) => row.date), [
    '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20',
  ]);
  const ada = plan.hoursByWorker.find((row) => row.workerId === 'a');
  assert.equal(ada.addedHours, 30);
  assert.equal(ada.weekHours, 30);
});

test('published shifts are kept and only the gap is filled', () => {
  const history = repeatHistory({ workerId: 'a' });
  const published = shift('kept', { date: WEEK, published: true, worker_id: 'a' });
  const plan = planDraft({
    orgId: ORG,
    team: TEAM,
    fromDate: WEEK,
    toDate: addDays(WEEK, 6),
    workers: [worker('a', { name: 'Ada' })],
    shifts: [...history, published],
  });

  assert.equal(plan.deleteIds.includes('kept'), false);
  assert.equal(plan.shifts.some((row) => row.date === WEEK), false);
  assert.equal(plan.createdCount, 4);
  assert.equal(plan.before.shiftCount, 1);
  assert.equal(plan.after.shiftCount, 5);
});

test('replace drafts deletes unpublished work drafts and never published shifts', () => {
  const history = repeatHistory({ workerId: 'a' });
  const draft = shift('draft-1', { date: WEEK, published: false, worker_id: 'b', worker_name: 'Bo' });
  const published = shift('pub-1', { date: addDays(WEEK, 1), published: true, worker_id: 'a' });
  const ferie = shift('ferie-1', {
    date: addDays(WEEK, 2),
    published: false,
    shift_label: 'ferie',
    all_day: true,
    start_time: '00:00',
    end_time: '00:00',
    worker_id: 'a',
  });
  const plan = planDraft({
    orgId: ORG,
    team: TEAM,
    fromDate: WEEK,
    toDate: addDays(WEEK, 6),
    replaceDrafts: true,
    workers: [worker('a', { name: 'Ada' }), worker('b', { name: 'Bo' })],
    shifts: [...history, draft, published, ferie],
  });

  assert.deepEqual(plan.deleteIds, ['draft-1']);
  assert.equal(plan.shifts.some((row) => row.date === WEEK), true);
  assert.equal(plan.shifts.some((row) => row.date === addDays(WEEK, 1)), false);
  assert.equal(plan.shifts.some((row) => row.worker_id === 'a' && row.date === addDays(WEEK, 2)), false);
});

test('unavailable, ferie, overlap, 40 hours and 11 hours rest stay unassigned', () => {
  const history = repeatHistory({ weeks: 4, weekdays: [0], workerId: 'a' });
  const monday = WEEK;
  const base = {
    orgId: ORG,
    team: TEAM,
    fromDate: monday,
    toDate: monday,
    shifts: history,
  };

  const unavailable = planDraft({
    ...base,
    workers: [worker('a', { name: 'Ada' })],
    availability: [{ org_id: ORG, worker_id: 'a', date: monday, status: 'unavailable' }],
  });
  assert.equal(unavailable.openCount, 1);
  assert.equal(unavailable.shifts[0].worker_id, OPEN_WORKER_ID);
  assert.equal(unavailable.shifts[0].notes, OPEN_SHIFT_NOTE);
  assert.match(unavailable.warnings.join(' '), /utilgjengelighet/);

  const away = planDraft({
    ...base,
    workers: [worker('a', { name: 'Ada' }), worker('b', { name: 'Bo' })],
    shifts: [...history, shift('ferie', {
      worker_id: 'a',
      date: monday,
      shift_label: 'ferie',
      all_day: true,
      start_time: '00:00',
      end_time: '00:00',
      published: true,
    })],
  });
  assert.equal(away.shifts[0].worker_id, 'b');

  const busy = planDraft({
    ...base,
    workers: [worker('a', { name: 'Ada' })],
    shifts: [...history, shift('other-store', {
      worker_id: 'a',
      date: monday,
      team: 'team2',
      start_time: '09:00',
      end_time: '13:00',
    })],
  });
  assert.equal(busy.openCount, 1);
  assert.match(busy.warnings.join(' '), /overlappende vakt/);

  const capped = planDraft({
    ...base,
    workers: [worker('a', { name: 'Ada' })],
    shifts: [
      ...history,
      shift('load', {
        worker_id: 'a',
        date: addDays(monday, 1),
        start_time: '08:00',
        end_time: '16:00',
        break_minutes: 0,
      }),
      shift('load-2', {
        worker_id: 'a',
        date: addDays(monday, 2),
        start_time: '06:00',
        end_time: '18:00',
        break_minutes: 0,
      }),
      shift('load-3', {
        worker_id: 'a',
        date: addDays(monday, 3),
        start_time: '06:00',
        end_time: '18:00',
        break_minutes: 0,
      }),
      shift('load-4', {
        worker_id: 'a',
        date: addDays(monday, 4),
        start_time: '08:00',
        end_time: '14:00',
        break_minutes: 0,
      }),
    ],
  });
  assert.equal(capped.openCount, 1);
  assert.match(capped.warnings.join(' '), /40-timersgrensen/);

  const tired = planDraft({
    ...base,
    workers: [worker('a', { name: 'Ada' })],
    shifts: [...history, shift('late', {
      worker_id: 'a',
      date: addDays(monday, -1),
      start_time: '14:00',
      end_time: '23:00',
      shift_label: 'evening',
    })],
  });
  assert.equal(tired.openCount, 1);
  assert.match(tired.warnings.join(' '), /hviletid/);
});

test('hours are spread when two employees are otherwise equal', () => {
  const history = [];
  for (let week = 4; week >= 1; week -= 1) {
    const monday = addDays(WEEK, -7 * week);
    for (const weekday of [0, 1, 2, 3, 4]) {
      const date = addDays(monday, weekday);
      history.push(shift(`open-${date}`, {
        worker_id: OPEN_WORKER_ID,
        worker_name: 'Ledig vakt',
        date,
        published: true,
      }));
    }
  }
  const plan = planDraft({
    orgId: ORG,
    team: TEAM,
    fromDate: WEEK,
    toDate: addDays(WEEK, 4),
    workers: [worker('b', { name: 'Bo' }), worker('a', { name: 'Ada' })],
    shifts: history,
  });
  const counts = {};
  for (const row of plan.shifts) counts[row.worker_id] = (counts[row.worker_id] || 0) + 1;
  assert.equal(plan.openCount, 0);
  assert.equal(counts.a, 3);
  assert.equal(counts.b, 2);
  assert.ok(Math.abs(counts.a - counts.b) <= 1);
});

test('another store, another customer and a one-off shift do not create demand', () => {
  const shifts = [
    ...repeatHistory({ workerId: 'a', weekdays: [0] }),
    shift('once', { worker_id: 'a', date: '2026-11-11', shift_label: 'evening', start_time: '16:00', end_time: '22:00' }),
    shift('other-team', { worker_id: 'c', team: 'team2', date: '2026-11-09' }),
    shift('other-org', { id: 'foreign', org_id: OTHER, worker_id: 'z', date: '2026-11-09', team: TEAM }),
  ];
  const plan = planDraft({
    orgId: ORG,
    team: TEAM,
    fromDate: WEEK,
    toDate: addDays(WEEK, 6),
    workers: [worker('a', { name: 'Ada' }), worker('z', { org_id: OTHER, name: 'Zara', teams: [TEAM] })],
    shifts,
  });
  assert.equal(plan.createdCount, 1);
  assert.equal(plan.shifts[0].date, WEEK);
  assert.equal(plan.shifts[0].worker_id, 'a');
  assert.equal(plan.shifts[0].org_id, ORG);
});

test('prognose fills an empty week and leaves a locked day alone', () => {
  const budgetByHourDay = {};
  for (let hour = 8; hour < 16; hour += 1) {
    budgetByHourDay[hour] = { mon: 1, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };
  }
  const plan = planDraft({
    orgId: ORG,
    team: TEAM,
    fromDate: WEEK,
    toDate: addDays(WEEK, 2),
    workers: [worker('a', { name: 'Ada' })],
    shifts: [],
    budgetByHourDay,
    lockedDates: [addDays(WEEK, 1)],
  });
  assert.equal(plan.usedBudget, true);
  assert.equal(plan.usedHistory, false);
  assert.equal(plan.createdCount, 1);
  assert.equal(plan.shifts[0].date, WEEK);
  assert.equal(plan.shifts[0].start_time, '08:00');
  assert.equal(plan.shifts[0].end_time, '16:00');
  assert.match(plan.warnings.join(' '), /låst lønnsperiode/);
  assert.match(plan.warnings.join(' '), /prognosen/);
  assert.ok(plan.wage.plannedCost > 0);
  assert.ok(plan.wage.budgetCost > 0);
});

test('the same input plans the same drafts', () => {
  const input = {
    orgId: ORG,
    team: TEAM,
    fromDate: WEEK,
    toDate: addDays(WEEK, 6),
    workers: [worker('a', { name: 'Ada' }), worker('b', { name: 'Bo', timer_per_uke: 20 })],
    shifts: repeatHistory({ workerId: 'b', label: 'evening', start: '15:00', end: '21:00' }),
    availability: [{ org_id: ORG, worker_id: 'b', date: WEEK, status: 'available' }],
  };
  assert.deepEqual(planDraft(input), planDraft(input));
});

test('suggestions rank history and hours, and warn without hiding the person', () => {
  const history = [];
  for (let week = 4; week >= 1; week -= 1) {
    const monday = addDays(WEEK, -7 * week);
    for (let n = 0; n < 2; n += 1) {
      history.push(shift(`eve-${week}-${n}`, {
        worker_id: 'kari',
        date: addDays(monday, n),
        start_time: '15:00',
        end_time: '21:00',
        shift_label: 'evening',
        break_minutes: 0,
      }));
    }
  }
  history.push(shift('kari-week', {
    worker_id: 'kari',
    date: addDays(WEEK, 1),
    start_time: '15:00',
    end_time: '23:00',
    shift_label: 'evening',
    break_minutes: 0,
  }));
  const ranked = rankEmployees({
    orgId: ORG,
    team: TEAM,
    workers: [
      worker('kari', { name: 'Kari' }),
      worker('noah', { name: 'Noah', timer_per_uke: 37.5 }),
      worker('else', { name: 'Else', teams: ['team2'] }),
    ],
    shifts: [
      ...history,
      shift('noah-day', { worker_id: 'noah', date: WEEK, start_time: '00:00', end_time: '05:00', shift_label: 'morning', break_minutes: 0 }),
    ],
    candidate: {
      date: WEEK,
      start_time: '16:00',
      end_time: '22:00',
      shift_label: 'evening',
      break_minutes: 0,
      team: TEAM,
    },
  });

  assert.equal(ranked.suggestions[0].workerId, 'kari');
  assert.match(ranked.suggestions[0].reasons.join(' '), /Har jobbet 8 kveldsvakter siste 4 uker/);
  assert.match(ranked.suggestions[0].reasons.join(' '), /8 t denne uka/);
  assert.equal(ranked.suggestions.some((row) => row.workerId === 'else'), false);
  assert.ok(ranked.byWorkerId.noah.warnings.some((text) => text.includes('allerede en vakt')));
  assert.equal(ranked.byWorkerId.noah.blocked, false);

  const clash = rankEmployees({
    orgId: ORG,
    team: TEAM,
    workers: [worker('noah', { name: 'Noah' })],
    shifts: [shift('noah-day', { worker_id: 'noah', date: WEEK, start_time: '08:00', end_time: '16:00' })],
    candidate: { date: WEEK, start_time: '12:00', end_time: '20:00', shift_label: 'middle', team: TEAM },
  });
  assert.equal(clash.suggestions.length, 0);
  assert.ok(clash.byWorkerId.noah.warnings.some((text) => text.includes('overlapper')));

  const longWeek = [];
  for (let day = 0; day < 4; day += 1) {
    longWeek.push(shift(`full-${day}`, {
      worker_id: 'noah',
      date: addDays(WEEK, day),
      start_time: '08:00',
      end_time: '18:00',
      break_minutes: 0,
    }));
  }
  const over = rankEmployees({
    orgId: ORG,
    team: TEAM,
    workers: [worker('noah', { name: 'Noah' })],
    shifts: longWeek,
    candidate: { date: addDays(WEEK, 4), start_time: '08:00', end_time: '16:00', shift_label: 'morning', team: TEAM, break_minutes: 0 },
  });
  assert.equal(over.suggestions.length, 0);
  assert.ok(over.byWorkerId.noah.warnings.some((text) => text.includes('over 40 t')));

  const early = rankEmployees({
    orgId: ORG,
    team: TEAM,
    workers: [worker('noah', { name: 'Noah' })],
    shifts: [shift('late', { worker_id: 'noah', date: addDays(WEEK, -1), start_time: '14:00', end_time: '23:00', shift_label: 'evening' })],
    candidate: { date: WEEK, start_time: '07:00', end_time: '15:00', shift_label: 'morning', team: TEAM },
  });
  assert.equal(early.suggestions.length, 0);
  assert.ok(early.byWorkerId.noah.warnings.some((text) => text.includes('hvile')));
});

test('auto drafts can be found again without touching published shifts', () => {
  const rows = [
    shift('auto', { published: false, notes: AUTO_DRAFT_NOTE, date: WEEK }),
    shift('open', { published: false, notes: OPEN_SHIFT_NOTE, worker_id: OPEN_WORKER_ID, date: addDays(WEEK, 1) }),
    shift('edited', { published: false, notes: 'Vanlig utkast', date: WEEK }),
    shift('live', { published: true, notes: AUTO_DRAFT_NOTE, date: WEEK }),
    shift('other', { published: false, notes: AUTO_DRAFT_NOTE, team: 'team2', date: WEEK }),
    shift('foreign', { published: false, notes: AUTO_DRAFT_NOTE, org_id: OTHER, date: WEEK }),
  ];
  assert.equal(isAutoDraft(rows[0]), true);
  assert.equal(isAutoDraft(rows[2]), false);
  assert.equal(isAutoDraft(rows[3]), false);
  assert.deepEqual(autoDraftIds(rows, { team: TEAM, fromDate: WEEK, toDate: addDays(WEEK, 6), orgId: ORG }), ['auto', 'open']);
});
