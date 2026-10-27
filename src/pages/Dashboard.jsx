import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { withShiftQuery } from '@/api/shiftQuery';
import ManagerCharts from '@/components/dashboard/ManagerCharts';
import { calcHours, getShiftBreakdown, getWorkerTeamKey } from '@/utils/payCalc';
import { shiftLabelName } from '@/utils/shiftLabels';
import { canSeeWageCosts } from '@/utils/wageAccess';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { format, parseISO, startOfWeek, endOfWeek, addWeeks, subWeeks, getISOWeek, startOfMonth, endOfMonth } from 'date-fns';
import { nb } from 'date-fns/locale';
import { RefreshCw, ChevronRight, CalendarClock, CalendarDays, ChevronLeft, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import StampCard from '@/components/worker/StampCard';
import StaffingIndicator from '@/components/staffing/StaffingIndicator';
import SuperAdminSwitch from '@/components/dashboard/SuperAdminSwitch';
import { useTeamNames } from '@/hooks/useTeamNames';
import { useOrg } from '@/hooks/useOrg';
import { findWorkerByEmail } from '@/lib/workerLookup';
import { ClipboardList } from 'lucide-react';

const PAYROLL_TAX = 0.141;

export default function Dashboard() {
  const [currentUser, setCurrentUser] = useState(null);
  const [myWorker, setMyWorker] = useState(null);
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [mobileView, setMobileView] = useState(() => localStorage.getItem('dashMobileView') === 'true');

  // Sync when toggled from header
  useEffect(() => {
    const onToggle = (e) => setMobileView(e.detail);
    window.addEventListener('dashMobileViewChange', onToggle);
    return () => window.removeEventListener('dashMobileViewChange', onToggle);
  }, []);

  useEffect(() => {
    base44.auth.me().then(async u => {
      setCurrentUser(u);
      if (u?.email) {
        setMyWorker(await findWorkerByEmail(u.email, u.role));
      }
    }).catch(() => {});
  }, []);

  const isManagerOrAdmin = currentUser?.role === 'admin' || currentUser?.role === 'butikksjef' || currentUser?.role === 'sub_admin';
  const showWages = canSeeWageCosts(currentUser, myWorker);
  const teamNames = useTeamNames();
  const { orgId, myOrg, isImpersonating } = useOrg();

  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');
  const weekEndStr = format(endOfWeek(weekStart, { weekStartsOn: 1 }), 'yyyy-MM-dd');

  const { data: shifts = [], refetch } = useQuery(withShiftQuery({
    queryKey: ['shifts-dashboard', myWorker?.org_id, myWorker?.id, weekStartStr],
    queryFn: () => base44.entities.Shift.filter({ worker_id: myWorker.id, date: { $gte: weekStartStr, $lte: weekEndStr } }, 'date', 50),
    enabled: !!myWorker?.id,
  }));

  const { data: wpSettings = [] } = useQuery({
    queryKey: ['workplace-settings', orgId],
    queryFn: () => orgId
      ? base44.entities.WorkplaceSetting.filter({ org_id: orgId })
      : base44.entities.WorkplaceSetting.list(),
  });

  const { data: allWorkers = [] } = useQuery({ queryKey: ['workers', orgId], queryFn: () => orgId ? base44.entities.Worker.filter({ org_id: orgId }) : base44.entities.Worker.list(), enabled: isManagerOrAdmin });
  const { data: allShifts = [] } = useQuery(withShiftQuery({
    queryKey: ['shifts', orgId],
    queryFn: () => base44.entities.Shift.filter({ org_id: orgId }, '-date', 1000),
    enabled: isManagerOrAdmin && !!orgId,
  }));
  const { data: holidays = [] } = useQuery({ queryKey: ['holidays', orgId], queryFn: () => orgId ? base44.entities.Holiday.filter({ org_id: orgId }) : base44.entities.Holiday.list(), enabled: isManagerOrAdmin });
  const { data: monthlyResults = [] } = useQuery({ queryKey: ['monthly-results', orgId], queryFn: () => orgId ? base44.entities.MonthlyResult.filter({ org_id: orgId }) : base44.entities.MonthlyResult.list(), enabled: isManagerOrAdmin });

  const { data: myTasks = [] } = useQuery({
    queryKey: ['my-tasks-dashboard', myWorker?.id],
    queryFn: () => base44.entities.Task.filter({ status: 'open' }),
    enabled: !!myWorker,
    select: (tasks) => tasks.filter(t => {
      const ids = t.assigned_worker_ids?.length ? t.assigned_worker_ids : (t.assigned_worker_id ? [t.assigned_worker_id] : []);
      return ids.includes('all') || ids.includes(myWorker?.id);
    }),
  });

  const { data: myStamps = [] } = useQuery({
    queryKey: ['stamps-dashboard', myWorker?.id, weekStartStr],
    queryFn: () => myWorker
      ? base44.entities.Stamp.filter({ worker_id: myWorker.id, date: { $gte: weekStartStr, $lte: weekEndStr } })
      : [],
    enabled: !!myWorker,
  });
  const stampByDate = useMemo(() => {
    const m = new Map();
    myStamps.forEach(st => { if (st.date) m.set(st.date, st); });
    return m;
  }, [myStamps]);

  const fmtStamp = (iso) => iso ? format(new Date(iso), 'HH:mm') : null;

  const upcomingShifts = shifts
    .filter(s => s.status !== 'cancelled')
    .sort((a, b) => a.date.localeCompare(b.date));

  const todayShifts = shifts.filter(s => s.date === todayStr && s.status !== 'cancelled');
  const isCurrentWeek = weekStartStr === format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const wp = wpSettings[0];

  const thisYear = new Date().getFullYear();
  const thisMonthNum = new Date().getMonth() + 1;
  const monthResult = monthlyResults.find(r => r.year === thisYear && r.month === thisMonthNum && r.team === 'all');

  const lonnskostnader = useMemo(() => {
    if (!isManagerOrAdmin) return 0;
    const mStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    const mEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');
    const mShifts = allShifts.filter(s => s.date >= mStart && s.date <= mEnd && s.status !== 'cancelled');
    let total = 0;
    mShifts.forEach(s => {
      const w = allWorkers.find(w => w.id === s.worker_id);
      if (!w) return;
      const teamKey = getWorkerTeamKey(w);
      total += getShiftBreakdown(s, w.hourly_rate || 0, teamKey, holidays, wp, w.disabled_extras || [], w).pay;
    });
    return total * (1 + PAYROLL_TAX);
  }, [allShifts, allWorkers, holidays, wp, isManagerOrAdmin]);

  const db1 = monthResult?.db1 || 0;
  const svinn = monthResult?.svinn_pct ? db1 * (monthResult.svinn_pct / 100) : (monthResult?.svinn || 0);
  const vareavskrivning = monthResult?.vareavskrivning_pct ? db1 * (monthResult.vareavskrivning_pct / 100) : (monthResult?.vareavskrivning || 0);
  const franchise = monthResult?.franchiseavgift_pct ? db1 * (monthResult.franchiseavgift_pct / 100) : (monthResult?.franchiseavgift || 0);
  const drift = monthResult?.driftskostnader_pct ? db1 * (monthResult.driftskostnader_pct / 100) : (monthResult?.driftskostnader || 0);
  const driftsresultat = db1 - svinn - vareavskrivning - franchise - drift - (showWages ? lonnskostnader : 0);

  return (
    <div className="space-y-4 max-w-4xl mx-auto">

      {/* Super Admin switch (only for platform admin currently linked to a customer org) */}
      {currentUser?.role === 'admin' && <SuperAdminSwitch currentUser={currentUser} />}

      {/* Velkomst-banner */}
      <div className="relative overflow-hidden rounded-2xl shadow-sm">
        <img
          src="https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1600&q=80"
          alt="Ansatte som møtes på arbeidsplassen"
          className="w-full h-40 sm:h-48 object-cover"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 via-slate-900/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-7">
          <p className="text-xs uppercase tracking-wider text-blue-200 font-semibold">Velkommen tilbake</p>
          <h2 className="text-xl sm:text-2xl font-bold text-white mt-1 leading-tight">
            {myOrg?.contact_name ? `Hei, ${myOrg.contact_name.split(' ')[0]} 👋` : isImpersonating ? `Hei, ${myOrg?.name || 'kunde'} 👋` : 'God å se deg igjen 👋'}
          </h2>
          <p className="text-sm text-slate-200 mt-1 max-w-md">
            Her er din oversikt for i dag – stempling, vaktplan og oppgaver på ett sted.
          </p>
        </div>
      </div>

      {/* Stemplingsur card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center">
            <CalendarClock className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold text-slate-800">Stemplingsur</span>
        </div>

        {myWorker && wp ? (
          <div className="px-4 pb-4">
            <StampCard worker={myWorker} workplaceSetting={wp} />
          </div>
        ) : todayShifts.length === 0 ? (
          <div className="px-5 pb-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <CalendarClock className="w-12 h-12 text-slate-200" />
              <p className="text-sm text-slate-400">Du har ingen kommende vakter i dag.</p>
            </div>
            <button
              onClick={() => refetch()}
              className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="px-5 pb-4 space-y-2">
            {todayShifts.map(s => (
              <div key={s.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                <div>
                  <p className="font-semibold text-slate-800">{s.start_time} – {s.end_time}</p>
                  <p className="text-xs text-slate-400">{s.notes || shiftLabelName(s.shift_label) || 'Vakt i dag'}</p>
                </div>
                <span className="text-xs font-medium bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full">
                  {calcHours(s, wp, s.team, myWorker).toFixed(1)}t
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Din vaktplan */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500 flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-slate-800">Din vaktplan</span>
          </div>
          <Link to="/WorkerPortal" className="text-sm font-medium text-blue-600 hover:text-blue-800">
            Vis alle
          </Link>
        </div>

        {/* Week navigation */}
        <div className="flex items-center justify-between px-5 pb-3">
          <button
            onClick={() => setWeekStart(subWeeks(weekStart, 1))}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-slate-600">
            {isCurrentWeek ? 'Denne uken' : `Uke ${getISOWeek(weekStart)}`}
            <span className="text-xs text-slate-400 ml-1">
              ({format(weekStart, 'd. MMM')} – {format(endOfWeek(weekStart, { weekStartsOn: 1 }), 'd. MMM')})
            </span>
          </span>
          <button
            onClick={() => setWeekStart(addWeeks(weekStart, 1))}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {upcomingShifts.length === 0 ? (
          <div className="px-5 pb-6 text-sm text-slate-400 text-center py-4">
            Ingen vakter denne uken.
          </div>
        ) : (
          <div className="pb-2">
            {upcomingShifts.map(s => {
              const date = parseISO(s.date);
              const isToday = s.date === todayStr;
              const stamp = stampByDate.get(s.date);
              const stampIn = fmtStamp(stamp?.stamp_in);
              const stampOut = fmtStamp(stamp?.stamp_out);
              const hasStamps = stampIn || stampOut;
              return (
                <div key={s.id} className={`flex items-center gap-4 px-5 py-3 border-t border-slate-50 hover:bg-slate-50 transition-colors ${isToday ? 'bg-blue-50/40' : ''}`}>
                  <div className="w-10 text-center shrink-0">
                    <div className={`text-lg font-bold leading-tight ${isToday ? 'text-blue-600' : 'text-slate-800'}`}>{format(date, 'd')}</div>
                    <div className="text-xs text-slate-400">{format(date, 'EEE', { locale: nb })}.</div>
                  </div>
                  <div className="flex-1 bg-slate-100 rounded-xl px-4 py-2.5 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">{s.start_time} – {s.end_time}</p>
                      <p className="text-xs text-slate-500">{s.notes || shiftLabelName(s.shift_label) || ''}</p>
                      {hasStamps && (
                        <p className="flex items-center gap-1 text-xs text-emerald-600 mt-0.5 font-medium">
                          <Clock className="w-3 h-3" /> {stampIn || '--:--'} – {stampOut || '--:--'}
                        </p>
                      )}
                    </div>
                    {isToday && <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">I dag</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Mine oppgaver */}
      {myWorker && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-violet-500 flex items-center justify-center">
                <ClipboardList className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-bold text-slate-800">Mine oppgaver</span>
            </div>
            {myTasks.length > 0 && (
              <span className="text-xs font-semibold bg-violet-100 text-violet-700 px-2.5 py-1 rounded-full">{myTasks.length} åpne</span>
            )}
          </div>
          {myTasks.length === 0 ? (
            <div className="px-5 pb-6 text-center text-sm text-slate-400 py-4">
              Ingen åpne oppgaver tildelt deg 🎉
            </div>
          ) : (
            <div className="pb-2 divide-y divide-slate-50">
              {myTasks.map(task => {
                const isOverdue = task.due_date && task.due_date < format(new Date(), 'yyyy-MM-dd');
                return (
                  <div key={task.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${task.priority === 'high' ? 'bg-red-400' : task.priority === 'low' ? 'bg-green-400' : 'bg-slate-300'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{task.title}</p>
                      {task.description && <p className="text-xs text-slate-400 truncate">{task.description}</p>}
                    </div>
                    {task.due_date && (
                      <span className={`text-xs shrink-0 font-medium px-2 py-0.5 rounded-full ${isOverdue ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                        {task.due_date}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Bemanningsstatus i dag – for admin/manager */}
      {isManagerOrAdmin && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <p className="text-sm font-semibold text-slate-700 mb-3">Bemanningsstatus i dag – {format(today, 'd. MMMM', { locale: nb })}</p>
          <div className="flex flex-wrap gap-3">
            {Object.entries(teamNames).map(([t, teamName]) => (
              <div key={t} className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">{teamName}:</span>
                <StaffingIndicator team={t} date={todayStr} shifts={allShifts} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resultat denne måneden */}
      {isManagerOrAdmin && monthResult && (
        <div className={`rounded-2xl border p-5 flex items-center justify-between ${driftsresultat >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center gap-3">
            {driftsresultat >= 0 ? <TrendingUp className="w-7 h-7 text-emerald-600" /> : <TrendingDown className="w-7 h-7 text-red-600" />}
            <div>
              <p className="text-sm font-medium text-slate-600">Driftsresultat – {format(new Date(), 'MMMM yyyy')}</p>
              <p className={`text-2xl font-bold ${driftsresultat >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{Math.round(driftsresultat).toLocaleString('no-NO')} kr</p>
            </div>
          </div>
          <div className="text-right text-xs text-slate-500 space-y-0.5">
            <p>DB1: {Math.round(db1).toLocaleString('no-NO')} kr</p>
            {showWages && <p>Lønn: -{Math.round(lonnskostnader).toLocaleString('no-NO')} kr</p>}
            <p>Øvrige: -{Math.round(svinn + vareavskrivning + franchise + drift).toLocaleString('no-NO')} kr</p>
          </div>
        </div>
      )}

      {/* Manager charts */}
      {showWages && isManagerOrAdmin && !mobileView && (
        <div className="mt-2">
          <ManagerCharts />
        </div>
      )}
    </div>
  );
}