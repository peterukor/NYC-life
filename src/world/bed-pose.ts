// =====================================================================
// bed-pose.ts — where a sleeper lies on a bed (Peter, 2026-11-01: "the
// sleep animation needs work, the head got cut off").
//
// The old pose put the feet at a fixed spot past the bed's middle, so a
// 1.8 m body ran on through the headboard (and the wall behind it): the
// head was inside the bed frame. Now the bed is measured: rays straight
// down along the bed's length find the mattress (on a bunk, the deck you
// asked for), where it starts and ends, which end has the headboard and
// how high the pillow is. The body is measured too (Avatar.bounds), so
// the head lands on the pillow just inside the headboard, the back rests
// on the duvet, and the body lies straight along the middle of its side.
//
// `bedSpot` is the pure part (numbers in, numbers out: tests/bed-pose);
// `sampleBed` does the ray casting.
// =====================================================================

import * as THREE from 'three';

/** One ray down through the bed: the heights of every upward-facing surface it met (any order). */
export interface BedSample {
  /** Along the bed (its own z, metres). */
  z: number;
  tops: number[];
}

export interface BedSpot {
  /** The top of the mattress (duvet) you lie on. */
  surface: number;
  /** The top of the pillow (≥ surface). */
  pillow: number;
  /** The mattress's inner edge at the head end, and at the foot end (bed z). */
  headZ: number;
  footZ: number;
  /** Which end the head goes: -1 = the bed's −z end (every model so far), +1 = the +z end. */
  headSign: -1 | 1;
  /** How many decks the bed has (2 = a bunk). */
  levels: number;
}

/** Surfaces higher than this are canopies and roofs, not somewhere to sleep. */
const MAX_DECK = 1.9;
const MIN_DECK = 0.12;

/** Group heights within `gap` of each other; returns the groups, low to high. */
function clusters(values: number[], gap: number): number[][] {
  const v = [...values].sort((a, b) => a - b);
  const out: number[][] = [];
  for (const x of v) {
    const last = out[out.length - 1];
    if (last && x - last[last.length - 1] <= gap) last.push(x);
    else out.push([x]);
  }
  return out;
}

/**
 * Find the mattress on a bed from rays cast down along its length.
 * `deck`: on a bunk, the upper or lower bed (ignored on a plain bed).
 *
 * Down the middle of the bed every ray meets the same few surfaces: the
 * frame, the mattress, the duvet. The highest of those is where you lie
 * (`surface`); the lowest within 10 cm of it is the mattress itself. Along
 * the bed, the mattress runs from the headboard to the foot: a pillow has
 * the mattress under it, a headboard doesn't, so the run stops at the
 * headboard however high the pillow is.
 */
