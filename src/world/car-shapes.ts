// =====================================================================
// car-shapes.ts — smooth, curvy cartoon cars made from a few numbers.
//
// The old cars were chamfered boxes. These are "lofted": imagine slicing
// a car like a loaf of bread. Each slice is a rounded rectangle (a
// "superellipse": low numbers = round like an egg, high numbers = boxier).
// We say how tall/wide the slices are along the car (the side profile)
// and stitch the slices together with smooth normals, so the light rolls
// over the bodywork like a toy car.
//
//   body   — the main shell, with the wheel arches carved out of its
//            underside automatically
//   cabin  — the glass "greenhouse" on top, with a painted roof and pillars
//   wheels — round tyres with coloured rims (gold on the very rare cars)
//   lights — headlights and tail lights
//
// A car is described by a CarSpec (see data/vehicles.ts for 23 of them).
// The detail level (segments) is in the spec, so cheap common cars use
// fewer triangles and rare cars get smoother curves.
//
// Orientation: front is +z, sits on y = 0, centred on x = 0.
// =====================================================================

import type { CityMeshBuilder } from './nycgen/builder.ts';

type V3 = [number, number, number];
type Keys = [number, number][];

/** Smooth (cosine-eased) interpolation through [t, value] key points. */
export function curve(keys: Keys): (t: number) => number {
  return (t: number) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1] = keys[i];
      if (t <= t1) {
        const [t0, v0] = keys[i - 1];
        const f = (t - t0) / (t1 - t0 || 1);
        const e = (1 - Math.cos(f * Math.PI)) / 2;
        return v0 + (v1 - v0) * e;
      }
    }
    return keys[keys.length - 1][1];
  };
}

/** sign(x)·|x|^p — the heart of a superellipse. */
const sp = (x: number, p: number) => Math.sign(x) * Math.abs(x) ** p;
const smooth = (a: number, b: number, x: number) => {
  const f = Math.min(1, Math.max(0, (x - a) / (b - a || 1)));
  return f * f * (3 - 2 * f);
};

interface Band {
  u0: number;
  u1: number;
  segs: number;
  color: string | ((t: number, u: number) => string);
}

/**
 * Stitch a smooth surface P(t, u) into the builder.
 * ts: the slice positions (repeat a value to make a crisp colour edge there).
 * center(t): any point inside the shape at t, used to point normals outwards.
 * caps: close the first/last slice with a fan (for the body's ends).
 */
