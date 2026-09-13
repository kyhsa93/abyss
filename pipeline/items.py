#!/usr/bin/env python3
"""The things in this world you can hold, wear, buy and be taught.

  python3 pipeline/items.py [azerothcore] [client] [out]

`you.bag` was `{our word: [how many, what it is worth]}`.  You could count
eleven bits of cloth; you could not hold a sword, because an item lost its id
on the way in and became a noun.  So nothing could be worn, nothing changed a
stat, and the fifty-eight paperdoll renders committed in `public/art/doll/` had
nobody to call them.

This bakes the items the slice actually touches — what its vendors stock, what
its creatures and chests drop, what its quests pay, and what a new character is
handed — with the columns that decide whether you can wear a thing and what it
does for you.  **Not the whole of `item_template`**: 46,096 rows is a megabyte
of a world nobody in this forest can reach.

Names never leave.  An item comes out as an id, one of our own words for what
sort of thing it is, and its numbers.
"""
import json
import os
import re
import struct
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from spawn_npcs import columns, rows, split, goods_of, BOUNDS, MAP  # noqa: E402
from slice import (LEVELS, CLASSES, REACH_OVER, CLASS_ID,  # noqa: E402
                   CLASS_MASK, RACE_MASK, allows)
from player import outfit  # noqa: E402

# `AllowableClass` and `AllowableRace` are bitmasks over the class and race
# ids, and `slice.py` builds this game's out of the words in `slice.json`.
# This file used to open `HUMAN, WARRIOR = 1, 1` while carrying its own
# name-to-id table two hundred lines down and using it for trainers only —
# which is the shape of thing that lets `quests.py` filter on neither.

# `InventoryType`, which is where a thing goes.  Only the slots this game has
# a paperdoll layer for; anything else comes out as 0 and is carried, not worn.
SLOTS = {
    1: 'head', 3: 'shoulder', 4: 'shirt', 5: 'chest', 6: 'belt', 7: 'legs',
    8: 'feet', 9: 'wrist', 10: 'hands', 13: 'weapon', 14: 'offhand',
    15: 'ranged', 16: 'back', 17: 'weapon', 20: 'chest', 21: 'weapon',
    22: 'offhand', 23: 'offhand', 26: 'ranged',
}
# The two-handed ones, which matter because they take the off hand with them.
TWO_HANDED = {17, 26}

# `item_template.stat_type`, as the five this game has.  The rest exist and do
# nothing here, so they are dropped rather than carried as noise.
STAT_OF = {3: 'agi', 4: 'str', 5: 'int', 6: 'spi', 7: 'sta'}


