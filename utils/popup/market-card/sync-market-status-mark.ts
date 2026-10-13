import {
  marketStatusMarkClass,
  renderMarketStatusMark,
} from './market-card-display';

/** Minimal host for the country-code wrap that holds the status mark. */
export type MarketStatusMarkHost = {
  querySelector(selectors: string): {
    classList: { contains(token: string): boolean };
    remove(): void;
  } | null;
  insertAdjacentHTML(position: InsertPosition, html: string): void;
};

/**
 * Keep the card status spinner mounted while a check is in flight.
 * Remounting the mark restarts CSS animation — noticeable when AUTH_UPDATED
 * arrives after each marketplace during Refresh all.
 */
export function syncMarketStatusMark(
  codeWrap: MarketStatusMarkHost,
  statusClass: string,
  updating: boolean,
  lastKnown: boolean,
): void {
  const existing = codeWrap.querySelector('.market-status-mark');
  const desired = marketStatusMarkClass(statusClass, updating, lastKnown);

  if (desired && existing?.classList.contains(desired)) {
    return;
  }

  existing?.remove();
  const markHtml = renderMarketStatusMark(statusClass, updating, lastKnown);
  if (markHtml) {
    codeWrap.insertAdjacentHTML('beforeend', markHtml);
  }
}
