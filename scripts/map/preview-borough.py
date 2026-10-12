"""
preview-borough.py — draw src/data/map/<borough>.json as a flat map so
the roads and blocks can be checked by eye: the whole island, plus close-ups
of every stretch of shore (where roads used to go wrong).

  python3 scripts/map/preview-borough.py manhattan   -> test-results/map/*.png
Options: --real  also draw the real streets faintly underneath.
"""
import json, pathlib, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[2]
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
B = ARGS[0] if ARGS else 'manhattan'
M = json.load(open(ROOT / 'src' / 'data' / 'map' / f'{B}.json'))
OUT = ROOT / 'test-results' / 'map'
OUT.mkdir(parents=True, exist_ok=True)
REAL = '--real' in sys.argv
STREETS = json.load(open(ROOT / 'scripts' / 'map' / 'src' / ('streets-all.json' if B == 'manhattan' else f'streets-{B}.json'))) if REAL else {}

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
    def holed(polys, color):
        # Draw [outer, hole…] on a mask so the holes stay open.
        mask = Image.new('L', im.size, 0)
        md = ImageDraw.Draw(mask)
        for rings in polys:
            md.polygon([P(p) for p in rings[0]], fill=255)
            for h in rings[1:]:
                md.polygon([P(p) for p in h], fill=0)
        im.paste(color, mask=mask)

    holed(M['waterfront'], SHORE)
    holed(M['roadSurface'], ROAD)
    for n, v in STREETS.items():
        for s in v['segs']:
            d.line([P(p) for p in s], fill='#a3a7af', width=1)
    for pz in M['plazas']:
        d.polygon([P(p) for p in pz['poly']], fill=PLAZA, outline='#c9b48e')
    for b in M['blocks']:
        if b.get('holes'):
            holed([[b['poly']] + b['holes']], PARK if b['kind'] == 'park' else BLOCK)
        else:
            d.polygon([P(p) for p in b['poly']], fill=PARK if b['kind'] == 'park' else BLOCK, outline='#d8c7a3')
    # Dashed centre lines.
    for r in M['roads'] + [{'pts': l} for l in M['shoreRoad']['loops']]:
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


allp = [p for poly in M['land'] for p in poly]
bb = [min(p[0] for p in allp) - 30, min(p[1] for p in allp) - 30, max(p[0] for p in allp) + 30, max(p[1] for p in allp) + 30]
if __name__ == '__main__':
    render(f'{B}-whole', bb, 0.42 if B == 'manhattan' else 0.25)
    # Close-ups in tiles (every shore included).
    T = 700 if B == 'manhattan' else 900
    i = 0
    z = bb[1]
    while z < bb[3]:
        x = bb[0]
        while x < bb[2]:
            render(f'{B}-part-{i:02d}', (x, z, min(bb[2], x + (bb[2] - bb[0] if B == 'manhattan' else T)), z + T), 0.75)
            i += 1
            x += bb[2] - bb[0] if B == 'manhattan' else T - 50
        z += T - 50
print('wrote', OUT)
