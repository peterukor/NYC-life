// =====================================================================
// art.ts — the Bowery Art Parlor (Peter, 2026-10-15: "add an art palor
// that players can submit arts and get likes").
//
// Paint on the easel (ui/art.ts), give it a title, hang it. Likes come in
// over the next few hours: how many depends on the painting itself (how
// much of the canvas you used, how many colours, how much effort), plus
// your fame. When it gets popular a collector may make an offer.
// Today the likes come from the city (simulated); with multiplayer,
// other players' likes count too.
//
// TO TUNE: ART.
// =====================================================================

import { nowMs } from '../core/clock.ts';
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
};

export interface Artwork {
  id: string;
  title: string;
  /** Small JPEG (data: URL). */
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
}

/** How good it looks, from simple facts about the drawing (0–1). */
export function artQuality(f: { coverage: number; colors: number; strokes: number }): number {
  const cov = Math.min(1, f.coverage / 0.55);
  const col = Math.min(1, (f.colors - 1) / 5);
  const eff = Math.min(1, f.strokes / 60);
  return Math.max(0, Math.min(1, cov * 0.45 + col * 0.3 + eff * 0.25));
}

export function artOf(s: GameState): Artwork[] {
  return (s.art ??= []);
}

/** Hang a new painting. Returns it. */
export function submitArt(s: GameState, title: string, img: string, f: { coverage: number; colors: number; strokes: number }, rand = Math.random): Artwork {
  const q = artQuality(f);
  const fame = Math.min(1, (s.paths.rep.celebrity ?? 0) / 600);
  // Mostly the painting; some luck; fame helps people notice.
  const target = Math.round((4 + q * q * 180) * (0.6 + rand() * 0.9) * (1 + fame));
  const a: Artwork = { id: `art-${nowMs().toString(36)}`, title: title.trim().slice(0, 40) || 'Untitled', img, at: nowMs(), quality: q, target, told: 0 };
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

/**
 * Check your paintings: milestones to announce, and a collector's offer
 * when one gets popular. Call now and then. Returns lines to show.
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
    if (!a.sold && !a.offer && n >= ART.offerAt) {
      const r = new Rng(a.id);
      a.offer = Math.round((n * (60 + r.next() * 140)) / 100) * 100 * 10;
      out.push(`💌 A collector wants “${a.title}” for $${Math.round(a.offer / 100).toLocaleString('en-US')}. Phone → Me, or at the parlor.`);
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

/** The parlor's wall: other artists' pieces (seeded per day) and yours, most liked first. */
export function galleryWall(s: GameState, dayKey: string): { title: string; artist: string; likes: number; mine: boolean; seed?: string; img?: string; id?: string }[] {
  const r = new Rng(`gallery-${dayKey}`);
  const titles = ['Pigeon at Dawn', 'The L Train, Again', 'Self-Portrait with Bagel', 'Rent Is Due', 'Bodega Cat (Study)', 'Manhattan in Purple', 'Yellow Cab Blues', 'Steam', 'Untitled #47', 'Hudson at 6 PM'];
  const artists = ['Marisol R.', 'Theo', 'Kenji', 'Ava B.', 'DJ Leftover Pizza', 'Grandma Rose', 'Lu', 'Obi'];
  // Six different titles today (shuffled by the day's seed).
  const order = titles.map((t) => ({ t, k: r.next() })).sort((a, b) => a.k - b.k).map((x) => x.t);
  const theirs = Array.from({ length: 6 }, (_, i) => ({ title: order[i], artist: artists[Math.floor(r.next() * artists.length)], likes: Math.round(8 + r.next() * r.next() * 300), mine: false, seed: `${dayKey}-${i}` }));
  const mine = artOf(s).map((a) => ({ title: a.title, artist: s.profile.name, likes: likesNow(a), mine: true, img: a.img, id: a.id }));
  return [...mine, ...theirs].sort((a, b) => b.likes - a.likes);
}
