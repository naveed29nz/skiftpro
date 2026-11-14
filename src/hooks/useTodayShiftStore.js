import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { withShiftQuery } from '@/api/shiftQuery';
import { defaultStoreFromTodayShift, todayOwnShiftQuery } from '@/lib/portalShifts';

/**
 * Team of the signed-in worker's published, non-cancelled shift today,
 * when that team is in `teams`. `store` is null when there is nothing to
 * prefer, so the page keeps its existing default. `teams` must be the
 * person's real membership — this hook does not invent a store.
 */
export function useTodayShiftStore({ userId, workerId, orgId, teams }) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const query = todayOwnShiftQuery(userId, orgId, workerId, today);
  const enabled = Boolean(workerId && orgId && today);
  const result = useQuery(withShiftQuery({
    queryKey: query.queryKey,
    enabled,
    queryFn: () => base44.entities.Shift.filter(query.filter, 'start_time', 50),
  }));
  const store = defaultStoreFromTodayShift(result.data, {
    workerId,
    orgId,
    today,
    teams,
  });
  const ready = !enabled || result.isSuccess || result.isError;
  return { store, ready };
}
