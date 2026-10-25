import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHOW_DAGSOPPGJOR,
  SHOW_RESULTAT,
  defaultPageForRole,
  isPageEnabled,
  visibleNavItems,
} from './featureFlags.js';

const adminNav = [
  '/Dashboard', '/Workers', '/Timesheet', '/Ukeplan', '/Tasks', '/Salary',
  '/Resultat', '/Dagsoppgjor', '/Loddtelling', '/Innskudd', '/Contracts', '/Settings',
];
const workerNav = ['/WorkerPortal', '/Dagsoppgjor', '/Loddtelling', '/Innskudd', '/Resultat'];

test('Dagsoppgjør and Resultat stay out of every menu until the flags are turned on', () => {
  assert.equal(SHOW_DAGSOPPGJOR, false);
  assert.equal(SHOW_RESULTAT, false);
  assert.equal(isPageEnabled('/Dagsoppgjor'), false);
  assert.equal(isPageEnabled('/Resultat'), false);
  assert.equal(isPageEnabled('/Loddtelling'), true);

  const visible = visibleNavItems(adminNav.map((path) => ({ path }))).map((item) => item.path);
  assert.deepEqual(visible, adminNav.filter((path) => path !== '/Resultat' && path !== '/Dagsoppgjor'));
  const workerVisible = visibleNavItems(workerNav.map((path) => ({ path }))).map((item) => item.path);
  assert.deepEqual(workerVisible, ['/WorkerPortal', '/Loddtelling', '/Innskudd']);
});

test('turning the flags on puts both pages back in the menu', () => {
  const flags = { dagsoppgjor: true, resultat: true };
  const visible = visibleNavItems(adminNav.map((path) => ({ path })), flags).map((item) => item.path);
  assert.deepEqual(visible, adminNav);
  assert.equal(isPageEnabled('/Dagsoppgjor', flags), true);
  assert.equal(isPageEnabled('/Resultat', { dagsoppgjor: true, resultat: false }), false);
});

test('a hidden page sends each role to that role’s home', () => {
  assert.equal(defaultPageForRole('admin'), '/Dashboard');
  assert.equal(defaultPageForRole('superadmin'), '/SuperAdmin');
  assert.equal(defaultPageForRole('superadmin', { impersonating: true }), '/Dashboard');
  assert.equal(defaultPageForRole('sub_admin'), '/WorkerPortal');
  assert.equal(defaultPageForRole('butikksjef'), '/WorkerPortal');
  assert.equal(defaultPageForRole('user'), '/WorkerPortal');
});
