import { Fragment, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Download, ChevronDown, ChevronUp, FileText, FileSpreadsheet } from 'lucide-react';
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { getShiftBreakdown, getWorkerTeamKey } from '@/utils/payCalc';
import { getActiveTeams } from '@/utils/teams';
import { canSeeWageCosts, effectiveAppRole } from '@/utils/wageAccess';
import { useOrg } from '@/hooks/useOrg';
import { sameEmail } from '@/lib/emails';
import { toast } from '@/components/ui/use-toast';
import PayrollExportColumns from '@/components/payroll/PayrollExportColumns';
import PayrollLockCard from '@/components/payroll/PayrollLockCard';
import {
  DEFAULT_PAYROLL_COLUMN_KEYS,
  payrollCsv,
  payrollRowFromWorker,
  payrollSheetRows,
  resolvePayrollColumns,
} from '@/utils/payrollExport';
import * as XLSX from 'xlsx';

const COLUMN_STORAGE_KEY = 'skiftpro.payrollExportColumns';
const PAYROLL_TAX_RATE = 0.243;

const escHtml = (str) => String(str ?? '').replace(/[&<>"']/g, (c) => {
  const codes = { '&': 38, '<': 60, '>': 62, '"': 34, "'": 39 };
  return '&' + '#' + codes[c] + ';';
});

