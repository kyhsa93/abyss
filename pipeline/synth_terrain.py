#!/usr/bin/env python3
"""Build the world the deployed game runs on, out of AzerothCore alone.

`bake_terrain.py` reads the client's own height grid, and what it writes cannot
be committed — so a visitor with no WoW install got a black page saying so.
This is the other half of the promise the plan made: the game is complete
without a client, and a client only sharpens it.

The height comes from the world database.  Every creature and every object in
the slice is recorded with a z, because the server has to know what they stand
on, and those coordinates are structural facts rather than anybody's prose.
There are about three thousand of them across the slice — one every twenty
yards against the client's one every four — so this is Elwynn's shape, not its
detail.  Which is the honest description of what a server knows about a floor.

The scenery is not from the client at all.  Doodad placements live in the
`.adt` files and stay there; what is scattered here is ours, seeded off the
world so it is the same world every time, and thinned where the database says
people stand.

  python3 pipeline/synth_terrain.py <azerothcore dir> <out dir>
"""
import json
import math
import os
import struct
import sys

import numpy as np

TILE = 533.33333
UNIT = TILE / 128            # 4.1667 yards, the same grid the client's bake uses
# Elwynn Forest, measured rather than chosen.
#
# `pipeline/measure_zone.py` sweeps the client's own map tiles and takes the
# bounding box of every chunk it labels area 12.  The zone's sub-areas —
# Goldshire, Northshire, the mines — are enclaves inside it, so the box of
# area 12 is the box of the forest: 1,967 by 2,767 yards.  What this replaces
# was a 600 yard disc around one point, which was a fifth of the forest by
# area and the whole of it as far as anyone playing could tell.
#
# Four numbers, taken once and written down; nothing here needs a client to
# use them, and the script that produced them is committed so they can be
# taken again.
BOUNDS = (-9966.7, -8000.0, -1700.0, 1066.7)    # x lo, x hi, y lo, y hi
CENTRE = ((BOUNDS[0] + BOUNDS[1]) / 2, (BOUNDS[2] + BOUNDS[3]) / 2)
SPAN = (BOUNDS[1] - BOUNDS[0], BOUNDS[3] - BOUNDS[2])


def inside(x, y, grow=0.0):
    """Whether a point is in the forest, with room to grow or shrink the edge."""
    return (BOUNDS[0] - grow <= x <= BOUNDS[1] + grow
            and BOUNDS[2] - grow <= y <= BOUNDS[3] + grow)
MAP = 0
ORIGIN = 32 * TILE


def rows(path):
    """mysqldump with one tuple to a line."""
    with open(path, encoding='utf-8', errors='replace') as f:
        for line in f:
            if line.startswith('('):
                yield line[1:].split(',')


def samples(acore):
    """Every point in the slice the world database knows the ground height of."""
    out = []
    base = os.path.join(acore, 'data/sql/base/db_world')
    for name, mi, xi in (('creature.sql', 4, 10), ('gameobject.sql', 2, 7)):
        p = os.path.join(base, name)
        if not os.path.exists(p):
            sys.exit(f'missing {p}')
        for f in rows(p):
            try:
                if int(f[mi]) != MAP:
                    continue
                x, y, z = float(f[xi]), float(f[xi + 1]), float(f[xi + 2])
            except (ValueError, IndexError):
                continue
            # A margin outside the forest, so the interpolation at its edge
            # has something to lean on rather than falling off a cliff.
            if inside(x, y, 210):
                out.append((x, y, z))
    return np.array(out, dtype=np.float64)


