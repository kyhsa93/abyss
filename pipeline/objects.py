#!/usr/bin/env python3
"""What stands in the world that is not a person: veins, herbs, chests, fires.

  python3 pipeline/objects.py [azerothcore] [client] [out]

`gameobject` is 96,624 rows and the pipeline used exactly one of them — as a
height sample, in `synth_terrain.py`.  Not one was ever placed.  3,361 of them
stand in this slice and 308 are the thing the starting zone is *for*: 130
copper veins, 83 silverleaf, 50 earthroot, 45 peacebloom.

Three sources and the same bargain as everywhere else.  **AzerothCore** says
where each one stands and how long it takes to come back; **the client's
`Lock.dbc`** says whether it can be opened at all and what that costs;
`gameobject_loot_template` says what comes out.  Names are read inside this
script to decide what a thing *is* and never leave it — `src/talk.ts` has our
words, the same deal `bake_terrain.py` makes with a model path.

The holiday filter is the one the creature spawns already use:
`game_event_gameobject` with a positive id is a decoration, and without it the
forest gets 62 toasting goblets, 56 festive mugs and 54 Brewfest lanterns while
Elwynn's copper is a rounding error in its own zone.

**The pool is not a filter here, it is the mechanic.**  `pool_creature` is
dropped in `spawn_npcs.py` because a pooled creature is one of several that
share a slot and there is no telling which; a pooled *object* is a herb node,
and the pool is how a herb node works.  Elwynn has 36 copper-vein spots with
nine up at a time, 34 silverleaf spots with nine, 30 earthroot with eight.
Dropped, there is nothing to gather in the starting zone at all — which is what
the first run of this script produced.  So the members ship with their pool and
`pool_template.max_limit` ships with them, and the scene stands up that many.

A pool inside another pool — `pool_pool`, 18 of the slice's 51 — is treated as
its own, which can leave a few more things standing than the server would.  The
node pools are not nested and that is where it would matter.
"""
import json
import os
import re
import struct
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from spawn_npcs import columns, rows, split, split_head, goods_of, \
    BOUNDS, MAP  # noqa: E402
import bake_terrain as terrain  # noqa: E402

# `gameobject_template.type`, which is the client's own enum.  Only the ones
# this world has something to do with are named; the rest are counted.
T_DOOR, T_BUTTON, T_QUESTGIVER, T_CHEST = 0, 1, 2, 3
T_GENERIC, T_TRAP, T_CHAIR, T_SPELLFOCUS = 5, 6, 7, 8
T_TEXT, T_GOOBER, T_MAILBOX = 9, 10, 19

# What a lock asks for.  `Lock.dbc` gives eight (type, index, skill) slots a
# row; type 2 is "a trade skill opens this" and the index says which trade.
LOCK_BY_SKILL = 2

# Which trade each index is was not looked up in a table of names — it was
# read off what actually uses it.  In this slice index 3 is Copper Vein,
# Truesilver Deposit, Dark Iron Deposit and Rich Thorium Vein, and index 2 is
# Silverleaf, Peacebloom, Earthroot and Dreamfoil.  One is ore and the other is
# a herb and nothing else is needed to tell them apart.  `check_trades` holds
# it to that.
ORE, HERB = 3, 2
TRADES = {ORE: 'mining', HERB: 'herbs'}

# Whole types this world has nothing to do with, declared rather than silently
# swallowed.  A chair you cannot sit in, a sign you cannot read, a door that
# opens on nothing, a trap belonging to a holiday, a button with no console
# behind it: each of them is a feature this repository does not have, and
# naming the type says so once instead of chasing the words one at a time.
TYPES_OK = {T_DOOR, T_BUTTON, T_QUESTGIVER, T_TRAP, T_CHAIR, T_TEXT, T_GOOBER}

