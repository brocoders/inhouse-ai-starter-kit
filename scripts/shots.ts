// Renders routes at phone and desktop width so a screen can be looked at
// before it ships. PNGs go to .shots/, which Git ignores.
//
//   pnpm dev                     in one shell
//   pnpm shots /things /things/1 in another
//   SHOTS_DARK=1 pnpm shots /    adds the dark variants
//   SHOTS_URL=http://127.0.0.1:4173 pnpm shots /   against a preview build
//
// Signing in: the screenshots are taken as whoever `DEV_AUTO_SIGN_IN_EMAIL`
// names in your .env. With that set the dev server treats every request as
// that person, so there is no login form to drive here and no password in this
// script. Without it you will photograph the sign-in screen — that is the fix,
// not a bug here.
//
// A phone shot costs roughly 440 tokens to look at and a desktop shot 1,400,
// so take them once per finished screen, not after every edit.
import { chromium } from 'playwright';
import type { Browser, BrowserContext } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base = (process.env.SHOTS_URL ?? 'http://127.0.0.1:5173').replace(/\/$/, '');
const routes = process.argv.slice(2).length ? process.argv.slice(2) : ['/'];
const schemes = process.env.SHOTS_DARK ? (['light', 'dark'] as const) : (['light'] as const);
// Desktop first, then the phone, so the last thing written is the one that
// matters most in this kit.
const viewports = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'phone', width: 390, height: 844 },
];
const out = '.shots';

function fileNameFor(route: string): string {
  const slug = route
    .replace(/^\//, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '');
  return slug || 'home';
}

function explain(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/Executable doesn't exist|browserType\.launch/.test(message)) {
    return `Playwright has no browser to drive yet. Run:\n\n  pnpm exec playwright install chromium\n\n(${message.split('\n')[0]})`;
  }
  if (/ERR_CONNECTION_REFUSED|ECONNREFUSED|net::ERR_/.test(message)) {
    return `Nothing is answering on ${base}. Start the app in another shell with \`pnpm dev\`, or point SHOTS_URL at wherever it runs.`;
  }
  return message;
}

let browser: Browser;
try {
  browser = await chromium.launch();
} catch (error) {
  console.error(explain(error));
  process.exit(1);
}

await mkdir(out, { recursive: true });
let failed = false;
try {
  for (const colorScheme of schemes) {
    for (const viewport of viewports) {
      const context: BrowserContext = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme,
        deviceScaleFactor: 1,
      });
      // Two ways of asking for dark, because the app may read either: the
      // attribute the design system switches on, and the preference the app
      // remembers between visits.
      if (colorScheme === 'dark') {
        await context.addInitScript(() => {
          try {
            window.localStorage.setItem('theme', 'dark');
          } catch {
            // A browser with storage blocked still gets the attribute below.
          }
          document.documentElement.setAttribute('data-theme', 'dark');
        });
      }
      const page = await context.newPage();
      // A screen that crashes renders the error boundary, which looks perfectly
      // fine in a screenshot; the exception is the only thing that says why.
      page.on('pageerror', (error) =>
        console.error(`page error on ${page.url()}: ${error.message}`),
      );
      page.on('console', (message) => {
        if (message.type() === 'error')
          console.error(`console error on ${page.url()}: ${message.text()}`);
      });
      for (const route of routes) {
        try {
          await page.goto(base + route, { waitUntil: 'networkidle' });
        } catch (error) {
          console.error(explain(error));
          failed = true;
          break;
        }
        // Charts and virtualised rows settle a frame or two after the network
        // goes quiet.
        await page.waitForTimeout(300);
        const suffix = colorScheme === 'dark' ? '-dark' : '';
        const file = `${out}/${fileNameFor(route)}-${viewport.name}${suffix}.png`;
        await page.screenshot({ path: file, fullPage: true });
        console.log(file);
      }
      await context.close();
      if (failed) break;
    }
    if (failed) break;
  }
} finally {
  await browser.close();
}
if (failed) process.exit(1);
