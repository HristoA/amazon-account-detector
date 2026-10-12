import type { AuthCacheEntry } from '@/utils/auth/auth-types';

/** Email line for a market card; empty when not signed in or email unknown. */
export function displayMarketEmail(entry: AuthCacheEntry | undefined): string {
  if (entry?.status === 'logged_in' && entry.email) {
    return entry.email;
  }
  return '';
}

const STATUS_CHECK_MARK = `<svg class="market-status-mark-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const STATUS_WARN_MARK = `<svg class="market-status-mark-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3.5v6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><circle cx="8" cy="12.25" r="1.15" fill="currentColor"/></svg>`;

const STATUS_OUT_MARK = `<svg class="market-status-mark-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 8h8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`;

/**
 * Corner status mark on the country badge.
 * When `updating`, shows a spinner instead of the ok/out/unknown icon (data stays on the card).
 * When `lastKnown`, signed-in shows an orange warning (not a green check).
 */
export function renderMarketStatusMark(
  statusClass: string,
  updating = false,
  lastKnown = false,
): string {
  if (updating) {
    return `<span class="market-status-mark checking" aria-hidden="true"><span class="market-status-spinner"></span></span>`;
  }
  if (statusClass === 'ok' && lastKnown) {
    return `<span class="market-status-mark last-known" aria-hidden="true">${STATUS_WARN_MARK}</span>`;
  }
  if (statusClass === 'ok') {
    return `<span class="market-status-mark ok" aria-hidden="true">${STATUS_CHECK_MARK}</span>`;
  }
  if (statusClass === 'out') {
    return `<span class="market-status-mark out" aria-hidden="true">${STATUS_OUT_MARK}</span>`;
  }
  if (statusClass === 'unknown') {
    return `<span class="market-status-mark unknown" aria-hidden="true">${STATUS_WARN_MARK}</span>`;
  }
  return '';
}
