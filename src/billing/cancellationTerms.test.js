import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCESS_SENTENCE,
  CANCELLATION_REASONS,
  CONTACT_EMAIL,
  MANUAL_DELETION_SENTENCE,
  NOTICE_DAYS,
  RETENTION_DAYS,
  addCalendarDays,
  buildPreviewCancellation,
  cancellationErrorMessage,
  cancellationSchedule,
  canMarkDataDeleted,
  canWithdrawCancellation,
  confirmationText,
  customerFacingCopy,
  firstOfNextMonth,
  formatLongDate,
  isCancellationStorageMissing,
  offerForReason,
  offerMailto,
  openCancellation,
  osloDate,
  sortCancellations,
  validateCancellationInput,
} from './cancellationTerms.js';

test('notice starts on the 1st of the next month and lasts 30 days', () => {
  const schedule = cancellationSchedule(new Date('2026-11-04T09:00:00Z'));
  assert.equal(schedule.requestedOn, '2026-11-04');
  assert.equal(schedule.noticeStartsOn, '2026-12-01');
  assert.equal(schedule.subscriptionEndsOn, '2026-12-31');
  assert.equal(schedule.dataDeletionOn, '2027-03-01');
  assert.equal(formatLongDate(schedule.subscriptionEndsOn), '31. desember 2026');
  assert.equal(formatLongDate(schedule.dataDeletionOn), '1. mars 2027');
});

test('a request on the 1st still waits until the following month', () => {
  const schedule = cancellationSchedule(new Date('2026-12-01T08:00:00Z'));
  assert.equal(schedule.requestedOn, '2026-12-01');
  assert.equal(schedule.noticeStartsOn, '2027-01-01');
  assert.equal(schedule.subscriptionEndsOn, '2027-01-31');
  assert.equal(schedule.dataDeletionOn, '2027-04-01');
});

test('Oslo midnight decides which month the notice belongs to', () => {
  const stillNovember = cancellationSchedule(new Date('2026-11-30T22:30:00Z'));
  assert.equal(stillNovember.requestedOn, '2026-11-30');
  assert.equal(stillNovember.noticeStartsOn, '2026-12-01');

  const alreadyDecember = cancellationSchedule(new Date('2026-11-30T23:30:00Z'));
  assert.equal(alreadyDecember.requestedOn, '2026-12-01');
  assert.equal(alreadyDecember.noticeStartsOn, '2027-01-01');

  const summer = cancellationSchedule(new Date('2026-07-31T21:30:00Z'));
  assert.equal(summer.requestedOn, '2026-07-31');
  assert.equal(osloDate(new Date('2026-07-31T22:30:00Z')), '2026-08-01');
  const august = cancellationSchedule(new Date('2026-07-31T22:30:00Z'));
  assert.equal(august.noticeStartsOn, '2026-09-01');
  assert.equal(august.subscriptionEndsOn, '2026-10-01');
  assert.equal(august.dataDeletionOn, '2026-11-30');
});

test('February notice respects leap years', () => {
  assert.equal(firstOfNextMonth('2027-01-31'), '2027-02-01');
  assert.equal(addCalendarDays('2027-02-01', NOTICE_DAYS), '2027-03-03');
  assert.equal(addCalendarDays('2027-03-03', RETENTION_DAYS), '2027-05-02');
  assert.equal(addCalendarDays('2028-02-01', NOTICE_DAYS), '2028-03-02');
  assert.equal(addCalendarDays('2020-02-01', 30), '2020-03-02');
  assert.equal(addCalendarDays('2020-03-02', 60), '2020-05-01');
});

test('every reason has a finished alternative and declined is the only stored choice', () => {
  const ids = new Set();
  for (const reason of CANCELLATION_REASONS) {
    const offer = offerForReason(reason.code);
    assert.ok(offer, reason.code);
    assert.equal(ids.has(offer.id), false);
    ids.add(offer.id);
    assert.match(offer.body, /Oppsigelsen sendes ikke/);
    assert.ok(offer.stayLabel.length > 8);
    assert.match(offer.continueLabel, /oppsigelsen/i);
    const href = offerMailto(offer, 'Kiosk Eksempel AS');
    assert.match(href, new RegExp(`^mailto:${CONTACT_EMAIL}`));
    assert.match(decodeURIComponent(href), /Kiosk Eksempel AS/);
  }
  assert.equal(offerForReason('ukjent'), null);
});

