import { browser } from 'wxt/browser';
import type { AuthCacheEntry } from './auth-types';
import { buildSignInUrl, type Marketplace } from '../marketplace/marketplaces';
import {
  claimFallbackTab,
  trackFallbackTab,
  untrackFallbackTab,
  withFallbackTabMarker,
} from './fallback-tabs';
import { parseAuthHtml, SWITCHER_TOKEN_RE } from './parse-auth';
import { settleAuthHtml } from './settle-auth-html.ts';
import { Semaphore } from './semaphore.ts';

const TAB_LOAD_TIMEOUT_MS = 20_000;
/** At most one inactive-tab fallback at a time (fetch stays parallel). */
const tabFallbackGate = new Semaphore(1);

export async function detectAuth(
  marketplace: Marketplace,
): Promise<AuthCacheEntry> {
  const url = buildSignInUrl(marketplace);

  try {
    const response = await fetch(url, {
      credentials: 'include',
      redirect: 'follow',
      headers: {
        Accept: 'text/html',
      },
    });
    const contentType = response.headers.get('content-type') ?? '';
    const looksLikeHtml =
      contentType === '' ||
      contentType.includes('text/html') ||
      contentType.includes('application/xhtml');
    if (response.ok && looksLikeHtml) {
      const html = await response.text();
      const parsed = parseAuthHtml(html);
      if (parsed.kind === 'logged_in') {
        return {
          status: 'logged_in',
          email: parsed.email,
          checkedAt: Date.now(),
          source: 'fetch',
        };
      }
      if (parsed.kind === 'logged_out') {
        // Fetch sometimes sees a sign-in form while a real tab (JS + full cookie
        // jar) still renders the account switcher. Confirm via tab when switcher
        // tokens are present; otherwise trust logged_out without opening a tab.
        if (!SWITCHER_TOKEN_RE.test(html)) {
          return {
            status: 'logged_out',
            checkedAt: Date.now(),
            source: 'fetch',
          };
        }
      }
      // Indeterminate (and ambiguous logged_out+switcher) → tab path so
      // challenge.js / switcher UI can render.
    }
    // Non-OK / non-HTML responses are indeterminate — fall through to tab.
  } catch {
    // Fall through to inactive-tab approach.
  }

  return detectAuthViaTab(url);
}

async function detectAuthViaTab(url: string): Promise<AuthCacheEntry> {
  return tabFallbackGate.run(async () => {
    let tabId: number | undefined;

    try {
      // Create blank first, then track, then navigate — so a SW kill between
      // create and track cannot leave an untracked Amazon tab.
      const tab = await browser.tabs.create({
        url: 'about:blank',
        active: false,
      });
      tabId = tab.id;
      if (tabId == null) {
        return {
          status: 'unknown',
          checkedAt: Date.now(),
          source: 'tab',
        };
      }
      await trackFallbackTab(tabId);

      const deadlineMs = Date.now() + TAB_LOAD_TIMEOUT_MS;
      // Listen for the *next* complete before navigating — blank is already
      // complete, so waitForTabComplete would resolve immediately on about:blank.
      const navigated = waitForNextTabComplete(tabId, remainingMs(deadlineMs));
      await browser.tabs.update(tabId, {
        url: withFallbackTabMarker(url),
      });
      await navigated;

      const html = await settleAuthHtml({
        readHtml: () => readTabHtml(tabId!),
        waitForNextLoad: () =>
          waitForNextTabComplete(tabId!, remainingMs(deadlineMs)),
        deadlineMs,
      });
      if (typeof html !== 'string' || html.length === 0) {
        return {
          status: 'unknown',
          checkedAt: Date.now(),
          source: 'tab',
        };
      }

      const parsed = parseAuthHtml(html);
      if (parsed.kind === 'logged_in') {
        return {
          status: 'logged_in',
          email: parsed.email,
          checkedAt: Date.now(),
          source: 'tab',
        };
      }
      if (parsed.kind === 'logged_out') {
        return {
          status: 'logged_out',
          checkedAt: Date.now(),
          source: 'tab',
        };
      }
      return {
        status: 'unknown',
        checkedAt: Date.now(),
        source: 'tab',
      };
    } catch {
      return {
        status: 'unknown',
        checkedAt: Date.now(),
        source: 'tab',
      };
    } finally {
      if (tabId != null) {
        await cleanupFallbackTab(tabId);
      }
    }
  });
}

/**
 * Mirror orphan sweep: never yank a tab the user focused mid-check.
 * Claim it so later sweeps do not close a storefront tab the user took over.
 */
async function cleanupFallbackTab(tabId: number): Promise<void> {
  try {
    const tab = await browser.tabs.get(tabId);
    if (tab.active) {
      await claimFallbackTab(tabId);
      return;
    }
    try {
      await browser.tabs.remove(tabId);
    } catch {
      // Keep tracked so a later sweep can retry.
      return;
    }
  } catch {
    // Tab already gone.
  }
  await untrackFallbackTab(tabId);
}

async function readTabHtml(tabId: number): Promise<string> {
  const results = await browser.scripting.executeScript({
    target: { tabId },
    func: () => document.documentElement.outerHTML,
  });
  const html = results[0]?.result;
  return typeof html === 'string' ? html : '';
}

function remainingMs(deadlineMs: number): number {
  return Math.max(0, deadlineMs - Date.now());
}

/** Wait for a future `complete` only — do not resolve for the current load. */
function waitForNextTabComplete(
  tabId: number,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (timeoutMs <= 0) {
      reject(new Error('Tab load timed out'));
      return;
    }

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Tab load timed out'));
    }, timeoutMs);

    const onUpdated = (
      updatedTabId: number,
      changeInfo: { status?: string },
    ) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        cleanup();
        resolve();
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      browser.tabs.onUpdated.removeListener(onUpdated);
    };

    browser.tabs.onUpdated.addListener(onUpdated);
  });
}
