// QA: walking around inside the walk-up. Tap the floor, tap the bed in the
// back room (walks round through the doorway), leave by the front door.
// Shots: test-results/walk-*.png
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 780 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:4173/?qa=1&class=poor&hour=11', { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year', { timeout: 30000 });
await page.select('#ob-year', '1995');
await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (el) => el.click());
await page.waitForSelector('#ob-start', { timeout: 10000 });
await page.$eval('#ob-start', (el) => el.click());
await wait(3500);
const pos = () => page.evaluate(() => window.__nyc.playerPos());
const tapFloor = async (x, z) => { const s = await page.evaluate((a, b) => window.__nyc.floorScreen(a, b), x, z); await page.mouse.click(s.x, s.y); };
const tapItem = async (uid) => { const s = await page.evaluate((u) => window.__nyc.itemScreen(u), uid); await page.mouse.click(s.x, s.y); };
const until = async (ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms && (await page.evaluate(() => window.__nyc.walking()))) await wait(100); };
console.log('start', JSON.stringify(await pos()));
await tapFloor(-1.5, 1.8); // living room, by the table
await wait(400);
await page.screenshot({ path: 'test-results/walk-1.png' });
await until(8000);
console.log('after floor tap', JSON.stringify(await pos()));
await tapItem('bed');
await wait(100);
console.log('route to bed', JSON.stringify(await page.evaluate(() => window.__nyc.indoorRoute())));
await wait(900);
await page.screenshot({ path: 'test-results/walk-2.png' });
await until(10000);
await wait(500);
console.log('at bed', JSON.stringify(await pos()), 'sheet:', await page.evaluate(() => document.querySelector('.sheet h2')?.textContent ?? null));
await page.screenshot({ path: 'test-results/walk-3.png' });
await page.$eval('.sheet .close', (el) => el.click()).catch(() => {});
await wait(500);
await page.$eval('[data-nav="leave"]', (el) => el.click());
await wait(1200);
await page.screenshot({ path: 'test-results/walk-4.png' });
for (let k = 0; k < 150 && (await page.evaluate(() => window.__nyc.mode())) === 'interior'; k++) await wait(100);
console.log('mode after leaving', await page.evaluate(() => window.__nyc.mode()));
console.log('errors:', [...new Set(errors)].join('\n') || 'none');
await browser.close();
