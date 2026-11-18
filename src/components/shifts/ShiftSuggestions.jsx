// @ts-nocheck
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addDays, endOfWeek, format, parseISO } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { useOrg } from '@/hooks/useOrg';
import { useCurrentWorker } from '@/hooks/useCurrentWorker';
import { rankEmployees } from '@/lib/autoSchedule';
import { effectiveAppRole } from '@/utils/wageAccess';
import { isFullDayAbsence } from '@/utils/shiftLabels';

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function mergeById(primary = [], extra = []) {
  const seen = new Set();
  const rows = [];
  for (const row of [...primary, ...extra]) {
    const key = row?.id || `${row?.worker_id}|${row?.date}|${row?.start_time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  return rows;
}

export default function ShiftSuggestions({
  workers = [],
  team = '',
  date = '',
  startTime = '',
  endTime = '',
  shiftLabel = '',
  breakMinutes = 0,
  allDay = false,
  excludeShiftId = null,
  selectedWorkerId = '',
  onPick,
  knownShifts = null,
  knownAvailability = null,
  fullTimeHours = 37.5,
  forceShow = false,
}) {
  const { orgId } = useOrg();
  const { user, worker } = useCurrentWorker();
  const role = effectiveAppRole(user, worker);
  const allowed = forceShow || role === 'admin' || role === 'sub_admin' || role === 'butikksjef' || user?.role === 'admin';
  const active = allowed && validDate(date) && startTime && endTime && !allDay && !isFullDayAbsence(shiftLabel);
  const from = active ? format(addDays(parseISO(date), -28), 'yyyy-MM-dd') : null;
  const to = active ? format(endOfWeek(parseISO(date), { weekStartsOn: 1 }), 'yyyy-MM-dd') : null;

  const historyQuery = useQuery({
    queryKey: ['shifts', orgId, 'suggest', from, to],
    enabled: Boolean(active && orgId && from && to),
    queryFn: () => base44.entities.Shift.filter(
      { org_id: orgId, date: { $gte: from, $lte: to } },
      'date',
      2000,
    ),
  });
  const availabilityQuery = useQuery({
    queryKey: ['availability', orgId, 'suggest', from, to],
    enabled: Boolean(active && orgId && from && to && !knownAvailability),
    queryFn: () => base44.entities.Availability.filter(
      { org_id: orgId, date: { $gte: from, $lte: to } },
      'date',
      2000,
    ),
  });

  const ranked = useMemo(() => {
    if (!active) return null;
    return rankEmployees({
      orgId,
      team: team && team !== 'all' ? team : '',
      workers,
      shifts: mergeById(historyQuery.data || [], knownShifts || []),
      availability: knownAvailability || availabilityQuery.data || [],
      fullTimeHours,
      candidate: {
        id: excludeShiftId,
        date,
        start_time: startTime,
        end_time: endTime,
        shift_label: shiftLabel,
        break_minutes: breakMinutes,
        team: team && team !== 'all' ? team : '',
      },
    });
  }, [
    active,
    orgId,
    team,
    workers,
    historyQuery.data,
    knownShifts,
    knownAvailability,
    availabilityQuery.data,
    fullTimeHours,
    excludeShiftId,
    date,
    startTime,
    endTime,
    shiftLabel,
    breakMinutes,
  ]);

  if (!active || !ranked) return null;
  const selected = selectedWorkerId ? ranked.byWorkerId[selectedWorkerId] : null;
  const loading = historyQuery.isLoading || availabilityQuery.isLoading;

  return (
    <div className="space-y-2" data-testid="shift-suggestions">
      {selected?.warnings?.length > 0 && (
        <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-950">
          {selected.warnings.map((text) => <p key={text}>{text}</p>)}
          <p className="mt-1 font-medium">Du kan likevel velge personen.</p>
        </div>
      )}
      <div>
        <p className="text-xs font-medium text-slate-700">Forslag til hvem som tar vakten</p>
        {loading ? (
          <p className="mt-1 text-[11px] text-slate-400">Regner ut forslag…</p>
        ) : ranked.suggestions.length === 0 ? (
          <p className="mt-1 text-[11px] text-slate-500">Ingen ansatte oppfyller reglene. Du kan likevel velge manuelt.</p>
        ) : (
          <div className="mt-1 space-y-1">
            {ranked.suggestions.map((row, index) => {
              const picked = row.workerId === selectedWorkerId;
              return (
                <button
                  key={row.workerId}
                  type="button"
                  data-testid="shift-suggestion"
                  onClick={() => onPick?.(row.workerId)}
                  className={`w-full rounded-md border px-2.5 py-1.5 text-left ${
                    picked ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-medium text-slate-800">{index + 1}. {row.name}</span>
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{row.reasons.join(' · ')}</span>
                  {row.warnings.length > 0 && (
                    <span className="mt-0.5 block text-[11px] leading-snug text-amber-800">{row.warnings.join(' · ')}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
