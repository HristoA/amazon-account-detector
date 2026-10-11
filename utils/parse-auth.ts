import type { ParseResult } from './auth-types';

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

/**
 * Heuristic parse of Amazon account-switcher / sign-in HTML.
 * Logged-in pages expose the account email; logged-out pages show the sign-in form.
 */
export function parseAuthHtml(html: string): ParseResult {
  const text = html.replace(/\0/g, '');

  const switcherEmail =
    matchAttr(text, /data-email=["']([^"']+)["']/i) ??
    matchAttr(text, /name=["']email["'][^>]*value=["']([^"']+)["']/i) ??
    matchAttr(
      text,
      /class=["'][^"']*cvf-account-switcher-profile-details[^"']*["'][^>]*>\s*([^<]*@[^<]*)/i,
    );

  const emailFromSwitcher = switcherEmail?.match(EMAIL_RE)?.[0];
  if (emailFromSwitcher) {
    return { kind: 'logged_in', email: emailFromSwitcher };
  }

  // Common account-list markup: <div class="a-row">email@example.com</div>
  const accountListMatch = text.match(
    /(?:ap_switch_account|account-switcher|cvf-account-switcher)[\s\S]{0,4000}?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i,
  );
  if (accountListMatch?.[1]) {
    return { kind: 'logged_in', email: accountListMatch[1] };
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

  const anyEmail = text.match(EMAIL_RE)?.[0];
  if (anyEmail && /switch.?account|account.?switcher/i.test(text)) {
    return { kind: 'logged_in', email: anyEmail };
  }

  return { kind: 'indeterminate' };
}

function matchAttr(html: string, re: RegExp): string | undefined {
  const m = html.match(re);
  return m?.[1]?.trim();
}
