import { describe, expect, it } from 'vitest';
import type { AuthCacheEntry } from '@/utils/auth/types/auth-types';
import {
  createSeedAuthEntry,
  isUnknownSkipOfDefinitive,
  seedMissingAuthEntries,
  shouldWriteAuthEntry,
} from './cache-entries';
import { AUTH_SESSION_MAX_AGE_MS } from './session-freshness';

describe('createSeedAuthEntry', () => {
  it('is signed out and never checked', () => {
    expect(createSeedAuthEntry()).toEqual({
      status: 'logged_out',
      checkedAt: 0,
    });
  });
});

describe('seedMissingAuthEntries', () => {
  it('seeds every missing marketplace as signed out', () => {
    const { cache, didSeed } = seedMissingAuthEntries({}, ['a', 'b']);
    expect(didSeed).toBe(true);
    expect(cache).toEqual({
      a: { status: 'logged_out', checkedAt: 0 },
      b: { status: 'logged_out', checkedAt: 0 },
    });
  });

  it('leaves existing entries untouched', () => {
    const existing = {
      a: {
        status: 'logged_in' as const,
        email: 'a@b.com',
        checkedAt: 99,
        source: 'fetch' as const,
      },
    };
    const { cache, didSeed } = seedMissingAuthEntries(existing, ['a', 'b']);
    expect(didSeed).toBe(true);
    expect(cache.a).toEqual(existing.a);
    expect(cache.b).toEqual({ status: 'logged_out', checkedAt: 0 });
  });

  it('is a no-op when every marketplace is already cached', () => {
    const existing = {
      a: { status: 'logged_out' as const, checkedAt: 1 },
    };
    const { cache, didSeed } = seedMissingAuthEntries(existing, ['a']);
    expect(didSeed).toBe(false);
    expect(cache).toBe(existing);
  });
});

const now = 10_000_000;

const loggedIn: AuthCacheEntry = {
  status: 'logged_in',
  email: 'a@b.com',
  checkedAt: now - 1_000,
  source: 'fetch',
};

const loggedOut: AuthCacheEntry = {
  status: 'logged_out',
  checkedAt: now - 1_000,
  source: 'fetch',
};

describe('shouldWriteAuthEntry', () => {
  it('rejects unknown when a fresh definitive entry already exists', () => {
    expect(
      shouldWriteAuthEntry(
        loggedIn,
        { status: 'unknown', checkedAt: now, source: 'tab' },
        now,
      ),
    ).toBe(false);
    expect(
      shouldWriteAuthEntry(
        loggedOut,
        { status: 'unknown', checkedAt: now, source: 'tab' },
        now,
      ),
    ).toBe(false);
  });

  it('allows unknown when the definitive entry is past the 1h window', () => {
    const stale: AuthCacheEntry = {
      status: 'logged_in',
      email: 'a@b.com',
      checkedAt: now - AUTH_SESSION_MAX_AGE_MS - 1,
      source: 'fetch',
    };
    expect(
      shouldWriteAuthEntry(
        stale,
        { status: 'unknown', checkedAt: now, source: 'tab' },
        now,
      ),
    ).toBe(true);
  });

  it('allows unknown when there is no prior definitive cache', () => {
    expect(
      shouldWriteAuthEntry(
        undefined,
        { status: 'unknown', checkedAt: now, source: 'tab' },
        now,
      ),
    ).toBe(true);
    expect(
      shouldWriteAuthEntry(
        { status: 'unknown', checkedAt: 50 },
        { status: 'unknown', checkedAt: now, source: 'tab' },
        now,
      ),
    ).toBe(true);
  });

  it('allows unknown over a never-checked first-run seed', () => {
    expect(
      shouldWriteAuthEntry(
        { status: 'logged_out', checkedAt: 0 },
        { status: 'unknown', checkedAt: now, source: 'tab' },
        now,
      ),
    ).toBe(true);
  });

  it('allows definitive logged_in and logged_out writes', () => {
    expect(shouldWriteAuthEntry(loggedIn, loggedOut, now)).toBe(true);
    expect(shouldWriteAuthEntry(loggedOut, loggedIn, now)).toBe(true);
    expect(shouldWriteAuthEntry(undefined, loggedIn, now)).toBe(true);
  });
});

describe('isUnknownSkipOfDefinitive', () => {
  it('is true only for unknown over a still-fresh logged_in / logged_out', () => {
    expect(
      isUnknownSkipOfDefinitive(
        loggedIn,
        { status: 'unknown', checkedAt: now },
        now,
      ),
    ).toBe(true);
    expect(
      isUnknownSkipOfDefinitive(
        {
          status: 'logged_in',
          email: 'a@b.com',
          checkedAt: now - AUTH_SESSION_MAX_AGE_MS - 1,
        },
        { status: 'unknown', checkedAt: now },
        now,
      ),
    ).toBe(false);
    expect(
      isUnknownSkipOfDefinitive(
        undefined,
        { status: 'unknown', checkedAt: now },
        now,
      ),
    ).toBe(false);
    expect(isUnknownSkipOfDefinitive(loggedIn, loggedOut, now)).toBe(false);
    expect(
      isUnknownSkipOfDefinitive(
        { status: 'logged_out', checkedAt: 0 },
        { status: 'unknown', checkedAt: now },
        now,
      ),
    ).toBe(false);
  });
});
