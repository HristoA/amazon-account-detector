# Amazon Account Detector — Take-Home Exercise

Build a **Chrome Manifest V3** extension that detects which Amazon account is logged in on a chosen marketplace, without disrupting the user’s browsing.

## Goal

The extension should:

1. Let the user pick an Amazon marketplace from a popup dropdown.
2. Determine whether they are logged in on that marketplace, and with which email when they are.
3. Do this without interfering with tabs the user is actively using.
4. Keep cached auth state so opening the popup can show useful information quickly.
5. Stay correct when the user logs out or their session expires.

Syncing with a server is outside the scope of this task.

## Supported marketplaces

Support at least these five:

| Region         | Domain         |
| -------------- | -------------- |
| United States  | `amazon.com`   |
| United Kingdom | `amazon.co.uk` |
| Germany        | `amazon.de`    |
| Italy          | `amazon.it`    |
| France         | `amazon.fr`    |

## Requirements

### Popup

- Toolbar popup with a marketplace dropdown.
- When the user selects a marketplace, the extension should check (or surface a check for) that marketplace and show:
  - logged in or not
  - account email when logged in
- Show last-known / cached state when available, and make freshness clear enough that the user is not misled by stale data.

### Detection without disruption

- Checking login / email must not disturb focused browsing.
- Prefer the least disruptive approach you can make work reliably. Be prepared to explain your choice in the follow-up conversation.

### Caching and freshness

- Cache auth state per marketplace.
- Think about when to refresh in the background vs when the user opens the popup or changes marketplace.
- Handle logout and session expiry so the UI does not keep showing a logged-in email forever after the session is gone.

## Reference

To resolve the account email, use Amazon’s account switcher / sign-in page for the chosen marketplace. Build the URL from:

```
https://www.amazon<SUFFIX>/ap/signin?openid.pape.max_auth_age=0&openid.return_to=https%3A%2F%2Fwww.amazon<SUFFIX>%2F%3F%26ref_%3Dnav_youraccount_switchacct&openid.identity=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.assoc_handle=usflex&openid.mode=checkid_setup&openid.claimed_id=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0&ignoreAuthState=1&_encoding=UTF8
```

Replace `<SUFFIX>` with `.com`, `.co.uk`, `.de`, `.it`, or `.fr` as appropriate. `openid.assoc_handle` may need to vary by marketplace — figure out what works.

## Stack

Use whatever libraries or tooling you prefer for a Chrome MV3 extension. Be ready to explain why you chose them.

## Deliverable

Send a link to a GitHub repository (public or private with access granted) that:

- Loads as an unpacked Chrome MV3 extension
- Includes a short README with install / load steps and how to try the marketplace check
- Contains the source you want reviewed
