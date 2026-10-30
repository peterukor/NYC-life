// QA: screenshots of the city map and satellite map with every place shown (test-results/mapshot-*.png).
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, protocolTimeout: 240000, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:4173/?qa=1&class=middle&hour=14&quality=medium', { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year'); await page.select('#ob-year', '1995'); await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (e) => e.click()); await page.waitForSelector('#ob-start'); await page.$eval('#ob-start', (e) => e.click());
await wait(3500);
await page.evaluate(() => { window.__nyc.state().cityMap = true; });
await page.addStyleTag({ content: '.hint-tip { display: none !important; }' });
const openMenu = async () => { await page.$eval('[data-nav="map"]', (el) => el.click()); await page.waitForSelector('.sheet.open'); await wait(500); };
await openMenu();
await page.screenshot({ path: 'test-results/mapshot-menu.png' });
await page.evaluate(() => [...document.querySelectorAll('.sheet.open button')].find((b) => /City map/.test(b.textContent)).click());
await wait(2500);
await page.screenshot({ path: 'test-results/mapshot-city.png' });
const zoomShot = async (x, y, n, name) => {
  await page.mouse.move(x, y);
  for (let i = 0; i < n; i++) { await page.mouse.wheel({ deltaY: -300 }); await wait(150); }
  await wait(1200);
  await page.screenshot({ path: `test-results/mapshot-${name}.png` });
  for (let i = 0; i < n + 4; i++) { await page.mouse.wheel({ deltaY: 300 }); await wait(100); }
  await wait(800);
};
await zoomShot(180, 470, 9, 'midtown');
await zoomShot(235, 700, 10, 'downtown');
await zoomShot(190, 210, 9, 'uptown');
console.log(errors.length ? errors : 'no page errors');
await browser.close();
