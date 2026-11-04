import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { sameEmail } from '@/lib/emails';
import { resolveMyTeams } from '@/lib/myTeams';
import { useState, useEffect, useMemo } from 'react';

export function useCurrentUser() {
  const [user, setUser] = useState(null);
  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);
  return user;
}

export function useCurrentWorker() {
  const user = useCurrentUser();

  const { data: workers = [], isSuccess } = useQuery({
    queryKey: ['workers'],
    queryFn: () => base44.entities.Worker.list(),
    enabled: !!user,
  });

  const worker = user ? workers.find((w) => sameEmail(w.email, user.email)) : null;
  const orgId = worker?.org_id || null;
  // Platform admin is the organization owner or the superadmin. Both see every
  // store and keep the team1 fallback when they have no store list. Everyone
  // else gets an empty list until their worker row has loaded.
  const seesAllTeams = user?.role === 'admin';
  const ready = Boolean(user) && isSuccess;
  const myTeams = useMemo(
    () => resolveMyTeams(worker, { ready, seesAllTeams }),
    [worker, ready, seesAllTeams],
  );

  return {
    user,
    worker,
    myTeams,
    ready,
    seesAllTeams,
    orgId,
    teamRoles: worker?.team_roles || {},
  };
}