import './style.css';
import { getActiveLocale, setActiveLocale, t } from '@/utils/i18n/i18n';
import {
  applyDocumentLocale,
  getLocale,
  LOCALES,
  localeFlag,
} from '@/utils/i18n/locales';
import { formatFlagLabel } from '@/utils/marketplace/flags';
import { groupMarketplacesByGeoRegion } from '@/utils/marketplace/geo-regions';
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
  parsePopupMessageResponse,
  type ExtensionMessage,
  type PopupState,
} from '@/utils/messaging/messages';
import { escapeAttr } from '@/utils/popup/escape-attr';
import { escapeHtml } from '@/utils/popup/escape-html';
import {
  cacheAdvancedDuringRefresh,
  formatHeaderFreshness,
  JUST_NOW_MS,
  latestCheckedAt,
  latestEntryIsLastKnown,
} from '@/utils/popup/header-freshness';
import {
  BACK_CHEVRON_ICON,
  REFRESH_ICON,
  SETTINGS_ICON,
} from '@/utils/popup/header-icons';
import { renderMarketStatusMark } from '@/utils/popup/market-card-display';
import { buildMarketCardRow } from '@/utils/popup/market-card-row';
import { renderMarketplaceSelectOptionsHtml } from '@/utils/popup/marketplace-select-options';
import { shouldTriggerPopupOpenRefresh } from '@/utils/popup/popup-open-refresh';
import {
  createRefreshSpinnerElement,
  syncRefreshButtonSpinner,
} from '@/utils/popup/refresh-button-spinner';
import { renderMarketCardHtml } from '@/utils/popup/render-market-card';
import { resolveCheckResponse } from '@/utils/popup/resolve-check-response';
import { countStatuses } from '@/utils/popup/status-counts';
import {
  isStatusFilter,
  matchesStatusFilter,
  STATUS_FILTERS,
  type StatusFilter,
} from '@/utils/popup/status-filter';
import {
  getStoredStatusFilter,
  setStoredStatusFilter,
} from '@/utils/popup/status-filter-preference';
import {
  renderStatusFilterHtml,
  statusTablistAriaLabel,
} from '@/utils/popup/status-filter-ui';

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
/**
 * `checkedAt` snapshot when the current selection's refresh started.
 * Used so mid-batch AUTH_UPDATED advances do not hide a real completion
 * (or falsely claim "just now" when only trailing unknowns were skipped).
 */
let refreshStartedCheckedAt: number | undefined = undefined;
/** Wall time when the current selection's refresh finished — forces "just now". */
let refreshCompletedAt: number | null = null;
let freshnessTickerId: ReturnType<typeof setInterval> | null = null;
/** Wall time when this popup instance opened. */
const popupOpenedAt = Date.now();
/** Last automatic open-duration refresh (0 = never). */
let lastOpenAutoRefreshAt = 0;

init().catch((error) => {
  app.textContent = String(error);
});

