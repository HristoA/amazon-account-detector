import { storage } from 'wxt/utils/storage';
import { isStatusFilter, type StatusFilter } from './status-filter';

const DEFAULT_STATUS_FILTER: StatusFilter = 'all';

const statusFilterItem = storage.defineItem<StatusFilter>(
  'local:statusFilter',
  {
    fallback: DEFAULT_STATUS_FILTER,
  },
);

/** Prefer a stored filter; fall back to All when missing or invalid. */
export function normalizeStatusFilter(
  value: string | null | undefined,
): StatusFilter {
  if (value && isStatusFilter(value)) {
    return value;
  }
  return DEFAULT_STATUS_FILTER;
}

export async function getStoredStatusFilter(): Promise<StatusFilter> {
  return normalizeStatusFilter(await statusFilterItem.getValue());
}

export async function setStoredStatusFilter(
  filter: StatusFilter,
): Promise<void> {
  await statusFilterItem.setValue(normalizeStatusFilter(filter));
}
