# Make the small "far" copy of every map picture (1/4 size), used when
# zoomed out or before the sharp copy has loaded:
#   python3 scripts/make-far.py [public/sprites]
# Colour is resized smoothly; depth is picked (never blended: it holds
# two bytes per pixel).
import sys, glob, os
from PIL import Image

folder = sys.argv[1] if len(sys.argv) > 1 else 'public/sprites'
for f in sorted(glob.glob(os.path.join(folder, '*.webp'))):
    if f.endswith('.far.webp'):
        continue
    prefix = f[:-5]
    out = prefix + '.far.webp'
    if os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(f):
        continue
    try:
        im = Image.open(f).convert('RGBA')
    except Exception as e:  # still being written
        print('skip', f, e)
        continue
    w, h = max(1, im.width // 4), max(1, im.height // 4)
    im.resize((w, h), Image.LANCZOS).save(out, quality=88)
    Image.open(prefix + '.depth.png').resize((w, h), Image.NEAREST).save(prefix + '.far.depth.png', optimize=True)
    print('far', os.path.basename(prefix), w, 'x', h)
