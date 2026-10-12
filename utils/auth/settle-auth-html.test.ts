import { describe, expect, it, vi } from 'vitest';
import { settleAuthHtml } from './settle-auth-html.ts';

const wafHtml = `
  <div id="challenge-container"></div>
  <script>AwsWafIntegration.getToken()</script>
`;

const signInHtml = `
  <form id="ap_login_form" action="/ap/signin">
    <input id="ap_email" name="email" value="" />
    <input id="ap_password" name="password" />
  </form>
`;

describe('settleAuthHtml', () => {
  it('returns immediately when HTML is not a WAF challenge', async () => {
    const waitForNextLoad = vi.fn();
    const html = await settleAuthHtml({
      readHtml: async () => signInHtml,
      waitForNextLoad,
      deadlineMs: Date.now() + 5_000,
    });
    expect(html).toBe(signInHtml);
    expect(waitForNextLoad).not.toHaveBeenCalled();
  });

  it('waits through a WAF challenge until the real page loads', async () => {
    let reads = 0;
    const waitForNextLoad = vi.fn(async () => undefined);
    const html = await settleAuthHtml({
      readHtml: async () => {
        reads += 1;
        return reads === 1 ? wafHtml : signInHtml;
      },
      waitForNextLoad,
      deadlineMs: Date.now() + 5_000,
    });
    expect(html).toBe(signInHtml);
    expect(waitForNextLoad).toHaveBeenCalledTimes(1);
    expect(reads).toBe(2);
  });

  it('stops waiting when the deadline is reached', async () => {
    let now = 1_000;
    const waitForNextLoad = vi.fn(async () => {
      now = 2_000;
    });
    const html = await settleAuthHtml({
      readHtml: async () => wafHtml,
      waitForNextLoad,
      deadlineMs: 1_500,
      now: () => now,
    });
    expect(html).toBe(wafHtml);
    expect(waitForNextLoad).toHaveBeenCalledTimes(1);
  });
});