function surface(b: CityMeshBuilder, P: (t: number, u: number) => V3, ts: number[], bands: Band[], center: (t: number) => V3, caps = false): void {
  const e = 1e-3;
  const normal = (t: number, u: number, p: V3): V3 => {
    const ta = Math.max(0, t - e), tb = Math.min(1, t + e);
    const a = P(ta, u), c = P(tb, u), d = P(t, u - e), f = P(t, u + e);
    const pt: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const pu: V3 = [f[0] - d[0], f[1] - d[1], f[2] - d[2]];
    let n: V3 = [pu[1] * pt[2] - pu[2] * pt[1], pu[2] * pt[0] - pu[0] * pt[2], pu[0] * pt[1] - pu[1] * pt[0]];
    const cc = center(t);
    const out: V3 = [p[0] - cc[0], p[1] - cc[1], p[2] - cc[2]];
    let l = Math.hypot(n[0], n[1], n[2]);
    if (l < 1e-9) { n = out; l = Math.hypot(n[0], n[1], n[2]) || 1; }
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) l = -l;
    return [n[0] / l, n[1] / l, n[2] / l];
  };
  const colorAt = (band: Band, i: number, u: number) => {
    if (typeof band.color === 'string') return band.color;
    const t = ts[i];
    const tc = i > 0 && ts[i - 1] === t ? t + 1e-4 : i < ts.length - 1 && ts[i + 1] === t ? t - 1e-4 : t;
    return band.color(tc, u);
  };

  for (const band of bands) {
    const rows: { i: number; p: V3 }[][] = [];
    ts.forEach((t, i) => {
      const row: { i: number; p: V3 }[] = [];
      for (let k = 0; k <= band.segs; k++) {
        const u = band.u0 + ((band.u1 - band.u0) * k) / band.segs;
        const p = P(t, u);
        const n = normal(t, u, p);
        row.push({ i: b.rawVert(p[0], p[1], p[2], n[0], n[1], n[2], colorAt(band, i, u)), p });
      }
      rows.push(row);
    });
    for (let i = 0; i < rows.length - 1; i++) {
      if (ts[i] === ts[i + 1]) continue; // zero-width colour seam
      const out = center((ts[i] + ts[i + 1]) / 2);
      for (let k = 0; k < band.segs; k++) {
        const a = rows[i][k], c = rows[i][k + 1], d = rows[i + 1][k + 1], f = rows[i + 1][k];
        tri(b, a, c, d, out);
        tri(b, a, d, f, out);
      }
    }
  }

  if (!caps) return;
  for (const end of [0, ts.length - 1]) {
    const t = ts[end];
    const cc = center(t);
    const inner = center(end === 0 ? Math.min(1, t + 0.02) : Math.max(0, t - 0.02));
    let n: V3 = [cc[0] - inner[0], cc[1] - inner[1], cc[2] - inner[2]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    n = [n[0] / l, n[1] / l, n[2] / l];
    for (const band of bands) {
      const mid = b.rawVert(cc[0], cc[1], cc[2], n[0], n[1], n[2], colorAt(band, end, (band.u0 + band.u1) / 2));
      const ring: { i: number; p: V3 }[] = [];
      for (let k = 0; k <= band.segs; k++) {
        const u = band.u0 + ((band.u1 - band.u0) * k) / band.segs;
        const p = P(t, u);
        ring.push({ i: b.rawVert(p[0], p[1], p[2], n[0], n[1], n[2], colorAt(band, end, u)), p });
      }
      // Point the fan the way the end faces.
      const away: V3 = [cc[0] + n[0] * 10, cc[1] + n[1] * 10, cc[2] + n[2] * 10];
      const m = { i: mid, p: cc };
      for (let k = 0; k < band.segs; k++) triFacing(b, m, ring[k], ring[k + 1], away);
    }
  }
}

/** Add a triangle wound so it faces away from `inside`. */
function tri(b: CityMeshBuilder, a: { i: number; p: V3 }, c: { i: number; p: V3 }, d: { i: number; p: V3 }, inside: V3): void {
  const n = cross(a.p, c.p, d.p);
  const o: V3 = [a.p[0] - inside[0], a.p[1] - inside[1], a.p[2] - inside[2]];
  if (n[0] * o[0] + n[1] * o[1] + n[2] * o[2] >= 0) b.rawTri(a.i, c.i, d.i);
  else b.rawTri(a.i, d.i, c.i);
}

/** Add a triangle wound so it faces towards `toward`. */
function triFacing(b: CityMeshBuilder, a: { i: number; p: V3 }, c: { i: number; p: V3 }, d: { i: number; p: V3 }, toward: V3): void {
  const n = cross(a.p, c.p, d.p);
  const o: V3 = [toward[0] - a.p[0], toward[1] - a.p[1], toward[2] - a.p[2]];
  if (n[0] * o[0] + n[1] * o[1] + n[2] * o[2] >= 0) b.rawTri(a.i, c.i, d.i);
  else b.rawTri(a.i, d.i, c.i);
}

function cross(a: V3, b: V3, c: V3): V3 {
  const u: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
}

// ---------------------------------------------------------------------
// The car recipe
// ---------------------------------------------------------------------

export interface CabinSpec {
  /** Where the glass starts and ends along the car (0 = rear bumper, 1 = front bumper). */
  from: number;
  to: number;
  /** Height of the roof above the body top (m). */
  roof: number;
  /** Where (0–1 within the cabin) the flat roof starts and ends; small/large = steep glass. */
  roofFrom?: number;
  roofTo?: number;
  /** Cabin width as a share of the body (0.86 default). */
  width?: number;
  /** Roof colour: 'paint' (default) or any colour (black roofs on sporty cars). */
  roofColor?: string;
  /** Painted window pillars (positions 0–1 within the cabin). */
  pillars?: number[];
  /** Glass colour. */
  glass?: string;
}

