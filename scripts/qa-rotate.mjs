// QA: swing the view round rooms and screenshot each angle.
// PORT=4181 IDS=diveBar,pixelPalace,hkStudio,centralPark ANGLES=0,90,180,225 OUT=/tmp/claude-0/rotate TAG=after node scripts/qa-rotate.mjs
// W/H set the viewport (375×812 by default). BUTTONS=1 turns with the on-screen ↺ ↻ buttons
// instead of the QA hook, and checks they don't overlap the rest of the HUD.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const ids = (process.env.IDS ?? 'diveBar,pixelPalace,hkStudio,centralPark').split(',');
const angles = (process.env.ANGLES ?? '0,90,180,225').split(',').map(Number);
const out = process.env.OUT ?? '/tmp/claude-0/rotate';
const tag = process.env.TAG ?? 'after';
mkdirSync(out, { recursive: true });
const W = +(process.env.W ?? 375), H = +(process.env.H ?? 812);
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, protocolTimeout: 240000, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, hasTouch: W < 600, isMobile: W < 600 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${process.env.PORT ?? 4181}/?qa=1&class=${process.env.CLASS ?? 'middle'}&hour=${process.env.HOUR ?? 20}&quality=${process.env.Q ?? 'medium'}`, { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year', { timeout: 30000 });
await page.select('#ob-year', '1995');
await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (el) => el.click());
await page.waitForSelector('#ob-start', { timeout: 10000 });
await page.$eval('#ob-start', (el) => el.click());
await wait(3000);
await page.addStyleTag({ content: '.modal-wrap, .hint-tip, .toast-wrap, #toasts { display: none !important; }' });
const snap = await page.evaluate(() => typeof window.__nyc.setSwing === 'function');
for (const id of ids) {
  const ok = await page.evaluate((h) => window.__nyc.enterPlace(h), id);
  if (!ok) { console.log(id, 'no such place'); continue; }
  await wait(4500);
  let at = 0;
  for (const a of angles) {
    if (process.env.BUTTONS) {
      // Tap the real buttons, 45° a tap.
      while (at !== a) {
        const dir = ((a - at + 360) % 360) <= 180 ? 'right' : 'left';
        await page.$eval(`.room-rotate [data-rot="${dir}"]`, (el) => el.click());
        at = (at + (dir === 'right' ? 45 : -45) + 360) % 360;
      }
      await wait(snap ? 6000 : 9000);
    } else if (snap) {
      await page.evaluate((r) => window.__nyc.setSwing(r), (a * Math.PI) / 180);
      await wait(1200);
    } else {
      await page.evaluate((r) => window.__nyc.swing(r), ((a - at) * Math.PI) / 180);
      at = a;
      await wait(9000);
    }
    const file = `${out}/${tag}-${id}-${a}.png`;
    await page.screenshot({ path: file });
    console.log(file);
  }
  if (process.env.BUTTONS) {
    // Do the buttons sit clear of the HUD?
    const boxes = await page.evaluate(() => {
      const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
      const mine = document.querySelector('.room-rotate');
      const all = [...document.querySelectorAll('#ui button, #ui .chip, #ui .needs, #ui .dock, #ui .topbar, #ui [class*="chip"]')].filter((el) => !mine?.contains(el) && el.offsetParent);
      const m = mine && r(mine);
      const hits = m ? all.map((el) => ({ el: el.className || el.id, b: r(el) })).filter(({ b }) => b.w > 0 && b.x < m.x + m.w && b.x + b.w > m.x && b.y < m.y + m.h && b.y + b.h > m.y) : [];
      return { rotate: m, overlaps: hits.map((h) => h.el) };
    });
    console.log(id, 'buttons', JSON.stringify(boxes));
    // An action sheet over them (they must not peek through), and the turn kept after it closes.
    const objId = await page.evaluate(() => window.__nyc.objectWith('sleep') ?? null);
    const any = objId ?? (await page.evaluate(() => (window.__nyc.homeItems() ?? [])[0]?.uid ?? null));
    if (any && (await page.evaluate((u) => window.__nyc.openObject(u), any))) {
      await wait(2500);
      await page.screenshot({ path: `${out}/${tag}-${id}-sheet.png` });
      console.log(`${out}/${tag}-${id}-sheet.png`);
    }
    console.log(id, 'turn', await page.evaluate(() => window.__nyc.turn()));
  }
}
console.log(errors.length ? `ERRORS ${JSON.stringify(errors.slice(0, 5))}` : 'no page errors');
await browser.close();
