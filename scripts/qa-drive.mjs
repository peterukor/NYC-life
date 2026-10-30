// =====================================================================
// QA: driving your own car on the map (world/drive.ts, world/my-car.ts).
//   PORT=4176 DIR=/tmp/claude-0/drive node scripts/qa-drive.mjs
// Needs `npx vite preview --port $PORT`. Gives the player a car, drives
// to a place a few blocks away and takes street-level shots on the way:
// getting in, setting off, a corner, a red light, parking, getting out.
// Then walks back out, gets in again and parks mid-drive (Phone → Park).
// Writes the car's path (positions, headings, speeds) to trace.json and
// prints smoothness numbers (fastest heading change, hardest braking).
// Software GL in a busy container can draw a frame a second or slower,
// so the drive runs in game time (__nyc.advance) between screenshots.
// =====================================================================
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const PORT = process.env.PORT ?? '4176';
const dir = process.env.DIR ?? '/tmp/claude-0/drive';
mkdirSync(dir, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  headless: true,
  protocolTimeout: 240000,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
await page.setViewport({ width: +(process.env.W ?? 390), height: +(process.env.H ?? 780) });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const nyc = (fn, ...args) => page.evaluate((f, a) => window.__nyc[f](...a), fn, args);
await page.goto(`http://localhost:${PORT}/?qa=1&class=middle&weather=sunny&hour=${process.env.HOUR ?? 13}&quality=${process.env.Q ?? 'high'}`, { waitUntil: 'load' });
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
// Hide the HUD and pop-ups so the shots show the street.
await page.addStyleTag({ content: '.modal-wrap, .hint-tip, #ui, .toast, .toasts { display: none !important; }' });

let shotN = 0;
const shot = async (name, cam = [14, 5, 0]) => {
  await nyc('carCam', ...cam);
  await wait(120);
  const path = `${dir}/${String(++shotN).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path });
  console.log('shot', path, JSON.stringify(await nyc('myCar')));
};

// ---- 1. Get a car and hop in.
const me = await nyc('player');
console.log('player at', me);
const uid = await nyc('giveCar');
console.log('car', uid);
await nyc('advance', 0.35);
await shot('getting-in', [9, 4.5, -6]);
for (let i = 0; i < 40 && (await nyc('myCar'))?.busy; i++) await nyc('advance', 0.1);
const parked = await nyc('myCar');
console.log('in the car', parked);

// ---- 2. Pick a place a few blocks away and drive there.
const ids = ['sliceJoint', 'beanMachine', 'comedyCellar', 'ironGym', 'thriftHk', 'sohoThreads', 'hubArcade', 'barrioDeli', 'mulberryTrattoria', 'gramercyRoom', 'unionSqCinema', 'chessHouse', 'homeGoods', 'theStoop', 'pixelPalace', 'funland', 'velvetRoom', 'theAlley', 'panaderia', 'harlemSoul', 'basement212'];
let dest = null;
for (const id of ids) {
  const d = await nyc('door', id).catch(() => null);
  if (!d) continue;
  const dist = Math.hypot(d.x - me.x, d.z - me.z);
  if (dist > 280 && dist < 700 && (!dest || Math.abs(dist - 450) < Math.abs(dest.dist - 450))) dest = { id, dist, ...d };
}
console.log('destination', dest);
await nyc('driveTrace', true);
await nyc('goToPlace', dest.id);
const plan = await nyc('myCar');
console.log('route', JSON.stringify(plan.route));
// Make the first signal on the route red as we get there (the other road's turn).
const want = new Set(['setting-off', 'corner', 'red-light', 'parking', 'getting-out']);
let lastYaw = plan.yaw, gameT = 0, forced = false;
await nyc('advance', 1.2);
await shot('setting-off', [12, 4.5, 3]);
want.delete('setting-off');
while (want.size && gameT < 240) {
  const c = await nyc('myCar');
  if (!c) break;
  const r = c.route;
  // Force a red at the first stop line ahead: if we're heading up an avenue, streets get green.
  if (r && !forced && r.stops.length) {
    const next = r.stops.find((s) => s > r.s + 2);
    if (next !== undefined && next - r.s < 70 && next - r.s > 35) {
      const onAve = Math.abs(Math.cos(c.yaw)) > Math.abs(Math.sin(c.yaw));
      await nyc('signalAt', onAve ? 21 : 1);
      forced = true;
      console.log('forced red for', onAve ? 'avenues' : 'streets', 'stop at', next, 'car at', r.s);
    }
  }
  let dy = c.yaw - lastYaw;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  lastYaw = c.yaw;
  if (want.has('corner') && Math.abs(dy) > 0.05 && c.v > 2 && r && r.s > 20) {
    want.delete('corner');
    await shot('corner', [11, 6, -4]);
  }
  if (want.has('red-light') && c.why === 'red' && c.v < 0.3) {
    want.delete('red-light');
    console.log('signal', await nyc('signal'));
    await shot('red-light', [13, 4.5, 2]);
    // Let it go green again.
    await nyc('advance', 1.5);
    const onAve = Math.abs(Math.cos(c.yaw)) > Math.abs(Math.sin(c.yaw));
    await nyc('signalAt', onAve ? 1 : 21);
  }
  if (want.has('parking') && c.why === 'park' && c.v < 4 && c.v > 0.3) {
    want.delete('parking');
    await shot('parking', [10, 5, 6]);
  }
  if (want.has('getting-out') && !c.inCar && c.busy) {
    want.delete('getting-out');
    want.delete('parking');
    await shot('getting-out', [8, 3.5, 7]);
  }
  await nyc('advance', 0.1);
  gameT += 0.1;
}
const trace = (await nyc('driveTrace', false)) ?? [];
writeFileSync(`${dir}/trace.json`, JSON.stringify(trace));
await nyc('advance', 4);
await wait(1000);
const pos = await nyc('player');
console.log('arrived; player at', pos, 'door', dest, 'missed shots', [...want]);

// ---- 3. Smoothness, numerically.
let maxYawRate = 0, maxYawAcc = 0, maxDecel = 0, maxAccel = 0, maxLat = 0, prevRate = 0, maxStep = 0;
for (let i = 1; i < trace.length; i++) {
  const a = trace[i - 1], b = trace[i];
  const dt = b.t - a.t;
  if (dt <= 0) continue;
  let dy = b.yaw - a.yaw;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  const rate = dy / dt;
  maxYawRate = Math.max(maxYawRate, Math.abs(rate));
  if (i > 1) maxYawAcc = Math.max(maxYawAcc, Math.abs(rate - prevRate) / dt);
  prevRate = rate;
  const acc = (b.v - a.v) / dt;
  maxDecel = Math.max(maxDecel, -acc);
  maxAccel = Math.max(maxAccel, acc);
  maxLat = Math.max(maxLat, Math.abs(rate * b.v));
  maxStep = Math.max(maxStep, Math.hypot(b.x - a.x, b.z - a.z) / Math.max(b.v * dt, 0.05));
}
const top = Math.max(0, ...trace.map((p) => p.v));
console.log(`trace ${trace.length} pts · top ${top.toFixed(1)} m/s · max yaw rate ${maxYawRate.toFixed(2)} rad/s · max yaw accel ${maxYawAcc.toFixed(1)} rad/s² · accel ${maxAccel.toFixed(1)} · decel ${maxDecel.toFixed(1)} m/s² · lateral ${maxLat.toFixed(1)} m/s² · reasons ${[...new Set(trace.map((p) => p.why))].join(',')}`);

// ---- 4. Back out, back in the car, then "Park" mid-drive.
await page.$eval('[data-nav="leave"]', (el) => el.click()).catch(() => {});
await wait(3000);
await nyc('advance', 1);
await shot('parked-outside', [10, 4, 8]);
const here = await nyc('player');
await nyc('goTo', here.x + 160, here.z - 260);
for (let i = 0; i < 300; i++) {
  await nyc('advance', 0.1);
  const c = await nyc('myCar');
  if (c?.inCar && !c.busy && c.v > 12) break;
}
console.log('walked to the car and drove off', JSON.stringify(await nyc('myCar')));
await nyc('parkCar');
for (let i = 0; i < 300; i++) {
  await nyc('advance', 0.1);
  const c = await nyc('myCar');
  if (c && !c.inCar && !c.busy) break;
}
await shot('parked-mid-drive', [10, 4, 8]);
const after = await nyc('player');
console.log('after parking: player', after, 'car', JSON.stringify(await nyc('myCar')));

// ---- 5. Fast travel ("Drive there"): the fade card, then the car waits at the kerb by the door.
await nyc('travel', 'sliceJoint');
await wait(400);
await page.$eval('[data-act="drive"]', (el) => el.click());
await wait(2150); // the card shows for 2 s, then you arrive (the place opens 0.4 s later)
await shot('fast-travel-arrival', [13, 6, -8]);
console.log('fast travel: door', await nyc('door', 'sliceJoint'), 'car', JSON.stringify(await nyc('myCar')));
console.log(errors.length ? errors : 'no errors');
await browser.close();