export interface CarSpec {
  length: number;
  width: number;
  /** Body top height along the car (rear → front): trunk, beltline, hood. */
  top: Keys;
  /** Body bottom (ground clearance) along the car. */
  bottom?: Keys;
  /** Half-width multiplier along the car (1 = full width). */
  plan?: Keys;
  /** Roundness of the body slices: 2 = egg, 3 = soft toy (default), 4+ = boxy. */
  round?: number;
  /** How far (m) the ends round off. */
  endRound?: number;
  cabin?: CabinSpec;
  wheelR: number;
  /** Wheel positions along the car (0–1). */
  wheels: number[];
  wheelW?: number;
  rim?: string;
  tyre?: string;
  /** Darker lower body (bumpers/sills): colour and the height below which it applies. */
  trim?: { color: string; below: number };
  /** Ring segments: 10 = cheap, 14 = smooth, 18 = showroom. */
  segs?: number;
  /** Slices between the ends. */
  slices?: number;
  headlight?: string;
  taillight?: string;
}

export const GLASS = '#8fd0f5';
export const DARK_GLASS = '#3c4f6b';
export const TYRE = '#26282e';
export const CHROME = '#d5dbe3';

/** Body helpers a car's extras can use (positions on the finished body). */
export interface CarFrame {
  top: (t: number) => number;
  halfW: (t: number) => number;
  z: (t: number) => number;
}

/**
 * Build a smooth cartoon car into the builder. Returns helpers for adding extras.
 * lod 0 = cheap (parked cars, low-end phones), 1 = full detail.
 */
