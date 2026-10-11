// QA: tap-to-talk sheet, speech bubbles, Speak loud, Contacts.
//   node scripts/qa-people.mjs → test-results/people-*.png
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

mkdirSync('test-results', { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:4173/?qa=1&hour=13', { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#ob-year', { timeout: 30000 });
await page.select('#ob-year', '1995');
await page.type('#ob-name', 'Jack');
await page.$eval('#ob-go', (el) => el.click());
await wait(2500);
await page.$eval('[data-nav="leave"]', (el) => el.click());
await wait(3000);
await page.evaluate(() => window.__nyc.zoom(22, true));
await wait(1500);
let people = [];
for (let i = 0; i < 20 && !people.length; i++) {
  people = await page.evaluate(() => window.__nyc.people());
  if (!people.length) await wait(500);
}
console.log('people nearby:', people.length);
const id = people[0]?.personId;
await page.evaluate((i) => window.__nyc.talk(i), id);
await wait(800);
await page.screenshot({ path: 'test-results/people-1-sheet.png' });
for (let k = 0; k < 3; k++) {
  await page.$eval('[data-act="soc:chat"]', (el) => el.click()).catch(() => {});
  await wait(500);
}
await page.$eval('[data-act="soc:compliment"]', (el) => el.click()).catch(() => {});
await wait(700);
await page.screenshot({ path: 'test-results/people-2-after.png' });
await page.evaluate(() => document.querySelector('.sheet [data-act="close"], .backdrop')?.click());
await wait(600);
await page.$eval('[data-speak]', (el) => el.click());
await wait(500);
await page.$eval('[data-act="q:4"]', (el) => el.click());
await wait(2600);
await page.screenshot({ path: 'test-results/people-3-speak.png' });
const st = await page.evaluate(() => Object.values(window.__nyc.state().people).map((m) => [m.likes, m.level, m.known.length]));
console.log('memories:', JSON.stringify(st));
console.log(errors.length ? errors : 'no errors');
await browser.close();