test('annen grunn requires a real explanation', () => {
  assert.equal(validateCancellationInput({ reasonCode: '', reasonDetail: '' }).ok, false);
  assert.equal(validateCancellationInput({ reasonCode: 'annet', reasonDetail: 'for kort' }).ok, false);
  const ok = validateCancellationInput({ reasonCode: 'annet', reasonDetail: '  Vi stenger kiosken.  ' });
  assert.equal(ok.ok, true);
  assert.equal(ok.detail, 'Vi stenger kiosken.');
  const price = validateCancellationInput({ reasonCode: 'pris', reasonDetail: 'ignoreres' });
  assert.equal(price.detail, null);
});

test('confirmation names the end date and the deletion date', () => {
  const schedule = cancellationSchedule(new Date('2026-11-04T09:00:00Z'));
  const text = confirmationText({ organizationName: 'Kiosk Eksempel AS', schedule });
  assert.match(text, /Kiosk Eksempel AS/);
  assert.match(text, /1\. desember 2026/);
  assert.match(text, /31\. desember 2026/);
  assert.match(text, /1\. mars 2027/);
  assert.match(text, /slettes ikke automatisk/);
});

test('preview receipt uses the same dates and does not pretend to be stored', () => {
  const row = buildPreviewCancellation({
    organizationName: 'Kiosk Eksempel AS',
    requesterName: 'Kari Nordmann',
    requesterEmail: 'kari@kioskeksempel.no',
    reasonCode: 'pris',
    requestedAt: new Date('2026-11-04T09:00:00Z'),
  });
  assert.equal(row.preview, true);
  assert.equal(row.status, 'scheduled');
  assert.equal(row.offer_choice, 'declined');
  assert.equal(row.subscription_ends_on, '2026-12-31');
  assert.equal(row.data_deletion_on, '2027-03-01');
  assert.equal(row.receipt_number, 'OP-2026-01042');
  assert.equal(canWithdrawCancellation(row, new Date('2026-12-31T12:00:00Z')), true);
  assert.equal(canWithdrawCancellation(row, new Date('2027-01-01T12:00:00Z')), false);
  assert.equal(canMarkDataDeleted(row, new Date('2027-02-28T12:00:00Z')), false);
  assert.equal(canMarkDataDeleted(row, new Date('2027-03-01T12:00:00Z')), true);
});

test('customer copy is finished Norwegian', () => {
  const banned = /lorem|todo|placeholder|\[sett inn|TBD|xxx|kommer senere|lorem ipsum/i;
  for (const text of customerFacingCopy()) {
    assert.equal(banned.test(text), false, text);
    assert.ok(text.trim().length > 8);
  }
  assert.match(MANUAL_DELETION_SENTENCE, /sletter ikke data automatisk/);
  assert.match(ACCESS_SENTENCE, /ikke av seg selv/);
});

test('storage errors stay in Norwegian and do not leak the query', () => {
  assert.equal(isCancellationStorageMissing({ code: 'PGRST205', message: 'schema cache' }), true);
  assert.match(cancellationErrorMessage({ message: 'relation "public.subscription_cancellations" does not exist' }), /post@zastek\.no/);
  assert.match(cancellationErrorMessage({ message: 'Det finnes allerede en oppsigelse for denne kunden.' }), /allerede en oppsigelse/);
  assert.match(cancellationErrorMessage({ message: 'duplicate key value violates unique constraint' }), /Prøv igjen/);
});

test('open cancellation is the scheduled row, sorted ahead of closed ones', () => {
  const rows = [
    { id: 'old', status: 'withdrawn', data_deletion_on: '2026-01-01' },
    { id: 'done', status: 'data_deleted', data_deletion_on: '2026-05-01' },
    { id: 'open', status: 'scheduled', data_deletion_on: '2027-03-01' },
  ];
  assert.equal(openCancellation(rows).id, 'open');
  assert.deepEqual(sortCancellations(rows).map((row) => row.id), ['open', 'done', 'old']);
});
