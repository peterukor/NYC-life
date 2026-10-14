// QA: the first loop end to end, in a browser.
// Leave home → get hired at the deli → play shifts → get paid → buy a bed
// at Lexington Home Goods → swap it in at home → sleep better. Also: a
// reload mid-shift pays nothing, a double-tap buys one bed, and a reload
// keeps money, storage and the new layout. Shots: test-results/loop-*.png
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 780 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => page.evaluate(fn, ...a);
const ok = (cond, msg) => console.log(cond ? '  ✓' : '  ✗', msg);
const money = () => ev(() => window.__nyc.money());
const fmt = (c) => `$${(c / 100).toFixed(2)}`;
await page.goto('http://localhost:4173/?qa=1&class=poor&hour=10', { waitUntil: 'load' });
await ev(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year', { timeout: 30000 });
await page.select('#ob-year', '1995');
await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (el) => el.click());
await page.waitForSelector('#ob-start', { timeout: 10000 });
await page.$eval('#ob-start', (el) => el.click());
await wait(3500);
const walked = async () => { for (let k = 0; k < 400 && (await ev(() => window.__nyc.walking())); k++) await wait(100); await wait(300); };
const tapItem = async (uid) => { await wait(800); const s = await ev((u) => window.__nyc.itemScreen(u), uid); await page.mouse.click(s.x, s.y); await wait(200); await walked(); };
const click = async (sel) => { await page.waitForSelector(sel, { timeout: 8000 }); await page.$eval(sel, (el) => el.click()); await wait(400); };

const start = await money();
console.log('1. Starting broke with', fmt(start));
ok(start === 15000, 'starts with $150');

console.log('2. The deli: get hired');
await ev(() => window.__nyc.enterPlace('barrioDeli'));
await wait(2000);
await tapItem('counter');
await click('[data-act="hire"]');
ok((await ev(() => window.__nyc.job())) === 'deli', 'hired at the deli');

async function playShift(shot) {
  await tapItem('counter');
  await click('[data-act="work"]');
  await click('.modal [data-act="play"]');
  await page.waitForSelector('.deli', { timeout: 8000 });
  let served = 0;
  for (let guard = 0; guard < 40 && served < 6; guard++) {
    const choice = await page.$('.deli-choice:not([hidden]) [data-pick]');
    if (choice) { await choice.click(); await wait(300); continue; }
    const want = await ev(() => document.querySelector('.deli-modal')?.dataset.want ?? '');
    if (!want) break;
    for (const id of want.split(',')) await page.$eval(`[data-ing="${id}"]`, (el) => el.click());
    if (shot && served === 1) await page.screenshot({ path: `test-results/loop-${shot}.png` });
    await page.$eval('[data-serve]', (el) => el.click());
    served++;
    await wait(1000);
  }
  for (let k = 0; k < 6 && (await page.$('.deli-choice:not([hidden]) [data-pick]')); k++) { await page.$eval('.deli-choice:not([hidden]) [data-pick]', (el) => el.click()); await wait(800); }
  await page.waitForSelector('.slip', { timeout: 10000 });
  if (shot) await page.screenshot({ path: `test-results/loop-${shot}-slip.png` });
  const total = await ev(() => document.querySelector('.slip-row.total b')?.textContent);
  await click('.modal [data-act="ok"]');
  return total;
}

console.log('3. Work shifts until the single bed is affordable');
const bedPrice = 32000;
let shifts = 0;
while ((await money()) < bedPrice && shifts < 6) {
  const before = await money();
  const paid = await playShift(shifts === 0 ? 'shift' : null);
  shifts++;
  const after = await money();
  console.log(`   shift ${shifts}: payslip ${paid}, cash ${fmt(before)} → ${fmt(after)}`);
}
ok(shifts >= 2 && shifts <= 4, `afforded the bed after ${shifts} shifts`);

