import type { MessageKey } from '@/utils/i18n/i18n';
import { formatFlagLabel } from '@/utils/marketplace/flags';
import { groupMarketplacesByGeoRegion } from '@/utils/marketplace/geo-regions';
import {
  ALL_MARKETPLACES_EMOJI,
  ALL_MARKETPLACES_ID,
  MARKETPLACES,
  marketplaceFlag,
} from '@/utils/marketplace/marketplaces';
import { escapeAttr } from '@/utils/popup/escape-attr';

export interface MarketplaceSelectOptionsParams {
  t: (key: MessageKey) => string;
  uiRtl: boolean;
}

/**
 * Inner HTML for the marketplace `<select>`:
 * standalone All option, then non-selectable geo `<optgroup>`s.
 */
export function renderMarketplaceSelectOptionsHtml({
  t,
  uiRtl,
}: MarketplaceSelectOptionsParams): string {
  const allOption = `<option value="${ALL_MARKETPLACES_ID}">${formatFlagLabel(ALL_MARKETPLACES_EMOJI, t('allMarketplaces'), uiRtl)}</option>`;

  const groups = groupMarketplacesByGeoRegion(MARKETPLACES).map((group) => {
    const options = group.marketplaces
      .map(
        (m) =>
          `<option value="${m.id}">${formatFlagLabel(marketplaceFlag(m), `${m.region} (${m.domain})`, uiRtl)}</option>`,
      )
      .join('');
    return `<optgroup label="${escapeAttr(t(group.labelKey))}">${options}</optgroup>`;
  });

  return [allOption, ...groups].join('');
}
