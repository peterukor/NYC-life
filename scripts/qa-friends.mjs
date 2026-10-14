// QA: friends (Peter, 2026-10-14). Link Up invites with typed replies,
// meeting at the park, a hangout with the friend's avatar, a home visit
// with a shared meal, and (PART=club) talking to guests in a section.
// Shots: test-results/friends-*.png
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 780, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (f, ...a) => page.evaluate(f, ...a);
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const click = async (sel) => { await page.waitForSelector(sel, { timeout: 8000 }); await page.$eval(sel, (el) => el.click()); };
const shot = (n) => page.screenshot({ path: `test-results/friends-${n}.png` });
const PART = process.env.PART ?? 'friends';
await page.goto(`http://localhost:4173/?qa=1&class=middle&hour=${PART === 'club' ? 22 : 15}&quality=low`, { waitUntil: 'load' });
await ev(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year'); await page.select('#ob-year', '1995'); await page.type('#ob-name', 'Jack');
await click('#ob-go'); await click('#ob-start');
await wait(3000);
await ev(() => { window.__nyc.state().money = 500_000; });

/** Invite friends one by one until someone says yes to `outing` (taking counter-offers). */
async function plan(outing, ids) {
  for (const id of ids) {
    await ev(() => window.__nyc.phoneApp('linkup'));
    await page.waitForSelector('.card.friend');
    const c = await page.$(`[data-act="linkup.compose:${id}"]`);
    if (c) await c.evaluate((el) => el.click());
    await click(`[data-act="linkup.pick:${outing}"]`);
    await click('[data-act="linkup.when:now"]');
    await click('[data-act="linkup.send"]');
    await wait(1600);
    const take = await page.$('[data-act^="linkup.take:"]');
    if (take) { await take.evaluate((el) => el.click()); await wait(300); }
    const accepted = await ev((o) => window.__nyc.social().invites.some((i) => i.status === 'accepted' && i.outing === o), outing);
    await ev(() => document.querySelector('.phone [data-act="close"]')?.click());
    await wait(300);
    if (accepted) return id;
  }
  return null;
}

if (PART === 'friends') {
  const ids = Array.from({ length: 12 }, (_, i) => `qa-friend-${i}`);
  for (const id of ids) await ev((id) => window.__nyc.makeFriend(id, 40), id);
  await ev(() => window.__nyc.phoneApp('linkup'));
  await wait(500);
  await shot('linkup');
  ok((await page.$$('.card.friend')).length === 12, 'Link Up lists your friends');
  await click('[data-act="linkup.compose:qa-friend-0"]');
  await shot('compose');
  await ev(() => document.querySelector('.phone [data-act="close"]')?.click());
  await wait(300);
  // The park.
  const parkFriend = await plan('park', ids);
  ok(!!parkFriend, `someone said yes to the park (${parkFriend})`);
  await ev(() => window.__nyc.phoneApp('linkup'));
  await wait(1700);
  await shot('reply');
  await ev(() => document.querySelector('.phone [data-act="close"]')?.click());
  const where = await ev(() => window.__nyc.planNow());
  await ev((p) => window.__nyc.enterPlace(p), where);
  await wait(4000);
  await page.waitForFunction(() => !!window.__nyc.social().hangout, { timeout: 20000 }).catch(() => null);
  const flaked = await ev(() => window.__nyc.social().invites.some((i) => i.status === 'flaked'));
  ok(flaked || !!(await ev(() => window.__nyc.social().hangout)), flaked ? 'they flaked (allowed)' : 'they showed up');
  await wait(2500);
  if (!flaked) {
    ok(await ev(() => window.__nyc.buddy()), 'their avatar is with you');
    await shot('park-buddy');
    await click('.hangout-chip');
    await page.waitForSelector('.sheet [data-act="do:walkTalk"]');
    await shot('hangout-sheet');
    await click('.sheet [data-act="do:walkTalk"]');
    await wait(9500);
    const bond = await ev(() => window.__nyc.social().hangout?.bond ?? 0);
    ok(bond > 0, `walking and talking built friendship (+${bond})`);
    await shot('hangout-after');
    // Treat: once.
    await click('.hangout-chip');
    await click('.sheet [data-act="treat"]');
    await wait(400);
    await click('.hangout-chip');
    await click('.sheet [data-act="treat"]');
    await wait(400);
    await click('.hangout-chip');
    await click('.sheet [data-act="bye"]');
    await wait(500);
    ok(!(await ev(() => window.__nyc.social().hangout)), 'hangout ended');
    const hist = await ev((id) => window.__nyc.state().people[id].log?.map((l) => l.text) ?? [], parkFriend);
    ok(hist.some((t) => t.includes('Hung out')), 'it’s in your history together');
  }
  // A home visit with a shared meal.
  const rest = ids.filter((i) => i !== parkFriend);
  const homeFriend = await plan('home', rest);
  ok(!!homeFriend, `someone will come over (${homeFriend})`);
  if (homeFriend) {
    const home = await ev(() => window.__nyc.planNow());
    await ev(() => { window.__nyc.state().kitchen.leftovers.pasta = 2; });
    await ev((p) => window.__nyc.enterPlace(p), home);
    await wait(4000);
    await page.waitForFunction(() => !!window.__nyc.social().hangout || window.__nyc.social().invites.some((i) => i.status === 'flaked' && i.outing === 'home'), { timeout: 20000 }).catch(() => null);
    if (await ev(() => !!window.__nyc.social().hangout)) {
      await wait(2000);
      await click('.hangout-chip');
      await click('.sheet [data-act="do:meal"]');
      await wait(10500);
      ok((await ev(() => window.__nyc.state().kitchen.leftovers.pasta)) === 1, 'shared a cooked portion');
      ok((await ev(() => window.__nyc.social().hangout?.bond ?? 0)) > 0, 'the meal built friendship');
      await shot('home-meal');
    } else ok(true, 'home friend flaked (allowed)');
  }
}

if (PART === 'club') {
  await ev(() => window.__nyc.enterPlace('velvetRoom'));
  await wait(4500);
  await ev(() => window.__nyc.service('getSection'));
  await click('.sheet.open [data-act="buy"]');
  await wait(300);
  await ev(() => { window.__nyc.state().section.spent = 1_000_000; });
  await ev(() => window.__nyc.service('getSection'));
  await wait(400);
  for (let k = 0, misses = 0; k < 12 && misses < 4; ) {
    const b = await page.$('.sheet.open [data-act^="invite:"]:not([disabled])');
    if (!b) {
      // Something else took the screen (a random event): note it and reopen.
      misses++;
      console.log('  (no invite button; on screen:', JSON.stringify(await ev(() => (document.querySelector('.sheet.open h2, .modal h2')?.textContent ?? 'nothing'))), ')');
      await ev(() => document.querySelector('.modal [data-act]')?.click());
      await ev(() => window.__nyc.service('getSection'));
      await wait(500);
      continue;
    }
    await b.evaluate((el) => el.click());
    k++;
    await wait(150);
  }
  const guests = await ev(() => window.__nyc.state().section.friends.slice());
  ok(guests.length === 12, `12 guests (${guests.length})`);
  for (const id of guests) { await ev(() => window.__nyc.service('getSection')); await click(`.sheet.open [data-act="talk:${id}"]`); await wait(150); }
  const g = await ev(() => window.__nyc.state().section.guests);
  const fl = Object.values(g).filter((x) => x.freeloader && x.revealed).length;
  ok(fl > 0 && fl < 12, `talking shows who's only here for the bottles (${fl}/12)`);
  await ev(() => window.__nyc.service('getSection'));
  await wait(300);
  await shot('section-guests');
}

console.log('errors:', [...new Set(errors)].join('\n') || 'none');
console.log(fails || errors.length ? `${fails} FAILED` : 'ALL OK');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
