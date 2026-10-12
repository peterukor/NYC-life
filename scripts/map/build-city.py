"""
build-city.py — LAYER 3 of the 2D map: what stands on the blocks.

For every city block (from build-borough.py):
  • A SIDEWALK ring runs round the edge (5 m).
  • Inside it, the land is cut into a tidy LOT GRID (16 m cells, turned to
    match the block). A building is only ever made of whole cells that sit
    completely inside the block, so nothing can stick out over a road or
    the water (Peter, 2026-10-12: "for houses that don't sit properly on a
    block use a smaller building, or grass, trees or sidewalk").
  • Buildings line the streets first (frontage), in sizes that suit the
    neighbourhood: towers in Midtown and the Financial District, apartment
    blocks uptown, brownstone rows in Harlem and the Village. A big
    building that doesn't fit is swapped for a smaller one; a cell where
    nothing fits stays green.
  • Everything left over inside the sidewalk is LAWN (back yards,
    courtyards, odd corners at the shore) with TREES on it.
  • STREET TREES and STREET LAMPS stand along the sidewalks.
  • Parks get trees (Central Park also its lakes); plazas get a few trees;
    the waterfront strip gets trees.

Output: src/data/map/<borough>-city.json. Nothing random changes between
runs (fixed seeds).

  python3 scripts/map/build-city.py manhattan
"""
import json, math, pathlib, random, sys
from shapely.geometry import Polygon, Point, LineString, MultiPolygon, box
from shapely.ops import unary_union
from shapely import affinity

ROOT = pathlib.Path(__file__).resolve().parents[2]
B = sys.argv[1] if len(sys.argv) > 1 else 'manhattan'
M = json.load(open(ROOT / 'src' / 'data' / 'map' / f'{B}.json'))

SIDEWALK = 5.0
CELL = 16.0
GAP = 0.35  # hairline between neighbouring buildings (outlines)

O = (40.758, -73.9855)
TH = math.radians(29)
COS_LAT = math.cos(math.radians(O[0]))


def proj(lat, lon):
    E = (lon - O[1]) * COS_LAT * 111320
    N = (lat - O[0]) * 110540
    return ((E * math.cos(TH) - N * math.sin(TH)) * 0.2, -(E * math.sin(TH) + N * math.cos(TH)) * 0.2)


# ------------------------------------------------------------ neighbourhood styles
def street_no(z):
    return 14 + (488 - z) / 15.87


def zone(x, z):
    """What a place is built of (Manhattan)."""
    if B != 'manhattan':
        return 'midrise'
    n = street_no(z)
    if z > 1000:
        return 'tower'  # Financial District
    if z > 860:
        return 'midrise'  # Tribeca, Chinatown
    if z > 500:
        return 'brownstone' if x < 60 else 'midrise'  # West Village / SoHo, LES
    if n < 30:
        return 'tower' if (x < -150 and n > 26) else 'midrise'  # Hudson Yards / Chelsea, Flatiron
    if n <= 59:
        return 'tower' if x > -120 else 'midrise'  # Midtown / Hell's Kitchen
    if n <= 110:
        return 'midrise'  # Upper West & East Side
    if n <= 155:
        return 'midrise' if x > 150 else 'brownstone'  # East Harlem / Harlem
    return 'midrise'  # Washington Heights, Inwood


