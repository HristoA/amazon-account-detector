import { describe, expect, it } from 'vitest';
import {
  isExtensionMessage,
  isPopupState,
  parsePopupMessageResponse,
} from './messages';

const validPopupState = {
  selectedMarketplaceId: 'amazon.com',
  locale: 'en',
  authByMarketplace: {
    'amazon.com': { status: 'logged_out', checkedAt: 1 },
  },
  inFlightMarketplaceIds: ['amazon.com'],
  allRefreshInFlight: false,
};

describe('isExtensionMessage', () => {
  it('accepts GET_POPUP_STATE', () => {
    expect(isExtensionMessage({ type: 'GET_POPUP_STATE' })).toBe(true);
  });

  it('requires a valid marketplace selection for SET_MARKETPLACE / CHECK_AUTH', () => {
    expect(
      isExtensionMessage({
        type: 'SET_MARKETPLACE',
        marketplaceId: 'amazon.de',
      }),
    ).toBe(true);
    expect(
      isExtensionMessage({
        type: 'CHECK_AUTH',
        marketplaceId: 'all',
      }),
    ).toBe(true);
    expect(
      isExtensionMessage({
        type: 'CHECK_AUTH',
        marketplaceId: 'amazon.cn',
      }),
    ).toBe(false);
    expect(isExtensionMessage({ type: 'CHECK_AUTH' })).toBe(false);
  });

  it('requires a supported locale for SET_LOCALE', () => {
    expect(isExtensionMessage({ type: 'SET_LOCALE', locale: 'ar' })).toBe(true);
    expect(isExtensionMessage({ type: 'SET_LOCALE', locale: 'xx' })).toBe(
      false,
    );
  });

  it('requires a valid PopupState payload for AUTH_UPDATED', () => {
    expect(
      isExtensionMessage({ type: 'AUTH_UPDATED', payload: validPopupState }),
    ).toBe(true);
    expect(
      isExtensionMessage({
        type: 'AUTH_UPDATED',
        payload: { ...validPopupState, allRefreshInFlight: 'yes' },
      }),
    ).toBe(false);
  });
});

describe('isPopupState', () => {
  it('rejects malformed auth entries', () => {
    expect(isPopupState(validPopupState)).toBe(true);
    expect(
      isPopupState({
        ...validPopupState,
        authByMarketplace: {
          'amazon.com': { status: 'logged_in' },
        },
      }),
    ).toBe(false);
  });
});

describe('parsePopupMessageResponse', () => {
  it('returns a valid PopupState', () => {
    expect(parsePopupMessageResponse(validPopupState)).toEqual(validPopupState);
  });

  it('throws the service-worker error string', () => {
    expect(() =>
      parsePopupMessageResponse({ error: 'All refresh in progress' }),
    ).toThrow('All refresh in progress');
  });

  it('rejects malformed or missing responses', () => {
    expect(() => parsePopupMessageResponse(undefined)).toThrow(
      'Invalid popup state response',
    );
    expect(() =>
      parsePopupMessageResponse({
        ...validPopupState,
        allRefreshInFlight: 'yes',
      }),
    ).toThrow('Invalid popup state response');
  });
});
