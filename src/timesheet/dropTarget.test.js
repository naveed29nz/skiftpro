import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRAG_OVERLAY_ATTR,
  DROP_DISABLED_ATTR,
  DROPPABLE_ID_ATTR,
  dropIdForDragEnd,
  isGroupShiftDroppableId,
  isShiftDroppableId,
  resolveDropTarget,
  resolvePointerDrop,
} from './dropTarget.js';

function cell(id, top, left = 400, { disabled = false, width = 80, height = 36 } = {}) {
  return {
    id,
    disabled,
    rect: { left, top, right: left + width, bottom: top + height },
  };
}

test('a tall card grabbed at the corner uses the cell under the pointer', () => {
  // Three short employee rows. The card covers the row above the pointer
  // and its centre sits in that row — the old drop target.
  const droppables = [
    cell('above__2026-11-19', 200),
    cell('pointer__2026-11-19', 236),
    cell('below__2026-11-19', 272),
  ];
  const pointer = { x: 470, y: 260 };
  const dragRect = { left: 410, top: 190, right: 490, bottom: 270 };
  const cardCenterY = (dragRect.top + dragRect.bottom) / 2;
  assert.ok(cardCenterY >= 200 && cardCenterY < 236);
  assert.equal(
    resolveDropTarget({ pointer, droppables, dragRect }),
    'pointer__2026-11-19',
  );
});

test('the column under the pointer wins when the card still covers the column beside it', () => {
  const droppables = [
    cell('w__2026-11-19', 200, 400),
    cell('w__2026-11-20', 200, 480),
  ];
  const pointer = { x: 500, y: 220 };
  const dragRect = { left: 420, top: 180, right: 510, bottom: 260 };
  const cardCenterX = (dragRect.left + dragRect.right) / 2;
  assert.ok(cardCenterX >= 400 && cardCenterX < 480);
  assert.equal(
    resolveDropTarget({ pointer, droppables, dragRect }),
    'w__2026-11-20',
  );
});

test('a pointer outside every cell falls back to the card overlap', () => {
  const droppables = [
    cell('thursday__2026-11-19', 100, 0, { width: 100, height: 36 }),
    cell('friday__2026-11-20', 136, 0, { width: 100, height: 36 }),
  ];
  const pointer = { x: 50, y: 40 };
  const dragRect = { left: 0, top: 90, right: 100, bottom: 150 };
  assert.equal(
    resolveDropTarget({ pointer, droppables, dragRect }),
    'thursday__2026-11-19',
  );
});

test('an equal overlap prefers the cell closer to the pointer', () => {
  const droppables = [
    cell('left__2026-11-19', 0, 0, { width: 100, height: 40 }),
    cell('right__2026-11-19', 0, 100, { width: 100, height: 40 }),
  ];
  const dragRect = { left: 50, top: 0, right: 150, bottom: 40 };
  assert.equal(
    resolveDropTarget({ pointer: { x: 190, y: -10 }, droppables, dragRect }),
    'right__2026-11-19',
  );
});

test('a disabled row under the pointer is not replaced by a neighbour', () => {
  const droppables = [
    cell('former__2026-11-19', 0, 0, { disabled: true, width: 100, height: 40 }),
    cell('active__2026-11-19', 40, 0, { width: 100, height: 40 }),
  ];
  const dragRect = { left: 0, top: 0, right: 100, bottom: 80 };
  assert.equal(
    resolveDropTarget({ pointer: { x: 10, y: 10 }, droppables, dragRect }),
    null,
  );
});

test('the smallest cell containing the pointer wins when rects overlap', () => {
  const droppables = [
    cell('rows', 0, 0, { width: 500, height: 500 }),
    cell('worker__2026-11-19', 10, 10, { width: 70, height: 40 }),
  ];
  assert.equal(
    resolveDropTarget({
      pointer: { x: 20, y: 20 },
      droppables,
      dragRect: { left: 0, top: 0, right: 400, bottom: 80 },
    }),
    'worker__2026-11-19',
  );
});

