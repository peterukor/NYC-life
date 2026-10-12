# Measure how high a picture's own ground is at its centre (e.g. the
# road surface of a road tile, which sits on a thick base) and store it
# as "top" in <name>.json, so the game can sink the picture to y = 0.
#
#   python3 scripts/sprite-top.py public/sprites/road-ns [more names...]
#
# Along the ray through the anchor's pixel, a flat surface at height t
# is hit 2t metres before the anchor (camera 30 degrees down), so the
# stored depth there is -2t.
import sys, json
import numpy as np
from PIL import Image

for prefix in sys.argv[1:]:
    meta = json.load(open(prefix + '.json'))
    d = np.asarray(Image.open(prefix + '.depth.png')).astype(np.int64)
    q = ((d[..., 0] << 8) | d[..., 1]) / 65535.0
    delta = q * 2 * meta['depthRange'] - meta['depthRange']
    hh, ww = q.shape
    u = int((0.5 - meta['cx'] / meta['w']) * ww)
    v = int((0.5 + meta['cy'] / meta['h']) * hh)
    # Median along the anchor's pixel row, so a small post or sign right
    # at the centre doesn't count (depth changes row by row on flat ground).
    row = delta[v, max(0, u - 40):u + 41]
    top = float(-np.median(row) / 2)
    meta['top'] = round(top, 3)
    json.dump(meta, open(prefix + '.json', 'w'), indent=1)
    print(prefix, 'top =', meta['top'])
