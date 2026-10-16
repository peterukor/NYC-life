// QA: every arcade game starts, reacts to input, shows effects and ends
// with a score, with no page errors. Shots: test-results/g-<game>-*.png
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (f, ...a) => page.evaluate(f, ...a);
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const only = process.argv[2]?.split(',');
await page.goto('http://localhost:4173/?qa=1&class=middle&hour=14&quality=low&arcadesec=12', { waitUntil: 'load' });
await ev(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year');
await page.select('#ob-year', '1995'); await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (e) => e.click()); await page.waitForSelector('#ob-start'); await page.$eval('#ob-start', (e) => e.click());
await wait(3500);
await ev(() => { const s = window.__nyc.state(); s.settings.hints = 'off'; });
const games = ['stack', 'dash', 'pigeons', 'hoops', 'beats', 'snake', 'claw'].filter((g) => !only || only.includes(g));
for (const id of games) {
  await ev(() => document.querySelectorAll('.modal-wrap').forEach((x) => x.remove()));
  await ev((i) => window.__nyc.playGame?.(i) ?? window.__nyc.arcade?.(i), id);
  await page.waitForSelector('.arc [data-go]', { timeout: 8000 });
  await page.$eval('.arc [data-go]', (e) => e.click());
  const cv = await page.$('.arc canvas');
  const box = await cv.boundingBox();
  const t0 = Date.now();
  let shot = false;
  while (Date.now() - t0 < 40000 && (await page.$('.arc-over[hidden]'))) {
    const x = box.x + Math.random() * box.width, y = box.y + box.height * (0.3 + Math.random() * 0.5);
    if (id === 'snake') await page.keyboard.press(['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'][Math.floor(Math.random() * 4)]);
    else if (id === 'claw') { if (Date.now() - t0 > 2500) await page.$eval('[data-claw-drop]', (e) => e.click()).catch(() => {}); else { await page.mouse.move(box.x + 60, box.y + 200); await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.6, box.y + 200, { steps: 6 }); await page.mouse.up(); } }
    else await page.mouse.click(x, y);
    await wait(id === 'beats' ? 120 : id === 'stack' ? 500 + Math.random() * 300 : 250);
    if (!shot && Date.now() - t0 > 4000) { shot = true; await page.screenshot({ path: `test-results/g-${id}-play.png` }); }
  }
  const sc = await page.$eval('.arc-over:not([hidden]) .arc-score', (e) => e.textContent).catch(() => null);
  await page.screenshot({ path: `test-results/g-${id}-end.png` });
  ok(sc !== null, `${id}: ended with a score (${sc}) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  await page.$eval('.arc [data-close]', (e) => e.click()).catch(() => {});
  await wait(300);
}
ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
console.log(fails ? `${fails} FAILED` : 'ALL OK');
await browser.close();
process.exit(fails ? 1 : 0);
