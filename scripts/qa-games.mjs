import puppeteer from 'puppeteer-core';
const games = [['empireCasino','playPoker'],['astoriaRoyale','playCraps'],["empireCasino","playBaccarat"],['empireCasino','playBigSix'],['astoriaRoyale','playKeno'],['astoriaRoyale','playPlinko'],['luckyStar','playScratch'],["empireCasino","playVideoPoker"],['navyYardClub','playPool'],['diveBar','playPool'],['pixelPalace','playPinball'],['kingsArcade','playSkeeball']];
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, protocolTimeout: 240000, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await browser.newPage();
await page.setViewport({ width: 375, height: 812 });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:4173/?qa=1&class=middle&hour=21&quality=low', { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year'); await page.select('#ob-year','1995'); await page.type('#ob-name','Jack');
await page.$eval('#ob-go', (el) => el.click()); await page.waitForSelector('#ob-start'); await page.$eval('#ob-start', (el) => el.click());
await wait(3000);
await page.evaluate(() => { window.__nyc.state().money = 5_000_000; });
let last = null;
for (const [pl, act] of games) {
  await page.evaluate(() => document.querySelectorAll('.modal-wrap,.sheet-wrap').forEach((m) => m.remove()));
  if (pl !== last) { await page.evaluate((h) => window.__nyc.enterPlace(h), pl); await wait(4000); last = pl; }
  await page.evaluate(() => document.querySelectorAll('.modal-wrap,.sheet-wrap').forEach((m) => m.remove()));
  const obj = await page.evaluate((a) => window.__nyc.objectWith(a), act);
  if (!obj) { console.log(pl, act, 'NO OBJECT'); continue; }
  await page.evaluate((o) => window.__nyc.openObject(o), obj); await wait(600);
  const clicked = await page.evaluate((a) => { const b = document.querySelector(`[data-act="do:${a}"]`); b?.click(); return !!b; }, act);
  await wait(1800);
  const opened = await page.evaluate(() => document.querySelectorAll('.modal-wrap').length);
  await page.screenshot({ path: `test-results/game-${act}-${pl}.png` });
  console.log(pl, act, 'button', clicked, 'modals', opened);
}
console.log(errors.length ? errors : 'no page errors');
await browser.close();
