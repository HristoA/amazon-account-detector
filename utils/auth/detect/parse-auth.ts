import type { ParseResult } from '@/utils/auth/types/auth-types';

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

/** Tokens that identify Amazon account-switcher UI (not marketing “Switch account” copy). */
export const SWITCHER_TOKEN_RE =
  /ap_switch_account|ap-account-switcher|cvf-account-switcher|account-switcher/i;

/**
 * AWS WAF bot interstitial Amazon serves before some marketplace sign-in pages.
 * Fetch gets this HTML; a real tab runs challenge.js then reloads to the real page.
 */
export function isAwsWafChallengeHtml(html: string): boolean {
  return (
    /AwsWafIntegration/i.test(html) ||
    /awswaf\.com/i.test(html) ||
    /\bgokuProps\b/.test(html) ||
    /id=["']challenge-container["']/i.test(html)
  );
}

/**
 * Heuristic parse of Amazon account-switcher / sign-in HTML.
 * Prefer structured switcher attributes; also accept emails near switcher tokens
 * (Amazon nests emails under profile-details / a-row without `data-email`).
 */
export function parseAuthHtml(html: string): ParseResult {
  const text = html.replace(/\0/g, '');

  const structured = extractSwitcherEmail(text);
  if (structured) {
    return { kind: 'logged_in', email: structured };
  }

  const hasPasswordField =
    /name=["']password["']/i.test(text) || /id=["']ap_password["']/i.test(text);
  const hasEmailField =
    /name=["']email["']/i.test(text) || /id=["']ap_email["']/i.test(text);
  const hasSignInForm =
    /id=["']ap_login_form["']/i.test(text) ||
    /action=["'][^"']*\/ap\/signin/i.test(text);

  if ((hasPasswordField && hasEmailField) || hasSignInForm) {
    // Empty email value on login form → not logged in
    const prefilled = matchAttr(
      text,
      /id=["']ap_email["'][^>]*value=["']([^"']*)["']/i,
    );
    if (prefilled && EMAIL_RE.test(prefilled)) {
      // Challenge / continue-as page can still mean an active session context;
      // without switcher UI treat as indeterminate so tab fallback can run.
      return { kind: 'indeterminate' };
    }
    return { kind: 'logged_out' };
  }

  return { kind: 'indeterminate' };
}

/**
 * Emails from dedicated account-switcher markup.
 * Rejects marketing pages that only mention “switch account” in copy.
 */
function extractSwitcherEmail(html: string): string | undefined {
  // Require switcher tokens — bare data-email on marketing pages is not enough.
  if (SWITCHER_TOKEN_RE.test(html)) {
    const dataEmails = [...html.matchAll(/data-email=["']([^"']+)["']/gi)]
      .map((m) => m[1]?.match(EMAIL_RE)?.[0])
      .filter((email): email is string => Boolean(email));
    if (dataEmails[0]) {
      return dataEmails[0];
    }
  }

  // Continue-as / switcher often expose the address as a named email value.
  const namedEmail = matchAttr(
    html,
    /name=["']email["'][^>]*value=["']([^"']+)["']/i,
  );
  const fromNamed = namedEmail?.match(EMAIL_RE)?.[0];
  if (fromNamed && SWITCHER_TOKEN_RE.test(html)) {
    return fromNamed;
  }

  // Nested profile-details: email may be in a child a-row, not immediate text.
  const profileWindow = html.match(
    /cvf-account-switcher-profile-details[\s\S]{0,800}?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i,
  );
  if (profileWindow?.[1]) {
    return profileWindow[1];
  }

  // Common account-list markup: switcher token, then email within a bounded window.
  // Do not require a matching closing tag — Amazon nests many layers of divs.
  const accountListMatch = html.match(
    /(?:ap_switch_account|ap-account-switcher|cvf-account-switcher|account-switcher)[\s\S]{0,4000}?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i,
  );
  if (accountListMatch?.[1]) {
    return accountListMatch[1];
  }

  return undefined;
}

function matchAttr(html: string, re: RegExp): string | undefined {
  const m = html.match(re);
  return m?.[1]?.trim();
}
