// QA: venue interiors (café, bar, bodega, office, pizza, comedy) → test-results/venue-*.png
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
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
for (const id of ['beanMachine', 'diveBar', 'bodegaHk', 'midtownTower', 'sliceJoint', 'comedyCellar']) {
  await page.evaluate((i) => window.__nyc.enterPlace(i), id);
  await wait(2000);
  await page.screenshot({ path: `test-results/venue-${id}.png` });
}
await page.evaluate(() => window.__nyc.openObject('counter'));
await wait(700);
await page.screenshot({ path: 'test-results/venue-counter-sheet.png' });
console.log('errors:', errors.join('\n') || 'none');
await browser.close();
