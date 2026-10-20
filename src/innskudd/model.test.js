import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bagTotals,
  buildInnskuddRows,
  canEditRegistration,
  effectiveKundenr,
  isNineDigitBag,
  registrationStatus,
  summarizeRows,
  teamForKundenr,
} from './model.js';
import { normalizeLoomisStatus, parseLoomisDate, parseMoney } from './loomisValues.js';
import { parseLoomisWorkbook, rowsFromSheet } from './parseLoomisExport.js';

const TODAY = '2026-10-20';

test('note counts and mynt sum to the bag total', () => {
  const totals = bagTotals({
    seddel_1000: 5,
    seddel_500: 12,
    seddel_200: 15,
    seddel_100: 9,
    mynt: 340,
  });
  assert.equal(totals.antallSedler, 41);
  assert.equal(totals.lines[0].sum, 5000);
  assert.equal(totals.lines[1].sum, 6000);
  assert.equal(totals.lines[2].sum, 3000);
  assert.equal(totals.lines[3].sum, 900);
  assert.equal(totals.mynt, 340);
  assert.equal(totals.belop, 15240);
});

test('posenummer must be 9 digits', () => {
  assert.equal(isNineDigitBag('101522502'), true);
  assert.equal(isNineDigitBag('10152250'), false);
  assert.equal(isNineDigitBag('1015225021'), false);
  assert.equal(isNineDigitBag('10152250a'), false);
});

test('status follows Loomis match, count and age', () => {
  const fresh = registrationStatus({ dato: '2026-10-16', belop: 15115 }, null, TODAY);
  assert.equal(fresh.key, 'registrert');
  assert.equal(fresh.matched, false);

  const old = registrationStatus({ dato: '2026-10-13', belop: 18440 }, null, TODAY);
  assert.equal(old.key, 'ikke_talt');
  assert.equal(old.admin, 'Ikke talt · 7 dager');

  const sent = registrationStatus(
    { dato: '2026-10-17', belop: 2800 },
    { status: 'Synkronisert', total: null },
    TODAY,
  );
  assert.equal(sent.key, 'sendt');
  assert.equal(sent.matched, true);

  const sentTooOld = registrationStatus(
    { dato: '2026-10-10', belop: 2800 },
    { status: 'Synkronisert', total: 2800 },
    TODAY,
  );
  assert.equal(sentTooOld.key, 'ikke_talt');

  const ok = registrationStatus(
    { dato: '2026-10-12', belop: 7300 },
    { status: 'Bokført', total: 7300 },
    TODAY,
  );
  assert.equal(ok.key, 'godkjent');
  assert.match(ok.employee, /7\s?300 kr/);
  assert.equal(ok.diff, 0);

  const avvik = registrationStatus(
    { dato: '2026-10-11', belop: 2760 },
    { status: 'Bokført', total: 2560 },
    TODAY,
  );
  assert.equal(avvik.key, 'avvik');
  assert.equal(avvik.diff, -200);
});

test('kundenr maps to the configured store and falls back to the known names', () => {
  const teams = [
    { key: 'team1', label: 'N.417', kundenr: '' },
    { key: 'team2', label: 'Sentrum', kundenr: '999' },
  ];
  assert.equal(effectiveKundenr(teams[0]), '20052971');
  assert.equal(effectiveKundenr(teams[1]), '999');
  assert.equal(teamForKundenr('20052971', teams).key, 'team1');
  assert.equal(teamForKundenr('999', teams).label, 'Sentrum');
  assert.equal(teamForKundenr('20057557', teams).label, 'N.586');
});

