import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  getAuthCache,
  getSelectedMarketplace,
  setAuthEntry,
  setSelectedMarketplace,
} from './auth-cache';
import { ALL_MARKETPLACES_ID, DEFAULT_MARKETPLACE_ID } from './marketplaces';

describe('auth-cache', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('defaults selected marketplace to amazon.com', async () => {
    expect(await getSelectedMarketplace()).toBe(DEFAULT_MARKETPLACE_ID);
  });

  it('persists selected marketplace including All', async () => {
    await setSelectedMarketplace(ALL_MARKETPLACES_ID);
    expect(await getSelectedMarketplace()).toBe(ALL_MARKETPLACES_ID);
  });

  it('stores auth entries per marketplace', async () => {
    await setAuthEntry('amazon.com', {
      status: 'logged_in',
      email: 'a@b.com',
      checkedAt: 123,
      source: 'fetch',
    });
    const cache = await getAuthCache();
    expect(cache['amazon.com']?.email).toBe('a@b.com');
  });
});
