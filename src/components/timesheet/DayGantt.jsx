import { useMemo } from 'react';
import { format } from 'date-fns';
import { Plus, Clock, CalendarOff } from 'lucide-react';
import { calcHours as netHours } from '@/utils/payCalc';
import { shiftLabelName } from '@/utils/shiftLabels';

// 24-timers Gantt-visning (én dag) sortert på skiftkategori – i stil med Planday.
const SHIFT_ROWS = [
  { key: 'morning', name: 'Morgen',        headerClass: 'bg-green-600 text-white',  rowClass: 'bg-green-50/40',  blockClass: 'bg-green-200 text-green-900 border border-green-300' },
  { key: 'middle',  name: 'Mellomvakt',    headerClass: 'bg-sky-600 text-white',     rowClass: 'bg-sky-50/40',    blockClass: 'bg-sky-200 text-sky-900 border border-sky-300' },
  { key: 'evening', name: 'Kveldsvakt',    headerClass: 'bg-slate-600 text-white',   rowClass: 'bg-slate-100/40', blockClass: 'bg-slate-300 text-slate-900 border border-slate-400' },
  { key: 'sick',        name: 'Syk',         headerClass: 'bg-red-600 text-white',  rowClass: 'bg-red-50/40',  blockClass: 'bg-red-200 text-red-900 border border-red-300' },
  { key: 'sick_self',   name: 'Egenmelding', headerClass: 'bg-red-600 text-white',  rowClass: 'bg-red-50/40',  blockClass: 'bg-red-200 text-red-900 border border-red-300' },
  { key: 'sick_doctor', name: 'Sykmelding',  headerClass: 'bg-rose-600 text-white', rowClass: 'bg-rose-50/40', blockClass: 'bg-rose-200 text-rose-900 border border-rose-300' },
  { key: 'ferie',       name: 'Ferie',       headerClass: 'bg-sky-600 text-white',  rowClass: 'bg-sky-50/40',  blockClass: 'bg-sky-200 text-sky-900 border border-sky-300' },
  { key: '',        name: 'Ing. kategori', headerClass: 'bg-gray-500 text-white',   rowClass: 'bg-gray-50/40',   blockClass: 'bg-gray-200 text-gray-900 border border-gray-300' },
];

const TIME_WIDTH = 784; // px
const LEFT_W = 168; // px
const TOTAL_W = TIME_WIDTH + LEFT_W;

