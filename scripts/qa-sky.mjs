// QA: sky-map views of real places (waterfront, Central Park, Brooklyn).
//   node scripts/qa-sky.mjs → test-results/sky-*.png
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
mkdirSync('test-results', { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:4173/?qa=1&class=poor&hour=13', { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year', { timeout: 30000 });
await page.select('#ob-year', '1995');
await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (el) => el.click());
await page.waitForSelector('#ob-start', { timeout: 10000 });
await page.$eval('#ob-start', (el) => el.click());
await wait(2500);
await page.$eval('[data-nav="leave"]', (el) => el.click());
await wait(2000);
await page.$eval('[data-nav="map"]', (el) => el.click());
await wait(1500);
const views = [['hudson', 40.765, -73.998, 420], ['park', 40.78, -73.965, 900], ['midtown', 40.756, -73.985, 650]];
for (const [name, lat, lon, dist] of views) {
  await page.evaluate((a, b, c) => window.__nyc.skyLook(a, b, c), lat, lon, dist);
  await wait(3500);
  await page.screenshot({ path: `test-results/sky-${name}.png` });
}
console.log(errors.length ? errors : 'no errors');
await browser.close();
