// Dumps Manhattan's built plan (shore, blocks, roads, corridors, lots) to JSON
// for scripts/plot-plan.py. Run: npx tsx scripts/dump-plan.ts out.json
import { writeFileSync } from 'node:fs';
import { DISTRICTS, blockRect, streetStubs, stubRect } from '../src/world/layout.ts';
import { outline } from '../src/world/geo-proj.ts';
import { corridorsIn } from '../src/world/corridors.ts';
import { lotsFor, shoreFeatures } from '../src/world/coast.ts';
import '../src/data/plots.ts';
const d = DISTRICTS.manhattan;
const blocks = [];
for (let c = 0; c < d.cols; c++) for (let r = 0; r < d.rows; r++) {
  const k = d.kind(c, r);
  if (k === 'water') continue;
  blocks.push({ c, r, k, rect: blockRect(d, c, r), trimmed: !!d.trimmed(c, r) });
}
writeFileSync(process.argv[2], JSON.stringify({
  outline: outline('manhattan').map((r) => r.map((p) => [p.x, p.z])),
  others: ['brooklyn', 'queens', 'bronx', 'statenIsland'].flatMap((b) => outline(b as never).map((r) => r.map((p) => [p.x, p.z]))),
  xs: d.xs, zs: d.zs, aveW: d.avenueW, stW: d.streetW,
  blocks,
  corridors: corridorsIn('manhattan').map((c) => ({ id: c.id, w: c.width, loop: !!c.loop, highway: !!c.highway, pts: c.pts.map((p) => [p.x, p.z]) })),
  lots: lotsFor(d),
  stubs: streetStubs(d).map(stubRect),
  piers: shoreFeatures(d).piers,
}));
console.log('blocks', blocks.length, 'cols', d.cols, 'rows', d.rows);
