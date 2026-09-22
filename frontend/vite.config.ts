import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { VitePWA } from 'vite-plugin-pwa';

// The name shown on the home screen and in the browser tab. One value, read
// here at build time, so renaming the app is one line in .env and not a search
// across the source.
const appName = process.env.VITE_APP_NAME ?? 'InHouse';

export default defineConfig({
  // The config lives beside the code it builds, so the project root is this
  // folder; the build lands beside the server's in dist/.
  root: import.meta.dirname,
  build: { outDir: '../dist/frontend', emptyOutDir: true },
  // Aliases are declared once, in tsconfig.json, and both the editor and the
  // bundler read them from there. Two lists would drift.
  resolve: { tsconfigPaths: true },
  server: {
    // The API is same-origin in production — Better Auth's cookies are
    // same-origin only — so development has to look the same to the browser.
    // Vite serves the screens and passes everything the server owns through.
    proxy: {
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: false },
      // The server's probes; the app's own status screen lives at /system so the
      // two never collide.
      '/health': { target: 'http://127.0.0.1:3000', changeOrigin: false },
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
