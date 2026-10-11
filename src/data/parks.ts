// =====================================================================
// parks.ts — lakes and ponds in the big parks (3D city and the maps).
// Real positions; if our park is narrower than the real one, the pond is
// pulled into the middle of the park.
// =====================================================================

import type { AreaId } from '../sim/types.ts';
import { project } from '../world/geo-proj.ts';
import { blockRect, colAt, isPark, rowAt, type DistrictDef } from '../world/layout.ts';

/** Size in game metres (rx across, rz along). */
export const PONDS: { area: AreaId; name: string; at: [number, number]; rx: number; rz: number }[] = [
  { area: 'manhattan', name: 'The Reservoir', at: [40.7855, -73.9625], rx: 48, rz: 70 },
  { area: 'manhattan', name: 'The Lake', at: [40.7765, -73.971], rx: 30, rz: 22 },
  { area: 'manhattan', name: 'Harlem Meer', at: [40.7965, -73.9515], rx: 26, rz: 16 },
  { area: 'manhattan', name: 'The Pond', at: [40.7665, -73.9745], rx: 16, rz: 10 },
];

export function pondsFor(d: DistrictDef): { x: number; z: number; rx: number; rz: number; name: string }[] {
  const out: { x: number; z: number; rx: number; rz: number; name: string }[] = [];
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
    out.push({ x, z: at.z, rx: p.rx, rz: p.rz, name: p.name });
  }
  return out;
}
