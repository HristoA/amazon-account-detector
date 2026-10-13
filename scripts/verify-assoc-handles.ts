/**
 * Offline verifier: hit each marketplace sign-in URL (with the declared
 * openid.assoc_handle), scrape the handle from the response, and diff against
 * MARKETPLACES.
 *
 * 1. curl (fast) — works for most storefronts
 * 2. Playwright Chromium fallback for `blocked` (WAF/5xx) and `missing`
 *    (timeouts, empty extract, request errors) — runs challenge.js
 *
 * Caveat: the probe URL includes the declared handle and may appear only once
 * in the body (often as HTML entities like &#061;). A match requires that echo
 * plus real auth UI (email/password form or pageId). Invalid handles typically
 * 404 (`rejected`). Soft-block/captcha pages are `blocked`. Exit 0 is a
 * practical consistency check, not cryptographic proof.
 *
 * Usage: pnpm verify:assoc-handles
 * Requires: curl, and Playwright Chromium (`pnpm exec playwright install chromium`)
 *
 * Exit 0 only when every marketplace matched.
 * mismatch / rejected / blocked / missing → exit 1.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  diffAssocHandles,
  formatAssocHandleDiffReport,
  needsBrowserWafFallback,
  summarizeAssocHandleDiff,
  type AssocHandleProbe,
} from './lib/assoc-handle-discover';
import {
  buildSignInUrl,
  getMarketplace,
  MARKETPLACES,
} from '../utils/marketplace/marketplaces';
import { Semaphore } from '../utils/auth/detect/semaphore';
import {
  fetchSignInWithBrowser,
  withBrowser,
} from './verify-assoc-handles-browser';

const execFileAsync = promisify(execFile);

const FETCH_CONCURRENCY = 3;
const FETCH_TIMEOUT_MS = 20_000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
const STATUS_MARKER = '__HTTP_STATUS__:';

async function fetchSignInWithCurl(url: string): Promise<AssocHandleProbe> {
  try {
    const { stdout } = await execFileAsync(
      'curl',
      [
        '-sL',
        '--compressed',
        '--max-time',
        String(Math.ceil(FETCH_TIMEOUT_MS / 1000)),
        '-A',
        USER_AGENT,
        '-H',
        'Accept: text/html,application/xhtml+xml',
        '-H',
        'Accept-Language: en-US,en;q=0.9',
        '-w',
        `\n${STATUS_MARKER}%{http_code}`,
        url,
      ],
      {
        maxBuffer: 12 * 1024 * 1024,
        timeout: FETCH_TIMEOUT_MS + 5_000,
      },
    );

    const markerIndex = stdout.lastIndexOf(STATUS_MARKER);
    if (markerIndex === -1) {
      return { httpStatus: null, html: null };
    }
    const html = stdout.slice(0, markerIndex).replace(/\n$/, '');
    const statusText = stdout.slice(markerIndex + STATUS_MARKER.length).trim();
    const httpStatus = Number.parseInt(statusText, 10);
    if (!Number.isFinite(httpStatus)) {
      return { httpStatus: null, html: null };
    }
    return { httpStatus, html };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`curl failed for ${url}: ${message}`);
    return { httpStatus: null, html: null };
  }
}

function probeHint(probe: AssocHandleProbe): string {
  if (probe.httpStatus == null) {
    return 'error';
  }
  return `HTTP ${probe.httpStatus}, ${probe.html?.length ?? 0} bytes`;
}

async function main(): Promise<number> {
  const gate = new Semaphore(FETCH_CONCURRENCY);
  const probes = new Map<string, AssocHandleProbe>();

  console.log(
    `Probing ${MARKETPLACES.length} marketplace sign-in URLs via curl (concurrency ${FETCH_CONCURRENCY})…`,
  );

  await Promise.all(
    MARKETPLACES.map((marketplace) =>
      gate.run(async () => {
        const url = buildSignInUrl(marketplace);
        const probe = await fetchSignInWithCurl(url);
        probes.set(marketplace.id, probe);
        console.log(`  ${marketplace.id}: ${probeHint(probe)}`);
      }),
    ),
  );

  let rows = diffAssocHandles(MARKETPLACES, probes);
  const retryIds = rows
    .filter((row) => needsBrowserWafFallback(row.status))
    .map((row) => row.marketplaceId);

  if (retryIds.length > 0) {
    console.log('');
    console.log(
      `Blocked/missing on ${retryIds.length} marketplace(s) — retrying in Chromium…`,
    );
    try {
      await withBrowser(async (browser) => {
        for (const id of retryIds) {
          const marketplace = getMarketplace(id);
          if (!marketplace) continue;
          const url = buildSignInUrl(marketplace);
          const probe = await fetchSignInWithBrowser(browser, url);
          // Keep the curl probe if the browser path hard-failed.
          if (probe.html != null) {
            probes.set(id, probe);
          }
          console.log(`  ${id} (browser): ${probeHint(probe)}`);
        }
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `Browser fallback failed to start (${message}). Install Chromium with: pnpm exec playwright install chromium`,
      );
    }
    rows = diffAssocHandles(MARKETPLACES, probes);
  }

  const summary = summarizeAssocHandleDiff(rows);

  console.log('');
  console.log(formatAssocHandleDiffReport(rows));
  console.log('');
  console.log(
    `Summary: ${summary.matches} match, ${summary.mismatches} mismatch, ${summary.rejected} rejected, ${summary.blocked} blocked, ${summary.missing} missing`,
  );

  if (summary.ok) {
    console.log('All assoc_handle values match MARKETPLACES.');
    return 0;
  }

  if (summary.mismatches > 0 || summary.rejected > 0) {
    console.error(
      'Update utils/marketplace/marketplaces.ts assocHandle fields for mismatch/rejected rows.',
    );
  }
  if (summary.blocked > 0) {
    console.error(
      'Still blocked after Chromium fallback (WAF did not clear). Retry later or from another network.',
    );
  }
  if (summary.missing > 0) {
    console.error(
      'Missing rows had no extractable handle (odd HTML, timeout, request error, or only a single probe-URL echo).',
    );
  }
  return 1;
}

const code = await main();
process.exit(code);
