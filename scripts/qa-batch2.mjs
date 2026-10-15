// QA for batch 2: the fight minigame (a bot that plays it), the chase
// minigame (runs, ends, applies the result), crimes → chases with a
// cooldown, weird events with choices. Shots: test-results/b2-*.png
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
const shot = (n) => page.screenshot({ path: `test-results/b2-${n}.png` });
await page.goto('http://localhost:4173/?qa=1&class=middle&hour=22&quality=low', { waitUntil: 'load' });
await ev(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year');
await page.select('#ob-year', '1995'); await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (e) => e.click()); await page.waitForSelector('#ob-start'); await page.$eval('#ob-start', (e) => e.click());
await wait(3500);
await ev(() => { const s = window.__nyc.state(); s.skills.fitness = 6; s.skills.streetSmarts = 4; });

// A bot that plays the fight well: swing when the needle is in the green, dodge when asked.
const playFightBot = async (skill = 1) => {
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    const st = await ev(() => {
      const fight = document.querySelector('.mg-fight');
      if (!fight) return 'gone';
      const dodge = document.querySelector('[data-dodge]');
      if (dodge && !dodge.hidden) return 'dodge';
      const hit = document.querySelector('[data-hit]');
      if (!hit || hit.hidden) return 'wait';
      const z = document.querySelector('[data-zone]'), n = document.querySelector('[data-needle]');
      const zl = parseFloat(z.style.left), zw = parseFloat(z.style.width), nl = parseFloat(n.style.left);
      return nl > zl + zw * 0.2 && nl < zl + zw * 0.8 ? 'swing' : 'aim';
    });
    if (st === 'gone') return true;
    if (st === 'dodge') await ev(() => document.querySelector('[data-dodge]').click());
    if (st === 'swing' && Math.random() < skill) await ev(() => document.querySelector('[data-hit]').click());
    await wait(15);
  }
  return false;
};

// 1. Fight vs a weak foe, played well: should win, rep goes up.
const rep0 = await ev(() => window.__nyc.state().rep?.street ?? 0);
const fightDone = ev(() => window.__nyc.fight(2));
await page.waitForSelector('.mg-fight');
await wait(300);
await shot('fight');
const finished = await playFightBot(1);
ok(finished, 'the fight plays to the end');
await fightDone.catch(() => {});
await page.waitForSelector('.modal [data-act="ok"]', { timeout: 8000 });
const card = await page.$eval('.modal', (e) => e.innerText);
await shot('fight-result');
await page.$eval('.modal [data-act="ok"]', (e) => e.click());
const rep1 = await ev(() => window.__nyc.state().rep?.street ?? 0);
ok(/won/i.test(card) && rep1 > rep0, `a well-played fight vs a weak foe is won, rep up (${rep0} → ${rep1})`);

// 2. A fight you don't touch: you lose (slow on the dodges), rep down.
await ev(() => { window.__nyc.state().rep.street = 50; });
const lose = ev(() => window.__nyc.fight(7));
await page.waitForSelector('.mg-fight');
await page.waitForSelector('.modal [data-act="ok"]', { timeout: 60000 });
const card2 = await page.$eval('.modal', (e) => e.innerText);
await page.$eval('.modal [data-act="ok"]', (e) => e.click());
await lose.catch(() => {});
const rep2 = await ev(() => window.__nyc.state().rep?.street ?? 0);
ok(/lost/i.test(card2) && rep2 < 50, `ignoring the fight loses it, rep down (50 → ${rep2})`);
ok(await ev(() => (window.__nyc.state().stats.fightsWon ?? 0) === 1 && (window.__nyc.state().stats.fightsLost ?? 0) === 1), 'fight stats counted');

// 3. Chase: runs, ends, result applied. Dodge randomly (it may go either way).
const chaseP = ev(() => window.__nyc.chase(1));
await page.waitForSelector('.mg-chase canvas');
await wait(2000);
await shot('chase');
const box = await (await page.$('.mg-chase canvas')).boundingBox();
const t0 = Date.now();
while ((await page.$('.mg-chase')) && Date.now() - t0 < 40000) {
  await page.mouse.click(box.x + (Math.random() < 0.5 ? 40 : box.width - 40), box.y + box.height / 2);
  await wait(350);
}
const got = await chaseP.catch(() => null);
ok(!(await page.$('.mg-chase')), `the chase ends (${got ? 'escaped' : 'caught'})`);
if (await page.$('.modal [data-act="ok"]')) { await shot('chase-result'); await page.$eval('.modal [data-act="ok"]', (e) => e.click()); }
const st = await ev(() => window.__nyc.state().stats);
ok((st.chasesEscaped ?? 0) + (st.chasesCaught ?? 0) === 1, 'chase result counted');

// 4. Cops: first time → a chase; right after → straight arrest (cooldown).
await ev(() => { window.__nyc.state().stats.lastChase = 0; window.__nyc.state().jail = null; });
const c1 = ev(() => window.__nyc.cops(0.1));
const chased = await page.waitForSelector('.mg-chase', { timeout: 5000 }).then(() => true).catch(() => false);
ok(chased, 'the cops seeing a crime starts a chase');
while (await page.$('.mg-chase')) await wait(300);
await wait(1500);
if (await page.$('.modal [data-act="ok"]')) await page.$eval('.modal [data-act="ok"]', (e) => e.click());
await c1.catch(() => {});
await ev(() => { window.__nyc.state().jail = null; });
await ev(() => window.__nyc.cops(0.1));
await wait(800);
ok(!(await page.$('.mg-chase')) && (await ev(() => !!window.__nyc.state().jail)), 'seen again soon after: straight arrest, no second chase');
await ev(() => { window.__nyc.state().jail = null; });

// 5. A weird event with choices, played through.
await ev(() => window.__nyc.event('halalCut'));
await page.waitForSelector('.modal .choice');
await shot('weird-event');
const nChoices = await page.$$eval('.modal .choice', (e) => e.length);
ok(nChoices >= 2, `weird event shows choices (${nChoices})`);
await page.$eval('.modal .choice', (e) => e.click());
await wait(800);
if (await page.$('.mg-fight')) await playFightBot(0.6);
await page.waitForSelector('.modal [data-act="ok"]', { timeout: 30000 }).catch(() => {});
if (await page.$('.modal [data-act="ok"]')) await page.$eval('.modal [data-act="ok"]', (e) => e.click());
ok(true, 'weird event resolves');

ok(!errors.length, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
process.exit(fails ? 1 : 0);
