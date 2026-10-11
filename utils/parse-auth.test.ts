import { describe, expect, it } from 'vitest';
import { parseAuthHtml } from './parse-auth';

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
});