test('scrolling moves the cells under a stationary pointer', () => {
  const pointer = { x: 40, y: 100 };
  const before = [
    cell('first__2026-11-19', 80, 0, { width: 120, height: 40 }),
    cell('second__2026-11-19', 120, 0, { width: 120, height: 40 }),
  ];
  assert.equal(resolveDropTarget({ pointer, droppables: before, dragRect: null }), 'first__2026-11-19');
  // The page scrolled up 40px. Viewport rects move; clientX/clientY do not.
  const scrolled = before.map((box) => ({
    ...box,
    rect: {
      ...box.rect,
      top: box.rect.top - 40,
      bottom: box.rect.bottom - 40,
    },
  }));
  assert.equal(resolveDropTarget({ pointer, droppables: scrolled, dragRect: null }), 'second__2026-11-19');
});

test('shift and group ids stay on their own grids', () => {
  assert.equal(isShiftDroppableId('worker__2026-11-19'), true);
  assert.equal(isShiftDroppableId('rows'), false);
  assert.equal(isShiftDroppableId('groupshift__evening__2026-11-20'), false);
  assert.equal(isGroupShiftDroppableId('groupshift____2026-11-22'), true);
  assert.equal(isGroupShiftDroppableId('worker__2026-11-19'), false);
});

function element({
  id = null,
  disabled = false,
  overlay = false,
  rect = null,
  parent = null,
} = {}) {
  const node = {
    parent,
    id,
    disabled,
    overlay,
    rect,
    getAttribute(name) {
      if (name === DROPPABLE_ID_ATTR) return id;
      if (name === DROP_DISABLED_ATTR) return disabled ? 'true' : null;
      if (name === DRAG_OVERLAY_ATTR) return overlay ? 'true' : null;
      return null;
    },
    closest(selector) {
      const overlayMatch = selector === `[${DRAG_OVERLAY_ATTR}="true"]` && overlay;
      const droppableMatch = selector === `[${DROPPABLE_ID_ATTR}]` && id;
      if (overlayMatch || droppableMatch) return node;
      return parent ? parent.closest(selector) : null;
    },
    getBoundingClientRect() {
      return rect;
    },
  };
  return node;
}

function childOf(parent) {
  return element({ parent });
}

test('elementFromPoint lands on the cell under the pointer, not the card centre', () => {
  const source = element({
    id: 'source__2026-11-19',
    rect: { left: 0, top: 100, right: 80, bottom: 140 },
  });
  const next = element({
    id: 'next__2026-11-19',
    rect: { left: 0, top: 140, right: 80, bottom: 180 },
  });
  // The overlay is still a DOM child of the source cell, which is what made
  // a hit test on the card itself report the cell the drag started in.
  const overlay = element({
    overlay: true,
    parent: source,
    rect: { left: 0, top: 80, right: 80, bottom: 160 },
  });
  const doc = {
    elementsFromPoint() {
      return [overlay, childOf(next)];
    },
    querySelectorAll() {
      return [source, next];
    },
    querySelector() {
      return overlay;
    },
  };
  assert.equal(resolvePointerDrop(doc, {
    clientX: 40,
    clientY: 150,
    accept: isShiftDroppableId,
  }), 'next__2026-11-19');
});

test('a blocking overlay still resolves from the pointer once the stack misses', () => {
  const source = element({
    id: 'source__2026-11-19',
    rect: { left: 0, top: 100, right: 80, bottom: 140 },
  });
  const next = element({
    id: 'next__2026-11-19',
    rect: { left: 0, top: 140, right: 80, bottom: 180 },
  });
  const overlay = element({
    overlay: true,
    parent: source,
    rect: { left: 0, top: 80, right: 80, bottom: 160 },
  });
  const doc = {
    elementFromPoint() {
      return overlay;
    },
    querySelectorAll() {
      return [source, next];
    },
    querySelector() {
      return overlay;
    },
  };
  assert.equal(resolvePointerDrop(doc, {
    clientX: 40,
    clientY: 150,
    accept: isShiftDroppableId,
  }), 'next__2026-11-19');
});

