// QA: what the sit / pick-up clips look like held at different moments.
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 300, height: 400 });
page.on('console', (m) => m.text().includes('[folk]') && console.log(m.text().slice(0, 900)));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => page.evaluate(fn, ...a);
await page.goto('http://localhost:4173/?qa=1&hour=11', { waitUntil: 'load' });
await ev(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year', { timeout: 30000 });
await page.select('#ob-year', '1995');
await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (el) => el.click());
await wait(3500);
await page.addStyleTag({ content: '.hud, .toasts { display: none !important; }' });
const p = await ev(() => window.__nyc.playerPos());
for (const clip of (process.env.CLIPS ?? 'sit,pickup').split(',')) for (const at of [0.25, 0.5, 0.75, 1]) {
  await ev((c, t) => window.__nyc.holdPose(c, t), clip, at);
  await wait(900);
  await ev((x, z) => window.__nyc.interiorCam(x + 2.4, 1.3, z, x, z), p.x, p.z);
  await wait(500);
  await page.screenshot({ path: `test-results/clip-${clip}-${at}.png` });
  console.log(clip, at, JSON.stringify(await ev(() => window.__nyc.animDebug())));
}
await browser.close();
