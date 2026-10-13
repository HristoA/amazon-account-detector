import type { AuthStatus } from '@/utils/auth/types/auth-types';

/** Filter for the All-marketplaces list. Uses cached auth status (not in-flight). */
export type StatusFilter = 'all' | AuthStatus;

export const STATUS_FILTERS: readonly StatusFilter[] = [
  'all',
  'logged_in',
  'logged_out',
  'unknown',
] as const;

/** Status used for list filtering — missing / unclear → unknown. */
export function resolveFilterStatus(
  entryStatus: AuthStatus | undefined,
): AuthStatus {
  if (entryStatus === 'logged_in' || entryStatus === 'logged_out') {
    return entryStatus;
  }
  return 'unknown';
}

export function matchesStatusFilter(
  filter: StatusFilter,
  entryStatus: AuthStatus | undefined,
): boolean {
  if (filter === 'all') {
    return true;
  }
  return resolveFilterStatus(entryStatus) === filter;
}

export function isStatusFilter(value: string): value is StatusFilter {
  return (STATUS_FILTERS as readonly string[]).includes(value);
}
