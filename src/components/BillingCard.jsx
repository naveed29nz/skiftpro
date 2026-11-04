import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { loadCancellationState } from '@/billing/cancellationApi';
import { NOTICE_SENTENCE, RETENTION_SENTENCE, formatLongDate, openCancellation } from '@/billing/cancellationTerms';

export default function BillingCard({ orgId, canCancel = false }) {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    base44.functions.invoke('stripe-config', {})
      .then((res) => setEnabled(Boolean(res?.data?.enabled)))
      .catch(() => setEnabled(false));
  }, []);

  const cancellation = useQuery({
    queryKey: ['subscription-cancellation', orgId],
    queryFn: () => loadCancellationState(orgId),
    enabled: Boolean(canCancel && orgId),
    retry: false,
  });
  const scheduled = openCancellation(cancellation.data?.rows);

  const open = async (name) => {
    setPending(true);
    setMessage('');
    try {
      const res = await base44.functions.invoke(name, { org_id: orgId });
      const url = res?.data?.url;
      if (url) window.location.assign(url);
      else setMessage(res?.data?.error || 'Betaling er ikke aktivert ennå.');
    } catch (error) {
      setMessage(error?.message || 'Kunne ikke åpne betaling.');
    }
    setPending(false);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-3">
      <h2 className="text-base font-semibold text-slate-800">Abonnement</h2>
      <p className="text-xs text-slate-500">
        30 dagers prøveperiode, pris per butikk i norske kroner inkludert merverdiavgift.
        Prisen settes i Stripe og er ikke bekreftet i appen.
      </p>
      {enabled ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={pending || !orgId} onClick={() => open('stripe-checkout')}>Start prøveperiode</Button>
          <Button type="button" size="sm" variant="outline" disabled={pending || !orgId} onClick={() => open('stripe-portal')}>Administrer abonnement</Button>
        </div>
      ) : (
        <p className="text-xs text-slate-500">Betaling er slått av til Stripe-nøklene er satt.</p>
      )}
      {message && <p className="text-xs text-red-600">{message}</p>}
      {canCancel && (
        <div className="border-t border-slate-100 pt-3 space-y-2">
          <h3 className="text-sm font-semibold text-slate-800">Si opp</h3>
          <p className="text-xs leading-5 text-slate-500">
            {NOTICE_SENTENCE} {RETENTION_SENTENCE} Data slettes ikke automatisk.
          </p>
          {scheduled && (
            <p className="text-xs leading-5 text-slate-700">
              Oppsigelse {scheduled.receipt_number} er registrert. Abonnementet opphører {formatLongDate(scheduled.subscription_ends_on)}. Planlagt slettedato er {formatLongDate(scheduled.data_deletion_on)}.
            </p>
          )}
          <Link
            to="/Settings/oppsigelse"
            className={scheduled
              ? 'inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50'
              : 'inline-flex h-8 items-center rounded-md bg-red-600 px-3 text-xs font-medium text-white hover:bg-red-700'}
          >
            {scheduled ? 'Se oppsigelsen' : 'Si opp abonnementet'}
          </Link>
        </div>
      )}
    </div>
  );
}
