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
from spawn_npcs import (columns, rows, split, goods_of, BOUNDS, MAP,  # noqa: E402
                        WEAPON_CLASS, WEAPON_SUBCLASS)
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
# A shirt, a chest piece and a robe: the three `InventoryType`s whose
# `subclass` decides what a man is drawn wearing — see `src/sim/outfit.ts`.
TORSO = {4, 5, 20}

# `item_template.stat_type`, as the five this game has.  The rest exist and do
# nothing here, so they are dropped rather than carried as noise.
STAT_OF = {3: 'agi', 4: 'str', 5: 'int', 6: 'spi', 7: 'sta'}


def only_some(mask):
    """The class mask, or nought when it lets everybody in this game through.

    **Three spellings of "anybody" are in the dump** — `0`, `-1` and `32767`,
    which is all fifteen bits — and `slice.py`'s `allows` knows all three
    because it is the reader.  A column shipped to the scene cannot afford
    that: two rows of the same shop caught it the day this column started
    travelling, because `2678` and `44835` are the same trade good with the
    same picture, word and price, written `-1` and `32767`.  The shop's own
    check compares the whole shipped row to decide whether two identical lines
    are one thing twice, and a difference that means nothing made them two.

    So the writer normalises and the reader asks one question.  "Every class"
    is **this slice's** classes rather than the game's fifteen, which is the
    only definition that is a fact here: a mask naming all six is a mask that
    excludes nobody who can be standing in the shop.
    """
    if mask in (0, -1):
        return 0
    every = all(mask & (1 << (CLASS_ID[c] - 1)) for c in CLASSES)
    return 0 if every else mask


def wanted(base, acore, object_loots, client, here_out=None, made=True):
    """Every item id the slice can reach, and how it reaches it.

    `made` is off when `trades.py` calls this, and that is not a nicety: the
    trades stage runs *before* this one and asks this question to decide which
    recipes the world can supply, so leaving it on would have it reading the
    last bake's answer to the question it is in the middle of answering.  The
    same trap the spellbook fell into, named this time.
    """
    from slice import within
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
        if within(x, y, MAP):
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

    # What its creatures and its chests drop, **out of the baked world**.
    #
    # This used to walk `creature_loot_template` itself, and that is the shape
    # this repository keeps paying for: two scripts deciding the same thing.
    # `spawn_npcs.py` follows the `Reference` column — 127 of the rows this
    # slice reaches point at another table rather than at an item, which is
    # what issue 146 was — and this walk did not, so **fifteen items could
    # drop that were never baked**.  A drop with no row behind it has no word,
    # no price and no picture: the bag says `물건 766`.
    #
    # One script decides what falls off a wolf, the same way `quests.py` asks
    # `npcs.json` who lives here rather than reading `creature` a second time.
    drops = set()
    for made in ('npcs.json', 'objects.json'):
        path = os.path.join(here_out, made) if here_out else None
        if not path or not os.path.exists(path):
            continue
        with open(path) as f:
            doc = json.load(f)
        for haul in doc.get('hauls', []):
            # The two files write a haul differently and both are right for
            # what they are: a creature's is `[copper low, copper high, rows]`
            # because a body has money on it, and a chest's is the rows alone.
            got = haul[2] if (haul and isinstance(haul[0], (int, float))) else haul
            for row in got or []:
                if len(row) > 5:
                    drops.add(int(row[5]))
    for item in drops:
        want[item] += 1

    # And what can be made here, and what it is made of.  `trades.py` has
    # already settled both — it runs first for exactly this reason — and the
    # two lists it names are the same kind of thing a drop is: a copper bar is
    # on no shelf and falls off nothing, and a person still ends up holding
    # one.  Read rather than re-derived, the same bargain as the hauls above.
    path = os.path.join(here_out, 'trades.json') if here_out and made else None
    if path and os.path.exists(path):
        with open(path) as f:
            for row in json.load(f).get('recipes', []):
                drops.add(int(row[5]))
                for e, _n in row[7]:
                    drops.add(int(e))
        for item in drops:
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
    #
    # **Every class's, and it was the warrior's alone.**  `outfit` takes the
    # class and defaults to one, and this line never passed it — so the day the
    # game had six classes, `player.json` handed a mage his robe by id and
    # `items.json` had no row for it.  `itemOf` answered nothing, the scene
    # skipped the piece, and five classes of six walked out wearing nothing at
    # all while the kit said otherwise.  The body sheet had plate baked into it,
    # which is why nobody could see that.
    for cls in CLASSES:
        for e in outfit(client, CLASS_ID[cls]):
            want[e] += 1
    return want, stock, here, drops


