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
for (let i = 0; i < 6; i++) { await page.mouse.wheel({ deltaY: 300 }); await wait(150); }
await wait(3500);
await page.screenshot({ path: 'test-results/map3d-2-island.png' });
for (let i = 0; i < 9; i++) { await page.mouse.wheel({ deltaY: -300 }); await wait(150); }
await wait(3500);
await page.screenshot({ path: 'test-results/map3d-3-close.png' });
await page.$eval('[data-act="city"]', (el) => el.click());
await wait(1500);
await page.screenshot({ path: 'test-results/map3d-4-flat.png' });
console.log(errors.length ? errors : 'no errors');
await browser.close();
