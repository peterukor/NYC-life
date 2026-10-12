// QA: screenshots of the 2D cartoon map viewer at several places and zooms.
//   npx vite build --config vite.map2d.config.ts && node scripts/qa-map2d.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
mkdirSync('test-results/map2d', { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: Number(process.env.W ?? 390), height: Number(process.env.H ?? 844), deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => (m.type() === 'error' ? errors.push(m.text()) : null));
await page.goto('file://' + resolve('dist-map2d/map2d.html'), { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 800));
const shots = JSON.parse(process.env.SHOTS ?? '[["midtown",40,-150,0.9],["whole",60,-600,0.12],["harlem",-60,-1500,0.7],["village",80,700,0.9],["fidi",120,1150,1.0],["cpark",30,-650,0.35],["close",-20,-60,2.2],["shore-west",-280,-900,1.6]]');
for (const [name, x, z, s] of shots) {
  const t0 = Date.now();
  await page.evaluate((a, b, c) => window.__map2d.view(a, b, c), x, z, s);
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: `test-results/map2d/${name}.png` });
  console.log(name, Date.now() - t0, 'ms', JSON.stringify(await page.evaluate(() => window.__map2d.stats?.())));
}
console.log('errors:', errors.join('\n') || 'none');
await browser.close();
