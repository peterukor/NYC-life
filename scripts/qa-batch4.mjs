// QA for batch 4: 📱 Games (Bodega Stack, Delivery Dash), ♟️ chess (a move,
// the reply, resign), 🎨 paint + hang + gallery, 🎣 fishing (cast, hook,
// reel, land), 🚴 bike race to the finish, 📍 trading floor perk.
// Shots: test-results/b4-*.png
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
const shot = (n) => page.screenshot({ path: `test-results/b4-${n}.png` });
const closeAll = () => ev(() => { document.querySelectorAll('.sheet.open').forEach((x) => x.classList.remove('open')); document.querySelectorAll('.modal-wrap, .mg-wrap').forEach((x) => x.remove()); });
await page.goto('http://localhost:4173/?qa=1&class=middle&hour=8&quality=low', { waitUntil: 'load' });
await ev(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year');
await page.select('#ob-year', '1995'); await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (e) => e.click()); await page.waitForSelector('#ob-start'); await page.$eval('#ob-start', (e) => e.click());
await wait(3500);
await ev(() => { const s = window.__nyc.state(); s.money = 500_000; s.needs.energy = 100; });

// 1. 📱 Games → Bodega Stack: tap till it falls.
await page.$eval('[data-nav="phone"]', (e) => e.click());
await page.waitForSelector('[data-act="app:games"]');
await page.$eval('[data-act="app:games"]', (e) => e.click());
await page.waitForSelector('[data-act="games.play:stack"]');
await shot('games');
await page.$eval('[data-act="games.play:stack"]', (e) => e.click());
await page.waitForSelector('.arc [data-go]');
await page.$eval('.arc [data-go]', (e) => e.click());
const cv = await page.$('.arc canvas');
const box = await cv.boundingBox();
for (let i = 0; i < 60 && (await page.$('.arc-over[hidden]')); i++) { await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await wait(450 + Math.random() * 300); }
await page.waitForSelector('.arc-over:not([hidden]) .arc-score', { timeout: 20000 });
const stackScore = Number(await page.$eval('.arc-score', (e) => e.textContent));
await shot('stack');
ok(stackScore > 0, `Bodega Stack plays and scores (${stackScore})`);
ok(await ev(() => (window.__nyc.state().fun?.tickets ?? 0) === 0), 'no 🎟️ tickets on the phone');
await closeAll();

// 2. ♟️ Chess: play e2-e4 vs the kid, they reply; then resign.
await ev(() => window.__nyc.enterPlace('chessHouse'));
await wait(2000);
await ev(() => window.__nyc.service('playChess'));
await page.waitForSelector('.sheet.open [data-act="play:kid:0"]');
await page.$eval('.sheet.open [data-act="play:kid:0"]', (e) => e.click());
await page.waitForSelector('.chess-board [data-sq="52"]');
await page.$eval('[data-sq="52"]', (e) => e.click()); // e2
await wait(150);
const dots = await page.$$eval('.chess-sq.dot', (e) => e.length);
ok(dots === 2, `tapping the e-pawn shows its 2 moves (${dots})`);
await page.$eval('[data-sq="36"]', (e) => e.click()); // e4
await page.waitForFunction(() => /Your move/.test(document.querySelector('[data-status]')?.textContent ?? ''), { timeout: 15000 });
const blackMoved = await ev(() => [...document.querySelectorAll('.chess-sq.last')].length === 2 && document.querySelector('[data-log]').textContent.includes('…'));
ok(blackMoved, 'the opponent replies');
await shot('chess');
await page.$eval('[data-act="resign"]', (e) => e.click());
await wait(300);
ok(await ev(() => (window.__nyc.state().chess?.losses?.kid ?? 0) === 1), 'resigning counts as a loss');
await closeAll();

