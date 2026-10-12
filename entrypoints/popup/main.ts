import './style.css';
import type { AuthCacheEntry } from '@/utils/auth/auth-types';
import {
  formatCheckedAt,
  getActiveLocale,
  setActiveLocale,
  t,
} from '@/utils/i18n/i18n';
import {
  applyDocumentLocale,
  getLocale,
  LOCALES,
  localeFlag,
} from '@/utils/i18n/locales';
import { formatFlagLabel } from '@/utils/marketplace/flags';
import {
  countryBadgeShowsFlag,
  displayCountryBadge,
  groupMarketplacesByGeoRegion,
} from '@/utils/marketplace/geo-regions';
import {
  ALL_MARKETPLACES_ID,
  buildMarketplaceActionUrl,
  getMarketplace,
  MARKETPLACES,
  type Marketplace,
  type MarketplaceSelection,
} from '@/utils/marketplace/marketplaces';
import {
  isExtensionMessage,
  type ExtensionMessage,
  type PopupState,
} from '@/utils/messaging/messages';
import {
  formatHeaderFreshness,
  JUST_NOW_MS,
  latestCheckedAt,
} from '@/utils/popup/header-freshness';
import {
  BACK_CHEVRON_ICON,
  REFRESH_ICON,
  SETTINGS_ICON,
} from '@/utils/popup/header-icons';
import { displayMarketEmail } from '@/utils/popup/market-card-display';
import { renderMarketplaceSelectOptionsHtml } from '@/utils/popup/marketplace-select-options';
import {
  createRefreshSpinnerElement,
  syncRefreshButtonSpinner,
} from '@/utils/popup/refresh-button-spinner';
import { countStatuses } from '@/utils/popup/status-counts';
import {
  isStatusFilter,
  matchesStatusFilter,
  resolveFilterStatus,
  STATUS_FILTERS,
  type StatusFilter,
} from '@/utils/popup/status-filter';
import {
  getStoredStatusFilter,
  setStoredStatusFilter,
} from '@/utils/popup/status-filter-preference';

const app = document.querySelector<HTMLDivElement>('#app')!;

let state: PopupState | null = null;
let bootstrapped = false;
/** Last fully painted selection/locale — used to patch All view without resetting scroll. */
let paintedSelection: MarketplaceSelection | null = null;
let paintedLocale: string | null = null;
/** Client-only filter for the All-marketplaces list. */
let statusFilter: StatusFilter = 'all';
/** Main marketplace UI vs settings screen. */
let popupView: 'main' | 'settings' = 'main';
/** True while a check for the current selection is in flight. */
let refreshWasInFlight = false;
/** Wall time when the current selection's refresh finished — forces "just now". */
let refreshCompletedAt: number | null = null;
let freshnessTickerId: ReturnType<typeof setInterval> | null = null;

const STATUS_CHECK_ICON = `<svg class="status-pill-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 4.5"/></svg>`;
const STATUS_MINUS_ICON = `<svg class="status-pill-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 8h8"/></svg>`;
const STATUS_UNKNOWN_ICON = `<svg class="status-pill-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M6.2 6.2a1.8 1.8 0 1 1 2.5 1.6c-.5.3-.9.7-.9 1.4"/><path d="M8 11.5h.01"/></svg>`;
const OPEN_EXTERNAL_ICON = `<svg class="market-open-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 11.5 11.5 4.5"/><path d="M6.5 4.5h5v5"/></svg>`;

init().catch((error) => {
  app.textContent = String(error);
});

browser.runtime.onMessage.addListener((message) => {
  if (!isExtensionMessage(message)) {
    return;
  }
  if (
    (message.type === 'AUTH_UPDATED' || message.type === 'CHECK_STATUS') &&
    message.payload
  ) {
    applyPopupState(message.payload);
    render();
  }
});

async function init(): Promise<void> {
  statusFilter = await getStoredStatusFilter();
  applyPopupState(await sendMessage({ type: 'GET_POPUP_STATE' }));
  render();
  startFreshnessTicker();
  bootstrapped = true;
  // Stale-while-revalidate: show cache, then refresh current selection.
  void requestCheck(state!.selectedMarketplaceId);
}

