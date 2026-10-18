import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TOAST_DURATION_MS,
  TOAST_REMOVE_DELAY_MS,
  createToastStore,
} from './toast-store.js';

function fakeClock() {
  const queued = [];
  return {
    queued,
    schedule(fn, ms) {
      const handle = { fn, ms, cancelled: false };
      queued.push(handle);
      return handle;
    },
    cancel(handle) {
      handle.cancelled = true;
    },
    run(handle) {
      if (handle.cancelled) return;
      handle.fn();
    },
  };
}

test('a toast closes itself after a few seconds and then leaves the page', () => {
  const clock = fakeClock();
  const store = createToastStore({ schedule: clock.schedule, cancel: clock.cancel });
  store.toast({ title: 'Kunne ikke laste ned PDF' });

  assert.equal(store.getState().toasts.length, 1);
  assert.equal(store.getState().toasts[0].open, true);
  assert.equal(clock.queued[0].ms, DEFAULT_TOAST_DURATION_MS);
  assert.equal(DEFAULT_TOAST_DURATION_MS <= 6000, true);

  clock.run(clock.queued[0]);
  assert.equal(store.getState().toasts[0].open, false);
  assert.equal(clock.queued[1].ms, TOAST_REMOVE_DELAY_MS);
  assert.equal(TOAST_REMOVE_DELAY_MS < 1000, true);

  clock.run(clock.queued[1]);
  assert.equal(store.getState().toasts.length, 0);
});

test('the close control dismisses immediately and cancels the auto-dismiss timer', () => {
  const clock = fakeClock();
  const store = createToastStore({ schedule: clock.schedule, cancel: clock.cancel });
  const handle = store.toast({ title: 'Kunne ikke slette avtalen' });

  handle.dismiss();
  assert.equal(clock.queued[0].cancelled, true);
  assert.equal(store.getState().toasts[0].open, false);

  clock.run(clock.queued[1]);
  assert.equal(store.getState().toasts.length, 0);
  clock.run(clock.queued[0]);
  assert.equal(store.getState().toasts.length, 0);
});

test('closing from the toast itself uses the same dismiss path', () => {
  const clock = fakeClock();
  const store = createToastStore({ schedule: clock.schedule, cancel: clock.cancel });
  store.toast({ title: 'Feil' });
  store.getState().toasts[0].onOpenChange(false);
  assert.equal(store.getState().toasts[0].open, false);
  assert.equal(clock.queued[0].cancelled, true);
});
