// QA: lie down in every home's beds and screenshot it close and in the game's own view.
// PORT=4181 HOMES=shelter,hkStudio,sharedApt,wburgLoft,uesApt,penthouse OUT=/tmp/claude-0/sleep TAG=after node scripts/qa-sleep.mjs
// Prints where the head and feet end up against the bed's footprint (numbers to check the pose).
// TRANSITION=1 also shoots getting in and out (a few frames each).
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const homes = (process.env.HOMES ?? 'shelter,hkStudio,sharedApt,wburgLoft,uesApt,penthouse').split(',');
const out = process.env.OUT ?? '/tmp/claude-0/sleep';
const tag = process.env.TAG ?? 'after';
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, protocolTimeout: 240000, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await browser.newPage();
await page.setViewport({ width: +(process.env.W ?? 375), height: +(process.env.H ?? 812) });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${process.env.PORT ?? 4181}/?qa=1&class=middle&hour=${process.env.HOUR ?? 23}&quality=${process.env.Q ?? 'medium'}`, { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year', { timeout: 30000 });
await page.select('#ob-year', '1995');
await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (el) => el.click());
await page.waitForSelector('#ob-start', { timeout: 10000 });
await page.$eval('#ob-start', (el) => el.click());
await wait(3000);
await page.addStyleTag({ content: '.modal-wrap, .hint-tip, .toasts { display: none !important; }' });
const BEDS = /bed|bunk|king/i;
const NOT_BEDS = /flower|cat|dog|tub/i;
for (const id of homes) {
  await page.evaluate((h) => window.__nyc.enterPlace(h), id);
  await wait(4500);
  const items = await page.evaluate(() => window.__nyc.homeItems());
  const beds = items.filter((i) => BEDS.test(i.item) && !NOT_BEDS.test(i.item));
  // One of each kind of bed in the home (plus both bunks' levels in the shelter).
  const seen = new Set();
  for (const b of beds) {
    if (seen.has(b.item)) continue;
    seen.add(b.item);
    const levels = /bunk/i.test(b.item) ? (process.env.LEVELS ?? 'bottom,top').split(',') : [''];
    for (const lvl of levels) {
      await page.evaluate((n) => window.__nyc.setNeed('energy', n), 2);
      if (lvl) await page.evaluate((l) => window.__nyc.bunkLevel?.(l), lvl);
      if (process.env.TRANSITION) {
        // Watch the bed from the side while getting in (the glide slowed down so the shots catch it).
        const f = await page.evaluate((u) => window.__nyc.pieceFootprint(u), b.uid);
        await page.evaluate((k) => window.__nyc.bedGlideSlow(k), +(process.env.SLOW ?? 10));
        await page.evaluate((a) => window.__nyc.camOn(a[0], a[1], a[2], 4.2, a[3] + Math.PI / 2, 0.55), [f.x, lvl === 'top' ? 1.3 : 0.7, f.z, f.rot]);
        await wait(2500);
      }
      const err = await page.evaluate((u) => window.__nyc.useNow(u, 'sleep'), b.uid);
      if (err) { console.log(id, b.item, 'ERR', err); continue; }
      if (process.env.TRANSITION) {
        // Getting in: frames as it happens.
        for (let k = 0; k < +(process.env.FRAMES ?? 4); k++) {
          await page.screenshot({ path: `${out}/${tag}-${id}-${b.item}${lvl}-in${k}.png` });
          await wait(+(process.env.FRAME_MS ?? 900));
        }
      }
      await wait(2500);
      const ends = await page.evaluate(() => window.__nyc.bodyEnds());
      const fp = await page.evaluate((u) => window.__nyc.pieceFootprint?.(u) ?? null, b.uid);
      console.log(id, b.item + (lvl ? `(${lvl})` : ''), 'rot', b.rot, JSON.stringify(ends), fp ? `bed ${JSON.stringify(fp)}` : '');
      // The game's own view, zoomed in on the bed (what Peter sees).
      const scr = await page.evaluate(() => window.__nyc.playerScreen());
      const vw = +(process.env.W ?? 375), vh = +(process.env.H ?? 812);
      if (scr) await page.evaluate((s) => window.__nyc.zoomAt(2.4, s[0], s[1]), [(scr.x / vw) * 2 - 1, -((scr.y / vh) * 2 - 1)]);
      await wait(+(process.env.SETTLE ?? 3500));
      if (process.env.DEBUG) console.log('view', JSON.stringify(scr), JSON.stringify(await page.evaluate(() => window.__nyc.view())));
      await page.screenshot({ path: `${out}/${tag}-${id}-${b.item}${lvl}-game.png` });
      // Close up from the side and from the foot of the bed.
      const p = ends.root;
      const hx = (ends.head.x + ends.foot.x) / 2, hz = (ends.head.z + ends.foot.z) / 2, hy = Math.max(ends.head.y, ends.foot.y);
      await page.evaluate((a) => window.__nyc.camOn(a[0], a[1], a[2], 3.6, a[3] + Math.PI / 2, 0.7), [hx, hy, hz, b.rot]);
      await wait(+(process.env.SETTLE ?? 3500));
      await page.screenshot({ path: `${out}/${tag}-${id}-${b.item}${lvl}-side.png` });
      await page.evaluate((a) => window.__nyc.camOn(a[0], a[1], a[2], 2.8, a[3], 0.6), [hx, hy, hz, b.rot]);
      await wait(+(process.env.SETTLE ?? 3500));
      await page.screenshot({ path: `${out}/${tag}-${id}-${b.item}${lvl}-foot.png` });
      void p;
      if (process.env.TRANSITION) {
        await page.evaluate((a) => window.__nyc.camOn(a[0], a[1], a[2], 4.2, a[3] + Math.PI / 2, 0.55), [hx, hy - 0.3, hz, b.rot]);
        await wait(2500);
      }
      await page.evaluate(() => window.__nyc.stopDoing());
      if (process.env.TRANSITION) {
        for (let k = 0; k < +(process.env.FRAMES ?? 4); k++) {
          await page.screenshot({ path: `${out}/${tag}-${id}-${b.item}${lvl}-out${k}.png` });
          await wait(+(process.env.FRAME_MS ?? 900));
        }
      }
      await page.evaluate(() => window.__nyc.bedGlideSlow(1));
      await page.evaluate(() => window.__nyc.resetCam());
      await wait(800);
    }
  }
}
console.log(errors.length ? `ERRORS ${JSON.stringify(errors.slice(0, 5))}` : 'no page errors');
await browser.close();
