// QA: the whole map — no ad inside a building, no prop on a road
// (Peter, 2026-10-15). Also a shot of Times Square from his angle.
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 800 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.text().startsWith('[placement]') && console.log(m.text()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:4173/?qa=1&class=middle&hour=11&quality=medium', { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year'); await page.select('#ob-year', '1995'); await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (e) => e.click()); await page.waitForSelector('#ob-start'); await page.$eval('#ob-start', (e) => e.click());
await wait(3000);
await page.$eval('[data-nav="leave"]', (el) => el.click()); await wait(3000);
const issues = await page.evaluate(() => window.__nyc.placementIssues());
const n = await page.evaluate(() => window.__nyc.adSlotCount());
console.log(`ad slots: ${n}; issues: ${issues.length}`);
const by = {}; for (const i of issues) (by[i.kind] ??= []).push(`${i.id}@${i.x},${i.z}`);
for (const [k, v] of Object.entries(by)) console.log(` ${k}: ${v.length}`, v.slice(0, 12).join(' '));
const rep = await page.evaluate(() => window.__nyc.adReport());
const hub = rep.filter((r) => r.tier === 'hub');
console.log('hub ads:', hub.length, 'floating (no wall within 12 m):', hub.filter((r) => r.back < 0).length, 'sample:', JSON.stringify(hub.slice(0, 8)));
console.log('avenue (rooftop):', rep.filter((r) => r.tier === 'avenue').length, 'street:', rep.filter((r) => r.tier === 'street').length);
const sweep = await page.evaluate(() => window.__nyc.onRoadSweep());
console.log('ON ROAD:', Object.entries(sweep).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `${k}=${v.n} [${v.at.slice(0, 3).join(' ')}]`).join('\n  '));
// Times Square, the way Peter looked at it.
await page.evaluate(() => window.__nyc.viewPlace('timesSquare', 150, 0, 0));
await wait(3500);
await page.screenshot({ path: 'test-results/placement-ts.png' });
console.log('errors:', errors.join('\n') || 'none');
await browser.close();
process.exit(issues.length ? 1 : 0);