# Building types: (cells across, cells deep), height range (m), weight.
STYLES = {
    'tower': {
        'shapes': [((3, 3), 4), ((2, 3), 3), ((3, 2), 3), ((2, 2), 3), ((2, 1), 1), ((1, 1), 0.6)],
        'depth': 99,  # fill the whole block
        'kinds': [('glass', 5), ('office', 4), ('deco', 1.2)],
    },
    'midrise': {
        'shapes': [((2, 2), 4), ((3, 2), 2), ((2, 3), 2), ((2, 1), 2), ((1, 2), 2), ((1, 1), 1)],
        'depth': 3,  # deeper than a row: uptown blocks are mostly built, with a courtyard
        'kinds': [('apartment', 5), ('prewar', 3), ('walkup', 3)],
    },
    'brownstone': {
        'shapes': [((1, 2), 5), ((1, 1), 3), ((2, 2), 1)],
        'depth': 2,
        'kinds': [('brownstone', 6), ('walkup', 2)],
    },
}
HEIGHTS = {'glass': (55, 150), 'office': (40, 95), 'deco': (70, 130), 'apartment': (22, 38), 'prewar': (26, 44), 'walkup': (14, 22), 'brownstone': (11, 15)}
WALLS = {
    'glass': ['#7fb8d6', '#93c9e0', '#6aa6c8', '#a7d3e6', '#8bb0cf'],
    'office': ['#d9cdb6', '#c9bfae', '#e3d7c2', '#b9c3cf', '#d4c4a8'],
    'deco': ['#ecdcbc', '#e2cfa8', '#f0e3c8'],
    'apartment': ['#e8b48f', '#d99a7a', '#f2c9a0', '#c98d6f', '#e6c39b', '#bfa58a'],
    'prewar': ['#efe3cc', '#e6d5b6', '#f3e8d2', '#dcc8a7'],
    'walkup': ['#c8644a', '#d77a55', '#b9563f', '#e09066', '#c96f5b'],
    'brownstone': ['#9a5f45', '#a96b4e', '#8c5540', '#b77a58', '#c88f7a', '#a6c3a0', '#e6b3a8', '#9fbfdc'],
}
ROOFS = {
    'glass': ['#5f7f99', '#6d8ea8', '#557089'],
    'office': ['#8d8f96', '#9a9ca3', '#7f828a'],
    'deco': ['#a9a294', '#b5ad9c'],
    # Cartoon roofs (Peter wants colour): terracotta, teal, slate, mint, plum…
    'apartment': ['#d9775b', '#4fa3a5', '#7f8fb3', '#c7a36a', '#9b8fb5', '#e0a35b'],
    'prewar': ['#b9a27f', '#8fa7b3', '#c9876b', '#a7b48a'],
    'walkup': ['#d26b55', '#e08a4f', '#5aa0a0', '#8b7bb0', '#c55e5e'],
    'brownstone': ['#b0644c', '#7a8fae', '#5f9f8f', '#c48a52', '#a5677f', '#8a9a6a'],
}


def pick(rng, items):
    tot = sum(w for _, w in items)
    t = rng.random() * tot
    for v, w in items:
        t -= w
        if t <= 0:
            return v
    return items[-1][0]


def polys_of(g):
    if g.is_empty:
        return []
    if isinstance(g, (MultiPolygon,)) or g.geom_type == 'GeometryCollection':
        return [q for q in g.geoms if q.geom_type == 'Polygon' and not q.is_empty]
    return [g] if g.geom_type == 'Polygon' else []


def block_angle(poly):
    """The block's own grid direction (degrees, -45..45): the direction most
    of its edge length runs in (so a block clipped by the shore or Broadway
    still lines up with its streets)."""
    votes = {}
    c = list(poly.exterior.coords)
    for i in range(len(c) - 1):
        (x0, z0), (x1, z1) = c[i], c[i + 1]
        L = math.hypot(x1 - x0, z1 - z0)
        if L < 4:
            continue
        a = math.degrees(math.atan2(z1 - z0, x1 - x0)) % 90
        if a > 45:
            a -= 90
        k = round(a / 3) * 3
        votes[k] = votes.get(k, 0) + L
    if not votes:
        return 0.0
    best = max(votes, key=votes.get)
    # Refine: length-weighted mean of edges within 3 degrees of the winner.
    num = den = 0.0
    for i in range(len(c) - 1):
        (x0, z0), (x1, z1) = c[i], c[i + 1]
        L = math.hypot(x1 - x0, z1 - z0)
        a = math.degrees(math.atan2(z1 - z0, x1 - x0)) % 90
        if a > 45:
            a -= 90
        if L >= 4 and abs(a - best) <= 3:
            num += a * L
            den += L
    return num / den if den else float(best)


# ------------------------------------------------------------ the blocks
buildings, lawns, trees, lamps, lakes, paths = [], [], [], [], [], []
check_fail = 0

