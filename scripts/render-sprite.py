# =====================================================================
# render-sprite.py — photograph one full-detail model from the game's
# fixed camera, for the 2.5D (Clash-of-Clans-style) map.
#
# Output, next to <outPrefix>:
#   <outPrefix>.webp   colour with transparent background, including the
#                      shadow the model casts on the ground;
#   <outPrefix>.depth.png  how far each pixel is from the camera (16 bit
#                      packed in red + green), so live 3D people and cars
#                      can walk BEHIND buildings correctly;
#   <outPrefix>.json   size and placement of the picture in metres.
#
#   python3 scripts/render-sprite.py <in.glb> <outPrefix> <footW> <footD>
#           [rotDeg=0] [pxPerMetre=6] [samples=32]
#
# The model is scaled to fit a footW x footD metre footprint (keeping
# its proportions), centred, standing on the ground. Camera and sun are
# the same for every model, so all pictures match.
# Needs Blender as a Python module (pip install bpy) and OpenEXR.
# =====================================================================

import sys, math, json
import bpy
import numpy as np
from mathutils import Vector

src, prefix = sys.argv[1], sys.argv[2]
foot_w, foot_d = float(sys.argv[3]), float(sys.argv[4])
rot = float(sys.argv[5]) if len(sys.argv) > 5 else 0.0
PX = float(sys.argv[6]) if len(sys.argv) > 6 else 8.0
samples = int(sys.argv[7]) if len(sys.argv) > 7 else 32
# How much the model may be stretched (each way) to fill the footprint.
STRETCH = float(sys.argv[8]) if len(sys.argv) > 8 else 1.0

# The game camera: 30 degrees down, looking from the south-west (lower left)
# towards the north-east, like The Sims. MUST match src/proto/view.ts.
EL, AZ = math.radians(30), math.radians(-45)
# The sun: same for everything. MUST match the light in src/proto/view.ts.
SUN_ROT = (math.radians(35), 0.0, math.radians(30))
DEPTH_RANGE = 512.0  # depth stored as metres in [-512, 512] around the anchor

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in sc.objects if o.type == 'MESH']
roots = [o for o in sc.objects if o.parent is None]
piv = bpy.data.objects.new('pivot', None)
sc.collection.objects.link(piv)
for r in roots:
    r.parent = piv
bpy.context.view_layer.update()

def bounds():
    mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
    for o in meshes:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
    return mn, mx

piv.rotation_euler = (0, 0, math.radians(rot))
bpy.context.view_layer.update()
mn, mx = bounds()
s = min(foot_w / (mx.x - mn.x), foot_d / (mx.y - mn.y))
sx = min(foot_w / (mx.x - mn.x), s * STRETCH)
sy = min(foot_d / (mx.y - mn.y), s * STRETCH)
piv.scale = (sx, sy, s)
bpy.context.view_layer.update()
mn, mx = bounds()
piv.location -= Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
bpy.context.view_layer.update()
mn, mx = bounds()
print(f'footprint {mx.x - mn.x:.1f} x {mx.y - mn.y:.1f} m, height {mx.z - mn.z:.1f} m')

# Ground that only receives shadows (invisible otherwise).
bpy.ops.mesh.primitive_plane_add(size=4000, location=(0, 0, 0))
catcher = bpy.context.active_object
catcher.is_shadow_catcher = True

sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
sc.collection.objects.link(sun)
sun.data.energy = 3.2
sun.data.color = (1.0, 0.95, 0.85)
sun.data.angle = math.radians(6)
sun.rotation_euler = SUN_ROT
world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs[0].default_value = (0.75, 0.82, 0.95, 1); bg.inputs[1].default_value = 0.9

# Camera looking at the anchor (footprint centre on the ground).
d = Vector((math.cos(EL) * math.sin(AZ), -math.cos(EL) * math.cos(AZ), math.sin(EL)))
L = 2000.0
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'
cam.location = d * L
cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
cam.data.clip_start = 1; cam.data.clip_end = L * 2
bpy.context.view_layer.update()
right = cam.matrix_world.to_3x3().col[0].normalized()
up = cam.matrix_world.to_3x3().col[1].normalized()

