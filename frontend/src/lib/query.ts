// How the screens hold what the server told them, and the one way to make all
// of it stale again.
import { QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Half a minute. Moving between screens should not re-ask for what was
      // just fetched, and a person who wants the truth this second has the
      // Refresh button or the pull-down gesture.
      staleTime: 30_000,
      gcTime: 30 * 60 * 1000,
      // Refetching on focus makes a phone re-read everything each time it
      // wakes, which is a lot of requests for a screen nobody looked at. The
      // shell refreshes deliberately instead.
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchInterval: false,
      // A retry hides a broken server behind a spinner; failures are shown.
      retry: false,
    },
    mutations: { retry: false },
  },
});

// A number that goes up every time the data goes stale. Screens that read the
// server outside the query cache — an effect that fetches, a chart that
// samples — put it in their dependencies, so one refresh reaches every screen
// rather than only the half that uses the cache.
let refreshSignal = 0;
const listeners = new Set<() => void>();

export function useRefreshSignal(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => refreshSignal,
    () => refreshSignal,
  );
}

/**
 * Everything on screen is out of date: read it again. Called from the Refresh
 * button, from the pull-down gesture, and after a save. The promise settles
 * when the cached queries have answered.
 */
export function invalidateAll(): Promise<void> {
  refreshSignal += 1;
  for (const listener of listeners) listener();
  return queryClient.invalidateQueries();
}

/** Signing out, or a session that has expired: nothing may survive it. */
export function clearCache(): void {
  queryClient.clear();
}
