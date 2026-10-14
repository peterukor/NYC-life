// QA: every workplace's own room. For each: clashes, unreachable pieces,
// coworkers, and a screenshot. Shots: test-results/work-<place>.png
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 780 });
await page.evaluateOnNewDocument(() => {});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:4173/?qa=1&class=poor&hour=21&quality=high', { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year'); await page.select('#ob-year', '1995'); await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (e) => e.click()); await page.waitForSelector('#ob-start'); await page.$eval('#ob-start', (e) => e.click());
await wait(3500);
// Work at the bar, to check you take a spot there.
await page.evaluate(() => { const s = window.__nyc.state(); s.job = { careerId: 'bartender', level: 0, performance: 50, shiftsAtLevel: 0, shiftsTotal: 0, shiftsToday: 0, dayKey: '' }; });
for (const id of (process.env.PLACES ?? 'barrioDeli,theStoop,ironGym,dumboWorks,midtownTower,velvetRoom,theAlley,precinct').split(',')) {
  await page.evaluate((p) => window.__nyc.enterPlace(p), id);
  await wait(4500);
  const r = await page.evaluate(() => ({ clashes: window.__nyc.furnitureClashes(), blocked: window.__nyc.blockedUse(), crew: window.__nyc.coworkers(), spot: window.__nyc.myWorkSpot(), visitors: window.__nyc.visitors() }));
  console.log(id, 'clashes', JSON.stringify(r.clashes), 'blocked', r.blocked, 'crew', r.crew.length, 'visitors', r.visitors, r.spot ? 'my spot ✓' : '');
  await page.screenshot({ path: `test-results/work-${id}.png` });
}
console.log('errors:', [...new Set(errors)].join('\n') || 'none');
await browser.close();
