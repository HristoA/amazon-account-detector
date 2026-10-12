import { isAwsWafChallengeHtml } from '../../utils/auth/parse-auth';

export type AssocHandleDiffStatus =
  'match' | 'mismatch' | 'missing' | 'blocked' | 'rejected';

export interface AssocHandleDiffRow {
  marketplaceId: string;
  expected: string;
  discovered: string | null;
  status: AssocHandleDiffStatus;
}

export interface AssocHandleProbe {
  /** HTTP status after redirects, or null if the request failed. */
  httpStatus: number | null;
  html: string | null;
}

const ASSOC_HANDLE_RE = /openid\.assoc_handle(?:=|%3D)([a-zA-Z0-9_]+)/gi;

/**
 * Minimum times the expected handle must appear in HTML to count as `match`.
 * A single hit is often just the probe URL echoed into the page (circular).
 * Real sign-in / switcher markup repeats the handle in multiple links/forms.
 */
const MIN_MATCH_HANDLE_OCCURRENCES = 2;

/**
 * Pull the most likely `openid.assoc_handle` from Amazon HTML
 * (homepage nav links or sign-in / claim form actions).
 * When several values appear, prefer the most frequent one.
 */
export function extractAssocHandleFromHtml(html: string): string | undefined {
  const counts = countAssocHandles(html);
  if (counts.size === 0) {
    return undefined;
  }

  let best: string | undefined;
  let bestCount = -1;
  for (const [handle, count] of counts) {
    if (count > bestCount) {
      best = handle;
      bestCount = count;
    }
  }
  return best;
}

function countAssocHandleOccurrences(html: string, handle: string): number {
  return countAssocHandles(html).get(handle) ?? 0;
}

function countAssocHandles(html: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const match of html.matchAll(ASSOC_HANDLE_RE)) {
    const handle = match[1];
    if (!handle) continue;
    counts.set(handle, (counts.get(handle) ?? 0) + 1);
  }
  return counts;
}

/**
 * Classify a sign-in URL probe built with the marketplace’s declared handle.
 *
 * Caveat: the probe URL includes `expected`, and Amazon may echo that query
 * into HTML. A single occurrence of `expected` is treated as `missing` (not
 * `match`). `rejected` (404) and `mismatch` (a different handle dominates)
 * are the strong failure signals.
 */
export function classifyAssocHandleProbe(
  expected: string,
  probe: AssocHandleProbe,
): Pick<AssocHandleDiffRow, 'discovered' | 'status'> {
  if (probe.httpStatus == null || probe.html == null) {
    return { discovered: null, status: 'missing' };
  }

  if (
    probe.httpStatus === 202 ||
    probe.httpStatus >= 500 ||
    isAwsWafChallengeHtml(probe.html)
  ) {
    return { discovered: null, status: 'blocked' };
  }

  if (probe.httpStatus === 404) {
    return { discovered: null, status: 'rejected' };
  }

  const discovered = extractAssocHandleFromHtml(probe.html) ?? null;
  if (discovered == null) {
    return { discovered: null, status: 'missing' };
  }
  if (discovered === expected) {
    const occurrences = countAssocHandleOccurrences(probe.html, expected);
    if (occurrences < MIN_MATCH_HANDLE_OCCURRENCES) {
      // Likely only the probe URL echoed back — not enough to confirm.
      return { discovered: null, status: 'missing' };
    }
    return { discovered, status: 'match' };
  }
  return { discovered, status: 'mismatch' };
}

export function diffAssocHandles(
  marketplaces: readonly { id: string; assocHandle: string }[],
  probesById: ReadonlyMap<string, AssocHandleProbe>,
): AssocHandleDiffRow[] {
  return marketplaces.map((marketplace) => {
    const probe = probesById.get(marketplace.id) ?? {
      httpStatus: null,
      html: null,
    };
    const classified = classifyAssocHandleProbe(marketplace.assocHandle, probe);
    return {
      marketplaceId: marketplace.id,
      expected: marketplace.assocHandle,
      ...classified,
    };
  });
}

export interface AssocHandleDiffSummary {
  matches: number;
  mismatches: number;
  missing: number;
  blocked: number;
  rejected: number;
  /** True when every marketplace matched. */
  ok: boolean;
}

export function summarizeAssocHandleDiff(
  rows: readonly AssocHandleDiffRow[],
): AssocHandleDiffSummary {
  let matches = 0;
  let mismatches = 0;
  let missing = 0;
  let blocked = 0;
  let rejected = 0;
  for (const row of rows) {
    if (row.status === 'match') matches += 1;
    else if (row.status === 'mismatch') mismatches += 1;
    else if (row.status === 'blocked') blocked += 1;
    else if (row.status === 'rejected') rejected += 1;
    else missing += 1;
  }
  return {
    matches,
    mismatches,
    missing,
    blocked,
    rejected,
    ok: mismatches === 0 && missing === 0 && blocked === 0 && rejected === 0,
  };
}

/** Tabular report for CLI / logs. */
export function formatAssocHandleDiffReport(
  rows: readonly AssocHandleDiffRow[],
): string {
  const header = ['status', 'marketplace', 'expected', 'discovered'].join('\t');
  const lines = rows.map((row) =>
    [
      row.status,
      row.marketplaceId,
      row.expected,
      row.discovered ?? '(none)',
    ].join('\t'),
  );
  return [header, ...lines].join('\n');
}

/**
 * Curl/fetch outcomes worth retrying in Chromium (challenge.js / latency).
 * Includes `missing` (timeouts, empty extract, request errors) — not only WAF.
 */
export function needsBrowserWafFallback(
  status: AssocHandleDiffStatus,
): boolean {
  return status === 'blocked' || status === 'missing';
}
