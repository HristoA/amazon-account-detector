import { browser } from 'wxt/browser';
import type { AuthCacheEntry } from './auth-types';
import { buildSignInUrl, type Marketplace } from '../marketplace/marketplaces';
import { parseAuthHtml } from './parse-auth';
import { settleAuthHtml } from './settle-auth-html.ts';
import { Semaphore } from './semaphore.ts';

const TAB_LOAD_TIMEOUT_MS = 20_000;
/** At most one inactive-tab fallback at a time (fetch stays parallel). */
const tabFallbackGate = new Semaphore(1);

export interface DetectAuthOptions {
  isCurrent?: () => boolean;
  onTabCreated?: (tabId: number) => void;
}

export async function detectAuth(
  marketplace: Marketplace,
  options: DetectAuthOptions = {},
): Promise<AuthCacheEntry> {
  const url = buildSignInUrl(marketplace);
  const isCurrent = options.isCurrent ?? (() => true);

  try {
    const response = await fetch(url, {
      credentials: 'include',
      redirect: 'follow',
      headers: {
        Accept: 'text/html',
      },
    });
    const html = await response.text();
    if (!isCurrent()) {
      return staleEntry();
    }
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
      return {
        status: 'logged_out',
        checkedAt: Date.now(),
        source: 'fetch',
      };
    }
    // Indeterminate includes AWS WAF challenge HTML — use the tab path so
    // challenge.js can run and reload to the real sign-in / switcher page.
  } catch {
    // Fall through to inactive-tab approach.
  }

  if (!isCurrent()) {
    return staleEntry();
  }

  return detectAuthViaTab(url, options);
}

async function detectAuthViaTab(
  url: string,
  options: DetectAuthOptions,
): Promise<AuthCacheEntry> {
  const isCurrent = options.isCurrent ?? (() => true);

  return tabFallbackGate.run(async () => {
    if (!isCurrent()) {
      return staleEntry();
    }

    let tabId: number | undefined;

    try {
      const tab = await browser.tabs.create({
        url,
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
      options.onTabCreated?.(tabId);

      const deadlineMs = Date.now() + TAB_LOAD_TIMEOUT_MS;
      await waitForTabComplete(tabId, remainingMs(deadlineMs));
      if (!isCurrent()) {
        return staleEntry();
      }

      const html = await settleAuthHtml({
        readHtml: () => readTabHtml(tabId!),
        waitForNextLoad: () =>
          waitForNextTabComplete(tabId!, remainingMs(deadlineMs)),
        isCurrent,
        deadlineMs,
      });
      if (!isCurrent()) {
        return staleEntry();
      }
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
        try {
          await browser.tabs.remove(tabId);
        } catch {
          // Tab may already be gone.
        }
      }
    }
  });
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

function staleEntry(): AuthCacheEntry {
  return {
    status: 'unknown',
    checkedAt: 0,
  };
}

function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
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

    browser.tabs
      .get(tabId)
      .then((tab) => {
        if (tab.status === 'complete') {
          cleanup();
          resolve();
        }
      })
      .catch((error: unknown) => {
        cleanup();
        reject(error);
      });
  });
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
