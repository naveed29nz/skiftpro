import { isEkstrahjelp } from '@/contracts/employment';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { withShiftQuery } from '@/api/shiftQuery';
import { useAuth } from '@/lib/AuthContext';
import { Link } from 'react-router-dom';
import { Clock, CalendarDays, Coins, Users, ArrowLeftRight, LayoutDashboard, LogOut, CheckSquare, FileText, ArrowLeft } from 'lucide-react';
import AvailabilityCalendar from '@/components/worker/AvailabilityCalendar';
import { Button } from '@/components/ui/button';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { calcHours, getShiftBreakdown, getWorkerTeamKey } from '@/utils/payCalc';
import StampCard from '@/components/worker/StampCard';
import StampCorrections from '@/components/worker/StampCorrections';
import PushOptIn from '@/components/PushOptIn';
import WeekSummary from '@/components/worker/WeekSummary';
import ColleaguesToday from '@/components/worker/ColleaguesToday';
import TeamSchedule from '@/components/worker/TeamSchedule';
import ShiftSwapPanel from '@/components/worker/ShiftSwapPanel';
import WorkerTasksTab from '@/components/worker/WorkerTasksTab';
import WorkerContractsTab from '@/components/worker/WorkerContractsTab';
import WorkerSalaryTab from '@/components/worker/WorkerSalaryTab';
import { useTeamNames } from '@/hooks/useTeamNames';
import { sameEmail } from '@/lib/emails';

const TABS = [
  { id: 'dashboard', label: 'Min side', icon: LayoutDashboard },
  { id: 'availability', label: 'Tilgjengelighet', icon: CalendarDays },
  { id: 'team', label: 'Teamplan', icon: Users },
  { id: 'swaps', label: 'Vaktbytte', icon: ArrowLeftRight },
  { id: 'tasks', label: 'Oppgaver', icon: CheckSquare },
  { id: 'salary', label: 'Lønn', icon: Coins },
  { id: 'contracts', label: 'Kontrakter', icon: FileText },
];
// Shifts-tab removed

