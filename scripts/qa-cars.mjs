// =====================================================================
// QA: line up every vehicle (or IDS=a,b,c) and take a screenshot.
//   node scripts/qa-cars.mjs → test-results/cars.png
// Needs `npx vite preview --port 4173`.
// =====================================================================
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

mkdirSync('test-results', { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
await page.setViewport({ width: Number(process.env.W ?? 1100), height: Number(process.env.H ?? 900) });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:4173/?qa=1&hour=11', { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year', { timeout: 30000 });
await page.select('#ob-year', '1995');
await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (el) => el.click());
await wait(2500);
const ids = process.env.IDS ? process.env.IDS.split(',') : undefined;
await page.evaluate((i, c) => window.__nyc.carShow(i, c), ids, Number(process.env.COLS ?? 4));
await page.evaluate(() => document.getElementById('ui').style.display = 'none');
await wait(1500);
await page.screenshot({ path: `test-results/${process.env.OUT ?? 'cars'}.png` });
console.log(errors.length ? errors : 'no errors');
await browser.close();