test('a disabled cell hit by elementFromPoint does not fall through', () => {
  const former = element({
    id: 'former__2026-11-19',
    disabled: true,
    rect: { left: 0, top: 0, right: 80, bottom: 40 },
  });
  const active = element({
    id: 'active__2026-11-19',
    rect: { left: 0, top: 40, right: 80, bottom: 80 },
  });
  const doc = {
    elementsFromPoint() {
      return [childOf(former)];
    },
    querySelectorAll() {
      return [former, active];
    },
    querySelector() {
      return null;
    },
  };
  assert.equal(resolvePointerDrop(doc, {
    clientX: 10,
    clientY: 10,
    accept: isShiftDroppableId,
  }), null);
});

test('a scroll between reads follows the cell now under the pointer', () => {
  const first = element({
    id: 'first__2026-11-19',
    rect: { left: 0, top: 80, right: 80, bottom: 120 },
  });
  const second = element({
    id: 'second__2026-11-19',
    rect: { left: 0, top: 120, right: 80, bottom: 160 },
  });
  let scrolled = false;
  const doc = {
    elementsFromPoint(x, y) {
      const row = scrolled ? second : first;
      return y >= row.rect.top && y < row.rect.bottom ? [childOf(row)] : [];
    },
    querySelectorAll() {
      return [first, second];
    },
    querySelector() {
      return null;
    },
  };
  const point = { clientX: 20, clientY: 100, accept: isShiftDroppableId };
  assert.equal(resolvePointerDrop(doc, point), 'first__2026-11-19');
  first.rect = { left: 0, top: 40, right: 80, bottom: 80 };
  second.rect = { left: 0, top: 80, right: 80, bottom: 120 };
  scrolled = true;
  assert.equal(resolvePointerDrop(doc, point), 'second__2026-11-19');
});

test('fluid drags ignore the centre-based destination', () => {
  assert.equal(dropIdForDragEnd({
    type: 'SHIFT',
    mode: 'FLUID',
    reason: 'DROP',
    destinationId: 'above__2026-11-19',
    pointer: { x: 10, y: 10 },
    resolve: () => 'pointer__2026-11-19',
  }), 'pointer__2026-11-19');
  assert.equal(dropIdForDragEnd({
    type: 'GROUPSHIFT',
    mode: 'FLUID',
    reason: 'DROP',
    destinationId: 'groupshift__morning__2026-11-19',
    pointer: { x: 4, y: 4 },
    resolve: () => 'groupshift__evening__2026-11-20',
  }), 'groupshift__evening__2026-11-20');
});

test('a pointer over no cell does not fall back to the centre-based destination', () => {
  assert.equal(dropIdForDragEnd({
    type: 'SHIFT',
    mode: 'FLUID',
    reason: 'DROP',
    destinationId: 'above__2026-11-19',
    pointer: { x: 1, y: 1 },
    resolve: () => null,
  }), null);
});

test('keyboard drops and row reordering keep the library destination', () => {
  assert.equal(dropIdForDragEnd({
    type: 'SHIFT',
    mode: 'SNAP',
    reason: 'DROP',
    destinationId: 'keyboard__2026-11-19',
    pointer: { x: 1, y: 1 },
    resolve: () => 'pointer__2026-11-19',
  }), 'keyboard__2026-11-19');
  assert.equal(dropIdForDragEnd({
    type: 'ROW',
    mode: 'FLUID',
    reason: 'DROP',
    destinationId: 'rows',
    pointer: { x: 1, y: 1 },
    resolve: () => 'worker__2026-11-19',
  }), 'rows');
});

test('cancelling a drag does not move the shift', () => {
  assert.equal(dropIdForDragEnd({
    type: 'SHIFT',
    mode: 'FLUID',
    reason: 'CANCEL',
    destinationId: 'above__2026-11-19',
    pointer: { x: 1, y: 1 },
    resolve: () => 'pointer__2026-11-19',
  }), null);
});
