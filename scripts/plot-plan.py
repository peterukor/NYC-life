"""Draw scripts/dump-plan.ts output as a top-down plan (PNG), optionally cropped.
   python3 scripts/plot-plan.py plan.json out.png [x0 z0 x1 z1] [px_per_m]"""
import json, sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon, Rectangle
P = json.load(open(sys.argv[1]))
box = list(map(float, sys.argv[3:7])) if len(sys.argv) >= 7 else [-520, -1900, 680, 1420]
ppm = float(sys.argv[7]) if len(sys.argv) >= 8 else 0.35
W, H = (box[2] - box[0]) * ppm / 100, (box[3] - box[1]) * ppm / 100
fig = plt.figure(figsize=(W, H), dpi=100)
ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(box[0], box[2]); ax.set_ylim(box[3], box[1]); ax.set_aspect('equal'); ax.axis('off')
ax.add_patch(Rectangle((box[0], box[1]), box[2] - box[0], box[3] - box[1], color='#2f7fa8'))
for r in P['others']: ax.add_patch(Polygon(r, color='#b9cf9c'))
for r in P['outline']: ax.add_patch(Polygon(r, color='#9fcf7c', ec='#ffffff', lw=0.6))
cols = {'buildings': '#c9c3b8', 'park': '#5fae4f', 'plaza': '#f1d68a', 'lot': '#d6c9a2', 'ads': '#e86aa6', 'vacant': '#9b7b55'}
aw, sw = P['aveW'], P['stW']
for b in P['blocks']:
    R = b['rect']
    ax.add_patch(Rectangle((R['minX'] - aw / 2 - .5, R['minZ'] - sw / 2 - .5), R['maxX'] - R['minX'] + aw + 1, R['maxZ'] - R['minZ'] + sw + 1, color='#55595f', lw=0))
for R in P.get('stubs', []):
    ax.add_patch(Rectangle((R['minX'], R['minZ']), R['maxX'] - R['minX'], R['maxZ'] - R['minZ'], color='#55595f', lw=0))
for b in P['blocks']:
    R = b['rect']
    ax.add_patch(Rectangle((R['minX'], R['minZ']), R['maxX'] - R['minX'], R['maxZ'] - R['minZ'], color=cols.get(b['k'], '#ccc'), ec='#ff3030' if b['trimmed'] else '#888', lw=0.8 if b['trimmed'] else 0.3))
    ax.text((R['minX'] + R['maxX']) / 2, (R['minZ'] + R['maxZ']) / 2, f"{b['c']},{b['r']}", fontsize=5, ha='center', va='center')
for l in P['lots']:
    if not l.get('grid'): ax.add_patch(Rectangle((l['x0'], l['z0']), l['x1'] - l['x0'], l['z1'] - l['z0'], fc='#d9e3b0', ec='#9a9', lw=0.3))
for c in P['corridors']:
    pts = c['pts'] + ([c['pts'][0]] if c['loop'] else [])
    xs = [p[0] for p in pts]; zs = [p[1] for p in pts]
    lw = c['w'] * ppm * 0.72
    ax.plot(xs, zs, color='#33363b' if c['highway'] else '#4a4d52', lw=lw, solid_capstyle='butt', alpha=0.95)
    ax.plot(xs, zs, color='#ffcc33', lw=0.5)
for p in P['piers']:
    ax.plot([p['x'], p['x'] + p['ox'] * p['L']], [p['z'], p['z'] + p['oz'] * p['L']], color='#cfc6b6', lw=11 * ppm * 0.72)
for x in P['xs']: ax.axvline(x, color='#ffffff', lw=0.2, alpha=0.3)
for z in P['zs']: ax.axhline(z, color='#ffffff', lw=0.2, alpha=0.3)
fig.savefig(sys.argv[2])