export function buildCar(b: CityMeshBuilder, s: CarSpec, paint: string, lod: 0 | 1 = 1): CarFrame {
  const L = s.length;
  const W = s.width;
  const n = s.round ?? 3;
  const segs = lod ? s.segs ?? 12 : 8;
  const er = s.endRound ?? 0.45;
  const R = s.wheelR;
  const top = curve(s.top);
  const bot0 = curve(s.bottom ?? [[0, R * 0.75], [1, R * 0.75]]);
  const plan = curve(s.plan ?? [[0, 0.94], [0.15, 1], [0.85, 1], [1, 0.92]]);
  const z = (t: number) => -L / 2 + t * L;

  // Wheel arches: lift the underside around each wheel.
  const bottom = (t: number) => {
    let y = bot0(t);
    for (const tw of s.wheels) {
      const dz = Math.abs(t - tw) * L;
      const ra = R * 1.18;
      if (dz < ra) y = Math.max(y, R * 0.55 + Math.sqrt(ra * ra - dz * dz) * 0.95);
    }
    return Math.min(y, top(t) - 0.28);
  };
  // Round the ends: slices shrink towards the bumpers.
  const endF = (t: number) => {
    const d = Math.min(t, 1 - t) * L;
    if (d >= er) return 1;
    const f = 1 - d / er;
    return 0.42 + 0.58 * Math.sqrt(Math.max(0, 1 - f * f));
  };
  const cy = (t: number) => (top(t) + bottom(t)) / 2;
  const hh = (t: number) => ((top(t) - bottom(t)) / 2) * (0.6 + 0.4 * endF(t));
  const hw = (t: number) => (W / 2) * plan(t) * endF(t);
  const P = (t: number, u: number): V3 => [hw(t) * sp(Math.cos(u), 2 / n), cy(t) + hh(t) * sp(Math.sin(u), 2 / n), z(t)];
  const center = (t: number): V3 => [0, cy(t), z(t)];

  // Slices: bunched at the rounded ends, evenly spread in between.
  const ts: number[] = [];
  const ends = (lod ? [0, 0.12, 0.35, 0.65, 1] : [0, 0.4, 1]).map((f) => (f * er) / L);
  for (const f of ends) ts.push(f);
  const mid = lod ? s.slices ?? 7 : 3;
  for (let i = 1; i < mid; i++) ts.push(ends[ends.length - 1] + ((1 - 2 * ends[ends.length - 1]) * i) / mid);
  for (const f of [...ends].reverse()) ts.push(1 - f);
  // Extra slices across each wheel arch so it reads round.
  for (const tw of s.wheels) for (const o of lod ? [-1, -0.5, 0, 0.5, 1] : [-1, 0, 1]) ts.push(tw + (o * R * 1.15) / L);
  const uniq = [...new Set(ts.map((t) => Math.round(Math.min(1, Math.max(0, t)) * 1e4) / 1e4))].sort((a, b2) => a - b2);

  const bodyColor = (t: number, u: number) => {
    if (!s.trim) return paint;
    const y = cy(t) + hh(t) * sp(Math.sin(u), 2 / n);
    return y < s.trim.below ? s.trim.color : paint;
  };
  surface(b, P, uniq, [{ u0: -Math.PI, u1: Math.PI, segs: segs, color: s.trim ? bodyColor : paint }], center, true);

  // ----- Cabin (glasshouse) -----
  if (s.cabin) {
    const c = s.cabin;
    const glass = c.glass ?? GLASS;
    const roofC = c.roofColor && c.roofColor !== 'paint' ? c.roofColor : paint;
    const rf = c.roofFrom ?? 0.3;
    const rt = c.roofTo ?? 0.7;
    const cw = c.width ?? 0.86;
    const nc = 2.6;
    const sOf = (t: number) => (t - c.from) / (c.to - c.from);
    const tOf = (s2: number) => c.from + s2 * (c.to - c.from);
    // Rise over the rear glass, flat roof, fall over the windscreen.
    const lift = (s2: number) => {
      const up = Math.sin((Math.PI / 2) * Math.min(1, Math.max(0, s2 / rf)));
      const down = Math.sin((Math.PI / 2) * Math.min(1, Math.max(0, (1 - s2) / (1 - rt))));
      return c.roof * Math.min(up, down);
    };
    const belt = (t: number) => cy(t) + hh(t) * 0.55;
    const PC = (t: number, u: number): V3 => {
      const s2 = sOf(t);
      const width = hw(t) * cw * (1 - 0.1 * Math.min(1, lift(s2) / (c.roof || 1)));
      const height = top(t) - belt(t) + lift(s2);
      return [width * sp(Math.cos(u), 2 / nc), belt(t) + height * sp(Math.sin(u), 2 / nc), z(t)];
    };
    const centerC = (t: number): V3 => [0, belt(t), z(t)];
    const pillars = c.pillars ?? [];
    const pw = 0.035;
    const cts: number[] = [];
    const csl = lod ? Math.max(6, Math.round(segs * 0.6)) : 4;
    for (let i = 0; i <= csl; i++) cts.push(i / csl);
    for (const e2 of [rf, rt]) cts.push(e2, e2);
    for (const p of pillars) cts.push(p - pw, p - pw, p + pw, p + pw);
    const cs = [...cts].sort((a, b2) => a - b2).map(tOf);
    const inRoof = (t: number) => {
      const s2 = sOf(t);
      return s2 > rf && s2 < rt;
    };
    const sideColor = (t: number) => {
      const s2 = sOf(t);
      return pillars.some((p) => Math.abs(s2 - p) < pw) ? paint : glass;
    };
    const half = Math.max(3, Math.round(segs / 4));
    surface(b, PC, cs, [
      { u0: 0, u1: Math.PI * 0.24, segs: half, color: (t) => sideColor(t) },
      { u0: Math.PI * 0.24, u1: Math.PI * 0.76, segs: Math.max(2, half - 1), color: (t) => (inRoof(t) ? roofC : glass) },
      { u0: Math.PI * 0.76, u1: Math.PI, segs: half, color: (t) => sideColor(t) },
    ], centerC);
  }

  // ----- Wheels -----
  const wr = s.wheelW ?? 0.42;
  for (const tw of s.wheels) {
    for (const side of [-1, 1]) {
      const xo = side * (W / 2 - wr * 0.42);
      wheel(b, xo, z(tw), R, wr, side, s.tyre ?? TYRE, s.rim ?? CHROME, lod ? Math.max(10, segs - 2) : 8);
    }
  }

  // ----- Lights -----
  const hl = s.headlight ?? '#fff6cf';
  const tl = s.taillight ?? '#ff3b4f';
  // Find where the bodywork is at (x, y) going in from a bumper, so the
  // lights sit snugly on the curved nose and tail.
  const inside = (t: number, x: number, y: number) => Math.abs(x / hw(t)) ** n + Math.abs((y - cy(t)) / hh(t)) ** n <= 1;
  const edgeT = (x: number, y: number, front: boolean) => {
    for (let i = 0; i <= 60; i++) {
      const t = front ? 1 - i / 120 : i / 120;
      if (inside(t, x, y)) return t;
    }
    return front ? 0.9 : 0.1;
  };
  for (const x of [-1, 1]) {
    const tf = 1 - (er * 0.5) / L;
    const tr = (er * 0.5) / L;
    const yf = cy(tf) + hh(tf) * 0.4;
    const yr = cy(tr) + hh(tr) * 0.45;
    const xf = hw(tf) * 0.6 * x;
    const xr = hw(tr) * 0.62 * x;
    const zf = z(edgeT(xf, yf, true));
    const zr = z(edgeT(xr, yr, false));
    b.box(xf - 0.18, xf + 0.18, yf - 0.08, yf + 0.08, zf - 0.08, zf + 0.05, hl, 'nsewt');
    b.box(xr - 0.18, xr + 0.18, yr - 0.07, yr + 0.07, zr - 0.05, zr + 0.08, tl, 'nsewt');
  }
  return { top, halfW: hw, z };
}

