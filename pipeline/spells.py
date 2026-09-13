#!/usr/bin/env python3
"""What a warrior can do, out of the client's own tables.

  python3 pipeline/spells.py [client] [azerothcore] [out]

Two sources and neither of them invented.  **AzerothCore** says which abilities
a warrior has and at what level — `trainer_spell`, where trainer 1 is the
warrior — and the **client's `Spell.dbc`** says what each of them costs and
does.  Between them a level 5 warrior knows four things, and every number
attached to them is the game's.

**Only integers leave this script.**  `Spell.dbc` is 49 MB of which 2.7 MB is a
string block, and that block is Blizzard's prose — every ability name and
description in the game.  It is never read.  What comes out is an id, a cost, a
cooldown, a radius and an effect, and `src/talk.ts` supplies the word, the same
bargain `bake_terrain.py` makes with a model path and `spawn_npcs.py` makes
with an item name.

The field offsets are the 3.3.5a layout, and they are checked rather than
trusted: the first spell read has to come back as rage-powered and cost 150,
because 15 rage for a Heroic Strike is a fact about the game and a layout that
is off by one cannot produce it.
"""
import json
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bake_terrain import Client  # noqa: E402
from slice import LEVELS  # noqa: E402

# The Korean client keeps `DBFilesClient` in its own patch archive, ahead of
# everything the terrain reader looks in.
CHAIN = ['koKR/patch-koKR-3.MPQ', 'koKR/patch-koKR-2.MPQ', 'koKR/patch-koKR.MPQ',
         'koKR/locale-koKR.MPQ', 'patch-3.MPQ', 'patch-2.MPQ', 'patch.MPQ',
         'lichking.MPQ', 'expansion.MPQ', 'common-2.MPQ', 'common.MPQ']

# 3.3.5a `Spell.dbc`, by index into its 234 fields.
F_POWER, F_COST = 41, 42
F_RECOVERY, F_CATEGORY_RECOVERY = 29, 30
F_DURATION, F_RANGE, F_LEVEL = 40, 46, 39
F_EFFECT, F_DIE, F_BASE = 71, 74, 80
# The global cooldown, which is a **column** and not the constant 1.5 seconds
# it is usually described as.  `Spell::TriggerGlobalCooldown` (Spell.cpp:8971)
# reads `StartRecoveryTime` off the spell and clamps it to one to one and a
# half seconds; a spell with nought there does not start one at all, which is
# how Heroic Strike and Charge can follow anything.
#
# Field 206 was not looked up in a layout table — it was found: the only field
# that is 1500 for Battle Shout and nought for Heroic Strike, across every
# ability a warrior has by level ten.
F_GCD_CATEGORY, F_GCD = 205, 206
F_AURA, F_PERIOD = 95, 98

# The warrior's trainer, and the class's own skill lines.  Trainer 1 teaches
# Charge at level 4 and an ability that requires spell 78 at level 8, which is
# what identifies it — no list of ids was typed in.
WARRIOR_TRAINER = 1

# Rage is stored at ten times what the bar shows.
RAGE = 10


def dbc(client, name):
    """A `.dbc` as a list of int tuples.  The string block is never touched."""
    data, _src = client.read('DBFilesClient\\%s.dbc' % name)
    if data is None:
        sys.exit(f'{name}.dbc is not in this client')
    magic, n, fields, rsize, _sb = struct.unpack_from('<4sIIII', data, 0)
    if magic != b'WDBC':
        sys.exit(f'{name}.dbc is not a dbc')
    return [struct.unpack_from('<%di' % fields, data, 20 + i * rsize)
            for i in range(n)]


def known(base, upto):
    """Every warrior ability a human has by `upto`, as {id: level}.

    Two tables.  `playercreateinfo_action` is the bar a new human warrior is
    created holding — which is what the class starts with, and the only
    statement of it in this dump, since `playercreateinfo_spell_custom` has no
    rows.  `trainer_spell` is everything the warrior trainer will add.

    The prerequisites named in a trainer row are *not* starting abilities.
    Reading them that way put Mortal Strike and Devastate on a level 1
    warrior's list — both talents, both named as a requirement by something
    else, neither taught by anybody at level 1.
    """
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from spawn_npcs import columns, rows, split
    out, free = {}, set()
    act = os.path.join(base, 'playercreateinfo_action.sql')
    ac = columns(act)
    for line in rows(act):
        f = split(line)
        if int(f[ac['class']]) == 1 and int(f[ac['race']]) == 1 \
                and int(f[ac['type']]) == 0:
            out[int(f[ac['action']])] = 1
            free.add(int(f[ac['action']]))
    path = os.path.join(base, 'trainer_spell.sql')
    col = columns(path)
    for line in rows(path):
        f = split(line)
        if int(f[col['TrainerId']]) != WARRIOR_TRAINER:
            continue
        lv = int(f[col['ReqLevel']]) or 1
        if lv <= upto:
            out.setdefault(int(f[col['SpellId']]), lv)
    return out, free


