import './style.css';
import type { AuthCacheEntry } from '@/utils/auth/auth-types';
import { formatCheckedAt, setActiveLocale, t } from '@/utils/i18n/i18n';
import {
  applyDocumentLocale,
  getLocale,
  LOCALES,
  localeFlag,
} from '@/utils/i18n/locales';
import { formatFlagLabel } from '@/utils/marketplace/flags';
import {
  ALL_MARKETPLACES_ID,
  buildMarketplaceActionUrl,
  getMarketplace,
  MARKETPLACES,
  marketplaceFlag,
  type Marketplace,
  type MarketplaceSelection,
} from '@/utils/marketplace/marketplaces';
import {
  isExtensionMessage,
  type ExtensionMessage,
  type PopupState,
} from '@/utils/messaging/messages';
import {
  createRefreshSpinnerElement,
  syncRefreshButtonSpinner,
} from '@/utils/popup/refresh-button-spinner';
import {
  isStatusFilter,
  matchesStatusFilter,
  STATUS_FILTERS,
  type StatusFilter,
} from '@/utils/popup/status-filter';

const app = document.querySelector<HTMLDivElement>('#app')!;

let state: PopupState | null = null;
let bootstrapped = false;
/** Last fully painted selection/locale — used to patch All view without resetting scroll. */
let paintedSelection: MarketplaceSelection | null = null;
let paintedLocale: string | null = null;
/** Client-only filter for the All-marketplaces list. */
let statusFilter: StatusFilter = 'logged_in';

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
    state = message.payload;
    applyLocaleFromState(state);
    render();
  }
});

async function init(): Promise<void> {
  state = await sendMessage({ type: 'GET_POPUP_STATE' });
  applyLocaleFromState(state);
  render();
  bootstrapped = true;
  // Stale-while-revalidate: show cache, then refresh current selection.
  void requestCheck(state.selectedMarketplaceId);
}

function applyLocaleFromState(s: PopupState): void {
  setActiveLocale(s.locale);
  applyDocumentLocale(s.locale);
}

function isRtlUi(): boolean {
  return getLocale(state?.locale ?? '')?.rtl === true;
}

function render(): void {
  if (!state) {
    app.innerHTML = `<p class="muted">${t('loading')}</p>`;
    paintedSelection = null;
    paintedLocale = null;
    return;
  }

  const canPatchAll =
    state.selectedMarketplaceId === ALL_MARKETPLACES_ID &&
    paintedSelection === ALL_MARKETPLACES_ID &&
    paintedLocale === state.locale &&
    app.querySelector('.market-list') != null;

  if (canPatchAll) {
    patchAllView(state.allRefreshInFlight);
    return;
  }

  const refreshLocked = state.allRefreshInFlight;
  const singleInFlight =
    state.selectedMarketplaceId !== ALL_MARKETPLACES_ID &&
    state.inFlightMarketplaceIds.includes(state.selectedMarketplaceId);

  const titleIconUrl = browser.runtime.getURL('/logo.svg');

  app.innerHTML = `
    <h1 class="app-title">
      <img
        class="app-title-icon"
        src="${titleIconUrl}"
        alt=""
        width="30"
        height="30"
      />
      <span class="app-title-text">${t('appTitle')}</span>
    </h1>

    <div class="field">
      <label for="marketplace">${t('marketplace')}</label>
      <select id="marketplace"></select>
    </div>

    <div class="field">
      <label for="language">${t('language')}</label>
      <select id="language"></select>
    </div>

    <div id="content"></div>
  `;

  const marketplaceSelect =
    app.querySelector<HTMLSelectElement>('#marketplace')!;
  const languageSelect = app.querySelector<HTMLSelectElement>('#language')!;
  const content = app.querySelector<HTMLDivElement>('#content')!;

  const rtl = isRtlUi();

  marketplaceSelect.innerHTML = [
    `<option value="${ALL_MARKETPLACES_ID}">${formatFlagLabel('🏳️', t('allMarketplaces'), rtl)}</option>`,
    ...MARKETPLACES.map(
      (m) =>
        `<option value="${m.id}">${formatFlagLabel(marketplaceFlag(m), `${m.region} (${m.domain})`, rtl)}</option>`,
    ),
  ].join('');
  marketplaceSelect.value = state.selectedMarketplaceId;

  languageSelect.innerHTML = LOCALES.map(
    (locale) =>
      `<option value="${locale.code}">${formatFlagLabel(localeFlag(locale), locale.label, rtl)}</option>`,
  ).join('');
  languageSelect.value = state.locale;

  if (state.selectedMarketplaceId === ALL_MARKETPLACES_ID) {
    content.innerHTML = renderAllView(refreshLocked);
  } else {
    content.innerHTML = renderSingleView(
      state.selectedMarketplaceId,
      refreshLocked || singleInFlight,
    );
  }

  paintedSelection = state.selectedMarketplaceId;
  paintedLocale = state.locale;

  marketplaceSelect.addEventListener('change', () => {
    void onMarketplaceChange(marketplaceSelect.value as MarketplaceSelection);
  });
  languageSelect.addEventListener('change', () => {
    void onLocaleChange(languageSelect.value);
  });

  bindStatusTabs(content);

  content
    .querySelector<HTMLButtonElement>('#refresh')
    ?.addEventListener('click', () => {
      if (!state) return;
      void requestCheck(state.selectedMarketplaceId);
    });

  content
    .querySelector<HTMLButtonElement>('#refresh-all')
    ?.addEventListener('click', () => {
      void requestCheck(ALL_MARKETPLACES_ID);
    });
}

