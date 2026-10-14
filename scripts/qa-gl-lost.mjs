// QA: the phone drops the WebGL context (player report: blank blue city).
// Restored → keeps playing; not restored → save + "quick reload" sheet.
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
await page.goto('http://localhost:4173/?qa=1&class=poor&hour=4&quality=low', { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year'); await page.select('#ob-year', '1995'); await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (e) => e.click()); await page.waitForSelector('#ob-start'); await page.$eval('#ob-start', (e) => e.click());
await wait(3000);
const lose = (restoreAfter) => page.evaluate((ms) => { const c = document.querySelector('canvas[aria-label="3D view of the city"]'); const x = c.getContext('webgl2').getExtension('WEBGL_lose_context'); x.loseContext(); if (ms) setTimeout(() => x.restoreContext(), ms); }, restoreAfter);
await lose(800);
await wait(5500);
ok(!(await page.$('.gl-lost')), 'context restored: no reload sheet');
await page.screenshot({ path: 'test-results/gl-restored.png' });
await lose(0);
await wait(5500);
ok(!!(await page.$('.gl-lost')), 'context gone for good: "quick reload" sheet');
await page.screenshot({ path: 'test-results/gl-lost.png' });
console.log('errors:', errors.join('\n') || 'none');
await browser.close();
process.exit(fails ? 1 : 0);
