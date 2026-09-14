#!/usr/bin/env python3
"""An underlay to draw each building over, out of the building's own numbers.

  python3 pipeline/facade.py [client] [out]

The scene draws a building as a stamp on the ground grid, so Northshire's abbey
— ninety-one yards across and turned 158 degrees — comes out a grey rectangle
with eight black squares in it.  The fix is a picture per building, turned the
way the placement turns it, and the question was whether we can draw one
faithfully enough to call it the original's building.

We can, and the reason is that the model states everything about its *shape* in
numbers: `MODF` says where and which way, `MOHD` and `MOGI` say how big the
whole and each part is, `MOVT`/`MOVI` are the triangles, `MOPT`/`MOPV` are the
doors, and `MOMT`/`MOTX` say what each surface is *called*.  Project the
up-facing triangles orthographically and shade them by height and the abbey's
cross plan, its transepts, its crossing tower and its apse all come out.

**That projection is not a drawing.**  Every shape in it is Blizzard's, and a
picture derived from their mesh is a different thing from the masks this
pipeline already emits — `plans`, `rooms`, `doors` are functional data nobody
looks at, and a projection is the thing the player would be looking at.  So it
does not ship.  It is an *underlay*: the exact silhouette, massing, roof line
and door positions, for somebody to draw over in this game's own hand.  The
`.png` is written where `.gitignore` keeps it, and only the `.json` — numbers
and words — is committed.

The material names are the other half of the brief.  A texture path is a word,
not a pixel, and the words describe the building: the abbey is
`ABBEY_WALL`/`ABBEY_BRICK` under `WOODROOF` with `STAINED` glass and
`WROUGHTIRON`; the inn is `REDBRICK` with `STRMWND_SUPPORTS` timbers, two roofs,
`ELWYNN_WND` windows and a `FIREPLACE`.  Nothing of the texture itself leaves.

One thing the model does *not* give: where the windows are.  Portals looked like
the answer — a portal shorter than a man was already being filtered out as "a
window or a hole in a floor" — and they are not: the abbey has two of those and
the inn one, because a portal is a hole cut for visibility between rooms, not a
window.  The material list says a building *has* windows and the geometry has
them, but nothing here finds them yet.

**Then the brief was drawn from, which is the only way to find out what a brief
is missing.**  Issue 215's last condition was to draw a building from the
`.json` alone — no client, no triangles, no underlay — and the first attempt
came out as a 92-yard box with eight doors correctly placed inside it and
fourteen part *sizes* with **nowhere to put them**.  `MOGI` states each group's
`(lo, hi)` and both corners were being read; only the difference was written
out.  A field computed and never read, in a file whose entire purpose is to be
read.  A part is six numbers now — corner, extent, height and the height of its
own base — and drawn from those alone the abbey has its cross plan, its
transepts, its crossing block standing above the rest, and its doors on the
right walls.

Four things a brief still cannot say, and each of them is a property of a box
rather than a gap in the reading:

  * **a turned part comes out square.**  The abbey's annex sits at 45 degrees
    inside the model and `MOGI` states an axis-aligned box, so the brief draws
    a rectangle where the building has a diamond
  * **a curved end comes out flat.**  An apse is a semicircle and a box is a box
  * **a roof has a height and no ridge.**  Which way the pitch runs is in the
    triangles and nowhere in six numbers
  * **where the windows are** — unchanged, and now the only one of the four
    that could be fixed by reading something new rather than by shipping
    geometry

The first three all have the same answer if they are ever worth having, and it
is the one this file is careful about: shipping the up-facing outline itself is
shipping Blizzard's silhouette, which is what the underlay is for.
"""
import json
import os
import struct
import sys
import zlib
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bake_terrain as B  # noqa: E402

try:
    from PIL import Image, ImageDraw
except ImportError:                                     # pragma: no cover
    sys.exit('facade.py needs Pillow: pip install --user pillow')


# One pixel to a fortieth of a yard is twice the ground's own 24, which is what
# an underlay wants: you draw at the game's scale and the reference is finer
# than the thing you are drawing.
PX_PER_YARD = 40

# The biggest sheet worth writing.  Stormwind is a thousand yards across and is
# not a building this game draws; the cap keeps a stray city out rather than
# choosing a resolution.
MAX_PX = 4096