# And the models, inside the types it does have something to do with.  A
# banner, a bell, a signpost pointing at a city, an invisible spell anchor:
# all of them things there is no picture for here and no use for either.
DEFAULT_OK = [
    'BANNER', 'BELL', 'SPELLOBJECT', 'INVISIBLE', 'PYROTECHNIC',
    'CAULDRON', 'FIREWORK', 'SNOW', 'RIBBON', 'BALLOON', 'EGG',
    'GUILDVAULT', 'SOUNDOBJECT', 'MEETINGSTONE', 'NIGHTELF01', 'EYEOFAZORA',
    'RUNE', 'MANARIFT', 'INSCRIPTION', 'MAGEPORTAL',
    # A row with no model at all, which is the world database's way of saying
    # the thing has no body: two of them, both spell anchors.
    '',
]


def display_models(client):
    """Which model each `displayId` draws, out of `GameObjectDisplayInfo.dbc`.

    This is the whole reason a game object can go through the same classifier
    the terrain's doodads go through: the world database says *what* stands
    somewhere by an id, and the client says what that id looks like.  A first
    attempt classified on the row's name and needed a word list that grew every
    time the slice did — with the model there is one classifier in this
    repository and it is `bake_terrain.classify`.

    The path is Blizzard's and does not leave this script, the same bargain as
    everywhere else.
    """
    data = terrain.read_dbc(client, 'GameObjectDisplayInfo')
    if not data:
        sys.exit('GameObjectDisplayInfo.dbc is not in this client')
    _m, n, fields, rsize, _sb = struct.unpack_from('<4sIIII', data, 0)
    strings = 20 + n * rsize
    out = {}
    for i in range(n):
        v = struct.unpack_from('<%di' % fields, data, 20 + i * rsize)
        end = data.index(b'\0', strings + v[1])
        out[v[0]] = data[strings + v[1]:end].decode('ascii', 'replace')
    return out


def classify(path, gtype, trade):
    """One of our words for an object, or `None` to leave it out.

    The trade is asked first and it is the honest order: a node the *lock*
    calls a herb is a herb whatever its model is called.  Silverleaf's model is
    `Bush_Silverleaf01`, which the terrain's classifier quite correctly calls a
    bush — and a bush is scenery, where this is the thing the starting zone is
    for.
    """
    if trade == HERB:
        return 'herb'
    if trade == ORE:
        return 'vein'
    got = terrain.classify(path) if path else None
    if got:
        return got
    return 'crate' if gtype == T_CHEST else None


def lock_table(client):
    """`Lock.dbc`, as {id: [(type, index, required skill)]}.

    Only integers.  The row carries a name and that is prose like everything
    else; what is read is which of the eight slots is filled, with what, and
    how much of it.  Checked rather than trusted: the lock a copper vein uses
    has to come back asking for a trade skill, because a vein you can open
    bare-handed is what a wrong field offset looks like.
    """
    data = terrain.read_dbc(client, 'Lock')
    if not data:
        sys.exit('Lock.dbc is not in this client')
    _m, n, fields, rsize, _sb = struct.unpack_from('<4sIIII', data, 0)
    out = {}
    for i in range(n):
        v = struct.unpack_from('<%di' % fields, data, 20 + i * rsize)
        out[v[0]] = [(v[1 + k], v[9 + k], v[17 + k])
                     for k in range(8) if v[1 + k]]
    return out


