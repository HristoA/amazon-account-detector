import { describe, expect, it } from 'vitest';
import { isAwsWafChallengeHtml, parseAuthHtml } from './parse-auth';

describe('parseAuthHtml', () => {
  it('detects logged-in email from account switcher markup', () => {
    const html = `
      <div class="cvf-account-switcher">
        <div data-email="user@example.com">user@example.com</div>
      </div>
    `;
    expect(parseAuthHtml(html)).toEqual({
      kind: 'logged_in',
      email: 'user@example.com',
    });
  });

  it('detects logged-out sign-in form', () => {
    const html = `
      <form id="ap_login_form" action="/ap/signin">
        <input id="ap_email" name="email" value="" />
        <input id="ap_password" name="password" />
      </form>
    `;
    expect(parseAuthHtml(html)).toEqual({ kind: 'logged_out' });
  });

  it('returns indeterminate for unrelated HTML', () => {
    expect(parseAuthHtml('<html><body>Hello</body></html>')).toEqual({
      kind: 'indeterminate',
    });
  });

  it('returns indeterminate for AWS WAF challenge interstitial', () => {
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <script>window.gokuProps = { "key": "x" };</script>
        <script src="https://example.awswaf.com/challenge.js"></script>
      </head>
      <body>
        <div id="challenge-container"></div>
        <script>AwsWafIntegration.getToken().then(() => window.location.reload(true));</script>
        <noscript>
          <h1>JavaScript is disabled</h1>
          In order to continue, we need to verify that you're not a robot.
        </noscript>
      </body>
      </html>
    `;
    expect(parseAuthHtml(html)).toEqual({ kind: 'indeterminate' });
    expect(isAwsWafChallengeHtml(html)).toBe(true);
  });

  it('does not treat a normal sign-in page as a WAF challenge', () => {
    const html = `
      <form id="ap_login_form" action="/ap/signin">
        <input id="ap_email" name="email" value="" />
        <input id="ap_password" name="password" />
      </form>
    `;
    expect(isAwsWafChallengeHtml(html)).toBe(false);
  });
});
