import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { setSessionLostHandler } from './lib/api';
import './index.css';

const router = createRouter({
  routeTree,
  // A screen that has not answered yet should not flash a spinner for the
  // fifty milliseconds a local answer takes.
  defaultPendingMs: 300,
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// The session can end while the app is open — it expires, or an owner
// deactivates someone. lib/api.ts empties the cache and calls this.
setSessionLostHandler(() => {
  if (router.state.location.pathname !== '/sign-in') void router.navigate({ to: '/sign-in' });
});

async function start() {
  // Development only, and only when asked: a server made of memory so the
  // screens can be opened before the real one exists. The condition is false
  // in a production build, so the bundler drops the import with it.
  if (import.meta.env.DEV && import.meta.env.VITE_MOCK_API === '1') {
    const { installMockApi } = await import('./lib/mock-api');
    installMockApi();
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}

void start();
