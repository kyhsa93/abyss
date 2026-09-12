#!/usr/bin/env python3
"""Bake one slice of the client's terrain into something a browser can hold.

Reads the client's own `.adt` tiles out of the MPQ archives and writes a single
height grid plus the doodad placements that stand on it.  Nothing that comes out
of here is committed: see the wiki page "저작권과 배포 경계".  The output is a
local artefact for looking at, and the checks below are what say it is right.

Why Python and not TypeScript, when the pipeline page argues for TypeScript:
reading an MPQ means the hash/block tables, the crypt table, sector
decompression and PKWARE explode.  `mpyq` already does all of it and there is
no equivalent on npm.  The SQL side of the pipeline can still be TypeScript —
this is the one wall where the tool decides the language.

Run:  python3 pipeline/bake_terrain.py <client dir> <out dir>
"""
import json
import math
import os
import struct
import zlib
import sys

from mpyq import MPQArchive

TILE = 533.33333          # SIZE_OF_GRIDS
CHUNK = TILE / 16         # ADT_CELLS_PER_GRID
UNIT = CHUNK / 8          # one height cell: 4.1667 yards
ORIGIN = 32 * TILE        # the map's corner, because the origin is its middle

# Highest patch wins.  Which archive a file actually comes from differs per
# file, so the chain is walked for every read rather than resolved once.
CHAIN = ['patch-3.MPQ', 'patch-2.MPQ', 'patch.MPQ',
         'lichking.MPQ', 'expansion.MPQ', 'common-2.MPQ', 'common.MPQ']


# The client's own file paths are Blizzard's, so they do not leave this script:
# a doodad comes out as a *kind*, and the renderer picks one of our own models
# for that kind.  This is the boundary from the wiki made into code rather than
# into a comment — if a path ever reached the output, it would be a licence
# problem that nothing would catch.
# WMO placements — buildings — get the same treatment as doodads: the path is
# Blizzard's and does not leave this script, only the word for what it is.
WMO_KINDS = [
    ('ABBEY', 'hall'), ('CATHEDRAL', 'hall'), ('KEEP', 'hall'), ('CASTLE', 'hall'),
    ('TOWER', 'tower'), ('INN', 'house'), ('HOUSE', 'house'), ('HUT', 'house'),
    ('COTTAGE', 'house'), ('FARM', 'house'), ('BARN', 'house'), ('MILL', 'house'),
    # Also found by the audit: a mine mouth and an animal den are holes in a
    # hillside, not cottages, and there is no picture here for either.
    ('MINE', None), ('DEN', None), ('BURROW', None),
    # A bridge was thrown away for four rounds, which is why six of Elwynn's
    # crossings were open water with a fence beside them.  It is a floor, and a
    # floor is something this repository can draw.
    # Stone and wood are two different floors, and the kind is what carries
    # that — the same bargain `tree` and `pine` make.  The lion bridge is
    # thirty-three yards wide, so planking it laid a wooden plaza over the
    # river; it is a stone causeway and it is drawn as one.
    ('LIONBRIDGE', 'bridge_stone'), ('BRIDGE', 'bridge'), ('DOCK', 'bridge'),
    ('GATE', None), ('WALL', None), ('SEWER', None),
]


# The names the fallbacks get *right*, declared rather than assumed.
#
# Every classifier here ends in a default, and that is the whole reason the
# world kept coming out different: a default is right often enough to be
# invisible and wrong often enough to matter.  `grass` is the correct answer
# for `ElwynnGrassBase` and the wrong one for `BurningSteppsCharcoal01`, and
# until these lists existed nothing could tell the two apart.  `audit.py` walks
# the slice and fails on any name that takes a default without being here.
DOODAD_DEFAULT_OK = []      # `classify` already reports what it skips
WMO_DEFAULT_OK = [
    # Buildings the `house` fallback is honest about: a stable, a barracks, a
    # smithy and a two-storey townhouse are all buildings this repository draws
    # as a building.
    'STABLE', 'BARRACKS', 'TWOSTORY', 'BLACKSMITH', 'KENNEL', 'HANGAR',
    'STORMWIND.WMO',        # the city itself, drawn as one of its own houses
]
GROUND_DEFAULT_OK = [
    # Ground the `grass` fallback is honest about.  Six of Elwynn's own, plus
    # the neighbours' grass that leaks over the slice's edges.
    'GRASSBASE', 'GRASSDARK', 'SCRUBBRUSH', 'LEAF', 'UNDERWATERGRASS',
]


def classify_wmo(path):
    p = path.upper()
    for needle, kind in WMO_KINDS:
        if needle in p:
            return kind
    return 'house'


