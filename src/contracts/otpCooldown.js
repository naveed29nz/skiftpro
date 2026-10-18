export const OTP_RESEND_COOLDOWN_MS = 30_000;

export function otpDigits(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 6);
}

export function otpCooldownSeconds(sentAt, now = Date.now()) {
  const started = Number(sentAt);
  if (!Number.isFinite(started) || started <= 0) return 0;
  const left = started + OTP_RESEND_COOLDOWN_MS - now;
  if (left <= 0) return 0;
  return Math.ceil(left / 1000);
}

export function otpCooldownLabel(seconds) {
  return `Ny kode kan sendes om ${seconds} s`;
}

export function maskEmail(email) {
  const value = String(email || '').trim();
  const at = value.lastIndexOf('@');
  if (at <= 0 || at === value.length - 1) return '';
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (!domain.includes('.')) return '';
  const hidden = local.length <= 1 ? `${local}***` : `${local[0]}***${local[local.length - 1]}`;
  return `${hidden}@${domain}`;
}

export function otpSentMessage(email) {
  const masked = maskEmail(email);
  if (!masked) return 'Kode sendt – sjekk også Søppelpost/Annen';
  return `Kode sendt til ${masked} – sjekk også Søppelpost/Annen`;
}

export function otpSendOutcome(message) {
  const text = String(message || '');
  if (
    text.includes('Ny kode kan sendes')
    || text.includes('kom ikke fram')
    || text.includes('allerede har fått')
    || /kunne ikke kontakte|failed to fetch|networkerror|load failed/i.test(text)
  ) {
    return 'cooldown';
  }
  return false;
}
