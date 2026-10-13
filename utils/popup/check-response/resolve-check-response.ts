import { ALL_MARKETPLACES_ID } from '@/utils/marketplace/marketplaces';
import type { MarketplaceSelection } from '@/utils/marketplace/marketplaces';
import type { PopupState } from '@/utils/messaging/messages';

/** Drop optimistic in-flight flags when SW resync is unavailable. */
export function clearOptimisticCheckFlags(
  state: PopupState,
  marketplaceId: MarketplaceSelection,
): PopupState {
  if (marketplaceId === ALL_MARKETPLACES_ID) {
    return { ...state, allRefreshInFlight: false };
  }
  return {
    ...state,
    inFlightMarketplaceIds: state.inFlightMarketplaceIds.filter(
      (id) => id !== marketplaceId,
    ),
  };
}

/**
 * Apply CHECK_AUTH result, or recover UI state if the message fails.
 * Prefer GET_POPUP_STATE; fall back to clearing optimistic flags locally.
 */
export async function resolveCheckResponse(options: {
  marketplaceId: MarketplaceSelection;
  optimisticState: PopupState;
  checkAuth: () => Promise<PopupState>;
  getPopupState: () => Promise<PopupState>;
}): Promise<PopupState> {
  try {
    return await options.checkAuth();
  } catch {
    try {
      return await options.getPopupState();
    } catch {
      return clearOptimisticCheckFlags(
        options.optimisticState,
        options.marketplaceId,
      );
    }
  }
}
