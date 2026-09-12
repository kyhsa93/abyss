#!/usr/bin/env python3
"""Pack the rendered equipment layers into one sheet each.

  python3 pipeline/pack_paperdoll.py <render dir> <out dir> <who>

reads what `render_paperdoll.py` wrote, writes `<out>/doll/<who>_<slot>_<variant>.png`
and merges the geometry into `<out>/doll.json`.

**Every layer is cropped to its own box, not to a shared one.**  A boot is
fourteen pixels of a sixty-pixel frame and the rest of that frame is
transparent — which costs nothing in the file and full price in memory, since a
decoded sheet is `width * height * 4` whatever is in it.  Cropping the shared
box instead would have made the boots sheet as big as the body's, and there are
thirty-two of these.  What each layer carries instead is the offset of its own
box inside the character's, so the scene can put it back where it was.
"""
import json
import os
import re
import sys

from PIL import Image

COLS = 16

# Who made the thing.  CC0 asks for nothing and the author says so himself, but
# this repository refuses to ship a tile whose author nobody wrote down
# (`bake_tiles.py` will exit rather than do it), and a rule that only applies
# when the licence forces it is not the rule it claims to be.
CREDIT = ('Modular RPG Characters', 'System G6 (Qoma)', 'CC0 1.0',
          'https://opengameart.org/content/modular-rpg-characters')

# The clip the engine asks for against the clip that was actually rendered.
# The kit has no walk — see `render_paperdoll.py` — and pointing `walk` at the
# run's cells costs nothing, where rendering it again would cost a third of
# every sheet here.
ALIAS = {'walk': 'run'}

# Back to front, and the same order `src/doll.ts` draws them in.  A helmet is
# worn instead of hair rather than over it.
ORDER = ('body', 'feet', 'chest', 'hands', 'head', 'hair', 'helm')


def contact(out, who, side, meta, clips, dirs):
    """Dress the packed sheets and look at the result.

    Built out of the packed PNGs and the offsets that were just written, not
    out of the renders — so it fails if the geometry in the JSON is wrong,
    which is the only part of this that nothing else would catch.  Every
    misregistration this repository has shipped was invisible until something
    drew the pieces together: eight directions that were eight copies of one
    pose, a cast at 39% of the size the arithmetic asked for.
    """
    tiers = ('bare', 'light', 'medium', 'heavy')
    sheets = {n: Image.open(os.path.join(out, 'doll', n + '.png')) for n in meta}
    stand = clips.get('stand') or next(iter(clips.values()))
    rows = []
    for tier in tiers:
        row = Image.new('RGBA', (side * dirs, side))
        for d in range(dirs):
            idx = stand['first'] + d * stand['count']
            cell = Image.new('RGBA', (side, side))
            for slot in ORDER:
                if slot == 'hair' and tier != 'bare':
                    continue        # a helmet is worn instead of hair
                want = {'body': 'bare', 'head': 'bare', 'hair': '2'}.get(slot, tier)
                name = '%s_%s_%s' % (who, slot, want)
                box = meta.get(name)
                if not box:
                    continue
                sh = sheets[name]
                sx = (idx % COLS) * box['w']
                sy = (idx // COLS) * box['h']
                cell.alpha_composite(
                    sh.crop((sx, sy, sx + box['w'], sy + box['h'])),
                    (box['dx'], box['dy']))
            row.paste(cell, (side * d, 0))
        rows.append(row)
    sheet = Image.new('RGBA', (side * dirs, side * len(rows)), (28, 32, 38, 255))
    for i, r in enumerate(rows):
        sheet.alpha_composite(r, (0, side * i))
    path = os.path.join(out, '%s-doll-contact.png' % who)
    sheet.resize((sheet.size[0] * 3, sheet.size[1] * 3), Image.NEAREST).save(path)
    print('  contact %s: %d tiers x %d directions' % (path, len(rows), dirs))


def cells_of(root):
    """{layer: {clip: {dir: {frame: path}}}} for everything under `root`."""
    out = {}
    for layer in sorted(os.listdir(root)):
        d = os.path.join(root, layer)
        if not os.path.isdir(d):
            continue
        for n in os.listdir(d):
            m = re.fullmatch(r'(\d+)_([a-z_]+?)(\d+)\.png', n)
            if not m:
                continue
            direction, clip, frame = int(m.group(1)), m.group(2), int(m.group(3))
            (out.setdefault(layer, {}).setdefault(clip, {})
                .setdefault(direction, {}))[frame] = os.path.join(d, n)
    return out


def box_of(paths):
    """The union of what a set of cells actually draws, or None if nothing."""
    box = None
    for p in paths:
        b = Image.open(p).getbbox()
        if b is None:
            continue
        box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]),
                                     max(box[2], b[2]), max(box[3], b[3]))
    return box


