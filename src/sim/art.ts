// =====================================================================
// art.ts — the Bowery Art Parlor (Peter, 2026-10-15: "add an art palor
// that players can submit arts and get likes").
//
// Paint on the easel (ui/art.ts), give it a title, hang it. Likes come in
// over the next few hours: how many depends on the painting itself (how
// much of the canvas you used, how many colours and brushes, how much
// effort), whether you painted today's prompt, plus your fame. When it
// gets popular a collector may make an offer: take it or turn it down
// (they might come back with more if it keeps climbing). Each week the
// parlor picks a 🏆 Show of the week: beat the house pick and it's you.
// Today the likes come from the city (simulated); with multiplayer,
// other players' likes count too.
//
// The bottom of this file has the easel's pure paint maths (stroke
// smoothing, flood fill, picking a save size) so tests can reach it.
//
// TO TUNE: ART.
// =====================================================================

import { nowMs, nycTime } from '../core/clock.ts';
import { Rng } from '../core/rng.ts';
import { changeMoney } from './economy.ts';
import { addMoodlet } from './needs.ts';
import { postNews } from './news.ts';
import type { GameState } from './types.ts';

export const ART = {
  /** Paintings kept on your wall (oldest drop off). */
  keep: 12,
  /** Hours for likes to mostly arrive. */
  likeHours: 5,
  /** A collector shows up at this many likes. */
  offerAt: 60,
  /** After you turn one down, the next offer needs this many times the likes. */
  reofferAt: 1.5,
  /** Painted today's prompt: this many times the likes. */
  promptBoost: 1.4,
  /** Show of the week prize (cents) and fame. */
  showPrize: 25_000,
  showFame: 25,
  /** Saved picture: longest data URL we keep (characters). Old saves had ~10k. */
  imgMax: 24_000,
};

export interface Artwork {
  id: string;
  title: string;
  /** Small picture (data: URL): JPEG in old saves, WebP or JPEG now. */
  img: string;
  at: number;
  /** 0–1: how much went into it (coverage, colours, strokes). */
  quality: number;
  /** Likes it ends up with (it climbs there over a few hours). */
  target: number;
  /** Milestones already announced. */
  told: number;
  sold?: number;
  offer?: number;
  /** Who's offering (a collector's name). */
  buyer?: string;
  /** Likes when you turned the last offer down. */
  declined?: number;
  /** Today's prompt, if you painted it. */
  prompt?: string;
  /** Week it was the Show of the week (e.g. "w42"). */
  featured?: string;
}

export interface ArtFacts {
  coverage: number;
  colors: number;
  strokes: number;
  /** Different brushes used (pencil, spray…). Optional for old callers. */
  tools?: number;
  /** You ticked "I painted today's prompt". */
  prompt?: boolean;
}

/** How good it looks, from simple facts about the drawing (0–1). */
export function artQuality(f: { coverage: number; colors: number; strokes: number; tools?: number }): number {
  const cov = Math.min(1, f.coverage / 0.55);
  const col = Math.min(1, (f.colors - 1) / 5);
  const eff = Math.min(1, f.strokes / 60);
  const tools = f.tools ? Math.min(1, (f.tools - 1) / 3) * 0.08 : 0;
  return Math.max(0, Math.min(1, cov * 0.45 + col * 0.3 + eff * 0.25 + tools));
}

export function artOf(s: GameState): Artwork[] {
  return (s.art ??= []);
}

// ------------------------------------------------------------ prompts

/** Today's prompt ideas: one a day, the same for everyone. Emoji first. */
export const PROMPTS = [
  '🚇 The Q train at night',
  '🐈 A bodega cat',
  '🍕 The dollar slice',
  '🌉 Brooklyn Bridge at sunset',
  '🐦 A pigeon with ambition',
  '🚕 Yellow cab in the rain',
  '🗽 Lady Liberty on her day off',
  '🌳 Central Park in the fall',
  '🔥 A fire escape summer',
  '🌃 The skyline from a rooftop',
  '🥯 A perfect bagel',
  '🐀 Pizza Rat',
  '🎷 Jazz in the Village',
  '🌧️ Steam rising from a manhole',
  '🏀 A pickup game at the Cage',
  '🛒 The 2 AM bodega run',
] as const;

/** The prompt for a game day ("2026-10-28"). */
export function artPrompt(dayKey: string): string {
  return new Rng(`prompt-${dayKey}`).pick(PROMPTS);
}

// ------------------------------------------------------------ hanging

