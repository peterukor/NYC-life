// 🎨 The Bowery Art Parlor: prompts, offers (sell or pass), the Show of
// the week, old saves, and the easel's paint maths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newLife } from '../src/sim/state.ts';
import { nycTime } from '../src/core/clock.ts';
import { ART, PROMPTS, Smoother, artPrompt, artQuality, artTick, declineArt, floodMask, galleryWall, likesNow, mayReoffer, pickEncoding, pressureFeel, sellArt, showOfWeek, submitArt, weekKey, type Artwork } from '../src/sim/art.ts';

const life = () => newLife({ name: 'Jack', birthYear: 1995, origin: 'hustler', spawnClass: 'middle', look: {} as never, traits: [] } as never);
const H = 3_600_000;

test('art: the prompt is the same all day and changes across days', () => {
  assert.equal(artPrompt('2026-10-28'), artPrompt('2026-10-28'));
  assert.ok(PROMPTS.includes(artPrompt('2026-10-28') as (typeof PROMPTS)[number]));
  const seen = new Set(Array.from({ length: 20 }, (_, i) => artPrompt(`2026-11-${String(i + 1).padStart(2, '0')}`)));
  assert.ok(seen.size > 5, 'prompts vary by day');
});

test('art: painting the prompt earns more likes and remembers the prompt', () => {
  const s = life();
  const f = { coverage: 0.6, colors: 5, strokes: 60 };
  const plain = submitArt(s, 'A', 'data:x', f, () => 0.5);
  const prompted = submitArt(s, 'B', 'data:x', { ...f, prompt: true }, () => 0.5);
  assert.ok(prompted.target > plain.target);
  assert.ok(Math.abs(prompted.target / plain.target - ART.promptBoost) < 0.05);
  assert.equal(prompted.prompt, artPrompt(nycTime().dateKey));
  assert.equal(plain.prompt, undefined);
});

test('art: using more brushes nudges quality up, never past 1', () => {
  const base = { coverage: 0.4, colors: 3, strokes: 30 };
  assert.ok(artQuality({ ...base, tools: 4 }) > artQuality({ ...base, tools: 1 }));
  assert.ok(artQuality({ coverage: 1, colors: 12, strokes: 500, tools: 7 }) <= 1);
});

test('art: pass on an offer; a better one comes if the likes keep climbing', () => {
  const s = life();
  const a = submitArt(s, 'Steam', 'data:x', { coverage: 0.7, colors: 7, strokes: 90 }, () => 0.9);
  a.target = 400;
  // Early: offer at ~60 likes.
  let t = a.at;
  while (likesNow(a, t) < ART.offerAt) t += 60_000;
  artTick(s, t);
  assert.ok(a.offer && a.buyer, 'a collector offered');
  const first = a.offer!;
  assert.equal(declineArt(s, a.id, t), null);
  assert.equal(a.offer, undefined);
  assert.ok(mayReoffer(a));
  assert.equal(declineArt(s, a.id, t), 'No offer on that one.');
  // Not yet: the likes have to climb 1.5×.
  artTick(s, t + 60_000);
  assert.equal(a.offer, undefined);
  artTick(s, a.at + 48 * H);
  assert.ok(a.offer! > first, 'the second offer is bigger');
  const before = s.money;
  assert.equal(sellArt(s, a.id), null);
  assert.equal(s.money - before, a.offer);
});

test('art: no comeback offer when the likes have peaked', () => {
  const s = life();
  const a = submitArt(s, 'Peak', 'data:x', { coverage: 0.7, colors: 7, strokes: 90 }, () => 0.9);
  a.target = 70;
  artTick(s, a.at + 48 * H);
  assert.ok(a.offer);
  declineArt(s, a.id, a.at + 48 * H);
  assert.equal(mayReoffer(a), false);
  artTick(s, a.at + 96 * H);
  assert.equal(a.offer, undefined);
});

test('art: Show of the week: the house pick, until yours beats it (prize once)', () => {
  const s = life();
  const now = Date.now();
  const day = nycTime(now).dateKey;
  const house = showOfWeek(s, day, now);
  assert.equal(house.mine, false);
  assert.equal(showOfWeek(s, day, now).title, house.title, 'same pick all week');
  const a = submitArt(s, 'Big One', 'data:x', { coverage: 0.9, colors: 8, strokes: 100 }, () => 0.9);
  a.target = 2000;
  // Game weeks are ~24 real hours: find a moment with 2 h of the same week after it.
  let at = now;
  while (weekKey(nycTime(at).dateKey) !== weekKey(nycTime(at + 2 * H).dateKey)) at += H / 4;
  a.at = at;
  const t = at + 2 * H;
  assert.equal(showOfWeek(s, nycTime(at).dateKey, at).mine, false, 'no likes yet');
  const show = showOfWeek(s, nycTime(t).dateKey, t);
  assert.equal(show.mine, true);
  const money0 = s.money;
  const lines = artTick(s, t);
  assert.ok(lines.some((l) => /Show of the week/.test(l)));
  assert.equal(s.money - money0, ART.showPrize);
  assert.equal(artTick(s, t + 60_000).filter((l) => /Show of the week/.test(l)).length, 0, 'prize only once');
});

