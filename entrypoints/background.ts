import {
  getAuthCache,
  getSelectedMarketplace,
  getStoredLocale,
  setAuthEntry,
  setSelectedMarketplace,
  setStoredLocale,
} from '@/utils/auth-cache';
import type { AuthCacheEntry } from '@/utils/auth-types';
import { CheckCoordinator, mapPool } from '@/utils/check-coordinator';
import { detectAuth } from '@/utils/detect-auth';
import { resolveLocale } from '@/utils/locales';
import {
  ALL_MARKETPLACES_ID,
  getMarketplace,
  MARKETPLACES,
  type MarketplaceSelection,
} from '@/utils/marketplaces';
import {
  isExtensionMessage,
  type ExtensionMessage,
  type PopupState,
} from '@/utils/messages';

const ALL_CONCURRENCY = 5;

const coordinator = new CheckCoordinator<AuthCacheEntry>();
let allRefreshInFlight = false;

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isExtensionMessage(message)) {
      return;
    }
    handleMessage(message)
      .then(sendResponse)
      .catch((error: unknown) => {
        console.error('Message handler failed', error);
        sendResponse({ error: String(error) });
      });
    return true;
  });
});

async function handleMessage(
  message: ExtensionMessage,
): Promise<PopupState | { ok: true } | { error: string }> {
  switch (message.type) {
    case 'GET_POPUP_STATE':
      return buildPopupState();
    case 'SET_MARKETPLACE':
      await setSelectedMarketplace(message.marketplaceId);
      return buildPopupState();
    case 'SET_LOCALE':
      await setStoredLocale(message.locale);
      return buildPopupState();
    case 'CHECK_AUTH':
      return runCheck(message.marketplaceId);
    default:
      return buildPopupState();
  }
}

async function runCheck(
  marketplaceId: MarketplaceSelection,
): Promise<PopupState> {
  if (marketplaceId === ALL_MARKETPLACES_ID) {
    await runAllChecks();
    return buildPopupState();
  }

  if (allRefreshInFlight) {
    // Global lock: ignore individual checks while All batch is running.
    return buildPopupState();
  }

  await checkMarketplace(marketplaceId);
  return buildPopupState();
}

async function runAllChecks(): Promise<void> {
  if (allRefreshInFlight) {
    return;
  }
  allRefreshInFlight = true;
  await broadcastState();

  try {
    await mapPool([...MARKETPLACES], ALL_CONCURRENCY, async (marketplace) => {
      await checkMarketplace(marketplace.id);
      await broadcastState();
    });
  } finally {
    allRefreshInFlight = false;
    await broadcastState();
  }
}

async function checkMarketplace(marketplaceId: string): Promise<void> {
  const marketplace = getMarketplace(marketplaceId);
  if (!marketplace) {
    return;
  }

  await coordinator.run(marketplaceId, async ({ isCurrent, setTabId }) => {
    const entry = await detectAuth(marketplace, {
      isCurrent,
      onTabCreated: setTabId,
    });

    if (!isCurrent() || entry.checkedAt === 0) {
      return entry;
    }

    await setAuthEntry(marketplaceId, entry);
    return entry;
  });
}

async function buildPopupState(): Promise<PopupState> {
  const [selectedMarketplaceId, storedLocale, authByMarketplace] =
    await Promise.all([
      getSelectedMarketplace(),
      getStoredLocale(),
      getAuthCache(),
    ]);

  const browserLanguage = browser.i18n?.getUILanguage?.() ?? 'en';
  const locale = resolveLocale(storedLocale, browserLanguage);

  return {
    selectedMarketplaceId,
    locale,
    authByMarketplace,
    inFlightMarketplaceIds: coordinator.inFlightKeys(),
    allRefreshInFlight,
  };
}

async function broadcastState(): Promise<void> {
  const payload = await buildPopupState();
  try {
    await browser.runtime.sendMessage({
      type: 'AUTH_UPDATED',
      payload,
    } satisfies ExtensionMessage);
  } catch {
    // Popup may be closed.
  }
}
