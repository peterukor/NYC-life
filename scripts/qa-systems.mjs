// QA: Cars app, driving, the jail screen and the crews app.
//   node scripts/qa-systems.mjs → test-results/sys-*.png
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

mkdirSync('test-results', { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
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
await page.evaluate(() => { window.__nyc.state().bank = 50_000_000; });
await page.$eval('[data-nav="phone"]', (el) => el.click());
await wait(600);
await page.$eval('[data-act="app:cars"]', (el) => el.click());
await wait(600);
await page.screenshot({ path: 'test-results/sys-1-cars.png' });
await page.$eval('[data-act^="cars.buy:fang"]', (el) => el.click());
await wait(600);
await page.$eval('[data-act^="cars.drive:"]', (el) => el.click());
await wait(800);
await page.$eval('[data-nav="leave"]', (el) => el.click()).catch(() => {});
await wait(2500);
await page.evaluate(() => window.__nyc.zoom(18, true));
await wait(1500);
await page.screenshot({ path: 'test-results/sys-2-driving.png' });
await page.$eval('[data-nav="phone"]', (el) => el.click());
await wait(500);
await page.$eval('[data-act="app:crew"]', (el) => el.click());
await wait(500);
await page.screenshot({ path: 'test-results/sys-3-crews.png' });
await page.$eval('.phone [data-act="close"]', (el) => el.click());
await page.evaluate(() => window.__nyc.jail(6));
await wait(1200);
await page.screenshot({ path: 'test-results/sys-4-jail.png' });
console.log(errors.length ? errors : 'no errors');
await browser.close();