export function bedSpot(samples: BedSample[], deck: 'top' | 'bottom' = 'top'): BedSpot | null {
  if (samples.length < 5) return null;
  const s = [...samples].sort((a, b) => a.z - b.z);
  const n = s.length;
  const mid = s.slice(Math.floor(n * 0.3), Math.ceil(n * 0.7));
  // The decks: groups of surfaces down the middle, half a metre or more apart.
  const decks = clusters(mid.flatMap((x) => x.tops.filter((t) => t >= MIN_DECK && t <= MAX_DECK)), 0.5);
  if (!decks.length) return null;
  const group = deck === 'top' ? decks[decks.length - 1] : decks[0];
  // Heights nearly every middle ray meets (frame, mattress, duvet).
  const share = (h: number) => mid.filter((x) => x.tops.some((t) => Math.abs(t - h) <= 0.03)).length / mid.length;
  const common = [...new Set(group.map((t) => Math.round(t * 100) / 100))].filter((h) => share(h) >= 0.7).sort((a, b) => a - b);
  if (!common.length) return null;
  const surface = common[common.length - 1];
  const base = common.find((h) => h >= surface - 0.1) ?? surface;
  // Anything higher than a pillow (but under the next deck up) is the frame: a headboard, a footboard, a post.
  const above = decks.find((g) => g[0] > surface + 0.4);
  const cap = above ? above[0] - 0.05 : surface + 1.3;
  const PILLOW = 0.26;
  const onMattress = (x: BedSample) => x.tops.some((t) => Math.abs(t - base) <= 0.05 || Math.abs(t - surface) <= 0.03) && !x.tops.some((t) => t > base + PILLOW && t < cap);
  // The longest run of mattress along the bed.
  let best: [number, number] | null = null;
  for (let i = 0; i < n; ) {
    if (!onMattress(s[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < n && onMattress(s[j + 1])) j++;
    if (!best || j - i > best[1] - best[0]) best = [i, j];
    i = j + 1;
  }
  if (!best) return null;
  const [i0, i1] = best;
  // The headboard is the taller end (ties: the −z end, where every model has it). Only up to the next deck.
  const endHeight = (from: number, to: number) => Math.max(0, ...s.slice(from, to).flatMap((x) => x.tops.filter((t) => t < cap)));
  const lowEnd = endHeight(Math.max(0, i0 - 4), i0), highEnd = endHeight(i1 + 1, Math.min(n, i1 + 5));
  const headSign: -1 | 1 = highEnd > lowEnd + 0.1 ? 1 : -1;
  const z0 = s[i0].z, z1 = s[i1].z;
  const headZ = headSign < 0 ? z0 : z1, footZ = headSign < 0 ? z1 : z0;
  // The pillow: the highest thing on the mattress in the half metre at the head end.
  const pillowZone = s.slice(i0, i1 + 1).filter((x) => Math.abs(x.z - headZ) <= 0.55);
  const pillow = Math.max(surface, ...pillowZone.flatMap((x) => x.tops.filter((t) => t > base && t <= base + PILLOW)));
  return { surface, pillow, headZ, footZ, headSign, levels: decks.length };
}

/** A person's size lying down (from Avatar.bounds, standing pose): fallbacks for the simple figure. */
export interface BodySize {
  /** Soles to the top of the head (hair included). */
  length: number;
  /** How far the body reaches behind its centre line (the back, the bum). */
  back: number;
  /** Sideways middle of the body (the centre line may not be the middle in a pose). */
  side: number;
}
export const DEFAULT_BODY: BodySize = { length: 1.8, back: 0.13, side: 0 };

/** Where to put the person's root (at their feet) and how to turn them, in the bed's own frame. */
export interface LiePose {
  /** Bed-local x, z of the root (the soles), and its height in the room. */
  x: number;
  z: number;
  y: number;
  /** Turn about the up axis on top of the bed's turn (0 = head to −z). */
  yaw: number;
  /** Tilt about the body's side axis: −π/2 lies flat, a bit more lifts the head onto the pillow. */
  pitch: number;
}

/**
 * Lie a body on a measured bed: the head just inside the head end, on the
 * pillow; the back on the mattress; straight down the line `lineX`.
 */
export function liePose(spot: BedSpot, body: BodySize, lineX = 0): LiePose {
  const L = Math.max(0.6, body.length);
  // A couple of centimetres of pillow beyond the top of the head.
  const headTop = spot.headZ - spot.headSign * 0.04;
  const z = headTop - spot.headSign * L;
  // The pillow lifts the head: tilt the body (pivoting near the hips) so the head rests on it.
  const rise = THREE.MathUtils.clamp(spot.pillow - spot.surface, 0, 0.22) * 0.7;
  const tilt = Math.asin(Math.min(0.2, rise / (L * 0.55)));
  // Sink in a little: duvets and mattresses are soft.
  const y = spot.surface + body.back - 0.03 - Math.sin(tilt) * L * 0.4;
  return { x: lineX - body.side, z, y, yaw: spot.headSign < 0 ? 0 : Math.PI, pitch: -Math.PI / 2 + tilt };
}

/**
 * Cast rays down through a bed along a line (bed-local x = `lineX`) and
 * collect the heights of the surfaces facing up. `toWorld` maps bed-local
 * (x, z) to the room; the mesh must have its world matrix up to date.
 */
export function sampleBed(mesh: THREE.Object3D, fromZ: number, toZ: number, lineX: number, toWorld: (x: number, z: number) => THREE.Vector3, step = 0.04): BedSample[] {
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const n = new THREE.Vector3();
  const out: BedSample[] = [];
  mesh.updateMatrixWorld(true);
  for (let z = fromZ; z <= toZ + 1e-6; z += step) {
    const p = toWorld(lineX, z);
    ray.set(new THREE.Vector3(p.x, 4, p.z), down);
    const tops: number[] = [];
    for (const h of ray.intersectObject(mesh, true)) {
      if (!h.face) continue;
      n.copy(h.face.normal).transformDirection(h.object.matrixWorld);
      if (n.y > 0.4) tops.push(h.point.y);
    }
    out.push({ z, tops });
  }
  return out;
}
