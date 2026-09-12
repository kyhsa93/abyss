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
CENTRE = (-9199.2, -32.1)    # the slice, out of the wiki page 수직 슬라이스
RADIUS = 600.0
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
            if (x - CENTRE[0]) ** 2 + (y - CENTRE[1]) ** 2 <= (RADIUS * 1.35) ** 2:
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
    for i in range(int(2 * RADIUS / cell) + 1):
        for j in range(int(2 * RADIUS / cell) + 1):
            for s in range(3):
                n = math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453
                n -= math.floor(n)
                m = math.sin(i * 269.5 + j * 183.3 + s * 51.1) * 43758.5453
                m -= math.floor(m)
                x = CENTRE[0] - RADIUS + (i + n) * cell
                y = CENTRE[1] - RADIUS + (j + m) * cell
                if (x - CENTRE[0]) ** 2 + (y - CENTRE[1]) ** 2 > RADIUS ** 2:
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
    return out


def main(acore, out):
    pts = samples(acore)
    if len(pts) < 100:
        sys.exit(f'only {len(pts)} height samples in the slice — refusing to guess a world')

    i_lo = int((ORIGIN - (CENTRE[0] + RADIUS)) / UNIT)
    i_hi = int((ORIGIN - (CENTRE[0] - RADIUS)) / UNIT) + 1
    j_lo = int((ORIGIN - (CENTRE[1] + RADIUS)) / UNIT)
    j_hi = int((ORIGIN - (CENTRE[1] - RADIUS)) / UNIT) + 1
    W, H = i_hi - i_lo + 1, j_hi - j_lo + 1
    x0 = ORIGIN - i_lo * UNIT
    y0 = ORIGIN - j_lo * UNIT
    gx = x0 - np.arange(W) * UNIT
    gy = y0 - np.arange(H) * UNIT

    grid = field(pts, gx, gy)
    grid = grid + noise(gx, gy, 90.0, 2.2, 7.0) + noise(gx, gy, 26.0, 0.7, 19.0)

    doodads = scatter(pts, x0, y0, W, H, grid)

    os.makedirs(out, exist_ok=True)
    flat = grid.astype(np.float32).ravel()
    with open(os.path.join(out, 'terrain.bin'), 'wb') as f:
        f.write(struct.pack(f'<{flat.size}f', *flat.tolist()))
    meta = {
        'width': W, 'height': H, 'unit': UNIT,
        'x0': x0, 'y0': y0, 'centre': list(CENTRE), 'radius': RADIUS,
        'zMin': float(grid.min()), 'zMax': float(grid.max()),
        'source': 'azerothcore', 'samples': int(len(pts)),
        'doodads': doodads,
    }
    with open(os.path.join(out, 'terrain.json'), 'w') as f:
        json.dump(meta, f)

    print(f'{len(pts):,} height samples → grid {W} x {H}')
    print(f'height {grid.min():.1f} .. {grid.max():.1f} yd')
    print(f'{len(doodads):,} scattered')
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
