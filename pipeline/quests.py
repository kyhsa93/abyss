#!/usr/bin/env python3
"""The errands of the forest, out of AzerothCore and the client's own table.

  python3 pipeline/quests.py [azerothcore] [client] [out]

A quest is three facts and this repository can carry all three: **who gives it,
what it asks for, and what it pays**.  All of those are numbers — a creature
id, a count, an experience figure — which is why they may leave a database
whose every sentence is Blizzard's.  Nothing of the prose comes out: not the
title, not the description, not a word of the dialogue.  `src/talk.ts` writes
what the player reads, from the shape.

    q7   level 2   from 197 to 197   kill 8 of creature 6     170 xp, 25 copper
    q15  level 3   from 197 to 197   kill 8 of creature 257   after q7
    q18  level 4   from 823 to 823   fetch 8 of item 752      which drops off 38

That is the starting valley's chain, and it is the shape every quest in the
slice has.

**The experience is not in the database.**  `questxp_dbc` in AzerothCore's dump
is a schema with no rows in it, because the core reads that table out of the
client at run time — the same thing that was true of `faction_dbc`, and the
same fix: `QuestXP.dbc` is right there.  A quest's `RewardXPDifficulty` is a
**zero-based** index into it, which is why the first column of every row is a
zero: that column exists to be the answer for a quest that pays nothing.

Only what the engine can actually carry out comes through.  A quest that asks
for an item nothing in the slice drops is a quest that cannot be finished, so
it is left out and counted, the same bargain the doodads make with a missing
picture.
"""
import json
import os
import struct
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bake_terrain as B  # noqa: E402
from spawn_npcs import BOUNDS, MAP, columns, goods_of, rows, split  # noqa: E402
from spells import CHAIN  # noqa: E402

# How many of each objective a quest may carry, by the shape of the table.
NPCS, ITEMS = 4, 6


def quest_xp(client):
    """`QuestXP.dbc`, as {quest level: [ten difficulties]}."""
    B.CHAIN = CHAIN
    data, _src = client.read('DBFilesClient\\QuestXP.dbc')
    if data is None:
        sys.exit('QuestXP.dbc is not in this client')
    magic, n, fields, rsize, _sb = struct.unpack_from('<4sIIII', data, 0)
    if magic != b'WDBC':
        sys.exit('QuestXP.dbc is not a dbc')
    out = {}
    for i in range(n):
        r = struct.unpack_from('<%di' % fields, data, 20 + i * rsize)
        out[r[0]] = list(r[1:11])
    # The layout, checked against a fact rather than trusted: the first
    # difficulty of every level is nought, because a quest that pays no
    # experience is one whose difficulty index is zero.
    if any(v[0] != 0 for v in out.values()):
        sys.exit('QuestXP.dbc: difficulty zero is not zero, so the index is '
                 'not what this reads it as')
    return out


def spawned(base):
    """Every creature that actually stands in the slice, by entry."""
    p = os.path.join(base, 'creature.sql')
    col = columns(p)
    here = Counter()
    for line in rows(p):
        f = split(line)
        try:
            if int(f[col['map']]) != MAP:
                continue
            x, y = float(f[col['position_x']]), float(f[col['position_y']])
        except (ValueError, IndexError):
            continue
        if BOUNDS[0] <= x <= BOUNDS[1] and BOUNDS[2] <= y <= BOUNDS[3]:
            here[int(f[col['id1']])] += 1
    return here


def relation(base, name):
    """`creature_queststarter` or `creature_questender`, as {quest: creature}."""
    p = os.path.join(base, name)
    col = columns(p)
    out = {}
    for line in rows(p):
        f = split(line)
        try:
            out.setdefault(int(f[col['quest']]), int(f[col['id']]))
        except (ValueError, IndexError):
            continue
    return out


def drops(base, wanted):
    """Which creature drops each quest item, and how often.

    A fetch objective is only a fetch objective if something in the world
    carries the thing.  `creature_loot_template` says which and at what chance,
    and a quest whose item nothing drops is left out rather than made
    impossible.
    """
    p = os.path.join(base, 'creature_loot_template.sql')
    col = columns(p)
    out = defaultdict(list)
    for line in rows(p):
        f = split(line)
        try:
            item, entry = int(f[col['Item']]), int(f[col['Entry']])
            chance = float(f[col['Chance']])
        except (ValueError, IndexError):
            continue
        if item in wanted:
            out[item].append([entry, round(abs(chance), 1)])
    return out


def words(base, wanted):
    """One of our words for each quest item, from its class and subclass."""
    p = os.path.join(base, 'item_template.sql')
    col = columns(p)
    out = {}
    for line in rows(p):
        f = split(line)
        try:
            e = int(f[0])
        except ValueError:
            continue
        if e in wanted:
            out[e] = goods_of(int(f[col['class']]), int(f[col['subclass']]))
    return out


