import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

export default function BillingCard({ orgId }) {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    base44.functions.invoke('stripe-config', {})
      .then((res) => setEnabled(Boolean(res?.data?.enabled)))
      .catch(() => setEnabled(false));
  }, []);

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
    </div>
  );
}