/** Hang a new painting. Returns it. */
export function submitArt(s: GameState, title: string, img: string, f: ArtFacts, rand = Math.random): Artwork {
  const q = artQuality(f);
  const fame = Math.min(1, (s.paths.rep.celebrity ?? 0) / 600);
  const boost = f.prompt ? ART.promptBoost : 1;
  // Mostly the painting; some luck; fame helps people notice; the prompt gets you on the front page.
  const target = Math.round((4 + q * q * 180) * (0.6 + rand() * 0.9) * (1 + fame) * boost);
  const a: Artwork = { id: `art-${nowMs().toString(36)}`, title: title.trim().slice(0, 40) || 'Untitled', img, at: nowMs(), quality: q, target, told: 0 };
  if (f.prompt) a.prompt = artPrompt(nycTime().dateKey);
  const list = artOf(s);
  list.unshift(a);
  if (list.length > ART.keep) list.length = ART.keep;
  addMoodlet(s, { id: 'madeArt', label: 'Made something', emoji: '🎨', value: 8, minutes: 60 * 4 });
  return a;
}

/** Likes right now (climbing towards the target over a few hours). */
export function likesNow(a: Artwork, now = nowMs()): number {
  const h = Math.max(0, (now - a.at) / 3_600_000);
  return Math.round(a.target * (1 - Math.exp(-h / (ART.likeHours / 3))));
}

const BUYERS = ['A Tribeca hedge fund guy', 'A Bushwick gallery', 'An influencer with a ring light', 'A dentist from Scarsdale', 'A very calm Swiss couple', 'Someone’s rich aunt', 'A Chelsea dealer in all black', 'A tech founder (pre-IPO)'];

/** A collector's price for a painting at this many likes (cents). */
export function offerFor(a: Artwork, likes: number): number {
  const r = new Rng(`${a.id}-${a.declined ?? 0}`);
  return Math.round((likes * (60 + r.next() * 140)) / 100) * 100 * 10;
}

/**
 * Check your paintings: milestones to announce, a collector's offer
 * when one gets popular, and the Show of the week. Call now and then.
 * Returns lines to show.
 */
export function artTick(s: GameState, now = nowMs()): string[] {
  const out: string[] = [];
  for (const a of artOf(s)) {
    const n = likesNow(a, now);
    for (const m of [10, 25, 50, 100, 250, 500]) {
      if (n >= m && a.told < m) {
        a.told = m;
        out.push(`🎨 “${a.title}” hit ${m} likes!`);
        if (m >= 25) s.paths.rep.celebrity = (s.paths.rep.celebrity ?? 0) + Math.round(m / 5);
        if (m >= 250) postNews(s, { scope: 'city', emoji: '🎨', headline: `“${a.title}” by ${s.profile.name} is the talk of the Bowery`, personal: true });
      }
    }
    const need = a.declined ? Math.max(ART.offerAt, Math.ceil(a.declined * ART.reofferAt)) : ART.offerAt;
    if (!a.sold && !a.offer && n >= need) {
      a.offer = offerFor(a, n);
      a.buyer = new Rng(`${a.id}-buyer-${a.declined ?? 0}`).pick(BUYERS);
      out.push(`💌 ${a.buyer} wants “${a.title}” for $${Math.round(a.offer / 100).toLocaleString('en-US')}. See the gallery wall.`);
    }
  }
  const day = nycTime(now).dateKey;
  const show = showOfWeek(s, day, now);
  if (show.mine && show.id) {
    const a = artOf(s).find((x) => x.id === show.id);
    const wk = weekKey(day);
    if (a && a.featured !== wk && !artOf(s).some((x) => x.featured === wk)) {
      a.featured = wk;
      changeMoney(s, ART.showPrize, `🏆 Show of the week: “${a.title}”`);
      s.paths.rep.celebrity = (s.paths.rep.celebrity ?? 0) + ART.showFame;
      out.push(`🏆 “${a.title}” is the Bowery’s Show of the week! +$${ART.showPrize / 100} prize.`);
    }
  }
  return out;
}

/** Take a collector's offer. */
export function sellArt(s: GameState, id: string): string | null {
  const a = artOf(s).find((x) => x.id === id);
  if (!a || !a.offer || a.sold) return 'No offer on that one.';
  changeMoney(s, a.offer, `🎨 Sold “${a.title}”`);
  a.sold = a.offer;
  addMoodlet(s, { id: 'soldArt', label: 'Sold a painting', emoji: '💰', value: 18, minutes: 60 * 8 });
  return null;
}

/** Turn a collector down. If the likes keep climbing, someone may come back with more. */
export function declineArt(s: GameState, id: string, now = nowMs()): string | null {
  const a = artOf(s).find((x) => x.id === id);
  if (!a || !a.offer || a.sold) return 'No offer on that one.';
  a.declined = Math.max(likesNow(a, now), a.declined ?? 0);
  delete a.offer;
  delete a.buyer;
  return null;
}

