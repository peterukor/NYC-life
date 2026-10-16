// QA for batch 5: 🏆 Leaderboard app, 🏠 buying a home, the new paths,
// roommate life (heading out, coming home, a date behind the door, $20
// loan, kitchen party) and 💡 tips (show, "No tips", Settings).
// Shots: test-results/b5-*.png
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
const shot = (n) => page.screenshot({ path: `test-results/b5-${n}.png` });
const closeAll = () => ev(() => { document.querySelectorAll('.sheet.open').forEach((x) => x.classList.remove('open')); document.querySelectorAll('.modal-wrap, .mg-wrap, .hint-tip').forEach((x) => x.remove()); document.querySelector('.phone [data-act="close"], .phone .phone-close')?.click(); });
await page.goto('http://localhost:4173/?qa=1&class=poor&hour=14&quality=low', { waitUntil: 'load' });
await ev(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year');
await page.select('#ob-year', '1995'); await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (e) => e.click()); await page.waitForSelector('#ob-start'); await page.$eval('#ob-start', (e) => e.click());
await wait(3500);

// 1. 💡 A tip shows up by itself after ~20 s (home).
await page.waitForSelector('.hint-tip', { timeout: 40000 }).catch(() => {});
ok(!!(await page.$('.hint-tip')), 'a 💡 tip pops up on its own');
await shot('tip');
await page.$eval('.hint-tip [data-h="off"]', (e) => e.click()).catch(() => {});
await wait(400);
ok(await ev(() => window.__nyc.state().settings.hints === 'off'), '“No tips” turns them off');

// 2. Roommates: walk-up home.
await ev(() => window.__nyc.enterPlace('sharedApt'));
await wait(3000);
const mates = await ev(() => window.__nyc.roommates());
ok(mates.length === 2, `two roommates (${mates.map((m) => m.name).join(', ')})`);
const name = mates[0].name;
// Make sure they're home first.
if (mates[0].away) { await ev((n) => window.__nyc.roommateBeat('return', n), name); await wait(2500); }
await ev((n) => window.__nyc.roommateBeat('leave', n), name);
await page.waitForFunction((n) => window.__nyc.roommates().find((m) => m.name === n)?.away, { timeout: 30000 }, name).catch(() => {});
ok(await ev((n) => { const m = window.__nyc.roommates().find((x) => x.name === n); return m.away && !m.visible; }, name), `${name} walks out the front door and is gone`);
await ev((n) => window.__nyc.roommateBeat('date', n), name);
await page.waitForFunction(() => window.__nyc.dateOn(), { timeout: 60000 }).catch(() => {});
ok(await ev(() => window.__nyc.dateOn()), 'a date: they chat, then go behind the door (emoji bubble on)');
await wait(1500);
await closeAll();
await wait(800);
await shot('date');
await page.waitForFunction(() => !window.__nyc.dateOn(), { timeout: 60000 }).catch(() => {});
await wait(6000);
ok(await ev((n) => { const m = window.__nyc.roommates().find((x) => x.name === n); return !window.__nyc.dateOn() && m.visible; }, name), 'the date leaves and the roommate comes back out');
// $20 loan.
await closeAll();
const before = await ev(() => window.__nyc.state().money);
await ev((n) => window.__nyc.roommateBeat('borrow', n), mates[1].name);
await page.waitForSelector('.modal-wrap [data-act="yes"]');
await shot('borrow');
await page.$eval('.modal-wrap [data-act="yes"]', (e) => e.click());
await wait(300);
const after = await ev(() => window.__nyc.state().money);
ok(before - after === 2000 || before < 2000, `lending $20 (${before} → ${after})`);
await ev((n) => window.__nyc.roommateBeat('party', n), mates[1].name);
await page.waitForSelector('.modal-wrap [data-act="yes"]');
await page.$eval('.modal-wrap [data-act="yes"]', (e) => e.click());
await wait(300);
ok(await ev(() => window.__nyc.state().moodlets?.some((m) => m.id === 'kitchenParty') ?? true), 'joining the kitchen party');
await closeAll();

// 3. 🏆 Leaderboard app.
await ev(() => { const s = window.__nyc.state(); s.money = 9_000_000; });
await page.$eval('[data-nav="phone"]', (e) => e.click());
await page.waitForSelector('[data-act="app:leaders"]');
await page.$eval('[data-act="app:leaders"]', (e) => e.click());
await wait(600);
const lbText = await ev(() => document.querySelector('.phone')?.textContent ?? '');
ok(/Jack/.test(lbText) && /challenge/i.test(lbText), 'Leaderboard shows you and the daily challenges');
await shot('leaders');
// 4. 🏠 Homes: buy one.
await ev(() => document.querySelector('.phone [data-act="home"], .phone [data-act="back"]')?.click());
await wait(300);
await ev(() => document.querySelector('[data-act="app:homes"]')?.click() ?? window.__nyc.openApp?.('homes'));
await page.waitForSelector('[data-act^="homes.buy:"]', { timeout: 8000 }).catch(() => {});
const buy = await page.$('[data-act^="homes.buy:"]:not([disabled])');
if (buy) { await buy.click(); await wait(500); }
ok(await ev(() => (window.__nyc.state().owned ?? []).length === 1), 'bought a home from 🏠 Homes');
await shot('homes');
await closeAll();

// 5. Settings: tips back on.
await wait(1200);
await page.$eval('[data-nav="phone"]', (e) => e.click()).catch(() => {});
await page.waitForSelector('[data-act="app:settings"]', { timeout: 5000 }).catch(() => {});
await ev(() => document.querySelector('[data-act="app:settings"]')?.click());
await page.waitForSelector('[data-act="hints:all"]', { timeout: 5000 }).catch(() => {});
await page.$eval('[data-act="hints:all"]', (e) => e.click()).catch(() => {});
await wait(300);
ok(await ev(() => window.__nyc.state().settings.hints === 'all'), 'Settings → 💡 Tips back on');
await shot('settings');

ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
console.log(fails ? `${fails} FAILED` : 'ALL OK');
await browser.close();
process.exit(fails ? 1 : 0);
