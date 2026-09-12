#!/usr/bin/env python3
"""Build things out of Kenney's Fantasy Town Kit and render them at the
projection the game actually draws in.

The kit is 167 CC0 models on a 1x1x1 grid — walls, roofs, roads, fences,
fountains, stalls, trees, a windmill — and a wall piece sits on the `+x` edge
of its own cell, so a quarter turn about z is the whole of what picks which
face of a building it is.  That regularity is why a house can be written down
as a list of (piece, cell, turn) rather than modelled.

**The camera is not a style choice.**  `src/main.ts` projects with `x - y` on
the horizontal and `(x + y)` halved on the vertical; that is a 2:1 diamond, and
a 2:1 diamond is an orthographic camera at an elevation of `atan(0.5)` looking
along the 45 degree diagonal.  Any other elevation is a different game's
isometric and the sprite will not sit on our ground.

The scale is not a choice either.  One cell is two yards, a yard is `PPY`
pixels, and an orthographic camera's pixels-per-unit is `resolution /
ortho_scale` — so the number below is derived from those three rather than
nudged until it looked right.

  blender --background --python pipeline/render_kit.py -- <kit dir> <out dir>

Renders with Cycles on the CPU, which is what this machine has: about four
seconds for a house at 512 pixels, and these are baked once.
"""
import math
import os
import sys

import bpy

PPY = 24            # pixels to the yard at zoom 1, the same constant main.ts uses
YARDS_PER_CELL = 2
TILT = math.atan(0.5)

# (piece, cell x, cell y, cell z, quarter turns in degrees).
#
# `roof-high-gable` is a whole A-frame over one cell and `roof-high-gable-end`
# is the same with the triangle filled in, so a row of them capped at both ends
# is a roof.  Which way the ridge runs was settled by rendering both and
# looking, not by reading the file name.
BUILDS = {
    'kit_house': [
        ('wall-wood-window-shutters', 0, -1, 0, 180),
        ('wall-wood-door', 0, 0, 0, 180),
        ('wall-wood-window-shutters', 0, 1, 0, 180),
        ('wall-wood', 0, -1, 0, 0),
        ('wall-wood-window-glass', 0, 0, 0, 0),
        ('wall-wood', 0, 1, 0, 0),
        ('wall-wood-window-small', 0, 1, 0, 90),
        ('wall-wood', 0, -1, 0, -90),
        ('roof-high-gable-end', 0, -1, 1, 180),
        ('roof-high-gable', 0, 0, 1, 0),
        ('roof-high-gable-end', 0, 1, 1, 0),
        ('chimney', 0, -1, 1.4, 0),
    ],
}


def build(kit, pieces):
    cache = {}
    for name, x, y, z, turn in pieces:
        if name not in cache:
            before = set(bpy.data.objects)
            bpy.ops.import_scene.gltf(filepath=os.path.join(kit, name + '.glb'))
            made = [o for o in bpy.data.objects if o not in before]
            for o in made:
                o.hide_render = True
            cache[name] = made
        for src in cache[name]:
            o = src.copy()
            if src.data:
                o.data = src.data
            o.hide_render = False
            bpy.context.scene.collection.objects.link(o)
            o.location = (x, y, z)
            o.rotation_euler = (0, 0, math.radians(turn))


def light():
    """Key light on the camera's own side of the building.

    Put anywhere else it lights the two faces the camera cannot see, and the
    first render of this house came out as a black silhouette with lit window
    frames.  The sky term is there so a shadowed face is dark rather than
    empty — Cycles with a sun and no world is genuinely black in shadow.
    """
    sc = bpy.context.scene
    for energy, az, el in ((4.0, 100, 48), (1.1, 280, 66)):
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
    bg.inputs['Strength'].default_value = 0.55


def render(out, res):
    sc = bpy.context.scene
    # A world unit along x lands `cos(45) * pixels-per-unit` across the glass,
    # and we want a cell to land `YARDS_PER_CELL * PPY`.
    ppu = (YARDS_PER_CELL * PPY) / math.cos(math.radians(45))
    d = 40
    bpy.ops.object.camera_add(
        location=(d, -d, d * math.tan(TILT) * math.sqrt(2)))
    cam = bpy.context.active_object
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = res / ppu
    cam.rotation_euler = (math.pi / 2 - TILT, 0, math.radians(45))
    sc.camera = cam
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.film_transparent = True
    sc.render.image_settings.color_mode = 'RGBA'
    # Cycles because this machine's EEVEE has no EGL surface to draw on in
    # `--background`; it is a bake, so the CPU is fine.
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 96
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)


def main(kit, out):
    os.makedirs(out, exist_ok=True)
    for name, pieces in BUILDS.items():
        bpy.ops.wm.read_factory_settings(use_empty=True)
        build(kit, pieces)
        light()
        render(os.path.join(out, name + '.png'), 512)
        print(f'rendered {name}')


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:]
    main(os.path.expanduser(argv[0]), os.path.expanduser(argv[1]))
