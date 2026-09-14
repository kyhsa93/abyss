#!/usr/bin/env python3
"""Photograph a character one equipment slot at a time, so gear can be swapped.

The NPCs of this world never change their clothes, so a townsman is drawn once
with his shirt on and that is the whole of it.  The player is the exception,
and the exception is structural: equipment means the shirt has to be a separate
picture from the body, registered to it pixel for pixel across every direction
and every frame.  An image model cannot do that — it has no memory between
calls, so the second call's shirt does not fit the first call's body — which is
why the player is rendered and not generated.

Rendering gets registration for free.  Every layer is the same rig in the same
pose under the same camera, so they cannot drift.  Occlusion comes free too,
which is the part a drawn paperdoll has to solve with a per-direction ordering
table: the always-worn body is a **holdout** while any other layer is
photographed, so an arm swinging in front of the breastplate punches an
arm-shaped hole in it, and drawing the layers in order rebuilds exactly what
the 3D scene showed.  A holdout only cuts where it is nearer the camera, so the
torso *inside* the breastplate takes nothing out of it.

  blender --background <kit>/human_male.blend --python pipeline/render_paperdoll.py \
      -- <out dir>

writes `<out>/<slot>_<variant>/<dir>_<clip><frame>.png`, which
`pipeline/pack_paperdoll.py` packs.  Run `paperdoll_slots.py` under Blender
2.79 first; this reads the `.slots.json` it leaves next to the blend.
"""
import json
import math
import os
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# The five weapons and how long each of them is.  The table is in its own file
# because `pack_paperdoll.py` needs the same one to credit the meshes it packed
# and cannot import this one — `bpy` is at the top of it.
from arms import (PERSON_YARDS, WEAPON_BONE,  # noqa: E402
                  WEAPON_ROOT, WEAPONS)

PPY = 24                # pixels to the yard at zoom 1, as in main.ts
# The quarter view is gone — the scene went flat on 2026-09-12 and nothing
# rendered at this camera sits on that ground.  Kept because the arithmetic
# is right and this is still the only thing here that composites a body out
# of slots; see CLAUDE.md, "The rendered art is on the shelf".
TILT = math.atan(0.5)   # the old quarter view's elevation, 26.57 degrees
CELL = 128
DIRS = 8

# What the catalogue calls an action against what this rig actually has.
# `pipeline/actions.py` is the vocabulary; this is one kit's share of it, and
# the gaps are real rather than hidden — see UNSOURCED below.
#
#   (clip, action, frames, span)
#
# `span` is where in the action to sample, as a fraction.  It exists for `dead`,
# which is the last pose of the fall and not the middle of it, and it is the
# same mechanism that would play a clip backwards.
CLIPS = (
    ('stand',        'idle',                          1, (0.0, 1.0)),
    # The kit has no walk, only a run.  That is not a gap worth faking: a
    # player in this game runs, the way a player in the game it is modelled on
    # runs, and walking is the toggle almost nobody presses.  `walk` is packed
    # as an alias of these same cells rather than as four more of them.
    ('run',          'run',                           4, (0.0, 1.0)),
    ('ready_melee',  'idle_combat_main_hand_melee',   1, (0.0, 1.0)),
    ('attack',       'cast_main_hand_melee',          3, (0.0, 1.0)),
    ('attack_off',   'cast_dual_wield_melee',         2, (0.0, 1.0)),
    ('block',        'cast_off_hand_shield',          1, (0.0, 1.0)),
    ('ready_spell',  'idle_combat_main_hand_wand',    1, (0.0, 1.0)),
    ('precast',      'power_up',                      2, (0.0, 1.0)),
    ('cast_directed', 'cast_main_hand_wand',          2, (0.0, 1.0)),
    ('cast_instant', 'cast_unarmed_magic',            2, (0.0, 1.0)),
    ('channel',      'channel_unarmed_magic',         2, (0.0, 1.0)),
    ('ready_bow',    'idle_combat_two_handed_bow',    1, (0.0, 1.0)),
    ('draw',         'channel_two_handed_bow',        2, (0.0, 1.0)),
    ('loose',        'cast_two_handed_bow',           2, (0.0, 1.0)),
    ('death',        'death',                         3, (0.0, 1.0)),
    ('dead',         'death',                         1, (0.92, 1.0)),
    ('kneel',        'pray',                          1, (0.0, 1.0)),
    ('loot',         'gathering',                     2, (0.0, 1.0)),
    ('work',         'gathering',                     3, (0.0, 1.0)),
    ('eat',          'drink_potion',                  2, (0.0, 1.0)),
)

