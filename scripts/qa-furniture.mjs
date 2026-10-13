// QA: furniture fitting. Lists pieces that don't fit in every home's starting
// layout, then drags pieces around the walk-up: onto other furniture (red,
// slides back) and to an open spot (green, stays). Shots: test-results/move-*.png
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
await wait(3000);
for (const home of ['hkStudio', 'wburgLoft', 'shelter', 'sharedApt']) {
  await page.evaluate((h) => window.__nyc.enterPlace(h), home);
  await wait(1800);
  console.log(home, JSON.stringify(await page.evaluate(() => window.__nyc.furnitureClashes())));
}
const at = (uid) => page.evaluate((u) => window.__nyc.furnitureAt(u), uid);
const scr = (uid) => page.evaluate((u) => window.__nyc.itemScreen(u), uid);
const floor = (x, z) => page.evaluate((a, b) => window.__nyc.floorScreen(a, b), x, z);
async function drag(uid, to, shot) {
  const a = await scr(uid);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i++) { await page.mouse.move(a.x + ((to.x - a.x) * i) / steps, a.y + ((to.y - a.y) * i) / steps); await wait(30); }
  await wait(300);
  if (shot) await page.screenshot({ path: `test-results/move-${shot}.png` });
  await page.mouse.up();
  await wait(500);
}
// The couch: onto the bed (red, goes back), then to an open spot by the window wall.
await page.evaluate(() => window.__nyc.moveFurniture('couch'));
await wait(600);
const before = await at('couch');
console.log('couch before', JSON.stringify(before));
const bed = await at('bed');
await drag('couch', await floor(bed.x, bed.z), 'red');
console.log('after drop on bed', JSON.stringify(await at('couch')));
await drag('couch', await floor(before.x - 0.6, before.z + 0.4), 'green');
console.log('after drop in open', JSON.stringify(await at('couch')));
// Through the wall into the bedroom.
await drag('couch', await floor(0, -1.6), 'wall');
console.log('after drop on wall', JSON.stringify(await at('couch')));
await page.evaluate(() => window.__nyc.doneMoving(true));
await wait(400);
// A poster: drag it into the middle of the room; it snaps to the nearest wall.
await page.evaluate(() => window.__nyc.moveFurniture('posters2'));
await wait(400);
await drag('posters2', await floor(1.5, 0.5), 'poster');
console.log('poster', JSON.stringify(await at('posters2')));
await page.evaluate(() => window.__nyc.doneMoving(true));
await wait(400);
await page.screenshot({ path: 'test-results/move-done.png' });
console.log('errors:', [...new Set(errors)].join('\n') || 'none');
await browser.close();