/** Will anyone ever offer again? (The likes still have room to climb.) */
export function mayReoffer(a: Artwork): boolean {
  return !a.sold && !!a.declined && a.target >= Math.ceil(a.declined * ART.reofferAt);
}

// ------------------------------------------------------------ the wall

export interface WallPiece {
  title: string;
  artist: string;
  likes: number;
  mine: boolean;
  seed?: string;
  img?: string;
  id?: string;
}

const TITLES = ['Pigeon at Dawn', 'The L Train, Again', 'Self-Portrait with Bagel', 'Rent Is Due', 'Bodega Cat (Study)', 'Manhattan in Purple', 'Yellow Cab Blues', 'Steam', 'Untitled #47', 'Hudson at 6 PM'];
const ARTISTS = ['Marisol R.', 'Theo', 'Kenji', 'Ava B.', 'DJ Leftover Pizza', 'Grandma Rose', 'Lu', 'Obi'];

/** The parlor's wall: other artists' pieces (seeded per day) and yours, most liked first. */
export function galleryWall(s: GameState, dayKey: string, now = nowMs()): WallPiece[] {
  const r = new Rng(`gallery-${dayKey}`);
  // Six different titles today (shuffled by the day's seed).
  const order = TITLES.map((t) => ({ t, k: r.next() })).sort((a, b) => a.k - b.k).map((x) => x.t);
  const theirs = Array.from({ length: 6 }, (_, i) => ({ title: order[i], artist: ARTISTS[Math.floor(r.next() * ARTISTS.length)], likes: Math.round(8 + r.next() * r.next() * 300), mine: false, seed: `${dayKey}-${i}` }));
  const mine = artOf(s).map((a) => ({ title: a.title, artist: s.profile.name, likes: likesNow(a, now), mine: true, img: a.img, id: a.id }));
  return [...mine, ...theirs].sort((a, b) => b.likes - a.likes);
}

/** "w42": weeks since Monday 5 Jan 2026 (game days). */
export function weekKey(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const days = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(2026, 0, 5)) / 86_400_000);
  return `w${Math.floor(days / 7)}`;
}

const SHOW_TITLES = ['Six Train, Seven Feelings', 'Fire Escape Nocturne', 'The Last Bagel', 'Canal Street, Rush Hour', 'A Rat Named Destiny', 'Queens, Probably'];

/**
 * 🏆 The Show of the week: the house pick, unless one of your pieces hung
 * this week has more likes. Same pick all week for everyone.
 */
export function showOfWeek(s: GameState, dayKey: string, now = nowMs()): WallPiece & { week: string } {
  const week = weekKey(dayKey);
  const r = new Rng(`show-${week}`);
  const house: WallPiece & { week: string } = { title: r.pick(SHOW_TITLES), artist: r.pick(ARTISTS), likes: Math.round(140 + r.next() * 160), mine: false, seed: `show-${week}`, week };
  // Once one of yours has won this week, it stays up.
  const won = artOf(s).find((a) => a.featured === week);
  if (won) return { title: won.title, artist: s.profile.name, likes: likesNow(won, now), mine: true, img: won.img, id: won.id, week };
  let best: Artwork | null = null;
  for (const a of artOf(s)) {
    if (a.sold || weekKey(nycTime(a.at).dateKey) !== week) continue;
    if (!best || likesNow(a, now) > likesNow(best, now)) best = a;
  }
  if (best && likesNow(best, now) >= house.likes) return { title: best.title, artist: s.profile.name, likes: likesNow(best, now), mine: true, img: best.img, id: best.id, week };
  return house;
}

// ===================================================================== paint maths
// Pure helpers for the easel (ui/art.ts). No DOM, so tests can run them.

export interface Pt {
  x: number;
  y: number;
  /** Brush width at this point. */
  w: number;
}

/**
 * Smooths a stroke with quadratic curves through the midpoints of the
 * raw points (the classic "midpoint" trick: no corners, no lag), and
 * hands back evenly spaced samples to paint. Widths blend along the way.
 */
export class Smoother {
  private p0: Pt | null = null;
  private p1: Pt | null = null;
  private carry = 0;
  private spacing: (w: number) => number;
  constructor(spacing: (w: number) => number) {
    this.spacing = spacing;
  }

  /** First touch: one sample right there. */
  start(p: Pt): Pt[] {
    this.p0 = null;
    this.p1 = p;
    this.carry = Math.max(0.5, this.spacing(p.w));
    return [p];
  }

  /** The finger moved: samples along the curve so far. */
  move(p: Pt): Pt[] {
    if (!this.p1) return this.start(p);
    if (!this.p0) {
      // Second point: straight to the midpoint.
      const m = mid(this.p1, p);
      const out = this.line(this.p1, m);
      this.p0 = m;
      this.p1 = p;
      return out;
    }
    const a = this.p0, c = this.p1, b = mid(c, p);
    const out = this.quad(a, c, b);
    this.p0 = b;
    this.p1 = p;
    return out;
  }

