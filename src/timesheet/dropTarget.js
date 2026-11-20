// hello-pangea highlights the droppable under the dragged card's centre.
// A tall shift grabbed at a corner then lands a row or column away from the
// pointer. These helpers pick the cell under the pointer instead.
//
// Coordinates are viewport coordinates: clientX/clientY and
// getBoundingClientRect(). Callers must read them when the pointer moves
// or the page scrolls, not from the position captured at drag start.
// A scroll moves the cells under a stationary pointer; adding pageY/scrollY
// on top of client coordinates would count that scroll twice.

export const DROPPABLE_ID_ATTR = 'data-rfd-droppable-id';
export const DRAG_OVERLAY_ATTR = 'data-shift-drag-overlay';
export const DROP_DISABLED_ATTR = 'data-shift-drop-disabled';

const overlaySelector = `[${DRAG_OVERLAY_ATTR}="true"]`;
const droppableSelector = `[${DROPPABLE_ID_ATTR}]`;

export function isShiftDroppableId(id) {
  return typeof id === 'string'
    && id !== 'rows'
    && !id.startsWith('groupshift__')
    && id.includes('__');
}

export function isGroupShiftDroppableId(id) {
  return typeof id === 'string' && id.startsWith('groupshift__');
}

export function rectContainsPoint(rect, x, y) {
  if (!rect) return false;
  // Half-open so a shared edge belongs to the next cell, not both.
  return x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
}

export function intersectionArea(a, b) {
  if (!a || !b) return 0;
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (width <= 0 || height <= 0) return 0;
  return width * height;
}

function rectArea(rect) {
  return Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top);
}

function centerDistance(rect, x, y) {
  const cx = (rect.left + rect.right) / 2;
  const cy = (rect.top + rect.bottom) / 2;
  const dx = cx - x;
  const dy = cy - y;
  return dx * dx + dy * dy;
}

/**
 * pointerWithin, then rectIntersection.
 * Droppables are { id, rect, disabled }.
 * The pointer wins whenever it sits inside an enabled cell, even if the
 * dragged card's centre (dragRect) is over a different row or column.
 * A disabled cell under the pointer is not a target and does not fall
 * through to a neighbour. Intersection is only used when the pointer is
 * outside every droppable; the greatest overlap wins, then the cell whose
 * centre is closer to the pointer.
 */
export function resolveDropTarget({ pointer, droppables, dragRect = null }) {
  if (!pointer || !Array.isArray(droppables) || droppables.length === 0) return null;
  const { x, y } = pointer;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const hits = [];
  let blocked = false;
  for (const droppable of droppables) {
    if (!rectContainsPoint(droppable?.rect, x, y)) continue;
    if (droppable.disabled) {
      blocked = true;
      continue;
    }
    hits.push(droppable);
  }
  if (hits.length) {
    hits.sort((a, b) => {
      const area = rectArea(a.rect) - rectArea(b.rect);
      if (area !== 0) return area;
      return centerDistance(a.rect, x, y) - centerDistance(b.rect, x, y);
    });
    return hits[0].id;
  }
  if (blocked || !dragRect) return null;

  let best = null;
  let bestArea = 0;
  let bestDistance = Infinity;
  for (const droppable of droppables) {
    if (!droppable || droppable.disabled || !droppable.rect) continue;
    const area = intersectionArea(droppable.rect, dragRect);
    if (area <= 0) continue;
    const distance = centerDistance(droppable.rect, x, y);
    if (area > bestArea || (area === bestArea && distance < bestDistance)) {
      best = droppable;
      bestArea = area;
      bestDistance = distance;
    }
  }
  return best ? best.id : null;
}

function elementsAt(doc, x, y) {
  if (typeof doc.elementsFromPoint === 'function') {
    const found = doc.elementsFromPoint(x, y);
    if (found && typeof found.length === 'number') return Array.from(found);
  }
  if (typeof doc.elementFromPoint === 'function') {
    const one = doc.elementFromPoint(x, y);
    return one ? [one] : [];
  }
  return [];
}

function toRect(domRect) {
  if (!domRect) return null;
  return {
    left: domRect.left,
    top: domRect.top,
    right: domRect.right,
    bottom: domRect.bottom,
  };
}

export function readDroppableBoxes(doc, accept) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return [];
  const boxes = [];
  for (const node of Array.from(doc.querySelectorAll(droppableSelector))) {
    const id = node.getAttribute?.(DROPPABLE_ID_ATTR);
    if (!accept(id) || typeof node.getBoundingClientRect !== 'function') continue;
    const rect = toRect(node.getBoundingClientRect());
    if (!rect) continue;
    boxes.push({
      id,
      disabled: node.getAttribute?.(DROP_DISABLED_ATTR) === 'true',
      rect,
    });
  }
  return boxes;
}

export function readDragRect(doc) {
  const node = doc?.querySelector?.(overlaySelector);
  if (!node || typeof node.getBoundingClientRect !== 'function') return null;
  return toRect(node.getBoundingClientRect());
}

function droppableFromPoint(doc, x, y, accept) {
  const seen = new Set();
  for (const el of elementsAt(doc, x, y)) {
    if (!el || typeof el.closest !== 'function' || seen.has(el)) continue;
    seen.add(el);
    // The card follows the grab point and can cover several rows. It must
    // not count as the element under the pointer, even when it is still
    // parented to the cell the drag started in.
    if (el.closest(overlaySelector)) continue;
    const node = el.closest(droppableSelector);
    if (!node || seen.has(node)) continue;
    seen.add(node);
    const id = node.getAttribute?.(DROPPABLE_ID_ATTR);
    if (!accept(id)) continue;
    return {
      id,
      disabled: node.getAttribute?.(DROP_DISABLED_ATTR) === 'true',
    };
  }
  return null;
}

/**
 * Element under the pointer first (elementFromPoint / elementsFromPoint).
 * When that misses — the pointer is in a gap, or the only hit is the drag
 * overlay — fall back to resolveDropTarget, which uses the live viewport
 * rects so a scroll during the drag is already reflected.
 */
export function resolvePointerDrop(doc, { clientX, clientY, accept }) {
  if (!doc || typeof accept !== 'function') return null;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  const hit = droppableFromPoint(doc, clientX, clientY, accept);
  if (hit) return hit.disabled ? null : hit.id;
  return resolveDropTarget({
    pointer: { x: clientX, y: clientY },
    droppables: readDroppableBoxes(doc, accept),
    dragRect: readDragRect(doc),
  });
}

/**
 * Which droppable id a finished drag should write.
 * Mouse and touch (FLUID) use the pointer. Keyboard (SNAP) keeps the
 * library destination. Escape (CANCEL) writes nothing. Row reordering is
 * not a shift move, so it keeps destinationId.
 * A pointer that is not over a cell does not fall back to the centre-based
 * destination: that is the offset this exists to avoid.
 */
export function dropIdForDragEnd({
  type,
  mode,
  reason,
  destinationId = null,
  pointer = null,
  resolve,
} = {}) {
  if (reason === 'CANCEL') return null;
  if (type !== 'SHIFT' && type !== 'GROUPSHIFT') return destinationId ?? null;
  if (mode === 'SNAP' || !pointer || typeof resolve !== 'function') return destinationId ?? null;
  return resolve(pointer) || null;
}
