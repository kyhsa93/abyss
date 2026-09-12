#!/usr/bin/env python3
"""Cut the world's furniture out of the Liberated Pixel Cup tilesets.

The sheets ship one attribution document for the lot, and that document has a
`MISSING:` section — tiles nobody recorded the author of.  A sheet licensed
CC-BY whose author is unknown cannot be complied with: the condition is
attribution and there is nobody to attribute.  So every piece here names an
author, the build refuses one that does not, and the credits are written out of
the same table the pieces come from.

  python3 pipeline/bake_tiles.py ~/src/lpc-tiles public/art
"""
import json
import os
import sys

from PIL import Image

AUTHORS = {
    'sharm': {
        'name': 'Lanea Zimmerman (AKA Sharm)',
        'licences': 'CC-BY 3.0 / GPL 3.0 / GPL 2.0 / OGA-BY 3.0',
        'url': 'https://opengameart.org/content/tiled-terrains',
    },
    'eddeland': {
        'name': 'Daniel Eddeland',
        'licences': 'CC-BY-SA 3.0 / GPL 3.0',
        'url': ('https://opengameart.org/content/'
                'lpc-farming-tilesets-magic-animations-and-ui-elements'),
    },
}

# (id, sheet, x, y, w, h, author, trim)
#
# `trim` cuts the transparent margin off a standing object so its box is the
# object.  Ground tiles are not trimmed: their box *is* the tile, edges and all,
# and trimming one would break the repeat.
GROUND = [
    ('grass',      'Terrain and Outside.png',   0, 352, 32, 32, 'sharm'),
    ('grass2',     'Terrain and Outside.png',  32, 352, 32, 32, 'sharm'),
    ('grass3',     'Terrain and Outside.png',  64, 352, 32, 32, 'sharm'),
    ('dirt',       'Terrain and Outside.png', 128,  96, 32, 32, 'sharm'),
    ('dirt2',      'Terrain and Outside.png',  32,  96, 32, 32, 'sharm'),
    ('rock_floor', 'Terrain and Outside.png', 320,  96, 32, 32, 'sharm'),
]
OBJECTS = [
    ('oak',      'Outside Objects.png', 192,   0, 96, 96, 'sharm'),
    ('oak2',     'Outside Objects.png', 288,   0, 96, 96, 'sharm'),
    ('pine',     'Outside Objects.png', 192, 128, 96, 96, 'sharm'),
    ('pine2',    'Outside Objects.png', 288, 128, 96, 96, 'sharm'),
    ('trunk',    'Outside Objects.png',   0, 448, 64, 64, 'sharm'),
    ('trunk2',   'Outside Objects.png',  64, 448, 64, 64, 'sharm'),
    ('boulder',  'Terrain and Outside.png', 960, 544, 32, 32, 'sharm'),
    ('menhir',   'Terrain and Outside.png', 992, 640, 32, 64, 'sharm'),
    ('scatter',  'Terrain and Outside.png', 992, 544, 32, 32, 'sharm'),
    ('rubble',   'Terrain and Outside.png', 960, 512, 32, 32, 'sharm'),
    ('bush',     'Terrain and Outside.png',   0, 192, 32, 32, 'sharm'),
    ('bush2',    'Terrain and Outside.png',  32, 192, 32, 32, 'sharm'),
    # Eddeland's wooden fences.  The attribution document names them, which is
    # the only reason they are here — the sheet has several nicer-looking fences
    # in its MISSING: section and those stay in it.
    #
    # One section each rather than the three-section run they are drawn in: a
    # fence in the world database is one doodad at one point, and a run of three
    # would put two of them inside their neighbours.
    ('fence',      'Outside Objects.png',  32, 544, 32, 28, 'eddeland'),
    ('fence2',     'Outside Objects.png', 128, 544, 32, 28, 'eddeland'),
    ('fence_post', 'Outside Objects.png',   0, 576, 32, 32, 'eddeland'),
]


