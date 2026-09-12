#!/usr/bin/env python3
"""Pull the renders' greens onto the green of the grass they stand on.

Three model kits went into `render_kit.py` and they do not agree about foliage:
Kenney's Nature Kit draws it a cool mint, the Fantasy Town Kit a warm green,
and both stand on LPC grass that is yellower than either.  That is not a
lighting fault — the same tree was rendered under four skies, from blue to none
at all, and came out mint every time — so no lamp fixes it.

Only the greens move, and only their hue.

  * Only greens, because nothing else clashes.  A red roof and a brown cart
    have nothing to disagree with: the ground has no red and no wood in it.
    Grading the whole wheel onto the ground's palette was tried first and it
    turned every roof in the village orange, which is a worse problem than the
    one being fixed.
  * Only hue, because the shading is the thing worth keeping.  Saturation and
    value stay the render's own; a flat palette swap would throw away the
    reason for rendering in the first place.

The target is measured, not chosen: it is the dominant hue of the grass tiles
`bake_tiles.py` cuts, read out of the same table the bake reads.

  python3 pipeline/grade_kit.py <kit dir>

Grading is destructive and a render is four seconds, so it runs as its own step
after `render_kit.py` rather than inside it: re-render, re-grade.
"""
import colorsys
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bake_tiles import GROUND, ROOTS, SHEETS  # noqa: E402

# Green through cyan.  The top is 195 because the kits' foliage is measured and
# not guessed at: the oak is 170 degrees, the bushes 165, and the pines sit
# exactly on 185 — a band that stopped at 185 moved every leaf in the wood
# except the pines', which stayed the colour they were complained about for.
# The fountain at 205 and the tent at 220 are outside it and stay blue.
BAND = (70 / 360, 195 / 360)

# How far a pixel moves.  Not all the way: at 1.0 every leaf in the wood is the
# one hue and the plants stop reading as different plants, because the kits'
# own variation is finer than a tile sheet's.
PULL = 0.75

# Below this a pixel has no hue worth arguing about — grey stone, white
# plaster, the near-black of a timber wall — and moving it only tints it.
GREY = 0.15

# The ground tiles whose green is the one being matched.  `dirt` and `water`
# are ground too and are deliberately not here; this is the grass.
GRASS = ('grass', 'grass2', 'grass3', 'bloom', 'bloom2', 'bloom3')


def grass_hue():
    """The hue of the grass, weighted by how much of it there is."""
    where = {pid: (sheet, x, y, w, h) for pid, sheet, x, y, w, h, _ in GROUND}
    opened = {}
    total = weight = 0.0
    for pid in GRASS:
        if pid not in where:
            continue
        sheet, x, y, w, h = where[pid]
        if sheet not in opened:
            path = os.path.join(os.path.expanduser(ROOTS[SHEETS[sheet]]), sheet)
            opened[sheet] = Image.open(path).convert('RGBA')
        tile = opened[sheet].crop((x, y, x + w, y + h))
        for r, g, b, a in tile.getdata():
            if a < 128:
                continue
            hu, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if s < GREY or not BAND[0] <= hu <= BAND[1]:
                continue
            total += hu * s
            weight += s
    if weight == 0:
        sys.exit('no green found in the grass tiles')
    return total / weight


def grade(path, target):
    im = Image.open(path).convert('RGBA')
    out = []
    moved = 0
    for r, g, b, a in im.getdata():
        if a == 0 or (r, g, b) == (0, 0, 0):
            out.append((r, g, b, a))
            continue
        hu, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if s < GREY or not BAND[0] <= hu <= BAND[1]:
            out.append((r, g, b, a))
            continue
        nr, ng, nb = colorsys.hsv_to_rgb(hu + (target - hu) * PULL, s, v)
        out.append((round(nr * 255), round(ng * 255), round(nb * 255), a))
        moved += 1
    im.putdata(out)
    im.save(path)
    return moved


def main(kitdir):
    target = grass_hue()
    print(f'grass is {target * 360:.0f}deg; pulling {BAND[0] * 360:.0f}'
          f'-{BAND[1] * 360:.0f}deg {PULL:.0%} of the way there')
    files = sorted(n for n in os.listdir(kitdir) if n.endswith('.png'))
    moved = sum(grade(os.path.join(kitdir, n), target) for n in files)
    print(f'graded {len(files)} renders, {moved:,} pixels moved')


if __name__ == '__main__':
    main(os.path.expanduser(sys.argv[1]))
