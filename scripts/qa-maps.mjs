// QA: satellite zooms out to the whole island; pin info card on hover;
// pins hidden indoors after map travel. Shots: test-results/maps-*.png
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
await page.goto('http://localhost:4173/?qa=1&class=middle&hour=14&quality=low', { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year'); await page.select('#ob-year', '1995'); await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (e) => e.click()); await page.waitForSelector('#ob-start'); await page.$eval('#ob-start', (e) => e.click());
await wait(3000);
// Outside: hover a pin → info card.
await page.$eval('[data-nav="leave"]', (el) => el.click());
await wait(3500);
const pin = await page.$('.pin-layer .map-pin:not([hidden])');
if (pin) {
  const b = await pin.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await wait(300);
}
ok(!!(await page.$('.pin-info')), 'hovering a pin shows a card about the place');
await page.screenshot({ path: 'test-results/maps-pininfo.png' });
await page.mouse.move(5, 500);
await wait(200);
ok(!(await page.$('.pin-info')), 'card goes away when the mouse leaves');
// Street: max zoom-out is a little beyond the start.
await page.mouse.move(195, 300);
for (let i = 0; i < 20; i++) { await page.mouse.wheel({ deltaY: 400 }); await wait(120); }
await wait(1200);
const street = await page.evaluate(() => window.__nyc.camDist());
ok(street <= 192 && street > 120, `street zoom-out is capped close (distance ${street})`);
await page.screenshot({ path: 'test-results/maps-street-max.png' });
// Satellite: zoom all the way out.
await page.$eval('[data-nav="map"]', (el) => el.click()); await page.waitForSelector('.sheet.open');
await page.evaluate(() => [...document.querySelectorAll('.sheet.open button')].find((b) => /Satellite/.test(b.textContent)).click());
await wait(2500);
const open0 = await page.evaluate(() => window.__nyc.camDist());
ok(open0 > 1200 && open0 < 1450, `satellite opens fully zoomed out at ~0.26 of the island (distance ${open0})`);
await page.screenshot({ path: 'test-results/maps-open.png' });
await page.mouse.move(195, 420);
for (let i = 0; i < 8; i++) { await page.mouse.wheel({ deltaY: -400 }); await wait(200); }
await wait(1500);
const inZ = await page.evaluate(() => window.__nyc.camDist());
ok(inZ < 1150, `players can zoom in (distance ${inZ})`);
for (let i = 0; i < 20; i++) { await page.mouse.wheel({ deltaY: 400 }); await wait(200); }
await wait(2500);
const far = await page.evaluate(() => window.__nyc.camDist());
ok(far > 1200 && far < 1450, `satellite max zoom-out is ~0.26 of the island (distance ${far})`);
await page.screenshot({ path: 'test-results/maps-whole.png' });
await page.$eval('.map3d [data-act="close"]', (el) => el.click());
await wait(1500);
// Back inside: no street pins over the room.
await page.evaluate(() => window.__nyc.enterPlace(window.__nyc.state().home.placeId));
await wait(3500);
ok(await page.evaluate(() => { const l = document.querySelector('.pin-layer'); return !l || l.hidden; }), 'street pins hidden inside');
console.log('errors:', errors.join('\n') || 'none');
await browser.close();
process.exit(fails ? 1 : 0);
