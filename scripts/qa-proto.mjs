// QA: the 2.5D test map. node scripts/qa-proto.mjs → test-results/proto-*.png
// Needs `npx vite preview --port 4173` running.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
mkdirSync('test-results', { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
const [w, h] = (process.env.SIZE ?? '390x844').split('x').map(Number);
await page.setViewport({ width: w, height: h, deviceScaleFactor: Number(process.env.DPR ?? 2) });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.text()); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:4173/?proto', { waitUntil: 'load' });
await page.waitForFunction(() => window.__proto, { timeout: 60000 });
await wait(3000);
// VIEWS: [[name, x, z, viewHeight, walkToX?, walkToZ?, waitMs?], ...]
const VIEWS = JSON.parse(process.env.VIEWS ?? '[["start",null,null,150],["wide",220,160,430],["close",null,null,60]]');
for (const [name, x, z, vh, wx, wz, ms, tx, tz] of VIEWS) {
  await page.evaluate((x, z, vh, wx, wz, tx, tz) => {
    const p = window.__proto;
    if (tx != null) p.player.pos.set(tx, 0.25, tz);
    if (wx != null) p.tap(wx, wz);
    p.follow(x == null);
    if (x != null) { p.target.set(x, 0, z); }
    p.setZoom(vh);
  }, x, z, vh, wx ?? null, wz ?? null, tx ?? null, tz ?? null);
  await wait(ms ?? 1500);
  await page.screenshot({ path: `test-results/proto-${name}.png` });
}
console.log('stats', await page.$eval('#pt-stats', (e) => e.textContent));
console.log('errors', errors.length ? errors : 'none');
await browser.close();