function isSelectionRefreshing(s: PopupState): boolean {
  if (s.allRefreshInFlight) return true;
  if (s.selectedMarketplaceId === ALL_MARKETPLACES_ID) return false;
  return s.inFlightMarketplaceIds.includes(s.selectedMarketplaceId);
}

/** Keep popup state and detect refresh end → show "Checked just now". */
function applyPopupState(next: PopupState): void {
  const refreshing = isSelectionRefreshing(next);
  if (refreshWasInFlight && !refreshing) {
    refreshCompletedAt = Date.now();
  }
  refreshWasInFlight = refreshing;
  state = next;
  applyLocaleFromState(next);
}

function startFreshnessTicker(): void {
  if (freshnessTickerId != null) return;
  freshnessTickerId = setInterval(() => {
    const freshness = app.querySelector('#header-freshness');
    if (freshness) {
      freshness.textContent = headerFreshnessLabel();
    }
  }, 1_000);
}

function applyLocaleFromState(s: PopupState): void {
  setActiveLocale(s.locale);
  applyDocumentLocale(s.locale);
}

function isRtlUi(): boolean {
  return getLocale(state?.locale ?? '')?.rtl === true;
}

function extensionVersion(): string {
  return browser.runtime.getManifest().version;
}

function headerCheckedAt(): number | undefined {
  if (!state) return undefined;
  if (state.selectedMarketplaceId === ALL_MARKETPLACES_ID) {
    return latestCheckedAt(state.authByMarketplace);
  }
  return latestCheckedAt(state.authByMarketplace, [
    state.selectedMarketplaceId,
  ]);
}

function headerFreshnessLabel(): string {
  if (!state) return t('loading');
  const now = Date.now();
  if (refreshCompletedAt != null && now - refreshCompletedAt < JUST_NOW_MS) {
    return t('checkedJustNow');
  }
  return formatHeaderFreshness(headerCheckedAt(), now, state.locale);
}

function refreshLabel(): string {
  if (!state) return t('refresh');
  return state.selectedMarketplaceId === ALL_MARKETPLACES_ID
    ? t('refreshAll')
    : t('refresh');
}