function timeToHours(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h + m / 60;
}
function blockSpan(shift) {
  if (shift.all_day) return { start: 8, hours: 8, label: 'Hel dag' };
  const start = timeToHours(shift.start_time);
  let hours = timeToHours(shift.end_time) - start;
  if (hours <= 0) hours += 24;
  return { start, hours, label: `${shift.start_time}–${shift.end_time}` };
}
function fmtHours(h) {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}t ${mins}m`;
}

// Fordeler overlappende skift i egne "laner" slik at blokkene ikke klapper over hverandre.
function assignLanes(shifts) {
  const sorted = [...shifts].sort((a, b) => blockSpan(a).start - blockSpan(b).start);
  const laneEnds = [];
  const lanesByShift = new Map();
  sorted.forEach(s => {
    const span = blockSpan(s);
    const start = span.start;
    const end = start + span.hours;
    let lane = laneEnds.findIndex(e => e <= start + 0.01);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(end); }
    else laneEnds[lane] = end;
    lanesByShift.set(s.id, lane);
  });
  const maxLanes = Math.max(1, laneEnds.length);
  return { lanesByShift, maxLanes };
}

export default function DayGantt({ day, workers, shifts, availability, filterTeam = 'all', onEdit, onAdd, showWages = false, wp }) {
  const dayStr = format(day, 'yyyy-MM-dd');
  const workersById = useMemo(() => {
    const m = new Map();
    workers.forEach(w => m.set(w.id, w));
    return m;
  }, [workers]);

  const dayShifts = useMemo(
    () => shifts.filter(s => {
      if (s.date !== dayStr || s.status === 'cancelled') return false;
      const w = workersById.get(s.worker_id);
      if (!w) return false;
      if (filterTeam === 'all') {
        const workerTeams = w.teams || ['team1'];
        if (s.team) return workerTeams.includes(s.team);
        return true;
      }
      if (s.team) return s.team === filterTeam;
      return (w.teams?.[0] || 'team1') === filterTeam;
    }),
    [shifts, dayStr, workersById, filterTeam]
  );

  const unavailable = useMemo(
    () => (availability || [])
      .filter(a => a.date === dayStr && a.status === 'unavailable')
      .map(a => ({ worker: workersById.get(a.worker_id), note: a.note }))
      .filter(x => x.worker),
    [availability, dayStr, workersById]
  );

  const shiftsByGroup = (key) => dayShifts.filter(s => (s.shift_label || '') === key);
  const statsOf = (ss) => ({
    hours: ss.reduce((sum, s) => sum + netHours(s, wp, s.team), 0),
    cost: ss.reduce((sum, s) => {
      const w = workersById.get(s.worker_id);
      return sum + netHours(s, wp, s.team) * (w?.hourly_rate || 0);
    }, 0),
    count: ss.length,
  });

  const hourLine = (h) => `${(h / 24) * TIME_WIDTH}px`;

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-700">{format(day, 'EEEE d. MMMM')}</div>
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <Clock className="w-3 h-3" /> 00 – 24
          <span className="text-slate-300">·</span>
          <span>{dayShifts.length} vakter</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div style={{ width: TOTAL_W }} className="relative">
          {/* Tidslinje-header */}
          <div className="flex border-b border-slate-200 bg-white">
            <div className="shrink-0 sticky left-0 z-10 bg-white border-r border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-500" style={{ width: LEFT_W }}>
              Kategori
            </div>
            <div className="relative" style={{ width: TIME_WIDTH, height: 26 }}>
              {Array.from({ length: 25 }, (_, h) => (
                <div key={h} className="absolute top-0 bottom-0"
                  style={{ left: hourLine(h), borderLeft: h % 6 === 0 ? '1px solid #cbd5e1' : '1px solid #eef2f6' }}>
                  <span className="ml-0.5 text-[10px] text-slate-400">{h.toString().padStart(2, '0')}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Skiftkategorirader */}
          {SHIFT_ROWS.map(row => {
            const groupShifts = shiftsByGroup(row.key);
            const st = statsOf(groupShifts);
            const { lanesByShift, maxLanes } = assignLanes(groupShifts);
            const rowHeight = maxLanes * 40 + 14;
            return (
              <div key={row.key} className="flex border-b border-slate-100">
                <div className={`shrink-0 sticky left-0 z-10 border-r border-slate-200 flex flex-col justify-center px-3 py-2 ${row.rowClass}`} style={{ width: LEFT_W }}>
                  <div className={`inline-flex items-center gap-1.5 self-start px-2 py-0.5 rounded text-xs font-semibold ${row.headerClass}`}>{row.name}</div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                    <span className="font-medium text-slate-600">{fmtHours(st.hours)}</span>
                    {showWages && <span>{st.cost.toFixed(0)} kr</span>}
                    <span>{st.count} vakt{st.count !== 1 ? 'er' : ''}</span>
                  </div>
                </div>
                <div className="relative" style={{ width: TIME_WIDTH }}>
                  {/* Timegitlinjer */}
                  {Array.from({ length: 25 }, (_, h) => (
                    <div key={h} className="absolute top-0 bottom-0"
                      style={{ left: hourLine(h), borderLeft: h % 6 === 0 ? '1px solid #cbd5e1' : '1px solid #eef2f6' }} />
                  ))}
                  {/* Skiftblokker */}
                  {groupShifts.map(s => {
                    const w = workersById.get(s.worker_id);
                    const span = blockSpan(s);
                    const left = (span.start / 24) * TIME_WIDTH;
                    const widthPx = (span.hours / 24) * TIME_WIDTH;
                    const lane = lanesByShift.get(s.id) || 0;
                    return (
                      <button key={s.id}
                        onClick={() => onEdit(w, day)}
                        style={{ left, width: Math.max(widthPx - 4, 56), top: 6 + lane * 40, height: 34 }}
                        className={`absolute rounded px-1.5 py-1 text-[10px] leading-tight text-left hover:shadow-md hover:ring-1 hover:ring-blue-300 transition-all ${row.blockClass}`}>
                        <div className="font-semibold truncate">{s.worker_name || w?.name}</div>
                        <div className="truncate opacity-80">{span.label}{s.shift_label ? ` · ${shiftLabelName(s.shift_label)}` : ''}</div>
                      </button>
                    );
                  })}
                  {/* Legg til vakt på denne kategorien */}
                  {groupShifts.length === 0 && row.key !== 'sick' && (
                    <button
                      onClick={() => onAdd(row.key)}
                      className="absolute right-1 top-1 w-6 h-6 rounded-full bg-white border border-dashed border-slate-300 text-slate-400 hover:text-blue-500 hover:border-blue-400 flex items-center justify-center"
                      title={`Legg til ${row.name.toLowerCase()}`}
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  )}
                  <div style={{ height: rowHeight }} />
                </div>
              </div>
            );
          })}

          {/* Fraværsrad */}
          <div className="flex border-b border-slate-100">
            <div className="shrink-0 sticky left-0 z-10 border-r border-slate-200 flex flex-col justify-center px-3 py-2 bg-orange-50/40" style={{ width: LEFT_W }}>
              <div className="inline-flex items-center gap-1.5 self-start px-2 py-0.5 rounded text-xs font-semibold bg-orange-500 text-white">
                <CalendarOff className="w-3 h-3" /> Fravær
              </div>
              <div className="mt-1 text-[10px] text-slate-500">{unavailable.length} ansatt{unavailable.length !== 1 ? 'e' : ''}</div>
            </div>
            <div className="relative" style={{ width: TIME_WIDTH }}>
              {Array.from({ length: 25 }, (_, h) => (
                <div key={h} className="absolute top-0 bottom-0"
                  style={{ left: hourLine(h), borderLeft: h % 6 === 0 ? '1px solid #fcd9b0' : '1px solid #fde8c8' }} />
              ))}
              {unavailable.length > 0 ? (
                <div className="absolute inset-y-1 left-2 right-2 flex flex-col gap-1">
                  {unavailable.map((u, i) => (
                    <div key={i} className="rounded px-2 py-0.5 text-[10px] text-orange-900 bg-orange-100 border border-orange-300 truncate">
                      <span className="font-semibold">{u.worker.name}</span>
                      <span className="text-orange-700"> · Utilgjengelig{u.note ? ` — ${u.note}` : ''}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-300">Ingen fravær registrert</div>
              )}
              <div style={{ height: unavailable.length > 0 ? undefined : 38 }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}