"""
build-manhattan-shore.py — a clean, cartoon Manhattan shore for the 3D city.

Peter, 2026-10-12: "fix up the whole map, the shore line and roads
especially… make sure it's not weird". The real coastline (build-geo.mjs)
is full of piers and inlets; offsetting it for the ring highway tied the
road in knots, and the grid ran under the highway in places.

From the real outline this makes (in game metres, same projection):
  land      smoothed island outlines: piers and inlets gone, corners soft.
            Manhattan first, then the small islands next to it.
  ring      the ring highway's centre line (West Side Hwy · FDR · Harlem
            River Dr): the smoothed island shrunk by RING_INSET with
            shapely's buffer, so it can never cross itself.
  core      where street blocks may go: inside the highway, leaving room
            for the highway's half width, a gap, and the street round the
            block. Blocks are trimmed to this (world/layout.ts).
  broadway  Broadway, Inwood to the Battery, from real points, smoothed and
            ending exactly on the ring highway at both ends.

    python3 scripts/build-manhattan-shore.py   →  src/data/geo/manhattan-shore.ts
"""
import json, math, pathlib, re
from shapely.geometry import Polygon, LineString, MultiPolygon
from shapely.ops import unary_union

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = (ROOT / 'src/data/geo/nyc-boroughs.ts').read_text()
GEO = json.loads(SRC[SRC.index('{', SRC.index('= ')):].rstrip().rstrip(';'))

O = (40.758, -73.9855)
TH = math.radians(29)
COSLAT = math.cos(math.radians(O[0]))


def proj(lat, lon):
    E = (lon - O[1]) * COSLAT * 111320
    N = (lat - O[0]) * 110540
    return ((E * math.cos(TH) - N * math.sin(TH)) * 0.2, -(E * math.sin(TH) + N * math.cos(TH)) * 0.2)


RING_W = 18        # highway asphalt width (world/corridors.ts)
RING_INSET = 30    # coast → highway centre: room for the promenade, beach or bush strip and trees
AVE_W = 17         # street width round a block (world/layout.ts)
GAP = 1.5          # kerb gap between the highway and the street grid
CORE_INSET = RING_W / 2 + GAP + AVE_W / 2 + 0.5


def chaikin(pts, passes, loop=True):
    for _ in range(passes):
        out = [] if loop else [pts[0]]
        n = len(pts)
        for i in range(n if loop else n - 1):
            a, b = pts[i], pts[(i + 1) % n]
            out += [(a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25), (a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75)]
        if not loop:
            out.append(pts[-1])
        pts = out
    return pts


def largest(g):
    if isinstance(g, MultiPolygon):
        return max(g.geoms, key=lambda p: p.area)
    return g


def smooth_poly(p, r_close, r_open, tol, passes):
    """Fill inlets (closing), cut off piers and spits (opening), round off."""
    q = p.buffer(r_close, join_style=1).buffer(-r_close, join_style=1)
    q = q.buffer(-r_open, join_style=1).buffer(r_open, join_style=1)
    q = largest(q.buffer(0))
    ring = list(q.exterior.simplify(tol).coords)[:-1]
    ring = chaikin(ring, passes)
    return Polygon(ring).buffer(0)


def resample(pts, step, loop):
    line = LineString(pts + ([pts[0]] if loop else []))
    n = max(2, int(line.length / step))
    out = [line.interpolate(i * line.length / n) for i in range(n if loop else n + 1)]
    return [(p.x, p.y) for p in out]


rings = [Polygon(r) for r in GEO['boroughs']['manhattan']]
rings.sort(key=lambda p: -p.area)
main = rings[0].buffer(0)

# ---- the island: a smooth cartoon coast that still reads as Manhattan
land = smooth_poly(main, r_close=16, r_open=12, tol=2.0, passes=2)
islands = []
for p in rings[1:]:
    if p.area < 2500:
        continue  # rocks and specks
    q = smooth_poly(p.buffer(0), r_close=8, r_open=5, tol=1.5, passes=2)
    if not q.is_empty and q.area > 1500:
        islands.append(q)

# ---- ring highway: shrink the coast, then open again so it never pinches
inner = largest(land.buffer(-RING_INSET, join_style=1))
inner = largest(inner.buffer(-45, join_style=1).buffer(45, join_style=1))
ring_pts = chaikin(list(inner.exterior.simplify(1.5).coords)[:-1], 2)
ring_poly = Polygon(ring_pts).buffer(0)
ring_pts = resample(ring_pts, 18, True)

# ---- core: where the street grid lives
core = largest(ring_poly.buffer(-CORE_INSET, join_style=2))

# ---- Broadway, Inwood → the Battery (real points)
BROADWAY = [
    (40.8745, -73.9100), (40.8700, -73.9165), (40.8677, -73.9197), (40.8615, -73.9257), (40.8550, -73.9310), (40.8490, -73.9358), (40.8405, -73.9400),
    (40.8340, -73.9445), (40.8262, -73.9504), (40.8222, -73.9535), (40.8155, -73.9585), (40.8077, -73.9640),
    (40.8045, -73.9667), (40.7937, -73.9723), (40.7832, -73.98), (40.7781, -73.9818), (40.7735, -73.9822), (40.7681, -73.9819),
    (40.7616, -73.9839), (40.758, -73.9855), (40.7559, -73.9866), (40.7497, -73.9877), (40.7411, -73.9897), (40.7355, -73.9908),
    (40.73, -73.9925), (40.7253, -73.9967), (40.7193, -74.0015), (40.714, -74.006), (40.7105, -74.009), (40.7075, -74.012), (40.7046, -74.0136),
    (40.7020, -74.0150), (40.6995, -74.0165),
]
bw = chaikin([proj(a, b) for a, b in BROADWAY], 2, loop=False)
bw_in = LineString(bw).intersection(ring_poly)
if bw_in.geom_type == 'MultiLineString':
    bw_in = max(bw_in.geoms, key=lambda g: g.length)
broadway = resample(list(bw_in.coords), 14, False)


def r1(pts):
    return [[round(x, 1), round(z, 1)] for x, z in pts]


out = {
    'land': [r1(list(land.exterior.coords)[:-1])] + [r1(list(q.exterior.coords)[:-1]) for q in islands],
    'ring': r1(ring_pts),
    'core': r1(list(core.exterior.coords)[:-1]),
    'broadway': r1(broadway),
    'ringWidth': RING_W,
}
ts = ('// GENERATED by scripts/build-manhattan-shore.py from the real outline in nyc-boroughs.ts. Do not edit by hand.\n'
      '// Smoothed Manhattan coast, the ring highway, the core the street grid stays inside, and Broadway.\n'
      'export const MANHATTAN_SHORE: { land: [number, number][][]; ring: [number, number][]; core: [number, number][]; broadway: [number, number][]; ringWidth: number } = '
      + json.dumps(out, separators=(',', ':')) + ';\n')
(ROOT / 'src/data/geo/manhattan-shore.ts').write_text(ts)
print('land pts', len(out['land'][0]), 'islands', len(islands), [round(q.area) for q in islands],
      'ring pts', len(ring_pts), 'core pts', len(out['core']), 'broadway pts', len(broadway),
      'land area', round(land.area), 'vs real', round(main.area))
