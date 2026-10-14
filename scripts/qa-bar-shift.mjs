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
await page.goto(`http://localhost:4173/?qa=1&class=poor&hour=${process.env.HOUR ?? 18}&quality=low&shiftsec=45`, { waitUntil: 'load' });
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
// A timed shift (45 s here; 6 minutes in the real game): serve until the payslip.
let served = 0, choices = 0, sawRunner = false;
for (let guard = 0; guard < 200 && !(await page.$('.slip')); guard++) {
  const choice = await page.$('.deli-choice:not([hidden]) [data-pick]');
  if (choice) { await choice.click(); choices++; await wait(300); continue; }
  const want = await ev(() => document.querySelector('.deli-modal')?.dataset.want ?? '');
  if (!want) { await wait(300); continue; }
  ok(served > 0 || /🪑/.test(await ev(() => document.querySelector('.deli-who')?.textContent ?? '')), 'orders come from a table');
  for (const id of want.split(',')) await page.$eval(`[data-ing="${id}"]`, (el) => el.click()).catch(() => {});
  await page.$eval('[data-serve]', (el) => el.click()).catch(() => {});
  served++;
  await wait(250);
  if (!sawRunner && /takes it to 🪑 table/.test(await ev(() => document.querySelector('.deli-runner')?.textContent ?? ''))) {
    sawRunner = true;
    await page.screenshot({ path: 'test-results/bar-shift.png' });
  }
  await wait(750);
}
ok(sawRunner, 'a waiter takes each drink to its table');
ok(choices === 3, `3 choices came up (${choices})`);
await page.waitForSelector('.slip', { timeout: 10000 });
await page.screenshot({ path: 'test-results/bar-slip.png' });
const right = await ev(() => document.querySelector('.modal p')?.textContent ?? '');
const m = /(\d+)\/(\d+) right/.exec(right);
ok(m && m[1] === m[2] && +m[1] >= 5, `all drinks right (${right})`);
await click('.modal [data-act="ok"]');
const paid = (await ev(() => window.__nyc.state().money)) - cash0;
ok(paid > 5_000 && paid <= 30_000, `paid between $50 and $300 (${paid / 100})`);
// The 3D waiter has been running drinks the whole time.
ok((await ev(() => window.__nyc.runnerDrinks())) > 0, `the 3D waiter delivered drinks (${await ev(() => window.__nyc.runnerDrinks())})`);
// One shift a day.
await ev(() => window.__nyc.openObject('bar'));
await click('[data-act="work"]');
await wait(500);
ok(!(await page.$('.modal [data-act="play"]')), 'no second shift today');
// Off the clock: party at the club with the 20% staff discount.
await ev(() => window.__nyc.enterPlace('velvetRoom'));
await wait(4000);
await ev(() => window.__nyc.openObject('vip2'));
await click('[data-act="do:bottleService"]');
await page.waitForSelector('.sheet .cost', { timeout: 5000 }).catch(() => null);
const sub = await ev(() => [...document.querySelectorAll('.sheet')].map((e) => e.textContent).join(' '));
ok(/staff discount 20% off/.test(sub) && !!(await page.$('.sheet .cost s')), 'bartender gets 20% off bottles at the club');
await page.screenshot({ path: 'test-results/bar-discount.png' });
console.log('errors:', [...new Set(errors)].join('\n') || 'none');
console.log(fails ? `${fails} FAILED` : 'ALL OK');
await browser.close();
process.exit(fails ? 1 : 0);