# What a doodad is, from Blizzard's path.  The order is the order it is asked
# in, so the specific words come first.
#
# Everything that reaches the end of this list is **skipped**, and that is the
# change that matters.  It used to fall through to `prop`, which draws a market
# stall — so a thousand things this repository has no picture for became stalls
# scattered through the forest, including twenty-six waterfalls standing in
# their own rivers.  A doodad nobody can draw is better left out than drawn as
# something else, and the bake now says how many it left out.
KINDS = [
    ('TREES\\', 'tree'), ('PINE', 'pine'), ('TREE', 'tree'),
    ('BUSH', 'bush'), ('SHRUB', 'bush'),
    ('FENCE', 'fence'), ('WOODPOST', 'fence'), ('POST', 'fence'),
    ('CLIFFROCK', 'rock'), ('ROCK', 'rock'), ('BOULDER', 'rock'),
    ('LILYPAD', 'lily'), ('SEAWEED', 'water_plant'), ('SWAMPPLANT', 'water_plant'),
    ('GRASS', 'grass'), ('PLANT', 'grass'), ('FLOWER', 'flower'), ('CABBAGE', 'crop'),
    ('MUSHROOM', 'mushroom'), ('STUMP', 'stump'), ('LOG', 'log'),
    ('BARREL', 'barrel'), ('CRATE', 'barrel'), ('SACK', 'barrel'),
    ('LAMPPOST', 'lamp'), ('LANTERN', 'lamp'), ('TORCH', 'lamp'),
    ('SIGN', 'sign'), ('CAMPFIRE', 'campfire'),
    ('TENT', 'tent'), ('WAGON', 'cart'), ('WHEELBARROW', 'cart'),
    ('DOCK', 'bridge'),
    # The vineyard is one doodad thirty-eight yards long and it is the whole of
    # Northshire's south-west corner — five of them, and every one was dropped
    # because no word here matched.  `CROP` does not: a crop is a row of
    # vegetables and this is a trellis with grapes on it.
    ('VINEYARD', 'vine'), ('GRAPE', 'vine'),
    ('PUMPKINPATCH', 'crop'), ('PUMPKIN', 'crop'), ('CORNSTALK', 'crop'),
    # Named rather than left to the catch-all, because each of these had a
    # picture already and was being drawn as a market stall.
    ('TOMBSTONE', 'grave'), ('GRAVE', 'grave'), ('HEADSTONE', 'grave'),
    ('HAY', 'hay'), ('STRAW', 'hay'),
    ('SKULL', 'bones'), ('BONE', 'bones'), ('RIBCAGE', 'bones'),
    ('HUT', 'house'),
    ('JAR', 'prop'), ('JUG', 'prop'), ('BUCKET', 'prop'), ('BASIN', 'prop'),
    ('SHOVEL', 'prop'), ('ROPE', 'prop'), ('CHAIR', 'prop'),
    ('TABLE', 'prop'), ('BENCH', 'prop'), ('ANVIL', 'prop'),
    ('LUMBER', 'prop'), ('PLANK', 'prop'), ('LOG', 'log'),
]


# What the client painted the ground with, as one of our own words.  Elwynn's
# seven textures are grass, flowers, dirt, cobble, rock, a crop field and a
# scrub brush borrowed from Aerie Peaks — and the dirt is the road.  Nothing
# else in this repository knows where a road is: AzerothCore has no road table,
# the height grid does not bend for one, and the doodads stop at the verge.
GROUND_KINDS = [
    ('COBBLE', 'paved'), ('BRICK', 'paved'), ('PAVE', 'paved'),
    ('ROAD', 'road'), ('DIRT', 'road'), ('TRAIL', 'road'), ('PATH', 'road'),
    ('CROP', 'crop'), ('FARM', 'crop'), ('FIELD', 'crop'),
    ('ROCK', 'rock'), ('CLIFF', 'rock'),
    # Found by the audit: eight thousand layers were taking the `grass`
    # fallback and a fifth of them were the Burning Steppes — ash, charcoal and
    # lava drawn as a green lawn, because nothing named them.
    ('ASH', 'rock'), ('CHARCOAL', 'rock'), ('LAVA', 'rock'),
    ('RUBBLE', 'rock'), ('BLACK', 'rock'),
    ('STRAW', 'crop'),
    ('FLOWER', 'bloom'),
    ('SNOW', 'snow'), ('SAND', 'sand'),
]
# The order the scene should prefer when two of them cover the same texel, most
# deliberate first: somebody laid a road, and grass is what happens anyway.
GROUND_ORDER = ['paved', 'road', 'crop', 'sand', 'snow', 'rock', 'bloom', 'grass']


def classify_ground(path):
    p = path.upper()
    for needle, kind in GROUND_KINDS:
        if needle in p:
            return kind
    return 'grass'


