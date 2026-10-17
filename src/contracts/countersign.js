export const COUNTERSIGN_TOAST = 'Avtalen er signert av begge parter';
export const CONTRACTS_PATH = '/Contracts';

export function employerCountersignDestination(role, status) {
  if (role === 'arbeidsgiver' && status === 'signert') {
    return { path: CONTRACTS_PATH, toast: COUNTERSIGN_TOAST };
  }
  return null;
}

export function countersignerIdentity({ document, contract, events } = {}) {
  const list = Array.isArray(events) ? events : [];
  let payload = {};
  let actorId = '';
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i]?.event_type === 'motsignert') {
      payload = list[i].payload || {};
      actorId = list[i].actor_id || '';
      break;
    }
  }
  const name = String(document?.employer_signed_name || payload.name || '').trim();
  const email = String(document?.employer_signed_email || payload.email || '').trim();
  const userId = String(
    document?.employer_signed_by
    || contract?.employer_signed_by
    || payload.user_id
    || actorId
    || '',
  ).trim();
  const signedAt = document?.employer_signed_at || contract?.employer_signed_at || null;
  return { name, email, userId, signedAt };
}
