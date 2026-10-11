// QA: the AI-made houses and blocks in the city. node scripts/qa-ai.mjs → test-results/ai-*.png
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
mkdirSync('test-results', { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (/ai-models/.test(m.text())) console.log('console:', m.text()); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:4173/?qa=1&hour=13', { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year', { timeout: 60000 });
await page.select('#ob-year', '1995');
await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (el) => el.click());
await wait(2500);
await page.$eval('[data-nav="leave"]', (el) => el.click());
await wait(2000);
console.log('ai counts', JSON.stringify(await page.evaluate(() => window.__nyc.aiCounts())));
await page.$eval('[data-nav="map"]', (el) => el.click());
await wait(1500);
const plots = await page.evaluate(() => window.__nyc.plots());
const homes = plots.filter((p) => p.kind === 'home' && !p.id.includes(':lot:'));
const views = [['home-close', homes[0], 70], ['home-mid', homes[0], 150], ['home-2', homes[3] ?? homes[1], 110]];
for (const [name, p, dist] of views) {
  if (!p) continue;
  await page.evaluate((x, z, d) => window.__nyc.skyAt(x, z, d), p.x, p.z, dist);
  await wait(4000);
  await page.screenshot({ path: `test-results/ai-${name}.png` });
}
const tiles = (await page.evaluate(() => window.__nyc.aiSpots())).filter((s) => s.model.startsWith('block'));
for (const [i, t] of tiles.slice(0, 2).entries()) {
  await page.evaluate((x, z) => window.__nyc.skyAt(x, z, 140), t.x, t.z);
  await wait(4000);
  await page.screenshot({ path: `test-results/ai-tile-${i}.png` });
}
const VIEWS = JSON.parse(process.env.VIEWS ?? '[]');
for (const [name, lat, lon, dist] of VIEWS) {
  await page.evaluate((a, b, c) => window.__nyc.skyLook(a, b, c), lat, lon, dist);
  await wait(4000);
  await page.screenshot({ path: `test-results/ai-${name}.png` });
}
console.log(errors.length ? errors : 'no errors');
await browser.close();
