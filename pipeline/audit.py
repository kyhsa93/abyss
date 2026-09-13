#!/usr/bin/env python3
"""What the sources say, against what this repository read.

  python3 pipeline/audit.py [client] [azerothcore]

Both sources are complete and both are here, and the world still comes out
different every round.  The reason is not that a file is missing; it is that
**every classifier in this pipeline ends in a default, and a default is right
often enough to be invisible and wrong often enough to matter.**

`classify_ground` falls through to `grass`.  That is the correct answer for
`ElwynnGrassBase`, which is 3,540 of the 8,368 layers it fires on — and the
wrong one for `BurningSteppsAsh01`, `BurningSteppsCharcoal01`,
`WestFallStrawBase` and the lava, which were drawn as a green lawn.
`classify_wmo` falls through to `house`, which is right for a cottage and drew
Stormwind's keep as one, twelve times.  Neither of them said a word.

So this script is the census nobody was taking.  It walks the whole slice,
asks each classifier what it would answer, and separates the records that
matched a rule from the records that took a default.  A default that has been
*declared* — a name listed in the pipeline as one the fallback handles
correctly — passes.  Anything else is a finding and the exit status says so,
which turns "nobody looked at that field" from a thing you notice in a
screenshot into a thing that fails a gate.

It also counts, for each table the pipeline reads, how many of that table's
columns it names.  That number is not supposed to be 100%: most of
`item_template` is irrelevant here.  It is there so that a column which *is*
relevant and is not read — `FactionTemplate.Flags` was one, and it is the only
thing that makes some creatures hostile — is visible as a number rather than as
a creature standing still.
"""
import collections
import os
import re
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bake_terrain as B  # noqa: E402
from spawn_npcs import columns  # noqa: E402

# The forest, the same four numbers every other step uses.
from slice import BOUNDS  # noqa: E402,F401  (see slice.json)


def tiles_over(bounds):
    corners = {B.tile_of(x, y) for x in bounds[:2] for y in bounds[2:]}
    tx = [t[0] for t in corners]
    ty = [t[1] for t in corners]
    return range(min(tx), max(tx) + 1), range(min(ty), max(ty) + 1)


def inside(x, y):
    return BOUNDS[0] <= x <= BOUNDS[1] and BOUNDS[2] <= y <= BOUNDS[3]


