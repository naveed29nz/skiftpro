import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight, Coins, Clock, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { breakdownMap, usePayrollBreakdowns } from '@/payroll/usePayrollBreakdowns';

const LABEL_STYLES = {
  sunday: 'bg-amber-100 text-amber-700',
  holiday: 'bg-red-100 text-red-700',
  extra: 'bg-blue-100 text-blue-700',
  regular: 'bg-slate-100 text-slate-500',
  sick: 'bg-red-100 text-red-700',
  sick_doctor: 'bg-rose-100 text-rose-700',
  ferie: 'bg-sky-100 text-sky-700',
};

function labelKind(b) {
  if (b.isFerie) return 'ferie';
  if (b.shiftLabel === 'sick_doctor' || b.shift?.shift_label === 'sick_doctor') return 'sick_doctor';
  if (b.isSick) return 'sick';
  if (b.label?.startsWith('Helligdag')) return 'holiday';
  if (b.label === 'Søndag') return 'sunday';
  if (b.isExtra) return 'extra';
  return 'regular';
}

export default function WorkerSalaryTab({ worker, shifts, teamNames }) {
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const monthStart = format(month, 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(month), 'yyyy-MM-dd');
  const payrollQuery = usePayrollBreakdowns(worker?.org_id, monthStart, monthEnd);
  const byShift = useMemo(() => breakdownMap(payrollQuery.data), [payrollQuery.data]);

  const rows = useMemo(() => {
    if (!payrollQuery.data) return [];
    const monthShifts = shifts
      .filter(s => s.worker_id === worker.id
        && s.status !== 'cancelled'
        && s.published !== false
        && s.date >= monthStart && s.date <= monthEnd)
      .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
    return monthShifts.map(s => {
      const breakdown = byShift.get(s.id);
      return breakdown ? { shift: s, breakdown } : null;
    }).filter(Boolean);
  }, [shifts, worker, monthStart, monthEnd, payrollQuery.data, byShift]);

  const totalPay = rows.reduce((sum, r) => sum + r.breakdown.pay, 0);
  const totalBonus = rows.reduce((sum, r) => sum + r.breakdown.extraBonus, 0);
  const totalBase = totalPay - totalBonus;
  const totalHours = rows.reduce((sum, r) => sum + r.breakdown.hours, 0);
  const bonusShifts = rows.filter(r => r.breakdown.extraBonus > 0).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setMonth(subMonths(month, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium text-slate-700 min-w-[140px] text-center capitalize">
            {format(month, 'MMMM yyyy')}
          </span>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setMonth(addMonths(month, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>I dag</Button>
      </div>

      {payrollQuery.isLoading && <p className="text-sm text-slate-500">Henter lønn fra serveren…</p>}
      {payrollQuery.isError && <p className="text-sm text-red-600">Kunne ikke hente lønnsberegningen.</p>}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Total timer</p>
            <Clock className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-xl font-bold text-slate-900 mt-1">{totalHours.toFixed(1)}t</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Grunnlønn</p>
            <Coins className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-xl font-bold text-slate-900 mt-1">{totalBase.toFixed(0)} kr</p>
        </div>
        <div className="bg-white rounded-xl border border-amber-200 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-amber-600">Tillegg (natt/søndag/helligdag)</p>
            <CalendarDays className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-xl font-bold text-amber-700 mt-1">+{totalBonus.toFixed(0)} kr</p>
          <p className="text-xs text-amber-500 mt-0.5">{bonusShifts} vakt{bonusShifts !== 1 ? 'er' : ''} med tillegg</p>
        </div>
        <div className="bg-blue-600 rounded-xl p-4 text-white">
          <div className="flex items-center justify-between">
            <p className="text-xs text-blue-100">Total lønn</p>
            <Coins className="w-4 h-4 text-blue-200" />
          </div>
          <p className="text-xl font-bold mt-1">{totalPay.toFixed(0)} kr</p>
          <p className="text-xs text-blue-200 mt-0.5">Inkl. tillegg</p>
        </div>
      </div>

      {/* Per-shift list */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800 text-sm">Lønnsdetaljer</h3>
          <p className="text-xs text-slate-400">Hver vakt med natt-, søndag- og helligdagstillegg. Syk og ferie telles for seg.</p>
        </div>
        {rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">Ingen vakter denne måneden</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map(({ shift, breakdown }) => {
              const kind = labelKind(breakdown);
              const teamLabel = shift.team && teamNames?.[shift.team] ? teamNames[shift.team] : null;
              return (
                <div key={shift.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="text-center min-w-[40px]">
                      <p className="text-xs text-slate-400">{format(new Date(shift.date + 'T00:00:00'), 'EEE')}</p>
                      <p className="text-sm font-bold text-slate-700">{format(new Date(shift.date + 'T00:00:00'), 'd.M')}</p>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium text-slate-800">{breakdown.isAllDay ? 'Hele dagen' : `${shift.start_time}–${shift.end_time}`}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${LABEL_STYLES[kind]}`}>{breakdown.label}</span>
                        {teamLabel && <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{teamLabel}</span>}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{breakdown.hours.toFixed(1)}t · {worker.hourly_rate?.toFixed(0)} kr/t</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-slate-800">{breakdown.pay.toFixed(0)} kr</p>
                    {breakdown.extraBonus > 0 && (
                      <p className="text-xs text-amber-600 font-medium">+{breakdown.extraBonus.toFixed(0)} kr tillegg</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}