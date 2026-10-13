const RANK = { admin: 4, sub_admin: 3, butikksjef: 2, user: 1 };

// Same role the rest of the app uses: a platform admin stays an admin
// (organization admin or super-admin). Otherwise the worker's team role wins.
export function effectiveAppRole(profile, worker) {
  const platform = profile?.role || 'user';
  if (platform === 'admin') return 'admin';
  if (!worker) return platform;
  const teamRoles = worker.team_roles || {};
  const teams = worker.teams?.length ? worker.teams : ['team1'];
  const fromTeams = teams.map((team) => teamRoles[team]).filter(Boolean);
  if (fromTeams.length > 0) {
    return fromTeams.reduce((best, role) => ((RANK[role] || 1) > (RANK[best] || 1) ? role : best), 'user');
  }
  return worker.role || platform;
}

// Super-admin, organization admin, and department admin (sub_admin).
// Butikksjef and employees do not see wage rates or lønnskostnader.
export function canSeeWageCosts(profile, worker) {
  const role = effectiveAppRole(profile, worker);
  return role === 'admin' || role === 'sub_admin';
}
