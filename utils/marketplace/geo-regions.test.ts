import { afterEach, describe, expect, it } from 'vitest';
import {
  resetFlagEmojiSupportCacheForTests,
  setFlagEmojiSupportForTests,
} from './flags';
import { getMarketplace, MARKETPLACES } from './marketplaces';
import {
  countryBadgeShowsFlag,
  displayCountryBadge,
  displayCountryCode,
  GEO_REGIONS,
  geoRegionForMarketplace,
  groupMarketplacesByGeoRegion,
  marketplaceGeoRegionId,
} from './geo-regions.ts';

describe('marketplaceGeoRegionId', () => {
  it('maps country codes into geographic buckets', () => {
    expect(marketplaceGeoRegionId('US')).toBe('americas');
    expect(marketplaceGeoRegionId('GB')).toBe('europe');
    expect(marketplaceGeoRegionId('AE')).toBe('middle_east');
    expect(marketplaceGeoRegionId('JP')).toBe('asia_pacific');
    expect(marketplaceGeoRegionId('ZA')).toBe('africa');
  });
});

describe('groupMarketplacesByGeoRegion', () => {
  it('covers every marketplace exactly once in region order', () => {
    const groups = groupMarketplacesByGeoRegion(MARKETPLACES);
    expect(groups.map((g) => g.id)).toEqual(GEO_REGIONS.map((r) => r.id));
    expect(groups.flatMap((g) => g.marketplaces)).toHaveLength(
      MARKETPLACES.length,
    );
    expect(
      new Set(groups.flatMap((g) => g.marketplaces.map((m) => m.id))).size,
    ).toBe(MARKETPLACES.length);
  });

  it('puts Americas first with the four American storefronts', () => {
    const americas = groupMarketplacesByGeoRegion(MARKETPLACES)[0]!;
    expect(americas.id).toBe('americas');
    expect(americas.marketplaces.map((m) => m.countryCode)).toEqual([
      'US',
      'CA',
      'MX',
      'BR',
    ]);
  });

  it('resolves known marketplaces via geoRegionForMarketplace', () => {
    expect(geoRegionForMarketplace(getMarketplace('amazon.com')!)).toBe(
      'americas',
    );
    expect(geoRegionForMarketplace(getMarketplace('amazon.co.uk')!)).toBe(
      'europe',
    );
  });
});

describe('displayCountryCode', () => {
  it('shows UK for Great Britain', () => {
    expect(displayCountryCode('GB')).toBe('UK');
    expect(displayCountryCode('US')).toBe('US');
  });
});

describe('displayCountryBadge', () => {
  afterEach(() => {
    resetFlagEmojiSupportCacheForTests();
  });

  it('shows flag emoji when the OS supports it', () => {
    setFlagEmojiSupportForTests(true);
    expect(displayCountryBadge('US')).toBe('🇺🇸');
    expect(displayCountryBadge('GB')).toBe('🇬🇧');
    expect(countryBadgeShowsFlag('US')).toBe(true);
  });

  it('falls back to letter codes when flags are unsupported', () => {
    setFlagEmojiSupportForTests(false);
    expect(displayCountryBadge('US')).toBe('US');
    expect(displayCountryBadge('GB')).toBe('UK');
    expect(countryBadgeShowsFlag('US')).toBe(false);
  });
});
