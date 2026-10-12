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

  it('uses the first data-email when multiple switcher accounts exist', () => {
    const html = `
      <div class="cvf-account-switcher">
        <div data-email="active@example.com">active@example.com</div>
        <div data-email="other@example.com">other@example.com</div>
      </div>
    `;
    expect(parseAuthHtml(html)).toEqual({
      kind: 'logged_in',
      email: 'active@example.com',
    });
  });

  it('does not treat marketing copy with an email as logged in', () => {
    const html = `
      <html><body>
        <p>Switch account anytime. Contact support@amazon.com for help.</p>
        <a href="/gp/switch-account">Switch account</a>
      </body></html>
    `;
    expect(parseAuthHtml(html)).toEqual({ kind: 'indeterminate' });
  });

  it('does not treat bare data-email without switcher tokens as logged in', () => {
    const html = `
      <html><body>
        <div data-email="promo@example.com">Sign in with promo@example.com</div>
      </body></html>
    `;
    expect(parseAuthHtml(html)).toEqual({ kind: 'indeterminate' });
  });

  it('reads email from profile-details switcher markup', () => {
    const html = `
      <div class="cvf-account-switcher-profile-details">user@example.com</div>
    `;
    expect(parseAuthHtml(html)).toEqual({
      kind: 'logged_in',
      email: 'user@example.com',
    });
  });

  it('reads nested email under profile-details / a-row (real Amazon layout)', () => {
    const html = `
      <div id="ap-account-switcher-container">
        <div class="cvf-account-switcher">
          <div class="cvf-account-switcher-profile-details a-text-center">
            <div class="a-row">Jane Doe</div>
            <div class="a-row">jane@example.com</div>
          </div>
        </div>
      </div>
    `;
    expect(parseAuthHtml(html)).toEqual({
      kind: 'logged_in',
      email: 'jane@example.com',
    });
  });

  it('reads email near ap_switch_account without data-email', () => {
    const html = `
      <div id="ap_switch_account_panel">
        <div class="a-row">user@example.com</div>
      </div>
    `;
    expect(parseAuthHtml(html)).toEqual({
      kind: 'logged_in',
      email: 'user@example.com',
    });
  });

  it('reads named email value when switcher tokens are present', () => {
    const html = `
      <div class="cvf-account-switcher"></div>
      <input name="email" value="continue@example.com" />
    `;
    expect(parseAuthHtml(html)).toEqual({
      kind: 'logged_in',
      email: 'continue@example.com',
    });
  });
});