function render(): void {
  if (!state) {
    app.innerHTML = `<p class="muted">${t('loading')}</p>`;
    paintedSelection = null;
    paintedLocale = null;
    return;
  }

  const canPatchAll =
    popupView === 'main' &&
    state.selectedMarketplaceId === ALL_MARKETPLACES_ID &&
    paintedSelection === ALL_MARKETPLACES_ID &&
    paintedLocale === state.locale &&
    app.querySelector('.market-list') != null;

  if (canPatchAll) {
    patchHeader();
    patchAllView();
    return;
  }

  const canPatchSettings =
    popupView === 'settings' &&
    paintedLocale === state.locale &&
    app.querySelector('.settings-view') != null;

  if (canPatchSettings) {
    patchHeader();
    return;
  }

  const refreshLocked = state.allRefreshInFlight;
  const singleInFlight =
    state.selectedMarketplaceId !== ALL_MARKETPLACES_ID &&
    state.inFlightMarketplaceIds.includes(state.selectedMarketplaceId);
  const headerRefreshDisabled = refreshLocked || singleInFlight;
  const headerSpinning =
    state.allRefreshInFlight ||
    (state.selectedMarketplaceId !== ALL_MARKETPLACES_ID &&
      state.inFlightMarketplaceIds.includes(state.selectedMarketplaceId));

  const titleIconUrl = browser.runtime.getURL('/logo.svg');
  const refreshAria = refreshLabel();
  const footerHtml =
    popupView === 'settings'
      ? `<footer class="app-footer">
      <span>${t('version')} ${extensionVersion()}</span>
      <span>${t('notAffiliated')}</span>
    </footer>`
      : '';

  app.innerHTML = `
    <header class="app-header">
      <div class="app-brand">
        <img
          class="app-title-icon"
          src="${titleIconUrl}"
          alt=""
          width="36"
          height="36"
        />
        <div class="app-brand-text">
          <div class="app-title-text">${t('appTitle')}</div>
          <div class="app-freshness" id="header-freshness">${headerFreshnessLabel()}</div>
        </div>
      </div>
      <div class="app-header-actions">
        <button
          id="refresh-header"
          class="btn-icon btn-icon-refresh"
          type="button"
          title="${refreshAria}"
          aria-label="${refreshAria}"
          ${headerRefreshDisabled ? 'disabled' : ''}
        >
          ${headerSpinning ? '<span class="spinner" aria-hidden="true"></span>' : ''}
          ${REFRESH_ICON}
        </button>
        <button
          id="open-settings"
          class="btn-icon btn-icon-settings${popupView === 'settings' ? ' is-active' : ''}"
          type="button"
          title="${t('settings')}"
          aria-label="${t('settings')}"
          aria-pressed="${popupView === 'settings' ? 'true' : 'false'}"
        >
          ${SETTINGS_ICON}
        </button>
      </div>
    </header>

    <div id="content"></div>
    ${footerHtml}
  `;

  const content = app.querySelector<HTMLDivElement>('#content')!;

  if (popupView === 'settings') {
    content.innerHTML = renderSettingsView();
    bindSettingsView(content);
  } else if (state.selectedMarketplaceId === ALL_MARKETPLACES_ID) {
    content.innerHTML = renderAllView();
    bindStatusTabs(content);
  } else {
    content.innerHTML = renderSingleView(state.selectedMarketplaceId);
  }

  if (popupView === 'main') {
    const marketplaceSelect =
      content.querySelector<HTMLSelectElement>('#marketplace');
    if (marketplaceSelect) {
      marketplaceSelect.innerHTML = renderMarketplaceSelectOptionsHtml({
        t,
        uiRtl: isRtlUi(),
      });
      marketplaceSelect.value = state.selectedMarketplaceId;
      marketplaceSelect.addEventListener('change', () => {
        void onMarketplaceChange(
          marketplaceSelect.value as MarketplaceSelection,
        );
      });
    }
  }

  paintedSelection = state.selectedMarketplaceId;
  paintedLocale = state.locale;

  app.querySelector('#refresh-header')?.addEventListener('click', () => {
    if (!state) return;
    void requestCheck(state.selectedMarketplaceId);
  });

  app.querySelector('#open-settings')?.addEventListener('click', () => {
    popupView = popupView === 'settings' ? 'main' : 'settings';
    paintedSelection = null;
    render();
  });
}

function renderSettingsView(): string {
  return `
    <div class="settings-view">
      <button
        id="settings-back"
        class="settings-back"
        type="button"
        aria-label="${t('back')}"
      >
        ${BACK_CHEVRON_ICON}
        <span>${t('settings')}</span>
      </button>

      <div class="field">
        <label for="language">${t('language')}</label>
        <select id="language"></select>
        <p class="field-help">${t('languageOfPopup')}</p>
      </div>
    </div>
  `;
}

function bindSettingsView(root: ParentNode): void {
  if (!state) return;

  const languageSelect = root.querySelector<HTMLSelectElement>('#language')!;
  languageSelect.innerHTML = LOCALES.map(
    (locale) =>
      `<option value="${locale.code}">${formatFlagLabel(localeFlag(locale), locale.label, isRtlUi())}</option>`,
  ).join('');
  languageSelect.value = state.locale;
  languageSelect.addEventListener('change', () => {
    void onLocaleChange(languageSelect.value);
  });

  root.querySelector('#settings-back')?.addEventListener('click', () => {
    popupView = 'main';
    paintedSelection = null;
    render();
  });
}

