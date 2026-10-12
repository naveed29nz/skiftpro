/**
 * Shows a small staffing status indicator for a team on a specific date.
 * Used in Dashboard to show under/over/ok status.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useStaffingBudget, getHourlyStaffing } from '@/hooks/useStaffingBudget';
import { getISODay } from 'date-fns';

export default function StaffingIndicator({ team, date, shifts }) {
  const budgetByHourDay = useStaffingBudget(team);

  const status = useMemo(() => {
    if (!date || !shifts || Object.keys(budgetByHourDay).length === 0) return null;
    const dayIndex = getISODay(new Date(date)) - 1; // Mon=0
    const shiftsForDay = shifts.filter(s => s.date === date);
    const hourly = getHourlyStaffing(shiftsForDay, budgetByHourDay, dayIndex);

    const values = Object.values(hourly);
    const underCount = values.filter(v => v === 'under').length;
    const overCount = values.filter(v => v === 'over').length;
    const totalBudgeted = values.filter(v => v !== 'empty').length;

    if (totalBudgeted === 0) return null;
    if (underCount > 0) return { type: 'under', count: underCount };
    if (overCount > 0) return { type: 'over', count: overCount };
    return { type: 'ok' };
  }, [budgetByHourDay, date, shifts]);

  if (!status) return null;

  if (status.type === 'ok') {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">
        ✓ Bemanning OK
      </span>
    );
  }
  if (status.type === 'under') {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-medium">
        ↓ For lite folk ({status.count}t)
      </span>
    );
  }
  if (status.type === 'over') {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
        ↑ For mange folk ({status.count}t)
      </span>
    );
  }
  return null;
}