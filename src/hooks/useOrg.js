import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { findWorkerByEmail } from '@/lib/workerLookup';
import { useState, useEffect } from 'react';

// Cache the current user promise
let userPromise = null;
const getCurrentUser = () => {
  if (!userPromise) {
    userPromise = base44.auth.me().catch(() => null);
  }
  return userPromise;
};

/**
 * Returns the org_id for the current user.
 * - Superadmins (platform role=admin with no org) get null → they see everything
 * - Regular admins have an Organization record where admin_user_id = their user id
 * - Workers have a Worker record with an org_id
 */
export function useOrg() {
  const [userId, setUserId] = useState(null);
  const [userEmail, setUserEmail] = useState(null);
  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    base44.auth.me().then(u => {
      if (u) {
        setUserId(u.id);
        setUserEmail(u.email);
        setUserRole(u.role);
      }
    }).catch(() => {});
  }, []);

  // Superadmin = platform admin role with no org
  const isSuperAdmin = userRole === 'admin';

  // Impersonation: a superadmin may temporarily "enter" a customer org to help/support.
  // The override is stored in localStorage so it survives navigation/reload.
  const [impersonateOrgId, setImpersonateOrgId] = useState(() => {
    try {
      return localStorage.getItem('impersonate_org_id') || null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    setImpersonateOrgId(localStorage.getItem('impersonate_org_id') || null);
  }, []);

  // Find org where this user is the admin
  const { data: orgs = [], isSuccess: orgsLoaded } = useQuery({
    queryKey: ['organizations'],
    queryFn: () => base44.entities.Organization.list(),
    enabled: !!userId,
  });

  // Find worker record to get org_id for regular users
  const { data: myWorker } = useQuery({
    queryKey: ['my-worker', userEmail, userRole],
    queryFn: () => findWorkerByEmail(userEmail, userRole).then((worker) => (worker ? [worker] : [])),
    enabled: !!userEmail,
    select: data => data?.[0] || null,
  });

  // Determine org_id:
  // 1. If user is admin of an org (by user id or email) → use that org
  // 2. If user has a worker record with org_id → use that
  // 3. Superadmin → null (sees all)
  const myOrg = orgs.find(o => o.admin_user_id === userId || o.admin_email === userEmail) || null;
  const trulySuperAdmin = isSuperAdmin && !myOrg;
  const impersonatedOrg = (trulySuperAdmin && impersonateOrgId) ? orgs.find(o => o.id === impersonateOrgId) : null;
  const isImpersonating = trulySuperAdmin && !!impersonatedOrg;

  const orgId = isImpersonating
    ? impersonateOrgId
    : (myOrg?.id || myWorker?.org_id || null);

  return {
    orgId,
    myOrg: isImpersonating ? impersonatedOrg : myOrg,
    isSuperAdmin: trulySuperAdmin,
    isImpersonating,
    impersonatedOrg: impersonatedOrg,
    exitImpersonation: () => localStorage.removeItem('impersonate_org_id'),
    isOrgAdmin: !!myOrg,
    adminOrg: myOrg,
    orgsLoaded: Boolean(userId) && orgsLoaded,
    userId,
    userEmail,
    userRole,
    orgs, // only useful for superadmin
  };
}