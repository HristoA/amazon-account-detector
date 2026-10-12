import type { AuthByMarketplace, AuthCacheEntry } from '../auth/auth-types';
import { isSupportedLocale } from '../i18n/locales';
import {
  isMarketplaceSelection,
  type MarketplaceSelection,
} from '../marketplace/marketplaces';

export type ExtensionMessage =
  | { type: 'GET_POPUP_STATE' }
  | { type: 'SET_MARKETPLACE'; marketplaceId: MarketplaceSelection }
  | { type: 'SET_LOCALE'; locale: string }
  | { type: 'CHECK_AUTH'; marketplaceId: MarketplaceSelection }
  | { type: 'AUTH_UPDATED'; payload: PopupState };

export interface PopupState {
  selectedMarketplaceId: MarketplaceSelection;
  locale: string;
  authByMarketplace: AuthByMarketplace;
  inFlightMarketplaceIds: string[];
  allRefreshInFlight: boolean;
}

const AUTH_STATUSES = new Set(['logged_in', 'logged_out', 'unknown']);

function isAuthCacheEntry(value: unknown): value is AuthCacheEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const entry = value as Record<string, unknown>;
  if (
    typeof entry.status !== 'string' ||
    !AUTH_STATUSES.has(entry.status) ||
    typeof entry.checkedAt !== 'number'
  ) {
    return false;
  }
  if (entry.email != null && typeof entry.email !== 'string') {
    return false;
  }
  if (
    entry.source != null &&
    entry.source !== 'fetch' &&
    entry.source !== 'tab'
  ) {
    return false;
  }
  if (entry.lastKnown != null && typeof entry.lastKnown !== 'boolean') {
    return false;
  }
  return true;
}

function isAuthByMarketplace(value: unknown): value is AuthByMarketplace {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every(isAuthCacheEntry);
}

export function isPopupState(value: unknown): value is PopupState {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const state = value as Record<string, unknown>;
  return (
    typeof state.selectedMarketplaceId === 'string' &&
    isMarketplaceSelection(state.selectedMarketplaceId) &&
    typeof state.locale === 'string' &&
    isAuthByMarketplace(state.authByMarketplace) &&
    Array.isArray(state.inFlightMarketplaceIds) &&
    state.inFlightMarketplaceIds.every((id) => typeof id === 'string') &&
    typeof state.allRefreshInFlight === 'boolean'
  );
}

/**
 * Validate a runtime.sendMessage response used by the popup.
 * Accepts `{ error: string }` failures; otherwise requires a full PopupState.
 */
export function parsePopupMessageResponse(response: unknown): PopupState {
  if (response && typeof response === 'object' && 'error' in response) {
    const error = (response as { error: unknown }).error;
    throw new Error(typeof error === 'string' ? error : 'Unknown error');
  }
  if (!isPopupState(response)) {
    throw new Error('Invalid popup state response');
  }
  return response;
}

export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  if (!value || typeof value !== 'object' || !('type' in value)) {
    return false;
  }
  const message = value as Record<string, unknown>;
  switch (message.type) {
    case 'GET_POPUP_STATE':
      return true;
    case 'SET_MARKETPLACE':
    case 'CHECK_AUTH':
      return (
        typeof message.marketplaceId === 'string' &&
        isMarketplaceSelection(message.marketplaceId)
      );
    case 'SET_LOCALE':
      return (
        typeof message.locale === 'string' && isSupportedLocale(message.locale)
      );
    case 'AUTH_UPDATED':
      return isPopupState(message.payload);
    default:
      return false;
  }
}
