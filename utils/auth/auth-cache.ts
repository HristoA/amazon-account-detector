import { storage } from 'wxt/utils/storage';
import type { AuthByMarketplace, AuthCacheEntry } from './auth-types';
import { seedMissingAuthEntries } from './seed-auth-cache';
import { expireStaleAuthEntries } from './session-freshness';
import {
  isUnknownSkipOfDefinitive,
  shouldWriteAuthEntry,
} from './should-write-auth-entry';
import {
  DEFAULT_MARKETPLACE_ID,
  isMarketplaceSelection,
  MARKETPLACES,
  type MarketplaceSelection,
} from '../marketplace/marketplaces';

const selectedMarketplaceItem = storage.defineItem<MarketplaceSelection>(
  'local:selectedMarketplaceId',
  {
    fallback: DEFAULT_MARKETPLACE_ID,
  },
);

const localeItem = storage.defineItem<string | null>('local:locale', {
  fallback: null,
});

export const authByMarketplaceItem = storage.defineItem<AuthByMarketplace>(
  'local:authByMarketplace',
  {
    fallback: {},
  },
);

export async function getSelectedMarketplace(): Promise<MarketplaceSelection> {
  const value = await selectedMarketplaceItem.getValue();
  if (value && isMarketplaceSelection(value)) {
    return value;
  }
  return DEFAULT_MARKETPLACE_ID;
}

export async function setSelectedMarketplace(
  id: MarketplaceSelection,
): Promise<void> {
  await selectedMarketplaceItem.setValue(id);
}

export async function getStoredLocale(): Promise<string | null> {
  return localeItem.getValue();
}

export async function setStoredLocale(locale: string): Promise<void> {
  await localeItem.setValue(locale);
}

export async function getAuthCache(): Promise<AuthByMarketplace> {
  return authByMarketplaceItem.getValue();
}

/** Serialize RMW updates so parallel Refresh-all writes cannot drop siblings. */
let authWriteChain: Promise<void> = Promise.resolve();

/**
 * Persist signed-out seeds (checkedAt 0) for any marketplace missing from the
 * cache (first run / newly added storefronts).
 */
export async function ensureAuthCacheSeeded(): Promise<AuthByMarketplace> {
  const run = authWriteChain.then(async () => {
    const current = await authByMarketplaceItem.getValue();
    const marketplaceIds = MARKETPLACES.map((m) => m.id);
    const { cache: seeded, didSeed } = seedMissingAuthEntries(
      current,
      marketplaceIds,
    );
    const { cache, didExpire } = expireStaleAuthEntries(seeded);
    if (didSeed || didExpire) {
      await authByMarketplaceItem.setValue(cache);
    }
    return cache;
  });
  // Keep the chain alive after failures so later writes still serialize.
  authWriteChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function setAuthEntry(
  marketplaceId: string,
  entry: AuthCacheEntry,
): Promise<void> {
  const run = authWriteChain.then(async () => {
    const now = Date.now();
    const current = await authByMarketplaceItem.getValue();
    const previous = current[marketplaceId];
    if (isUnknownSkipOfDefinitive(previous, entry, now)) {
      // Still within 1h of last verify — keep status/email; flag last-known.
      await authByMarketplaceItem.setValue({
        ...current,
        [marketplaceId]: { ...previous!, lastKnown: true },
      });
      return;
    }
    if (!shouldWriteAuthEntry(previous, entry, now)) {
      return;
    }
    // Definitive write (or unknown after session expiry / no prior) clears lastKnown.
    const written: AuthCacheEntry = { ...entry };
    delete written.lastKnown;
    await authByMarketplaceItem.setValue({
      ...current,
      [marketplaceId]: written,
    });
  });
  // Keep the chain alive after failures so later writes still serialize.
  authWriteChain = run.catch(() => {});
  await run;
}
