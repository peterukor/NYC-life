// QA for Peter's 2026-10-14 playtest batch: avatar preview, shift how-to
// and hints, side panel taps, Map quick list, cameras. Shots: test-results/batch-*.png
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
const shot = (n) => page.screenshot({ path: `test-results/batch-${n}.png` });
await page.goto('http://localhost:4173/?qa=1&class=middle&hour=21&quality=low&shiftsec=20', { waitUntil: 'load' });
await ev(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year');
// 1. Avatar preview
await wait(800);
ok(!!(await page.$('.ob-preview canvas')), 'onboarding shows a live avatar preview');
await page.$eval('[data-body="m"]', (el) => el.click());
await page.$$eval('[data-top]', (els) => els[3]?.click()).catch(() => {});
await page.$eval('.ob-look', (el) => el.scrollIntoView());
await wait(600);
await shot('onboard');
await page.select('#ob-year', '1995'); await page.type('#ob-name', 'Jack');
await click('#ob-go');
await page.waitForSelector('#ob-start');
ok(!(await page.$('.ob-preview')), 'preview gone (disposed) on the next step');
await click('#ob-start');
await wait(3000);
// 2. Dancer shift: how-to on the first shift, hints, recipe book
await ev(() => { const s = window.__nyc.state(); s.job = { careerId: 'dancer', level: 0, performance: 50, shiftsAtLevel: 0, shiftsTotal: 0, shiftsToday: 0, dayKey: '' }; s.needs.energy = 100; });
await ev(() => window.__nyc.work());
await page.waitForSelector('.modal .howto-card');
ok(true, 'first dancer shift shows "how it works"');
await shot('dancer-intro');
await click('.modal [data-act="play"]');
await page.waitForSelector('.deli-dancer');
await wait(400);
const want = await ev(() => [...document.querySelectorAll('.deli-ing.want')].map((b) => b.dataset.ing).sort().join());
const need = await ev(() => document.querySelector('.deli-modal').dataset.want.split(',').sort().filter((v, i, a) => a.indexOf(v) === i).join());
ok(want === need, `needed moves light up (${want})`);
ok(await ev(() => !document.querySelector('.deli-need').hidden), 'order spelled out ("Needs: …")');
await shot('dancer-hints');
await click('[data-book]');
await wait(300);
const t1 = await ev(() => document.querySelector('.deli-clock').textContent);
await wait(1500);
const t2 = await ev(() => document.querySelector('.deli-clock').textContent);
ok(t1 === t2, 'recipe book pauses the shift');
await shot('dancer-book');
await click('[data-bookclose]');
await page.$eval('[data-out]', (el) => el.click());
for (let i = 0; i < 20 && !(await page.$('.slip')); i++) {
  const b = await page.$('.modal [data-act="refuse"], .modal [data-act="ok"]');
  if (b) await b.click().catch(() => {});
  await wait(400);
}
await click('.modal [data-act="ok"]').catch(() => {});
await wait(800);
ok((await ev(() => window.__nyc.state().shiftsPlayed?.dancer)) === 1, 'played shifts counted per job');
for (let i = 0; i < 4; i++) { const b = await page.$('.modal [data-act]'); if (b) { await b.click().catch(() => {}); await wait(400); } }
// 3. Side panel takes taps
await page.$eval('[data-nav="leave"]', (el) => el.click()).catch(() => {});
await wait(2500);
await shot('outside');
for (let i = 0; i < 6 && (await page.$('.modal, .sheet.open')); i++) { await ev(() => document.querySelector('.modal [data-act], .modal [data-close], .sheet.open [data-close]')?.click()); await wait(500); }
await page.$eval('[data-menu]', (el) => el.click());
await page.waitForSelector('.side-panel.open');
await wait(900);
const hit = await ev(() => { const p = document.querySelector('.side-panel'); return [...p.querySelectorAll('.side-buttons button')].every((b) => { const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!el && b.contains(el); }); });
ok(hit, 'side panel is on top and tappable');
await shot('panel');
await ev(() => document.querySelector('.side-backdrop')?.click());
await wait(600);
// 4. Map → quick list
await page.$eval('[data-nav="map"]', (el) => el.click());
await page.waitForSelector('.sheet.open');
const rows = await ev(() => document.querySelector('.sheet.open').innerText);
ok(/Home/.test(rows) && /Satellite/.test(rows), 'Map opens a quick list with Home and the satellite map');
await shot('quicklist');
await ev(() => [...document.querySelectorAll('.sheet.open button')].find((b) => /Satellite/.test(b.textContent))?.click());
await wait(3500);
await shot('satellite');
console.log('errors:', errors.join('\n') || 'none');
await browser.close();
process.exit(fails ? 1 : 0);