console.log('4. Reload mid-shift: walked out, no pay');
await tapItem('counter');
await click('[data-act="work"]');
await click('.modal [data-act="play"]');
await page.waitForSelector('.deli');
const mid = await money();
await page.reload({ waitUntil: 'load' });
await wait(6000);
ok((await money()) === mid, `no pay for the abandoned shift (${fmt(mid)} → ${fmt(await money())})`);
ok(!(await ev(() => window.__nyc.shiftOpen())), 'the shift is closed');

console.log('5. Buy a single bed (double-tap buys one)');
await ev(() => window.__nyc.enterPlace('homeGoods'));
await wait(2500);
await page.screenshot({ path: 'test-results/loop-store.png' });
await tapItem('bedSingle');
await page.waitForSelector('[data-buy="bedSingle"]', { timeout: 8000 });
await page.screenshot({ path: 'test-results/loop-shop.png' });
const beforeBuy = await money();
await page.$eval('[data-buy="bedSingle"]', (el) => { el.click(); el.click(); });
await page.$eval('[data-buy="bedSingle"]', (el) => el.click());
await wait(500);
const afterBuy = await money();
const stored = await ev(() => window.__nyc.storage());
ok(beforeBuy - afterBuy === bedPrice, `paid once: ${fmt(beforeBuy)} → ${fmt(afterBuy)}`);
ok(stored.filter((x) => x === 'bedSingle').length === 1, `one bed in storage (${stored.join(', ')})`);
const tooMuch = await ev(() => document.querySelector('[data-buy="bedDouble"]')?.disabled);
ok(tooMuch === true, 'the nice bed is greyed out (can’t afford it)');
await page.screenshot({ path: 'test-results/loop-bought.png' });
await page.$eval('.sheet .close', (el) => el.click());
await wait(500);

console.log('6. Home: swap the twin for the new bed');
await ev(() => window.__nyc.enterPlace('sharedApt'));
await wait(2500);
await click('[data-nav="storage"]');
await page.screenshot({ path: 'test-results/loop-storage.png' });
const swapBtn = await page.$('[data-act^="swap:bedSingle:"]');
ok(!!swapBtn, 'Storage offers “Swap for twin bed”');
await swapBtn.click();
await wait(800);
const items = await ev(() => window.__nyc.homeItems());
const newBed = items.find((i) => i.item === 'bedSingle');
ok(!!newBed && !items.some((i) => i.item === 'twinBed'), 'the single bed is in, the twin is out');
ok((await ev(() => window.__nyc.storage())).includes('twinBed'), 'the twin went to storage');
ok((await ev(() => window.__nyc.blockedUse())) === null, 'everything still reachable');
await page.screenshot({ path: 'test-results/loop-swapped.png' });

console.log('7. Sleep in it');
const e0 = (await ev(() => window.__nyc.needs())).energy;
await ev(() => { const n = window.__nyc; n.setNeed?.('energy', 20); });
await tapItem(newBed.uid);
await click('[data-act="do:sleep"]');
const act = await ev(() => window.__nyc.activity());
ok(act && act.seconds < 18 / 0.8, `sleeping on the single bed: ${act?.seconds}s (the twin takes ${(18 / 0.8).toFixed(1)}s)`);
for (let k = 0; k < 300 && (await ev(() => window.__nyc.activity())); k++) await wait(100);
const goal = await ev(() => window.__nyc.goal());
console.log('   energy', e0, '→', (await ev(() => window.__nyc.needs())).energy.toFixed(0), '· next goal:', goal);
ok(!/new bed|better bed/i.test(goal ?? ''), 'bed goals done');

console.log('8. Reload keeps it all');
const keep = { money: await money(), storage: await ev(() => window.__nyc.storage()), items: await ev(() => window.__nyc.homeItems()) };
await page.reload({ waitUntil: 'load' });
await wait(6000);
ok((await money()) === keep.money, 'money');
ok(JSON.stringify(await ev(() => window.__nyc.storage())) === JSON.stringify(keep.storage), 'storage');
ok(JSON.stringify(await ev(() => window.__nyc.homeItems())) === JSON.stringify(keep.items), 'furniture');
console.log('errors:', [...new Set(errors)].join('\n') || 'none');
await browser.close();
