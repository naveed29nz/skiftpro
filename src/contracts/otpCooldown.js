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

export function otpSendOutcome(message) {
  const text = String(message || '');
  if (text.includes('Ny kode kan sendes') || text.includes('kom ikke fram') || text.includes('allerede har fått')) {
    return 'cooldown';
  }
  return false;
}
