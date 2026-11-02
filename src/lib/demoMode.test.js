import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_TARGETS } from '../../supabase/functions/_shared/demoPolicy.js';
import {
  SUPERADMIN_RETURN_KEY,
  readSuperadminReturn,
  returnToSuperadmin,
  saveSuperadminReturn,
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
  assert.equal(shouldShowDemoBar({ email: 'dev@skiftpro.com', orgId: ORG, impersonating: true }), true);
  assert.equal(shouldShowDemoBar({ email: 'dev@skiftpro.com', orgId: 'other-org', impersonating: true }), false);
  assert.equal(shouldShowDemoBar({ email: 'dev@skiftpro.com', orgId: '6a2b315a825e7ecca4d5f246', impersonating: true }), false);
  assert.equal(shouldShowDemoBar({
    email: 'demo.admin@demo.skiftpro.invalid',
    orgId: ORG,
    impersonating: true,
  }), true);
  assert.equal(shouldShowDemoBar({
    email: 'demo.admin@demo.skiftpro.invalid',
    orgId: 'other-org',
    impersonating: true,
  }), false);
});

test('each demo role has a short Norwegian access label and the pinned account', () => {
  const roles = demoRoles();
  assert.deepEqual(roles.map((role) => role.key), ['admin', 'butikksjef', 'ansatt', 'ekstrahjelp']);
  assert.deepEqual(roles.map((role) => role.label), ['Admin', 'Butikksjef', 'Ansatt', 'Ekstrahjelp']);
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

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

test('superadmin session is parked and restored into demo support mode', async () => {
  const st = memStorage();
  const sa = { access_token: 'a', refresh_token: 'r', user: { email: 'Dev@SkiftPro.com' } };
  assert.equal(saveSuperadminReturn(st, sa), true);
  assert.equal(readSuperadminReturn(st).email, 'dev@skiftpro.com');
  const calls = [];
  await returnToSuperadmin({
    storage: st,
    setSession: async (t) => { calls.push(t); return { data: { user: { email: 'dev@skiftpro.com' } }, error: null }; },
    reload: (p) => calls.push(p),
  });
  assert.deepEqual(calls, [{ access_token: 'a', refresh_token: 'r' }, '/Dashboard']);
  assert.equal(st.getItem(SUPERADMIN_RETURN_KEY), null);
  assert.equal(st.getItem('impersonate_org_id'), ORG);
});

test('demo accounts are never parked, and an expired return goes to login', async () => {
  const st = memStorage();
  assert.equal(saveSuperadminReturn(st, { access_token: 'a', refresh_token: 'r', user: { email: 'demo.admin@demo.skiftpro.invalid' } }), false);
  assert.equal(readSuperadminReturn(st), null);
  saveSuperadminReturn(st, { access_token: 'a', refresh_token: 'r', user: { email: 'dev@skiftpro.com' } });
  let out = null; let signedOut = false;
  await assert.rejects(returnToSuperadmin({
    storage: st,
    setSession: async () => ({ data: null, error: new Error('expired') }),
    signOut: async () => { signedOut = true; },
    reload: (p) => { out = p; },
  }));
  assert.equal(signedOut, true);
  assert.equal(out, '/login');
  assert.equal(st.getItem('impersonate_org_id'), null);
  assert.equal(st.getItem(SUPERADMIN_RETURN_KEY), null);
});
