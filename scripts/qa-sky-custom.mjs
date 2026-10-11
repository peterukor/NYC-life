// QA: sky-map views of any real places.
//   AREA=brooklyn|bronx|queens (optional) VIEWS='[["name",lat,lon,dist],...]' node scripts/qa-sky-custom.mjs → test-results/sky-<name>.png
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
const TARGET = { brooklyn: 'fortGreenePark', bronx: 'yankeeStadium', queens: 'gantryPlaza' }[process.env.AREA ?? ''];
if (TARGET) {
  // Take the subway to Brooklyn first (answer any on-board event).
  await page.evaluate((t) => window.__nyc.travel(t), TARGET);
  await wait(600);
  await page.$eval('.sheet [data-act="subway"]', (el) => el.click());
  for (let i = 0; i < 80; i++) {
    if (await page.$('.modal .choice')) await page.$eval('.modal .choice', (el) => el.click());
    if (await page.$('.modal [data-act="ok"]')) await page.$eval('.modal [data-act="ok"]', (el) => el.click());
    if (await page.evaluate((a) => window.__nyc.mode() === 'city' && window.__nyc.state().location.area === a, process.env.AREA)) break;
    await wait(500);
  }
  await wait(2500);
}
await page.$eval('[data-nav="map"]', (el) => el.click());
await wait(1500);
const views = JSON.parse(process.env.VIEWS);
for (const [name, lat, lon, dist] of views) {
  await page.evaluate((a, b, c) => window.__nyc.skyLook(a, b, c), lat, lon, dist);
  await wait(3500);
  await page.screenshot({ path: `test-results/sky-${name}.png` });
}
console.log(errors.length ? errors : 'no errors');
await browser.close();
