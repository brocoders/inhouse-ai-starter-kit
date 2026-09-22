// Keeping an installed app on the release the server is running.
//
// The app installs to a phone's home screen, and an installed app is resumed
// far more often than it is started. iOS in particular keeps the same document
// alive for days, so "reload the page" — the browser's own answer to a new
// release — is a thing nobody ever does. Without what is below, the reliable
// way to get a new release onto a phone is to delete the app and install it
// again.
//
// Two things have to be true.
//
// **The app has to notice.** vite-plugin-pwa's own registration script runs on
// the document's `load` event and never again, and a resumed app fires no
// `load`. So the check is driven from here instead: on an interval while the
// app is in the foreground, and whenever it comes back after being away.
//
// **Nothing may change under a screen in use.** The worker is built with
// `registerType: 'prompt'`, so a new worker installs and then waits: the
// document keeps the files it started with until the person says go.
import { useSyncExternalStore } from 'react';

/** Re-ask while the app is open. Long, because a release is a rare event. */
const POLL_INTERVAL_MS = 30 * 60 * 1000;

let registration: ServiceWorkerRegistration | null = null;
let ready = false;
const listeners = new Set<() => void>();

function announce(): void {
  if (ready) return;
  ready = true;
  for (const listener of listeners) listener();
}

/** True once a newer release has finished installing and is waiting its turn. */
export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => ready,
    () => false,
  );
}

function watch(target: ServiceWorkerRegistration): void {
  // A worker that finished installing while the app was in the background is
  // already sitting in `waiting` by the time anything here runs.
  if (target.waiting && navigator.serviceWorker.controller) announce();
  target.addEventListener('updatefound', () => {
    const installing = target.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      // With no controller this is the first install on this device, which is
      // not an update and must not put a prompt in front of anyone.
      if (installing.state === 'installed' && navigator.serviceWorker.controller) announce();
    });
  });
}

/**
 * Registers the worker and starts watching for a newer release. Safe to call
 * more than once; only the first call does anything. Returns a function that
 * stops the watching, for React's own tidying.
 */
export function startUpdateWatch(): () => void {
  // There is no worker in development — the file does not exist and the dev
  // server answers with the page, which the browser refuses as a script.
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return () => {};
  if (!registration) {
    void navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((created) => {
        registration = created;
        watch(created);
      })
      .catch(() => {
        // An install can fail for reasons nobody can act on — a private
        // window, a policy, a 503 during a release. The app works without a
        // worker; it only loses offline start-up.
      });
  }
  const check = () => void registration?.update().catch(() => {});
  const timer = window.setInterval(check, POLL_INTERVAL_MS);
  // Coming back to the app is the moment a release is most likely to have
  // happened since anyone last looked.
  const onVisible = () => {
    if (document.visibilityState === 'visible') check();
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/**
 * Hands the page over to the new release. The waiting worker is told to take
 * over and the reload happens once it has; with no worker involved a plain
 * reload is enough, because the shell is never cached and always comes from
 * the server.
 */
export function applyUpdate(): void {
  const waiting = registration?.waiting;
  if (!waiting) {
    window.location.reload();
    return;
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {
    once: true,
  });
  waiting.postMessage({ type: 'SKIP_WAITING' });
  // If the worker was already past the point where it listens, no
  // controllerchange ever arrives. Reloading regardless costs a few seconds.
  window.setTimeout(() => window.location.reload(), 3000);
}
