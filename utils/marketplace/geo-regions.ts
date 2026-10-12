import { countryCodeToFlag, supportsFlagEmoji } from './flags';
import type { Marketplace } from './marketplaces';

export type GeoRegionId =
  'americas' | 'europe' | 'middle_east' | 'africa' | 'asia_pacific';

export interface GeoRegionDefinition {
  id: GeoRegionId;
  /** i18n message key for the section heading. */
  labelKey:
    | 'geoAmericas'
    | 'geoEurope'
    | 'geoMiddleEast'
    | 'geoAfrica'
    | 'geoAsiaPacific';
  countryCodes: readonly string[];
}

/** Geographic buckets for the All-marketplaces list (screenshot section headers). */
export const GEO_REGIONS: readonly GeoRegionDefinition[] = [
  {
    id: 'americas',
    labelKey: 'geoAmericas',
    countryCodes: ['US', 'CA', 'MX', 'BR'],
  },
  {
    id: 'europe',
    labelKey: 'geoEurope',
    countryCodes: ['IE', 'ES', 'GB', 'FR', 'BE', 'NL', 'DE', 'IT', 'SE', 'PL'],
  },
  {
    id: 'middle_east',
    labelKey: 'geoMiddleEast',
    countryCodes: ['EG', 'TR', 'SA', 'AE'],
  },
  {
    id: 'africa',
    labelKey: 'geoAfrica',
    countryCodes: ['ZA'],
  },
  {
    id: 'asia_pacific',
    labelKey: 'geoAsiaPacific',
    countryCodes: ['SG', 'AU', 'JP', 'IN'],
  },
] as const;

const regionByCountryCode = new Map<string, GeoRegionId>();
for (const region of GEO_REGIONS) {
  for (const code of region.countryCodes) {
    regionByCountryCode.set(code, region.id);
  }
}

export function marketplaceGeoRegionId(
  countryCode: string,
): GeoRegionId | undefined {
  return regionByCountryCode.get(countryCode);
}

export function geoRegionForMarketplace(
  marketplace: Marketplace,
): GeoRegionId | undefined {
  return marketplaceGeoRegionId(marketplace.countryCode);
}

export interface GeoRegionGroup {
  id: GeoRegionId;
  labelKey: GeoRegionDefinition['labelKey'];
  marketplaces: Marketplace[];
}

/** Group marketplaces into geographic sections; preserve GEO_REGIONS order. */
export function groupMarketplacesByGeoRegion(
  marketplaces: readonly Marketplace[],
): GeoRegionGroup[] {
  const buckets = new Map<GeoRegionId, Marketplace[]>();
  for (const region of GEO_REGIONS) {
    buckets.set(region.id, []);
  }

  for (const marketplace of marketplaces) {
    const regionId = geoRegionForMarketplace(marketplace);
    if (!regionId) continue;
    buckets.get(regionId)!.push(marketplace);
  }

  for (const region of GEO_REGIONS) {
    const list = buckets.get(region.id)!;
    const order = new Map(region.countryCodes.map((cc, i) => [cc, i]));
    list.sort(
      (a, b) =>
        (order.get(a.countryCode) ?? 99) - (order.get(b.countryCode) ?? 99),
    );
  }

  return GEO_REGIONS.map((region) => ({
    id: region.id,
    labelKey: region.labelKey,
    marketplaces: buckets.get(region.id)!,
  })).filter((group) => group.marketplaces.length > 0);
}

/** Letter badge text: UK for GB, otherwise the ISO country code. */
export function displayCountryCode(countryCode: string): string {
  return countryCode === 'GB' ? 'UK' : countryCode;
}

/**
 * Marketplace row badge: flag emoji when the OS can render it, else letter code.
 */
export function displayCountryBadge(countryCode: string): string {
  if (supportsFlagEmoji()) {
    const flag = countryCodeToFlag(countryCode);
    if (flag) return flag;
  }
  return displayCountryCode(countryCode);
}

/** Whether {@link displayCountryBadge} will render a flag for this code. */
export function countryBadgeShowsFlag(countryCode: string): boolean {
  return supportsFlagEmoji() && Boolean(countryCodeToFlag(countryCode));
}