def check_objects(wants, out):
    """An objective that names a game object has to be one you could finish.

    `RequiredNpcOrGo` is negative for an object, and until there were objects
    in this world that meant the quest was dropped.  There are 1,365 of them
    now, so the question is a real one: does the thing the objective names
    actually stand somewhere you can reach?

    Not one of this slice's quests asks — the whole database has 180 such
    objectives and every one belongs to a quest nobody in this forest gives
    out.  That is the answer and it is worth printing rather than assuming,
    because the day the slice widens it stops being the answer.
    """
    path = os.path.join(out, 'objects.json')
    standing = set()
    if os.path.exists(path):
        with open(path) as f:
            standing = {r[8] for r in json.load(f).get('objects', [])}
    reachable = [(q, o) for q, o in wants if o in standing]
    print(f'check: {len(wants)} objectives name a game object, '
          f'{len(reachable)} of them one that stands in the slice')
    assert len(reachable) == len(wants), (
        'a quest asks for an object that is not in this world: '
        + str([o for q, o in wants if o not in standing][:5]))


def main(acore, client_root, out):
    base = os.path.join(acore, 'data/sql/base/db_world')
    client = B.Client(client_root)
    xp_for = quest_xp(client)
    here = spawned(base)
    starters = relation(base, 'creature_queststarter.sql')
    enders = relation(base, 'creature_questender.sql')

    p = os.path.join(base, 'quest_template.sql')
    col = columns(p)
    raw = {}
    for line in rows(p):
        f = split(line)
        try:
            q = int(f[0])
        except ValueError:
            continue
        if q not in starters:
            continue
        raw[q] = f

    p = os.path.join(base, 'quest_template_addon.sql')
    acol = columns(p)
    addon = {}
    for line in rows(p):
        f = split(line)
        try:
            addon[int(f[0])] = f
        except ValueError:
            continue

    # Every item any of these asks for, so the drop table is read once.
    asked = set()
    for f in raw.values():
        for i in range(1, ITEMS + 1):
            k = 'RequiredItemId%d' % i
            if k in col and f[col[k]] not in ('0', 'NULL'):
                asked.add(int(f[col[k]]))
    from_beast = drops(base, asked)
    word_of = words(base, asked)

    quests, dropped = [], Counter()
    wants_object = []
    for q, f in sorted(raw.items()):
        giver, ender = starters.get(q), enders.get(q)
        if giver not in here:
            dropped['nobody in the slice gives it'] += 1
            continue
        if ender not in here:
            dropped['nobody in the slice takes it'] += 1
            continue
        level = int(f[col['QuestLevel']])
        kill, fetch, unmet = [], [], False
        for i in range(1, NPCS + 1):
            who = int(f[col['RequiredNpcOrGo%d' % i]])
            n = int(f[col['RequiredNpcOrGoCount%d' % i]])
            if who <= 0 or not n:
                # A negative id is a gameobject.  There are 1,365 of those in
                # the world now — `pipeline/objects.py` puts them there — so
                # this is no longer "we cannot do those": it is a lookup, and
                # `check_objects` does it.  Not one of the slice's 102 quests
                # names one, which is worth stating rather than assuming: the
                # whole database has 180 such objectives and every one of them
                # belongs to a quest nobody in this forest gives out.
                if who < 0:
                    wants_object.append((int(f[col['ID']]), -who))
                    unmet = True
                continue
            if who not in here:
                unmet = True
                continue
            kill.append([who, n])
        for i in range(1, ITEMS + 1):
            k = 'RequiredItemId%d' % i
            if k not in col or f[col[k]] in ('0', 'NULL'):
                continue
            item = int(f[col[k]])
            n = int(f[col['RequiredItemCount%d' % i]])
            got = [d for d in from_beast.get(item, []) if d[0] in here]
            if not got:
                unmet = True
                continue
            fetch.append([item, n, word_of.get(item, 'errand'), got])
        if unmet:
            dropped['asks for something not in the slice'] += 1
            continue
        diff = int(f[col['RewardXPDifficulty']])
        table = xp_for.get(level if level > 0 else 1, [0] * 10)
        a = addon.get(q)
        quests.append({
            'id': q, 'level': level,
            'min': int(f[col['MinLevel']]),
            'from': giver, 'to': ender,
            'kill': kill, 'fetch': fetch,
            'xp': table[diff] if 0 <= diff < len(table) else 0,
            'coin': int(f[col['RewardMoney']]),
            'after': int(a[acol['PrevQuestID']]) if a else 0,
        })

    check_objects(wants_object, out)

    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, 'quests.json')
    with open(path, 'w') as f:
        json.dump({'quests': quests}, f)
    print(f'{len(quests)} quests -> {path}')
    for why, n in dropped.most_common():
        print(f'  {n:>4} left out: {why}')
    doable = [q for q in quests if q['level'] and q['level'] <= 6]
    print(f'  {len(doable)} of them are for a level 1 to 6 adventurer')
    for q in sorted(doable, key=lambda v: (v['min'], v['id']))[:14]:
        job = ' '.join(f'kill {n} of {w}' for w, n in q['kill']) \
            or ' '.join(f'fetch {n} of item {i}' for i, n, _w, _d in q['fetch']) \
            or 'carry word'
        print('    q%-5d lvl %-2d from %-6d to %-6d  %-28s %4d xp %4d copper%s'
              % (q['id'], q['level'], q['from'], q['to'], job, q['xp'],
                 q['coin'], f"  after q{q['after']}" if q['after'] else ''))


if __name__ == '__main__':
    main(os.path.expanduser(sys.argv[1] if len(sys.argv) > 1
                            else '~/src/azerothcore-wotlk'),
         os.path.expanduser(sys.argv[2] if len(sys.argv) > 2
                            else '~/workspace/warmane'),
         sys.argv[3] if len(sys.argv) > 3 else 'public/world')
