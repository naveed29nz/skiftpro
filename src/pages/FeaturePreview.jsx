// @ts-nocheck
import { useState } from 'react';
import { Bell, Clock } from 'lucide-react';
import AlertPanel from '@/components/alerts/AlertPanel';
import OnboardingBadge from '@/components/onboarding/OnboardingBadge';
import OnboardingChecklist from '@/components/onboarding/OnboardingChecklist';
import ToleranceBar from '@/components/timesheet/ToleranceBar';
import { buildManagerAlerts, presentAlerts } from '@/lib/managerAlerts';
import { checklistItems, checklistProgress, statusFromOverview } from '@/lib/onboardingChecklist';
import { summarizeTolerance, toleranceVerdict } from '@/timesheet/tolerance';

const TODAY = '2026-11-18';
const ORG = 'de30000000000000000000a1';
const NAMES = {
  team1: 'Narvesen Demo Sentrum',
  team3: 'Narvesen Demo Stasjon',
};

const WORKERS = [
  { id: 'mia', name: 'Mia Solberg', org_id: ORG, teams: ['team1'], ansettelsestype: 'midlertidig_vikar', position: 'Selger', color: '#2563eb' },
  { id: 'jonas', name: 'Jonas Berg', org_id: ORG, teams: ['team1'], ansettelsestype: 'fast', position: 'Selger', color: '#0f766e', phone: '400 00 011', address: 'Karl Johans gate 1' },
  { id: 'nora', name: 'Nora Vik', org_id: ORG, teams: ['team1'], ansettelsestype: 'midlertidig_vikar', position: 'Vikar', color: '#b45309', phone: '400 00 012', address: 'Storgata 2' },
];

function at(day, hours, minutes) {
  return new Date(day, 10, 17, hours, minutes).toISOString();
}

const SHIFTS = [
  { id: 'd1', org_id: ORG, worker_id: 'jonas', worker_name: 'Jonas Berg', date: '2026-11-23', start_time: '07:00', end_time: '15:00', team: 'team1', published: false, status: 'scheduled' },
  { id: 'd2', org_id: ORG, worker_id: 'jonas', worker_name: 'Jonas Berg', date: '2026-11-24', start_time: '07:00', end_time: '15:00', team: 'team1', published: false, status: 'scheduled' },
  { id: 'd3', org_id: ORG, worker_id: 'nora', worker_name: 'Nora Vik', date: '2026-11-25', start_time: '15:00', end_time: '23:00', team: 'team1', published: false, status: 'scheduled' },
  { id: 'd4', org_id: ORG, worker_id: 'mia', worker_name: 'Mia Solberg', date: '2026-11-26', start_time: '07:00', end_time: '15:00', team: 'team1', published: false, status: 'scheduled' },
  { id: 'o1', org_id: ORG, worker_id: 'ledig', date: '2026-11-19', team: 'team3', published: true, status: 'scheduled' },
  { id: 'o2', org_id: ORG, worker_id: 'ledig', date: '2026-11-20', team: 'team3', published: true, status: 'scheduled' },
  { id: 'h1', org_id: ORG, worker_id: 'jonas', worker_name: 'Jonas Berg', date: '2026-11-17', start_time: '08:00', end_time: '16:00', team: 'team1', published: true, status: 'scheduled', hours_approved: false },
  { id: 'h2', org_id: ORG, worker_id: 'nora', worker_name: 'Nora Vik', date: '2026-11-17', start_time: '10:00', end_time: '18:00', team: 'team1', published: true, status: 'scheduled', hours_approved: false },
  { id: 'h3', org_id: ORG, worker_id: 'mia', worker_name: 'Mia Solberg', date: '2026-11-17', start_time: '09:00', end_time: '15:00', team: 'team1', published: true, status: 'scheduled', hours_approved: false },
];

const CONTRACTS = [
  { id: 'c-mia', org_id: ORG, worker_id: 'mia', worker_name: 'Mia Solberg', status: 'sendt', sent_at: '2026-11-12', end_date: '2027-02-06' },
  { id: 'c-nora', org_id: ORG, worker_id: 'nora', worker_name: 'Nora Vik', status: 'signert', end_date: '2026-11-22' },
  { id: 'c-jonas', org_id: ORG, worker_id: 'jonas', worker_name: 'Jonas Berg', status: 'signert' },
];

const STAMPS = {
  'jonas__2026-11-17': { stamp_in: at(2026, 8, 4), stamp_out: at(2026, 16, 2) },
  'nora__2026-11-17': { stamp_in: at(2026, 10, 50), stamp_out: at(2026, 18, 40) },
  'mia__2026-11-17': { stamp_in: at(2026, 9, 5) },
};

const ALERTS = presentAlerts(buildManagerAlerts({
  today: TODAY,
  orgId: ORG,
  teams: ['team1', 'team3'],
  teamNames: NAMES,
  workers: WORKERS,
  contracts: CONTRACTS,
  shifts: SHIFTS,
}), [
  { alert_key: 'hours:team1:2026-11-16:3', read_at: '2026-11-18T08:00:00Z' },
]);

