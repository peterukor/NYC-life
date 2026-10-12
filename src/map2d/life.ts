// =====================================================================
// map2d/life.ts — the moving parts of the map: cars and buses on the
// roads, people on the sidewalks, boats on the water, clouds overhead.
//
// All cheap on purpose: each thing is a point moving along a polyline
// (a road centre line, a sidewalk loop, a boat lane), updated with plain
// arithmetic, and only the ones on screen are drawn. Cars turn at
// junctions now and then, so traffic spreads over the whole network.
// =====================================================================

import type { BaseMap, CityLayer } from './render.ts';

interface Line {
  pts: number[][];
  /** Cumulative length at each point. */
  cum: number[];
  len: number;
  loop: boolean;
  /** Road width (cars keep to the right half). */
  w: number;
  /** Junctions along this line: distance here, other line, distance there. */
  junctions: { d: number; other: number; od: number }[];
}

function makeLine(pts: number[][], loop: boolean, w = 0): Line {
  const p = loop ? [...pts, pts[0]] : pts;
  const cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  return { pts: p, cum, len: cum[cum.length - 1], loop, w, junctions: [] };
}

/** Point and direction at distance d along a line. */
function at(l: Line, d: number): { x: number; z: number; dx: number; dz: number } {
  if (l.loop) d = ((d % l.len) + l.len) % l.len;
  else d = Math.max(0, Math.min(l.len, d));
  // Binary search for the segment.
  let lo = 0, hi = l.cum.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (l.cum[m] <= d) lo = m;
    else hi = m;
  }
  const a = l.pts[lo], b = l.pts[hi];
  const seg = l.cum[hi] - l.cum[lo] || 1;
  const t = (d - l.cum[lo]) / seg;
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dx: (b[0] - a[0]) / seg, dz: (b[1] - a[1]) / seg };
}