def wanted(base, acore, object_loots, client):
    """Every item id the slice can reach, and how it reaches it."""
    from slice import BOUNDS as B
    want = Counter()

    # What its vendors sell.  `npc_vendor` is keyed on the creature entry, and
    # which creatures are in the slice is what `spawn_npcs.py` already works
    # out — so it is asked the same way, off `creature` filtered by position.
    here = set()
    cpath = os.path.join(base, 'creature.sql')
    col = columns(cpath)
    for line in rows(cpath):
        f = split(line)
        try:
            if int(f[col['map']]) != MAP:
                continue
            x, y = float(f[col['position_x']]), float(f[col['position_y']])
        except (ValueError, KeyError, IndexError):
            continue
        if B[0] <= x <= B[1] and B[2] <= y <= B[3]:
            here.add(int(f[col['id1']]))

    vpath = os.path.join(base, 'npc_vendor.sql')
    vcol = columns(vpath)
    stock = {}
    for line in rows(vpath):
        f = split(line)
        try:
            e, item = int(f[vcol['entry']]), int(f[vcol['item']])
            most, back = int(f[vcol['maxcount']]), int(f[vcol['incrtime']])
        except (ValueError, KeyError, IndexError):
            continue
        if e not in here:
            continue
        want[item] += 1
        stock.setdefault(str(e), []).append([item, most, back])

    # What its creatures and its chests drop — and only theirs.  A loot id has
    # to be chased back through `creature_template.lootid`, because taking the
    # loot tables whole is nine and a half thousand items, which is most of a
    # megabyte of a world nobody in this forest can reach.
    loots = set()
    tpath = os.path.join(base, 'creature_template.sql')
    tcol = columns(tpath)
    for line in rows(tpath):
        f = split(line)
        try:
            if int(f[tcol['entry']]) in here:
                for key in ('lootid', 'pickpocketloot', 'skinloot'):
                    if key in tcol and int(f[tcol[key]]):
                        loots.add(int(f[tcol[key]]))
        except (ValueError, KeyError, IndexError):
            continue
    for table, keep in (('creature_loot_template', loots),
                        ('gameobject_loot_template', None)):
        path = os.path.join(base, table + '.sql')
        if not os.path.exists(path):
            continue
        lc = columns(path)
        for line in rows(path):
            f = split(line)
            try:
                lid, item = int(f[lc['Entry']]), int(f[lc['Item']])
            except (ValueError, KeyError, IndexError):
                continue
            if keep is not None and lid not in keep:
                continue
            if keep is None and lid not in object_loots:
                continue
            want[item] += 1

    # What its quests pay.
    #
    # The slots are counted rather than typed: there are four fixed rewards
    # and **six** to choose between, and this loop said `range(1, 5)` for
    # both.  So a choice in slot five or six was an item this world never
    # baked — item 1159, a staff of level five, offered by the errand a level
    # four warrior is sent on.  A loop that has to agree with a table is a
    # loop that stops agreeing.
    qpath = os.path.join(base, 'quest_template.sql')
    qcol = columns(qpath)
    pays = [k for k in qcol
            if re.fullmatch(r'RewardItem\d+|RewardChoiceItemID\d+', k)]
    for line in rows(qpath):
        f = split(line)
        for key in pays:
            try:
                v = int(f[qcol[key]])
            except (ValueError, IndexError):
                continue
            if v:
                want[v] += 1
    # And what a new character is created holding.  `CharStartOutfit.dbc` names
    # five items and not one of them was baked, because the slice's filter asks
    # what a vendor sells, what a creature drops and what an errand pays — and
    # nobody sells you the shirt you were made in.
    for e in outfit(client):
        want[e] += 1
    return want, stock, here


# And what the other kinds of trainer are.  A trade is learned here by doing
# it — picking a herb teaches a point of herbalism — so a person who sells
# trade ranks has nothing to sell; mounts and pets are not in this game at
# all.  Named rather than numbered so the count at the end of the bake says
# what was left out.
TRAINER_TYPE = {1: 'mounts', 2: 'trades', 3: 'beasts'}


def trainers(base, here, classes):
    """What each trainer teaches, what it costs and what it needs first.

    **Filtered to the classes this slice has**, which it was not.  Sixty-nine
    trainers taught 801 distinct spells in a game whose only class is a human
    warrior, and eleven of those spells were his: the first trainer in the
    list sold frostbolt, fireball and conjure water.  Buying one was not even
    refused — the id went into `taught` and was quietly dropped a second time
    by `known()`, so there was a way to pay money for nothing.

    The answer was in the table all along.  `trainer.Type` says what kind of
    trainer it is and `trainer.Requirement` says which class, and the bake
    read the first and dropped the second.  Type 0 is a class trainer and its
    requirement is the class; everything else — professions, riding — asks for
    a skill or a level instead, and none of those is in this game yet.
    """
    want = {CLASS_ID[c] for c in classes if c in CLASS_ID}
    if len(want) != len(classes):
        sys.exit('slice.json names a class this table has no number for: %s'
                 % ', '.join(sorted(set(classes) - set(CLASS_ID))))
    tid, meta, spells = {}, {}, {}
    path = os.path.join(base, 'creature_default_trainer.sql')
    col = columns(path)
    for line in rows(path):
        f = split(line)
        tid[int(f[col['CreatureId']])] = int(f[col['TrainerId']])
    path = os.path.join(base, 'trainer.sql')
    col = columns(path)
    for line in rows(path):
        f = split(line)
        meta[int(f[col['Id']])] = (int(f[col['Type']]),
                                   int(f[col['Requirement']]))
    path = os.path.join(base, 'trainer_spell.sql')
    col = columns(path)
    for line in rows(path):
        f = split(line)
        try:
            t = int(f[col['TrainerId']])
            lv = int(f[col['ReqLevel']]) or 1
            if lv > LEVELS[1]:
                continue
            spells.setdefault(t, []).append([
                int(f[col['SpellId']]), int(f[col['MoneyCost']]),
                lv, int(f[col['ReqSkillLine']]),
                int(f[col['ReqAbility1']])])
        except (ValueError, KeyError, IndexError):
            continue
    out = {}
    dropped = {}
    for creature, t in tid.items():
        if t not in spells or (here and creature not in here):
            continue
        kind, req = meta.get(t, (0, 0))
        # A class trainer for a class nobody here plays teaches nothing to
        # anybody here.  Counted and printed rather than silently skipped:
        # this repository's own rule is that every "we left this out" is a
        # number somebody can read.
        if kind != 0:
            dropped[TRAINER_TYPE.get(kind, kind)] = \
                dropped.get(TRAINER_TYPE.get(kind, kind), 0) + 1
            continue
        if req not in want:
            byname = {v: k for k, v in CLASS_ID.items()}
            key = byname.get(req, req)
            dropped[key] = dropped.get(key, 0) + 1
            continue
        out[str(creature)] = {'of': kind, 'teaches': spells[t]}
    if dropped:
        print('  %d trainers left out, teaching nothing this game can learn: %s'
              % (sum(dropped.values()),
                 ', '.join('%s %d' % (k, n) for k, n in sorted(
                     dropped.items(), key=lambda kv: -kv[1]))))
    return out


