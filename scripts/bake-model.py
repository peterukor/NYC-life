# =====================================================================
# bake-model.py — turn a huge AI model (Tripo/Meshy, ~2M triangles) into
# a light game model WITHOUT scrambling its texture.
#
# Why: AI models have their texture cut into thousands of tiny islands.
# Just deleting triangles drags the texture around and it turns into
# noise. The proper fix (what game artists do): make a simpler copy of
# the shape, give it a fresh clean UV layout, and BAKE the original's
# colours onto it (ray-cast from the simple copy to the detailed one).
#
#   python3 scripts/bake-model.py <in.glb> <out.glb> <targetTriangles> [texSize=1024] [far]
#
# Then scripts/slim-model.mjs <out.glb> <final.glb> 0 packs it (WebP
# texture, quantized + meshopt geometry) without simplifying again.
# Needs Blender as a Python module: pip install bpy.
# =====================================================================

import sys
import bpy

src, out, target = sys.argv[1], sys.argv[2], int(sys.argv[3])
tex = int(sys.argv[4]) if len(sys.argv) > 4 else 1024
# 'far': for the far-away copy, rebuild the shape as one closed shell first
# (voxel remesh), so fences and leaves can't stop it getting simple.
far = len(sys.argv) > 5 and sys.argv[5] == 'far'

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

# One mesh object: join everything that came in.
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
high = bpy.context.view_layer.objects.active
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
tris = sum(len(p.vertices) - 2 for p in high.data.polygons)
print(f"high: {tris} triangles")

# ---- the simple copy
low = high.copy()
low.data = high.data.copy()
low.name = 'low'
bpy.context.collection.objects.link(low)
bpy.ops.object.select_all(action='DESELECT')
low.select_set(True)
bpy.context.view_layer.objects.active = low
# Merge the split-apart vertices first so the shape can simplify cleanly.
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=0.0001)
bpy.ops.object.mode_set(mode='OBJECT')
if far:
    rem = low.modifiers.new('rem', 'REMESH')
    rem.mode = 'VOXEL'
    rem.voxel_size = max(low.dimensions) / 90
    bpy.ops.object.modifier_apply(modifier='rem')
    tris_now = sum(len(p.vertices) - 2 for p in low.data.polygons)
else:
    tris_now = tris
dec = low.modifiers.new('dec', 'DECIMATE')
dec.decimate_type = 'COLLAPSE'
dec.ratio = min(1.0, target / max(1, tris_now))
dec.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier='dec')
print(f"low: {sum(len(p.vertices) - 2 for p in low.data.polygons)} triangles")

# Fresh, clean UV layout for the bake.
while low.data.uv_layers:
    low.data.uv_layers.remove(low.data.uv_layers[0])
low.data.uv_layers.new(name='UVMap')
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.004, area_weight=1.0)
bpy.ops.object.mode_set(mode='OBJECT')

# New material whose texture receives the bake.
img = bpy.data.images.new('baked', tex, tex, alpha=False)
mat = bpy.data.materials.new('baked')
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes.get('Principled BSDF')
node = nt.nodes.new('ShaderNodeTexImage')
node.image = img
nt.links.new(node.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 1.0
bsdf.inputs['Metallic'].default_value = 0.0
low.data.materials.clear()
low.data.materials.append(mat)
nt.nodes.active = node

# ---- bake the original's colours (no lighting) onto the simple copy
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 4
bake = scene.render.bake
bake.use_selected_to_active = True
size = max(low.dimensions)
bake.cage_extrusion = size * 0.01
bake.max_ray_distance = size * 0.03
bake.margin = 4
bpy.ops.object.select_all(action='DESELECT')
high.select_set(True)
low.select_set(True)
bpy.context.view_layer.objects.active = low
bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, use_selected_to_active=True)

# ---- export only the simple copy
bpy.data.objects.remove(high, do_unlink=True)
img.pack()
bpy.ops.object.select_all(action='DESELECT')
low.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_image_format='JPEG', export_jpeg_quality=92)
print('done', out)
