// @ts-nocheck
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  ACCESS_SENTENCE,
  CANCELLATION_REASONS,
  CONTACT_EMAIL,
  MANUAL_DELETION_SENTENCE,
  NOTICE_SENTENCE,
  RETENTION_SENTENCE,
  WIZARD_STEPS,
  cancellationErrorMessage,
  cancellationSchedule,
  canWithdrawCancellation,
  confirmationText,
  formatLongDate,
  formatOsloDateTime,
  offerForReason,
  offerMailto,
  validateCancellationInput,
} from '@/billing/cancellationTerms';

function DateSummary({ schedule }) {
  const items = [
    {
      label: 'Oppsigelsen begynner',
      value: formatLongDate(schedule.noticeStartsOn),
      note: 'Den 1. i måneden etter at oppsigelsen er sendt.',
      testId: 'cancellation-notice-date',
    },
    {
      label: 'Abonnementet opphører',
      value: formatLongDate(schedule.subscriptionEndsOn),
      note: '30 dager etter at fristen begynte. Dette er sluttdatoen.',
      testId: 'cancellation-end-date',
    },
    {
      label: 'Planlagt slettedato',
      value: formatLongDate(schedule.dataDeletionOn),
      note: '60 dager etter sluttdatoen. Data slettes ikke automatisk.',
      testId: 'cancellation-deletion-date',
    },
  ];
  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.testId} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3" data-testid={item.testId}>
          <dt className="text-xs font-medium text-slate-500">{item.label}</dt>
          <dd className="mt-1 text-sm font-semibold text-slate-900">{item.value}</dd>
          <p className="mt-1 text-xs leading-5 text-slate-500">{item.note}</p>
        </div>
      ))}
    </dl>
  );
}

