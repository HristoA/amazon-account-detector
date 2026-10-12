import type { AuthByMarketplace } from './auth-types';

/**
 * How long a verified signed-in / signed-out result may be kept as last-known
 * when later checks fail. After this, demote to `unknown`.
 */
export const AUTH_SESSION_MAX_AGE_MS = 60 * 60 * 1000;

/** True when `checkedAt` is still within the session window. */
export function isAuthSessionFresh(
  checkedAt: number,
  now: number = Date.now(),
): boolean {
  return checkedAt > 0 && now - checkedAt < AUTH_SESSION_MAX_AGE_MS;
}

/**
 * Demote definitive entries whose last successful check is older than the
 * session window to `unknown` (clears email / lastKnown).
 */
export function expireStaleAuthEntries(
  cache: AuthByMarketplace,
  now: number = Date.now(),
): { cache: AuthByMarketplace; didExpire: boolean } {
  let didExpire = false;
  const next: AuthByMarketplace = { ...cache };

  for (const [id, entry] of Object.entries(cache)) {
    if (!entry) continue;
    if (entry.status !== 'logged_in' && entry.status !== 'logged_out') {
      continue;
    }
    if (isAuthSessionFresh(entry.checkedAt, now)) {
      continue;
    }
    // Never-checked seeds (checkedAt 0) — leave them until a real check.
    if (entry.checkedAt <= 0) {
      continue;
    }
    next[id] = {
      status: 'unknown',
      checkedAt: entry.checkedAt,
      source: entry.source,
    };
    didExpire = true;
  }

  return { cache: didExpire ? next : cache, didExpire };
}