/** Find where lines cross (grid-bucketed so it stays fast). */
function linkJunctions(lines: Line[]): void {
  const CELL = 60;
  const grid = new Map<string, { li: number; si: number }[]>();
  lines.forEach((l, li) => {
    for (let si = 0; si < l.pts.length - 1; si++) {
      const a = l.pts[si], b = l.pts[si + 1];
      const x0 = Math.floor(Math.min(a[0], b[0]) / CELL), x1 = Math.floor(Math.max(a[0], b[0]) / CELL);
      const z0 = Math.floor(Math.min(a[1], b[1]) / CELL), z1 = Math.floor(Math.max(a[1], b[1]) / CELL);
      for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
        const k = `${gx},${gz}`;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k)!.push({ li, si });
      }
    }
  });
  const seen = new Set<string>();
  for (const list of grid.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const A = list[i], B = list[j];
        if (A.li === B.li) continue;
        const key = `${A.li}:${A.si}:${B.li}:${B.si}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const la = lines[A.li], lb = lines[B.li];
        const p = la.pts[A.si], p2 = la.pts[A.si + 1], q = lb.pts[B.si], q2 = lb.pts[B.si + 1];
        const rx = p2[0] - p[0], rz = p2[1] - p[1], sx = q2[0] - q[0], sz = q2[1] - q[1];
        const den = rx * sz - rz * sx;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((q[0] - p[0]) * sz - (q[1] - p[1]) * sx) / den;
        const u = ((q[0] - p[0]) * rz - (q[1] - p[1]) * rx) / den;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        const da = la.cum[A.si] + t * (la.cum[A.si + 1] - la.cum[A.si]);
        const db = lb.cum[B.si] + u * (lb.cum[B.si + 1] - lb.cum[B.si]);
        la.junctions.push({ d: da, other: B.li, od: db });
        lb.junctions.push({ d: db, other: A.li, od: da });
      }
    }
  }
  for (const l of lines) l.junctions.sort((a, b) => a.d - b.d);
}

let seed = 12345;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)];

const CAR_COLORS = ['#e8505b', '#3d8bfd', '#ffffff', '#2f3542', '#7bed9f', '#ff9f43', '#a29bfe', '#dfe4ea', '#ff6b81'];
const SHIRTS = ['#e63946', '#2a9d8f', '#f4a261', '#3a86ff', '#8338ec', '#06a77d', '#ff006e', '#ffbe0b', '#1d3557', '#ffffff'];
const SKIN = ['#8d5524', '#c68642', '#e0ac69', '#f1c27d', '#ffdbac', '#6b4226'];

interface Car { li: number; d: number; dir: number; v: number; color: string; kind: 'car' | 'taxi' | 'bus'; nextJ: number }
interface Walker { li: number; d: number; v: number; shirt: string; skin: string; phase: number }
interface Boat { li: number; d: number; v: number; kind: 'ferry' | 'sail' | 'tug' }
interface Cloud { x: number; z: number; r: number; v: number; puffs: number[][] }

export class Life {
  private roads: Line[] = [];
  private walks: Line[] = [];
  private lanes: Line[] = [];
  private cars: Car[] = [];
  private people: Walker[] = [];
  private boats: Boat[] = [];
  private clouds: Cloud[] = [];
  private bounds: { x0: number; z0: number; x1: number; z1: number };
  /** 0 = day … 1 = night (map2d/daylight.ts): headlights and lit boats. */
  night = 0;

  constructor(base: BaseMap, city: CityLayer & { walks?: number[][][]; boatLanes?: number[][][] }) {
    for (const r of base.roads) this.roads.push(makeLine(r.pts, false, r.w));
    for (const l of base.shoreRoad.loops) this.roads.push(makeLine(l, true, base.shoreRoad.w));
    linkJunctions(this.roads);
    for (const w of city.walks ?? []) this.walks.push(makeLine(w, true));
    for (const b of city.boatLanes ?? []) this.lanes.push(makeLine(b, true));
    const all = base.land.flat();
    this.bounds = { x0: Math.min(...all.map((p) => p[0])) - 300, z0: Math.min(...all.map((p) => p[1])) - 300, x1: Math.max(...all.map((p) => p[0])) + 300, z1: Math.max(...all.map((p) => p[1])) + 300 };

    // Traffic: about one vehicle per 55 m of road, a third of them yellow cabs.
    this.roads.forEach((l, li) => {
      const n = Math.round(l.len / 55);
      for (let i = 0; i < n; i++) {
        const r = rnd();
        const kind: Car['kind'] = r < 0.07 ? 'bus' : r < 0.38 ? 'taxi' : 'car';
        this.cars.push({ li, d: rnd() * l.len, dir: rnd() < 0.5 ? 1 : -1, v: kind === 'bus' ? 7 : 9 + rnd() * 6, color: pick(CAR_COLORS), kind, nextJ: -1 });
      }
    });
    // People: about one per 22 m of sidewalk.
    this.walks.forEach((l, li) => {
      const n = Math.round(l.len / 22);
      for (let i = 0; i < n; i++) this.people.push({ li, d: rnd() * l.len, v: (rnd() < 0.5 ? 1 : -1) * (1.1 + rnd() * 0.8), shirt: pick(SHIRTS), skin: pick(SKIN), phase: rnd() * 6 });
    });
    // Boats: ferries (Staten Island orange!), sailboats, tugs.
    this.lanes.forEach((l, li) => {
      const n = Math.max(2, Math.round(l.len / 900));
      for (let i = 0; i < n; i++) {
        const r = rnd();
        this.boats.push({ li, d: rnd() * l.len, v: (rnd() < 0.5 ? 1 : -1) * (5 + rnd() * 5), kind: r < 0.35 ? 'ferry' : r < 0.75 ? 'sail' : 'tug' });
      }
    });
    // Clouds drifting east.
    for (let i = 0; i < 22; i++) {
      const puffs: number[][] = [];
      const n = 4 + Math.floor(rnd() * 4);
      for (let k = 0; k < n; k++) {
        const t = n > 1 ? k / (n - 1) : 0.5;
        // A row of puffs, biggest in the middle: a cartoon cumulus.
        const r = 24 + Math.sin(t * Math.PI) * 26 + rnd() * 8;
        puffs.push([(t - 0.5) * 150, -r * 0.45 + (rnd() - 0.5) * 8, r]);
      }
      this.clouds.push({ x: this.bounds.x0 + rnd() * (this.bounds.x1 - this.bounds.x0), z: this.bounds.z0 + rnd() * (this.bounds.z1 - this.bounds.z0), r: 1, v: 3 + rnd() * 4, puffs });
    }
  }

  update(dt: number): void {
    dt = Math.min(dt, 0.1);
    for (const c of this.cars) {
      const l = this.roads[c.li];
      const d0 = c.d;
      c.d += c.dir * c.v * dt;
      // Passing a junction: sometimes turn onto the other road.
      for (const j of l.junctions) {
        const crossed = c.dir > 0 ? j.d > d0 && j.d <= c.d : j.d < d0 && j.d >= c.d;
        if (!crossed || c.nextJ === j.other) continue;
        if (rnd() < 0.3) {
          c.nextJ = c.li;
          c.li = j.other;
          c.d = j.od;
          c.dir = rnd() < 0.5 ? 1 : -1;
          break;
        }
      }
      const L = this.roads[c.li];
      if (!L.loop && (c.d < 0 || c.d > L.len)) {
        c.dir = -c.dir; // end of the road: turn round
        c.d = Math.max(0, Math.min(L.len, c.d));
      }
    }
    for (const p of this.people) p.d += p.v * dt;
    for (const b of this.boats) b.d += b.v * dt;
    for (const cl of this.clouds) {
      cl.x += cl.v * dt;
      if (cl.x > this.bounds.x1 + 200) cl.x = this.bounds.x0 - 200;
    }
  }

  /** Cars, buses and people (between the ground and the buildings). */
  drawStreet(g: CanvasRenderingContext2D, view: { x0: number; z0: number; x1: number; z1: number }, s: number, time: number): void {
    const on = (x: number, z: number, m: number) => x > view.x0 - m && x < view.x1 + m && z > view.z0 - m && z < view.z1 + m;
    // Boats first (they're on the water, under everything).
    for (const b of this.boats) {
      const p = at(this.lanes[b.li], b.d);
      if (!on(p.x, p.z, 40)) continue;
      const dir = b.v > 0 ? 1 : -1;
      const ang = Math.atan2(p.dz * dir, p.dx * dir);
      g.save();
      g.translate(p.x, p.z);
      g.rotate(ang);
      // Zoomed out, boats grow a little so you can still spot them.
      const big = Math.max(1, 0.9 / s);
      g.scale(big, big);
      // Wake.
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(-6, -2.5);
      g.lineTo(-16, -5);
      g.moveTo(-6, 2.5);
      g.lineTo(-16, 5);
      g.stroke();
      const L = b.kind === 'ferry' ? 16 : b.kind === 'tug' ? 8 : 9;
      const W = b.kind === 'ferry' ? 6 : b.kind === 'tug' ? 4 : 3.4;
      g.fillStyle = b.kind === 'ferry' ? '#f28c28' : b.kind === 'tug' ? '#c0392b' : '#ffffff';
      g.strokeStyle = '#2c2f3a';
      g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(-L / 2, -W / 2);
      g.lineTo(L / 2 - 2, -W / 2);
      g.quadraticCurveTo(L / 2 + 1.5, 0, L / 2 - 2, W / 2);
      g.lineTo(-L / 2, W / 2);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = b.kind === 'sail' ? '#f4f1ea' : '#ffffff';
      if (b.kind === 'sail') {
        g.beginPath();
        g.moveTo(-1, 0);
        g.lineTo(3, -5);
        g.lineTo(3, 4);
        g.closePath();
        g.fill();
        g.stroke();
      } else {
        g.fillRect(-L / 4, -W / 3, L / 2.2, (W * 2) / 3);
        g.strokeRect(-L / 4, -W / 3, L / 2.2, (W * 2) / 3);
      }
      if (this.night > 0.4) {
        g.fillStyle = '#ffe28a';
        g.beginPath();
        g.arc(L / 2 - 2, 0, 0.9, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }
    if (s < 0.32) return;
    // Cars and buses, kept to the right-hand side of the road.
    for (const c of this.cars) {
      const l = this.roads[c.li];
      const p = at(l, c.d);
      const side = l.w * 0.24;
      const nx = -p.dz * c.dir, nz = p.dx * c.dir; // left normal of travel; right = -n
      const x = p.x - nx * side, z = p.z - nz * side;
      if (!on(x, z, 12)) continue;
      const ang = Math.atan2(p.dz * c.dir, p.dx * c.dir);
      const len = c.kind === 'bus' ? 12 : 6.6;
      const wid = c.kind === 'bus' ? 3.6 : 3.2;
      g.save();
      g.translate(x, z);
      g.rotate(ang);
      g.fillStyle = 'rgba(36,48,74,0.22)';
      g.fillRect(-len / 2 + 0.6, -wid / 2 + 0.9, len, wid);
      const body = c.kind === 'taxi' ? '#ffcc29' : c.kind === 'bus' ? '#2f6fd6' : c.color;
      g.fillStyle = body;
      g.strokeStyle = '#2c2f3a';
      g.lineWidth = 0.5;
      roundRect(g, -len / 2, -wid / 2, len, wid, 1.1);
      g.fill();
      g.stroke();
      if (s > 0.6) {
        // Roof and windscreen.
        g.fillStyle = c.kind === 'bus' ? '#ffffff' : 'rgba(255,255,255,0.35)';
        roundRect(g, c.kind === 'bus' ? -len / 2 + 0.8 : -len * 0.22, -wid / 2 + 0.55, c.kind === 'bus' ? len - 1.6 : len * 0.42, wid - 1.1, 0.6);
        g.fill();
        g.fillStyle = '#3a4a63';
        g.fillRect(len / 2 - 1.9, -wid / 2 + 0.5, 0.9, wid - 1);
        if (c.kind === 'taxi') {
          g.fillStyle = '#ffffff';
          g.fillRect(-0.5, -0.6, 1, 1.2);
        }
      }
      if (this.night > 0.4) {
        g.fillStyle = 'rgba(255,240,180,0.9)';
        g.beginPath();
        g.arc(len / 2, -wid / 3, 0.55, 0, Math.PI * 2);
        g.arc(len / 2, wid / 3, 0.55, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(255,236,170,0.18)';
        g.beginPath();
        g.moveTo(len / 2, -wid / 2);
        g.lineTo(len / 2 + 12, -wid);
        g.lineTo(len / 2 + 12, wid);
        g.lineTo(len / 2, wid / 2);
        g.fill();
      }
      g.restore();
    }
    if (s < 0.85) return;
    // People: a coloured body and a head, bobbing as they walk.
    for (const p of this.people) {
      const q = at(this.walks[p.li], p.d);
      if (!on(q.x, q.z, 4)) continue;
      const bob = Math.abs(Math.sin(time * 6 + p.phase)) * 0.35;
      g.fillStyle = 'rgba(36,48,74,0.22)';
      g.beginPath();
      g.ellipse(q.x + 0.4, q.z + 0.2, 0.9, 0.45, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = p.shirt;
      g.strokeStyle = '#2c2f3a';
      g.lineWidth = 0.3;
      g.beginPath();
      g.ellipse(q.x, q.z - 1.1 - bob, 0.75, 1.0, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = p.skin;
      g.beginPath();
      g.arc(q.x, q.z - 2.5 - bob, 0.6, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  }

  /** Clouds and their shadows (on top of everything, fading as you zoom in). */
  drawSky(g: CanvasRenderingContext2D, view: { x0: number; z0: number; x1: number; z1: number }, s: number): void {
    const a = Math.max(0, Math.min(1, 1.5 - s * 1.1));
    if (a <= 0.02) return;
    for (const cl of this.clouds) {
      if (cl.x < view.x0 - 220 || cl.x > view.x1 + 220 || cl.z < view.z0 - 220 || cl.z > view.z1 + 220) continue;
      g.fillStyle = `rgba(36,48,74,${0.07 * a})`;
      g.beginPath();
      for (const [dx, dz, r] of cl.puffs) {
        g.moveTo(cl.x + dx + 70 + r, cl.z + dz + 90);
        g.arc(cl.x + dx + 70, cl.z + dz + 90, r, 0, Math.PI * 2);
      }
      g.fill();
      // Flat-bottomed puffs: white body, a soft blue-grey underside.
      g.save();
      g.beginPath();
      g.rect(cl.x - 200, cl.z - 200, 400, 200);
      g.clip();
      g.fillStyle = `rgba(214,228,242,${0.9 * a})`;
      g.beginPath();
      for (const [dx, dz, r] of cl.puffs) {
        g.moveTo(cl.x + dx + r, cl.z + dz);
        g.arc(cl.x + dx, cl.z + dz, r, 0, Math.PI * 2);
      }
      g.fill();
      g.fillStyle = `rgba(255,255,255,${0.95 * a})`;
      g.beginPath();
      for (const [dx, dz, r] of cl.puffs) {
        g.moveTo(cl.x + dx + r * 0.92, cl.z + dz - 5);
        g.arc(cl.x + dx, cl.z + dz - 5, r * 0.92, 0, Math.PI * 2);
      }
      g.fill();
      g.restore();
    }
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}
