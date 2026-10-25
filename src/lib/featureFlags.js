/**
 * Temporary product switches. Flip a constant to show the page again.
 * The page components and their stored data stay either way.
 */

export const SHOW_DAGSOPPGJOR = false;
export const SHOW_RESULTAT = false;

export function isPageEnabled(path, flags = { dagsoppgjor: SHOW_DAGSOPPGJOR, resultat: SHOW_RESULTAT }) {
  if (path === '/Dagsoppgjor') return Boolean(flags.dagsoppgjor);
  if (path === '/Resultat') return Boolean(flags.resultat);
  return true;
}

export function visibleNavItems(items, flags) {
  return (items || []).filter((item) => isPageEnabled(item.path, flags));
}

/**
 * Home for a hidden route. Admins land on Oversikt, other store roles on
 * Min side, and a platform super-admin on the customer list.
 */
export function defaultPageForRole(role, { impersonating = false } = {}) {
  if (role === 'superadmin' && !impersonating) return '/SuperAdmin';
  if (role === 'admin' || role === 'superadmin') return '/Dashboard';
  return '/WorkerPortal';
}