function renderSingleView(marketplaceId: string): string {
  const marketplace = getMarketplace(marketplaceId);
  const card = marketplace
    ? renderMarketCard(marketplace, false)
    : `<article class="market-card unknown"><div class="status-pill unknown">${t('unknown')}</div></article>`;

  return `
    <div class="field">
      <label for="marketplace">${t('marketplace')}</label>
      <select id="marketplace"></select>
    </div>
    <div class="market-list market-list-single">
      ${card}
    </div>
  `;
}

function renderAllView(): string {
  const counts = currentStatusCounts();
  const groups = groupMarketplacesByGeoRegion(MARKETPLACES);
  const sections = groups
    .map((group) => {
      const visibleCount = group.marketplaces.filter((m) =>
        matchesStatusFilter(
          statusFilter,
          state?.authByMarketplace[m.id]?.status,
        ),
      ).length;
      const sectionHidden = visibleCount === 0 ? ' hidden' : '';
      const cards = group.marketplaces
        .map((m) => renderMarketCard(m, true))
        .join('');
      return `
        <section class="geo-section" data-geo-region="${group.id}"${sectionHidden}>
          <div class="geo-section-head">
            <span class="geo-section-title">${t(group.labelKey)}</span>
            <span class="geo-section-count">${visibleCount}</span>
          </div>
          <div class="geo-section-cards">${cards}</div>
        </section>
      `;
    })
    .join('');

  const emptyHidden = hasVisibleMarketplaces() ? ' hidden' : '';

  return `
    <div class="field">
      <label for="marketplace">${t('marketplace')}</label>
      <select id="marketplace"></select>
    </div>
    <div class="market-table">
      <div
        class="status-filters"
        role="tablist"
        aria-label="${t('status')}"
      >
        ${STATUS_FILTERS.map((filter) => renderStatusFilter(filter, counts[filter])).join('')}
      </div>
      <div
        class="market-list"
        role="tabpanel"
        id="status-tab-panel"
        aria-labelledby="status-tab-${statusFilter}"
      >
        ${sections}
        <p class="filter-empty muted"${emptyHidden}>${filterEmptyMessage()}</p>
      </div>
    </div>
  `;
}

function renderMarketCard(
  marketplace: Marketplace,
  forAllList: boolean,
): string {
  const row = allViewRow(marketplace);
  const hidden =
    forAllList && !matchesStatusFilter(statusFilter, row.linkStatus)
      ? ' hidden'
      : '';
  const dataAttr = forAllList ? ` data-marketplace-id="${marketplace.id}"` : '';
  const href = buildMarketplaceActionUrl(marketplace, row.linkStatus);
  const showsFlag = countryBadgeShowsFlag(marketplace.countryCode);
  const codeClass = showsFlag ? 'market-code market-code--flag' : 'market-code';

  return `
    <a
      class="market-card ${row.statusClass}"
      href="${href}"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="${marketplace.region} (${marketplace.domain})"
      ${dataAttr}${hidden}
    >
      <div class="${codeClass}" aria-hidden="true">${displayCountryBadge(marketplace.countryCode)}</div>
      <div class="market-card-body">
        <div class="market-email">${row.email}</div>
        <div class="market-checked">${row.checkedLabel}</div>
      </div>
      <div class="market-card-trailing">
        ${renderStatusPill(row.statusClass, row.status)}
        ${OPEN_EXTERNAL_ICON}
      </div>
    </a>
  `;
}

function renderStatusPill(statusClass: string, label: string): string {
  const icon =
    statusClass === 'ok'
      ? STATUS_CHECK_ICON
      : statusClass === 'out'
        ? STATUS_MINUS_ICON
        : STATUS_UNKNOWN_ICON;
  return `<div class="status-pill ${statusClass}">${icon}<span>${label}</span></div>`;
}

function currentStatusCounts() {
  return countStatuses(
    MARKETPLACES.map((m) => m.id),
    state?.authByMarketplace ?? {},
  );
}