test('overview marks uncounted bags, amount gaps and Loomis-only bags', () => {
  const teams = [
    { key: 'team1', label: 'N.417', kundenr: '20052971' },
    { key: 'team2', label: 'N.586', kundenr: '20057557' },
  ];
  const rows = buildInnskuddRows({
    today: TODAY,
    periodDays: 30,
    teams,
    registrations: [
      { id: 'a', team: 'team1', posenummer: '101522489', dato: '2026-10-12', registrert_navn: 'Ali Raza', belop: 7300 },
      { id: 'b', team: 'team1', posenummer: '101522469', dato: '2026-10-11', registrert_navn: 'Ali Raza', belop: 2760 },
      { id: 'c', team: 'team2', posenummer: '101549250', dato: '2026-10-13', registrert_navn: 'Hamza Khan', belop: 18440 },
    ],
    deposits: [
      { id: 'd1', innskuddnr: '1', kundenr: '20052971', bilagsnr: '101522489', status: 'Bokført', total: 7300, telledato: '2026-10-14' },
      { id: 'd2', innskuddnr: '2', kundenr: '20052971', bilagsnr: '101522469', status: 'Bokført', total: 2560, telledato: '2026-10-12' },
      { id: 'd3', innskuddnr: '3', kundenr: '20057557', bilagsnr: '101665994', status: 'Bokført', total: 9870, telledato: '2026-10-19' },
    ],
  });
  const byPose = Object.fromEntries(rows.map((row) => [row.posenummer, row]));
  assert.equal(byPose['101522489'].status.key, 'godkjent');
  assert.equal(byPose['101522489'].diff, 0);
  assert.equal(byPose['101522469'].status.key, 'avvik');
  assert.equal(byPose['101522469'].diff, -200);
  assert.equal(byPose['101549250'].status.key, 'ikke_talt');
  assert.equal(byPose['101665994'].status.key, 'kun_loomis');
  assert.equal(byPose['101665994'].butikk, 'N.586');
  assert.equal(byPose['101665994'].diff, 9870);
  const summary = summarizeRows(rows);
  assert.equal(summary.registrert, 3);
  assert.equal(summary.godkjent, 1);
  assert.equal(summary.ikkeTalt, 1);
  assert.equal(summary.kunLoomis, 1);
});

test('a matched bag cannot be edited by the employee who registered it', () => {
  const user = { id: 'u1', workerId: 'w1', role: 'user' };
  const own = { posenummer: '101522502', ansatt_id: 'w1', created_by: 'u1' };
  assert.equal(canEditRegistration(own, [], user), true);
  assert.equal(canEditRegistration(own, [{ bilagsnr: '101522502', status: 'Synkronisert' }], user), false);
  assert.equal(canEditRegistration({ ...own, ansatt_id: 'other', created_by: 'someone' }, [], user), false);
});

test('parses Loomis export headers, Norwegian amounts and status', () => {
  assert.equal(normalizeLoomisStatus('Bokført'), 'Bokført');
  assert.equal(normalizeLoomisStatus('Synkronisert'), 'Synkronisert');
  assert.equal(parseMoney('15 240,50'), 15240.5);
  assert.equal(parseMoney('2.560'), 2560);
  assert.equal(parseMoney('2,56'), 2.56);
  assert.equal(parseLoomisDate('19.10.2026'), '2026-10-19');
  assert.equal(parseLoomisDate(45949), '2025-10-19');

  const parsed = rowsFromSheet([
    ['Rapport'],
    ['Innskuddnr', 'Batchnr', 'Referanse', 'Kundenr', 'Registrert', 'Telledato', 'Bokføringsdato', 'Total', 'Bilagsnr', 'Status'],
    ['1001', 'B9', 'ref', '20052971', '16.10.2026-18.10.2026', '19.10.2026', '20.10.2026', '7 300,00', '101522489', 'Bokført'],
    ['', 'B9', '', '', '', '', '', '', '', ''],
  ]);
  assert.equal(parsed.error, null);
  assert.equal(parsed.skipped, 1);
  assert.equal(parsed.rows.length, 1);
  assert.deepEqual(parsed.rows[0], {
    innskuddnr: '1001',
    batchnr: 'B9',
    referanse: 'ref',
    kundenr: '20052971',
    registrert: '16.10.2026-18.10.2026',
    telledato: '2026-10-19',
    bokforingsdato: '2026-10-20',
    total: 7300,
    bilagsnr: '101522489',
    status: 'Bokført',
  });
});

test('reads the same columns from an xlsx workbook', async () => {
  const XLSX = await import('xlsx');
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Innskuddnr', 'Kundenr', 'Bilagsnr', 'Total', 'Status', 'Telledato'],
    [55, '20048196', 101555869, 31292, 'Bokført', new Date(2026, 9, 12)],
  ]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Innskudd');
  const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' });
  const parsed = await parseLoomisWorkbook(bytes);
  assert.equal(parsed.error, null);
  assert.equal(parsed.rows[0].innskuddnr, '55');
  assert.equal(parsed.rows[0].kundenr, '20048196');
  assert.equal(parsed.rows[0].bilagsnr, '101555869');
  assert.equal(parsed.rows[0].total, 31292);
  assert.equal(parsed.rows[0].status, 'Bokført');
  assert.equal(parsed.rows[0].telledato, '2026-10-12');
});