def unsourced(alias=('walk',)):
    """Clips a human has in the catalogue that this rig has nothing for.

    Worked out against `actions.py` rather than typed, because a list of gaps
    that is maintained by hand goes stale the first time somebody adds a clip
    at either end and then reads it as the truth.  Printed on every run: an
    absence looks exactly like an oversight unless something says it out loud.
    """
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import actions
    got = {c for c, _a, _n, _s in CLIPS} | set(alias)
    return [c for c in actions.order('human') if c not in got]

# Which slot a part belongs to, read off the words in its name.  Not off the
# end of it: the kit writes `head_2` and `light_armor_2`, so the word that says
# what a thing is sits wherever the author left it.  Reading the name rather
# than keeping a written-out table is what lets the female blend — twenty-seven
# parts against the male's thirty-two — go through this script untouched.
SLOT_OF = {'armor': 'chest', 'boots': 'feet', 'gloves': 'hands',
           'helmet': 'helm', 'hair': 'hair', 'head': 'head',
           'body': 'body', 'feet': 'feet', 'hands': 'hands'}

# Back to front.  `chest` before `hands` so a gauntlet crossing the belly is
# drawn over the breastplate and not under it; `helm` over hair because it is
# the one garment that covers everything else it touches; and the weapon in
# front of all of it, because a sword held out crosses the body rather than
# being worn on it.  What keeps the *hand* on top of the hilt is not this
# order but the holdout — see `HOLDOUT`.
ORDER = ('body', 'feet', 'chest', 'hands', 'head', 'hair', 'helm', 'weapon')

# The parts that are on the character no matter what is equipped, which is the
# holdout set: they are what an arm crossing a breastplate is made of.
ALWAYS = ('body', 'head')

# What the character is when nothing is equipped, which is what `PERSON_YARDS`
# is a statement about.  It is not the holdout set and the difference is a
# whole foot: this kit's `body` mesh stops at the ankle, so measuring the scale
# off body and head alone made the man the right height and then stood him in
# boots that reached fourteen pixels below the floor.
NAKED = ('body', 'head', 'feet', 'hands')

# And what else is held out while one particular slot is photographed.  The
# weapon needs the bare hand as well as the body: a hilt is *inside* a fist, so
# without the hand cutting its own hole the sword comes out drawn over the
# fingers that are meant to be gripping it.  The hole is the bare hand's, which
# is why a glove drawn under the weapon still shows through — a glove is bigger
# than the hand in it.
HOLDOUT = {'weapon': ('hands',)}

# Where the art that is not the kit's comes from.
ASSETS = os.path.expanduser(os.environ.get('ABYSS_ASSETS', '~/src/abyss-assets'))



def unhide():
    """Let every part render.

    The kit was authored in 2.79, where each variant sat on its own scene
    layer and only two of the twenty were switched on for rendering.  4.5 turns
    a layer into a collection and that switch into `collection.hide_render`, so
    opening the file and asking for the heavy armour gets a man in his
    underwear — no error, no warning, and a perfectly plausible picture.
    """
    for c in bpy.data.collections:
        c.hide_render = c.hide_viewport = False


def part_of(o):
    """(slot, variant) for a mesh, or None if it is not part of the doll.

    `human_male_light_armor_2` is the chest slot in its `light_2` version, and
    `human_male_head_default` is the head slot bare.  Everything the kit is
    unequipped in is spelled `default` and everything this repository is
    unequipped in is spelled `bare`, and one of those spellings has to win here
    rather than in six places downstream.
    """
    words = o.name.split('_')
    hit = [i for i, w in enumerate(words) if w in SLOT_OF]
    if not hit:
        return None
    i = hit[-1]
    rest = [w for j, w in enumerate(words[2:], 2) if j != i and w != 'default']
    return SLOT_OF[words[i]], '_'.join(rest) or 'bare'


