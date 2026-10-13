import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  authByMarketplaceItem,
  ensureAuthCacheSeeded,
  getAuthCache,
  getSelectedMarketplace,
  setAuthEntry,
  setSelectedMarketplace,
} from './auth-cache';
import type { AuthByMarketplace } from '@/utils/auth/types/auth-types';
import {
  ALL_MARKETPLACES_ID,
  DEFAULT_MARKETPLACE_ID,
  MARKETPLACES,
} from '@/utils/marketplace/marketplaces';
import { AUTH_SESSION_MAX_AGE_MS } from './session-freshness';

describe('auth-cache', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
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

  it('seeds every marketplace as signed out on first run', async () => {
    const cache = await ensureAuthCacheSeeded();
    expect(Object.keys(cache)).toHaveLength(MARKETPLACES.length);
    for (const marketplace of MARKETPLACES) {
      expect(cache[marketplace.id]).toEqual({
        status: 'logged_out',
        checkedAt: 0,
      });
    }
    // Persisted for subsequent reads.
    expect(await getAuthCache()).toEqual(cache);
  });

  it('does not overwrite existing cache when seeding', async () => {
    await setAuthEntry('amazon.com', {
      status: 'logged_in',
      email: 'a@b.com',
      checkedAt: Date.now(),
      source: 'fetch',
    });
    const cache = await ensureAuthCacheSeeded();
    expect(cache['amazon.com']?.email).toBe('a@b.com');
    expect(cache['amazon.de']).toEqual({
      status: 'logged_out',
      checkedAt: 0,
    });
  });

  it('does not replace a fresh definitive entry with unknown; marks lastKnown', async () => {
    const checkedAt = Date.now() - 1_000;
    await setAuthEntry('amazon.com', {
      status: 'logged_in',
      email: 'a@b.com',
      checkedAt,
      source: 'fetch',
    });
    await setAuthEntry('amazon.com', {
      status: 'unknown',
      checkedAt: Date.now(),
      source: 'tab',
    });
    const cache = await getAuthCache();
    expect(cache['amazon.com']?.email).toBe('a@b.com');
    expect(cache['amazon.com']?.status).toBe('logged_in');
    expect(cache['amazon.com']?.checkedAt).toBe(checkedAt);
    expect(cache['amazon.com']?.lastKnown).toBe(true);
  });

  it('replaces a stale definitive entry with unknown after 1h', async () => {
    const staleAt = Date.now() - AUTH_SESSION_MAX_AGE_MS - 1_000;
    await setAuthEntry('amazon.com', {
      status: 'logged_in',
      email: 'a@b.com',
      checkedAt: staleAt,
      source: 'fetch',
    });
    await setAuthEntry('amazon.com', {
      status: 'unknown',
      checkedAt: Date.now(),
      source: 'tab',
    });
    const cache = await getAuthCache();
    expect(cache['amazon.com']?.status).toBe('unknown');
    expect(cache['amazon.com']?.email).toBeUndefined();
    expect(cache['amazon.com']?.lastKnown).toBeUndefined();
  });

  it('expires stale signed-in entries on seed/ensure', async () => {
    const staleAt = Date.now() - AUTH_SESSION_MAX_AGE_MS - 1_000;
    await authByMarketplaceItem.setValue({
      'amazon.com': {
        status: 'logged_in',
        email: 'a@b.com',
        checkedAt: staleAt,
        lastKnown: true,
        source: 'fetch',
      },
    });
    const cache = await ensureAuthCacheSeeded();
    expect(cache['amazon.com']?.status).toBe('unknown');
    expect(cache['amazon.com']?.email).toBeUndefined();
  });

  it('clears lastKnown on a definitive rewrite', async () => {
    const checkedAt = Date.now() - 1_000;
    await setAuthEntry('amazon.com', {
      status: 'logged_in',
      email: 'a@b.com',
      checkedAt,
      source: 'fetch',
    });
    await setAuthEntry('amazon.com', {
      status: 'unknown',
      checkedAt: Date.now(),
      source: 'tab',
    });
    await setAuthEntry('amazon.com', {
      status: 'logged_out',
      checkedAt: Date.now(),
      source: 'fetch',
    });
    const cache = await getAuthCache();
    expect(cache['amazon.com']?.status).toBe('logged_out');
    expect(cache['amazon.com']?.lastKnown).toBeUndefined();
  });

  it('keeps all marketplace entries under concurrent setAuthEntry', async () => {
    let store: AuthByMarketplace = {};
    const delay = () => new Promise<void>((r) => setTimeout(r, 5));

    vi.spyOn(authByMarketplaceItem, 'getValue').mockImplementation(async () => {
      await delay();
      return { ...store };
    });
    vi.spyOn(authByMarketplaceItem, 'setValue').mockImplementation(
      async (next) => {
        await delay();
        store = { ...next };
      },
    );

    const ids = [
      'amazon.com',
      'amazon.de',
      'amazon.fr',
      'amazon.it',
      'amazon.co.uk',
    ] as const;

    await Promise.all(
      ids.map((id, i) =>
        setAuthEntry(id, {
          status: 'logged_in',
          email: `${i}@example.com`,
          checkedAt: i + 1,
          source: 'fetch',
        }),
      ),
    );

    for (const id of ids) {
      expect(store[id], `missing ${id}`).toBeDefined();
    }
  });
});
