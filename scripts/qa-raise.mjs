// QA: ask for a raise. Forces a ready job, plays the mini-game by holding
// when the line is below the zone (a simple bot), and checks the result.
// Shots: test-results/raise-*.png
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 780 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
await page.goto('http://localhost:4173/?qa=1&class=poor&hour=11', { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year'); await page.select('#ob-year', '1995'); await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (e) => e.click()); await page.waitForSelector('#ob-start'); await page.$eval('#ob-start', (e) => e.click());
await wait(3500);
await page.evaluate(() => { const s = window.__nyc.state(); s.job = { careerId: 'bartender', level: 0, performance: 90, shiftsAtLevel: 14, shiftsTotal: 14, shiftsToday: 0, dayKey: '' }; s.skills.charisma = 5; s.skills.hustle = 5; });
await page.evaluate(() => window.__nyc.askRaise());
await page.waitForSelector('.raise-offer', { timeout: 5000 });
await page.screenshot({ path: 'test-results/raise-offer.png' });
await page.$eval('.raise-offer [data-act="go"]', (e) => e.click());
await page.waitForSelector('.raise-game', { timeout: 5000 });
// Bot: hold when the line is under the zone's middle.
let shot = false;
let pressed = false;
await page.mouse.move(195, 300); // (away from the HUD buttons under the overlay)
for (let i = 0; i < 400 && (await page.$('.raise-game')); i++) {
  const st = await page.evaluate(() => {
    const z = document.querySelector('.rg-zone'), l = document.querySelector('.rg-line');
    if (!z || !l) return null;
    const zr = z.getBoundingClientRect(), lr = l.getBoundingClientRect();
    return { below: lr.top > zr.top + zr.height / 2 };
  });
  if (!st) break;
  if (st.below && !pressed) { await page.mouse.down(); pressed = true; } else if (!st.below && pressed) { await page.mouse.up(); pressed = false; }
  if (!shot && i === 20) { await page.screenshot({ path: 'test-results/raise-game.png' }); shot = true; }
  await wait(60);
}
if (pressed) await page.mouse.up();
await wait(1200);
const level = await page.evaluate(() => window.__nyc.state().job.level);
console.log('level after:', level);
ok(level === 1 || !!(await page.evaluate(() => window.__nyc.state().moodlets.some((m) => m.id === 'raiseNo'))), 'the boss answered (raise or "not right now")');
await page.screenshot({ path: 'test-results/raise-result.png' });
console.log('errors:', [...new Set(errors)].join('\n') || 'none');
console.log(fails ? `${fails} FAILED` : 'ALL OK');
await browser.close();
process.exit(fails ? 1 : 0);
