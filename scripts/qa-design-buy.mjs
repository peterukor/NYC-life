// QA: the design menu's Buy tab (Peter, 2026-11-01: "just tapping it takes
// my money" and "one of the tabs is hidden"). For each viewport it checks
// every category chip can be reached and shows pieces, then runs the
// buy flow: tap → preview (no charge) → cancel (no charge) → tap → place
// the ghost → "Buy & place" (charged once) → Storage place stays free.
// Usage: PORT=4184 OUT=/tmp/claude-0/design TAG=after node scripts/qa-design-buy.mjs
//   SIZES=375x812,390x844,1280x800   FLOW=0 skips the buy flow
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const PORT = process.env.PORT ?? 4173;
const OUT = process.env.OUT ?? 'test-results';
const TAG = process.env.TAG ?? 'after';
const cls = process.env.CLASS ?? 'rich';
const sizes = (process.env.SIZES ?? '375x812,390x844,1280x800').split(',').map((s) => s.split('x').map(Number));
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) fails.push(what);
};
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function boot(W, H) {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/?qa=1&class=${cls}&hour=11&quality=low`, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#ob-year', { timeout: 30000 });
  await page.select('#ob-year', '1995');
  await page.type('#ob-name', 'Jack');
  await page.$eval('#ob-go', (el) => el.click());
  await page.waitForSelector('#ob-start', { timeout: 10000 });
  await page.$eval('#ob-start', (el) => el.click());
  await wait(3000);
  const home = await page.evaluate(() => window.__nyc.state().home.placeId);
  await page.evaluate((h) => window.__nyc.enterPlace(h), home);
  await wait(4000);
  await page.evaluate(() => window.__nyc.design());
  await wait(1200);
  return { page, errors };
}

/** Where each chip sits against the row's visible box, and whether the row can scroll to it. */
const chipReport = (page) =>
  page.evaluate(() => {
    const row = document.querySelector('.design-body .chips');
    const rb = row.getBoundingClientRect();
    const cs = getComputedStyle(row);
    return {
      row: { left: rb.left, right: rb.right, top: rb.top, bottom: rb.bottom, scrollW: row.scrollWidth, clientW: row.clientWidth, justify: cs.justifyContent, wrap: cs.flexWrap },
      chips: [...row.querySelectorAll('[data-cat]')].map((b) => {
        const r = b.getBoundingClientRect();
        // What's actually on top at the chip's centre (covered = something else).
        const cx = Math.min(Math.max(r.left + r.width / 2, rb.left + 1), rb.right - 1);
        const top = document.elementFromPoint(cx, r.top + r.height / 2);
        return { id: b.dataset.cat, text: b.textContent.trim(), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), onTop: !!top && (top === b || b.contains(top)) };
      }),
    };
  });

for (const [W, H] of sizes) {
  console.log(`\n== ${W}x${H} (${TAG})`);
  const { page, errors } = await boot(W, H);
  const rep = await chipReport(page);
  console.log('row', JSON.stringify(rep.row));
  for (const c of rep.chips) console.log(`  ${c.id.padEnd(8)} ${String(c.left).padStart(5)}..${String(c.right).padEnd(5)} top ${c.top} ${c.onTop ? '' : '(not on top)'}`);
  await page.screenshot({ path: `${OUT}/${TAG}-tabs-${W}x${H}.png` });
  await page.screenshot({ path: `${OUT}/${TAG}-tabs-${W}x${H}-row.png`, clip: { x: 0, y: Math.max(0, rep.row.top - 70), width: W, height: rep.row.bottom - rep.row.top + 110 } });
  // Every chip: scroll the row to it the way a finger would (scrollLeft), tap it, and see pieces.
  for (const c of rep.chips) {
    const res = await page.evaluate((id) => {
      const row = document.querySelector('.design-body .chips');
      const b = row.querySelector(`[data-cat="${id}"]`);
      // A finger can only scroll between 0 and scrollWidth - clientWidth.
      const want = b.offsetLeft - row.offsetLeft - 8;
      row.scrollLeft = Math.max(0, want);
      const rb = row.getBoundingClientRect(), r = b.getBoundingClientRect();
      const visible = r.left >= rb.left - 1 && r.right <= rb.right + 1;
      return { visible, left: r.left - rb.left };
    }, c.id);
    // Tap it at its centre on screen (a real click: it must not be covered).
    const box = await page.$eval(`[data-cat="${c.id}"]`, (b) => { const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.click(box.x, box.y);
    await wait(250);
    const after = await page.evaluate((id) => ({
      sel: document.querySelector('.design-body .chips [aria-selected="true"]')?.dataset.cat,
      cards: document.querySelectorAll('.design-body [data-buy]').length,
      chipVis: (() => { const row = document.querySelector('.design-body .chips'); const b = row.querySelector(`[data-cat="${id}"]`); const rb = row.getBoundingClientRect(), r = b.getBoundingClientRect(); return r.left >= rb.left - 1 && r.right <= rb.right + 1; })(),
    }), c.id);
    check(res.visible && after.sel === c.id && after.cards > 0 && after.chipVis, `${W}x${H} chip ${c.id}: reachable ${res.visible}, tapped → selected ${after.sel}, ${after.cards} pieces, still in view ${after.chipVis}`);
  }
  // Back to the start for the "after a tap" shot of the row.
  await page.$eval('[data-cat="lights"]', (b) => b.click());
  await wait(600);
  const rep2 = await chipReport(page);
  await page.screenshot({ path: `${OUT}/${TAG}-tabs-${W}x${H}-lights.png`, clip: { x: 0, y: Math.max(0, rep2.row.top - 70), width: W, height: rep2.row.bottom - rep2.row.top + 110 } });

  if (process.env.FLOW !== '0' && W < 500) await flow(page, W, H);
  check(!errors.length, `${W}x${H} no page errors ${errors.length ? JSON.stringify(errors.slice(0, 4)) : ''}`);
  await page.close();
}

async function flow(page, W, H) {
  const tag = `${TAG}-${W}x${H}`;
  const cash = () => page.evaluate(() => window.__nyc.state().money);
  const items = () => page.evaluate(() => window.__nyc.homeItems().length);
  await page.evaluate(() => { window.__nyc.state().money = 1_000_000; });
  const id = 'crystalChandelier';
  const price = await page.evaluate((id) => window.__nyc.furniturePrice?.(id) ?? null, id);
  await page.$eval('[data-cat="lights"]', (b) => b.click());
  await wait(500);
  const m0 = await cash(), n0 = await items();
  await page.$eval(`[data-buy="${id}"]`, (b) => b.scrollIntoView({ block: 'center' }));
  const card = await page.$eval(`[data-buy="${id}"]`, (b) => { const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.click(card.x, card.y);
  await wait(1500);
  const m1 = await cash();
  await page.screenshot({ path: `${OUT}/${tag}-1-preview.png` });
  const sheet = await page.$('.buy-preview');
  check(m1 === m0, `${W}x${H} tap an item: money ${m0} → ${m1} (no charge)`);
  if (!sheet) {
    check(false, `${W}x${H} a preview card opens`);
    return;
  }
  const info = await page.$eval('.buy-preview', (el) => el.textContent.replace(/\s+/g, ' ').trim());
  console.log('  preview:', info.slice(0, 260));
  check(/Chandelier/.test(info) && /\$/.test(info) && /Buy & place/.test(info), `${W}x${H} preview shows name, price and Buy & place`);
  check(price == null || info.includes(`$${(price / 100).toLocaleString('en-US')}`), `${W}x${H} preview price matches the catalogue (${price})`);
  check(!!(await page.$('.buy-preview img.ready, .buy-preview img[data-thumb]')), `${W}x${H} preview has a big picture`);
  // Cancel: nothing charged, nothing left in the room.
  await page.$eval('.buy-preview [data-pv="cancel"]', (b) => b.click());
  await wait(600);
  check((await cash()) === m0 && (await items()) === n0 && !(await page.$('.buy-preview')), `${W}x${H} cancel: money ${await cash()} (was ${m0}), pieces ${await items()} (was ${n0})`);
  await page.screenshot({ path: `${OUT}/${tag}-2-cancelled.png` });
  // Again, this time try it in the room first.
  await page.$eval(`[data-buy="${id}"]`, (b) => b.click());
  await wait(800);
  const tryBtn = await page.$('.buy-preview [data-pv="try"]');
  check(!!tryBtn, `${W}x${H} preview has "Try it in the room"`);
  if (tryBtn) {
    await tryBtn.click();
    await wait(1200);
    const m2 = await cash(), n2 = await items();
    const bar = await page.$eval('.move-bar', (el) => el.textContent.replace(/\s+/g, ' ')).catch(() => null);
    console.log('  ghost bar:', bar);
    check(m2 === m0 && n2 === n0 + 1 && !!bar && /Buy & place/.test(bar), `${W}x${H} ghost in the room: money ${m2} (unchanged), pieces ${n2}, bar "${bar}"`);
    await page.screenshot({ path: `${OUT}/${tag}-3-ghost.png` });
    // Cancel the ghost: it goes, nothing charged.
    await page.$eval('.move-bar [data-mv="cancel"]', (b) => b.click());
    await wait(800);
    check((await cash()) === m0 && (await items()) === n0, `${W}x${H} cancel the ghost: money ${await cash()}, pieces ${await items()} (was ${n0})`);
    await page.screenshot({ path: `${OUT}/${tag}-4-ghost-cancelled.png` });
    // Try again and buy it.
    await page.$eval(`[data-buy="${id}"]`, (b) => b.click());
    await wait(600);
    await page.$eval('.buy-preview [data-pv="try"]', (b) => b.click());
    await wait(1000);
    await page.$eval('.move-bar [data-mv="done"]', (b) => b.click());
    await wait(1000);
    const m3 = await cash(), n3 = await items();
    check(m3 === m0 - price && n3 === n0 + 1, `${W}x${H} Buy & place from the room: money ${m0} → ${m3} (−${m0 - m3}, price ${price}), pieces ${n3}`);
    await page.screenshot({ path: `${OUT}/${tag}-5-bought.png` });
  }
  // Straight from the sheet: Buy & place charges once and starts move mode; Done keeps it.
  const m4 = await cash(), n4 = await items();
  await page.$eval(`[data-buy="${id}"]`, (b) => b.click());
  await wait(600);
  await page.$eval('.buy-preview [data-pv="buy"]', (b) => b.click());
  await wait(1000);
  const m5 = await cash();
  check(m5 === m4 - price && (await items()) === n4 + 1, `${W}x${H} Buy & place from the sheet: money ${m4} → ${m5}`);
  const bar2 = await page.$eval('.move-bar', (el) => el.textContent.replace(/\s+/g, ' ')).catch(() => null);
  check(!!bar2 && !/Buy/.test(bar2), `${W}x${H} after paying the move bar is a plain move ("${bar2}")`);
  await page.$eval('.move-bar [data-mv="done"]', (b) => b.click());
  await wait(800);
  // Put the chandelier away and place it from Storage: free, no sheet.
  const uid = await page.evaluate((id) => window.__nyc.homeItems().filter((i) => i.item === id).at(-1).uid, id);
  await page.evaluate((uid) => window.__nyc.storeFurniture?.(uid), uid);
  await wait(500);
  const stored = await page.evaluate(() => window.__nyc.state().storage ?? []);
  check(stored.includes(id), `${W}x${H} put away → in storage (${stored.length} stored)`);
  await page.$eval('[data-tab="storage"]', (b) => b.click());
  await wait(800);
  const m6 = await cash();
  await page.$eval(`[data-stored="${id}"]`, (b) => b.click());
  await wait(1000);
  check(!(await page.$('.buy-preview')) && !!(await page.$('.move-bar')) && (await cash()) === m6, `${W}x${H} place from Storage: free (${m6} → ${await cash()}), no confirm, move bar up`);
  await page.screenshot({ path: `${OUT}/${tag}-6-storage-place.png` });
  await page.$eval('.move-bar [data-mv="done"]', (b) => b.click());
  await wait(600);
  // Tap a piece: Move / Put away / Sell still there.
  const acts = await page.evaluate((id) => {
    const it = window.__nyc.homeItems().filter((i) => i.item === id).at(-1);
    return it?.uid;
  }, id);
  if (acts) {
    const p = await page.evaluate((u) => { const it = window.__nyc.homeItems().find((i) => i.uid === u); return window.__nyc.floorScreen(it.x, it.z); }, acts);
    await page.mouse.click(p.x, p.y - 12);
    await wait(700);
    const btns = await page.$$eval('.piece-acts button', (bs) => bs.map((b) => b.textContent.trim()));
    console.log('  piece buttons:', btns.join(' | '));
    await page.screenshot({ path: `${OUT}/${tag}-7-piece.png` });
  }
}

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall checks passed');
process.exit(fails.length ? 1 : 0);
