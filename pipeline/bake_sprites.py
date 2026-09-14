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
    # **No hair here any more.**  It is a layer of its own, because a character
    # you make is a character whose hair you chose — see `LOOKS`.
]

# What a player may choose to look like, cut the way a weapon is: one sheet
# each, loaded when it is picked.
#
# **Twelve of sixty-three, and the twelve are chosen rather than sampled.**
# LPC has 63 hairstyles with all four of this game's clips and every one of
# them costs about 0.3 MiB decoded, so all of them is nineteen megabytes
# against a twenty-four megabyte budget for the whole game.  The twelve are the
# ones that are a different *shape* at sixty-four pixels — length, volume and
# silhouette — because two styles that differ in a way nobody can see at this
# size are one style listed twice, which is the same mistake the shop's
# identical rows were.
#
# The rest are not gone, they are unlisted: adding one is a line here and a
# re-bake, and the check that the atlas stays inside the budget is what says
# how many lines there is room for.
HAIR = ['buzzcut', 'high_and_tight', 'flat_top_fade', 'balding', 'parted',
        'page', 'plain', 'cornrows', 'bob', 'mop', 'spiked', 'long_messy']
# And the face.  Four, which is what LPC draws that reads as a beard at this
# size: nothing, stubble, trimmed and full.  The eight moustaches are a
# different sheet and all eight are three pixels apart from each other.
BEARDS = ['5oclock_shadow', 'trimmed', 'medium', 'basic']
LOOKS = ([('hair', n, 'hair/%s/adult' % n) for n in HAIR]
         + [('beard', n, 'beards/beard/%s' % n) for n in BEARDS])

# Animations to take, and how many frames each sheet holds.
CLIPS = [('walk', 9), ('idle', 2), ('slash', 6), ('thrust', 8)]

# What he can have in his hand, and which swing goes with it.
#
# The same five `bake_npcs.py` cuts for everybody else, and the same reason
# they are a layer rather than part of a look: a weapon is what he is holding
# this minute, not what he is.  712 of the slice's people carry one and the
# player was the only body in the world with nothing in his hands.
#
# `(front, behind, the sheet's own cell)`.  The cell is a column because LPC
# packs a **swing** differently from a walk: a walking sword fits the body's
# 64-pixel cell, and a swung one does not, so the attack sheets are drawn on a
# 3x3 block of cells with the body in the middle.  Read at 64 they come out as
# the top-left ninth of every frame, which is empty air for four of the five.
#
# **The frames are not the NPCs'.**  Those are sampled at five of the walk's
# nine, which is enough for somebody on the far side of a field and would put
# the player's sword a frame behind his own hand.  His walk is all nine, so
# these are all nine.
#
# A polearm is the odd one and it is LPC that says so: `magic/gnarled` has a
# thrust sheet and no slash, because a pole is pushed rather than swung.  So
# the weapon chooses which attack the *body* plays, which is why `swing` is
# beside the sheets rather than in `src/`.
FRONT, BEHIND = 'front', 'behind'
ARMS = {
    'sword': {'swing': 'slash', 'walk': (
        'sword/longsword/walk/longsword.png',
        'sword/longsword/universal_behind/walk/longsword.png', CELL), 'slash': (
        'sword/longsword/attack_slash/longsword.png',
        'sword/longsword/attack_slash/behind/longsword.png', CELL * 3)},
    'dagger': {'swing': 'slash', 'walk': (
        'sword/dagger/walk/dagger.png',
        'sword/dagger/behind/walk/dagger.png', CELL), 'slash': (
        'sword/dagger/slash/dagger.png',
        'sword/dagger/behind/slash/dagger.png', CELL)},
    'axe': {'swing': 'slash', 'walk': (
        'blunt/waraxe/walk/waraxe.png',
        'blunt/waraxe/behind/walk/waraxe.png', CELL), 'slash': (
        'blunt/waraxe/attack_slash/waraxe.png',
        'blunt/waraxe/attack_slash/behind/waraxe.png', CELL * 3)},
    'mace': {'swing': 'slash', 'walk': (
        'blunt/mace/walk/mace.png',
        'blunt/mace/universal_behind/walk/mace.png', CELL), 'slash': (
        'blunt/mace/attack_slash/mace.png',
        'blunt/mace/attack_slash/behind/mace.png', CELL * 3)},
    'staff': {'swing': 'thrust', 'walk': (
        'magic/gnarled/universal/walk/foreground.png',
        'magic/gnarled/universal/walk/background.png', CELL), 'thrust': (
        'magic/gnarled/thrust/foreground.png',
        'magic/gnarled/thrust/background.png', CELL * 3)},
}

