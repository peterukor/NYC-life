// QA: the 2D map (whole area + zoomed in) → test-results/map-*.png
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:4173/?qa=1&hour=11', { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year', { timeout: 30000 });
await page.select('#ob-year', '1995');
await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (el) => el.click());
await wait(2500);
await page.$eval('[data-nav="map"]', (el) => el.click());
await wait(1500);
await page.screenshot({ path: 'test-results/map-area.png' });
const box = await (await page.$('.map canvas')).boundingBox();
await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5);
for (let i = 0; i < 9; i++) {
  await page.mouse.wheel({ deltaY: -100 });
  await wait(120);
}
await wait(600);
await page.screenshot({ path: 'test-results/map-zoomed.png' });
await browser.close();
