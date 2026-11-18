import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checklistItems,
  checklistProgress,
  shouldShowChecklist,
  statusFromOverview,
} from './onboardingChecklist.js';

const worker = {
  id: 'mia',
  name: 'Mia Solberg',
  phone: '',
  address: '  ',
  ansettelsestype: 'midlertidig_vikar',
};

test('a new employee sees profile, contract, notifications and availability', () => {
  const items = checklistItems({
    worker,
    contracts: [{ id: 'c1', worker_id: 'mia', status: 'sendt' }],
    availabilityCount: 0,
    notificationsOn: false,
  });
  assert.deepEqual(items.map((item) => item.id), ['profile', 'contract', 'notifications', 'availability']);
  assert.equal(items.every((item) => item.done), false);
  assert.equal(items[0].detail.includes('Kontonummer'), true);
  assert.equal(items[1].href, '/kontrakt/c1');
  assert.equal(checklistProgress(items).done, 0);
  assert.equal(shouldShowChecklist({ items, dismissed: false }), true);
});

test('phone and address complete the profile, and a signed contract is not pending', () => {
  const items = checklistItems({
    worker: { ...worker, phone: '400 00 001', address: 'Karl Johans gate 1, 0154 Oslo' },
    contracts: [
      { id: 'c1', worker_id: 'mia', status: 'signert' },
      { id: 'other', worker_id: 'jonas', status: 'sendt' },
    ],
    availabilityCount: 2,
    notificationsOn: true,
  });
  assert.equal(checklistProgress(items).complete, true);
  assert.equal(shouldShowChecklist({ items, dismissed: false }), false);
});

test('a dismissed checklist stays hidden even when items are open', () => {
  const items = checklistItems({ worker, contracts: [], availabilityCount: 0, notificationsOn: false });
  assert.equal(shouldShowChecklist({ items, dismissed: true }), false);
});

test('ekstrahjelp is not asked to register availability', () => {
  const items = checklistItems({
    worker: { ...worker, ansettelsestype: 'tilkalling', phone: '400', address: 'Gate 1' },
    contracts: [],
    availabilityCount: 0,
    notificationsOn: false,
  });
  assert.deepEqual(items.map((item) => item.id), ['profile', 'contract', 'notifications']);
  assert.equal(items.find((item) => item.id === 'profile').done, true);
});

test('an opened contract still counts as unsigned', () => {
  const items = checklistItems({
    worker: { ...worker, phone: '1', address: 'Gate' },
    contracts: [{ id: 'c9', worker_id: 'mia', status: 'apnet' }],
    availabilityCount: 1,
    notificationsOn: true,
  });
  assert.equal(items.find((item) => item.id === 'contract').done, false);
});

test('a store manager sees per-employee progress without contact details', () => {
  const status = statusFromOverview({
    has_phone: false,
    has_address: true,
    pending_contracts: 1,
    has_availability: false,
    notifications_done: false,
    dismissed: true,
  }, worker);
  assert.equal(status.done, 0);
  assert.equal(status.total, 4);
  assert.deepEqual(status.missing, ['Profil', 'Avtale', 'Varsler', 'Tilgjengelighet']);
  assert.equal(status.dismissed, true);
  assert.equal(JSON.stringify(status).includes('400'), false);
});

test('ekstrahjelp status skips availability', () => {
  const status = statusFromOverview({
    has_phone: true,
    has_address: true,
    pending_contracts: 0,
    has_availability: false,
    notifications_done: true,
  }, { ansettelsestype: 'tilkalling' });
  assert.equal(status.done, 3);
  assert.equal(status.total, 3);
  assert.equal(status.missing.length, 0);
});
