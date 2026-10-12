import { AllRefreshBatch } from '@/utils/auth/all-refresh';
import {
  ensureAuthCacheSeeded,
  getSelectedMarketplace,
  getStoredLocale,
  setAuthEntry,
  setSelectedMarketplace,
  setStoredLocale,
} from '@/utils/auth/auth-cache';
import type { AuthCacheEntry } from '@/utils/auth/auth-types';
import {
  CheckCoordinator,
  mapPoolBestEffort,
} from '@/utils/auth/check-coordinator';
import { detectAuth } from '@/utils/auth/detect-auth';
import { closeTrackedFallbackTabs } from '@/utils/auth/fallback-tabs';
import { resolveLocale } from '@/utils/i18n/locales';
import {
  ALL_MARKETPLACES_ID,
  getMarketplace,
  MARKETPLACES,
  type MarketplaceSelection,
} from '@/utils/marketplace/marketplaces';
import {
  isExtensionMessage,
  type ExtensionMessage,
  type PopupState,
} from '@/utils/messaging/messages';

const ALL_CONCURRENCY = 5;

const coordinator = new CheckCoordinator<AuthCacheEntry>();
const allRefreshBatch = new AllRefreshBatch();

export default defineBackground(() => {
  // SW may have been killed mid-check; close any orphaned inactive tabs.
  void closeTrackedFallbackTabs();
  // First run / new storefronts: signed-out seeds (checkedAt 0) before refresh.
  void ensureAuthCacheSeeded();

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

  if (allRefreshBatch.inFlight) {
    // Global lock: ignore individual checks while All batch is running.
    return buildPopupState();
  }

  await checkMarketplace(marketplaceId);
  return buildPopupState();
}

async function runAllChecks(): Promise<void> {
  try {
    await allRefreshBatch.run(async () => {
      await broadcastState();
      await mapPoolBestEffort(
        [...MARKETPLACES],
        ALL_CONCURRENCY,
        async (marketplace) => {
          await checkMarketplace(marketplace.id);
          await broadcastState();
        },
        async (error, marketplace) => {
          console.error(
            `All-refresh worker failed for ${marketplace.id}`,
            error,
          );
          try {
            await setAuthEntry(marketplace.id, {
              status: 'unknown',
              checkedAt: Date.now(),
            });
          } catch (writeError) {
            console.error(
              `Failed to persist unknown for ${marketplace.id}`,
              writeError,
            );
          }
          await broadcastState();
        },
      );
    });
  } finally {
    // Batch lock clears before joiners resume — announce unlocked state.
    await broadcastState();
  }
}

async function checkMarketplace(marketplaceId: string): Promise<void> {
  const marketplace = getMarketplace(marketplaceId);
  if (!marketplace) {
    return;
  }

  await coordinator.run(marketplaceId, async () => {
    const entry = await detectAuth(marketplace);
    await setAuthEntry(marketplaceId, entry);
    return entry;
  });
}

async function buildPopupState(): Promise<PopupState> {
  const [selectedMarketplaceId, storedLocale, authByMarketplace] =
    await Promise.all([
      getSelectedMarketplace(),
      getStoredLocale(),
      ensureAuthCacheSeeded(),
    ]);

  const browserLanguage = browser.i18n?.getUILanguage?.() ?? 'en';
  const locale = resolveLocale(storedLocale, browserLanguage);

  return {
    selectedMarketplaceId,
    locale,
    authByMarketplace,
    inFlightMarketplaceIds: coordinator.inFlightKeys(),
    allRefreshInFlight: allRefreshBatch.inFlight,
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
