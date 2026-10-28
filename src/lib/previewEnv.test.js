import test from 'node:test';
import assert from 'node:assert/strict';
import { previewUsesProduction } from './previewEnv.js';

const prod = 'https://iobsolszrmigdmdydfbe.supabase.co';

test('a Vercel preview build that still points at production is called out', () => {
  assert.equal(previewUsesProduction('preview', prod), true);
  assert.equal(previewUsesProduction('production', prod), false);
  assert.equal(previewUsesProduction('preview', 'https://otherproject.supabase.co'), false);
  assert.equal(previewUsesProduction('', prod), false);
});
