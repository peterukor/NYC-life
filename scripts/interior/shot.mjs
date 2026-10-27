// node scripts/interior/shot.mjs "<query>" out.png  (serve / on 127.0.0.1:8765 first)
import puppeteer from 'puppeteer-core';
const [query, out, page0 = 'interior-preview.html'] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.setViewport({ width: 1400, height: 1000 });
await page.goto(`http://127.0.0.1:8765/home/claude/NYC-life/scripts/interior/${page0}?${query}`);
await page.waitForFunction('window.done === true', { timeout: 90000 });
await (await page.$('#wrap')).screenshot({ path: out });
await browser.close();
console.log('saved', out);
