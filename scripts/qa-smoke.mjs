// =====================================================================
// QA play-through: plays a first session in a headless, phone-sized
// browser and saves screenshots to test-results/.
//
// Usage:
//   npm run build && npx vite preview --port 4173 &
//   node scripts/qa-smoke.mjs            # or: CLOCK=+6h node scripts/qa-smoke.mjs
//
// It uses ?qa in the address, which turns on small test hooks
// (window.__nyc) so the script can open 3D objects without guessing
// pixel positions. Needs a Chromium: set CHROME_PATH, or it uses the
// one pre-installed at /opt/pw-browsers.
// =====================================================================
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4173/';
const out = 'test-results';
mkdirSync(out, { recursive: true });
const chrome = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const width = Number(process.env.W ?? 390);
const height = Number(process.env.H ?? 844);

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: width < 700, hasTouch: width < 700 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const click = async (sel) => { await page.waitForSelector(sel, { timeout: 10000 }); await page.$eval(sel, (el) => el.click()); };
const nyc = (fn, ...args) => page.evaluate(fn, ...args);
const state = () => nyc(() => window.__nyc.state());

const q = ['qa=1', `class=${process.env.CLASS ?? 'poor'}`, process.env.CLOCK ? `clock=${encodeURIComponent(process.env.CLOCK)}` : '', process.env.HOUR ? `hour=${process.env.HOUR}` : ''].filter(Boolean).join('&');
await page.goto(`${base}?${q}`, { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await wait(2500);
await shot('01-onboarding');

// ---- Age gate: too young is refused.
await page.select('#ob-year', String(new Date().getFullYear() - 20));
await page.type('#ob-name', 'Jack');
await click('#ob-go');
await wait(200);
const ageErr = await page.$eval('#ob-err', (e) => e.textContent);
check('age gate blocks under-21s', /21/.test(ageErr), ageErr);
await page.select('#ob-year', '1996');
await click('#ob-go');
await wait(600);
check('the class is revealed after creating your character', !!(await page.$('#ob-start')));
await click('#ob-start');
await wait(2500);
await shot('02-apartment');
check('starts inside the apartment', (await nyc(() => window.__nyc.mode())) === 'interior');

// ---- Eat from the fridge (the home's furniture ids come from data/homes.ts).
let s = await state();
const hungerBefore = s.needs.hunger;
await nyc(() => window.__nyc.openObject('fridge'));
await wait(500);
await shot('03-kitchen-sheet');
await click('[data-act="do:snack"]');
await wait(5200);
s = await state();
check('eating raises hunger', s.needs.hunger > hungerBefore, `${hungerBefore.toFixed(0)} → ${s.needs.hunger.toFixed(0)}`);

// ---- Shower.
await nyc(() => window.__nyc.openObject('shower'));
await wait(400);
await click('[data-act="do:shower"]');
// Poll instead of a fixed wait: software rendering can be slow.
for (let i = 0; i < 30; i++) {
  await wait(800);
  if ((await state()).tutorialStep >= 2) break;
}
s = await state();
check('tutorial advances past the first goals', s.tutorialStep >= 2, `step ${s.tutorialStep}`);

// ---- Get a job.
await click('[data-nav="phone"]');
await wait(400);
await click('[data-act="app:jobs"]');
await wait(300);
await shot('04-jobs');
await click('[data-act="hire:barista"]');
await wait(300);
await click('.phone [data-act="close"]');
s = await state();
check('hired as a barista', s.job?.careerId === 'barista');

// ---- Work a shift (only possible 6 AM – 11 PM New York time).
// Ask the game for its own clock (game time runs faster than real time).
const hour = await nyc(() => window.__nyc.hour());
if (hour >= 6 && hour < 23) {
  const moneyBefore = s.money;
  await wait(400);
  await click('[data-work]');
  // Jobs with a mini-game ask "play or skip" first: skip, to test the timer path.
  await page.waitForSelector('.modal .choice', { timeout: 20000 });
  if (await page.$('.modal [data-act="skip"]')) {
    await shot('05a-play-or-skip');
    await click('.modal [data-act="skip"]');
    await wait(600);
    await page.waitForSelector('.modal .choice', { timeout: 20000 });
  }
  await shot('05-shift-choice');
  await click('.modal .choice');
  await wait(12500);
  s = await state();
  check('shift pays', s.money > moneyBefore, `${moneyBefore} → ${s.money}`);
  await shot('06-after-shift');
} else check('shift skipped (outside work hours)', true, `NY hour ${hour}`);

// ---- Go outside and walk by tapping the street.
await click('[data-nav="leave"]');
await wait(1200);
check('back on the street', (await nyc(() => window.__nyc.mode())) === 'city');
const before = (await state()).location;
// Pick a spot on the street that isn't a door, then really tap it.
let spot = null;
for (const [fx, fy] of [[0.25, 0.5], [0.7, 0.55], [0.5, 0.4], [0.3, 0.65], [0.75, 0.35], [0.5, 0.6], [0.2, 0.7], [0.8, 0.7], [0.5, 0.75], [0.35, 0.45]]) {
  const p = [Math.round(width * fx), Math.round(height * fy)];
  const w = await nyc((x, y) => window.__nyc.whatsAt(x, y), p[0], p[1]);
  if (!w.door && (w.ground === 'ground' || w.ground === 'roads' || w.ground === 'sidewalks')) { spot = p; break; }
}
if (!spot) {
  const seen = [];
  for (const [fx, fy] of [[0.25, 0.5], [0.7, 0.55], [0.5, 0.4], [0.3, 0.65], [0.5, 0.6], [0.5, 0.75]]) seen.push(await nyc((x, y) => window.__nyc.whatsAt(x, y), Math.round(width * fx), Math.round(height * fy)));
  console.log('no street spot found:', JSON.stringify(seen));
  spot = [Math.round(width * 0.5), Math.round(height * 0.6)];
}
await page.touchscreen.tap(spot[0], spot[1]);
// Software rendering in CI runs at a few fps (the game clamps each frame
// to 0.1 s), so give the walk plenty of time.
await wait(6000);
const after = (await state()).location;
check('tapping the street walks the player', Math.hypot(after.x - before.x, after.z - before.z) > 1.5, `moved ${Math.hypot(after.x - before.x, after.z - before.z).toFixed(1)} m`);
await shot('07-street');
// Close-up of the player character, to eyeball the avatar's look.
await nyc(() => window.__nyc.zoom(9));
await wait(1200);
await shot('07b-avatar-closeup');

// ---- Zoom out with the mouse wheel to see the neighbourhood.
await page.mouse.move(width / 2, height / 2);
for (let i = 0; i < 14; i++) { await page.mouse.wheel({ deltaY: 500 }); await wait(50); }
await wait(1500);
await shot('08-zoomed-out');
const perf = await nyc(() => ({ fps: window.__nyc.fps(), calls: window.__nyc.drawCalls(), tris: window.__nyc.triangles() }));
check('draw calls stay low when zoomed out', perf.calls < 250, `${perf.calls} calls, ${perf.tris} triangles, ~${perf.fps} fps (software GPU)`);
// Front view of the character (done after the perf check, because it swings the camera round).
await nyc(() => window.__nyc.zoom(6, true));
await wait(1200);
await shot('07c-avatar-front');

// ---- A scam event teaches the red flags.
await nyc(() => window.__nyc.event('monkBracelet', 'plaza'));
await wait(500);
await shot('09-event');
await page.evaluate(() => [...document.querySelectorAll('.modal .choice')].pop().click());
await wait(400);
const hasFlags = await page.$('.flags');
check('scam shows red flags afterwards', !!hasFlags);
await shot('10-event-result');
await click('.modal [data-act="ok"]');

// ---- Map, then the subway across Manhattan (the other boroughs are switched off).
await click('[data-nav="map"]');
await wait(700);
await shot('11-map');
check('map opens as the sky view of the city', !!(await page.$('.map3d .m3-pin')));
await click('.map3d [data-act="close"]');
await nyc(() => window.__nyc.travel('fortGreenePark'));
await wait(400);
check('Brooklyn is closed (no travel sheet)', !(await page.$('.sheet [data-act="subway"]')));
await nyc(() => window.__nyc.travel('theStoop'));
await wait(500);
await click('.sheet [data-act="subway"]');
await wait(1500);
await shot('12-subway-ride');
// Ride until we arrive, answering any on-board event (Showtime, coffee spill…).
for (let i = 0; i < 60; i++) {
  if (await page.$('.modal .choice')) { await shot('12b-subway-event'); await click('.modal .choice'); await wait(300); }
  if (await page.$('.modal [data-act="ok"]')) await click('.modal [data-act="ok"]');
  if (await nyc(() => window.__nyc.mode() === 'city' && window.__nyc.state().stats.placesVisited.includes('timesSqStation'))) break;
  await wait(500);
}
await wait(2500);
s = await state();
// Manhattan has one station (Times Sq); from there you walk on to the bar.
check('rode the subway and walks on to the East Village', s.location.area === 'manhattan' && s.stats.placesVisited.includes('timesSqStation') && (await nyc(() => window.__nyc.path().length)) > 0);
await shot('13-east-village');

console.log('\nsave:', { money: s.money, bank: s.bank, job: s.job?.careerId, area: s.location.area, step: s.tutorialStep });
console.log('console errors/warnings:', errors.length ? '\n' + errors.join('\n') : 'none');
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
await browser.close();
process.exit(failed.length || errors.some((e) => e.startsWith('[pageerror]')) ? 1 : 0);
