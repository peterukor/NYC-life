// QA: every catalogue piece's footprint (metres, before turning) + height.
// IDS_FILE=ids.json node scripts/qa-footprints.mjs > fp.json
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const ids = JSON.parse(readFileSync(process.env.IDS_FILE, 'utf8')).map((d) => d.id);
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, protocolTimeout: 240000, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await browser.newPage();
await page.setViewport({ width: 375, height: 812 });
await page.goto('http://localhost:4173/?qa=1&class=rich&hour=12&quality=low', { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year', { timeout: 30000 });
await page.select('#ob-year', '1995');
await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (el) => el.click());
await page.waitForSelector('#ob-start', { timeout: 10000 });
await page.$eval('#ob-start', (el) => el.click());
await wait(5000);
const fps = await page.evaluate((ids) => window.__nyc.footprints(ids), ids);
console.log(JSON.stringify(fps));
await browser.close();