def field(pts, gx, gy, power=2.6, k=24):
    """Inverse distance weighting, on a coarse grid and then stretched.

    Doing this at full resolution is eighty thousand points against three
    thousand samples; doing it at sixty-four squared and interpolating up costs
    a hundredth of that and loses nothing, because the samples are twenty yards
    apart and the output grid is four.  There is no detail between them to lose.
    """
    N = 64
    cx = np.linspace(gx[0], gx[-1], N)
    cy = np.linspace(gy[0], gy[-1], N)
    CX, CY = np.meshgrid(cx, cy, indexing='ij')
    d2 = ((CX[..., None] - pts[:, 0]) ** 2 + (CY[..., None] - pts[:, 1]) ** 2)
    # Nearest k only: the far side of the slice should not vote on this hill.
    idx = np.argpartition(d2, k, axis=-1)[..., :k]
    near = np.take_along_axis(d2, idx, axis=-1)
    w = 1.0 / np.maximum(near, 1e-3) ** (power / 2)
    z = (w * pts[:, 2][idx]).sum(-1) / w.sum(-1)

    # Stretch to the real grid.
    #
    # Not `np.interp`: it wants an increasing axis and these run the other way,
    # because world x decreases as the grid index rises.  It does not complain —
    # it returns the endpoint for everything, and the ground comes out forty
    # yards below where the database says a man is standing.  The check at the
    # bottom of this file is what caught that.
    fi = np.linspace(0, N - 1, len(gx))
    fj = np.linspace(0, N - 1, len(gy))
    i0 = np.clip(fi.astype(int), 0, N - 2); ti = (fi - i0)[:, None]
    j0 = np.clip(fj.astype(int), 0, N - 2); tj = (fj - j0)[None, :]
    a = z[i0][:, j0]; b = z[i0][:, j0 + 1]
    c = z[i0 + 1][:, j0]; d = z[i0 + 1][:, j0 + 1]
    return (a * (1 - tj) + b * tj) * (1 - ti) + (c * (1 - tj) + d * tj) * ti


def noise(gx, gy, scale, amp, seed):
    """Value noise, bilinear, deterministic — the grain the samples cannot carry."""
    n = max(2, int((gx[0] - gx[-1]) / scale))
    r = np.arange(n + 1)
    h = np.sin(np.outer(r, np.full(n + 1, 1.0)) * 12.9898
               + np.outer(np.full(n + 1, 1.0), r) * 78.233 + seed) * 43758.5453
    h = (h - np.floor(h)) * 2 - 1
    fi = np.clip((gx[0] - gx) / scale, 0, n - 1e-6)
    fj = np.clip((gy[0] - gy) / scale, 0, n - 1e-6)
    i0 = fi.astype(int); ti = (fi - i0)[:, None]
    j0 = fj.astype(int); tj = (fj - j0)[None, :]
    ti = ti * ti * (3 - 2 * ti); tj = tj * tj * (3 - 2 * tj)   # smoothstep
    a = h[i0][:, j0]; b = h[i0][:, j0 + 1]
    c = h[i0 + 1][:, j0]; d = h[i0 + 1][:, j0 + 1]
    return ((a * (1 - tj) + b * tj) * (1 - ti) + (c * (1 - tj) + d * tj) * ti) * amp


def wetness(grid, inside):
    """Where the water is, when nothing has told us.

    The client keeps this as a fact — an `MH2O` chunk, per cell, with a surface
    height.  Without it the only evidence left is that water collects in the low
    places, so the low places are where it goes: everything under a percentile
    of the slice's own height distribution.

    This is inference off a shape, which is the class of reasoning this
    repository has a rule against.  It is allowed here only because the
    alternative is no water at all, and it is labelled as a guess in the output
    so that nothing downstream mistakes it for the other kind of fact.
    """
    level = float(np.percentile(grid[inside], 5.0))
    return (grid <= level) & inside, level


def homes(pts, x0, y0, W, H, grid):
    """Buildings where the database says people are.

    The client keeps the buildings as `MODF` placements and those stay in the
    `.adt` files.  What is left is better evidence than it sounds: a world
    database with twenty NPCs standing in a forty yard circle is describing a
    settlement, whatever the geometry says, and a settlement is where houses go.
    """
    out = []
    cell = 40.0
    bins = {}
    for x, y, _z in pts:
        bins.setdefault((int(x / cell), int(y / cell)), []).append((x, y))
    for (bx, by), members in sorted(bins.items()):
        if len(members) < 9:
            continue
        cx = sum(m[0] for m in members) / len(members)
        cy = sum(m[1] for m in members) / len(members)
        if not inside(cx, cy, -30):
            continue
        n = math.sin(bx * 31.7 + by * 17.3) * 43758.5453
        n -= math.floor(n)
        kind = 'hall' if len(members) > 26 else 'house'
        # Set beside the cluster rather than on top of it: a house dropped on
        # fifteen NPCs puts them all indoors.
        px = cx + math.cos(n * 6.28) * 26
        py = cy + math.sin(n * 6.28) * 26
        gi = int(round((x0 - px) / UNIT)); gj = int(round((y0 - py) / UNIT))
        z = float(grid[min(max(gi, 0), W - 1), min(max(gj, 0), H - 1)])
        out.append({'k': kind, 'x': round(px, 2), 'y': round(py, 2),
                    'z': round(z, 2), 'r': 0.0, 's': 1.0})
    return out


