// QA: close-ups of the character using each piece in the walk-up.
// Shots: test-results/pose-*.png
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 780 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => page.evaluate(fn, ...a);
await page.goto('http://localhost:4173/?qa=1&hour=11', { waitUntil: 'load' });
await ev(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year', { timeout: 30000 });
await page.select('#ob-year', '1995');
await page.type('#ob-name', 'Jack');
await page.$eval('[data-origin="poor"]', (el) => el.click());
await page.$eval('#ob-go', (el) => el.click());
await wait(3500);
await page.addStyleTag({ content: '.hud, .toast, .toasts { display: none !important; }' });
const tapItem = async (uid) => { const s = await ev((u) => window.__nyc.itemScreen(u), uid); await page.mouse.click(s.x, s.y); };
const walked = async () => { for (let k = 0; k < 400 && (await ev(() => window.__nyc.walking())); k++) await wait(100); await wait(300); };
const only = (process.env.ONLY ?? '').split(',').filter(Boolean);
for (const [uid, act, cam] of [
  ['bed', 'sleep', [1.6, 1.6, 1.4]],
  ['tv', 'watchTv', [0.4, 1.3, -1.1]],
  ['toilet', 'toilet', [-0.3, 1.2, -1.0]],
  ['tub', 'shower', [-1.0, 1.5, -0.6]],
  ['desk', 'codePractice', [1.2, 1.3, 1.4]],
  ['stove', 'cookPasta', [1.6, 1.4, 0.6]],
  ['fridge', 'snack', [1.6, 1.4, 0.6]],
]) {
  if (only.length && !only.includes(uid)) continue;
  await tapItem(uid);
  await walked();
  try {
    await page.waitForSelector(`[data-act="do:${act}"]`, { timeout: 5000 });
  } catch {
    await page.screenshot({ path: `test-results/pose-${uid}-fail.png` });
    console.log('no', act, 'sheet:', await ev(() => document.querySelector('.sheet h2')?.textContent), 'activity', JSON.stringify(await ev(() => window.__nyc.activity())), 'progress bars', await ev(() => document.querySelectorAll('.progress').length));
    continue;
  }
  await page.$eval(`[data-act="do:${act}"]`, (el) => el.click());
  await walked();
  await wait(1500);
  const p = await ev(() => window.__nyc.playerPos());
  await ev((x, z, c) => window.__nyc.interiorCam(x + c[0] * 2.2, c[1] * 1.5, z + c[2] * 2.2, x, z), p.x, p.z, cam);
  await wait(400);
  await page.screenshot({ path: `test-results/pose-${uid}.png` });
  await page.$eval('.progress .skip', (el) => el.click()).catch(() => {});
  await wait(300);
  await ev(() => window.__nyc.resetCam?.());
  await wait(1200);
}
console.log('errors:', [...new Set(errors)].join('\n') || 'none');
await browser.close();
