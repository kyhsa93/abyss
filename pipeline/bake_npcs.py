#!/usr/bin/env python3
"""Cut every inhabitant of the slice out of LPC art into one atlas.

Two halves, for two reasons.

**People** are composited the way `bake_sprites.py` composites the player: a
body, a head, clothes, each drawn in four directions and lining up frame for
frame.  The only addition is a palette swap, and it is LPC's own — the base
sheets are drawn in the ramp LPC calls `light`, and `palette_definitions/body`
holds the other twenty-one ramps as six hex colours each, so a recolour is an
exact lookup rather than a filter over somebody's pixels.  That is what makes
a kobold read as a kobold next to a townsman wearing the same trousers.

**Animals** cannot be composited; they are whole creatures drawn by hand, and
the four packs they come from do not agree on a layout.  So each one carries
its grid, measured rather than assumed:

  * the wolf sheet is two zones — front and back views in 32x64 cells on the
    left, side views in 64x32 cells on the right — and reading it as a uniform
    64x64 grid divides evenly while cutting every wolf in half.
  * the bear and the deer are ordered up, left, **right**, down.  Everything
    else is LPC's up, left, down, right.  Assuming the standard order puts
    every deer in Elwynn facing backwards.

Sizes are the animal's real length in yards.  The renderer draws 24 pixels to
the yard, so that one number decides the sprite scale and there is nothing to
tune: a wolf is two yards long, and two yards is what it takes up.

  python3 pipeline/bake_npcs.py public/art
"""
import csv
import json
import os
import sys

import numpy as np
from PIL import Image

LPC = os.path.expanduser('~/src/lpc')
CELL = 64
ANCHOR = 0.82      # where the ground line sits in the cell — the hero's own
DIRS = ('up', 'left', 'down', 'right')

# ---------------------------------------------------------------- people

# Every LPC part is drawn in one base ramp per palette group, and a swap maps
# that ramp onto another.  Skin is `light`, cloth is `white`, hair is `orange`
# — which is why a slice built without dyeing anything came out as two hundred
# redheads in the same white shirt, indistinguishable from bare skin at the
# distance the game is actually played at.
BASE = {'body': 'light', 'cloth': 'white', 'hair': 'orange'}

# Which palette group a part belongs to, by where it lives.
GROUP = [('body/', 'body'), ('head/', 'body'), ('hair/', 'hair')]

# body, head, and the parts worn over them.  A look is a silhouette plus a
# colour, because at 24 pixels to the yard a face is four pixels and the thing
# a player actually tells people apart by is shape.
# Told apart by what they wear, not by their skin: cloth, leather and legion
# plate are three silhouettes at this size, and tinting a face to mean "bandit"
# would be saying something about people rather than about clothes.  `dye` maps
# a part to the palette it is repainted in; anything unlisted keeps its own.
# The people of a place are not one person.
#
# Elwynn holds 980 townsfolk and they were one sprite, which reads as a clone
# army the moment two of them stand together — and two of them always do,
# because the client put them in twos and threes outside the houses.  So the
# roster is built rather than written out: a body, a head, a haircut, a shirt,
# trousers and boots, each taken from what the sheet set actually has a walk
# cycle for, and dyed out of LPC's own palettes.
#
# The mixing is arithmetic and not a random number, so the roster is the same
# every bake — which matters because every part that lands in it has to land in
# `art/NPC-CREDITS.md` too, and a credits file that changes when nothing did is
# a credits file nobody reads.
BUILD = {
    'male': dict(body='body/bodies/male', head='head/heads/human/male',
                 fit='male', torso='male'),
    'female': dict(body='body/bodies/female', head='head/heads/human/female',
                   fit='thin', torso='female'),
}
SHIRTS = {
    'male': ['torso/clothes/longsleeve/longsleeve',
             'torso/clothes/longsleeve/longsleeves',
             'torso/clothes/shortsleeve/shortsleeve',
             'torso/clothes/sleeveless/sleeveless1',
             'torso/clothes/sleeveless/sleeveless2'],
    'female': ['torso/clothes/longsleeve/longsleeve',
               'torso/clothes/shortsleeve/shortsleeve',
               'torso/clothes/sleeveless/sleeveless1',
               'torso/clothes/sleeveless/sleeveless2'],
}
TROUSERS = {
    'male': ['legs/pantaloons', 'legs/pants', 'legs/cuffed', 'legs/hose'],
    'thin': ['legs/pantaloons', 'legs/pants', 'legs/leggings', 'legs/hose'],
}
SHOES = {'male': ['feet/boots/basic', 'feet/shoes/basic'],
         'thin': ['feet/boots/basic', 'feet/shoes/basic']}
