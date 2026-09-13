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
# The three index columns that were never resolved.  Without the first there
# is no such thing as "everything within eight yards", so a thunderclap could
# only ever hit one thing; without the second everything in the game is an
# instant cast whether it is or not.
#
# Found the way the global cooldown was: by asking which field of Thunder Clap
# holds an id that `SpellRadius.dbc` answers with eight — `check` below keeps
# it honest.
F_CATEGORY, F_CAST = 1, 28
F_RADIUS = 92
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


# The effect numbers that name another spell, so the closure knows to follow
# them.  `TRIGGER_SPELL` and its two friends put a spell id in the effect's
# own trigger field; an aura of `PERIODIC_TRIGGER_SPELL` does the same.
F_TRIGGER = 110
E_TRIGGER_SPELL, E_TRIGGER_MISSILE, E_PERSISTENT_AREA = 64, 32, 27
A_PERIODIC_TRIGGER = 23


def closure(start, spells, acore, depth=4):
    """Everything reachable from a set of spells, and what the limit cut off.

    The wiki's procedure, five widenings: an effect that triggers a spell names
    one, an aura that triggers a spell names one, `spell_linked_spell` names
    one, `spell_ranks` names the rest of a chain.  Summons are not followed —
    that needs the creature table and lands in `spawn_npcs.py`'s half.

    Returns `(reached, cut)`, and `cut` is the point: a reference the depth
    limit stopped at is a reference this world does not have, and the one
    thing worse than not having it is not knowing.
    """
    base = os.path.join(acore, 'data/sql/base/db_world')
    linked, ranks = {}, {}
    from spawn_npcs import columns as cols, rows as lines, split as cut_
    path = os.path.join(base, 'spell_linked_spell.sql')
    if os.path.exists(path):
        col = cols(path)
        for line in lines(path):
            f = cut_(line)
            try:
                a, b = int(f[col['spell_trigger']]), int(f[col['spell_effect']])
            except (ValueError, KeyError, IndexError):
                continue
            linked.setdefault(abs(a), set()).add(abs(b))
    path = os.path.join(base, 'spell_ranks.sql')
    if os.path.exists(path):
        col = cols(path)
        chain = {}
        for line in lines(path):
            f = cut_(line)
            try:
                first, sid = int(f[col['first_spell_id']]), int(f[col['spell_id']])
            except (ValueError, KeyError, IndexError):
                continue
            chain.setdefault(first, set()).add(sid)
        for first, all_ in chain.items():
            for sid in all_:
                ranks[sid] = all_

    reached, edge, cut = set(start), set(start), {}
    for step in range(depth):
        nxt = set()
        for sid in edge:
            r = spells.get(sid)
            if r is None:
                continue
            want = set(linked.get(sid, ())) | set(ranks.get(sid, ()))
            for i in range(3):
                if r[F_EFFECT + i] in (E_TRIGGER_SPELL, E_TRIGGER_MISSILE,
                                       E_PERSISTENT_AREA):
                    want.add(r[F_TRIGGER + i])
                if r[F_AURA + i] == A_PERIODIC_TRIGGER:
                    want.add(r[F_TRIGGER + i])
            nxt |= {w for w in want if w and w not in reached}
        if step == depth - 1 and nxt:
            for w in nxt:
                cut[w] = cut.get(w, 0) + 1
            break
        reached |= nxt
        edge = nxt
        if not edge:
            break
    return reached, cut


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
    radii = {}
    for r in dbc(c, 'SpellRadius'):
        f = struct.unpack('<%df' % len(r), struct.pack('<%di' % len(r), *r))
        radii[r[0]] = round(f[1], 1)
    casts = {r[0]: r[1] for r in dbc(c, 'SpellCastTimes')}

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
            # How long it takes to go off, and how wide it goes off.  Both
            # were index columns nobody resolved: the first made everything
            # instant and the second made everything single-target.
            'cast': casts.get(r[F_CAST], 0),
            'wide': [radii.get(r[F_RADIUS + i], 0.0) for i in range(3)],
            'category': r[F_CATEGORY],
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
    # And the radius.  A thunderclap is eight yards in this game and that is
    # not a number in any table but `SpellRadius.dbc`, reached through an index
    # on the spell — read from the wrong field it comes back nought, which
    # looks exactly like a game with no area effects, which is what this had.
    clap = next((r for r in out_rows if r['id'] == 6343), None)
    if not clap or clap['wide'][0] != 8.0:
        sys.exit('Spell.dbc radius index is wrong: 6343 came back %s'
                 % (clap and clap.get('wide')))

    # How far a swing reaches, which was a constant in `fight.ts` — three
    # yards, "two bodies and an arm".  `SpellRange.dbc` states it: index 2 is
    # the game's own combat range and it is five.  Index 1 is (0, 0), which is
    # what an auto attack points at, so the table has to be asked for the
    # *combat* row rather than the attack's own.
    melee = ranges.get(2, (0.0, 5.0))[1]

    # What the creatures of this slice can do, which until now was nothing.
    # `creature_template_spell` is 9,556 rows and 38 of the slice's 459 kinds
    # have one — Elwynn's kobolds and bandits carry a handful each, and
    # without them every fight in the forest is the same fight.
    foes, unrun = {}, {}
    ctab = os.path.join(acore, 'data/sql/base/db_world/creature_template_spell.sql')
    spawned = set()
    made = os.path.join(out, 'npcs.json')
    if os.path.exists(made):
        with open(made) as f:
            spawned = {r[9] for r in json.load(f).get('npcs', [])}
    if spawned and os.path.exists(ctab):
        from spawn_npcs import columns as cols2, rows as lines2, split as cut2
        col2 = cols2(ctab)
        for line in lines2(ctab):
            f = cut2(line)
            try:
                e, sid = int(f[col2['CreatureID']]), int(f[col2['Spell']])
            except (ValueError, KeyError, IndexError):
                continue
            if e not in spawned or not sid or sid not in spells:
                continue
            r = spells[sid]
            lo, hi = ranges.get(r[F_RANGE], (0.0, 5.0))
            does = [[r[F_EFFECT + i], r[F_BASE + i] + 1, r[F_DIE + i],
                     r[F_AURA + i], r[F_PERIOD + i]] for i in range(3)
                    if r[F_EFFECT + i]]
            foes.setdefault(str(e), []).append({
                'id': sid,
                'cool': max(r[F_RECOVERY], r[F_CATEGORY_RECOVERY]) or 8000,
                'reach': [lo, hi],
                'wide': [radii.get(r[F_RADIUS + i], 0.0) for i in range(3)],
                'holds': durations.get(r[F_DURATION], 0),
                'does': does,
            })
            # What this engine cannot run, counted rather than dropped in
            # silence.  A creature whose only ability is an effect nothing
            # here implements simply swings, and that is a fact worth
            # printing once a bake.
            for eff, *_ in does:
                if eff not in (2, 6, 3, 58):
                    unrun[eff] = unrun.get(eff, 0) + 1

    # And the closure.  The wiki writes the procedure down and this script did
    # the first half of the first step: it took a starting set and filtered it.
    # Nothing was ever *expanded*, so "thirteen abilities" was a number that
    # had been filtered rather than counted.
    #
    # Expanded now, with a depth limit, and **what the limit cut off is
    # reported rather than dropped** — a closure that quietly stops is a
    # closure that lies about being closed.
    reached, stopped = closure(
        {r['id'] for r in out_rows}
        | {sp['id'] for v in foes.values() for sp in v},
        spells, acore, depth=4)

    # And *when* they use them.  `smart_scripts` is 52,768 rows of which 376
    # touch this slice, and 71 of those are "cast this spell" — the rest are
    # talking (Blizzard's prose, so no), walking a path, or setting a flag for
    # another row to read.
    #
    # Three triggers are worth carrying and they are the three that make one
    # fight different from another:
    #
    #   * `UPDATE_IC` (0) — every so often while fighting, between two
    #     figures, and then again on a longer pair
    #   * `HEALTH_PCT` (2) — when it drops between two percentages
    #   * `AGGRO` (4) — the moment it turns on you
    #
    # Everything else is counted and left alone, the same way the effects this
    # engine cannot run are counted.
    E_UPDATE_IC, E_HEALTH_PCT, E_AGGRO = 0, 2, 4
    A_CAST = 11
    smart = os.path.join(acore, 'data/sql/base/db_world/smart_scripts.sql')
    cues, skipped_cues = {}, {}
    if spawned and os.path.exists(smart):
        from spawn_npcs import columns as cols3, rows as lines3, split as cut3
        col3 = cols3(smart)
        for line in lines3(smart):
            f = cut3(line)
            try:
                if int(f[col3['source_type']]) != 0:
                    continue
                who = int(f[col3['entryorguid']])
                if who not in spawned:
                    continue
                event = int(f[col3['event_type']])
                act = int(f[col3['action_type']])
            except (ValueError, KeyError, IndexError):
                continue
            if act != A_CAST:
                continue
            if event not in (E_UPDATE_IC, E_HEALTH_PCT, E_AGGRO):
                skipped_cues[event] = skipped_cues.get(event, 0) + 1
                continue
            try:
                sid = int(f[col3['action_param1']])
                p1, p2 = int(f[col3['event_param1']]), int(f[col3['event_param2']])
                chance = int(f[col3['event_chance']]) or 100
            except (ValueError, KeyError, IndexError):
                continue
            cues.setdefault(str(who), []).append(
                [sid, event, p1, p2, chance])

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
        json.dump({'spells': out_rows, 'melee': melee, 'foes': foes,
                   'cues': cues}, f)
    print(f'{len(out_rows)} abilities to level {upto} -> {path}'
          f'   combat range {melee} yards')
    runnable = sum(1 for v in foes.values() for sp in v
                   if any(e in (2, 6, 3, 58) for e, *_ in sp['does']))
    print(f'  {len(foes)} kinds of creature carry '
          f'{sum(len(v) for v in foes.values())} abilities between them, '
          f'{runnable} of which this engine can run')
    print(f'  the closure over them reaches {len(reached)} spells'
          + (f', and stopped at {len(stopped)} more — {sorted(stopped)[:8]}'
             if stopped else ' and closed'))
    print(f'  {len(cues)} of them are told *when* by `smart_scripts`: '
          f'{sum(len(v) for v in cues.values())} cues'
          + (f', and {sum(skipped_cues.values())} more on triggers this engine '
             f'does not have ({sorted(skipped_cues)})' if skipped_cues else ''))
    if unrun:
        print('  effects it cannot run, by how often: '
              + ', '.join(f'{k} x{v}' for k, v in
                          sorted(unrun.items(), key=lambda kv: -kv[1])))
    for r in out_rows:
        print('  %-6d level %-3d %2d rage  %5dms  reach %s  %s'
              % (r['id'], r['level'], r['rage'], r['cool'], r['reach'], r['does']))


if __name__ == '__main__':
    main(os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else '~/workspace/warmane'),
         os.path.expanduser(sys.argv[2] if len(sys.argv) > 2 else '~/src/azerothcore-wotlk'),
         sys.argv[3] if len(sys.argv) > 3 else 'public/world')