function MiniTimesheet({ minutes, onlyOutside, onMinutes, onOnlyOutside }) {
  const rows = [
    { worker: WORKERS[1], shift: SHIFTS[6], clock: '08:04–16:02' },
    { worker: WORKERS[2], shift: SHIFTS[7], clock: '10:50–18:40' },
    { worker: WORKERS[0], shift: SHIFTS[8], clock: '09:05–' },
  ];
  const stampFor = (shift) => STAMPS[`${shift.worker_id}__${shift.date}`];
  const summary = summarizeTolerance(
    rows.map((row) => row.shift),
    stampFor,
    minutes,
    TODAY,
    { filterTeam: 'team1', workers: WORKERS },
  );
  const shown = rows.filter((row) => !onlyOutside || toleranceVerdict(row.shift, stampFor(row.shift), minutes, TODAY).outside);
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <p className="text-sm font-semibold text-slate-900">Timelister · Narvesen Demo Sentrum</p>
        <p className="text-xs text-slate-500">Uke 47 · mandag 16. nov – søndag 22. nov</p>
      </div>
      <div className="p-3">
        <ToleranceBar
          minutes={minutes}
          onMinutes={onMinutes}
          onlyOutside={onlyOutside}
          onOnlyOutside={onOnlyOutside}
          withinCount={summary.within}
          outsideCount={summary.outside}
          onApprove={() => {}}
        />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2">Ansatt</th>
            <th className="px-4 py-2">Tirsdag 17. nov</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr key={row.worker.id} className="border-t border-slate-100">
              <td className="px-4 py-3 font-medium text-slate-800">{row.worker.name}</td>
              <td className="px-4 py-3">
                <div className={`inline-flex flex-col rounded-md px-2 py-1 ${row.shift.id === 'h1' ? 'bg-slate-50' : 'bg-rose-50 ring-1 ring-rose-300'}`}>
                  <span className="text-xs font-medium text-slate-700">{row.shift.start_time}–{row.shift.end_time}</span>
                  <span className="text-[11px] text-emerald-700">{row.clock}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-3 text-xs text-slate-400">Rekkefølgen er den lagrede butikkrekkefølgen. Lønnstall endres ikke.</p>
    </div>
  );
}

/** Dev-only screens for the alert center, timesheet tolerance and onboarding. */
export default function FeaturePreview() {
  const [minutes, setMinutes] = useState(30);
  const [onlyOutside, setOnlyOutside] = useState(true);
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const miaItems = checklistItems({
    worker: WORKERS[0],
    contracts: CONTRACTS,
    availabilityCount: 0,
    notificationsOn: false,
  });
  const miaStatus = statusFromOverview({
    has_phone: false,
    has_address: false,
    pending_contracts: 1,
    has_availability: false,
    notifications_done: false,
  }, WORKERS[0]);
  const jonasStatus = statusFromOverview({
    has_phone: true,
    has_address: true,
    pending_contracts: 0,
    has_availability: true,
    notifications_done: true,
  }, WORKERS[1]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-emerald-700 px-4 py-1.5 text-xs text-white">Narvesen Demo AS</div>
      <header className="bg-blue-950 text-white" data-screen="varsler">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2">
          <Clock className="h-4 w-4 text-blue-300" />
          <span className="text-sm font-semibold">SkiftPro</span>
          <span className="hidden text-sm text-blue-200 sm:inline">Oversikt</span>
          <span className="hidden text-sm text-blue-200 sm:inline">Timelister</span>
          <span className="hidden text-sm text-blue-200 sm:inline">Ansatte</span>
          <div className="ml-auto flex items-center gap-2">
            <span className="relative flex h-8 w-8 items-center justify-center rounded-md bg-blue-800" data-testid="alert-bell">
              <Bell className="h-4 w-4" />
              <span className="absolute -right-1 -top-1 min-w-[1.1rem] rounded-full bg-rose-500 px-1 text-center text-[10px] font-semibold leading-4">{ALERTS.filter((item) => !item.read).length}</span>
            </span>
            <span className="text-sm text-blue-200">Logg ut</span>
          </div>
        </div>
        <div className="mx-auto grid max-w-5xl gap-4 px-4 pb-4 lg:grid-cols-[18rem_1fr]">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-xl">
            <AlertPanel alerts={ALERTS} />
          </div>
          <div className="hidden rounded-xl border border-blue-900 bg-blue-900/40 p-4 text-sm text-blue-100 lg:block">
            <p className="font-medium text-white">Butikksjef, Narvesen Demo Sentrum</p>
            <p className="mt-2 text-blue-100">Bjellen viser bare denne butikken og Stasjon, som sjefen også har. Ingen e-post eller push sendes herfra.</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <section data-screen="toleranse">
          <MiniTimesheet
            minutes={minutes}
            onlyOutside={onlyOutside}
            onMinutes={setMinutes}
            onOnlyOutside={setOnlyOutside}
          />
        </section>

        <section data-screen="sjekkliste">
          <OnboardingChecklist
            items={miaItems}
            progress={checklistProgress(miaItems)}
            phone={phone}
            address={address}
            onPhone={setPhone}
            onAddress={setAddress}
            onSaveProfile={() => {}}
            onAckNotifications={() => {}}
            onDismiss={() => {}}
            highlight="profil"
          />
        </section>

        <section className="grid gap-4 md:grid-cols-2" data-screen="ansattkort">
          {[
            [WORKERS[0], miaStatus, 'Ny'],
            [WORKERS[1], jonasStatus, 'Aktiv'],
          ].map(([worker, status, label]) => (
            <article key={worker.id} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ backgroundColor: worker.color }}>
                    {worker.name.slice(0, 1)}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{worker.name}</p>
                    <p className="text-xs text-slate-400">{worker.position}</p>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">{label}</span>
              </div>
              <p className="mt-3 text-xs font-medium text-blue-700">Narvesen Demo Sentrum</p>
              <OnboardingBadge status={status} />
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
