"""
build-manhattan.py — LAYER 2 of the new 2D map: Manhattan's ROADS, and the
BLOCKS they leave between them.

The idea (Peter, 2026-10-12): land first, then roads, and the blocks are
simply whatever land is left between the roads. So blocks by the water
follow the shore instead of being forced into rectangles, and the grid can
be as uneven as the real one.

  1. LAND — the real Manhattan outline (NYC Open Data borough boundary),
     cleaned: piers and slips are taken off, little inlets filled, and the
     shoreline smoothed so it reads well at game size.
  2. SHORE ROAD — one smooth loop a little way in from the water (the
     West Side Highway / FDR Drive / Harlem River Drive of the game). The
     strip between it and the water is the waterfront (promenade, parks).
  3. MAJOR ROADS — a hand-picked list of real roads (ROADS below). Their
     shape comes from the real street centre lines (extract-streets.py),
     smoothed; each road's ends are carried on until they meet another road
     or the shore road, so there are no dead ends or gaps.
  4. BLOCKS — the land inside the shore road minus every road. Corners are
     rounded a little. Leftover slivers (where Broadway crosses at an angle)
     become small plazas, like the real ones.

Output: src/data/map/manhattan.json (all in game metres, x = east, z =
south) and preview pictures in test-results/map/.

  pip install shapely pillow
  python3 scripts/map/build-manhattan.py
"""
import json, math, pathlib, sys
from shapely.geometry import LineString, Point, Polygon, MultiPolygon, mapping
from shapely.ops import unary_union, nearest_points
from shapely import affinity

ROOT = pathlib.Path(__file__).resolve().parents[2]
HERE = pathlib.Path(__file__).parent
STREETS = json.load(open(HERE / 'src' / 'streets-all.json'))

# --------------------------------------------------------------- settings
SHORE = 22.0  # shore road centre line, metres in from the (smoothed) water's edge
RING_W = 16.0  # shore road width
CORNER = 5.0  # block corner rounding radius
MIN_BLOCK = 9000.0  # smaller pieces become plazas (m²)

# The major roads. `names` = real street names to take the shape from (in
# order along the road); `axis` = which way the road runs ('z' north–south,
# 'x' east–west), so the points can be sorted and averaged into one smooth
# line; `w` = width (m); optional `range` = keep only this stretch of the
# axis (game metres).
ROADS = [
    # ---- north–south
    {'id': 'broadway', 'name': 'Broadway', 'names': ['BROADWAY'], 'axis': 'z', 'w': 13, 'kind': 'avenue'},
    # 10th Ave only below 59th: further north it runs right beside Broadway
    # and would leave thin strips of blocks.
    {'id': 'tenth', 'name': '10th Ave', 'names': ['10 AVE'], 'axis': 'z', 'w': 12, 'kind': 'avenue', 'range': (-240, 480)},
    {'id': 'cpw', 'name': 'Central Park West', 'names': ['8 AVE', 'CENTRAL PARK W', 'FREDERICK DOUGLASS BLVD'], 'axis': 'z', 'w': 12, 'kind': 'avenue', 'range': (-1720, 470)},
    {'id': 'fifth', 'name': '5th Ave', 'names': ['5 AVE'], 'axis': 'z', 'w': 13, 'kind': 'avenue'},
    # The Bowery carries on south to the shore road (it really runs on to the Brooklyn Bridge).
    {'id': 'third', 'name': '3rd Ave', 'names': ['BOWERY', '3 AVE'], 'axis': 'z', 'w': 12, 'kind': 'avenue', 'extend': 260.0},
    {'id': 'stnicholas', 'name': 'St Nicholas Ave', 'names': ['ST NICHOLAS AVE'], 'axis': 'z', 'w': 11, 'kind': 'avenue', 'range': (-2300, -1100)},
    # ---- east–west
    {'id': 'dyckman', 'name': 'Dyckman St', 'names': ['DYCKMAN ST'], 'axis': 'x', 'w': 11, 'kind': 'street'},
    {'id': 's181', 'name': 'W 181st St', 'names': ['W 181 ST'], 'axis': 'x', 'w': 11, 'kind': 'street'},
    {'id': 's155', 'name': 'W 155th St', 'names': ['W 155 ST'], 'axis': 'x', 'w': 11, 'kind': 'street'},
    {'id': 's125', 'name': '125th St', 'names': ['W 125 ST', 'E 125 ST'], 'axis': 'x', 'w': 12, 'kind': 'street'},
    {'id': 's110', 'name': '110th St', 'names': ['CATHEDRAL PKWY', 'CENTRAL PARK N', 'E 110 ST'], 'axis': 'x', 'w': 12, 'kind': 'street'},
    {'id': 'w86', 'name': 'W 86th St', 'names': ['W 86 ST'], 'axis': 'x', 'w': 11, 'kind': 'street'},
    {'id': 'e86', 'name': 'E 86th St', 'names': ['E 86 ST'], 'axis': 'x', 'w': 11, 'kind': 'street'},
    {'id': 's59', 'name': '59th St', 'names': ['W 59 ST', 'CENTRAL PARK S', 'E 59 ST'], 'axis': 'x', 'w': 12, 'kind': 'street'},
    {'id': 's42', 'name': '42nd St', 'names': ['W 42 ST', 'E 42 ST'], 'axis': 'x', 'w': 12, 'kind': 'street'},
    {'id': 's23', 'name': '23rd St', 'names': ['W 23 ST', 'E 23 ST'], 'axis': 'x', 'w': 11, 'kind': 'street'},
    {'id': 's14', 'name': '14th St', 'names': ['W 14 ST', 'E 14 ST'], 'axis': 'x', 'w': 12, 'kind': 'street'},
    {'id': 'houston', 'name': 'Houston St', 'names': ['W HOUSTON ST', 'E HOUSTON ST'], 'axis': 'x', 'w': 12, 'kind': 'street'},
    {'id': 'delancey', 'name': 'Delancey St', 'names': ['DELANCEY ST'], 'axis': 'x', 'w': 12, 'kind': 'street'},
    {'id': 'canal', 'name': 'Canal St', 'names': ['CANAL ST'], 'axis': 'x', 'w': 12, 'kind': 'street'},
    {'id': 'chambers', 'name': 'Chambers St', 'names': ['CHAMBERS ST'], 'axis': 'x', 'w': 11, 'kind': 'street'},
    {'id': 'fulton', 'name': 'Fulton St', 'names': ['FULTON ST'], 'axis': 'x', 'w': 11, 'kind': 'street'},
]


