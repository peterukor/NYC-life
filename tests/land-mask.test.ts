// The fast scanline land mask (nav grid) must match the slow per-point test exactly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { landMask, onLand } from '../src/world/geo-proj.ts';
import { DISTRICTS, districtBounds } from '../src/world/layout.ts';

test('landMask matches onLand cell for cell (Manhattan nav grid)', () => {
  const d = DISTRICTS.manhattan;
  const b = districtBounds(d, 30);
  const cell = 3; // nav.ts CELL
  const cols = Math.ceil((b.maxX - b.minX) / cell);
  const rows = Math.ceil((b.maxZ - b.minZ) / cell);
  const mask = landMask(d.borough, b.minX, b.minZ, cols, rows, cell);
  let diff = 0;
  let land = 0;
  for (let rr = 0; rr < rows; rr++)
    for (let cc = 0; cc < cols; cc++) {
      const slow = onLand(d.borough, b.minX + (cc + 0.5) * cell, b.minZ + (rr + 0.5) * cell) ? 1 : 0;
      if (slow !== mask[rr * cols + cc]) diff++;
      land += slow;
    }
  assert.ok(land > 1000, 'there is land');
  assert.equal(diff, 0);
});

test('indexed pointInRing gives the same answers as checking every edge', async () => {
  const { pointInRing, outline } = await import('../src/world/geo-proj.ts');
  const slow = (x: number, z: number, poly: { x: number; z: number }[]) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
    }
    return inside;
  };
  let n = 0, diff = 0;
  for (const id of ['manhattan', 'brooklyn', 'bronx', 'queens'] as const) {
    for (const ring of outline(id)) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const p of ring) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
      for (let k = 0; k < 4000; k++) {
        const x = x0 - 50 + Math.random() * (x1 - x0 + 100), z = z0 - 50 + Math.random() * (z1 - z0 + 100);
        n++;
        if (pointInRing(x, z, ring) !== slow(x, z, ring)) diff++;
      }
      // Exactly on a vertex's height too (the tricky case).
      for (const p of ring.slice(0, 200)) if (pointInRing(p.x + 0.37, p.z, ring) !== slow(p.x + 0.37, p.z, ring)) diff++;
    }
  }
  assert.ok(n > 10000);
  assert.equal(diff, 0);
});
