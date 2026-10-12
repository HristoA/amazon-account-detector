import { beforeEach, describe, expect, it } from 'vitest';
import { setActiveLocale } from '@/utils/i18n/i18n';
import { formatHeaderFreshness, latestCheckedAt } from './header-freshness';

describe('latestCheckedAt', () => {
  it('returns undefined when nothing has been checked', () => {
    expect(latestCheckedAt({})).toBeUndefined();
    expect(latestCheckedAt({ us: { checkedAt: 0 } })).toBeUndefined();
  });

  it('returns the newest checkedAt across marketplaces', () => {
    expect(
      latestCheckedAt({
        us: { checkedAt: 100 },
        de: { checkedAt: 300 },
        uk: { checkedAt: 200 },
      }),
    ).toBe(300);
  });

  it('limits to the provided marketplace ids', () => {
    expect(
      latestCheckedAt(
        {
          us: { checkedAt: 100 },
          de: { checkedAt: 300 },
        },
        ['us'],
      ),
    ).toBe(100);
  });
});

describe('formatHeaderFreshness', () => {
  beforeEach(() => {
    setActiveLocale('en');
  });

  it('shows never-checked when missing', () => {
    expect(formatHeaderFreshness(undefined, 1_000_000, 'en')).toBe(
      'Never checked',
    );
    expect(formatHeaderFreshness(0, 1_000_000, 'en')).toBe('Never checked');
  });

  it('shows checked just now within the first second', () => {
    const now = 1_000_000;
    expect(formatHeaderFreshness(now, now, 'en')).toBe('Checked just now');
    expect(formatHeaderFreshness(now - 999, now, 'en')).toBe(
      'Checked just now',
    );
  });

  it('shows seconds ago under one minute', () => {
    const now = 1_000_000;
    expect(formatHeaderFreshness(now - 1_000, now, 'en')).toBe(
      'Checked 1s ago',
    );
    expect(formatHeaderFreshness(now - 5_000, now, 'en')).toBe(
      'Checked 5s ago',
    );
    expect(formatHeaderFreshness(now - 59_999, now, 'en')).toBe(
      'Checked 59s ago',
    );
  });

  it('shows a relative label after one minute', () => {
    const now = Date.UTC(2026, 0, 1, 12, 0, 0);
    const checkedAt = now - 5 * 60_000;
    const label = formatHeaderFreshness(checkedAt, now, 'en');
    expect(label.toLowerCase()).toContain('minute');
  });
});
