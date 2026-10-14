// QA: zoomed-in shots of busy rooms (visitors, emoji pops, club lights).
// Shots: test-results/lively-<place>.png
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 780 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:4173/?qa=1&class=poor&hour=22&quality=high', { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year'); await page.select('#ob-year', '1995'); await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (e) => e.click()); await page.waitForSelector('#ob-start'); await page.$eval('#ob-start', (e) => e.click());
await wait(3500);
for (const [id, x, y] of [['velvetRoom', 0, -0.1], ['theStoop', -0.1, 0.1], ['barrioDeli', 0.3, 0.3]]) {
  await page.evaluate((p) => window.__nyc.enterPlace(p), id);
  await wait(5000);
  await page.evaluate((a, b) => window.__nyc.zoomAt(2.2, a, b), x, y);
  await wait(3000);
  await page.screenshot({ path: `test-results/lively-${id}.png` });
}
console.log('errors:', [...new Set(errors)].join('\n') || 'none');
await browser.close();
