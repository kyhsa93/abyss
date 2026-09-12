#!/usr/bin/env python3
"""Pack a rendered character into the sheet layout the scene already reads.

`render_actor.py` writes one PNG a cell because Blender's Python has no PIL.
This packs them, and packs them into exactly the shape `hero.json` already has
— a clip is a run of `directions x frames`, indexed `first + dir * frames + f`
— so the only thing `src/main.ts` has to learn is that there are eight
directions now instead of four.

  python3 pipeline/pack_actor.py <cell dir> <out dir> <name>

The atlas is laid out in one row a clip-direction rather than packed tight: a
transparent pixel costs nothing in the file and full price in decode memory
(`width * height * 4`), so the shape is chosen to keep the sheet small, not to
look tidy.
"""
import json
import os
import re
import sys

from PIL import Image

COLS = 16


def main(cells, out, name):
    files = [n for n in os.listdir(cells) if n.endswith('.png')]
    if not files:
        sys.exit(f'no cells in {cells}')
    cell = Image.open(os.path.join(cells, files[0])).size[0]

    found = {}
    for n in files:
        m = re.fullmatch(r'(\d+)_([a-z]+)(\d+)\.png', n)
        if not m:
            continue
        d, clip, f = int(m.group(1)), m.group(2), int(m.group(3))
        found.setdefault(clip, {}).setdefault(d, {})[f] = n
    dirs = max(len(v) for v in found.values())

    order, clips, at = [], {}, 0
    # `walk` first so that the standing frame is not in the middle of the cycle.
    for clip in sorted(found, key=lambda c: (c != 'walk', c)):
        frames = max(len(v) for v in found[clip].values())
        clips[clip] = {'first': at, 'count': frames}
        for d in range(dirs):
            for f in range(frames):
                order.append(found[clip][d][f])
                at += 1

    rows = (len(order) + COLS - 1) // COLS
    atlas = Image.new('RGBA', (COLS * cell, rows * cell))
    for i, n in enumerate(order):
        atlas.paste(Image.open(os.path.join(cells, n)),
                    ((i % COLS) * cell, (i // COLS) * cell))
    # Where the feet are, measured rather than typed: the camera is aimed at the
    # model's origin and the origin is the floor it stands on, so the foot line
    # falls near the middle of the cell and not near the bottom the way a drawn
    # sheet's does.  The lowest opaque row over every cell, because a walk
    # cycle's lowest frame is not its first.
    foot = 0
    for n in order:
        b = Image.open(os.path.join(cells, n)).getbbox()
        if b:
            foot = max(foot, b[3])
    os.makedirs(out, exist_ok=True)
    atlas.save(os.path.join(out, name + '.png'), optimize=True)
    meta = {'cell': cell, 'cols': COLS, 'dirs': dirs, 'clips': clips,
            'anchor': round(foot / cell, 4)}
    with open(os.path.join(out, name + '.json'), 'w') as f:
        json.dump(meta, f)
    print(f'{len(order)} cells of {cell}px -> {atlas.size[0]}x{atlas.size[1]}, '
          f'{dirs} directions, anchor {meta["anchor"]}, clips ' + ', '.join(
              f'{c} x{v["count"]}' for c, v in clips.items()))


if __name__ == '__main__':
    main(os.path.expanduser(sys.argv[1]), os.path.expanduser(sys.argv[2]), sys.argv[3])
