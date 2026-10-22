import { useMemo, useState } from 'react';
import { format, startOfWeek, addDays, addWeeks, subWeeks } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function TeamSchedule({ shifts, workers, currentWorker, wpSettings = [] }) {
  const myTeams = currentWorker?.teams || ['team1'];
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedTeam, setSelectedTeam] = useState(myTeams[0] || 'team1');

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const ws = wpSettings[0];
  const teamOptions = myTeams.map(t => ({ key: t, name: ws?.[`${t}_name`] || t }));

  const teamWorkers = workers.filter(w => (w.teams || ['team1']).includes(selectedTeam) && w.status !== 'inactive');

  const weekStartStr = format(weekStart, 'yyyy-MM-dd');
  const weekEndStr = format(addDays(weekStart, 6), 'yyyy-MM-dd');
  const weekShifts = shifts.filter(s => s.date >= weekStartStr && s.date <= weekEndStr && s.status !== 'cancelled');

  const getShiftsForWorkerDay = (workerId, day) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    return weekShifts.filter(s => s.worker_id === workerId && s.date === dayStr && (!s.team || s.team === selectedTeam));
  };

  const hasOtherTeamShift = (workerId, day) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    return weekShifts.some(s => s.worker_id === workerId && s.date === dayStr && s.team && s.team !== selectedTeam);
  };

  const LABEL_COLORS = {
    morning: 'bg-amber-100 text-amber-700',
    middle: 'bg-blue-100 text-blue-700',
    evening: 'bg-purple-100 text-purple-700',
    sick: 'bg-red-100 text-red-700',
    ferie: 'bg-sky-100 text-sky-700',
  };

  return (
    <div className="space-y-4">
      {/* Week nav + team selector */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-medium text-slate-700">
          {format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d, yyyy')}
        </span>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" className="ml-1 text-xs" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
          I dag
        </Button>
        {teamOptions.length > 1 && (
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs ml-2">
            {teamOptions.map(t => (
              <button
                key={t.key}
                onClick={() => setSelectedTeam(t.key)}
                className={`px-3 py-2 font-medium transition-colors ${selectedTeam === t.key ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Schedule table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <th className="px-3 py-2.5 text-left font-medium min-w-[110px] sticky left-0 bg-slate-50 z-10">Ansatt</th>
                {days.map(day => (
                  <th key={day.toISOString()} className={`px-2 py-2.5 text-center font-medium min-w-[90px] ${format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? 'bg-blue-50 text-blue-700' : ''}`}>
                    <div>{format(day, 'EEE')}</div>
                    <div className="text-xs font-normal">{format(day, 'd. MMM')}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {teamWorkers.map(worker => (
                <tr key={worker.id} className={worker.id === currentWorker?.id ? 'bg-blue-50/30' : 'hover:bg-slate-50/50'}>
                  <td className="px-3 py-2 sticky left-0 bg-inherit z-10">
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full text-white text-xs flex items-center justify-center font-bold shrink-0"
                        style={{ backgroundColor: worker.color || '#3B82F6' }}>
                        {worker.name?.charAt(0)}
                      </div>
                      <span className="font-medium text-slate-800 truncate max-w-[80px]">
                        {worker.name}
                        {worker.id === currentWorker?.id && <span className="ml-1 text-blue-500 text-xs">(deg)</span>}
                      </span>
                    </div>
                  </td>
                  {days.map(day => {
                    const dayShifts = getShiftsForWorkerDay(worker.id, day);
                    const otherTeam = hasOtherTeamShift(worker.id, day);
                    return (
                      <td key={day.toISOString()} className={`px-1 py-1.5 align-top ${format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? 'bg-blue-50/20' : ''}`}>
                        {dayShifts.length > 0 ? (
                          <div className="space-y-0.5">
                            {dayShifts.map(s => (
                              <div key={s.id} className={`rounded px-1.5 py-1 text-center ${s.shift_label ? (LABEL_COLORS[s.shift_label] || 'bg-slate-100 text-slate-600') : 'bg-slate-100 text-slate-700'}`}>
                                <div className="font-medium leading-tight">{s.all_day ? (s.shift_label === 'ferie' ? 'Ferie' : 'Syk') : `${s.start_time}–${s.end_time}`}</div>
                              </div>
                            ))}
                          </div>
                        ) : otherTeam ? (
                          <div className="h-8 flex items-center justify-center">
                            <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-500 border border-orange-200 font-medium" title="Satt opp i annen avdeling">↔</span>
                          </div>
                        ) : (
                          <div className="h-8 flex items-center justify-center text-slate-200">–</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {teamWorkers.length === 0 && (
                <tr><td colSpan={8} className="py-10 text-center text-sm text-slate-400">Ingen kollegaer i teamet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}