def loot_tables(base, table):
    """What comes out of one of these, by what sort of thing it is.

    The same path `creature_loot_template` takes in `spawn_npcs.py` and the
    same words at the end of it: an item's class and subclass, not its name.
    """
    iclass, sells = {}, {}
    for line in rows(os.path.join(base, 'item_template.sql')):
        f = split_head(line, 12)
        try:
            iclass[int(f[0])] = (int(f[1]), int(f[2]))
            sells[int(f[0])] = int(f[11])
        except (ValueError, IndexError):
            continue
    by_loot = {}
    path = os.path.join(base, table)
    lc = columns(path)
    for line in rows(path):
        f = split(line)
        try:
            lid, item = int(f[lc['Entry']]), int(f[lc['Item']])
            chance = abs(float(f[lc['Chance']]))
            lo, hi = int(f[lc['MinCount']]), int(f[lc['MaxCount']])
        except (ValueError, IndexError, KeyError):
            continue
        if item not in iclass or chance <= 0:
            continue
        by_loot.setdefault(lid, []).append(
            (goods_of(*iclass[item]), min(100.0, chance), lo, hi,
             max(0, sells.get(item, 0))))
    return by_loot


def check_trades(nodes):
    """The two trade indices have to be two different things.

    Which index is ore and which is herb was read off what uses it rather than
    out of a table of names, so this is the reading being checked: the nodes
    under one index and the nodes under the other have to be disjoint sets of
    models.  They share one and the whole distinction is imaginary.
    """
    by = {ORE: set(), HERB: set()}
    for entry, trade in nodes:
        if trade in by:
            by[trade].add(entry)
    both = by[ORE] & by[HERB]
    print(f'check: {len(by[ORE])} kinds of ore and {len(by[HERB])} of herb, '
          f'{len(both)} in both')
    assert not both, 'a model is both ore and herb, so the lock index is not ' \
                     'the trade'