# And what the other kinds of trainer are.  A trade is learned here by doing
# it — picking a herb teaches a point of herbalism — so a person who sells
# trade ranks has nothing to sell; mounts and pets are not in this game at
# all.  Named rather than numbered so the count at the end of the bake says
# what was left out.
TRAINER_TYPE = {1: 'mounts', 2: 'trades', 3: 'beasts'}


def trainers(base, here, classes, here_out=None):
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
    # What a row that *teaches* actually hands over.  A paladin's shelf has a
    # row at level 4 whose whole content is "learn these two spells", so a
    # shelf that lists the row lists a receipt: `spells.py` follows it and
    # writes the map, and this is the one place that has to agree.
    grants = {}
    book = os.path.join(here_out, 'spells.json') if here_out else None
    if book and os.path.exists(book):
        with open(book) as f:
            grants = {int(k): v for k, v in json.load(f).get('grants', {}).items()}
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
            sid = int(f[col['SpellId']])
            for got in grants.get(sid, [sid]):
                spells.setdefault(t, []).append([
                    got, int(f[col['MoneyCost']]),
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
        # **And which class.**  `of` was the trainer's *type* and it is nought
        # on every row that gets this far, because only type 0 does — a field
        # computed once and never able to differ, which is the shape this
        # repository keeps finding.  With six classes in the game the question
        # a trainer answers is "is this one mine", and that is `Requirement`.
        out[str(creature)] = {'of': kind, 'for': req, 'teaches': spells[t]}
    if dropped:
        print('  %d trainers left out, teaching nothing this game can learn: %s'
              % (sum(dropped.values()),
                 ', '.join('%s %d' % (k, n) for k, n in sorted(
                     dropped.items(), key=lambda kv: -kv[1]))))
    return out


#: `item_template.spelltrigger_N`.  Nought is "when the player uses it"; the
#: rest are on equip, on hit and on pickup, and none of those is a button.
ON_USE = 0


def on_use(base, spells, durations):
    """`{item: [word, total, seconds]}` for everything with a use button.

    The trigger column is read rather than assumed, because an item carries
    five spell slots and only some of them are a button: a sword's on-hit
    proc and a robe's on-equip bonus sit in the same five slots as a
    bandage's mend.
    """
    import trades as craft
    out = {}
    path = os.path.join(base, 'item_template.sql')
    col = columns(path)
    for line in rows(path):
        f = split(line)
        try:
            entry = int(f[col['entry']])
        except (ValueError, KeyError, IndexError):
            continue
        for i in range(1, 6):
            key, trig = 'spellid_%d' % i, 'spelltrigger_%d' % i
            if key not in col or trig not in col:
                break
            try:
                spell, when = int(f[col[key]]), int(f[col[trig]])
            except (ValueError, IndexError):
                break
            if not spell or when != ON_USE:
                continue
            got = craft.use_of(spells, durations, spell)
            if got:
                out[entry] = got
                break
    return out


def sides(base, client, who):
    """`{creature entry: faction}` for everybody who sells or teaches here.

    Reputation changes a price, and *whose* price it changes is the shopkeeper's
    own side: `Player::GetReputationPriceDiscount` (Player.cpp:12589) takes the
    creature's faction template and looks up the standing with the faction
    behind it.  Seventy of this slice's ninety shopkeepers stand for Stormwind
    and the rest for four sides nobody can hold a standing with at all.

    Two hops and both of them are the game's: `creature_template.faction` is a
    *template* id, and `FactionTemplate.dbc` says which faction that template
    belongs to.  Reading the first as the second is a mistake this would make
    silently — template 12 and faction 12 are different things.
    """
    if not client or not os.path.isdir(client):
        return {}
    import trades as craft
    behind = {r[0]: r[1] for r in craft.dbc(client, 'FactionTemplate')}
    if not behind:
        return {}
    out = {}
    path = os.path.join(base, 'creature_template.sql')
    col = columns(path)
    for line in rows(path):
        f = split(line)
        try:
            entry = int(f[col['entry']])
        except (ValueError, KeyError, IndexError):
            continue
        if str(entry) not in who:
            continue
        side = behind.get(int(f[col['faction']]))
        if side:
            out[str(entry)] = side
    return out


#: `UNIT_NPC_FLAG_REPAIR` (UnitDefines.h:334).  `spawn_npcs.NPCFLAG` never
#: tested it, because a role is one word and an armourer is a `vendor` first —
#: so who mends is shipped beside the shelves rather than folded into a role
#: that would have to stop meaning "sells things" to carry it.
NPC_FLAG_REPAIR = 0x1000

#: `ITEM_CLASS_ARMOR`, beside `spawn_npcs.WEAPON_CLASS`.
ARMOUR_CLASS = 4


def repair_column(cls, sub):
    """Which of `DurabilityCosts.dbc`'s 29 multipliers an item is charged by.

    `ItemSubClassToDurabilityMultiplierId` (ItemTemplate.h:557): a weapon's own
    subclass, an armour's subclass plus 21, and column nought for anything
    else — which is a column of noughts, and `DurabilityRepair` turns a cost of
    nought into one copper rather than into free.
    """
    if cls == WEAPON_CLASS:
        return sub
    if cls == ARMOUR_CLASS:
        return sub + 21
    return 0


def repairers(base, here):
    """Every creature in the slice that mends, by entry.

    `WorldSession::HandleRepairItemOpcode` (NPCHandler.cpp:768) will not repair
    anything unless the creature carries the flag, so the flag is the whole
    rule for *who*.  Counted over the slice's box it is sixty-nine creatures,
    and `check_repair` prints how many of them also keep a shelf here.
    """
    out = []
    path = os.path.join(base, 'creature_template.sql')
    col = columns(path)
    for line in rows(path):
        f = split(line)
        try:
            entry, flags = int(f[col['entry']]), int(f[col['npcflag']])
        except (ValueError, KeyError, IndexError):
            continue
        if entry in here and flags & NPC_FLAG_REPAIR:
            out.append(entry)
    return sorted(out)


def repair_tables(client, items):
    """`DurabilityCosts.dbc` and `DurabilityQuality.dbc`, as numbers.

    `Player::DurabilityRepair` (Player.cpp:4940) charges
    `lost * costs[item level][column] * quality[(Quality + 1) * 2]`, and both
    tables are the client's — AzerothCore reads them at start-up and its dump
    has no rows for either.  Only the item levels something here can reach are
    shipped; the quality table is sixteen rows and goes whole.

    **The quality multiplier is a float32 and is shipped as one.**  The core
    multiplies by `double(quality_mod)`, so poor's 0.6 is 0.6000000238… and a
    truncation to a whole copper can land on the other side of an integer from
    the rounded number.  Measured over every item that wears in this world and
    every number of points it can lose, it does not — not once — so this is
    written the core's way for the day it would rather than for a price it
    changes now.  JSON keeps the double the float widens to.
    """
    if not client or not os.path.isdir(client):
        return None
    import bake_terrain as terrain
    got = {}
    for name, want in (('DurabilityCosts', 30), ('DurabilityQuality', 2)):
        data = terrain.read_dbc(terrain.Client(client), name)
        if not data:
            return None
        _magic, n, fields, rsize, _sb = struct.unpack_from('<4sIIII', data, 0)
        # The layout is asserted rather than trusted, the way `spells.py`
        # holds spell 78 to a rage cost of 15: an id and 29 multipliers, and
        # an id and a float.  A layout that is off by a field cannot put every
        # row's id equal to its own index.
        assert fields == want and rsize == 4 * want, (name, fields, rsize)
        fmt = '<%di' % fields if want == 30 else '<If'
        got[name] = [struct.unpack_from(fmt, data, 20 + i * rsize)
                     for i in range(n)]
        assert all(r[0] == i + 1 for i, r in enumerate(got[name])), name
    levels = {v[3] for v in items.values() if v[16]}
    costs = {str(r[0]): list(r[1:]) for r in got['DurabilityCosts']
             if r[0] in levels}
    quality = {str(r[0]): r[1] for r in got['DurabilityQuality']}
    return {'costs': costs, 'quality': quality}


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
    want, stock, here, drops = wanted(base, acore, object_loots, client, out)

    # What each item does when it is used, out of the client.  A machine with
    # no client bakes a world where nothing is drinkable, which is the same
    # bargain every other client-fed column makes.
    uses = {}
    if client and os.path.isdir(client):
        import trades as craft
        spells = {r[0]: r for r in craft.dbc(client, 'Spell')}
        durations = {r[0]: r[1] for r in craft.dbc(client, 'SpellDuration')}
        if spells:
            uses = on_use(base, spells, durations)

    ipath = os.path.join(base, 'item_template.sql')
    col = columns(ipath)
    items, skipped, gated = {}, 0, Counter()
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
            # How much wear it takes before it stops counting.  Nought is an
            # item with no durability at all — a shirt, a ring, a potion —
            # and `Player::DurabilityLoss` (Player.cpp:4830) leaves those be.
            dura = int(f[col['MaxDurability']])
        except (ValueError, KeyError, IndexError):
            skipped += 1
            continue
        # Whether **anybody in this game** could ever hold it.  -1 is
        # "anybody", which is most things; a bitmask that excludes all six of
        # this slice's classes means the row is somebody else's and has no
        # business in this world's shops.
        #
        # That is now a coarser question than it used to be, and the column
        # has to travel because of it: with one class, "in the bake" and "for
        # me" were the same sentence, and with six a mage's robe passes this
        # gate and is still not a warrior's.  The mask is shipped and
        # `src/sim/gear.ts` asks it again for the character who is actually
        # standing there.
        if not allows(allow_c, CLASS_MASK):
            continue
        if not allows(allow_r, RACE_MASK):
            continue
        # Nothing this game could ever use.  The ceiling is the slice's own —
        # a level 60 breastplate in a shop is a row nobody can buy and a
        # kilobyte of a world nobody can reach.
        #
        # **Except what actually falls off something here** — or comes off a
        # workbench.  A ceiling is a rule about shelves, and neither a drop nor
        # a thing you made yourself is a shelf: a level fourteen sword off a
        # level eight bandit is the original's own behaviour and the player
        # sells it, and a copper chain belt is level fourteen and the point of
        # learning to smith.  Thirty-nine items were dropping with no row
        # behind them because this line did not know the first difference.
        if (need > LEVELS[1] or ilvl > LEVELS[1] + 10) and e not in drops:
            continue
        # And nothing that asks for a standing this game cannot reach.
        #
        # It has standings now (issue 201) and these twelve are still out,
        # which is the point of counting them *by what they ask for* rather
        # than counting them at all: every one of them wants **rank 7,
        # 숭배**, with a side no errand in this slice pays a copper of.
        # `PlayerStorage.cpp:2344` is where the server refuses one, so leaving
        # them on the shelf is twelve rows nobody can buy.
        want_side = int(f[col['RequiredReputationFaction']])
        if want_side:
            gated[(want_side, int(f[col['RequiredReputationRank']]))] += 1
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
            # Which of the five drawn kinds it is, or nothing.
            #
            # This used to be guessed in `src/main.ts` — two-handed meant an
            # axe, fast meant a dagger, everything else a sword — and a guess
            # with three answers cannot reach five: `mace` and `staff` were
            # pictures cut, packed, rendered and unreachable.  `subclass` is
            # the column that says, `spawn_npcs.WEAPON_SUBCLASS` is already
            # reading it for what an NPC carries, and one vocabulary for
            # "what is that thing" is the whole point of importing it rather
            # than writing the table out again.
            WEAPON_SUBCLASS.get(sub, '') if cls == WEAPON_CLASS else '',
            # Which classes may hold it at all, normalised — see `only_some`.
            only_some(allow_c),
            # And what pressing it does, or nothing.  A bandage that mends
            # nobody is the shape this repository keeps finding: a thing
            # computed, shipped and never read.  Issue 200 put a first aid
            # trainer in the game, so the bandage it teaches has to work.
            uses.get(e) or 0,
            # And how much wear, and which column of the repair table it is
            # charged by — issue 83.  Both are read by `src/sim/durability.ts`.
            dura,
            repair_column(cls, sub) if dura else 0,
            # And the two columns the picture needs, as they are.  `SLOTS`
            # folds `InventoryType` 5 and 20 into one `chest`, which is right
            # for where a thing goes and wrong for what a man looks like in
            # it: a robe is not a breastplate.  `src/sim/outfit.ts` reads them.
            #
            # **Only for the three shapes of torso, and nought for the rest.**
            # Shipped for every row, five oddments on one shelf — identical in
            # every column before, and counted by the shop's own check as one
            # thing listed five times — came apart on a `subclass` of 2, 3 and
            # 8 that nothing draws or says, and read as five different things
            # nobody could tell apart.  `only_some` above is the same lesson.
            sub if inv in TORSO else 0, inv if inv in TORSO else 0,
        ]

    # Vendor rows whose item is not in the baked set are rows nobody can buy.
    for e, rows_ in list(stock.items()):
        stock[e] = [r for r in rows_ if str(r[0]) in items]
        if not stock[e]:
            del stock[e]

    teach = trainers(base, here, CLASSES, out)

    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, 'items.json')
    doc = {'items': items, 'stock': stock, 'trainers': teach,
           'of': sides(base, client, set(stock) | set(teach))}
    # Who mends and what it costs.  A machine with no client has the first
    # half and not the second, and a repair with no price is not offered —
    # the same bargain every other client-fed column makes.
    mend = repair_tables(client, items)
    if mend:
        mend['by'] = repairers(base, here)
        doc['repair'] = mend
    with open(path, 'w') as f:
        json.dump(doc, f)

    check(doc)
    check_repair(doc)
    check_lessons(doc, out)
    check_rewards(doc, out)
    check_loot(doc, out)
    check_recipes(doc, out)
    purse(out, doc)
    worn = sum(1 for v in items.values() if v[1])
    print(f'{len(items):,} items ({worn} wearable) -> {path}')
    print(f'  {len(stock)} vendors stocking '
          f'{sum(len(v) for v in stock.values())} rows')
    if gated:
        ranks = sorted({r for _f, r in gated})
        print(f'  {sum(gated.values())} left out for asking a standing nothing '
              f'here pays — {len({f for f, _r in gated})} sides, '
              f'rank{"s" if len(ranks) > 1 else ""} '
              f'{", ".join(str(r) for r in ranks)} of 7')
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
    # What the dearest class is asked for on the way to the ceiling.
    #
    # **The dearest and not the warrior's**, which is the only honest reading
    # with six of them: the question is whether this zone can pay for the
    # lessons of whoever is playing, and a game that funds five classes and
    # strands the sixth fails for that one player and nobody else.  A lesson
    # list is per trainer, so the same class's several trainers agree and the
    # maximum over trainers is the maximum over classes.
    lessons, dearest = 0, None
    for t in doc['trainers'].values():
        if t['of'] != 0:                      # 0 is a class trainer
            continue
        bill = sum(cost for _id, cost, *_ in t['teaches'])
        if bill > lessons:
            lessons, dearest = bill, t.get('for')
    # And the best one of each slot he could **buy**, which is the other end.
    #
    # Off the shelves and not out of the whole catalogue.  The catalogue now
    # holds everything that can drop, including a level fourteen sword off a
    # level eight bandit — and counting those as the thing to save up for put
    # the far end of this at 150,180 copper, which is not a shop, it is a
    # wishlist.  The question is whether the zone's money can buy out its
    # shops, so the sum is what its shops sell.
    best = {}
    for rows_ in doc['stock'].values():
        for row in rows_:
            it = doc['items'].get(str(row[0]))
            if not it or not it[1]:
                continue
            if it[3] > best.get(it[1], (0, 0))[0]:
                best[it[1]] = (it[3], it[9])
    kit = sum(price for _lvl, price in best.values())
    earn = coin + drops
    print(f'check: the slice pays about {earn:,.0f} copper — {coin:,} from '
          f'errands and {drops:,.0f} off what dies and what is skinned — '
          f'against {lessons:,} for every lesson the dearest class '
          f'(id {dearest}) is sold and {kit:,} for the best of every slot '
          f'its shops sell')
    assert earn >= lessons, (
        'the zone cannot pay for its own trainer: %d against %d'
        % (earn, lessons))
    # **Gear costs more than training**, which is the decision this stretch of
    # the game has: the trainer is a fixed bill and the shelves are a choice.
    #
    # This line used to read `earn < lessons + kit` — *the zone must not pay
    # for everything* — and it passed on a number that meant nothing.  `kit`
    # was the dearest item **in the catalogue** for each slot, which includes
    # things no shop stocks and things only a quest pays; measured off the
    # shelves instead it is 5,852 rather than 34,700, and the old claim is
    # simply false: the money in this zone does buy out its shops.  That is a
    # fact about the economy and belongs on the wiki page rather than in an
    # assertion propped up by the wrong denominator.  See issue 199.
    assert kit > lessons, (
        'the shops are cheaper than the trainer, so there is nothing to '
        'choose between: %d against %d' % (kit, lessons))


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


