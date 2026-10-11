// =====================================================================
// coast.ts — the SHAPE of each borough: its land outline, the water all
// around it, and a cheap "rest of the borough" skyline beyond the streets
// you can walk.
//
// The playable streets are a grid (layout.ts). Real boroughs aren't
// boxes, so the land around the grid follows a rough outline of the real
// thing: Manhattan is a long island tapering to the Battery in the south
// and Inwood in the north, with the Hudson on the west and the East River
// on the east; Brooklyn has the East River along its north shore with
// the DUMBO bend, and the harbour to the west.
//
// The same outline is used by the 2D map (ui/map-art.ts), so the map and
// the 3D city always agree.
//
// TO CHANGE A SHAPE: edit the control points in OUTLINES (metres, as
// offsets from the grid's edges: W/E = west/east avenue, N/S = north/south
// street, w/h = grid width/height). They're smoothed automatically.
// =====================================================================

import * as THREE from 'three';
import { Rng } from '../core/rng.ts';
import type { AreaId } from '../sim/types.ts';
import { avenueX, streetZ, type DistrictDef } from './layout.ts';

export interface P {
  x: number;
  z: number;
}

interface Frame {
  W: number;
  E: number;
  N: number;
  S: number;
  w: number;
  h: number;
}

const OUTLINES: Record<AreaId, (f: Frame) => [number, number][]> = {
  // Clockwise from the far north (Inwood).
  manhattan: ({ W, E, N, S, w }) => [
    [W + 0.25 * w, N - 760],
    [W + 0.55 * w, N - 820],
    [E + 30, N - 700],
    [E + 75, N - 420],
    [E + 105, N - 120],
    [E + 110, S + 60],
    [E + 80, S + 260],
    [W + 0.78 * w, S + 430],
    [W + 0.52 * w, S + 540],
    [W + 0.28 * w, S + 470],
    [W - 24, S + 280],
    [W - 14, S + 30],
    [W - 14, N - 30],
    [W - 10, N - 300],
    [W + 40, N - 560],
  ],
  // Brooklyn: the north shore (East River) and the west shore (harbour);
  // land runs on to the south and east.
  brooklyn: ({ W, E, N, S, w }) => [
    [W - 60, N - 14],
    [W + 0.3 * w, N - 26],
    [W + 0.55 * w, N - 12],
    [E + 60, N - 40],
    [E + 260, N - 90],
    [E + 700, N - 60],
    [E + 760, S + 700],
    [W - 300, S + 760],
    [W - 260, S + 380],
    [W - 120, S + 160],
    [W - 70, S - 40],
    [W - 50, N + 120],
  ],
};

function frameOf(d: DistrictDef): Frame {
  const W = avenueX(d, 0) - d.avenueW / 2;
  const E = avenueX(d, d.cols) + d.avenueW / 2;
  const N = streetZ(d, 0) - d.streetW / 2;
  const S = streetZ(d, d.rows) + d.streetW / 2;
  return { W, E, N, S, w: E - W, h: S - N };
}

const shapes = new Map<string, P[]>();

/** The borough's land outline (smoothed, with a gentle natural wobble). */
export function landShape(d: DistrictDef): P[] {
  const hit = shapes.get(d.id);
  if (hit) return hit;
  let pts: P[] = OUTLINES[d.id](frameOf(d)).map(([x, z]) => ({ x, z }));
  // Chaikin smoothing: rounds the corners into a coastline.
  for (let it = 0; it < 3; it++) {
    const out: P[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      out.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    pts = out;
  }
  // A little wobble so it doesn't look drawn with a ruler — but never onto the streets.
  const f = frameOf(d);
  pts = pts.map((p, i) => {
    const insideGrid = p.x > f.W - 30 && p.x < f.E + 30 && p.z > f.N - 30 && p.z < f.S + 30;
    const k = insideGrid ? 0 : 1;
    return { x: p.x + Math.sin(i * 1.7) * 5 * k, z: p.z + Math.cos(i * 1.3) * 5 * k };
  });
  shapes.set(d.id, pts);
  return pts;
}

export function pointInPoly(x: number, z: number, poly: P[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/** Distance from a point to the outline (for keeping filler away from the shore). */
function distToEdge(x: number, z: number, poly: P[]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j];
    const b = poly[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz)));
  }
  return best;
}

