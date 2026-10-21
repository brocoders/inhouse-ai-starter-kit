import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { VitePWA } from 'vite-plugin-pwa';

// The name shown on the home screen, in the browser tab and in the app's own
// words. One value, read here at build time from inhouse.config.json — the
// file `/setup` fills in — and handed to index.html (`%VITE_APP_NAME%`) and to
// en.ts (`import.meta.env.VITE_APP_NAME`), so renaming the app is one line in
// one file. `VITE_APP_NAME` in the environment still wins, for a build that
// wants a different name without touching the file. The server build reads
// the same file, which the release archive carries.
function configuredName(): string {
  try {
    const file = path.resolve(import.meta.dirname, '..', 'inhouse.config.json');
    const name = JSON.parse(readFileSync(file, 'utf8')).appName;
    return typeof name === 'string' && name.trim() ? name.trim() : 'InHouse';
  } catch {
    // No file yet (a clone before /setup): the kit's own name until there is one.
    return 'InHouse';
  }
}
const appName = (process.env.VITE_APP_NAME ??= configuredName());

export default defineConfig({
  // The config lives beside the code it builds, so the project root is this
  // folder; the build lands beside the server's in dist/.
  root: import.meta.dirname,
  build: { outDir: '../dist/frontend', emptyOutDir: true },
  // Aliases are declared once, in tsconfig.json, and both the editor and the
  // bundler read them from there. Two lists would drift.
  resolve: { tsconfigPaths: true },
  server: {
    // Listen on every interface, not only localhost: the first thing a creator
    // does with a screen is open it on their phone over the same Wi-Fi.
    host: true,
    // The API is same-origin in production — Better Auth's cookies are
    // same-origin only — so development has to look the same to the browser.
    // Vite serves the screens and passes everything the server owns through.
    // The server listens on PORT (3000 unless .env or .claude/launch.json says
    // otherwise); reading the same variable here keeps the two in step when a
    // second checkout on the same machine has to use another port.
    proxy: {
      '/api': { target: `http://127.0.0.1:${process.env.PORT ?? 3000}`, changeOrigin: false },
      // The server's probes; the app's own status screen lives at /system so the
      // two never collide.
      '/health': { target: `http://127.0.0.1:${process.env.PORT ?? 3000}`, changeOrigin: false },
    },
  },
  plugins: [
    // Routes are the files under src/routes; this generates the route tree
    // from them. It has to run before react() so that React sees the code it
    // has already split, not the other way round.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    // Installable on the phone. The worker precaches the built static files
    // only; nothing under /api is ever cached or served offline, so the app's
    // records stay out of browser storage, and navigations always go to the
    // server, which serves the app for every screen route.
    VitePWA({
      // A new worker installs and then waits. `autoUpdate` is wrong for an
      // app people keep open: it claims the page the moment the new worker
      // activates and drops the old precache with it, after which the next
      // lazily loaded screen asks the server for a hashed file the release has
      // already removed. We ask instead, and nothing under a screen in use
      // changes until the person says go — see src/lib/app-update.ts.
      registerType: 'prompt',
      // The app registers the worker itself. The script this would otherwise
      // inject registers on the document's `load` event and never again, and
      // an installed app is resumed rather than started, so it fires almost
      // never — which is how a new release comes to need a reinstall.
      injectRegister: false,
      includeAssets: ['icon.svg', 'fonts/*.woff2'],
      manifest: {
        name: appName,
        short_name: appName,
        description: 'A private system for a team that knows each other.',
        start_url: '/',
        display: 'standalone',
        background_color: '#f9fafb',
        theme_color: '#3b82f6',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // No navigation is ever served from the cache, so the shell is not
        // precached either: html is left out of the patterns deliberately.
        // The server answers screen routes with index.html but has no
        // /index.html route of its own, so precaching it fails the whole
        // install with bad-precaching-response.
        navigateFallback: null,
        globPatterns: ['**/*.{js,css,woff2,svg,png}'],
        // With skipWaiting off, workbox gives the worker a message listener
        // instead, which is how the Update button hands the page over. The old
        // release's precache goes at that point and not before.
        skipWaiting: false,
        clientsClaim: false,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
