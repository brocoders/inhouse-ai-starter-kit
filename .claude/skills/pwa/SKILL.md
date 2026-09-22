---
name: pwa
description: Work on the installable app — the update prompt, what may and may not be cached, the cache headers the server must send, and installing it on a phone.
---

# The app on the home screen

The app installs like a native one. That convenience is also the trap: an
installed app keeps running the version it has until something tells it not to.

## The update prompt, and why it is a prompt

1. A new release is detected by the service worker; the app shows a small
   "A new version is ready — reload" prompt and reloads only when the person
   taps it.
2. It must not take over on its own. `skipWaiting` stays **false** and
   `clientsClaim` stays **off**. A worker that claims the open page swaps the
   files underneath a screen someone is typing into, and the half-loaded chunk
   it was about to fetch no longer exists.
3. So: the waiting worker does nothing until the page sends it `SKIP_WAITING`,
   which is what the prompt's button does.

## Never cache the API

The service worker precaches the shell — HTML, JS, CSS, icons — and nothing
else. **No API response is ever cached.** A stale record shown as current is
worse than a spinner, and this app is a system of record. TanStack Query
already holds responses in memory for the length of a visit; that is the
caching layer, and it is the right one because it knows when to refetch.

## The cache-header contract

The server must send, and a release is not correct without it:

- `/index.html`, `/sw.js`, `/manifest.webmanifest` — `Cache-Control: no-cache`.
  These are how a new release is discovered; cached, it never is.
- `/assets/*` — `Cache-Control: public, max-age=31536000, immutable`. Their
  names carry a content hash, so they are safe to keep forever.
- The manifest link carries `crossorigin="use-credentials"`, or the browser
  fetches it without the session cookie and the install fails on a 401.

## Install it on a phone

Both of you should have done this once before a release:

1. `pnpm dev`, then open the app on your phone on the same network — the app
   must be on HTTPS or on localhost for any of this to work.
2. iPhone: Share → Add to Home Screen. Android: the browser offers Install.
3. Open it from the home screen. Check the icon, the name, that there is no
   browser bar, and that pull-to-refresh works.
4. Release a change and confirm the update prompt appears without a reinstall.

Report an update problem as what the person sees: "the app kept showing
yesterday's numbers until it was reinstalled."
