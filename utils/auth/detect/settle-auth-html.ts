import { isAwsWafChallengeHtml } from './parse-auth';

export interface SettleAuthHtmlOptions {
  readHtml: () => Promise<string>;
  /** Wait for the next navigation complete (not the current one). */
  waitForNextLoad: () => Promise<void>;
  deadlineMs: number;
  now?: () => number;
}

/**
 * Re-read tab HTML until the AWS WAF challenge interstitial is gone, or time out.
 */
export async function settleAuthHtml(
  options: SettleAuthHtmlOptions,
): Promise<string> {
  const now = options.now ?? Date.now;
  let html = await options.readHtml();

  while (isAwsWafChallengeHtml(html)) {
    if (now() >= options.deadlineMs) {
      return html;
    }
    try {
      await options.waitForNextLoad();
    } catch {
      return html;
    }
    html = await options.readHtml();
  }

  return html;
}
