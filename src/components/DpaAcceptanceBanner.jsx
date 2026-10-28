import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DPA_VERSION, dpaPromptStorageKey } from '@/lib/dpa';
import { useDpaAcceptance } from '@/hooks/useDpaAcceptance';

function readDismissed(orgId) {
  if (!orgId || typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(dpaPromptStorageKey(orgId)) === '1';
  } catch {
    return false;
  }
}

function rememberDismissed(orgId) {
  try {
    localStorage.setItem(dpaPromptStorageKey(orgId), '1');
  } catch {
    // The prompt stays dismissible for this view even if storage is blocked.
  }
}

export default function DpaAcceptanceBanner({ orgId, enabled }) {
  const { status, pending, accept } = useDpaAcceptance(orgId, enabled);
  const [dismissed, setDismissed] = useState(() => readDismissed(orgId));
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    setDismissed(readDismissed(orgId));
  }, [orgId]);

  if (!enabled || dismissed || status !== 'missing') return null;

  const dismiss = () => {
    rememberDismissed(orgId);
    setDismissed(true);
  };

  const onAccept = async () => {
    setSaveError('');
    const outcome = await accept();
    if (outcome.ok) return;
    if (outcome.unavailable) {
      dismiss();
      return;
    }
    setSaveError('Kunne ikke lagre aksepten. Prøv igjen fra Innstillinger.');
  };

  return (
    <div className="mb-4 rounded-xl border border-blue-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-900">Databehandleravtale versjon {DPA_VERSION}</p>
      <p className="mt-1 text-sm text-slate-600">
        En administrator må akseptere databehandleravtalen for virksomheten. Du kan fortsette å bruke SkiftPro mens dette står åpent.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="h-8 rounded-md bg-slate-900 px-3 text-xs font-medium text-white disabled:opacity-50" disabled={pending} onClick={onAccept}>
          {pending ? 'Lagrer…' : `Aksepter versjon ${DPA_VERSION}`}
        </button>
        <Link to="/personvern/databehandleravtale" className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800">
          Les avtalen
        </Link>
        <button type="button" className="px-2 text-sm text-slate-500 underline" onClick={dismiss}>
          Ikke nå
        </button>
      </div>
      {saveError && <p className="mt-2 text-sm text-red-700">{saveError}</p>}
    </div>
  );
}
