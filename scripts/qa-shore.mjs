// QA: the Manhattan shore and roads from the sky, at many spots.
//   npx vite build && npx vite preview --port 4173 & node scripts/qa-shore.mjs
// SHOTS env: JSON [[name, x, z, dist, tilt], …]; files go to test-results/shore/.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
mkdirSync('test-results/shore', { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: Number(process.env.W ?? 390), height: Number(process.env.H ?? 844) });
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
const shots = JSON.parse(process.env.SHOTS ?? '[]');
for (const [name, x, z, d, tilt] of shots) {
  await page.evaluate((a, b, c, t) => window.__nyc.sky(a, b, c, t), x, z, d ?? 500, tilt ?? 0.6);
  await wait(Number(process.env.WAIT ?? 3500));
  await page.screenshot({ path: `test-results/shore/${name}.png` });
  console.log(name);
}
console.log('errors:', errors.join('\n') || 'none');
await browser.close();