function renderSingleView(
  marketplaceId: string,
  refreshDisabled: boolean,
): string {
  const marketplace = getMarketplace(marketplaceId);
  const spinning =
    !!state &&
    (state.allRefreshInFlight ||
      state.inFlightMarketplaceIds.includes(marketplaceId));

  const card = marketplace
    ? (() => {
        const row = allViewRow(marketplace);
        return `
      <article class="market-card ${row.statusClass}">
        <div class="market-card-head">
          <div class="market-card-title">
            <span class="market-card-name">${formatFlagLabel(marketplaceFlag(marketplace), marketplace.region, isRtlUi())}</span>
            ${renderDomainLink(marketplace, row.linkStatus)}
          </div>
          <div class="status-label ${row.statusClass}">${row.status}</div>
        </div>
        <div class="email">${row.email}</div>
        <div class="freshness">${t('lastChecked')}: ${row.checked}</div>
      </article>
    `;
      })()
    : `<article class="market-card unknown"><div class="status-label unknown">${t('unknown')}</div></article>`;

  return `
    <div class="all-toolbar">
      <button
        id="refresh"
        class="btn-text"
        type="button"
        title="${t('refresh')}"
        aria-label="${t('refresh')}"
        ${refreshDisabled ? 'disabled' : ''}
      >
        ${spinning ? '<span class="spinner" aria-hidden="true"></span>' : ''}
        ${t('refresh')}
      </button>
    </div>
    ${card}
  `;
}

function renderAllView(refreshLocked: boolean): string {
  const spinning = !!state?.allRefreshInFlight;
  const items = MARKETPLACES.map((m) => {
    const row = allViewRow(m);
    const hidden = matchesStatusFilter(statusFilter, row.linkStatus)
      ? ''
      : ' hidden';
    return `
      <article class="market-card ${row.statusClass}" data-marketplace-id="${m.id}"${hidden}>
        <div class="market-card-head">
          <div class="market-card-title">
            <span class="market-card-name">${formatFlagLabel(marketplaceFlag(m), m.region, isRtlUi())}</span>
            ${renderDomainLink(m, row.linkStatus)}
          </div>
          <div class="status-label ${row.statusClass}">${row.status}</div>
        </div>
        <div class="email">${row.email}</div>
        <div class="freshness">${t('lastChecked')}: ${row.checked}</div>
      </article>
    `;
  }).join('');

  const emptyHidden = hasVisibleMarketplaces() ? ' hidden' : '';

  return `
    <div class="all-toolbar">
      <button
        id="refresh-all"
        class="btn-text"
        type="button"
        ${refreshLocked ? 'disabled' : ''}
      >
        ${spinning ? '<span class="spinner" aria-hidden="true"></span>' : ''}
        ${t('refreshAll')}
      </button>
    </div>
    <div class="market-table">
      <div
        class="status-tabs"
        role="tablist"
        aria-label="${t('status')}"
      >
        ${STATUS_FILTERS.map((filter) => renderStatusTab(filter)).join('')}
      </div>
      <div
        class="panel market-list"
        role="tabpanel"
        id="status-tab-panel"
        aria-labelledby="status-tab-${statusFilter}"
      >
        ${items}
        <p class="filter-empty muted"${emptyHidden}>${filterEmptyMessage()}</p>
      </div>
    </div>
  `;
}

