// QA: what visitors come for: trade at the trading floor, report at the
// precinct, fix a phone at Chelsea Works, a date at the bar.
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 780 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const click = async (sel) => { await page.waitForSelector(sel, { timeout: 8000 }); await page.$eval(sel, (el) => el.click()); };
await page.goto('http://localhost:4173/?qa=1&class=middle&hour=18', { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year'); await page.select('#ob-year', '1995'); await page.type('#ob-name', 'Jack');
await click('#ob-go'); await click('#ob-start');
await wait(3500);
const visit = async (place, uid, act) => {
  await page.evaluate((p) => window.__nyc.enterPlace(p), place);
  await wait(3500);
  await page.evaluate((u) => window.__nyc.openObject(u), uid);
  await click(`[data-act="do:${act}"]`);
  await wait(800);
};
await visit('midtownTower', 'invest', 'tradeStocks');
ok(!!(await page.$('.phone')) && /Stocks/.test(await page.$eval('.phone', (e) => e.textContent)), 'trading desk opens Stocks');
await click('.phone [data-act="close"]');
await visit('precinct', 'report', 'reportCrime');
ok(!!(await page.$('.sheet [data-act="scam"]')), 'report window: what to report');
await click('.sheet [data-act="scam"]');
await wait(500);
await page.evaluate(() => { window.__nyc.state().phone = { ok: false, lostReason: 'Stolen' }; });
await visit('dumboWorks', 'fix', 'fixPhone');
ok(await page.evaluate(() => window.__nyc.state().phone.ok), 'Fix-It Bar: phone back');
await visit('theStoop', 'booth1', 'dateHere');
ok(!!(await page.$('.phone')), 'date here: contacts open');
if (!(await page.$('.phone'))) { await page.screenshot({ path: 'test-results/services-date.png' }); console.log(await page.evaluate(() => [...document.querySelectorAll('.sheet h2, .toast')].map((e) => e.textContent).join(' / '))); }
console.log('errors:', [...new Set(errors)].join('\n') || 'none');
console.log(fails ? `${fails} FAILED` : 'ALL OK');
await browser.close();
process.exit(fails ? 1 : 0);
