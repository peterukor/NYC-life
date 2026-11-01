// QA: two-finger gestures inside a room: a twist turns it (settling on 45° steps),
// a pinch zooms without turning, a small wobble does nothing. Q/E keys turn it on a computer.
// PORT=4181 node scripts/qa-twist.mjs
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, protocolTimeout: 240000, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await browser.newPage();
await page.setViewport({ width: 375, height: 812, hasTouch: true, isMobile: true });
await page.goto(`http://localhost:${process.env.PORT ?? 4181}/?qa=1&class=middle&hour=13&quality=low`, { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year', { timeout: 30000 });
await page.select('#ob-year', '1995');
await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (el) => el.click());
await page.waitForSelector('#ob-start', { timeout: 10000 });
await page.$eval('#ob-start', (el) => el.click());
await wait(3000);
await page.addStyleTag({ content: '.modal-wrap, .hint-tip { display: none !important; }' });
await page.evaluate((id) => window.__nyc.enterPlace(id), process.env.ID ?? 'hkStudio');
await wait(4000);
const cdp = await page.createCDPSession();
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) });
/** Two fingers round (cx, cy): start at `a0` (radians) and radius r0, end at a1 / r1. */
async function gesture(a0, a1, r0, r1, steps = 12) {
  const cx = 190, cy = 400;
  const at = (a, r) => [[cx + Math.cos(a) * r, cy + Math.sin(a) * r], [cx - Math.cos(a) * r, cy - Math.sin(a) * r]];
  await touch('touchStart', at(a0, r0));
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    await touch('touchMove', at(a0 + (a1 - a0) * k, r0 + (r1 - r0) * k));
    await wait(30);
  }
  await touch('touchEnd', []);
  await wait(800);
}
const state = () => page.evaluate(() => ({ turn: window.__nyc.turn(), zoom: window.__nyc.view().zoom, mode: window.__nyc.mode(), activity: window.__nyc.activity() }));
const deg = (t) => Math.round((t * 180) / Math.PI);
const out = [];
const s0 = await state();
await gesture(0, (10 * Math.PI) / 180, 90, 90);
const s1 = await state();
out.push(['wobble 10°', deg(s1.turn), deg(s1.turn) === 0]);
await gesture(0, (60 * Math.PI) / 180, 90, 90);
const s2 = await state();
out.push(['twist 60° clockwise', deg(s2.turn), deg(s2.turn) === 45]);
await gesture(0, (-100 * Math.PI) / 180, 90, 90);
const s3 = await state();
out.push(['twist 100° back', deg(s3.turn), deg(s3.turn) === -45]);
await gesture(0, 0, 60, 140);
const s4 = await state();
out.push(['pinch out', `turn ${deg(s4.turn)} zoom ${s0.zoom}→${s4.zoom}`, deg(s4.turn) === -45 && s4.zoom > s3.zoom]);
await page.keyboard.press('e');
await page.keyboard.press('e');
const s5 = await state();
out.push(['E E', deg(s5.turn), deg(s5.turn) === 45]);
await page.keyboard.press('q');
const s6 = await state();
out.push(['Q', deg(s6.turn), deg(s6.turn) === 0]);
// A one-finger tap on the floor still walks you there after all that.
const before = await page.evaluate(() => window.__nyc.playerPos());
await page.tap('canvas', { offset: { x: 200, y: 450 } }).catch(async () => { await touch('touchStart', [[200, 450]]); await touch('touchEnd', []); });
await wait(4000);
const after = await page.evaluate(() => window.__nyc.playerPos());
out.push(['tap walks', JSON.stringify([before, after]), Math.hypot(after.x - before.x, after.z - before.z) > 0.3]);
for (const o of out) console.log(o[2] ? 'ok  ' : 'FAIL', o[0], o[1]);
await browser.close();
