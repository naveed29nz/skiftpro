import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Save, TrendingUp, TrendingDown } from 'lucide-react';
import { getShiftBreakdown, getWorkerTeamKey } from '@/utils/payCalc';
import { format, startOfMonth, endOfMonth } from 'date-fns';

const PAYROLL_TAX = 0.141;
const MONTHS = ['Januar','Februar','Mars','April','Mai','Juni','Juli','August','September','Oktober','November','Desember'];

function fmt(n) {
  return Math.round(n).toLocaleString('no-NO');
}

const EMPTY_FORM = {
  db1: '', svinn: '', svinn_pct: '', vareavskrivning: '', vareavskrivning_pct: '',
  franchiseavgift: '', franchiseavgift_pct: '', driftskostnader: '', driftskostnader_pct: ''
};

function ResultatSheet({ teamKey, teamName, year, month, results, workers, shifts, holidays, wpSettings }) {
  const queryClient = useQueryClient();
  const wp = wpSettings[0];

  const existing = results.find(r => r.year === year && r.month === month && r.team === teamKey);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (existing) {
      setForm({
        db1: existing.db1 || '',
        svinn: existing.svinn || '',
        svinn_pct: existing.svinn_pct || '',
        vareavskrivning: existing.vareavskrivning || '',
        vareavskrivning_pct: existing.vareavskrivning_pct || '',
        franchiseavgift: existing.franchiseavgift || '',
        franchiseavgift_pct: existing.franchiseavgift_pct || '',
        driftskostnader: existing.driftskostnader || '',
        driftskostnader_pct: existing.driftskostnader_pct || '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [existing?.id, year, month, teamKey]);

  const lonnskostnader = useMemo(() => {
    const mStart = format(startOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd');
    const mEnd = format(endOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd');
    const relevantWorkers = teamKey === 'all' ? workers : workers.filter(w => (w.teams || ['team1']).includes(teamKey));
    const workerIds = new Set(relevantWorkers.map(w => w.id));
    const mShifts = shifts.filter(s => s.date >= mStart && s.date <= mEnd && s.status !== 'cancelled' && workerIds.has(s.worker_id));
    let total = 0;
    mShifts.forEach(s => {
      const w = workers.find(w => w.id === s.worker_id);
      if (!w) return;
      const tk = getWorkerTeamKey(w);
      total += getShiftBreakdown(s, w.hourly_rate || 0, tk, holidays, wp, w.disabled_extras || []).pay;
    });
    return total * (1 + PAYROLL_TAX);
  }, [shifts, workers, holidays, wp, year, month, teamKey]);

  const db1 = parseFloat(form.db1) || 0;
  const getSvinn = () => form.svinn_pct ? db1 * (parseFloat(form.svinn_pct) / 100) : parseFloat(form.svinn) || 0;
  const getVareavskrivning = () => form.vareavskrivning_pct ? db1 * (parseFloat(form.vareavskrivning_pct) / 100) : parseFloat(form.vareavskrivning) || 0;
  const getFranchise = () => form.franchiseavgift_pct ? db1 * (parseFloat(form.franchiseavgift_pct) / 100) : parseFloat(form.franchiseavgift) || 0;
  const getDrift = () => form.driftskostnader_pct ? db1 * (parseFloat(form.driftskostnader_pct) / 100) : parseFloat(form.driftskostnader) || 0;

  const totalKostnader = getSvinn() + getVareavskrivning() + getFranchise() + getDrift() + lonnskostnader;
  const resultat = db1 - totalKostnader;

  const saveMut = useMutation({
    mutationFn: async () => {
      const data = {
        year, month, team: teamKey,
        ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, parseFloat(v) || 0]))
      };
      if (existing) return base44.entities.MonthlyResult.update(existing.id, data);
      return base44.entities.MonthlyResult.create(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['monthly-results'] }),
  });

  const handlePctChange = (field, pctField, val) => setForm(f => ({ ...f, [pctField]: val, ...(val ? { [field]: '' } : {}) }));
  const handleKrChange = (field, pctField, val) => setForm(f => ({ ...f, [field]: val, ...(val ? { [pctField]: '' } : {}) }));

  const rows = [
    { label: 'Svinn', field: 'svinn', pctField: 'svinn_pct', val: getSvinn() },
    { label: 'Vareavskrivning', field: 'vareavskrivning', pctField: 'vareavskrivning_pct', val: getVareavskrivning() },
    { label: 'Franchiseavgift', field: 'franchiseavgift', pctField: 'franchiseavgift_pct', val: getFranchise() },
    { label: 'Driftskostnader', field: 'driftskostnader', pctField: 'driftskostnader_pct', val: getDrift() },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
        <div className="grid grid-cols-[1fr_150px_100px_120px] gap-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
          <span>Post</span>
          <span>Beløp (kr)</span>
          <span>% av DB1</span>
          <span className="text-right">Beregnet</span>
        </div>
      </div>

      {/* DB1 */}
      <div className="px-6 py-4 border-b border-slate-200 bg-blue-50/40">
        <div className="grid grid-cols-[1fr_150px_100px_120px] gap-3 items-center">
          <span className="font-semibold text-slate-800">DB1 – Omsetning etter varekjøp</span>
          <Input type="number" min="0" className="h-8 text-sm" value={form.db1}
            onChange={e => setForm(f => ({ ...f, db1: e.target.value }))} placeholder="0" />
          <span className="text-slate-400 text-xs">–</span>
          <span className="text-right font-bold text-blue-700">{fmt(db1)} kr</span>
        </div>
      </div>

      {rows.map(row => (
        <div key={row.field} className="px-6 py-3.5 border-b border-slate-100">
          <div className="grid grid-cols-[1fr_150px_100px_120px] gap-3 items-center">
            <span className="text-sm text-slate-700">{row.label}</span>
            <Input type="number" min="0" className="h-8 text-sm" value={form[row.field]}
              onChange={e => handleKrChange(row.field, row.pctField, e.target.value)} placeholder="0" />
            <div className="relative">
              <Input type="number" min="0" max="100" step="0.1" className="h-8 text-sm pr-6" value={form[row.pctField]}
                onChange={e => handlePctChange(row.field, row.pctField, e.target.value)} placeholder="0" />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
            </div>
            <span className="text-right text-sm text-red-600 font-medium">-{fmt(row.val)} kr</span>
          </div>
        </div>
      ))}

      {/* Lønnskostnader auto */}
      <div className="px-6 py-3.5 border-b border-slate-200 bg-slate-50/60">
        <div className="grid grid-cols-[1fr_150px_100px_120px] gap-3 items-center">
          <div>
            <span className="text-sm font-medium text-slate-700">Lønnskostnader</span>
            <span className="ml-2 text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">automatisk</span>
          </div>
          <span className="text-xs text-slate-400">Fra vaktplan + {(PAYROLL_TAX * 100).toFixed(1)}% AGA</span>
          <span className="text-slate-400 text-xs">–</span>
          <span className="text-right text-sm text-red-600 font-medium">-{fmt(lonnskostnader)} kr</span>
        </div>
      </div>

      {/* Sum */}
      <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
        <div className="grid grid-cols-[1fr_150px_100px_120px] gap-3 items-center">
          <span className="font-semibold text-slate-700">Sum kostnader</span>
          <span /><span />
          <span className="text-right font-bold text-slate-700">-{fmt(totalKostnader)} kr</span>
        </div>
      </div>

      {/* Resultat */}
      <div className={`px-6 py-5 ${resultat >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
        <div className="grid grid-cols-[1fr_150px_100px_120px] gap-3 items-center">
          <div className="flex items-center gap-2">
            {resultat >= 0 ? <TrendingUp className="w-5 h-5 text-emerald-600" /> : <TrendingDown className="w-5 h-5 text-red-600" />}
            <span className={`font-bold text-lg ${resultat >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>Driftsresultat</span>
          </div>
          <span /><span />
          <span className={`text-right font-bold text-xl ${resultat >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmt(resultat)} kr</span>
        </div>
      </div>

      <div className="px-6 py-4 border-t border-slate-100 flex items-center gap-3">
        <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="gap-2">
          <Save className="w-4 h-4" />
          {saveMut.isPending ? 'Lagrer...' : 'Lagre'}
        </Button>
        {saveMut.isSuccess && <p className="text-sm text-emerald-600">Lagret!</p>}
      </div>
    </div>
  );
}

export default function Resultat() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [activeTeam, setActiveTeam] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [myWorker, setMyWorker] = useState(null);

  useEffect(() => {
    base44.auth.me().then(async u => {
      setCurrentUser(u);
      if (u?.email) {
        const ws = await base44.entities.Worker.filter({ email: u.email });
        setMyWorker(ws[0] || null);
      }
    }).catch(() => {});
  }, []);

  const { data: results = [] } = useQuery({ queryKey: ['monthly-results'], queryFn: () => base44.entities.MonthlyResult.list(), placeholderData: (prev) => prev });
  const { data: workers = [] } = useQuery({ queryKey: ['workers'], queryFn: () => base44.entities.Worker.list() });
  const { data: shifts = [] } = useQuery({ queryKey: ['shifts'], queryFn: () => base44.entities.Shift.list('-date', 1000) });
  const { data: holidays = [] } = useQuery({ queryKey: ['holidays'], queryFn: () => base44.entities.Holiday.list() });
  const { data: wpSettings = [] } = useQuery({ queryKey: ['workplace-settings'], queryFn: () => base44.entities.WorkplaceSetting.list() });

  const wp = wpSettings[0];
  const team1Name = wp?.team1_name || 'Team 1';
  const team2Name = wp?.team2_name || 'Team 2';
  const team3Name = wp?.team3_name || 'Team 3';

  const isAdmin = currentUser?.role === 'admin';
  const myTeamKey = myWorker ? (myWorker.teams?.[0] || 'team1') : null;

  const allTeams = [
    { key: 'all', label: 'Totalt' },
    { key: 'team1', label: team1Name },
    { key: 'team2', label: team2Name },
    { key: 'team3', label: team3Name },
  ];

  // Admin sees all teams, sub_admin/butikksjef only sees own team
  const teams = isAdmin ? allTeams : allTeams.filter(t => t.key === myTeamKey);

  // Set default active team once we know role
  const resolvedActiveTeam = activeTeam || (isAdmin ? 'all' : myTeamKey) || 'all';

  return (
    <div className="max-w-3xl space-y-6">
      {/* Month/year + team picker */}
      <div className="flex flex-wrap items-center gap-3">
        <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" value={month} onChange={e => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" value={year} onChange={e => setYear(Number(e.target.value))}>
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Team tabs */}
      {teams.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {teams.map(t => (
            <button key={t.key} onClick={() => setActiveTeam(t.key)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                resolvedActiveTeam === t.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      <ResultatSheet
        key={`${resolvedActiveTeam}-${year}-${month}`}
        teamKey={resolvedActiveTeam}
        teamName={teams.find(t => t.key === activeTeam)?.label}
        year={year}
        month={month}
        results={results}
        workers={workers}
        shifts={shifts}
        holidays={holidays}
        wpSettings={wpSettings}
      />
    </div>
  );
}