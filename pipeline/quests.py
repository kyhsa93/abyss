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
import re
import struct
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bake_terrain as B  # noqa: E402
from spawn_npcs import BOUNDS, MAP, columns, goods_of, rows, split  # noqa: E402
from spells import CHAIN  # noqa: E402
from slice import LEVELS, REACH_OVER, CLASS_MASK, RACE_MASK, allows  # noqa: E402

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


def spawned(base, world):
    """Every creature that actually stands in the slice, by entry.

    **Out of `npcs.json` and not out of `creature.sql`**, and that is the whole
    point of it.  This used to take the box and nothing else, where
    `spawn_npcs.py` takes the box *and* drops holiday spawns *and* drops
    anything it has no picture for — so the two scripts disagreed about who
    lives here, and the difference was quests.  Four of the five richest
    errands in this game, 74,000 copper each, are given by creatures 24519,
    38066 and 38325, who are Brewfest and Hallow's End staff and **do not
    stand anywhere in this world**.

    One script decides who is here.  `pipeline/bake.py` runs the spawns before
    the quests for that reason; without the file this falls back to the box, so
    a quests-only run still works and says what it did.
    """
    path = os.path.join(world, 'npcs.json')
    if os.path.exists(path):
        with open(path) as f:
            doc = json.load(f)
        here = Counter(r[9] for r in doc.get('npcs', []))
        if here:
            return here, 'the baked world'
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
    return here, 'the slice rectangle, because npcs.json is not baked yet'


def in_range(level, minimum):
    """Whether a quest belongs to the levels this game covers.

    Two columns and they answer different questions.  `MinLevel` is what the
    server checks and it is a floor: a quest asking for more than this game
    ever reaches can never be taken.  `QuestLevel` is what the quest *is*, and
    a **-1 there means it is whatever level you are** — the wiki's own named
    trap, and the reason 58 of the slice's quests have no level at all.

    A scaling quest is dropped rather than measured by its `MinLevel`, and the
    money is why: `RewardMoney` on one of those is the figure for the level it
    was written for, and four of them in this slice pay 74,000 copper to a
    character who has 2,110 copper of training to buy.  Keeping them and
    trusting the column would be shipping a number already known to be wrong;
    keeping them and rewriting the column would be inventing one.
    """
    if minimum > LEVELS[1]:
        return False
    if level <= 0:
        return False
    return LEVELS[0] <= level <= LEVELS[1] + REACH_OVER


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


