import type { AuthStatus } from '../auth/auth-types';
import { countryCodeToFlag } from './flags';

export const ALL_MARKETPLACES_ID = 'all' as const;

/** Globe for the All-marketplaces option when the OS can render emoji. */
export const ALL_MARKETPLACES_EMOJI = '🌐';

type MarketplaceId = (typeof MARKETPLACES)[number]['id'];

export type MarketplaceSelection = MarketplaceId | typeof ALL_MARKETPLACES_ID;

export interface Marketplace {
  id: string;
  region: string;
  domain: string;
  /** Host suffix after "amazon" (e.g. ".com", ".co.uk"). */
  suffix: string;
  assocHandle: string;
  countryCode: string;
}

export const DEFAULT_MARKETPLACE_ID = 'amazon.com';

/**
 * Retail Amazon storefronts (SP-API + Creators locales; excludes amazon.cn).
 * Ordered ascending by region name.
 * `assocHandle` generally follows Amazon’s “{cc}flex” convention (UK → `gbflex`;
 * Singapore → `spflex`). Re-verify with `pnpm verify:assoc-handles`
 * (curl each sign-in URL; WAF/5xx may yield blocked rows — retry later).
 */
export const MARKETPLACES = [
  {
    id: 'amazon.com.au',
    region: 'Australia',
    domain: 'amazon.com.au',
    suffix: '.com.au',
    assocHandle: 'auflex',
    countryCode: 'AU',
  },
  {
    id: 'amazon.com.be',
    region: 'Belgium',
    domain: 'amazon.com.be',
    suffix: '.com.be',
    assocHandle: 'beflex',
    countryCode: 'BE',
  },
  {
    id: 'amazon.com.br',
    region: 'Brazil',
    domain: 'amazon.com.br',
    suffix: '.com.br',
    assocHandle: 'brflex',
    countryCode: 'BR',
  },
  {
    id: 'amazon.ca',
    region: 'Canada',
    domain: 'amazon.ca',
    suffix: '.ca',
    assocHandle: 'caflex',
    countryCode: 'CA',
  },
  {
    id: 'amazon.eg',
    region: 'Egypt',
    domain: 'amazon.eg',
    suffix: '.eg',
    assocHandle: 'egflex',
    countryCode: 'EG',
  },
  {
    id: 'amazon.fr',
    region: 'France',
    domain: 'amazon.fr',
    suffix: '.fr',
    assocHandle: 'frflex',
    countryCode: 'FR',
  },
  {
    id: 'amazon.de',
    region: 'Germany',
    domain: 'amazon.de',
    suffix: '.de',
    assocHandle: 'deflex',
    countryCode: 'DE',
  },
  {
    id: 'amazon.in',
    region: 'India',
    domain: 'amazon.in',
    suffix: '.in',
    assocHandle: 'inflex',
    countryCode: 'IN',
  },
  {
    id: 'amazon.ie',
    region: 'Ireland',
    domain: 'amazon.ie',
    suffix: '.ie',
    assocHandle: 'ieflex',
    countryCode: 'IE',
  },
  {
    id: 'amazon.it',
    region: 'Italy',
    domain: 'amazon.it',
    suffix: '.it',
    assocHandle: 'itflex',
    countryCode: 'IT',
  },
  {
    id: 'amazon.co.jp',
    region: 'Japan',
    domain: 'amazon.co.jp',
    suffix: '.co.jp',
    assocHandle: 'jpflex',
    countryCode: 'JP',
  },
  {
    id: 'amazon.com.mx',
    region: 'Mexico',
    domain: 'amazon.com.mx',
    suffix: '.com.mx',
    assocHandle: 'mxflex',
    countryCode: 'MX',
  },
  {
    id: 'amazon.nl',
    region: 'Netherlands',
    domain: 'amazon.nl',
    suffix: '.nl',
    assocHandle: 'nlflex',
    countryCode: 'NL',
  },
  {
    id: 'amazon.pl',
    region: 'Poland',
    domain: 'amazon.pl',
    suffix: '.pl',
    assocHandle: 'plflex',
    countryCode: 'PL',
  },
  {
    id: 'amazon.sa',
    region: 'Saudi Arabia',
    domain: 'amazon.sa',
    suffix: '.sa',
    assocHandle: 'saflex',
    countryCode: 'SA',
  },
  {
    id: 'amazon.sg',
    region: 'Singapore',
    domain: 'amazon.sg',
    suffix: '.sg',
    // Amazon’s handle is `spflex` (not `{cc}flex` / `sgflex`).
    assocHandle: 'spflex',
    countryCode: 'SG',
  },
  {
    id: 'amazon.co.za',
    region: 'South Africa',
    domain: 'amazon.co.za',
    suffix: '.co.za',
    assocHandle: 'zaflex',
    countryCode: 'ZA',
  },
  {
    id: 'amazon.es',
    region: 'Spain',
    domain: 'amazon.es',
    suffix: '.es',
    assocHandle: 'esflex',
    countryCode: 'ES',
  },
  {
    id: 'amazon.se',
    region: 'Sweden',
    domain: 'amazon.se',
    suffix: '.se',
    assocHandle: 'seflex',
    countryCode: 'SE',
  },
  {
    id: 'amazon.com.tr',
    region: 'Turkey',
    domain: 'amazon.com.tr',
    suffix: '.com.tr',
    assocHandle: 'trflex',
    countryCode: 'TR',
  },
  {
    id: 'amazon.ae',
    region: 'United Arab Emirates',
    domain: 'amazon.ae',
    suffix: '.ae',
    assocHandle: 'aeflex',
    countryCode: 'AE',
  },
  {
    id: 'amazon.co.uk',
    region: 'United Kingdom',
    domain: 'amazon.co.uk',
    suffix: '.co.uk',
    assocHandle: 'gbflex',
    countryCode: 'GB',
  },
  {
    id: 'amazon.com',
    region: 'United States',
    domain: 'amazon.com',
    suffix: '.com',
    assocHandle: 'usflex',
    countryCode: 'US',
  },
] as const satisfies readonly Marketplace[];