/** Update All-view cards/toolbar without recreating the scroll container. */
function patchAllView(refreshLocked: boolean): void {
  const btn = app.querySelector<HTMLButtonElement>('#refresh-all');
  if (btn) {
    syncRefreshButtonSpinner(
      btn,
      !!state?.allRefreshInFlight,
      refreshLocked,
      createRefreshSpinnerElement,
    );
  }

  syncStatusTabs();

  for (const m of MARKETPLACES) {
    const card = app.querySelector<HTMLElement>(
      `.market-card[data-marketplace-id="${m.id}"]`,
    );
    if (!card) continue;

    const row = allViewRow(m);
    card.className = `market-card ${row.statusClass}`;
    card.hidden = !matchesStatusFilter(statusFilter, row.linkStatus);
    const statusEl = card.querySelector('.status-label');
    if (statusEl) {
      statusEl.className = `status-label ${row.statusClass}`;
      statusEl.textContent = row.status;
    }

    const link = card.querySelector<HTMLAnchorElement>('.market-link');
    if (link) {
      link.href = buildMarketplaceActionUrl(m, row.linkStatus);
    }

    const emailEl = card.querySelector('.email');
    if (emailEl) {
      emailEl.textContent = row.email;
    }

    const freshnessEl = card.querySelector('.freshness');
    if (freshnessEl) {
      freshnessEl.textContent = `${t('lastChecked')}: ${row.checked}`;
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
  updateFilterEmptyVisibility();
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

/** Same status color classes as market cards: ok / out / unknown. */
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

function renderStatusTab(filter: StatusFilter): string {
  const selected = filter === statusFilter;
  const colorClass = statusFilterClass(filter);
  return `<button
      type="button"
      class="status-tab ${colorClass}"
      role="tab"
      id="status-tab-${filter}"
      data-status-filter="${filter}"
      aria-selected="${selected ? 'true' : 'false'}"
      aria-controls="status-tab-panel"
      tabindex="${selected ? '0' : '-1'}"
    >${statusFilterLabel(filter)}</button>`;
}

function bindStatusTabs(root: ParentNode): void {
  const tablist = root.querySelector('.status-tabs');
  if (!tablist) return;

  tablist.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>(
      '.status-tab',
    );
    if (!target) return;
    const value = target.dataset.statusFilter;
    if (!value || !isStatusFilter(value) || value === statusFilter) return;
    statusFilter = value;
    syncStatusTabs();
    applyStatusFilterVisibility();
  });
}

function syncStatusTabs(): void {
  const tabs = app.querySelectorAll<HTMLButtonElement>('.status-tab');
  for (const tab of tabs) {
    const value = tab.dataset.statusFilter;
    if (!value || !isStatusFilter(value)) continue;
    const selected = value === statusFilter;
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    tab.tabIndex = selected ? 0 : -1;
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
  checked: string;
  linkStatus: AuthCacheEntry['status'] | undefined;
} {
  const entry = state?.authByMarketplace[m.id];
  const inFlight = state?.inFlightMarketplaceIds.includes(m.id);
  const statusClass = inFlight
    ? 'unknown'
    : entry?.status === 'logged_in'
      ? 'ok'
      : entry?.status === 'logged_out'
        ? 'out'
        : 'unknown';
  return {
    statusClass,
    status: inFlight ? t('checking') : statusLabel(entry),
    email:
      entry?.status === 'logged_in' && entry.email ? entry.email : t('noEmail'),
    checked: formatCheckedAt(entry?.checkedAt, state!.locale),
    linkStatus: entry?.status,
  };
}

function statusLabel(entry: AuthCacheEntry | undefined): string {
  if (!entry) return t('unknown');
  if (entry.status === 'logged_in') return t('loggedIn');
  if (entry.status === 'logged_out') return t('loggedOut');
  return t('unknown');
}

/** Inline SVG sized via CSS `1em` to match the link text. */
const EXTERNAL_LINK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 3.5H3.5A1 1 0 0 0 2.5 4.5v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3"/><path d="M9.5 2.5h4v4"/><path d="M7.5 8.5 13.5 2.5"/></svg>`;

function renderDomainLink(
  marketplace: Marketplace,
  status: AuthCacheEntry['status'] | undefined,
): string {
  const href = buildMarketplaceActionUrl(marketplace, status);
  return `<a
      class="market-link"
      href="${href}"
      target="_blank"
      rel="noopener noreferrer"
    >${marketplace.domain}<span class="external-link-icon" aria-hidden="true">${EXTERNAL_LINK_ICON}</span></a>`;
}

async function onMarketplaceChange(
  marketplaceId: MarketplaceSelection,
): Promise<void> {
  state = await sendMessage({
    type: 'SET_MARKETPLACE',
    marketplaceId,
  });
  applyLocaleFromState(state);
  render();
  void requestCheck(marketplaceId);
}

async function onLocaleChange(locale: string): Promise<void> {
  state = await sendMessage({ type: 'SET_LOCALE', locale });
  applyLocaleFromState(state);
  render();
}

async function requestCheck(
  marketplaceId: MarketplaceSelection,
): Promise<void> {
  if (!bootstrapped && state) {
    // still ok
  }
  state = {
    ...state!,
    allRefreshInFlight:
      marketplaceId === ALL_MARKETPLACES_ID ? true : state!.allRefreshInFlight,
    inFlightMarketplaceIds:
      marketplaceId === ALL_MARKETPLACES_ID
        ? state!.inFlightMarketplaceIds
        : unique([...state!.inFlightMarketplaceIds, marketplaceId]),
  };
  render();

  state = await sendMessage({ type: 'CHECK_AUTH', marketplaceId });
  applyLocaleFromState(state);
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
