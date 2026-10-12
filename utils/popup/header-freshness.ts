import { t } from '@/utils/i18n/i18n';

type CheckedEntry = { checkedAt: number };

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

/** Right after a check / refresh completes. */
export const JUST_NOW_MS = 1_000;

/**
 * Compact header subtitle: just now, seconds ago, relative minutes+, or never.
 */
export function formatHeaderFreshness(
  checkedAt: number | undefined,
  now: number,
  locale: string,
): string {
  if (!checkedAt) {
    return t('neverChecked');
  }

  const deltaMs = Math.max(0, now - checkedAt);
  if (deltaMs < JUST_NOW_MS) {
    return t('checkedJustNow');
  }

  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 60) {
    return t('checkedSecondsAgo', { seconds: Math.max(1, seconds) });
  }

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (seconds < 3600) {
    return rtf.format(-Math.round(seconds / 60), 'minute');
  }
  if (seconds < 86400) {
    return rtf.format(-Math.round(seconds / 3600), 'hour');
  }
  return rtf.format(-Math.round(seconds / 86400), 'day');
}
