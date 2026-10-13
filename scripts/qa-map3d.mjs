// QA: the sky map (3D city from above) and the flat whole-borough map.
//   node scripts/qa-map3d.mjs → test-results/map3d-*.png
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
mkdirSync('test-results', { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto(`http://localhost:4173/?qa=1&hour=13${process.env.Q ? `&quality=${process.env.Q}` : ''}`, { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year', { timeout: 30000 });
await page.select('#ob-year', '1995');
await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (el) => el.click());
await wait(2500);
await page.$eval('[data-nav="leave"]', (el) => el.click());
await wait(2500);
await page.$eval('[data-nav="map"]', (el) => el.click());
await wait(4000);
await page.screenshot({ path: 'test-results/map3d-1-sky.png' });
// Zoom out to see the island.
const box = await (await page.$('canvas')).boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
for (let i = 0; i < 14; i++) { await page.mouse.wheel({ deltaY: 300 }); await wait(150); }
await wait(3500);
await page.screenshot({ path: 'test-results/map3d-2-island.png' });
for (let i = 0; i < 9; i++) { await page.mouse.wheel({ deltaY: -300 }); await wait(150); }
await wait(3500);
await page.screenshot({ path: 'test-results/map3d-3-close.png' });
await page.$eval('[data-act="city"]', (el) => el.click());
await wait(1500);
await page.screenshot({ path: 'test-results/map3d-4-whole-city.png' });
// Tap Manhattan on the whole-city map, then Brooklyn.
const tapAt = async (lat, lon) => {
  const p = await page.evaluate(([la, lo]) => window.__mapPoint?.(la, lo), [lat, lon]);
  if (p) await page.mouse.click(p.x, p.y);
};
await tapAt(40.78, -73.965);
await wait(1200);
await page.screenshot({ path: 'test-results/map3d-5-manhattan.png' });
await page.$eval('.map [data-act="gang"]', (el) => el.click());
await page.$eval('.map [data-act="city"]', (el) => el.click());
await wait(900);
await tapAt(40.65, -73.95);
await wait(1200);
await page.screenshot({ path: 'test-results/map3d-6-brooklyn-gangs.png' });
const box2 = await (await page.$('.map canvas')).boundingBox();
await page.mouse.move(box2.x + box2.width * 0.3, box2.y + box2.height * 0.3);
for (let i = 0; i < 8; i++) { await page.mouse.wheel({ deltaY: -200 }); await wait(100); }
await wait(800);
await page.screenshot({ path: 'test-results/map3d-7-brooklyn-zoom.png' });
console.log(errors.length ? errors : 'no errors');
await browser.close();
