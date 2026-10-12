import { describe, expect, it } from 'vitest';
import { displayMarketEmail } from './market-card-display';

describe('displayMarketEmail', () => {
  it('returns the email when logged in with an email', () => {
    expect(
      displayMarketEmail({
        status: 'logged_in',
        email: 'user@example.com',
        checkedAt: 1,
      }),
    ).toBe('user@example.com');
  });

  it('returns "-" when logged in without an email', () => {
    expect(displayMarketEmail({ status: 'logged_in', checkedAt: 1 })).toBe('-');
  });

  it('returns "-" when logged out or unknown', () => {
    expect(displayMarketEmail({ status: 'logged_out', checkedAt: 1 })).toBe(
      '-',
    );
    expect(displayMarketEmail({ status: 'unknown', checkedAt: 1 })).toBe('-');
    expect(displayMarketEmail(undefined)).toBe('-');
  });
});
