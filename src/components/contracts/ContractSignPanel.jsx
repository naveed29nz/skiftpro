import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export default function ContractSignPanel({
  title = 'Arbeidsavtale',
  intro,
  body,
  role = 'ansatt',
  emailHint,
  busy = false,
  message = '',
  error = '',
  initialScrolled = false,
  initialAccepted = false,
  initialCodeSent = false,
  onRequestCode,
  onVerify,
  onReject,
}) {
  const scroller = useRef(null);
  const [scrolled, setScrolled] = useState(initialScrolled);
  const [accepted, setAccepted] = useState(initialAccepted);
  const [codeSent, setCodeSent] = useState(initialCodeSent);
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');

  const markIfComplete = (el) => {
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight + 8) setScrolled(true);
  };

  useEffect(() => {
    markIfComplete(scroller.current);
  }, [body]);

  const onScroll = (event) => {
    const el = event.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 12) setScrolled(true);
  };

  const askForCode = async () => {
    if (!accepted || !onRequestCode) return;
    await onRequestCode();
    setCodeSent(true);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {intro || (role === 'arbeidsgiver'
            ? 'Du motsigner som arbeidsgiver etter at den ansatte har signert.'
            : 'Les hele avtalen. Du må bla til bunnen før du kan godta.')}
        </p>
      </div>

      <div
        ref={scroller}
        onScroll={onScroll}
        className="h-[420px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-800 whitespace-pre-wrap"
      >
        {body}
      </div>

      {!scrolled && (
        <p className="text-sm text-amber-700">Bla til bunnen av avtalen for å fortsette.</p>
      )}

      <label className="flex items-start gap-3 bg-white rounded-xl border border-slate-200 p-4">
        <Checkbox
          id="har-lest-avtalen"
          checked={accepted}
          disabled={!scrolled}
          onCheckedChange={(value) => setAccepted(value === true)}
        />
        <span className="text-sm text-slate-800">
          Jeg har lest og godtar avtalen
          {emailHint ? <span className="block text-slate-500 mt-1">Engangskode sendes til {emailHint}</span> : null}
        </span>
      </label>

      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={!accepted || busy} onClick={askForCode}>
          Send engangskode
        </Button>
      </div>

      {codeSent && (
        <form
          className="bg-white rounded-xl border border-slate-200 p-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (onVerify) onVerify(code);
          }}
        >
          <label className="block text-sm font-medium text-slate-700" htmlFor="engangskode">
            Sekssifret kode fra e-post
          </label>
          <Input
            id="engangskode"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            className="max-w-[160px] tracking-[0.3em] font-mono"
          />
          <p className="text-xs text-slate-500">Koden er gyldig i 10 minutter. Du har maks fem forsøk.</p>
          <Button type="submit" disabled={code.length !== 6 || busy}>Signer med kode</Button>
        </form>
      )}

      {role === 'ansatt' && (
        <form
          className="bg-white rounded-xl border border-slate-200 p-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (onReject) onReject(reason);
          }}
        >
          <label className="block text-sm font-medium text-slate-700" htmlFor="avvis-grunn">
            Vil du ikke signere?
          </label>
          <Textarea
            id="avvis-grunn"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Skriv en kort grunn. Admin får beskjed."
          />
          <Button type="submit" variant="outline" disabled={!reason.trim() || busy} className="text-red-600">
            Avvis avtalen
          </Button>
        </form>
      )}

      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