# Everything the picture must contain: the model's box and its shadow.
travel = (sun.matrix_world.to_3x3() @ Vector((0, 0, -1))).normalized()
pts = []
for x in (mn.x, mx.x):
    for y in (mn.y, mx.y):
        for z in (mn.z, mx.z):
            p = Vector((x, y, z)); pts.append(p)
            pts.append(p + travel * (-p.z / travel.z))
rs = [p.dot(right) for p in pts]; us = [p.dot(up) for p in pts]
pad = 1.0
r0, r1, u0, u1 = min(rs) - pad, max(rs) + pad, min(us) - pad, max(us) + pad
rx, ry = math.ceil((r1 - r0) * PX), math.ceil((u1 - u0) * PX)
W, H = rx / PX, ry / PX
cr, cu = (r0 + r1) / 2, (u0 + u1) / 2
cam.data.ortho_scale = max(W, H)
cam.data.shift_x = cr / max(W, H)
cam.data.shift_y = cu / max(W, H)

sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = samples
sc.cycles.use_denoising = True
sc.render.film_transparent = True
sc.render.resolution_x, sc.render.resolution_y = rx, ry
sc.render.resolution_percentage = 100
sc.view_settings.view_transform = 'Standard'
sc.view_layers[0].use_pass_z = True
st = sc.render.image_settings
try:
    st.media_type = 'MULTI_LAYER_IMAGE'
except Exception:
    pass
st.file_format = 'OPEN_EXR_MULTILAYER'
st.color_depth = '32'
exr = prefix + '.exr'
sc.render.filepath = exr
bpy.ops.render.render(write_still=True)

# ---- EXR → colour WebP + packed depth PNG
import OpenEXR
from PIL import Image
f = OpenEXR.File(exr)
ch = {}
for part in f.parts:  # Blender writes each pass as its own part
    ch.update(part.channels)
def get(suffix):
    for k, v in ch.items():
        if k.endswith(suffix):
            return np.asarray(v.pixels, dtype=np.float32)
    raise KeyError(suffix + ' not in ' + ', '.join(ch.keys()))
rgba = get('.Combined')
r, g, b, a = (rgba[..., i] for i in range(4))
z = get('Depth.Z')
a = np.clip(a, 0, 1)
a = np.where(a < 0.03, 0, a)  # drop the faint sky-shadow haze far from the model
# Fade out at the picture's edges so a shadow never ends in a hard line.
hh, ww = a.shape
fy = np.clip(np.minimum(np.arange(hh), hh - 1 - np.arange(hh)) / 6.0, 0, 1)
fx = np.clip(np.minimum(np.arange(ww), ww - 1 - np.arange(ww)) / 6.0, 0, 1)
a = a * fy[:, None] * fx[None, :]
safe = np.where(a > 1e-4, a, 1)
def srgb(c):
    c = np.clip(c / safe, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)
img = np.stack([srgb(r), srgb(g), srgb(b), a], -1)
img = (img * 255 + 0.5).astype(np.uint8)
Image.fromarray(img, 'RGBA').save(prefix + '.webp', quality=90, method=6)

delta = z - L  # metres behind (+) or in front of (-) the anchor
q = np.clip((delta + DEPTH_RANGE) / (2 * DEPTH_RANGE), 0, 1)
q = np.where(a > 0.01, q, 1.0)
u16 = (q * 65535 + 0.5).astype(np.uint32)
dep = np.zeros((*u16.shape, 3), np.uint8)
dep[..., 0] = u16 >> 8
dep[..., 1] = u16 & 255
Image.fromarray(dep, 'RGB').save(prefix + '.depth.png', optimize=True)

meta = {
    'px': PX, 'w': W, 'h': H, 'cx': cr, 'cy': cu, 'depthRange': DEPTH_RANGE,
    'foot': [mx.x - mn.x, mx.y - mn.y], 'height': mx.z - mn.z, 'rot': rot,
}
json.dump(meta, open(prefix + '.json', 'w'), indent=1)
import os
os.remove(exr)
print('done', prefix, rx, 'x', ry)
