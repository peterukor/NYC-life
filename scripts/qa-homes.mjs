// QA: the four starter homes. For each class: the born reveal, then the home's
// clashes, any piece you can't reach, roommates, and a screenshot.
// Shots: test-results/home-<class>.png, born-<class>.png
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
for (const cls of (process.env.CLASSES ?? 'poor,middle,rich,billionaire').split(',')) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 780 });
  page.on('pageerror', (e) => errors.push(`${cls}: ${e.message}`));
  await page.goto(`http://localhost:4173/?qa=1&class=${cls}&hour=11`, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#ob-year', { timeout: 30000 });
  await page.select('#ob-year', '1995');
  await page.type('#ob-name', 'Jack');
  await page.$eval('#ob-go', (el) => el.click());
  await page.waitForSelector('#ob-start', { timeout: 10000 });
  await wait(400);
  await page.screenshot({ path: `test-results/born-${cls}.png` });
  await page.$eval('#ob-start', (el) => el.click());
  await wait(3000);
  const home = await page.evaluate(() => window.__nyc.state().home.placeId);
  await page.evaluate((h) => window.__nyc.enterPlace(h), home);
  await wait(5000);
  const clashes = await page.evaluate(() => window.__nyc.furnitureClashes());
  const blocked = await page.evaluate(() => window.__nyc.blockedUse());
  const mates = await page.evaluate(() => window.__nyc.roommates?.() ?? []);
  console.log(cls, home, 'clashes', JSON.stringify(clashes), 'blocked', blocked, 'roommates', JSON.stringify(mates));
  await page.screenshot({ path: `test-results/home-${cls}.png` });
  await page.close();
}
console.log(errors.length ? `ERRORS ${JSON.stringify(errors)}` : 'no page errors');
await browser.close();