def scatter(pts, x0, y0, W, H, grid):
    """Our own scenery, seeded off the world so it is the same world every time.

    Thinned where the database says somebody stands: an inn with fifteen NPCs
    in it is a clearing whatever else is true, and scattering oaks through the
    middle of one is how procedural worlds announce themselves.
    """
    out = []
    occupied = pts[:, :2]
    cell = 24.0
    KINDS = [('tree', 0.34), ('pine', 0.08), ('bush', 0.30), ('rock', 0.06),
             ('grass', 0.12), ('flower', 0.06), ('mushroom', 0.04)]
    acc = np.cumsum([w for _, w in KINDS])
    for i in range(int(SPAN[0] / cell) + 1):
        for j in range(int(SPAN[1] / cell) + 1):
            for s in range(3):
                n = math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453
                n -= math.floor(n)
                m = math.sin(i * 269.5 + j * 183.3 + s * 51.1) * 43758.5453
                m -= math.floor(m)
                x = BOUNDS[0] + (i + n) * cell
                y = BOUNDS[2] + (j + m) * cell
                if not inside(x, y):
                    continue
                d2 = ((occupied[:, 0] - x) ** 2 + (occupied[:, 1] - y) ** 2).min()
                if d2 < 11 ** 2:
                    continue
                p = math.sin(i * 419.2 + j * 371.9 + s * 97.3) * 43758.5453
                p -= math.floor(p)
                kind = KINDS[int(np.searchsorted(acc, p * acc[-1]))][0]
                gi = int(round((x0 - x) / UNIT)); gj = int(round((y0 - y) / UNIT))
                z = float(grid[min(max(gi, 0), W - 1), min(max(gj, 0), H - 1)])
                rot = (math.sin(i * 55.3 + j * 17.7 + s) * 180)
                out.append({'k': kind, 'x': round(x, 2), 'y': round(y, 2),
                            'z': round(z, 2), 'r': round(rot, 1), 's': 1.0})

    # Fences are not scattered, because a fence alone in a field is a mistake
    # rather than a fence.  They come in runs, which is what makes them read as
    # somebody's boundary — the client's own Elwynn has 773 of them and every
    # one is part of a line.
    for i in range(0, int(SPAN[0] / cell) + 1, 3):
        for j in range(0, int(SPAN[1] / cell) + 1, 3):
            n = math.sin(i * 91.7 + j * 47.3) * 43758.5453
            n -= math.floor(n)
            if n > 0.12:
                continue
            # A section is 32 pixels and the renderer draws 24 to the yard, so
            # posts go down every 1.33 yards.  Spaced any wider they read as a
            # row of stakes rather than as a fence — which is how the first
            # attempt came out.
            SECTION = 32 / 24
            length = 8 + int(n * 400) % 17
            horizontal = (math.sin(i * 13.1 + j * 7.7) > 0)
            x = BOUNDS[0] + i * cell
            y = BOUNDS[2] + j * cell
            for s in range(length):
                px = x + (0 if horizontal else s * SECTION)
                py = y + (s * SECTION if horizontal else 0)
                if not inside(px, py):
                    continue
                if ((occupied[:, 0] - px) ** 2 + (occupied[:, 1] - py) ** 2).min() < 9 ** 2:
                    continue
                gi = int(round((x0 - px) / UNIT)); gj = int(round((y0 - py) / UNIT))
                z = float(grid[min(max(gi, 0), W - 1), min(max(gj, 0), H - 1)])
                out.append({'k': 'fence', 'x': round(px, 2), 'y': round(py, 2),
                            'z': round(z, 2), 'r': 0.0, 's': 1.0})
    return out


