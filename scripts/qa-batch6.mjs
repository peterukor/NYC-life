// QA for batch 6: a real tap closes the 💡 tip, the fast-travel list
// scrolls without moving the map, shift intro says 1:20, cheaper club,
// 🗺️ Full City Map (hidden places → buy → filters), uptown odd places.
// Shots: test-results/b6-*.png
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (f, ...a) => page.evaluate(f, ...a);
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const shot = (n) => page.screenshot({ path: `test-results/b6-${n}.png` });
const closeAll = () => ev(() => { document.querySelectorAll('.sheet.open').forEach((x) => x.classList.remove('open')); document.querySelectorAll('.modal-wrap, .mg-wrap, .hint-tip').forEach((x) => x.remove()); document.querySelector('.phone [data-act="close"]')?.click(); document.querySelector('.map [data-act="close"]')?.click(); });
const tapEl = async (sel) => { const b = await (await page.$(sel)).boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); };
await page.goto('http://localhost:4173/?qa=1&class=poor&hour=14&quality=low', { waitUntil: 'load' });
await ev(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year');
await page.select('#ob-year', '1995'); await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (e) => e.click()); await page.waitForSelector('#ob-start'); await page.$eval('#ob-start', (e) => e.click());
await wait(3500);

// 1. A real finger tap on "Got it" closes the tip.
await page.waitForSelector('.hint-tip', { timeout: 40000 }).catch(() => {});
await wait(400);
await tapEl('.hint-tip [data-h="ok"]');
await wait(700);
ok(!(await page.$('.hint-tip')), 'tapping “Got it” closes the tip');

// 2. Outside, satellite map, fast travel: scrolling the list doesn't move the map.
await ev(() => { const s = window.__nyc.state(); s.recentPlaces = ['bodegaHk', 'sliceJoint', 'beanMachine', 'diveBar', 'ironGym', 'fifthBoutique']; });
await closeAll();
await page.$eval('[data-nav="leave"]', (e) => e.click()).catch(() => {});
await wait(4000);
await page.$eval('[data-nav="map"]', (e) => e.click());
await page.waitForSelector('.sheet.open [data-act="sat"]');
await page.$eval('.sheet.open [data-act="sat"]', (e) => e.click());
await page.waitForSelector('.map-fast-btn', { timeout: 10000 });
await wait(1500);
await tapEl('.map-fast-btn');
await wait(400);
const rowsBox = await (await page.$('.map-fast-rows')).boundingBox();
const over = await page.$eval('.map-fast-rows', (e) => e.scrollHeight - e.clientHeight);
const cam0 = await ev(() => window.__nyc.camTarget());
// Finger drag up inside the list.
const cx = rowsBox.x + rowsBox.width / 2, cy = rowsBox.y + rowsBox.height * 0.8;
const cdp = await page.createCDPSession();
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx, y: cy - i * 25 }] }); await wait(30); }
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await wait(500);
const scrolled = await page.$eval('.map-fast-rows', (e) => e.scrollTop);
const cam1 = await ev(() => window.__nyc.camTarget());
await shot('fast');
ok(cam0.x === cam1.x && cam0.z === cam1.z, `the map didn't move (${JSON.stringify(cam0)} → ${JSON.stringify(cam1)})`);
ok(over <= 0 || scrolled > 0, `the list scrolls (overflow ${over}px, scrolled ${scrolled}px)`);
await closeAll();
await wait(800);

// 3. Flat city map: far places hidden → buy the Full City Map → filters.
await ev(() => { window.__nyc.state().money = 200_000; });
await page.$eval('[data-nav="map"]', (e) => e.click());
await page.waitForSelector('.sheet.open [data-act="flat"]');
await page.$eval('.sheet.open [data-act="flat"]', (e) => e.click());
await page.waitForSelector('.map [data-act="buymap"]', { timeout: 8000 }).catch(() => {});
await wait(600);
await shot('map-before');
ok(!!(await page.$('.map [data-act="buymap"]')), 'the city map offers the 🗺️ Full City Map');
await tapEl('.map [data-act="buymap"]');
await wait(600);
ok(await ev(() => window.__nyc.state().cityMap === true), 'bought it ($250)');
ok(await ev(() => window.__nyc.state().money === 175_000), 'charged $250');
await shot('map-after');
await tapEl('.map [data-act="kind:fun"]');
await wait(500);
await shot('map-fun');
ok(await ev(() => document.querySelector('.map [data-act="kind:fun"]')?.classList.contains('on')), 'filter: 🎲 fun');
await closeAll();
await wait(500);