def main(acore, client, out):
    base = os.path.join(acore, 'data/sql/base/db_world')
    # Which chests' loot tables this world actually stands — `objects.py` has
    # already worked out which game objects are in the slice, so its output is
    # the honest filter rather than a second walk of the same tables.
    object_loots = set()
    made = os.path.join(out, 'objects.json')
    if os.path.exists(made):
        with open(made) as f:
            for row in json.load(f).get('objects', []):
                object_loots.add(row[8])
    want, stock, here = wanted(base, acore, object_loots, client)

    ipath = os.path.join(base, 'item_template.sql')
    col = columns(ipath)
    items, skipped, gated = {}, 0, 0
    for line in rows(ipath):
        f = split(line)
        try:
            e = int(f[col['entry']])
        except (ValueError, KeyError, IndexError):
            continue
        if e not in want:
            continue
        try:
            cls, sub = int(f[col['class']]), int(f[col['subclass']])
            inv = int(f[col['InventoryType']])
            allow_c = int(f[col['AllowableClass']])
            allow_r = int(f[col['AllowableRace']])
            need = int(f[col['RequiredLevel']])
            quality = int(f[col['Quality']])
            ilvl = int(f[col['ItemLevel']])
            buy, sell = int(f[col['BuyPrice']]), int(f[col['SellPrice']])
            count = max(1, int(f[col['BuyCount']]))
            lo = round(float(f[col['dmg_min1']]), 1)
            hi = round(float(f[col['dmg_max1']]), 1)
            delay = int(f[col['delay']])
            armour = int(f[col['armor']])
            # Which of the food types it is, or nothing for anything that is
            # not food.  `FoodType` is the only column that tells two of
            # Goldshire's shop rows apart — see `FOOD_TYPE`.
            food = int(f[col['FoodType']]) if 'FoodType' in col else None
        except (ValueError, KeyError, IndexError):
            skipped += 1
            continue
        # Whether a human warrior could ever hold it.  -1 is "anybody", which
        # is most things; a bitmask that excludes him means the row is another
        # class's and has no business in this world's shops.
        if not allows(allow_c, CLASS_MASK):
            continue
        if not allows(allow_r, RACE_MASK):
            continue
        # Nothing this game could ever use.  The ceiling is the slice's own —
        # a level 60 breastplate in a shop is a row nobody can buy and a
        # kilobyte of a world nobody can reach.
        if need > LEVELS[1] or ilvl > LEVELS[1] + 10:
            continue
        # And nothing that asks for a standing, because this game has no
        # standings.  Twelve of them are on the slice's own shelves —
        # `PlayerStorage.cpp:2344` is where the server refuses one — so
        # leaving them there is a shop with twelve rows in it that cannot be
        # bought, which is the same shape of hole `check()` below exists to
        # catch on the other side.
        if int(f[col['RequiredReputationFaction']]):
            gated += 1
            continue
        stats = []
        for i in range(1, 11):
            tk, vk = 'stat_type%d' % i, 'stat_value%d' % i
            if tk not in col:
                break
            try:
                t, v = int(f[col[tk]]), int(f[col[vk]])
            except (ValueError, IndexError):
                break
            if v and t in STAT_OF:
                stats.append([STAT_OF[t], v])
        items[str(e)] = [
            goods_of(cls, sub, food),    # our word for what it is
            SLOTS.get(inv, ''),          # where it goes, or nowhere
            quality, ilvl, need,
            lo, hi, delay, armour,
            buy // count, sell,
            1 if inv in TWO_HANDED else 0,
            stats,
        ]

    # Vendor rows whose item is not in the baked set are rows nobody can buy.
    for e, rows_ in list(stock.items()):
        stock[e] = [r for r in rows_ if str(r[0]) in items]
        if not stock[e]:
            del stock[e]

    teach = trainers(base, here, CLASSES)

    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, 'items.json')
    doc = {'items': items, 'stock': stock, 'trainers': teach}
    with open(path, 'w') as f:
        json.dump(doc, f)

    check(doc)
    check_lessons(doc, out)
    check_rewards(doc, out)
    purse(out, doc)
    worn = sum(1 for v in items.values() if v[1])
    print(f'{len(items):,} items ({worn} wearable) -> {path}')
    print(f'  {len(stock)} vendors stocking '
          f'{sum(len(v) for v in stock.values())} rows')
    if gated:
        print(f'  {gated} left out for asking a standing this game has no '
              f'way to earn — see the reputation note in issue 152')
    print(f'  {len(teach)} trainers teaching '
          f'{sum(len(t["teaches"]) for t in teach.values())} things')
    by = Counter(v[1] for v in items.values() if v[1])
    print('  slots: ' + '  '.join(f'{k} {v}' for k, v in by.most_common()))


