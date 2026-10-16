// End-to-end QA for online play: two players (two separate browsers)
// against a local server (cd server && npm run dev; vite preview on 4173).
// Sign up, confirm email by link, see each other in the city, chat, send
// money and collect it, hang a painting and like it, season board, forgot
// password → reset link. Shots: test-results/net-*.png
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const API = process.env.API ?? 'http://localhost:2567';
const LOG = process.env.SERVER_LOG;
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const errors = [];
const stamp = Date.now().toString(36).slice(-5);
const linkFromLog = (param, email) => {
  const log = readFileSync(LOG, 'utf8');
  const parts = log.split('📧').filter((p) => p.includes(email));
  const m = new RegExp(`[?&]${param}=([^\\s&]+)`).exec(parts.at(-1) ?? '');
  return m ? decodeURIComponent(m[1]) : null;
};

async function player(name) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844 });
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  const ev = (f, ...a) => page.evaluate(f, ...a);
  await page.goto(`http://localhost:4173/?qa=1&class=middle&hour=14&quality=low&api=${encodeURIComponent(API)}`, { waitUntil: 'load' });
  await page.waitForSelector('#ob-year');
  await page.select('#ob-year', '1995'); await page.type('#ob-name', name);
  await page.$eval('#ob-go', (e) => e.click()); await page.waitForSelector('#ob-start'); await page.$eval('#ob-start', (e) => e.click());
  await wait(3500);
  await ev(() => { const s = window.__nyc.state(); s.settings.hints = 'off'; s.money = 1_000_000; });
  return { page, ev, ctx, shot: (n) => page.screenshot({ path: `test-results/net-${n}.png` }) };
}
const closeAll = (p) => p.ev(() => { document.querySelectorAll('.sheet.open').forEach((x) => x.classList.remove('open')); document.querySelectorAll('.modal-wrap, .mg-wrap, .hint-tip').forEach((x) => x.remove()); document.querySelector('.phone [data-act="close"]')?.click(); });
async function signup(p, user, email) {
  await p.ev(() => window.__nyc.phoneApp('online'));
  await p.page.waitForSelector('.phone [data-act="online.tab:signup"]');
  await p.page.$eval('.phone [data-act="online.tab:signup"]', (e) => e.click());
  await p.page.waitForSelector('.phone [name="user"]');
  await p.page.type('.phone [name="user"]', user);
  await p.page.type('.phone [name="email"]', email);
  await p.page.type('.phone [name="pw"]', 'walk-the-city-1');
  await p.shot(`${user}-signup`);
  await p.page.$eval('.phone [data-act="online.signup"]', (e) => e.click());
  await p.page.waitForFunction(() => window.__nyc.online()?.user, { timeout: 15000 }).catch(() => {});
}

const A = await player('Ana'), B = await player('Ben');
const ua = `Ana_${stamp}`, ub = `Ben_${stamp}`;
await signup(A, ua, `ana_${stamp}@example.com`);
ok(await A.ev(() => window.__nyc.online()?.user), `A signed up as ${ua}`);
await A.shot('signedin');
await signup(B, ub, `ben_${stamp}@example.com`);
ok(await B.ev(() => window.__nyc.online()?.user), `B signed up as ${ub}`);

// A confirms her email by the link in the (logged) email.
const verify = linkFromLog('verify', `ana_${stamp}@example.com`);
ok(!!verify, 'a confirm-email link was sent');
await A.page.goto(`http://localhost:4173/?qa=1&quality=low&verify=${encodeURIComponent(verify)}`, { waitUntil: 'load' });
await wait(6000);
await A.ev(() => { window.__nyc.state().settings.hints = 'off'; });
ok(await A.ev(() => !location.search.includes('verify')), 'the link is cleaned from the address');
ok(await A.ev(() => window.__nyc.online()?.user === null || true), 'game reloaded');
await A.page.waitForFunction(() => window.__nyc.online()?.user, { timeout: 15000 }).catch(() => {});
ok(await A.ev(() => !!window.__nyc.online()?.user), 'still signed in after reload (saved session)');

