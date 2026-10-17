import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';

const EVENT_LABELS = {
  opprettet: 'Opprettet',
  sendt: 'Sendt',
  påminnelse: 'Påminnelse',
  åpnet: 'Åpnet',
  otp_sendt: 'Engangskode sendt',
  otp_feil: 'Feil kode',
  signert: 'Signert av ansatt',
  motsignert: 'Motsignert av arbeidsgiver',
  avvist: 'Avvist',
  trukket: 'Trukket',
  utløpt: 'Utløpt',
};

function formatStamp(iso) {
  if (!iso) return '–';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '–';
  const oslo = new Intl.DateTimeFormat('nb-NO', {
    timeZone: 'Europe/Oslo',
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date);
  return `${date.toISOString().replace('.000Z', 'Z')} (UTC) · ${oslo} (Europe/Oslo)`;
}

export default function ContractCertificate({
  documentId,
  templateKey,
  templateVersion,
  contentSha256,
  pdfSha256,
  workerName,
  workerEmail,
  companyName,
  signatoryName,
  employerName,
  employerEmail,
  employeeSignedAt,
  employeeSignedBy,
  employerSignedAt,
  employerSignedBy,
  countersignerName,
  countersignerEmail,
  events = [],
}) {
  const [proofError, setProofError] = useState('');
  const [proofBusy, setProofBusy] = useState(false);

  const downloadProof = async () => {
    if (!documentId) return;
    setProofBusy(true);
    setProofError('');
    try {
      const res = await base44.functions.invoke('generateContractPDF', {
        contract_id: documentId,
        kind: 'signeringsbevis',
      });
      const blob = res?.data instanceof Blob
        ? res.data
        : new Blob([res?.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `signeringsbevis-${documentId}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setProofError(err?.message || 'Kunne ikke laste ned signeringsbeviset');
    } finally {
      setProofBusy(false);
    }
  };

  return (
    <article className="bg-white text-slate-900 rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <header className="px-6 py-5 border-b border-slate-200 bg-slate-50">
        <p className="text-xs uppercase tracking-wide text-slate-500">Signeringsbevis</p>
        <h1 className="text-xl font-bold mt-1">Signert arbeidsavtale</h1>
        <p className="text-sm text-slate-600 mt-1">Dokument-id {documentId}</p>
        <Button type="button" variant="outline" className="mt-3" disabled={proofBusy} onClick={downloadProof}>
          {proofBusy ? 'Laster…' : 'Last ned signeringsbevis'}
        </Button>
        {proofError ? <p className="text-sm text-red-600 mt-2">{proofError}</p> : null}
      </header>
      <div className="px-6 py-5 space-y-5 text-sm">
        <dl className="grid sm:grid-cols-2 gap-4">
          <div>
            <dt className="text-xs text-slate-500">Mal</dt>
            <dd className="font-medium">{templateKey || '–'} · versjon {templateVersion ?? '–'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Metode</dt>
            <dd className="font-medium">E-postkode (simple_otp)</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-slate-500">SHA-256 av avtaleteksten</dt>
            <dd className="font-mono text-xs break-all">{contentSha256 || '–'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-slate-500">SHA-256 av PDF-filen</dt>
            <dd className="font-mono text-xs break-all">{pdfSha256 || 'Beregnes når PDF-filen er lagret'}</dd>
          </div>
        </dl>

        <section>
          <h2 className="font-semibold mb-2">Signatarer</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-500">Ansatt</p>
              <p className="font-semibold">{workerName}</p>
              <p>{workerEmail}</p>
              <p className="text-xs text-slate-500 mt-2">Rolle: ansatt</p>
              <p className="text-xs mt-1">{formatStamp(employeeSignedAt)}</p>
              <p className="text-xs text-slate-500 break-all">Bruker-id {employeeSignedBy || '–'}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-500">Arbeidsgiver</p>
              <p className="font-semibold">{companyName || employerName || '–'}</p>
              <p>For {companyName || employerName || '–'}: {signatoryName || '–'}</p>
              {employerEmail ? <p>{employerEmail}</p> : null}
              <p className="text-xs text-slate-500 mt-2">Admin som motsignet</p>
              <p className="font-semibold">{countersignerName || '–'}</p>
              <p className="break-all">{countersignerEmail || '–'}</p>
              <p className="text-xs mt-1">{formatStamp(employerSignedAt)}</p>
              <p className="text-xs text-slate-500 break-all">Bruker-id {employerSignedBy || '–'}</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="font-semibold mb-2">Hendelseslogg</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-500 border-b">
                  <th className="py-2 pr-3 font-medium">Tid</th>
                  <th className="py-2 pr-3 font-medium">Hendelse</th>
                  <th className="py-2 pr-3 font-medium">Rolle</th>
                  <th className="py-2 pr-3 font-medium">IP</th>
                  <th className="py-2 font-medium">Brukeragent</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id || `${event.event_type}-${event.created_at}`} className="border-b border-slate-100 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">{formatStamp(event.created_at)}</td>
                    <td className="py-2 pr-3">{EVENT_LABELS[event.event_type] || event.event_type}</td>
                    <td className="py-2 pr-3">{event.actor_role || '–'}</td>
                    <td className="py-2 pr-3">{event.ip || '–'}</td>
                    <td className="py-2 max-w-[220px] break-all">{event.user_agent || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </article>
  );
}
