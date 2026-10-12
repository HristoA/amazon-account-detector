import { afterEach, describe, expect, it } from 'vitest';
import type { MessageKey } from '@/utils/i18n/i18n';
import {
  resetFlagEmojiSupportCacheForTests,
  setFlagEmojiSupportForTests,
} from '@/utils/marketplace/flags';
import { GEO_REGIONS } from '@/utils/marketplace/geo-regions';
import {
  ALL_MARKETPLACES_EMOJI,
  ALL_MARKETPLACES_ID,
  MARKETPLACES,
} from '@/utils/marketplace/marketplaces';
import { renderMarketplaceSelectOptionsHtml } from './marketplace-select-options.ts';

afterEach(() => {
  resetFlagEmojiSupportCacheForTests();
});

const labels: Partial<Record<MessageKey, string>> = {
  allMarketplaces: 'All',
  geoAmericas: 'Americas',
  geoEurope: 'Europe',
  geoMiddleEast: 'Middle East',
  geoAfrica: 'Africa',
  geoIndia: 'India',
  geoAsiaPacific: 'Asia-Pacific',
};

function translate(key: MessageKey): string {
  return labels[key] ?? key;
}

describe('renderMarketplaceSelectOptionsHtml', () => {
  it('puts All first, then non-selectable geo optgroups with every marketplace', () => {
    const html = renderMarketplaceSelectOptionsHtml({
      t: translate,
      uiRtl: false,
    });

    expect(html.startsWith(`<option value="${ALL_MARKETPLACES_ID}">`)).toBe(
      true,
    );
    expect(html).toContain('All</option>');

    for (const region of GEO_REGIONS) {
      expect(html).toContain(`<optgroup label="${labels[region.labelKey]}">`);
    }

    const optionValues = [...html.matchAll(/<option value="([^"]+)">/g)].map(
      (m) => m[1]!,
    );
    expect(optionValues[0]).toBe(ALL_MARKETPLACES_ID);
    expect(optionValues.slice(1)).toEqual(
      GEO_REGIONS.flatMap((region) =>
        region.countryCodes.map(
          (cc) => MARKETPLACES.find((m) => m.countryCode === cc)!.id,
        ),
      ),
    );
    expect(optionValues).toHaveLength(1 + MARKETPLACES.length);

    // Group labels are not selectable options.
    expect(html).not.toMatch(/<option value="americas"/);
    expect(html).not.toMatch(/<option[^>]*>Americas<\/option>/);
  });

  it('keeps marketplace option labels as flag + region (domain) when flags work', () => {
    setFlagEmojiSupportForTests(true);
    const html = renderMarketplaceSelectOptionsHtml({
      t: translate,
      uiRtl: false,
    });
    expect(html).toContain(
      `<option value="${ALL_MARKETPLACES_ID}">${ALL_MARKETPLACES_EMOJI} All</option>`,
    );
    expect(html).toContain(
      '<option value="amazon.com">🇺🇸 United States (amazon.com)</option>',
    );
  });

  it('omits flag emoji in option labels when the OS cannot render them', () => {
    setFlagEmojiSupportForTests(false);
    const html = renderMarketplaceSelectOptionsHtml({
      t: translate,
      uiRtl: false,
    });
    expect(html).toContain(
      '<option value="amazon.com">United States (amazon.com)</option>',
    );
    expect(html).toContain(
      `<option value="${ALL_MARKETPLACES_ID}">All</option>`,
    );
    expect(html).not.toContain('🇺🇸');
    expect(html).not.toContain(ALL_MARKETPLACES_EMOJI);
  });
});