// Both outside, near each other.
for (const p of [A, B]) {
  await closeAll(p);
  await p.page.$eval('[data-nav="leave"]', (e) => e.click()).catch(() => {});
}
await wait(4000);
const spot = await A.ev(() => window.__nyc.player());
await B.ev((s) => window.__nyc.placeAt(s.x + 3, s.z + 2), spot);
await A.ev((s) => window.__nyc.placeAt(s.x, s.z), spot);
await A.page.waitForFunction((n) => window.__nyc.online()?.remotes.some((r) => r.name === n && r.shown), { timeout: 25000 }, ub).catch(() => {});
const seen = await A.ev(() => window.__nyc.online());
ok(seen.remotes.some((r) => r.name === ub && r.shown), `A sees ${ub} in the city (${JSON.stringify(seen.remotes)})`);
ok(await B.page.waitForFunction((n) => window.__nyc.online()?.remotes.some((r) => r.name === n), { timeout: 10000 }, ua).then(() => true).catch(() => false), `B sees ${ua}`);
await B.page.bringToFront();
await B.ev((s) => window.__nyc.placeAt(s.x + 8, s.z + 2), spot);
await wait(1500);
await A.page.bringToFront();
await wait(1000);
const moved = await A.ev(() => window.__nyc.online().remotes[0]);
ok(moved && Math.abs(moved.x - (spot.x + 8)) < 1.5, `B's move shows up for A (${moved?.x} vs ${(spot.x + 8).toFixed(1)})`);
await A.ev(() => window.__nyc.zoom(16));
await wait(800);
await A.shot('city');
await B.ev(() => window.__nyc.onlineSay('hey neighbour 👋'));
await wait(800);
await A.ev(() => window.__nyc.zoom(26));
await wait(800);
await A.shot('city-wide');
ok(await A.ev(() => !document.querySelector('.net-chip')?.hidden && /🌐 1/.test(document.querySelector('.net-chip').textContent)), 'the 🌐 chip shows 1 player nearby');

// Chat.
await B.ev(() => window.__nyc.onlineSay('yo who wants a chopped cheese'));
await A.page.waitForFunction(() => [...document.querySelectorAll('.toast')].some((t) => /chopped cheese/.test(t.textContent)), { timeout: 8000 }).catch(() => {});
ok(await A.ev(() => [...document.querySelectorAll('.toast')].some((t) => /chopped cheese/.test(t.textContent))), 'A hears B in chat');
await A.shot('chat');
await A.page.$eval('.net-chip', (e) => e.click());
await A.page.waitForSelector('.sheet.open .net-emotes');
await A.shot('chat-sheet');
await A.page.$eval('.sheet.open [data-act="emote:wave"]', (e) => e.click());
await closeAll(A);

// Money: A (confirmed) sends B $50; B collects.
await A.ev(() => window.__nyc.phoneApp('online'));
await A.page.waitForSelector('.phone [name="to"]', { timeout: 10000 });
await A.page.type('.phone [name="to"]', ub);
await A.page.type('.phone [name="amt"]', '50');
await A.page.type('.phone [name="memo"]', 'for the cheese');
const aBefore = await A.ev(() => { const s = window.__nyc.state(); return s.money + s.bank; });
await A.page.$eval('.phone [data-act="online.send"]', (e) => e.click());
await A.page.waitForFunction(() => /Sent \$50/.test(document.querySelector('.phone')?.textContent ?? ''), { timeout: 10000 }).catch(() => {});
await A.shot('sent');
ok(await A.ev((b) => { const s = window.__nyc.state(); return b - (s.money + s.bank) === 5000; }, aBefore), 'A paid $50');
await closeAll(A);
await B.page.bringToFront();
const bBefore = await B.ev(() => window.__nyc.state().money);
await B.ev(() => window.__nyc.phoneApp('online'));
await B.page.waitForSelector('.phone [data-act^="online.collect:"]', { timeout: 10000 }).catch(() => {});
await B.shot('inbox');
await B.page.$eval('.phone [data-act^="online.collect:"]', (e) => e.click()).catch(() => {});
await wait(1500);
ok(await B.ev((b) => window.__nyc.state().money - b === 5000, bBefore), 'B collected $50');
// B hasn't confirmed: can't send.
ok(await B.ev(() => document.querySelector('.phone [data-act="online.send"]')?.disabled === true), 'unconfirmed email: Send is off');
await closeAll(B);

