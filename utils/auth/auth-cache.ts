import { storage } from 'wxt/utils/storage';
import type { AuthByMarketplace, AuthCacheEntry } from './auth-types';
import {
  ALL_MARKETPLACES_ID,
  DEFAULT_MARKETPLACE_ID,
  isMarketplaceSelection,
  type MarketplaceSelection,
} from '../marketplace/marketplaces';

export const selectedMarketplaceItem = storage.defineItem<MarketplaceSelection>(
  'local:selectedMarketplaceId',
  {
    fallback: DEFAULT_MARKETPLACE_ID,
  },
);

export const localeItem = storage.defineItem<string | null>('local:locale', {
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

export async function setAuthEntry(
  marketplaceId: string,
  entry: AuthCacheEntry,
): Promise<void> {
  const current = await authByMarketplaceItem.getValue();
  await authByMarketplaceItem.setValue({
    ...current,
    [marketplaceId]: entry,
  });
}

export function isAllSelection(
  id: MarketplaceSelection,
): id is typeof ALL_MARKETPLACES_ID {
  return id === ALL_MARKETPLACES_ID;
}
