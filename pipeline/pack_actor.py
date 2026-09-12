#!/usr/bin/env python3
"""Pack the rendered people into one sheet the scene can read.

`render_actor.py` writes one PNG a cell, in a directory an actor, because
Blender's Python has no PIL.  This packs the lot into the shape the drawn
sheets already have — a kind is a run of `directions x frames`, indexed
`first + dir * frames + f` — so the only thing `src/main.ts` learns is that
some kinds have eight directions and some have four.

  python3 pipeline/pack_actor.py <render dir> <out dir> <name>

**The cell is measured, not the render's.**  A character occupies about 28
pixels of the 80 it is rendered into, and the rest is transparent — which costs
nothing in the file and full price in memory, because a decoded atlas is
`width * height * 4` whatever is in it.  Cropping every cell to the union of
what is actually drawn takes this sheet from 9 MB decoded to under 2.
"""
import json
import os
import re
import sys

from PIL import Image

COLS = 16


def cells_of(root):
    """Every rendered cell, as {actor: {clip: {dir: {frame: path}}}}."""
    out = {}
    for actor in sorted(os.listdir(root)):
        d = os.path.join(root, actor)
        if not os.path.isdir(d):
            continue
        for n in os.listdir(d):
            m = re.fullmatch(r'(\d+)_([a-z]+)(\d+)\.png', n)
            if not m:
                continue
            direction, clip, frame = int(m.group(1)), m.group(2), int(m.group(3))
            (out.setdefault(actor, {}).setdefault(clip, {})
                .setdefault(direction, {}))[frame] = os.path.join(d, n)
    return out


def main(root, out, name):
    found = cells_of(root)
    if not found:
        sys.exit(f'no rendered cells under {root}')

    # One box for every cell in the sheet, so a frame never shifts against its
    # neighbours: the union of what each of them draws.
    box = None
    paths = [p for a in found.values() for c in a.values()
             for d in c.values() for p in d.values()]
    for p in paths:
        b = Image.open(p).getbbox()
        if b is None:
            continue
        box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]),
                                     max(box[2], b[2]), max(box[3], b[3]))
    # Square, because the scene draws a cell square and a yard is a yard either
    # way round.
    w, h = box[2] - box[0], box[3] - box[1]
    side = max(w, h) + 2
    cx, cy = (box[0] + box[2]) // 2, (box[1] + box[3]) // 2
    crop = (cx - side // 2, cy - side // 2, cx - side // 2 + side,
            cy - side // 2 + side)
    foot = box[3] - crop[1]

    order, kinds, at = [], {}, 0
    for actor in sorted(found):
        clips = found[actor]
        dirs = max(len(v) for v in clips.values())
        frames = max(len(f) for c in clips.values() for f in c.values())
        kinds[actor] = {'first': at, 'frames': frames, 'dirs': dirs,
                        'clips': {}}
        for clip in sorted(clips, key=lambda c: (c != 'walk', c)):
            n = max(len(f) for f in clips[clip].values())
            kinds[actor]['clips'][clip] = {'first': at, 'count': n}
            for d in range(dirs):
                for i in range(n):
                    order.append(clips[clip][d][i])
                    at += 1

    rows = (len(order) + COLS - 1) // COLS
    atlas = Image.new('RGBA', (COLS * side, rows * side))
    for i, p in enumerate(order):
        atlas.paste(Image.open(p).crop(crop),
                    ((i % COLS) * side, (i // COLS) * side))
    os.makedirs(out, exist_ok=True)
    atlas.save(os.path.join(out, name + '.png'), optimize=True)
    meta = {'cell': side, 'cols': COLS, 'anchor': round(foot / side, 4),
            'kinds': kinds}
    with open(os.path.join(out, name + '.json'), 'w') as f:
        json.dump(meta, f)
    print(f'{len(order)} cells of {side}px -> {atlas.size[0]}x{atlas.size[1]} '
          f'({atlas.size[0] * atlas.size[1] * 4 / 1e6:.1f} MB decoded), '
          f'anchor {meta["anchor"]}, {len(kinds)} actors')


if __name__ == '__main__':
    main(os.path.expanduser(sys.argv[1]), os.path.expanduser(sys.argv[2]), sys.argv[3])
