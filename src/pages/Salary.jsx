import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Download, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { getShiftBreakdown, getWorkerTeamKey } from '@/utils/payCalc';
import { getActiveTeams } from '@/utils/teams';
import { canSeeWageCosts } from '@/utils/wageAccess';
import { useOrg } from '@/hooks/useOrg';

const escHtml = (str) => String(str ?? '').replace(/[&<>"']/g, (c) => {
  const codes = { '&': 38, '<': 60, '>': 62, '"': 34, "'": 39 };
  return '&' + '#' + codes[c] + ';';
});

export default function Salary() {
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [filterWorker, setFilterWorker] = useState('all');
  const [filterTeam, setFilterTeam] = useState('all');
  const [teamDefaultSet, setTeamDefaultSet] = useState(false);
  const [expandedWorker, setExpandedWorker] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);

  const { orgId } = useOrg();
  const { data: workers = [], isPending: workersPending } = useQuery({ queryKey: ['workers', orgId], queryFn: () => orgId ? base44.entities.Worker.filter({ org_id: orgId }) : base44.entities.Worker.list(), enabled: !!orgId });
  const { data: shifts = [] } = useQuery({ queryKey: ['shifts', orgId], queryFn: () => orgId ? base44.entities.Shift.filter({ org_id: orgId }, '-date', 1000) : base44.entities.Shift.list('-date', 1000), enabled: !!orgId });
  const { data: holidays = [] } = useQuery({ queryKey: ['holidays', orgId], queryFn: () => orgId ? base44.entities.Holiday.filter({ org_id: orgId }) : base44.entities.Holiday.list() });
  const { data: wpSettings = [] } = useQuery({ queryKey: ['workplace-settings', orgId], queryFn: () => orgId ? base44.entities.WorkplaceSetting.filter({ org_id: orgId }) : base44.entities.WorkplaceSetting.list(), staleTime: 0 });

  const myWorker = workers.find(w => w.email === currentUser?.email);
  const myTeams = myWorker?.teams || ['team1'];

  useEffect(() => {
    if (!teamDefaultSet && myWorker) {
      // Admins default to "Alle team"; others to their own team
      setFilterTeam(currentUser?.role === 'admin' ? 'all' : (myWorker.teams?.[0] || 'all'));
      setTeamDefaultSet(true);
    }
  }, [myWorker, teamDefaultSet, currentUser?.role]);

  const wp = orgId ? wpSettings.find(s => s.org_id === orgId) : wpSettings[0];
  const monthStart = format(month, 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(month), 'yyyy-MM-dd');
  const monthShifts = shifts.filter(s => s.date >= monthStart && s.date <= monthEnd && s.status !== 'cancelled');

  const isAdmin = currentUser?.role === 'admin';
  const isButikksjef = currentUser?.role === 'butikksjef' || currentUser?.role === 'sub_admin';

  const activeWorkers = workers.filter(w => {
    if (w.status === 'inactive') return false;
    if (!isAdmin && isButikksjef) return (w.teams || ['team1']).some(t => myTeams.includes(t));
    return true;
  });

  const teamOptions = getActiveTeams(wp, workers)
    .filter(t => activeWorkers.some(w => (w.teams || ['team1']).includes(t.key)))
    .map(t => ({ value: t.key, label: t.label }));

  const teamFilteredWorkers = filterTeam === 'all' ? activeWorkers : activeWorkers.filter(w =>
    (w.teams || ['team1']).includes(filterTeam) ||
    // Inkluder også ansatte som har vakter tagget til denne avdelingen i måneden,
    // selv om de formelt tilhører et annet team (tverravdeling-arbeid).
    monthShifts.some(s => s.worker_id === w.id && s.team === filterTeam)
  );
  const displayWorkers = filterWorker === 'all' ? teamFilteredWorkers : teamFilteredWorkers.filter(w => w.id === filterWorker);

  const salaryData = useMemo(() => {
    return displayWorkers.map(worker => {
      const teamKey = filterTeam !== 'all' ? filterTeam : getWorkerTeamKey(worker);
      const workerShifts = monthShifts.filter(s => {
        if (s.worker_id !== worker.id) return false;
        // Lønn reflekterer faktisk arbeid: i "Alle team" telles ALLE arbeiderens
        // vakter uansett hvilken avdeling vakten er tagget til (tverravdeling-vakter
        // må ikke forsvinne). Ved spesifikt team-filter telles kun vaktenes tag.
        if (filterTeam === 'all') return true;
        if (s.team) return s.team === filterTeam;
        return (worker.teams?.[0] || 'team1') === filterTeam;
      });
      // Use the shift's own team (not just the worker's primary) so sunday/holiday extras
      // resolve against the department the shift was actually scheduled in.
      const breakdowns = workerShifts.map(s => getShiftBreakdown(s, worker.hourly_rate || 0, s.team || teamKey, holidays, wp, worker.disabled_extras || []));
      const regularHours = breakdowns.reduce((sum, b) => sum + b.regularHours, 0);
      const extraHours = breakdowns.reduce((sum, b) => sum + b.extraHours, 0);
      const sickHours = breakdowns.reduce((sum, b) => sum + (b.sickHours || 0), 0);
      const totalHours = regularHours + extraHours + sickHours;
      const totalPay = breakdowns.reduce((sum, b) => sum + b.pay, 0);
      const extraBonus = breakdowns.reduce((sum, b) => sum + b.extraBonus, 0);
      const completedShifts = workerShifts.filter(s => s.status === 'completed').length;
      return { worker, breakdowns, regularHours, extraHours, sickHours, totalHours, totalPay, extraBonus, completedShifts, totalShifts: workerShifts.length };
    }).sort((a, b) => b.totalPay - a.totalPay);
  }, [displayWorkers, monthShifts, holidays, wp]);

  const grandTotalHours = salaryData.reduce((sum, d) => sum + d.totalHours, 0);
  const grandTotalPay = salaryData.reduce((sum, d) => sum + d.totalPay, 0);
  const PAYROLL_TAX_RATE = 0.243;
  const grandTotalTax = grandTotalPay * PAYROLL_TAX_RATE;
  const grandTotalCost = grandTotalPay + grandTotalTax;

  const exportCSV = () => {
    const sep = ';';
    const monthLabel = format(month, 'MMMM yyyy');
    const teamLabel = filterTeam === 'all' ? 'Alle team' : (wp?.[`${filterTeam}_name`] || filterTeam);

    const lines = [];
    lines.push(`Lønnsrapport${sep}${monthLabel}${sep}${teamLabel}`);
    lines.push('');
    lines.push(['Ansatt', 'Stilling', 'Vanlige timer', 'Ekstra timer', 'Syke timer', 'Totale timer', 'Timesats (kr/t)', 'Grunnlønn (kr)', 'Tillegg (kr)', 'Total lønn (kr)', 'Sosiale avg. 24,3% (kr)', 'Total kostnad (kr)'].join(sep));

    salaryData.forEach(d => {
      const tax = d.totalPay * PAYROLL_TAX_RATE;
      const basePay = d.totalPay - d.extraBonus;
      lines.push([
        `"${d.worker.name}"`,
        `"${d.worker.position || ''}"`,
        d.regularHours.toFixed(1).replace('.', ','),
        d.extraHours.toFixed(1).replace('.', ','),
        (d.sickHours || 0).toFixed(1).replace('.', ','),
        d.totalHours.toFixed(1).replace('.', ','),
        (d.worker.hourly_rate || 0).toFixed(0),
        basePay.toFixed(0),
        d.extraBonus.toFixed(0),
        d.totalPay.toFixed(0),
        tax.toFixed(0),
        (d.totalPay + tax).toFixed(0),
      ].join(sep));
    });

    lines.push('');
    lines.push(['TOTAL', '', salaryData.reduce((s,d)=>s+d.regularHours,0).toFixed(1).replace('.',','), salaryData.reduce((s,d)=>s+d.extraHours,0).toFixed(1).replace('.',','), salaryData.reduce((s,d)=>s+(d.sickHours||0),0).toFixed(1).replace('.',','), grandTotalHours.toFixed(1).replace('.',','), '', '', '', grandTotalPay.toFixed(0), grandTotalTax.toFixed(0), grandTotalCost.toFixed(0)].join(sep));
    lines.push(['+ Sosiale kostnader (24,3%)', '', '', '', '', '', '', '', '', grandTotalTax.toFixed(0), ''].join(sep));
    lines.push(['Total kostnad inkl. avg.', '', '', '', '', '', '', '', '', '', grandTotalCost.toFixed(0)].join(sep));

    // BOM for Excel UTF-8
    const bom = '\uFEFF';
    const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lønn-${format(month, 'yyyy-MM')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const monthLabel = format(month, 'MMMM yyyy');
    const teamLabel = filterTeam === 'all' ? 'Alle team' : (wp?.[`${filterTeam}_name`] || filterTeam);

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Lønnsrapport ${monthLabel}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; padding: 32px; }
          h1 { font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
          .subtitle { font-size: 12px; color: #64748b; margin-bottom: 24px; }
          .summary { display: flex; gap: 16px; margin-bottom: 24px; }
          .summary-card { flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }
          .summary-card .label { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
          .summary-card .value { font-size: 18px; font-weight: 700; color: #0f172a; }
          table { width: 100%; border-collapse: collapse; }
          thead tr { background: #f8fafc; }
          th { padding: 8px 12px; text-align: right; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; border-bottom: 2px solid #e2e8f0; }
          th:first-child { text-align: left; }
          td { padding: 10px 12px; text-align: right; border-bottom: 1px solid #f1f5f9; }
          td:first-child { text-align: left; }
          .worker-name { font-weight: 600; color: #0f172a; }
          .worker-sub { font-size: 9px; color: #94a3b8; }
          .extra { color: #d97706; font-weight: 600; }
          .total-pay { font-weight: 700; color: #0f172a; }
          .tfoot-total td { background: #f8fafc; font-weight: 700; border-top: 2px solid #cbd5e1; padding: 10px 12px; }
          .tfoot-tax td { background: #fff7ed; color: #c2410c; font-weight: 600; border-top: 1px solid #fed7aa; padding: 10px 12px; }
          .tfoot-grand td { background: #1e293b; color: white; font-weight: 700; font-size: 12px; padding: 12px; }
          .detail-section { margin-top: 24px; }
          .detail-section h2 { font-size: 12px; font-weight: 700; color: #475569; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
          .detail-table thead tr { background: #f1f5f9; }
          .detail-table th { font-size: 8px; padding: 6px 10px; }
          .detail-table td { font-size: 10px; padding: 6px 10px; }
          .worker-header { background: #eff6ff; padding: 6px 10px; font-weight: 700; font-size: 11px; color: #1e40af; }
          @media print { body { padding: 16px; } }
        </style>
      </head>
      <body>
        <h1>Lønnsrapport</h1>
        <p class="subtitle">${monthLabel} &nbsp;•&nbsp; ${teamLabel}</p>

        <div class="summary">
          <div class="summary-card">
            <div class="label">Totale timer</div>
            <div class="value">${grandTotalHours.toFixed(1)}t</div>
          </div>
          <div class="summary-card">
            <div class="label">Total lønn</div>
            <div class="value">${grandTotalPay.toFixed(0)} kr</div>
          </div>
          <div class="summary-card">
            <div class="label">Ansatte</div>
            <div class="value">${salaryData.length}</div>
          </div>
          <div class="summary-card">
            <div class="label">Total kostnad inkl. avg.</div>
            <div class="value">${grandTotalCost.toFixed(0)} kr</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Ansatt</th>
              <th>Vanlige t.</th>
              <th>Ekstra t.</th>
              <th>Syk t.</th>
              <th>Total t.</th>
              <th>Timesats</th>
              <th>Total lønn</th>
            </tr>
          </thead>
          <tbody>
            ${salaryData.map(d => `
              <tr>
                <td>
                  <div class="worker-name">${escHtml(d.worker.name)}</div>
                  <div class="worker-sub">${d.totalShifts} vakter${d.worker.position ? ' · ' + escHtml(d.worker.position) : ''}</div>
                </td>
                <td>${d.regularHours.toFixed(1)}t</td>
                <td class="${d.extraHours > 0 ? 'extra' : ''}">${d.extraHours > 0 ? d.extraHours.toFixed(1) + 't' : '—'}</td>
                <td>${(d.sickHours || 0) > 0 ? (d.sickHours || 0).toFixed(1) + 't' : '—'}</td>
                <td><strong>${d.totalHours.toFixed(1)}t</strong></td>
                <td>${d.worker.hourly_rate?.toFixed(0)} kr/t</td>
                <td class="total-pay">${d.totalPay.toFixed(0)} kr</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr class="tfoot-total">
              <td>Total lønn</td>
              <td>${salaryData.reduce((s,d)=>s+d.regularHours,0).toFixed(1)}t</td>
              <td class="extra">${salaryData.reduce((s,d)=>s+d.extraHours,0).toFixed(1)}t</td>
              <td>${salaryData.reduce((s,d)=>s+(d.sickHours||0),0).toFixed(1)}t</td>
              <td>${grandTotalHours.toFixed(1)}t</td>
              <td></td>
              <td>${grandTotalPay.toFixed(0)} kr</td>
            </tr>
            <tr class="tfoot-tax">
              <td>+ Sosiale kostnader (24,3%)</td>
              <td colspan="4"></td>
              <td>${grandTotalTax.toFixed(0)} kr</td>
            </tr>
            <tr class="tfoot-grand">
              <td>Total kostnad</td>
              <td colspan="4"></td>
              <td>${grandTotalCost.toFixed(0)} kr</td>
            </tr>
          </tfoot>
        </table>

        ${salaryData.some(d => d.breakdowns.length > 0) ? `
        <div style="page-break-before: always;"></div>
        <div class="detail-section">
          <h2>Lønnsdetaljer per ansatt</h2>
          ${salaryData.filter(d => d.breakdowns.length > 0).map(d => `
            <div style="margin-bottom:16px;">
              <div class="worker-header">${escHtml(d.worker.name)} — ${d.totalPay.toFixed(0)} kr</div>
              <table class="detail-table">
                <thead><tr><th style="text-align:left">Dato</th><th style="text-align:left">Type</th><th style="text-align:left">Tid</th><th>Timer</th><th>Grunnlønn</th><th>Tillegg</th><th>Total</th></tr></thead>
                <tbody>
                  ${d.breakdowns.map(b => `
                    <tr>
                      <td style="text-align:left">${format(new Date(b.shift.date + 'T00:00:00'), 'dd.MM.yyyy')}</td>
                      <td style="text-align:left">${escHtml(b.label)}</td>
                      <td style="text-align:left">${escHtml(b.shift.start_time)}–${escHtml(b.shift.end_time)}</td>
                      <td>${b.hours.toFixed(1)}t</td>
                      <td>${b.basePay.toFixed(0)} kr</td>
                      <td>${b.extraBonus > 0 ? '+' + b.extraBonus.toFixed(0) + ' kr' : '—'}</td>
                      <td><strong>${b.pay.toFixed(0)} kr</strong></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `).join('')}
        </div>
        ` : ''}
      </body>
      </html>
    `;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
  };

  const waitingForWorkerRole = !!currentUser
    && currentUser.role !== 'admin'
    && currentUser.role !== 'sub_admin'
    && !!orgId
    && workersPending;
  if (!currentUser || waitingForWorkerRole) return null;
  if (!canSeeWageCosts(currentUser, myWorker)) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <p className="text-sm text-slate-600">Lønnstall er bare synlige for administratorer.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setMonth(subMonths(month, 1))}><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-sm font-medium text-slate-700 min-w-[120px] text-center">{format(month, 'MMMM yyyy')}</span>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="w-4 h-4" /></Button>
        </div>
        <div className="flex gap-3 flex-wrap">
          {teamOptions.length > 1 && (
            <Select value={filterTeam} onValueChange={v => { setFilterTeam(v); setFilterWorker('all'); }}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Alle team" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle team</SelectItem>
                {teamOptions.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={filterWorker} onValueChange={setFilterWorker}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Alle ansatte" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle ansatte</SelectItem>
              {teamFilteredWorkers.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportCSV} className="gap-2"><Download className="w-4 h-4" /> CSV</Button>
          <Button variant="outline" onClick={exportPDF} className="gap-2"><FileText className="w-4 h-4" /> PDF</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Totale timer</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{grandTotalHours.toFixed(1)}t</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Total lønn</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{grandTotalPay.toFixed(0)} kr</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Ansatte</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{salaryData.length}</p>
          <p className="text-xs text-slate-400 mt-1">Tillegg konfigurert per team</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                <th className="px-5 py-3 text-left font-medium">Ansatt</th>
                <th className="px-5 py-3 text-right font-medium">Vanlige t.</th>
                <th className="px-5 py-3 text-right font-medium">Ekstra t.</th>
                <th className="px-5 py-3 text-right font-medium">Syk t.</th>
                <th className="px-5 py-3 text-right font-medium">Total t.</th>
                <th className="px-5 py-3 text-right font-medium">Timesats</th>
                <th className="px-5 py-3 text-right font-medium">Total lønn</th>
                <th className="px-5 py-3 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {salaryData.map(({ worker, breakdowns, regularHours, extraHours, sickHours, totalHours, totalPay, totalShifts }) => (
                <>
                  <tr key={worker.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full text-white text-sm flex items-center justify-center font-medium" style={{ backgroundColor: worker.color || '#3B82F6' }}>
                          {worker.name?.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{worker.name}</p>
                          <p className="text-xs text-slate-400">{totalShifts} vakter</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right text-slate-600">{regularHours.toFixed(1)}t</td>
                    <td className="px-5 py-4 text-right">
                      {extraHours > 0
                        ? <span className="font-medium text-amber-600">{extraHours.toFixed(1)}t</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {sickHours > 0
                        ? <span className="font-medium text-red-500">{sickHours.toFixed(1)}t</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-4 text-right font-semibold text-slate-700">{totalHours.toFixed(1)}t</td>
                    <td className="px-5 py-4 text-right text-slate-500">{worker.hourly_rate?.toFixed(0)} kr/t</td>
                    <td className="px-5 py-4 text-right font-bold text-slate-900">{totalPay.toFixed(0)} kr</td>
                    <td className="px-5 py-4 text-right">
                      {breakdowns.length > 0 && (
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => setExpandedWorker(expandedWorker === worker.id ? null : worker.id)}>
                          {expandedWorker === worker.id ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                        </Button>
                      )}
                    </td>
                  </tr>
                  {expandedWorker === worker.id && (
                    <tr key={`${worker.id}-detail`} className="border-t border-slate-100">
                      <td colSpan={8} className="px-5 pb-4 pt-1">
                        <div className="bg-slate-50 rounded-lg p-3 space-y-1.5">
                          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Lønnsdetaljer</p>
                          {breakdowns.map((b, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-slate-400">{format(new Date(b.shift.date + 'T00:00:00'), 'dd. MMM')}</span>
                                <span className={`px-1.5 py-0.5 rounded font-medium ${b.isSick ? 'bg-red-100 text-red-700' : b.isExtra ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{b.label}</span>
                                <span className="text-slate-500">{b.shift.start_time}–{b.shift.end_time}</span>
                              </div>
                              <div className="text-right space-x-2">
                                <span className="text-slate-500">{b.hours.toFixed(1)}t → {b.basePay.toFixed(0)} kr</span>
                                {b.extraBonus > 0 && <span className="text-blue-600 font-medium">+{b.extraBonus.toFixed(0)} kr tillegg</span>}
                                <span className="font-semibold text-slate-700">{b.pay.toFixed(0)} kr</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
            {salaryData.length >= 1 && (
              <tfoot>
                <tr className="bg-slate-50 font-semibold border-t border-slate-200">
                  <td className="px-5 py-3 text-slate-700">Total lønn</td>
                  <td className="px-5 py-3 text-right text-slate-600">{salaryData.reduce((s, d) => s + d.regularHours, 0).toFixed(1)}t</td>
                  <td className="px-5 py-3 text-right text-amber-600">{salaryData.reduce((s, d) => s + d.extraHours, 0).toFixed(1)}t</td>
                  <td className="px-5 py-3 text-right text-red-500">{salaryData.reduce((s, d) => s + (d.sickHours || 0), 0).toFixed(1)}t</td>
                  <td className="px-5 py-3 text-right text-slate-700">{grandTotalHours.toFixed(1)}t</td>
                  <td className="px-5 py-3"></td>
                  <td className="px-5 py-3 text-right text-slate-900 text-base">{grandTotalPay.toFixed(0)} kr</td>
                  <td></td>
                </tr>
                <tr className="bg-orange-50 border-t border-orange-100">
                  <td className="px-5 py-3 text-orange-700 font-medium">+ Sosiale kostnader <span className="text-xs font-normal text-orange-500">(24,3%)</span></td>
                  <td colSpan={5} className="px-5 py-3"></td>
                  <td className="px-5 py-3 text-right text-orange-700 font-semibold">{grandTotalTax.toFixed(0)} kr</td>
                  <td></td>
                </tr>
                <tr className="bg-slate-800 text-white font-bold border-t border-slate-700">
                  <td className="px-5 py-3.5">Total kostnad</td>
                  <td colSpan={5} className="px-5 py-3.5"></td>
                  <td className="px-5 py-3.5 text-right text-lg">{grandTotalCost.toFixed(0)} kr</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {salaryData.length === 0 && <div className="py-16 text-center text-sm text-slate-400">Ingen data for denne perioden</div>}
      </div>
    </div>
  );
}