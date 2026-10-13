import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMarketplace } from '@/utils/marketplace/marketplaces';

const trackFallbackTab = vi.fn(async () => {});
const untrackFallbackTab = vi.fn(async () => {});
const claimFallbackTab = vi.fn(async () => {});
const withFallbackTabMarker = vi.fn((url: string) => `${url}&aad_fb=1`);
const tabsCreate = vi.fn(async () => ({ id: 1 }));
const tabsUpdate = vi.fn(async () => ({}));
const tabsRemove = vi.fn(async () => {});
const tabsGet = vi.fn(
  async (): Promise<{ status: string; url?: string; active?: boolean }> => ({
    status: 'loading',
    active: false,
  }),
);
const executeScript = vi.fn(async () => [{ result: '' }]);
const addListener = vi.fn();
const removeListener = vi.fn();

vi.mock('./fallback-tabs', () => ({
  trackFallbackTab,
  untrackFallbackTab,
  claimFallbackTab,
  withFallbackTabMarker,
}));

vi.mock('wxt/browser', () => ({
  browser: {
    tabs: {
      create: tabsCreate,
      update: tabsUpdate,
      remove: tabsRemove,
      get: tabsGet,
      onUpdated: {
        addListener,
        removeListener,
      },
    },
    scripting: {
      executeScript,
    },
  },
}));

