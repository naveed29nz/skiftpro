// @ts-nocheck
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format } from 'date-fns';
import { Bell } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from '@/components/ui/use-toast';
import { useCurrentWorker } from '@/hooks/useCurrentWorker';
import { useOrg } from '@/hooks/useOrg';
import { buildManagerAlerts, isMissingRelation, presentAlerts, unreadCount } from '@/lib/managerAlerts';
import { getTeamNamesMap } from '@/utils/teams';
import AlertPanel, { alertBadgeCount } from '@/components/alerts/AlertPanel';

async function loadStates(orgId, userId) {
  const { data, error } = await supabase
    .from('alert_states')
    .select('alert_key, read_at, dismissed_at')
    .eq('org_id', orgId)
    .eq('user_id', userId);
  if (error) {
    if (isMissingRelation(error)) return { available: false, rows: [] };
    throw error;
  }
  return { available: true, rows: data || [] };
}

export default function AlertBell({ enabled = false }) {
  const { orgId, userId } = useOrg();
  const { myTeams, seesAllTeams, ready } = useCurrentWorker();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const active = Boolean(enabled && orgId && userId && (seesAllTeams || ready));
  const teams = seesAllTeams ? null : myTeams;

  const feed = useQuery({
    queryKey: ['manager-alerts', orgId, userId, seesAllTeams ? 'all' : (teams || []).join(',')],
    enabled: active,
    queryFn: async () => {
      const today = new Date();
      const from = format(addDays(today, -14), 'yyyy-MM-dd');
      const to = format(addDays(today, 13), 'yyyy-MM-dd');
      const todayStr = format(today, 'yyyy-MM-dd');
      const [shifts, contracts, workers, settings, states] = await Promise.all([
        base44.entities.Shift.filter({ org_id: orgId, date: { $gte: from, $lte: to } }, 'date', 2000),
        base44.entities.Contract.filter({ org_id: orgId }),
        base44.entities.Worker.filter({ org_id: orgId }),
        base44.entities.WorkplaceSetting.filter({ org_id: orgId }),
        loadStates(orgId, userId),
      ]);
      const alerts = buildManagerAlerts({
        today: todayStr,
        orgId,
        teams,
        teamNames: getTeamNamesMap(settings?.[0], workers),
        contracts,
        shifts,
        workers,
      });
      return {
        alerts: presentAlerts(alerts, states.rows),
        statesAvailable: states.available,
        states: states.rows,
      };
    },
  });

  if (!enabled || !orgId) return null;

  const alerts = feed.data?.alerts || [];
  const count = unreadCount(alerts);
  const badge = alertBadgeCount(count);

  const save = async (alert, patch) => {
    if (!feed.data?.statesAvailable) {
      toast({
        title: 'Varselet kan ikke lagres ennå',
        description: 'Databaseoppdateringen er ikke tatt i bruk.',
        variant: 'destructive',
      });
      return;
    }
    const current = (feed.data.states || []).find((row) => row.alert_key === alert.key) || {};
    const { error } = await supabase.from('alert_states').upsert({
      org_id: orgId,
      user_id: userId,
      alert_key: alert.key,
      read_at: patch.read ? new Date().toISOString() : (current.read_at || null),
      dismissed_at: patch.dismiss ? new Date().toISOString() : (current.dismissed_at || null),
    }, { onConflict: 'user_id,alert_key' });
    if (error) {
      toast({ title: 'Kunne ikke oppdatere varselet', description: error.message, variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['manager-alerts', orgId, userId] });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex h-8 w-8 items-center justify-center rounded-md text-blue-200 hover:bg-blue-800 hover:text-white"
          aria-label={count ? `Varsler, ${count} uleste` : 'Varsler'}
          data-testid="alert-bell"
        >
          <Bell className="h-4 w-4" />
          {badge && (
            <span className="absolute -right-1 -top-1 min-w-[1.1rem] rounded-full bg-rose-500 px-1 text-center text-[10px] font-semibold leading-4 text-white">
              {badge}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="z-[10020] w-[22rem] max-w-[calc(100vw-1.5rem)] p-0">
        <AlertPanel
          alerts={alerts}
          loading={feed.isPending}
          onRead={(alert) => save(alert, { read: true })}
          onDismiss={(alert) => save(alert, { read: true, dismiss: true })}
          onNavigate={(alert) => {
            setOpen(false);
            if (!alert.read) save(alert, { read: true });
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
