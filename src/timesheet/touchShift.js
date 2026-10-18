export const SHIFT_LONG_PRESS_MS = 450;
export const SHIFT_PRESS_MOVE_PX = 10;

export function isTouchLikePointer(event) {
  const type = event?.pointerType;
  return type === 'touch' || type === 'pen';
}

export function pressMovedPast(origin, point, limit = SHIFT_PRESS_MOVE_PX) {
  if (!origin || !point) return false;
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return dx * dx + dy * dy > limit * limit;
}

// A finger, a pen, or the click iOS synthesizes after a touch on a coarse
// screen. A real mouse stays a mouse even when the device also has a touchscreen.
export function shiftGestureIsTouch({ pointerType, sawTouch = false, sawMouse = false, coarse = false } = {}) {
  if (sawMouse) return false;
  if (pointerType === 'touch' || pointerType === 'pen') return true;
  // iOS fires a mouse click after the finger. That click is still a touch.
  if (sawTouch) return true;
  if (pointerType === 'mouse') return false;
  return Boolean(coarse);
}

export function isCoarsePointer() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}
