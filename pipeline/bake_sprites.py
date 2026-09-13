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

# What he can have in his hand, front half and behind half.
#
# The same five `bake_npcs.py` cuts for everybody else, and the same reason
# they are a layer rather than part of a look: a weapon is what he is holding
# this minute, not what he is.  712 of the slice's people carry one and the
# player was the only body in the world with nothing in his hands.
#
# **The frames are not the NPCs'.**  Those are sampled at five of the walk's
# nine, which is enough for somebody on the far side of a field and would put
# the player's sword a frame behind his own hand.  His walk is all nine, so
# these are all nine.
ARMS = {
    'sword': ('sword/longsword/walk/longsword.png',
              'sword/longsword/universal_behind/walk/longsword.png'),
    'dagger': ('sword/dagger/walk/dagger.png',
               'sword/dagger/behind/walk/dagger.png'),
    'axe': ('blunt/waraxe/walk/waraxe.png',
            'blunt/waraxe/behind/walk/waraxe.png'),
    'mace': ('blunt/mace/walk/mace.png',
             'blunt/mace/universal_behind/walk/mace.png'),
    'staff': ('magic/gnarled/universal/walk/foreground.png',
              'magic/gnarled/universal/walk/background.png'),
}


def trim(im, cols, dirs):
    """The one box every cell of a sheet fits inside, as `(x, y, w, h)`.

    A weapon is a small thing in a 64-pixel cell — a dagger is 40 by 22 — and
    ten halves of thirty-six frames at the full cell is 5.6 MiB of mostly
    nothing decoded.  Trimmed to a box a sheet it is 1.8.  One box a sheet and
    not one a frame: the offset then costs nothing to carry and the hand still
    lands where the artist put it, because every frame is cropped the same way.
    """
    px = im.load()
    lo_x, lo_y, hi_x, hi_y = CELL, CELL, -1, -1
    for d in range(dirs):
        for f in range(cols):
            for y in range(CELL):
                for x in range(CELL):
                    if px[f * CELL + x, d * CELL + y][3]:
                        lo_x = min(lo_x, x); hi_x = max(hi_x, x)
                        lo_y = min(lo_y, y); hi_y = max(hi_y, y)
    if hi_x < 0:
        return None
    return lo_x, lo_y, hi_x - lo_x + 1, hi_y - lo_y + 1


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

    # What is in his hand, laid out as a strip a half rather than on the
    # body's grid: each one is trimmed to its own box, so they have ten
    # different cell sizes and a uniform atlas would be the untrimmed one.
    arms, strips = {}, []
    for name, halves in ARMS.items():
        for half, rel in zip(('', '.bg'), halves):
            path = os.path.join(root, 'spritesheets', 'weapon', rel)
            if not os.path.exists(path):
                sys.exit(f'missing {path} — a hand with a hole in it is a bug')
            used.append(f'weapon/{rel}')
            im = Image.open(path).convert('RGBA')
            cols_, dirs = im.width // CELL, im.height // CELL
            if (cols_, dirs) != (CLIPS[0][1], DIRECTIONS):
                sys.exit(f'{rel} is {cols_}x{dirs} cells, not the walk\'s '
                         f'{CLIPS[0][1]}x{DIRECTIONS}')
            box = trim(im, cols_, dirs)
            if not box:
                sys.exit(f'{rel} is empty')
            bx, by, bw, bh = box
            strip = Image.new('RGBA', (cols_ * bw, dirs * bh))
            for d in range(dirs):
                for f in range(cols_):
                    strip.paste(im.crop((f * CELL + bx, d * CELL + by,
                                         f * CELL + bx + bw, d * CELL + by + bh)),
                                (f * bw, d * bh))
            arms[name + half] = {'w': bw, 'h': bh, 'dx': bx, 'dy': by,
                                 'cols': cols_, 'dirs': dirs}
            strips.append((name + half, strip))

    cols = 16
    rows = (len(frames) + cols - 1) // cols
    atlas = Image.new('RGBA', (cols * CELL, rows * CELL))
    for i, fr in enumerate(frames):
        atlas.paste(fr, ((i % cols) * CELL, (i // cols) * CELL))
    os.makedirs(out, exist_ok=True)
    atlas.save(os.path.join(out, 'hero.png'), optimize=True)

    # The hands, in their own sheet: they are ten strips of ten different cell
    # sizes and there is no grid they all belong to.
    wide = max(s.width for _n, s in strips)
    tall = sum(s.height for _n, s in strips)
    hands = Image.new('RGBA', (wide, tall))
    y = 0
    for name, strip in strips:
        hands.paste(strip, (0, y))
        arms[name]['y'] = y
        y += strip.height
    hands.save(os.path.join(out, 'arms.png'), optimize=True)

    with open(os.path.join(out, 'hero.json'), 'w') as f:
        json.dump({'cell': CELL, 'cols': cols, 'clips': clips, 'arms': arms}, f,
                  indent=1)

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
        # And up the path, because LPC's register does not spell a weapon's
        # path the way LPC's own tree does: on disk a sheet is
        # `<pose>/<variant>.png` and in the register it is `<variant>/<pose>.png`,
        # so both lookups above miss every one of them.  Safe for the reason
        # `bake_npcs.py` checked when it hit this first: every row under a
        # weapon's own folder carries the same authors and the same licences.
        while not r and '/' in u:
            u = u.rsplit('/', 1)[0]
            cand = [x for k, x in by_file.items() if k.startswith(u + '/')]
            if len({(x['authors'], x['licenses']) for x in cand}) == 1:
                r = cand[0]
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
    hpx = hands.width * hands.height * 4
    print(f'  in hand: {len(arms)} halves, atlas {hands.width}x{hands.height}, '
          f'{os.path.getsize(os.path.join(out, "arms.png")) / 1024:.0f} KiB on '
          f'disk, {hpx / 1048576:.2f} MiB decoded  ('
          + ', '.join(f'{k} {v["w"]}x{v["h"]}' for k, v in arms.items()) + ')')

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