#: Which swing a man with nothing in his hands plays.  LPC has no unarmed
#: attack; the slash reads as a punch well enough and it is the clip every
#: other weapon here uses, so it is the one a missing weapon falls back to.
BARE_SWING = 'slash'


def trim(im, cols, dirs, cell=CELL):
    """The one box every cell of a sheet fits inside, as `(x, y, w, h)`.

    A weapon is a small thing in a 64-pixel cell — a dagger is 40 by 22 — and
    ten halves of thirty-six frames at the full cell is 5.6 MiB of mostly
    nothing decoded.  Trimmed to a box a sheet it is 1.8.  One box a sheet and
    not one a frame: the offset then costs nothing to carry and the hand still
    lands where the artist put it, because every frame is cropped the same way.

    `cell` because a swing is drawn on a 3x3 block of cells — see `ARMS` — so
    the box is measured over 192 pixels and reported against the middle one,
    which is the body's.  That is what lets the offsets stay the same two
    numbers whether the sheet is a walk or a swing.
    """
    px = im.load()
    lo_x, lo_y, hi_x, hi_y = cell, cell, -1, -1
    for d in range(dirs):
        for f in range(cols):
            for y in range(cell):
                for x in range(cell):
                    if px[f * cell + x, d * cell + y][3]:
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
    standing = None
    for clip, count in CLIPS:
        base = None
        for layer in LAYERS:
            im = sheet(root, layer, clip)
            if im is None:
                continue
            used.append(f'{layer}/{clip}.png')
            if base is None:
                base = Image.new('RGBA', im.size)
            if im.size != base.size and im.height == base.height \
                    and im.width > base.width:
                # A layer with more frames than the body has poses.  LPC ships
                # `feet/boots/basic/male/thrust.png` nine frames wide where
                # every other layer of the same animation is eight, and the
                # ninth is the pose the clip returns to.  Dropped rather than
                # skipped: skipping the layer is a man who thrusts barefoot,
                # and the mismatch printed below then reads as "this animation
                # has no boots" when what it means is "this sheet is longer".
                im = im.crop((0, 0, base.width, base.height))
            if im.size != base.size:
                # A layer that does not line up frame for frame is not a layer;
                # dropping it silently would show up as a limb that lags.
                print(f'  ! {layer}/{clip}.png is {im.size}, expected {base.size} — skipped')
                continue
            base = Image.alpha_composite(base, im)
        if base is None:
            sys.exit(f'no sheets at all for {clip}')
        if clip == 'walk':
            standing = base
        w, h = base.size
        n = w // CELL
        clips[clip] = {'first': len(frames), 'count': n, 'dirs': h // CELL}
        for d in range(h // CELL):
            for f in range(n):
                frames.append(base.crop((f * CELL, d * CELL, f * CELL + CELL, d * CELL + CELL)))

    # What is in his hand, laid out as a strip a half rather than on the body's
    # grid: each one is trimmed to its own box, so they have twenty different
    # cell sizes and a uniform atlas would be the untrimmed one.
    #
    # **One sheet a weapon, and that is the change that paid for the swing.**
    # All five in one atlas was 2.79 MB decoded for a man who is holding one of
    # them; adding the attack strips to it would have been 6.1 MB, which is
    # three times the whole budget's remaining headroom.  A weapon a file is
    # 2.4 MB at its very worst — the greatsword, whose swing is the widest
    # thing here — so the man now carries his attack *and* costs less than he
    # did holding nothing but a walk cycle.
    arms = {}
    for name, spec in ARMS.items():
        strips, meta = [], {'swing': spec['swing'], 'clips': {}}
        for clip in ('walk', spec['swing']):
            front, behind, cell = spec[clip]
            side = {}
            for half, rel in ((FRONT, front), (BEHIND, behind)):
                path = os.path.join(root, 'spritesheets', 'weapon', rel)
                if not os.path.exists(path):
                    sys.exit(f'missing {path} — a hand with a hole in it is a bug')
                used.append(f'weapon/{rel}')
                im = Image.open(path).convert('RGBA')
                cols_, dirs = im.width // cell, im.height // cell
                want = dict(CLIPS)[clip]
                if (cols_, dirs) != (want, DIRECTIONS):
                    sys.exit(f'{rel} is {cols_}x{dirs} cells of {cell}, not the '
                             f'body\'s {clip} at {want}x{DIRECTIONS}')
                box = trim(im, cols_, dirs, cell)
                if not box:
                    sys.exit(f'{rel} is empty')
                bx, by, bw, bh = box
                strip = Image.new('RGBA', (cols_ * bw, dirs * bh))
                for d in range(dirs):
                    for f in range(cols_):
                        strip.paste(im.crop((f * cell + bx, d * cell + by,
                                             f * cell + bx + bw, d * cell + by + bh)),
                                    (f * bw, d * bh))
                # Against the **body's** cell, which is the middle one of a
                # 3x3 block on the attack sheets.  Without the shift a swung
                # sword is drawn a whole cell up and to the left of the man
                # swinging it.
                edge = (cell - CELL) // 2
                side[half] = {'w': bw, 'h': bh, 'dx': bx - edge, 'dy': by - edge,
                              'cols': cols_, 'dirs': dirs}
                strips.append((half, clip, strip))
            meta['clips'][clip] = side
        # Four strips on shelves rather than four rows, because a strip is as
        # wide as its own swing and stacking them makes the sheet as wide as
        # the widest: the greatsword's four came to 3.31 MiB decoded of which
        # a third was air beside the narrow ones.  Tallest first, so a short
        # strip fills the gap beside a tall one instead of opening a shelf.
        #
        # A strip is never split across shelves.  `drawArm` reads a direction
        # as `y + dir * h`, so the four rows of one strip have to stay
        # together — which is also why this packs strips and not frames.
        wide = max(st.width for _h, _c, st in strips)
        shelves, order = [], sorted(strips, key=lambda t: -t[2].height)
        for item in order:
            for shelf in shelves:
                if shelf['x'] + item[2].width <= wide:
                    shelf['put'].append(item)
                    shelf['x'] += item[2].width
                    break
            else:
                shelves.append({'x': item[2].width, 'put': [item],
                                'h': item[2].height})
        one = Image.new('RGBA', (wide, sum(sh['h'] for sh in shelves)))
        y = 0
        for shelf in shelves:
            x = 0
            for half, clip, strip in shelf['put']:
                one.paste(strip, (x, y))
                meta['clips'][clip][half]['x'] = x
                meta['clips'][clip][half]['y'] = y
                x += strip.width
            y += shelf['h']
        os.makedirs(os.path.join(out, 'arms'), exist_ok=True)
        one.save(os.path.join(out, 'arms', name + '.png'), optimize=True)
        meta['px'] = one.width * one.height * 4
        arms[name] = meta

    # Where the man is inside his own cell, and where his chin is.
    #
    # Both are measured off the art because neither is what arithmetic would
    # guess.  A cell is 64 pixels and the man is 52 of them, so a fraction of
    # the cell is not a fraction of him; and LPC draws him **chibi**, with a
    # head two fifths of his height, so a fraction of *him* is not a fraction
    # of a person either.  The scene sinks him into water by depth against a
    # body's height — the server's own line, three quarters of a collision box
    # — and on a body drawn like this that put the waterline over his mouth
    # while he was still standing on the bed.  `chin` is the deepest the water
    # may come up him: below it and he is wading, at it he is swimming, and it
    # is the bottom of the head layer's own ink.
    # One cell, facing the camera, standing: `DOWN` is the row LPC draws
    # front-on and frame 0 of the walk is the pose it stands in.  Measured on
    # the cell and not on the sheet — `getbbox` over 576 by 256 pixels is the
    # box round four directions and nine frames at once, which is the cell.
    DOWN = 2
    face = sheet(root, 'head/heads/human/male', 'walk')
    body = None
    if standing and face:
        cell = (0, DOWN * CELL, CELL, DOWN * CELL + CELL)
        hbox = face.crop(cell).getbbox()
        # **Over every frame and not over the standing one.**  The box is what
        # the atlas is cropped to, so a raised arm in the middle of a swing has
        # to be inside it — measured on the stand, the thrust's top four rows
        # came off.  `chin` still comes from the standing cell, because that is
        # a fact about where a face is and not about how far he reaches.
        top, bottom = CELL, 0
        for fr in frames:
            got = fr.getbbox()
            if not got:
                continue
            top = min(top, got[1])
            bottom = max(bottom, got[3])
        if hbox and bottom > top:
            body = {'top': top, 'bottom': bottom,
                    'chin': round((bottom - hbox[3]) / (bottom - top), 3)}

    # What a player may choose to look like, one sheet each — the same shape
    # as a weapon, and for the same reason: he wears one hair at a time.
    looks = {}
    for kind, name, rel in LOOKS:
        strips, meta = [], {'kind': kind, 'clips': {}}
        for clip, count in CLIPS:
            im = sheet(root, rel, clip)
            if im is None:
                sys.exit('%s has no %s — an appearance with a hole in it is a '
                         'bug' % (rel, clip))
            cols_, dirs = im.width // CELL, im.height // CELL
            if cols_ < count or dirs != DIRECTIONS:
                sys.exit('%s/%s is %dx%d cells, not the body\'s %dx%d'
                         % (rel, clip, cols_, dirs, count, DIRECTIONS))
            box = trim(im, count, dirs)
            if not box:
                continue
            bx, by, bw, bh = box
            strip = Image.new('RGBA', (count * bw, dirs * bh))
            for d in range(dirs):
                for f in range(count):
                    strip.paste(im.crop((f * CELL + bx, d * CELL + by,
                                         f * CELL + bx + bw, d * CELL + by + bh)),
                                (f * bw, d * bh))
            meta['clips'][clip] = {'w': bw, 'h': bh, 'dx': bx, 'dy': by,
                                   'cols': count, 'dirs': dirs}
            strips.append((clip, strip))
            used.append('%s/%s.png' % (rel, clip))
        if not strips:
            continue
        # Shelved, not stacked — the same packing the weapons get and for the
        # same reason: four clips of one hairstyle are four different widths,
        # and a sheet as wide as the widest is a third air.
        wide = max(st.width for _c, st in strips)
        shelves = []
        for item in sorted(strips, key=lambda t: -t[1].height):
            for sh in shelves:
                if sh['x'] + item[1].width <= wide:
                    sh['put'].append(item); sh['x'] += item[1].width
                    break
            else:
                shelves.append({'x': item[1].width, 'put': [item],
                                'h': item[1].height})
        one = Image.new('RGBA', (wide, sum(sh['h'] for sh in shelves)))
        y = 0
        for sh in shelves:
            x = 0
            for clip, strip in sh['put']:
                one.paste(strip, (x, y))
                meta['clips'][clip]['x'] = x
                meta['clips'][clip]['y'] = y
                x += strip.width
            y += sh['h']
        os.makedirs(os.path.join(out, 'look'), exist_ok=True)
        one.save(os.path.join(out, 'look', '%s-%s.png' % (kind, name)),
                 optimize=True)
        meta['px'] = one.width * one.height * 4
        looks['%s-%s' % (kind, name)] = meta

    # The atlas, **trimmed to the man**.
    #
    # A cell is 64 pixels and he is rows 13 to 62 of it — fourteen rows of
    # nothing over his head and two under his feet, on every one of a hundred
    # frames.  A transparent pixel is free in the file and full price in
    # memory, which is this repository's own line about atlases, and it was
    # costing 0.41 MiB of a 24 MiB budget for air.  One box for the whole sheet
    # and not one a frame: `body.top` is the offset back, the scene adds it
    # once, and every other number here stays against the 64 cell.
    cut = body['top'] if body else 0
    tall = (body['bottom'] - body['top']) if body else CELL
    cols = 16
    rows = (len(frames) + cols - 1) // cols
    atlas = Image.new('RGBA', (cols * CELL, rows * tall))
    for i, fr in enumerate(frames):
        atlas.paste(fr.crop((0, cut, CELL, cut + tall)),
                    ((i % cols) * CELL, (i // cols) * tall))
    os.makedirs(out, exist_ok=True)
    atlas.save(os.path.join(out, 'hero.png'), optimize=True)

    with open(os.path.join(out, 'hero.json'), 'w') as f:
        json.dump({'cell': CELL, 'cols': cols, 'clips': clips, 'arms': arms,
                   'bare': BARE_SWING, 'body': body, 'looks': looks,
                   # How tall a cell of the atlas actually is, which is not
                   # `cell`: the sheet is cropped to the man and `cell` is
                   # still the grid every offset in this file is measured in.
                   'row': tall}, f, indent=1)

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
    if body:
        print(f'  body: rows {body["top"]}..{body["bottom"]} of {CELL}, '
              f'chin {body["chin"]:.0%} up from his feet')
    print('  clips: ' + ', '.join(f'{k} x{v["count"]} in {v["dirs"]} dirs' for k, v in clips.items()))
    if looks:
        worst_look = max(looks, key=lambda k: looks[k]['px'])
        print('  looks: %d, one worn at a time, the heaviest %s at %.2f MiB '
              'decoded' % (len(looks), worst_look,
                           looks[worst_look]['px'] / 1048576))
    disk = sum(os.path.getsize(os.path.join(out, 'arms', k + '.png'))
               for k in arms)
    worst = max(arms, key=lambda k: arms[k]['px'])
    print(f'  in hand: {len(arms)} weapons, one sheet each, {disk / 1024:.0f} KiB '
          f'on disk; the page holds one at a time and the heaviest is '
          f'{worst} at {arms[worst]["px"] / 1048576:.2f} MiB decoded  ('
          + ', '.join(f'{k} {v["px"] / 1048576:.2f}' for k, v in arms.items()) + ')')

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
