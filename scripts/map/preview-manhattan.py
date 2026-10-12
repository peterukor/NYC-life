"""
preview-manhattan.py — draw src/data/map/manhattan.json as a flat map so
the roads and blocks can be checked by eye: the whole island, plus close-ups
of every stretch of shore (where roads used to go wrong).

  python3 scripts/map/preview-manhattan.py      -> test-results/map/*.png
Options: --real  also draw the real streets faintly underneath.
"""
import json, pathlib, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[2]
M = json.load(open(ROOT / 'src' / 'data' / 'map' / 'manhattan.json'))
OUT = ROOT / 'test-results' / 'map'
OUT.mkdir(parents=True, exist_ok=True)
REAL = '--real' in sys.argv
STREETS = json.load(open(ROOT / 'scripts' / 'map' / 'src' / 'streets-all.json')) if REAL else {}

WATER, LAND, SHORE, ROAD, BLOCK, PARK, PLAZA, LINE = '#8cc8ec', '#cfe7a8', '#b6dc8a', '#6f7480', '#f2e6cf', '#8fd27a', '#e7d3b0', '#ffffff'
try:
    FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 11)
except OSError:
    FONT = ImageFont.load_default()


def render(name, box, sc, labels=True):
    x0, z0, x1, z1 = box
    W, H = int((x1 - x0) * sc), int((z1 - z0) * sc)
    im = Image.new('RGB', (W, H), WATER)
    d = ImageDraw.Draw(im)
    P = lambda p: ((p[0] - x0) * sc, (p[1] - z0) * sc)
    for poly in M['land']:
        d.polygon([P(p) for p in poly], fill=LAND)
    for isl in M['islands']:
        for poly in isl['poly']:
            d.polygon([P(p) for p in poly], fill=LAND)
    for poly in M['waterfront']:
        d.polygon([P(p) for p in poly], fill=SHORE)
    for poly in M['roadSurface']:
        d.polygon([P(p) for p in poly], fill=ROAD)
    for n, v in STREETS.items():
        for s in v['segs']:
            d.line([P(p) for p in s], fill='#a3a7af', width=1)
    for pz in M['plazas']:
        d.polygon([P(p) for p in pz['poly']], fill=PLAZA, outline='#c9b48e')
    for b in M['blocks']:
        d.polygon([P(p) for p in b['poly']], fill=PARK if b['kind'] == 'park' else BLOCK, outline='#d8c7a3')
    # Dashed centre lines.
    for r in M['roads'] + [{'pts': M['shoreRoad']['pts']}]:
        pts = r['pts']
        for i in range(len(pts) - 1):
            if i % 2 == 0:
                d.line([P(pts[i]), P(pts[i + 1])], fill='#f4d35e', width=max(1, int(sc)))
    if labels:
        for b in M['blocks']:
            c = P(b['center'])
            d.text((c[0] - 8, c[1] - 6), b['id'], fill='#5a4630', font=FONT)
    im.save(OUT / f'{name}.png')
    return im


bb = [min(p[0] for p in M['land'][0]) - 30, min(p[1] for p in M['land'][0]) - 30, max(p[0] for p in M['land'][0]) + 30, max(p[1] for p in M['land'][0]) + 30]
render('manhattan-whole', bb, 0.42)
# Close-ups down the island (every shore included), 1.1 px per metre.
z = bb[1]
i = 0
while z < bb[3]:
    render(f'manhattan-part-{i:02d}', (bb[0], z, bb[2], z + 700), 0.75)
    z += 650
    i += 1
print('wrote', OUT)
