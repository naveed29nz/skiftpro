import test from 'node:test';
import assert from 'node:assert/strict';
import { sameEmail } from './emails.js';
import { claimOrgId, isMissingClaimRpc, resolveSignupGate, resolveSignupKind } from './signupGate.js';

test('worker email match ignores case and surrounding space', () => {
  assert.equal(sameEmail(' Ada@Butikk.no ', 'ada@butikk.no'), true);
  assert.equal(sameEmail('', 'ada@butikk.no'), false);
  assert.equal(sameEmail('a@x.no', 'b@x.no'), false);
});

test('signup kind prefers the profile column and ignores unknown values', () => {
  assert.equal(resolveSignupKind({ signup_kind: 'business' }, { signup_kind: 'employee' }), 'business');
  assert.equal(resolveSignupKind({ signup_kind: null }, { signup_kind: 'employee' }), 'employee');
  assert.equal(resolveSignupKind({}, { signup_kind: 'owner' }), null);
  assert.equal(resolveSignupKind(null, null), null);
});

test('only an explicit business signup without a worker or org sees organization setup', () => {
  const base = { platformRole: 'user', hasWorker: false, hasOrg: false, termsAccepted: true };
  assert.equal(resolveSignupGate({ ...base, signupKind: 'business' }), 'onboarding');
  assert.equal(resolveSignupGate({ ...base, signupKind: 'employee' }), 'employee');
  assert.equal(resolveSignupGate({ ...base, signupKind: null }), 'employee');
  assert.equal(resolveSignupGate({ ...base, platformRole: 'admin', signupKind: null }), 'app');
  assert.equal(resolveSignupGate({ ...base, platformRole: 'admin', signupKind: 'business' }), 'app');
  assert.equal(resolveSignupGate({ ...base, hasWorker: true, signupKind: 'business' }), 'app');
  assert.equal(resolveSignupGate({ ...base, hasOrg: true, signupKind: 'employee' }), 'app');
  assert.equal(resolveSignupGate({ ...base, termsAccepted: false, signupKind: 'business' }), 'app');
});

test('a missing claim function is ignored and an org id is read from one row', () => {
  assert.equal(isMissingClaimRpc({ code: 'PGRST202', message: 'Could not find the function public.claim_worker_card' }), true);
  assert.equal(isMissingClaimRpc({ code: '42501', message: 'Ikke innlogget' }), false);
  assert.equal(claimOrgId([]), null);
  assert.equal(claimOrgId([{ org_id: 'org-1', worker_id: 'w-1', role: 'user' }]), 'org-1');
  assert.equal(claimOrgId({ org_id: null }), null);
});
