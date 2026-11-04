import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_CHROME_Z, DIALOG_Z, SELECT_Z, TOAST_Z, maxAppChromeZ } from './layers.js';

test('the employee dialog paints above the sticky header, demo bar and mobile controls', () => {
  assert.ok(DIALOG_Z > APP_CHROME_Z.header);
  assert.ok(DIALOG_Z > APP_CHROME_Z.impersonation);
  assert.ok(DIALOG_Z > APP_CHROME_Z.demoBar);
  assert.ok(DIALOG_Z > APP_CHROME_Z.mobileControls);
  assert.equal(DIALOG_Z > maxAppChromeZ(), true);
  assert.ok(SELECT_Z > DIALOG_Z);
  assert.ok(TOAST_Z > SELECT_Z);
});
