import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMO_ORG_ID,
  DEMO_TARGETS,
  callerMaySwitch,
  isDemoEmail,
  targetMaySignIn,
} from '../../supabase/functions/_shared/demoPolicy.js';
import {
  exchangeDemoSession,
  handleDemoSwitch,
} from '../../supabase/functions/_shared/demoSwitch.js';

const OTHER_ORG = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function memoryDb(state) {
  function match(table, filters) {
    return (state.rows[table] || []).filter((row) => filters.every(([column, value, op]) => {
      const cell = row[column];
      if (op === 'eq') return cell === value;
      const pattern = String(value).replace(/\\([\\%_])/g, '$1');
      return String(cell || '').toLowerCase() === pattern.toLowerCase();
    }));
  }

  function query(table) {
    const filters = [];
    const api = {
      select() { return api; },
      eq(column, value) { filters.push([column, value, 'eq']); return api; },
      ilike(column, value) { filters.push([column, value, 'ilike']); return api; },
      maybeSingle() {
        const rows = match(table, filters);
        return Promise.resolve({ data: rows[0] || null, error: null });
      },
      then(resolve, reject) {
        return Promise.resolve({ data: match(table, filters), error: null }).then(resolve, reject);
      },
    };
    return api;
  }

  return {
    from: query,
    auth: {
      admin: {
        getUserById: (id) => state.getUserById(id),
        generateLink: (args) => state.generateLink(args),
      },
    },
  };
}

function demoState(overrides = {}) {
  const calls = [];
  const users = Object.fromEntries(Object.values(DEMO_TARGETS).map((account) => [
    account.userId,
    { id: account.userId, email: account.email },
  ]));
  const rows = {
    profiles: Object.values(DEMO_TARGETS).map((account) => ({ id: account.userId, email: account.email })),
    organizations: [
      { id: DEMO_ORG_ID, admin_user_id: DEMO_TARGETS.admin.userId, admin_email: DEMO_TARGETS.admin.email },
      { id: OTHER_ORG, admin_user_id: 'customer-admin', admin_email: 'admin@kunde.no' },
    ],
    workers: [
      { org_id: DEMO_ORG_ID, email: DEMO_TARGETS.sub_admin.email },
      { org_id: DEMO_ORG_ID, email: DEMO_TARGETS.butikksjef.email },
      { org_id: DEMO_ORG_ID, email: DEMO_TARGETS.ansatt.email },
      { org_id: DEMO_ORG_ID, email: DEMO_TARGETS.ekstrahjelp.email },
    ],
  };
  const state = {
    rows,
    users,
    calls,
    sessionUser: null,
    failGenerate: false,
    getUserById(id) {
      calls.push(['getUser', id]);
      const user = users[id] || null;
      return Promise.resolve({ data: { user }, error: user ? null : { message: 'missing' } });
    },
    generateLink(args) {
      calls.push(['generateLink', args]);
      state.lastEmail = args.email;
      if (state.failGenerate) return Promise.resolve({ data: null, error: { message: 'otp-secret-should-not-leak' } });
      return Promise.resolve({
        data: {
          properties: {
            action_link: 'https://example.supabase.co/auth/v1/verify?token=secret-link',
            email_otp: '123456',
            hashed_token: 'hashed-secret',
            verification_type: 'magiclink',
          },
        },
        error: null,
      });
    },
    ...overrides,
  };
  const db = memoryDb(state);
  const anon = {
    auth: {
      verifyOtp(args) {
        calls.push(['verifyOtp', args]);
        const user = state.sessionUser || Object.values(users).find((item) => item.email === (args.email || state.lastEmail));
        if (!user) return Promise.resolve({ data: { session: null }, error: { message: 'no session' } });
        return Promise.resolve({
          data: {
            session: {
              access_token: 'access-token',
              refresh_token: 'refresh-token',
              expires_in: 3600,
              token_type: 'bearer',
              user,
            },
            user,
          },
          error: null,
        });
      },
    },
  };
  return { state, db, anon, calls };
}

async function post(body, user) {
  const dbBundle = demoState();
  const deps = {
    handleOptions() { return null; },
    json,
    requireUser() {
      return user || null;
    },
    adminClient() { return dbBundle.db; },
    anonClient() { return dbBundle.anon; },
  };
  if (user === 'unauthorized') {
    deps.requireUser = () => json({ error: 'Unauthorized' }, 401);
  }
  const response = await handleDemoSwitch(new Request('https://example.test/demo-switch', {
    method: 'POST',
    body: JSON.stringify(body),
  }), deps);
  return { calls: dbBundle.calls, state: dbBundle.state, response };
}

