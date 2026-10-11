// =====================================================================
// QA: daytime screenshots of the look of the game (character close-up,
// street view, neighbourhood view). Needs `npx vite preview --port 4173`.
//   CLOCK=-6h node scripts/qa-shots.mjs      → test-results/shot-*.png
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
await page.setViewport({ width: Number(process.env.W ?? 390), height: Number(process.env.H ?? 844) });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => (m.type() === 'error' ? errors.push(m.text()) : null));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clock = process.env.CLOCK ? `&clock=${encodeURIComponent(process.env.CLOCK)}` : '';
await page.goto(`http://localhost:4173/?qa=1${clock}`, { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year', { timeout: 30000 });
await wait(1500);
await page.screenshot({ path: 'test-results/shot-0-onboarding.png' });
await page.select('#ob-year', '1995');
await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (el) => el.click());
await wait(2500);
await page.screenshot({ path: 'test-results/shot-1-home.png' });
await page.$eval('[data-nav="leave"]', (el) => el.click());
await wait(2500);
const views = [
  ['2-closeup', 5, true],
  ['3-street', 26, true],
  ['4-block', 70, true],
  ['5-area', 220, true],
];
for (const [name, d, front] of views) {
  await page.evaluate((dd, f) => window.__nyc.zoom(dd, f), d, front);
  await wait(1800);
  await page.screenshot({ path: `test-results/shot-${name}.png` });
}
// Landmarks.
for (const [id, d, y] of [['empireState', 330, 120], ['timesSquare', 160, 30], ['atlanticArena', 150, 15], ['brooklynBridge', 420, 40]]) {
  const ok = await page.evaluate((i, dd, yy) => window.__nyc.viewPlace(i, dd, yy), id, d, y);
  await wait(2500);
  if (ok) await page.screenshot({ path: `test-results/shot-lm-${id}.png` });
}
const perf = await page.evaluate(() => ({ calls: window.__nyc.drawCalls(), tris: window.__nyc.triangles(), fps: window.__nyc.fps() }));
console.log('perf (area view):', perf);
console.log(await page.evaluate(() => window.__nyc.meshStats()));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
