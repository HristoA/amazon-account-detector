import { t } from '@/utils/i18n/i18n';

type CheckedEntry = { checkedAt: number; lastKnown?: boolean };

/** Newest positive checkedAt in the cache (optionally scoped to ids). */
export function latestCheckedAt(
  authByMarketplace: Record<string, CheckedEntry | undefined>,
  marketplaceIds?: readonly string[],
): number | undefined {
  const entries = marketplaceIds
    ? marketplaceIds.map((id) => authByMarketplace[id])
    : Object.values(authByMarketplace);

  let latest: number | undefined;
  for (const entry of entries) {
    const at = entry?.checkedAt;
    if (!at) continue;
    if (latest === undefined || at > latest) {
      latest = at;
    }
  }
  return latest;
}

/**
 * Whether the entry that owns the newest checkedAt is flagged last-known
 * (optionally scoped to marketplace ids).
 */
export function latestEntryIsLastKnown(
  authByMarketplace: Record<string, CheckedEntry | undefined>,
  marketplaceIds?: readonly string[],
): boolean {
  const latest = latestCheckedAt(authByMarketplace, marketplaceIds);
  if (latest == null) {
    return false;
  }
  const entries = marketplaceIds
    ? marketplaceIds.map((id) => authByMarketplace[id])
    : Object.values(authByMarketplace);
  for (const entry of entries) {
    if (entry?.checkedAt === latest && entry.lastKnown) {
      return true;
    }
  }
  return false;
}

/** Right after a check / refresh completes. */
export const JUST_NOW_MS = 1_000;

/**
 * Whether a finished refresh should show "Checked just now".
 * False when the cache was not updated (e.g. unknown result skipped).
 * Pass the checkedAt snapshot from refresh *start*, not mid-batch state.
 */
export function cacheAdvancedDuringRefresh(
  previousCheckedAt: number | undefined,
  nextCheckedAt: number | undefined,
): boolean {
  if (nextCheckedAt == null || nextCheckedAt <= 0) {
    return false;
  }
  if (previousCheckedAt == null || previousCheckedAt <= 0) {
    return true;
  }
  return nextCheckedAt > previousCheckedAt;
}

/**
 * Compact header subtitle: just now, seconds ago, relative minutes+, or never.
 * When `lastKnown`, prefixes with "Last known" so skipped verifies are clear.
 */
export function formatHeaderFreshness(
  checkedAt: number | undefined,
  now: number,
  locale: string,
  lastKnown = false,
): string {
  if (!checkedAt) {
    return t('neverChecked');
  }

  const deltaMs = Math.max(0, now - checkedAt);
  let relative: string;
  if (deltaMs < JUST_NOW_MS) {
    relative = t('checkedJustNow');
  } else {
    const seconds = Math.floor(deltaMs / 1000);
    if (seconds < 60) {
      relative = t('checkedSecondsAgo', { seconds: Math.max(1, seconds) });
    } else {
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
      if (seconds < 3600) {
        relative = rtf.format(-Math.round(seconds / 60), 'minute');
      } else if (seconds < 86400) {
        relative = rtf.format(-Math.round(seconds / 3600), 'hour');
      } else {
        relative = rtf.format(-Math.round(seconds / 86400), 'day');
      }
    }
  }

  if (lastKnown) {
    return t('lastKnownFreshness', { relative });
  }
  return relative;
}
