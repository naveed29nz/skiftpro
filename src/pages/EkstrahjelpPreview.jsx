import { useState } from 'react';
import { renderTemplate } from '@/contracts/renderTemplate';
import {
  MERARBEID_TEMPLATE,
  MONTHLY_CONTRACT_EXAMPLE,
  formatNoNumber,
  monthlyContractPreview,
} from '@/contracts/ekstrahjelpPeriod';
import EkstrahjelpPeriodeField from '@/components/settings/EkstrahjelpPeriodeField';

/** Dev-only view of the period setting and a monthly merarbeid draft. */
export default function EkstrahjelpPreview() {
  const [periode, setPeriode] = useState('maned');
  const preview = monthlyContractPreview();
  const { evaluation, fields } = preview;
  const body = renderTemplate(MERARBEID_TEMPLATE, fields).text;
  const monthly = periode !== 'uke';

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <form className="bg-white rounded-xl border border-slate-200 p-6 space-y-4" onSubmit={(event) => event.preventDefault()}>
          <div>
            <h1 className="text-base font-semibold text-slate-800">Arbeidsgiver i avtalene</h1>
            <p className="text-xs text-slate-500 mt-1">Innstilling per organisasjon. Standard er måned.</p>
          </div>
          <EkstrahjelpPeriodeField value={periode} onChange={setPeriode} />
        </form>

        <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4" data-testid="ekstrahjelp-kontrakt">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Kontraktsarkiv</p>
              <h2 className="text-lg font-bold text-slate-900">{MONTHLY_CONTRACT_EXAMPLE.workerName}</h2>
              <p className="text-sm text-slate-500 mt-1">
                {fields.periode_fra} – {fields.periode_til}
              </p>
            </div>
            <div className="text-right space-y-1">
              <span className="inline-block rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">Merarbeid</span>
              <span className="ml-2 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">Utkast</span>
              <p className="text-sm font-medium text-red-600">+{formatNoNumber(evaluation.excessHours)} t ekstratimer</p>
            </div>
          </div>
          <p className="text-sm text-slate-600" data-testid="ekstrahjelp-beregning">
            {formatNoNumber(evaluation.weeklyHours)} timer per uke × ({evaluation.days} / 7) = {formatNoNumber(evaluation.contractedHours)} avtalte timer.
            Jobbet {formatNoNumber(evaluation.workedHours)}. Merarbeid {formatNoNumber(evaluation.excessHours)} timer.
          </p>
          {monthly ? (
            <p className="text-sm text-slate-600">Avtalen er et utkast og sendes ikke til den ansatte.</p>
          ) : (
            <p className="text-sm text-amber-800">Uke er valgt. Da vurderes hver uke for seg, og denne månedsavtalen opprettes ikke.</p>
          )}
          {monthly && (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm text-slate-800 border border-slate-100">{body}</pre>
          )}
        </section>
      </div>
    </div>
  );
}
