import test from 'node:test';
import assert from 'node:assert/strict';
import { buildManagerAlerts, presentAlerts, unreadCount, ageLabel, isMissingRelation } from './managerAlerts.js';

const TODAY = '2026-11-18';
const NAMES = {
  team1: 'Narvesen Demo Sentrum',
  team2: 'Narvesen Demo Bydel',
  team3: 'Narvesen Demo Stasjon',
};

const WORKERS = [
  { id: 'mia', name: 'Mia Solberg', org_id: 'demo', teams: ['team1'] },
  { id: 'jonas', name: 'Jonas Berg', org_id: 'demo', teams: ['team1'] },
  { id: 'nora', name: 'Nora Vik', org_id: 'demo', teams: ['team1'] },
  { id: 'other', name: 'Kari Annen', org_id: 'other', teams: ['team1'] },
];

function alerts(extra = {}) {
  return buildManagerAlerts({
    today: TODAY,
    orgId: 'demo',
    teams: null,
    teamNames: NAMES,
    workers: WORKERS,
    contracts: [],
    shifts: [],
    ...extra,
  });
}

test('age labels stay in Norwegian', () => {
  assert.equal(ageLabel(0), 'i dag');
  assert.equal(ageLabel(1), '1 dag');
  assert.equal(ageLabel(6), '6 dager');
});

test('unsigned contracts keep their age and a deep link', () => {
  const items = alerts({
    contracts: [
      { id: 'c1', org_id: 'demo', worker_id: 'mia', worker_name: 'Mia Solberg', status: 'sendt', sent_at: '2026-11-12' },
      { id: 'c2', org_id: 'demo', worker_id: 'jonas', worker_name: 'Jonas Berg', status: 'signert', sent_at: '2026-11-01' },
      { id: 'c3', org_id: 'demo', worker_id: 'nora', worker_name: 'Nora Vik', status: 'signert_ansatt', sent_at: '2026-11-17' },
    ],
  });
  const unsigned = items.filter((item) => item.kind === 'unsigned');
  assert.equal(unsigned.length, 2);
  assert.equal(unsigned[0].title, 'Mia Solberg: avtale er sendt, men ikke signert');
  assert.equal(unsigned[0].detail, 'Sendt 6 dager.');
  assert.equal(unsigned[0].href, '/Contracts?q=Mia+Solberg');
  assert.match(unsigned[1].title, /arbeidsgiver/);
});

test('temporary contracts expiring within 7 days are listed, later ones are not', () => {
  const items = alerts({
    contracts: [
      { id: 'soon', org_id: 'demo', worker_id: 'nora', worker_name: 'Nora Vik', status: 'signert', end_date: '2026-11-22' },
      { id: 'later', org_id: 'demo', worker_id: 'jonas', worker_name: 'Jonas Berg', status: 'signert', end_date: '2026-11-30' },
      { id: 'past', org_id: 'demo', worker_id: 'mia', worker_name: 'Mia Solberg', status: 'signert', end_date: '2026-11-17' },
      { id: 'dead', org_id: 'demo', worker_id: 'jonas', worker_name: 'Jonas Berg', status: 'trukket', end_date: '2026-11-19' },
    ],
  });
  const expiring = items.filter((item) => item.kind === 'expiring');
  assert.equal(expiring.length, 1);
  assert.match(expiring[0].title, /Nora Vik/);
  assert.match(expiring[0].title, /4 dager/);
  assert.match(expiring[0].detail, /Narvesen Demo Sentrum/);
});

test('unpublished assigned shifts in the next 14 days group per store and week', () => {
  const items = alerts({
    shifts: [
      { id: 'd1', org_id: 'demo', worker_id: 'jonas', date: '2026-11-23', team: 'team1', published: false, status: 'scheduled' },
      { id: 'd2', org_id: 'demo', worker_id: 'nora', date: '2026-11-24', team: 'team1', published: false, status: 'scheduled' },
      { id: 'd3', org_id: 'demo', worker_id: 'jonas', date: '2026-11-25', team: 'team1', published: false, status: 'scheduled' },
      { id: 'pub', org_id: 'demo', worker_id: 'jonas', date: '2026-11-23', team: 'team1', published: true, status: 'scheduled' },
      { id: 'ledig', org_id: 'demo', worker_id: 'ledig', date: '2026-11-23', team: 'team1', published: false, status: 'scheduled' },
      { id: 'far', org_id: 'demo', worker_id: 'jonas', date: '2026-12-07', team: 'team1', published: false, status: 'scheduled' },
      { id: 'cancel', org_id: 'demo', worker_id: 'jonas', date: '2026-11-23', team: 'team1', published: false, status: 'cancelled' },
    ],
  });
  const drafts = items.filter((item) => item.kind === 'draft');
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].title, 'Narvesen Demo Sentrum: 3 vakter i uke 48 er fortsatt Utkast');
  assert.equal(drafts[0].href, '/Timesheet?week=2026-11-23&team=team1');
  assert.equal(drafts[0].key, 'draft:team1:2026-11-23:3');
});