  /** Lifted: finish the last bit to where the finger was. */
  end(): Pt[] {
    const out = this.p0 && this.p1 ? this.line(this.p0, this.p1) : [];
    this.p0 = this.p1 = null;
    return out;
  }

  private line(a: Pt, b: Pt): Pt[] {
    return this.quad(a, mid(a, b), b);
  }

  private quad(a: Pt, c: Pt, b: Pt): Pt[] {
    // Length estimate from the control polygon (plenty for spacing).
    const len = (Math.hypot(c.x - a.x, c.y - a.y) + Math.hypot(b.x - c.x, b.y - c.y) + Math.hypot(b.x - a.x, b.y - a.y)) / 2;
    const out: Pt[] = [];
    let d = this.carry;
    while (d <= len) {
      const t = d / len, u = 1 - t;
      const w = a.w + (b.w - a.w) * t;
      out.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y, w });
      d += Math.max(0.5, this.spacing(w));
    }
    this.carry = d - len;
    return out;
  }
}

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, w: (a.w + b.w) / 2 });

/**
 * "Pressure" for fingers and mice, which don't have any: slow = fuller,
 * fast = thinner, like a real brush. A pen's real pressure wins.
 * Returns a width factor about 0.5–1.2.
 */
export function pressureFeel(speed: number, pressure: number, isPen: boolean): number {
  if (isPen && pressure > 0) return 0.3 + pressure * 0.95;
  return Math.max(0.5, Math.min(1.2, 1.2 - speed * 0.35));
}

/**
 * Paint-bucket: which pixels a fill at (x, y) covers. Spreads over
 * pixels close to the one tapped (RGBA within `tol`), then one pixel
 * more so anti-aliased edges don't leave a halo. Returns 1 = fill,
 * 2 = edge (paint under what's there), 0 = leave.
 */
export function floodMask(data: Uint8ClampedArray, w: number, h: number, x: number, y: number, tol = 40): Uint8Array {
  const mask = new Uint8Array(w * h);
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= w || y >= h) return mask;
  const i0 = (y * w + x) * 4;
  const r0 = data[i0], g0 = data[i0 + 1], b0 = data[i0 + 2], a0 = data[i0 + 3];
  const near = (p: number) => {
    const i = p * 4;
    const a = data[i + 3];
    // Two see-through pixels match whatever colour they hide.
    if (a0 < 16 && a < 16) return true;
    return Math.abs(data[i] - r0) + Math.abs(data[i + 1] - g0) + Math.abs(data[i + 2] - b0) + Math.abs(a - a0) * 1.5 <= tol * 3;
  };
  // Scanline fill.
  const stack: number[] = [y * w + x];
  while (stack.length) {
    const p = stack.pop()!;
    const py = (p / w) | 0;
    let lx = p - py * w;
    while (lx > 0 && !mask[py * w + lx - 1] && near(py * w + lx - 1)) lx--;
    let up = false, down = false;
    for (let px = lx; px < w; px++) {
      const q = py * w + px;
      if (mask[q] || !near(q)) break;
      mask[q] = 1;
      if (py > 0) {
        const u = q - w;
        if (!mask[u] && near(u)) {
          if (!up) stack.push(u), (up = true);
        } else up = false;
      }
      if (py < h - 1) {
        const dn = q + w;
        if (!mask[dn] && near(dn)) {
          if (!down) stack.push(dn), (down = true);
        } else down = false;
      }
    }
  }
  // Grow by one pixel: the edge ring.
  for (let p = 0; p < w * h; p++) {
    if (mask[p] !== 1) continue;
    const px = p % w;
    if (px > 0 && !mask[p - 1]) mask[p - 1] = 2;
    if (px < w - 1 && !mask[p + 1]) mask[p + 1] = 2;
    if (p >= w && !mask[p - w]) mask[p - w] = 2;
    if (p < w * (h - 1) && !mask[p + w]) mask[p + w] = 2;
  }
  return mask;
}

/** The order to try when shrinking a painting for the save: [size px, quality]. */
export const SAVE_STEPS: [number, number][] = [
  [320, 0.8],
  [256, 0.75],
  [224, 0.66],
  [192, 0.6],
  [160, 0.55],
  [128, 0.5],
];

/** Pick the first encoding that fits under the cap (else the smallest). */
export function pickEncoding(encode: (size: number, q: number) => string, cap = ART.imgMax): string {
  let last = '';
  for (const [size, q] of SAVE_STEPS) {
    last = encode(size, q);
    if (last.length <= cap) return last;
  }
  return last;
}
