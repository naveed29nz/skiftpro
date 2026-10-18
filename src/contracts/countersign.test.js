import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTRACTS_PATH,
  COUNTERSIGN_TOAST,
  countersignerIdentity,
  employerCountersignDestination,
  employerShowsSigningForm,
  freshSigningStatus,
  isFullySignedStatus,
} from './countersign.js';

test('employer countersign returns to the contract list with the success toast', () => {
  assert.deepEqual(employerCountersignDestination('arbeidsgiver', 'signert'), {
    path: CONTRACTS_PATH,
    toast: COUNTERSIGN_TOAST,
  });
  assert.equal(COUNTERSIGN_TOAST, 'Avtalen er signert av begge parter');
  assert.equal(CONTRACTS_PATH, '/Contracts');
});

test('a refreshed status replaces the form the page was showing', () => {
  assert.equal(freshSigningStatus({ documentStatus: 'signert', contractStatus: 'signert_ansatt' }), 'signert');
  assert.equal(freshSigningStatus({ contractStatus: 'apnet' }), 'apnet');
  assert.equal(isFullySignedStatus('signert'), true);
  assert.equal(isFullySignedStatus('godkjent'), true);
  assert.equal(isFullySignedStatus('signert_ansatt'), false);
  assert.equal(employerShowsSigningForm('signert_ansatt'), true);
  assert.equal(employerShowsSigningForm('signert'), false);
  assert.equal(employerShowsSigningForm('apnet'), false);
  assert.equal(employerShowsSigningForm('sendt'), false);
});

test('employee signing and an unfinished employer signature stay on the page', () => {
  assert.equal(employerCountersignDestination('ansatt', 'signert_ansatt'), null);
  assert.equal(employerCountersignDestination('ansatt', 'signert'), null);
  assert.equal(employerCountersignDestination('arbeidsgiver', 'signert_ansatt'), null);
});

test('certificate identity prefers the stored event and falls back to the user id', () => {
  const fromEvent = countersignerIdentity({
    document: {},
    contract: {},
    events: [
      { event_type: 'signert', actor_id: 'guest:worker' },
      {
        event_type: 'motsignert',
        actor_id: 'admin-1',
        payload: { user_id: 'admin-1', name: 'Naveed Zafar', email: 'admin-a@example.com' },
      },
    ],
  });
  assert.deepEqual(fromEvent, {
    name: 'Naveed Zafar',
    email: 'admin-a@example.com',
    userId: 'admin-1',
    signedAt: null,
  });

  const fromContract = countersignerIdentity({
    document: {
      employer_signed_name: 'Admin A',
      employer_signed_email: 'admin-a@example.com',
      employer_signed_by: '11111111-1111-1111-1111-111111111111',
      employer_signed_at: '2026-10-16T22:24:37.092Z',
    },
    contract: { employer_signed_by: 'stale' },
    events: [{ event_type: 'motsignert', actor_id: 'stale', payload: {} }],
  });
  assert.equal(fromContract.name, 'Admin A');
  assert.equal(fromContract.email, 'admin-a@example.com');
  assert.equal(fromContract.userId, '11111111-1111-1111-1111-111111111111');
  assert.equal(fromContract.signedAt, '2026-10-16T22:24:37.092Z');
});
