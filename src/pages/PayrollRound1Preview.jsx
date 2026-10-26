import { useState } from 'react';
import PayrollRulesCard from '@/components/settings/PayrollRulesCard';
import PayrollExportColumns from '@/components/payroll/PayrollExportColumns';
import PayrollLockCard from '@/components/payroll/PayrollLockCard';
import ShiftCellModal from '@/components/shifts/ShiftCellModal';
import { Checkbox } from '@/components/ui/checkbox';
import { WORKER_SUPPLEMENTS } from '@/components/workers/WorkerForm';
import { TeamPaySection } from '@/pages/Settings';
import { DEFAULT_PAYROLL_COLUMN_KEYS } from '@/utils/payrollExport';
import { getShiftBreakdown } from '@/utils/payCalc';

function hoursOrDash(value) {
  return value > 0 ? `${value.toFixed(1)}t` : '—';
}

const INITIAL = {
  workplace_name: 'Narvesen',
  team2_name: 'Oslo S Nord N.417',
  team2_sunday_extra_type: 'percentage',
  team2_sunday_extra_amount: 50,
  team2_holiday_extra_type: 'percentage',
  team2_holiday_extra_amount: 100,
  team2_night_enabled: false,
  team2_night_extra_type: 'none',
  team2_night_extra_amount: 50,
  team2_night_from: '21:00',
  team2_night_to: '06:00',
  team2_auto_break: false,
  team2_break_rules: [],
};

const SAMPLE_LOCKS = [
  { id: 'lock-okt', start_date: '2026-10-01', end_date: '2026-10-15', note: 'Uke 40–41 sendt til lønn', unlocked_at: null },
  { id: 'lock-sep', start_date: '2026-09-01', end_date: '2026-09-30', note: 'September', unlocked_at: '2026-10-02T08:00:00' },
];