def purse(out, doc):
    """Can the zone pay for its own lessons, and not for everything?

    Two questions the economy page asks and nothing answered.  If the money in
    the slice will not cover the trainer, progress is blocked; if it covers the
    trainer *and* the best of everything on the shelves, the economy is a
    procedure rather than a decision — you buy it all in some order and the
    order does not matter.

    Quest money is exact (`quest_template.RewardMoney`, through
    `quests.json`).  What a creature carries is a distribution, so it is taken
    at its expectation: chance times count times what it sells for, over
    everything that is actually spawned.  **The skin counts too** — a carcass
    is two pockets, and leather is the steadiest income at these levels, which
    is the argument for gathering it at all.
    """
    quests = os.path.join(out, 'quests.json')
    npcs = os.path.join(out, 'npcs.json')
    if not (os.path.exists(quests) and os.path.exists(npcs)):
        return
    # Only what a character of *these* levels can do.  The slice's box reaches
    # corners of four zones, so summing every quest in it counts errands for a
    # level sixty — which is how the first run of this came out at a million
    # copper and decided the economy was free.
    reach = LEVELS[1] + REACH_OVER
    with open(quests) as f:
        coin = sum(q.get('coin', 0) for q in json.load(f).get('quests', [])
                   if 0 < q.get('level', 0) <= reach)
    with open(npcs) as f:
        world = json.load(f)
    hauls = world.get('hauls', [])
    drops = 0.0
    for row in world.get('npcs', []):
        h = row[8] if len(row) > 8 else -1
        if h is None or h < 0 or h >= len(hauls):
            continue
        if row[4] > reach:
            continue
        for which in (h, row[18] if len(row) > 18 else -1):
            if which is None or which < 0 or which >= len(hauls):
                continue
            lo, hi, items = hauls[which]
            drops += (lo + hi) / 2
            for _word, chance, clo, chi, sell, *_ in items:
                drops += (chance / 100.0) * ((clo + chi) / 2) * sell
    # What a warrior is asked for on the way to the ceiling.
    lessons = 0
    for t in doc['trainers'].values():
        if t['of'] != 0:                      # 0 is a class trainer
            continue
        lessons = max(lessons, sum(cost for _id, cost, *_ in t['teaches']))
    # And the best one of each slot he could wear, which is the other end.
    best = {}
    for it in doc['items'].values():
        slot = it[1]
        if not slot:
            continue
        if it[3] > best.get(slot, (0, 0))[0]:
            best[slot] = (it[3], it[9])
    kit = sum(price for _lvl, price in best.values())
    earn = coin + drops
    print(f'check: the slice pays about {earn:,.0f} copper — {coin:,} from '
          f'errands and {drops:,.0f} off what dies and what is skinned — '
          f'against {lessons:,} for every lesson and {kit:,} for the best of '
          f'every slot')
    assert earn >= lessons, (
        'the zone cannot pay for its own trainer: %d against %d'
        % (earn, lessons))
    assert earn < lessons + kit, (
        'the zone pays for everything, so spending it is not a decision')


