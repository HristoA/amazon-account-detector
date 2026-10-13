import { describe, expect, it } from 'vitest';
import {
  AUTH_SESSION_MAX_AGE_MS,
  expireStaleAuthEntries,
  isAuthSessionFresh,
} from './session-freshness';

describe('isAuthSessionFresh', () => {
  const now = 10_000_000;

  it('is true within the 1h window', () => {
    expect(isAuthSessionFresh(now - AUTH_SESSION_MAX_AGE_MS + 1, now)).toBe(
      true,
    );
  });

  it('is false at or past the 1h window', () => {
    expect(isAuthSessionFresh(now - AUTH_SESSION_MAX_AGE_MS, now)).toBe(false);
    expect(isAuthSessionFresh(now - AUTH_SESSION_MAX_AGE_MS - 1, now)).toBe(
      false,
    );
  });

  it('is false for never-checked seeds', () => {
    expect(isAuthSessionFresh(0, now)).toBe(false);
  });
});

describe('expireStaleAuthEntries', () => {
  const now = 10_000_000;

  it('demotes stale signed-in / signed-out to unknown', () => {
    const { cache, didExpire } = expireStaleAuthEntries(
      {
        'amazon.com': {
          status: 'logged_in',
          email: 'a@b.com',
          checkedAt: now - AUTH_SESSION_MAX_AGE_MS - 1,
          lastKnown: true,
          source: 'fetch',
        },
        'amazon.de': {
          status: 'logged_out',
          checkedAt: now - 1,
          source: 'fetch',
        },
      },
      now,
    );

    expect(didExpire).toBe(true);
    expect(cache['amazon.com']).toEqual({
      status: 'unknown',
      checkedAt: now - AUTH_SESSION_MAX_AGE_MS - 1,
      source: 'fetch',
    });
    expect(cache['amazon.de']?.status).toBe('logged_out');
  });

  it('leaves seeds and fresh entries alone', () => {
    const input = {
      'amazon.com': { status: 'logged_out' as const, checkedAt: 0 },
      'amazon.de': {
        status: 'logged_in' as const,
        email: 'a@b.com',
        checkedAt: now - 1_000,
      },
    };
    const { cache, didExpire } = expireStaleAuthEntries(input, now);
    expect(didExpire).toBe(false);
    expect(cache).toEqual(input);
  });
});