HAIRCUTS = ['plain', 'bob', 'bangs', 'buzzcut', 'curly_short', 'long',
            'messy1', 'pixie', 'bedhead', 'balding']
SKINS = ['light', 'amber', 'olive', 'taupe', 'bronze', 'brown']
# No `tan` and no `rose`: a sleeveless shirt dyed close to a skin tone reads as
# a man who forgot to put one on, and two of the sixteen did.
SHIRT_DYE = ['white', 'sky', 'forest', 'maroon', 'slate', 'navy',
             'gray', 'teal', 'brown', 'green']
TROUSER_DYE = ['walnut', 'brown', 'charcoal', 'navy', 'slate', 'forest',
               'leather', 'gray']
HAIR_DYE = ['sandy', 'chestnut', 'dark_brown', 'black', 'ginger', 'ash',
            'gold', 'gray', 'raven', 'light_brown']

# How many of each.  Every look is twenty cells of the atlas — four directions
# by five frames — so this is the one number that decides how big the sheet
# gets, and it is written here rather than discovered at the bottom of a loop.
VILLAGERS, GUARDS, BANDITS = 16, 3, 3


def spread(xs, i, step):
    """The i-th of `xs`, walked by a stride that is coprime with its length.

    A plain `i % len(xs)` makes every list turn over together, so villager 5
    and villager 15 come out in the same shirt *and* the same trousers *and*
    the same hair.  Different strides put the cycles out of phase.
    """
    return xs[(i * step) % len(xs)]


def villagers():
    """The roster, as `LOOKS` entries."""
    out = {}
    for i in range(VILLAGERS):
        sex = 'male' if i % 2 == 0 else 'female'
        b = BUILD[sex]
        j = i // 2
        out['townsfolk' if i == 0 else f'townsfolk{i + 1}'] = dict(
            skin=spread(SKINS, j, 5),
            parts=[b['body'], b['head'],
                   f"{spread(TROUSERS[b['fit']], j, 3)}/{b['fit']}",
                   f"{spread(SHOES[b['fit']], j, 1)}/{b['fit']}",
                   f"{spread(SHIRTS[b['torso']], j, 3)}/{b['torso']}",
                   f"hair/{spread(HAIRCUTS, i, 7)}/adult"],
            dye={'legs/': spread(TROUSER_DYE, j, 5),
                 'feet/': spread(['leather', 'brown', 'black'], j, 2),
                 'torso/': spread(SHIRT_DYE, i, 7),
                 'hair/': spread(HAIR_DYE, i, 3)})
    return out


def watch():
    """Guards and bandits, same trick, fewer of them.

    They keep their silhouettes — plate and leather are what tells a guard from
    a robber at this size — and vary in what is under them.
    """
    out = {}
    for i in range(GUARDS):
        out['guard' if i == 0 else f'guard{i + 1}'] = dict(
            skin=spread(SKINS, i, 5),
            parts=['body/bodies/male', 'head/heads/human/male',
                   'legs/pantaloons/male', 'feet/boots/basic/male',
                   'torso/armour/legion/male', 'arms/armour/plate/male'],
            dye={'legs/': spread(['navy', 'charcoal', 'forest'], i, 1),
                 'feet/': 'slate'})
    for i in range(BANDITS):
        out['bandit' if i == 0 else f'bandit{i + 1}'] = dict(
            skin=spread(SKINS, i + 2, 5),
            parts=['body/bodies/male', 'head/heads/human/male',
                   'legs/pantaloons/male', 'feet/boots/basic/male',
                   'torso/armour/leather/male',
                   f"hair/{spread(HAIRCUTS, i + 1, 7)}/adult"],
            dye={'legs/': spread(['charcoal', 'walnut', 'slate'], i, 1),
                 'feet/': 'black',
                 'hair/': spread(['raven', 'dark_brown', 'ash'], i, 1)})
    return out


