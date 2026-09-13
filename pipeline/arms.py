#!/usr/bin/env python3
"""What the player can be holding, and which mesh draws it.

Two scripts need this and neither can import the other.  `render_paperdoll.py`
runs inside Blender and imports `bpy` at the top of the file, so nothing
outside Blender can read it; `pack_paperdoll.py` runs under plain Python and is
the thing that writes `art/DOLL-CREDITS.md`, which has to name the author of
every mesh that ended up in a sheet.  A second copy of the table in the packer
is two lists that agree until somebody adds a sixth weapon, which is the exact
shape of mistake this repository has already paid for twice — the bake's file
list against the scene's draw list, and the reward slots against the reward
count.  So the table lives here and both read it.

The words are `spawn_npcs.WEAPON_SUBCLASS`'s.  One vocabulary for what a thing
is, whether an NPC is carrying it, the player is holding it in the world, or
the paperdoll is wearing it — `pipeline/bake_sprites.py` cuts LPC's strips
against the same five names.
"""
import json
import os

#: How tall a person stands, which is what every scale here is measured
#: against.  `render_actor.py` has its own copy of this number because it
#: photographs creatures rather than people and the two have never had to
#: agree; if they ever do, this is the one to import.
PERSON_YARDS = 1.8

#: Where in the asset tree the meshes are.  Quaternius's CC0 bundle, the same
#: shelf `render_kit.py` photographs the village out of.
WEAPON_ROOT = 'polypizza/Ultimate-RPG-Items-Bundle'

#: `{our word: (mesh, length in yards)}`.
#:
#: A **length** and not a scale factor, on purpose.  A scale factor is a fact
#: about one mesh at one export size — precisely the sort of number this
#: repository keeps finding tuned twice — where a length is a fact about the
#: object itself, and the rig's own measured height converts it.  A staff is a
#: person's height, so it is `PERSON_YARDS` and not 1.8 typed a second time.
#:
#: There is no staff in the bundle.  A polearm is the nearest thing on the
#: shelf and `WEAPON_SUBCLASS` already files a polearm under `staff`, so the
#: substitution is the vocabulary's rather than this file's.
WEAPONS = {
    'sword':  ('Sword.9lLmH8Et4K.glb', 1.2),
    'dagger': ('Dagger.kSMpR711Y2.glb', 0.4),
    'axe':    ('Axe-Double.uHXdfMmO8g.glb', 1.0),
    'mace':   ('Doublesided-Hammer.UIXvQ73DS1.glb', 0.8),
    'staff':  ('Spear.fH1zmvjPNx.glb', PERSON_YARDS),
}

#: Which bone a weapon hangs off.  The kit ships `wep_pos_L` and `wep_pos_R`
#: and names them, which is the whole reason the player can hold anything:
#: without an attachment point the only way to put a sword in a hand is to
#: place it by eye, once per pose, forty times per direction.
WEAPON_BONE = 'wep_pos_R'


def credits(assets):
    """`[(word, mesh name, author, licence)]`, out of the fetcher's own record.

    Read from `SOURCE.json` rather than written down here.  CC0 asks for
    nothing and Quaternius says so himself, but this repository refuses to ship
    a tile whose author nobody wrote down — `bake_tiles.py` exits rather than
    do it — and a rule that only applies when a licence forces it is not the
    rule it claims to be.
    """
    path = os.path.join(assets, 'polypizza', 'SOURCE.json')
    if not os.path.exists(path):
        return []
    with open(path) as f:
        doc = json.load(f)
    by_id = {}
    for pack in doc.get('packs', []):
        for row in pack.get('files', []):
            by_id[row['id']] = row
    out = []
    for word, (glb, _yards) in sorted(WEAPONS.items()):
        got = by_id.get(glb.split('.')[1], {})
        out.append((word, got.get('name', glb), got.get('author', ''),
                    got.get('licence', '')))
    return out