# --------------------------------------------------------------- helpers
def chaikin(pts, passes=2, closed=False):
    for _ in range(passes):
        out = [] if closed else [pts[0]]
        n = len(pts)
        rng = range(n) if closed else range(n - 1)
        for i in rng:
            a, b = pts[i], pts[(i + 1) % n]
            out.append((a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25))
            out.append((a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75))
        if not closed:
            out.append(pts[-1])
        pts = out
    return pts


def smooth_poly(poly, simplify=2.0, passes=3):
    """Smooth every ring of a polygon (Chaikin) after simplifying."""
    def ring(coords):
        c = list(LineString(coords).simplify(simplify).coords)[:-1]
        return chaikin(c, passes, closed=True)
    polys = poly.geoms if isinstance(poly, MultiPolygon) else [poly]
    out = [Polygon(ring(p.exterior.coords), [ring(h.coords) for h in p.interiors if Polygon(h).area > 400]) for p in polys]
    return unary_union([p.buffer(0) for p in out])


def biggest(geom):
    if isinstance(geom, MultiPolygon):
        return max(geom.geoms, key=lambda g: g.area)
    return geom


def fit_road(spec):
    """One smooth centre line from all real segments of a road."""
    pts = []
    for n in spec['names']:
        for s in STREETS.get(n, {'segs': []})['segs']:
            pts += s
    if not pts:
        raise SystemExit(f"no data for {spec['id']}")
    ax = 1 if spec['axis'] == 'z' else 0  # index of the running axis
    other = 1 - ax
    lo, hi = spec.get('range', (-1e9, 1e9))
    pts = [p for p in pts if lo <= p[ax] <= hi]
    BIN = 10.0
    bins = {}
    for p in pts:
        bins.setdefault(round(p[ax] / BIN), []).append(p[other])
    keys = sorted(bins)
    line = []
    for k in keys:
        vals = sorted(bins[k])
        med = vals[len(vals) // 2]
        line.append((k * BIN, med))
    # Moving average across bins (irons out jogs and divided roadways).
    # Cross streets get more smoothing: their real jogs (Houston, Canal)
    # look like wobbles at game size.
    k = spec.get('smooth', 3 if spec['axis'] == 'z' else 8)
    sm = []
    for i in range(len(line)):
        win = line[max(0, i - k): i + k + 1]
        sm.append((line[i][0], sum(v for _, v in win) / len(win)))
    coords = [(v, a) if ax == 1 else (a, v) for a, v in sm]
    ls = LineString(coords).simplify(1.5 if spec['axis'] == 'z' else 3.0)
    return LineString(chaikin(list(ls.coords), 3))


def extend_end(line, at_start, others, max_len=90.0):
    """Carry a road end on in its own direction until it meets another road."""
    c = list(line.coords)
    a, b = (c[1], c[0]) if at_start else (c[-2], c[-1])
    dx, dz = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dz) or 1
    far = (b[0] + dx / L * max_len, b[1] + dz / L * max_len)
    ray = LineString([b, far])
    hit = ray.intersection(others)
    if hit.is_empty:
        return line, False
    pts = [hit] if hit.geom_type == 'Point' else [g for g in getattr(hit, 'geoms', []) if g.geom_type == 'Point'] or [Point(hit.coords[0])]
    p = min(pts, key=lambda q: q.distance(Point(b)))
    # Overshoot a little so the road surfaces overlap cleanly.
    d = p.distance(Point(b)) + 2.0
    end = (b[0] + dx / L * d, b[1] + dz / L * d)
    c = [end] + c if at_start else c + [end]
    return LineString(c), True


