import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { toast } from '@/components/ui/use-toast';
import ContractSignPanel from '@/components/contracts/ContractSignPanel';
import ContractCertificate from '@/components/contracts/ContractCertificate';
import { countersignerIdentity, employerCountersignDestination } from '@/contracts/countersign';

export default function ContractSign() {
  const { contractId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const role = params.get('rolle') === 'arbeidsgiver' ? 'arbeidsgiver' : 'ansatt';
  const [document, setDocument] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);

  const { data: contract, isLoading } = useQuery({
    queryKey: ['contract-sign', contractId],
    queryFn: () => base44.entities.Contract.get(contractId),
    enabled: !!contractId,
  });

  const { data: events = [] } = useQuery({
    queryKey: ['contract-events', contractId],
    queryFn: async () => {
      const { data, error: eventsError } = await supabase
        .from('contract_events')
        .select('id, event_type, actor_id, actor_role, ip, user_agent, payload, created_at')
        .eq('contract_id', contractId)
        .order('created_at', { ascending: true });
      if (eventsError) return [];
      return data || [];
    },
    enabled: !!contractId,
  });

  useEffect(() => {
    if (!contractId) return;
    let cancelled = false;
    (async () => {
      if (role === 'ansatt') {
        const opened = await base44.functions.invoke('sign-contract', { contract_id: contractId, action: 'open' });
        if (!cancelled && opened?.data?.document) setDocument(opened.data.document);
        if (!cancelled && opened?.data?.status) setStatus(opened.data.status);
      }
      const { data } = await supabase.rpc('contract_document', { p_id: contractId });
      if (!cancelled && data) setDocument(data);
    })().catch((err) => {
      if (!cancelled) setError(err.message || 'Kunne ikke åpne avtalen');
    });
    return () => { cancelled = true; };
  }, [contractId, role]);

  const currentStatus = status || document?.status || contract?.status;

  const requestCode = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await base44.functions.invoke('sign-contract', {
        contract_id: contractId,
        action: 'request_otp',
        role,
      });
      const sent = res?.data?.sent ? `Koden er sendt til ${res.data.email || 'e-posten din'}.` : 'E-post er ikke satt opp. Be admin sjekke RESEND_API_KEY.';
      const dev = res?.data?.dev_code ? ` Utviklerkode: ${res.data.dev_code}.` : '';
      setMessage(sent + dev);
    } catch (err) {
      setError(err.message || 'Kunne ikke sende kode');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (code) => {
    setBusy(true);
    setError('');
    try {
      const res = await base44.functions.invoke('sign-contract', {
        contract_id: contractId,
        action: 'verify',
        role,
        code,
      });
      const nextStatus = res?.data?.status || null;
      const destination = employerCountersignDestination(role, nextStatus);
      if (destination) {
        queryClient.invalidateQueries({ queryKey: ['contracts'] });
        toast({ title: destination.toast });
        navigate(destination.path);
        return;
      }
      setStatus(nextStatus);
      setMessage(nextStatus === 'signert'
        ? 'Avtalen er signert av begge parter.'
        : 'Signaturen er registrert. Arbeidsgiver må motsignere.');
      const { data } = await supabase.rpc('contract_document', { p_id: contractId });
      if (data) setDocument(data);
    } catch (err) {
      setError(err.message || 'Signeringen feilet');
    } finally {
      setBusy(false);
    }
  };

  const reject = async (reason) => {
    setBusy(true);
    setError('');
    try {
      await base44.functions.invoke('sign-contract', {
        contract_id: contractId,
        action: 'reject',
        reason,
      });
      setStatus('avvist');
      setMessage('Avtalen er avvist. Admin er varslet.');
    } catch (err) {
      setError(err.message || 'Kunne ikke avvise');
    } finally {
      setBusy(false);
    }
  };

  if (isLoading && !contract) {
    return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" /></div>;
  }

  if (currentStatus === 'signert' || currentStatus === 'godkjent') {
    const fields = document?.field_values || {};
    const countersigner = countersignerIdentity({ document, contract, events });
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Link to="/WorkerPortal" className="text-sm text-blue-700">Tilbake</Link>
        <ContractCertificate
          documentId={contractId}
          templateKey={document?.template_key || contract?.template_key}
          templateVersion={document?.template_version || contract?.template_version}
          contentSha256={document?.content_sha256 || contract?.content_sha256}
          pdfSha256={document?.pdf_sha256 || contract?.pdf_sha256}
          workerName={contract?.worker_name}
          workerEmail={fields.epost || fields.email}
          companyName={String(fields.selskap || contract?.org_name || '').trim()}
          signatoryName={String(fields.signatur_navn || '').trim()}
          employeeSignedAt={document?.employee_signed_at || contract?.employee_signed_at || contract?.approved_at}
          employeeSignedBy={document?.employee_signed_by || contract?.employee_signed_by || contract?.approved_by_worker_id}
          employerSignedAt={countersigner.signedAt}
          employerSignedBy={countersigner.userId}
          countersignerName={countersigner.name}
          countersignerEmail={countersigner.email}
          events={events}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link to="/WorkerPortal" className="text-sm text-blue-700">Tilbake</Link>
      {!document?.body_snapshot && (
        <p className="text-sm text-slate-500">Avtaleteksten vises bare for den ansatte og for admin.</p>
      )}
      <ContractSignPanel
        title={contract?.worker_name ? `Arbeidsavtale for ${contract.worker_name}` : 'Arbeidsavtale'}
        body={document?.body_snapshot || 'Avtaleteksten er ikke tilgjengelig for deg.'}
        role={role}
        emailHint={role === 'ansatt' ? contract?.worker_name : 'din admin-e-post'}
        busy={busy}
        message={message}
        error={error}
        onRequestCode={requestCode}
        onVerify={verify}
        onReject={reject}
      />
    </div>
  );
}