// 3. 🎨 Paint, hang, see it on the wall.
await ev(() => window.__nyc.enterPlace('artParlor'));
await wait(2000);
await ev(() => window.__nyc.service('paintArt'));
await page.waitForSelector('.art-canvas');
const cb = await (await page.$('.art-canvas')).boundingBox();
const colors = await page.$$('.art-color');
for (let k = 0; k < 6; k++) {
  await colors[2 + k].click();
  await page.mouse.move(cb.x + 20 + k * 40, cb.y + 30);
  await page.mouse.down();
  for (let j = 0; j < 12; j++) await page.mouse.move(cb.x + 20 + k * 40 + Math.sin(j) * 30, cb.y + 30 + j * 22, { steps: 2 });
  await page.mouse.up();
}
await page.type('[data-title]', 'Pigeon at Dawn');
await shot('easel');
await page.$eval('[data-act="hang"]', (e) => e.click());
await wait(400);
ok(await ev(() => window.__nyc.state().art?.[0]?.title === 'Pigeon at Dawn'), 'painting hung');
await ev(() => window.__nyc.service('viewGallery'));
await page.waitForSelector('.gallery figure.mine img');
await shot('gallery');
ok(true, 'your painting is on the gallery wall');
await closeAll();

// 4. 🎣 Fish: cast, wait for the bite, hook, reel (pulse the hold), land.
await ev(() => window.__nyc.service('goFishing'));
await page.waitForSelector('.fish [data-main]');
let landed = false;
for (let attempt = 0; attempt < 6 && !landed; attempt++) {
  await page.waitForFunction(() => /Cast/.test(document.querySelector('[data-main]').textContent), { timeout: 8000 }).catch(() => {});
  await page.$eval('[data-main]', (e) => e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await page.waitForFunction(() => /Hook it/.test(document.querySelector('[data-main]').textContent), { timeout: 9000 }).catch(() => {});
  await page.$eval('[data-main]', (e) => e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  // Reel: hold while tension < 80%, let go above.
  const t0 = Date.now();
  while (Date.now() - t0 < 25000) {
    const st = await ev(() => ({ w: parseFloat(document.querySelector('[data-fill]').style.width) || 0, txt: document.querySelector('[data-msg]').textContent, main: document.querySelector('[data-main]').textContent }));
    if (/Landed/.test(st.txt)) { landed = true; break; }
    if (/SNAP|swam off|Too slow/.test(st.txt)) break;
    const hold = st.w < 75;
    await page.$eval('[data-main]', (e, h) => e.dispatchEvent(new PointerEvent(h ? 'pointerdown' : 'pointerup', { bubbles: true })), hold);
    await wait(60);
  }
}
await shot('fishing');
ok(landed, 'landed a fish');
ok(await ev(() => (window.__nyc.state().fishing?.caught ?? 0) >= 1), 'catch recorded');
await closeAll();

// 5. 🚴 Bike race: pedal left-right till the finish.
await ev(() => window.__nyc.service('bikeRace'));
await page.waitForSelector('.bike [data-p="L"]');
const tb = Date.now();
// A sensible rider: pedal, but ease off when the corner warning shows.
while (!(await page.$('.bike [data-act="close"]')) && Date.now() - tb < 200000) {
  const warn = await ev(() => {
    const m = document.querySelector('.bike [data-msg]')?.textContent ?? '';
    const v = parseInt(document.querySelector('[data-speed]')?.textContent ?? '0');
    const lim = Number((m.match(/under (\d+)/) || [])[1] || 99);
    return /Ease off|Wiped/.test(m) || v >= lim - 4;
  }).catch(() => false);
  if (!warn) {
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
  }
  await wait(120);
}
await shot('bike');
ok(!!(await page.$('.bike [data-act="close"]')), `bike race finishes (${await page.$eval('.bike [data-msg]', (e) => e.innerText).catch(() => '')})`);
await closeAll();

// 6. 📍 At the trading floor: the stocks app says no fees.
await ev(() => window.__nyc.enterPlace('midtownTower'));
await wait(2000);
await ev(() => window.__nyc.phoneApp('stocks'));
await wait(600);
ok(/On the trading floor/.test(await page.$eval('.phone', (e) => e.innerText).catch(() => '')), 'stocks app: no fees on the floor');

ok(!errors.length, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
process.exit(fails ? 1 : 0);