test('demo email domain is exact and the five accounts are pinned to it', () => {
  assert.equal(isDemoEmail('demo.admin@demo.skiftpro.invalid'), true);
  assert.equal(isDemoEmail('  Demo.Ansatt@DEMO.skiftpro.invalid '), true);
  assert.equal(isDemoEmail('person@narvesen.no'), false);
  assert.equal(isDemoEmail('person@demo.skiftpro.invalid.evil.com'), false);
  assert.equal(isDemoEmail('person@evil.demo.skiftpro.invalid'), false);
  assert.equal(isDemoEmail('@demo.skiftpro.invalid'), false);
  assert.equal(isDemoEmail('demo.skiftpro.invalid'), false);
  for (const account of Object.values(DEMO_TARGETS)) {
    assert.equal(isDemoEmail(account.email), true);
  }
});

test('a caller must be in the demo org or be a platform superadmin, and the target must be both', () => {
  assert.equal(callerMaySwitch({ isSuperAdmin: false, orgIds: [DEMO_ORG_ID] }), true);
  assert.equal(callerMaySwitch({ isSuperAdmin: true, orgIds: [] }), true);
  assert.equal(callerMaySwitch({ isSuperAdmin: false, orgIds: [OTHER_ORG] }), false);
  assert.equal(callerMaySwitch({ isSuperAdmin: false, orgIds: [`${DEMO_ORG_ID}-extra`] }), false);

  const ansatt = DEMO_TARGETS.ansatt;
  assert.equal(targetMaySignIn({ email: ansatt.email, userId: ansatt.userId, orgIds: [DEMO_ORG_ID] }), true);
  assert.equal(targetMaySignIn({ email: ansatt.email, userId: ansatt.userId, orgIds: [OTHER_ORG] }), false);
  assert.equal(targetMaySignIn({ email: 'sara@narvesen.no', userId: ansatt.userId, orgIds: [DEMO_ORG_ID] }), false);
  assert.equal(targetMaySignIn({ email: ansatt.email, userId: DEMO_TARGETS.admin.userId, orgIds: [DEMO_ORG_ID] }), false);
  assert.equal(targetMaySignIn({
    email: 'ny@demo.skiftpro.invalid',
    userId: '11111111-1111-1111-1111-111111111111',
    orgIds: [DEMO_ORG_ID],
  }), false);
});

test('demo-switch rejects missing auth, unknown roles, and other customers', async () => {
  const missing = await post({}, 'unauthorized');
  assert.equal(missing.response.status, 401);

  const unknown = await post({ target: 'superadmin', email: 'ceo@narvesen.no' }, {
    user: { id: DEMO_TARGETS.ansatt.userId, email: DEMO_TARGETS.ansatt.email },
    profile: { id: DEMO_TARGETS.ansatt.userId, email: DEMO_TARGETS.ansatt.email, role: 'user' },
  });
  assert.equal(unknown.response.status, 400);
  assert.equal(unknown.calls.some((call) => call[0] === 'generateLink'), false);

  const outsider = await post({ target: 'admin' }, {
    user: { id: 'customer-admin', email: 'admin@kunde.no' },
    profile: { id: 'customer-admin', email: 'admin@kunde.no', role: 'admin' },
  });
  assert.equal(outsider.response.status, 403);
  assert.equal(outsider.calls.some((call) => call[0] === 'generateLink'), false);
});

test('a demo employee can switch role and receives a session, never a magic link', async () => {
  const { response, calls } = await post({ target: 'butikksjef', email: 'ceo@narvesen.no' }, {
    user: { id: DEMO_TARGETS.ansatt.userId, email: DEMO_TARGETS.ansatt.email },
    profile: { role: 'user', email: DEMO_TARGETS.ansatt.email },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, {
    ok: true,
    target: 'butikksjef',
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: DEMO_TARGETS.butikksjef.userId,
      email: DEMO_TARGETS.butikksjef.email,
    },
  });
  assert.equal(JSON.stringify(body).includes('hashed-secret'), false);
  assert.equal(JSON.stringify(body).includes('secret-link'), false);
  assert.equal(JSON.stringify(body).includes('123456'), false);
  assert.deepEqual(calls.filter((call) => call[0] === 'generateLink'), [[
    'generateLink',
    { type: 'magiclink', email: DEMO_TARGETS.butikksjef.email },
  ]]);
  assert.deepEqual(calls.filter((call) => call[0] === 'verifyOtp'), [[
    'verifyOtp',
    { token_hash: 'hashed-secret', type: 'magiclink' },
  ]]);
});