def slot_of(o):
    got = part_of(o)
    return got[0] if got else None


def parts(arm, slots):
    """Every mesh, grouped by slot, rigged and textured.

    The variants ship unparented and without an armature modifier, but they all
    carry the rig's forty-one vertex groups — they are skinned, just not
    attached — so attaching them is two lines and they deform with everything
    else.
    """
    kit = os.path.dirname(bpy.data.filepath)
    found = {}
    for o in list(bpy.data.objects):
        if o.type != 'MESH' or o.name not in slots:
            continue
        got = part_of(o)
        if got is None:
            continue
        slot, variant = got
        if not any(m.type == 'ARMATURE' for m in o.modifiers):
            o.parent = arm
            o.modifiers.new('rig', 'ARMATURE').object = arm
        texture(o, slots[o.name], os.path.join(kit, 'textures'))
        found.setdefault(slot, {})[variant] = o
    return found


def texture(o, mats, where):
    """Rebuild the material as nodes around the image 2.79 said it uses.

    `Closest` because the textures are 512-pixel hand-painted sheets read at a
    tenth of that size: smoothing them turns every painted edge into mud, and
    the whole reason for rendering at this scale is that the edges survive.
    """
    for i, (_name, tex) in enumerate(mats):
        if i >= len(o.data.materials) or not o.data.materials[i]:
            continue
        m = o.data.materials[i]
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
        img = nt.nodes.new('ShaderNodeTexImage')
        img.image = bpy.data.images.load(os.path.join(where, tex),
                                         check_existing=True)
        img.interpolation = 'Closest'
        bsdf.inputs['Roughness'].default_value = 0.65
        bsdf.inputs['Metallic'].default_value = 0.0
        nt.links.new(img.outputs['Color'], bsdf.inputs['Base Color'])
        nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])


def plain(o):
    """The bundle's own materials, lit the way everything else here is lit.

    Only two inputs are touched.  glTF ships physically-based metal, and a
    mirror-finish blade beside a hand-painted linen shirt reads as two games —
    the same argument `texture()` makes one function up, for the same reason.
    """
    for m in o.data.materials:
        if not m or not m.use_nodes:
            continue
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                n.inputs['Metallic'].default_value = 0.0
                n.inputs['Roughness'].default_value = 0.65


def weapons(arm, tall):
    """Import each weapon, size it by its own length, hang it off the hand.

    Three things are derived here and none of them is placed by eye.

    The **scale** is the weapon's stated length in yards against the rig's own
    measured height, so a kit re-exported at a different size still comes out
    right.  A scale factor written down instead would be a fact about one
    export — exactly the shape of number this repository keeps finding tuned
    twice.

    The **grip** is the mesh's origin.  Quaternius's bundle puts it in the
    hand: the sword's own box runs from -0.38 to 1.92 along its long axis, so
    the pommel is behind the origin and the blade in front of it, which is
    where a fist goes.  Nothing has to be measured.

    The **aim** is the bone's.  `wep_pos_R` exists, it is a tenth of a unit
    long and it points somewhere on purpose, so the weapon's long axis is
    turned onto the bone's and the kit's author decides which way a sword
    points.  Without an attachment point the only way to put a sword in a hand
    is by eye, once per pose, forty times per direction.
    """
    bone = arm.data.bones[WEAPON_BONE]
    per_yard = tall / PERSON_YARDS
    root = os.path.join(ASSETS, WEAPON_ROOT)
    out = {}
    for word, (glb, yards) in sorted(WEAPONS.items()):
        path = os.path.join(root, glb)
        if not os.path.exists(path):
            sys.exit('%s is not in the archive — run `npm run fetch polypizza`'
                     % path)
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=path)
        fresh = [o for o in bpy.data.objects if o not in before]
        mesh = [o for o in fresh if o.type == 'MESH']
        if not mesh:
            sys.exit('no mesh in ' + glb)
        bpy.ops.object.select_all(action='DESELECT')
        for o in mesh:
            o.select_set(True)
        bpy.context.view_layer.objects.active = mesh[0]
        if len(mesh) > 1:
            bpy.ops.object.join()
        o = bpy.context.view_layer.objects.active
        # The importer hangs everything off an empty that carries the Y-up to
        # Z-up turn.  Baking that turn into the mesh and dropping the empty is
        # what makes the long axis local `z` rather than "whatever the parent
        # says", which is what the arithmetic below reads.
        bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
        bpy.ops.object.transform_apply(location=False, rotation=True,
                                       scale=True)
        for e in fresh:
            if e.name in bpy.data.objects and e.type != 'MESH':
                bpy.data.objects.remove(e, do_unlink=True)
        zs = [v.co.z for v in o.data.vertices]
        long = max(zs) - min(zs)
        k = yards * per_yard / long
        o.name = 'weapon_' + word
        o.scale = (k, k, k)
        # The blade's own `z` onto the bone's local `x`, which is `y` about
        # `+Y` — and which of the bone's six axes that is was **measured, not
        # assumed**.  The obvious reading is the bone's length, `+Y`, and it is
        # wrong here: posed for the idle, `wep_pos_R`'s `y` runs straight out
        # in front of the man and its `x` runs straight down (0.006, -1.000,
        # 0.001) against (-0.194, -0.002, -0.981).  Aligned to `y` he stands
        # there holding a greatsword out level with one hand; aligned to `x` it
        # hangs at his side, which is what a man at rest does with a sword.
        # Rendering all six and looking is the only thing that says so, the
        # same way a spritesheet's grid is cut and looked at rather than
        # divided.
        o.rotation_mode = 'XYZ'
        o.rotation_euler = (0, math.pi / 2, 0)
        o.parent = arm
        o.parent_type = 'BONE'
        o.parent_bone = WEAPON_BONE
        # Bone parenting measures from the *tail*, so the grip lands a bone's
        # length past the hand unless it is walked back.
        o.location = (0, -bone.length, 0)
        plain(o)
        out[word] = o
        print('  %-8s %.2f yd, %s -> x%.4f' % (word, yards, glb, k))
    return out