def main(client_root, acore, out, upto=None):
    c = Client(client_root)
    import bake_terrain
    bake_terrain.CHAIN = CHAIN

    spells = {r[0]: r for r in dbc(c, 'Spell')}
    durations = {r[0]: r[1] for r in dbc(c, 'SpellDuration')}
    ranges = {}
    for r in dbc(c, 'SpellRange'):
        f = struct.unpack('<%df' % len(r), struct.pack('<%di' % len(r), *r))
        ranges[r[0]] = (round(f[1], 1), round(f[3], 1))

    # How far up this game goes, out of `slice.json` rather than a default
    # argument nobody outside this file could see.
    upto = upto or LEVELS[1]
    want, free = known(os.path.join(acore, 'data/sql/base/db_world'), upto)
    out_rows = []
    for sid, lv in sorted(want.items(), key=lambda kv: (kv[1], kv[0])):
        r = spells.get(sid)
        if r is None:
            continue
        lo, hi = ranges.get(r[F_RANGE], (0.0, 5.0))
        row = {
            'id': sid, 'level': lv,
            'rage': r[F_COST] // RAGE,
            'cool': max(r[F_RECOVERY], r[F_CATEGORY_RECOVERY]),
            'reach': [lo, hi],
            # Whether he is created holding it.  Everything else is bought
            # from a trainer — `playercreateinfo_action` is the bar a new
            # human warrior is made with, and it is two things.
            **({'free': 1} if sid in free else {}),
            'holds': durations.get(r[F_DURATION], 0),
            # What it makes you wait before pressing anything else.  Nought
            # for the ones that go off the next swing.
            'gcd': r[F_GCD],
            # Three effect slots; an unused one is effect 0.  `basePoints` is
            # one short of what the tooltip says — the game rolls
            # `base + 1 .. base + dieSides`.
            'does': [[r[F_EFFECT + i], r[F_BASE + i] + 1, r[F_DIE + i],
                      r[F_AURA + i], r[F_PERIOD + i]]
                     for i in range(3) if r[F_EFFECT + i]],
        }
        out_rows.append(row)

    # The layout, checked against a fact rather than trusted.  Spell 78 is a
    # rage ability that costs fifteen; if the offsets are off by one this comes
    # back as something else and the whole table is quietly wrong.
    check = next((r for r in out_rows if r['id'] == 78), None)
    if not check or check['rage'] != 15:
        sys.exit('Spell.dbc field offsets are wrong: 78 came back as %s' % check)
    # And the global cooldown, the same way: a heavier blow goes off the next
    # swing and starts no wait, and a shout starts a second and a half.  Read
    # from the wrong field both come back nought, which looks like a game with
    # no global cooldown at all — which is what this had.
    shout = next((r for r in out_rows if r['id'] == 6673), None)
    if not shout or shout['gcd'] != 1500 or check['gcd'] != 0:
        sys.exit('Spell.dbc global cooldown field is wrong: 78 is %s and 6673 '
                 'is %s' % (check.get('gcd'), shout and shout.get('gcd')))

    # How far a swing reaches, which was a constant in `fight.ts` — three
    # yards, "two bodies and an arm".  `SpellRange.dbc` states it: index 2 is
    # the game's own combat range and it is five.  Index 1 is (0, 0), which is
    # what an auto attack points at, so the table has to be asked for the
    # *combat* row rather than the attack's own.
    melee = ranges.get(2, (0.0, 5.0))[1]

    # How much attention each ability buys, out of `spell_threat` — a flat
    # amount, a multiplier, and a share of attack power.  106 rows, of which
    # the warrior's first ten levels use a handful: a heavier blow is worth
    # five more than the damage it does, and that is the whole reason it is
    # the thing you open with.
    threat = {}
    tpath = os.path.join(acore, 'data/sql/base/db_world/spell_threat.sql')
    if os.path.exists(tpath):
        from spawn_npcs import columns as cols, rows as lines, split as cut
        col = cols(tpath)
        for line in lines(tpath):
            f = cut(line)
            try:
                threat[int(f[col['entry']])] = [
                    int(f[col['flatMod']]), float(f[col['pctMod']]),
                    int(f[col['apPctMod']])]
            except (ValueError, KeyError, IndexError):
                continue
    for row in out_rows:
        if row['id'] in threat:
            row['threat'] = threat[row['id']]

    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, 'spells.json')
    with open(path, 'w') as f:
        json.dump({'spells': out_rows, 'melee': melee}, f)
    print(f'{len(out_rows)} abilities to level {upto} -> {path}'
          f'   combat range {melee} yards')
    for r in out_rows:
        print('  %-6d level %-3d %2d rage  %5dms  reach %s  %s'
              % (r['id'], r['level'], r['rage'], r['cool'], r['reach'], r['does']))


if __name__ == '__main__':
    main(os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else '~/workspace/warmane'),
         os.path.expanduser(sys.argv[2] if len(sys.argv) > 2 else '~/src/azerothcore-wotlk'),
         sys.argv[3] if len(sys.argv) > 3 else 'public/world')
