// Screenshot the people preview: node scripts/people/preview-shot.mjs "<query>" out.png
// (serve / on 127.0.0.1:8765 first, e.g. python3 -m http.server 8765 --directory /).
import puppeteer from 'puppeteer-core';
const [query, out] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
page.on('console', (m) => console.log('page:', m.text()));
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.setViewport({ width: 1200, height: 900 });
await page.goto(`http://127.0.0.1:8765/home/claude/NYC-life/scripts/people/people-preview.html?${query}`);
await page.waitForFunction('window.done === true', { timeout: 45000 });
const el = await page.$('canvas');
await el.screenshot({ path: out });
await browser.close();
console.log('saved', out);