# --------------------------------------------------------------- 1. land
geo = json.load(open(ROOT / 'scripts' / 'geo-src' / 'nyc-boroughs.geojson'))
O = (40.758, -73.9855)
TH = math.radians(29)
COS_LAT = math.cos(math.radians(O[0]))


def proj(lon, lat):
    E = (lon - O[1]) * COS_LAT * 111320
    N = (lat - O[0]) * 110540
    return ((E * math.cos(TH) - N * math.sin(TH)) * 0.2, -(E * math.sin(TH) + N * math.cos(TH)) * 0.2)


feat = next(f for f in geo['features'] if 'manhattan' in str(f['properties']).lower())
polys = feat['geometry']['coordinates'] if feat['geometry']['type'] == 'MultiPolygon' else [feat['geometry']['coordinates']]
rings = sorted((Polygon([proj(*p[:2]) for p in poly[0]]).buffer(0) for poly in polys), key=lambda g: -g.area)
raw_land = rings[0]
# Piers and slips off (opening), small inlets filled (closing), then smooth.
land = raw_land.buffer(-9, join_style=1).buffer(9, join_style=1)
land = biggest(land.buffer(14, join_style=1).buffer(-14, join_style=1))
land = smooth_poly(land, 2.5, 3)
islands = []
for name, g in [('Randall’s Island', rings[1]), ('Governors Island', rings[2]), ('Roosevelt Island', rings[3])]:
    gi = biggest(g.buffer(-4).buffer(4))
    islands.append({'name': name, 'poly': smooth_poly(gi, 2.0, 3)})

# --------------------------------------------------------------- 2. shore road
inner = land.buffer(-SHORE, join_style=1)
# Ease the loop: no sharp wiggles, no narrow necks.
inner = biggest(inner.buffer(-35, join_style=1).buffer(35, join_style=1))
inner = biggest(inner.buffer(45, join_style=1).buffer(-45, join_style=1))
inner = smooth_poly(inner, 3.0, 3)
ring_line = LineString(list(inner.exterior.coords))

# --------------------------------------------------------------- 3. major roads
def trim_dead(ln, w, others):
    """Cut a road back to its last crossing at any end that leads nowhere."""
    for _ in range(2):
        c = list(ln.coords)
        hits = ln.intersection(others)
        ds = sorted(ln.project(g) for g in (getattr(hits, 'geoms', None) or [hits]) if not g.is_empty for g in [g.centroid])
        if not ds:
            return ln
        L = ln.length
        a, b = 0.0, L
        if Point(c[0]).distance(others) > 3:
            a = max(0.0, ds[0])
        if Point(c[-1]).distance(others) > 3:
            b = min(L, ds[-1])
        if a > 0 or b < L:
            from shapely.ops import substring
            ln = substring(ln, a, b)
    return ln


lines = {}
for spec in ROADS:
    ls = fit_road(spec).intersection(inner.buffer(40))
    if ls.geom_type == 'MultiLineString':
        ls = max(ls.geoms, key=lambda g: g.length)
    lines[spec['id']] = ls
# Carry ends on to the next road (twice, so a road ending on another
# that was itself extended still connects).
report = []
for _ in range(2):
    for spec in ROADS:
        rid = spec['id']
        others = unary_union([ring_line] + [l for k, l in lines.items() if k != rid])
        ln = lines[rid]
        for at_start in (True, False):
            c = list(ln.coords)
            endp = Point(c[0] if at_start else c[-1])
            if endp.distance(others) < 1.0:
                continue
            ln, ok = extend_end(ln, at_start, others, spec.get('extend', 90.0))
        lines[rid] = ln
