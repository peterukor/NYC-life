// QA: how long the game takes to start on a phone-ish connection and CPU.
// First visit (empty cache) and return visit (cached), new player and saved player.
// Usage: node scripts/qa-loadtime.mjs [url]
import puppeteer from 'puppeteer-core';
const url = process.argv[2] ?? 'http://localhost:4173/';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
const cdp = await page.createCDPSession();
// "Fast 4G"-ish: 9 Mbps down, 60 ms, CPU 4x slower.
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 60, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (2 * 1024 * 1024) / 8 });
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
let bytes = 0;
page.on('response', async (r) => { const l = Number(r.headers()['content-length'] ?? 0); bytes += l; });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function run(label, ready) {
  bytes = 0;
  const t0 = Date.now();
  await page.goto(url + '?qa=1&quality=low', { waitUntil: 'domcontentloaded' });
  const tDom = Date.now() - t0;
  await page.waitForSelector('.loading', { timeout: 60000 });
  const tMark = Date.now() - t0;
  await page.waitForSelector(ready, { timeout: 120000 });
  const tReady = Date.now() - t0;
  await wait(1500);
  const fcp = await page.evaluate(() => Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1));
  const marks = await page.evaluate(() => performance.getEntriesByType('mark').map((m) => `${m.name} ${Math.round(m.startTime)}`).join(' · '));
  console.log(`${label.padEnd(26)} html ${String(tDom).padStart(5)} ms · NY logo painted ${String(fcp).padStart(5)} ms · playable ${String(tReady).padStart(6)} ms\n    ${marks}`);
}
await cdp.send('Network.clearBrowserCache');
await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => { localStorage.clear(); indexedDB.databases?.().then((d) => d.forEach((x) => indexedDB.deleteDatabase(x.name))); });
await cdp.send('Network.clearBrowserCache');
await page.evaluate(() => caches?.keys().then((k) => Promise.all(k.map((x) => caches.delete(x)))));
await wait(500);
await run('new player, empty cache', '#ob-year');
await page.select('#ob-year', '1995'); await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (e) => e.click()); await page.waitForSelector('#ob-start'); await page.$eval('#ob-start', (e) => e.click());
await wait(4000);
await run('saved player, cached', '.hud');
await cdp.send('Network.clearBrowserCache');
await page.evaluate(() => caches?.keys().then((k) => Promise.all(k.map((x) => caches.delete(x)))));
await run('saved player, empty cache', '.hud');
await browser.close();