def triggers(client_root):
    """Where each of the client's area triggers is, and how big.

    `AreaTrigger.dbc` is a position, a radius, and a box for the square ones —
    ten integers a row and not one word of prose, which is the whole reason
    this is readable at all.

    Turned into *our* coordinates on the way out: the client's x and y are the
    game's y and x, which is the same flip the terrain makes.
    """
    if not client_root or not os.path.isdir(client_root):
        return {}
    data = B.read_dbc(B.Client(client_root), 'AreaTrigger')
    if not data:
        return {}
    _m, n, fields, rsize, _sb = struct.unpack_from('<4sIIII', data, 0)
    out = {}
    for i in range(n):
        v = struct.unpack_from('<%di' % fields, data, 20 + i * rsize)
        f = struct.unpack('<%df' % fields, struct.pack('<%di' % fields, *v))
        if v[1] != MAP:
            continue
        # `[x, y, radius]`, and a box counts as its own half-diagonal so that
        # standing in a square one still works with a circle test.
        wide = f[5] or max(f[6], f[7]) or 5.0
        out[v[0]] = [round(f[2], 1), round(f[3], 1), round(wide, 1)]
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
    here, whose = spawned(base, out)
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

    # The reward slots, counted off the table.  See `gives` and `pick` below.
    fixed_slots = sorted((k for k in col if re.fullmatch(r'RewardItem\d+', k)),
                         key=lambda k: int(k[len('RewardItem'):]))
    choice_slots = sorted(
        (k for k in col if re.fullmatch(r'RewardChoiceItemID\d+', k)),
        key=lambda k: int(k[len('RewardChoiceItemID'):]))

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
        # Who may take it at all.  The class mask is on the addon and the
        # race mask on the template, and this game has one of each — which is
        # the same filter `trainer.Requirement` got in `5ae46c5` and the
        # quests never did, so twenty-nine other classes' class quests were on
        # offer to the only warrior in the world.
        a = addon.get(q)
        if not allows(int(a[acol['AllowableClasses']]) if a else 0, CLASS_MASK):
            dropped['for a class this game does not have'] += 1
            continue
        if not allows(int(f[col['AllowableRaces']]), RACE_MASK):
            dropped['for a race this game does not have'] += 1
            continue
        level = int(f[col['QuestLevel']])
        if not in_range(level, int(f[col['MinLevel']])):
            dropped['outside the levels this game covers' if level > 0
                     else 'levels with the player, so its reward is not ours'] += 1
            continue
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
        quests.append({
            'id': q, 'level': level,
            'min': int(f[col['MinLevel']]),
            'from': giver, 'to': ender,
            'kill': kill, 'fetch': fetch,
            'xp': table[diff] if 0 <= diff < len(table) else 0,
            'coin': int(f[col['RewardMoney']]),
            'after': int(a[acol['PrevQuestID']]) if a else 0,
            # The other three shapes a chain has, and the slice's count of
            # each is in the report below.
            #
            #   `group` — a positive `ExclusiveGroup` means "one of these and
            #     then no more of them".  Nought here, and the reason is the
            #     two filters above: all twelve of the slice's belonged to
            #     another class or sat outside these levels.  The rule ships
            #     anyway, because a rule that arrives with the quest is a rule
            #     that does not have to be remembered.
            #   `leads` — `RewardNextQuest`, which is "hand this in and the
            #     next one is offered on the spot" rather than "this one
            #     unlocks that one".  It is the difference between a chain you
            #     walk and a chain you are handed.
            #   `instead` — `BreadcrumbForQuestId`, a signpost errand that
            #     disappears once you have the thing it was pointing at.
            'group': int(a[acol['ExclusiveGroup']]) if a else 0,
            'leads': int(f[col['RewardNextQuest']]),
            'instead': int(a[acol['BreadcrumbForQuestId']]) if a else 0,
            # Carried so the gate at the end of this file can be run against
            # what was shipped rather than against what was read — a filter
            # that checks its own input is a filter that cannot be caught
            # forgetting to run.
            'classes': int(a[acol['AllowableClasses']]) if a else 0,
            'races': int(f[col['AllowableRaces']]),
            # What handing it in pays, beyond the experience and the coin.
            # Four fixed slots and **six** to choose between — the count is
            # taken off the columns rather than typed, because a loop that has
            # to agree with a table stops agreeing: `items.py` said four for
            # both and a staff offered in slot five was an item this world
            # never baked.
            'gives': [[int(f[col[k]]), int(f[col[k.replace('Item', 'Amount')]])]
                      for k in fixed_slots if int(f[col[k]])],
            'pick': [[int(f[col[k]]),
                      int(f[col[k.replace('ID', 'Quantity')]])]
                     for k in choice_slots if int(f[col[k]])],
        })

    # Walking somewhere, which is a fifth kind of objective and the only one
    # of the missing three this slice actually uses.  `areatrigger_involvedrelation`
    # says which trigger finishes which quest and the client's `AreaTrigger.dbc`
    # says where it is and how big — a radius, or a box for the square ones.
    reach = {}
    path = os.path.join(acore, 'data/sql/base/db_world/'
                        'areatrigger_involvedrelation.sql')
    spots = triggers(client_root)
    if os.path.exists(path) and spots:
        col2 = columns(path)
        kept = {q['id'] for q in quests}
        for line in rows(path):
            f2 = split(line)
            try:
                q, t = int(f2[col2['quest']]), int(f2[col2['id']])
            except (ValueError, KeyError, IndexError):
                continue
            if q in kept and t in spots:
                reach.setdefault(str(q), []).append(spots[t])
    for q in quests:
        if str(q['id']) in reach:
            q['walk'] = reach[str(q['id'])]

    check_objects(wants_object, out)

    # A chain that starts outside this game cannot be walked, so it is not
    # shipped.
    #
    # This is the wiki's open question — *cut the chains that leave, or widen
    # the slice until they close* — and the answer is cut, because the
    # measurement made it small.  Of the 224 quests somebody standing in this
    # world hands out, **21** are ones this character could take and this game
    # does not ship, and only **five** of those leak: sixteen have their taker
    # standing inside the box already and were dropped for a different reason.
    # The five that do leak end within a thousand yards of the edge.  Widening
    # the slice until they close is the wiki's own warning about a slice that
    # grows quietly, bought for five errands.
    #
    # What cutting leaves behind is the thing worth fixing, and nothing had
    # noticed it: `offers()` will not hand you a quest until whatever it comes
    # `after` is **done**, so a shipped quest whose prerequisite is not shipped
    # can never be offered at all.  Six of them were in this file.  It is
    # transitive — dropping one orphans the next — so this runs to a fixed
    # point, and the alternative was worse: cutting the `after` link instead
    # would ship a quest claiming to have no prerequisite, which is the sort of
    # small lie this repository spends rounds finding.
    while True:
        have = {q['id'] for q in quests}
        stranded = [q for q in quests if q['after'] and q['after'] not in have]
        if not stranded:
            break
        for q in stranded:
            dropped['starts from a quest this game does not have'] += 1
        quests = [q for q in quests if q not in stranded]
    # And a link forward that points out of the game is not a link.  Left in,
    # the hand-in would look for an errand that is not there; taken out, it is
    # simply the end of the chain, which is what it is.
    have = {q['id'] for q in quests}
    for q in quests:
        for key in ('leads', 'instead'):
            if q[key] and q[key] not in have:
                q[key] = 0
                dropped['a link forward that leaves this game'] += 1

    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, 'quests.json')
    with open(path, 'w') as f:
        json.dump({'quests': quests}, f)
    print(f'{len(quests)} quests -> {path}   who is here, out of {whose}')
    for why, n in dropped.most_common():
        print(f'  {n:>4} left out: {why}')
    # The line the economy page asked for, on this side of it: every quest
    # shipped is one a character of these levels could be handed, and the
    # money is the money.
    # Every chain walks to its end.  A quest whose prerequisite is missing can
    # never be offered and a link that points at nothing is not a link.
    have = {q['id'] for q in quests}
    stuck = [q['id'] for q in quests
             if (q['after'] and q['after'] not in have)
             or (q['leads'] and q['leads'] not in have)
             or (q['instead'] and q['instead'] not in have)]
    if stuck:
        sys.exit('%d chains dead-end inside this game: %s' % (len(stuck), stuck[:8]))
    out_of = [q for q in quests
              if not in_range(q['level'], q['min'])
              or not allows(q['classes'], CLASS_MASK)
              or not allows(q['races'], RACE_MASK)]
    if out_of:
        sys.exit('%d quests came through that this character cannot take: %s'
                 % (len(out_of), [q['id'] for q in out_of][:8]))
    # What they pay besides experience and coin.  The closure that has to hold
    # — every reward item baked — is checked in `items.py`, which runs after
    # this and is the file that knows what was baked.
    pays = {it for q in quests for it, _n in q['gives'] + q['pick']}
    print(f'  {sum(1 for q in quests if q["gives"])} pay an item, '
          f'{sum(1 for q in quests if q["pick"])} let you choose one of '
          f'{max([len(q["pick"]) for q in quests] + [0])}, over '
          f'{len(pays)} distinct items')
    shapes = Counter()
    for q in quests:
        if q['after']:
            shapes['follow another'] += 1
        if q['group'] > 0:
            shapes['are one of an exclusive group'] += 1
        if q['leads']:
            shapes['hand you the next one on the spot'] += 1
        if q['instead']:
            shapes['are a signpost that vanishes'] += 1
    print('  chains: ' + ', '.join(f'{v} {k}' for k, v in shapes.most_common()))
    rich = sorted(quests, key=lambda q: -q['coin'])[:1]
    print(f"  they pay {sum(q['coin'] for q in quests):,} copper between them, "
          f"the fattest {rich[0]['coin'] if rich else 0}")
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
