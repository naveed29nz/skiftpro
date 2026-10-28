import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptShiftRows,
  bearerFromHeaders,
  guardedSupabaseFetch,
  isAuthenticatedAccessToken,
  isAuthNotReadyError,
  isShiftRestUrl,
  shiftQueryRetry,
  withShiftQuery,
} from './shiftQuery.js';

function jwt(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${body}.sig`;
}

const liveUser = jwt({
  role: 'authenticated',
  sub: 'elif',
  exp: Math.floor(Date.now() / 1000) + 3600,
});

test('a user access token is not the anon key or a publishable key', () => {
  const anonJwt = jwt({ role: 'anon', sub: 'anon' });
  assert.equal(isAuthenticatedAccessToken(liveUser, 'sb_publishable_test'), true);
  assert.equal(isAuthenticatedAccessToken(anonJwt, anonJwt), false);
  assert.equal(isAuthenticatedAccessToken('sb_publishable_test', 'sb_publishable_test'), false);
  assert.equal(isAuthenticatedAccessToken(jwt({ role: 'anon' }), 'anon-key'), false);
  assert.equal(isAuthenticatedAccessToken(jwt({ role: 'authenticated' }), 'anon-key'), false);
  assert.equal(isAuthenticatedAccessToken('', 'anon-key'), false);
});

test('an expired user token is not sent to PostgREST', () => {
  const expired = jwt({ role: 'authenticated', sub: 'elif', exp: Math.floor(Date.now() / 1000) - 10 });
  assert.equal(isAuthenticatedAccessToken(expired, 'anon-key'), false);
});

test('only shift reads and writes are gated', () => {
  assert.equal(isShiftRestUrl('https://example.supabase.co/rest/v1/shifts?select=*'), true);
  assert.equal(isShiftRestUrl('https://example.supabase.co/rest/v1/shifts'), true);
  assert.equal(isShiftRestUrl('https://example.supabase.co/rest/v1/shifts_visible?select=*'), true);
  assert.equal(isShiftRestUrl('https://example.supabase.co/rest/v1/shifts_visible'), true);
  assert.equal(isShiftRestUrl('https://example.supabase.co/rest/v1/shift_swaps?select=*'), false);
  assert.equal(isShiftRestUrl('https://example.supabase.co/rest/v1/workers?select=*'), false);
  assert.equal(isShiftRestUrl('https://example.supabase.co/rest/v1/workers_visible?select=*'), false);
  assert.equal(isShiftRestUrl('https://example.supabase.co/auth/v1/token'), false);
});

test('a shift request without a user session never reaches the network', async () => {
  let called = false;
  const response = await guardedSupabaseFetch('https://example.supabase.co/rest/v1/shifts?select=*', {
    headers: { Authorization: 'Bearer sb_publishable_test', apikey: 'sb_publishable_test' },
  }, {
    anonKey: 'sb_publishable_test',
    fetchImpl: async () => {
      called = true;
      return new Response('[]', { status: 200 });
    },
  });
  assert.equal(called, false);
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.message, 'Authentication required');
});

test('an authenticated shift request bypasses the HTTP cache', async () => {
  let seen;
  const response = await guardedSupabaseFetch('https://example.supabase.co/rest/v1/shifts?select=*', {
    method: 'GET',
    headers: { Authorization: `Bearer ${liveUser}` },
  }, {
    anonKey: 'sb_publishable_test',
    fetchImpl: async (_input, init) => {
      seen = init;
      return new Response('[]', { status: 200 });
    },
  });
  assert.equal(response.status, 200);
  assert.equal(seen.cache, 'no-store');
  assert.equal(bearerFromHeaders(seen.headers), liveUser);
});

test('other tables still fetch when the session is missing', async () => {
  let called = false;
  await guardedSupabaseFetch('https://example.supabase.co/rest/v1/workers?select=*', {
    headers: { Authorization: 'Bearer sb_publishable_test' },
  }, {
    anonKey: 'sb_publishable_test',
    fetchImpl: async () => {
      called = true;
      return new Response('[]', { status: 200 });
    },
  });
  assert.equal(called, true);
});

test('an empty shift list does not replace shifts already loaded', () => {
  const previous = [{ id: 'shift-1' }, { id: 'shift-2' }];
  assert.equal(acceptShiftRows(previous, []), previous);
  assert.deepEqual(acceptShiftRows(undefined, []), []);
  assert.deepEqual(acceptShiftRows([], []), []);
  const next = [{ id: 'shift-3' }];
  assert.deepEqual(acceptShiftRows(previous, next), next);
});

test('a missing session retries longer than a normal failure', () => {
  const missing = Object.assign(new Error('Authentication required'), { status: 401, authNotReady: true });
  assert.equal(isAuthNotReadyError(missing), true);
  assert.equal(shiftQueryRetry(0, missing), true);
  assert.equal(shiftQueryRetry(3, missing), true);
  assert.equal(shiftQueryRetry(4, missing), false);
  const other = new Error('database down');
  assert.equal(shiftQueryRetry(0, other), true);
  assert.equal(shiftQueryRetry(1, other), false);
});

test('shift queries wait on the caller flag and refetch when the window returns', () => {
  const options = withShiftQuery({
    queryKey: ['shifts', 'org-1'],
    enabled: false,
    queryFn: () => [],
  });
  assert.equal(options.enabled, false);
  assert.deepEqual(options.queryKey, ['shifts', 'org-1']);
  assert.equal(options.refetchOnWindowFocus, true);
  assert.equal(options.refetchOnReconnect, true);
  const previous = [{ id: 'a' }];
  assert.equal(options.structuralSharing(previous, []), previous);
});
