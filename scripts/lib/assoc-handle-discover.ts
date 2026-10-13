import { isAwsWafChallengeHtml } from '../../utils/auth/detect/parse-auth';

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

/**
 * Match `openid.assoc_handle` after HTML/URL decoding of the separator.
 * Amazon often HTML-escapes `=` as `&#061;` (and `%` as `&#037;`) in attributes.
 */
const ASSOC_HANDLE_RE = /openid\.assoc_handle(?:=|%3D)([a-zA-Z0-9_]+)/gi;

/**
 * Normalize separators Amazon embeds in HTML so the assoc_handle regex can match.
 * Decodes numeric/named entities for `=` and `%` (used before `%3D`).
 */
export function normalizeAssocHandleHtml(html: string): string {
  return html
    .replace(/&#0*61;/gi, '=')
    .replace(/&#x0*3d;/gi, '=')
    .replace(/&equals;/gi, '=')
    .replace(/&#0*37;/gi, '%')
    .replace(/&#x0*25;/gi, '%');
}

/** Captcha / soft-block interstitials that may echo the probe URL once. */
export function isAssocHandleSoftBlockHtml(html: string): boolean {
  return (
    /validateCaptcha/i.test(html) ||
    /Sorry!\s*Something went wrong/i.test(html) ||
    /Click the button below to continue shopping/i.test(html)
  );
}

/**
 * Real sign-in / claim UI (not a bare probe-URL echo on an interstitial).
 * Wrong handles typically 404; accepted handles land on pages with these signals.
 */
export function looksLikeAmazonAuthPage(
  html: string,
  expectedHandle: string,
): boolean {
  const normalized = normalizeAssocHandleHtml(html);
  return (
    /id=["']ap_email["']/i.test(html) ||
    /name=["']email["']/i.test(html) ||
    /id=["']ap_password["']/i.test(html) ||
    /name=["']password["']/i.test(html) ||
    /id=["']ap_login_form["']/i.test(html) ||
    new RegExp(`pageId=${expectedHandle}\\b`, 'i').test(normalized) ||
    /ap_switch_account|ap-account-switcher|cvf-account-switcher/i.test(html)
  );
}

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

function countAssocHandles(html: string): Map<string, number> {
  const normalized = normalizeAssocHandleHtml(html);
  const counts = new Map<string, number>();
  for (const match of normalized.matchAll(ASSOC_HANDLE_RE)) {
    const handle = match[1];
    if (!handle) continue;
    counts.set(handle, (counts.get(handle) ?? 0) + 1);
  }
  return counts;
}

/**
 * Classify a sign-in URL probe built with the marketplace’s declared handle.
 *
 * Amazon currently accepts a valid handle with HTTP 200 (sign-in form) and
 * rejects an invalid one with HTTP 404. The probe URL may appear only once in
 * the body (often HTML-entity-encoded); that single echo is enough when the
 * page looks like real auth UI. Soft-block / captcha pages that echo the URL
 * are `blocked`, not `match`.
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
    isAwsWafChallengeHtml(probe.html) ||
    isAssocHandleSoftBlockHtml(probe.html)
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
    if (!looksLikeAmazonAuthPage(probe.html, expected)) {
      // Echo on a non-auth page — not enough to confirm acceptance.
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
