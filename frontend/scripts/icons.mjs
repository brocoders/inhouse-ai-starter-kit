// Renders frontend/public/icon.svg to the PNG sizes a web-app manifest needs,
// plus the one iOS asks for. Run after changing the icon:
//
//   node frontend/scripts/icons.mjs
//
// Playwright's Chromium is already installed for the screenshots, so there is
// no image library to add for the sake of three files.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');
const svg = readFileSync(join(publicDir, 'icon.svg'), 'utf8');

const browser = await chromium.launch();
try {
  for (const size of [180, 192, 512]) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${svg.replace(
        /width="512" height="512"/,
        `width="${size}" height="${size}"`,
      )}</body></html>`,
    );
    const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`;
    await page.screenshot({ path: join(publicDir, name), omitBackground: true });
    console.log(`frontend/public/${name}`);
    await page.close();
  }
} finally {
  await browser.close();
}
