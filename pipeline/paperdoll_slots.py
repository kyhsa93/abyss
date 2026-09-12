#!/usr/bin/env python3
"""Write down which texture each part of the modular character actually uses.

  blender279 --background <kit>/human_male.blend --python pipeline/paperdoll_slots.py

writes `<blend>.slots.json`, which `render_paperdoll.py` then reads.

**This needs Blender 2.79 and the render needs 4.5, and the split is not a
preference.**  The kit was authored in 2.79, where a material points at its
image through `texture_slots`.  4.5 opens the file — geometry, armature, all
fifty actions survive — but that link does not: the materials arrive with
`use_nodes` off and no way to ask what they were textured with.  So the answer
is read once, in the version that can still answer, and handed over as data.

Guessing the name instead does not work, and the way it fails is quiet.  Nine
of the male's thirty-two parts are textured from the *female* sheet — his
boots, gloves and helmets at every weight, and his heavy armour — so
`mat_human_male_heavy_boots` wants `tex_human_female_heavy_boots.png`.  Every
one of those would have loaded some other file, or none, and rendered a
plausible boot.
"""
import json
import os
import sys

import bpy


def main():
    out = {}
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        slots = []
        for m in o.data.materials:
            if not m:
                continue
            tex = None
            # The first slot with an image wins.  A 2.79 material can stack
            # eight of them — normal maps, specular — and this kit only ever
            # uses the first for colour.
            for ts in m.texture_slots:
                if ts and ts.texture and getattr(ts.texture, 'image', None):
                    tex = os.path.basename(ts.texture.image.filepath)
                    break
            slots.append([m.name, tex])
        if slots:
            out[o.name] = slots

    blind = [n for n, s in out.items() if any(t is None for _, t in s)]
    if blind:
        sys.exit('no image on: ' + ', '.join(sorted(blind)))

    path = bpy.data.filepath + '.slots.json'
    with open(path, 'w') as f:
        json.dump(out, f, indent=1, sort_keys=True)
    print('%d meshes, %d materials -> %s'
          % (len(out), sum(len(s) for s in out.values()), path))


if __name__ == '__main__':
    main()
