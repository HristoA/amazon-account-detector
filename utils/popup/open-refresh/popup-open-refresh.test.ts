import { describe, expect, it } from 'vitest';
import {
  POPUP_OPEN_AUTO_REFRESH_MS,
  shouldTriggerPopupOpenRefresh,
} from './popup-open-refresh';

describe('shouldTriggerPopupOpenRefresh', () => {
  const openedAt = 1_000_000;

  it('is false before the interval elapses', () => {
    expect(
      shouldTriggerPopupOpenRefresh(
        openedAt,
        openedAt + POPUP_OPEN_AUTO_REFRESH_MS - 1,
      ),
    ).toBe(false);
  });

  it('is true at/after 30 minutes when never triggered', () => {
    expect(
      shouldTriggerPopupOpenRefresh(
        openedAt,
        openedAt + POPUP_OPEN_AUTO_REFRESH_MS,
      ),
    ).toBe(true);
  });

  it('waits another full interval after a prior trigger', () => {
    const first = openedAt + POPUP_OPEN_AUTO_REFRESH_MS;
    expect(shouldTriggerPopupOpenRefresh(openedAt, first, 0)).toBe(true);
    expect(
      shouldTriggerPopupOpenRefresh(
        openedAt,
        first + POPUP_OPEN_AUTO_REFRESH_MS - 1,
        first,
      ),
    ).toBe(false);
    expect(
      shouldTriggerPopupOpenRefresh(
        openedAt,
        first + POPUP_OPEN_AUTO_REFRESH_MS,
        first,
      ),
    ).toBe(true);
  });
});
