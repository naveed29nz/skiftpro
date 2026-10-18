import test from 'node:test';
import assert from 'node:assert/strict';
import {
  otpCooldownLabel,
  otpCooldownSeconds,
  otpDigits,
  otpSendOutcome,
  OTP_RESEND_COOLDOWN_MS,
} from './otpCooldown.js';

test('only digits from the code field are submitted', () => {
  assert.equal(otpDigits('855561'), '855561');
  assert.equal(otpDigits('855 561'), '855561');
  assert.equal(otpDigits('kode 855561!'), '855561');
  assert.equal(otpDigits(''), '');
});

test('a new code cannot be requested again during the 30 second cooldown', () => {
  const sentAt = 1_000_000;
  assert.equal(otpCooldownSeconds(sentAt, sentAt), 30);
  assert.equal(otpCooldownSeconds(sentAt, sentAt + 1000), 29);
  assert.equal(otpCooldownSeconds(sentAt, sentAt + OTP_RESEND_COOLDOWN_MS), 0);
  assert.equal(otpCooldownSeconds(0), 0);
  assert.equal(otpCooldownLabel(30), 'Ny kode kan sendes om 30 s');
});

test('a failed resend still starts the cooldown instead of firing again', () => {
  assert.equal(otpSendOutcome('Ny kode kan sendes om 30 sekunder'), 'cooldown');
  assert.equal(otpSendOutcome('E-posten med koden kom ikke fram. Prøv igjen om litt.'), 'cooldown');
  assert.equal(otpSendOutcome('Fant ikke avtalen'), false);
});
