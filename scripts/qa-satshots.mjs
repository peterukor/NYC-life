// QA: satellite (3D) map screenshots: whole island, then zoomed in (test-results/satshot-*.png).
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, protocolTimeout: 300000, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto(`http://localhost:4173/?qa=1&class=middle&hour=${process.env.HOUR ?? 14}&quality=medium`, { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year'); await page.select('#ob-year', '1995'); await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (e) => e.click()); await page.waitForSelector('#ob-start'); await page.$eval('#ob-start', (e) => e.click());
await wait(3500);
await page.evaluate(() => { window.__nyc.state().cityMap = true; });
await page.addStyleTag({ content: '.hint-tip { display: none !important; }' });
await page.$eval('[data-nav="map"]', (el) => el.click()); await page.waitForSelector('.sheet.open'); await wait(500);
await page.evaluate(() => [...document.querySelectorAll('.sheet.open button')].find((b) => /Satellite/.test(b.textContent)).click());
await wait(9000);
await page.screenshot({ path: 'test-results/satshot-whole.png' });
console.log('whole', await page.evaluate(() => window.__nyc.camDist()));
// Fixed views over real spots (lat, lon, camera distance).
const views = [['island', 40.775, -73.970, 2600], ['uptown', 40.805, -73.955, 1100], ['centralpark', 40.781, -73.966, 900], ['midtown', 40.756, -73.985, 650], ['downtown', 40.718, -73.995, 900]];
for (const [name, lat, lon, d] of views) {
  await page.evaluate((a, b, c) => window.__nyc.skyLook(a, b, c), lat, lon, d);
  await wait(7000);
  await page.screenshot({ path: `test-results/satshot-${name}.png` });
  console.log(name, await page.evaluate(() => window.__nyc.camDist()));
}
console.log(errors.length ? errors : 'no page errors');
await browser.close();
