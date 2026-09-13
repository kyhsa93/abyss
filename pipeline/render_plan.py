#!/usr/bin/env python3
"""Photograph one building straight down, at this game's own scale.

  blender --background --python pipeline/render_plan.py -- <glb> <out.png> <yards>

**This is a measurement and not a bake stage.**  It exists because issue 179
asked whether building exteriors should be rendered from a 3D kit instead of
tiled on the 1.33 yard grid, and that question cannot be answered by argument —
the only way to judge it is to put the two pictures side by side.  The answer
was no, and the wiki page 건물 외형을 무엇으로 그리나 carries both the picture and
the arithmetic.  The script stays so the decision can be taken again: a
judgement nobody can re-run is a judgement nobody can revisit.

The camera is straight down, orthographic, at `PPY` pixels to the yard — which
is what this game's projection *is* now.  `render_kit.py` and the rest of the
rendering scripts are aimed down the 45 degree diagonal at a 2:1 elevation,
which was the projection this game drew in for one round and does not any more;
they are on the shelf for that reason and this one is not a replacement for
them.  The lights are the same two suns everything else here is lit by, because
a building lit differently from the fence beside it reads as a building from a
different game.
"""
import math
import os
import sys

import bpy

PPY = 24           # pixels to the yard at zoom 1, as in main.ts
ARGS = sys.argv[sys.argv.index('--') + 1:]
GLB, OUT, YARDS = ARGS[0], ARGS[1], float(ARGS[2])

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=os.path.expanduser(GLB))
mesh = [o for o in bpy.data.objects if o.type == 'MESH']
lo = [min((o.matrix_world @ v.co)[i] for o in mesh for v in o.data.vertices)
      for i in range(3)]
hi = [max((o.matrix_world @ v.co)[i] for o in mesh for v in o.data.vertices)
      for i in range(3)]
span = [hi[i] - lo[i] for i in range(3)]
# The long side of the footprint is the size the caller states, in yards.  A
# length rather than a scale factor, for the reason `pipeline/arms.py` gives:
# a scale factor is a fact about one export and a length is a fact about the
# building.
foot = max(span[0], span[1])
k = YARDS / foot
print('BBOX', [round(v, 2) for v in span], 'scale', round(k, 4))

wide = max(span[0], span[1]) * k
side = int(round(wide * PPY))
mid = [(lo[i] + hi[i]) / 2 for i in range(3)]

sc = bpy.context.scene
sc.render.resolution_x = sc.render.resolution_y = side
sc.render.resolution_percentage = 100
sc.render.film_transparent = True
sc.render.image_settings.color_mode = 'RGBA'
sc.render.engine = 'CYCLES'
sc.cycles.samples = 64
# `Standard` and not AgX, which rolls a lit surface off towards white — the
# same reason `render_paperdoll.py` sets it.
sc.view_settings.view_transform = 'Standard'

bpy.ops.object.camera_add(location=(mid[0], mid[1], hi[2] + 50))
cam = bpy.context.active_object
cam.data.type = 'ORTHO'
cam.data.ortho_scale = wide / k       # in the model's own units
cam.rotation_euler = (0, 0, 0)        # straight down, which is the projection
sc.camera = cam

for energy, az, el in ((3.4, 100, 48), (1.0, 280, 66)):
    li = bpy.data.lights.new('sun', 'SUN')
    li.energy = energy
    ob = bpy.data.objects.new('sun', li)
    sc.collection.objects.link(ob)
    ob.rotation_euler = (math.radians(el), 0, math.radians(az))
w = bpy.data.worlds.new('sky')
sc.world = w
w.use_nodes = True
bg = w.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (0.42, 0.52, 0.62, 1)
bg.inputs['Strength'].default_value = 0.7

sc.render.filepath = os.path.expanduser(OUT)
bpy.ops.render.render(write_still=True)
print('WROTE', OUT, side, 'px for', YARDS, 'yards')
