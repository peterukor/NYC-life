// QA: every venue room (one browser): clashes, blocked pieces, a screenshot each,
// and a contact sheet. IDS=velvetRoom,pixelPalace HOUR=22 node scripts/qa-venues.mjs
// Shots: test-results/venue-<id>.png, venues-sheet.png
import puppeteer from 'puppeteer-core';
import { execSync } from 'node:child_process';
const ids = (process.env.IDS ?? 'velvetRoom,basement212,skyeRooftop,aurumClub,pixelPalace,empireCasino,theStoop,ironGym,dumboWorks,midtownTower,barrioDeli,chessHouse,artParlor,theAlley,precinct,centralPark').split(',');
const browser = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, protocolTimeout: 240000, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await browser.newPage();
await page.setViewport({ width: +(process.env.W ?? 375), height: +(process.env.H ?? 812) });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${process.env.PORT ?? 4173}/?qa=1&class=middle&hour=${process.env.HOUR ?? 21}&quality=${process.env.Q ?? 'medium'}`, { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year', { timeout: 30000 });
await page.select('#ob-year', '1995');
await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (el) => el.click());
await page.waitForSelector('#ob-start', { timeout: 10000 });
await page.$eval('#ob-start', (el) => el.click());
await wait(3000);
// Random events and tips would cover the shots: hide them (QA only).
await page.addStyleTag({ content: '.modal-wrap, .hint-tip { display: none !important; }' });
const shots = [];
for (const id of ids) {
  const ok = await page.evaluate((h) => window.__nyc.enterPlace(h), id);
  if (!ok) { console.log(id, 'no such place'); continue; }
  await wait(4500);
  if (process.env.UP) { await page.evaluate(() => window.__nyc.takeStairs()); await wait(3000); }
  if (process.env.WAIT) await wait(+process.env.WAIT);
  if (process.env.DROP) { await page.evaluate(() => window.__nyc.clubDrop()); await wait(+process.env.DROP); }
  if (process.env.ZOOM) await page.evaluate((z) => window.__nyc.zoomAt(+z[0], +z[1], +z[2]), [process.env.ZOOM, process.env.ZX ?? 0, process.env.ZY ?? 0]);
  await wait(600);
  const clashes = await page.evaluate(() => window.__nyc.furnitureClashes());
  const blocked = await page.evaluate(() => window.__nyc.blockedUse());
  if (blocked) console.log(id, 'BLOCKED', blocked);
  const info = await page.evaluate(() => [window.__nyc.drawCalls(), window.__nyc.triangles()]);
  if (process.env.STATS) console.log(JSON.stringify(await page.evaluate(() => window.__nyc.interiorMeshes())));
  console.log(id, 'calls/tris', JSON.stringify(info), 'clashes', JSON.stringify(clashes));
  await page.screenshot({ path: `test-results/venue-${id}.png` });
  shots.push(`test-results/venue-${id}.png`);
}
console.log(errors.length ? `ERRORS ${JSON.stringify(errors.slice(0, 5))}` : 'no page errors');
await browser.close();
// Contact sheet (python + PIL).
execSync(`python3 -c "
from PIL import Image
ims=[Image.open(p).crop((0,150,375,700)) for p in ${JSON.stringify(shots).replace(/"/g, "'")}]
W,H=ims[0].size; cols=4; rows=(len(ims)+cols-1)//cols
out=Image.new('RGB',(W*cols,H*rows))
for k,im in enumerate(ims): out.paste(im,((k%cols)*W,(k//cols)*H))
out.save('test-results/venues-sheet.png')
"`);
