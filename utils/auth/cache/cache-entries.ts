import type {
  AuthByMarketplace,
  AuthCacheEntry,
} from '@/utils/auth/types/auth-types';
import { isAuthSessionFresh } from './session-freshness';

/** Placeholder before a real check — signed out, never verified. */
export function createSeedAuthEntry(): AuthCacheEntry {
  return { status: 'logged_out', checkedAt: 0 };
}

/**
 * Fill missing marketplace ids as signed-out so first-run UI has a concrete
 * default. Existing entries unchanged. `checkedAt: 0` marks never-checked.
 */
export function seedMissingAuthEntries(
  cache: AuthByMarketplace,
  marketplaceIds: readonly string[],
): { cache: AuthByMarketplace; didSeed: boolean } {
  let didSeed = false;
  const next: AuthByMarketplace = { ...cache };

  for (const id of marketplaceIds) {
    if (next[id] != null) continue;
    next[id] = createSeedAuthEntry();
    didSeed = true;
  }

  return { cache: didSeed ? next : cache, didSeed };
}

/**
 * True when `next` is indeterminate and must not replace a still-fresh
 * definitive logged_in / logged_out cache entry (keeps email, marks last-known).
 * Past the session window, unknown is allowed to overwrite.
 */
export function isUnknownSkipOfDefinitive(
  previous: AuthCacheEntry | undefined,
  next: AuthCacheEntry,
  now: number = Date.now(),
): boolean {
  if (
    next.status !== 'unknown' ||
    previous == null ||
    (previous.status !== 'logged_in' && previous.status !== 'logged_out')
  ) {
    return false;
  }
  // Never-checked placeholders (checkedAt 0) are not verified results to protect.
  if (previous.checkedAt <= 0) {
    return false;
  }
  return isAuthSessionFresh(previous.checkedAt, now);
}

/**
 * Whether a detection result should replace the cached entry.
 * Fresh definitive results are protected from indeterminate `unknown`;
 * after the session window, unknown may overwrite.
 */
export function shouldWriteAuthEntry(
  previous: AuthCacheEntry | undefined,
  next: AuthCacheEntry,
  now: number = Date.now(),
): boolean {
  if (isUnknownSkipOfDefinitive(previous, next, now)) {
    return false;
  }
  return true;
}
