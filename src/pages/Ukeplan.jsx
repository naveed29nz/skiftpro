import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Save, CheckCircle2 } from 'lucide-react';
import { getISOWeek } from 'date-fns';
import { useOrg } from '@/hooks/useOrg';

const HOURS = Array.from({ length: 24 }, (_, i) => i); // 0..23
const DAYS = [
  { key: 'mon', label: 'Mandag' },
  { key: 'tue', label: 'Tirsdag' },
  { key: 'wed', label: 'Onsdag' },
  { key: 'thu', label: 'Torsdag' },
  { key: 'fri', label: 'Fredag' },
  { key: 'sat', label: 'Lørdag' },
  { key: 'sun', label: 'Søndag' },
];

function hourLabel(h) {
  return `${String(h).padStart(2, '0')}–${String(h + 1).padStart(2, '0')}`;
}

export default function Ukeplan() {
  const queryClient = useQueryClient();
  const { orgId } = useOrg();
  const [wpSettings, setWpSettings] = useState(null);
  const [team, setTeam] = useState('team1');
  const [useWeekOverride, setUseWeekOverride] = useState(false);
  const [weekNum, setWeekNum] = useState(getISOWeek(new Date()));
  const [yearNum, setYearNum] = useState(new Date().getFullYear());
  const [savedMsg, setSavedMsg] = useState(false);
  const [localGrid, setLocalGrid] = useState({}); // key: hour -> { mon, tue, ... }

  useEffect(() => {
    base44.entities.WorkplaceSetting.list().then(s => {
      // Scope WorkplaceSetting by org_id; superadmin (no orgId) falls back to first.
      setWpSettings(orgId ? (s.find(x => x.org_id === orgId) || null) : (s[0] || null));
    });
  }, [orgId]);

  const activeTeamsCount = wpSettings?.active_teams_count || 1;
  const teamNames = useMemo(() => {
    const names = {};
    for (let i = 1; i <= (wpSettings?.active_teams_count || 1); i++) {
      names[`team${i}`] = wpSettings?.[`team${i}_name`] || `Team ${i}`;
    }
    return names;
  }, [wpSettings]);

  const { data: allBudgets = [] } = useQuery({
    queryKey: ['staffing-budget'],
    queryFn: () => base44.entities.StaffingBudget.list('-created_date', 500),
  });

  // Filter to current team + plan type + org scope.
  // Legacy budgets without org_id are included so pre-multi-tenant data still shows.
  const relevantBudgets = useMemo(() => {
    return allBudgets.filter(b => {
      if (b.team !== team) return false;
      if (orgId && b.org_id && b.org_id !== orgId) return false;
      if (useWeekOverride) return b.week_override === weekNum && b.year_override === yearNum;
      return !b.week_override && !b.year_override;
    });
  }, [allBudgets, team, useWeekOverride, weekNum, yearNum, orgId]);

  // Build grid from DB records
  useEffect(() => {
    const grid = {};
    HOURS.forEach(h => {
      const rec = relevantBudgets.find(b => b.hour === h);
      grid[h] = {
        _id: rec?.id || null,
        mon: rec?.mon ?? 0,
        tue: rec?.tue ?? 0,
        wed: rec?.wed ?? 0,
        thu: rec?.thu ?? 0,
        fri: rec?.fri ?? 0,
        sat: rec?.sat ?? 0,
        sun: rec?.sun ?? 0,
      };
    });
    setLocalGrid(grid);
  }, [relevantBudgets]);

  const handleCell = (hour, day, val) => {
    const num = parseFloat(val) || 0;
    setLocalGrid(prev => ({
      ...prev,
      [hour]: { ...prev[hour], [day]: num },
    }));
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      for (const h of HOURS) {
        const row = localGrid[h];
        const hasData = DAYS.some(d => (row?.[d.key] || 0) > 0);
        const payload = {
          org_id: orgId || null,
          team,
          hour: h,
          mon: row?.mon || 0,
          tue: row?.tue || 0,
          wed: row?.wed || 0,
          thu: row?.thu || 0,
          fri: row?.fri || 0,
          sat: row?.sat || 0,
          sun: row?.sun || 0,
          week_override: useWeekOverride ? weekNum : null,
          year_override: useWeekOverride ? yearNum : null,
        };
        if (row?._id) {
          await base44.entities.StaffingBudget.update(row._id, payload);
        } else if (hasData) {
          await base44.entities.StaffingBudget.create(payload);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staffing-budget'] });
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2500);
    },
  });

  const currentYear = new Date().getFullYear();
  const weekOptions = Array.from({ length: 52 }, (_, i) => i + 1);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Ukeplan – bemanningsbudsjett</h1>
        <p className="text-sm text-slate-500">Sett opp forventet antall ansatte per time per ukedag</p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-500">Butikk:</label>
          <select
            value={team}
            onChange={e => setTeam(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white h-8"
          >
            {Object.entries(teamNames).map(([key, name]) => (
              <option key={key} value={key}>{name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-500">Type:</label>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => setUseWeekOverride(false)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${!useWeekOverride ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              Standard plan
            </button>
            <button
              onClick={() => setUseWeekOverride(true)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${useWeekOverride ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              Ukeoverride
            </button>
          </div>
        </div>

        {useWeekOverride && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500">Uke:</label>
            <select
              value={weekNum}
              onChange={e => setWeekNum(Number(e.target.value))}
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white h-8"
            >
              {weekOptions.map(w => <option key={w} value={w}>Uke {w}</option>)}
            </select>
            <select
              value={yearNum}
              onChange={e => setYearNum(Number(e.target.value))}
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white h-8"
            >
              {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}

        <div className="ml-auto flex items-center gap-3">
          {savedMsg && <span className="text-sm text-emerald-600 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" />Lagret!</span>}
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="gap-1.5">
            <Save className="w-4 h-4" />{saveMut.isPending ? 'Lagrer...' : 'Lagre plan'}
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b-2 border-slate-300">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 w-20 border-r border-slate-200">Time</th>
                {DAYS.map(d => (
                  <th key={d.key} className="px-3 py-3 text-center text-xs font-semibold text-slate-600 min-w-[100px]">
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tfoot>
              <tr className="bg-slate-100 border-t-2 border-slate-300">
                <td className="px-4 py-2.5 text-xs font-bold text-slate-700 border-r border-slate-200">Totalt</td>
                {DAYS.map(d => {
                  const total = HOURS.reduce((sum, h) => sum + (localGrid[h]?.[d.key] || 0), 0);
                  return (
                    <td key={d.key} className="px-3 py-2.5 text-center text-xs font-bold text-slate-800">
                      {total > 0 ? total : <span className="text-slate-300">—</span>}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
            <tbody>
              {HOURS.map(h => {
                const row = localGrid[h] || {};
                const hasAny = DAYS.some(d => (row[d.key] || 0) > 0);
                return (
                  <tr key={h} className={`border-b border-slate-100 ${hasAny ? '' : 'opacity-40'} hover:opacity-100 hover:bg-slate-50`}>
                    <td className="px-4 py-1.5 text-xs font-mono text-slate-500 border-r border-slate-200 bg-slate-50/50">{hourLabel(h)}</td>
                    {DAYS.map(d => (
                      <td key={d.key} className="px-1.5 py-1 text-center">
                        <input
                          type="number"
                          min="0"
                          max="99"
                          step="0.5"
                          value={row[d.key] || ''}
                          onChange={e => handleCell(h, d.key, e.target.value)}
                          placeholder="–"
                          className="w-full h-7 text-center text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}