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
});