/** A round tyre with a rim, its axle along x. side = -1 (left) or +1 (right) faces outwards. */
function wheel(b: CityMeshBuilder, x: number, zc: number, r: number, w: number, side: number, tyre: string, rim: string, segs: number): void {
  const xs = [-w / 2, -w * 0.38, w * 0.38, w / 2];
  const rs = [r * 0.82, r, r, r * 0.82];
  const ts = [0, 1 / 3, 2 / 3, 1];
  const P = (t: number, u: number): V3 => {
    // piecewise-linear through the profile
    const k = Math.min(2, Math.floor(t * 3));
    const f = t * 3 - k;
    const xx = xs[k] + (xs[k + 1] - xs[k]) * f;
    const rr = rs[k] + (rs[k + 1] - rs[k]) * f;
    return [x + xx * side, r + rr * Math.sin(u), zc + rr * Math.cos(u)];
  };
  surface(b, P, ts, [{ u0: 0, u1: Math.PI * 2, segs, color: tyre }], (t) => [x + (xs[0] + (xs[3] - xs[0]) * t) * side, r, zc]);
  // Rim: a shallow dish on the outer face.
  const xo = x + (w / 2) * side;
  const nrm: V3 = [side, 0, 0];
  const mid = b.rawVert(xo - 0.03 * side, r, zc, side, 0, 0, rim);
  const ringAt = (rad: number, col: string, dx: number) => {
    const out: { i: number; p: V3 }[] = [];
    for (let k = 0; k <= segs; k++) {
      const u = (k / segs) * Math.PI * 2;
      const p: V3 = [xo + dx * side, r + rad * Math.sin(u), zc + rad * Math.cos(u)];
      out.push({ i: b.rawVert(p[0], p[1], p[2], nrm[0], nrm[1], nrm[2], col), p });
    }
    return out;
  };
  const ring = ringAt(r * 0.6, rim, 0.005);
  const m = { i: mid, p: [xo, r, zc] as V3 };
  const away: V3 = [xo + side * 10, r, zc];
  for (let k = 0; k < segs; k++) triFacing(b, m, ring[k], ring[k + 1], away);
  // Tyre sidewall between the rim and the tread.
  const a = ringAt(r * 0.6, tyre, 0.004);
  const o = ringAt(r * 0.82, tyre, 0);
  for (let k = 0; k < segs; k++) {
    triFacing(b, a[k], a[k + 1], o[k + 1], away);
    triFacing(b, a[k], o[k + 1], o[k], away);
  }
}

export { smooth };