def main(acore, out):
    pts = samples(acore)
    if len(pts) < 100:
        sys.exit(f'only {len(pts)} height samples in the slice — refusing to guess a world')

    i_lo = int((ORIGIN - BOUNDS[1]) / UNIT)
    i_hi = int((ORIGIN - BOUNDS[0]) / UNIT) + 1
    j_lo = int((ORIGIN - BOUNDS[3]) / UNIT)
    j_hi = int((ORIGIN - BOUNDS[2]) / UNIT) + 1
    W, H = i_hi - i_lo + 1, j_hi - j_lo + 1
    x0 = ORIGIN - i_lo * UNIT
    y0 = ORIGIN - j_lo * UNIT
    gx = x0 - np.arange(W) * UNIT
    gy = y0 - np.arange(H) * UNIT

    grid = field(pts, gx, gy)
    grid = grid + noise(gx, gy, 90.0, 2.2, 7.0) + noise(gx, gy, 26.0, 0.7, 19.0)

    I, J = np.meshgrid(np.arange(W), np.arange(H), indexing='ij')
    gxx, gyy = x0 - I * UNIT, y0 - J * UNIT
    in_zone = ((gxx >= BOUNDS[0]) & (gxx <= BOUNDS[1])
               & (gyy >= BOUNDS[2]) & (gyy <= BOUNDS[3]))
    wet, level = wetness(grid, in_zone)

    doodads = scatter(pts, x0, y0, W, H, grid)
    # Nothing stands in the river.
    def dry(d):
        gi = int(round((x0 - d['x']) / UNIT)); gj = int(round((y0 - d['y']) / UNIT))
        return not wet[min(max(gi, 0), W - 1), min(max(gj, 0), H - 1)]
    doodads = [d for d in doodads if dry(d)]
    doodads += [h for h in homes(pts, x0, y0, W, H, grid) if dry(h)]

    os.makedirs(out, exist_ok=True)
    flat = grid.astype(np.float32).ravel()
    with open(os.path.join(out, 'terrain.bin'), 'wb') as f:
        f.write(struct.pack(f'<{flat.size}f', *flat.tolist()))
        f.write(wet.astype(np.uint8).tobytes())   # one byte a cell, after the heights
    meta = {
        'width': W, 'height': H, 'unit': UNIT,
        'x0': x0, 'y0': y0, 'centre': list(CENTRE), 'bounds': list(BOUNDS),
        'zMin': float(grid.min()), 'zMax': float(grid.max()),
        'source': 'azerothcore', 'samples': int(len(pts)),
        'hasWater': True, 'water': int(wet.sum()), 'waterLevel': round(level, 1),
        'doodads': doodads,
    }
    with open(os.path.join(out, 'terrain.json'), 'w') as f:
        json.dump(meta, f)

    print(f'{len(pts):,} height samples → grid {W} x {H}')
    print(f'height {grid.min():.1f} .. {grid.max():.1f} yd')
    print(f'{len(doodads):,} placed   water {int(wet.sum()):,} cells below {level:.1f} yd')
    print(f'terrain.bin {os.path.getsize(os.path.join(out, "terrain.bin")) / 1024:.0f} KiB, '
          f'terrain.json {os.path.getsize(os.path.join(out, "terrain.json")) / 1024:.0f} KiB')
    check(grid, x0, y0, W, H)


def check(grid, x0, y0, W, H):
    """The world database's own answer for one point it is certain about.

    `playercreateinfo` puts a human warrior at a spot whose ground height the
    server knows.  This field is interpolated from three thousand neighbours, so
    it will not land on it exactly — but it has to land near it, or the
    interpolation is not describing the same hill.
    """
    tx, ty, tz = -8949.95, -132.493, 83.5312
    i = int(round((x0 - tx) / UNIT)); j = int(round((y0 - ty) / UNIT))
    z = float(grid[min(max(i, 0), W - 1), min(max(j, 0), H - 1)])
    print(f'check: human start  synth {z:.1f}  vs world DB {tz:.1f}  delta {abs(z - tz):.1f} yd')
    if abs(z - tz) > 8.0:
        sys.exit('the synthesised ground disagrees with the database it came from')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/src/azerothcore-wotlk'),
         sys.argv[2] if len(sys.argv) > 2 else 'public/world')
