import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useOrg } from './useOrg';
import { getActiveTeams } from '@/utils/teams';

/**
 * Returns an object mapping active teamKeys to their display names.
 * Scoped to the current user's organization (same logic as Settings.jsx):
 *  - Org admin → their org's WorkplaceSetting
 *  - Superadmin → first settings record in the list
 * Uses getActiveTeams so custom team names + teams with assigned workers
 * are surfaced even when active_teams_count is stale.
 */
export function useTeamNames() {
  const { orgId } = useOrg();

  const { data: wpSettings = [] } = useQuery({
    queryKey: ['workplace-settings'],
    queryFn: () => base44.entities.WorkplaceSetting.list(),
  });

  const { data: workers = [] } = useQuery({
    queryKey: ['workers', orgId],
    queryFn: () => orgId
      ? base44.entities.Worker.filter({ org_id: orgId })
      : base44.entities.Worker.list(),
  });

  const ws = orgId
    ? wpSettings.find(s => s.org_id === orgId)
    : wpSettings[0];
  const activeTeams = getActiveTeams(ws, workers);
  const teamNames = {};
  activeTeams.forEach(t => { teamNames[t.key] = t.label; });
  return teamNames;
}