browser.runtime.onMessage.addListener((message) => {
  if (!isExtensionMessage(message)) {
    return;
  }
  if (message.type === 'AUTH_UPDATED' && message.payload) {
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
  if (!refreshWasInFlight && refreshing) {
    refreshStartedCheckedAt = headerCheckedAt();
    refreshCompletedAt = null;
  }
  if (refreshWasInFlight && !refreshing) {
    const nextCheckedAt =
      next.selectedMarketplaceId === ALL_MARKETPLACES_ID
        ? latestCheckedAt(next.authByMarketplace)
        : latestCheckedAt(next.authByMarketplace, [next.selectedMarketplaceId]);
    if (cacheAdvancedDuringRefresh(refreshStartedCheckedAt, nextCheckedAt)) {
      refreshCompletedAt = Date.now();
    }
    refreshStartedCheckedAt = undefined;
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
    maybeAutoRefreshForOpenDuration();
  }, 1_000);
}

/** Re-check the current selection every 30 minutes while the popup stays open. */
function maybeAutoRefreshForOpenDuration(): void {
  if (!bootstrapped || !state) return;
  if (isSelectionRefreshing(state)) return;
  const now = Date.now();
  if (
    !shouldTriggerPopupOpenRefresh(popupOpenedAt, now, lastOpenAutoRefreshAt)
  ) {
    return;
  }
  lastOpenAutoRefreshAt = now;
  void requestCheck(state.selectedMarketplaceId);
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

function headerIsLastKnown(): boolean {
  if (!state) return false;
  if (state.selectedMarketplaceId === ALL_MARKETPLACES_ID) {
    return latestEntryIsLastKnown(state.authByMarketplace);
  }
  return latestEntryIsLastKnown(state.authByMarketplace, [
    state.selectedMarketplaceId,
  ]);
}

function headerFreshnessLabel(): string {
  if (!state) return t('loading');
  const now = Date.now();
  const lastKnown = headerIsLastKnown();
  if (
    !lastKnown &&
    refreshCompletedAt != null &&
    now - refreshCompletedAt < JUST_NOW_MS
  ) {
    return t('checkedJustNow');
  }
  return formatHeaderFreshness(headerCheckedAt(), now, state.locale, lastKnown);
}

function refreshLabel(): string {
  if (!state) return t('refresh');
  return state.selectedMarketplaceId === ALL_MARKETPLACES_ID
    ? t('refreshAll')
    : t('refresh');
}

function render(): void {
  if (!state) {
    app.innerHTML = `<p class="muted">${escapeHtml(t('loading'))}</p>`;
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
  const refreshAria = escapeAttr(refreshLabel());
  const settingsLabel = escapeAttr(t('settings'));
  const footerHtml =
    popupView === 'settings'
      ? `<footer class="app-footer">
      <span>${escapeHtml(t('version'))} ${escapeHtml(extensionVersion())}</span>
      <span>${escapeHtml(t('notAffiliated'))}</span>
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
          <div class="app-title-text">${escapeHtml(t('appTitle'))}</div>
          <div class="app-freshness" id="header-freshness">${escapeHtml(headerFreshnessLabel())}</div>
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
          title="${settingsLabel}"
          aria-label="${settingsLabel}"
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
  const backLabel = escapeAttr(t('back'));
  return `
    <div class="settings-view">
      <button
        id="settings-back"
        class="settings-back"
        type="button"
        aria-label="${backLabel}"
      >
        ${BACK_CHEVRON_ICON}
        <span>${escapeHtml(t('settings'))}</span>
      </button>

      <div class="field">
        <label for="language">${escapeHtml(t('language'))}</label>
        <select id="language"></select>
      </div>
    </div>
  `;
}

function bindSettingsView(root: ParentNode): void {
  if (!state) return;

  const languageSelect = root.querySelector<HTMLSelectElement>('#language')!;
  languageSelect.innerHTML = LOCALES.map(
    (locale) =>
      `<option value="${escapeAttr(locale.code)}">${formatFlagLabel(localeFlag(locale), locale.label, isRtlUi())}</option>`,
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
    : `<article class="market-card unknown"><div class="market-domain">${escapeHtml(t('unknown'))}</div></article>`;

  return `
    <div class="field">
      <label for="marketplace">${escapeHtml(t('marketplace'))}</label>
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
            <span class="geo-section-title">${escapeHtml(t(group.labelKey))}</span>
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
      <label for="marketplace">${escapeHtml(t('marketplace'))}</label>
      <select id="marketplace"></select>
    </div>
    <div class="market-table">
      <div
        class="status-filters"
        role="tablist"
        aria-label="${statusTablistAriaLabel(t)}"
      >
        ${STATUS_FILTERS.map((filter) =>
          renderStatusFilterHtml(filter, counts[filter], statusFilter, t),
        ).join('')}
      </div>
      <div
        class="market-list"
        role="tabpanel"
        id="status-tab-panel"
        aria-labelledby="status-tab-${statusFilter}"
      >
        ${sections}
        <p class="filter-empty muted"${emptyHidden}>${escapeHtml(filterEmptyMessage())}</p>
      </div>
    </div>
  `;
}

function renderMarketCard(
  marketplace: Marketplace,
  forAllList: boolean,
): string {
  return renderMarketCardHtml({
    marketplace,
    row: allViewRow(marketplace),
    forAllList,
    statusFilter,
    checkingLabel: t('checking'),
  });
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
    card.setAttribute(
      'aria-label',
      `${m.domain}, ${row.status}${row.email ? `, ${row.email}` : ''}${
        row.updating ? `, ${t('checking')}` : ''
      }`,
    );
    card.title = row.tooltip;

    const codeWrap = card.querySelector('.market-code-wrap');
    if (codeWrap) {
      const mark = codeWrap.querySelector('.market-status-mark');
      mark?.remove();
      const markHtml = renderMarketStatusMark(
        row.statusClass,
        row.updating,
        row.lastKnown,
      );
      if (markHtml) {
        codeWrap.insertAdjacentHTML('beforeend', markHtml);
      }
    }

    const body = card.querySelector('.market-card-body');
    const emailEl = card.querySelector<HTMLElement>('.market-email');
    if (row.email) {
      if (emailEl) {
        emailEl.textContent = row.email;
      } else if (body) {
        const created = document.createElement('div');
        created.className = 'market-email';
        created.textContent = row.email;
        body.appendChild(created);
      }
    } else {
      emailEl?.remove();
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

function allViewRow(m: Marketplace) {
  const entry = state?.authByMarketplace[m.id];
  const updating =
    state?.allRefreshInFlight === true ||
    state?.inFlightMarketplaceIds.includes(m.id) === true;
  return buildMarketCardRow({
    marketplace: m,
    entry,
    updating,
    locale: getActiveLocale(),
    t,
  });
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

  const optimisticState = state!;
  applyPopupState(
    await resolveCheckResponse({
      marketplaceId,
      optimisticState,
      checkAuth: () => sendMessage({ type: 'CHECK_AUTH', marketplaceId }),
      getPopupState: () => sendMessage({ type: 'GET_POPUP_STATE' }),
    }),
  );
  render();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

async function sendMessage(message: ExtensionMessage): Promise<PopupState> {
  return parsePopupMessageResponse(await browser.runtime.sendMessage(message));
}
