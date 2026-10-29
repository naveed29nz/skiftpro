export const DPA_VERSION = '0.9';
export const DPA_UPDATED_LABEL = '28. oktober 2026';

export function dpaAcceptanceLabel(version = DPA_VERSION) {
  return `Jeg aksepterer databehandleravtalen (versjon ${version})`;
}

export function dpaPromptStorageKey(orgId, version = DPA_VERSION) {
  return `skiftpro.dpaPromptDismissed.${orgId}.${version}`;
}

function errorText(error) {
  if (!error) return '';
  return [error.message, error.details, error.hint].filter(Boolean).join(' ');
}

/**
 * Preview deploys use the production database. Until the migration is applied,
 * PostgREST reports a missing table or function. That must not block signup.
 */
export function isDpaStorageUnavailable(error) {
  const message = errorText(error);
  const code = String(error?.code || '');
  const names = /dpa_acceptances|accept_dpa/i.test(message);
  return code === '42P01'
    || code === '42883'
    || code === 'PGRST202'
    || code === 'PGRST205'
    || /could not find the (table|function)/i.test(message)
    || (names && /does not exist|schema cache/i.test(message));
}

export function isDuplicateDpaAcceptance(error) {
  const message = errorText(error);
  const code = String(error?.code || '');
  return code === '23505' || /duplicate key/i.test(message);
}

export async function fetchDpaAcceptance(client, orgId, version = DPA_VERSION) {
  if (!orgId) return { status: 'idle' };
  const { data, error } = await client
    .from('dpa_acceptances')
    .select('id, accepted_at, dpa_version, user_id')
    .eq('org_id', orgId)
    .eq('dpa_version', version)
    .limit(1);
  if (error) {
    return { status: isDpaStorageUnavailable(error) ? 'unavailable' : 'error' };
  }
  const row = Array.isArray(data) ? data[0] : null;
  return row ? { status: 'accepted', row } : { status: 'missing' };
}

export async function recordDpaAcceptance(client, fields) {
  const orgId = fields && fields.orgId;
  const version = (fields && fields.version) || DPA_VERSION;
  const userAgent = (fields && fields.userAgent) || null;
  if (!orgId) return { ok: false, unavailable: false };
  const { error } = await client.rpc('accept_dpa', {
    p_org_id: orgId,
    p_version: version,
    p_user_agent: userAgent,
  });
  if (!error) return { ok: true };
  if (isDuplicateDpaAcceptance(error)) return { ok: true, duplicate: true };
  if (isDpaStorageUnavailable(error)) return { ok: false, unavailable: true };
  return { ok: false, unavailable: false };
}
