// =====================================================================
// parks.ts — lakes and ponds in the big parks (3D city and the maps).
// Real positions; if our park is narrower than the real one, the pond is
// pulled into the middle of the park.
//
// Central Park's water (the Pond, the Lake, Conservatory Water, Turtle
// Pond, the Reservoir, the Pool, Harlem Meer) comes from its plan
// (world/central-park-plan.ts) with real outlines (`pts`); the park's
// landmark draws it, so the city builder skips those.
// =====================================================================

import type { AreaId } from '../sim/types.ts';
import { X_STRETCH, project } from '../world/geo-proj.ts';
import { blockRect, colAt, isPark, rowAt, type DistrictDef } from '../world/layout.ts';
import { centralParkPlan, type XZ } from '../world/central-park-plan.ts';

/** Size in game metres (rx across, rz along). (Central Park's own water is in its plan.) */
export const PONDS: { area: AreaId; name: string; at: [number, number]; rx: number; rz: number }[] = [];

export interface Pond {
  x: number;
  z: number;
  rx: number;
  rz: number;
  name: string;
  /** Real outline (Central Park): drawn by its landmark, not as an ellipse. */
  pts?: XZ[];
}

export function pondsFor(d: DistrictDef): Pond[] {
  const out: Pond[] = [];
  const cp = centralParkPlan(d);
  if (cp) for (const w of cp.waters) out.push({ x: w.x, z: w.z, rx: w.rx, rz: w.rz, name: w.name, pts: w.pts });
  for (const p of PONDS.filter((k) => k.area === d.id)) {
    const at = project(p.at[0], p.at[1]);
    const r = rowAt(d, at.z);
    const c = colAt(d, at.x);
    let x = at.x;
    if (!isPark(d, c, r)) {
      let found = false;
      for (let k = 0; k < d.cols; k++) {
        if (!isPark(d, k, r)) continue;
        const b = blockRect(d, k, r);
        x = (b.minX + b.maxX) / 2;
        found = true;
      }
      if (!found) continue;
    }
    // Keep the water inside its park block: the game's park is cut by
    // cross streets, and a pond at its real spot could spill onto the road
    // (Peter, 2026-10-14: "a pond on the road from Central Park").
    const b = blockRect(d, colAt(d, x), rowAt(d, at.z));
    const M = 7; // a lawn edge between the water and the sidewalk
    const rx = Math.max(6, Math.min(p.rx * X_STRETCH, (b.maxX - b.minX) / 2 - M));
    const rz = Math.max(5, Math.min(p.rz, (b.maxZ - b.minZ) / 2 - M));
    const cx = Math.min(Math.max(x, b.minX + M + rx), b.maxX - M - rx);
    const cz = Math.min(Math.max(at.z, b.minZ + M + rz), b.maxZ - M - rz);
    out.push({ x: cx, z: cz, rx, rz, name: p.name }); // wider with the map, but never past the park's edge
  }
  return out;
}
