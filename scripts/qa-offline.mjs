// QA: the game is kept on the device (sw.js). After one visit it starts
// with no network, and a refresh still picks up a new build.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const url = 'http://localhost:4173/';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year', { timeout: 120000 });
const active = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
ok(active, 'service worker is running');
await wait(3000);
const cached = await page.evaluate(async () => { const out = []; for (const k of await caches.keys()) out.push(...(await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname)); return out; });
ok(cached.some((p) => /three-.*\.js$/.test(p)) && cached.some((p) => /models\/folk\.glb/.test(p)), `game files kept on the device (${cached.length} files)`);
// Make a character so there's a save, then go offline and reload.
await page.select('#ob-year', '1995'); await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (e) => e.click()); await page.waitForSelector('#ob-start'); await page.$eval('#ob-start', (e) => e.click());
await wait(4000);
await page.setOfflineMode(true);
await page.reload({ waitUntil: 'load' }).catch(() => {});
const offlineOk = await page.waitForSelector('.hud', { timeout: 90000 }).then(() => true).catch(() => false);
ok(offlineOk, 'starts with no internet (saved player gets the HUD)');
await page.setOfflineMode(false);
// A "new build": the page itself changes on the server; a refresh shows it.
const idx = 'dist/index.html';
const orig = fs.readFileSync(idx, 'utf8');
fs.writeFileSync(idx, orig.replace('<title>NYC Life</title>', '<title>NYC Life (update)</title>'));
await page.reload({ waitUntil: 'load' });
const title = await page.title();
fs.writeFileSync(idx, orig);
ok(title.includes('update'), `a refresh picks up a new build (title: ${title})`);
ok(!errors.length, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
process.exit(fails ? 1 : 0);