function StepHeader({ stepId }) {
  const index = WIZARD_STEPS.findIndex((step) => step.id === stepId);
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Steg {index + 1} av 4</p>
      <ol className="mt-3 grid grid-cols-4 gap-2">
        {WIZARD_STEPS.map((step, stepIndex) => (
          <li key={step.id} aria-current={step.id === stepId ? 'step' : undefined}>
            <span className={cn('mb-2 block h-1 rounded-full', stepIndex <= index ? 'bg-blue-600' : 'bg-slate-200')} />
            <span className={cn('text-xs font-medium', stepIndex <= index ? 'text-slate-800' : 'text-slate-400')}>{step.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function CancellationWizard({
  organizationName,
  requesterName,
  requesterEmail,
  existing = null,
  onSubmit,
  onWithdraw,
  preview = false,
  backHref = '/Settings',
  backLabel = 'Tilbake til innstillinger',
  storageNote = '',
}) {
  const [requestedAt] = useState(() => new Date());
  const ignored = useRef(new Set());
  const [step, setStep] = useState(existing?.status === 'scheduled' ? 'receipt' : 'reason');
  const [reasonCode, setReasonCode] = useState('');
  const [reasonDetail, setReasonDetail] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [receipt, setReceipt] = useState(existing?.status === 'scheduled' ? existing : null);
  const [keptOffer, setKeptOffer] = useState(null);
  const [undoArmed, setUndoArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    if (!existing || existing.status !== 'scheduled') return;
    if (ignored.current.has(existing.id)) return;
    setReceipt(existing);
    setStep('receipt');
  }, [existing]);

  const schedule = cancellationSchedule(receipt?.requested_at || requestedAt);
  const displaySchedule = receipt
    ? {
      noticeStartsOn: receipt.notice_starts_on,
      subscriptionEndsOn: receipt.subscription_ends_on,
      dataDeletionOn: receipt.data_deletion_on,
    }
    : schedule;
  const offer = offerForReason(reasonCode);

  const fail = (caught) => {
    setError(cancellationErrorMessage(caught));
    setBusy(false);
  };

  const goNextFromReason = () => {
    const checked = validateCancellationInput({ reasonCode, reasonDetail });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError('');
    setStep('offer');
  };

  const send = async () => {
    if (!accepted || busy) return;
    const checked = validateCancellationInput({ reasonCode, reasonDetail });
    if (!checked.ok) {
      setError(checked.message);
      setStep('reason');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await onSubmit({
        reasonCode: checked.reason.code,
        reasonDetail: checked.detail,
        requestedAt,
      });
      setReceipt(saved);
      setStep('receipt');
      setUndoArmed(false);
    } catch (caught) {
      fail(caught);
      return;
    }
    setBusy(false);
  };

  const withdraw = async () => {
    if (!receipt || busy) return;
    setBusy(true);
    setError('');
    try {
      await onWithdraw(receipt);
      ignored.current.add(receipt.id);
      setReceipt(null);
      setReasonCode('');
      setReasonDetail('');
      setAccepted(false);
      setUndoArmed(false);
      setKeptOffer(null);
      setStep('reason');
      setInfo('Oppsigelsen er angret. Abonnementet fortsetter som før.');
    } catch (caught) {
      fail(caught);
      return;
    }
    setBusy(false);
  };

  if (keptOffer) {
    return (
      <section className="max-w-2xl space-y-6" data-testid="cancellation-kept">
        <div className="rounded-xl border border-emerald-200 bg-white p-6 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Avtalen fortsetter</p>
          <h1 className="text-2xl font-bold text-slate-900">Oppsigelsen er ikke sendt</h1>
          <p className="text-sm leading-6 text-slate-600">
            {organizationName} beholder abonnementet. Ansatte, vakter og avtaler ligger som før, og ingen sluttdato er registrert.
          </p>
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-700">
            <p className="font-medium text-slate-900">{keptOffer.title}</p>
            <p className="mt-1 leading-6">{keptOffer.body}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild>
              <a href={offerMailto(keptOffer, organizationName)}>Skriv til {CONTACT_EMAIL}</a>
            </Button>
            <Button type="button" variant="outline" onClick={() => { setKeptOffer(null); setStep('offer'); }}>
              Tilbake til alternativet
            </Button>
          </div>
        </div>
        <Link to={backHref} className="inline-block text-sm text-blue-700 hover:underline">{backLabel}</Link>
      </section>
    );
  }

  return (
    <section className="max-w-2xl space-y-6" data-testid="cancellation-wizard" data-step={step}>
      <div>
        <Link to={backHref} className="text-sm text-blue-700 hover:underline">{backLabel}</Link>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">Si opp abonnementet</h1>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Oppsigelsen gjelder hele {organizationName}, ikke én ansatt. {NOTICE_SENTENCE}
        </p>
      </div>

      {storageNote && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">{storageNote}</p>
      )}
      {info && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">{info}</p>
      )}

      <StepHeader stepId={step} />

      {step === 'reason' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Hvorfor sier dere opp?</h2>
            <p className="mt-1 text-sm text-slate-500">Svaret brukes til å forstå hva som ikke traff. Det endrer ikke fristen.</p>
          </div>
          <fieldset className="space-y-2">
            <legend className="sr-only">Årsak til oppsigelse</legend>
            {CANCELLATION_REASONS.map((reason) => {
              const selected = reasonCode === reason.code;
              return (
                <label
                  key={reason.code}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 text-sm',
                    selected ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-slate-300',
                  )}
                >
                  <input
                    type="radio"
                    name="cancellation-reason"
                    className="mt-0.5"
                    value={reason.code}
                    checked={selected}
                    onChange={() => {
                      setReasonCode(reason.code);
                      setError('');
                      setInfo('');
                    }}
                  />
                  <span className="font-medium text-slate-800">{reason.label}</span>
                </label>
              );
            })}
          </fieldset>
          {reasonCode === 'annet' && (
            <div className="space-y-1.5">
              <label htmlFor="cancellation-detail" className="text-sm font-medium text-slate-800">Beskriv hvorfor dere sier opp</label>
              <Textarea
                id="cancellation-detail"
                value={reasonDetail}
                onChange={(event) => setReasonDetail(event.target.value)}
                placeholder="Skriv kort hva som gjør at dere avslutter"
                rows={4}
              />
              <p className="text-xs text-slate-500">Minst ti tegn.</p>
            </div>
          )}
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <Button type="button" onClick={goNextFromReason} disabled={!reasonCode} data-testid="cancellation-next">
            Neste
          </Button>
        </div>
      )}

      {step === 'offer' && offer && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <div>
            <p className="text-xs font-medium text-slate-500">Dere valgte: {CANCELLATION_REASONS.find((reason) => reason.code === reasonCode)?.label}</p>
            <h2 className="mt-1 text-base font-semibold text-slate-900">{offer.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{offer.body}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" onClick={() => { setError(''); setKeptOffer(offer); }} data-testid="cancellation-stay">
              {offer.stayLabel}
            </Button>
            <Button type="button" variant="outline" onClick={() => { setError(''); setStep('confirm'); }} data-testid="cancellation-continue">
              {offer.continueLabel}
            </Button>
          </div>
          <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={() => setStep('reason')}>
            Tilbake til årsak
          </button>
        </div>
      )}

      {step === 'confirm' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Bekreft oppsigelsen</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Datoene regnes ut fra tidspunktet oppsigelsen sendes. Kvitteringen viser de registrerte datoene.
            </p>
          </div>
          <DateSummary schedule={displaySchedule} />
          <div className="space-y-2 text-sm leading-6 text-slate-700">
            <p>{RETENTION_SENTENCE}</p>
            <p>{MANUAL_DELETION_SENTENCE}</p>
            <p>{ACCESS_SENTENCE}</p>
          </div>
          <label className="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-3 text-sm leading-6 text-slate-800">
            <Checkbox
              checked={accepted}
              onCheckedChange={(value) => setAccepted(value === true)}
              className="mt-1"
              data-testid="cancellation-accept"
            />
            <span>{confirmationText({ organizationName, schedule: displaySchedule })}</span>
          </label>
          <p className="text-xs text-slate-500">Sendes av {requesterName}{requesterEmail ? ` (${requesterEmail})` : ''}.</p>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="destructive" disabled={!accepted || busy} onClick={send} data-testid="cancellation-confirm">
              {busy ? 'Sender oppsigelsen…' : 'Send oppsigelse'}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setStep('offer')}>
              Tilbake
            </Button>
          </div>
        </div>
      )}

      {step === 'receipt' && receipt && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5" data-testid="cancellation-receipt">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Kvittering</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">Oppsigelsen er registrert</h2>
            <p className="mt-2 text-sm text-slate-600">
              Kvitteringsnummer <span className="font-semibold text-slate-900" data-testid="cancellation-receipt-number">{receipt.receipt_number}</span>
            </p>
            {preview && (
              <p className="mt-2 text-sm text-amber-800">Dette nummeret tilhører forhåndsvisningen og er ikke registrert hos Zastek AS.</p>
            )}
          </div>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500">Kunde</dt>
              <dd className="font-medium text-slate-900">{receipt.org_name || organizationName}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Sendt</dt>
              <dd className="font-medium text-slate-900">{formatOsloDateTime(receipt.requested_at)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Sendt av</dt>
              <dd className="font-medium text-slate-900">{receipt.requested_by_name || requesterName}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Årsak</dt>
              <dd className="font-medium text-slate-900">
                {receipt.reason_label}
                {receipt.reason_detail ? `. ${receipt.reason_detail}` : ''}
              </dd>
            </div>
          </dl>
          <DateSummary schedule={displaySchedule} />
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700">
            <li>Dere bruker SkiftPro ut {formatLongDate(receipt.subscription_ends_on)}.</li>
            <li>{ACCESS_SENTENCE}</li>
            <li>{RETENTION_SENTENCE} Planlagt slettedato er {formatLongDate(receipt.data_deletion_on)}.</li>
            <li>{MANUAL_DELETION_SENTENCE}</li>
          </ol>
          {receipt.acknowledgement && (
            <blockquote className="border-l-2 border-slate-300 pl-3 text-sm leading-6 text-slate-600">
              {receipt.acknowledgement}
            </blockquote>
          )}
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          {canWithdrawCancellation(receipt) && !undoArmed && (
            <Button type="button" variant="outline" onClick={() => setUndoArmed(true)} data-testid="cancellation-undo">
              Angre oppsigelsen
            </Button>
          )}
          {undoArmed && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 space-y-3">
              <p className="text-sm leading-6 text-amber-950">
                Abonnementet fortsetter, og kvitteringen blir stående som angret. Dere kan si opp på nytt senere.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" disabled={busy} onClick={withdraw} data-testid="cancellation-undo-confirm">
                  {busy ? 'Angrer…' : 'Ja, angre oppsigelsen'}
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setUndoArmed(false)}>
                  Nei, behold oppsigelsen
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
