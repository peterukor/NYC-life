// QA: every job plays a hands-on shift with its own items (Peter,
// 2026-10-14). Plays a short shift (?shiftsec) for each and checks the
// payslip. Shots: test-results/shift-<career>.png
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 780 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (f, ...a) => page.evaluate(f, ...a);
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const click = async (sel) => { await page.waitForSelector(sel, { timeout: 10000 }); await page.$eval(sel, (el) => el.click()); };
await page.goto('http://localhost:4173/?qa=1&class=middle&hour=21&quality=low&shiftsec=12', { waitUntil: 'load' });
await ev(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year'); await page.select('#ob-year', '1995'); await page.type('#ob-name', 'Jack');
await click('#ob-go'); await click('#ob-start');
await wait(3000);
const ITEM = { trainer: 'squat', tech: 'deploy', finance: 'bonds', dancer: 'spin', pharmacist: 'mint', cop: 'radio' };
for (const [career, item] of Object.entries(ITEM)) {
  await ev((c) => { const s = window.__nyc.state(); s.job = { careerId: c, level: 0, performance: 50, shiftsAtLevel: 0, shiftsTotal: 0, shiftsToday: 0, dayKey: '' }; s.needs.energy = 100; }, career);
  await ev(() => window.__nyc.work());
  await click('.modal [data-act="play"]');
  await page.waitForSelector(`.deli-${career}`, { timeout: 8000 });
  ok(!!(await page.$(`[data-ing="${item}"]`)), `${career}: its own items (${item})`);
  let shot = false;
  for (let g = 0; g < 80 && !(await page.$('.slip')); g++) {
    const choice = await page.$('.deli-choice:not([hidden]) [data-pick]');
    if (choice) { await choice.click(); await wait(200); continue; }
    // Twists (fight, envelope, bust) are a modal with buttons.
    const twist = await page.$('.modal [data-act="refuse"], .modal [data-act="ok"]:not(.slip ~ *)');
    if (twist && !(await page.$('.deli-modal'))) { await twist.click(); await wait(300); continue; }
    const want = await ev(() => document.querySelector('.deli-modal')?.dataset.want ?? '');
    if (!want) { await wait(300); continue; }
    for (const id of want.split(',')) await page.$eval(`[data-ing="${id}"]`, (el) => el.click()).catch(() => {});
    if (!shot) { await page.screenshot({ path: `test-results/shift-${career}.png` }); shot = true; }
    await page.$eval('[data-serve]', (el) => el.click()).catch(() => {});
    await wait(900);
  }
  const slip = await page.waitForSelector('.slip', { timeout: 15000 }).catch(() => null);
  ok(!!slip, `${career}: payslip`);
  if (slip) await click('.modal [data-act="ok"]');
  await wait(600);
  for (let k = 0; k < 3 && (await page.$('.modal [data-act]')); k++) { await page.$eval('.modal [data-act]', (el) => el.click()); await wait(300); }
}
console.log('errors:', [...new Set(errors)].join('\n') || 'none');
console.log(fails || errors.length ? `${fails} FAILED` : 'ALL OK');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
