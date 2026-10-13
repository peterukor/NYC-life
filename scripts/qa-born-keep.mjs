// QA: the rolled class survives a refresh on the reveal, and a reload after starting.
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 780 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const make = async () => {
  await page.waitForSelector('#ob-year', { timeout: 30000 });
  await page.select('#ob-year', '1995');
  await page.type('#ob-name', 'Jack');
  await page.$eval('#ob-go', (el) => el.click());
  await page.waitForSelector('#ob-start');
  return page.$eval('.born h2', (e) => e.textContent);
};
await page.goto('http://localhost:4173/?qa=1&hour=11', { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
const titles = [];
for (let i = 0; i < 3; i++) {
  await page.reload({ waitUntil: 'load' });
  titles.push(await make());
}
ok(new Set(titles).size === 1, `refreshing on the reveal keeps the class (${titles.join(' / ')})`);
// A roll already kept is used (not rerolled), whatever it was.
await page.evaluate(() => localStorage.setItem('nyc-life.bornClass', 'rich'));
await page.reload({ waitUntil: 'load' });
const kept = await make();
ok(kept === 'Upper East Side', `a kept roll is used as is (${kept})`);
await page.$eval('#ob-start', (el) => el.click());
await wait(3000);
const cls = await page.evaluate(() => window.__nyc.state().profile.spawnClass);
await page.reload({ waitUntil: 'load' });
await wait(4000);
ok((await page.evaluate(() => window.__nyc.state().profile.spawnClass)) === cls && !(await page.$('#ob-year')), `reopening keeps the life (${cls})`);
ok((await page.evaluate(() => localStorage.getItem('nyc-life.bornClass'))) === null, 'pending roll cleared once started');
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
