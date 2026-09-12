#!/usr/bin/env python3
"""Photograph a rigged character from the eight directions the projection has.

This is the thing the quarter view cost and code could not pay back.  LPC's
people are drawn facing up, down, left and right *on the screen*, and in
quarter view none of the world's four directions is any of those — so a
townsman walking north faced somewhere he was not going, and `facing()` in
`src/main.ts` had to pick the nearest of four poses and accept being 45 degrees
out half the time.  A model has no such problem: eight directions is eight
rotations of the same rig.

Kenney's characters are rigged with thirty-two actions apiece, `walk` and
`idle` among them, and are CC0.

  blender --background --python pipeline/render_actor.py -- <out> <kit=path>... 

writes `<out>/<id>/<dir>_<clip><frame>.png`, one cell each, which
`pipeline/pack_actor.py` then packs.  Rendering and packing are separate
because Blender's bundled Python has no PIL.
"""
import math
import os
import sys

import bpy

PPY = 24                # pixels to the yard at zoom 1, as in main.ts
PERSON_YARDS = 1.8      # how tall a person is, which sets the scale
TILT = math.atan(0.5)
CELL = 128

# Eight directions, a screen eighth apart.  `walk` is sampled evenly and `idle`
# gives one standing frame, which is the same shape the LPC sheet has.
DIRS = 8
CLIPS = (('walk', 4), ('idle', 1))

# (id, kit, model).  Who the slice is made of, as far as there are models for
# them.  Twelve townsfolk because 83 people who are all the same person is the
# thing this repository already fixed once for the drawn sheet, and the archer
# stands in for a guard because he is the only one of these wearing anything.
#
# The kobolds, murlocs and every animal are not here and cannot be: there is no
# CC0 model set for fantasy monsters or forest animals in this style, which was
# checked rather than assumed.  Those kinds keep the drawn sheet.
ACTORS = [
    ('hero', 'forest', 'character-archer'),
    ('guard', 'forest', 'character-archer'),
    ('townsfolk', 'people', 'character-female-a'),
    ('townsfolk2', 'people', 'character-male-a'),
    ('townsfolk3', 'people', 'character-female-c'),
    ('townsfolk4', 'people', 'character-male-c'),
    ('townsfolk5', 'people', 'character-female-e'),
    ('townsfolk6', 'people', 'character-male-e'),
    ('bandit', 'people', 'character-male-b'),
    ('bandit2', 'people', 'character-male-d'),
]


def imported(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def height(objects):
    """The model's own height in blender units, so the scale can be derived.

    Anything that dips below the floor is not the character.  Kenney's
    characters ship with a two-unit icosphere centred on the origin — a helper,
    invisible in the render and half of it underground — and a plain bounding
    box over every mesh measures that instead of the person: 2.00 units against
    the 0.78 they actually stand.  Everybody in the world was rendered at 39%
    of the size the arithmetic asked for, and nothing looked broken, because
    everybody was wrong by the same factor.
    """
    lo = hi = None
    for o in objects:
        if o.type != 'MESH':
            continue
        zs = [(o.matrix_world @ v.co).z for v in o.data.vertices]
        if not zs or min(zs) < -0.01:
            continue
        lo = min(zs) if lo is None else min(lo, min(zs))
        hi = max(zs) if hi is None else max(hi, max(zs))
    return (hi - lo) if lo is not None else 1.0


def camera(res, yards_per_unit, tall):
    """Framed on the middle of the body, not on the floor it stands on.

    The camera is aimed at the world origin and a character's origin is its
    feet, so the frame gave it half a cell of headroom and no more.  At the
    corrected scale that clipped every head off: translating the camera up by
    half the model's height moves the framed point up with it.
    """
    sc = bpy.context.scene
    ppu = (yards_per_unit * PPY) / math.cos(math.radians(45))
    d = 30
    bpy.ops.object.camera_add(
        location=(d, -d, d * math.tan(TILT) * math.sqrt(2) + tall / 2))
    cam = bpy.context.active_object
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = res / ppu
    cam.rotation_euler = (math.pi / 2 - TILT, 0, math.radians(45))
    sc.camera = cam


def light():
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


def one(kit, model, out):
    os.makedirs(out, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    objs = imported(os.path.join(kit, model + '.glb'))
    arm = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
    if arm is None:
        sys.exit(f'{model} has no armature')
    # Everything hangs off one root, so turning it turns the lot.
    #
    # And the root has to be told to listen: the glTF importer leaves every
    # object in quaternion rotation mode, where `rotation_euler` is simply
    # ignored.  The first eight directions of this character came out as eight
    # copies of the same pose — rendered without an error, which is the only
    # reason it took a contact sheet to notice.
    roots = [o for o in objs if o.parent is None]
    for r in roots:
        r.rotation_mode = 'XYZ'

    yards_per_unit = PERSON_YARDS / height(objs)
    print(f'{model} is {height(objs):.2f} units; '
          f'1 unit = {yards_per_unit:.2f} yards')
    camera(CELL, yards_per_unit, height(objs))
    light()
    sc = bpy.context.scene
    sc.render.resolution_x = sc.render.resolution_y = CELL
    sc.render.film_transparent = True
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 48

    actions = {a.name: a for a in bpy.data.actions}
    for clip, count in CLIPS:
        if clip not in actions:
            sys.exit(f'{model} has no {clip} action')
        act = actions[clip]
        arm.animation_data_create()
        arm.animation_data.action = act
        lo, hi = act.frame_range
        for d in range(DIRS):
            # The camera looks down the 45 degree diagonal, so a model at yaw 0
            # faces one of the diagonals of the glass and not one of its edges.
            # 45 is the offset that puts direction 0 face-on to the viewer —
            # found by rendering all eight and looking at them, because which
            # way a rig calls forward is not something to reason about.
            yaw = math.radians(45 - 45 * d)
            for r in roots:
                r.rotation_euler = (r.rotation_euler.x, r.rotation_euler.y, yaw)
            for i in range(count):
                # Half a step in, never on the first frame: an action's keys
                # start at frame 1 and frame 0 is the bind pose, so sampling
                # the start of a one-frame clip gave every standing character
                # a T-pose — arms straight out, and wider than they were tall.
                sc.frame_set(round(lo + (hi - lo) * (i + 0.5) / count))
                sc.render.filepath = os.path.join(out, f'{d}_{clip}{i}.png')
                bpy.ops.render.render(write_still=True)
    print(f'rendered {model} in {DIRS} directions')


def main(out, kits):
    for name, kit, model in ACTORS:
        one(kits[kit], model, os.path.join(out, name))


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:]
    main(os.path.expanduser(argv[0]),
         {k: os.path.expanduser(v) for k, v in (a.split('=', 1) for a in argv[1:])})