def camera(tall, floor):
    """Orthographic, 2:1, down the 45 degree diagonal — the scene's own camera.

    Aimed at the middle of the body rather than at the origin it stands on.
    The first version of this in `render_actor.py` framed the feet, which left
    half a cell of headroom and cut the head off the moment the scale was right.
    """
    d = 30
    bpy.ops.object.camera_add(
        location=(d, -d, d * math.tan(TILT) * math.sqrt(2) + floor + tall / 2))
    cam = bpy.context.active_object
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 8.0          # a starting guess; `fit` solves it
    cam.rotation_euler = (math.pi / 2 - TILT, 0, math.radians(45))
    bpy.context.scene.camera = cam
    return cam


def fit(cam, body):
    """Set the zoom so the character stands exactly as tall as the yard says.

    Solved rather than nudged.  An orthographic frame is linear, so projecting
    the posed body through the camera once gives the height it renders at, and
    the scale that puts it on `PERSON_YARDS * PPY * cos(elevation)` is that
    number times a ratio.  There is nothing to look at and nothing to try
    twice, which is the point: the arithmetic that produced this kit's size is
    not the arithmetic that produced Kenney's, and a constant copied between
    them would be wrong in a way that only shows up as a person who is subtly
    the wrong size next to a fence.
    """
    sc = bpy.context.scene
    dg = bpy.context.evaluated_depsgraph_get()
    lo = hi = None
    for o in body:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        for v in me.vertices:
            y = world_to_camera_view(sc, cam, o.matrix_world @ v.co).y
            lo = y if lo is None else min(lo, y)
            hi = y if hi is None else max(hi, y)
        ev.to_mesh_clear()
    want = PERSON_YARDS * PPY * math.cos(TILT)
    cam.data.ortho_scale *= ((hi - lo) * CELL) / want
    print('fit: %.1fpx -> %.1fpx, ortho %.3f'
          % ((hi - lo) * CELL, want, cam.data.ortho_scale))
    return want


def light():
    """One warm key on the camera's own side, one cold fill behind.

    The same two suns every other rendered thing in this repository is lit by,
    because a sprite lit differently from the fence beside it reads as a sprite
    from a different game.  `Standard` and not Blender's default view transform:
    AgX rolls a lit surface off towards white, and a hand-painted texture put
    through it comes back as a man in cream-coloured everything.
    """
    sc = bpy.context.scene
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
    sc.view_settings.view_transform = 'Standard'