def main(acore, client_root, out):
    base = os.path.join(acore, 'data/sql/base/db_world')
    for name in ('gameobject.sql', 'gameobject_template.sql',
                 'game_event_gameobject.sql', 'pool_gameobject.sql',
                 'gameobject_loot_template.sql'):
        if not os.path.exists(os.path.join(base, name)):
            sys.exit(f'missing {os.path.join(base, name)}')

    client = terrain.Client(client_root)
    locks = lock_table(client)
    models = display_models(client)
    carried = loot_tables(base, 'gameobject_loot_template.sql')

    tpath = os.path.join(base, 'gameobject_template.sql')
    tc = columns(tpath)
    tmpl = {}
    for line in rows(tpath):
        f = split(line)
        try:
            tmpl[int(f[tc['entry']])] = (
                int(f[tc['displayId']]), int(f[tc['type']]),
                int(f[tc['Data0']]), int(f[tc['Data1']]))
        except (ValueError, IndexError, KeyError):
            continue

    num = re.compile(r'-?\d+')
    seasonal = set()
    for line in rows(os.path.join(base, 'game_event_gameobject.sql')):
        event, guid = num.findall(line)[:2]
        if int(event) > 0:
            seasonal.add(int(guid))
    # Which slot each object shares, and how many of a slot's members stand at
    # once.  This is how a herb node works and dropping it leaves the starting
    # zone with nothing to gather.
    ptab = os.path.join(base, 'pool_template.sql')
    pc = columns(ptab)
    limit = {}
    for line in rows(ptab):
        f = split(line)
        limit[int(f[pc['entry']])] = int(f[pc['max_limit']])
    gtab = os.path.join(base, 'pool_gameobject.sql')
    pgc = columns(gtab)
    pool_of = {}
    for line in rows(gtab):
        f = split(line)
        pool_of[int(f[pgc['guid']])] = int(f[pgc['pool_entry']])

    gpath = os.path.join(base, 'gameobject.sql')
    gc = columns(gpath)
    placed, dropped, no_word = [], Counter(), Counter()
    nodes = set()
    for line in rows(gpath):
        f = split(line)
        try:
            if int(f[gc['map']]) != MAP:
                continue
            guid, entry = int(f[gc['guid']]), int(f[gc['id']])
            x, y = float(f[gc['position_x']]), float(f[gc['position_y']])
            face = float(f[gc['orientation']])
            back = int(f[gc['spawntimesecs']])
        except (ValueError, IndexError, KeyError):
            continue
        if not (BOUNDS[0] <= x <= BOUNDS[1] and BOUNDS[2] <= y <= BOUNDS[3]):
            continue
        if guid in seasonal:
            dropped['seasonal'] += 1
            continue
        got = tmpl.get(entry)
        if not got:
            dropped['no template'] += 1
            continue
        display, gtype, lockid, lootid = got
        model = models.get(display, '')
        # What it takes to open it.  A lock with nothing in it opens to
        # anybody; one asking for a trade skill says which and how much.
        trade, level = 0, 0
        for kind, index, skill in locks.get(lockid, ()):
            if kind == LOCK_BY_SKILL and index in TRADES:
                trade, level = index, skill
                break
        kind = classify(model, gtype, trade)
        if not kind:
            dropped['no picture'] += 1
            no_word[(model.split('\\')[-1], gtype)] += 1
            continue
        if trade:
            nodes.add((entry, trade))
        placed.append((x, y, kind, face, entry, trade, level, back,
                       lootid if kind in ('herb', 'vein', 'crate') else 0,
                       pool_of.get(guid, 0)))

    # One loot table a row, so the same vein does not ship its contents 130
    # times.
    hauls, haul_at = [], {}
    out_rows = []
    pools = {}
    for x, y, kind, face, entry, trade, level, back, lootid, pool in placed:
        if pool:
            pools[str(pool)] = limit.get(pool, 1)
        items = [[w, round(ch, 1), lo, hi, sell]
                 for w, ch, lo, hi, sell in carried.get(lootid, [])[:6]]
        key = (kind, tuple(map(tuple, items)))
        if key not in haul_at:
            haul_at[key] = len(hauls)
            hauls.append(items)
        out_rows.append([round(x, 2), round(y, 2), kind, round(face, 3),
                         TRADES.get(trade, ''), level, back,
                         haul_at[key], entry, pool])

    check_trades(nodes)
    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, 'objects.json')
    with open(path, 'w') as f:
        json.dump({'objects': out_rows, 'hauls': hauls,
                   'pools': pools}, f)

    tally = Counter(r[2] for r in out_rows)
    print(f'{len(out_rows):,} objects -> {path}')
    print('  ' + '  '.join(f'{k} {v}' for k, v in tally.most_common()))
    print('  dropped: ' + '  '.join(f'{k} {v}' for k, v in dropped.most_common()))
    gather = [r for r in out_rows if r[4]]
    print(f'  {len(gather):,} can be gathered: '
          + '  '.join(f'{k} {v}' for k, v in
                      Counter(r[4] for r in gather).most_common()))
    print(f'  {len(hauls)} distinct loot tables, {len(pools)} slots sharing '
          f'{sum(1 for r in out_rows if r[9]):,} of them, '
          f'{sum(pools.values())} standing at a time')
    # The words nobody has a picture for, loudest first, which is the list to
    # work down when there is art for another one of them.
    bad = [(n, t, c) for (n, t), c in no_word.most_common()
           if t not in TYPES_OK
           and not any(w and w in n.upper() for w in DEFAULT_OK)
           and n not in DEFAULT_OK]
    if bad:
        print(f'  {sum(c for _n, _t, c in bad)} skipped without a declared '
              f'word:')
        for n, t, c in bad[:14]:
            print(f'      {c:5d}  type {t:<3d} {n}')
        # The same gate `pipeline/audit.py` puts on the terrain's classifier,
        # for the same reason: a default that is right often enough to be
        # invisible is how this world kept coming out different.  Skipping is
        # fine; skipping something nobody has looked at is not.
        sys.exit(1)


if __name__ == '__main__':
    main(os.path.expanduser(sys.argv[1] if len(sys.argv) > 1
                            else '~/src/azerothcore-wotlk'),
         os.path.expanduser(sys.argv[2] if len(sys.argv) > 2
                            else '~/workspace/warmane'),
         sys.argv[3] if len(sys.argv) > 3 else 'public/data')
