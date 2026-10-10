// =====================================================================
// QA: close-up screenshots of the player character in several outfits.
// Usage (with `npx vite preview --port 4173` running):
//   node scripts/qa-looks.mjs     → test-results/look-*.png
// =====================================================================
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const out = 'test-results';
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => (m.type() === 'error' ? errors.push(m.text()) : null));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const base = `http://localhost:4173/?qa=1${process.env.CLOCK ? `&clock=${encodeURIComponent(process.env.CLOCK)}` : ''}`;

// Start a game quickly through onboarding.
await page.goto(base, { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await wait(1500);
await page.select('#ob-year', '1995');
await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (el) => el.click());
await wait(2500);
await page.$eval('[data-nav="leave"]', (el) => el.click());
await wait(2500);

const looks = [
  ['f-casual', { body: 'f', skin: '#8d5524', hair: '#111111', hairStyle: 'hair_long', topId: 'tee', top: '#e63946', bottomId: 'jeans', bottom: '#2f4a6d', shoesId: 'sneakers', shoes: '#f2f2f2' }],
  ['f-dress', { body: 'f', skin: '#e0ac69', hair: '#5a3825', hairStyle: 'hair_bun', topId: 'sundress', top: '#e9c46a', shoesId: 'loafers', shoes: '#3b2a1a', extraId: 'shades' }],
  ['m-street', { body: 'm', skin: '#5c3a21', hair: '#111111', hairStyle: 'hair_afro', topId: 'hoodie', top: '#9b2226', bottomId: 'joggers', bottom: '#111111', shoesId: 'kicks', shoes: '#ffffff', extraId: 'chain' }],
  ['m-suit', { body: 'm', skin: '#f1c27d', hair: '#2b1b10', hairStyle: 'hair_short', topId: 'blazer', top: '#1b263b', topInner: '#ffffff', bottomId: 'suitPants', bottom: '#1b263b', shoesId: 'loafers', shoes: '#111111', extraId: 'glasses' }],
  ['f-cap', { body: 'f', skin: '#c68642', hair: '#111111', hairStyle: 'hair_braids', topId: 'denimJacket', top: '#3d5a80', topInner: '#ffffff', bottomId: 'miniSkirt', bottom: '#111111', shoesId: 'boots', shoes: '#3b2a1a', hatId: 'cap', hat: '#1d3557', extraId: 'backpack' }],
];
for (const [name, look] of looks) {
  await page.evaluate((l) => window.__nyc.tryLook(l), look);
  await page.evaluate(() => window.__nyc.zoom(3.2, true));
  await wait(1500);
  await page.screenshot({ path: `${out}/look-${name}.png` });
}
// Idle and activity poses.
await page.evaluate((l) => window.__nyc.tryLook(l), looks[0][1]);
for (const a of ['idle', 'lookAround', 'phone', 'foldArms', 'sit']) {
  await page.evaluate((n) => window.__nyc.anim(n === 'idle' ? null : n), a);
  await wait(1600);
  await page.screenshot({ path: `${out}/pose-${a}.png` });
}
await page.evaluate(() => window.__nyc.anim(null));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
