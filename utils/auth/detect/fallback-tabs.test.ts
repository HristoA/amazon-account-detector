import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

const remove = vi.fn(async () => {});
const get = vi.fn(async (tabId: number) => ({
  id: tabId,
  active: false,
  url: `https://www.amazon.com/ap/signin?openid.assoc_handle=usflex&aad_fb=1&id=${tabId}`,
}));
const query = vi.fn(
  async (): Promise<Array<{ id: number; active: boolean; url: string }>> => [],
);

vi.mock('wxt/browser', () => ({
  browser: {
    tabs: {
      remove,
      get,
      query,
    },
  },
}));

describe('fallback-tabs', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    remove.mockClear();
    get.mockClear();
    query.mockClear();
    get.mockImplementation(async (tabId: number) => ({
      id: tabId,
      active: false,
      url: `https://www.amazon.com/ap/signin?openid.assoc_handle=usflex&aad_fb=1&id=${tabId}`,
    }));
    query.mockResolvedValue([]);
    remove.mockResolvedValue(undefined);
    vi.resetModules();
  });

  it('tracks and untracks tab ids with timestamps', async () => {
    const { trackFallbackTab, untrackFallbackTab, fallbackTabIdsItem } =
      await import('./fallback-tabs');

    await trackFallbackTab(11, 1_000);
    await trackFallbackTab(22, 2_000);
    expect(await fallbackTabIdsItem.getValue()).toEqual([
      { tabId: 11, trackedAt: 1_000 },
      { tabId: 22, trackedAt: 2_000 },
    ]);

    await untrackFallbackTab(11);
    expect(await fallbackTabIdsItem.getValue()).toEqual([
      { tabId: 22, trackedAt: 2_000 },
    ]);
  });

  it('closes matching marked Amazon sign-in tabs then clears them from the list', async () => {
    const { trackFallbackTab, closeTrackedFallbackTabs, fallbackTabIdsItem } =
      await import('./fallback-tabs');

    await trackFallbackTab(7);
    await trackFallbackTab(8);
    await closeTrackedFallbackTabs();

    expect(get).toHaveBeenCalledWith(7);
    expect(get).toHaveBeenCalledWith(8);
    expect(remove).toHaveBeenCalledWith(7);
    expect(remove).toHaveBeenCalledWith(8);
    expect(await fallbackTabIdsItem.getValue()).toEqual([]);
  });

  it('closes tracked Amazon sign-in tabs even when Amazon strips aad_fb', async () => {
    get.mockImplementation(async (tabId: number) => ({
      id: tabId,
      active: false,
      url: 'https://www.amazon.com/ap/signin?openid.assoc_handle=usflex',
    }));

    const { trackFallbackTab, closeTrackedFallbackTabs, fallbackTabIdsItem } =
      await import('./fallback-tabs');

    await trackFallbackTab(9);
    await closeTrackedFallbackTabs();

    expect(remove).toHaveBeenCalledWith(9);
    expect(await fallbackTabIdsItem.getValue()).toEqual([]);
  });

  it('does not remove unmarked Amazon sign-in tabs that were never tracked', async () => {
    query.mockResolvedValue([
      {
        id: 44,
        active: false,
        url: 'https://www.amazon.com/ap/signin?openid.assoc_handle=usflex',
      },
    ]);
    get.mockImplementation(async (tabId: number) => ({
      id: tabId,
      active: false,
      url: 'https://www.amazon.com/ap/signin?openid.assoc_handle=usflex',
    }));

    const { closeTrackedFallbackTabs, fallbackTabIdsItem } =
      await import('./fallback-tabs');

    await closeTrackedFallbackTabs();

    expect(remove).not.toHaveBeenCalled();
    expect(await fallbackTabIdsItem.getValue()).toEqual([]);
  });

  it('closes recent tracked about:blank orphans left mid-navigate', async () => {
    get.mockImplementation(async (tabId: number) => ({
      id: tabId,
      active: false,
      url: 'about:blank',
    }));

    const { trackFallbackTab, closeTrackedFallbackTabs, fallbackTabIdsItem } =
      await import('./fallback-tabs');

    const now = 50_000;
    await trackFallbackTab(12, now - 1_000);
    await closeTrackedFallbackTabs(now);

    expect(remove).toHaveBeenCalledWith(12);
    expect(await fallbackTabIdsItem.getValue()).toEqual([]);
  });

  it('does not close stale tracked about:blank (tab id may have been recycled)', async () => {
    get.mockImplementation(async (tabId: number) => ({
      id: tabId,
      active: false,
      url: 'about:blank',
    }));

    const {
      trackFallbackTab,
      closeTrackedFallbackTabs,
      fallbackTabIdsItem,
      BLANK_CLOSE_MAX_AGE_MS,
    } = await import('./fallback-tabs');

    const now = 100_000;
    await trackFallbackTab(12, now - BLANK_CLOSE_MAX_AGE_MS - 1);
    await closeTrackedFallbackTabs(now);

    expect(remove).not.toHaveBeenCalled();
    expect(await fallbackTabIdsItem.getValue()).toEqual([]);
  });

  it('does not close legacy bare-id blanks without a trackedAt timestamp', async () => {
    get.mockImplementation(async (tabId: number) => ({
      id: tabId,
      active: false,
      url: 'about:blank',
    }));

    const { fallbackTabIdsItem, closeTrackedFallbackTabs } =
      await import('./fallback-tabs');

    await fallbackTabIdsItem.setValue([12]);
    await closeTrackedFallbackTabs(Date.now());

    expect(remove).not.toHaveBeenCalled();
    expect(await fallbackTabIdsItem.getValue()).toEqual([]);
  });

  it('does not remove tabs whose URL is no longer an Amazon sign-in page', async () => {
    get.mockImplementation(async (tabId: number) => ({
      id: tabId,
      active: false,
      url: 'https://example.com/',
    }));

    const { trackFallbackTab, closeTrackedFallbackTabs, fallbackTabIdsItem } =
      await import('./fallback-tabs');

    await trackFallbackTab(9);
    await closeTrackedFallbackTabs();

    expect(remove).not.toHaveBeenCalled();
    expect(await fallbackTabIdsItem.getValue()).toEqual([]);
  });

  it('closes recent tracked Amazon storefront redirects after SW death', async () => {
    get.mockImplementation(async (tabId: number) => ({
      id: tabId,
      active: false,
      url: 'https://www.amazon.com/dp/B00EXAMPLE',
    }));

    const { trackFallbackTab, closeTrackedFallbackTabs, fallbackTabIdsItem } =
      await import('./fallback-tabs');

    const now = 50_000;
    await trackFallbackTab(9, now - 1_000);
    await closeTrackedFallbackTabs(now);

    expect(remove).toHaveBeenCalledWith(9);
    expect(await fallbackTabIdsItem.getValue()).toEqual([]);
  });

  it('does not close stale tracked Amazon storefront tabs (id may be recycled)', async () => {
    get.mockImplementation(async (tabId: number) => ({
      id: tabId,
      active: false,
      url: 'https://www.amazon.com/dp/B00EXAMPLE',
    }));

    const {
      trackFallbackTab,
      closeTrackedFallbackTabs,
      fallbackTabIdsItem,
      TRACKED_AMAZON_HOST_CLOSE_MAX_AGE_MS,
    } = await import('./fallback-tabs');

    const now = 100_000;
    await trackFallbackTab(9, now - TRACKED_AMAZON_HOST_CLOSE_MAX_AGE_MS - 1);
    await closeTrackedFallbackTabs(now);

    expect(remove).not.toHaveBeenCalled();
    expect(await fallbackTabIdsItem.getValue()).toEqual([]);
  });

  it('claims active marked tabs so later sweeps never close them', async () => {
    get.mockImplementation(async (tabId: number) => ({
      id: tabId,
      active: true,
      url: 'https://www.amazon.com/ap/signin?openid.assoc_handle=usflex&aad_fb=1',
    }));

    const { trackFallbackTab, closeTrackedFallbackTabs, fallbackTabIdsItem } =
      await import('./fallback-tabs');

    await trackFallbackTab(4);
    await closeTrackedFallbackTabs();

    expect(remove).not.toHaveBeenCalled();
    expect(await fallbackTabIdsItem.getValue()).toEqual([
      { tabId: 4, trackedAt: expect.any(Number), userClaimed: true },
    ]);

    get.mockImplementation(async (tabId: number) => ({
      id: tabId,
      active: false,
      url: 'https://www.amazon.com/ap/signin?openid.assoc_handle=usflex&aad_fb=1',
    }));
    remove.mockClear();
    await closeTrackedFallbackTabs();

    expect(remove).not.toHaveBeenCalled();
    expect(await fallbackTabIdsItem.getValue()).toEqual([
      { tabId: 4, trackedAt: expect.any(Number), userClaimed: true },
    ]);
  });

  it('does not close a claimed tab after the user navigates to a product page', async () => {
    const trackedAt = Date.now() - 5_000;
    get.mockImplementation(async (tabId: number) => ({
      id: tabId,
      active: true,
      url: 'https://www.amazon.com/dp/B00EXAMPLE',
    }));

    const {
      trackFallbackTab,
      closeTrackedFallbackTabs,
      fallbackTabIdsItem,
      isOursToClose,
    } = await import('./fallback-tabs');

    await trackFallbackTab(12, trackedAt);
    await closeTrackedFallbackTabs();

    expect(remove).not.toHaveBeenCalled();
    expect(await fallbackTabIdsItem.getValue()).toEqual([
      { tabId: 12, trackedAt, userClaimed: true },
    ]);
    expect(
      isOursToClose('https://www.amazon.com/dp/B00EXAMPLE', {
        wasTracked: true,
        trackedAt,
        userClaimed: true,
      }),
    ).toBe(false);

    get.mockImplementation(async (tabId: number) => ({
      id: tabId,
      active: false,
      url: 'https://www.amazon.com/dp/B00EXAMPLE',
    }));
    remove.mockClear();
    await closeTrackedFallbackTabs();

    expect(remove).not.toHaveBeenCalled();
    expect(await fallbackTabIdsItem.getValue()).toEqual([
      { tabId: 12, trackedAt, userClaimed: true },
    ]);
  });

  it('claimFallbackTab marks an existing tracked tab as user-owned', async () => {
    const { trackFallbackTab, claimFallbackTab, fallbackTabIdsItem } =
      await import('./fallback-tabs');

    await trackFallbackTab(3, 1_000);
    await claimFallbackTab(3);
    expect(await fallbackTabIdsItem.getValue()).toEqual([
      { tabId: 3, trackedAt: 1_000, userClaimed: true },
    ]);
  });

  it('does not close untracked tabs that still carry the marker', async () => {
    query.mockResolvedValue([
      {
        id: 55,
        active: false,
        url: 'https://www.amazon.de/ap/signin?openid.assoc_handle=deflex&aad_fb=1',
      },
    ]);
    get.mockImplementation(async (tabId: number) => ({
      id: tabId,
      active: false,
      url: 'https://www.amazon.de/ap/signin?openid.assoc_handle=deflex&aad_fb=1',
    }));

    const { closeTrackedFallbackTabs, fallbackTabIdsItem } =
      await import('./fallback-tabs');

    await closeTrackedFallbackTabs();

    expect(remove).not.toHaveBeenCalled();
    expect(await fallbackTabIdsItem.getValue()).toEqual([]);
  });

  it('does not close stale tracked auth-path tabs (id may be recycled)', async () => {
    get.mockImplementation(async (tabId: number) => ({
      id: tabId,
      active: false,
      url: 'https://www.amazon.com/ap/signin?openid.assoc_handle=usflex',
    }));

    const {
      trackFallbackTab,
      closeTrackedFallbackTabs,
      fallbackTabIdsItem,
      TRACKED_AMAZON_HOST_CLOSE_MAX_AGE_MS,
    } = await import('./fallback-tabs');

    const now = 100_000;
    await trackFallbackTab(9, now - TRACKED_AMAZON_HOST_CLOSE_MAX_AGE_MS - 1);
    await closeTrackedFallbackTabs(now);

    expect(remove).not.toHaveBeenCalled();
    expect(await fallbackTabIdsItem.getValue()).toEqual([]);
  });

  it('does not close legacy bare-id auth-path tabs without trackedAt', async () => {
    get.mockImplementation(async (tabId: number) => ({
      id: tabId,
      active: false,
      url: 'https://www.amazon.com/ap/signin?openid.assoc_handle=usflex&aad_fb=1',
    }));

    const { fallbackTabIdsItem, closeTrackedFallbackTabs } =
      await import('./fallback-tabs');

    await fallbackTabIdsItem.setValue([12]);
    await closeTrackedFallbackTabs(Date.now());

    expect(remove).not.toHaveBeenCalled();
    expect(await fallbackTabIdsItem.getValue()).toEqual([]);
  });

  it('keeps ids when remove fails so a later sweep can retry', async () => {
    remove.mockRejectedValue(new Error('busy'));

    const { trackFallbackTab, closeTrackedFallbackTabs, fallbackTabIdsItem } =
      await import('./fallback-tabs');

    await trackFallbackTab(3);
    await closeTrackedFallbackTabs();

    expect(await fallbackTabIdsItem.getValue()).toEqual([
      { tabId: 3, trackedAt: expect.any(Number) },
    ]);
  });
});

