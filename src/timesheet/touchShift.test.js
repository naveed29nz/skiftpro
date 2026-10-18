import test from 'node:test';
import assert from 'node:assert/strict';
import { isTouchLikePointer, pressMovedPast, SHIFT_LONG_PRESS_MS, SHIFT_PRESS_MOVE_PX, shiftGestureIsTouch } from './touchShift.js';

test('a finger or pen is a touch-like pointer, a mouse is not', () => {
  assert.equal(isTouchLikePointer({ pointerType: 'touch' }), true);
  assert.equal(isTouchLikePointer({ pointerType: 'pen' }), true);
  assert.equal(isTouchLikePointer({ pointerType: 'mouse' }), false);
  assert.equal(isTouchLikePointer({}), false);
  assert.equal(isTouchLikePointer(null), false);
});

test('a small finger jitter is still a press, a scroll is not', () => {
  const origin = { x: 40, y: 80 };
  assert.equal(pressMovedPast(origin, { x: 44, y: 84 }), false);
  assert.equal(pressMovedPast(origin, { x: 40, y: 80 + SHIFT_PRESS_MOVE_PX + 1 }), true);
  assert.equal(pressMovedPast(null, { x: 1, y: 1 }), false);
});

test('the long press sits in the requested range', () => {
  assert.ok(SHIFT_LONG_PRESS_MS >= 400 && SHIFT_LONG_PRESS_MS <= 500);
});

test('touch is detected from the event, not from the screen width', () => {
  assert.equal(shiftGestureIsTouch({ pointerType: 'touch', coarse: false }), true);
  assert.equal(shiftGestureIsTouch({ pointerType: 'pen' }), true);
  assert.equal(shiftGestureIsTouch({ pointerType: 'mouse', coarse: true }), false);
  assert.equal(shiftGestureIsTouch({ pointerType: 'mouse', sawTouch: true }), true);
  assert.equal(shiftGestureIsTouch({ sawMouse: true, sawTouch: true, coarse: true }), false);
  assert.equal(shiftGestureIsTouch({ sawTouch: true }), true);
  assert.equal(shiftGestureIsTouch({ coarse: true }), true);
  assert.equal(shiftGestureIsTouch({}), false);
});
