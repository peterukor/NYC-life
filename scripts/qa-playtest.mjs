// Playtest at human speed on a throttled "phone": frame rate in each new
// venue, and the arcade games played with human reaction times (not
// perfect bot taps). Prints numbers to judge feel; screenshots in
// test-results/play-*.png.
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (f, ...a) => page.evaluate(f, ...a);
const click = async (sel) => { await page.waitForSelector(sel, { timeout: 8000 }); await page.$eval(sel, (el) => el.click()); };
await page.goto('http://localhost:4173/?qa=1&class=billionaire&hour=22&quality=medium', { waitUntil: 'load' });
await ev(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year'); await page.select('#ob-year', '1995'); await page.type('#ob-name', 'Jack');
await click('#ob-go'); await click('#ob-start');
await wait(3000);
await ev(() => { window.__nyc.state().money = 2_000_000; });
const fps = () => ev(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(Math.round(n / 3)); }; requestAnimationFrame(f); }));
const base = await fps();
await page.emulateCPUThrottling(4);
console.log(`swiftshader baseline fps (unthrottled, city): ${base}`);
for (const p of ['empireCasino', 'pixelPalace', 'centralPark', 'velvetRoom']) {
  await ev((p) => window.__nyc.enterPlace(p), p);
  await wait(4500);
  console.log(`${p}: ${await fps()} fps at 4× CPU slowdown`);
}
await page.emulateCPUThrottling(1);
// Small tap targets on the new screens.
await ev(() => window.__nyc.service('playRoulette'));
await wait(500);
const small = await ev(() => [...document.querySelectorAll('.modal button')].map((b) => b.getBoundingClientRect()).filter((r) => r.width > 0 && (r.height < 30 || r.width < 26)).length);
console.log(`roulette: ${small} buttons smaller than 26×30 px`);
await ev(() => document.querySelector('.modal [data-close]')?.click());
// Pigeon Pop with a human: notice after ~250–400 ms, miss now and then.
await ev(() => window.__nyc.enterPlace('pixelPalace'));
await wait(3500);
await ev(() => window.__nyc.service('playPigeons'));
await click('.modal [data-go]');
const box = await (await page.$('.arc-screen canvas')).boundingBox();
const t0 = Date.now();
let taps = 0;
while (Date.now() - t0 < 30_000 && !(await page.$('.arc-over:not([hidden]) .arc-score'))) {
  // A human scans the 3×3 grid and taps a random hole every ~450 ms (they can't see the canvas state; approximates attention).
  const i = Math.floor(Math.random() * 9);
  await page.touchscreen.tap(box.x + box.width * ((70 + (i % 3) * 110) / 360), box.y + box.height * ((150 + Math.floor(i / 3) * 110 - 18) / 480));
  taps++;
  await wait(300 + Math.random() * 300);
}
await page.waitForSelector('.arc-over:not([hidden]) .arc-score', { timeout: 15000 });
console.log(`pigeon pop, random-tapping human: score ${await ev(() => document.querySelector('.arc-score').textContent)} from ${taps} taps`);
await page.screenshot({ path: 'test-results/play-pigeons.png' });
await ev(() => document.querySelector('.modal [data-close]')?.click());
await browser.close();
