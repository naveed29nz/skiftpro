import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ContractSignPanel from '@/components/contracts/ContractSignPanel';
import EmployeeSignedThanks from '@/components/contracts/EmployeeSignedThanks';
import { mapSigningError } from '@/contracts/signingErrors';

const TOKEN_KEY = 'skiftpro.contractAccess';
const PAGE_CLASS = 'min-h-dvh bg-slate-50 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]';
const PREVIEW_PARAGRAPH = 'Arbeidsavtale\n\nDette er en forhåndsvisning av signeringslenken. Ingen e-post sendes, og ingen avtale blir signert.';

function previewBody(long) {
  if (!long) return PREVIEW_PARAGRAPH;
  return Array.from({ length: 18 }, () => PREVIEW_PARAGRAPH).join('\n\n');
}

function rememberToken(contractId, token) {
  try {
    sessionStorage.setItem(`${TOKEN_KEY}.${contractId}`, token);
  } catch {
    /* private mode */
  }
}

function readToken(contractId) {
  try {
    return sessionStorage.getItem(`${TOKEN_KEY}.${contractId}`) || '';
  } catch {
    return '';
  }
}

async function guestCall(payload) {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Signering er ikke satt opp.');
  const response = await fetch(`${url}/functions/v1/sign-contract`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error || 'Kunne ikke åpne avtalen');
  return data;
}

export default function GuestContractSign() {
  const { contractId } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const devPreview = import.meta.env.DEV && params.get('forhandsvis') === '1';
  const [token, setToken] = useState('');
  const [ready, setReady] = useState(false);
  const [document, setDocument] = useState(null);
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!contractId) return;
    const fromQuery = params.get('tilgang') || '';
    const nextToken = fromQuery || readToken(contractId);
    if (fromQuery) {
      rememberToken(contractId, fromQuery);
      const next = new URLSearchParams(params);
      next.delete('tilgang');
      setParams(next, { replace: true });
    }
    setToken(nextToken);
    setReady(true);
  }, [contractId]);

  useEffect(() => {
    if (!ready || !contractId || devPreview) return;
    if (!token) {
      setError('Lenken er ugyldig eller utløpt. Åpne e-posten fra arbeidsgiver på nytt.');
      return;
    }
    let cancelled = false;
    setBusy(true);
    guestCall({ contract_id: contractId, access_token: token, action: 'open' })
      .then((data) => {
        if (cancelled) return;
        setDocument(data.document || null);
        setStatus(data.status || data.document?.status || null);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Kunne ikke åpne avtalen');
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => { cancelled = true; };
  }, [ready, contractId, token, devPreview]);

  const requestCode = async () => {
    if (devPreview) {
      setMessage('Ingen e-post er sendt. Dette er bare en forhåndsvisning.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const data = await guestCall({
        contract_id: contractId,
        access_token: token,
        action: 'request_otp',
        role: 'ansatt',
      });
      const sent = data.sent
        ? `Koden er sendt til ${data.email || 'e-postadressen avtalen ble sendt til'}.`
        : 'E-post er ikke satt opp. Be admin sjekke at e-postutsending virker.';
      const dev = data.dev_code ? ` Utviklerkode: ${data.dev_code}.` : '';
      setMessage(sent + dev);
      return true;
    } catch (err) {
      setError(err.message || 'Kunne ikke sende kode');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const verify = async (code) => {
    if (devPreview) {
      setStatus('signert_ansatt');
      setMessage('Signaturen er registrert i forhåndsvisningen. Ingen avtale er signert.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await guestCall({
        contract_id: contractId,
        access_token: token,
        action: 'verify',
        role: 'ansatt',
        code,
      });
      if (data.status !== 'signert') {
        navigate(`/signer/${contractId}/takk`);
        return;
      }
      setStatus(data.status || null);
      setMessage('Avtalen er signert av begge parter. En kopi blir sendt på e-post.');
    } catch (err) {
      setError(mapSigningError(err.message));
    } finally {
      setBusy(false);
    }
  };

  const reject = async (reason) => {
    if (devPreview) {
      setStatus('avvist');
      setMessage('Avvisningen er bare en forhåndsvisning.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await guestCall({
        contract_id: contractId,
        access_token: token,
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

  if (devPreview) {
    return (
      <div className={PAGE_CLASS}>
        <ContractSignPanel
          title="Arbeidsavtale"
          intro="Du trenger ikke en brukerkonto. Engangskoden sendes til e-postadressen avtalen er sendt til. Avtalen er signert først når du skriver inn koden."
          body={previewBody(params.get('fulltekst') === '1')}
          role="ansatt"
          emailHint="e-postadressen avtalen ble sendt til"
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

  if (!ready || (busy && !document && !error)) {
    return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" /></div>;
  }

  if (status === 'signert_ansatt') {
    return <EmployeeSignedThanks />;
  }

  if (status === 'signert') {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <h1 className="text-2xl font-bold text-slate-900">Arbeidsavtalen er signert</h1>
        <p className="text-sm text-slate-600 mt-2">Begge parter har signert. En kopi av PDF-en er sendt på e-post.</p>
      </div>
    );
  }

  if (status === 'avvist') {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <h1 className="text-2xl font-bold text-slate-900">Avtalen er avvist</h1>
        <p className="text-sm text-slate-600 mt-2">{message || 'Admin er varslet.'}</p>
      </div>
    );
  }

  if (status === 'utlopt') {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <h1 className="text-2xl font-bold text-slate-900">Signeringsfristen er ute</h1>
        <p className="text-sm text-slate-600 mt-2">Be arbeidsgiver sende avtalen på nytt.</p>
      </div>
    );
  }

  return (
    <div className={PAGE_CLASS}>
      <ContractSignPanel
        title={document?.worker_name ? `Arbeidsavtale for ${document.worker_name}` : 'Arbeidsavtale'}
        intro="Du trenger ikke en brukerkonto. Engangskoden sendes til e-postadressen avtalen er sendt til. Avtalen er signert først når du skriver inn koden."
        body={document?.body_snapshot || 'Avtaleteksten er ikke tilgjengelig.'}
        role="ansatt"
        emailHint="e-postadressen avtalen ble sendt til"
        busy={busy}
        message={message}
        error={error}
        onRequestCode={status === 'signert_ansatt' ? undefined : requestCode}
        onVerify={status === 'signert_ansatt' ? undefined : verify}
        onReject={reject}
      />
    </div>
  );
}
