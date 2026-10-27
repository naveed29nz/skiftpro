import test from 'node:test';
import assert from 'node:assert/strict';
import { isMissingColumnError, isNotNullViolation, workerUpdateFallback } from './writeFallback.js';

const heider = {
  name: 'Heider Iqbal',
  ansettelsestype: 'tilkalling',
  employment_percentage: null,
  timer_per_uke: null,
  timer_per_dag: null,
  hourly_rate: 185,
  break_after_hours: 6,
  break_length_minutes: 30,
  fodselsnummer: '13060782169',
};

test('PostgREST schema-cache miss is a missing column, unlike the old 42703 text only', () => {
  const schemaCache = {
    code: 'PGRST204',
    message: "Could not find the 'break_after_hours' column of 'workers' in the schema cache",
  };
  assert.equal(isMissingColumnError(schemaCache), true);
  assert.equal(isMissingColumnError({ code: '42703', message: 'column break_after_hours of relation workers does not exist' }), true);
  assert.equal(isMissingColumnError({ code: '23502', message: 'null value in column "employment_percentage" of relation "workers" violates not-null constraint' }), false);
});

test('Heider ekstrahjelp save retries without a missing break column and then without a null percentage', () => {
  const missingBreak = {
    code: 'PGRST204',
    message: "Could not find the 'break_after_hours' column of 'workers' in the schema cache",
  };
  const first = workerUpdateFallback(heider, missingBreak);
  assert.equal(Object.hasOwn(first.payload, 'break_after_hours'), false);
  assert.equal(Object.hasOwn(first.payload, 'break_length_minutes'), false);
  assert.equal(first.payload.employment_percentage, null);
  assert.match(first.warning, /pauseregel/);

  const notNull = {
    code: '23502',
    message: 'null value in column "employment_percentage" of relation "workers" violates not-null constraint',
  };
  assert.equal(isNotNullViolation(notNull), true);
  const second = workerUpdateFallback(first.payload, notNull);
  assert.equal(Object.hasOwn(second.payload, 'employment_percentage'), false);
  assert.equal(second.payload.name, 'Heider Iqbal');
  assert.equal(second.payload.hourly_rate, 185);
  assert.equal(second.warning, '');

  assert.equal(workerUpdateFallback(second.payload, { message: 'permission denied' }), null);
});

test('an empty break is dropped quietly when the columns are missing', () => {
  const next = workerUpdateFallback(
    { ...heider, break_after_hours: null, break_length_minutes: null },
    { message: "Could not find the 'break_length_minutes' column of 'workers' in the schema cache" },
  );
  assert.equal(next.warning, '');
  assert.equal(Object.hasOwn(next.payload, 'break_after_hours'), false);
});
