import { describe, expect, it, vi } from 'vitest';
import {
  clearOptimisticCheckFlags,
  resolveCheckResponse,
} from './resolve-check-response';

const baseState = {
  selectedMarketplaceId: 'amazon.com' as const,
  locale: 'en',
  authByMarketplace: {
    'amazon.com': { status: 'logged_out' as const, checkedAt: 1 },
  },
  inFlightMarketplaceIds: ['amazon.com'],
  allRefreshInFlight: false,
};

describe('clearOptimisticCheckFlags', () => {
  it('removes a single marketplace from in-flight ids', () => {
    expect(clearOptimisticCheckFlags(baseState, 'amazon.com')).toEqual({
      ...baseState,
      inFlightMarketplaceIds: [],
    });
  });

  it('clears the All-refresh lock', () => {
    const allState = {
      ...baseState,
      selectedMarketplaceId: 'all' as const,
      allRefreshInFlight: true,
      inFlightMarketplaceIds: [],
    };
    expect(clearOptimisticCheckFlags(allState, 'all')).toEqual({
      ...allState,
      allRefreshInFlight: false,
    });
  });
});

describe('resolveCheckResponse', () => {
  it('returns the CHECK_AUTH payload on success', async () => {
    const next = { ...baseState, inFlightMarketplaceIds: [] };
    await expect(
      resolveCheckResponse({
        marketplaceId: 'amazon.com',
        optimisticState: baseState,
        checkAuth: async () => next,
        getPopupState: async () => {
          throw new Error('unused');
        },
      }),
    ).resolves.toEqual(next);
  });

  it('resyncs from GET_POPUP_STATE when CHECK_AUTH fails', async () => {
    const synced = { ...baseState, inFlightMarketplaceIds: [] };
    const getPopupState = vi.fn(async () => synced);

    await expect(
      resolveCheckResponse({
        marketplaceId: 'amazon.com',
        optimisticState: baseState,
        checkAuth: async () => {
          throw new Error('All refresh in progress');
        },
        getPopupState,
      }),
    ).resolves.toEqual(synced);
    expect(getPopupState).toHaveBeenCalledOnce();
  });

  it('clears optimistic flags when resync also fails', async () => {
    await expect(
      resolveCheckResponse({
        marketplaceId: 'amazon.com',
        optimisticState: baseState,
        checkAuth: async () => {
          throw new Error('check failed');
        },
        getPopupState: async () => {
          throw new Error('resync failed');
        },
      }),
    ).resolves.toEqual({
      ...baseState,
      inFlightMarketplaceIds: [],
    });
  });
});