// 4. Uptown odd place: the Rage Room.
await ev(() => window.__nyc.openPlace('rageRoom'));
await page.waitForSelector('.sheet.open [data-act="do:smashPrinter"]', { timeout: 8000 }).catch(() => {});
await shot('rage-sheet');
const cash0 = await ev(() => window.__nyc.state().money);
await page.$eval('.sheet.open [data-act="do:smashPrinter"]', (e) => e.click());
await page.waitForSelector('.modal-wrap h2', { timeout: 20000 }).catch(() => {});
const title = await ev(() => document.querySelector('.modal-wrap h2')?.textContent);
await shot('rage-result');
ok(/printer/i.test(title ?? ''), `a twist card after smashing (${title})`);
ok(await ev((c) => window.__nyc.state().money < c, cash0), 'it cost money');
await closeAll();
// Every uptown place opens a sheet with its actions.
const ids = ['eternalRest', 'openOfficeEscape', 'heartbreakKaraoke', 'lostFound', 'tramScream', 'madameDoom', 'badDecisions', 'ratTour', 'uwsBagels', 'clinicalTrial', 'debateBarber', 'hauntedBrownstone', 'harlemSoul', 'storageAuction', 'chimiTruck', 'tortureMuseum', 'inwoodForest'];
let opened = 0;
for (const id of ids) {
  await ev((i) => window.__nyc.openPlace(i), id);
  const t = await page.waitForSelector('.sheet.open', { timeout: 4000 }).catch(() => null);
  if (t && (await ev(() => /\S/.test(document.querySelector('.sheet.open .action, .sheet.open [data-act^="do:"], .sheet.open [data-act="enter"]')?.textContent ?? '')))) opened++;
  else console.log('  did not open:', id, await ev(() => document.querySelector('.modal-wrap')?.textContent?.slice(0, 80) ?? '-'));
  await closeAll();
  await wait(400);
}
ok(opened === ids.length, `all ${ids.length} new places open (${opened})`);
await ev(() => window.__nyc.viewPlace('tortureMuseum', 90, 40));
await wait(4000);
await shot('inwood');

// 5. Club: section $300, bottles from $500.
await ev(() => window.__nyc.enterPlace('basement212'));
await wait(2500);
await ev(() => window.__nyc.service('bottleService'));
await wait(600);
const menu = await ev(() => document.querySelector('.sheet.open')?.textContent ?? '');
await shot('bottles');
ok(/\$500/.test(menu), 'bottles start at $500');
await closeAll();
await ev(() => window.__nyc.service('getSection'));
await wait(600);
const sec = await ev(() => document.querySelector('.sheet.open, .modal-wrap')?.textContent ?? '');
ok(/\$300/.test(sec), 'a section is $300');
await shot('section');
await closeAll();

// 6. Shift intro: 1:20.
await ev(() => window.__nyc.phoneApp('jobs'));
await page.waitForSelector('[data-act="hire:deli"]', { timeout: 6000 }).catch(() => {});
await page.$eval('[data-act="hire:deli"]', (e) => e.click()).catch(() => {});
await wait(500);
await closeAll();
await ev(() => window.__nyc.enterPlace('barrioDeli'));
await wait(2500);
await ev(() => { const s = window.__nyc.state(); s.needs.energy = 100; s.needs.hunger = 100; });
await ev(() => window.__nyc.goWork());
await page.waitForSelector('.modal-wrap [data-act="play"]', { timeout: 10000 }).catch(() => {});
const intro = await ev(() => document.querySelector('.modal-wrap')?.textContent ?? '');
await shot('shift');
ok(/1:20/.test(intro), 'the shift says about 1:20');
ok(/\$225/.test(intro), 'up to $225 for the deli');

// 7. Bank: type an amount; Stocks: tabs.
await closeAll();
await wait(600);
await ev(() => { const s = window.__nyc.state(); s.bank = 100_000; s.money = 0; });
await ev(() => window.__nyc.phoneApp('bank'));
await page.waitForSelector('.phone [data-amt]', { timeout: 6000 });
await page.type('.phone [data-amt]', '123.45');
await shot('bank');
await page.$eval('.phone [data-act="wd:typed"]', (e) => e.click());
await wait(400);
ok(await ev(() => window.__nyc.state().money === 12_345 && window.__nyc.state().bank === 100_000 - 12_345), 'withdraw a typed $123.45');
await page.type('.phone [data-amt]', '9999');
await page.$eval('.phone [data-act="wd:typed"]', (e) => e.click());
await wait(300);
ok(await ev(() => window.__nyc.state().money === 12_345), 'more than you have: refused');
await closeAll();
await wait(800);
await ev(() => window.__nyc.phoneApp('stocks'));
await page.waitForSelector('.phone [data-act^="stab:"]', { timeout: 6000 }).catch(async () => { await shot('stocks-fail'); console.log('  phone:', await ev(() => document.querySelector('.phone')?.textContent?.slice(0, 200))); });
const tabCount = await page.$$eval('.phone [data-act^="stab:"]', (e) => e.length);
const fundRows = await page.$$eval('.phone .list-item.stock', (e) => e.length);
await page.$eval('.phone [data-act="stab:meme"]', (e) => e.click());
await wait(300);
const memeText = await ev(() => [...document.querySelectorAll('.phone .list-item.stock')].map((x) => x.textContent).join('|'));
await shot('stocks');
ok(tabCount >= 5 && fundRows > 0, `stock tabs (${tabCount}), funds tab lists ${fundRows}`);
ok(/meme/.test(memeText) && !/fund ·/.test(memeText), 'the Meme tab shows only meme stocks');

ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
console.log(fails ? `${fails} FAILED` : 'ALL OK');
await browser.close();
process.exit(fails ? 1 : 0);
