import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TRUST_CARDS } from '@/legal/routes';
import { DPA_VERSION, DPA_UPDATED_LABEL } from '@/lib/dpa';
import { useDpaAcceptance } from '@/hooks/useDpaAcceptance';

function formatAccepted(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function PrivacyCenterCard({ orgId, canAccept }) {
  const { status, row, pending, accept } = useDpaAcceptance(orgId, canAccept);
  const [saveError, setSaveError] = useState('');
  const acceptedOn = formatAccepted(row?.accepted_at);

  const onAccept = async () => {
    setSaveError('');
    const outcome = await accept();
    if (outcome.ok || outcome.unavailable) return;
    setSaveError('Kunne ikke lagre aksepten. Prøv igjen.');
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-3">
      <h2 className="text-base font-semibold text-slate-800">Personvern og sikkerhet</h2>
      <p className="text-sm text-slate-600">
        Her ligger personvernerklæringer, underleverandører, sikkerhetstiltak og databehandleravtalen.
      </p>
      <ul className="space-y-1 text-sm">
        {TRUST_CARDS.map((card) => (
          <li key={card.to}>
            <Link to={card.to} className="text-blue-800 underline">{card.title}</Link>
          </li>
        ))}
      </ul>
      {canAccept && status === 'accepted' && (
        <p className="text-sm text-emerald-700">
          Databehandleravtalen versjon {row?.dpa_version || DPA_VERSION} er akseptert{acceptedOn ? ` ${acceptedOn}` : ''}.
        </p>
      )}
      {canAccept && status === 'missing' && (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            Versjon {DPA_VERSION} ({DPA_UPDATED_LABEL}) er ikke akseptert for virksomheten ennå.
          </p>
          <button type="button" className="h-8 rounded-md bg-slate-900 px-3 text-xs font-medium text-white disabled:opacity-50" disabled={pending} onClick={onAccept}>
            {pending ? 'Lagrer…' : `Aksepter versjon ${DPA_VERSION}`}
          </button>
          {saveError && <p className="text-sm text-red-700">{saveError}</p>}
        </div>
      )}
    </div>
  );
}
