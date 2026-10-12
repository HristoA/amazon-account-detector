import type { AuthByMarketplace } from '../auth/auth-types';
import type { MarketplaceSelection } from '../marketplace/marketplaces';

export type ExtensionMessage =
  | { type: 'GET_POPUP_STATE' }
  | { type: 'SET_MARKETPLACE'; marketplaceId: MarketplaceSelection }
  | { type: 'SET_LOCALE'; locale: string }
  | { type: 'CHECK_AUTH'; marketplaceId: MarketplaceSelection }
  | { type: 'AUTH_UPDATED'; payload: PopupState }
  | { type: 'CHECK_STATUS'; payload: PopupState };

export interface PopupState {
  selectedMarketplaceId: MarketplaceSelection;
  locale: string;
  authByMarketplace: AuthByMarketplace;
  inFlightMarketplaceIds: string[];
  allRefreshInFlight: boolean;
}

export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  if (!value || typeof value !== 'object' || !('type' in value)) {
    return false;
  }
  const type = (value as { type: string }).type;
  return (
    type === 'GET_POPUP_STATE' ||
    type === 'SET_MARKETPLACE' ||
    type === 'SET_LOCALE' ||
    type === 'CHECK_AUTH' ||
    type === 'AUTH_UPDATED' ||
    type === 'CHECK_STATUS'
  );
}