function readStoredColumns() {
  try {
    const parsed = JSON.parse(localStorage.getItem(COLUMN_STORAGE_KEY) || 'null');
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function sumField(rows, field) {
  return rows.reduce((sum, row) => sum + (Number(row[field]) || 0), 0);
}

function hoursText(value) {
  return `${Number(value || 0).toFixed(1)}t`;
}

export default function Salary() {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [filterWorker, setFilterWorker] = useState('all');
  const [filterTeam, setFilterTeam] = useState('all');
  const [teamDefaultSet, setTeamDefaultSet] = useState(false);
  const [expandedWorker, setExpandedWorker] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [columnKeys, setColumnKeys] = useState(() => readStoredColumns() || DEFAULT_PAYROLL_COLUMN_KEYS);
  const [lockBusy, setLockBusy] = useState(false);

  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);

  const { orgId } = useOrg();
  const { data: workers = [], isPending: workersPending } = useQuery({ queryKey: ['workers', orgId], queryFn: () => orgId ? base44.entities.Worker.filter({ org_id: orgId }) : base44.entities.Worker.list(), enabled: !!orgId });
  const { data: shifts = [] } = useQuery({ queryKey: ['shifts', orgId], queryFn: () => orgId ? base44.entities.Shift.filter({ org_id: orgId }, '-date', 1000) : base44.entities.Shift.list('-date', 1000), enabled: !!orgId });
  const { data: holidays = [] } = useQuery({ queryKey: ['holidays', orgId], queryFn: () => orgId ? base44.entities.Holiday.filter({ org_id: orgId }) : base44.entities.Holiday.list() });
  const { data: wpSettings = [] } = useQuery({ queryKey: ['workplace-settings', orgId], queryFn: () => orgId ? base44.entities.WorkplaceSetting.filter({ org_id: orgId }) : base44.entities.WorkplaceSetting.list(), staleTime: 0 });
  const { data: payrollLocks = [] } = useQuery({
    queryKey: ['payroll-locks', orgId],
    queryFn: () => orgId ? base44.entities.PayrollPeriodLock.filter({ org_id: orgId }) : base44.entities.PayrollPeriodLock.list(),
    enabled: !!orgId,
  });

  const myWorker = workers.find((w) => sameEmail(w.email, currentUser?.email));
  const myTeams = myWorker?.teams || ['team1'];
  const canLock = effectiveAppRole(currentUser, myWorker) === 'admin';

  useEffect(() => {
    if (!teamDefaultSet && myWorker) {
      setFilterTeam(currentUser?.role === 'admin' ? 'all' : (myWorker.teams?.[0] || 'all'));
      setTeamDefaultSet(true);
    }
  }, [myWorker, teamDefaultSet, currentUser?.role]);

  const wp = orgId ? wpSettings.find(s => s.org_id === orgId) : wpSettings[0];
  useEffect(() => {
    if (Array.isArray(wp?.payroll_export_columns) && wp.payroll_export_columns.length > 0) {
      setColumnKeys(wp.payroll_export_columns);
    }
  }, [wp?.payroll_export_columns]);

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
    monthShifts.some(s => s.worker_id === w.id && s.team === filterTeam)
  );
  const displayWorkers = filterWorker === 'all' ? teamFilteredWorkers : teamFilteredWorkers.filter(w => w.id === filterWorker);

  const salaryData = useMemo(() => {
    return displayWorkers.map(worker => {
      const teamKey = filterTeam !== 'all' ? filterTeam : getWorkerTeamKey(worker);
      const workerShifts = monthShifts.filter(s => {
        if (s.worker_id !== worker.id) return false;
        if (filterTeam === 'all') return true;
        if (s.team) return s.team === filterTeam;
        return (worker.teams?.[0] || 'team1') === filterTeam;
      });
      const breakdowns = workerShifts.map(s => getShiftBreakdown(s, worker.hourly_rate || 0, s.team || teamKey, holidays, wp, worker.disabled_extras || [], worker));
      const regularHours = sumField(breakdowns, 'regularHours');
      const sundayHours = sumField(breakdowns, 'sundayHours');
      const holidayHours = sumField(breakdowns, 'holidayHours');
      const extraHours = sumField(breakdowns, 'extraHours');
      const nightHours = sumField(breakdowns, 'nightHours');
      const breakHours = sumField(breakdowns, 'breakHours');
      const sickHours = sumField(breakdowns, 'sickHours');
      const egenmeldingHours = sumField(breakdowns, 'egenmeldingHours');
      const sykmeldingHours = sumField(breakdowns, 'sykmeldingHours');
      const ferieHours = sumField(breakdowns, 'ferieHours');
      const totalHours = regularHours + extraHours + sickHours + ferieHours;
      const totalPay = breakdowns.reduce((sum, b) => sum + b.pay, 0);
      const extraBonus = breakdowns.reduce((sum, b) => sum + b.extraBonus, 0);
      const completedShifts = workerShifts.filter(s => s.status === 'completed').length;
      return {
        worker, breakdowns, regularHours, sundayHours, holidayHours, extraHours,
        nightHours, breakHours, sickHours, egenmeldingHours, sykmeldingHours, ferieHours, totalHours, totalPay, extraBonus,
        completedShifts, totalShifts: workerShifts.length,
      };
    }).sort((a, b) => b.totalPay - a.totalPay);
  }, [displayWorkers, monthShifts, holidays, wp]);

  const grandTotalHours = salaryData.reduce((sum, d) => sum + d.totalHours, 0);
  const grandTotalPay = salaryData.reduce((sum, d) => sum + d.totalPay, 0);
  const grandTotalTax = grandTotalPay * PAYROLL_TAX_RATE;
  const grandTotalCost = grandTotalPay + grandTotalTax;
  const periodLabel = format(month, 'MMMM yyyy');
  const teamLabel = filterTeam === 'all' ? 'Alle team' : (wp?.[`${filterTeam}_name`] || filterTeam);
  const exportColumns = resolvePayrollColumns(columnKeys);
  const exportRows = salaryData.map((entry) => payrollRowFromWorker(entry, {
    period: format(month, 'yyyy-MM'),
    team: teamLabel,
  }, PAYROLL_TAX_RATE));

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    const csv = payrollCsv(exportRows, exportColumns, { period: periodLabel, team: teamLabel });
    downloadBlob(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }), `lønn-${format(month, 'yyyy-MM')}.csv`);
  };

  const exportExcel = () => {
    const sheet = XLSX.utils.aoa_to_sheet(payrollSheetRows(exportRows, exportColumns));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Lønn');
    XLSX.writeFile(book, `lønn-${format(month, 'yyyy-MM')}.xlsx`);
  };

  const saveColumns = async (keys) => {
    setColumnKeys(keys);
    try { localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(keys)); } catch { /* private mode */ }
    if (!wp?.id) return;
    try {
      await base44.entities.WorkplaceSetting.update(wp.id, { payroll_export_columns: keys });
      queryClient.invalidateQueries({ queryKey: ['workplace-settings'] });
    } catch (error) {
      toast({ title: 'Kolonnene er lagret i nettleseren', description: error.message, variant: 'destructive' });
    }
  };

  const lockPeriod = async (payload) => {
    setLockBusy(true);
    try {
      await base44.entities.PayrollPeriodLock.create({ ...payload, org_id: orgId || undefined });
      queryClient.invalidateQueries({ queryKey: ['payroll-locks'] });
      toast({ title: 'Lønnsperioden er låst' });
    } catch (error) {
      toast({ title: 'Kunne ikke låse perioden', description: error.message, variant: 'destructive' });
    } finally {
      setLockBusy(false);
    }
  };

  const unlockPeriod = async (lock) => {
    setLockBusy(true);
    try {
      await base44.entities.PayrollPeriodLock.update(lock.id, { unlocked_at: new Date().toISOString() });
      queryClient.invalidateQueries({ queryKey: ['payroll-locks'] });
      toast({ title: 'Lønnsperioden er låst opp' });
    } catch (error) {
      toast({ title: 'Kunne ikke låse opp', description: error.message, variant: 'destructive' });
    } finally {
      setLockBusy(false);
    }
  };

  const exportPDF = () => {
    const hourCols = [
      ['Vanlige t.', 'regularHours'],
      ['Pause', 'breakHours'],
      ['Natt t.', 'nightHours'],
      ['Søndag t.', 'sundayHours'],
      ['Helligdag t.', 'holidayHours'],
      ['Syk t.', 'sickHours'],
      ['Egenmelding t.', 'egenmeldingHours'],
      ['Sykmelding t.', 'sykmeldingHours'],
      ['Ferie t.', 'ferieHours'],
    ];
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Lønnsrapport ${escHtml(periodLabel)}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; font-size: 10px; color: #1e293b; padding: 24px; }
          h1 { font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
          .subtitle { font-size: 11px; color: #64748b; margin-bottom: 16px; }
          .note { font-size: 10px; color: #64748b; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; }
          thead tr { background: #f8fafc; }
          th { padding: 6px 6px; text-align: right; font-size: 8px; text-transform: uppercase; letter-spacing: 0.04em; color: #94a3b8; border-bottom: 2px solid #e2e8f0; }
          th:first-child { text-align: left; }
          td { padding: 7px 6px; text-align: right; border-bottom: 1px solid #f1f5f9; }
          td:first-child { text-align: left; }
          .worker-name { font-weight: 600; color: #0f172a; }
          .worker-sub { font-size: 8px; color: #94a3b8; }
          .total-pay { font-weight: 700; color: #0f172a; }
          .tfoot-total td { background: #f8fafc; font-weight: 700; border-top: 2px solid #cbd5e1; }
          .tfoot-tax td { background: #fff7ed; color: #c2410c; font-weight: 600; }
          .tfoot-grand td { background: #1e293b; color: white; font-weight: 700; }
          .detail-section { margin-top: 20px; }
          .worker-header { background: #eff6ff; padding: 6px 10px; font-weight: 700; font-size: 11px; color: #1e40af; }
          @media print { body { padding: 12px; } }
        </style>
      </head>
      <body>
        <h1>Lønnsrapport</h1>
        <p class="subtitle">${escHtml(periodLabel)} &nbsp;•&nbsp; ${escHtml(teamLabel)}</p>
        <p class="note">Natt-, søndag- og helligdagstimer er tillegg og kan overlappe vanlige timer. Syk og ferie telles for seg. Egenmelding og sykmelding inngår i Syk og vises også for seg.</p>
        <table>
          <thead>
            <tr>
              <th>Ansatt</th>
              ${hourCols.map(([label]) => `<th>${label}</th>`).join('')}
              <th>Total t.</th>
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
                ${hourCols.map(([, key]) => `<td>${hoursText(d[key])}</td>`).join('')}
                <td><strong>${hoursText(d.totalHours)}</strong></td>
                <td class="total-pay">${d.totalPay.toFixed(0)} kr</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr class="tfoot-total">
              <td>Total</td>
              ${hourCols.map(([, key]) => `<td>${hoursText(salaryData.reduce((s, d) => s + d[key], 0))}</td>`).join('')}
              <td>${hoursText(grandTotalHours)}</td>
              <td>${grandTotalPay.toFixed(0)} kr</td>
            </tr>
            <tr class="tfoot-tax">
              <td colspan="${hourCols.length + 2}">+ Sosiale kostnader (24,3%)</td>
              <td>${grandTotalTax.toFixed(0)} kr</td>
            </tr>
            <tr class="tfoot-grand">
              <td colspan="${hourCols.length + 2}">Total kostnad</td>
              <td>${grandTotalCost.toFixed(0)} kr</td>
            </tr>
          </tfoot>
        </table>
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

  const totals = {
    regularHours: salaryData.reduce((s, d) => s + d.regularHours, 0),
    breakHours: salaryData.reduce((s, d) => s + d.breakHours, 0),
    nightHours: salaryData.reduce((s, d) => s + d.nightHours, 0),
    sundayHours: salaryData.reduce((s, d) => s + d.sundayHours, 0),
    holidayHours: salaryData.reduce((s, d) => s + d.holidayHours, 0),
    sickHours: salaryData.reduce((s, d) => s + d.sickHours, 0),
    egenmeldingHours: salaryData.reduce((s, d) => s + d.egenmeldingHours, 0),
    sykmeldingHours: salaryData.reduce((s, d) => s + d.sykmeldingHours, 0),
    ferieHours: salaryData.reduce((s, d) => s + d.ferieHours, 0),
  };

  return (
    <div className="space-y-6">
      <PayrollLockCard locks={payrollLocks} canLock={canLock} busy={lockBusy} onLock={lockPeriod} onUnlock={unlockPeriod} />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setMonth(subMonths(month, 1))}><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-sm font-medium text-slate-700 min-w-[120px] text-center">{periodLabel}</span>
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
          <Button variant="outline" onClick={exportExcel} className="gap-2"><FileSpreadsheet className="w-4 h-4" /> Excel</Button>
          <Button variant="outline" onClick={exportPDF} className="gap-2"><FileText className="w-4 h-4" /> PDF</Button>
        </div>
      </div>

      <PayrollExportColumns selected={columnKeys} onChange={saveColumns} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Totale timer</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{grandTotalHours.toFixed(1)}t</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Pause trukket</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{totals.breakHours.toFixed(1)}t</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Total lønn</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{grandTotalPay.toFixed(0)} kr</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">Ansatte</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{salaryData.length}</p>
          <p className="text-xs text-slate-400 mt-1">Nattillegg kommer i tillegg til søndag og helligdag</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 text-left font-medium">Ansatt</th>
                <th className="px-3 py-3 text-right font-medium">Vanlige</th>
                <th className="px-3 py-3 text-right font-medium">Pause</th>
                <th className="px-3 py-3 text-right font-medium">Natt</th>
                <th className="px-3 py-3 text-right font-medium">Søndag</th>
                <th className="px-3 py-3 text-right font-medium">Helligdag</th>
                <th className="px-3 py-3 text-right font-medium">Syk</th>
                <th className="px-3 py-3 text-right font-medium">Egenmelding</th>
                <th className="px-3 py-3 text-right font-medium">Sykmelding</th>
                <th className="px-3 py-3 text-right font-medium">Ferie</th>
                <th className="px-3 py-3 text-right font-medium">Total</th>
                <th className="px-3 py-3 text-right font-medium">Timesats</th>
                <th className="px-4 py-3 text-right font-medium">Total lønn</th>
                <th className="px-2 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {salaryData.map((row) => (
                <Fragment key={row.worker.id}>
                  <tr className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full text-white text-sm flex items-center justify-center font-medium" style={{ backgroundColor: row.worker.color || '#3B82F6' }}>
                          {row.worker.name?.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{row.worker.name}</p>
                          <p className="text-xs text-slate-400">{row.totalShifts} vakter</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4 text-right text-slate-600">{row.regularHours.toFixed(1)}t</td>
                    <td className="px-3 py-4 text-right text-slate-500">{row.breakHours > 0 ? `${row.breakHours.toFixed(1)}t` : '—'}</td>
                    <td className="px-3 py-4 text-right text-indigo-600">{row.nightHours > 0 ? `${row.nightHours.toFixed(1)}t` : '—'}</td>
                    <td className="px-3 py-4 text-right text-amber-600">{row.sundayHours > 0 ? `${row.sundayHours.toFixed(1)}t` : '—'}</td>
                    <td className="px-3 py-4 text-right text-orange-600">{row.holidayHours > 0 ? `${row.holidayHours.toFixed(1)}t` : '—'}</td>
                    <td className="px-3 py-4 text-right text-red-500">{row.sickHours > 0 ? `${row.sickHours.toFixed(1)}t` : '—'}</td>
                    <td className="px-3 py-4 text-right text-red-500">{row.egenmeldingHours > 0 ? `${row.egenmeldingHours.toFixed(1)}t` : '—'}</td>
                    <td className="px-3 py-4 text-right text-rose-600">{row.sykmeldingHours > 0 ? `${row.sykmeldingHours.toFixed(1)}t` : '—'}</td>
                    <td className="px-3 py-4 text-right text-sky-600">{row.ferieHours > 0 ? `${row.ferieHours.toFixed(1)}t` : '—'}</td>
                    <td className="px-3 py-4 text-right font-semibold text-slate-700">{row.totalHours.toFixed(1)}t</td>
                    <td className="px-3 py-4 text-right text-slate-500">{row.worker.hourly_rate?.toFixed(0)} kr/t</td>
                    <td className="px-4 py-4 text-right font-bold text-slate-900">{row.totalPay.toFixed(0)} kr</td>
                    <td className="px-2 py-4 text-right">
                      {row.breakdowns.length > 0 && (
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => setExpandedWorker(expandedWorker === row.worker.id ? null : row.worker.id)}>
                          {expandedWorker === row.worker.id ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                        </Button>
                      )}
                    </td>
                  </tr>
                  {expandedWorker === row.worker.id && (
                    <tr className="border-t border-slate-100">
                      <td colSpan={14} className="px-4 pb-4 pt-1">
                        <div className="bg-slate-50 rounded-lg p-3 space-y-1.5">
                          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Lønnsdetaljer</p>
                          {row.breakdowns.map((b, i) => (
                            <div key={i} className="flex items-center justify-between gap-3 text-xs">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-slate-400">{format(new Date(b.shift.date + 'T00:00:00'), 'dd. MMM')}</span>
                                <span className={`px-1.5 py-0.5 rounded font-medium ${b.isFerie ? 'bg-sky-100 text-sky-700' : b.isSick ? 'bg-red-100 text-red-700' : b.isExtra ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{b.label}</span>
                                <span className="text-slate-500">{b.isAllDay ? 'Hele dagen' : `${b.shift.start_time}–${b.shift.end_time}`}</span>
                                {b.breakHours > 0 && <span className="text-slate-400">pause {b.breakHours.toFixed(1)}t</span>}
                                {b.nightHours > 0 && <span className="text-indigo-600">natt {b.nightHours.toFixed(1)}t</span>}
                              </div>
                              <div className="text-right space-x-2 shrink-0">
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
                </Fragment>
              ))}
            </tbody>
            {salaryData.length >= 1 && (
              <tfoot>
                <tr className="bg-slate-50 font-semibold border-t border-slate-200">
                  <td className="px-4 py-3 text-slate-700">Total</td>
                  <td className="px-3 py-3 text-right text-slate-600">{totals.regularHours.toFixed(1)}t</td>
                  <td className="px-3 py-3 text-right text-slate-500">{totals.breakHours.toFixed(1)}t</td>
                  <td className="px-3 py-3 text-right text-indigo-600">{totals.nightHours.toFixed(1)}t</td>
                  <td className="px-3 py-3 text-right text-amber-600">{totals.sundayHours.toFixed(1)}t</td>
                  <td className="px-3 py-3 text-right text-orange-600">{totals.holidayHours.toFixed(1)}t</td>
                  <td className="px-3 py-3 text-right text-red-500">{totals.sickHours.toFixed(1)}t</td>
                  <td className="px-3 py-3 text-right text-red-500">{totals.egenmeldingHours.toFixed(1)}t</td>
                  <td className="px-3 py-3 text-right text-rose-600">{totals.sykmeldingHours.toFixed(1)}t</td>
                  <td className="px-3 py-3 text-right text-sky-600">{totals.ferieHours.toFixed(1)}t</td>
                  <td className="px-3 py-3 text-right text-slate-700">{grandTotalHours.toFixed(1)}t</td>
                  <td className="px-3 py-3"></td>
                  <td className="px-4 py-3 text-right text-slate-900">{grandTotalPay.toFixed(0)} kr</td>
                  <td></td>
                </tr>
                <tr className="bg-orange-50 border-t border-orange-100">
                  <td className="px-4 py-3 text-orange-700 font-medium" colSpan={12}>+ Sosiale kostnader <span className="text-xs font-normal text-orange-500">(24,3%)</span></td>
                  <td className="px-4 py-3 text-right text-orange-700 font-semibold">{grandTotalTax.toFixed(0)} kr</td>
                  <td></td>
                </tr>
                <tr className="bg-slate-800 text-white font-bold border-t border-slate-700">
                  <td className="px-4 py-3.5" colSpan={12}>Total kostnad</td>
                  <td className="px-4 py-3.5 text-right text-lg">{grandTotalCost.toFixed(0)} kr</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {salaryData.length === 0 && <div className="py-16 text-center text-sm text-slate-400">Ingen data for denne perioden</div>}
        <p className="px-4 py-3 text-xs text-slate-400 border-t border-slate-100">
          Natt-, søndag- og helligdagstimer er tillegg og kan overlappe vanlige timer. Pause er allerede trukket fra vanlige timer, søndag, helligdag, syk og ferie. Egenmelding og sykmelding inngår i Syk og vises også for seg.
        </p>
      </div>
    </div>
  );
}
