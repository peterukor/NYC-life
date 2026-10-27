// QA: the design menu by taps: paint a wall, lay a floor, buy a lamp and
// drop it, recolour a sofa, apply a style. Shots: test-results/flow-*.png
import puppeteer from 'puppeteer-core';
const cls = process.env.CLASS ?? 'rich';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await browser.newPage();
await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 1, hasTouch: false });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:4173/?qa=1&class=${cls}&hour=11&quality=medium`, { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year', { timeout: 30000 });
await page.select('#ob-year', '1995');
await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (el) => el.click());
await page.waitForSelector('#ob-start', { timeout: 10000 });
await page.$eval('#ob-start', (el) => el.click());
await wait(3000);
await page.evaluate(() => { window.__nyc.state().money = 5_000_000; });
const home = await page.evaluate(() => window.__nyc.state().home.placeId);
await page.evaluate((h) => window.__nyc.enterPlace(h), home);
await wait(5000);
const shot = (n) => page.screenshot({ path: `test-results/flow-${n}.png` });
const tapWorld = async (x, y, z) => {
  const p = await page.evaluate((x, y, z) => { const v = window.__nyc.floorScreen(x, z); return v; }, x, y, z);
  await page.mouse.click(p.x, p.y - (y ? 40 : 0));
};
// Open design from the dock.
await page.$eval('[data-nav="storage"]', (el) => el.click());
await wait(1200);
// Walls: tap the living room floor area near the left wall to pick the living room, then a wall face.
await page.$eval('[data-tab="walls"]', (el) => el.click());
await wait(600);
await tapWorld(-8.8, 1, 4.6);
await wait(500);
const target = await page.$eval('.design-target', (el) => el.textContent);
console.log('target after wall tap:', target);
await page.$eval('[data-wall="damask"]', (el) => el.click());
await wait(800);
await shot('1-damask');
console.log('style', JSON.stringify(await page.evaluate(() => window.__nyc.homeStyle())));
// Floors: the living room in marble.
await page.$eval('[data-tab="floors"]', (el) => el.click());
await wait(500);
await tapWorld(-4, 0, 4);
await wait(400);
await page.$eval('[data-floor="marble"]', (el) => el.click());
await wait(800);
await shot('2-marble');
// Buy a chandelier: it appears and move mode starts.
await page.$eval('[data-tab="buy"]', (el) => el.click());
await wait(400);
await page.$eval('[data-cat="lights"]', (el) => el.click());
await wait(1500);
await page.$eval('[data-buy="crystalChandelier"]', (el) => el.click());
await wait(1000);
await shot('3-moving');
const bar = await page.$('.move-bar');
console.log('move bar', !!bar);
await page.$eval('.move-bar [data-mv="done"]', (el) => el.click());
await wait(800);
// Tap the sofa and recolour it.
const sofa = await page.evaluate(() => { const it = window.__nyc.homeItems().find((i) => i.uid === 'sofa'); return it; });
const sp = await page.evaluate((s) => window.__nyc.floorScreen(s.x, s.z), sofa);
await page.mouse.click(sp.x, sp.y - 12);
await wait(700);
const head = await page.$eval('.design-body', (el) => el.textContent.slice(0, 60));
console.log('piece panel:', head);
const dot = await page.$('[data-pa="#c8553d"]');
if (dot) await dot.click();
await wait(700);
await shot('4-sofa');
// A whole style.
await page.$eval('[data-tab="styles"]', (el) => el.click());
await wait(800);
await page.$eval('[data-preset="deco"]', (el) => el.click());
await wait(1200);
await shot('5-deco');
await page.$eval('[data-done]', (el) => el.click());
await wait(800);
await shot('6-done');
console.log('saved style rooms', JSON.stringify(await page.evaluate(() => window.__nyc.state().homeStyles)).slice(0, 200));
console.log('money left', await page.evaluate(() => window.__nyc.state().money));
console.log(errors.length ? `ERRORS ${JSON.stringify(errors)}` : 'no page errors');
await browser.close();
