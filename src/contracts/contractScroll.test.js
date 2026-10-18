import test from 'node:test';
import assert from 'node:assert/strict';
import { contractReachedEnd, sentinelInView, CONTRACT_SCROLL_END_TOLERANCE_PX } from './contractScroll.js';

function box(top, bottom) {
  return {
    getBoundingClientRect: () => ({ top, bottom, height: bottom - top, width: 100, left: 0, right: 100 }),
  };
}

test('short contract text unlocks without scrolling', () => {
  assert.equal(contractReachedEnd({ scrollTop: 0, clientHeight: 420, scrollHeight: 180 }), true);
  assert.equal(contractReachedEnd({ scrollTop: 0, clientHeight: 420, scrollHeight: 420 }), true);
});

test('content within the tolerance of the box counts as already read', () => {
  assert.equal(
    contractReachedEnd({ scrollTop: 0, clientHeight: 420, scrollHeight: 420 + CONTRACT_SCROLL_END_TOLERANCE_PX }),
    true,
  );
  assert.equal(
    contractReachedEnd({ scrollTop: 0, clientHeight: 420, scrollHeight: 420 + CONTRACT_SCROLL_END_TOLERANCE_PX + 1 }),
    false,
  );
});

test('iOS padding gap past the old 12px slack still counts as the end', () => {
  const clientHeight = 420;
  const scrollHeight = 1052;
  const paddingGap = 20;
  const scrollTop = scrollHeight - clientHeight - paddingGap;
  const oldCheck = scrollTop + clientHeight >= scrollHeight - 12;
  assert.equal(oldCheck, false);
  assert.equal(contractReachedEnd({ scrollTop, clientHeight, scrollHeight }), true);
});

test('fractional iOS scrollTop near the end counts as the end', () => {
  assert.equal(contractReachedEnd({
    scrollTop: 631.4,
    clientHeight: 420,
    scrollHeight: 1052.8,
  }), true);
});

test('a reader who has not reached the end stays locked', () => {
  assert.equal(contractReachedEnd({ scrollTop: 0, clientHeight: 420, scrollHeight: 1052 }), false);
  assert.equal(contractReachedEnd({ scrollTop: 200, clientHeight: 420, scrollHeight: 1052 }), false);
  assert.equal(contractReachedEnd(null), false);
  assert.equal(contractReachedEnd({ scrollTop: 0, clientHeight: 0, scrollHeight: 0 }), false);
});

test('the end sentinel is visible with the same tolerance', () => {
  const root = box(100, 520);
  assert.equal(sentinelInView(root, box(500, 516)), true);
  assert.equal(sentinelInView(root, box(540, 556)), true);
  assert.equal(sentinelInView(root, box(600, 616)), false);
  assert.equal(sentinelInView(null, box(500, 516)), false);
});
