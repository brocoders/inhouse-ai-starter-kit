// Photographs screens at phone and desktop width so a change can be looked at
// before it ships. Writes PNGs to .shots/ (ignored by Git).
//
//   VITE_MOCK_API=1 pnpm dev:frontend      in another shell
//   node frontend/scripts/shots.mjs        home, items and health
//   node frontend/scripts/shots.mjs /people /account
//   SHOTS_DARK=1 node frontend/scripts/shots.mjs
//
// A phone shot costs roughly 440 tokens to look at and a desktop shot 1,400,
// so take them once per finished screen, not after every edit.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base = process.env.SHOTS_BASE ?? 'http://127.0.0.1:5173';
const requested = process.argv.slice(2);
const routes = requested.length ? requested : ['/', '/items', '/health'];
const schemes = process.env.SHOTS_DARK ? ['light', 'dark'] : ['light'];
const viewports = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'phone', width: 390, height: 844 },
];
const out = '.shots';
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
try {
  for (const colorScheme of schemes) {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport, colorScheme, deviceScaleFactor: 1 });
      const page = await context.newPage();
      // A screen that crashes renders the error card, which looks fine in a
      // screenshot; the exception itself is what tells you why.
      page.on('pageerror', (error) =>
        console.error(`page error on ${page.url()}: ${error.message}`),
      );
      page.on('console', (message) => {
        if (message.type() === 'error')
          console.error(`console error on ${page.url()}: ${message.text()}`);
      });
      for (const route of routes) {
        await page.goto(base + route, { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);
        // Walk down the page so anything that loads on approach has loaded.
        // A virtualised list still shows only one viewport of rows in a
        // full-page shot — that is what virtualising means — so judge its
        // rows here and its length in the browser.
        await page.evaluate(async () => {
          const step = window.innerHeight * 0.8;
          for (let y = 0; y < document.body.scrollHeight; y += step) {
            window.scrollTo(0, y);
            await new Promise((resolve) => setTimeout(resolve, 60));
          }
          window.scrollTo(0, 0);
          await new Promise((resolve) => setTimeout(resolve, 200));
        });
        const name = route === '/' ? 'home' : route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-');
        const file = `${out}/${name}-${viewport.name}-${colorScheme}.png`;
        await page.screenshot({ path: file, fullPage: true });
        console.log(file);
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}
