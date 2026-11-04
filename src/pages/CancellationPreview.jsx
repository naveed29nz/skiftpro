import { useState } from 'react';
import CancellationWizard from '@/components/billing/CancellationWizard';
import { CONTACT_EMAIL, buildPreviewCancellation } from '@/billing/cancellationTerms';

const SAMPLE = {
  organizationName: 'Kiosk Eksempel AS',
  requesterName: 'Kari Nordmann',
  requesterEmail: 'kari@kioskeksempel.no',
};

export default function CancellationPreview() {
  const [existing, setExisting] = useState(null);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-950">
          <p className="font-semibold">Forhåndsvisning av oppsigelsesprotokollen</p>
          <p className="mt-1">
            Flyten under er den kunden ser, med eksempelkunden {SAMPLE.organizationName}. Ingenting lagres, og ingen data slettes.
            I den innloggede appen ligger samme flyt under Innstillinger for administratoren på kundekortet.
            Spørsmål sendes til {CONTACT_EMAIL}.
          </p>
        </div>
        <CancellationWizard
          preview
          organizationName={SAMPLE.organizationName}
          requesterName={SAMPLE.requesterName}
          requesterEmail={SAMPLE.requesterEmail}
          existing={existing}
          backHref="/"
          backLabel="Til forsiden"
          onSubmit={async (input) => {
            const row = buildPreviewCancellation({
              organizationName: SAMPLE.organizationName,
              requesterName: SAMPLE.requesterName,
              requesterEmail: SAMPLE.requesterEmail,
              reasonCode: input.reasonCode,
              reasonDetail: input.reasonDetail,
              requestedAt: input.requestedAt,
            });
            setExisting(row);
            return row;
          }}
          onWithdraw={async () => {
            setExisting(null);
            return null;
          }}
        />
      </div>
    </div>
  );
}