test('art: weekKey counts Monday-start weeks', () => {
  assert.equal(weekKey('2026-01-05'), 'w0');
  assert.equal(weekKey('2026-01-11'), 'w0');
  assert.equal(weekKey('2026-01-12'), 'w1');
});

test('art: old saves (no new fields) still load, tick and show on the wall', () => {
  const s = life();
  const old = { id: 'art-old', title: 'Old Faithful', img: 'data:image/jpeg;base64,AAAA', at: Date.now() - 48 * H, quality: 0.5, target: 80, told: 0 } as Artwork;
  s.art = [JSON.parse(JSON.stringify(old))];
  const lines = artTick(s);
  assert.ok(lines.some((l) => /likes/.test(l)));
  const wall = galleryWall(s, nycTime().dateKey);
  assert.ok(wall.some((w) => w.mine && w.img === old.img));
  for (let i = 1; i < wall.length; i++) assert.ok(wall[i - 1].likes >= wall[i].likes, 'most liked first');
});

test('paint: the smoother spaces samples evenly and ends at the finger', () => {
  const sm = new Smoother(() => 2);
  const out = [...sm.start({ x: 0, y: 0, w: 4 })];
  for (let x = 10; x <= 100; x += 10) out.push(...sm.move({ x, y: Math.sin(x / 20) * 10, w: 4 }));
  out.push(...sm.end());
  for (let i = 1; i < out.length; i++) {
    const d = Math.hypot(out[i].x - out[i - 1].x, out[i].y - out[i - 1].y);
    assert.ok(d <= 2.6, `gap ${d.toFixed(2)} at ${i}`);
  }
  const last = out[out.length - 1];
  assert.ok(Math.hypot(last.x - 100, last.y - Math.sin(5) * 10) < 2.6);
  assert.ok(out.length > 40);
});

test('paint: the smoother blends widths', () => {
  const sm = new Smoother(() => 1);
  sm.start({ x: 0, y: 0, w: 2 });
  const out = [...sm.move({ x: 20, y: 0, w: 10 }), ...sm.move({ x: 40, y: 0, w: 10 }), ...sm.end()];
  for (const p of out) assert.ok(p.w >= 2 && p.w <= 10);
  assert.ok(out[0].w < out[out.length - 1].w);
});

test('paint: pressure feel: slow is fuller, fast thinner, a pen wins', () => {
  assert.ok(pressureFeel(0.1, 0, false) > pressureFeel(2, 0, false));
  assert.ok(pressureFeel(100, 0, false) >= 0.5);
  assert.ok(pressureFeel(0, 0, false) <= 1.2);
  assert.ok(pressureFeel(3, 1, true) > pressureFeel(0, 0.1, true));
});

test('paint: flood fill stays inside a line and covers the edge ring', () => {
  const w = 20, h = 20;
  const d = new Uint8ClampedArray(w * h * 4);
  // A vertical wall at x = 10.
  for (let y = 0; y < h; y++) {
    const i = (y * w + 10) * 4;
    d[i] = 255; d[i + 3] = 255;
  }
  const m = floodMask(d, w, h, 2, 2);
  assert.equal(m[2 * w + 2], 1);
  assert.equal(m[5 * w + 9], 1);
  assert.equal(m[5 * w + 10], 2, 'the wall is the edge ring');
  assert.equal(m[5 * w + 11], 0, 'the other side stays');
  assert.equal(floodMask(d, w, h, -1, 3).every((v) => v === 0), true);
});

test('paint: save encoding steps down until it fits the cap', () => {
  const tried: number[] = [];
  const out = pickEncoding((size, q) => {
    tried.push(size);
    return 'x'.repeat(Math.round(size * size * q * 0.6));
  }, 20_000);
  assert.ok(out.length <= 20_000);
  assert.ok(tried.length > 1 && tried[0] === 320);
  // Nothing fits: the smallest comes back.
  assert.equal(pickEncoding(() => 'y'.repeat(99_999), 10).length, 99_999);
});
