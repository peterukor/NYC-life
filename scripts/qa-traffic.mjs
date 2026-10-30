// =====================================================================
// QA: moving traffic at street level, plus how long a traffic update takes.
//   HOUR=12 OUT=day node scripts/qa-traffic.mjs → test-results/traffic-<OUT>-*.png
// Needs `npx vite preview --port 4173` (or PORT=…). Q=high (85 cars) by default.
// =====================================================================
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const dir = process.env.DIR ?? 'test-results';
mkdirSync(dir, { recursive: true });
const out = process.env.OUT ?? 'day';
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  headless: true,
  protocolTimeout: 240000,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
await page.setViewport({ width: +(process.env.W ?? 900), height: +(process.env.H ?? 600) });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto(`http://localhost:${process.env.PORT ?? 4173}/?qa=1&class=middle&weather=sunny&hour=${process.env.HOUR ?? 12}&quality=${process.env.Q ?? 'high'}`, { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year', { timeout: 30000 });
await page.select('#ob-year', '1995');
await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (el) => el.click());
await page.waitForSelector('#ob-start', { timeout: 10000 });
await page.$eval('#ob-start', (el) => el.click());
await wait(3000);
await page.$eval('[data-nav="leave"]', (el) => el.click());
await wait(5000);
await page.addStyleTag({ content: '.modal-wrap, .hint-tip, #ui { display: none !important; }' });

if (process.env.SHOW) {
  // Showroom: the service vehicles and a few everyday cars side by side.
  const ids = process.env.SHOW.split(',');
  await page.evaluate((i) => window.__nyc.carShow(i, 4), ids);
  const cam = (process.env.SHOWCAM ?? '1,7,25,0,0.6,4.5').split(',').map(Number);
  await page.evaluate((a) => window.__nyc.streetCam(...a), cam);
  await wait(1500);
  await page.screenshot({ path: `${dir}/show-${out}.png` });
  console.log(errors.length ? errors : 'no errors');
  await browser.close();
  process.exit(0);
}
// Let the cars settle into their lanes for a few seconds first.
await wait(4000);
const info = await page.evaluate(() => window.__nyc.traffic());
console.log('lanes', info.lanes, 'cars', info.cars.length, 'update ms', info.updateMs.toFixed(3));
const me = await page.evaluate(() => window.__nyc.player());

// Shots: stand on the kerb beside the busiest nearby lane and look along it.
const near = info.cars.filter((c) => Math.hypot(c.x - me.x, c.z - me.z) < 160);
const scored = near.map((c) => ({ c, n: near.filter((o) => Math.abs(o.h - c.h) < 0.1 && Math.hypot(o.x - c.x, o.z - c.z) < 70).length }));
scored.sort((a, b) => b.n - a.n);
const views = [];
for (const { c } of scored) {
  if (views.some((v) => Math.hypot(v.x - c.x, v.z - c.z) < 50)) continue;
  views.push(c);
  if (views.length >= 3) break;
}
if (process.env.CLOSE) {
  // Close-ups (paint, glass, wheels): a car waiting at a red light, from ~7 m at
  // kerb height, front three-quarter. Waits for a red if nobody is stopped.
  const used = [];
  for (let j = 1; j <= +process.env.CLOSE; j++) {
    let car = null;
    for (let tries = 0; tries < 8 && !car; tries++) {
      const cars = (await page.evaluate(() => window.__nyc.traffic())).cars;
      car = cars.filter((c) => c.lane >= 0 && c.v < 0.3 && Math.hypot(c.x - me.x, c.z - me.z) < 220 && !used.some((u) => Math.hypot(u.x - c.x, u.z - c.z) < 12))
        .sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0] ?? null;
      if (!car) await wait(2500);
    }
    if (!car) break;
    used.push(car);
    const fx = Math.sin(car.h), fz = Math.cos(car.h);
    const side = j % 2 ? 1 : -1;
    await page.evaluate((a) => window.__nyc.streetCam(...a), [car.x + fx * 5.5 + fz * 4 * side, 2.0, car.z + fz * 5.5 - fx * 4 * side, car.x, 0.6, car.z]);
    await wait(400);
    await page.screenshot({ path: `${dir}/close-${out}-${j}.png` });
  }
}
let k = 0;
for (const c of views) {
  k++;
  // Ahead of the car, off to its right on the sidewalk, looking back at the traffic.
  const fx = Math.sin(c.h), fz = Math.cos(c.h);
  const rx = -fz, rz = fx; // car's right (heading 0 faces +z; right is -x)
  const cx = c.x + fx * 16 - rx * 7, cz = c.z + fz * 16 - rz * 7;
  await page.evaluate((a) => window.__nyc.streetCam(...a), [cx, 2.4, cz, c.x - fx * 6, 1.0, c.z - fz * 6]);
  await wait(900);
  await page.screenshot({ path: `${dir}/traffic-${out}-${k}.png` });
}
// A wider look down from a second-floor window.
if (views[0]) {
  const c = views[0];
  const fx = Math.sin(c.h), fz = Math.cos(c.h);
  await page.evaluate((a) => window.__nyc.streetCam(...a), [c.x + fx * 30 + fz * 9, 9, c.z + fz * 30 - fx * 9, c.x - fx * 20, 0, c.z - fz * 20]);
  await wait(900);
  await page.screenshot({ path: `${dir}/traffic-${out}-wide.png` });
}
if (process.env.SEQ) {
  // From above the player's block, a few seconds apart: queues at red lights.
  // The intersection nearest the player: an avenue (cars heading ~N/S) meets a street (~E/W).
  const ns = info.cars.filter((c) => Math.abs(Math.sin(c.h)) < 0.1), ew = info.cars.filter((c) => Math.abs(Math.cos(c.h)) < 0.1);
  const nearest = (list, key) => list.map((c) => c[key]).sort((a, b) => Math.abs(a - me[key]) - Math.abs(b - me[key]))[0] ?? me[key];
  const ix = nearest(ns, 'x'), iz = nearest(ew, 'z');
  await page.evaluate((m) => window.__nyc.streetCam(m.x + 1, 75, m.z + 35, m.x, 0, m.z), { x: ix, z: iz });
  for (let i = 0; i < 4; i++) {
    await wait(+(process.env.SEQ) * 1000);
    const g = await page.evaluate(() => window.__nyc.traffic().green);
    await page.screenshot({ path: `${dir}/traffic-${out}-seq${i}.png` });
    console.log('seq', i, g);
  }
}
console.log('fps', await page.evaluate(() => window.__nyc.fps()), 'calls', await page.evaluate(() => window.__nyc.drawCalls()), 'tris', await page.evaluate(() => window.__nyc.triangles()));
console.log(errors.length ? errors : 'no errors');
await browser.close();