def main(root, out, who):
    found = cells_of(root)
    if not found:
        sys.exit('no rendered cells under ' + root)

    # The character's own box is the union of every layer, because a sprite has
    # to be placed by where the person is and not by where his hat is.  Square,
    # and a yard is a yard either way round.
    whole = box_of([p for lay in found.values() for c in lay.values()
                    for d in c.values() for p in d.values()])
    w, h = whole[2] - whole[0], whole[3] - whole[1]
    side = max(w, h) + 2
    cx, cy = (whole[0] + whole[2]) // 2, (whole[1] + whole[3]) // 2
    frame = (cx - side // 2, cy - side // 2)

    # The foot line is where a standing character touches the ground, and it
    # has to be measured on a standing character.  Taking it off the union of
    # every clip put it wherever the death throw reached — which is below the
    # feet, because a man falling towards the camera ends up lower on the
    # screen than he ever stood — and the whole cast walked a foot above their
    # own shadows.  Nothing threw; it just looked like everyone was floating.
    stood = box_of([p for lay in found.values()
                    for d in lay.get('stand', lay.get('idle', {})).values()
                    for p in d.values()])
    anchor = round(((stood or whole)[3] - frame[1]) / side, 4)

    # One clip table for the lot: every layer is the same rig in the same poses,
    # so an index means the same thing in all of them.
    sample = next(iter(found.values()))
    clips, at = {}, 0
    dirs = max(len(v) for v in sample.values())
    for clip in sorted(sample, key=lambda c: (c != 'run', c)):
        n = max(len(f) for f in sample[clip].values())
        clips[clip] = {'first': at, 'count': n}
        at += dirs * n
    for name, real in ALIAS.items():
        if real in clips and name not in clips:
            clips[name] = dict(clips[real], alias=real)
    order = [(c, d, i) for c in sorted(sample, key=lambda c: (c != 'run', c))
             for d in range(dirs) for i in range(clips[c]['count'])]

    os.makedirs(os.path.join(out, 'doll'), exist_ok=True)
    meta = {}
    total = 0
    for layer, by_clip in sorted(found.items()):
        paths = [by_clip[c][d][i] for c, d, i in order]
        box = box_of(paths)
        if box is None:
            continue            # a layer that draws nothing is not a layer
        lw, lh = box[2] - box[0], box[3] - box[1]
        rows = (len(paths) + COLS - 1) // COLS
        sheet = Image.new('RGBA', (COLS * lw, rows * lh))
        for i, p in enumerate(paths):
            sheet.paste(Image.open(p).crop(box), ((i % COLS) * lw, (i // COLS) * lh))
        name = '%s_%s' % (who, layer)
        sheet.save(os.path.join(out, 'doll', name + '.png'), optimize=True)
        meta[name] = {'w': lw, 'h': lh,
                      'dx': box[0] - frame[0], 'dy': box[1] - frame[1]}
        total += sheet.size[0] * sheet.size[1] * 4
        print('  %-24s %3dx%-3d at %+4d,%+4d  %5d cells'
              % (name, lw, lh, meta[name]['dx'], meta[name]['dy'], len(paths)))

    contact(out, who, side, meta, clips, dirs)

    with open('art/DOLL-CREDITS.md', 'w') as f:
        name, author, lic, url = CREDIT
        f.write('# Paperdoll credits\n\n'
                'The player is rendered from one kit, so this is one line.\n\n'
                '* **%s** — %s, %s\n  <%s>\n\n'
                'Rendered by `pipeline/render_paperdoll.py` at this game\'s own\n'
                'projection; the renders are art this repository made, and the\n'
                'models and textures under them are the author\'s.\n'
                % (name, author, lic, url))

    path = os.path.join(out, 'doll.json')
    doll = json.load(open(path)) if os.path.exists(path) else {}
    doll.setdefault('cols', COLS)
    doll.setdefault('who', {})[who] = {
        'cell': side, 'anchor': anchor, 'dirs': dirs, 'clips': clips,
        'layers': meta}
    with open(path, 'w') as f:
        json.dump(doll, f)
    print('%s: %d layers, cell %d, anchor %s, %.1f MB decoded'
          % (who, len(meta), side, anchor, total / 1e6))


if __name__ == '__main__':
    main(os.path.expanduser(sys.argv[1]), os.path.expanduser(sys.argv[2]),
         sys.argv[3])
