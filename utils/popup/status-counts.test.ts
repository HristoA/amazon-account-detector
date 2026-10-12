import { describe, expect, it } from 'vitest';
import type { AuthCacheEntry } from '@/utils/auth/auth-types';
import { countStatuses } from './status-counts';

function entry(status: AuthCacheEntry['status']): AuthCacheEntry {
  return { status, checkedAt: 1 };
}

describe('countStatuses', () => {
  it('counts all / signed-in / signed-out / unknown', () => {
    expect(
      countStatuses(['a', 'b', 'c', 'd'], {
        a: entry('logged_in'),
        b: entry('logged_out'),
        c: entry('unknown'),
        // d missing → unknown
      }),
    ).toEqual({
      all: 4,
      logged_in: 1,
      logged_out: 1,
      unknown: 2,
    });
  });

  it('counts first-run seeds as signed out', () => {
    expect(
      countStatuses(['a', 'b'], {
        a: { status: 'logged_out', checkedAt: 0 },
        b: { status: 'logged_out', checkedAt: 0 },
      }),
    ).toEqual({
      all: 2,
      logged_in: 0,
      logged_out: 2,
      unknown: 0,
    });
  });
});