/** Dev-only composition of the round-1 payroll screens. Not included in production. */
export default function PayrollRound1Preview() {
  const [form, setForm] = useState(INITIAL);
  const [locks, setLocks] = useState(SAMPLE_LOCKS);
  const [columns, setColumns] = useState(DEFAULT_PAYROLL_COLUMN_KEYS);
  const [showMerking, setShowMerking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [disabledExtras, setDisabledExtras] = useState(['sunday', 'holiday']);
  const toggleExtra = (key) => {
    setDisabledExtras((current) => (
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    ));
  };
  const workerExamples = [
    { name: 'Søndag 25.10', date: '2026-10-25', start_time: '10:00', end_time: '16:00', team: 'team2', break_manual: true, break_minutes: 0 },
    { name: 'Kveld 21.10', date: '2026-10-21', start_time: '18:00', end_time: '23:00', team: 'team2', break_manual: true, break_minutes: 0 },
  ].map((shift) => ({ shift, breakdown: getShiftBreakdown(shift, 230, 'team2', [], form, disabledExtras) }));
  const examples = [
    { name: 'Kari Nord', date: '2026-10-20', start_time: '08:00', end_time: '16:30', break_minutes: 0, break_manual: false, shift_label: '', team: 'team2' },
    { name: 'Kari Nord', date: '2026-10-21', start_time: '22:00', end_time: '06:30', break_minutes: 0, break_manual: false, shift_label: '', team: 'team2' },
    { name: 'Kari Nord', date: '2026-10-25', start_time: '12:00', end_time: '20:00', break_minutes: 0, break_manual: false, shift_label: '', team: 'team2' },
    { name: 'Ola Berg', date: '2026-10-19', start_time: '00:00', end_time: '00:00', all_day: true, shift_label: 'sick', team: 'team2' },
    { name: 'Ola Berg', date: '2026-10-22', start_time: '00:00', end_time: '00:00', all_day: true, shift_label: 'ferie', team: 'team2' },
    { name: 'Syk 1. mai', date: '2026-05-01', start_time: '08:00', end_time: '16:00', break_minutes: 0, break_manual: false, shift_label: 'sick', team: 'team2' },
    { name: 'Egenmelding 2. mai', date: '2026-05-02', start_time: '08:00', end_time: '16:00', break_minutes: 0, break_manual: false, shift_label: 'sick_self', team: 'team2' },
    { name: 'Sykmelding 17. mai', date: '2026-05-17', start_time: '10:00', end_time: '16:00', break_minutes: 0, break_manual: false, shift_label: 'sick_doctor', team: 'team2' },
    { name: 'Jobber 1. mai', date: '2026-05-01', start_time: '08:00', end_time: '16:00', break_minutes: 0, break_manual: false, shift_label: '', team: 'team2' },
  ].map((shift) => ({ shift, breakdown: getShiftBreakdown(shift, 200, 'team2', [], form, []) }));

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Forhåndsvisning</p>
          <h1 className="text-2xl font-semibold text-slate-900">Lønn, runde 1</h1>
        </div>

        <section className="space-y-3" data-screen="pause-natt">
          <PayrollRulesCard teamKeys={['team2']} form={form} setForm={setForm} />
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-3">
            <h2 className="text-base font-semibold text-slate-800">Søndag, helligdag og natt</h2>
            <p className="text-xs text-slate-400">Nattillegg er av til bryteren slås på. Da kan prosent og tidsvindu endres.</p>
            <TeamPaySection teamKey="team2" teamName={form.team2_name} form={form} setForm={setForm} />
          </div>
        </section>

        <section data-screen="las">
          <PayrollLockCard
            locks={locks}
            canLock
            busy={busy}
            onLock={(payload) => {
              setBusy(true);
              setLocks((current) => [{ id: `lock-${Date.now()}`, ...payload, unlocked_at: null }, ...current]);
              setBusy(false);
            }}
            onUnlock={(lock) => {
              setLocks((current) => current.map((item) => (
                item.id === lock.id ? { ...item, unlocked_at: new Date().toISOString() } : item
              )));
            }}
          />
        </section>

        <section data-screen="eksport">
          <PayrollExportColumns selected={columns} onChange={setColumns} />
        </section>

        <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-3" data-screen="ansatt-tillegg">
          <h2 className="text-base font-semibold text-slate-800">Tillegg som gjelder</h2>
          <p className="text-xs text-slate-400">
            Avkrysset tillegg telles som vanlige timer. Natt krever at både butikken og den ansatte har nattillegg på. Timesats 230 kr.
          </p>
          <div className="flex gap-4 flex-wrap">
            {WORKER_SUPPLEMENTS.map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={!disabledExtras.includes(key)}
                  onCheckedChange={() => toggleExtra(key)}
                />
                <span className="text-sm text-slate-700">{label}</span>
              </label>
            ))}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 text-left">Vakt</th>
                <th className="py-2 text-right">Vanlige</th>
                <th className="py-2 text-right">Søndag</th>
                <th className="py-2 text-right">Natt</th>
                <th className="py-2 text-right">Lønn</th>
              </tr>
            </thead>
            <tbody>
              {workerExamples.map(({ shift, breakdown }) => (
                <tr key={shift.date} className="border-t border-slate-100">
                  <td className="py-2">{shift.name}</td>
                  <td className="py-2 text-right">{hoursOrDash(breakdown.regularHours)}</td>
                  <td className="py-2 text-right">{hoursOrDash(breakdown.sundayHours)}</td>
                  <td className="py-2 text-right">{hoursOrDash(breakdown.nightHours)}</td>
                  <td className="py-2 text-right">{breakdown.pay.toFixed(0)} kr</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-3" data-screen="merking">
          <h2 className="text-base font-semibold text-slate-800">Merking</h2>
          <p className="text-xs text-slate-400">Nye vakter kan merkes som egenmelding eller sykmelding. Eldre vakter med Syk vises fortsatt slik.</p>
          <button
            type="button"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
            onClick={() => setShowMerking(true)}
          >
            Åpne vaktdialog
          </button>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden" data-screen="timeliste">
          <div className="px-4 py-3 border-b border-amber-200 bg-amber-50 text-sm text-amber-900">
            Lønnsperioden er låst 1.–15. oktober. Vakter i perioden kan ikke endres.
          </div>
          <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100">
            <p className="text-sm font-medium text-slate-800">Uke 43 · Oslo S Nord N.417</p>
            <div className="flex gap-2">
              <button type="button" className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white">Godkjenn uken</button>
              <button type="button" className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600">2 valgt · Godkjenn timer</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2 text-left">Ansatt</th>
                  <th className="px-3 py-2 text-left">Man 19.</th>
                  <th className="px-3 py-2 text-left">Tir 20.</th>
                  <th className="px-3 py-2 text-left">Ons 21.</th>
                  <th className="px-3 py-2 text-right">Timer</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">Kari Nord</td>
                  <td className="px-3 py-3">
                    <span className="inline-flex rounded bg-slate-100 px-2 py-1 text-xs ring-1 ring-emerald-500">08:00–16:30 · 30 min pause</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex rounded bg-indigo-50 px-2 py-1 text-xs text-indigo-700">22:00–06:30 · natt</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex rounded bg-sky-100 px-2 py-1 text-xs text-sky-700">Ferie · hele dagen</span>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold">23,0t</td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">Ola Berg</td>
                  <td className="px-3 py-3">
                    <span className="inline-flex rounded bg-red-100 px-2 py-1 text-xs text-red-700">Syk · hele dagen</span>
                  </td>
                  <td className="px-3 py-3 text-slate-300">—</td>
                  <td className="px-3 py-3">
                    <span className="inline-flex rounded bg-slate-100 px-2 py-1 text-xs">10:00–16:00</span>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold">13,5t</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-xs text-slate-400 border-t border-slate-100">
            Langt trykk på en vakt åpner samme meny som før. I en låst periode er flytt, kopier, endre og slett utilgjengelig.
          </p>
          <div className="border-t border-slate-100 px-4 py-3">
            <p className="text-xs font-medium text-slate-500 mb-2">Beregnet fra reglene over, timesats 200 kr</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400">
                  <th className="text-left py-1">Dato</th>
                  <th className="text-left">Type</th>
                  <th className="text-right">Timer</th>
                  <th className="text-right">Pause</th>
                  <th className="text-right">Syk</th>
                  <th className="text-right">Egenmelding</th>
                  <th className="text-right">Sykmelding</th>
                  <th className="text-right">Helligdag</th>
                  <th className="text-right">Natt</th>
                  <th className="text-right">Lønn</th>
                </tr>
              </thead>
              <tbody>
                {examples.map(({ shift, breakdown }) => (
                  <tr key={`${shift.name}-${shift.date}`} className="border-t border-slate-50">
                    <td className="py-1">{shift.name}</td>
                    <td>{breakdown.label}</td>
                    <td className="text-right">{breakdown.hours.toFixed(1)}</td>
                    <td className="text-right">{breakdown.breakHours.toFixed(1)}</td>
                    <td className="text-right">{breakdown.sickHours.toFixed(1)}</td>
                    <td className="text-right">{breakdown.egenmeldingHours.toFixed(1)}</td>
                    <td className="text-right">{breakdown.sykmeldingHours.toFixed(1)}</td>
                    <td className="text-right">{breakdown.holidayHours.toFixed(1)}</td>
                    <td className="text-right">{breakdown.nightHours.toFixed(1)}</td>
                    <td className="text-right">{breakdown.pay.toFixed(0)} kr</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {showMerking && (
          <ShiftCellModal
            worker={{ id: 'preview-worker', name: 'Hasham Khan', teams: ['team2'], hourly_rate: 200, color: '#0ea5e9' }}
            day={new Date(2026, 9, 28)}
            shifts={[{
              id: 'legacy-sick',
              worker_id: 'preview-worker',
              worker_name: 'Hasham Khan',
              start_time: '18:00',
              end_time: '22:00',
              break_minutes: 0,
              break_manual: false,
              all_day: false,
              shift_label: 'sick',
              notes: '',
              team: 'team2',
              status: 'scheduled',
            }]}
            workers={[{ id: 'preview-worker', name: 'Hasham Khan', teams: ['team2'], hourly_rate: 200, color: '#0ea5e9' }]}
            onClose={() => setShowMerking(false)}
            onRefresh={() => {}}
            currentTeam="team2"
            teamNames={{ team2: 'Oslo S Nord N.417' }}
            wp={{ ...form, team2_auto_break: true, team2_break_rules: [{ after_minutes: 360, break_minutes: 30 }] }}
          />
        )}
      </div>
    </div>
  );
}