def main(out):
    slots = json.load(open(bpy.data.filepath + '.slots.json'))
    unhide()
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    arm.rotation_mode = 'XYZ'
    arm.animation_data_create()
    by_slot = parts(arm, slots)
    missing = [s for s in ALWAYS if s not in by_slot]
    if missing:
        sys.exit('no %s part in %s' % (', '.join(missing), bpy.data.filepath))

    actions = {a.name: a for a in bpy.data.actions}
    stem = os.path.basename(bpy.data.filepath).rsplit('.', 1)[0]

    def action(name):
        return actions.get(stem + '_' + name)

    gone = [c for c, a, _n, _s in CLIPS if action(a) is None]
    if gone:
        sys.exit('no action for: ' + ', '.join(gone))

    sc = bpy.context.scene
    sc.render.resolution_x = sc.render.resolution_y = CELL
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 32

    body = [by_slot[s]['bare'] for s in ALWAYS if 'bare' in by_slot[s]]
    naked = [by_slot[s]['bare'] for s in NAKED if 'bare' in by_slot.get(s, {})]
    if len(body) != len(ALWAYS) or len(naked) != len(NAKED):
        sys.exit('missing a bare part: %s'
                 % {s: sorted(by_slot.get(s, {})) for s in NAKED})
    arm.animation_data.action = action('idle')
    sc.frame_set(int(action('idle').frame_range[0]) + 1)
    dg = bpy.context.evaluated_depsgraph_get()
    zs = [(o.matrix_world @ v.co).z
          for o in naked for v in o.evaluated_get(dg).to_mesh().vertices]
    floor, tall = min(zs), max(zs) - min(zs)
    cam = camera(tall, floor)
    light()
    fit(cam, naked)
    # After `fit`, always: the camera is sized on the person and a staff is
    # taller than he is, so importing first would shrink him to fit his stick.
    by_slot['weapon'] = weapons(arm, tall)

    every = [(s, v, o) for s in ORDER for v, o in sorted(by_slot.get(s, {}).items())]
    gaps = unsourced()
    print('%d layers over %d slots, %d clips' % (len(every), len(by_slot), len(CLIPS)))
    print('no pose in this rig for %d of the catalogue: %s'
          % (len(gaps), ', '.join(gaps)))

    for slot, variant, obj in every:
        # Only this layer is photographed.  Everything the character always
        # wears stays in the scene as a holdout so it cuts this layer wherever
        # it is in front of it — except whatever sits in the same slot, which
        # this part replaces rather than covers: a bare hand held out as a
        # holdout would punch the glove worn over it clean through.
        for o in bpy.data.objects:
            if o.type == 'MESH':
                o.hide_render = True
                o.is_holdout = False
        obj.hide_render = False
        cutters = list(body)
        for extra in HOLDOUT.get(slot, ()):
            if 'bare' in by_slot.get(extra, {}):
                cutters.append(by_slot[extra]['bare'])
        for o in cutters:
            if slot_of(o) == slot:
                continue        # replaced by this layer, not covered by it
            o.hide_render = False
            o.is_holdout = True

        where = os.path.join(out, '%s_%s' % (slot, variant))
        os.makedirs(where, exist_ok=True)
        for clip, name, count, (a, b) in CLIPS:
            act = action(name)
            arm.animation_data.action = act
            lo, hi = act.frame_range
            for d in range(DIRS):
                arm.rotation_euler = (0, 0, math.radians(45 - 45 * d))
                for i in range(count):
                    # Half a step in, never on the first frame: an action's
                    # keys start at frame 1 and frame 0 is the bind pose, so
                    # sampling the start of a one-frame clip renders a T-pose.
                    t = a + (b - a) * ((i + 0.5) / count)
                    sc.frame_set(int(round(lo + (hi - lo) * t)))
                    sc.render.filepath = os.path.join(
                        where, '%d_%s%d.png' % (d, clip, i))
                    bpy.ops.render.render(write_still=True)
        print('  %s_%s' % (slot, variant))
    print('%d layers -> %s' % (len(every), out))


if __name__ == '__main__':
    main(os.path.expanduser(sys.argv[sys.argv.index('--') + 1]))
