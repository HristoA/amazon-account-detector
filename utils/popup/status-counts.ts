import type { AuthCacheEntry } from '@/utils/auth/auth-types';
import { resolveFilterStatus, type StatusFilter } from './status-filter';

export type StatusCounts = Record<StatusFilter, number>;

/** Count marketplaces by resolved auth status for the filter strip. */
export function countStatuses(
  marketplaceIds: readonly string[],
  authByMarketplace: Record<string, AuthCacheEntry | undefined>,
): StatusCounts {
  const counts: StatusCounts = {
    all: marketplaceIds.length,
    logged_in: 0,
    logged_out: 0,
    unknown: 0,
  };

  for (const id of marketplaceIds) {
    const resolved = resolveFilterStatus(authByMarketplace[id]?.status);
    counts[resolved] += 1;
  }

  return counts;
}
