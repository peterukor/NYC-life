// =====================================================================
// QA: do street pedestrians keep to the sidewalks? (Peter: "a lot of NPCs
// walking on the road".) At four spots in Manhattan it runs the game in
// game time (__nyc.advance) and samples where everyone in the street crowd
// stands: sidewalk, painted crosswalk or road (world/ped-walk.ts surfaceAt).
// Also counts people on the asphalt with a moving car on top of them, and
// people standing still in the road.
//   PORT=4182 node scripts/qa-crowd.mjs           → shots in DIR (/tmp/claude-0/crowd)
//   OUT=before SECS=60 SPOTS=midtown,harlem …
// Needs a build served with `npx vite preview --port $PORT`.
// =====================================================================
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const dir = process.env.DIR ?? '/tmp/claude-0/crowd';
mkdirSync(dir, { recursive: true });
const out = process.env.OUT ?? 'run';
const SECS = +(process.env.SECS ?? 60);
// Door positions of real places (data/places.ts doorOf): Times Square, the
// Hell's Kitchen studio, the Ludlow St basement club, the East Harlem walk-up.
const ALL = {
  midtown: { x: -6, z: 2 },
  hellsKitchen: { x: -185, z: 2 },
  lowerEastSide: { x: 509, z: 759 },
  harlem: { x: 461, z: -1135 },
};
const spots = (process.env.SPOTS ?? Object.keys(ALL).join(',')).split(',');

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  headless: true,
  protocolTimeout: 600000,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
await page.setViewport({ width: +(process.env.W ?? 900), height: +(process.env.H ?? 600) });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto(`http://localhost:${process.env.PORT ?? 4173}/?qa=1&class=middle&weather=sunny&hour=${process.env.HOUR ?? 13}&quality=${process.env.Q ?? 'high'}`, { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year', { timeout: 30000 });
await page.select('#ob-year', '1995');
await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (el) => el.click());
await page.waitForSelector('#ob-start', { timeout: 10000 });
await page.$eval('#ob-start', (el) => el.click());
await wait(3000);
await page.$eval('[data-nav="leave"]', (el) => el.click());
await wait(5000);
await page.addStyleTag({ content: '.modal-wrap, .hint-tip, #ui { display: none !important; }' });

const report = {};
for (const name of spots) {
  const at = ALL[name];
  await page.evaluate((p) => window.__nyc.placeAt(p.x, p.z), at);
  // The crowd lives around the camera's target: aim it at the spot (this also
  // stops the camera following the player, so it stays put for the shots).
  await page.evaluate((p) => window.__nyc.streetCam(p.x + 38, 42, p.z + 38, p.x, 0, p.z), at);
  // Let the crowd re-spawn around it.
  await page.evaluate(() => window.__nyc.advance(8));
  const tot = { n: 0, road: 0, crosswalk: 0, stillRoad: 0, waiting: 0, hit: 0, samples: 0 };
  const where = [];
  let lastPeople = [];
  for (let t = 0; t < SECS; t++) {
    const r = await page.evaluate(() => {
      window.__nyc.advance(1);
      const people = window.__nyc.crowd() ?? [];
      const cars = window.__nyc.cars().filter((c) => c.v > 0.5);
      let hit = 0;
      const hits = [];
      const signal = window.__nyc.signal();
      for (const p of people) {
        if (p.on === 'walk') continue;
        for (const c of cars) {
          const dx = p.x - c.x, dz = p.z - c.z;
          const fx = Math.sin(c.h), fz = Math.cos(c.h);
          if (Math.abs(dx * fx + dz * fz) < c.len / 2 + 0.5 && Math.abs(dx * fz - dz * fx) < 1.5) {
            hit++;
            hits.push({ x: +p.x.toFixed(1), z: +p.z.toFixed(1), on: p.on, crossing: p.crossing, car: [+c.x.toFixed(1), +c.z.toFixed(1), +c.h.toFixed(2), +c.v.toFixed(1)], signal });
            break;
          }
        }
      }
      return { people, hit, hits, signal };
    });
    tot.samples++;
    lastPeople = r.people.map((p) => [+p.x.toFixed(1), +p.z.toFixed(1), p.on[0]]);
    tot.hit += r.hit;
    if (process.env.HITS) for (const h of r.hits) console.log('  hit', JSON.stringify(h));
    for (const p of r.people) {
      tot.n++;
      if (p.on === 'road') {
        tot.road++;
        if (!p.moving) tot.stillRoad++;
        if (where.length < 400) where.push([p.x, p.z]);
      }
      if (p.on === 'crosswalk') tot.crosswalk++;
      if (p.waiting) tot.waiting++;
    }
  }
  if (process.env.DUMP) writeFileSync(`${dir}/${out}-${name}-people.json`, JSON.stringify(lastPeople));
  const pct = (k) => ((100 * tot[k]) / Math.max(1, tot.n)).toFixed(2) + '%';
  report[name] = { people: +(tot.n / tot.samples).toFixed(1), onRoad: pct('road'), standingInRoad: pct('stillRoad'), onCrosswalk: pct('crosswalk'), waitingAtKerb: pct('waiting'), carOverPerson: tot.hit, roadSpots: where.slice(0, 12) };
  console.log(name, JSON.stringify({ ...report[name], roadSpots: undefined }));
  // Shots: from above at an angle, and a street-level look along the sidewalk.
  const me = at;
  await page.evaluate((p) => window.__nyc.streetCam(p.x + 38, 42, p.z + 38, p.x, 0, p.z), me);
  await wait(2500);
  await page.screenshot({ path: `${dir}/${out}-${name}-above.png` });
  await page.evaluate((p) => window.__nyc.streetCam(p.x + 14, 6, p.z + 14, p.x - 10, 0, p.z - 10), me);
  await wait(2500);
  await page.screenshot({ path: `${dir}/${out}-${name}-street.png` });
}
writeFileSync(`${dir}/${out}.json`, JSON.stringify(report, null, 2));
console.log(errors.length ? errors.slice(0, 5) : 'no errors');
await browser.close();
