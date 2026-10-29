import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { fetchDpaAcceptance, recordDpaAcceptance } from '@/lib/dpa';

export function useDpaAcceptance(orgId, enabled) {
  const [result, setResult] = useState({ status: 'idle', row: /** @type {any} */ (null) });
  const [pending, setPending] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled || !orgId) {
      setResult({ status: 'idle', row: null });
      return { status: 'idle', row: null };
    }
    const next = await fetchDpaAcceptance(supabase, orgId);
    setResult({ status: next.status, row: next.row || null });
    return next;
  }, [enabled, orgId]);

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !orgId) {
      setResult({ status: 'idle', row: null });
      return undefined;
    }
    setResult({ status: 'loading', row: null });
    fetchDpaAcceptance(supabase, orgId).then((next) => {
      if (!cancelled) setResult({ status: next.status, row: next.row || null });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, orgId]);

  const accept = useCallback(async () => {
    if (!orgId) return { ok: false, unavailable: false };
    setPending(true);
    const outcome = await recordDpaAcceptance(supabase, {
      orgId,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    });
    if (outcome.ok) await reload();
    setPending(false);
    return outcome;
  }, [orgId, reload]);

  return { ...result, pending, accept, reload };
}
