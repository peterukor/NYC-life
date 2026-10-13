// QA: real clothes on the player, several outfits, front and back (test-results/outfit-*.png).
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 360, height: 520 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning' ? errors.push(m.text()) : null));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:4173/?qa=1&hour=11', { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year', { timeout: 30000 });
await page.select('#ob-year', '1995');
await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (el) => el.click());
await wait(2500);
// A fitting room: the walk-up's hall, camera at eye level.
await page.evaluate(() => window.__nyc.enterPlace('sharedApt'));
await wait(2500);
await page.addStyleTag({ content: '#hud, .hud, nav, header, .toast, .goal, .chips, [class*="bar"], [class*="dock"] { display: none !important; }' });
const outfits = JSON.parse(process.env.OUTFITS ?? '[]');
for (const [name, patch, anim] of outfits) {
  await page.evaluate((p) => window.__nyc.tryLook(p), patch);
  await page.evaluate((a) => window.__nyc.anim(a ?? null), anim ?? null);
  await wait(700);
  const p = await page.evaluate(() => window.__nyc.playerPos());
  await page.evaluate((x, z) => window.__nyc.interiorCam(x, 1.15, z + 2.6, x, z), p.x, p.z);
  await wait(700);
  await page.screenshot({ path: `test-results/outfit-${name}.png` });
  await page.evaluate((x, z) => window.__nyc.interiorCam(x + 0.3, 1.25, z - 2.6, x, z), p.x, p.z);
  await wait(500);
  await page.screenshot({ path: `test-results/outfit-${name}-back.png` });
}
console.log('errors:', [...new Set(errors)].join('\n') || 'none');
await browser.close();
