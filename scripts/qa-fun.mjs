// QA: entertainment (Peter, 2026-10-14). Casino tables, the arcade's 5
// games and prize counter, the sportsbook, a club section with friends,
// the park and the gym's Train hard. Shots: test-results/fun-*.png
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 780 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (f, ...a) => page.evaluate(f, ...a);
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const click = async (sel) => { await page.waitForSelector(sel, { timeout: 8000 }); await page.$eval(sel, (el) => el.click()); };
const shot = (n) => page.screenshot({ path: `test-results/fun-${n}.png` });
const money = () => ev(() => window.__nyc.state().money);
const closeModal = async () => { const b = await page.$('.modal [data-close]'); if (b) await b.evaluate((el) => el.click()); await wait(300); };
const ONLY = process.env.ONLY ?? '';
const want = (k) => !ONLY || ONLY.split(',').includes(k);
await page.goto('http://localhost:4173/?qa=1&class=billionaire&hour=22&quality=low&arcadesec=4', { waitUntil: 'load' });
await ev(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year'); await page.select('#ob-year', '1995'); await page.type('#ob-name', 'Jack');
await click('#ob-go'); await click('#ob-start');
await wait(3000);
await ev(() => { const s = window.__nyc.state(); s.money = 2_000_000; });

if (want('casino')) {
  await ev(() => window.__nyc.enterPlace('empireCasino'));
  await wait(4500);
  await shot('casino-room');
  ok((await ev(() => window.__nyc.visitors())) > 0, 'casino has a crowd');
  // Slots
  await ev(() => window.__nyc.service('playSlots'));
  let m0 = await money();
  await click('.modal [data-spin]');
  await wait(800);
  await shot('slots-spin');
  await wait(1800);
  ok((await money()) !== m0 || /No luck|×/.test(await ev(() => document.querySelector('.cas-msg').textContent)), 'slots: spun and settled');
  await shot('slots');
  await closeModal();
  // Blackjack
  await ev(() => window.__nyc.service('playBlackjack'));
  await click('.modal [data-deal]');
  await wait(600);
  if (await page.$('.modal [data-playing]:not([hidden]) [data-stand]')) await click('.modal [data-stand]');
  await wait(600);
  ok(/Blackjack|win|Push|Dealer|Bust/.test(await ev(() => document.querySelector('.cas-msg').textContent)), 'blackjack: a hand played out');
  await shot('blackjack');
  await closeModal();
  // Roulette
  await ev(() => window.__nyc.service('playRoulette'));
  await click('.modal [data-bet="red"]');
  await click('.modal [data-spin]');
  await wait(1500);
  await shot('roulette-spin');
  await wait(3300);
  ok(/House wins|You win/.test(await ev(() => document.querySelector('.cas-msg').textContent)), 'roulette: the ball landed');
  await shot('roulette');
  await closeModal();
  // Rocket
  await ev(() => window.__nyc.service('playRocket'));
  await click('.modal [data-launch]');
  await wait(1200);
  await shot('rocket');
  const out = await page.$('.modal [data-out]:not([hidden])');
  if (out) await out.evaluate((el) => el.click());
  await wait(400);
  ok(/Cashed out|Blew up/.test(await ev(() => document.querySelector('.cas-msg').textContent)), 'rocket: cashed out or blew up');
  await shot('rocket-end');
  await closeModal();
}

if (want('arcade')) {
  await ev(() => window.__nyc.enterPlace('pixelPalace'));
  await wait(4500);
  await shot('arcade-room');
  for (const g of ['snake', 'hoops', 'pigeons', 'beats', 'claw']) {
    await ev((id) => window.__nyc.service('play' + id[0].toUpperCase() + id.slice(1)), g);
    await click('.modal [data-go]');
    await wait(1200);
    // Poke the game a bit (taps on the canvas).
    const box = await (await page.$('.arc-screen canvas')).boundingBox();
    for (let k = 0; k < 4; k++) { await page.mouse.click(box.x + box.width * (0.2 + 0.2 * k), box.y + box.height * 0.6); await wait(250); }
    await shot(`arcade-${g}`);
    await page.waitForSelector('.arc-over:not([hidden]) .arc-score', { timeout: 20000 }).catch(() => null);
    ok(!!(await page.$('.arc-over:not([hidden]) .arc-score')), `${g}: game over screen with a score`);
    await closeModal();
  }
  await ev(() => window.__nyc.service('prizeCounter'));
  await wait(500);
  await shot('prizes');
  ok(!!(await page.$('.sheet [data-act^="prize:"]')), 'prize counter lists prizes');
  await ev(() => document.querySelector('.sheet .close')?.click());
  await wait(300);
}

if (want('sports')) {
  await ev(() => window.__nyc.service('sportsbook'));
  await page.waitForSelector('.sb-team');
  await page.$eval('.sb-team', (el) => el.click());
  await wait(200);
  await click('.modal [data-bet]');
  await wait(300);
  await shot('sportsbook');
  ok(((await ev(() => window.__nyc.state().fun?.bets.length)) ?? 0) === 1, 'sportsbook: bet placed');
  await click('.modal [data-tab="live"]');
  await wait(1200);
  await shot('sportsbook-live');
  await click('.modal [data-tab="bets"]');
  await wait(300);
  await closeModal();
}

if (want('club')) {
  await ev(() => window.__nyc.enterPlace('velvetRoom'));
  await wait(4500);
  await ev(() => window.__nyc.service('getSection'));
  await click('.sheet [data-act="buy"]');
  await wait(500);
  ok(!!(await ev(() => window.__nyc.section())), 'section bought');
  await click('.sheet [data-act^="invite:"]');
  await wait(300);
  await click('.sheet [data-act^="invite:"]');
  await wait(300);
  ok((await ev(() => window.__nyc.state().section.friends.length)) === 2, '2 friends in');
  ok(!!(await page.$('.sheet [data-act^="invite:"][disabled]')), 'third seat needs more spend');
  await shot('section-sheet');
  // Bottles grow the section.
  await click('.sheet [data-act="bottles"]');
  await click('.sheet [data-act="bottle:goliath"]');
  await wait(1500);
  ok((await ev(() => window.__nyc.state().section.spent)) > 100_000, 'bottle spend counts toward the section');
  await ev(() => window.__nyc.service('getSection'));
  for (let k = 0; k < 10; k++) { const b = await page.$('.sheet [data-act^="invite:"]:not([disabled])'); if (!b) break; await b.evaluate((el) => el.click()); await wait(200); }
  const n = await ev(() => window.__nyc.state().section.friends.length);
  ok(n === 12, `12 friends after a $100k bottle (${n})`);
  await ev(() => document.querySelector('.sheet .close')?.click());
  await wait(2500);
  ok((await ev(() => window.__nyc.sectionCrew())) === n, 'friends standing in the section (3D)');
  ok(!!(await page.$('.section-chip')), 'section timer chip');
  await shot('section-3d');
}

if (want('park')) {
  await ev(() => window.__nyc.enterPlace('centralPark'));
  await wait(4500);
  await shot('park');
  ok((await ev(() => window.__nyc.visitors())) > 0, 'park has people');
}

if (want('gym')) {
  await ev(() => window.__nyc.enterPlace('ironGym'));
  await wait(4000);
  const f0 = await ev(() => window.__nyc.state().skills.fitness);
  await ev(() => window.__nyc.service('trainHard'));
  for (let k = 0; k < 12; k++) { await click('.modal [data-rep]'); await wait(150); }
  await wait(300);
  await shot('gym');
  ok((await ev(() => window.__nyc.state().skills.fitness)) >= f0, 'train hard: done');
  await closeModal();
}

console.log('errors:', [...new Set(errors)].join('\n') || 'none');
console.log(fails || errors.length ? `${fails} FAILED` : 'ALL OK');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
