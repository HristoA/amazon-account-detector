/** While the popup stays open, re-check this often. */
export const POPUP_OPEN_AUTO_REFRESH_MS = 30 * 60 * 1000;

/**
 * Whether an open-popup auto-refresh should fire given the last trigger time.
 * Pass `lastTriggeredAt = 0` (or omit) for the first eligible fire after open.
 */
export function shouldTriggerPopupOpenRefresh(
  openedAt: number,
  now: number,
  lastTriggeredAt: number = 0,
  intervalMs: number = POPUP_OPEN_AUTO_REFRESH_MS,
): boolean {
  if (now - openedAt < intervalMs) {
    return false;
  }
  if (lastTriggeredAt <= 0) {
    return true;
  }
  return now - lastTriggeredAt >= intervalMs;
}
