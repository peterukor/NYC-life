// QA: plots for rent: ad blocks, Harlem, islands and the rent sheets.
//   node scripts/qa-plots.mjs → test-results/plots-*.png
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
mkdirSync('test-results', { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:4173/?qa=1&hour=13', { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year', { timeout: 30000 });
await page.select('#ob-year', '1995');
await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (el) => el.click());
await wait(2500);
await page.$eval('[data-nav="leave"]', (el) => el.click());
await wait(2000);
await page.$eval('[data-nav="map"]', (el) => el.click());
await wait(1500);
const boards = await page.evaluate(() => window.__nyc.bigBoards());
const plots = await page.evaluate(() => window.__nyc.plots());
const ad = plots.find((p) => p.kind === 'ad');
const shots = [['harlem', 'look', 40.812, -73.948, 900], ['islands', 'look', 40.775, -73.94, 1300], ['adblock', 'at', ad.x, ad.z, 150], ['downtown', 'look', 40.712, -74.0, 800]];
for (const [name, how, a, b, dist] of shots) {
  await page.evaluate((how, a, b, dist) => (how === 'look' ? window.__nyc.skyLook(a, b, dist) : window.__nyc.skyAt(a, b, dist)), how, a, b, dist);
  await wait(3500);
  await page.screenshot({ path: `test-results/plots-${name}.png` });
}
for (const kind of ['ad', 'home', 'island']) {
  const p = plots.find((x) => x.kind === kind);
  await page.evaluate((id) => window.__nyc.plot(id), p.id);
  await wait(900);
  if (kind === 'ad') await page.$$eval('.plot-unit', (els) => els.slice(0, 2).forEach((e) => e.click()));
  await wait(300);
  await page.screenshot({ path: `test-results/plots-sheet-${kind}.png` });
  await page.$eval('.sheet .close', (el) => el.click());
  await wait(500);
}
console.log(plots.length, 'plots;', errors.length ? errors : 'no errors');
await browser.close();
