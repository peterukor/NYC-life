// QA: groceries and cooking. Order on InstaDash → it arrives in the fridge →
// cook at the stove → eat one, keep the rest → eat a leftover → stop cooking
// gives ingredients back → reload mid-cook keeps it all.
// CLASS=poor (default). Shots: test-results/kitchen-*.png
import puppeteer from 'puppeteer-core';
const CLASS = process.env.CLASS ?? 'poor';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 780 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => page.evaluate(fn, ...a);
let fails = 0;
const ok = (c, msg) => { console.log(`${c ? '✓' : '✗'} ${msg}`); if (!c) fails++; };
const click = async (sel) => { await page.waitForSelector(sel, { timeout: 10000 }); await page.$eval(sel, (el) => el.click()); };
const kitchen = () => ev(() => JSON.parse(JSON.stringify(window.__nyc.state().kitchen)));
const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
const until = async (fn, ms = 40000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(500); } return false; };

await page.goto(`http://localhost:4173/?qa=1&class=${CLASS}&hour=11`, { waitUntil: 'load' });
await ev(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year', { timeout: 30000 });
await page.select('#ob-year', '1995');
await page.type('#ob-name', 'Jack');
await click('#ob-go');
await click('#ob-start');
await wait(4000);
const stove = await ev(() => window.__nyc.objectWith('cook_sandwich'));
const fridge = await ev(() => window.__nyc.objectWith('snack'));
console.log('stove', stove, 'fridge', fridge, 'pantry', JSON.stringify((await kitchen()).pantry));

// 1. InstaDash
await ev(() => window.__nyc.phoneApp('instadash'));
await wait(600);
for (const id of ['turkey', 'cheese', 'pasta', 'sauce']) await click(`[data-act="instadash.add:${id}"]`);
await page.screenshot({ path: 'test-results/kitchen-instadash.png' });
const turkey0 = (await kitchen()).pantry.turkey ?? 0;
const cash0 = await ev(() => window.__nyc.state().money);
await page.$eval('[data-act="instadash.order"]', (el) => { el.click(); el.click(); }); // a double tap pays once
await wait(400);
const cash1 = await ev(() => window.__nyc.state().money);
ok(cash0 - cash1 === 600 + 450 + 200 + 350 + 299, `charged once: ${(cash0 - cash1) / 100}`);
ok((await kitchen()).orders.length === 1, 'one order on its way');
await click('.phone [data-act="close"]');
await ev(() => window.__nyc.deliverNow());
ok(await until(async () => (await kitchen()).orders.length === 0, 5000), 'delivered');
ok((await kitchen()).pantry.turkey === turkey0 + 8, 'turkey in the fridge (+8 slices)');

// 2. Fridge and stove screens
await ev((f) => window.__nyc.openObject(f), fridge);
await wait(500);
await page.screenshot({ path: 'test-results/kitchen-fridge.png' });
await page.$eval('.sheet .close', (el) => el.click());
await wait(300);
await ev((s) => window.__nyc.openObject(s), stove);
await wait(500);
await page.screenshot({ path: 'test-results/kitchen-stove.png' });
ok(!!(await page.$('[data-act="cook:sandwich"]')), 'sandwich is cookable');
ok(!(await page.$('[data-act="cook:chickenVeg"]')), 'roast chicken is locked');

// 3. Cook a sandwich, eat it now
const hunger0 = await ev(() => window.__nyc.state().needs.hunger);
await click('[data-act="cook:sandwich"]');
await wait(800);
ok((await kitchen()).pantry.turkey === turkey0 + 6, 'cooking took 2 slices of turkey');
ok(await until(async () => !!(await page.$('.sheet [data-act="eat"]'))), 'meal ready: eat or keep');
await page.screenshot({ path: 'test-results/kitchen-ready.png' });
ok((await kitchen()).leftovers.sandwich === 1, 'portion in the fridge');
await click('.sheet [data-act="eat"]');
await wait(800);
ok(!(await kitchen()).leftovers.sandwich, 'eating took the portion');
ok(await until(async () => !(await ev(() => window.__nyc.activity()))), 'finished eating');
ok((await ev(() => window.__nyc.state().needs.hunger)) > hunger0, 'hunger went up');

// 4. Pasta: keep both portions, then eat one from the fridge
await ev((s) => window.__nyc.openObject(s), stove);
await click('[data-act="cook:pasta"]');
ok(await until(async () => !!(await page.$('.sheet [data-act="keep"]'))), 'pasta ready');
await click('.sheet [data-act="keep"]');
ok((await kitchen()).leftovers.pasta === 2, 'two pasta portions kept');
await ev((f) => window.__nyc.openObject(f), fridge);
await click('[data-act="eat:pasta"]');
await wait(800);
ok((await kitchen()).leftovers.pasta === 1, 'ate one leftover, one left');
await until(async () => !(await ev(() => window.__nyc.activity())));

// 5. Stop cooking halfway: ingredients come back, nothing extra
const p0 = (await kitchen()).pantry;
await ev((s) => window.__nyc.openObject(s), stove);
await click('[data-act="cook:sandwich"]');
await wait(1500);
await ev(() => window.__nyc.stopDoing?.() ?? document.querySelector('.progress [data-skip], .progress button')?.click());
await wait(600);
const p1 = (await kitchen()).pantry;
ok(same(p0, p1), `stopped: ingredients all back (${JSON.stringify(p0)} vs ${JSON.stringify(p1)})`);
ok(!(await kitchen()).leftovers.sandwich, 'stopped: no sandwich made');

// 6. Reload mid-cook
await ev((s) => window.__nyc.openObject(s), stove);
await click('[data-act="cook:sandwich"]');
await wait(1500);
const mid = await kitchen();
await page.reload({ waitUntil: 'load' });
await wait(6000);
const act = await ev(() => window.__nyc.activity());
const after = await kitchen();
ok((act && act.actionId === 'cook_sandwich') || after.leftovers.sandwich === 1, `cooking carried on after reload (${act ? 'still cooking' : 'finished'})`);
ok(same(after.pantry, mid.pantry), 'pantry the same after reload');
console.log('errors:', [...new Set(errors)].join('\n') || 'none');
console.log(fails ? `${fails} FAILED` : 'ALL OK');
await browser.close();
process.exit(fails ? 1 : 0);