# The two that are not people: a kobold is a rat's head on a child's body and a
# murloc is a lizard's on a man's, and neither of them owns a wardrobe.
OTHERS = {
    'kobold': dict(skin='fur_tan', parts=[
        'body/bodies/child', 'head/heads/rat/child'], dye={}),
    'murloc': dict(skin='green', parts=[
        'body/bodies/male', 'head/heads/lizard/male'], dye={}),
}

LOOKS = {**villagers(), **watch(), **OTHERS}

# Frame 0 of an LPC walk row is the standing pose, so it doubles as the idle.
# The rest is every other frame: eight-frame cycles sampled at four still read
# as walking, and the atlas is half the size for it.
PEOPLE_FRAMES = [0, 1, 3, 5, 7]

# ---------------------------------------------------------------- animals

A = os.path.expanduser('~/src/lpc-animals/lpc animals 2022 v1.1/'
                       'individual creature spritesheets')

def grid(path, cw, ch, rows, cols, n, yards, author):
    """A sheet cut on one uniform grid.

    `rows` gives the row each direction lives on, and optionally a flag saying
    that row is drawn facing the other way and has to be mirrored — several of
    these packs draw one side view and expect you to flip it.
    """
    def row(d):
        r = rows[d]
        return r if isinstance(r, tuple) else (r, False)
    return dict(path=path, cells=[[(c * cw, row(d)[0] * ch, cw, ch, row(d)[1])
                                   for c in cols[:n]] for d in DIRS],
                yards=yards, author=author)


LPC_ORDER = dict(up=0, left=1, down=2, right=3)
BEAR_ORDER = dict(up=0, left=1, right=2, down=3)
# Four colours of cat sit side by side in blocks of four columns, and the rows
# are not LPC's: a side view, two rear views, a second side view, a front view.
# Only the left-facing side is drawn.
CAT_ORDER = dict(up=1, left=0, down=4, right=(0, True))

ANIMALS_2022 = ('tapatilorenzo', 'CC-BY 4.0',
                'https://opengameart.org/content/lpc-bears-deer-lions-and-more')
FARM = ('Daniel Eddeland (daneeklu)', 'CC-BY 3.0 / GPL 2.0',
        'https://opengameart.org/content/lpc-style-farm-animals')
REDSHRIKE = ('Stephen "Redshrike" Challener, contributor William.Thompsonj',
             'CC-BY 3.0 / GPL 3.0 / GPL 2.0 / OGA-BY 3.0', None)

