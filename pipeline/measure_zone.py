#!/usr/bin/env python3
"""How big Elwynn Forest is, off the client's own area map.

The zone bounds are four numbers that `synth_terrain.py`, `spawn_npcs.py` and
`bake_terrain.py` all need, and none of them should be guessed at.  Every map
chunk the client labels area 12 is Elwynn Forest; the zone's sub-areas —
Goldshire, Northshire, the mines — are separate ids and are enclaves inside it,
so the bounding box of area 12 is the bounding box of the forest.

AzerothCore cannot answer this: it ships `worldmaparea_dbc` and `areatable_dbc`
as empty schemas, and `creature.zoneId` is 0 for thirty thousand of its rows.
So the measurement comes from a client, once, and what is written down is four
numbers — a public fact about a geography, not anything extracted.

  python3 pipeline/measure_zone.py [client dir]
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bake_terrain import Client, read_tile, TILE, ORIGIN, CHUNK

client = Client(os.path.expanduser(
    sys.argv[1] if len(sys.argv) > 1 else '~/workspace/warmane'))
ELWYNN = 12
lo_x = lo_y = 1e9
hi_x = hi_y = -1e9
n = 0
seen = {}
# Elwynn sits near map tiles 30-33 x 47-51; sweep wider so the edge is found
# rather than assumed.
for tx in range(44, 55):
    for ty in range(26, 39):
        got = read_tile(client, tx, ty)
        if not got:
            continue
        cells = got[0]
        for (ix, iy), (ccx, ccy, ccz, area, holes, hv) in cells.items():
            seen[area] = seen.get(area, 0) + 1
            if area != ELWYNN:
                continue
            n += 1
            lo_x = min(lo_x, ccx); hi_x = max(hi_x, ccx)
            lo_y = min(lo_y, ccy); hi_y = max(hi_y, ccy)
print(f'area {ELWYNN} chunks: {n}')
print(f'x {lo_x:.0f} .. {hi_x:.0f}   ({hi_x - lo_x:.0f} yards)')
print(f'y {lo_y:.0f} .. {hi_y:.0f}   ({hi_y - lo_y:.0f} yards)')
print(f'centre ({(lo_x + hi_x) / 2:.1f}, {(lo_y + hi_y) / 2:.1f})  '
      f'half-diagonal {(((hi_x - lo_x) ** 2 + (hi_y - lo_y) ** 2) ** 0.5) / 2:.0f}')
top = sorted(seen.items(), key=lambda kv: -kv[1])[:8]
print('commonest areas in the sweep:', top)
