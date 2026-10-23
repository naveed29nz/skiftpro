import { useState } from 'react';
import { format, addDays, startOfWeek, endOfWeek, addWeeks, subWeeks, getISOWeek } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { calcHours } from '@/utils/payCalc';

export default function WeekSummary({ allShifts = [], today, wp }) {
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));

  const weekStartStr = format(weekStart, 'yyyy-MM-dd');
  const weekEndStr = format(endOfWeek(weekStart, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const weekShifts = allShifts.filter(s => s.date >= weekStartStr && s.date <= weekEndStr && s.status !== 'cancelled');
  const isCurrentWeek = weekStartStr === format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const totalHours = weekShifts.reduce((sum, s) => sum + calcHours(s, wp, s.team), 0);
  const todayStr = today || format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart(subWeeks(weekStart, 1))}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 active:bg-slate-300 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-center">
            <h3 className="font-semibold text-slate-800 text-sm">
              {isCurrentWeek ? 'Denne uken' : `Uke ${getISOWeek(weekStart)}`}
            </h3>
            <p className="text-xs text-slate-400">
              {format(weekStart, 'd. MMM')} – {format(endOfWeek(weekStart, { weekStartsOn: 1 }), 'd. MMM')}
            </p>
          </div>
          <button
            onClick={() => setWeekStart(addWeeks(weekStart, 1))}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 active:bg-slate-300 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <span className="text-lg font-bold text-blue-600">{totalHours.toFixed(1)}t</span>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map(day => {
          const dayStr = format(day, 'yyyy-MM-dd');
          const dayShifts = weekShifts.filter(s => s.date === dayStr);
          const dayHours = dayShifts.reduce((sum, s) => sum + calcHours(s), 0);
          const isToday = dayStr === todayStr;
          const isPast = dayStr < todayStr;
          const hasShift = dayShifts.length > 0;

          return (
            <div key={dayStr} className="flex flex-col items-center gap-1">
              <span className="text-xs text-slate-400">{format(day, 'EEE').charAt(0)}</span>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all
                ${isToday && hasShift ? 'bg-blue-600 text-white ring-2 ring-blue-300' :
                  isToday ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-300' :
                  hasShift && isPast ? 'bg-emerald-100 text-emerald-700' :
                  hasShift ? 'bg-slate-100 text-slate-700' :
                  'bg-slate-50 text-slate-300'}`}>
                {format(day, 'd')}
              </div>
              {hasShift ? (
                <span className={`text-xs font-medium ${isToday ? 'text-blue-600' : isPast ? 'text-emerald-600' : 'text-slate-500'}`}>
                  {dayHours.toFixed(1)}t
                </span>
              ) : (
                <span className="text-xs text-slate-200">—</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}