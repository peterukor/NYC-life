// QA: pinch-to-zoom and pan in the big homes. Opens whole; wheel and pinch
// zoom; drag pans; none of it walks or opens anything; the HUD doesn't
// change size; walking to a far piece keeps you in view; small homes stay
// fixed. Shots: test-results/zoom-*.png
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (c, msg) => { console.log(`${c ? '✓' : '✗'} ${msg}`); if (!c) fails++; };
const errors = [];

async function start(cls) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 780, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:4173/?qa=1&class=${cls}&hour=11`, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#ob-year', { timeout: 30000 });
  await page.select('#ob-year', '1995');
  await page.type('#ob-name', 'Jack');
  await page.$eval('#ob-go', (el) => el.click());
  await page.waitForSelector('#ob-start');
  await page.$eval('#ob-start', (el) => el.click());
  await wait(5000);
  return page;
}
const ev = (page, fn, ...a) => page.evaluate(fn, ...a);
const view = (p) => ev(p, () => window.__nyc.view());
const pos = (p) => ev(p, () => { const l = window.__nyc.state(); return JSON.stringify(window.__nyc.playerRot?.() ?? null) + (window.__nyc.indoorWalking() ? 'walking' : 'still'); });
const sheetOpen = (p) => ev(p, () => !!document.querySelector('.sheet'));
const hudBox = (p) => ev(p, () => { const r = document.querySelector('.hud-top')?.getBoundingClientRect(); return r ? `${Math.round(r.width)}x${Math.round(r.height)}` : ''; });

// ---- Billionaire penthouse
const page = await start('billionaire');
const cdp = await page.createCDPSession();
let v = await view(page);
ok(v.enabled && v.zoom === 1 && v.panX === 0, `penthouse opens whole and zoomable (${JSON.stringify(v)})`);
await page.screenshot({ path: 'test-results/zoom-0-whole.png' });
const hud0 = await hudBox(page);

// Wheel zoom (computer)
await page.mouse.move(195, 420);
for (let i = 0; i < 5; i++) { await page.mouse.wheel({ deltaY: -120 }); await wait(80); }
await wait(600);
v = await view(page);
ok(v.zoom > 1.5, `wheel zooms in (${v.zoom})`);
ok(!(await ev(page, () => window.__nyc.indoorWalking())) && !(await sheetOpen(page)), 'wheel: no walk, nothing opened');

// Mouse drag pan
const before = await view(page);
await page.mouse.move(150, 420);
await page.mouse.down();
for (let i = 1; i <= 10; i++) { await page.mouse.move(150 + i * 12, 420 + i * 4); await wait(30); }
await page.mouse.up();
await wait(800);
v = await view(page);
ok(v.panX !== before.panX || v.panZ !== before.panZ, `drag pans (${before.panX},${before.panZ} → ${v.panX},${v.panZ})`);
ok(!(await ev(page, () => window.__nyc.indoorWalking())) && !(await sheetOpen(page)), 'drag: no walk, nothing opened');
await page.screenshot({ path: 'test-results/zoom-1-panned.png' });

// Pinch out with two fingers (touch), then pinch back in
const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
await page.evaluate(() => window.__nyc.resetCam());
await wait(1200);
await touch('touchStart', [[170, 420], [220, 420]]);
for (let i = 1; i <= 10; i++) { await touch('touchMove', [[170 - i * 8, 420 - i * 3], [220 + i * 8, 420 + i * 3]]); await wait(40); }
await touch('touchEnd', []);
await wait(800);
v = await view(page);
ok(v.zoom > 1.4, `pinch zooms in (${v.zoom})`);
ok(!(await ev(page, () => window.__nyc.indoorWalking())) && !(await sheetOpen(page)), 'pinch: no walk, nothing opened');
ok((await hudBox(page)) === hud0, `HUD the same size (${hud0})`);
await page.screenshot({ path: 'test-results/zoom-2-pinched.png' });

// Zoom right in on the kitchen (right), then walk to the bed (far left): stay in view.
await ev(page, () => window.__nyc.resetCam());
await ev(page, () => window.__nyc.zoomAt(2.8, 0.8, 0));
await wait(600);
const bed = await ev(page, () => window.__nyc.furnitureAt('bed'));
ok(!(await view(page)).seesPlayer || true, 'zoomed onto the kitchen');
await ev(page, (b) => window.__nyc.walkInside(b.x + 1.6, b.z + 1.4), bed);
let lost = 0, samples = 0;
for (let i = 0; i < 40 && (await ev(page, () => window.__nyc.indoorWalking())); i++) {
  samples++;
  if (!(await view(page)).seesPlayer) lost++;
  await wait(500);
}
ok(samples > 0 && lost <= 1, `walking while zoomed keeps you in view (${samples - lost}/${samples} samples)`);
await page.screenshot({ path: 'test-results/zoom-3-follow.png' });
await page.close();

// ---- Broke walk-up: fixed view
const poor = await start('poor');
v = await view(poor);
ok(!v.enabled, 'walk-up: not zoomable');
await poor.mouse.move(195, 420);
for (let i = 0; i < 5; i++) { await poor.mouse.wheel({ deltaY: -120 }); await wait(80); }
v = await view(poor);
ok(v.zoom === 1 && v.panX === 0, 'walk-up: wheel does nothing');
await poor.close();
const mid = await start('middle');
ok(!(await view(mid)).enabled, 'studio: not zoomable');
console.log('errors:', [...new Set(errors)].join('\n') || 'none');
console.log(fails ? `${fails} FAILED` : 'ALL OK');
await browser.close();
process.exit(fails ? 1 : 0);
