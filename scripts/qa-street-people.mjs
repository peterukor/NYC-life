// QA: the street crowd up close and further out (test-results/street-*.png).
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 780 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:4173/?qa=1&class=middle&hour=13&quality=high', { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year'); await page.select('#ob-year', '1995'); await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (e) => e.click()); await page.waitForSelector('#ob-start'); await page.$eval('#ob-start', (e) => e.click());
await wait(3000);
await page.$eval('[data-nav="leave"]', (el) => el.click());
await wait(5000);
for (const [i, z] of [[1, 14], [2, 30]]) { await page.evaluate((d) => window.__nyc.zoom(d, true), z); await wait(3000); await page.screenshot({ path: `test-results/street-${i}.png` }); }
await browser.close();
