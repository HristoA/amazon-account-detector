import type { AuthCacheEntry } from '@/utils/auth/auth-types';

/** Email line for a market card; hyphen when not signed in or email unknown. */
export function displayMarketEmail(entry: AuthCacheEntry | undefined): string {
  if (entry?.status === 'logged_in' && entry.email) {
    return entry.email;
  }
  return '-';
}
