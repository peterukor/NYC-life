"""
build-borough.py — LAYER 2 of the new 2D map: a borough's ROADS, and the
BLOCKS they leave between them.

The idea (Peter, 2026-10-12): land first, then roads, and the blocks are
simply whatever land is left between the roads. So blocks by the water
follow the shore instead of being forced into rectangles, and the grid can
be as uneven as the real one.

  1. LAND — the real borough outline (NYC Open Data borough boundary),
     cleaned: piers and slips are taken off, little inlets filled, and the
     shoreline smoothed so it reads well at game size.
  2. SHORE ROAD — one smooth loop a little way in from the edge (the West
     Side Highway / FDR Drive / Belt Parkway of the game). The strip between
     it and the water is the waterfront (promenade, parks).
  3. MAJOR ROADS — a hand-picked list of real roads per borough
     (scripts/map/boroughs.py). Their shape comes from the real street
     centre lines (extract-streets.py), smoothed; each road's ends are
     carried on until they meet another road or the shore road.
  4. BLOCKS — the land inside the shore road minus every road, corners
     rounded. Small and odd-shaped blocks are merged into a neighbour (the
     road between them goes), then everything is worked out again.

Output: src/data/map/<borough>.json (game metres, x = east, z = south).

  pip install shapely pillow
  python3 scripts/map/build-borough.py manhattan
  python3 scripts/map/preview-borough.py manhattan
"""
import json, math, pathlib, sys
from shapely.geometry import LineString, Point, Polygon, MultiPolygon
from shapely.ops import unary_union

ROOT = pathlib.Path(__file__).resolve().parents[2]
HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from boroughs import BOROUGHS  # noqa: E402

BOROUGH = sys.argv[1] if len(sys.argv) > 1 else 'manhattan'
CFG = BOROUGHS[BOROUGH]
STREETS = json.load(open(HERE / 'src' / CFG['streets']))

# --------------------------------------------------------------- settings
SHORE = CFG.get('shore', 22.0)  # shore road centre line, metres in from the (smoothed) edge
RING_W = CFG.get('ringW', 16.0)  # shore road width
CORNER = 5.0  # block corner rounding radius
MIN_BLOCK = 9000.0  # smaller pieces become plazas (m²)
ROADS = CFG['roads']


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


def polys_of(g):
    return list(g.geoms) if isinstance(g, MultiPolygon) else [g]


def keep_big(geom, min_area=40000.0):
    """Pieces of land big enough to hold a block; the biggest always stays."""
    ps = sorted(polys_of(geom), key=lambda g: -g.area)
    return unary_union([ps[0]] + [g for g in ps[1:] if g.area >= min_area])


def polys_of_lines(g):
    return [q for q in (getattr(g, 'geoms', None) or [g]) if q.geom_type == 'LineString' and not q.is_empty]


def biggest(geom):
    if isinstance(geom, MultiPolygon):
        return max(geom.geoms, key=lambda g: g.area)
    return geom


