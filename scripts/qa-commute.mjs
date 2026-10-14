// QA: find a job on the phone, then 💼 Go to work → pick how to get there →
// the shift starts on arrival. Shots: test-results/commute-*.png
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 780 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const click = async (sel, t = 10000) => { await page.waitForSelector(sel, { timeout: t }); await page.$eval(sel, (el) => el.click()); };
const label = () => page.$eval('[data-work-label]', (e) => e.textContent);
await page.goto('http://localhost:4173/?qa=1&class=poor&hour=14', { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year', { timeout: 30000 });
await page.select('#ob-year', '1995');
await page.type('#ob-name', 'Jack');
await click('#ob-go');
await click('#ob-start');
await wait(4000);
ok((await label()) === 'Find a job', `no job: the button says "${await label()}"`);
await click('[data-work]');
await page.waitForSelector('[data-act="hire:bartender"]', { timeout: 5000 });
await page.screenshot({ path: 'test-results/commute-jobs.png' });
await click('[data-act="hire:bartender"]');
await wait(500);
await click('.phone [data-act="close"]');
await wait(800);
ok((await label()).startsWith('Go to work'), `hired: "${await label()}"`);
await click('[data-work]');
await page.waitForSelector('.sheet [data-act="subway"]', { timeout: 5000 });
const opts = await page.$$eval('.sheet .opt', (els) => els.map((e) => e.dataset.act));
ok(['walk', 'subway', 'ride'].every((o) => opts.includes(o)), `ways to get there: ${opts.join(', ')}`);
await page.screenshot({ path: 'test-results/commute-sheet.png' });
await click(`.sheet [data-act="${process.env.HOW ?? 'ride'}"]`);
// Walking across town takes minutes at test frame rates: check the walk set off, then arrive at the door.
if ((process.env.HOW ?? 'ride') === 'walk') {
  await wait(3000);
  ok(await page.evaluate(() => (window.__nyc.path() ?? []).length > 0 || window.__nyc.mode() === 'city'), 'walking to work');
  await page.evaluate(() => window.__nyc.openPlace('theStoop'));
}
// A subway event may pop up on the way: answer it.
const shiftShown = () => page.$('.modal [data-act="play"], .modal [data-act="skip"], .deli-shift');
const started = await (async () => {
  for (let i = 0; i < 150; i++) {
    if (await shiftShown()) return true;
    // A random event on the way: take the first choice, then OK.
    const ev = await page.$('.modal .choice[data-act="0"]');
    if (ev) { await ev.click(); await wait(400); const okBtn = await page.$('.modal [data-act="ok"]'); if (okBtn) await okBtn.click(); }
    await wait(1000);
  }
  return false;
})();
const where = await page.evaluate(() => window.__nyc.state().location.placeId);
ok(where === 'theStoop', `arrived at work (${where})`);
ok(started, 'the shift started on arrival');
await page.screenshot({ path: 'test-results/commute-arrived.png' });
console.log('errors:', [...new Set(errors)].join('\n') || 'none');
console.log(fails ? `${fails} FAILED` : 'ALL OK');
await browser.close();
process.exit(fails ? 1 : 0);