def subchunks(data, off, size):
    """The sub-chunks of one MCNK, which the generic walker cannot do.

    `MCNR` is followed by thirteen bytes that its own size does not count, so a
    walker that trusts the sizes desynchronises on the third sub-chunk and
    finds nothing after it.  That is why the layers and the alpha maps were not
    read for four rounds: the loop was silently returning two sub-chunks and
    then garbage.
    """
    o = off + 128
    while o + 8 <= off + size:
        m = data[o:o + 4][::-1].decode('ascii', 'replace')
        n, = struct.unpack_from('<I', data, o + 4)
        yield m, o + 8, n
        o += 8 + n + (13 if m == 'MCNR' else 0)


def alpha_map(blob, flags, big):
    """One layer's 64x64 coverage, out of its slice of MCAL.

    Three encodings and the file says which: run-length when the layer's flags
    ask for it, one byte a texel when the map's header does, and otherwise the
    common case — 2,048 bytes holding two four-bit texels each, low nibble
    first.
    """
    out = bytearray(64 * 64)
    if flags & 0x200:
        i = o = 0
        while o < 4096 and i < len(blob):
            cmd = blob[i]; i += 1
            n = min(cmd & 0x7F, 4096 - o)
            if cmd & 0x80:
                out[o:o + n] = bytes([blob[i]]) * n; i += 1
            else:
                out[o:o + n] = blob[i:i + n]; i += n
            o += n
    elif big:
        out[:] = blob[:4096].ljust(4096, b'\0')
    else:
        o = 0
        for b in blob[:2048]:
            out[o] = (b & 0xF) * 17
            out[o + 1] = (b >> 4) * 17
            o += 2
    return out


# How finely the painted ground is kept: sixteen samples across a chunk, which
# is 2.08 yards.  The height grid and the water are eight, and a road eight
# yards wide came out as a two-cell staircase at that.
GSUB = 16