const marketplaceById = new Map<string, Marketplace>(
  MARKETPLACES.map((m) => [m.id, m]),
);

export function getMarketplace(id: string): Marketplace | undefined {
  return marketplaceById.get(id);
}

function isMarketplaceId(id: string): id is MarketplaceId {
  return marketplaceById.has(id);
}

export function isMarketplaceSelection(id: string): id is MarketplaceSelection {
  return id === ALL_MARKETPLACES_ID || isMarketplaceId(id);
}

export function marketplaceFlag(marketplace: Marketplace): string {
  return countryCodeToFlag(marketplace.countryCode);
}

export function marketplaceHostPermissions(): string[] {
  // Include bare and www hosts — Amazon sometimes redirects between them.
  return MARKETPLACES.flatMap((m) => [
    `https://www.${m.domain}/*`,
    `https://${m.domain}/*`,
  ]);
}

/**
 * Account-switcher / sign-in URL used to resolve login state and email.
 * Pattern from docs/REQUIREMENTS.md with marketplace-specific assoc_handle.
 */
export function buildSignInUrl(marketplace: Marketplace): string {
  const suffix = marketplace.suffix;
  const params = new URLSearchParams({
    'openid.pape.max_auth_age': '0',
    'openid.return_to': `https://www.amazon${suffix}/?&ref_=nav_youraccount_switchacct`,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.assoc_handle': marketplace.assocHandle,
    'openid.mode': 'checkid_setup',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    ignoreAuthState: '1',
    _encoding: 'UTF8',
  });
  return `https://www.amazon${suffix}/ap/signin?${params.toString()}`;
}

/** Amazon “Your Account” hub for the marketplace. */
export function buildYourAccountUrl(marketplace: Marketplace): string {
  return `https://www.amazon${marketplace.suffix}/gp/css/homepage.html`;
}

/**
 * Destination when opening a marketplace from results:
 * Your Account if logged in, otherwise the sign-in page.
 */
export function buildMarketplaceActionUrl(
  marketplace: Marketplace,
  status: AuthStatus | undefined,
): string {
  if (status === 'logged_in') {
    return buildYourAccountUrl(marketplace);
  }
  return buildSignInUrl(marketplace);
}