describe('fallback tab marker helpers', () => {
  it('only treats recent tracked blanks as closable', async () => {
    const { isOursToClose, BLANK_CLOSE_MAX_AGE_MS } =
      await import('./fallback-tabs');
    const now = 10_000;
    expect(
      isOursToClose('about:blank', {
        wasTracked: true,
        trackedAt: now - 1_000,
        now,
      }),
    ).toBe(true);
    expect(
      isOursToClose('about:blank', {
        wasTracked: true,
        trackedAt: now - BLANK_CLOSE_MAX_AGE_MS - 1,
        now,
      }),
    ).toBe(false);
    expect(
      isOursToClose('about:blank', {
        wasTracked: true,
        trackedAt: 0,
        now,
      }),
    ).toBe(false);
  });

  it('closes recent tracked Amazon hosts that left the auth path', async () => {
    const { isOursToClose, TRACKED_AMAZON_HOST_CLOSE_MAX_AGE_MS } =
      await import('./fallback-tabs');
    const now = 20_000;
    expect(
      isOursToClose('https://www.amazon.com/dp/B00EXAMPLE', {
        wasTracked: true,
        trackedAt: now - 1_000,
        now,
      }),
    ).toBe(true);
    expect(
      isOursToClose('https://www.amazon.com/dp/B00EXAMPLE', {
        wasTracked: true,
        trackedAt: now - TRACKED_AMAZON_HOST_CLOSE_MAX_AGE_MS - 1,
        now,
      }),
    ).toBe(false);
    expect(
      isOursToClose('https://www.amazon.com/dp/B00EXAMPLE', {
        wasTracked: false,
        trackedAt: now - 1_000,
        now,
      }),
    ).toBe(false);
  });

  it('only closes recent tracked auth-path tabs (marked or stripped)', async () => {
    const { isOursToClose, TRACKED_AMAZON_HOST_CLOSE_MAX_AGE_MS } =
      await import('./fallback-tabs');
    const now = 20_000;
    const marked =
      'https://www.amazon.com/ap/signin?openid.assoc_handle=usflex&aad_fb=1';
    const stripped =
      'https://www.amazon.com/ap/signin?openid.assoc_handle=usflex';

    expect(
      isOursToClose(marked, {
        wasTracked: true,
        trackedAt: now - 1_000,
        now,
      }),
    ).toBe(true);
    expect(
      isOursToClose(stripped, {
        wasTracked: true,
        trackedAt: now - 1_000,
        now,
      }),
    ).toBe(true);
    expect(
      isOursToClose(marked, {
        wasTracked: false,
        trackedAt: now - 1_000,
        now,
      }),
    ).toBe(false);
    expect(
      isOursToClose(stripped, {
        wasTracked: true,
        trackedAt: now - TRACKED_AMAZON_HOST_CLOSE_MAX_AGE_MS - 1,
        now,
      }),
    ).toBe(false);
    expect(
      isOursToClose(marked, {
        wasTracked: true,
        trackedAt: 0,
        now,
      }),
    ).toBe(false);
  });

  it('does not query Amazon tabs for marker rediscovery', async () => {
    const { closeTrackedFallbackTabs } = await import('./fallback-tabs');

    await closeTrackedFallbackTabs();

    expect(query).not.toHaveBeenCalled();
  });

  it('adds and detects the extension marker', async () => {
    const { withFallbackTabMarker, hasFallbackTabMarker, isFallbackTabUrl } =
      await import('./fallback-tabs');

    const marked = withFallbackTabMarker(
      'https://www.amazon.de/ap/signin?openid.assoc_handle=deflex',
    );
    expect(hasFallbackTabMarker(marked)).toBe(true);
    expect(isFallbackTabUrl(marked)).toBe(true);
  });

  it('accepts marked Amazon sign-in / claim URLs only', async () => {
    const { isFallbackTabUrl, isAmazonAuthPathUrl } =
      await import('./fallback-tabs');
    expect(
      isFallbackTabUrl(
        'https://www.amazon.de/ap/signin?openid.assoc_handle=deflex&aad_fb=1',
      ),
    ).toBe(true);
    expect(
      isFallbackTabUrl(
        'https://www.amazon.com/ax/claim?openid.assoc_handle=usflex&aad_fb=1',
      ),
    ).toBe(true);
    expect(
      isFallbackTabUrl(
        'https://www.amazon.de/ap/signin?openid.assoc_handle=deflex',
      ),
    ).toBe(false);
    expect(
      isAmazonAuthPathUrl(
        'https://www.amazon.de/ap/signin?openid.assoc_handle=deflex',
      ),
    ).toBe(true);
  });

  it('rejects unrelated or lookalike hosts', async () => {
    const { isFallbackTabUrl, isAmazonAuthPathUrl, isAllowedAmazonHost } =
      await import('./fallback-tabs');
    expect(isFallbackTabUrl('https://example.com/?aad_fb=1')).toBe(false);
    expect(isFallbackTabUrl('https://www.amazon.com/dp/B00?aad_fb=1')).toBe(
      false,
    );
    expect(
      isFallbackTabUrl(
        'https://evil-amazon.com/ap/signin?openid.assoc_handle=usflex&aad_fb=1',
      ),
    ).toBe(false);
    expect(
      isFallbackTabUrl(
        'https://www.amazon.evil.com/ap/signin?openid.assoc_handle=usflex&aad_fb=1',
      ),
    ).toBe(false);
    expect(
      isAmazonAuthPathUrl(
        'https://amazon.com.evil.com/ap/signin?openid.assoc_handle=usflex',
      ),
    ).toBe(false);
    expect(isAllowedAmazonHost('www.amazon.evil.com')).toBe(false);
    expect(isAllowedAmazonHost('www.amazon.co.uk')).toBe(true);
    expect(isFallbackTabUrl(undefined)).toBe(false);
  });
});
