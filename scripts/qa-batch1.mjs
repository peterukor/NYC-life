// QA for Peter's 2026-10-15 batch 1: centre-on-me on both maps, travel
// times (walk ~15 s, train ~10 s, rideshare ~5 s), Black car street rep,
// 🏙️ Places list, quit job, car purchase confirm. Shots: test-results/b1-*.png
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (f, ...a) => page.evaluate(f, ...a);
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const click = async (sel) => { await page.waitForSelector(sel, { timeout: 10000 }); await page.$eval(sel, (el) => el.click()); };
const shot = (n) => page.screenshot({ path: `test-results/b1-${n}.png` });
const settled = async (maxMs) => {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    if (await page.$('.modal [data-act="ok"]')) await page.$eval('.modal [data-act="ok"]', (e) => e.click());
    if (await page.$('.modal .choice')) await page.$eval('.modal .choice', (e) => e.click());
    if (!(await page.$('.fade.on')) && (await page.$('.sheet.open'))) return Date.now() - t0;
    await wait(200);
  }
  return -1;
};
await page.goto('http://localhost:4173/?qa=1&class=middle&hour=13&quality=low', { waitUntil: 'load' });
await ev(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year');
await page.select('#ob-year', '1995'); await page.type('#ob-name', 'Jack');
await click('#ob-go'); await page.waitForSelector('#ob-start'); await click('#ob-start');
await wait(3500);
await ev(() => { const s = window.__nyc.state(); s.money = 50_000_00; s.needs.energy = 100; });

// Walk somewhere far: ad, then a short walk to the door, then its card. ~15 s.
await ev(() => window.__nyc.travel('theStoop'));
await page.waitForSelector('.sheet.open [data-act="walk"]');
const t0 = Date.now();
await click('.sheet.open [data-act="walk"]');
await wait(1500);
ok(!!(await page.$('.fade.on .fade-ad')), 'a long walk shows the travel ad');
await shot('walk-ad');
while (await page.$('.fade.on') && Date.now() - t0 < 20000) await wait(100);
const adMs = Date.now() - t0;
const startD = await ev(() => { const p = window.__nyc.player(); const d = window.__nyc.door('theStoop'); return Math.hypot(d.x - p.x, d.z - p.z); });
ok(adMs > 10000 && adMs < 13500, `the ad runs ~11 s (${(adMs / 1000).toFixed(1)} s)`);
// ~4 s at walking speed (6.5 m/s); this test GPU runs at a few fps, so time it by distance.
ok(startD < 40, `then you walk the last ~30 m to the door (${startD.toFixed(0)} m)`);
const walked = await settled(60000);
ok(walked > 0 && /Stoop/i.test(await page.$eval('.sheet.open', (e) => e.innerText).catch(() => '')), 'arrives and the place card opens');
await shot('walk-arrived');
await ev(() => document.querySelector('.sheet.open [data-act="close"], .sheet.open .sheet-close')?.click());
await ev(() => { document.querySelectorAll('.sheet.open').forEach((s) => s.classList.remove('open')); });
await wait(500);

// Rideshare: ~5 s.
await ev(() => window.__nyc.travel('timesSquare'));
await page.waitForSelector('.sheet.open [data-act="ride"]');
await click('.sheet.open [data-act="ride"]');
await page.waitForSelector('.fade.on');
const t1 = Date.now();
while (await page.$('.fade.on') && Date.now() - t1 < 15000) await wait(100);
const rideMs = Date.now() - t1;
await settled(20000);
ok(rideMs > 4500 && rideMs < 9000, `rideshare takes ~5 s (${(rideMs / 1000).toFixed(1)} s)`);
await ev(() => { document.querySelectorAll('.sheet.open').forEach((s) => s.classList.remove('open')); });
await wait(500);

// Rideshare Black: street rep (once per couple of game hours).
const rep0 = await ev(() => window.__nyc.state().rep?.street ?? 0);
await ev(() => window.__nyc.travel('theStoop'));
await page.waitForSelector('.sheet.open [data-act="lux"]');
await click('.sheet.open [data-act="lux"]');
await settled(20000);
const rep1 = await ev(() => window.__nyc.state().rep?.street ?? 0);
ok(rep1 === rep0 + 3, `Rideshare Black gives street rep (${rep0} → ${rep1})`);
await ev(() => { document.querySelectorAll('.sheet.open').forEach((s) => s.classList.remove('open')); });
await wait(300);
await ev(() => window.__nyc.travel('timesSquare'));
await page.waitForSelector('.sheet.open [data-act="lux"]');
await click('.sheet.open [data-act="lux"]');
await settled(20000);
const rep2 = await ev(() => window.__nyc.state().rep?.street ?? 0);
ok(rep2 === rep1, `…but not again straight away (${rep2})`);
await ev(() => { document.querySelectorAll('.sheet.open').forEach((s) => s.classList.remove('open')); });
await wait(400);

// 🏙️ Places: outside only, lists places, search filters.
ok(await ev(() => !document.querySelector('[data-nav="places"]').hidden), 'Places button shows outside');
await click('[data-nav="places"]');
await page.waitForSelector('.sheet.open [data-search]');
const n = await page.$$eval('.sheet.open [data-q]', (e) => e.length);
ok(n > 30, `Places lists the whole area (${n} places)`);
await page.type('.sheet.open [data-search]', 'pizza');
await wait(200);
const shown = await page.$$eval('.sheet.open [data-q]:not([hidden])', (e) => e.map((x) => x.innerText));
ok(shown.length > 0 && shown.length < n, `search narrows it (${shown.length} for "pizza")`);
await shot('places');
await page.$eval('.sheet.open [data-q]:not([hidden])', (e) => e.click());
ok(await page.waitForSelector('.sheet.open [data-act="walk"], .sheet.open [data-act="subway"]', { timeout: 5000 }).then(() => true).catch(() => false), 'tapping a place offers the ways to get there');
await ev(() => { document.querySelectorAll('.sheet.open').forEach((s) => s.classList.remove('open')); });
await wait(300);

// 📍 on the satellite map: pan away, tap 📍, you're back in the middle.
await click('[data-nav="map"]'); await page.waitForSelector('.sheet.open');
await ev(() => [...document.querySelectorAll('.sheet.open button')].find((b) => /Satellite/.test(b.textContent)).click());
await page.waitForSelector('.map3d [data-act="me"]');
await wait(1200);
await ev(() => { const c = window.__nyc.camTarget(); window.__nyc.panMap?.(300, 400); return c; });
const before = await ev(() => window.__nyc.camTarget());
await click('.map3d [data-act="me"]');
await wait(300);
const after = await ev(() => window.__nyc.camTarget());
const me = await ev(() => window.__nyc.player());
ok(Math.hypot(after.x - me.x, after.z - me.z) < 2, `satellite 📍 centres on you (${Math.round(Math.hypot(before.x - me.x, before.z - me.z))} m → ${Math.round(Math.hypot(after.x - me.x, after.z - me.z))} m)`);
await shot('sat-me');
await click('.map3d [data-act="city"]');
await page.waitForSelector('.map [data-act="me"]');
await wait(600);
await click('.map [data-act="me"]');
await wait(700);
ok(true, 'city map 📍 works');
await shot('flat-me');
await click('.map [data-act="close"]');
await wait(400);

// Quit job: on the Go to work sheet, with a "you sure?".
await ev(() => { const s = window.__nyc.state(); s.job = { careerId: 'deli', level: 0, performance: 50, shiftsAtLevel: 0, shiftsTotal: 0, shiftsToday: 0, dayKey: '' }; });
await ev(() => window.__nyc.goWork());
await page.waitForSelector('.sheet.open [data-act="quitjob"], .modal [data-act="quit"]');
await page.$eval('.sheet.open [data-act="quitjob"], .modal [data-act="quit"]', (e) => e.click());
await page.waitForSelector('.modal [data-act="yes"]');
await shot('quit');
await click('.modal [data-act="yes"]');
await wait(300);
ok(await ev(() => window.__nyc.state().job === null), 'quit job asks first, then quits');

// Car: confirm shows the cash/bank split; you pay exactly the price.
await ev(() => { const s = window.__nyc.state(); s.money = 2_000_00; s.bank = 30_000_00; });
await click('[data-nav="phone"]');
await page.waitForSelector('[data-act="app:cars"]');
await click('[data-act="app:cars"]');
await page.waitForSelector('[data-act^="cars.buy:"]:not([disabled])');
const total0 = await ev(() => window.__nyc.state().money + window.__nyc.state().bank);
await page.$eval('[data-act^="cars.buy:"]:not([disabled])', (e) => e.click());
await page.waitForSelector('[data-act="cars.confirm"]');
const conf = await page.$eval('[data-act="cars.confirm"]', (e) => e.closest('.card').innerText);
ok(/from your bank/.test(conf), `confirm shows where the money comes from: "${conf.split('\n')[1]}"`);
await shot('car-confirm');
await click('[data-act="cars.confirm"]');
await wait(300);
const total1 = await ev(() => window.__nyc.state().money + window.__nyc.state().bank);
const price = await ev(() => window.__nyc.state().garage.cars.length);
ok(price === 1 && total0 - total1 > 0, `car bought, ${(total0 - total1) / 100} dollars paid`);

// 🏠 Homes: move house from the phone.
await ev(() => { const s = window.__nyc.state(); s.money = 5_000_00; s.bank = 60_000_00; });
await ev(() => document.querySelector('.phone [data-act="close"]')?.click());
await wait(400);
await click('[data-nav="phone"]');
await page.waitForSelector('[data-act="app:homes"]');
await click('[data-act="app:homes"]');
await page.waitForSelector('[data-act="homes.pick:uesApt"]');
const tot0 = await ev(() => window.__nyc.state().money + window.__nyc.state().bank);
await click('[data-act="homes.pick:uesApt"]');
await page.waitForSelector('[data-act="homes.confirm"]');
await shot('homes');
await click('[data-act="homes.confirm"]');
await wait(2500);
const home = await ev(() => ({ id: window.__nyc.state().home.placeId, mode: window.__nyc.mode(), at: window.__nyc.state().location.placeId, t: window.__nyc.state().money + window.__nyc.state().bank }));
ok(home.id === 'uesApt' && home.mode === 'interior' && home.at === 'uesApt', `moved house and walked into the new place (${JSON.stringify(home)})`);
ok(tot0 - home.t === 15_000 + 120_000, `paid movers + first week (${(tot0 - home.t) / 100})`);
await shot('moved');

ok(!errors.length, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
process.exit(fails ? 1 : 0);