test('superadmin may switch, but never into an account outside the demo org', async () => {
  const allowed = await post({ target: 'ekstrahjelp' }, {
    user: { id: 'platform-admin', email: 'dev@skiftpro.com' },
    profile: { role: 'admin', email: 'dev@skiftpro.com' },
  });
  assert.equal(allowed.response.status, 200);

  const bundle = demoState();
  bundle.state.rows.workers = bundle.state.rows.workers.filter((row) => row.email !== DEMO_TARGETS.ansatt.email);
  const denied = await handleDemoSwitch(new Request('https://example.test/demo-switch', {
    method: 'POST',
    body: JSON.stringify({ target: 'ansatt' }),
  }), {
    handleOptions() { return null; },
    json,
    requireUser() {
      return {
        user: { id: 'platform-admin', email: 'dev@skiftpro.com' },
        profile: { role: 'admin', email: 'dev@skiftpro.com' },
      };
    },
    adminClient() { return bundle.db; },
    anonClient() { return bundle.anon; },
  });
  assert.equal(denied.status, 403);
  assert.equal(bundle.calls.some((call) => call[0] === 'generateLink'), false);
});

test('a changed demo email or a foreign session is not signed in', async () => {
  const renamed = demoState();
  renamed.state.users[DEMO_TARGETS.admin.userId] = { id: DEMO_TARGETS.admin.userId, email: 'admin@narvesen.no' };
  renamed.state.rows.profiles = renamed.state.rows.profiles.map((row) => (
    row.id === DEMO_TARGETS.admin.userId ? { ...row, email: 'admin@narvesen.no' } : row
  ));
  const response = await handleDemoSwitch(new Request('https://example.test/demo-switch', {
    method: 'POST',
    body: JSON.stringify({ target: 'admin' }),
  }), {
    handleOptions() { return null; },
    json,
    requireUser() {
      return {
        user: { id: DEMO_TARGETS.butikksjef.userId, email: DEMO_TARGETS.butikksjef.email },
        profile: { role: 'butikksjef' },
      };
    },
    adminClient() { return renamed.db; },
    anonClient() { return renamed.anon; },
  });
  assert.equal(response.status, 403);
  assert.equal(renamed.calls.some((call) => call[0] === 'generateLink'), false);

  const swapped = await exchangeDemoSession(renamed.db, {
    auth: {
      verifyOtp() {
        return Promise.resolve({
          data: {
            session: {
              access_token: 'stolen',
              refresh_token: 'stolen',
              user: { id: 'real-user', email: 'ceo@narvesen.no' },
            },
          },
          error: null,
        });
      },
    },
  }, DEMO_TARGETS.butikksjef.email);
  assert.equal(swapped.session, undefined);
  assert.equal(swapped.rejected, true);
});

test('exchangeDemoSession never mints a link for a non-demo address', async () => {
  let generated = 0;
  const result = await exchangeDemoSession({
    auth: { admin: { generateLink() { generated += 1; } } },
  }, { auth: { verifyOtp() { generated += 1; } } }, 'ceo@narvesen.no');
  assert.equal(result.rejected, true);
  assert.equal(generated, 0);
});

test('generateLink failures stay generic and do not echo provider secrets', async () => {
  const bundle = demoState();
  bundle.state.failGenerate = true;
  const response = await handleDemoSwitch(new Request('https://example.test/demo-switch', {
    method: 'POST',
    body: JSON.stringify({ target: 'admin' }),
  }), {
    handleOptions() { return null; },
    json,
    requireUser() {
      return {
        user: { id: DEMO_TARGETS.admin.userId, email: DEMO_TARGETS.admin.email },
        profile: { role: 'admin' },
      };
    },
    adminClient() { return bundle.db; },
    anonClient() { return bundle.anon; },
  });
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.error, 'Kunne ikke bytte demobruker');
  assert.equal(JSON.stringify(body).includes('otp-secret'), false);
});
