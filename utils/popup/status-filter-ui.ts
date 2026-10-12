import type { MessageKey } from '@/utils/i18n/i18n';
import { escapeAttr } from '@/utils/popup/escape-attr';
import { escapeHtml } from '@/utils/popup/escape-html';
import type { StatusFilter } from '@/utils/popup/status-filter';

export function statusFilterClass(filter: StatusFilter): string {
  if (filter === 'logged_in') return 'ok';
  if (filter === 'logged_out') return 'out';
  if (filter === 'unknown') return 'unknown';
  return 'all';
}

export function statusFilterLabel(
  filter: StatusFilter,
  t: (key: MessageKey) => string,
): string {
  if (filter === 'logged_in') return t('loggedIn');
  if (filter === 'logged_out') return t('loggedOut');
  if (filter === 'unknown') return t('unknown');
  return t('allStatuses');
}

export function renderStatusFilterHtml(
  filter: StatusFilter,
  count: number,
  selectedFilter: StatusFilter,
  t: (key: MessageKey) => string,
): string {
  const selected = filter === selectedFilter;
  const colorClass = statusFilterClass(filter);
  const statusDot =
    filter === 'all'
      ? ''
      : '<span class="status-filter-dot" aria-hidden="true"></span>';
  const label = statusFilterLabel(filter, t);
  return `<button
      type="button"
      class="status-filter ${colorClass}"
      role="tab"
      id="status-tab-${filter}"
      data-status-filter="${filter}"
      aria-selected="${selected ? 'true' : 'false'}"
      aria-controls="status-tab-panel"
      tabindex="${selected ? '0' : '-1'}"
    >
      <span class="status-filter-count">
        <span class="status-filter-number">${count}</span>
        ${statusDot}
      </span>
      <span class="status-filter-label">${escapeHtml(label)}</span>
    </button>`;
}

export function statusTablistAriaLabel(t: (key: MessageKey) => string): string {
  return escapeAttr(t('status'));
}