describe('detectAuth', () => {
  const marketplace = getMarketplace('amazon.com')!;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns logged_in from fetch without opening a tab', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: { get: () => 'text/html' },
        text: async () =>
          '<div class="cvf-account-switcher"><div data-email="user@example.com"></div></div>',
      })),
    );

    const { detectAuth } = await import('./detect-auth');
    const entry = await detectAuth(marketplace);

    expect(entry).toMatchObject({
      status: 'logged_in',
      email: 'user@example.com',
      source: 'fetch',
    });
    expect(entry.checkedAt).toBeGreaterThan(0);
    expect(tabsCreate).not.toHaveBeenCalled();
  });

  it('returns logged_out from fetch without opening a tab', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: { get: () => 'text/html' },
        text: async () =>
          '<form name="signIn"><input name="email" /><input name="password" /></form>',
      })),
    );

    const { detectAuth } = await import('./detect-auth');
    const entry = await detectAuth(marketplace);

    expect(entry).toMatchObject({
      status: 'logged_out',
      source: 'fetch',
    });
    expect(tabsCreate).not.toHaveBeenCalled();
  });

  it('falls back to a tab when fetch looks logged_out but switcher tokens remain', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: { get: () => 'text/html' },
        text: async () =>
          '<div class="cvf-account-switcher"></div><form id="ap_login_form"><input name="email" /><input name="password" /></form>',
      })),
    );

    tabsCreate.mockResolvedValue({ id: 42 });
    tabsGet.mockResolvedValue({
      status: 'complete',
      url: 'about:blank',
      active: false,
    });
    executeScript.mockResolvedValue([
      {
        result: `
          <div id="ap-account-switcher-container">
            <div class="cvf-account-switcher-profile-details">
              <div class="a-row">me@example.com</div>
            </div>
          </div>
        `,
      },
    ]);

    addListener.mockImplementation((listener) => {
      queueMicrotask(() => {
        listener(42, { status: 'complete' });
      });
    });
    tabsUpdate.mockImplementation(async () => {
      return {};
    });

    const { detectAuth } = await import('./detect-auth');
    const entry = await detectAuth(marketplace);

    expect(entry).toMatchObject({
      status: 'logged_in',
      email: 'me@example.com',
      source: 'tab',
    });
    expect(tabsCreate).toHaveBeenCalled();
  });

  it('falls back to an inactive tab when fetch is indeterminate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: { get: () => 'text/html' },
        text: async () => '<html><body>unclear</body></html>',
      })),
    );

    tabsCreate.mockResolvedValue({ id: 99 });
    // Blank is already complete — must not short-circuit Amazon navigation.
    tabsGet.mockResolvedValue({
      status: 'complete',
      url: 'about:blank',
      active: false,
    });
    executeScript.mockResolvedValue([
      {
        result:
          '<div class="cvf-account-switcher-profile-details">alt@example.com</div>',
      },
    ]);

    // Fire the post-navigate `complete` after update (next-complete waiter).
    tabsUpdate.mockImplementation(async () => {
      queueMicrotask(() => {
        const listener = addListener.mock.calls.at(-1)?.[0] as
          | ((tabId: number, changeInfo: { status?: string }) => void)
          | undefined;
        listener?.(99, { status: 'complete' });
      });
      return {};
    });

    const { detectAuth } = await import('./detect-auth');
    const entry = await detectAuth(marketplace);

    expect(tabsCreate).toHaveBeenCalledWith({
      url: 'about:blank',
      active: false,
    });
    expect(trackFallbackTab).toHaveBeenCalledWith(99);
    expect(addListener).toHaveBeenCalled();
    expect(tabsUpdate).toHaveBeenCalledWith(99, {
      url: expect.stringContaining('aad_fb=1'),
    });
    // Listener must be registered before navigate so blank's complete is ignored.
    const listenerOrder = addListener.mock.invocationCallOrder[0]!;
    const updateOrder = tabsUpdate.mock.invocationCallOrder[0]!;
    expect(listenerOrder).toBeLessThan(updateOrder);
    expect(tabsRemove).toHaveBeenCalledWith(99);
    expect(untrackFallbackTab).toHaveBeenCalledWith(99);
    expect(entry).toMatchObject({
      status: 'logged_in',
      email: 'alt@example.com',
      source: 'tab',
    });
  });

  it('falls back to an inactive tab when fetch is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 503,
        headers: { get: () => 'text/html' },
        text: async () =>
          '<form name="signIn"><input name="email" /><input name="password" /></form>',
      })),
    );

    tabsCreate.mockResolvedValue({ id: 88 });
    tabsGet.mockResolvedValue({
      status: 'complete',
      url: 'about:blank',
      active: false,
    });
    executeScript.mockResolvedValue([
      {
        result:
          '<form name="signIn"><input name="email" /><input name="password" /></form>',
      },
    ]);
    tabsUpdate.mockImplementation(async () => {
      queueMicrotask(() => {
        const listener = addListener.mock.calls.at(-1)?.[0] as
          | ((tabId: number, changeInfo: { status?: string }) => void)
          | undefined;
        listener?.(88, { status: 'complete' });
      });
      return {};
    });

    const { detectAuth } = await import('./detect-auth');
    const entry = await detectAuth(marketplace);

    expect(tabsCreate).toHaveBeenCalled();
    expect(entry).toMatchObject({ status: 'logged_out', source: 'tab' });
  });

  it('leaves an active fallback tab tracked instead of removing it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: { get: () => 'text/html' },
        text: async () => '<html><body>unclear</body></html>',
      })),
    );

    tabsCreate.mockResolvedValue({ id: 77 });
    tabsGet.mockResolvedValue({
      status: 'complete',
      url: 'https://www.amazon.com/ap/signin?aad_fb=1',
      active: true,
    });
    executeScript.mockResolvedValue([
      {
        result:
          '<form name="signIn"><input name="email" /><input name="password" /></form>',
      },
    ]);
    tabsUpdate.mockImplementation(async () => {
      queueMicrotask(() => {
        const listener = addListener.mock.calls.at(-1)?.[0] as
          | ((tabId: number, changeInfo: { status?: string }) => void)
          | undefined;
        listener?.(77, { status: 'complete' });
      });
      return {};
    });

    const { detectAuth } = await import('./detect-auth');
    const entry = await detectAuth(marketplace);

    expect(tabsRemove).not.toHaveBeenCalled();
    expect(untrackFallbackTab).not.toHaveBeenCalled();
    expect(claimFallbackTab).toHaveBeenCalledWith(77);
    expect(entry).toMatchObject({
      status: 'logged_out',
      source: 'tab',
    });
  });
});
