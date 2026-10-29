import { useLayoutEffect, useRef, useState } from 'react';
import { useOrg } from '@/hooks/useOrg';
import { base44 } from '@/api/base44Client';
import { clearPasswordSetup, supabase } from '@/api/supabaseClient';
import { queryClientInstance } from '@/lib/query-client';
import { cn } from '@/lib/utils';
import {
  activeDemoRole,
  demoRoles,
  shouldShowDemoBar,
  switchDemoRole,
} from '@/lib/demoMode';

const ROLES = demoRoles();

function DemoModeBarView({ email }) {
  const barRef = useRef(null);
  const active = activeDemoRole(email);
  const [previewKey, setPreviewKey] = useState(null);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const shown = ROLES.find((role) => role.key === (previewKey || active?.key)) || null;

  useLayoutEffect(() => {
    const el = barRef.current;
    const root = document.documentElement;
    if (!el) return undefined;
    const apply = () => {
      root.style.setProperty('--demo-bar-h', `${Math.ceil(el.getBoundingClientRect().height)}px`);
    };
    root.classList.add('demo-mode');
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.classList.remove('demo-mode');
      root.style.removeProperty('--demo-bar-h');
    };
  }, []);

  const switchTo = async (key) => {
    if (busyKey || key === active?.key) return;
    setBusyKey(key);
    setError('');
    try {
      await switchDemoRole(key, {
        invoke: (name, body) => base44.functions.invoke(name, body),
        setSession: (tokens) => supabase.auth.setSession(tokens),
        clearPassword: clearPasswordSetup,
        reload: (path) => {
          queryClientInstance.clear();
          window.location.replace(path);
        },
      });
    } catch (err) {
      setError(err?.message || 'Kunne ikke bytte rolle');
      setBusyKey('');
    }
  };

  return (
    <div
      ref={barRef}
      className="fixed inset-x-0 top-0 z-[120] border-b border-emerald-950/30 bg-emerald-800 text-white shadow-md"
      role="region"
      aria-label="Demo-modus"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-1.5 px-3 py-1.5 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">Demo</span>
          <span className="text-sm font-semibold">Demo-modus</span>
          <span className="truncate text-xs text-emerald-100">Narvesen Demo AS</span>
        </div>
        <div
          className="flex w-full flex-wrap gap-1 rounded-md bg-emerald-950/35 p-0.5 sm:w-auto"
          role="group"
          aria-label="Bytt demorolle"
          onMouseLeave={() => setPreviewKey(null)}
        >
          {ROLES.map((role) => {
            const selected = role.key === active?.key;
            return (
              <button
                key={role.key}
                type="button"
                aria-pressed={selected}
                title={role.access}
                disabled={Boolean(busyKey)}
                onMouseEnter={() => setPreviewKey(role.key)}
                onFocus={() => setPreviewKey(role.key)}
                onBlur={() => setPreviewKey(null)}
                onClick={() => switchTo(role.key)}
                className={cn(
                  'shrink-0 rounded px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition-colors',
                  selected ? 'bg-white text-emerald-900' : 'text-emerald-50 hover:bg-white/15',
                  busyKey && !selected ? 'opacity-60' : '',
                )}
              >
                {busyKey === role.key ? 'Bytter…' : role.label}
              </button>
            );
          })}
        </div>
      </div>
      <p className="mx-auto max-w-6xl px-3 pb-1.5 text-xs text-emerald-50">
        {shown ? shown.access : 'Velg en rolle for å se SkiftPro slik den rollen gjør.'}
      </p>
      {error ? (
        <p role="alert" className="mx-auto max-w-6xl px-3 pb-1.5 text-xs font-medium text-amber-100">{error}</p>
      ) : null}
    </div>
  );
}

export default function DemoModeBar() {
  const { orgId, userEmail, isImpersonating } = useOrg();
  if (!shouldShowDemoBar({ email: userEmail, orgId, impersonating: isImpersonating })) return null;
  return <DemoModeBarView email={userEmail} />;
}
