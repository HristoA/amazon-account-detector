import { browser } from 'wxt/browser';
import { storage } from 'wxt/utils/storage';
import { MARKETPLACES } from '@/utils/marketplace/marketplaces';

export interface FallbackTabRecord {
  tabId: number;
  /** Epoch ms when we started tracking — blanks older than the grace window are not closed. */
  trackedAt: number;
  /**
   * User focused this fallback tab — never auto-close, even after it becomes
   * inactive or Amazon redirects onto a normal storefront URL.
   */
  userClaimed?: boolean;
}

/**
 * Tab IDs opened for inactive-tab auth fallback. Persisted so a service-worker
 * restart can close orphans left when the worker was killed mid-check.
 * Legacy installs may still store bare `number[]`; readers normalize.
 */
export const fallbackTabIdsItem = storage.defineItem<
  Array<number | FallbackTabRecord>
>('local:fallbackTabIds', {
  fallback: [],
});

/** Query param we attach so sweeps never close a recycled user tab ID. */
const FALLBACK_TAB_MARKER_PARAM = 'aad_fb';
const FALLBACK_TAB_MARKER_VALUE = '1';

/**
 * Only close tracked about:blank tabs younger than this. Tab IDs are reusable;
 * an old tracked id that later points at a user's blank must not be closed.
 */
export const BLANK_CLOSE_MAX_AGE_MS = 30_000;

/** Exact hosts we open for detection — not lookalikes like www.amazon.evil.com. */
const ALLOWED_AMAZON_HOSTS = new Set(
  MARKETPLACES.flatMap((m) => [
    m.domain.toLowerCase(),
    `www.${m.domain.toLowerCase()}`,
  ]),
);

/**
 * After SW death Amazon may redirect a fallback tab off the auth path onto a
 * normal storefront URL. Close those only while still young — tab IDs recycle.
 */
export const TRACKED_AMAZON_HOST_CLOSE_MAX_AGE_MS = 60_000;

let tabWriteChain: Promise<void> = Promise.resolve();

function enqueue(update: () => Promise<void>): Promise<void> {
  const run = tabWriteChain.then(update);
  tabWriteChain = run.catch(() => {});
  return run;
}

export function normalizeFallbackTabRecords(
  raw: Array<number | FallbackTabRecord>,
): FallbackTabRecord[] {
  const byId = new Map<number, FallbackTabRecord>();
  for (const item of raw) {
    if (typeof item === 'number') {
      // Legacy: no timestamp — never treat as a closable blank.
      byId.set(item, { tabId: item, trackedAt: 0 });
      continue;
    }
    if (
      item &&
      typeof item === 'object' &&
      typeof item.tabId === 'number' &&
      typeof item.trackedAt === 'number'
    ) {
      byId.set(item.tabId, {
        tabId: item.tabId,
        trackedAt: item.trackedAt,
        ...(item.userClaimed === true ? { userClaimed: true } : {}),
      });
    }
  }
  return [...byId.values()];
}

async function readTrackedRecords(): Promise<FallbackTabRecord[]> {
  return normalizeFallbackTabRecords(await fallbackTabIdsItem.getValue());
}

export async function trackFallbackTab(
  tabId: number,
  trackedAt: number = Date.now(),
): Promise<void> {
  await enqueue(async () => {
    const records = await readTrackedRecords();
    if (records.some((r) => r.tabId === tabId)) {
      return;
    }
    await fallbackTabIdsItem.setValue([...records, { tabId, trackedAt }]);
  });
}

export async function untrackFallbackTab(tabId: number): Promise<void> {
  await enqueue(async () => {
    const records = await readTrackedRecords();
    await fallbackTabIdsItem.setValue(records.filter((r) => r.tabId !== tabId));
  });
}

/** Mark a fallback as user-owned so orphan sweeps never close it. */
export async function claimFallbackTab(
  tabId: number,
  trackedAt: number = Date.now(),
): Promise<void> {
  await enqueue(async () => {
    const records = await readTrackedRecords();
    const existing = records.find((r) => r.tabId === tabId);
    if (existing) {
      if (existing.userClaimed) {
        return;
      }
      await fallbackTabIdsItem.setValue(
        records.map((r) =>
          r.tabId === tabId ? { ...r, userClaimed: true } : r,
        ),
      );
      return;
    }
    await fallbackTabIdsItem.setValue([
      ...records,
      { tabId, trackedAt, userClaimed: true },
    ]);
  });
}

/** Attach the extension-owned marker used to identify fallback tabs. */
export function withFallbackTabMarker(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set(FALLBACK_TAB_MARKER_PARAM, FALLBACK_TAB_MARKER_VALUE);
  return parsed.toString();
}

export function hasFallbackTabMarker(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  try {
    return (
      new URL(url).searchParams.get(FALLBACK_TAB_MARKER_PARAM) ===
      FALLBACK_TAB_MARKER_VALUE
    );
  } catch {
    return false;
  }
}

export function isAllowedAmazonHost(hostname: string): boolean {
  return ALLOWED_AMAZON_HOSTS.has(hostname.toLowerCase());
}

/** Allowlisted Amazon host on a sign-in / claim / OpenID path (marker optional). */
export function isAmazonAuthPathUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    if (!isAllowedAmazonHost(parsed.hostname)) {
      return false;
    }
    return (
      parsed.pathname.includes('/ap/signin') ||
      parsed.pathname.includes('/ax/claim') ||
      parsed.search.includes('openid.assoc_handle')
    );
  } catch {
    return false;
  }
}

