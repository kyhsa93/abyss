#!/usr/bin/env python3
"""Cut the world's furniture out of the Liberated Pixel Cup sets.

The sheets ship one attribution document for the lot, and that document has a
`MISSING:` section — tiles nobody recorded the author of.  A sheet licensed
CC-BY whose author is unknown cannot be complied with: the condition is
attribution and there is nobody to attribute.  So every piece here names an
author, the build refuses one that does not, and the credits are written out of
the same table the pieces come from.

Three sets, because no one of them has everything: the tilesets have the ground
and the trees, the base assets have the water, and the roofs pack has houses —
whole ones, assembled, in its own preview sheet.

  python3 pipeline/bake_tiles.py public/art
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
    'sharm_base': {
        'name': 'Lanea Zimmerman (AKA Sharm)',
        'licences': 'CC-BY-SA 3.0 / CC-BY 3.0 / GPL 3.0 / OGA-BY 3.0',
        'url': ('https://opengameart.org/content/'
                'liberated-pixel-cup-lpc-base-assets-sprites-map-tiles'),
    },
    'roofs': {
        'name': ('bluecarrot16, Lanea Zimmerman (Sharm), Michele Bucelli (Buch), '
                 'Casper Nilsson, Xenodora, keith karnage, NaRNeRZz, Talon (Talosaurus)'),
        'licences': 'CC-BY-SA 3.0 / GPL 3.0',
        'url': 'https://opengameart.org/content/lpc-roofs',
    },
    # The four below are named in the attribution document without a licence of
    # their own, so what applies is the one the document opens with for the
    # whole sheet.
    'casper': {
        'name': 'Casper Nilsson',
        'licences': 'CC-BY-SA 3.0 / GPL 3.0',
        'url': 'https://opengameart.org/content/tiled-terrains',
    },
    'skorpio': {
        'name': 'Skorpio',
        'licences': 'CC-BY-SA 3.0 / GPL 3.0',
        'url': 'https://opengameart.org/content/tiled-terrains',
    },
    'rivera': {
        'name': 'Barbara Rivera / C Phillips',
        'licences': 'CC-BY-SA 3.0 / GPL 3.0',
        'url': 'https://opengameart.org/content/tiled-terrains',
    },
    # Not cut from a sheet: built out of a CC0 model kit and rendered at our own
    # camera by `render_kit.py`.  CC0 asks for no attribution at all, which is
    # exactly why it is written down here — a credit nobody is owed is still
    # the honest record of where a picture came from.
    'kenney': {
        'name': ('Kenney (Fantasy Town Kit, Nature Kit, Mini Forest), '
                 'rendered by pipeline/render_kit.py'),
        'licences': 'CC0 1.0',
        'url': 'https://kenney.nl/assets',
    },
}

# Where each sheet lives.  The sets are kept beside each other under ~/src the
# way the character parts are, rather than vendored here: they are inputs.
ROOTS = {
    'tiles': '~/src/lpc-tiles',
    'base': '~/src/lpc-base/tiles',
    'roofs': '~/src/lpc-roofs',
}
SHEETS = {
    'Terrain and Outside.png': 'tiles',
    'Outside Objects.png': 'tiles',
    'water.png': 'base',
    'roofs-preview.png': 'roofs',
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
    # "grass with flowers", Casper Nilsson's, and the only paving in either
    # sheet that can be used at all.  Both cobbled paths — the herringbone one
    # left of the barrels and the blue brick above the lily pads — are named in
    # `MISSING:`, so a village floor is not available at any price.  These are,
    # and a field that is one flat green everywhere is the thing they fix.
    ('bloom',      'Terrain and Outside.png',  96, 352, 32, 32, 'casper'),
    ('bloom2',     'Terrain and Outside.png', 128, 352, 32, 32, 'casper'),
    ('bloom3',     'Terrain and Outside.png', 160, 352, 32, 32, 'casper'),
    # Open water, bottom row of Sharm's sheet — the rows above it are shorelines
    # and a shoreline repeated is a row of ponds.
    ('water',      'water.png',   0, 160, 32, 32, 'sharm_base'),
    ('water2',     'water.png',  32, 160, 32, 32, 'sharm_base'),
    ('water3',     'water.png',  64, 160, 32, 32, 'sharm_base'),
]

# Houses, cut whole out of the roofs pack's own preview sheet.
#
# The pack ships a tileset; the preview ships the tileset *assembled*, twenty
# four buildings with proper alpha.  Cutting those is the difference between
# having houses today and writing a tile-assembly system first, and the art is
# the same art either way.  Boxes found by walking the alpha for connected
# regions over fifty pixels across, then read off a contact sheet.
HOUSES = [
    ('house_a', 224,  96, 160, 192),
    ('house_b', 800,  96, 128, 192),
    ('house_c', 352, 384, 128, 224),
    ('house_d', 224, 400,  96, 208),
    ('house_e', 224, 704,  96, 192),
    ('house_f', 736, 1056, 96, 160),
    ('hall',    512, 384, 320, 224),
    ('tower',   859, 1024, 234, 288),
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

    # Everything below is art the world was already asking for and not getting.
    # The bake writes a kind for every doodad the client has — `barrel`, `cart`,
    # `crop`, `lily`, `water_plant`, `prop` — and `src/main.ts` was drawing a
    # grey blob for all of them, because nothing here had been cut.  Boxes are
    # not read off the grid: they are the connected alpha regions of the sheet,
    # the same way the house boxes were found, because a cart's shafts stick out
    # of its cell and a 32-aligned guess cuts them off.

    # Sharm's barrels, on the terrain sheet.
    ('barrel',     'Terrain and Outside.png', 292, 586, 28, 38, 'sharm'),
    ('barrel2',    'Terrain and Outside.png', 199, 581, 21, 24, 'sharm'),
    ('barrel3',    'Terrain and Outside.png', 199, 613, 21, 24, 'sharm'),
    ('barrels',    'Terrain and Outside.png', 192, 643, 48, 61, 'sharm'),
    # Skorpio's, which the document places by where it sits: "top right corner".
    ('barrel4',    'Outside Objects.png',     963,  24, 26, 36, 'skorpio'),

    # Casper Nilsson's lily pads and stumps.
    ('lily',       'Terrain and Outside.png', 224, 545, 31, 31, 'casper'),
    ('lily2',      'Terrain and Outside.png', 354, 548, 30, 28, 'casper'),
    ('lily3',      'Terrain and Outside.png', 769, 487, 28, 22, 'casper'),
    ('stump',      'Terrain and Outside.png', 967, 747, 50, 41, 'casper'),

    # Eddeland's water reeds, which is what 710 `water_plant` doodads are.
    ('reeds',      'Terrain and Outside.png',   0, 817, 32, 104, 'eddeland'),
    ('reeds2',     'Terrain and Outside.png',  33, 819, 94, 103, 'eddeland'),

    # Eddeland's farm: what a yard has standing in it.
    ('hay',        'Outside Objects.png', 323, 561, 57, 78, 'eddeland'),
    ('sack',       'Outside Objects.png', 384, 529, 32, 31, 'eddeland'),
    ('sacks',      'Outside Objects.png', 480, 513, 64, 63, 'eddeland'),
    ('basket',     'Outside Objects.png', 384, 599, 32, 25, 'eddeland'),
    ('baskets',    'Outside Objects.png', 480, 583, 60, 51, 'eddeland'),
    ('basket2',    'Outside Objects.png', 384, 663, 32, 25, 'eddeland'),
    ('baskets2',   'Outside Objects.png', 480, 647, 60, 51, 'eddeland'),
    ('crate',      'Outside Objects.png', 288, 642, 32, 24, 'eddeland'),
    ('stall',      'Outside Objects.png', 544, 710, 95, 68, 'eddeland'),
    ('firewood',   'Outside Objects.png', 386, 464, 30, 32, 'eddeland'),
    ('firewood2',  'Outside Objects.png', 434, 448, 30, 32, 'eddeland'),
    ('woodpile',   'Outside Objects.png', 487, 453, 52, 55, 'eddeland'),
    ('anvil',      'Outside Objects.png', 579, 480, 29, 31, 'eddeland'),
    ('pumpkin',    'Outside Objects.png', 644, 163, 25, 24, 'eddeland'),
    ('corn',       'Outside Objects.png', 770, 257, 28, 62, 'eddeland'),
    ('corn2',      'Outside Objects.png', 802, 257, 28, 62, 'eddeland'),
    ('carrots',    'Outside Objects.png', 674, 672, 24, 64, 'eddeland'),
    ('tomatoes',   'Outside Objects.png', 865, 285, 31, 33, 'eddeland'),
    ('sprout',     'Outside Objects.png', 865, 221, 31, 33, 'eddeland'),
    ('sprout2',    'Outside Objects.png', 992, 165, 31, 27, 'eddeland'),

    # Casper Nilsson's tent, wheelbarrows and gravestones.
    ('tent',       'Outside Objects.png',   2, 709, 124, 150, 'casper'),
    ('cart',       'Outside Objects.png', 288, 805, 64, 55, 'casper'),
    ('cart2',      'Outside Objects.png', 128, 841, 64, 45, 'casper'),
    ('haycart',    'Outside Objects.png', 200, 837, 80, 55, 'casper'),
    ('grave',      'Outside Objects.png', 968, 596, 47, 44, 'casper'),
    ('grave2',     'Outside Objects.png', 992, 546, 28, 27, 'casper'),

    # Barbara Rivera's leafless tree — one dead trunk in a wood of live ones.
    ('deadtree',   'Outside Objects.png', 394, 258, 76, 92, 'rivera'),

    # Sharm's oak and evergreen tops again, at the size they are drawn rather
    # than cut down to a 32 pixel cell: these are the shrubs, not the trees.
    ('shrub',      'Outside Objects.png', 194,   0, 94, 80, 'sharm'),
    ('shrub2',     'Outside Objects.png', 290,  16, 94, 80, 'sharm'),
]


# (id, file, author).  Pieces that are rendered rather than cut — the output of
# `render_kit.py`, which builds them out of a 3D kit and photographs them at the
# projection `src/main.ts` draws in.  They come in already trimmed and already
# at the right pixels-per-yard, so this table is only where they join the atlas.
RENDERED = [
    ('kit_bush', 'kit_bush.png', 'kenney'),
    ('kit_bush2', 'kit_bush2.png', 'kenney'),
    ('kit_bush3', 'kit_bush3.png', 'kenney'),
    ('kit_bush4', 'kit_bush4.png', 'kenney'),
    ('kit_cart', 'kit_cart.png', 'kenney'),
    ('kit_cart2', 'kit_cart2.png', 'kenney'),
    ('kit_fence', 'kit_fence.png', 'kenney'),
    ('kit_fence2', 'kit_fence2.png', 'kenney'),
    ('kit_fence2_b', 'kit_fence2_b.png', 'kenney'),
    ('kit_fence_b', 'kit_fence_b.png', 'kenney'),
    ('kit_flower', 'kit_flower.png', 'kenney'),
    ('kit_flower2', 'kit_flower2.png', 'kenney'),
    ('kit_flower3', 'kit_flower3.png', 'kenney'),
    ('kit_fountain', 'kit_fountain.png', 'kenney'),
    ('kit_gate', 'kit_gate.png', 'kenney'),
    ('kit_gate_b', 'kit_gate_b.png', 'kenney'),
    ('kit_grass', 'kit_grass.png', 'kenney'),
    ('kit_grass2', 'kit_grass2.png', 'kenney'),
    ('kit_grass3', 'kit_grass3.png', 'kenney'),
    ('kit_hall', 'kit_hall.png', 'kenney'),
    ('kit_hedge', 'kit_hedge.png', 'kenney'),
    ('kit_hedge2', 'kit_hedge2.png', 'kenney'),
    ('kit_house', 'kit_house.png', 'kenney'),
    ('kit_house_stone', 'kit_house_stone.png', 'kenney'),
    ('kit_lantern', 'kit_lantern.png', 'kenney'),
    ('kit_log', 'kit_log.png', 'kenney'),
    ('kit_log2', 'kit_log2.png', 'kenney'),
    ('kit_logs', 'kit_logs.png', 'kenney'),
    ('kit_mushroom', 'kit_mushroom.png', 'kenney'),
    ('kit_mushroom2', 'kit_mushroom2.png', 'kenney'),
    ('kit_mushroom3', 'kit_mushroom3.png', 'kenney'),
    ('kit_pine', 'kit_pine.png', 'kenney'),
    ('kit_pine2', 'kit_pine2.png', 'kenney'),
    ('kit_pine3', 'kit_pine3.png', 'kenney'),
    ('kit_pine4', 'kit_pine4.png', 'kenney'),
    ('kit_planks', 'kit_planks.png', 'kenney'),
    ('kit_plant', 'kit_plant.png', 'kenney'),
    ('kit_rock', 'kit_rock.png', 'kenney'),
    ('kit_rock2', 'kit_rock2.png', 'kenney'),
    ('kit_rock3', 'kit_rock3.png', 'kenney'),
    ('kit_rock4', 'kit_rock4.png', 'kenney'),
    ('kit_stall', 'kit_stall.png', 'kenney'),
    ('kit_stall2', 'kit_stall2.png', 'kenney'),
    ('kit_stones', 'kit_stones.png', 'kenney'),
    ('kit_tent', 'kit_tent.png', 'kenney'),
    ('kit_tree', 'kit_tree.png', 'kenney'),
    ('kit_tree2', 'kit_tree2.png', 'kenney'),
    ('kit_tree3', 'kit_tree3.png', 'kenney'),
    ('kit_tree4', 'kit_tree4.png', 'kenney'),
    ('kit_watermill', 'kit_watermill.png', 'kenney'),
    ('kit_wheel', 'kit_wheel.png', 'kenney'),
    ('kit_windmill', 'kit_windmill.png', 'kenney'),
]
# Where `render_kit.py` was told to put them.
RENDERS = 'public/art/kit'


def trim(im):
    box = im.getbbox()
    return im.crop(box) if box else im


def main(out):
    for _id, _sheet, *_rest, by in GROUND + OBJECTS + RENDERED:
        if by not in AUTHORS:
            sys.exit(f'{_id} names no author ({by})')

    sheets = {}
    for name, root in SHEETS.items():
        path = os.path.join(os.path.expanduser(ROOTS[root]), name)
        if not os.path.exists(path):
            sys.exit(f'missing sheet {path}')
        sheets[name] = Image.open(path).convert('RGBA')

    cut = []
    for kind, table, do_trim in (('ground', GROUND, False), ('object', OBJECTS, True)):
        for pid, sheet, x, y, w, h, by in table:
            im = sheets[sheet].crop((x, y, x + w, y + h))
            if do_trim:
                im = trim(im)
            cut.append({'id': pid, 'kind': kind, 'by': by, 'im': im})
    for pid, x, y, w, h in HOUSES:
        im = trim(sheets['roofs-preview.png'].crop((x, y, x + w, y + h)))
        cut.append({'id': pid, 'kind': 'object', 'by': 'roofs', 'im': im})
    for pid, name, by in RENDERED:
        path = os.path.join(RENDERS, name)
        if not os.path.exists(path):
            sys.exit(f'missing render {path} — run pipeline/render_kit.py first')
        cut.append({'id': pid, 'kind': 'object', 'by': by,
                    'im': trim(Image.open(path).convert('RGBA'))})

    # One row per piece height class is not worth it at this count: pack in a
    # simple shelf and write the rectangles out.
    cut.sort(key=lambda c: -c['im'].height)
    WIDTH = 1024
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
    main(sys.argv[1] if len(sys.argv) > 1 else 'public/art')