test('a store manager only sees their own stores', () => {
  const items = alerts({
    teams: ['team1'],
    contracts: [
      { id: 'c-other', org_id: 'demo', worker_id: 'b2', worker_name: 'Bydel', status: 'sendt', sent_at: '2026-11-10' },
    ],
    workers: [...WORKERS, { id: 'b2', name: 'Bydel', org_id: 'demo', teams: ['team2'] }],
    shifts: [
      { id: 't2', org_id: 'demo', worker_id: 'ledig', date: '2026-11-19', team: 'team2', published: true, status: 'scheduled' },
      { id: 't1', org_id: 'demo', worker_id: 'ledig', date: '2026-11-19', team: 'team1', published: true, status: 'scheduled' },
    ],
  });
  assert.equal(items.some((item) => item.title.includes('Bydel') && item.kind === 'unsigned'), false);
  assert.equal(items.filter((item) => item.kind === 'open').length, 1);
  assert.match(items.find((item) => item.kind === 'open').title, /Sentrum/);
});

test('open shifts in the next 7 days and pending hours stay separate from drafts', () => {
  const items = alerts({
    shifts: [
      { id: 'open1', org_id: 'demo', worker_id: 'ledig', date: '2026-11-19', team: 'team3', published: true, status: 'scheduled' },
      { id: 'open2', org_id: 'demo', worker_id: 'ledig', date: '2026-11-20', team: 'team3', published: true, status: 'scheduled' },
      { id: 'open-far', org_id: 'demo', worker_id: 'ledig', date: '2026-11-26', team: 'team3', published: true, status: 'scheduled' },
      { id: 'h1', org_id: 'demo', worker_id: 'jonas', date: '2026-11-17', team: 'team1', published: true, status: 'scheduled', hours_approved: false },
      { id: 'h2', org_id: 'demo', worker_id: 'nora', date: '2026-11-17', team: 'team1', published: true, status: 'scheduled', hours_approved: false },
      { id: 'done', org_id: 'demo', worker_id: 'jonas', date: '2026-11-16', team: 'team1', published: true, status: 'scheduled', hours_approved: true },
      { id: 'old', org_id: 'demo', worker_id: 'jonas', date: '2026-11-01', team: 'team1', published: true, status: 'scheduled', hours_approved: false },
      { id: 'future', org_id: 'demo', worker_id: 'jonas', date: '2026-11-19', team: 'team1', published: true, status: 'scheduled', hours_approved: false },
    ],
  });
  const open = items.find((item) => item.kind === 'open');
  assert.equal(open.title, 'Narvesen Demo Stasjon: 2 ledige vakter de neste 7 dagene');
  const pending = items.filter((item) => item.kind === 'hours');
  assert.equal(pending.length, 1);
  assert.match(pending[0].title, /2 vakter/);
  assert.equal(pending[0].href, '/Timesheet?week=2026-11-16&team=team1');
});

test('another organization is ignored', () => {
  const items = alerts({
    contracts: [
      { id: 'real', org_id: '6a2b315a825e7ecca4d5f246', worker_id: 'other', worker_name: 'Kari Annen', status: 'sendt', sent_at: '2026-11-01' },
    ],
    shifts: [
      { id: 'real-shift', org_id: '6a2b315a825e7ecca4d5f246', worker_id: 'other', date: '2026-11-19', team: 'team1', published: false, status: 'scheduled' },
    ],
  });
  assert.equal(items.length, 0);
});

test('read items stay visible and dismissed items leave the badge', () => {
  const built = alerts({
    contracts: [
      { id: 'c1', org_id: 'demo', worker_id: 'mia', worker_name: 'Mia Solberg', status: 'sendt', sent_at: '2026-11-18' },
    ],
    shifts: [
      { id: 'open1', org_id: 'demo', worker_id: 'ledig', date: '2026-11-19', team: 'team1', published: true, status: 'scheduled' },
    ],
  });
  const shown = presentAlerts(built, [
    { alert_key: built[0].key, read_at: '2026-11-18T10:00:00Z' },
    { alert_key: built[1].key, dismissed_at: '2026-11-18T10:00:00Z' },
  ]);
  assert.equal(shown.length, 1);
  assert.equal(shown[0].read, true);
  assert.equal(unreadCount(shown), 0);
  assert.equal(unreadCount(built), 2);
});

test('missing relation errors are recognized without treating other failures as missing', () => {
  assert.equal(isMissingRelation({ code: 'PGRST205', message: "Could not find the table 'public.alert_states' in the schema cache" }), true);
  assert.equal(isMissingRelation({ code: '42P01', message: 'relation "public.onboarding_progress" does not exist' }), true);
  assert.equal(isMissingRelation({ message: 'permission denied' }), false);
});
