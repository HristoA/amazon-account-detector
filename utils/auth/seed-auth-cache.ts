import type { AuthByMarketplace, AuthCacheEntry } from './auth-types';

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
