import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useMemo } from 'react';
import { getISOWeek } from 'date-fns';
import { useOrg } from '@/hooks/useOrg';
import {
  resolveStaffingBudget,
  staffingBudgetQuery,
  staffingBudgetQueryKey,
} from '@/lib/staffingBudget';

/**
 * Returns staffing budget for a given team in the current organization.
 * Resolves week-override first, falls back to default plan.
 *
 * Returns: budgetByHourDay[hour][dayKey] = number
 * dayKey: 'mon','tue','wed','thu','fri','sat','sun'
 */
export function useStaffingBudget(team) {
  const { orgId } = useOrg();
  const { data: allBudgets = [] } = useQuery({
    queryKey: staffingBudgetQueryKey(orgId),
    queryFn: () => {
      const request = staffingBudgetQuery(orgId);
      if (!request) return [];
      return base44.entities.StaffingBudget.filter(request.filters, request.sort, request.limit);
    },
    enabled: Boolean(orgId),
    staleTime: 60_000,
  });

  const budgetByHourDay = useMemo(() => {
    const now = new Date();
    return resolveStaffingBudget(allBudgets, {
      team,
      orgId,
      week: getISOWeek(now),
      year: now.getFullYear(),
    });
  }, [allBudgets, team, orgId]);

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