ANIMALS = {
    'bear': grid(f'{A}/bear, grizzly.png', 64, 64, BEAR_ORDER, range(5), 5,
                 2.4, ANIMALS_2022),
    'deer': grid(f'{A}/deer, dark doe.png', 64, 96, BEAR_ORDER, range(4), 4,
                 2.0, ANIMALS_2022),
    'spider': grid(os.path.expanduser('~/src/lpc-spider/LPC_Spiders/spider01.png'),
                   64, 64, LPC_ORDER, range(4, 10), 6, 1.4,
                   (REDSHRIKE[0], 'CC-BY 4.0 / CC-BY 3.0 / GPL 3.0 / GPL 2.0 / OGA-BY 3.0',
                    'https://opengameart.org/content/lpc-spider')),
    'rabbit': grid(os.path.expanduser('~/src/lpc-rabbit/rabbit.png'),
                   72, 72, LPC_ORDER, range(4), 4, 0.6,
                   ('Stephen Challener (Redshrike), commissioned by Tebruno99',
                    'CC-BY 3.0 / CC-BY-SA 3.0 / OGA-BY 3.0',
                    'https://opengameart.org/content/reorganised-lpc-rabbit')),
    'cat': grid(os.path.expanduser('~/src/lpc-pets/cat.png'),
                32, 32, CAT_ORDER, range(3), 3, 0.9,
                ('bluecarrot16', 'CC-BY 3.0 / CC-BY-SA 3.0 / GPL 3.0 / GPL 2.0 / OGA-BY 3.0',
                 'https://opengameart.org/content/lpc-cats-and-dogs')),
    'horse': grid(os.path.expanduser('~/src/lpc-horse/horse-brown.png'),
                  128, 128, LPC_ORDER, range(4), 4, 2.6,
                  ('bluecarrot16', 'CC-BY 3.0 / CC-BY-SA 3.0 / GPL 3.0 / GPL 2.0 / OGA-BY 3.0',
                   'https://opengameart.org/content/lpc-horses')),
    'cow': grid(os.path.expanduser('~/src/lpc-farm/cow_walk.png'),
                128, 128, LPC_ORDER, range(4), 4, 2.4, FARM),
    'boar': grid(os.path.expanduser('~/src/lpc-farm/pig_walk.png'),
                 128, 128, LPC_ORDER, range(4), 4, 1.6, FARM),
    'sheep': grid(os.path.expanduser('~/src/lpc-farm/sheep_walk.png'),
                  128, 128, LPC_ORDER, range(4), 4, 1.5, FARM),
    'chicken': grid(os.path.expanduser('~/src/lpc-farm/chicken_walk.png'),
                    32, 32, LPC_ORDER, range(4), 4, 0.7, FARM),
}

# The wolf does not fit `grid()`.  Its sheet is the artist's own layout: the
# left 320 pixels hold front and back views in 32-wide cells (columns 0-4 face
# the camera, 5-9 face away), the right half holds side views in 64x32 cells,
# and row 3 of each zone is the walk.  Only the left-facing side view is drawn,
# so the right-facing one is a mirror — the last field of a cell.
WOLF_ROW_FRONT, WOLF_ROW_SIDE = 3, 3
ANIMALS['wolf'] = dict(
    path=os.path.expanduser('~/src/lpc-wolf/wolfsheet1_0.png'),
    cells=[
        [((5 + c) * 32, WOLF_ROW_FRONT * 64, 32, 64, False) for c in range(5)],
        [(320 + c * 64, WOLF_ROW_SIDE * 32, 64, 32, False) for c in range(5)],
        [(c * 32, WOLF_ROW_FRONT * 64, 32, 64, False) for c in range(5)],
        [(320 + c * 64, WOLF_ROW_SIDE * 32, 64, 32, True) for c in range(5)],
    ],
    yards=2.0,
    author=(REDSHRIKE[0], REDSHRIKE[1],
            'https://opengameart.org/content/lpc-wolf-animation'))

PPY = 24           # the renderer's pixels to the yard — see src/main.ts


_RAMPS = {}


def ramp(group, name):
    if group not in _RAMPS:
        p = json.load(open(os.path.join(
            LPC, f'palette_definitions/{group}/{group}_ulpc.json')))
        _RAMPS[group] = {k: v for k, v in p.items() if isinstance(v, list)}
    if name not in _RAMPS[group]:
        sys.exit(f'no {group} palette called {name}')
    return [tuple(int(c.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4))
            for c in _RAMPS[group][name]]


def recolour(im, src, dst):
    """Swap one six-colour ramp for another, exactly and only."""
    a = np.asarray(im).copy()
    rgb = a[:, :, :3]
    out = rgb.copy()
    for s, d in zip(src, dst):
        out[(rgb == s).all(-1)] = d
    a[:, :, :3] = out
    return Image.fromarray(a, 'RGBA')


