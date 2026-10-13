import {
  countryBadgeShowsFlag,
  displayCountryBadge,
} from '@/utils/marketplace/geo-regions';
import {
  buildMarketplaceActionUrl,
  type Marketplace,
} from '@/utils/marketplace/marketplaces';
import { escapeAttr, escapeHtml } from '@/utils/popup/escape/dom-escape';
import {
  matchesStatusFilter,
  type StatusFilter,
} from '@/utils/popup/status-filter/status-filter';
import { renderMarketStatusMark } from './market-card-display';
import type { MarketCardRow } from './market-card-row';

const MARKET_OPEN_ICON = `<svg class="market-open-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 11.5 11.5 4.5"/><path d="M6.5 4.5h5v5"/></svg>`;

export interface RenderMarketCardParams {
  marketplace: Marketplace;
  row: MarketCardRow;
  forAllList: boolean;
  statusFilter: StatusFilter;
  checkingLabel: string;
}

export function renderMarketCardHtml({
  marketplace,
  row,
  forAllList,
  statusFilter,
  checkingLabel,
}: RenderMarketCardParams): string {
  const hidden =
    forAllList && !matchesStatusFilter(statusFilter, row.linkStatus)
      ? ' hidden'
      : '';
  const dataAttr = forAllList ? ` data-marketplace-id="${marketplace.id}"` : '';
  const href = buildMarketplaceActionUrl(marketplace, row.linkStatus);
  const emailHtml = row.email
    ? `<div class="market-email">${escapeHtml(row.email)}</div>`
    : '';
  const ariaLabel = `${marketplace.domain}, ${row.status}${
    row.email ? `, ${row.email}` : ''
  }${row.updating ? `, ${checkingLabel}` : ''}`;

  return `
    <a
      class="market-card ${row.statusClass}"
      href="${escapeAttr(href)}"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="${escapeAttr(ariaLabel)}"
      title="${escapeAttr(row.tooltip)}"
      ${dataAttr}${hidden}
    >
      <div class="market-code-wrap" aria-hidden="true">
        <div class="market-code${
          countryBadgeShowsFlag(marketplace.countryCode)
            ? ' market-code--flag'
            : ''
        }">${displayCountryBadge(marketplace.countryCode)}</div>
        ${renderMarketStatusMark(row.statusClass, row.updating, row.lastKnown)}
      </div>
      <div class="market-card-body">
        <div class="market-domain-row">
          <div class="market-domain">${escapeHtml(marketplace.domain)}</div>
          ${MARKET_OPEN_ICON}
        </div>
        ${emailHtml}
      </div>
      <div class="market-checked">${escapeHtml(row.checkedLabel)}</div>
    </a>
  `;
}
