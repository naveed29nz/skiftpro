/** Slack so iOS Safari still counts as the end.
 * scrollTop is fractional, momentum often settles a few pixels early,
 * and a padded scrollport can rest about a padding short of scrollHeight.
 * The old check used 12px, which is less than the contract box padding (20px). */
export const CONTRACT_SCROLL_END_TOLERANCE_PX = 48;

export function contractReachedEnd(metrics) {
  if (!metrics) return false;
  const scrollHeight = Number(metrics.scrollHeight) || 0;
  const clientHeight = Number(metrics.clientHeight) || 0;
  const scrollTop = Number(metrics.scrollTop) || 0;
  if (clientHeight <= 0) return false;
  if (scrollHeight - clientHeight <= CONTRACT_SCROLL_END_TOLERANCE_PX) return true;
  return scrollHeight - clientHeight - scrollTop <= CONTRACT_SCROLL_END_TOLERANCE_PX;
}

export function sentinelInView(root, sentinel, tolerance = CONTRACT_SCROLL_END_TOLERANCE_PX) {
  if (!root || !sentinel || typeof root.getBoundingClientRect !== 'function') return false;
  if (typeof sentinel.getBoundingClientRect !== 'function') return false;
  const rootBox = root.getBoundingClientRect();
  const endBox = sentinel.getBoundingClientRect();
  if (!rootBox || rootBox.height <= 0) return false;
  return endBox.top <= rootBox.bottom + tolerance && endBox.bottom >= rootBox.top - tolerance;
}
