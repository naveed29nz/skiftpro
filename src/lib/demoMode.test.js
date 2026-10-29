import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_TARGETS } from '../../supabase/functions/_shared/demoPolicy.js';
import {
  activeDemoRole,
  demoHomePath,
  demoRoles,
  shouldShowDemoBar,
  switchDemoRole,
} from './demoMode.js';

const ORG = 'de30000000000000000000a1';

test('the demo bar is only for the Narvesen demo org or the reserved demo domain', () => {
  for (const role of demoRoles()) {
    assert.equal(shouldShowDemoBar({ email: role.email, orgId: null }), true);
    assert.equal(shouldShowDemoBar({ email: role.email.toUpperCase(), orgId: 'other' }), true);
  }
  assert.equal(shouldShowDemoBar({ email: 'post@narvesen.no', orgId: ORG }), true);
  assert.equal(shouldShowDemoBar({ email: 'post@narvesen.no', orgId: ` ${ORG} ` }), true);
  assert.equal(shouldShowDemoBar({ email: 'post@narvesen.no', orgId: 'other-org' }), false);
  assert.equal(shouldShowDemoBar({ email: 'demo.admin@demo.skiftpro.invalid.evil.com', orgId: '' }), false);
  assert.equal(shouldShowDemoBar({ email: 'demo.admin@evil.demo.skiftpro.invalid', orgId: '' }), false);
  assert.equal(shouldShowDemoBar({ email: '', orgId: '' }), false);
  assert.equal(shouldShowDemoBar(), false);
  assert.equal(shouldShowDemoBar({ email: 'dev@skiftpro.com', orgId: ORG, impersonating: true }), false);
  assert.equal(shouldShowDemoBar({
    email: 'demo.admin@demo.skiftpro.invalid',
    orgId: ORG,
    impersonating: true,
  }), false);
});

test('each demo role has a short Norwegian access label and the pinned account', () => {
  const roles = demoRoles();
  assert.deepEqual(roles.map((role) => role.key), ['admin', 'sub_admin', 'butikksjef', 'ansatt', 'ekstrahjelp']);
  assert.deepEqual(roles.map((role) => role.label), ['Admin', 'Regionsleder', 'Butikksjef', 'Ansatt', 'Ekstrahjelp']);
  for (const role of roles) {
    assert.equal(role.email, DEMO_TARGETS[role.key].email);
    assert.equal(role.userId, DEMO_TARGETS[role.key].userId);
    assert.match(role.access, /[a-zæøå]/i);
    assert.ok(role.access.length < 120);
  }
  assert.equal(activeDemoRole('demo.ansatt@demo.skiftpro.invalid')?.label, 'Ansatt');
  assert.equal(activeDemoRole('demo.ekstrahjelp@demo.skiftpro.invalid')?.label, 'Ekstrahjelp');
  assert.equal(activeDemoRole('post@narvesen.no'), null);
});

test('a role switch lands admin on Oversikt and everyone else on Min side', () => {
  assert.equal(demoHomePath('admin'), '/Dashboard');
  assert.equal(demoHomePath('sub_admin'), '/WorkerPortal');
  assert.equal(demoHomePath('butikksjef'), '/WorkerPortal');
  assert.equal(demoHomePath('ansatt'), '/WorkerPortal');
  assert.equal(demoHomePath('ekstrahjelp'), '/WorkerPortal');
});

test('switchDemoRole stores only the pinned demo session and opens that role home', async () => {
  const role = demoRoles().find((item) => item.key === 'butikksjef');
  const calls = [];
  await switchDemoRole('butikksjef', {
    invoke(name, body) {
      calls.push(['invoke', name, body]);
      return {
        data: {
          access_token: 'access',
          refresh_token: 'refresh',
          user: { id: role.userId, email: role.email },
        },
      };
    },
    setSession(tokens) {
      calls.push(['session', tokens]);
      return { error: null };
    },
    clearPassword() {
      calls.push(['clear-password']);
    },
    reload(path) {
      calls.push(['reload', path]);
    },
  });
  assert.deepEqual(calls, [
    ['invoke', 'demo-switch', { target: 'butikksjef' }],
    ['clear-password'],
    ['session', { access_token: 'access', refresh_token: 'refresh' }],
    ['reload', '/WorkerPortal'],
  ]);
});

test('switchDemoRole refuses a session for anyone except the requested demo user', async () => {
  const setSession = () => {
    throw new Error('session must not be stored');
  };
  await assert.rejects(
    () => switchDemoRole('ansatt', {
      invoke: async () => ({
        data: {
          access_token: 'access',
          refresh_token: 'refresh',
          user: { id: 'real-user', email: 'sara@narvesen.no' },
        },
      }),
      setSession,
    }),
    /feil bruker/,
  );
  await assert.rejects(
    () => switchDemoRole('no-such-role', { invoke: async () => ({}), setSession }),
    /Ukjent demorolle/,
  );
});
