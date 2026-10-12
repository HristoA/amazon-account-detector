/**
 * Browser fallback for AWS WAF: load the sign-in URL in Chromium so
 * challenge.js can run (same idea as the extension’s inactive-tab path).
 */
import { chromium, type Browser, type Page } from 'playwright';
import { isAwsWafChallengeHtml } from '../utils/auth/parse-auth';
import {
  extractAssocHandleFromHtml,
  type AssocHandleProbe,
} from './lib/assoc-handle-discover';

const BROWSER_TIMEOUT_MS = 60_000;
const POLL_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function withBrowser<T>(
  fn: (browser: Browser) => Promise<T>,
): Promise<T> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

async function readPageHtml(page: Page): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      await page
        .waitForLoadState('domcontentloaded', { timeout: 2_000 })
        .catch(() => undefined);
      return await page.content();
    } catch {
      // Mid-navigation (WAF reload) — brief wait and retry.
      await sleep(POLL_MS);
    }
  }
  return '';
}

/**
 * Navigate to the sign-in URL, wait out WAF / claim redirects, then return
 * HTML once an assoc_handle appears or the deadline hits.
 */
export async function fetchSignInWithBrowser(
  browser: Browser,
  url: string,
): Promise<AssocHandleProbe> {
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    locale: 'en-US',
  });
  const page = await context.newPage();
  const deadlineMs = Date.now() + BROWSER_TIMEOUT_MS;

  try {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: BROWSER_TIMEOUT_MS,
    });
    let lastStatus = response?.status() ?? null;

    page.on('response', (res) => {
      if (res.request().resourceType() === 'document') {
        lastStatus = res.status();
      }
    });

    let html = await readPageHtml(page);
    while (Date.now() < deadlineMs) {
      if (
        !isAwsWafChallengeHtml(html) &&
        extractAssocHandleFromHtml(html) != null
      ) {
        return { httpStatus: 200, html };
      }
      await sleep(POLL_MS);
      html = await readPageHtml(page);
    }

    if (isAwsWafChallengeHtml(html)) {
      return { httpStatus: lastStatus ?? 202, html };
    }

    // Settled past WAF but no handle — still return HTML for classification.
    return { httpStatus: lastStatus ?? 200, html };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`browser probe failed for ${url}: ${message}`);
    return { httpStatus: null, html: null };
  } finally {
    await context.close();
  }
}
