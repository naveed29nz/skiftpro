import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export function usePayrollBreakdowns(orgId, start, end) {
  return useQuery({
    queryKey: ['payroll-calc', orgId, start, end],
    enabled: Boolean(orgId && start && end),
    queryFn: async () => {
      const { data } = await base44.functions.invoke('payroll-calc', { orgId, start, end });
      if (data?.error) {
        const error = new Error(data.error);
        error.status = 400;
        throw error;
      }
      return data?.breakdowns || [];
    },
  });
}

export function breakdownMap(rows) {
  return new Map((rows || []).map((row) => [row.shiftId, row]));
}