/**
 * Only close untracked tabs that still carry our marker.
 * Protects against recycled tab IDs after Chrome reuses an id.
 */
export function isFallbackTabUrl(url: string | undefined): boolean {
  return hasFallbackTabMarker(url) && isAmazonAuthPathUrl(url);
}

/**
 * Blank (or empty/pending) URL left after create→track when SW dies before
 * navigating to the marked Amazon sign-in page.
 */
export function isTrackedBlankUrl(url: string | undefined): boolean {
  return url == null || url === '' || url === 'about:blank';
}

export function isRecentTrackedBlank(
  url: string | undefined,
  options: { wasTracked: boolean; trackedAt: number; now?: number },
): boolean {
  if (!options.wasTracked || !isTrackedBlankUrl(url)) {
    return false;
  }
  if (options.trackedAt <= 0) {
    return false;
  }
  const now = options.now ?? Date.now();
  return now - options.trackedAt < BLANK_CLOSE_MAX_AGE_MS;
}

export function isAllowedAmazonUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  try {
    return isAllowedAmazonHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Tracked fallback that redirected to a normal Amazon page after SW death —
 * closable only within {@link TRACKED_AMAZON_HOST_CLOSE_MAX_AGE_MS}.
 */
export function isRecentTrackedAmazonHost(
  url: string | undefined,
  options: { wasTracked: boolean; trackedAt: number; now?: number },
): boolean {
  if (!options.wasTracked || !isAllowedAmazonUrl(url)) {
    return false;
  }
  if (options.trackedAt <= 0) {
    return false;
  }
  const now = options.now ?? Date.now();
  return now - options.trackedAt < TRACKED_AMAZON_HOST_CLOSE_MAX_AGE_MS;
}

/**
 * Tracked auth-path tabs (marker present or stripped by Amazon) are closable
 * only while still young — tab IDs recycle.
 */
export function isRecentTrackedAuthPath(
  url: string | undefined,
  options: { wasTracked: boolean; trackedAt: number; now?: number },
): boolean {
  if (!options.wasTracked || !isAmazonAuthPathUrl(url)) {
    return false;
  }
  if (options.trackedAt <= 0) {
    return false;
  }
  const now = options.now ?? Date.now();
  return now - options.trackedAt < TRACKED_AMAZON_HOST_CLOSE_MAX_AGE_MS;
}

/**
 * Whether a tab URL is safe to close.
 * Only tracked ids are closable — never close by marker alone (user may keep a
 * copied `aad_fb` sign-in URL).
 * Tracked auth paths (marker optional) and post-redirect Amazon hosts are
 * closable only within {@link TRACKED_AMAZON_HOST_CLOSE_MAX_AGE_MS}.
 * Tracked blanks are only closable within {@link BLANK_CLOSE_MAX_AGE_MS}.
 */
export function isOursToClose(
  url: string | undefined,
  options: {
    wasTracked: boolean;
    trackedAt?: number;
    now?: number;
    userClaimed?: boolean;
  },
): boolean {
  if (options.userClaimed) {
    return false;
  }
  if (
    isRecentTrackedBlank(url, {
      wasTracked: options.wasTracked,
      trackedAt: options.trackedAt ?? 0,
      now: options.now,
    })
  ) {
    return true;
  }
  if (
    isRecentTrackedAuthPath(url, {
      wasTracked: options.wasTracked,
      trackedAt: options.trackedAt ?? 0,
      now: options.now,
    })
  ) {
    return true;
  }
  return isRecentTrackedAmazonHost(url, {
    wasTracked: options.wasTracked,
    trackedAt: options.trackedAt ?? 0,
    now: options.now,
  });
}

/**
 * Close tracked fallback tabs that still look like ours.
 * Clears an id only after it is gone, skipped (wrong URL), or successfully closed —
 * never wipe the whole list before attempting removes.
 */
export async function closeTrackedFallbackTabs(
  now: number = Date.now(),
): Promise<void> {
  await enqueue(async () => {
    const trackedRecords = await readTrackedRecords();
    const stillTracked: FallbackTabRecord[] = [];

    for (const record of trackedRecords) {
      const { tabId, trackedAt } = record;
      const alreadyClaimed = record.userClaimed === true;
      try {
        const tab = await browser.tabs.get(tabId);
        // User focused the fallback — keep a claimed record so later sweeps
        // never close it.
        if (tab.active || alreadyClaimed) {
          stillTracked.push({
            tabId,
            trackedAt: trackedAt > 0 ? trackedAt : now,
            userClaimed: true,
          });
          continue;
        }
        const ours = isOursToClose(tab.url, {
          wasTracked: true,
          trackedAt,
          now,
          userClaimed: alreadyClaimed,
        });
        if (!ours) {
          // Recycled id, stale blank/auth path, or navigated away — drop tracking.
          continue;
        }
        try {
          await browser.tabs.remove(tabId);
        } catch {
          stillTracked.push({ tabId, trackedAt });
        }
      } catch {
        // Tab already gone — drop from the list.
      }
    }

    await fallbackTabIdsItem.setValue(stillTracked);
  });
}
