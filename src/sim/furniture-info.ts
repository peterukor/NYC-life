// =====================================================================
// furniture-info.ts — what a piece does, in words, for the design menu's
// preview card (Peter, 2026-11-01: "just tapping it takes my money, I
// should be able to check it before confirming").
//
// No DOM, no 3D: the card in ui/design-mode.ts shows these lines, and
// tests/furniture-info.test.ts checks them for every piece on sale.
// =====================================================================

import { ACTIONS } from '../data/actions.ts';
import { FURNITURE_QUALITY, qualityLine, type FurnitureDef, type LightDef } from '../data/furniture.ts';
import { activitySeconds } from './home-activity.ts';

export interface PieceFacts {
  /** What you can do with it (emoji + action name). */
  does: string[];
  /** Quality badge and what it means, for pieces that have one. */
  quality: { label: string; line: string } | null;
  /** Concrete effects: sleep speed on a bed, how a lamp lights the room… */
  effects: string[];
  /** Where it goes: floor, wall, ceiling, on a table, walk over it. */
  placement: string;
}

/** "1 min 7 s", "45 s". */
export function shortDuration(sec: number): string {
  const s = Math.round(sec);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60), r = s % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}

const LIGHT_KIND: Record<LightDef['kind'], string> = {
  ceiling: 'Ceiling light: a pool of light on the floor below',
  floor: 'Floor lamp: a pool of light around it',
  table: 'Table lamp: a warm pool of light around it',
  wall: 'Wall light: washes the wall behind it',
  strip: 'LED strip: washes the wall with colour',
  fire: 'Fire: a warm flicker',
};

/** Everything the preview card says about a piece (besides name, price and size). */
export function pieceFacts(d: FurnitureDef): PieceFacts {
  const does = d.actions
    .map((id) => ACTIONS[id])
    .filter((a): a is NonNullable<typeof a> => !!a)
    .map((a) => `${a.emoji} ${a.label}`);
  if (d.opens === 'closet') does.unshift('👕 Opens your wardrobe');
  else if (d.opens === 'fridge') does.unshift('🧊 Keeps your groceries');
  else if (d.opens === 'stove') does.unshift('🍳 Cook meals');
  if (d.seat && !does.length) does.push('🪑 Somewhere to sit (TV nights sit you here)');
  if (d.tv && !d.actions.includes('watchTv')) does.push('📺 Plays TV');

  const q = d.quality;
  const effects: string[] = [];
  if (q && q !== 'basic') {
    const Q = FURNITURE_QUALITY[q];
    // The headline action shows the real numbers: how long a full sleep takes on this bed.
    const sleep = d.actions.includes('sleep') ? ACTIONS.sleep : null;
    if (sleep) {
      const t = activitySeconds(sleep, d.id), base = sleep.seconds;
      effects.push(`😴 Full sleep in ${shortDuration(t)} (${shortDuration(base)} on a basic bed)`);
    }
    const pct = (x: number) => `${x > 1 ? '+' : '−'}${Math.round(Math.abs(x - 1) * 100)}%`;
    if (d.actions.length) effects.push(`${pct(Q.gain)} from using it, ${Q.speed > 1 ? `${Math.round((Q.speed - 1) * 100)}% faster` : `${Math.round((1 - Q.speed) * 100)}% slower`}`);
    if (Q.treat) effects.push(`${Q.treat.emoji} ${Q.treat.label} after using it`);
  } else if (d.actions.includes('sleep')) {
    effects.push(`😴 Full sleep in ${shortDuration(activitySeconds(ACTIONS.sleep, d.id))}`);
  }
  if (d.quirk) effects.push(`${d.quirk.moodlet.emoji} Now and then: ${d.quirk.moodlet.label.toLowerCase()}`);
  if (d.light) {
    effects.push(`💡 ${LIGHT_KIND[d.light.kind]}, reaches ${d.light.range} m`);
    effects.push(d.light.colorful ? '🌈 Bulb colour: any colour you like' : '🔆 Bulb colour: warm, soft, cool or amber');
  }
  if (d.pulse) effects.push('✨ Always glowing');

  const placement = d.hang
    ? 'Hangs from the ceiling'
    : d.wall
      ? 'Goes on a wall'
      : d.deco
        ? 'On the floor or on a table or shelf'
        : d.flat
          ? 'Flat: you can walk over it and put things on it'
          : 'Stands on the floor';

  return { does, quality: q ? { label: FURNITURE_QUALITY[q].label, line: qualityLine(q) } : null, effects, placement };
}

/** "1.6 × 2.1 m, 0.9 m tall" from a footprint (metres). */
export function sizeLine(fp: { minX: number; maxX: number; minZ: number; maxZ: number; h?: number }): string {
  const f = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
  const w = fp.maxX - fp.minX, d = fp.maxZ - fp.minZ;
  // Hanging pieces measure down from the ceiling (h ≈ 0): no height for those.
  return `${f(w)} × ${f(Math.max(d, 0.05))} m${fp.h && fp.h >= 0.05 ? `, ${f(fp.h)} m tall` : ''}`;
}

/**
 * Buying a piece in the design menu (pure, so it can be tested): tapping
 * only previews; money moves on the confirm, once, and only if you have it.
 */
export function confirmBuy(cash: number, price: number): { ok: true; cash: number } | { ok: false; short: number } {
  if (price <= 0) return { ok: true, cash };
  if (cash < price) return { ok: false, short: price - cash };
  return { ok: true, cash: cash - price };
}
