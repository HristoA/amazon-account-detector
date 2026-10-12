import type { AuthCacheEntry } from '@/utils/auth/auth-types';
import { formatCheckedAt, type MessageKey } from '@/utils/i18n/i18n';
import type { Marketplace } from '@/utils/marketplace/marketplaces';
import { displayMarketEmail } from '@/utils/popup/market-card-display';
import { resolveFilterStatus } from '@/utils/popup/status-filter';

export interface MarketCardRow {
  statusClass: string;
  status: string;
  email: string;
  checkedLabel: string;
  tooltip: string;
  updating: boolean;
  lastKnown: boolean;
  linkStatus: AuthCacheEntry['status'] | undefined;
}

export interface BuildMarketCardRowParams {
  marketplace: Marketplace;
  entry: AuthCacheEntry | undefined;
  updating: boolean;
  locale: string;
  t: (key: MessageKey) => string;
}

export function statusLabelForEntry(
  entry: AuthCacheEntry | undefined,
  t: (key: MessageKey) => string,
): string {
  if (!entry) return t('unknown');
  if (entry.status === 'logged_in') return t('loggedIn');
  if (entry.status === 'logged_out') return t('loggedOut');
  return t('unknown');
}

export function buildMarketCardRow({
  marketplace,
  entry,
  updating,
  locale,
  t,
}: BuildMarketCardRowParams): MarketCardRow {
  const resolved = resolveFilterStatus(entry?.status);
  const statusClass =
    resolved === 'logged_in'
      ? 'ok'
      : resolved === 'logged_out'
        ? 'out'
        : 'unknown';
  const status = statusLabelForEntry(entry, t);
  const lastKnown = entry?.lastKnown === true;
  return {
    statusClass,
    status,
    email: displayMarketEmail(entry),
    checkedLabel: formatCheckedAt(entry?.checkedAt, locale, lastKnown),
    tooltip: `${marketplace.region} · ${status}`,
    updating,
    lastKnown,
    linkStatus: entry?.status,
  };
}