function patchHeader(): void {
  const freshness = app.querySelector('#header-freshness');
  if (freshness) {
    freshness.textContent = headerFreshnessLabel();
  }

  const btn = app.querySelector<HTMLButtonElement>('#refresh-header');
  if (!btn || !state) return;

  const refreshLocked = state.allRefreshInFlight;
  const singleInFlight =
    state.selectedMarketplaceId !== ALL_MARKETPLACES_ID &&
    state.inFlightMarketplaceIds.includes(state.selectedMarketplaceId);
  const spinning =
    state.allRefreshInFlight ||
    (state.selectedMarketplaceId !== ALL_MARKETPLACES_ID &&
      state.inFlightMarketplaceIds.includes(state.selectedMarketplaceId));

  const label = refreshLabel();
  btn.title = label;
  btn.setAttribute('aria-label', label);

  syncRefreshButtonSpinner(
    btn,
    spinning,
    refreshLocked || singleInFlight,
    createRefreshSpinnerElement,
  );
}

/** Update All-view cards/filters without recreating the scroll container. */
function patchAllView(): void {
  syncStatusFilters();
  syncGeoSections();

  for (const m of MARKETPLACES) {
    const card = app.querySelector<HTMLAnchorElement>(
      `a.market-card[data-marketplace-id="${m.id}"]`,
    );
    if (!card) continue;

    const row = allViewRow(m);
    card.className = `market-card ${row.statusClass}`;
    card.hidden = !matchesStatusFilter(statusFilter, row.linkStatus);
    card.href = buildMarketplaceActionUrl(m, row.linkStatus);

    const pill = card.querySelector('.status-pill');
    if (pill) {
      pill.outerHTML = renderStatusPill(row.statusClass, row.status);
    }

    const emailEl = card.querySelector<HTMLElement>('.market-email');
    if (emailEl) {
      emailEl.textContent = row.email;
    }

    const checkedEl = card.querySelector<HTMLElement>('.market-checked');
    if (checkedEl) {
      checkedEl.textContent = row.checkedLabel;
    }
  }

  updateFilterEmptyVisibility();
}

function applyStatusFilterVisibility(): void {
  for (const m of MARKETPLACES) {
    const card = app.querySelector<HTMLElement>(
      `.market-card[data-marketplace-id="${m.id}"]`,
    );
    if (!card) continue;
    const entry = state?.authByMarketplace[m.id];
    card.hidden = !matchesStatusFilter(statusFilter, entry?.status);
  }
  syncGeoSections();
  updateFilterEmptyVisibility();
}

function syncGeoSections(): void {
  for (const group of groupMarketplacesByGeoRegion(MARKETPLACES)) {
    const section = app.querySelector<HTMLElement>(
      `.geo-section[data-geo-region="${group.id}"]`,
    );
    if (!section) continue;
    const visibleCount = group.marketplaces.filter((m) =>
      matchesStatusFilter(statusFilter, state?.authByMarketplace[m.id]?.status),
    ).length;
    section.hidden = visibleCount === 0;
    const countEl = section.querySelector('.geo-section-count');
    if (countEl) {
      countEl.textContent = String(visibleCount);
    }
  }
}

function hasVisibleMarketplaces(): boolean {
  return MARKETPLACES.some((m) =>
    matchesStatusFilter(statusFilter, state?.authByMarketplace[m.id]?.status),
  );
}

function filterEmptyMessage(): string {
  return state?.allRefreshInFlight ? t('checking') : t('noMatchingStatus');
}

function updateFilterEmptyVisibility(): void {
  const empty = app.querySelector<HTMLElement>('.filter-empty');
  if (empty) {
    empty.hidden = hasVisibleMarketplaces();
    empty.textContent = filterEmptyMessage();
  }
}

function statusFilterClass(filter: StatusFilter): string {
  if (filter === 'logged_in') return 'ok';
  if (filter === 'logged_out') return 'out';
  if (filter === 'unknown') return 'unknown';
  return 'all';
}

function statusFilterLabel(filter: StatusFilter): string {
  if (filter === 'logged_in') return t('loggedIn');
  if (filter === 'logged_out') return t('loggedOut');
  if (filter === 'unknown') return t('unknown');
  return t('allStatuses');
}

