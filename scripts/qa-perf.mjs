// QA: triangles and draw calls at four zoom levels. Needs `npx vite preview --port 4173`.
//   Q=low node scripts/qa-perf.mjs   (Q = low | medium | high)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto(`http://localhost:4173/?qa=1&clock=-14h&quality=${process.env.Q ?? "high"}`, { waitUntil: "load" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year', { timeout: 30000 });
await page.select('#ob-year', '1995');
await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (el) => el.click());
await wait(2500);
await page.$eval('[data-nav="leave"]', (el) => el.click());
await wait(2500);
for (const d of [26, 70, 140, 260]) {
  await page.evaluate((dd) => window.__nyc.zoom(dd, true), d);
  await wait(5000);
  const r = await page.evaluate(() => ({ calls: window.__nyc.drawCalls(), tris: window.__nyc.triangles(), top: window.__nyc.triBreakdown() }));
  console.log(d, r.calls, r.tris, JSON.stringify(r.top));
  if (process.env.SHOT) await page.screenshot({ path: `test-results/perf-${d}.png` });
}
await browser.close();
