// QA: home design mode (Lagos Life-style customisation). Boots a class's
// home, then runs STEPS (a list of page functions) taking a screenshot after each.
// Usage: CLASS=rich STEPS='home|design|tab:walls' node scripts/qa-design.mjs   (shots: test-results/design-*.png)
import puppeteer from 'puppeteer-core';
const cls = process.env.CLASS ?? 'rich';
const W = +(process.env.W ?? 375), H = +(process.env.H ?? 812);
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
await page.goto(`http://localhost:4173/?qa=1&class=${cls}&hour=${process.env.HOUR ?? 11}&quality=${process.env.Q ?? 'medium'}`, { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year', { timeout: 30000 });
await page.select('#ob-year', '1995');
await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (el) => el.click());
await page.waitForSelector('#ob-start', { timeout: 10000 });
await page.$eval('#ob-start', (el) => el.click());
await wait(3000);
const home = process.env.HOME_ID ?? (await page.evaluate(() => window.__nyc.state().home.placeId));
await page.evaluate((h) => window.__nyc.enterPlace(h), home);
await wait(5000);
const shot = async (name) => {
  await page.screenshot({ path: `test-results/design-${name}.png` });
  console.log('shot', name);
};
const steps = (process.env.STEPS ?? 'home').split('|');
for (const s of steps) {
  if (s === 'home') await shot(`${cls}-home`);
  else if (s === 'design') { await page.evaluate(() => window.__nyc.design()); await wait(1500); await shot(`${cls}-buy`); }
  else if (s.startsWith('tab:')) { await page.$eval(`[data-tab="${s.slice(4)}"]`, (el) => el.click()); await wait(1200); await shot(`${cls}-${s.slice(4)}`); }
  else if (s.startsWith('cat:')) { await page.$eval(`[data-cat="${s.slice(4)}"]`, (el) => el.click()); await wait(2500); await shot(`${cls}-cat-${s.slice(4)}`); }
  else if (s.startsWith('night')) { await page.evaluate(() => window.__nyc.previewHour(22)); await wait(800); await shot(`${cls}-night`); }
  else if (s.startsWith('dusk')) { await page.evaluate(() => window.__nyc.previewHour(18.5)); await wait(800); await shot(`${cls}-dusk`); }
  else if (s.startsWith('swing')) { await page.evaluate(() => window.__nyc.swing(Math.PI / 4)); await wait(1500); await shot(`${cls}-swing`); }
  else if (s.startsWith('top')) { await page.evaluate(() => window.__nyc.topView(true)); await wait(1500); await shot(`${cls}-top`); }
  else if (s.startsWith('zoom')) { await page.evaluate(() => window.__nyc.zoomAt(2.2, 0, 0)); await wait(800); await shot(`${cls}-zoom`); }
  else if (s.startsWith('eval:')) { const r = await page.evaluate(s.slice(5)); console.log('eval', JSON.stringify(r)); await wait(800); }
  else if (s.startsWith('shot:')) { await shot(`${cls}-${s.slice(5)}`); }
}
const clashes = await page.evaluate(() => window.__nyc.furnitureClashes());
const blocked = await page.evaluate(() => window.__nyc.blockedUse());
console.log('clashes', JSON.stringify(clashes), 'blocked', blocked);
console.log(errors.length ? `ERRORS ${JSON.stringify(errors.slice(0, 8))}` : 'no page errors');
await browser.close();
