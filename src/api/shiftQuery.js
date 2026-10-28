import { replaceEqualDeep } from '@tanstack/react-query';

export const AUTH_NOT_READY_MESSAGE = 'Authentication required';

function decodeBase64Url(segment) {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(segment.length / 4) * 4, '=');
  if (typeof atob === 'function') return atob(padded);
  return Buffer.from(padded, 'base64').toString('utf8');
}

/**
 * A signed-in user JWT. The anon key and a publishable `sb_` key are not.
 * An expired access token is not usable either: PostgREST would reject it,
 * and an anon fallback returns a successful empty list under RLS.
 */
export function isAuthenticatedAccessToken(token, anonKey) {
  if (!token || typeof token !== 'string') return false;
  if (anonKey && token === anonKey) return false;
  if (token.startsWith('sb_')) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) return false;
  try {
    const payload = JSON.parse(decodeBase64Url(parts[1]));
    if (payload.role !== 'authenticated') return false;
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return false;
    if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}

export function isShiftRestUrl(url) {
  try {
    const parsed = new URL(String(url), 'https://placeholder.local');
    return /\/rest\/v1\/shifts(?:_visible)?\/?$/.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function bearerFromHeaders(headers) {
  if (!headers) return '';
  const value = typeof headers.get === 'function'
    ? headers.get('Authorization') || headers.get('authorization')
    : headers.Authorization || headers.authorization;
  if (!value || typeof value !== 'string') return '';
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match ? match[1].trim() : '';
}

export function requestUrl(input) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (input && typeof input.url === 'string') return input.url;
  return '';
}

/**
 * Shift reads and writes must carry a live user JWT. Without one, PostgREST
 * answers 200 [] because the anon role fails `in_org`, and that empty list
 * is indistinguishable from "this person has no shifts". Colleague reads use
 * `shifts_visible` and need the same gate.
 * Returns a 401 response instead of calling the network.
 */
export async function guardedSupabaseFetch(input, init, { anonKey, fetchImpl = fetch } = {}) {
  const headers = new Headers(init?.headers || (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined));
  if (isShiftRestUrl(requestUrl(input)) && !isAuthenticatedAccessToken(bearerFromHeaders(headers), anonKey)) {
    return new Response(JSON.stringify({ message: AUTH_NOT_READY_MESSAGE, code: '401' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  return fetchImpl(input, { ...init, cache: 'no-store' });
}

export function isAuthNotReadyError(error) {
  if (!error) return false;
  if (error.authNotReady === true || error.status === 401) return true;
  const message = `${error.message || ''} ${error.details?.message || ''}`;
  return message.includes(AUTH_NOT_READY_MESSAGE);
}

/** Keep the shifts already on screen when a later fetch comes back empty. */
export function acceptShiftRows(previous, next) {
  if (Array.isArray(previous) && previous.length > 0 && Array.isArray(next) && next.length === 0) {
    return previous;
  }
  return replaceEqualDeep(previous, next);
}

export function shiftQueryRetry(failureCount, error) {
  return failureCount < (isAuthNotReadyError(error) ? 4 : 1);
}

export function shiftQueryRetryDelay(failureCount) {
  return Math.min(400 * 2 ** failureCount, 4000);
}

export function withShiftQuery(options) {
  return {
    ...options,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    structuralSharing: acceptShiftRows,
    retry: shiftQueryRetry,
    retryDelay: shiftQueryRetryDelay,
  };
}
