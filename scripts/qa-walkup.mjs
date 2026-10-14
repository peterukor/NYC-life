// QA: the broke East Harlem walk-up up close (test-results/walkup-*.png).
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: Number(process.env.W ?? 390), height: Number(process.env.H ?? 844) });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:4173/?qa=1&class=poor&hour=11', { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year', { timeout: 30000 });
await page.select('#ob-year', '1995');
await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (el) => el.click());
await page.waitForSelector('#ob-start', { timeout: 10000 });
await page.$eval('#ob-start', (el) => el.click());
await wait(2500);
await page.evaluate(() => window.__nyc.enterPlace('sharedApt'));
await wait(2500);
await page.addStyleTag({ content: '.hud, .toast, .goal { opacity: 0 !important; }' });
await page.screenshot({ path: 'test-results/walkup-0.png' });
for (const [name, x, y, z, tx, tz] of JSON.parse(process.env.VIEWS ?? '[["room",-3.5,4.5,3.5,-3.8,-1.5],["kitchen",2,4.2,3,1.5,-2.5],["bath",4.5,4,5.5,4.7,2.6]]')) {
  await page.evaluate((a) => window.__nyc.interiorCam?.(...a), [x, y, z, tx, tz]);
  await wait(900);
  await page.screenshot({ path: `test-results/walkup-${name}.png` });
}
console.log('errors:', errors.join('\n') || 'none');
await browser.close();
