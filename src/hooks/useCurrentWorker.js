import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useState, useEffect } from 'react';

export function useCurrentUser() {
  const [user, setUser] = useState(null);
  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);
  return user;
}

export function useCurrentWorker() {
  const user = useCurrentUser();

  const { data: workers = [] } = useQuery({
    queryKey: ['workers'],
    queryFn: () => base44.entities.Worker.list(),
    enabled: !!user,
  });

  const worker = user ? workers.find(w => w.email === user.email) : null;
  const orgId = worker?.org_id || null;

  return { user, worker, myTeams: worker?.teams || ['team1'], orgId, teamRoles: worker?.team_roles || {} };
}