def check(doc):
    """Every row in a shop has to be a thing this world knows about.

    A vendor list naming an item that was never baked is a shop with a hole in
    it, and the hole is invisible: the count in the conversation comes from the
    same table the shop does, so it would say twelve and sell eleven.
    """
    items, stock = doc['items'], doc['stock']
    missing = [it for rows_ in stock.values() for it, *_ in rows_
               if str(it) not in items]
    print(f'check: {sum(len(v) for v in stock.values())} things for sale, '
          f'{len(missing)} of them not in this world')
    assert not missing, f'a vendor sells what was never baked: {missing[:5]}'


def check_rewards(doc, out):
    """And every item an errand pays has to be one this world knows about.

    The wiki asked for this by name and it would have failed the day it was
    written: item 1159, a staff of level five, is the fifth of the five things
    the errand a level four warrior is sent on lets you choose between — and
    `wanted()` walked four choice slots because somebody typed a four next to a
    table that has six.
    """
    made = os.path.join(out, 'quests.json')
    if not os.path.exists(made):
        return
    with open(made) as f:
        quests = json.load(f).get('quests', [])
    pays = {it for q in quests for it, _n in q.get('gives', []) + q.get('pick', [])}
    missing = sorted(it for it in pays if str(it) not in doc['items'])
    print(f'check: {len(pays)} things an errand can pay, '
          f'{len(missing)} of them not in this world')
    assert not missing, f'an errand pays what was never baked: {missing[:5]}'


def check_lessons(doc, out):
    """And every lesson has to be a thing this character can hold.

    The line the wiki's economy page asked for and nobody had written.  Put in
    while it was missing it would have failed 801 to 11: sixty-nine trainers
    taught 801 distinct spells into a game whose only class is a human
    warrior, and the first of them sold frostbolt and fireball.  `__learn`
    took the money and `known()` dropped the spell a second time on the way
    out, so there was a way to pay for nothing.

    Checked against `spells.json`, which is baked by a different stage off a
    different table — so this is two independent derivations agreeing, and not
    a filter admiring itself.
    """
    path = os.path.join(out, 'spells.json')
    if not os.path.exists(path):
        print('check: no spellbook baked yet, so no lessons checked')
        return
    with open(path) as f:
        book = json.load(f)
    known = {row[0] if isinstance(row, list) else row['id']
             for row in book.get('spells', [])}
    taught = {row[0] for t in doc['trainers'].values() for row in t['teaches']}
    stray = sorted(taught - known)
    print(f'check: {len(doc["trainers"])} trainers teaching {len(taught)} '
          f'things, {len(stray)} of them not in the spellbook')
    assert not stray, f'a trainer sells what nobody can cast: {stray[:8]}'


if __name__ == '__main__':
    main(os.path.expanduser(sys.argv[1] if len(sys.argv) > 1
                            else '~/src/azerothcore-wotlk'),
         os.path.expanduser(sys.argv[2] if len(sys.argv) > 2
                            else '~/workspace/warmane'),
         sys.argv[3] if len(sys.argv) > 3 else 'public/world')
