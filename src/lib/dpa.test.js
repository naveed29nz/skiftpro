import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DPA_VERSION,
  dpaAcceptanceLabel,
  dpaPromptStorageKey,
  isDpaStorageUnavailable,
  isDuplicateDpaAcceptance,
} from './dpa.js';

test('the acceptance label names the published version', () => {
  assert.equal(DPA_VERSION, '0.9');
  assert.equal(dpaAcceptanceLabel(), 'Jeg aksepterer databehandleravtalen (versjon 0.9)');
  assert.equal(dpaAcceptanceLabel('1.0'), 'Jeg aksepterer databehandleravtalen (versjon 1.0)');
});

test('the one-time prompt is stored per organisation and version', () => {
  assert.equal(dpaPromptStorageKey('org-1'), 'skiftpro.dpaPromptDismissed.org-1.0.9');
});

test('a missing acceptance table or function is treated as unavailable', () => {
  assert.equal(isDpaStorageUnavailable({
    code: 'PGRST205',
    message: "Could not find the table 'public.dpa_acceptances' in the schema cache",
  }), true);
  assert.equal(isDpaStorageUnavailable({
    code: '42P01',
    message: 'relation "public.dpa_acceptances" does not exist',
  }), true);
  assert.equal(isDpaStorageUnavailable({
    code: 'PGRST202',
    message: 'Could not find the function public.accept_dpa(p_org_id, p_version, p_user_agent) in the schema cache',
  }), true);
  assert.equal(isDpaStorageUnavailable({
    code: '42883',
    message: 'function public.accept_dpa(text, text, text) does not exist',
  }), true);
  assert.equal(isDpaStorageUnavailable({
    code: '42501',
    message: 'permission denied for table dpa_acceptances',
  }), false);
  assert.equal(isDpaStorageUnavailable(null), false);
});

test('accepting the same version twice is not a failure', () => {
  assert.equal(isDuplicateDpaAcceptance({
    code: '23505',
    message: 'duplicate key value violates unique constraint "dpa_acceptances_org_user_version"',
  }), true);
  assert.equal(isDuplicateDpaAcceptance({
    code: 'PGRST205',
    message: 'schema cache',
  }), false);
});
