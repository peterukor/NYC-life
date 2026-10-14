// QA: one sky shot per Manhattan block (for the block-by-block clean-up).
//   node scripts/dump-plan.ts plan.json; PLAN=plan.json node scripts/qa-blocks.mjs
// Env: PLAN (dump-plan output), ONLY (comma list of "c,r"), OUT (folder), TILT, PAD.
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
const plan = JSON.parse(readFileSync(process.env.PLAN, 'utf8'));
const OUT = process.env.OUT ?? 'test-results/blocks';
mkdirSync(OUT, { recursive: true });
const only = process.env.ONLY ? new Set(process.env.ONLY.split(';')) : null;
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 420, height: 420 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:4173/?qa=1&class=poor&hour=13', { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year'); await page.select('#ob-year', '1995'); await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (el) => el.click());
await page.waitForSelector('#ob-start', { timeout: 10000 });
await page.$eval('#ob-start', (el) => el.click()); await wait(2500);
await page.$eval('[data-nav="leave"]', (el) => el.click()); await wait(2500);
// Hide the map's HTML overlay (pins, cards, buttons) so the blocks are clear.
await page.addStyleTag({ content: '.map3d, .hud, header, nav, .toast { display: none !important; }' });
const tilt = Number(process.env.TILT ?? 0.55);
let shots = 0;
for (const b of plan.blocks) {
  const key = `${b.c},${b.r}`;
  if (only && !only.has(key)) continue;
  const file = `${OUT}/b-${String(b.r).padStart(2, '0')}-${b.c}.png`;
  if (process.env.SKIP && existsSync(file)) continue; // resume after a crash
  if (++shots > Number(process.env.MAX ?? 45)) break; // the browser fills up: run again with SKIP=1
  const R = b.rect;
  const cx = (R.minX + R.maxX) / 2, cz = (R.minZ + R.maxZ) / 2;
  const size = Math.max(R.maxX - R.minX, (R.maxZ - R.minZ) * 1.15) + Number(process.env.PAD ?? 40);
  await page.evaluate((x, z, d, t) => window.__nyc.sky(x, z, d, t), cx, cz - size * 0.08, size * 1.25, tilt);
  await wait(Number(process.env.WAIT ?? 1800));
  await page.screenshot({ path: file });
}
await browser.close();
console.log('done');