for bi, blk in enumerate(M['blocks']):
    poly = Polygon(blk['poly'], blk.get('holes', [])).buffer(0)
    rng = random.Random(f"{B}-{blk['id']}")
    if blk['kind'] == 'park':
        continue  # parks are done below
    build = poly.buffer(-SIDEWALK, join_style=1)
    if build.is_empty:
        continue
    cx, cz = poly.centroid.x, poly.centroid.y
    st = STYLES[zone(cx, cz)]
    ang = block_angle(poly)
    # Work in the block's own frame (turned so its grid is axis-aligned).
    local = affinity.rotate(build, -ang, origin=(cx, cz))
    x0, z0, x1, z1 = local.bounds
    nx, nz = int((x1 - x0) // CELL), int((z1 - z0) // CELL)
    # Centre the grid in the block so the leftovers are even on both sides.
    ox = x0 + ((x1 - x0) - nx * CELL) / 2
    oz = z0 + ((z1 - z0) - nz * CELL) / 2
    inside = {}
    from shapely.prepared import prep
    lp = prep(local)
    for i in range(nx):
        for j in range(nz):
            c = box(ox + i * CELL, oz + j * CELL, ox + (i + 1) * CELL, oz + (j + 1) * CELL)
            if lp.contains(c):
                inside[(i, j)] = True
    # Depth of each cell from the street (1 = on the street).
    depth = {}
    frontier = [k for k in inside if any((k[0] + di, k[1] + dj) not in inside for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    for k in frontier:
        depth[k] = 1
    d = 1
    while frontier:
        nxt = []
        for (i, j) in frontier:
            for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                k = (i + di, j + dj)
                if k in inside and k not in depth:
                    depth[k] = d + 1
                    nxt.append(k)
        frontier = nxt
        d += 1
    # Lay buildings: street cells first, going round the block.
    taken = set()
    order = sorted(depth, key=lambda k: (depth[k], math.atan2(k[1] - nz / 2, k[0] - nx / 2)))
    for (i, j) in order:
        if (i, j) in taken or depth[(i, j)] > st['depth']:
            continue
        shapes = [s for s, w in st['shapes']]
        rng.shuffle(shapes)
        shapes.sort(key=lambda s: -dict(st['shapes'])[s] * rng.random() - s[0] * s[1] * 0.3)
        placed = None
        for (w, h) in shapes + [(1, 1)]:
            # Try every placement of this shape that covers cell (i, j).
            for ai in range(w):
                for aj in range(h):
                    cells = [(i - ai + a, j - aj + b) for a in range(w) for b in range(h)]
                    if all(c in inside and c not in taken and depth[c] <= st['depth'] for c in cells):
                        placed = cells
                        break
                if placed:
                    break
            if placed:
                break
        if not placed:
            continue  # nothing fits here: it stays lawn
        taken.update(placed)
        ii = [c[0] for c in placed]
        jj = [c[1] for c in placed]
        kind = pick(rng, st['kinds'])
        # Detached types sit back a little from their lot lines (variety);
        # brownstones and walk-ups stay wall to wall like real row houses.
        sb = [0.0, 0.0, 0.0, 0.0] if kind in ('brownstone', 'walkup') else [rng.uniform(0, 2.2) for _ in range(4)]
        r = box(ox + min(ii) * CELL + GAP + sb[0], oz + min(jj) * CELL + GAP + sb[1], ox + (max(ii) + 1) * CELL - GAP - sb[2], oz + (max(jj) + 1) * CELL - GAP - sb[3])
        world = affinity.rotate(r, ang, origin=(cx, cz))
        if not poly.buffer(-SIDEWALK + 0.01).contains(world):
            check_fail += 1
            continue
        lo, hi = HEIGHTS[kind]
        size = len(placed)
        h = lo + (hi - lo) * (rng.random() ** 1.3)
        if kind in ('glass', 'office', 'deco'):
            h *= 0.75 + 0.1 * min(size, 9) / 3  # bigger footprint, taller tower
        # Which way it faces: the street side nearest to it.
        minj = min(depth[c] for c in placed)
        buildings.append({
            'p': [[round(x, 2), round(z, 2)] for x, z in list(world.exterior.coords)[:-1]],
            'h': round(h, 1),
            'k': kind,
            'w': rng.choice(WALLS[kind]),
            'r': rng.choice(ROOFS[kind]),
            'b': blk['id'],
        })
    # Lawn: everything inside the sidewalk that isn't a building.
    built = unary_union([affinity.rotate(box(ox + c[0] * CELL, oz + c[1] * CELL, ox + (c[0] + 1) * CELL, oz + (c[1] + 1) * CELL), ang, origin=(cx, cz)) for c in taken]) if taken else Polygon()
    green = build.difference(built.buffer(0.01))
    for g in polys_of(green):
        g2 = g.buffer(-0.6, join_style=1).buffer(0.6, join_style=1)
        for q in polys_of(g2):
            if q.area < 12:
                continue
            lawns.append([[[round(x, 1), round(z, 1)] for x, z in list(q.exterior.coords)[:-1]]] + [[[round(x, 1), round(z, 1)] for x, z in list(h.coords)[:-1]] for h in q.interiors])
            # Trees on lawns that have room for them.
            inner = q.buffer(-3.2)
            if inner.is_empty:
                continue
            n = int(q.area / 160)
            pts = []
            minx, minz, maxx, maxz = inner.bounds
            pin = prep(inner)
            for _ in range(n * 6):
                if len(pts) >= n:
                    break
                p = (rng.uniform(minx, maxx), rng.uniform(minz, maxz))
                if pin.contains(Point(p)) and all(math.dist(p, t) > 6.5 for t in pts):
                    pts.append(p)
            for p in pts:
                trees.append([round(p[0], 1), round(p[1], 1), round(rng.uniform(2.6, 3.8), 1), rng.choice([0, 0, 0, 0, 1, 1, 0, 0, 1, 2])])
    # Street trees and lamps along the sidewalk (2.3 m in from the kerb).
    ring = poly.exterior
    walk = LineString(ring.coords).parallel_offset(2.3, 'left' if Polygon(ring).exterior.is_ccw else 'right', join_style=2)
    walk_lines = [walk] if walk.geom_type == 'LineString' else list(getattr(walk, 'geoms', []))
    corners = [Point(p) for p in poly.exterior.coords]
    for wl in walk_lines:
        L = wl.length
        t = 9.0
        k = 0
        while t < L - 6:
            p = wl.interpolate(t)
            if poly.buffer(-1.0).contains(p) and min(p.distance(c) for c in corners) > 7:
                if k % 4 == 3:
                    lamps.append([round(p.x, 1), round(p.y, 1)])
                else:
                    trees.append([round(p.x, 1), round(p.y, 1), 2.2, 3])
            t += 11.0
            k += 1

# ------------------------------------------------------------ parks, plazas, waterfront
def scatter(poly, spacing, rng, rmin, rmax, kinds, avoid=None, edge=3.0):
    inner = poly.buffer(-edge)
    if inner.is_empty:
        return
    from shapely.prepared import prep
    pin = prep(inner)
    av = prep(avoid) if avoid is not None and not avoid.is_empty else None
    minx, minz, maxx, maxz = inner.bounds
    # Jittered grid (even cover, no clumps or bald patches).
    z = minz
    row = 0
    while z < maxz:
        x = minx + (spacing / 2 if row % 2 else 0)
        while x < maxx:
            p = Point(x + rng.uniform(-spacing * 0.35, spacing * 0.35), z + rng.uniform(-spacing * 0.35, spacing * 0.35))
            if pin.contains(p) and not (av and av.contains(p)) and rng.random() < 0.82:
                trees.append([round(p.x, 1), round(p.y, 1), round(rng.uniform(rmin, rmax), 1), rng.choice(kinds)])
            x += spacing
        z += spacing * 0.87
        row += 1


rng = random.Random(f'{B}-parks')
LAKES = {
    'manhattan': [
        # Central Park: the Reservoir, the Lake, Harlem Meer, the Pond (lat, lon, rx, rz game m)
        (40.7855, -73.9625, 34, 52), (40.7770, -73.9705, 30, 18), (40.7968, -73.9520, 18, 12), (40.7660, -73.9745, 14, 9),
    ],
}
for blk in M['blocks']:
    if blk['kind'] != 'park':
        continue
    poly = Polygon(blk['poly'], blk.get('holes', [])).buffer(0)
    water = []
    for lat, lon, rx, rz in LAKES.get(B, []):
        x, z = proj(lat, lon)
        if poly.contains(Point(x, z)):
            e = affinity.scale(Point(x, z).buffer(1, 32), rx, rz)
            e = e.intersection(poly.buffer(-12))
            if not e.is_empty:
                water.append(e)
                lakes.append([[round(a, 1), round(b, 1)] for a, b in list(e.exterior.coords)[:-1]])
    wat = unary_union(water) if water else None
    # Park paths: a loop drive inside the edge.
    loop = poly.buffer(-14, join_style=1)
    for q in polys_of(loop):
        if q.area > 4000:
            paths.append([[round(x, 1), round(z, 1)] for x, z in list(q.exterior.coords)[:-1]])
    scatter(poly, 13.0, rng, 3.0, 4.6, [0, 0, 1, 0, 1, 0, 0, 0, 1, 2], avoid=(wat.buffer(4) if wat else None), edge=4)
for pz in M['plazas']:
    poly = Polygon(pz['poly'])
    scatter(poly, 14.0, rng, 2.4, 3.0, [0, 1], edge=3)
for rings in M['waterfront']:
    poly = Polygon(rings[0], rings[1:]).buffer(0)
    for q in polys_of(poly):
        scatter(q, 15.0, rng, 2.6, 3.6, [0, 0, 1], edge=2.5)

# ------------------------------------------------------------ crosswalks
# Zebra crossings on every road where it meets another, set back from the
# junction. Each is a short line across the road (the renderer draws it
# as white stripes).
crossings = []
road_lines = [(r['id'], LineString(r['pts']), r['w']) for r in M['roads']]
road_lines += [(f'shore{i}', LineString(l), M['shoreRoad']['w']) for i, l in enumerate(M['shoreRoad']['loops'])]
seen = []
for i in range(len(road_lines)):
    for j in range(i + 1, len(road_lines)):
        ida, la, wa = road_lines[i]
        idb, lb, wb = road_lines[j]
        hit = la.intersection(lb)
        pts = [hit] if hit.geom_type == 'Point' else [g for g in getattr(hit, 'geoms', []) if g.geom_type == 'Point']
        for P in pts:
            if any(P.distance(q) < 8 for q in seen):
                continue
            seen.append(P)
            for line, w, other_w in ((la, wa, wb), (lb, wb, wa)):
                d0 = line.project(P)
                for sgn in (-1, 1):
                    d = d0 + sgn * (other_w / 2 + 3.2)
                    if d < 0 or d > line.length:
                        continue
                    c = line.interpolate(d)
                    c2 = line.interpolate(min(line.length, max(0, d + 0.5)))
                    dx, dz = c2.x - c.x, c2.y - c.y
                    L = math.hypot(dx, dz) or 1
                    nx, nz = -dz / L, dx / L
                    half = w / 2 - 0.8
                    crossings.append([round(c.x - nx * half, 1), round(c.y - nz * half, 1), round(c.x + nx * half, 1), round(c.y + nz * half, 1)])

out = {
    'about': f'{B}, layer 3: buildings, lawns, trees, lamps (scripts/map/build-city.py). Game metres.',
    'buildings': buildings,
    'lawns': lawns,
    'trees': trees,
    'lamps': lamps,
    'lakes': lakes,
    'paths': paths,
    'crossings': crossings,
}
json.dump(out, open(ROOT / 'src' / 'data' / 'map' / f'{B}-city.json', 'w'), separators=(',', ':'))
print(f'crossings {len(crossings)}  buildings {len(buildings)}  lawns {len(lawns)}  trees {len(trees)}  lamps {len(lamps)}  lakes {len(lakes)}  outside-check failures {check_fail}')
