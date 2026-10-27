import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { withShiftQuery } from '@/api/shiftQuery';
import { format, startOfMonth, endOfMonth, endOfWeek, eachWeekOfInterval, addMonths, subMonths } from 'date-fns';
import { nb } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { getShiftBreakdown, getWorkerTeamKey } from '@/utils/payCalc';
import { getActiveTeams } from '@/utils/teams';
import { TrendingUp, Clock, Wallet, Target, ChevronLeft, ChevronRight } from 'lucide-react';
import { useOrg } from '@/hooks/useOrg';

const TEAM_COLORS = {
  team1: '#3B82F6', team2: '#10B981', team3: '#8B5CF6', team4: '#F59E0B',
  team5: '#EF4444', team6: '#EC4899', team7: '#14B8A6', team8: '#6366F1',
  team9: '#84CC16', team10: '#0EA5E9',
};
const COLOR_FOR = (key, i) => TEAM_COLORS[key] || ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6', '#6366F1'][i % 8];
// AGA 14.1% + feriepenger 12%
const SOCIAL_FACTOR = 1 + 0.141 + 0.12;

export default function ManagerCharts() {
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const monthKey = format(month, 'yyyy-MM');
  const { orgId } = useOrg();
  const budgetStorageKey = `monthly_wage_budget_${orgId || 'global'}_${monthKey}`;
  const [budget, setBudget] = useState(() => {
    const saved = localStorage.getItem(`monthly_wage_budget_${orgId || 'global'}_${format(startOfMonth(new Date()), 'yyyy-MM')}`);
    return saved ? Number(saved) : '';
  });
  // Sync budget from localStorage whenever the selected month changes
  useEffect(() => {
    const saved = localStorage.getItem(budgetStorageKey);
    setBudget(saved ? Number(saved) : '');
  }, [budgetStorageKey]);
  const [editingBudget, setEditingBudget] = useState(false);

  const monthStart = format(month, 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(month), 'yyyy-MM-dd');

  const { data: workers = [] } = useQuery({ queryKey: ['workers', orgId], queryFn: () => orgId ? base44.entities.Worker.filter({ org_id: orgId }) : base44.entities.Worker.list() });
  const { data: allShifts = [] } = useQuery(withShiftQuery({
    queryKey: ['shifts', orgId],
    enabled: !!orgId,
    queryFn: () => base44.entities.Shift.filter({ org_id: orgId }, '-date', 1000),
  }));
  const { data: holidays = [] } = useQuery({ queryKey: ['holidays', orgId], queryFn: () => orgId ? base44.entities.Holiday.filter({ org_id: orgId }) : base44.entities.Holiday.list() });
  const { data: wpSettings = [] } = useQuery({ queryKey: ['workplace-settings', orgId], queryFn: () => orgId ? base44.entities.WorkplaceSetting.filter({ org_id: orgId }) : base44.entities.WorkplaceSetting.list(), staleTime: 0 });

  const wp = wpSettings[0];
  const activeTeams = getActiveTeams(wp, workers);
  const teamNames = Object.fromEntries(activeTeams.map(t => [t.key, t.label]));

  const monthShifts = allShifts.filter(s => s.date >= monthStart && s.date <= monthEnd && s.status !== 'cancelled');

  // Hours and cost per team — uses the shift's own team tag so cross-team
  // workers' cost lands in the department the shift was actually scheduled in.
  const teamData = useMemo(() => {
    const data = {};
    activeTeams.forEach(t => { data[t.key] = { hours: 0, cost: 0 }; });
    monthShifts.forEach(shift => {
      const worker = workers.find(w => w.id === shift.worker_id);
      if (!worker) return;
      const teamKey = shift.team || getWorkerTeamKey(worker);
      if (!data[teamKey]) data[teamKey] = { hours: 0, cost: 0 };
      const breakdown = getShiftBreakdown(shift, worker.hourly_rate || 0, teamKey, holidays, wp, worker.disabled_extras || [], worker);
      data[teamKey].hours += breakdown.hours;
      data[teamKey].cost += breakdown.pay * SOCIAL_FACTOR;
    });
    return activeTeams
      .map((t, i) => ({ key: t.key, name: t.label, hours: Math.round(data[t.key].hours * 10) / 10, cost: Math.round(data[t.key].cost), color: COLOR_FOR(t.key, i) }))
      .filter(d => d.hours > 0 || d.cost > 0);
  // Note: cost already includes social costs (AGA + feriepenger)
  }, [monthShifts, workers, holidays, wp, activeTeams]);

  // Weekly salary cost this month
  const weeklyData = useMemo(() => {
    const weeks = eachWeekOfInterval({ start: month, end: endOfMonth(month) }, { weekStartsOn: 1 });
    return weeks.map(weekStart => {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const weekStartStr = format(weekStart, 'yyyy-MM-dd');
      const weekEndStr = format(weekEnd, 'yyyy-MM-dd');
      let cost = 0;
      monthShifts
        .filter(s => s.date >= weekStartStr && s.date <= weekEndStr)
        .forEach(shift => {
          const worker = workers.find(w => w.id === shift.worker_id);
          if (!worker) return;
          const teamKey = getWorkerTeamKey(worker);
          cost += getShiftBreakdown(shift, worker.hourly_rate || 0, teamKey, holidays, wp, worker.disabled_extras || [], worker).pay * SOCIAL_FACTOR;
        });
      return {
        name: `Uke ${format(weekStart, 'w')}`,
        cost: Math.round(cost),
        budgetLine: budget ? Math.round(Number(budget) / weeks.length) : null,
      };
    });
  }, [monthShifts, workers, holidays, wp, budget]);

  const totalCost = teamData.reduce((s, d) => s + d.cost, 0);
  const totalHours = teamData.reduce((s, d) => s + d.hours, 0);
  const budgetNum = Number(budget) || 0;
  const budgetUsedPct = budgetNum > 0 ? Math.min(100, Math.round((totalCost / budgetNum) * 100)) : null;

  const saveBudget = (val) => {
    const n = Number(val);
    localStorage.setItem(budgetStorageKey, n);
    setBudget(n);
    setEditingBudget(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-base font-semibold text-slate-700 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-500" />
          Innsikt
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMonth(m => startOfMonth(subMonths(m, 1)))}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
            aria-label="Forrige måned"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-slate-700 min-w-[140px] text-center capitalize">
            {format(month, 'MMMM yyyy', { locale: nb })}
          </span>
          <button
            onClick={() => setMonth(m => startOfMonth(addMonths(m, 1)))}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
            aria-label="Neste måned"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMonth(startOfMonth(new Date()))}
            className="ml-1 px-2 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
          >
            I dag
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-1.5 mb-1"><Clock className="w-3.5 h-3.5 text-blue-400" /><p className="text-xs text-slate-400">Timer totalt</p></div>
          <p className="text-xl font-bold text-slate-800">{totalHours.toFixed(1)}t</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-1.5 mb-1"><Wallet className="w-3.5 h-3.5 text-emerald-400" /><p className="text-xs text-slate-400">Totale lønnskostnader</p></div>
          <p className="text-xl font-bold text-slate-800">{totalCost.toLocaleString('no-NO')} kr</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 col-span-2">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5"><Target className="w-3.5 h-3.5 text-amber-400" /><p className="text-xs text-slate-400">Budsjett</p></div>
            <button onClick={() => setEditingBudget(true)} className="text-xs text-blue-500 hover:text-blue-700">Sett budsjett</button>
          </div>
          {editingBudget ? (
            <div className="flex gap-2 mt-1">
              <input
                type="number" autoFocus
                defaultValue={budget}
                className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-sm"
                onBlur={e => saveBudget(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveBudget(e.target.value); if (e.key === 'Escape') setEditingBudget(false); }}
                placeholder="f.eks. 150000"
              />
              <span className="text-sm text-slate-400 self-center">kr</span>
            </div>
          ) : budgetNum > 0 ? (
            <div>
              <div className="flex justify-between items-baseline">
                <p className="text-xl font-bold text-slate-800">{budgetNum.toLocaleString('no-NO')} kr</p>
                <p className={`text-sm font-semibold ${budgetUsedPct > 90 ? 'text-red-600' : budgetUsedPct > 70 ? 'text-amber-600' : 'text-emerald-600'}`}>{budgetUsedPct}% brukt</p>
              </div>
              <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${budgetUsedPct > 90 ? 'bg-red-500' : budgetUsedPct > 70 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                  style={{ width: `${budgetUsedPct}%` }} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-300 mt-1">Ikke satt</p>
          )}
        </div>
      </div>

      {/* Cost per team */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <p className="text-sm font-semibold text-slate-700 mb-4">Lønnskostnad per team</p>
        <p className="text-xs text-slate-400 mb-3">Inkl. AGA (14.1%) + feriepenger (12%)</p>
        {teamData.length === 0 ? <p className="text-sm text-slate-300 text-center py-8">Ingen data</p> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={teamData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} width={40} />
              <Tooltip formatter={(v) => [`${v.toLocaleString('no-NO')} kr`, 'Total lønnskostnad']} />
              <Bar dataKey="cost" radius={[6, 6, 0, 0]}>
                {teamData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Weekly cost vs budget */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <p className="text-sm font-semibold text-slate-700 mb-4">Ukentlig lønnskostnad{budgetNum > 0 ? ' vs. budsjett' : ''}</p>
        <p className="text-xs text-slate-400 mb-3">Inkl. AGA (14.1%) + feriepenger (12%)</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={weeklyData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} width={40} />
            <Tooltip formatter={(v) => [`${v.toLocaleString('no-NO')} kr`]} />
            <Bar dataKey="cost" name="Lønnskostnad" fill="#3B82F6" radius={[6, 6, 0, 0]} />
            {budgetNum > 0 && (
              <ReferenceLine y={Math.round(budgetNum / weeklyData.length)} stroke="#EF4444" strokeDasharray="4 4" label={{ value: 'Budsjett/uke', fill: '#EF4444', fontSize: 11, position: 'right' }} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}