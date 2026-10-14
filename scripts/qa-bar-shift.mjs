// QA: a hands-on bar shift at The Stoop. Get hired at the bar, play the
// counter (mix the drinks people ask for), take the choices, get the
// payslip. Shots: test-results/bar-shift.png, bar-slip.png
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 780 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => page.evaluate(fn, ...a);
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const click = async (sel) => { await page.waitForSelector(sel, { timeout: 10000 }); await page.$eval(sel, (el) => el.click()); };
await page.goto(`http://localhost:4173/?qa=1&class=poor&hour=${process.env.HOUR ?? 18}&quality=low`, { waitUntil: 'load' });
await ev(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year'); await page.select('#ob-year', '1995'); await page.type('#ob-name', 'Jack');
await click('#ob-go'); await click('#ob-start');
await wait(3500);
await ev(() => window.__nyc.enterPlace('theStoop'));
await wait(3500);
await ev(() => window.__nyc.openObject('bar'));
await click('[data-act="hire"]');
ok((await ev(() => window.__nyc.job())) === 'bartender', 'hired behind the bar');
await wait(500);
await ev(() => window.__nyc.openObject('bar'));
await click('[data-act="work"]');
await click('.modal [data-act="play"]');
await page.waitForSelector('.deli-bartender', { timeout: 8000 });
ok(!!(await page.$('[data-ing="gin"]')) && !(await page.$('[data-ing="bagel"]')), 'bottles and mixers, not bagels');
const cash0 = await ev(() => window.__nyc.state().money);
let served = 0;
for (let guard = 0; guard < 40 && served < 6; guard++) {
  const choice = await page.$('.deli-choice:not([hidden]) [data-pick]');
  if (choice) { await choice.click(); await wait(300); continue; }
  const want = await ev(() => document.querySelector('.deli-modal')?.dataset.want ?? '');
  if (!want) break;
  for (const id of want.split(',')) await page.$eval(`[data-ing="${id}"]`, (el) => el.click());
  if (served === 1) await page.screenshot({ path: 'test-results/bar-shift.png' });
  await page.$eval('[data-serve]', (el) => el.click());
  served++;
  await wait(1000);
}
for (let k = 0; k < 6 && (await page.$('.deli-choice:not([hidden]) [data-pick]')); k++) { await page.$eval('.deli-choice:not([hidden]) [data-pick]', (el) => el.click()); await wait(800); }
await page.waitForSelector('.slip', { timeout: 10000 });
await page.screenshot({ path: 'test-results/bar-slip.png' });
const right = await ev(() => document.querySelector('.modal p')?.textContent ?? '');
ok(/6\/6/.test(right), `all drinks right (${right})`);
await click('.modal [data-act="ok"]');
ok((await ev(() => window.__nyc.state().money)) > cash0, 'paid');
console.log('errors:', [...new Set(errors)].join('\n') || 'none');
console.log(fails ? `${fails} FAILED` : 'ALL OK');
await browser.close();
process.exit(fails ? 1 : 0);