# What a texture's *name* says the surface is.  The word leaves, the texture
# does not — the same bargain `bake_terrain.classify_ground` makes with a
# tileset path and `spawn_npcs` makes with a creature name.
# A texture is named `MM_<place>_<part>_<n>`, so the part is a *token* and not a
# substring.  Read as a substring, `MM_STRMWND_WALL_03` is a window — `STRMWND`
# is Stormwind — and the farm came back with thirteen hundred window triangles
# and no walls.
WORDS = (
    ('roof', ('ROOF',)),
    ('window', ('WND', 'WINDOW', 'STAINED', 'GLASS')),
    # A beam, a support or a cask is wood showing on the outside of a building,
    # and in Elwynn that is half of what a house looks like.
    ('wood', ('BEAM', 'SUPPORT', 'SUPPORTS', 'WOOD', 'CASK', 'PLANK', 'RAIL')),
    ('floor', ('FLOOR', 'STREET', 'GROUND')),
    ('ceiling', ('CEILING',)),
    ('door', ('DOOR', 'GATE')),
    ('wall', ('WALL', 'BRICK', 'STONE', 'TRIM', 'BORDER')),
)


def surface_of(name):
    """One word for what a material is, out of its texture's filename."""
    parts = set(name.upper().replace('.BLP', '').split('_'))
    for word, tokens in WORDS:
        if parts & set(tokens):
            return word
    return 'wall'


# What each word is drawn as in the underlay.  These are not the game's colours
# — the underlay is a reference sheet, so the palette is chosen to be read at a
# glance rather than to look like anything.
INK = {
    'wall': (150, 146, 138),
    'roof': (176, 120, 96),
    'window': (110, 160, 190),
    'wood': (150, 116, 78),
    'floor': (200, 196, 180),
    'ceiling': (130, 128, 124),
    'door': (90, 70, 55),
}


