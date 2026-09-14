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
from slice import LEVELS, MAP, CLASSES, CLASS_ID, RACES, RACE_ID  # noqa: E402
from classes import powers_of, POWER_WORD  # noqa: E402

# The race this game is played as, by the id the tables use.  The class is no
# longer a constant beside it: `slice.json` names six and every figure below
# is per class, because that is what `player_class_stats` is.
HUMAN = RACE_ID[RACES[0]]

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


def outfit(client_root, cls=1):
    """What a new human of this class is holding, out of `CharStartOutfit.dbc`.

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
        race, kind, gender = v[1] & 0xff, (v[1] >> 8) & 0xff, (v[1] >> 16) & 0xff
        if race == HUMAN and kind == cls and gender == 0:
            return {x for x in v[2:2 + 24] if x > 0}
    return set()


def main(acore, client, out):
    base = os.path.join(acore, 'data/sql/base/db_world')
    lo, hi = LEVELS

    # Where a new one stands and what level he is.  The level is not in this
    # table because it is one everywhere — a new character is level one, and
    # the game this reproduces has no other answer.  What *was* here instead
    # was `HERO_LEVEL = 5`, chosen because the forest's wolves are five.
    #
    # **One place, not six.**  Every human class in this game is created on the
    # same square of Northshire, and asserting that is cheaper than shipping
    # the same three numbers six times: a start that differs by class is a
    # fact this would rather fail on than quietly average.
    start, places = None, {}
    for col, f in table(base, 'playercreateinfo'):
        if int(f[col['race']]) != HUMAN:
            continue
        cls = int(f[col['class']])
        places[cls] = [float(f[col['position_x']]), float(f[col['position_y']]),
                       float(f[col['position_z']]), float(f[col['orientation']]),
                       int(f[col['map']]), int(f[col['zone']])]
    mine = {CLASS_ID[w] for w in CLASSES}
    missing = sorted(mine - set(places))
    if missing:
        sys.exit('playercreateinfo has no human for class %s' % missing)
    spots = {tuple(places[c][:3]) for c in mine}
    if len(spots) != 1:
        sys.exit('this slice\'s classes do not start together: %s' % spots)
    start = places[sorted(mine)[0]]
    if start[4] != MAP:
        sys.exit('playercreateinfo starts a human off this map')

    race = {}
    for col, f in table(base, 'player_race_stats'):
        if int(f[col['Race']]) == HUMAN:
            race = {k: int(f[col[k]]) for k in
                    ('Strength', 'Agility', 'Stamina', 'Intellect', 'Spirit')}

    # `{class id: {level: [str, agi, sta, int, spi, base hp, base mana]}}`.
    #
    # **`BaseMana` joins the row**, and it is the column that makes five of the
    # six classes possible: it was read past for as long as this game had one
    # class, because a warrior's is nought on every line of the table.
    stats = {}
    for col, f in table(base, 'player_class_stats'):
        cls = int(f[col['Class']])
        if cls not in mine:
            continue
        lv = int(f[col['Level']])
        if not lo <= lv <= hi:
            continue
        stats.setdefault(cls, {})[lv] = [
            int(f[col['Strength']]) + race.get('Strength', 0),
            int(f[col['Agility']]) + race.get('Agility', 0),
            int(f[col['Stamina']]) + race.get('Stamina', 0),
            int(f[col['Intellect']]) + race.get('Intellect', 0),
            int(f[col['Spirit']]) + race.get('Spirit', 0),
            int(f[col['BaseHP']]),
            int(f[col['BaseMana']]),
        ]
    for cls in sorted(mine):
        if len(stats.get(cls, {})) != hi - lo + 1:
            sys.exit('player_class_stats has %d of %d levels for class %d'
                     % (len(stats.get(cls, {})), hi - lo + 1, cls))

    ladder = {}
    for col, f in table(base, 'player_xp_for_level'):
        ladder[int(f[col['Level']])] = int(f[col['Experience']])

    crit_base = gt(base, 'gtchancetomeleecritbase_dbc')
    crit_ratio = gt(base, 'gtchancetomeleecrit_dbc')
    # And what a point of spirit is worth in mana a second —
    # `Player::OCTRegenMPPerSpirit`, Player.cpp:5400, which multiplies this
    # ratio by spirit and `Player::UpdateManaRegen` (StatSystem.cpp:950)
    # multiplies *that* by the square root of intellect.  One row per class and
    # level, the same shape as the critical hit table beside it.
    mp_ratio = gt(base, 'gtregenmpperspt_dbc')

    def per_class(cls):
        at = lambda tab: {                                   # noqa: E731
            str(lv): tab[(cls - 1) * GT_MAX_LEVEL + lv - 1]
            for lv in stats[cls]
            if (cls - 1) * GT_MAX_LEVEL + lv - 1 < len(tab)}
        return at(crit_ratio), at(mp_ratio)

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
    # One outfit a class, because a mage does not leave the door with a
    # greatsword.  The starting kit was the reason the sword's numbers were
    # right for the first time; six of them is the reason a priest's are.
    dressed = {c: outfit(client, c) for c in sorted(mine)}
    wanted = set().union(*dressed.values()) if dressed else set()
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
    # **With the entry on the front.**  Without it the outfit was five rows of
    # arithmetic and nothing else — a weapon's damage and swing with no item
    # behind them — so the character sheet said `입은 것 없음` while the same
    # sheet's attack line was quoting the greatsword's 2.9 second swing.  The
    # id is what lets the scene actually put the thing in his hands.
    kits = {c: [[e, iclass[e]] + idamage[e] for e in sorted(v) if e in idamage]
            for c, v in dressed.items()}
    if not any(kits.values()):
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

    # What the sky does, by zone and by season.  `game_weather` is 35 rows —
    # a chance of rain, of snow and of storm for each quarter of the year —
    # and Elwynn is one of them at fifteen to twenty per cent rain and never
    # any snow.  Small data, and it matters more here than it would elsewhere:
    # the art direction gave up terrain textures, so the ground has almost no
    # way to have an expression and weather is most of what is left.
    sky = {}
    for col, f in table(base, 'game_weather'):
        zone = int(f[col['zone']])
        sky[str(zone)] = [
            [int(f[col['%s_rain_chance' % s]]),
             int(f[col['%s_snow_chance' % s]]),
             int(f[col['%s_storm_chance' % s]])]
            for s in ('spring', 'summer', 'fall', 'winter')]

    # Which bar each class swings on — `ChrClasses.dbc`'s `DisplayPower`, the
    # one fact here that is the client's rather than AzerothCore's, because
    # `chrclasses_dbc.sql` in the dump is a schema with no rows.
    powers = powers_of(bake_client(client)) if client else {}

    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, 'player.json')
    per = {}
    for word in CLASSES:
        cls = CLASS_ID[word]
        ratio, spirit = per_class(cls)
        power = POWER_WORD.get(powers.get(cls, 0), 'mana')
        # Keyed on the class id, for the reason `spells.py` gives: the id is
        # the game's number and the word is ours.
        per[str(cls)] = {
            # `[strength, agility, stamina, intellect, spirit, base health,
            #   base mana]`
            'stats': {str(k): v for k, v in sorted(stats[cls].items())},
            # Agility to critical hit: a base per class and a ratio per level.
            'critBase': crit_base[cls - 1] if len(crit_base) >= cls else 0.0,
            'critRatio': ratio,
            # What a new one is holding:
            # `[entry, word, min, max, swing, armour, slot]`
            'kit': kits.get(cls, []),
            # Rage, mana or energy.
            'power': power,
            # And, for the ones that cast, what a point of spirit is worth a
            # second at each level.  Shipped only where it means something:
            # the table has a row for a warrior and the row is nought.
            **({'spirit': spirit} if power == 'mana' else {}),
        }
    doc = {
        'start': [round(start[0], 3), round(start[1], 3), round(start[2], 3)],
        'levels': [lo, hi],
        'xp': {str(k): v for k, v in sorted(ladder.items()) if lo <= k <= hi},
        # Which graveyards each zone sends you to, `[x, y, z]` each.
        'graveyards': by_zone,
        # `{zone: [[rain, snow, storm] per season]}` — `game_weather`.
        'weather': sky,
        # **Everything that differs by class, keyed on `slice.json`'s word.**
        # It was six flat keys here when there was one class, which reads as a
        # game whose stats are the game's rather than the character's.
        'classes': per,
    }
    with open(path, 'w') as f:
        json.dump(doc, f)

    check(doc)
    print(f'levels {lo}-{hi}, {len(per)} classes -> {path}')
    for word in CLASSES:
        mine_ = per[str(CLASS_ID[word])]
        one = mine_['stats'][str(lo)]
        top = mine_['stats'][str(hi)]
        health = one[5] + min(one[2], 20) + max(0, one[2] - 20) * 10
        mana = one[6] + min(one[3], 20) + max(0, one[3] - 20) * 15 \
            if mine_['power'] == 'mana' else 0
        print('  %-9s %-6s  %3d health and %3d %-6s at %d, %4d and %4d at %d'
              % (word, mine_['power'], health, mana,
                 mine_['power'], lo,
                 top[5] + min(top[2], 20) + max(0, top[2] - 20) * 10,
                 (top[6] + min(top[3], 20) + max(0, top[3] - 20) * 15)
                 if mine_['power'] == 'mana' else 0, hi))
        print('       kit: ' + (', '.join(
            f'{k[0]} ({k[2]}-{k[3]}, {k[4]}ms, {k[5]} armour)'
            for k in mine_['kit']) or 'nothing — no client here'))
    print(f'  {len(yards)} graveyards on this map, '
          f'{len(by_zone)} zones know where to send you')
    print(f'  {len(sky)} zones have weather of their own')


def bake_client(root):
    """The client, opened the way `spells.py` opens it.

    The locale patch has to come first or `DBFilesClient` is not found at all
    — the same chain, and the one place the two scripts agree about it.
    """
    import bake_terrain
    from spells import CHAIN
    bake_terrain.CHAIN = CHAIN
    return bake_terrain.Client(root)


def check(doc):
    """Facts about a new human, from outside these tables.

    A warrior has sixty health and a mage has a hundred and sixty-five mana.
    Neither is in any column: sixty is `BaseHP` plus the stamina curve and 165
    is `BaseMana` plus the intellect curve, so they only come out right if both
    halves were read and both curves applied.  The warrior's sixty guarded the
    stamina curve for a year; the mage's mana is the same guard on the column
    that was read past all that time, because a warrior's `BaseMana` is nought
    on every line of the table and nought is what not reading it looks like.
    """
    for cls, one in ((1, 60), (8, 165)):
        word = {1: 'Warrior', 8: 'Mage'}[cls]
        got = doc['classes'].get(str(cls))
        if not got:
            continue
        at = got['stats'].get('1')
        if not at:
            continue
        sta, intel = at[2], at[3]
        health = at[5] + min(sta, 20) + max(0, sta - 20) * 10
        mana = at[6] + min(intel, 20) + max(0, intel - 20) * 15
        have = health if cls == 1 else mana
        what = 'health' if cls == 1 else 'mana'
        print(f'check: a new human {word.lower()} has {have} {what}')
        assert have == one, f'a level one {word} should have {one} {what}, not {have}'
    war = doc['classes'].get('1')
    if war:
        at = war['stats']['1']
        assert at[0] > at[1], 'a warrior is stronger than he is quick'


if __name__ == '__main__':
    main(os.path.expanduser(sys.argv[1] if len(sys.argv) > 1
                            else '~/src/azerothcore-wotlk'),
         os.path.expanduser(sys.argv[2] if len(sys.argv) > 2
                            else '~/workspace/warmane'),
         sys.argv[3] if len(sys.argv) > 3 else 'public/world')