# Roads stop at the shore road (no stubs into the waterfront) …
for spec in ROADS:
    ln = lines[spec['id']].intersection(inner.buffer(3))
    if ln.geom_type == 'MultiLineString':
        ln = max(ln.geoms, key=lambda g: g.length)
    lines[spec['id']] = ln
# … and an end that still leads nowhere is cut back to its last crossing.
for _ in range(2):
    for spec in ROADS:
        others = unary_union([ring_line] + [l for k, l in lines.items() if k != spec['id']])
        lines[spec['id']] = trim_dead(lines[spec['id']], spec['w'], others)
for spec in ROADS:
    ln = lines[spec['id']]
    others = unary_union([ring_line] + [l for k, l in lines.items() if k != spec['id']])
    for e in (ln.coords[0], ln.coords[-1]):
        dgap = Point(e).distance(others)
        if dgap > 5:
            report.append(f"dead end: {spec['name']} at ({e[0]:.0f}, {e[1]:.0f}) gap {dgap:.0f} m")

# Round ends: where two roads meet at an L, the outer corner is filled in.
road_polys = [lines[s['id']].buffer(s['w'] / 2, cap_style=1, join_style=1) for s in ROADS]
ring_poly = ring_line.buffer(RING_W / 2, join_style=1)
streets = unary_union(road_polys)
all_roads = unary_union([streets, ring_poly]).intersection(land)

# --------------------------------------------------------------- 4. blocks
core = inner.buffer(-RING_W / 2, join_style=1)
pieces = core.difference(streets)
pieces = list(pieces.geoms) if isinstance(pieces, MultiPolygon) else [pieces]
blocks, plazas = [], []
for p in pieces:
    r = p.buffer(-CORNER, join_style=1).buffer(CORNER, join_style=1)
    if r.is_empty:
        continue
    for q in (r.geoms if isinstance(r, MultiPolygon) else [r]):
        (blocks if q.area >= MIN_BLOCK else plazas).append(q)
# North to south, then west to east, so ids read like a book.
blocks.sort(key=lambda g: (round(g.centroid.y / 60), g.centroid.x))
# Central Park: the block holding the park's middle.
CP = Point(30, -620)


def kind_of(b):
    if b.contains(CP):
        return 'park'
    # Long thin strips between Broadway and the Hudson (UWS, Harlem) are
    # Riverside Park, as in real life.
    r = b.minimum_rotated_rectangle
    c = list(r.exterior.coords)
    sides = sorted([math.dist(c[0], c[1]), math.dist(c[1], c[2])])
    if sides[0] < 75 and sides[1] > 2.4 * sides[0] and b.centroid.x < -150:
        return 'park'
    return 'city'
waterfront = land.difference(inner.buffer(RING_W / 2, join_style=1))


def rnd(poly):
    polys = poly.geoms if isinstance(poly, MultiPolygon) else [poly]
    return [[[round(x, 1), round(z, 1)] for x, z in list(p.exterior.coords)[:-1]] for p in polys]


out = {
    'about': 'Manhattan, layer 2: land, roads and blocks (scripts/map/build-manhattan.py). Game metres, x = east, z = south.',
    'land': rnd(land),
    'islands': [{'name': i['name'], 'poly': rnd(i['poly'])} for i in islands],
    'waterfront': rnd(waterfront),
    'shoreRoad': {'w': RING_W, 'pts': [[round(x, 1), round(z, 1)] for x, z in list(ring_line.coords)]},
    'roads': [{'id': s['id'], 'name': s['name'], 'kind': s['kind'], 'w': s['w'], 'pts': [[round(x, 1), round(z, 1)] for x, z in lines[s['id']].coords]} for s in ROADS],
    'roadSurface': rnd(all_roads),
    'blocks': [{'id': f'm{i + 1}', 'kind': kind_of(b), 'area': round(b.area), 'center': [round(b.centroid.x, 1), round(b.centroid.y, 1)], 'poly': rnd(b)[0]} for i, b in enumerate(blocks)],
    'plazas': [{'poly': rnd(p)[0], 'area': round(p.area)} for p in plazas],
}
dst = ROOT / 'src' / 'data' / 'map'
dst.mkdir(parents=True, exist_ok=True)
json.dump(out, open(dst / 'manhattan.json', 'w'), separators=(',', ':'))

areas = sorted(b.area for b in blocks)
print(f"blocks {len(blocks)}  plazas {len(plazas)}  block area min {areas[0]:.0f} median {areas[len(areas)//2]:.0f} max {areas[-1]:.0f}")
for r in report:
    print(r)
