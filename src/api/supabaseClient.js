import { createClient } from '@supabase/supabase-js';
import { guardedSupabaseFetch } from '@/api/shiftQuery';
import { previewUsesProduction } from '@/lib/previewEnv';

const PASSWORD_SETUP_TYPES = new Set(['recovery', 'invite', 'signup']);
const PASSWORD_SETUP_KEY = 'skiftpro.needsNewPassword';

function readAuthCallback() {
  if (typeof window === 'undefined') {
    return { type: null, tokenHash: null, error: null, hasCode: false };
  }
  const hash = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  const type = hash.get('type') || query.get('type');
  const error =
    hash.get('error_description') ||
    query.get('error_description') ||
    hash.get('error') ||
    query.get('error');
  return {
    type: PASSWORD_SETUP_TYPES.has(type) ? type : null,
    tokenHash: query.get('token_hash'),
    error,
    hasCode: Boolean(query.get('code') || hash.get('code')),
  };
}

function readStoredPasswordSetup() {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(PASSWORD_SETUP_KEY) === '1';
  } catch {
    return false;
  }
}

// Read before createClient. detectSessionInUrl clears the hash while initializing.
export const initialAuthCallback = readAuthCallback();

let passwordSetupRequired = Boolean(initialAuthCallback.type) || readStoredPasswordSetup();
const passwordSetupListeners = new Set();

function persistPasswordSetup() {
  passwordSetupRequired = true;
  try {
    window.sessionStorage.setItem(PASSWORD_SETUP_KEY, '1');
  } catch {
    // Private mode can reject sessionStorage. The in-memory flag still covers this load.
  }
  passwordSetupListeners.forEach((listener) => listener());
}

export function clearPasswordSetup() {
  passwordSetupRequired = false;
  try {
    window.sessionStorage.removeItem(PASSWORD_SETUP_KEY);
  } catch {
    // Ignore storage failures; the in-memory flag is already cleared.
  }
}

export function isPasswordSetupRequired() {
  return passwordSetupRequired;
}

export function subscribePasswordSetup(listener) {
  passwordSetupListeners.add(listener);
  if (passwordSetupRequired) listener();
  return () => passwordSetupListeners.delete(listener);
}

function clearAuthParams() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  ['token_hash', 'type', 'error', 'error_code', 'error_description', 'code'].forEach((key) => {
    url.searchParams.delete(key);
  });
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== current) {
    window.history.replaceState(window.history.state, '', next);
  }
}

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local.'
  );
}

if (previewUsesProduction(import.meta.env.VITE_VERCEL_ENV, url)) {
  console.warn(
    'Vercel Preview bruker produksjonsdatabasen. Sett egne VITE_SUPABASE_URL og VITE_SUPABASE_ANON_KEY for Preview. Se docs/PREVIEW_ENV.md.'
  );
}

export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'public-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      // cache: 'no-store' is applied inside guardedSupabaseFetch. Safari can
      // replay a cached GET 200 [] after the Authorization header changes.
      fetch: (input, init) => guardedSupabaseFetch(input, init, { anonKey }),
    },
  }
);

// Subscribe before the client finishes exchanging the URL, or PASSWORD_RECOVERY can fire first.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') persistPasswordSetup();
});

const INVALID_LINK = 'Lenken er ugyldig eller utløpt';

let callbackResult = null;

// Exchange token_hash links once, then decide if this visit must set a password.
export function consumeAuthCallback() {
  if (!callbackResult) callbackResult = resolveAuthCallback();
  return callbackResult;
}

async function resolveAuthCallback() {
  const expecting = Boolean(initialAuthCallback.type || initialAuthCallback.tokenHash);
  const init = await supabase.auth.initialize();

  if (initialAuthCallback.tokenHash && initialAuthCallback.type) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: initialAuthCallback.tokenHash,
      type: initialAuthCallback.type,
    });
    clearAuthParams();
    if (error || !data?.session) {
      clearPasswordSetup();
      return { needsPassword: false, error: INVALID_LINK };
    }
    persistPasswordSetup();
    return { needsPassword: true, error: null };
  }

  if (initialAuthCallback.error) {
    clearAuthParams();
    clearPasswordSetup();
    return { needsPassword: false, error: INVALID_LINK };
  }

  const { data } = await supabase.auth.getSession();
  clearAuthParams();

  if (init?.error && (expecting || initialAuthCallback.hasCode)) {
    clearPasswordSetup();
    return { needsPassword: false, error: INVALID_LINK };
  }

  if (passwordSetupRequired && data?.session) {
    persistPasswordSetup();
    return { needsPassword: true, error: null };
  }

  if (expecting) {
    clearPasswordSetup();
    return { needsPassword: false, error: INVALID_LINK };
  }

  if (passwordSetupRequired && !data?.session) clearPasswordSetup();
  return { needsPassword: false, error: null };
}