export default function WorkerPortal() {
  const { user: currentUser, isAuthenticated } = useAuth();
  const [todayStamp, setTodayStamp] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');

  const { data: workers = [], isPending: workersPending } = useQuery({
    queryKey: ['workers'],
    queryFn: () => base44.entities.Worker.list(),
    enabled: isAuthenticated,
  });
  const worker = workers.find((w) => sameEmail(w.email, currentUser?.email));
  const orgId = worker?.org_id || null;
  const shiftQuery = useQuery(withShiftQuery({
    queryKey: ['shifts', orgId, 'portal'],
    enabled: isAuthenticated && !!orgId,
    queryFn: () => base44.entities.Shift.filter({ org_id: orgId }, '-date', 5000),
  }));
  const shifts = Array.isArray(shiftQuery.data) ? shiftQuery.data : [];
  const { data: holidays = [] } = useQuery({ queryKey: ['holidays'], queryFn: () => base44.entities.Holiday.list() });
  const { data: wpSettings = [] } = useQuery({ queryKey: ['workplace-settings'], queryFn: () => base44.entities.WorkplaceSetting.list() });
  const { data: stamps = [] } = useQuery({ queryKey: ['stamps'], queryFn: () => base44.entities.Stamp.list('-date', 100) });

  const workplaceSetting = wpSettings[0];
  const teamNames = useTeamNames();

  const today = format(new Date(), 'yyyy-MM-dd');
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

  useEffect(() => {
    if (worker && stamps.length >= 0) {
      const ts = stamps.find(s => s.worker_id === worker.id && s.date === today);
      setTodayStamp(ts || null);
    }
  }, [worker, stamps, today]);

  if (!currentUser || workersPending) return (
    <div className="flex justify-center py-20">
      <div className="w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );

  if (!worker) {
    return (
      <div className="text-center py-20">
        <Clock className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-slate-700">Ingen worker-profil funnet</h2>
        <p className="text-sm text-slate-400 mt-2">Be admin legge til e-postadressen din ({currentUser.email}) i worker-profilen.</p>
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="text-center py-20">
        <Clock className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-slate-700">Fant ikke butikken din</h2>
        <p className="text-sm text-slate-400 mt-2">Be admin knytte deg til en butikk før vaktene kan vises.</p>
      </div>
    );
  }

  if (shiftQuery.isPending && !shiftQuery.data) return (
    <div className="flex justify-center py-20">
      <div className="w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );

  if (shiftQuery.isError && !shiftQuery.data) return (
    <div className="text-center py-20">
      <Clock className="w-12 h-12 text-slate-300 mx-auto mb-4" />
      <h2 className="text-lg font-semibold text-slate-700">Kunne ikke hente vakter</h2>
      <p className="text-sm text-slate-400 mt-2">Økten var ikke klar. Prøv igjen.</p>
      <Button className="mt-4" onClick={() => shiftQuery.refetch()}>Prøv igjen</Button>
    </div>
  );

  const isAdmin = currentUser?.role === 'admin';

  // Non-admins only see published shifts
  const myShifts = shifts
    .filter(s => s.worker_id === worker.id && s.status !== 'cancelled')
    .filter(s => isAdmin || s.published !== false);
  const monthShifts = myShifts.filter(s => s.date >= monthStart && s.date <= monthEnd);
  const weekShifts = myShifts.filter(s => s.date >= weekStart && s.date <= weekEnd);
  // Vis de NESTE 8 vaktene (ikke de lengst frem i tid). Shifts hentes sortert
  // synkende fra API, så vi må sortere stigende på dato+starttid og ta de første.
  const upcomingShifts = myShifts
    .filter(s => s.date >= today)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start_time || '').localeCompare(b.start_time || ''))
    .slice(0, 8);

  const monthHours = monthShifts.reduce((sum, s) => sum + calcHours(s, workplaceSetting, s.team, worker), 0);
  const weekHours = weekShifts.reduce((sum, s) => sum + calcHours(s, workplaceSetting, s.team, worker), 0);
  const teamKey = getWorkerTeamKey(worker);
  const monthPay = monthShifts.reduce((sum, s) => {
    const shiftTeamKey = s.team || teamKey;
    return sum + getShiftBreakdown(s, worker.hourly_rate || 0, shiftTeamKey, holidays, workplaceSetting, worker.disabled_extras || [], worker).pay;
  }, 0);
  // Ekstrahjelp ser kun egne vakter (Min side) og egen lønn.
  const ekstrahjelpOnly = !isAdmin && isEkstrahjelp(worker?.ansettelsestype);
  const tabs = ekstrahjelpOnly ? TABS.filter(t => t.id === 'dashboard' || t.id === 'salary') : TABS;

  return (
    <div className="space-y-6">

      {/* Worker header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-500 rounded-xl p-5 flex items-center gap-4 text-white">
        <div className="w-14 h-14 rounded-full bg-white/20 text-white text-xl flex items-center justify-center font-bold border-2 border-white/30">
          {worker.name?.charAt(0)}
        </div>
        <div>
          <p className="text-blue-100 text-sm">Hei,</p>
          <h2 className="text-2xl font-bold">{worker.name}</h2>
          <p className="text-blue-200 text-sm mt-0.5">{worker.position || 'Ansatt'} · {worker.hourly_rate} kr/t</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-blue-200 text-xs">{format(new Date(), 'EEEE')}</p>
            <p className="text-white text-lg font-semibold">{format(new Date(), 'MMM d, yyyy')}</p>
          </div>
          {isAdmin && (
            <Link to="/Dashboard">
              <Button variant="ghost" size="sm" className="text-white hover:bg-white/20 gap-1.5">
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Admin</span>
              </Button>
            </Link>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => base44.auth.logout()}
            className="text-white hover:bg-white/20 gap-1.5"
            title="Logg ut"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logg ut</span>
          </Button>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-2 overflow-x-auto">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Availability tab */}
      {!ekstrahjelpOnly && activeTab === 'availability' && <AvailabilityCalendar worker={worker} />}

      {/* Team tab */}
      {!ekstrahjelpOnly && activeTab === 'team' && (
        <TeamSchedule shifts={isAdmin ? shifts : shifts.filter(s => s.published !== false)} workers={workers} currentWorker={worker} wpSettings={wpSettings} />
      )}

      {/* Tasks tab */}
      {!ekstrahjelpOnly && activeTab === 'tasks' && <WorkerTasksTab worker={worker} workers={workers} teamNames={teamNames} />}

      {/* Salary tab — viser tillegg per vakt slik at ansatte ser søndags/helligdagsberegning */}
      {activeTab === 'salary' && (
        <WorkerSalaryTab
          worker={worker}
          shifts={myShifts}
          holidays={holidays}
          wpSettings={wpSettings}
          teamNames={teamNames}
        />
      )}

      {/* Contracts tab */}
      {!ekstrahjelpOnly && activeTab === 'contracts' && <WorkerContractsTab worker={worker} />}

      {/* Swaps tab */}
      {!ekstrahjelpOnly && activeTab === 'swaps' && (
        <ShiftSwapPanel
          worker={worker}
          myShifts={myShifts}
          workers={workers}
          isAdmin={isAdmin}
          allShifts={shifts}
        />
      )}

      {/* Dashboard tab */}
      {activeTab === 'dashboard' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <StampCard
              worker={worker}
              workplaceSetting={workplaceSetting}
              todayStamp={todayStamp}
              onStampChange={setTodayStamp}
            />
            <WeekSummary allShifts={myShifts} today={today} wp={workplaceSetting} worker={worker} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <StampCorrections worker={worker} user={currentUser} />
            <PushOptIn userId={currentUser?.id} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">Denne uken</p>
                <CalendarDays className="w-4 h-4 text-blue-400" />
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-1">{weekHours.toFixed(1)}t</p>
              <p className="text-xs text-slate-400">{weekShifts.length} vakt{weekShifts.length !== 1 ? 'er' : ''} denne uken</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">Denne måneden</p>
                <Clock className="w-4 h-4 text-purple-400" />
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-1">{monthHours.toFixed(1)}t</p>
              <p className="text-xs text-slate-400">{monthShifts.length} vakt{monthShifts.length !== 1 ? 'er' : ''} i {format(new Date(), 'MMMM')}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">Estimert lønn</p>
                <Coins className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-1">{monthPay.toFixed(0)} kr</p>
              <p className="text-xs text-slate-400">{format(new Date(), 'MMMM yyyy')} (inkl. tillegg)</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800">Kommende vakter</h3>
              </div>
              {upcomingShifts.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400">Ingen kommende vakter</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {upcomingShifts.map(shift => {
                    const d = new Date(shift.date + 'T00:00:00');
                    const isSunday = d.getDay() === 0;
                    const holiday = holidays.find(h => h.date === shift.date);
                    const isToday = shift.date === today;
                    const hours = calcHours(shift, workplaceSetting, shift.team, worker);
                    return (
                      <div key={shift.id} className={`px-5 py-3.5 flex items-center justify-between ${isToday ? 'bg-blue-50/50' : ''}`}>
                        <div className="flex items-center gap-3">
                          <div className={`text-center min-w-[44px] p-1.5 rounded-lg ${isToday ? 'bg-blue-100' : 'bg-slate-50'}`}>
                            <p className="text-xs text-slate-400">{format(d, 'EEE')}</p>
                            <p className={`text-base font-bold ${isToday ? 'text-blue-700' : 'text-slate-700'}`}>{format(d, 'd')}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-800">{shift.start_time} – {shift.end_time}</p>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {isToday && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">I dag</span>}
                              {shift.team && teamNames[shift.team] && <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">{teamNames[shift.team]}</span>}
                              {holiday && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded">🎉 {holiday.name}{holiday.pay_multiplier != null ? ` ×${holiday.pay_multiplier}` : ''}</span>}
                              {isSunday && !holiday && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Søndag</span>}
                              {shift.notes && <span className="text-xs text-slate-400">{shift.notes}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-slate-700">{hours.toFixed(1)}t</p>
                          <p className="text-xs text-slate-400">{getShiftBreakdown(shift, worker.hourly_rate || 0, shift.team || teamKey, holidays, workplaceSetting, worker.disabled_extras || [], worker).pay.toFixed(0)} kr</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {!ekstrahjelpOnly && <ColleaguesToday shifts={shifts} workers={workers} currentWorkerId={worker.id} today={today} currentWorkerTeam={(worker.teams || [worker.team || 'team1'])[0]} />}
          </div>
        </>
      )}
    </div>
  );
}