def group_of(part):
    for prefix, g in GROUP:
        if part.startswith(prefix):
            return g
    return 'cloth'


def person(look, used):
    """One look's walk sheet, composited and repainted."""
    base = None
    for part in look['parts']:
        p = os.path.join(LPC, 'spritesheets', part, 'walk.png')
        if not os.path.exists(p):
            sys.exit(f'{part}/walk.png is missing — a look with a hole in it is a bug')
        used.append(f'{part}/walk.png')
        im = Image.open(p).convert('RGBA')
        g = group_of(part)
        # Skin is the body and the bare head; everything else is dyed only if
        # this look asks for it by name.
        want = (look['skin'] if g == 'body'
                else next((v for k, v in look['dye'].items() if part.startswith(k)), None))
        if want and want != BASE[g]:
            im = recolour(im, ramp(g, BASE[g]), ramp(g, want))
        if base is None:
            base = Image.new('RGBA', im.size)
        if im.size != base.size:
            sys.exit(f'{part}/walk.png is {im.size}, expected {base.size}')
        base = Image.alpha_composite(base, im)
    return base


def scale(sheet, spec):
    """One factor for the whole animal, taken from its side view.

    Taken per frame it is a bug that looks like art: a bear seen from behind is
    twenty pixels across and a bear from the side is sixty, so scaling each
    frame to the same width makes the animal three times larger whenever it
    walks away from you.  What `yards` describes is the length of the creature,
    and the length is only visible from the side.
    """
    x, y, w, h, _ = spec['cells'][DIRS.index('left')][0]
    box = sheet.crop((x, y, x + w, y + h)).getbbox()
    if box is None:
        sys.exit('the side view is empty — the grid is wrong, not the art')
    return (spec['yards'] * PPY) / (box[2] - box[0])


