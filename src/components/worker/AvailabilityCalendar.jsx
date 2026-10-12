import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Check, X, Loader2 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, addMonths, subMonths, getDay, eachDayOfInterval } from 'date-fns';
import { nb } from 'date-fns/locale';

export default function AvailabilityCalendar({ worker }) {
  const [month, setMonth] = useState(new Date());
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const monthStartStr = format(monthStart, 'yyyy-MM-dd');
  const monthEndStr = format(monthEnd, 'yyyy-MM-dd');

  const { data: availability = [] } = useQuery({
    queryKey: ['availability', worker.id, monthStartStr],
    queryFn: () => base44.entities.Availability.filter({
      worker_id: worker.id,
      date: { $gte: monthStartStr, $lte: monthEndStr }
    }),
  });

  // Build a map: date string -> status
  const availMap = useMemo(() => {
    const m = {};
    availability.forEach(a => { m[a.date] = a; });
    return m;
  }, [availability]);

  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Leading empty cells (Mon=0, Sun=6)
  const firstDow = getDay(monthStart); // 0=Sun
  const leadingBlanks = firstDow === 0 ? 6 : firstDow - 1; // convert to Mon-start

  const toggleDay = (dateStr) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(dateStr) ? next.delete(dateStr) : next.add(dateStr);
      return next;
    });
  };

  const markSelected = async (status) => {
    if (selected.size === 0) return;
    setSaving(true);
    const dates = Array.from(selected);
    for (const date of dates) {
      const existing = availMap[date];
      if (existing) {
        if (existing.status !== status) {
          await base44.entities.Availability.update(existing.id, { status });
        }
      } else {
        await base44.entities.Availability.create({
          worker_id: worker.id,
          worker_name: worker.name,
          date,
          status,
        });
      }
    }
    setSelected(new Set());
    setSaving(false);
    queryClient.invalidateQueries({ queryKey: ['availability', worker.id, monthStartStr] });
  };

  const clearDay = async (dateStr) => {
    const existing = availMap[dateStr];
    if (!existing) return;
    await base44.entities.Availability.delete(existing.id);
    queryClient.invalidateQueries({ queryKey: ['availability', worker.id, monthStartStr] });
  };

  const today = format(new Date(), 'yyyy-MM-dd');
  const DAY_LABELS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div>
          <h3 className="font-semibold text-slate-800">Min tilgjengelighet</h3>
          <p className="text-xs text-slate-400 mt-0.5">Velg dager og merk dem som tilgjengelig eller utilgjengelig</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMonth(m => subMonths(m, 1))} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <ChevronLeft className="w-4 h-4 text-slate-500" />
          </button>
          <span className="text-sm font-semibold text-slate-700 w-32 text-center capitalize">
            {format(month, 'MMMM yyyy', { locale: nb })}
          </span>
          <button onClick={() => setMonth(m => addMonths(m, 1))} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2 px-5 py-3 bg-slate-50 border-b border-slate-100">
        <span className="text-xs text-slate-500 mr-1">
          {selected.size > 0 ? `${selected.size} dag${selected.size !== 1 ? 'er' : ''} valgt` : 'Klikk på dager for å velge'}
        </span>
        <Button
          size="sm"
          className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs"
          disabled={selected.size === 0 || saving}
          onClick={() => markSelected('available')}
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          Tilgjengelig
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 h-8 text-xs"
          disabled={selected.size === 0 || saving}
          onClick={() => markSelected('unavailable')}
        >
          <X className="w-3 h-3" />
          Utilgjengelig
        </Button>
        {selected.size > 0 && (
          <button onClick={() => setSelected(new Set())} className="text-xs text-slate-400 hover:text-slate-600 ml-auto">
            Avbryt valg
          </button>
        )}
      </div>

      {/* Calendar grid */}
      <div className="p-4">
        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAY_LABELS.map(d => (
            <div key={d} className="text-center text-xs font-semibold text-slate-400 py-2">{d}</div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-1">
          {/* Leading blanks */}
          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <div key={`blank-${i}`} />
          ))}

          {days.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const avail = availMap[dateStr];
            const isSelected = selected.has(dateStr);
            const isPast = dateStr < today;
            const isToday = dateStr === today;
            const dow = day.getDay(); // 0=Sun, 6=Sat
            const isWeekend = dow === 0 || dow === 6;

            let bg = 'bg-white hover:bg-slate-50';
            let border = 'border-slate-200';
            let text = 'text-slate-700';

            if (avail?.status === 'available') {
              bg = 'bg-emerald-50 hover:bg-emerald-100';
              border = 'border-emerald-300';
              text = 'text-emerald-700';
            } else if (avail?.status === 'unavailable') {
              bg = 'bg-red-50 hover:bg-red-100';
              border = 'border-red-300';
              text = 'text-red-700';
            } else if (isWeekend) {
              bg = 'bg-slate-50 hover:bg-slate-100';
              text = 'text-slate-400';
            }

            if (isSelected) {
              bg = 'bg-blue-100 hover:bg-blue-200';
              border = 'border-blue-400';
              text = 'text-blue-700';
            }

            if (isToday) {
              border = 'border-blue-500';
            }

            return (
              <div
                key={dateStr}
                onClick={() => !isPast && toggleDay(dateStr)}
                className={`relative rounded-lg border p-1.5 text-center transition-colors select-none
                  ${bg} ${border} ${text}
                  ${isPast ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                  ${isToday ? 'ring-2 ring-blue-400 ring-offset-1' : ''}
                `}
              >
                <div className={`text-sm font-semibold leading-none mb-1 ${isToday ? 'text-blue-600' : ''}`}>
                  {format(day, 'd')}
                </div>
                {avail?.status === 'available' && (
                  <div className="text-xs leading-none text-emerald-600 font-medium">✓ Ledig</div>
                )}
                {avail?.status === 'unavailable' && (
                  <div className="text-xs leading-none text-red-500 font-medium">✗ Opptatt</div>
                )}
                {avail && !isPast && (
                  <button
                    onClick={e => { e.stopPropagation(); clearDay(dateStr); }}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-slate-400 hover:bg-slate-600 text-white rounded-full text-xs flex items-center justify-center leading-none"
                    title="Fjern"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <div className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300" />
            Tilgjengelig
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <div className="w-3 h-3 rounded bg-red-100 border border-red-300" />
            Utilgjengelig
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <div className="w-3 h-3 rounded bg-blue-100 border border-blue-400" />
            Valgt
          </div>
        </div>
      </div>
    </div>
  );
}