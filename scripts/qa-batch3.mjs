// QA for batch 3 (clubs): the door (turned away / bribe / in), cover,
// the LED screen with tonight's board, your name on it after a bottle,
// a bigger show at a bigger club, mingling, the Me app's club list.
// Shots: test-results/b3-*.png
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
const shot = (n) => page.screenshot({ path: `test-results/b3-${n}.png` });
const closeAll = () => ev(() => { document.querySelectorAll('.sheet.open').forEach((x) => x.classList.remove('open')); document.querySelectorAll('.modal-wrap').forEach((x) => x.remove()); });
await page.goto('http://localhost:4173/?qa=1&class=middle&hour=23&quality=low', { waitUntil: 'load' });
await ev(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year');
await page.select('#ob-year', '1995'); await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (e) => e.click()); await page.waitForSelector('#ob-start'); await page.$eval('#ob-start', (e) => e.click());
await wait(3500);
await ev(() => { const s = window.__nyc.state(); s.money = 2_000_000; s.job = null; });
await page.$eval('[data-nav="leave"]', (e) => e.click());
await wait(2500);
await closeAll();

// 1. The Velvet Room turns a nobody away.
await ev(() => window.__nyc.openPlace('velvetRoom'));
await page.waitForSelector('.sheet.open [data-act="enter"]');
await page.$eval('.sheet.open [data-act="enter"]', (e) => e.click());
await page.waitForSelector('.modal', { timeout: 5000 });
const door = await page.$eval('.modal', (e) => e.innerText);
ok(/bouncer says no/i.test(door) && /Seen Around/.test(door), 'Velvet Room: the bouncer turns a nobody away, says why');
ok(!!(await page.$('.modal [data-act="bribe"]')), 'you can try to slip him something');
await shot('door');
await page.$eval('.modal [data-act="leave"]', (e) => e.click());
await wait(300);
ok(await ev(() => window.__nyc.mode() === 'city'), 'still outside');

// 2. Basement 212 lets everyone in, charges cover, shows the screen.
const cash0 = await ev(() => window.__nyc.state().money);
await ev(() => window.__nyc.openPlace('basement212'));
await page.waitForSelector('.sheet.open [data-act="enter"]');
await page.$eval('.sheet.open [data-act="enter"]', (e) => e.click());
await wait(2500);
const inside = await ev(() => ({ mode: window.__nyc.mode(), at: window.__nyc.state().location.placeId, cash: window.__nyc.state().money }));
ok(inside.mode === 'interior' && inside.at === 'basement212', 'into Basement 212');
ok(cash0 - inside.cash === 2_000, `cover charged ($${(cash0 - inside.cash) / 100})`);
const screen0 = await ev(() => window.__nyc.clubScreen());
ok(Array.isArray(screen0) && screen0[0] === 'Basement 212', `the LED wall is up (${JSON.stringify(screen0)})`);
await shot('basement');

// 3. A bottle: your name on the screen, and you top tonight's board.
await ev(() => window.__nyc.service('bottleService'));
await page.waitForSelector('.sheet.open [data-act^="bottle:"]');
await page.$eval('.sheet.open [data-act^="bottle:"]', (e) => e.click());
await wait(800);
const shout = await ev(() => window.__nyc.clubScreen());
ok(shout && /JACK/.test(shout[0]), `your name takes over the screen: ${JSON.stringify(shout)}`);
ok(!!(await page.$('.club-marquee')), 'and big across the top of the screen');
await wait(500);
await shot('name-on-screen');
await wait(8500);
const board = await ev(() => window.__nyc.clubScreen());
ok(board && board.includes('Jack'), `then you're on tonight's top spenders (${JSON.stringify(board)})`);
await closeAll();

// 4. Mingle until you meet the promoter (the only one in the basement).
let met = false;
for (let i = 0; i < 40 && !met; i++) {
  await ev(() => window.__nyc.service('mingle'));
  await wait(150);
  met = await ev(() => (window.__nyc.state().connections ?? []).includes('promoter'));
  await closeAll();
}
ok(met, 'mingling in the basement: you meet Dre the Promoter');

// 5. With rep + the promoter, the Velvet Room AND the rooftop let you in.
await ev(() => { window.__nyc.state().rep = { street: 60, corporate: 0 }; });
await page.$eval('[data-nav="leave"]', (e) => e.click());
await wait(2500);
await closeAll();
await ev(() => window.__nyc.openPlace('skyeRooftop'));
await page.waitForSelector('.sheet.open [data-act="enter"]');
await page.$eval('.sheet.open [data-act="enter"]', (e) => e.click());
await wait(2800);
ok(await ev(() => window.__nyc.state().location.placeId === 'skyeRooftop'), 'Dre gets you into the rooftop (one level up)');
await shot('rooftop');

// 6. The Me app lists your connections and which doors are open.
await closeAll();
await page.$eval('[data-nav="phone"]', (e) => e.click());
await page.waitForSelector('[data-act="app:me"]');
await page.$eval('[data-act="app:me"]', (e) => e.click());
await wait(500);
const me = await page.$eval('.phone', (e) => e.innerText);
ok(/Dre the Promoter/.test(me) && /Aurum/.test(me) && /You can get in/.test(me), 'Me → connections and club doors');
await shot('me');

ok(!errors.length, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
process.exit(fails ? 1 : 0);