def fit(frame, k, flip):
    """Trim an animal to its own outline and set it on the cell's ground line.

    The packs disagree about how much air they leave around a creature — the
    farm animals sit in 128 pixel cells and the chicken in 32 — so the cell is
    no guide to how big the animal is.  Its own pixels are.
    """
    if flip:
        frame = frame.transpose(Image.FLIP_LEFT_RIGHT)
    box = frame.getbbox()
    if box is None:
        return None
    frame = frame.crop(box)
    w, h = max(1, round(frame.width * k)), max(1, round(frame.height * k))
    frame = frame.resize((w, h), Image.LANCZOS if k < 1 else Image.NEAREST)
    cell = Image.new('RGBA', (CELL, CELL))
    cell.alpha_composite(frame, ((CELL - w) // 2, min(CELL - h, round(CELL * ANCHOR) - h)))
    return cell


def main(out):
    frames, kinds, used = [], {}, []

    for name, look in LOOKS.items():
        sheet = person(look, used)
        n = sheet.width // CELL
        first = len(frames)
        for d in range(4):
            for f in PEOPLE_FRAMES:
                frames.append(sheet.crop((f * CELL, d * CELL,
                                          f * CELL + CELL, d * CELL + CELL)))
        kinds[name] = {'first': first, 'frames': len(PEOPLE_FRAMES), 'people': True}
        if n < max(PEOPLE_FRAMES) + 1:
            sys.exit(f'{name} walk sheet has {n} frames, need {max(PEOPLE_FRAMES) + 1}')

    for name, spec in ANIMALS.items():
        if not os.path.exists(spec['path']):
            sys.exit(f'missing {spec["path"]}')
        sheet = Image.open(spec['path']).convert('RGBA')
        k = scale(sheet, spec)
        first = len(frames)
        for d in range(4):
            for (x, y, w, h, flip) in spec['cells'][d]:
                cell = fit(sheet.crop((x, y, x + w, y + h)), k, flip)
                if cell is None:
                    sys.exit(f'{name} {DIRS[d]} has an empty frame at {x},{y} — '
                             'the grid is wrong, not the art')
                frames.append(cell)
        kinds[name] = {'first': first, 'frames': len(spec['cells'][0]),
                       'people': False, 'yards': spec['yards']}

    cols = 18
    rows = (len(frames) + cols - 1) // cols
    atlas = Image.new('RGBA', (cols * CELL, rows * CELL))
    for i, fr in enumerate(frames):
        atlas.paste(fr, ((i % cols) * CELL, (i // cols) * CELL))
    os.makedirs(out, exist_ok=True)
    atlas.save(os.path.join(out, 'npcs.png'), optimize=True)
    with open(os.path.join(out, 'npcs.json'), 'w') as f:
        json.dump({'cell': CELL, 'cols': cols, 'anchor': ANCHOR, 'kinds': kinds}, f, indent=1)

    credits(used)

    px = atlas.width * atlas.height * 4
    print(f'{len(frames)} frames in {len(kinds)} kinds, atlas {atlas.width}x{atlas.height}, '
          f'{os.path.getsize(os.path.join(out, "npcs.png")) / 1024:.0f} KiB on disk, '
          f'{px / 1048576:.1f} MiB decoded')
    print('  people:  ' + ', '.join(LOOKS))
    print('  animals: ' + ', '.join(f'{k} {v["yards"]}yd' for k, v in
                                    sorted(ANIMALS.items(), key=lambda kv: -kv[1]['yards'])))
    contact(frames, kinds, out)


def credits(used):
    rows_csv = list(csv.DictReader(open(os.path.join(LPC, 'CREDITS.csv'))))
    by_file = {r['filename']: r for r in rows_csv}
    seen = {}
    for u in used:
        r = by_file.get(u)
        if not r:
            cand = [x for k, x in by_file.items() if k.startswith(os.path.dirname(u) + '/')]
            r = cand[0] if cand else None
        if not r:
            sys.exit(f'{u} has no row in CREDITS.csv — refusing to ship an unattributed part')
        seen[os.path.dirname(u)] = r

    with open('art/NPC-CREDITS.md', 'w') as f:
        f.write('# NPC sprite credits\n\n')
        f.write('Generated by `pipeline/bake_npcs.py` from the tables the atlas is\n')
        f.write('built from, so this list cannot fall behind what is actually drawn.\n\n')
        f.write('## People\n\nComposited from [Liberated Pixel Cup](https://lpc.opengameart.org/)\n')
        f.write('parts, recoloured with LPC\'s own body palettes.\n\n')
        for layer, r in sorted(seen.items()):
            f.write(f'- `{layer}` — {r["authors"].strip()} ({r["licenses"].strip()})\n')
        f.write('\n## Animals\n\n')
        done = set()
        for name, spec in sorted(ANIMALS.items()):
            who, lic, url = spec['author']
            if (who, url) in done:
                continue
            done.add((who, url))
            same = sorted(k for k, v in ANIMALS.items() if v['author'][0] == who
                          and v['author'][2] == url)
            f.write(f'- **{", ".join(same)}** — {who} ({lic})')
            f.write(f'\n  {url}\n' if url else '\n')
        f.write('\n**The game inherits the strongest of these.** GPL 3.0 and CC-BY-SA 3.0\n')
        f.write('both carry, so the game carries them too — see the wiki page 아트 방향.\n')


def contact(frames, kinds, out):
    """One sheet with every kind facing all four ways, because the direction
    order is the thing most likely to be wrong and it is invisible in a count."""
    n = len(kinds)
    sheet = Image.new('RGB', (CELL * 4 * 2, CELL * n * 2), (40, 44, 56))
    for i, (name, k) in enumerate(kinds.items()):
        for d in range(4):
            fr = frames[k['first'] + d * k['frames']]
            fr = fr.resize((CELL * 2, CELL * 2), Image.NEAREST)
            sheet.paste(fr, (d * CELL * 2, i * CELL * 2), fr)
    sheet.save(os.path.join(out, 'npcs-contact.png'))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'public/art')
