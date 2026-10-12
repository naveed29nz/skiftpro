import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useMemo } from 'react';
import { getISOWeek } from 'date-fns';

/**
 * Returns staffing budget for a given team.
 * Resolves week-override first, falls back to default plan.
 * 
 * Returns: budgetByHourDay[hour][dayKey] = number
 * dayKey: 'mon','tue','wed','thu','fri','sat','sun'
 */
export function useStaffingBudget(team) {
  const { data: allBudgets = [] } = useQuery({
    queryKey: ['staffing-budget'],
    queryFn: () => base44.entities.StaffingBudget.list('-created_date', 500),
    staleTime: 60_000,
  });

  const budgetByHourDay = useMemo(() => {
    if (!team || !allBudgets.length) return {};
    const now = new Date();
    const currentWeek = getISOWeek(now);
    const currentYear = now.getFullYear();

    const teamRecords = allBudgets.filter(b => b.team === team);

    // Week-specific override for current week
    const overrideRecords = teamRecords.filter(
      b => b.week_override === currentWeek && b.year_override === currentYear
    );
    // Default (no override)
    const defaultRecords = teamRecords.filter(b => !b.week_override && !b.year_override);

    // Merge: override wins per hour
    const merged = {};
    defaultRecords.forEach(b => { merged[b.hour] = b; });
    overrideRecords.forEach(b => { merged[b.hour] = b; }); // override wins

    const result = {};
    Object.entries(merged).forEach(([hour, b]) => {
      result[Number(hour)] = {
        mon: b.mon || 0,
        tue: b.tue || 0,
        wed: b.wed || 0,
        thu: b.thu || 0,
        fri: b.fri || 0,
        sat: b.sat || 0,
        sun: b.sun || 0,
      };
    });
    return result;
  }, [allBudgets, team]);

  return budgetByHourDay;
}

/**
 * Given a list of shifts for a specific day and a budget map,
 * returns per-hour staffing status: 'ok' | 'under' | 'over' | 'empty'
 * 
 * dayIndex: 0=Mon, 1=Tue, ..., 6=Sun (ISO)
 */
export function getHourlyStaffing(shiftsForDay, budgetByHourDay, dayIndex) {
  const dayKeys = ['mon','tue','wed','thu','fri','sat','sun'];
  const dayKey = dayKeys[dayIndex];

  const result = {};
  for (let h = 0; h < 24; h++) {
    const budget = budgetByHourDay[h]?.[dayKey] ?? 0;
    if (budget === 0) { result[h] = 'empty'; continue; }

    // Count workers scheduled during this hour
    const count = shiftsForDay.filter(s => {
      const [sh, sm] = s.start_time.split(':').map(Number);
      const [eh, em] = s.end_time.split(':').map(Number);
      const startMins = sh * 60 + sm;
      const endMins = eh * 60 + em;
      const hourStart = h * 60;
      const hourEnd = (h + 1) * 60;
      return startMins < hourEnd && endMins > hourStart;
    }).length;

    if (count === 0 && budget > 0) result[h] = 'under';
    else if (count < budget) result[h] = 'under';
    else if (count > budget) result[h] = 'over';
    else result[h] = 'ok';
  }
  return result;
}