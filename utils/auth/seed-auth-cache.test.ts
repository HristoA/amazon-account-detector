import { describe, expect, it } from 'vitest';
import { createSeedAuthEntry, seedMissingAuthEntries } from './seed-auth-cache';

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
