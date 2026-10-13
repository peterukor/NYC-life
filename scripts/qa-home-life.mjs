// QA: the starter apartment end to end. Use furniture (needs go up over time,
// poses, Stop), quality downsides, TV from the couch, the closet, storage,
// reachability, and a reload mid-nap. Shots: test-results/life-*.png
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 780 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => page.evaluate(fn, ...a);
const ok = (cond, msg) => console.log(cond ? '  ✓' : '  ✗', msg);
await page.goto('http://localhost:4173/?qa=1&class=poor&hour=11', { waitUntil: 'load' });
await ev(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year', { timeout: 30000 });
await page.select('#ob-year', '1995');
await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (el) => el.click());
await page.waitForSelector('#ob-start', { timeout: 10000 });
await page.$eval('#ob-start', (el) => el.click());
await wait(3500);
const tapItem = async (uid) => { const s = await ev((u) => window.__nyc.itemScreen(u), uid); await page.mouse.click(s.x, s.y); };
const walked = async () => { for (let k = 0; k < 400 && (await ev(() => window.__nyc.walking())); k++) await wait(100); await wait(300); };
const doAct = async (uid, actionId) => {
  await tapItem(uid);
  await walked();
  await page.waitForSelector(`[data-act="do:${actionId}"]`, { timeout: 5000 });
  await page.$eval(`[data-act="do:${actionId}"]`, (el) => el.click());
  await wait(400);
};

console.log('1. Sleep on the cheap twin bed, stop halfway');
const e0 = (await ev(() => window.__nyc.needs())).energy;
await doAct('bed', 'nap');
await walked();
await wait(3500);
await page.screenshot({ path: 'test-results/life-sleep.png' });
const mid = await ev(() => window.__nyc.activity());
const pr = await ev(() => window.__nyc.playerRot());
ok(mid && mid.posed, `napping, posed (lying: rot.x ${pr.x.toFixed(2)}, y ${pr.py.toFixed(2)})`);
const e1 = (await ev(() => window.__nyc.needs())).energy;
ok(e1 > e0, `energy rising while napping ${e0.toFixed(1)} → ${e1.toFixed(1)}`);
await page.$eval('.progress .skip', (el) => el.click());
await wait(400);
ok(!(await ev(() => window.__nyc.activity())), 'Stop ends it');
const e2 = (await ev(() => window.__nyc.needs())).energy;
ok(e2 > e0 && e2 < e0 + 25 * 0.7, `kept part of it: ${e2.toFixed(1)} (full nap would be +${(25 * 0.7).toFixed(1)})`);

console.log('2. TV: walks to the couch and sits');
await doAct('tv', 'watchTv');
await walked();
await wait(1500);
await page.screenshot({ path: 'test-results/life-tv.png' });
const tvAct = await ev(() => window.__nyc.activity());
ok(tvAct && tvAct.actionId === 'watchTv', 'watching TV');
const pos = await ev(() => window.__nyc.playerPos());
const couch = await ev(() => window.__nyc.furnitureAt('couch'));
ok(Math.hypot(pos.x - couch.x, pos.z - couch.z) < 0.8, `sitting on the couch (${Math.hypot(pos.x - couch.x, pos.z - couch.z).toFixed(2)} m from it)`);
for (let k = 0; k < 140 && (await ev(() => window.__nyc.activity())); k++) await wait(100);
ok(!(await ev(() => window.__nyc.activity())), 'TV finished on its own');

console.log('3. Shower, toilet, desk, stove poses');
for (const [uid, act, shot] of [['tub', 'shower', 'shower'], ['toilet', 'toilet', 'toilet'], ['desk', 'doomscroll', 'desk'], ['stove', 'cookPasta', 'stove']]) {
  await doAct(uid, act);
  await wait(1200);
  await page.screenshot({ path: `test-results/life-${shot}.png` });
  const a = await ev(() => window.__nyc.activity());
  ok(a && a.actionId === act, `${act} running`);
  if (a) await page.$eval('.progress .skip', (el) => el.click());
  await wait(300);
}