def walk(client):
    """Every placement and every ground layer in the slice, by name."""
    doodads = collections.Counter()
    wmos = collections.Counter()
    indoors = collections.Counter()
    ground = collections.Counter()
    xs, ys = tiles_over(BOUNDS)
    for tx in xs:
        for ty in ys:
            data, _src = client.read(
                'World\\Maps\\Azeroth\\Azeroth_%d_%d.adt' % (ty, tx))
            if not data:
                continue
            blob, mmid, wnames, tnames = b'', [], [], []
            for magic, off, size in B.chunks(data):
                if magic == 'MMDX':
                    blob = data[off:off + size]
                elif magic == 'MMID':
                    mmid = list(struct.unpack_from('<%dI' % (size // 4), data, off))
                elif magic == 'MWMO':
                    wnames = [n.decode('ascii', 'replace')
                              for n in data[off:off + size].split(b'\0') if n]
                elif magic == 'MTEX':
                    tnames = [n.decode('ascii', 'replace')
                              for n in data[off:off + size].split(b'\0') if n]
                elif magic == 'MDDF':
                    for i in range(size // 36):
                        nid, _uid, px, _py, pz = struct.unpack_from(
                            '<IIfff', data, off + i * 36)
                        if not inside(B.ORIGIN - pz, B.ORIGIN - px):
                            continue
                        o = mmid[nid] if nid < len(mmid) else 0
                        end = blob.find(b'\0', o)
                        doodads[blob[o:end].decode('ascii', 'replace')] += 1
                elif magic == 'MODF':
                    for i in range(size // 64):
                        nid, _uid, px, _py, pz = struct.unpack_from(
                            '<IIfff', data, off + i * 64)
                        if not inside(B.ORIGIN - pz, B.ORIGIN - px):
                            continue
                        name = wnames[nid] if nid < len(wnames) else ''
                        wmos[name] += 1
                        # And what stands inside it.  A building carries its
                        # own doodads and they go through the same classifier,
                        # so they belong in the same audit — 150 in the abbey
                        # alone, and unaudited they are exactly the blind spot
                        # this script exists to close.
                        if B.classify_wmo(name):
                            dset, = struct.unpack_from(
                                '<H', data, off + i * 64 + 58)
                            for f in B.wmo_furniture(client, name, dset):
                                indoors[f[6]] += 1
                elif magic == 'MCNK':
                    for m, o, n in B.subchunks(data, off, size):
                        if m != 'MCLY':
                            continue
                        for i in range(n // 16):
                            tid, = struct.unpack_from('<I', data, o + i * 16)
                            ground[tnames[tid] if tid < len(tnames) else ''] += 1
    return doodads, wmos, indoors, ground


def split(names, rules, declared):
    """Matched a rule, took a declared default, or took an undeclared one."""
    hit, ok, bad = collections.Counter(), collections.Counter(), collections.Counter()
    for name, n in names.items():
        up = name.upper()
        if any(needle in up for needle, _kind in rules):
            hit[name] += n
        elif any(needle in up for needle in declared):
            ok[name] += n
        else:
            bad[name] += n
    return hit, ok, bad


def report(title, hit, ok, bad, default, silent=True):
    """One classifier's census.  Returns how many records it fails on.

    `silent=False` is the doodads, whose default is to skip and say how many —
    an outcome the bake already prints, so those are a gap and not a lie.  The
    gate is only about defaults that pass themselves off as answers.
    """
    tot = sum(hit.values()) + sum(ok.values()) + sum(bad.values())
    print(f'\n{title}: {tot:,} placements')
    print(f'  {sum(hit.values()):>7,} matched a rule')
    if ok:
        print(f'  {sum(ok.values()):>7,} took the `{default}` default, declared')
    n = sum(bad.values())
    if not silent:
        print(f'  {n:>7,} took the `{default}` default, which the bake reports')
    elif n:
        print(f'  {n:>7,} took it undeclared '
              f'<-- drawn as something they are not')
    else:
        print('        0 took it undeclared')
    for name, n in bad.most_common(int(os.environ.get("AUDIT_TOP", "16"))):
        print(f'      {n:>5}  {name.split(chr(92))[-1]}')
    return n if silent else 0


def fields(acore):
    """How much of each table the pipeline names."""
    base = os.path.join(acore, 'data/sql/base/db_world')
    here = os.path.dirname(os.path.abspath(__file__))
    src = ''
    for name in ('spawn_npcs.py', 'spells.py'):
        src += open(os.path.join(here, name), encoding='utf-8').read()
    print('\ncolumns named, per table:')
    for t in ('creature_template', 'factiontemplate_dbc',
              'creature_classlevelstats', 'trainer_spell',
              'playercreateinfo_action', 'npc_vendor', 'item_template'):
        p = os.path.join(base, t + '.sql')
        if not os.path.exists(p):
            continue
        col = columns(p)
        used = {c for c in col if re.search(r"\['%s'\]" % re.escape(c), src)}
        print('  %-28s %3d columns, %2d named (%2.0f%%)'
              % (t, len(col), len(used), 100 * len(used) / max(1, len(col))))


def main(client_root, acore):
    client = B.Client(client_root)
    doodads, wmos, indoors, ground = walk(client)
    bad = 0
    hit, ok, miss = split(doodads, B.KINDS, B.DOODAD_DEFAULT_OK)
    bad += report('doodad models (MDDF)', hit, ok, miss, 'skip', silent=False)
    hit, ok, miss = split(wmos, B.WMO_KINDS, B.WMO_DEFAULT_OK)
    bad += report('buildings (MODF)', hit, ok, miss, 'house')
    hit, ok, miss = split(indoors, B.KINDS, B.DOODAD_DEFAULT_OK)
    bad += report('what stands inside them (MODD)', hit, ok, miss, 'skip',
                  silent=False)
    hit, ok, miss = split(ground, B.GROUND_KINDS, B.GROUND_DEFAULT_OK)
    bad += report('ground textures (MCLY)', hit, ok, miss, 'grass')
    fields(acore)
    print()
    if bad:
        sys.exit(f'{bad:,} placements in the slice are classified by a default '
                 f'nobody has looked at.\nEither give them a rule or list the '
                 f'name in the pipeline\'s `*_DEFAULT_OK` as one the default '
                 f'gets right.')
    print('every placement in the slice is either matched or declared')


if __name__ == '__main__':
    main(os.path.expanduser(sys.argv[1] if len(sys.argv) > 1
                            else '~/workspace/warmane'),
         os.path.expanduser(sys.argv[2] if len(sys.argv) > 2
                            else '~/src/azerothcore-wotlk'))
