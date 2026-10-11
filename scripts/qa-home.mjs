// QA: home interior + move-furniture flow (screenshots in test-results/home-*.png).
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:4173/?qa=1&clock=-14h', { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year', { timeout: 30000 });
await page.select('#ob-year', '1995');
await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (el) => el.click());
await wait(3500);
await page.screenshot({ path: 'test-results/home-studio.png' });
await page.evaluate(() => window.__nyc.openObject('sofa'));
await wait(800);
await page.screenshot({ path: 'test-results/home-sofa-sheet.png' });
const moved = await page.evaluate(() => { const b = document.querySelector('[data-act="move-furniture"]'); if (b) b.click(); return !!b; });
await wait(600);
// Tap the floor somewhere left-front.
await page.mouse.click(120, 520);
await wait(600);
await page.screenshot({ path: 'test-results/home-moving.png' });
await page.evaluate(() => document.querySelector('[data-mv="done"]')?.click());
await wait(500);
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nyclife.save.v1') || '{}').homes);
for (const id of ['wburgLoft', 'sharedApt']) {
  await page.evaluate((i) => window.__nyc.enterPlace(i), id);
  await wait(2500);
  await page.screenshot({ path: `test-results/home-${id}.png` });
}
console.log('move button:', moved, 'saved:', JSON.stringify(saved)?.slice(0, 200));
console.log('errors:', errors.join('\n') || 'none');
await browser.close();