def materials(client, path):
    """Every material's surface word, in the order `MOBA` indexes them."""
    data, _src = client.read(path)
    if not data:
        return []
    names, mats, i = b'', [], 0
    while i < len(data) - 8:
        m = data[i:i + 4][::-1].decode('ascii', 'replace')
        size, = struct.unpack_from('<I', data, i + 4)
        o = i + 8
        if m == 'MOTX':
            names = data[o:o + size]
        elif m == 'MOMT':
            # 64 bytes a material; the third uint is the offset of its first
            # texture's name into MOTX.
            for k in range(size // 64):
                v = struct.unpack_from('<12I', data, o + k * 64)
                mats.append(v[3])
        i = o + size
    out = []
    for off in mats:
        if 0 <= off < len(names):
            end = names.find(b'\0', off)
            out.append(names[off:end].decode('ascii', 'replace').split('\\')[-1])
        else:
            out.append('')
    return out


def faces(client, path):
    """Triangles with the material each one wears, out of the group files.

    A WMO is one root file and a numbered group file per room, and the root has
    no geometry at all — which is why the first attempt at this came back empty.
    `MOBA` inside a group maps a run of indices to a material, and that run is
    the only place the two halves meet.
    """
    out = []
    for g in range(512):
        data, _src = client.read('%s_%03d.wmo' % (path[:-4], g))
        if not data:
            break
        verts = idx = None
        batches = []
        i = 0
        while i < len(data) - 8:
            m = data[i:i + 4][::-1].decode('ascii', 'replace')
            size, = struct.unpack_from('<I', data, i + 4)
            o = i + 8
            if m == 'MOGP':
                # A group header wraps its own subchunks: step over the header
                # and keep reading at the same level rather than past it.
                i = o + 68
                continue
            if m == 'MOVT':
                verts = [struct.unpack_from('<3f', data, o + k * 12)
                         for k in range(size // 12)]
            elif m == 'MOVI':
                idx = struct.unpack_from('<%dH' % (size // 2), data, o)
            elif m == 'MOBA':
                for k in range(size // 24):
                    start, count = struct.unpack_from('<IH', data, o + k * 24 + 12)
                    mat, = struct.unpack_from('<B', data, o + k * 24 + 23)
                    batches.append((start, count, mat))
            i = o + size
        if not verts or not idx:
            continue
        mat_of = {}
        for start, count, mat in batches:
            for t in range(start // 3, (start + count) // 3):
                mat_of[t] = mat
        for t in range(len(idx) // 3):
            a, b, c = idx[3 * t], idx[3 * t + 1], idx[3 * t + 2]
            out.append((verts[a], verts[b], verts[c], mat_of.get(t, 0), g))
    return out


def sheet(tris, words, doors, px_per_yard):
    """The underlay: what you would see looking straight down, by height.

    Only up-facing triangles, because a roof is what a building shows from
    above and its walls are the edges between roofs.  Painted lowest first so
    the tower lands on the nave rather than under it.
    """
    xs = [q[0] for t in tris for q in t[:3]]
    ys = [q[1] for t in tris for q in t[:3]]
    zs = [q[2] for t in tris for q in t[:3]]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    lo, hi = min(zs), max(zs)
    w = max(1, min(MAX_PX, int((x1 - x0) * px_per_yard) + 2))
    h = max(1, min(MAX_PX, int((y1 - y0) * px_per_yard) + 2))
    s = min(w / max(1e-6, x1 - x0), h / max(1e-6, y1 - y0))
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    for a, b, c, mat, _g in sorted(tris, key=lambda t: min(q[2] for q in t[:3])):
        # Winding, not a normal: from straight above, a face you can see is one
        # whose vertices go anticlockwise on the ground plane.
        if (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) <= 0:
            continue
        word = words[mat] if mat < len(words) else 'wall'
        z = max(a[2], b[2], c[2])
        shade = 0.45 + 0.55 * (z - lo) / max(1e-6, hi - lo)
        base = INK.get(word, INK['wall'])
        dr.polygon([(1 + (q[0] - x0) * s, 1 + (q[1] - y0) * s) for q in (a, b, c)],
                   fill=tuple(min(255, int(v * shade)) for v in base) + (255,))
    # The doors, so whoever draws knows where the openings have to land.  A
    # ring rather than a blob: it marks a place without hiding what is under it.
    for sill, dx, dy in doors:
        cx, cy = 1 + (dx - x0) * s, 1 + (dy - y0) * s
        r = 0.9 * s
        dr.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(230, 80, 60, 255),
                   width=max(1, int(s / 8)))
    return img, (x0, y0, s)


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/workspace/warmane')
    out = sys.argv[2] if len(sys.argv) > 2 else 'art/facade'
    client = B.Client(root)
    B.derive_body(client)
    os.makedirs(out, exist_ok=True)

    # Which models actually stand in the slice, out of the same `MODF` records
    # `bake_terrain` reads.  A model placed nowhere is a model nobody has to
    # draw, and half the file table is somewhere else.
    tiles = json.load(open('public/data/terrain.json'))['tiles']
    placed = {}
    for t in tiles:
        data, _src = client.read('World\\Maps\\Azeroth\\Azeroth_%s.adt' % t)
        if not data:
            continue
        names = []
        for magic, off, size in B.chunks(data):
            if magic == 'MWMO':
                names = [n.decode('ascii', 'replace')
                         for n in data[off:off + size].split(b'\0') if n]
            elif magic == 'MODF':
                for i in range(size // 64):
                    v = struct.unpack_from('<IIffffffffffff', data, off + i * 64)
                    if v[0] < len(names):
                        placed.setdefault(names[v[0]], 0)
                        placed[names[v[0]]] += 1

    # Only what the scene draws as a building.  A wall piece and a bridge have
    # footprints too, and neither is a thing anybody draws a house for.
    SKIP = ('WALLPIECE', 'WALLPOST', 'BRIDGE', 'FOOTBRIDGE', 'HARBOR', 'DOCKS',
            'SHIP', 'WRECK', 'WORLDTREE', 'STORMWIND.WMO', 'BLACKROCK.WMO')

    briefs, drawn, skipped, local = [], 0, 0, {}
    for path, count in sorted(placed.items(), key=lambda kv: -kv[1]):
        name = path.split('\\')[-1]
        if any(k in name.upper() for k in SKIP):
            skipped += 1
            continue
        if not B.wmo_plan(client, path):
            skipped += 1                # too big to rasterise: a city
            continue
        whole, groups = B.wmo_rooms(client, path)
        tris = faces(client, path)
        if not tris or not whole:
            skipped += 1
            continue
        words = [surface_of(m) for m in materials(client, path)]
        ways = B.doorways(client, path)
        base = min((d[0] for d in ways), default=0.0)
        ground = [d for d in ways if abs(d[0] - base) <= B.BODY]
        sills = sorted(set(round(d[0], 1) for d in ways))
        storeys, last = ([sills[0]], sills[0]) if sills else ([], 0.0)
        for s in sills[1:]:
            if s - last > B.BODY:
                storeys.append(s)
            last = s

        img, (x0, y0, _scale) = sheet(tris, words, ground, PX_PER_YARD)
        # **The sheet is named after the key, not after the model.**
        #
        # It was the model's own file name — `NSABBEY.png`, `GOLDSHIREINN.png`
        # — and `facade.json` is committed, so a client's file table was
        # leaving in the one field of the brief nobody had looked at.  The
        # `.png` is gitignored and the `.json` is not: the rule this repository
        # keeps is that a *model path* does not enter it, and the leaf of a
        # path is a path.  `bake_terrain` already solved this for the same
        # reason and with the same tool — *an opaque number for "the same
        # model"* — so the brief borrows it, and the readable name is printed
        # to the terminal where it stays on the machine that has the client.
        key = zlib.crc32(path.upper().encode())
        stem = name[:-4] if name.upper().endswith('.WMO') else name
        img.save(os.path.join(out, '%d.png' % key))
        drawn += 1

        # And the brief beside it: numbers and words, which is what ships.
        tally = Counter(words[t[3]] if t[3] < len(words) else 'wall' for t in tris)
        briefs.append({
            'model': key,
            'sheet': '%d.png' % key,
            'placements': count,
            'yards': [round(whole[1][0] - whole[0][0], 1),
                      round(whole[1][1] - whole[0][1], 1),
                      round(whole[1][2] - whole[0][2], 1)],
            # **Six numbers a part, not three**, and the three that were
            # missing are where it is.
            #
            # Issue 215's last condition is *draw one from the brief alone and
            # write down what is missing*, and what was missing was this: the
            # abbey came out as a 92-yard box with eight doors in the right
            # places and fourteen part sizes with **nowhere to put them**.  No
            # cross plan, no transepts, no crossing tower — the shape of the
            # building was entirely in the underlay, which does not ship.
            #
            # `MOGI` states each group's `(lo, hi)` and both corners were read;
            # only the difference was written out.  A field computed and never
            # read, in a file whose whole purpose is to be read.  The corner is
            # relative to the same origin the doors use, so the two line up.
            'parts': [[round(lo[0] - x0, 1), round(lo[1] - y0, 1),
                       round(hi[0] - lo[0], 1), round(hi[1] - lo[1], 1),
                       round(hi[2] - lo[2], 1), round(lo[2], 1)]
                      for lo, hi in [(g[1], g[2]) for g in groups]],
            'storeys': [round(s, 1) for s in storeys],
            'doors': [[round(d[1] - x0, 2), round(d[2] - y0, 2)] for d in ground],
            'origin': [round(x0, 2), round(y0, 2)],
            'pixelsPerYard': PX_PER_YARD,
            'surfaces': dict(sorted(tally.items(), key=lambda kv: -kv[1])),
        })
        # Local only — popped before the file is written, the same way
        # `bake_terrain` keeps `PLAN_PATH` out of its own output.
        local[key] = stem

    briefs.sort(key=lambda b: -b['placements'])
    with open(os.path.join(out, 'facade.json'), 'w') as f:
        json.dump({'_': 'What each building is, for somebody to draw it. '
                        'Numbers and words only; the .png beside this is an '
                        'underlay and is not committed.',
                   'buildings': briefs}, f, indent=1, sort_keys=True)

    total = sum(b['placements'] for b in briefs)
    print('%d models -> %s   (%d placements, %d skipped as not a building)'
          % (drawn, out, total, skipped))
    cover, so_far = 0, 0
    for b in briefs:
        so_far += b['placements']
        cover += 1
        if so_far >= total * 0.5:
            break
    print('check: %d of %d sheets cover half the placements (%d of %d)'
          % (cover, drawn, so_far, total))
    missing = [local[b['model']] for b in briefs if not b['doors']]
    print('check: %d of %d have no ground-floor door, which is a building you '
          'cannot get into' % (len(missing), drawn))
    for b in briefs[:6]:
        print('   %-28s x%-3d %5.0f x %-5.0f yd  parts %-3d storeys %d  %s'
              % (local[b['model']] + '.png', b['placements'],
                 b['yards'][0], b['yards'][1],
                 len(b['parts']), len(b['storeys']),
                 ' '.join('%s %d' % kv for kv in list(b['surfaces'].items())[:4])))
    print('   (the sheets on disk are named after the key, because the brief '
          'is committed and a model name is a model path)')


if __name__ == '__main__':
    main()
