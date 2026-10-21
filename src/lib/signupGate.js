export function resolveSignupKind(profile, metadata) {
  const fromProfile = profile?.signup_kind;
  if (fromProfile === 'employee' || fromProfile === 'business') return fromProfile;
  const fromMeta = metadata?.signup_kind;
  if (fromMeta === 'employee' || fromMeta === 'business') return fromMeta;
  return null;
}

/**
 * Org creation is only offered when the account was registered as a business.
 * Existing unlinked admins (signup_kind null) stay on the normal admin path.
 * Everyone else without a worker card is treated as an employee.
 */
export function resolveSignupGate({ platformRole, hasWorker, hasOrg, termsAccepted, signupKind }) {
  if (!termsAccepted || platformRole === 'admin' || hasWorker || hasOrg) return 'app';
  if (signupKind === 'business') return 'onboarding';
  return 'employee';
}

export function isMissingClaimRpc(error) {
  const message = String(error?.message || '');
  const code = String(error?.code || '');
  if (code === 'PGRST202' || code === '42883') return true;
  if (/schema cache/i.test(message)) return true;
  if (/could not find the function/i.test(message)) return true;
  if (/claim_worker_card/i.test(message) && /does not exist/i.test(message)) return true;
  return false;
}

export function claimOrgId(data) {
  const row = Array.isArray(data) ? data[0] : data;
  const orgId = row?.org_id;
  if (orgId == null || String(orgId).trim() === '') return null;
  return String(orgId);
}
