import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  CONTRACT_SCROLL_END_TOLERANCE_PX,
  contractReachedEnd,
  sentinelInView,
} from '@/contracts/contractScroll';
import { otpCooldownLabel, otpCooldownSeconds, otpDigits } from '@/contracts/otpCooldown';

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
  const endRef = useRef(null);
  const codeRef = useRef(null);
  const sendLock = useRef(false);
  const verifyLock = useRef(false);
  const [scrolled, setScrolled] = useState(initialScrolled);
  const [accepted, setAccepted] = useState(initialAccepted);
  const [codeSent, setCodeSent] = useState(initialCodeSent);
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sentAt, setSentAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [localError, setLocalError] = useState('');
  const alertRef = useRef(null);

  useEffect(() => {
    const root = scroller.current;
    const sentinel = endRef.current;
    if (!root || initialScrolled) return undefined;

    const check = () => {
      if (contractReachedEnd(root) || sentinelInView(root, sentinel)) setScrolled(true);
    };

    check();

    let frame = 0;
    let late = 0;
    const checkAfterScroll = () => {
      check();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(check);
      window.clearTimeout(late);
      // iOS momentum keeps moving after the last scroll event.
      late = window.setTimeout(check, 180);
    };

    root.addEventListener('scroll', checkAfterScroll, { passive: true });
    root.addEventListener('scrollend', checkAfterScroll);
    root.addEventListener('touchend', checkAfterScroll, { passive: true });
    window.addEventListener('touchend', checkAfterScroll, { passive: true });
    window.addEventListener('pointerup', checkAfterScroll);

    let observer;
    if (sentinel && typeof IntersectionObserver === 'function') {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setScrolled(true);
      }, {
        root,
        rootMargin: `0px 0px ${CONTRACT_SCROLL_END_TOLERANCE_PX}px 0px`,
        threshold: 0,
      });
      observer.observe(sentinel);
    }

    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => check()) : null;
    resize?.observe(root);
    if (root.firstElementChild) resize?.observe(root.firstElementChild);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(late);
      root.removeEventListener('scroll', checkAfterScroll);
      root.removeEventListener('scrollend', checkAfterScroll);
      root.removeEventListener('touchend', checkAfterScroll);
      window.removeEventListener('touchend', checkAfterScroll);
      window.removeEventListener('pointerup', checkAfterScroll);
      observer?.disconnect();
      resize?.disconnect();
    };
  }, [body, initialScrolled]);

  useEffect(() => {
    if (sentAt <= 0 || otpCooldownSeconds(sentAt, Date.now()) <= 0) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [sentAt, now]);

  const cooldownLeft = otpCooldownSeconds(sentAt, now);
  const shownError = localError || error;

  useEffect(() => {
    if (!shownError) return undefined;
    alertRef.current?.scrollIntoView({ block: 'nearest' });
    return undefined;
  }, [shownError]);

  const jumpToEnd = () => {
    const el = scroller.current;
    const sentinel = endRef.current;
    const pageX = window.scrollX;
    const pageY = window.scrollY;
    if (sentinel && typeof sentinel.scrollIntoView === 'function') {
      sentinel.scrollIntoView({ block: 'end', inline: 'nearest' });
    }
    if (el) el.scrollTop = el.scrollHeight;
    const pin = () => {
      if (el) el.scrollTop = el.scrollHeight;
      window.scrollTo(pageX, pageY);
    };
    pin();
    requestAnimationFrame(pin);
    setScrolled(true);
  };

  const askForCode = async () => {
    if (!accepted || !onRequestCode || sendLock.current || sending || cooldownLeft > 0) return;
    sendLock.current = true;
    setSending(true);
    setLocalError('');
    try {
      const result = await onRequestCode();
      if (result === false) return;
      setCodeSent(true);
      setSentAt(Date.now());
    } finally {
      sendLock.current = false;
      setSending(false);
    }
  };

  const submitCode = async () => {
    if (verifyLock.current || verifying || !onVerify) return;
    const value = otpDigits(codeRef.current?.value);
    if (value.length !== 6) {
      setLocalError('Skriv inn den sekssifrede koden fra e-post.');
      return;
    }
    verifyLock.current = true;
    setVerifying(true);
    setLocalError('');
    try {
      await onVerify(value);
    } finally {
      verifyLock.current = false;
      setVerifying(false);
    }
  };

  return (
    <div
      data-contract-sign-panel=""
      className="max-w-3xl mx-auto space-y-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:pb-0"
    >
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
        tabIndex={0}
        aria-label="Avtaletekst"
        data-contract-scroller=""
        className="h-[420px] max-h-[55dvh] overflow-y-auto overscroll-y-contain touch-pan-y rounded-xl border border-slate-200 bg-white"
      >
        <div className="p-5 text-sm leading-6 text-slate-800 whitespace-pre-wrap">
          {body}
          <div ref={endRef} data-contract-end="" aria-hidden="true" className="h-4" />
        </div>
      </div>

      {!scrolled && (
        <div className="space-y-2">
          <p id="avtalen-ma-leses" className="text-sm text-amber-700">Bla til bunnen av avtalen for å fortsette.</p>
          <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto" onClick={jumpToEnd}>
            Gå til slutten av avtalen
          </Button>
        </div>
      )}

      <label className="flex items-start gap-3 bg-white rounded-xl border border-slate-200 p-4">
        <Checkbox
          id="har-lest-avtalen"
          checked={accepted}
          disabled={!scrolled}
          aria-describedby={scrolled ? undefined : 'avtalen-ma-leses'}
          onCheckedChange={(value) => setAccepted(value === true)}
        />
        <span className="text-sm text-slate-800">
          Jeg har lest og godtar avtalen
          {emailHint ? <span className="block text-slate-500 mt-1">Engangskode sendes til {emailHint}</span> : null}
        </span>
      </label>

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          className="min-h-11 w-full sm:w-auto"
          disabled={!accepted || sending || verifying || busy || cooldownLeft > 0}
          onClick={askForCode}
        >
          {sending ? 'Sender…' : cooldownLeft > 0 ? otpCooldownLabel(cooldownLeft) : 'Send engangskode'}
        </Button>
      </div>

      {codeSent && (
        <form
          className="bg-white rounded-xl border border-slate-200 p-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            submitCode();
          }}
        >
          <label className="block text-sm font-medium text-slate-700" htmlFor="engangskode">
            Sekssifret kode fra e-post
          </label>
          <Input
            ref={codeRef}
            id="engangskode"
            name="engangskode"
            inputMode="numeric"
            autoComplete="one-time-code"
            enterKeyHint="done"
            maxLength={6}
            onInput={(event) => {
              const next = otpDigits(event.currentTarget.value);
              if (event.currentTarget.value !== next) event.currentTarget.value = next;
            }}
            placeholder="000000"
            className="max-w-[160px] tracking-[0.3em] font-mono text-base"
          />
          <p className="text-xs text-slate-500">Koden er gyldig i 10 minutter. Du har maks fem forsøk.</p>
          <Button
            type="button"
            className="min-h-11 w-full sm:w-auto"
            disabled={verifying || busy}
            aria-busy={verifying}
            onTouchEnd={(event) => {
              event.preventDefault();
              submitCode();
            }}
            onClick={submitCode}
          >
            {verifying ? 'Signerer…' : 'Signer med kode'}
          </Button>
        </form>
      )}

      {shownError ? (
        <p ref={alertRef} role="alert" className="text-sm text-red-600">{shownError}</p>
      ) : null}

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
          <Button type="submit" variant="outline" disabled={!reason.trim() || verifying || sending} className="text-red-600 min-h-11">
            Avvis avtalen
          </Button>
        </form>
      )}

      {message && <p className="text-sm text-emerald-700">{message}</p>}
    </div>
  );
}
