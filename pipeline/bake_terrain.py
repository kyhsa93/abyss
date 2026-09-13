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
import base64
import json
import math
import os
import struct
import zlib
import sys
from collections import Counter

from mpyq import MPQArchive

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from slice import BOUNDS, START, AREA as SLICE_AREA  # noqa: E402

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
    # A city is not a building.  `STORMWIND.WMO` is one record a thousand
    # yards across and the `house` fallback took it, so a cottage sprite stood
    # for the capital and — once buildings were drawn at their real size — a
    # ring of wall a thousand yards wide was laid across the map.  There is no
    # picture here for a city, so it is left out and counted.
    ('STORMWIND.WMO', None), ('IRONFORGE', None), ('ORGRIMMAR', None),
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
]
GROUND_DEFAULT_OK = [
    # Ground the `grass` fallback is honest about.  Six of Elwynn's own, plus
    # the neighbours' grass that leaks over the slice's edges.
    'GRASSBASE', 'GRASSDARK', 'SCRUBBRUSH', 'LEAF', 'UNDERWATERGRASS',
]


# A WMO's own rooms, cached: one read per model rather than one per placement.
_ROOMS = {}


def wmo_rooms(client, path):
    """The boxes a building is actually made of, in its own model space.

    A placement record gives one box for a whole building, and for Northshire's
    abbey that box is 91 yards square — the grounds, not the abbey.  The model
    says more: `MOHD` counts its groups and `MOGI` gives each one's own box,
    which for the abbey is fourteen of them, the nave and the tower and the
    wings.  Drawn from those it is a building; drawn from the one box it is a
    field with a wall round it.

    **The model's own space has z up**, which is the thing that took two
    attempts.  A WMO is (x, y, z) with z the height and the ADT is (x, y, z)
    with *y* the height, so the horizontal pair is the model's first two and
    not its first and third.  Read the other way the union of the groups came
    out seventy yards from the box the same file states for the whole model,
    and no rotation could close that.

    Returns `(whole model box, [group boxes])`, each `(lo, hi)` in model space.
    """
    if path in _ROOMS:
        return _ROOMS[path]
    data, _src = client.read(path)
    whole, rooms = None, []
    if data:
        i = 0
        while i < len(data) - 8:
            m = data[i:i + 4][::-1].decode('ascii', 'replace')
            size, = struct.unpack_from('<I', data, i + 4)
            o = i + 8
            if m == 'MOHD':
                v = struct.unpack_from('<9I6f', data, o)
                whole = (v[9:12], v[12:15])
            elif m == 'MOGI':
                for k in range(size // 32):
                    g = struct.unpack_from('<I6fi', data, o + k * 32)
                    rooms.append((g[0], g[1:4], g[4:7]))
            i = o + size
    _ROOMS[path] = (whole, rooms)
    return _ROOMS[path]


def to_world(pos, ry, lx, ly):
    """One point of a WMO's model space, as a point on the map.

    Turned by `ry + 270` degrees, which is the offset every renderer of these
    files uses and which was found here by solving it: over the 58 placements
    in the tiles around Northshire the corners of each model's own box land on
    the corners the placement record states, to a median of nought yards.
    """
    t = math.radians(ry + 270)
    ca, sa = math.cos(t), math.sin(t)
    px = pos[0] + lx * ca - ly * sa
    pz = pos[2] - (lx * sa + ly * ca)
    return ORIGIN - pz, ORIGIN - px


# A model's footprint, rasterised once and shared by every placement of it.
_PLANS = {}
# How many yards a cell of a plan covers: one ground tile, 32 pixels at 24 to
# the yard, which is what `src/main.ts` draws the ground at.  Not one yard —
# a plan on a different pitch from the floor it is painted on samples badly,
# and the abbey's walls came out dotted at one size and four yards thick at
# the next.  On the same pitch, one cell is one tile and there is nothing to
# alias.
PLAN_CELL = 32 / 24

# How tall a man is and how steep he can walk, both filled in by `bake` from
# somewhere that states them.  They are not decoration: together they are the
# whole definition of a wall used below — a wall is what a man of this height
# cannot stand in and cannot climb over.
#
# `BODY` is the collision box of the client's own human male, 2.03 yards.
# `CLIMB` is the steepest leg in `waypoint_data`, 0.90, the same limit the
# terrain uses for a cliff.  Defaults are here only so the module imports; the
# bake replaces them and `check_doors` would fail on nonsense.
BODY = 2.03
CLIMB = 0.899


def derive_body(client):
    """A man's height, from the model the client draws him with."""
    global BODY
    tall, _wide = model_size(client, 'Character\\Human\\Male\\HumanMale.m2')
    if tall:
        BODY = round(tall, 2)
    return BODY


def derive_climb(acore):
    """The steepest ground the server walks a creature up — see `spawn_npcs`."""
    global CLIMB
    base = os.path.join(acore, 'data/sql/base/db_world')
    if not os.path.isdir(base):
        return CLIMB
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from spawn_npcs import walkable
    got = walkable(base)          # `(steepest, legs, routes)`
    if got:
        CLIMB = got[0]
    return CLIMB


def doorways(client, path):
    """Where a building's doors are, out of the file's own portals.

    A WMO's `MOPT`/`MOPV` are the openings between its rooms — the thing the
    client uses to decide what it can see through — and an opening between a
    room and the outdoors is the front door.  Fourteen of them in Northshire's
    abbey, eight on the ground floor.

    Only the ones a man could walk through: a portal shorter than he is, is a
    window or a hole in a floor.  Returns `(sill, x, y)` in model space, the
    sill being the bottom edge, which is the floor of the room it opens on to.
    """
    data, _src = client.read(path)
    if not data:
        return []
    verts, table = None, None
    i = 0
    while i < len(data) - 8:
        m = data[i:i + 4][::-1].decode('ascii', 'replace')
        size, = struct.unpack_from('<I', data, i + 4)
        o = i + 8
        if m == 'MOPV':
            verts = [struct.unpack_from('<3f', data, o + k * 12)
                     for k in range(size // 12)]
        elif m == 'MOPT':
            table = [struct.unpack_from('<HH', data, o + k * 20)
                     for k in range(size // 20)]
        i = o + size
    if not verts or not table:
        return []
    out = []
    for start, count in table:
        q = verts[start:start + count]
        if not q:
            continue
        lo, hi = min(v[2] for v in q), max(v[2] for v in q)
        if hi - lo <= BODY:
            continue
        out.append((lo, sum(v[0] for v in q) / count,
                    sum(v[1] for v in q) / count))
    return out


def wmo_triangles(client, path):
    """Every triangle of every group of a building, in the model's own space.

    `MOGI`'s boxes give a building as a handful of rectangles, which is a great
    deal better than the one box the placement states and still not the
    building: Northshire's abbey is a nave, a transept and a tower, and three
    rectangles round them is a blob.  The groups' *geometry* is right there —
    `MOVT` holds the vertices and `MOVI` the triangles — and there are 18,817
    of them for the abbey.

    The model's own space has **z up** where the map has y up, so the
    horizontal pair is the first two components and the height is the third.
    """
    _whole, rooms = wmo_rooms(client, path)
    tris = []
    for n in range(max(1, len(rooms))):
        data, _src = client.read(path[:-4] + '_%03d.wmo' % n)
        if not data:
            continue
        vt = vi = None
        i = 0
        while i < len(data) - 8:
            m = data[i:i + 4][::-1].decode('ascii', 'replace')
            size, = struct.unpack_from('<I', data, i + 4)
            o = i + 8
            if m == 'MOGP':          # wraps the rest; its own header is 68
                i = o + 68
                continue
            if m == 'MOVT':
                vt = struct.unpack_from('<%df' % (size // 4), data, o)
            elif m == 'MOVI':
                vi = struct.unpack_from('<%dH' % (size // 2), data, o)
            i = o + size
        if not vt or not vi:
            continue
        for t in range(len(vi) // 3):
            a, b, c = vi[3 * t], vi[3 * t + 1], vi[3 * t + 2]
            tris.append((vt[3 * a:3 * a + 3], vt[3 * b:3 * b + 3],
                         vt[3 * c:3 * c + 3]))
    return tris


def steepness(t):
    """`(is it a wall, lowest z, highest z)` for one triangle.

    A wall is a face steeper than `CLIMB`, which is the number the terrain uses
    for a cliff and comes from the same place — the steepest leg the server
    itself walks a creature up.  Anything flatter is a floor, a stair tread or
    a ramp, and **a stair is not a wall**: read the other way round, the risers
    of the steps up to the abbey door are vertical faces and they sealed the
    door they lead to.
    """
    (ax, ay, az), (bx, by, bz), (cx, cy, cz) = t
    ux, uy, uz = bx - ax, by - ay, bz - az
    vx, vy, vz = cx - ax, cy - ay, cz - az
    nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
    return (abs(nz) * CLIMB < math.hypot(nx, ny),
            min(az, bz, cz), max(az, bz, cz))


def wmo_plan(client, path, only=None, nxt=None):
    """What a building is, from above: its outline, its walls and its floor.

    Three masks over the same grid, one square yard a cell, in the model's own
    space so that a model placed sixteen times is rasterised once.

    * **outline** — every triangle dropped on the floor and the inside filled
      in.  This is the silhouette, which is what a roof covers.
    * **solid** — the part of that outline a man cannot be in.  Not "the
      triangles are here": a doorway has a floor running through it and a
      lintel over it and the wall beside it is the same stone, so the question
      has to be asked the way the world asks it — *can a man stand here* — and
      a man is `BODY` tall and cannot climb steeper than `CLIMB`.  Asked that
      way the doorways fall out on their own: 59 of the 63 ground-floor
      doorways in this slice come out open, and the abbey's eight all do.
    * **floor** — where he can stand.  It is the same answer read the other
      way, and it is what says the inside of the abbey is a stone floor rather
      than the grass the terrain has under it.
    * **over** — whether anything flat stands above a man's head here, which
      is the one thing that tells a room from a courtyard.  Sixty-five per cent
      of the slice's outline is neither stone nor standing room — 192,671 cells
      of 295,227 — and without this that 65% is one undifferentiated state
      covering the ground under an upper storey, an open yard and a room too
      cluttered to stand in.

    Which storey is the ground one comes from the doorways.  A portal's sill is
    the floor of the room it opens on to, so the lowest sill is the ground
    floor, and a surface belongs to that storey if it is within a body's height
    of it.  Without that the abbey's first-floor gallery lands on the ground
    plan and closes the doors underneath it.

    Returns `(outline, w, h, x0, y0, solid, floor, over)`, one byte a cell.
    """
    if (path, only, nxt) in _PLANS:
        return _PLANS[(path, only, nxt)]
    tris = wmo_triangles(client, path)
    if not tris:
        _PLANS[(path, only, nxt)] = None
        return None
    xs = [q[0] for tri in tris for q in tri]
    ys = [q[1] for tri in tris for q in tri]
    S = PLAN_CELL
    x0, y0 = math.floor(min(xs)), math.floor(min(ys))
    w = int(math.ceil((max(xs) - x0) / S)) + 1
    h = int(math.ceil((max(ys) - y0) / S)) + 1
    if w * h > 400000:               # a city, not a building
        _PLANS[(path, only, nxt)] = None
        return None

    cells = bytearray(w * h)
    # Which storey to rasterise.
    #
    # `only` is a sill height and the caller gets it from `storeys()`, which
    # reads the building's own portals.  Given none, this is the ground floor —
    # which is what every caller asked for until a building was allowed to have
    # more than one, and what 65% of this slice's portals were being thrown
    # away against.
    doors = doorways(client, path)
    if only is not None:
        base = only
    elif doors:
        base = min(d[0] for d in doors)
    else:
        # Nothing to walk through, so the ground is wherever most of the
        # standing room is.  A gate and a barn are both this.
        tally = {}
        for t in tris:
            wall, _lo, hi = steepness(t)
            if not wall:
                tally[math.floor(hi)] = tally.get(math.floor(hi), 0) + 1
        base = float(max(tally, key=tally.get)) if tally else 0.0
    low, high = base - BODY, base + BODY

    # Per cell: the tops of the surfaces of this storey, and the walls that
    # stand over it.  Only what is near the storey is kept — the tower is
    # eighty-nine yards of geometry and none of it bears on the ground floor.
    tops, walls = {}, {}
    #: One bit a cell: is there anything flat over a man's head here.  See
    #: `roof` below — it is what tells a room from a courtyard, and both of
    #: them are "inside the outline and neither stone nor floor" without it.
    over_head = bytearray(w * h)
    #: The silhouette of this storey alone — see `mine[n]` below.
    mine = bytearray(w * h)
    #: And the way up: a walkable face between this floor and the next.
    steps = bytearray(w * h)
    for t in tris:
        wall, zlo, zhi = steepness(t)
        (ax, ay, _), (bx, by, _), (cx, cy, _) = t
        i0 = max(0, int((min(ax, bx, cx) - x0) / S))
        i1 = min(w - 1, int((max(ax, bx, cx) - x0) / S))
        j0 = max(0, int((min(ay, by, cy) - y0) / S))
        j1 = min(h - 1, int((max(ay, by, cy) - y0) / S))
        det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        flat = abs(det) < 1e-9
        near = (wall and zlo < high + BODY and zhi > low) \
            or (not wall and low <= zhi <= high)
        # And whether it is a **ceiling** over this storey: a face that is not
        # a wall, sitting above a man's head.  The thing the outline cannot
        # tell you is which of its 65% is a room and which is a courtyard, and
        # this is where the answer was being thrown away — the roof over a room
        # is a flat face and the sky over a courtyard is nothing at all.
        roof = not wall and zhi > high
        # And whether it is a **step between this floor and the one above**.
        #
        # `steepness` already reads a stair tread as walkable — its own comment
        # says *a stair is not a wall*, because read the other way the risers
        # sealed the doors they lead to.  What throws the stairs away is the
        # height filter: a tread halfway up is neither near this storey nor
        # near the next, so `near` is false for every one of them and the two
        # floors come out with nothing between them.
        #
        # A landing is a walkable face in the gap: above a man's head from this
        # floor, and below head height on the next.
        rung = (nxt is not None and not wall
                and high < zhi < nxt - BODY + 0.01)
        for i in range(i0, i1 + 1):
            px = x0 + (i + 0.5) * S
            for j in range(j0, j1 + 1):
                py = y0 + (j + 0.5) * S
                if not flat:
                    l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / det
                    l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / det
                    if not (l1 >= -0.02 and l2 >= -0.02 and l1 + l2 <= 1.02):
                        continue
                n = i * h + j
                cells[n] = 1
                if roof:
                    over_head[n] = 1
                if rung:
                    steps[n] = 1
                if not near:
                    continue
                # And the outline *of this storey*, which is not the outline of
                # the building.  `cells` is every triangle dropped on the floor
                # — the silhouette, which is what a roof covers and what the
                # ground floor is asked for.  An upper floor is a fraction of
                # it, and rasterised on the silhouette the abbey's three upper
                # floors were three quarters of a megabyte of noughts.
                mine[n] = 1
                if wall:
                    walls.setdefault(n, []).append((zlo, zhi))
                else:
                    tops.setdefault(n, []).append(zhi)

    # Fill the inside.  Triangles are a shell: the mask they leave has holes
    # in it wherever the geometry is thin — a window, a doorway, the gap
    # between a wall and the floor it meets — and every hole gives the outline
    # an edge, so the abbey came out as a line drawing with speckle through it.
    # What is inside is what the outside cannot reach: flood from the border,
    # and anything the flood did not touch is the building.
    out = bytearray(w * h)
    stack = [(i, j) for i in range(w) for j in (0, h - 1) if not cells[i * h + j]]
    stack += [(i, j) for j in range(h) for i in (0, w - 1) if not cells[i * h + j]]
    for i, j in stack:
        out[i * h + j] = 1
    while stack:
        i, j = stack.pop()
        for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            a, b = i + di, j + dj
            if 0 <= a < w and 0 <= b < h and not out[a * h + b] \
                    and not cells[a * h + b]:
                out[a * h + b] = 1
                stack.append((a, b))
    for n in range(w * h):
        if not out[n]:
            cells[n] = 1

    # Standing room: a surface of this storey with a body's clearance over it.
    floor = bytearray(w * h)
    for n, zs in tops.items():
        over = walls.get(n, ())
        for z in zs:
            if any(b > z + 0.15 and a < z + BODY for a, b in over):
                continue
            floor[n] = 1
            break
    # Stone: a cell with a wall standing in it at this storey that a man
    # cannot be in.  Not "inside the outline and not floor" — read that way the
    # abbey came out a black mass with rooms cut into it, because the outline
    # is the silhouette and most of an abbey seen from above is roof over a
    # courtyard or over the storey above.  Only what is actually in the way.
    solid = bytearray(w * h)
    for n in walls:
        if cells[n] and not floor[n]:
            solid[n] = 1
    for n in range(w * h):
        if floor[n] and not cells[n]:
            floor[n] = 0
    # A ceiling outside the outline is not a ceiling over anything: the fill
    # above is what decides where the building is.
    for n in range(w * h):
        if over_head[n] and not cells[n]:
            over_head[n] = 0
    # An upper storey's outline is its own.  Filled the same way the building's
    # was — what the outside cannot reach — so a room comes out solid rather
    # than as the ring of its own walls.
    if only is not None:
        seen = bytearray(w * h)
        edge = [(i, j) for i in range(w) for j in (0, h - 1) if not mine[i * h + j]]
        edge += [(i, j) for j in range(h) for i in (0, w - 1) if not mine[i * h + j]]
        for i, j in edge:
            seen[i * h + j] = 1
        while edge:
            i, j = edge.pop()
            for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                a, b = i + di, j + dj
                if 0 <= a < w and 0 <= b < h and not seen[a * h + b] \
                        and not mine[a * h + b]:
                    seen[a * h + b] = 1
                    edge.append((a, b))
        for n in range(w * h):
            cells[n] = 0 if seen[n] else 1
            if not cells[n]:
                solid[n] = floor[n] = over_head[n] = steps[n] = 0
    _PLANS[(path, only, nxt)] = (cells, w, h, x0, y0, solid, floor,
                                 over_head, steps)
    return _PLANS[(path, only, nxt)]


def wmo_furniture(client, path, which=0):
    """What is *in* a building, out of the building's own file.

    A WMO carries its own doodads — `MODN` the models, `MODD` the placements,
    `MODS` the sets they are grouped into — and Northshire's abbey has a
    hundred and fifty of them: candelabra down the nave, books on the shelves,
    barrels in the cellar, busts in the library.  None of it was read, so the
    abbey was a stone floor with nothing on it.

    They are placed in the model's own space, so they turn with the building,
    and they go through the same `classify` as everything the terrain places:
    a model this repository has no picture for is skipped and counted.

    `which` is the placement's own doodad set — the abbey has two and the
    record says which one is standing.  Returns
    `(kind, lx, ly, lz, yaw degrees, scale, path)`.
    """
    data, _src = client.read(path)
    if not data:
        return []
    names = sets = place = None
    i = 0
    while i < len(data) - 8:
        m = data[i:i + 4][::-1].decode('ascii', 'replace')
        size, = struct.unpack_from('<I', data, i + 4)
        o = i + 8
        if m == 'MODN':
            names = data[o:o + size]
        elif m == 'MODS':
            sets = [struct.unpack_from('<II', data, o + k * 32 + 20)
                    for k in range(size // 32)]
        elif m == 'MODD':
            place = (o, size // 40)
        i = o + size
    if names is None or place is None:
        return []
    o, count = place
    first, last = 0, count
    if sets:
        start, n = sets[which if which < len(sets) else 0]
        first, last = start, min(count, start + n)
    out = []
    for k in range(first, last):
        ref, px, py, pz, qx, qy, qz, qw, scale = struct.unpack_from(
            '<Iffffffff', data, o + k * 40)
        end = names.find(b'\0', ref & 0xffffff)
        name = names[ref & 0xffffff:end].decode('ascii', 'replace')
        kind = classify(name)
        if not kind:
            out.append((None, 0, 0, 0, 0, 0, name))
            continue
        # The model's own turn about the vertical, which in a WMO is z.
        yaw = math.degrees(math.atan2(2 * (qw * qz + qx * qy),
                                      1 - 2 * (qy * qy + qz * qz)))
        out.append((kind, px, py, pz, yaw, scale or 1.0, name))
    return out


# Every doorway that was asked for and whether it came out open, which is what
# says the walls above are walls and not a lid.
_DOORS = []


def check_doors(client, path):
    """A door has to be a hole in the wall it is in, on whatever floor it is on.

    This asked only the ground floor and skipped the rest with a comment
    saying *an upper storey's, and it is not drawn* — which was true and is the
    thing issue 169 was about.  Now every sill the building names gets its own
    plan, so every door can be asked the question, and `_DOORS` counts them all.
    """
    doors = doorways(client, path)
    if not doors:
        return
    # Snapped to the storey list rather than asked at the door's own sill:
    # two doors on one floor are two sills a few inches apart, and a plan
    # cached on the raw number is a plan rasterised twice.  It took this bake
    # from a minute and a half to a minute.
    up = storeys(client, path)
    base = up[0]
    for sill, lx, ly in doors:
        floor = min(up, key=lambda z: abs(z - sill))
        plan = wmo_plan(client, path,
                        None if abs(floor - base) <= BODY else floor)
        if not plan:
            continue
        _cells, w, h, x0, y0, solid, _floor, _over, _steps = plan
        i, j = int((lx - x0) / PLAN_CELL), int((ly - y0) / PLAN_CELL)
        open_ = not (0 <= i < w and 0 <= j < h) or not solid[i * h + j]
        _DOORS.append(1 if open_ else 0)


# How far each placement's own model box lands from the box the placement
# states, once turned.  This is the measurement the transform was solved by,
# so it is the one that guards it.
_PLACED = []


# Every model whose footprint has been rasterised, by the key the doodads
# carry, so a plan is stored once however many times its model is placed.
PLANS_BY_KEY = {}


#: Which model each plan key came from, so a later pass can ask the file
#: again without walking the placements twice.
PLAN_PATH = {}
#: And the floors above the ground one, as `[(sill, plan), …]` a key.
PLAN_FLOORS = {}
#: The client the plans were read from, so the census below can ask it again.
_CLIENT = [None]


def plan_key(client, path, key):
    """Rasterise this model's floors if they have not been, and return its key.

    **Floors, plural.**  It used to be one: `wmo_plan` took the lowest sill and
    `check_doors` threw away every portal more than a body's height from it,
    which over this slice is 111 of 176 — the abbey's four storeys came out as
    one, and so did the inn's upstairs where the innkeeper is.

    A storey is only kept if a man can stand somewhere on it.  The tower of a
    keep is eighteen sills of stair landing and a ladder, and eighteen plans of
    nothing is eighteen plans.
    """
    if key not in PLANS_BY_KEY:
        PLANS_BY_KEY[key] = wmo_plan(client, path)
        PLAN_PATH[key] = path
        _CLIENT[0] = client
        check_doors(client, path)
        up = storeys(client, path)
        PLAN_FLOORS[key] = []
        # The ground floor's stairs point at the next sill, which is why the
        # plan is rasterised a second time once the storeys are known.  A
        # building with one floor has nowhere to go and keeps the first.
        if len(up) > 1:
            PLANS_BY_KEY[key] = wmo_plan(client, path, None, up[1])
        for sill, over in zip(up[1:], list(up[2:]) + [None]):
            plan = wmo_plan(client, path, sill, over)
            if not plan:
                continue
            # Standing room, or it is not a floor anybody is on.  A twentieth
            # of the ground floor's is the line, and it is a ratio rather than
            # a count because the buildings here run from a tent to an abbey.
            room = sum(plan[6])
            if room and room * 20 >= sum(PLANS_BY_KEY[key][6]):
                small = crop(plan)
                if small:
                    PLAN_FLOORS[key].append((round(sill, 2), small))
    return key if PLANS_BY_KEY[key] else 0


def rooms_of(client, path, pos, ry, box=None):
    """A building's rooms, as rectangles on the map.

    One per `MOGI` group, turned the way the placement turns the model.  They
    overlap — a WMO's outdoor shells sit over its indoor rooms — and that is
    wanted: the union of them is the building's plan, and the plan is a cross
    or an L where the placement record's single box is a square.
    """
    whole, rooms = wmo_rooms(client, path)
    if whole and box:
        # The model's own box, turned, against the box the ADT states for it.
        xs, ys = [], []
        for a in (0, 1):
            for b in (0, 1):
                wx, wy = to_world(pos, ry, whole[a][0], whole[b][1])
                xs.append(wx)
                ys.append(wy)
        lo, hi = box
        _PLACED.append(max(abs(min(xs) - min(lo[0], hi[0])),
                           abs(max(xs) - max(lo[0], hi[0])),
                           abs(min(ys) - min(lo[1], hi[1])),
                           abs(max(ys) - max(lo[1], hi[1]))))
    if not rooms:
        return []
    out = []
    for _flags, lo, hi in rooms:
        cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
        wx, wy = to_world(pos, ry, cx, cy)
        ax, ay = to_world(pos, ry, cx + 1, cy)
        bear = math.degrees(math.atan2(ay - wy, ax - wx))
        out.append([round(wx, 2), round(wy, 2),
                    round((hi[0] - lo[0]) / 2, 2), round((hi[1] - lo[1]) / 2, 2),
                    round(bear, 1)])
    return out


# Which area a building's inside belongs to, by (model, name set).
_INDOORS = {}
_WMO_AREAS = None


def wmo_area(client, path, nameset):
    """The area id a building's inside carries, or 0.

    A WMO does not sit in the area the ground under it sits in: the client
    keeps a second table, `WMOAreaTable.dbc`, keyed on the building, the name
    set the placement chose and the group — and that is why walking into
    Northshire's abbey changes what the frame at the top of the screen says.
    Fourteen groups of the abbey all answer 24, where the hillside it stands
    on is 86.

    The join is by the group's own `uniqueID`, which is in the `MOGP` header at
    0x38, and by the **name set the placement states** — the abbey is placed
    with set 1 and set 0 gives nothing at all, so reading the record's field
    is the difference between an answer and silence.  Seven of the slice's
    models have one; the rest are a barn, and a barn is not a place.

    Only integers are read.  `WMOAreaTable` carries a name per row and that is
    Blizzard's prose the same as everything else; `src/talk.ts` has our word.
    """
    global _WMO_AREAS
    if _WMO_AREAS is None:
        _WMO_AREAS = {}
        data = read_dbc(client, 'WMOAreaTable')
        if data:
            _n, n, fields, rsize, _sb = struct.unpack_from('<4sIIII', data, 0)
            for i in range(n):
                v = struct.unpack_from('<%di' % fields, data, 20 + i * rsize)
                if v[10]:
                    _WMO_AREAS.setdefault((v[3], v[2]), v[10])
    key = (path.upper(), nameset)
    if key in _INDOORS:
        return _INDOORS[key]
    _whole, rooms = wmo_rooms(client, path)
    tally = {}
    for g in range(max(1, len(rooms))):
        gd, _src = client.read(path[:-4] + '_%03d.wmo' % g)
        if not gd:
            continue
        j = 0
        while j < len(gd) - 8:
            m = gd[j:j + 4][::-1].decode('ascii', 'replace')
            size, = struct.unpack_from('<I', gd, j + 4)
            if m == 'MOGP':
                gid, = struct.unpack_from('<I', gd, j + 8 + 0x38)
                a = _WMO_AREAS.get((gid, nameset), 0)
                if a:
                    tally[a] = tally.get(a, 0) + 1
                break
            j = j + 8 + size
    got = max(tally, key=tally.get) if tally else 0
    _INDOORS[key] = got
    return got


def read_dbc(client, name):
    """One `.dbc`, out of the locale's own archives, which come first."""
    global CHAIN
    was = CHAIN
    CHAIN = ['koKR/patch-koKR-3.MPQ', 'koKR/patch-koKR-2.MPQ',
             'koKR/patch-koKR.MPQ', 'koKR/locale-koKR.MPQ'] + was
    data, _src = client.read('DBFilesClient\\%s.dbc' % name)
    CHAIN = was
    return data if data and data[:4] == b'WDBC' else None


def area_tree(client, ids):
    """Which area sits inside which, and what level it is meant for.

    `AreaTable.dbc` is the client's own list of places and every one of them
    states a parent: Northshire's valley is inside Elwynn, Elwynn is inside
    nothing.  Three integers a row are read — the id, the parent and the
    exploration level — and **not the fourth**, which is the name, because a
    place name is Blizzard's prose the same as a quest's title.

    Which is exactly why the parent matters here.  The slice has 35 areas and
    our own word list is shorter than that, so without the hierarchy an
    unnamed place has nothing to fall back on but a guess — and the guess was
    "엘윈 숲", which is how standing on the shore of Westfall said you were in
    the forest.  With it, an unnamed place says whose it is and admits it has
    no name of its own.

    Checked rather than trusted: area 9 has to come back inside 12, and 12
    inside nothing.  A layout off by one field gives a tree that is still a
    tree.
    """
    data = read_dbc(client, 'AreaTable')
    if not data:
        return {}, {}
    _m, n, fields, rsize, _sb = struct.unpack_from('<4sIIII', data, 0)
    rows = {}
    for i in range(n):
        v = struct.unpack_from('<%di' % fields, data, 20 + i * rsize)
        rows[v[0]] = (v[2], v[10])
    if rows.get(9, (None,))[0] != 12 or rows.get(12, (None,))[0] != 0:
        sys.exit('AreaTable.dbc field offsets are wrong: 9 sits in %s and 12 '
                 'in %s' % (rows.get(9), rows.get(12)))
    parent, level = {}, {}
    for a in ids:
        if a in rows:
            parent[a], level[a] = rows[a]
    return parent, level


def zone_kinds(areamask, area_ids, wetmask, doodads, cw, ch,
               w, h, x0, y0, unit):
    """What kind of place each area is, out of our own baked world.

    A name has two halves.  The word is ours and always will be — a place name
    is Blizzard's prose the same as a quest's title — but **which place it is
    is a fact**, and that half was being guessed off a map.  Ten of the
    thirty-six came out wrong, and four of them wore a neighbour's name: the
    abbey's own id is 24 and the hillside it stands on was called "the abbey",
    the quarry's own id is 54 and a lake was called "the quarry".

    The giveaway was in the water mask all along.  The three wettest places in
    Elwynn were called a logging camp, a quarry and an abbey.  So the kind
    comes from the world we baked — how much of it is water, what stands in
    it, how big it is — and `src/talk.ts` states the kind it believes each of
    its words describes.  Where the two disagree the bake says so, which is
    the step that used to be a person squinting at a map.

    The words are deliberately coarse.  This can tell a lake from a farm; it
    cannot tell one farm from the farm next to it, and it does not pretend to.
    """
    kinds = {}
    tally = {}
    for i in range(cw):
        for j in range(ch):
            v = areamask[i * ch + j]
            if v == 255 or v >= len(area_ids):
                continue
            a = area_ids[v]
            d = tally.setdefault(a, {'n': 0, 'wet': 0, 'k': {}})
            d['n'] += 1
            # The middle of this 33-yard chunk, on the height grid the water
            # mask is stored at.
            wx = x0 - (i + 0.5) * unit * 8
            wy = y0 - (j + 0.5) * unit * 8
            i2 = int(round((x0 - wx) / unit))
            j2 = int(round((y0 - wy) / unit))
            if 0 <= i2 < w and 0 <= j2 < h and wetmask[i2 * h + j2]:
                d['wet'] += 1
    for dd in doodads:
        i = int((x0 - dd[1]) // (unit * 8))
        j = int((y0 - dd[2]) // (unit * 8))
        if not (0 <= i < cw and 0 <= j < ch):
            continue
        v = areamask[i * ch + j]
        if v == 255 or v >= len(area_ids):
            continue
        k = tally.setdefault(area_ids[v], {'n': 0, 'wet': 0, 'k': {}})['k']
        k[dd[0]] = k.get(dd[0], 0) + 1

    for a, d in tally.items():
        if not d['n']:
            continue
        wet = d['wet'] / d['n']
        # Per thousand chunks, not per place.  Counted outright, Elwynn itself
        # came out a town — it is nineteen hundred chunks and three houses
        # anywhere in it are three houses.  A density is the only form of this
        # question that means the same thing at both ends of a slice whose
        # places run from two chunks to seventeen hundred.
        d3 = 1000.0 / d['n']
        k = d['k']
        got = lambda *w: sum(k.get(x, 0) for x in w) * d3
        # In order, and the first line is the one that was missing.  A fifth
        # of a place being water is not a detail of it, it is what it is —
        # and the three wettest places in this forest were called a logging
        # camp, a quarry and an abbey.
        if wet >= 0.20:
            kinds[a] = 'water'
        elif got('grave', 'bones') >= 400:
            kinds[a] = 'graves'
        elif got('hay', 'crop') >= 150:
            kinds[a] = 'farm'
        elif got('hall', 'house') >= 35:
            kinds[a] = 'town'
        elif got('rock', 'deadtree') >= 800:
            kinds[a] = 'rock'
        elif got('barrel', 'prop', 'lamp', 'post', 'cart') >= 1500:
            kinds[a] = 'camp'
        elif got('tree', 'bush') >= 700:
            kinds[a] = 'wood'
        else:
            kinds[a] = 'open'
    return {str(a): kinds[a] for a in sorted(kinds) if a in area_ids}


def in_area(a, root, parent, depth=8):
    """Whether `a` is `root` or sits inside it, however many steps up."""
    for _ in range(depth):
        if a == root:
            return True
        a = parent.get(a, 0)
        if not a:
            return False
    return False


# Where the ground opens into something.  A mine, a den, a burrow: all three
# are already in `WMO_KINDS` as "there is no picture here for a hole in a
# hillside", and the *hole itself* is in the terrain — so their positions are
# kept, and `check_holes` matches the client's own hole bits against them.
MOUTHS = []


def is_mouth(path):
    p = path.upper()
    return any(w in p for w in ('MINE', 'DEN', 'BURROW', 'CAVE', 'CRYPT'))


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
    # `CANOPYLESSTREE` is the client's word for a tree with no canopy on it —
    # a bare one — and it was going through as an ordinary tree while ordinary
    # trees were coming out bare, because `deadtree` was one of the pictures
    # the word `tree` rotated through.  Both halves were wrong at once.
    # The models the *game objects* stand on, which reach this list through
    # `pipeline/objects.py` — a vein and a chest are placed by the world
    # database rather than by the terrain, and they are the same kind of thing
    # with the same kind of name, so they go through the same door.
    ('MININGNODE', 'vein'), ('TRADESKILLNODE', 'herb'),
    ('TREASURECHEST', 'crate'), ('FIREWOODPILE', 'campfire'),
    ('FIREPIT', 'campfire'), ('BONFIRE', 'campfire'), ('FOUNDRYPIT', 'campfire'),
    ('FORGE', 'prop'), ('SMELTING', 'prop'), ('BLACKSMITH', 'prop'),
    ('CANOPYLESS', 'deadtree'), ('DEADTREE', 'deadtree'),
    ('TREES\\', 'tree'), ('PINE', 'pine'), ('TREE', 'tree'),
    ('BUSH', 'bush'), ('SHRUB', 'bush'),
    # `LAMPPOST` has to come before `POST` or a lamp is a fence, and it did:
    # every lamp in the forest was drawn as four yards of railing.  A rule
    # ordered after a rule that also matches it never runs.
    ('LAMPPOST', 'lamp'),
    # A single post is not a fence section.  Reading one as a fence ran the
    # span logic over it, so each of the six posts around the abbey became four
    # yards of railing standing on its own.  Before `FENCE` and not after it:
    # these live in the client's `FENCES` folder, so the *directory* matched
    # first and the file name never got a say.
    ('WOODPOST', 'post'), ('FENCEPOST', 'post'), ('POST', 'post'),
    ('FENCE', 'fence'),
    ('CLIFFROCK', 'rock'), ('ROCK', 'rock'), ('BOULDER', 'rock'),
    ('WATERFALL', 'waterfall'),
    # Kept as a kind with no picture, because the answer to these is not a
    # sprite.  See `firefly` in `src/main.ts`: they are light, and light is
    # code rather than art.
    ('FIREFLIES', 'firefly'),
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
    # What stands *inside* a building.  `MODD` is 3,759 placements and two
    # thirds of them took the skip default, so the roof came off the abbey and
    # what was under it was a tiled floor with nothing on it, and the inn had
    # no kegs.  Nine names cover twelve hundred; the rest is a long tail of
    # things that are genuinely below this projection's fidelity, and those
    # are declared rather than mapped — a bowl drawn as a crate is a lie about
    # what the client put there.
    ('BOOKSTACK', 'shelf'), ('BOOKSHELF', 'shelf'), ('BOOKCASE', 'shelf'),
    ('ABBEYSHELF', 'shelf'), ('SHELF', 'shelf'),
    ('WARDROBE', 'cabinet'), ('FOOTLOCKER', 'cabinet'), ('CABINET', 'cabinet'),
    # A weapon rack and an armour stand are a tall wooden thing standing
    # against a wall, which is what the cabinet picture is.  Said out loud
    # because it is the one substitution here that is a stretch.
    ('WEAPONRACK', 'cabinet'), ('GUNRACK', 'cabinet'), ('ARMORSTAND', 'cabinet'),
    ('WALLSWORD', 'cabinet'), ('WALLSHIELD', 'cabinet'),
    ('BEERKEG', 'keg'), ('KEG', 'keg'),
    ('CANDELABRA', 'lamp'), ('BRAZIER', 'campfire'),
    ('BUNKBED', 'bed'), ('INNBED', 'bed'), ('SLEEPMAT', 'bed'),
    ('INNPILLOW', 'bed'), ('BEDROLL', 'bed'),
    # Tableware.  Small, and small is the point: a room reads as lived in
    # because there is clutter on the tables, and 744 of these are the clutter.
    # Drawn at two thirds of a yard, which is what they are.
    ('GREENBOTTLE', 'crockery'), ('BOTTLESMOKE', 'crockery'),
    ('BOTTLE', 'crockery'), ('SMALLVIALS', 'crockery'),
    ('VIALSBOTTLES', 'crockery'), ('VIAL', 'crockery'),
    ('STEIN', 'crockery'), ('MUG', 'crockery'), ('BOWL', 'crockery'),
    ('TURKEYLEG', 'crockery'), ('HAUNCH', 'crockery'),
    ('CARGONET', 'prop'), ('PICK', 'prop'),
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


# Things this repository has looked for a picture of and not found one.
#
# Butterflies, birds and the fireflies are 255 of the 530 the outdoor pass
# skips, and they are the ones that hurt: what they are is *motion*, and a
# forest with nothing moving in it is the exact complaint the art direction
# page raised about having no way to give the land an expression.  Every asset
# pack on this machine was searched — `lpc-tiles`, `lpc-animals`, `lpc-pets`,
# the Kenney nature and forest sets, the Superpowers packs — and none of them
# has a top-down butterfly or bird.  Drawing one here is not allowed.
#
# So they are named rather than left in the unmatched pile.  The difference
# matters: an unmatched model is something nobody has looked at, and these
# have been looked at.  The fireflies get an answer of a different kind in
# `src/main.ts` — they are light, and light is code.
NO_PICTURE = ('BUTTERFLY', 'BIRD0', 'CRITTER')


def classify(path):
    """Blizzard's file path in, one of our own words out — or nothing."""
    p = path.upper()
    # The fireflies live in the client's `CRITTER` folder, which the next
    # line throws away wholesale — so they are asked for by name first.  They
    # are the one critter this repository has an answer for, and the answer
    # is not a picture.
    if 'FIREFLIES' in p:
        return 'firefly'
    for needle in NO_PICTURE:
        if needle in p:
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
    shut = set()
    gap = set()
    whole = []
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
                # Which of the model's doodad sets is standing in this one,
                # and which of its name sets — the second is what
                # `WMOAreaTable` is keyed on.
                dset, = struct.unpack_from('<H', data, off + i * 64 + 58)
                nset, = struct.unpack_from('<H', data, off + i * 64 + 60)
                # The box's vertical extent is kept but not used to size the
                # sprite: a WMO's box is the whole complex, spires and all, so
                # Northshire's abbey comes back eighty-nine yards tall and a
                # drawn building that size is a wall across the glass.  A model
                # has an honest height and a building does not.
                wmos.append((nid, uid, ORIGIN - pz, ORIGIN - px, py, ry)
                            + footprint(ry, abs(hz - lz) / 2,
                                        abs(hx - lx) / 2)
                            + (round(abs(hy - ly), 2), (px, py, pz), ry,
                               ((ORIGIN - lz, ORIGIN - lx),
                                (ORIGIN - hz, ORIGIN - hx)), dset, nset))
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
            # Bit two of a chunk's flags is the client's own word for "you
            # cannot walk here".  Blizzard uses it sparingly — 93 chunks in
            # this slice, nearly all of them the wall along the Burning
            # Steppes — and it was not read at all, so the one boundary the
            # world states outright in a flag was open.
            chunk_flags, = struct.unpack_from('<I', head, 0)
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
                if chunk_flags & 0x2:
                    shut.add((ix, iy))
                # And the floor the client takes *out* of this chunk.  Sixteen
                # bits over a four by four grid, each one a two-unit square of
                # the eight by eight the chunk is, and that is how a cave mouth
                # is made: without them the ground is laid over the entrance to
                # every mine in the forest.  The field was read and put in the
                # cell all along, and then used by nothing.
                #
                # A bit's row runs along world x, the same way `MCVT`'s rows do
                # a few lines up.  `check_holes` is what says so rather than the
                # wiki: read the other way round the mouths land a median 24
                # yards from the mine they belong to, and 56 at worst, against
                # 16 and 27 this way.
                for k in range(16):
                    if (holes >> k) & 1:
                        gap.add((iy * 8 + (k // 4) * 2, ix * 8 + (k % 4) * 2))
                if holes == 0xFFFF:
                    whole.append((ix, iy))
                got = ground_of(data, off, size, tex, big)
                if got:
                    painted[(ix, iy)] = got
    models = [n for n in names if n]
    placed, skipped = [], 0
    # A running number for each building placement in this tile, so its own
    # furniture can name it.  Zero means "belongs to nobody", which is every
    # doodad the terrain puts down rather than a building.
    house = 0
    for tag, nid, wx, wy, wz, rot, sc in doodads:
        path = models[nid] if nid < len(models) else ''
        kind = classify(path)
        if kind:
            # The model's own size, times the placement's own scale.  Both were
            # in the file all along; only the second one was read.
            tall, wide = model_size(client, path)
            # And which of the pictures this kind has should be used, keyed on
            # the *model* rather than on the spot.  It was the spot: the same
            # bush was a different bush every time the client put one down, and
            # two of the client's own bushes standing side by side could come
            # out identical.  The world's variety is the variety of its models,
            # and this is how much of it survives a word like `bush`.
            placed.append((kind, wx, wy, wz, rot, sc, 0.0, 0.0, 0.0,
                           zlib.crc32(path.upper().encode()) & 0xffff,
                           round(tall * sc, 2), round(wide * sc, 2),
                           [], 0, 0.0, 0, 0, []))
        else:
            skipped += 1
    for nid, _uid, wx, wy, wz, rot, half_l, half_w, bear, tall, pos, ry, \
            world_box, dset, nset in wmos:
        name = wmo_names[nid] if nid < len(wmo_names) else ''
        kind = classify_wmo(name)
        if not kind and is_mouth(name):
            MOUTHS.append((wx, wy))
        if kind:
            # Which indoor area this building *is*, worked out before its
            # furniture rather than after.
            #
            # Every piece used to go out with a zero here, meaning "not inside
            # anything", and the scene only hides a thing when it knows which
            # room it belongs to — so once the furniture list grew from a
            # hundred and fifty pieces to three thousand, Goldshire filled up
            # with bookshelves standing in the road.  A building's contents
            # are the building's; the roof coming off is what reveals them.
            f_in = wmo_area(client, name, nset)
            # The doors, in world yards.
            #
            # `doorways` has found them since it was written — a WMO's own
            # `MOPT`/`MOPV` portals, filtered to the ones a man can walk
            # through — and the bake used the answer to pick which storey is
            # the ground one and then **threw the coordinates away**.  Fourteen
            # in Northshire's abbey, eight on the ground floor, and not one of
            # them left this file.  A building you can only enter by walking at
            # its wall until the mask lets you through is a building with no
            # door, however many the client drew.
            #
            # Ground storey only: an opening on the first floor is a window
            # from out here.
            ways = doorways(client, name)
            sill = min((d[0] for d in ways), default=0.0)
            doors = [[round(v, 2) for v in to_world(pos, ry, lx, ly)]
                     for s, lx, ly in ways if abs(s - sill) <= BODY]
            # And a number for *this placement*, so its furniture can say
            # whose it is.
            #
            # The scene used to work that out by asking whether a piece stood
            # inside a building's footprint, and a shelf stands *against* a
            # wall: pushed up to the stone it lands a cell outside a mask cut
            # at 1.33 yards and reads as standing in the street.  With a
            # hundred and fifty pieces that was a curiosity.  With three
            # thousand it filled Goldshire with bookcases.  The bake knows
            # exactly which building each piece came out of; it was throwing
            # the answer away and making the scene guess it back.
            house += 1
            # What is standing inside it.  These are the building's own
            # doodads, in the building's own space, so they turn with it.
            for f_kind, lx, ly, lz, yaw, sc, f_path in \
                    wmo_furniture(client, name, dset):
                if not f_kind:
                    skipped += 1
                    continue
                fx, fy = to_world(pos, ry, lx, ly)
                f_tall, f_wide = model_size(client, f_path)
                placed.append((f_kind, fx, fy, pos[1] + lz,
                               round((ry + 270 + yaw) % 360, 1), sc,
                               0.0, 0.0, 0.0,
                               zlib.crc32(f_path.upper().encode()) & 0xffff,
                               round(f_tall * sc, 2), round(f_wide * sc, 2),
                               [], 0, 0.0, f_in, house, []))
            # An opaque number for "the same model", so an instance that could
            # not be solved can borrow from one that could.  A number and not
            # the path: nothing from a client's file table is allowed out of
            # this script, and `bake` drops this before it writes anything.
            key = zlib.crc32(name.upper().encode()) if name else 0
            placed.append((kind, wx, wy, wz, bear, 1.0,
                           half_l, half_w, bear, key, 0.0,
                           round(max(half_l or 0.0, half_w or 0.0), 2),
                           rooms_of(client, name, pos, ry, world_box),
                           plan_key(client, name, key), round(ry + 270, 1),
                           f_in, house, doors))
    return cells, placed, water, painted, skipped, src, shut, gap, whole


def bake(client, bounds, out, acore=None):
    # A man's height and the steepest thing he walks up: both are read rather
    # than chosen, and both are the whole definition of a wall in `wmo_plan`.
    derive_body(client)
    derive_climb(acore or os.path.expanduser('~/src/azerothcore-wotlk'))
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
    variety = {}
    closed = []
    seams = []
    gaps = []
    wholly = []
    wholly_at = []
    indoor_ids = set()
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
            cells, dd, wet, painted, skipped, src, shut, gap, whole = got
            for (ix, iy) in shut:
                # On the same grid and the same origin as the zone map, so the
                # scene can index both the same way.
                CI, CJ = tx * 16 + iy, ty * 16 + ix
                if ci_lo <= CI <= ci_hi and cj_lo <= CJ <= cj_hi:
                    closed.append([CI - ci_lo, CJ - cj_lo])
            wholly += whole
            for (ix_, iy_) in whole:
                wholly_at.append((tx * 16 + iy_, ty * 16 + ix_))
            for (di, dj) in gap:
                # On the height grid, so the scene indexes it the same way it
                # indexes water.  Each bit is two units square, so it is four
                # cells of that grid.
                for a in range(2):
                    for b in range(2):
                        I, J = tx * 128 + di + a, ty * 128 + dj + b
                        if i_lo <= I <= i_hi and j_lo <= J <= j_hi:
                            gaps.append([I - i_lo, J - j_lo])
            dropped += skipped
            sources[f'{ty}_{tx}'] = src
            for kind, wx, wy, wz, rot, sc, bl, bw, bear, key, \
                    tall, wide, rooms, plan, mr, inside, house, doors in dd:
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
                variety.setdefault(kind, set()).add(key)
                # The placement number is per tile, so it needs the tile on
                # the front of it to be unique across the slice.
                doodads.append([kind, wx, wy, wz, rot, sc, bl, bw, bear,
                                key, tall, wide, rooms, plan, mr, inside,
                                (ty * 64 + tx) * 4096 + house if house else 0,
                                doors])
                if inside:
                    indoor_ids.add(inside)
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
                        # Tiles share their edge: the last column of one is
                        # the first of the next, and the same is true of every
                        # chunk inside a tile.  So this is written twice, and
                        # the two values have to agree — a V9 grid stitched one
                        # cell out of step puts a cliff along every seam, and
                        # the only thing that would say so is the eye.
                        at = (I - i_lo) * h + (J - j_lo)
                        was = grid[at]
                        now = ccz + hv[r * 17 + c]
                        if was is not None and abs(was - now) > 0.01:
                            seams.append(round(abs(was - now), 2))
                        grid[at] = now

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

    # The indoor areas belong in the tree too, or the abbey's nave has no
    # parent to fall back on when nobody has given it a word.
    area_parent, area_level = area_tree(client, area_ids + sorted(indoor_ids))

    # The same arithmetic `areaOf` in `src/main.ts` uses, and for the same
    # reason: an index worked out two ways is an index that disagrees with
    # itself, which is how the first run of this came back with every place in
    # the slice classed as empty ground.
    # --- and the edge of the slice ------------------------------------
    #
    # A box is not a zone.  `slice.json` says this game is area 12, and the
    # bounding box of area 12 is measured — but Stormwind sits geographically
    # *inside* Elwynn, so the box catches the city whole, and the Burning
    # Steppes and a beach of Westfall with it.  Thirty per cent of the walkable
    # ground in this slice is somewhere else, and the biggest piece of it is a
    # city this repository deliberately does not draw: `STORMWIND.WMO` is
    # excluded a few hundred lines up because there is no picture of a city
    # here, and that decision was right and then left half-finished.  What it
    # left was a flat grey slab, a ruler-straight line down the middle of the
    # map, and thirty people standing on nothing.  You could walk into it.
    #
    # So the areas that are not this slice's are shut, using the same mechanism
    # the client's own impassable chunks use.  The alternative — carrying the
    # box and drawing a city — is the expensive one, and the alternative to
    # both is a wall nobody can see.
    tree = {a for a in area_ids if in_area(a, SLICE_AREA, area_parent)}
    shut_out = 0
    for i in range(cw):
        for j in range(ch):
            v = areamask[i * ch + j]
            if v == 255 or v >= len(area_ids):
                continue
            if area_ids[v] not in tree:
                closed.append([i, j])
                shut_out += 1
    print(f'{shut_out} chunks shut because they are not area {SLICE_AREA}: '
          f'{len(area_ids) - len(tree)} of {len(area_ids)} areas, '
          f'{100 * shut_out / max(1, cw * ch):.0f}% of the box')

    area_kind = zone_kinds(areamask, area_ids, wetmask, doodads,
                           cw, ch, w, h, ORIGIN - i_lo * UNIT,
                           ORIGIN - j_lo * UNIT, UNIT)

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
        # Which of the client's map tiles this was built from.  The keys
        # only: which archive each came out of is provenance and belongs in
        # `public/manifest.json`, not in a file that ships — an archive name
        # is Blizzard's the same as a model path, and `pipeline/bake.py`
        # greps the output for exactly that.
        'tiles': sorted(sources),
        'areas': areas,
        'hasWater': True,
        'water': sum(wetmask),
        'ground': GROUND_ORDER,
        # How many distinct models the client actually placed for each of our
        # words.  The scene rotates through a list of pictures per word, and
        # with more pictures than models it invents variety the world does not
        # have: the same bush came out as three different bushes and two of the
        # client's own bushes came out identical.
        'variety': {k: len(v) for k, v in sorted(variety.items())},
        'groundWidth': w2, 'groundHeight': h2, 'groundUnit': UNIT / 2,
        # The zone map, and the ids it indexes.  `areaOf` in `src/main.ts`
        # reads it; the names are ours, in `talk.ts`, because an area name is
        # Blizzard's prose the same as everything else.
        'areaWidth': cw, 'areaHeight': ch, 'areaUnit': UNIT * 8,
        'areaIds': area_ids,
        # Which of them are this slice — area 12 and everything inside it.
        # The rest are shut (see the edge, above) and the scene draws them as
        # the dark behind the world rather than as ground you may not walk on:
        # an invisible wall across a field is the thing this repository keeps
        # taking out, and the edge of a slice is not a wall, it is an end.
        'areaSlice': sorted(tree),
        # And which area each of them sits inside, out of `AreaTable.dbc`.
        # `src/talk.ts` has our own word for seventeen of the thirty-five; the
        # rest say whose ground they are on and show their id, rather than
        # quietly coming out as the forest.
        'areaParent': {str(k): v for k, v in area_parent.items()},
        # What kind of place each of them is, derived rather than guessed.
        # See `zone_kinds`: this is the half of a name that is a fact, and
        # `src/talk.ts` carries the other half, which is a word of ours.
        'areaKind': area_kind,
        'areaLevel': {str(k): v for k, v in area_level.items() if v},
        # The footprints, one per model rather than one per placement:
        # `[width, height, cell yards, model x0, y0, base64 of one bit a cell]`.
        'plans': {str(k): plan_out(v) for k, v in PLANS_BY_KEY.items() if v},
        # The floors above the ground one, as `[sill, …masks]` a storey.  A
        # separate table and not a fifth field on the plan, because a building
        # with one floor is most of them and a key nobody reads is cheaper
        # absent than empty.
        'floors': {str(k): [[z] + plan_out(pl) for z, pl in v]
                   for k, v in PLAN_FLOORS.items() if v},
        # The chunks the client marks impassable, as `[i, j]` on the same
        # 33-yard grid the zones use.
        'closed': closed,
        # And the floor it takes out — a cave mouth — as `[i, j]` on the
        # height grid, the same one the water is on.
        'gaps': gaps,
        # The chunks that lose *all sixteen* bits, on the zone grid.  Those are
        # not mouths: they are ground handed to a building that brings its own
        # floor, which here is Stormwind.  Drawn as holes, because there is no
        # floor of ours there — but **not impassable**, because the server
        # walks its own creatures across them, and 86 patrol points and 42
        # spawns sit on them.
        'given': [[i - ci_lo, j - cj_lo] for i, j in wholly_at
                  if ci_lo <= i <= ci_hi and cj_lo <= j <= cj_hi],
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
                         # Which picture, keyed on the model rather than the
                         # spot.  Dropped for the buildings, whose key is a
                         # whole different number.
                         **({'v': key % 64} if tall else {}),
                         # The rooms the model is made of, each a rectangle
                         # on the map — see `rooms_of`.
                         **({'rooms': rooms} if rooms else {}),
                         # The model's own footprint, rasterised: `p` is which
                         # plan and `mr` how far it is turned.
                         **({'p': plan, 'mr': mr} if plan else {}),
                         # Which area this building's *inside* is, out of
                         # `WMOAreaTable.dbc` — the hillside the abbey stands
                         # on is 86 and its nave is 24.
                         **({'a': inside} if inside else {}),
                         # Which building placement this is, or which one put
                         # this piece of furniture down.  The scene hides a
                         # building's contents until you are in it, and it
                         # used to work out whose they were from where they
                         # stood — which fails for anything against a wall.
                         **({'h': house} if house else {}),
                         # Where you go in, in world yards — see `doorways`.
                         **({'d': doors} if doors else {}),
                         **({'bl': round(bl, 1), 'bw': round(bw, 1),
                             'ba': round(abs(ba), 1)}
                            | ({'bq': 1} if ba < 0 else {}) if bl else {}))
                    for k, x, y, z, rot, s, bl, bw, ba, key, tall, wide,
                    rooms, plan, mr, inside, house, doors in doodads],
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
    print('read from ' + ', '.join(sorted(set(sources.values()))))
    print(f'terrain.bin {os.path.getsize(os.path.join(out, "terrain.bin"))/1024:.0f} KiB, '
          f'terrain.json {os.path.getsize(os.path.join(out, "terrain.json"))/1024:.0f} KiB')
    check_storeys()
    check_plans()
    check_rooms(doodads)
    check_water(grid, wetmask, levels)
    check_walls()
    check_holes(gaps, wholly, meta)
    check_seams(seams, grid)
    return meta


def check_seams(seams, grid):
    """Where two tiles meet, they have to meet.

    Every edge of every chunk is written twice — once by the chunk on each
    side — and if the stitching is a cell out of step the second write
    disagrees with the first.  474 by 667 cells with 630,036 triangles over
    them, and a seam is a cliff a yard wide: visible, and visible *only*, which
    is why the wiki asked for a check rather than a look.

    Nothing is tolerated but floating point.  The two writes are the same
    number out of the same file, so anything above a hundredth of a yard is a
    grid that does not line up.
    """
    filled = sum(1 for v in grid if v is not None)
    print(f'check: {filled:,} height cells, {len(seams)} of them written twice '
          f'with different answers')
    assert not seams, (
        'the tiles do not meet: %d cells disagree, worst %.2f yards'
        % (len(seams), max(seams)))


def check_holes(gaps, full, meta):
    """A hole in the ground is the mouth of something.

    The bits are a four by four grid over a chunk and nothing in the file says
    which way its rows run, so it was settled by measuring: every hole in this
    slice that sits on a mine, a den or a cave is matched against that model's
    own placement, and one reading puts them a median 16 yards from it while
    the other puts them 24 and as much as 56.  That is the check, because it is
    the evidence — a transposed mask would still be a mask, and would still
    look like holes in a hillside.

    Stormwind's own ground is holed too, and the harbour's, and the inns have
    cellars; those are not mouths and are not counted.  The ones that are, are.
    """
    if not gaps:
        return
    u, x0, y0 = meta['unit'], meta['x0'], meta['y0']
    mouths = MOUTHS
    near = []
    for i, j in gaps:
        wx, wy = x0 - i * u, y0 - j * u
        if mouths:
            near.append(min(math.hypot(a - wx, b - wy) for a, b in mouths))
    near.sort()
    close = [d for d in near if d < 45]
    # A chunk with all sixteen bits set is not a mouth: it is ground handed
    # over to a building that brings its own floor, which in this slice is
    # Stormwind and its harbour.  Worth separating in the report, because the
    # two look identical in the mask and only one of them is a cave.
    whole = sum(1 for v in full if v)
    print(f'check: {len(gaps):,} cells of floor the client takes out, '
          f'{len(close)} of them at a mouth, a median '
          f'{close[len(close)//2]:.1f} yd from it; {whole} chunks lose all '
          f'sixteen, which is a city standing on its own floor'
          if close else f'check: {len(gaps):,} cells of floor taken out')
    assert not close or close[len(close) // 2] < 22, (
        'the hole bits are transposed: the mouths land %.1f yards from the '
        'models they belong to' % close[len(close) // 2])


def check_walls():
    """Every door this slice has, and whether you can walk through it.

    A wall you cannot pass is worth nothing if it has no door, and a plan that
    fills a building solid is exactly that — the mistake this replaced.  So the
    gate is the doors themselves: `MOPT` says where every opening in every
    building is, and the mask has to be open at each one.  It is the same shape
    of check as the water lying on its own bed — a statement the file makes
    about itself, asked of the thing built from it.

    **Every floor, not only the ground one.**  This used to skip anything more
    than a body's height above the lowest sill with a comment saying *an upper
    storey's, and it is not drawn* — which was true, and 111 of this slice's
    176 portals are up there.  Each sill now has a plan of its own, so each
    door is asked the question on the floor it belongs to.
    """
    if not _DOORS:
        return
    open_, n = sum(_DOORS), len(_DOORS)
    print(f'check: {open_} of {n} doorways on every floor come out open '
          f'(a man {BODY} yards tall, climbing at most {CLIMB})')
    assert open_ >= n * 0.9, (
        f'only {open_} of {n} doorways are open — the buildings are sealed')


def packed(mask):
    """One mask, a bit a cell."""
    bits = bytearray((len(mask) + 7) // 8)
    for n, v in enumerate(mask):
        if v:
            bits[n >> 3] |= 1 << (n & 7)
    return base64.b64encode(bytes(bits)).decode('ascii')


def crop(plan):
    """Trim a storey's masks to its own extent.

    Every storey is rasterised on the whole model's grid, because that is the
    grid the doodad's transform is written against — and an upper floor is a
    fraction of the silhouette.  The abbey's is 750 by 393 cells, so its three
    upper floors were three quarters of a megabyte of noughts: `terrain.json`
    went from 1,771 KiB to 4,783 the moment the floors were baked, and 3,011
    of that was empty bits.

    The grid's origin is in the masks' own fields, so tightening it costs
    nothing downstream — `planCell` reads `x0`, `y0`, `w` and `h` and does not
    care how big they are.
    """
    cells, w, h, x0, y0, solid, floor, over, steps = plan
    lo_i, hi_i, lo_j, hi_j = w, -1, h, -1
    for i in range(w):
        for j in range(h):
            if cells[i * h + j]:
                lo_i = min(lo_i, i); hi_i = max(hi_i, i)
                lo_j = min(lo_j, j); hi_j = max(hi_j, j)
    if hi_i < 0:
        return None
    nw, nh = hi_i - lo_i + 1, hi_j - lo_j + 1
    if nw * nh >= w * h:
        return plan
    def cut(src):
        out = bytearray(nw * nh)
        for i in range(nw):
            base = (i + lo_i) * h + lo_j
            out[i * nh:(i + 1) * nh] = src[base:base + nh]
        return out
    return (cut(cells), nw, nh, x0 + lo_i * PLAN_CELL, y0 + lo_j * PLAN_CELL,
            cut(solid), cut(floor), cut(over), cut(steps))


def plan_out(plan):
    """One storey's five masks: outline, walls, floor, what is roofed, and the
    way up.

    The fourth is the one that tells a room from a courtyard.  Seen from above
    an outline is a silhouette, and 65% of the slice's outline cells are
    neither stone nor standing room — 192,671 of 295,227 — which is as often
    the ground under an upper storey or an open yard as it is a room nobody
    can walk in.  A roof over a room is a flat face above a man's head; the sky
    over a courtyard is nothing at all, and `wmo_plan` was throwing that face
    away as *not near this storey*.

    The fifth is the stairs, and they were being thrown away by the same
    filter.  `steepness` already reads a tread as walkable — its own comment
    says *a stair is not a wall*, because read the other way the risers sealed
    the doors they lead to — but a tread halfway up is near neither storey, so
    every one of them fell out and the two floors came out with nothing
    between them.
    """
    cells, w, h, x0, y0, solid, floor, over, steps = plan
    return [w, h, PLAN_CELL, x0, y0,
            packed(cells), packed(solid), packed(floor), packed(over),
            packed(steps)]


def storeys(client, path):
    """How many floors a building has, out of its own portal sills.

    A portal's bottom edge is the floor of the room it opens on to, so the
    sills of a building are its storeys — read as a list rather than as a
    minimum.  `wmo_plan` takes `min(...)` and `check_doors` throws away
    anything more than a body's height from it, which is where 65% of this
    slice's portals go.

    Grouped by `BODY`, because two doors on one floor are two sills a few
    inches apart and a storey is a body's height.
    """
    got = sorted(d[0] for d in doorways(client, path))
    if not got:
        return []
    out = [got[0]]
    for z in got[1:]:
        if z - out[-1] > BODY:
            out.append(z)
    return out


def check_storeys():
    """How many floors this slice has, and how many of them are drawn.

    Counted rather than argued about, because the issue that asked for this
    was written against a bake that had changed since and the numbers are the
    whole question.
    """
    if not PLAN_PATH:
        return
    tall, ports, kept = 0, 0, 0
    floors = Counter()
    for key, path in PLAN_PATH.items():
        if not PLANS_BY_KEY.get(key):
            continue
        up = storeys(_CLIENT[0], path)
        floors[len(up)] += 1
        if len(up) > 1:
            tall += 1
        doors = doorways(_CLIENT[0], path)
        ports += len(doors)
        base = min(d[0] for d in doors) if doors else 0
        kept += sum(1 for d in doors if abs(d[0] - base) <= BODY)
    baked = sum(len(v) for v in PLAN_FLOORS.values())
    print(f'check: {sum(floors.values())} buildings, {tall} of them with more '
          f'than one floor; {ports} portals, {kept} on the ground floor and '
          f'{ports - kept} above it; {baked} upper floors baked '
          + '(' + ', '.join(f'{n} sills x{c}' for n, c in sorted(floors.items()))
          + ')')
    # Every floor this slice draws has to be one the client states a sill for,
    # and the ground floor is always one of them.  Read the other way round —
    # baking a floor the portals do not name — is how a gallery lands on the
    # ground plan and closes the doors underneath it.
    for key, ups in PLAN_FLOORS.items():
        want = storeys(_CLIENT[0], PLAN_PATH[key])
        for z, _plan in ups:
            assert any(abs(z - s) < 0.01 for s in want), (
                'a floor was baked at %.2f and the building names no sill '
                'there: %s' % (z, want))


def check_plans():
    """The four masks partition the outline, and the fourth one earns its place.

    `outline = solid + floor + roofed + open`, exactly.  A cell of the outline
    is one of four things and nothing else, and before the ceiling was baked it
    was one of *three* — of which the third was 65% and covered a room, a
    courtyard and the ground under an upper storey all at once.

    And the split has to be a split.  A mask that came out all ones or all
    noughts would pass the partition and say nothing, which is how a bit that
    is never read looks from the outside.
    """
    if not PLANS_BY_KEY:
        return
    out = solid_n = floor_n = roofed = opened = 0
    for plan in PLANS_BY_KEY.values():
        if not plan:
            continue
        cells, w, h, _x0, _y0, solid, floor, over, _steps = plan
        for n in range(w * h):
            if not cells[n]:
                continue
            out += 1
            if solid[n]:
                solid_n += 1
            elif floor[n]:
                floor_n += 1
            elif over[n]:
                roofed += 1
            else:
                opened += 1
    print(f'check: {out:,} cells of outline = {solid_n:,} stone + '
          f'{floor_n:,} standing room + {roofed:,} roofed + {opened:,} open '
          f'to the sky')
    assert out == solid_n + floor_n + roofed + opened
    assert opened and roofed, (
        'the ceiling mask is all one value, so it separates nothing')

    # And a wall is a line, not a scatter of dots.
    #
    # `steepness` calls anything past `CLIMB` a wall, so a bench's side panel,
    # an altar step, a stair riser and a table leg are all stone — and a
    # 1.33-yard black square reads on screen as a hole rather than as a wall.
    # The thing that tells them apart is in `walls` already: a wall runs from
    # the floor to the ceiling and a bench is half a yard, which is what the
    # head-clearance test asks.  This is the measurement that says whether it
    # is working, in the shape the issue that found it asked for.
    lumps, dots = 0, 0
    for plan in PLANS_BY_KEY.values():
        if not plan:
            continue
        _cells, w, h, _x0, _y0, solid, _floor, _over, _steps = plan
        seen = bytearray(w * h)
        for start in range(w * h):
            if not solid[start] or seen[start]:
                continue
            stack, size = [start], 0
            seen[start] = 1
            while stack:
                n = stack.pop()
                size += 1
                i, j = divmod(n, h)
                for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    a, b = i + di, j + dj
                    if 0 <= a < w and 0 <= b < h:
                        m = a * h + b
                        if solid[m] and not seen[m]:
                            seen[m] = 1
                            stack.append(m)
            lumps += size
            if size <= 4:
                dots += size
    share = dots / lumps if lumps else 0
    print(f'check: {lumps:,} cells of stone, {dots:,} of them in lumps of '
          f'four or fewer ({share:.1%}) — a wall is a line and not a scatter')
    assert share < 0.20, (
        'stone is %.0f%% specks, which is furniture drawn as wall' % (share * 100))


def check_rooms(doodads):
    """A model's own box has to land on the box the placement states for it.

    The transform from a WMO's space to the map was solved rather than read, so
    it is guarded by the measurement that solved it: every placement's model
    box, turned, against the box the `.adt` states for that placement.  They
    are the same object seen two ways.

    A WMO has **z up** where the map has y up, so the horizontal pair is the
    model's first two and not its first and third — read the wrong way the
    abbey's rooms land seventy yards out, and the first attempt did exactly
    that.  A median of nought is what right looks like.
    """
    if not _PLACED:
        return
    v = sorted(_PLACED)
    mid = v[len(v) // 2]
    rooms = sum(len(d[12]) for d in doodads if d[12])
    print(f'check: {len(v)} buildings placed, model box lands a median '
          f'{mid:.2f} yd from the record\'s, worst {v[-1]:.1f}  '
          f'({rooms:,} rooms)')
    assert mid < 1.0, (
        f'a model box lands a median {mid:.1f} yards from the box its own '
        f'placement states — the WMO transform is wrong')


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
    tx, ty = START
    tz = 83.5312
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
    # The forest, not a disc inside it.  One file says where that is and every
    # stage reads it: see `slice.json` and `pipeline/slice.py`.
    acore = os.path.expanduser(sys.argv[3] if len(sys.argv) > 3
                               else '~/src/azerothcore-wotlk')
    m = bake(c, BOUNDS, out, acore)
    check(c, m, out)