def fit_road(spec):
    """One smooth centre line from all real segments of a road."""
    pts = []
    for n in spec['names']:
        for sg in STREETS.get(n, {'segs': []})['segs']:
            pts += sg
    if not pts:
        raise SystemExit(f"no data for {spec['id']}")
    if 'box' in spec:  # keep only points in this game-space box (x0, z0, x1, z1)
        bx = spec['box']
        pts = [p for p in pts if bx[0] <= p[0] <= bx[2] and bx[1] <= p[1] <= bx[3]]
    lo, hi = spec.get('range', (-1e9, 1e9))
    axis = spec.get('axis', 'auto')
    if axis == 'auto':
        # Run along the road's own main direction (most Brooklyn roads are
        # neither north–south nor east–west in game space).
        mx = sum(p[0] for p in pts) / len(pts)
        mz = sum(p[1] for p in pts) / len(pts)
        sxx = sum((p[0] - mx) ** 2 for p in pts)
        szz = sum((p[1] - mz) ** 2 for p in pts)
        sxz = sum((p[0] - mx) * (p[1] - mz) for p in pts)
        ang = 0.5 * math.atan2(2 * sxz, sxx - szz)
    else:
        ang = math.pi / 2 if axis == 'z' else 0.0
        mx = mz = 0.0
    ca, sa = math.cos(ang), math.sin(ang)
    # (u along the road, v across it)
    uv = [((p[0] - mx) * ca + (p[1] - mz) * sa, -(p[0] - mx) * sa + (p[1] - mz) * ca, p) for p in pts]
    run = 1 if axis == 'z' else 0
    uv = [q for q in uv if lo <= (q[2][run] if axis != 'auto' else q[0]) <= hi]
    BIN = 10.0
    bins = {}
    for u, v, _ in uv:
        bins.setdefault(round(u / BIN), []).append(v)
    line = []
    for k in sorted(bins):
        vals = sorted(bins[k])
        line.append((k * BIN, vals[len(vals) // 2]))
    # Moving average across bins (irons out jogs and divided roadways).
    # Cross streets get more smoothing: their real jogs (Houston, Canal)
    # look like wobbles at game size.
    k = spec.get('smooth', 3 if axis == 'z' else 8)
    sm = []
    for i in range(len(line)):
        win = line[max(0, i - k): i + k + 1]
        sm.append((line[i][0], sum(v for _, v in win) / len(win)))
    coords = [(mx + u * ca - v * sa, mz + u * sa + v * ca) for u, v in sm]
    ls = LineString(coords).simplify(1.5 if axis == 'z' else 3.0)
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


feat = next(f for f in geo['features'] if CFG['geoName'] in str(f['properties']).lower())
polys = feat['geometry']['coordinates'] if feat['geometry']['type'] == 'MultiPolygon' else [feat['geometry']['coordinates']]
rings = sorted((Polygon([proj(*p[:2]) for p in poly[0]]).buffer(0) for poly in polys), key=lambda g: -g.area)
raw_land = rings[0]
# Piers and slips off (opening), small inlets filled (closing), then smooth.
land = raw_land.buffer(-9, join_style=1).buffer(9, join_style=1)
land = biggest(land.buffer(14, join_style=1).buffer(-14, join_style=1))
land = smooth_poly(land, 2.5, 3)
islands = []
for name, i in CFG.get('islands', []):
    g = rings[i]
    gi = biggest(g.buffer(-4).buffer(4))
    islands.append({'name': name, 'poly': smooth_poly(gi, 2.0, 3)})

# --------------------------------------------------------------- 2. shore road
inner = land.buffer(-SHORE, join_style=1)
# Ease the loop: no sharp wiggles, no narrow necks.
inner = keep_big(inner.buffer(-35, join_style=1).buffer(35, join_style=1))
inner = keep_big(inner.buffer(45, join_style=1).buffer(-45, join_style=1))
inner = keep_big(smooth_poly(inner, 3.0, 3))
# One loop per piece of land (Brooklyn's Bergen Beach hangs on by a neck).
ring_line = unary_union([LineString(list(g.exterior.coords)) for g in polys_of(inner)])

# --------------------------------------------------------------- 3. major roads
def trim_dead(ln, w, others):
    """Cut a road back to its last crossing at any end that leads nowhere."""
    for _ in range(2):
        if ln.geom_type != 'LineString' or ln.length < 1:
            return LineString([(0, 0), (0, 0.001)]) if ln.geom_type != 'LineString' else ln
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
    full = fit_road(spec)
    ls = full.intersection(inner.buffer(40))
    if '--verbose' in sys.argv:
        print(f"{spec['id']:14s} fitted {full.length:7.0f} m  on land {ls.length:7.0f} m")
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

# ---- park areas (Prospect Park…): roads stop at the park, a drive runs
# round its edge, and the inside is one park block.
PARK_AREAS = []
for name, pts in CFG.get('parkAreas', []):
    pa = Polygon([proj(lon, lat) for lat, lon in pts]).buffer(0)
    pa = smooth_poly(pa.buffer(20, join_style=1).buffer(-20, join_style=1), 2.0, 3).intersection(inner.buffer(-RING_W))
    pa = biggest(pa)
    if pa.is_empty or pa.area < 5000:
        continue
    core_line = inner.buffer(-RING_W / 2, join_style=1).boundary
    shore_park = pa.distance(core_line) < 45
    if shore_park:
        # A park near the water runs right down to the shore road (no thin
        # strip of land or second road squeezed in between).
        pa = biggest(unary_union([pa, pa.buffer(45, join_style=1).intersection(inner.buffer(-RING_W / 2, join_style=1))]))
    PARK_AREAS.append((name, pa))
    for k in list(lines):
        d = lines[k].difference(pa.buffer(-1))
        bits = sorted(polys_of_lines(d), key=lambda g: -g.length)
        if not bits:
            del lines[k]
            continue
        lines[k] = bits[0]
        # A road the park cuts in two carries on past it as a second piece.
        spec = next(r for r in ROADS if r['id'] == k)
        for j, extra in enumerate(bits[1:]):
            if extra.length > 60:
                nid = f"{k}~{j + 2}"
                ROADS.append({**spec, 'id': nid})
                lines[nid] = extra
                if k in CFG.get('keep', []):
                    CFG['keep'].append(nid)
    pid = 'park-' + name.lower().replace(' ', '-').replace('’', '')
    drive = LineString(list(pa.exterior.coords))
    if shore_park:
        drive = drive.difference(core_line.buffer(6))
    for j, piece in enumerate(polys_of_lines(drive) if drive.geom_type != 'LineString' else [drive]):
        if piece.length < 40:
            continue
        if shore_park:  # carry the drive's ends out to the shore road
            piece, _ = extend_end(piece, True, ring_line, 40.0)
            piece, _ = extend_end(piece, False, ring_line, 40.0)
        rid = pid if j == 0 else f'{pid}~{j + 1}'
        ROADS.append({'id': rid, 'name': name + ' Drive', 'w': 11, 'kind': 'street'})
        lines[rid] = piece
        CFG.setdefault('keep', []).append(rid)

# --------------------------------------------------------------- 4. blocks
core = inner.buffer(-RING_W / 2, join_style=1)
ring_poly = ring_line.buffer(RING_W / 2, join_style=1)
# Parks: any block holding one of these real points is a park.
PARK_PTS = [(n, Point(proj(lon, lat))) for n, lat, lon in CFG.get('parks', [])]
WIDTH = {s['id']: s['w'] for s in ROADS}
# From here on a road may be in several pieces.
parts = {k: [v] for k, v in lines.items()}


def street_surface(P=None):
    P = parts if P is None else P
    return unary_union([q.buffer(WIDTH[k] / 2, cap_style=1, join_style=1) for k, v in P.items() for q in v])


def make_blocks(P=None):
    """Blocks = the land inside the shore road minus every road, corners rounded."""
    out = []
    pc = core.difference(street_surface(P))
    for p in (pc.geoms if isinstance(pc, MultiPolygon) else [pc]):
        r = p.buffer(-CORNER, join_style=1).buffer(CORNER, join_style=1)
        out += [q for q in (r.geoms if isinstance(r, MultiPolygon) else [r]) if not r.is_empty and q.area > 50]
    return out


def compactness(g):
    return 4 * math.pi * g.area / (g.length ** 2)


def park_name(g):
    for n, p in PARK_PTS:
        if g.contains(p):
            return n
    for n, pa in PARK_AREAS:
        if g.representative_point().within(pa.buffer(2)) and 0.4 * pa.area < g.area < 1.6 * pa.area:
            return n
    return None


def is_park_strip(g):
    if park_name(g):
        return True
    if not CFG.get('riversideStrips'):
        return False
    r = g.minimum_rotated_rectangle
    c = list(r.exterior.coords)
    sd = sorted([math.dist(c[0], c[1]), math.dist(c[1], c[2])])
    return sd[0] < 75 and sd[1] > 2.4 * sd[0] and g.centroid.x < -150


def clean_parts(parts):
    """Cut back road pieces that lead nowhere; drop short leftover stubs."""
    for _ in range(3):
        for k in parts:
            keep = []
            for q in parts[k]:
                if q.is_ring:  # park drives are closed loops
                    keep.append(q)
                    continue
                others = unary_union([ring_line] + [o for kk, v in parts.items() for o in v if o is not q])
                t = trim_dead(q, WIDTH[k], others)
                ok = sum(Point(e).distance(others) < 5 for e in (t.coords[0], t.coords[-1]))
                if t.length > 32 and ok == 2:
                    keep.append(t)
            parts[k] = keep


# ---- 4b. merge small and odd-shaped blocks into a neighbour (Peter,
# 2026-10-12: "merge the smaller irregular shaped blocks"): the stretch of
# road between them is taken out, then the blocks are worked out again from
# the roads that are left, so edges always match the roads exactly.
MERGE_SMALL = CFG.get('mergeSmall', 15000.0)  # anything smaller merges
MERGE_THIN = 0.45  # compactness below this (thin strips, wedges) merges …
MERGE_THIN_MAX = CFG.get('mergeThinMax', 26000.0)  # … if it isn't big
MERGED_MAX = CFG.get('mergedMax', 90000.0)  # never make a block bigger than this
# Roads that are never cut by a merge (they're what makes it Manhattan),
# unless the piece is a tiny sliver.
KEEP = set(CFG.get('keep', []))


def merge_once(pieces):
    cands = [g for g in pieces if g.wkb not in rejected and not is_park_strip(g) and (g.area < MERGE_SMALL or (compactness(g) < MERGE_THIN and g.area < MERGE_THIN_MAX))]
    for a in sorted(cands, key=lambda g: g.area):
        best = None
        for b in pieces:
            if b is a or is_park_strip(b) or a.distance(b) > 18 or a.area + b.area > MERGED_MAX:
                continue
            shared = a.buffer(10).intersection(b.buffer(10)).area
            if shared < 300:
                continue
            u = unary_union([a, b])
            strip = u.buffer(15, join_style=1).buffer(-15, join_style=1).difference(u)
            hit = [(k, sum(q.intersection(strip.buffer(1)).length for q in v)) for k, v in parts.items()]
            hit = [h for h in hit if h[1] > 1]
            if not hit:
                continue
            road = max(hit, key=lambda h: h[1])[0]
            if road in KEEP and (a.area > 6000 or road.startswith('park-')):
                continue
            if not best or shared > best[0]:
                best = (shared, strip)
        if best:
            cut = best[1].buffer(2)
            trial = {}
            for k in parts:
                nv = []
                for q in parts[k]:
                    d = q.difference(cut)
                    nv += [g for g in (getattr(d, 'geoms', None) or [d]) if not g.is_empty and g.length > 1]
                trial[k] = nv
            clean_parts(trial)
            # Cutting a road can leave others leading nowhere, and cutting those
            # back can open up a much bigger block: only keep the merge if no
            # block ends up too big.
            big0 = [g.area for g in pieces if g.area > MERGED_MAX]
            big1 = [g.area for g in make_blocks(trial) if g.area > MERGED_MAX]
            if len(big1) > len(big0) or (big1 and max(big1) > max(big0 or [0]) * 1.02 + 1):
                rejected.add(a.wkb)
                continue
            parts.clear()
            parts.update(trial)
            return True
    return False


rejected = set()
merges = 0
clean_parts(parts)
for _ in range(0 if '--nomerge' in sys.argv else 120):
    if not merge_once([g for g in make_blocks()]):
        break
    merges += 1
print(f'merges {merges}, refused {len(rejected)}')
pieces = make_blocks()
blocks = [g for g in pieces if g.area >= MIN_BLOCK]
plazas = [g for g in pieces if g.area < MIN_BLOCK]
lines = parts
# Road surface from the final centre lines (round ends fill the corners).
streets = street_surface()
# Asphalt is everything inside the shore road's outer edge that isn't a
# block or a plaza: no slivers of bare ground anywhere between roads.
all_roads = inner.buffer(RING_W / 2, join_style=1).intersection(land).difference(unary_union(blocks + plazas))
# North to south, then west to east, so ids read like a book.
blocks.sort(key=lambda g: (round(g.centroid.y / 60), g.centroid.x))


def kind_of(b):
    # Named parks (Central Park, Prospect Park…), and in Manhattan the long
    # thin strips between Broadway and the Hudson (Riverside Park).
    return 'park' if is_park_strip(b) else 'city'


def block_out(i, b):
    o = {'id': f"{CFG['prefix']}{i + 1}", 'kind': kind_of(b), 'area': round(b.area), 'center': [round(b.representative_point().x, 1), round(b.representative_point().y, 1)], 'poly': rnd(b)[0]}
    if b.interiors:  # a block wrapped right round a park
        o['holes'] = [ring(h) for h in b.interiors]
    n = park_name(b) or ('Riverside Park' if o['kind'] == 'park' else None)
    if n:
        o['name'] = n
    return o
waterfront = land.difference(inner.buffer(RING_W / 2, join_style=1))


def ring(r):
    return [[round(x, 1), round(z, 1)] for x, z in list(r.coords)[:-1]]


def rnd(poly):
    """Outer rings only (blocks, land: no holes)."""
    polys = poly.geoms if isinstance(poly, MultiPolygon) else [poly]
    return [ring(p.exterior) for p in polys]


def rnd_holes(poly):
    """Each polygon as [outer, hole, hole…] (the road network is one big shape full of holes)."""
    polys = poly.geoms if isinstance(poly, MultiPolygon) else [poly]
    return [[ring(p.exterior)] + [ring(h) for h in p.interiors] for p in polys]


out = {
    'about': f"{CFG['name']}, layer 2: land, roads and blocks (scripts/map/build-borough.py). Game metres, x = east, z = south.",
    'land': rnd(land),
    'islands': [{'name': i['name'], 'poly': rnd(i['poly'])} for i in islands],
    'waterfront': rnd_holes(waterfront),
    'shoreRoad': {'w': RING_W, 'loops': [[[round(x, 1), round(z, 1)] for x, z in list(g.coords)] for g in (getattr(ring_line, 'geoms', None) or [ring_line])]},
    'roads': [{'id': s['id'] + (f'-{i + 1}' if len(lines[s['id']]) > 1 else ''), 'name': s['name'], 'kind': s['kind'], 'w': s['w'], 'pts': [[round(x, 1), round(z, 1)] for x, z in part.coords]} for s in ROADS if s['id'] in lines for i, part in enumerate(lines[s['id']])],
    'roadSurface': rnd_holes(all_roads),
    'blocks': [block_out(i, b) for i, b in enumerate(blocks)],
    'plazas': [{'poly': rnd(p)[0], 'area': round(p.area)} for p in plazas],
}
dst = ROOT / 'src' / 'data' / 'map'
dst.mkdir(parents=True, exist_ok=True)
json.dump(out, open(dst / f'{BOROUGH}.json', 'w'), separators=(',', ':'))

areas = sorted(b.area for b in blocks)
print(f"blocks {len(blocks)}  plazas {len(plazas)}  block area min {areas[0]:.0f} median {areas[len(areas)//2]:.0f} max {areas[-1]:.0f}")
for r in report:
    print(r)
