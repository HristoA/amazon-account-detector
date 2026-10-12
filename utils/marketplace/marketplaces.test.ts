import { describe, expect, it } from 'vitest';
import {
  ALL_MARKETPLACES_ID,
  buildMarketplaceActionUrl,
  buildSignInUrl,
  buildYourAccountUrl,
  getMarketplace,
  isMarketplaceSelection,
  MARKETPLACES,
  marketplaceFlag,
  marketplaceHostPermissions,
} from './marketplaces';

describe('marketplaces', () => {
  it('includes all required retail storefronts', () => {
    expect(MARKETPLACES.length).toBe(23);
    expect(getMarketplace('amazon.com')).toBeDefined();
    expect(getMarketplace('amazon.co.uk')).toBeDefined();
    expect(getMarketplace('amazon.co.jp')).toBeDefined();
  });

  it('keeps marketplaces ordered ascending by region name', () => {
    const regions = MARKETPLACES.map((m) => m.region);
    expect(regions).toEqual([...regions].sort((a, b) => a.localeCompare(b)));
  });

  it('builds sign-in URL with suffix and assoc_handle', () => {
    const uk = getMarketplace('amazon.co.uk')!;
    const url = buildSignInUrl(uk);
    expect(url.startsWith('https://www.amazon.co.uk/ap/signin?')).toBe(true);
    expect(url).toContain('openid.assoc_handle=gbflex');
    expect(url).toContain('openid.pape.max_auth_age=0');
    expect(url).toContain('ignoreAuthState=1');
    expect(url).toContain(
      encodeURIComponent(
        'https://www.amazon.co.uk/?&ref_=nav_youraccount_switchacct',
      ),
    );
  });

  it('uses usflex for amazon.com', () => {
    const us = getMarketplace('amazon.com')!;
    expect(buildSignInUrl(us)).toContain('openid.assoc_handle=usflex');
  });

  it('exposes host permissions for every marketplace', () => {
    const perms = marketplaceHostPermissions();
    expect(perms).toContain('https://www.amazon.com/*');
    expect(perms).toContain('https://www.amazon.com.be/*');
    expect(perms).toHaveLength(MARKETPLACES.length);
  });

  it('maps country codes to flag emoji', () => {
    const us = getMarketplace('amazon.com')!;
    expect(marketplaceFlag(us)).toBe('🇺🇸');
  });

  it('recognizes all selection including All', () => {
    expect(isMarketplaceSelection(ALL_MARKETPLACES_ID)).toBe(true);
    expect(isMarketplaceSelection('amazon.de')).toBe(true);
    expect(isMarketplaceSelection('amazon.cn')).toBe(false);
  });

  it('builds Your Account URL for the marketplace host', () => {
    const de = getMarketplace('amazon.de')!;
    expect(buildYourAccountUrl(de)).toBe(
      'https://www.amazon.de/gp/css/homepage.html',
    );
  });

  it('opens Your Account when logged in and sign-in otherwise', () => {
    const us = getMarketplace('amazon.com')!;
    expect(buildMarketplaceActionUrl(us, 'logged_in')).toBe(
      buildYourAccountUrl(us),
    );
    expect(buildMarketplaceActionUrl(us, 'logged_out')).toBe(
      buildSignInUrl(us),
    );
    expect(buildMarketplaceActionUrl(us, 'unknown')).toBe(buildSignInUrl(us));
    expect(buildMarketplaceActionUrl(us, undefined)).toBe(buildSignInUrl(us));
  });
});