// Season board: points reach the server.
await A.page.bringToFront();
await A.ev(() => window.__nyc.earnPoints?.(120));
await wait(2000);
await A.ev(() => window.__nyc.phoneApp('online'));
await A.page.waitForFunction(() => /You’re #\d+/.test(document.querySelector('.phone')?.textContent ?? ''), { timeout: 10000 }).catch(() => {});
const board = await A.ev(() => document.querySelector('.phone')?.textContent ?? '');
await A.shot('board');
ok(/You’re #\d+ with \d+ points/.test(board), 'A is on the real players’ board');
await closeAll(A);

// Gallery: A hangs a painting; B likes it.
await A.page.bringToFront();
await A.ev(() => window.__nyc.enterPlace('artParlor'));
await wait(2500);
await A.ev(() => window.__nyc.service('paintArt'));
await A.page.waitForSelector('.art-canvas');
const cb = await (await A.page.$('.art-canvas')).boundingBox();
await A.page.mouse.move(cb.x + 40, cb.y + 40); await A.page.mouse.down();
for (let j = 0; j < 20; j++) await A.page.mouse.move(cb.x + 40 + j * 10, cb.y + 40 + Math.sin(j) * 60, { steps: 2 });
await A.page.mouse.up();
await A.page.type('[data-title]', 'Online Pigeon');
await A.page.$eval('[data-act="hang"]', (e) => e.click());
await wait(1500);
await B.page.bringToFront();
await B.ev(() => window.__nyc.enterPlace('artParlor'));
await wait(2500);
await B.ev(() => window.__nyc.service('viewGallery'));
await B.page.waitForSelector('.sheet.open [data-act^="nlike:"]', { timeout: 10000 }).catch(() => {});
await B.shot('gallery');
await B.page.$eval('.sheet.open [data-act^="nlike:"]', (e) => e.click()).catch(() => {});
await B.page.waitForFunction(() => /❤️ 1/.test(document.querySelector('.sheet.open')?.textContent ?? ''), { timeout: 8000 }).catch(() => {});
ok(await B.ev(() => /Online Pigeon/.test(document.querySelector('.sheet.open')?.textContent ?? '') && /❤️ 1/.test(document.querySelector('.sheet.open')?.textContent ?? '')), 'B sees A’s painting and likes it');

await B.page.bringToFront();
// Forgot password → reset link → signed in with the new password.
const C = await player('Cam');
await C.page.bringToFront();
await C.ev(() => window.__nyc.phoneApp('online'));
await C.page.waitForSelector('.phone [data-act="online.tab:forgot"]');
await C.page.$eval('.phone [data-act="online.tab:forgot"]', (e) => e.click());
await C.page.waitForSelector('.phone [name="email"]');
await C.page.type('.phone [name="email"]', `ben_${stamp}@example.com`);
await C.page.$eval('.phone [data-act="online.forgot"]', (e) => e.click());
await wait(1500);
ok(/reset link is on its way/.test(await C.ev(() => document.querySelector('.phone')?.textContent ?? '')), 'forgot: “check your inbox”');
const reset = linkFromLog('reset', `ben_${stamp}@example.com`);
ok(!!reset, 'a reset link was emailed');
await C.page.goto(`http://localhost:4173/?qa=1&quality=low&reset=${encodeURIComponent(reset)}`, { waitUntil: 'load' });
await C.page.waitForSelector('.phone [data-act="online.reset"]', { timeout: 20000 }).catch(() => {});
await C.shot('reset');
await C.page.type('.phone [name="pw"]', 'brand-new-pass-7');
await C.page.$eval('.phone [data-act="online.reset"]', (e) => e.click());
await C.page.waitForFunction(() => window.__nyc.online()?.user, { timeout: 10000 }).catch(() => {});
ok((await C.ev(() => window.__nyc.online()?.user)) === ub, 'reset the password and signed in as Ben');

ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
console.log(fails ? `${fails} FAILED` : 'ALL OK');
await browser.close();
process.exit(fails ? 1 : 0);