def check_repair(doc):
    """Everything that wears out has a price to mend, and somebody to mend it.

    `Player::DurabilityRepair` logs "Wrong item lvl" and charges nothing when
    `DurabilityCosts.dbc` has no row for the level (Player.cpp:4943) — which in
    this game would be an item that breaks and can never be fixed, and nothing
    on screen would say why.
    """
    mend = doc.get('repair')
    if not mend:
        print('check: no client, so nothing can be repaired in this world')
        return
    worn = [(k, v) for k, v in doc['items'].items() if v[16]]
    orphans = [k for k, v in worn if str(v[3]) not in mend['costs']
               or str((v[2] + 1) * 2) not in mend['quality']]
    shops = [e for e in mend['by'] if str(e) in doc['stock']]
    print(f'check: {len(worn)} items wear out, {len(orphans)} with no repair '
          f'price; {len(mend["by"])} creatures mend, {len(shops)} of them '
          f'with a shelf')
    assert not orphans, f'an item that cannot be priced for repair: {orphans[:5]}'
    assert shops, 'nobody in this world both sells and mends'


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


def check_loot(doc, out):
    """Everything that can fall off something here has a row behind it.

    The closure issue 199 asked to close, and it was open: **54 of the 154
    items this slice's loot tables point at were not baked.**  A drop with no
    row has no word, no price and no picture — the bag says `물건 766` — and
    nothing anywhere said so, because the two halves were computed by two
    scripts.  `spawn_npcs.py` follows `Reference` and this did not (fifteen
    items), and this refused anything over the slice's level ceiling, which is
    a rule about *shelves* (thirty-nine).

    Checked against the baked spawns and objects rather than against the
    tables, for the same reason the gathering does: one script decides what
    falls off a wolf.
    """
    want = set()
    for made in ('npcs.json', 'objects.json'):
        path = os.path.join(out, made)
        if not os.path.exists(path):
            continue
        with open(path) as f:
            doc2 = json.load(f)
        for haul in doc2.get('hauls', []):
            got = haul[2] if (haul and isinstance(haul[0], (int, float))) else haul
            for row in got or []:
                if len(row) > 5:
                    want.add(int(row[5]))
    stray = sorted(i for i in want if str(i) not in doc['items'])
    print(f'check: {len(want)} things can fall off something here, '
          f'{len(stray)} of them with no row behind them')
    assert not stray, f'loot points at items nobody baked: {stray[:8]}'


