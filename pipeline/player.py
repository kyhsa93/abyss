#!/usr/bin/env python3
"""Who the player is, level by level, out of the server's own tables.

  python3 pipeline/player.py [azerothcore] [out]

Until this existed the player was twenty rows of `[health, min damage, max
damage, swing, armour]` that went from a table to a table.  **There were no
stats.**  No strength, no agility, no stamina — so nothing was derived from
anything, wearing something could not change you, and the hit table had nowhere
to stand because critical chance comes out of agility.

Everything here is AzerothCore's.  `player_class_stats` is the class's figures
at each level, `player_race_stats` the race's adjustment, `player_xp_for_level`
the ladder, `playercreateinfo` where a new one stands, `playercreateinfo_item`
what he is holding, and the three `gt*` interpolation tables the curve that
turns agility into a critical hit.  The arithmetic between them is in
`StatSystem.cpp` and `Player.cpp`, and `src/stats.ts` carries it with the line
numbers.

Only integers and our own words leave, as everywhere else: an item comes out as
its class, its damage and its armour, never its name.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from spawn_npcs import columns, rows, split, split_head, goods_of  # noqa: E402
from slice import LEVELS, MAP  # noqa: E402

# The one race and the one class this game has, by the ids the tables use.
HUMAN, WARRIOR = 1, 1

# `gtChanceToMeleeCrit` is one row a (class, level) pair, laid out as
# `(class - 1) * GT_MAX_LEVEL + level - 1` — Player.cpp:5264.
GT_MAX_LEVEL = 100


def table(base, name, key=None):
    path = os.path.join(base, name + '.sql')
    col = columns(path)
    for line in rows(path):
        yield col, split(line)


def gt(base, name):
    """One of the interpolation tables, as a list indexed by its own id."""
    out = {}
    for col, f in table(base, name):
        out[int(f[col['ID']])] = float(f[col['Data']])
    return [out.get(i, 0.0) for i in range(max(out) + 1)] if out else []


def outfit(client_root):
    """What a new human warrior is holding, out of `CharStartOutfit.dbc`.

    The key packs race, class and gender into one field, which is why it has to
    be taken apart rather than compared: the row for a male human warrior is
    race 1, class 1, gender 0 in the low three bytes of field 1.
    """
    if not client_root or not os.path.isdir(client_root):
        return set()
    import struct
    import bake_terrain as terrain
    data = terrain.read_dbc(terrain.Client(client_root), 'CharStartOutfit')
    if not data:
        return set()
    _m, n, fields, rsize, _sb = struct.unpack_from('<4sIIII', data, 0)
    for i in range(n):
        v = struct.unpack_from('<%di' % fields, data, 20 + i * rsize)
        race, cls, gender = v[1] & 0xff, (v[1] >> 8) & 0xff, (v[1] >> 16) & 0xff
        if race == HUMAN and cls == WARRIOR and gender == 0:
            return {x for x in v[2:2 + 24] if x > 0}
    return set()


def main(acore, client, out):
    base = os.path.join(acore, 'data/sql/base/db_world')
    lo, hi = LEVELS

    # Where a new one stands and what level he is.  The level is not in this
    # table because it is one everywhere — a new character is level one, and
    # the game this reproduces has no other answer.  What *was* here instead
    # was `HERO_LEVEL = 5`, chosen because the forest's wolves are five.
    start = None
    for col, f in table(base, 'playercreateinfo'):
        if int(f[col['race']]) == HUMAN and int(f[col['class']]) == WARRIOR:
            start = [float(f[col['position_x']]), float(f[col['position_y']]),
                     float(f[col['position_z']]), float(f[col['orientation']]),
                     int(f[col['map']]), int(f[col['zone']])]
    if not start or start[4] != MAP:
        sys.exit('playercreateinfo has no human warrior on this map')

    race = {}
    for col, f in table(base, 'player_race_stats'):
        if int(f[col['Race']]) == HUMAN:
            race = {k: int(f[col[k]]) for k in
                    ('Strength', 'Agility', 'Stamina', 'Intellect', 'Spirit')}

    stats = {}
    for col, f in table(base, 'player_class_stats'):
        if int(f[col['Class']]) != WARRIOR:
            continue
        lv = int(f[col['Level']])
        if not lo <= lv <= hi:
            continue
        stats[lv] = [
            int(f[col['Strength']]) + race.get('Strength', 0),
            int(f[col['Agility']]) + race.get('Agility', 0),
            int(f[col['Stamina']]) + race.get('Stamina', 0),
            int(f[col['Intellect']]) + race.get('Intellect', 0),
            int(f[col['Spirit']]) + race.get('Spirit', 0),
            int(f[col['BaseHP']]),
        ]

    ladder = {}
    for col, f in table(base, 'player_xp_for_level'):
        ladder[int(f[col['Level']])] = int(f[col['Experience']])

    crit_base = gt(base, 'gtchancetomeleecritbase_dbc')
    crit_ratio = gt(base, 'gtchancetomeleecrit_dbc')
    ratio = {lv: crit_ratio[(WARRIOR - 1) * GT_MAX_LEVEL + lv - 1]
             for lv in stats if (WARRIOR - 1) * GT_MAX_LEVEL + lv - 1 < len(crit_ratio)}

    # What he is handed on the way out of the door.  The class is our word for
    # it, the numbers are the item's own: a weapon's damage and swing, a piece
    # of armour's armour value.
    #
    # **Not out of `playercreateinfo_item`** — that table has one row in this
    # dump and it is not a human warrior's.  A starting outfit is the client's
    # (`CharStartOutfit.dbc`), and what it gives him is a worn greatsword, a
    # shirt, trousers, boots and a hearthstone.  The sword matters: it was a
    # hand-transcribed `(1, 3, 1900)` in `spawn_npcs.py` with a comment saying
    # so, and it was the *wrong* sword — 1 to 3 on a 1.9 second swing is the
    # shortsword a rogue starts with, where a warrior starts with 3 to 5 on
    # 2.9.  A number typed in by hand is a number nobody checks.
    iclass, idamage = {}, {}
    ipath = os.path.join(base, 'item_template.sql')
    icol = columns(ipath)
    wanted = outfit(client)
    for line in rows(ipath):
        f = split(line)
        try:
            e = int(f[icol['entry']])
        except (ValueError, KeyError, IndexError):
            continue
        if e not in wanted:
            continue
        iclass[e] = goods_of(int(f[icol['class']]), int(f[icol['subclass']]))
        idamage[e] = [
            round(float(f[icol['dmg_min1']]), 1),
            round(float(f[icol['dmg_max1']]), 1),
            int(f[icol['delay']]),
            int(f[icol['armor']]),
            int(f[icol['InventoryType']]),
        ]
    kit = [[iclass[e]] + idamage[e] for e in sorted(wanted) if e in idamage]
    if not kit:
        print('  no starting outfit: that is the client\'s table, and there '
              'is no client here', file=sys.stderr)

    # Where you wake up.  `game_graveyard` is 685 rows and `graveyard_zone`
    # says which zone sends you to which — Elwynn has four, one of them beside
    # the abbey and one in Goldshire.
    #
    # This is the whole cost of dying at these levels, and that is not a
    # simplification: `Player::ResurrectPlayer` (Player.cpp:4605) says in its
    # own comment that **characters from level 1 to 10 are not affected by
    # resurrection sickness**.  Below eleven the game charges you the walk
    # back and nothing else, so charging anything else here would be inventing
    # a rule.
    yards = {}
    for col, f in table(base, 'game_graveyard'):
        if int(f[col['Map']]) == MAP:
            yards[int(f[col['ID']])] = [round(float(f[col['x']]), 1),
                                        round(float(f[col['y']]), 1),
                                        round(float(f[col['z']]), 1)]
    by_zone = {}
    for col, f in table(base, 'graveyard_zone'):
        gid, zone = int(f[col['ID']]), int(f[col['GhostZone']])
        if gid in yards:
            by_zone.setdefault(str(zone), []).append(yards[gid])

    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, 'player.json')
    doc = {
        'start': [round(start[0], 3), round(start[1], 3), round(start[2], 3)],
        'levels': [lo, hi],
        # `[strength, agility, stamina, intellect, spirit, base health]`
        'stats': {str(k): v for k, v in sorted(stats.items())},
        'xp': {str(k): v for k, v in sorted(ladder.items()) if lo <= k <= hi},
        # Agility to critical hit: a base per class and a ratio per level.
        'critBase': crit_base[WARRIOR - 1] if crit_base else 0.0,
        'critRatio': {str(k): v for k, v in sorted(ratio.items())},
        # What a new one is holding: `[word, min, max, swing ms, armour, slot]`
        'kit': kit,
        # Which graveyards each zone sends you to, `[x, y, z]` each.
        'graveyards': by_zone,
    }
    with open(path, 'w') as f:
        json.dump(doc, f)

    check(doc)
    print(f'levels {lo}-{hi} -> {path}')
    for lv in sorted(stats):
        s = stats[lv]
        print(f'  {lv:>2}  str {s[0]:>3} agi {s[1]:>3} sta {s[2]:>3}  '
              f'base hp {s[5]:>4}  xp to next {ladder.get(lv, 0):>6}  '
              f'crit/agi {ratio.get(lv, 0):.6f}')
    print('  kit: ' + ', '.join(f'{k[0]} ({k[1]}-{k[2]}, {k[3]}ms, {k[4]} armour)'
                                for k in kit))
    print(f'  {len(yards)} graveyards on this map, '
          f'{len(by_zone)} zones know where to send you')


def check(doc):
    """Two facts about a level one human warrior, from outside these tables.

    He has sixty health and he has more strength than agility.  Sixty is the
    number every guide to this game opens with, and it is not in any column —
    it is `BaseHP` plus the stamina curve, so it only comes out right if both
    were read and the curve was applied.  Twenty base plus twenty-two stamina
    gives twenty plus twenty plus twenty, which is sixty.
    """
    one = doc['stats'].get('1')
    if not one:
        return
    stamina = one[2]
    health = one[5] + min(stamina, 20) + max(0, stamina - 20) * 10
    print(f'check: a new human warrior has {health} health, '
          f'{one[0]} strength and {one[1]} agility')
    assert health == 60, f'a level one warrior should have 60 health, not {health}'
    assert one[0] > one[1], 'a warrior is stronger than he is quick'


if __name__ == '__main__':
    main(os.path.expanduser(sys.argv[1] if len(sys.argv) > 1
                            else '~/src/azerothcore-wotlk'),
         os.path.expanduser(sys.argv[2] if len(sys.argv) > 2
                            else '~/workspace/warmane'),
         sys.argv[3] if len(sys.argv) > 3 else 'public/world')
