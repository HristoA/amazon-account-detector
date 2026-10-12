# Amazon Account Detector

Chrome Manifest V3 extension that shows whether you are logged in on a chosen Amazon marketplace, and with which email, without disrupting focused browsing.

Built with [WXT](https://wxt.dev/) + TypeScript.

## How detection works

Each check uses Amazon’s account-switcher / sign-in URL for that marketplace. The background service worker runs this sequence:

### 1. Fetch (preferred)

1. `fetch` the sign-in URL with cookies (via host permissions).
2. Parse the HTML:
   - account email / switcher UI → **Logged in** (+ email)
   - clear sign-in form → **Logged out**
   - anything else → treat as unclear and continue

If fetch fails (network error, etc.), continue to the tab fallback.

### 2. Inactive-tab fallback (only when needed)

Used only when fetch did not give a clear logged-in / logged-out result:

1. Open a **background** tab (`active: false`) to the same sign-in URL — does not steal focus.
2. Wait for the page to finish loading (up to 20 seconds).
3. Inject a script to read the page HTML.
4. Parse with the same rules as fetch.
5. Close the tab afterward when it is still inactive. If you focus the fallback tab mid-check, it is **claimed** (`userClaimed`) and left open — later orphan sweeps will **not** auto-close it (including after Amazon redirects to a normal storefront page). The claimed tab id stays tracked until you close that tab yourself.

During **Refresh all**, up to 5 marketplaces **fetch** at once, but at most **one** inactive-tab fallback runs at a time (others wait), so the tab strip is not flooded.

### Statuses shown in the popup

| Status     | Meaning                                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| Logged in  | Check found an account email / switcher UI                                                                  |
| Logged out | Check found a clear sign-in form, **or** first-run seed before any check (`checkedAt: 0` → “Never checked”) |
| Checking…  | A check is currently in flight for that marketplace                                                         |
| Unknown    | A check ran but could not decide (AWS WAF challenge, CAPTCHA, odd page, timeout, etc.)                      |

Auth state is cached per marketplace in `browser.storage.local` (survives browser restart). First paint seeds every marketplace as **Logged out** with `checkedAt: 0` (“Never checked”) so the All view has concrete cards before the first refresh finishes. Opening the popup shows cached data immediately, then refreshes in the background. A failed/indeterminate check within **1 hour** of the last successful verify does **not** wipe a logged-in/out result — the UI labels it **Last known**. After that 1-hour window (or on popup/SW start when the last verify is older), the entry is demoted to **Unknown**. The header won’t flash “Checked just now” unless the cache timestamp advanced versus the refresh start. There is no background TTL refresh while the popup is closed; while it stays open, the current selection auto-refreshes every **30 minutes**.

Sign-in URLs use per-marketplace `openid.assoc_handle` values following Amazon’s `{cc}flex` convention (UK → `gbflex`). Re-check with `pnpm verify:assoc-handles` (curl each sign-in URL, then Chromium fallback for WAF/`missing` so `challenge.js` can run; exits non-zero on mismatch, rejected handle, persistent WAF, or missing discovery). The probe URL includes the declared handle, so a single HTML echo of that query is not treated as a match — look for `rejected` / `mismatch` as the strong failure signals. A wrong handle usually surfaces as **Unknown** rather than a false logged-in email.

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) 10 (`packageManager` in `package.json`)
- `curl` (for `pnpm verify:assoc-handles`)
- Playwright Chromium once: `pnpm exec playwright install chromium`

## Install and load (unpacked)

```bash
pnpm install
pnpm build
```

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select `.output/chrome-mv3`

For local development with reload:

```bash
pnpm dev
```

Then load the same `.output/chrome-mv3` folder (WXT keeps it updated).

## Try a marketplace check

1. Pin the extension and open the toolbar popup.
2. Pick a marketplace from the dropdown (flag + region), or **All** for a card list of every supported storefront (grouped by region).
3. In **All**, use the status tabs above the cards to filter the list. **Refresh all** still checks every marketplace.
4. The popup shows logged-in vs not, and the account email when logged in.
5. **Last checked** is shown in your local timezone; use the refresh control to re-check (spinner while in flight).
6. During an **All** refresh, every refresh control stays disabled until the full batch finishes.
7. Open **Settings** to choose a UI language (flag + name). Preference is saved; Arabic uses RTL layout. Default follows the browser language when supported, otherwise English.

Tip: be signed in (or signed out) on that marketplace in Chrome first, then run the check from the popup.

## Scripts

| Command                     | Description                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm dev`                  | Dev build + watch (Chrome)                                                                   |
| `pnpm build`                | Production Chrome MV3 build                                                                  |
| `pnpm compile`              | Typecheck                                                                                    |
| `pnpm test`                 | Unit tests                                                                                   |
| `pnpm lint`                 | ESLint                                                                                       |
| `pnpm lint:fix`             | ESLint with autofix                                                                          |
| `pnpm format`               | Prettier write                                                                               |
| `pnpm verify:assoc-handles` | Curl + Chromium WAF fallback; diff `openid.assoc_handle` (needs `curl`, Playwright Chromium) |
| `pnpm zip`                  | Zip the extension                                                                            |

## Project notes

- See [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) for architecture details.
- Brief and marketplace scope: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) (extended in the plan to all current retail storefronts; excludes non-retail such as `amazon.cn`).
