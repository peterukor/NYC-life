// QA: sky views of home blocks (pre-built houses) and ad blocks.
//   node scripts/qa-homes.mjs → test-results/homes-*.png   (DIST=170, AREA=manhattan)
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
mkdirSync('test-results', { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:4173/?qa=1&hour=13', { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year', { timeout: 30000 });
await page.select('#ob-year', '1995');
await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (el) => el.click());
await wait(2500);
await page.$eval('[data-nav="leave"]', (el) => el.click());
await wait(2500);
await page.$eval('[data-nav="map"]', (el) => el.click());
await wait(3000);
const area = process.env.AREA ?? 'manhattan';
const kind = process.env.KIND ?? 'home';
const plots = (await page.evaluate(() => window.__nyc.plots())).filter((p) => p.kind === kind && p.id.startsWith(`${area}:`) && !p.id.includes(':lot:'));
const max = Number(process.env.MAX ?? 8);
for (const [i, p] of plots.slice(0, max).entries()) {
  await page.evaluate((x, z, d) => window.__nyc.skyAt(x, z, d), p.x, p.z, Number(process.env.DIST ?? 170));
  await wait(3500);
  await page.screenshot({ path: `test-results/${kind}s-${i}.png` });
  console.log(i, p.id);
}
console.log('errors:', errors.join('\n') || 'none');
await browser.close();
