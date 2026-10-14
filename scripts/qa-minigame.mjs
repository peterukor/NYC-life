// QA: play the bartender mini-game (tapping the right items) → test-results/minigame-*.png
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:4173/?qa=1&class=poor&hour=10', { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year', { timeout: 30000 });
await page.select('#ob-year', '1995');
await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (el) => el.click());
await page.waitForSelector('#ob-start', { timeout: 10000 });
await page.$eval('#ob-start', (el) => el.click());
await wait(2500);
await page.$eval('[data-nav="phone"]', (el) => el.click());
await wait(400);
await page.$eval('[data-act="app:jobs"]', (el) => el.click());
await wait(400);
await page.$eval('[data-act="hire:bartender"]', (el) => el.click());
await wait(400);
await page.$eval('[data-act="close"]', (el) => el.click());
await wait(400);
const before = await page.evaluate(() => window.__nyc.state().money);
await page.$eval('[data-work]', (el) => el.click());
await page.waitForSelector('.modal [data-act="play"]', { timeout: 20000 });
await page.$eval('.modal [data-act="play"]', (el) => el.click());
await page.waitForSelector('.mg-item', { timeout: 5000 });
await wait(300);
await page.screenshot({ path: 'test-results/minigame-play.png' });
for (let i = 0; i < 8; i++) {
  const ok = await page.evaluate(() => {
    const want = document.querySelector('.mg-bubble')?.textContent?.match(/One (.*), please/)?.[1];
    const b = [...document.querySelectorAll('.mg-item')].find((x) => x.getAttribute('data-pick') === want);
    b?.click();
    return !!b;
  });
  if (!ok) break;
  await wait(350);
}
await wait(1500);
const after = await page.evaluate(() => window.__nyc.state().money);
console.log('paid:', after - before, 'errors:', errors.join('\n') || 'none');
await browser.close();
