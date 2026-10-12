import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useOrg } from './useOrg';

/**
 * Returns the WorkplaceSetting record scoped to the current user:
 *  - Org admin/worker → their org's setting
 *  - Superadmin (no org) → first record in the list
 *
 * Use this instead of `wpSettings[0]` so admin pages show the customer's
 * actual department names / extras / locations instead of whichever
 * WorkplaceSetting happens to be first in the 全 list.
 */
export function useScopedWorkplaceSetting() {
  const { orgId } = useOrg();

  const { data: wpSettings = [], isLoading } = useQuery({
    queryKey: ['workplace-settings'],
    queryFn: () => base44.entities.WorkplaceSetting.list(),
  });

  const scoped = orgId
    ? wpSettings.find(s => s.org_id === orgId)
    : wpSettings[0];

  return { wp: scoped, wpSettings, isLoading };
}