function renderStatusFilter(filter: StatusFilter, count: number): string {
  const selected = filter === statusFilter;
  const colorClass = statusFilterClass(filter);
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
        <span class="status-filter-dot" aria-hidden="true"></span>
      </span>
      <span class="status-filter-label">${statusFilterLabel(filter)}</span>
    </button>`;
}

function bindStatusTabs(root: ParentNode): void {
  const tablist = root.querySelector('.status-filters');
  if (!tablist) return;

  tablist.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>(
      '.status-filter',
    );
    if (!target) return;
    const value = target.dataset.statusFilter;
    if (!value || !isStatusFilter(value) || value === statusFilter) return;
    statusFilter = value;
    void setStoredStatusFilter(value);
    syncStatusFilters();
    applyStatusFilterVisibility();
  });
}

function syncStatusFilters(): void {
  const counts = currentStatusCounts();
  const tabs = app.querySelectorAll<HTMLButtonElement>('.status-filter');
  for (const tab of tabs) {
    const value = tab.dataset.statusFilter;
    if (!value || !isStatusFilter(value)) continue;
    const selected = value === statusFilter;
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    tab.tabIndex = selected ? 0 : -1;
    const numberEl = tab.querySelector('.status-filter-number');
    if (numberEl) {
      numberEl.textContent = String(counts[value]);
    }
  }

  const panel = app.querySelector('#status-tab-panel');
  if (panel) {
    panel.setAttribute('aria-labelledby', `status-tab-${statusFilter}`);
  }
}

function allViewRow(m: Marketplace): {
  statusClass: string;
  status: string;
  email: string;
  checkedLabel: string;
  linkStatus: AuthCacheEntry['status'] | undefined;
} {
  const entry = state?.authByMarketplace[m.id];
  const inFlight = state?.inFlightMarketplaceIds.includes(m.id);
  const resolved = resolveFilterStatus(entry?.status);
  const statusClass = inFlight
    ? 'unknown'
    : resolved === 'logged_in'
      ? 'ok'
      : resolved === 'logged_out'
        ? 'out'
        : 'unknown';
  return {
    statusClass,
    status: inFlight ? t('checking') : statusLabel(entry),
    email: displayMarketEmail(entry),
    checkedLabel: formatCheckedAt(entry?.checkedAt, getActiveLocale()),
    linkStatus: entry?.status,
  };
}

function statusLabel(entry: AuthCacheEntry | undefined): string {
  if (!entry) return t('unknown');
  if (entry.status === 'logged_in') return t('loggedIn');
  if (entry.status === 'logged_out') return t('loggedOut');
  return t('unknown');
}

async function onMarketplaceChange(
  marketplaceId: MarketplaceSelection,
): Promise<void> {
  applyPopupState(
    await sendMessage({
      type: 'SET_MARKETPLACE',
      marketplaceId,
    }),
  );
  render();
  void requestCheck(marketplaceId);
}

async function onLocaleChange(locale: string): Promise<void> {
  applyPopupState(await sendMessage({ type: 'SET_LOCALE', locale }));
  paintedLocale = null;
  render();
}

async function requestCheck(
  marketplaceId: MarketplaceSelection,
): Promise<void> {
  if (!bootstrapped && state) {
    // still ok
  }
  applyPopupState({
    ...state!,
    allRefreshInFlight:
      marketplaceId === ALL_MARKETPLACES_ID ? true : state!.allRefreshInFlight,
    inFlightMarketplaceIds:
      marketplaceId === ALL_MARKETPLACES_ID
        ? state!.inFlightMarketplaceIds
        : unique([...state!.inFlightMarketplaceIds, marketplaceId]),
  });
  render();

  applyPopupState(await sendMessage({ type: 'CHECK_AUTH', marketplaceId }));
  render();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

async function sendMessage(message: ExtensionMessage): Promise<PopupState> {
  const response = (await browser.runtime.sendMessage(message)) as
    PopupState | { error: string };
  if (response && 'error' in response) {
    throw new Error(response.error);
  }
  return response as PopupState;
}
