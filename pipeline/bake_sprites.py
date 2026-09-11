#!/usr/bin/env python3
"""Composite the player sprite out of Liberated Pixel Cup parts.

LPC is a modular pixel set: a body, and separate sheets for legs, torso, head,
hair and weapon that line up with it frame for frame, every one drawn in four
directions with a real walk cycle.  That last part is why it is here — a body
in this view has to face four ways and walk, and no amount of arithmetic on a
single still produces frames that agree with each other.

Licence is a condition rather than a courtesy: the parts are variously
CC-BY-SA 3.0, GPL 3.0, OGA-BY 3.0 and CC0, and every one names an author.  The
credits are collected from LPC's own `CREDITS.csv`, keyed by the files actually
composited, so the list cannot drift from what was used.

  python3 pipeline/bake_sprites.py ~/src/lpc public/art
"""
import csv
import json
import os
import sys

from PIL import Image

CELL = 64          # LPC's own cell
DIRECTIONS = 4     # up, left, down, right — in that row order

# Bottom to top.  Order is the whole of what makes a composite look like one
# person: boots under trousers, trousers under the cuirass, hair over the head.
LAYERS = [
    'body/bodies/male',
    'head/heads/human/male',
    'legs/pantaloons/male',
    'feet/boots/basic/male',
    'torso/armour/plate/male',
    'arms/armour/plate/male',
    'hair/plain/adult',
]

# Animations to take, and how many frames each sheet holds.
CLIPS = [('walk', 9), ('idle', 2), ('slash', 6)]


def sheet(root, layer, clip):
    p = os.path.join(root, 'spritesheets', layer, f'{clip}.png')
    return Image.open(p).convert('RGBA') if os.path.exists(p) else None


def main(root, out):
    if not os.path.isdir(os.path.join(root, 'spritesheets')):
        sys.exit(f'no LPC spritesheets under {root}')

    used = []
    clips = {}
    frames = []
    for clip, count in CLIPS:
        base = None
        for layer in LAYERS:
            im = sheet(root, layer, clip)
            if im is None:
                continue
            used.append(f'{layer}/{clip}.png')
            if base is None:
                base = Image.new('RGBA', im.size)
            if im.size != base.size:
                # A layer that does not line up frame for frame is not a layer;
                # dropping it silently would show up as a limb that lags.
                print(f'  ! {layer}/{clip}.png is {im.size}, expected {base.size} — skipped')
                continue
            base = Image.alpha_composite(base, im)
        if base is None:
            sys.exit(f'no sheets at all for {clip}')
        w, h = base.size
        n = w // CELL
        clips[clip] = {'first': len(frames), 'count': n, 'dirs': h // CELL}
        for d in range(h // CELL):
            for f in range(n):
                frames.append(base.crop((f * CELL, d * CELL, f * CELL + CELL, d * CELL + CELL)))

    cols = 16
    rows = (len(frames) + cols - 1) // cols
    atlas = Image.new('RGBA', (cols * CELL, rows * CELL))
    for i, fr in enumerate(frames):
        atlas.paste(fr, ((i % cols) * CELL, (i // cols) * CELL))
    os.makedirs(out, exist_ok=True)
    atlas.save(os.path.join(out, 'hero.png'), optimize=True)
    with open(os.path.join(out, 'hero.json'), 'w') as f:
        json.dump({'cell': CELL, 'cols': cols, 'clips': clips}, f, indent=1)

    # Credits, keyed by the files actually used.
    rows_csv = list(csv.DictReader(open(os.path.join(root, 'CREDITS.csv'))))
    by_file = {r['filename']: r for r in rows_csv}
    seen = {}
    for u in used:
        r = by_file.get(u)
        if not r:
            # Fall back to the layer's directory: LPC lists per animation and a
            # missing row is a gap in their table, not a licence-free file.
            cand = [x for k, x in by_file.items() if k.startswith(os.path.dirname(u) + '/')]
            r = cand[0] if cand else None
        if not r:
            sys.exit(f'{u} has no row in CREDITS.csv — refusing to ship an unattributed layer')
        seen[os.path.dirname(u)] = r

    with open('art/LPC-CREDITS.md', 'w') as f:
        f.write('# Sprite credits\n\n')
        f.write('The player sprite is composited by `pipeline/bake_sprites.py` from\n')
        f.write('[Liberated Pixel Cup](https://lpc.opengameart.org/) parts. The parts are\n')
        f.write('variously CC-BY-SA 3.0, GPL 3.0, OGA-BY 3.0 and CC0; attribution is a\n')
        f.write('condition of the first three, so this list is generated from the same\n')
        f.write('layer table the sprite is built from and cannot fall behind it.\n\n')
        for layer, r in sorted(seen.items()):
            f.write(f'- `{layer}` — {r["authors"].strip()} ({r["licenses"].strip()})\n')
        f.write('\n**The game inherits the strongest of these.** GPL 3.0 and CC-BY-SA 3.0\n')
        f.write('both carry, so the game carries them too — see the wiki page 아트 방향.\n')

    px = atlas.width * atlas.height * 4
    print(f'{len(frames)} frames, atlas {atlas.width}x{atlas.height}, '
          f'{os.path.getsize(os.path.join(out, "hero.png")) / 1024:.0f} KiB on disk, '
          f'{px / 1048576:.1f} MiB decoded')
    print('  clips: ' + ', '.join(f'{k} x{v["count"]} in {v["dirs"]} dirs' for k, v in clips.items()))

    contact = Image.new('RGB', (CELL * 9 * 2, CELL * 4 * 2), (40, 44, 56))
    walk = clips['walk']
    for d in range(walk['dirs']):
        for i in range(walk['count']):
            fr = frames[walk['first'] + d * walk['count'] + i]
            contact.paste(fr.resize((CELL * 2, CELL * 2), Image.NEAREST),
                          (i * CELL * 2, d * CELL * 2), fr.resize((CELL * 2, CELL * 2), Image.NEAREST))
    contact.save(os.path.join(out, 'hero-contact.png'))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/src/lpc'),
         sys.argv[2] if len(sys.argv) > 2 else 'public/art')