def trim(im):
    box = im.getbbox()
    return im.crop(box) if box else im


def main(src, out):
    for _id, sheet, *_rest, by in GROUND + OBJECTS:
        if by not in AUTHORS:
            sys.exit(f'{_id} names no author ({by})')

    sheets = {}
    for name in {p[1] for p in GROUND + OBJECTS}:
        path = os.path.join(src, name)
        if not os.path.exists(path):
            sys.exit(f'missing sheet {name}')
        sheets[name] = Image.open(path).convert('RGBA')

    cut = []
    for kind, table, do_trim in (('ground', GROUND, False), ('object', OBJECTS, True)):
        for pid, sheet, x, y, w, h, by in table:
            im = sheets[sheet].crop((x, y, x + w, y + h))
            if do_trim:
                im = trim(im)
            cut.append({'id': pid, 'kind': kind, 'by': by, 'im': im})

    # One row per piece height class is not worth it at this count: pack in a
    # simple shelf and write the rectangles out.
    cut.sort(key=lambda c: -c['im'].height)
    WIDTH = 512
    x = y = row = 0
    for c in cut:
        w, h = c['im'].size
        if x + w > WIDTH:
            x, y, row = 0, y + row, 0
        c['x'], c['y'] = x, y
        x += w
        row = max(row, h)
    height = y + row
    atlas = Image.new('RGBA', (WIDTH, height))
    for c in cut:
        atlas.paste(c['im'], (c['x'], c['y']))

    os.makedirs(out, exist_ok=True)
    atlas.save(os.path.join(out, 'tiles.png'), optimize=True)
    meta = {c['id']: {'x': c['x'], 'y': c['y'], 'w': c['im'].width, 'h': c['im'].height,
                      'kind': c['kind']} for c in cut}
    with open(os.path.join(out, 'tiles.json'), 'w') as f:
        json.dump(meta, f, indent=1)

    used = sorted({c['by'] for c in cut})
    with open('art/LPC-TERRAIN-CREDITS.md', 'w') as f:
        f.write('# Tileset credits\n\n')
        f.write('Cut by `pipeline/bake_tiles.py` from the Liberated Pixel Cup tilesets.\n')
        f.write('Generated from the same table the pieces come from, so it cannot fall\n')
        f.write('behind what was actually used.\n\n')
        f.write('Attribution is a licence condition here, not a courtesy. Nothing is cut\n')
        f.write("from the sheets' `MISSING:` section — a CC-BY tile whose author nobody\n")
        f.write('recorded cannot be complied with.\n\n')
        for a in used:
            info = AUTHORS[a]
            pieces = ', '.join(f'`{c["id"]}`' for c in cut if c['by'] == a)
            f.write(f'- **{info["name"]}** — {info["licences"]}  \n')
            if info.get('url'):
                f.write(f'  <{info["url"]}>  \n')
            f.write(f'  {pieces}\n\n')

    # A contact sheet, because a rectangle typed off a grid is a guess until
    # somebody looks at what came out of it.
    pad = 4
    cols = 6
    cw = max(c['im'].width for c in cut) + pad
    ch = max(c['im'].height for c in cut) + pad
    sheet = Image.new('RGB', (cols * cw, ((len(cut) + cols - 1) // cols) * ch), (40, 44, 56))
    for i, c in enumerate(cut):
        sheet.paste(c['im'], ((i % cols) * cw + pad // 2, (i // cols) * ch + pad // 2), c['im'])
    sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(
        os.path.join(out, 'tiles-contact.png'))

    print(f'{len(cut)} pieces, atlas {WIDTH}x{height}, '
          f'{os.path.getsize(os.path.join(out, "tiles.png")) / 1024:.0f} KiB')
    print('  ' + ' '.join(f'{c["id"]}({c["im"].width}x{c["im"].height})' for c in cut))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/src/lpc-tiles'),
         sys.argv[2] if len(sys.argv) > 2 else 'public/art')
