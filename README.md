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
5. **Always close** the tab afterward.

During **Refresh all**, up to 5 marketplaces **fetch** at once, but at most **one** inactive-tab fallback runs at a time (others wait), so the tab strip is not flooded.

### Statuses shown in the popup

| Status     | Meaning                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------ |
| Logged in  | Check found an account email / switcher UI                                                       |
| Logged out | Check found a clear sign-in form                                                                 |
| Checking…  | A check is currently in flight for that marketplace                                              |
| Unknown    | No result yet, or the check could not decide (CAPTCHA, odd page, timeout, cancelled check, etc.) |

Auth state is cached per marketplace in `browser.storage.local` (survives browser restart). Opening the popup shows cached data immediately, then refreshes in the background.

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) 10 (`packageManager` in `package.json`)

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
2. Pick a marketplace from the dropdown (flag + region), or **All** for a list of every supported storefront.
3. In **All**, use the status tabs above the cards to filter the list. **Refresh all** still checks every marketplace.
4. The popup shows logged-in vs not, and the account email when logged in.
5. **Last checked** is shown in your local timezone; use the refresh control to re-check (spinner while in flight).
6. During an **All** refresh, every refresh control stays disabled until the full batch finishes.
7. Choose a UI language (flag + name). Preference is saved; Arabic uses RTL layout. Default follows the browser language when supported, otherwise English.

Tip: be signed in (or signed out) on that marketplace in Chrome first, then run the check from the popup.

## Scripts

| Command         | Description                 |
| --------------- | --------------------------- |
| `pnpm dev`      | Dev build + watch (Chrome)  |
| `pnpm build`    | Production Chrome MV3 build |
| `pnpm compile`  | Typecheck                   |
| `pnpm test`     | Unit tests                  |
| `pnpm lint`     | ESLint                      |
| `pnpm lint:fix` | ESLint with autofix         |
| `pnpm format`   | Prettier write              |
| `pnpm zip`      | Zip the extension           |

## Project notes

- See [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) for architecture details.
- Brief and marketplace scope: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) (extended in the plan to all current retail storefronts; excludes non-retail such as `amazon.cn`).
