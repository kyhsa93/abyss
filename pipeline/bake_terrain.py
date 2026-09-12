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
import os
import struct
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
    ('BRIDGE', None), ('GATE', None), ('WALL', None), ('DOCK', None), ('SEWER', None),
]


def classify_wmo(path):
    p = path.upper()
    for needle, kind in WMO_KINDS:
        if needle in p:
            return kind
    return 'house'


KINDS = [
    ('TREES\\', 'tree'), ('PINE', 'pine'), ('TREE', 'tree'),
    ('BUSH', 'bush'), ('SHRUB', 'bush'),
    ('FENCE', 'fence'), ('WOODPOST', 'fence'), ('POST', 'fence'),
    ('CLIFFROCK', 'rock'), ('ROCK', 'rock'), ('BOULDER', 'rock'),
    ('LILYPAD', 'lily'), ('SEAWEED', 'water_plant'), ('SWAMPPLANT', 'water_plant'),
    ('GRASS', 'grass'), ('PLANT', 'grass'), ('FLOWER', 'flower'), ('CABBAGE', 'crop'),
    ('MUSHROOM', 'mushroom'), ('STUMP', 'stump'), ('LOG', 'log'),
    ('BARREL', 'barrel'), ('CRATE', 'barrel'), ('SACK', 'barrel'),
    ('LAMPPOST', 'lamp'), ('SIGN', 'sign'), ('CAMPFIRE', 'campfire'),
    ('TENT', 'tent'), ('WAGON', 'cart'), ('WHEELBARROW', 'cart'),
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
    return 'prop'


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
            for i in range(size // 64):
                nid, uid, px, py, pz = struct.unpack_from('<IIfff', data, off + i * 64)
                wmos.append((nid, ORIGIN - pz, ORIGIN - px, py))
        elif magic == 'MH2O':
            # 256 chunk headers, then instances, all offset from the start of
            # this chunk's data.  A cell is wet if an instance covers it and its
            # bitmap says so; no bitmap means the whole rectangle.
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
                        water[(c // 16, c % 16, yo + dy, xo + dx)] = True
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
    placed = []
    for tag, nid, wx, wy, wz, rot, sc in doodads:
        kind = classify(models[nid] if nid < len(models) else '')
        if kind:
            placed.append((kind, wx, wy, wz, rot, sc))
    for nid, wx, wy, wz in wmos:
        kind = classify_wmo(wmo_names[nid] if nid < len(wmo_names) else '')
        if kind:
            placed.append((kind, wx, wy, wz, 0.0, 1.0))
    return cells, placed, water, painted, src


def bake(client, bounds, out):
    x_lo, x_hi, y_lo, y_hi = bounds
    cx, cy = (x_lo + x_hi) / 2, (y_lo + y_hi) / 2
    # Global height indices.  x = ORIGIN - I*UNIT, y = ORIGIN - J*UNIT.
    i_lo, i_hi = int((ORIGIN - x_hi) / UNIT), int((ORIGIN - x_lo) / UNIT) + 1
    j_lo, j_hi = int((ORIGIN - y_hi) / UNIT), int((ORIGIN - y_lo) / UNIT) + 1
    w, h = i_hi - i_lo + 1, j_hi - j_lo + 1
    grid = [None] * (w * h)
    wetmask = bytearray(w * h)
    # The painted ground is kept at twice the height grid's resolution — see
    # `GSUB` — so it gets its own array and its own indices.
    w2, h2 = w * 2, h * 2
    i2_lo, j2_lo = i_lo * 2, j_lo * 2
    i2_hi, j2_hi = i2_lo + w2 - 1, j2_lo + h2 - 1
    groundmask = bytearray(w2 * h2)
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
            cells, dd, wet, painted, src = got
            sources[f'{ty}_{tx}'] = src
            for kind, wx, wy, wz, rot, sc in dd:
                if x_lo <= wx <= x_hi and y_lo <= wy <= y_hi:
                    doodads.append((kind, wx, wy, wz, rot, sc))
            for (cy_, cx_, sy_, sx_) in wet:
                I = tx * 128 + cx_ * 8 + sx_
                J = ty * 128 + cy_ * 8 + sy_
                if i_lo <= I <= i_hi and j_lo <= J <= j_hi:
                    wetmask[(I - i_lo) * h + (J - j_lo)] = 1
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
                for r in range(9):
                    I = base_i + r
                    if not (i_lo <= I <= i_hi):
                        continue
                    for c in range(9):
                        J = base_j + c
                        if not (j_lo <= J <= j_hi):
                            continue
                        grid[(I - i_lo) * h + (J - j_lo)] = ccz + hv[r * 17 + c]

    missing = sum(1 for v in grid if v is None)
    filled = [v for v in grid if v is not None]
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, 'terrain.bin'), 'wb') as f:
        f.write(struct.pack(f'<{len(grid)}f', *[v if v is not None else 0.0 for v in grid]))
        f.write(bytes(wetmask))     # one byte a cell, after the heights
        f.write(bytes(groundmask))  # and the painted ground, at twice that
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
        'doodads': [{'k': k, 'x': round(x, 2), 'y': round(y, 2), 'z': round(z, 2),
                     'r': round(rot, 1), 's': round(s, 3)} for k, x, y, z, rot, s in doodads],
    }
    with open(os.path.join(out, 'terrain.json'), 'w') as f:
        json.dump(meta, f)

    print(f'grid {w} x {h} = {w*h:,} vertices, {(w-1)*(h-1)*2:,} triangles')
    print(f'height {min(filled):.1f} .. {max(filled):.1f}   holes in grid: {missing}')
    print(f'doodads {len(doodads):,}   water cells {sum(wetmask):,}')
    tally = {k: groundmask.count(i) for i, k in enumerate(GROUND_ORDER)}
    print('ground ' + '  '.join(f'{k} {v:,}' for k, v in tally.items() if v))
    print(f'areas {sorted(areas)}')
    print(f'terrain.bin {os.path.getsize(os.path.join(out, "terrain.bin"))/1024:.0f} KiB, '
          f'terrain.json {os.path.getsize(os.path.join(out, "terrain.json"))/1024:.0f} KiB')
    return meta


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