console.log('4. Storage: put the pothos away, place the floor lamp');
ok((await ev(() => window.__nyc.storage())).join() === 'floorLamp,plant', 'starts with a lamp and a plant in boxes');
await tapItem('plant');
await walked();
await page.$eval('[data-act="store-furniture"]', (el) => el.click());
await wait(500);
ok((await ev(() => window.__nyc.storage())).includes('plantStool'), 'pothos is in storage');
ok(!(await ev(() => window.__nyc.homeItems())).some((i) => i.uid === 'plant'), 'and gone from the room');
await page.$eval('[data-nav="storage"]', (el) => el.click());
await wait(500);
await page.screenshot({ path: 'test-results/life-storage.png' });
await page.$eval('[data-act="place:floorLamp"]', (el) => el.click());
await wait(600);
await page.screenshot({ path: 'test-results/life-place.png' });
await page.$eval('[data-mv="done"]', (el) => el.click());
await wait(500);
const lamp = (await ev(() => window.__nyc.homeItems())).find((i) => i.item === 'floorLamp');
ok(!!lamp, `lamp placed at ${lamp && [lamp.x, lamp.z].join(',')}`);
ok(!(await ev(() => window.__nyc.storage())).includes('floorLamp'), 'lamp left storage');

console.log('5. Reachability: try the couch everywhere, look for "blocks the way"');
const blocked = [];
const fitted = [];
for (let x = -3.4; x <= 3.4; x += 0.4) for (let z = -5.2; z <= 5.2; z += 0.4) {
  const why = await ev((a, b) => window.__nyc.tryPlace('couch', a, b), x, z);
  if (why && /blocks the way/.test(why)) blocked.push([x.toFixed(1), z.toFixed(1), why]);
  else if (!why) fitted.push([x.toFixed(1), z.toFixed(1)]);
  if (!why) await ev((c) => window.__nyc.tryPlace('couch', c.x, c.z), couch); // put it back
}
console.log('  fits at', fitted.length, 'spots; rejected for blocking the way at', blocked.length, blocked.slice(0, 3).map((b) => b.join(' ')).join(' | '));
ok((await ev(() => window.__nyc.blockedUse())) === null, 'after all that, everything is still reachable');

console.log('6. Closet: tap the rack, wear something, saved');
await tapItem('rack');
await walked();
await page.waitForSelector('[data-wear="flannel"]', { timeout: 5000 });
await page.$eval('[data-wear="flannel"]', (el) => el.click());
await wait(400);
await page.$eval('.sheet .close', (el) => el.click());
await wait(500);

console.log('7. Reload mid-nap: everything comes back');
await doAct('bed', 'sleep');
await walked();
await wait(1500);
const before = await ev(() => ({ act: window.__nyc.activity(), items: window.__nyc.homeItems(), storage: window.__nyc.storage(), look: JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => /save|nyc/i.test(k)))).profile?.look?.topId }));
await page.reload({ waitUntil: 'load' });
await wait(5000);
const after = await ev(() => ({ act: window.__nyc.activity(), items: window.__nyc.homeItems(), storage: window.__nyc.storage() }));
await page.screenshot({ path: 'test-results/life-reload.png' });
ok(after.act && after.act.actionId === 'sleep' && after.act.posed, `still sleeping after reload (done ${after.act ? Math.round(after.act.done * 100) : '-'}%)`);
ok(JSON.stringify(after.items) === JSON.stringify(before.items), 'furniture exactly where it was');
ok(after.storage.join() === before.storage.join(), `storage the same (${after.storage.join()})`);
ok(before.look === 'flannel', `outfit saved (${before.look})`);
console.log('errors:', [...new Set(errors)].join('\n') || 'none');
await browser.close();