const FILLER_COLORS = ['#d9c7b0', '#c9b59c', '#e3d6c2', '#b8a58e', '#cfd6df', '#bcc6d3', '#d7a98c', '#c58f75', '#e6e0d6'];

/**
 * Build water, the borough's land, and the far-off "rest of the city"
 * (simple boxes on the land beyond the playable streets). Cheap: one
 * draw call each for water, land, shore and the whole filler skyline.
 */
export function buildCoast(d: DistrictDef, track: <T extends { dispose(): void }>(x: T) => T): THREE.Group {
  const g = new THREE.Group();
  g.name = 'coast';
  const poly = landShape(d);
  const f = frameOf(d);

  // Water everywhere, just below the land.
  const water = new THREE.Mesh(track(new THREE.PlaneGeometry(6000, 6000)), track(new THREE.MeshPhongMaterial({ color: '#2f7fa8', shininess: 90, specular: new THREE.Color('#9fd3ff') })));
  water.rotation.x = -Math.PI / 2;
  water.position.set((f.W + f.E) / 2, -0.35, (f.N + f.S) / 2);
  water.name = 'water';
  g.add(water);

  // The land: a flat shape (x, z) laid on the ground.
  const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, -p.z)));
  const landGeo = track(new THREE.ShapeGeometry(shape, 2));
  landGeo.rotateX(-Math.PI / 2);
  const land = new THREE.Mesh(landGeo, track(new THREE.MeshLambertMaterial({ color: '#cbbfae' })));
  land.position.y = -0.04;
  land.receiveShadow = true;
  land.name = 'land';
  g.add(land);
  // The rest of the borough: a field of simple buildings and a few parks.
  const rng = new Rng(`filler-${d.id}`);
  const xs = poly.map((p) => p.x);
  const zs = poly.map((p) => p.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const cells: { x: number; z: number; w: number; dz: number; h: number; c: string }[] = [];
  const step = 46;
  for (let x = minX; x < maxX; x += step) {
    for (let z = minZ; z < maxZ; z += step * 0.62) {
      const cx = x + rng.range(-6, 6);
      const cz = z + rng.range(-4, 4);
      if (cx > f.W - 40 && cx < f.E + 40 && cz > f.N - 40 && cz < f.S + 40) continue; // the playable streets
      if (!pointInPoly(cx, cz, poly) || distToEdge(cx, cz, poly) < 22) continue;
      if (rng.chance(0.08)) continue; // a gap (a park or a lot)
      // Taller towards the playable Midtown / Downtown Brooklyn.
      const near = Math.max(0, 1 - Math.hypot(cx - (f.W + f.E) / 2, cz - (f.N + f.S) / 2) / 900);
      const tall = rng.chance(0.15 + near * 0.3);
      cells.push({ x: cx, z: cz, w: rng.range(18, 34), dz: rng.range(14, 22), h: tall ? rng.range(30, 80) : rng.range(8, 22), c: rng.pick(FILLER_COLORS) });
    }
  }
  if (cells.length) {
    const box = track(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
    const mesh = new THREE.InstancedMesh(box, track(new THREE.MeshLambertMaterial()), cells.length);
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    cells.forEach((c, i) => {
      m.makeScale(c.w, c.h, c.dz).setPosition(c.x, 0, c.z);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, col.set(c.c));
    });
    mesh.name = 'filler-skyline';
    g.add(mesh);
  }
  return g;
}

/** For the flat map: the other boroughs' rough outlines (decoration only). */
export function isLand(d: DistrictDef, x: number, z: number): boolean {
  return pointInPoly(x, z, landShape(d));
}