def check_recipes(doc, out):
    """And the same closure one turn further out, for what is made here.

    A recipe names two kinds of item that need be on no shelf and fall off
    nothing — what it takes and what it makes — and both of them end up in a
    bag with a word, a price and a picture, or they end up as `물건 2840`.
    `trades.py` decided the recipes and this is the other side of the same
    promise, read off the two shipped files.
    """
    path = os.path.join(out, 'trades.json')
    if not os.path.exists(path):
        print('check: no trades baked yet, so no recipes checked')
        return
    with open(path) as f:
        made = json.load(f).get('recipes', [])
    want = set()
    for row in made:
        want.add(int(row[5]))
        for e, _n in row[7]:
            want.add(int(e))
    stray = sorted(i for i in want if str(i) not in doc['items'])
    print(f'check: {len(made)} recipes name {len(want)} things, '
          f'{len(stray)} of them with no row behind them')
    assert not stray, f'a recipe points at items nobody baked: {stray[:8]}'


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
    # **Per class, and that is the point of the check now.**  Against the
    # union of six books this would pass while a warrior trainer sold
    # frostbolt, which is the exact bug it was written to catch — it is only a
    # check at all if the book it compares against is the book of the class
    # the trainer teaches.
    by_id = {int(k): {r['id'] for r in rows_}
             for k, rows_ in book.get('books', {}).items()}
    taught, stray = set(), []
    for who, t in doc['trainers'].items():
        mine = by_id.get(t.get('for'), set())
        for row in t['teaches']:
            taught.add(row[0])
            if row[0] not in mine:
                stray.append((who, t.get('for'), row[0]))
    print(f'check: {len(doc["trainers"])} trainers over {len(by_id)} classes '
          f'teaching {len(taught)} things, {len(stray)} of them not in the '
          f'book of the class that sells them')
    assert not stray, f'a trainer sells what its class cannot cast: {stray[:8]}'


if __name__ == '__main__':
    main(os.path.expanduser(sys.argv[1] if len(sys.argv) > 1
                            else '~/src/azerothcore-wotlk'),
         os.path.expanduser(sys.argv[2] if len(sys.argv) > 2
                            else '~/workspace/warmane'),
         sys.argv[3] if len(sys.argv) > 3 else 'public/world')