def ground_of(data, off, size, names, big):
    """A chunk's ground, as `GSUB` x `GSUB` of our own words.

    The layers paint over each other in order, so the last one that covers a
    texel is the one you see; a texel nothing covers is the base layer.  Taken
    as a mean over each block rather than a single sample, because a road edge
    is dithered and one sample in sixteen lands wherever it lands.
    """
    lay, mcal = [], b''
    for m, o, n in subchunks(data, off, size):
        if m == 'MCLY':
            lay = [struct.unpack_from('<IIII', data, o + i * 16) for i in range(n // 16)]
        elif m == 'MCAL':
            mcal = data[o:o + n]
    if not lay:
        return None
    kinds = [classify_ground(names[l[0]]) if l[0] < len(names) else 'grass' for l in lay]
    cover = [alpha_map(mcal[l[2]:], l[1], big) for l in lay[1:]]
    step = 64 // GSUB
    out = []
    for by in range(GSUB):
        for bx in range(GSUB):
            # A layer has to dominate the texel, not merely be present: the
            # client blends, so a road at alpha 96 is 38% of a road and the
            # rest of it is the grass underneath.  Taking anything over 96
            # painted a quarter of Elwynn brown.
            best, kind = 170, kinds[0]
            for li, a in enumerate(cover, 1):
                tot = 0
                for y in range(by * step, by * step + step):
                    row = y * 64 + bx * step
                    tot += sum(a[row:row + step])
                mean = tot / (step * step)
                if mean >= best:
                    best, kind = mean, kinds[li]
            out.append(kind)
    return out


def classify(path):
    """Blizzard's file path in, one of our own words out — or nothing."""
    p = path.upper()
    if 'CRITTER' in p:          # fireflies and birds are animation, not scenery
        return None
    for needle, kind in KINDS:
        if needle in p:
            return kind
    return None


def chunks(data, off=0, end=None):
    """ADT chunk magics are stored reversed."""
    end = len(data) if end is None else end
    while off + 8 <= end:
        magic = data[off:off + 4][::-1].decode('ascii', 'replace')
        size, = struct.unpack_from('<I', data, off + 4)
        yield magic, off + 8, size
        off += 8 + size


def tile_of(x, y):
    """World coordinate to tile index.

    The parenthesis matters: `int(32 - x/TILE)`, not `32 - int(x/TILE)`.  The
    two differ by one tile and both name a file that exists, so the mistake does
    not surface as a missing file — it surfaces as terrain that is off by 533
    yards.  Caught by measuring a known point, not by reading the code.
    """
    return int(32 - x / TILE), int(32 - y / TILE)


class Client:
    def __init__(self, root):
        self.root = root
        self._open = {}

    def _arch(self, name):
        if name not in self._open:
            self._open[name] = MPQArchive(os.path.join(self.root, 'Data', name))
        return self._open[name]

    def read(self, path):
        for name in CHAIN:
            try:
                data = self._arch(name).read_file(path)
            except Exception:
                data = None
            if data:
                return data, name
        return None, None


def footprint(ry, ax, ay):
    """A WMO's real footprint, out of its world box and its rotation.

    MODF's box is the *rotated* box — the axis-aligned one that contains the
    thing after it has been turned — and for anything lying diagonally that is
    much bigger than the thing.  Elwynn's lion bridge came back 68 by 71 yards,
    a square, because it lies at 41 degrees; painted as a deck it was a plaza
    of planks over half a lake.  The sizes are recoverable, because a rotated
    box is two equations in the two half-extents:

        ax = a·|cos| + b·|sin|
        ay = a·|sin| + b·|cos|

    which solve unless the thing is at 45 degrees, where the two equations are
    the same one and nothing can be told apart.  Returns `(half length, half
    width, the long axis's world bearing in degrees)`, and `(None, None,
    bearing)` for the diagonal case — Northshire's bridge is one, and the sizes
    it needs are the ones the same model gave up in Elwynn.

    The bearing is the record's own and not minus it, which is not what the
    axis mapping looks like it should give — the world's x is the client's -z
    and its y the client's -x, and that pair of flips reads like a reflection.
    The terrain says otherwise and it is not a close call: turn the lion bridge
    the reflected way and its long side runs eighty-eight yards down the middle
    of the lake without meeting a bank, and the other way it lands on both.
    """
    th = math.radians(ry)
    c, s = abs(math.cos(th)), abs(math.sin(th))
    det = c * c - s * s
    a = (ax * c - ay * s) / det if abs(det) >= 0.05 else -1
    b = (ay * c - ax * s) / det if abs(det) >= 0.05 else -1
    if a < 0 or b < 0:
        # Either the thing lies on the diagonal, where the two equations are
        # the same one, or the box did not come from this rotation at all.  The
        # sizes are still recoverable, but not from this record — another
        # instance of the same model, turned some other way, has them, and
        # `bake` fills them in.  `None` is that request.
        return None, None, ry % 180
    # `a` lies along the world bearing ry; `b` across it.
    long_, short, bear = (a, b, ry) if a >= b else (b, a, ry + 90)
    return round(long_, 1), round(short, 1), round(bear % 180, 1)


# How tall a model is, cached across tiles.  Reading one `.m2` header is cheap;
# reading it once per instance would be ten thousand reads of the same eighty
# files.
_TALL = {}


def model_size(client, path):
    """A doodad's own size in yards, out of the model the client places.

    Every tree in the forest was eight yards, because the height was a constant
    per *kind* and a kind is one word for nineteen models.  The client knows
    better and says so twice: an `.m2` header carries a bounding box over the
    vertices at offset 160 and a second one for collision at 188.

    The collision box is the one to believe.  The vertex box covers every frame
    of the animation, so a tree that sways comes back sixty-five yards wide and
    eighty tall, where the collision box of the same tree is twenty-six.  Where
    there is no collision box at all — a vineyard trellis has none, being
    something you walk through — the vertex box is all there is and it is the
    answer.

    Returns `(height, half the wider footprint)`.  The footprint matters for
    the things that are a field rather than an object: one vineyard doodad is
    thirty-eight yards by seventeen, so drawn as a single sprite it is a shrub
    in the middle of a paddock.

    Zeroes for anything unreadable, which the caller reads as "no opinion" and
    falls back on the kind's own size.
    """
    if path in _TALL:
        return _TALL[path]
    data, _src = client.read(path)
    if data is None:
        data, _src = client.read(path[:-3] + '.M2')
    tall = wide = 0.0
    if data and len(data) > 212 and data[:4] == b'MD20':
        vlo = struct.unpack_from('<3f', data, 160)
        vhi = struct.unpack_from('<3f', data, 172)
        clo = struct.unpack_from('<3f', data, 188)
        chi = struct.unpack_from('<3f', data, 200)
        tall = (chi[2] - clo[2]) or (vhi[2] - vlo[2])
        wide = max(chi[0] - clo[0], chi[1] - clo[1]) \
            or max(vhi[0] - vlo[0], vhi[1] - vlo[1])
    _TALL[path] = (round(max(0.0, tall), 2), round(max(0.0, wide) / 2, 2))
    return _TALL[path]


def read_tile(client, tx, ty):
    """One `.adt`.  Note the file is named <Y>_<X>, not <X>_<Y>."""
    data, src = client.read(f'World\\Maps\\Azeroth\\Azeroth_{ty}_{tx}.adt')
    if data is None:
        return None
    cells, doodads, painted = {}, [], {}
    names, ids, tex = [], [], []
    big = False
    wmo_names, wmos = [], []
    water = {}
    for magic, off, size in chunks(data):
        if magic == 'MHDR':
            # Bit two says the alpha maps are a byte a texel rather than a
            # nibble.  Azeroth's are not, but a map that is read wrong comes
            # back as noise rather than as an error.
            hflags, = struct.unpack_from('<I', data, off)
            big = bool(hflags & 0x4)
        elif magic == 'MTEX':
            tex = [n.decode('ascii', 'replace')
                   for n in data[off:off + size].split(b'\0') if n]
        elif magic == 'MWMO':
            wmo_names = [n.decode('ascii', 'replace')
                         for n in data[off:off + size].split(b'\0') if n]
        elif magic == 'MODF':
            # 64 bytes: name, id, position, rotation, and then the thing's own
            # bounding box.  The box is what makes a bridge a bridge rather
            # than a point — it says how long the crossing is and which way it
            # runs, and nothing else in this file knows either.
            for i in range(size // 64):
                (nid, uid, px, py, pz, _rx, ry, _rz,
                 lx, ly, lz, hx, hy, hz) = struct.unpack_from(
                    '<IIffffffffffff', data, off + i * 64)
                # The box's vertical extent is kept but not used to size the
                # sprite: a WMO's box is the whole complex, spires and all, so
                # Northshire's abbey comes back eighty-nine yards tall and a
                # drawn building that size is a wall across the glass.  A model
                # has an honest height and a building does not.
                wmos.append((nid, uid, ORIGIN - pz, ORIGIN - px, py, ry)
                            + footprint(ry, abs(hz - lz) / 2,
                                        abs(hx - lx) / 2)
                            + (round(abs(hy - ly), 2),))
        elif magic == 'MH2O':
            # 256 chunk headers, then instances, all offset from the start of
            # this chunk's data.  A cell is wet if an instance covers it and its
            # bitmap says so; no bitmap means the whole rectangle.
            #
            # The header's place in the list is the chunk's place in the file,
            # and the file runs `for iy: for ix:` — so the *slow* half of the
            # index is `iy`, which is the half the height grid lays along world
            # x.  Reading it the other way up transposed every river in the
            # slice against the valley it runs in, and it did not look like an
            # error: rivers still ran in straight lines, just not the ones the
            # ground had.  Elwynn's wide bridge was the thing that showed it —
            # a crossing on dry dirt with a lake beside it.  The `check_water`
            # call at the end of a bake is what keeps it from coming back.
            for c in range(256):
                oi, layers, _oa = struct.unpack_from('<III', data, off + c * 12)
                if not layers or not oi:
                    continue
                lt, lvf, mn, mx, xo, yo, w, h, obm, ovd = struct.unpack_from(
                    '<HHffBBBBII', data, off + oi)
                for dy in range(h):
                    for dx in range(w):
                        if obm:
                            bit = (yo + dy) * 8 + (xo + dx)
                            byte = data[off + obm + bit // 8]
                            if not (byte >> (bit % 8)) & 1:
                                continue
                        # Keyed (iy, ix, along x, along y) — the same order
                        # the heights use — and holding the water's own
                        # surface, which is what `check_water` weighs it by.
                        water[(c // 16, c % 16, yo + dy, xo + dx)] = mx
        elif magic == 'MMDX':
            names = [n.decode('ascii', 'replace') for n in data[off:off + size].split(b'\0')]
        elif magic == 'MMID':
            ids = struct.unpack_from(f'<{size // 4}I', data, off)
        elif magic == 'MDDF':
            for i in range(size // 36):
                nid, uid, px, py, pz, rx, ry, rz, sc, fl = struct.unpack_from(
                    '<IIffffffHH', data, off + i * 36)
                # The placement is stored in the ADT's own axes.  This mapping
                # was not read off a document: it is the one of four candidates
                # that puts every doodad inside the tile it came from.
                doodads.append(('m2', nid, ORIGIN - pz, ORIGIN - px, py, ry, sc / 1024.0))
        elif magic == 'MCNK':
            head = data[off:off + 128]
            ix, iy = struct.unpack_from('<II', head, 4)      # ix moves Y, iy moves X
            area, = struct.unpack_from('<I', head, 0x34)
            holes, = struct.unpack_from('<H', head, 0x3C)
            cx, cy, cz = struct.unpack_from('<fff', head, 0x68)
            heights = None
            for m2, o2, _ in chunks(data, off + 128, off + size):
                if m2 == 'MCVT':
                    # Not the header's ofsHeight: trusting that produced a
                    # maximum height of 204,793,313 on one tile, and a median
                    # that looked fine.
                    heights = struct.unpack_from('<145f', data, o2)
                    break
            if heights:
                cells[(ix, iy)] = (cx, cy, cz, area, holes, heights)
                got = ground_of(data, off, size, tex, big)
                if got:
                    painted[(ix, iy)] = got
    models = [n for n in names if n]
    placed, skipped = [], 0
    for tag, nid, wx, wy, wz, rot, sc in doodads:
        path = models[nid] if nid < len(models) else ''
        kind = classify(path)
        if kind:
            # The model's own size, times the placement's own scale.  Both were
            # in the file all along; only the second one was read.
            tall, wide = model_size(client, path)
            placed.append((kind, wx, wy, wz, rot, sc, 0.0, 0.0, 0.0, 0,
                           round(tall * sc, 2), round(wide * sc, 2)))
        else:
            skipped += 1
    for nid, _uid, wx, wy, wz, rot, half_l, half_w, bear, tall in wmos:
        name = wmo_names[nid] if nid < len(wmo_names) else ''
        kind = classify_wmo(name)
        if kind:
            # An opaque number for "the same model", so an instance that could
            # not be solved can borrow from one that could.  A number and not
            # the path: nothing from a client's file table is allowed out of
            # this script, and `bake` drops this before it writes anything.
            key = zlib.crc32(name.upper().encode()) if name else 0
            placed.append((kind, wx, wy, wz, bear, 1.0,
                           half_l, half_w, bear, key, 0.0,
                           round(max(half_l or 0.0, half_w or 0.0), 2)))
    return cells, placed, water, painted, skipped, src


def bake(client, bounds, out):
    x_lo, x_hi, y_lo, y_hi = bounds
    cx, cy = (x_lo + x_hi) / 2, (y_lo + y_hi) / 2
    # Global height indices.  x = ORIGIN - I*UNIT, y = ORIGIN - J*UNIT.
    i_lo, i_hi = int((ORIGIN - x_hi) / UNIT), int((ORIGIN - x_lo) / UNIT) + 1
    j_lo, j_hi = int((ORIGIN - y_hi) / UNIT), int((ORIGIN - y_lo) / UNIT) + 1
    w, h = i_hi - i_lo + 1, j_hi - j_lo + 1
    grid = [None] * (w * h)
    dropped = 0
    solid_seen = set()
    shapes = {}
    levels = {}
    wetmask = bytearray(w * h)
    # The painted ground is kept at twice the height grid's resolution — see
    # `GSUB` — so it gets its own array and its own indices.
    w2, h2 = w * 2, h * 2
    i2_lo, j2_lo = i_lo * 2, j_lo * 2
    i2_hi, j2_hi = i2_lo + w2 - 1, j2_lo + h2 - 1
    groundmask = bytearray(w2 * h2)
    # And the zones, one byte a chunk.  Sixteen chunks to a tile, so the index
    # is the height index divided by eight.
    ci_lo, ci_hi = i_lo // 8, i_hi // 8
    cj_lo, cj_hi = j_lo // 8, j_hi // 8
    cw, ch = ci_hi - ci_lo + 1, cj_hi - cj_lo + 1
    areamask = bytearray([255]) * (cw * ch)
    area_ids = []
    areas = {}

    tiles = set()
    for x in (x_lo, x_hi):
        for y in (y_lo, y_hi):
            tiles.add(tile_of(x, y))
    tx_lo = min(t[0] for t in tiles); tx_hi = max(t[0] for t in tiles)
    ty_lo = min(t[1] for t in tiles); ty_hi = max(t[1] for t in tiles)

    doodads, sources = [], {}
    for tx in range(tx_lo, tx_hi + 1):
        for ty in range(ty_lo, ty_hi + 1):
            got = read_tile(client, tx, ty)
            if not got:
                print(f'  tile {ty}_{tx}: missing', file=sys.stderr)
                continue
            cells, dd, wet, painted, skipped, src = got
            dropped += skipped
            sources[f'{ty}_{tx}'] = src
            for kind, wx, wy, wz, rot, sc, bl, bw, bear, key, \
                    tall, wide in dd:
                if not (x_lo <= wx <= x_hi and y_lo <= wy <= y_hi):
                    continue
                # A building that straddles a tile border is listed by both
                # tiles, so Elwynn's wide bridge arrived twice and every hit
                # test against it ran twice.  Position is the identity: two
                # records of one instance carry the same one.
                if key and (kind, round(wx, 2), round(wy, 2)) in solid_seen:
                    continue
                if key:
                    solid_seen.add((kind, round(wx, 2), round(wy, 2)))
                if bl is not None and key:
                    shapes.setdefault(key, (bl, bw))
                doodads.append([kind, wx, wy, wz, rot, sc, bl, bw, bear,
                                key, tall, wide])
            for (iy_, ix_, sx_, sy_), level in wet.items():
                I = tx * 128 + iy_ * 8 + sx_
                J = ty * 128 + ix_ * 8 + sy_
                if i_lo <= I <= i_hi and j_lo <= J <= j_hi:
                    wetmask[(I - i_lo) * h + (J - j_lo)] = 1
                    levels[(I - i_lo) * h + (J - j_lo)] = level
            for (ix, iy), got in painted.items():
                for by in range(GSUB):
                    I = tx * 128 * 2 + iy * GSUB + by
                    if not (i2_lo <= I <= i2_hi):
                        continue
                    for bx in range(GSUB):
                        J = ty * 128 * 2 + ix * GSUB + bx
                        if not (j2_lo <= J <= j2_hi):
                            continue
                        groundmask[(I - i2_lo) * h2 + (J - j2_lo)] = \
                            GROUND_ORDER.index(got[by * GSUB + bx])
            for (ix, iy), (ccx, ccy, ccz, area, holes, hv) in cells.items():
                base_i = tx * 128 + iy * 8
                base_j = ty * 128 + ix * 8
                areas[area] = areas.get(area, 0) + 1
                # Which zone this chunk belongs to, at the resolution the
                # client states it: one id a chunk, 33.3 yards.  Nothing here
                # knew where Northshire *was* — the readout said a coordinate
                # and every check had to re-derive the boundary from the ADTs.
                CI, CJ = base_i // 8, base_j // 8
                if ci_lo <= CI <= ci_hi and cj_lo <= CJ <= cj_hi:
                    if area not in area_ids:
                        area_ids.append(area)
                    areamask[(CI - ci_lo) * ch + (CJ - cj_lo)] = \
                        area_ids.index(area)
                for r in range(9):
                    I = base_i + r
                    if not (i_lo <= I <= i_hi):
                        continue
                    for c in range(9):
                        J = base_j + c
                        if not (j_lo <= J <= j_hi):
                            continue
                        grid[(I - i_lo) * h + (J - j_lo)] = ccz + hv[r * 17 + c]

    # The diagonal cases, filled in from an instance of the same model that was
    # not diagonal.  Northshire's bridge is the same model as Elwynn's and lies
    # at exactly 45 degrees, so its own box says 26 yards by 26 — a plaza of
    # planks.  One borrowed pair of sizes makes it the 26 by 11 crossing it is.
    borrowed = 0
    for d in doodads:
        if d[6] is None:
            d[6], d[7] = shapes.get(d[9], (0.0, 0.0))
            # A square box is the same square whichever way round the thing in
            # it lies, so the sizes come back but the bearing does not: it is
            # either this one or ninety degrees off it and the record cannot
            # say.  The flag is the record admitting that, and `src/main.ts`
            # settles it against the terrain — a crossing lands on a bank.
            d[8] = -d[8] if d[6] else d[8]
            borrowed += 1 if d[6] else 0
    if borrowed:
        print(f'{borrowed} diagonal footprints borrowed from another instance '
              f'of the same model')

    missing = sum(1 for v in grid if v is None)
    filled = [v for v in grid if v is not None]
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, 'terrain.bin'), 'wb') as f:
        f.write(struct.pack(f'<{len(grid)}f', *[v if v is not None else 0.0 for v in grid]))
        f.write(bytes(wetmask))     # one byte a cell, after the heights
        f.write(bytes(groundmask))  # and the painted ground, at twice that
        f.write(bytes(areamask))    # and the zones, one byte a 33-yard chunk
    meta = {
        'width': w, 'height': h, 'unit': UNIT,
        'x0': ORIGIN - i_lo * UNIT, 'y0': ORIGIN - j_lo * UNIT,
        'centre': [cx, cy], 'bounds': list(bounds),
        'zMin': min(filled), 'zMax': max(filled),
        'tiles': sources,
        'areas': areas,
        'hasWater': True,
        'water': sum(wetmask),
        'ground': GROUND_ORDER,
        'groundWidth': w2, 'groundHeight': h2, 'groundUnit': UNIT / 2,
        # The zone map, and the ids it indexes.  `areaOf` in `src/main.ts`
        # reads it; the names are ours, in `talk.ts`, because an area name is
        # Blizzard's prose the same as everything else.
        'areaWidth': cw, 'areaHeight': ch, 'areaUnit': UNIT * 8,
        'areaIds': area_ids,
        # `bl`/`bw` are half a footprint, along and across, and `ba` is which
        # way the long side points — a rectangle that can lie diagonally,
        # because half these bridges do.
        'doodads': [dict({'k': k, 'x': round(x, 2), 'y': round(y, 2),
                          'z': round(z, 2), 'r': round(rot, 1), 's': round(s, 3)},
                         # `t` is how tall the client's own model is and `w`
                         # half its footprint, both already times this
                         # placement's scale.
                         **({'t': tall} if tall else {}),
                         **({'w': wide} if wide else {}),
                         **({'bl': round(bl, 1), 'bw': round(bw, 1),
                             'ba': round(abs(ba), 1)}
                            | ({'bq': 1} if ba < 0 else {}) if bl else {}))
                    for k, x, y, z, rot, s, bl, bw, ba, _key, tall, wide
                    in doodads],
    }
    with open(os.path.join(out, 'terrain.json'), 'w') as f:
        json.dump(meta, f)

    print(f'grid {w} x {h} = {w*h:,} vertices, {(w-1)*(h-1)*2:,} triangles')
    print(f'height {min(filled):.1f} .. {max(filled):.1f}   holes in grid: {missing}')
    print(f'doodads {len(doodads):,} ({dropped:,} with no picture, skipped)'
          f'   water cells {sum(wetmask):,}')
    tally = {k: groundmask.count(i) for i, k in enumerate(GROUND_ORDER)}
    print('ground ' + '  '.join(f'{k} {v:,}' for k, v in tally.items() if v))
    print(f'areas {sorted(areas)}')
    print(f'terrain.bin {os.path.getsize(os.path.join(out, "terrain.bin"))/1024:.0f} KiB, '
          f'terrain.json {os.path.getsize(os.path.join(out, "terrain.json"))/1024:.0f} KiB')
    check_water(grid, wetmask, levels)
    return meta


def check_water(grid, wetmask, levels):
    """Water has to lie on the ground it is drawn on.

    The one thing that is true of every lake and every river: the surface is at
    or above the bed.  It is also the one thing a transposed mask cannot fake —
    turn the water ninety degrees and it lands on hillsides, so most of it ends
    up under the ground it is meant to cover.

    That is not a hypothetical.  `MH2O`'s chunk headers are in file order and
    the file runs `for iy: for ix:`, so the slow half of the index is `iy` —
    the half the heights lay along world x.  Read the other way up, three
    quarters of Elwynn's water sat below its own terrain and the rivers ran
    across the valleys instead of along them.  Nothing looked broken: water
    still drew in long straight lines, the lakes were still lakes, and the
    thing that gave it away was a bridge standing on dry dirt beside one.
    """
    under = tot = 0
    for at, level in levels.items():
        z = grid[at]
        if z is None or not wetmask[at]:
            continue
        tot += 1
        if z - level > 1.0:
            under += 1
    share = under / tot if tot else 0.0
    print(f'check: {tot:,} water cells, {share:.1%} of them under their own bed')
    assert tot and share < 0.25, (
        'the water mask does not lie on the terrain — at %.0f%% it is turned '
        'against the height grid' % (share * 100))


def check(client, meta, out):
    """The one check that matters: does this terrain agree with the server's?

    `playercreateinfo` puts a human warrior at a spot the world database knows
    the ground height of.  If the two disagree the whole chain is wrong
    somewhere, and every other number here is decoration.
    """
    tx, ty, tz = -8949.95, -132.493, 83.5312
    w, h, u = meta['width'], meta['height'], meta['unit']
    I = int((meta['x0'] - tx) / u)
    J = int((meta['y0'] - ty) / u)
    # The directory the bake actually wrote to, not `sys.argv[2]` — which is
    # absent whenever the default is used, and the check then died after a
    # twenty-minute bake with an IndexError.
    with open(os.path.join(out, 'terrain.bin'), 'rb') as f:
        f.seek((I * h + J) * 4)
        z, = struct.unpack('<f', f.read(4))
    print(f'check: human start ({tx}, {ty})  terrain {z:.2f}  vs spawn {tz:.2f}  '
          f'delta {abs(z - tz):.2f} yd')
    # Which world the page loads is decided when vite starts, so a world baked
    # underneath a running dev server is a world it has not been told about.
    print('restart `npm run dev` to pick this up')
    assert abs(z - tz) < 2.0, 'terrain disagrees with the world database'


if __name__ == '__main__':
    root = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/workspace/warmane')
    out = sys.argv[2] if len(sys.argv) > 2 else 'public/data'
    c = Client(root)
    # The forest, not a disc inside it — the same four numbers the synthesised
    # world uses, measured by `pipeline/measure_zone.py`.
    m = bake(c, (-9966.7, -8000.0, -1700.0, 1066.7), out)
    check(c, m, out)
