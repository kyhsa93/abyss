#!/usr/bin/env python3
"""What a person can learn to make, and what it takes to make it.

Thirteen trade trainers stand in this slice — cooking, first aid, mining,
herbalism, skinning, alchemy, smithing, tailoring, leatherworking, engineering,
enchanting, fishing, inscription — and until now not one of them taught
anything.  Half the loop already turned: a vein gives ore and a corpse gives a
hide, and then the ore and the hide sat in the bag for ever.  This is the other
half.

Everything here is a join and none of it is a table typed out again:

* **Which trades are here** is `trainer.Type == 2` for a trainer whose creature
  stands inside the slice's bounds, the same test `items.trainers` uses for
  class trainers.  The *skill* is `trainer_spell.ReqSkillLine` and not
  `trainer.Requirement`, which is the class column and nought on every trade
  row in the dump.
* **How far a trade can go** is the rank chain.  `Apprentice Cooking` is a
  spell with `SPELL_EFFECT_SKILL_STEP`, and `Spell::EffectLearnSkill`
  (SpellEffects.cpp:2813) sets the ceiling to `damage * 75` — so apprentice is
  75, journeyman 150, and which of them this game can reach falls out of the
  trainer row's own `ReqSkillRank` and `ReqLevel` against `LEVELS[1]`.
* **What a trade can make** is `SkillLineAbility.dbc` filed under the skill,
  kept where the spell has `SPELL_EFFECT_CREATE_ITEM`.  The reagents are
  `Spell.dbc`'s own eight slots.
* **Whether a person can ever hold that recipe** is one of three: the skill
  rules hand it over (`AcquireMethod` 1 or 2 — the same column
  `Player::LearnSkillRewardedSpells` reads, and the same one `spells.py`
  already reads for a class's free abilities), a trainer in *this* slice sells
  it, or a recipe lies somewhere in this slice that teaches it.

The last of those is the shape issue 199 was: a thing that points at a second
thing is only real if the second thing is here too.  A recipe whose reagent
this world cannot yield is a row in a list that can never be pressed, so it is
dropped here rather than shipped and explained in the interface.
"""

import json
import os
import struct
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from spawn_npcs import columns, rows, split, SKILL_NAME  # noqa: E402
from slice import LEVELS, MAP, within  # noqa: E402

#: `Spell.dbc` fields, the same numbers `spells.py` reads and for the same
#: reason: an offset is a fact about the file and not a preference.
F_EFFECT, F_DIE, F_BASE = 71, 74, 80
F_REAGENT, F_REAGENT_COUNT = 52, 60
F_ITEM_TYPE, F_MISC, F_TRIGGER = 107, 110, 116
F_DURATION, F_AURA, F_PERIOD = 40, 95, 98

E_CREATE_ITEM, E_LEARN, E_SKILL_STEP = 24, 36, 44

#: And the one trade nothing in the world carries a lock for.  A vein and a
#: herb say which trade opens them; a carcass does not, because it is the
#: *spell* that skins, and the spell is filed under a skill like every other.
E_SKINNING = 95

#: `SkillLineAbility.dbc`.  Field 7 is the rank the ability itself asks for,
#: 9 is how it is come by, and 10 and 11 are the two numbers the skill-up roll
#: interpolates between — `TrivialSkillLineRankHigh` (grey, no chance left) and
#: `TrivialSkillLineRankLow` (yellow, full chance).
SL_SKILL, SL_SPELL, SL_MIN = 1, 2, 7
SL_ACQUIRE, SL_GREY, SL_YELLOW = 9, 10, 11

#: `Player::LearnSkillRewardedSpells` (Player.cpp:12256) learns a skill's
#: abilities where this column is 1 or 2 and leaves the rest to be bought.
FREE = (1, 2)

#: `trainer.Type`.  Nought is a class trainer and `items.py` has that half.
TRADE_TRAINER = 2

#: `item_template.class`.  A recipe is a thing you read and it teaches one
#: spell; the first spell slot is the `Learning` trigger every one of them
#: carries, and the second is what it actually teaches.
RECIPE_CLASS = 9

#: `Spell::EffectLearnSkill` again: the ceiling a rank spell sets is its own
#: effect value times this.
RANK_STEP = 75


def dbc(client, name):
    """A `.dbc` as a list of int tuples — `spells.dbc` by another door.

    Imported rather than copied would be better and is not possible: that one
    exits the process when the client is missing, and this stage has to be
    able to say "no client, no trades" and carry on.
    """
    import bake_terrain as terrain
    data = terrain.read_dbc(terrain.Client(client), name)
    if not data:
        return []
    _magic, n, fields, rsize, _sb = struct.unpack_from('<4sIIII', data, 0)
    return [struct.unpack_from('<%di' % fields, data, 20 + i * rsize)
            for i in range(n)]


#: What an item does when a person uses it.  Five shapes cover everything this
#: world's trades make, and each is a pair of numbers off `Spell.dbc` rather
#: than a tooltip: a bandage is `SPELL_AURA_PERIODIC_HEAL` with a period, food
#: is `SPELL_AURA_MOD_REGEN`, and a potion is the effect itself with no aura
#: at all.
#:
#: The five seconds are the core's and not a tooltip's.
#: `Player::RegenerateHealth` (Player.cpp:2058) adds `amount * 2000 / 5000` on
#: a tick that comes every two seconds, so the amount is health per five
#: seconds however the item's own text rounds it — roasted boar meat comes to
#: 61 here and says 64 on the label.  A linen bandage is the other kind and
#: agrees exactly: eleven a tick, six ticks, 66.
A_PERIODIC_HEAL, A_MOD_REGEN, A_MOD_POWER_REGEN = 8, 84, 85
E_HEAL, E_ENERGIZE = 10, 30
REGEN_OVER = 5000


def use_of(spells, durations, spell):
    """`[word, total, seconds]` for a spell used off an item, or `None`.

    Lives here rather than in `spells.py` because that file is about what a
    *class* can cast and this is about what a *thing* does, and the thing is
    usually something this file decided could be made.  `items.py` imports it
    for every row, made or bought — a bandage you tied and a bandage you
    bought are the same bandage.
    """
    row = spells.get(spell)
    if row is None:
        return None
    seconds = durations.get(row[F_DURATION], 0) / 1000.0
    for i in range(3):
        effect, aura = row[F_EFFECT + i], row[F_AURA + i]
        amount = row[F_BASE + i] + 1
        if amount <= 0:
            continue
        if effect == E_HEAL:
            return ['heal', amount, 0]
        if effect == E_ENERGIZE:
            return ['power', amount, 0]
        if aura == A_PERIODIC_HEAL:
            period = row[F_PERIOD + i] or 1000
            return ['mend', round(amount * seconds * 1000 / period), seconds]
        if aura == A_MOD_REGEN:
            return ['feed', round(amount * seconds * 1000 / REGEN_OVER), seconds]
        if aura == A_MOD_POWER_REGEN:
            return ['drink', round(amount * seconds * 1000 / REGEN_OVER), seconds]
    return None


def here_creatures(base):
    """Which creature entries stand inside the slice.

    The same question `items.wanted` asks and the same way, off `creature`
    filtered by position — a trade trainer is only this game's trade trainer
    if a person can walk up to it.
    """
    out = set()
    path = os.path.join(base, 'creature.sql')
    col = columns(path)
    for line in rows(path):
        f = split(line)
        try:
            if int(f[col['map']]) != MAP:
                continue
            x, y = float(f[col['position_x']]), float(f[col['position_y']])
        except (ValueError, KeyError, IndexError):
            continue
        if within(x, y, MAP):
            out.add(int(f[col['id1']]))
    return out


def trainer_lists(base):
    """`({creature: trainer id}, {trainer id: [rows]}, {trainer id: type})`."""
    at = {}
    path = os.path.join(base, 'creature_default_trainer.sql')
    col = columns(path)
    for line in rows(path):
        f = split(line)
        at[int(f[col['CreatureId']])] = int(f[col['TrainerId']])
    kind = {}
    path = os.path.join(base, 'trainer.sql')
    col = columns(path)
    for line in rows(path):
        f = split(line)
        kind[int(f[col['Id']])] = int(f[col['Type']])
    sells = {}
    path = os.path.join(base, 'trainer_spell.sql')
    col = columns(path)
    for line in rows(path):
        f = split(line)
        sells.setdefault(int(f[col['TrainerId']]), []).append((
            int(f[col['SpellId']]), int(f[col['MoneyCost']]),
            int(f[col['ReqSkillLine']]), int(f[col['ReqSkillRank']]),
            int(f[col['ReqLevel']])))
    return at, sells, kind


def ceiling(ranks, upto):
    """How high a trade can go for somebody who stops at level `upto`.

    Walked rather than assumed.  A rank is bought with two keys — the skill you
    already have and the level you already are — so the reachable ceiling is a
    fixed point: take every rank the current ceiling and `upto` allow, raise
    the ceiling, go round again.  First aid stops at 225 in this game because
    artisan asks for level 35; alchemy stops at 150 because expert asks for 20.
    """
    have, took = 0, []
    while True:
        got = [r for r in ranks
               if r not in took and r[3] <= have and r[4] <= upto]
        if not got:
            return have, took
        for r in got:
            took.append(r)
            have = max(have, r[5])


def rank_spells(spells, sells, skill):
    """The rank chain for one skill, as `(spell, cost, skill, need, level, cap)`.

    A rank spell is the one that carries `SPELL_EFFECT_SKILL_STEP` for this
    skill; its sibling `SPELL_EFFECT_LEARN_SPELL` hands over the trade's own
    action, which is the spell a gathering trade *is*.

    **The effect says which skill and the trainer row does not.**  Reading
    `ReqSkillLine` here is the mistake that shipped one trade out of ten:
    apprentice cooking asks for no skill at all, because it is the row that
    gives you the skill, so its `ReqSkillLine` is nought and the chain
    started nowhere.  `SPELL_EFFECT_SKILL_STEP`'s own misc value is the
    skill, and it is right on the first rank as well as the fourth.
    """
    out = []
    for sid, cost, line, need, level in sells:
        row = spells.get(sid)
        if row is None:
            continue
        eff = row[F_EFFECT:F_EFFECT + 3]
        for i in range(3):
            if eff[i] == E_SKILL_STEP and row[F_MISC + i] == skill:
                value = row[F_BASE + i] + row[F_DIE + i]
                out.append((sid, cost, skill, need, level,
                            max(RANK_STEP, value * RANK_STEP)))
                break
    out.sort(key=lambda r: (r[3], r[5]))
    return out


def does(spells, rank_spell):
    """The action a rank spell hands over — 2550 Cooking, 2575 Mining, …"""
    row = spells.get(rank_spell)
    if row is None:
        return 0
    eff = row[F_EFFECT:F_EFFECT + 3]
    for i in range(3):
        if eff[i] == E_LEARN and row[F_TRIGGER + i]:
            return row[F_TRIGGER + i]
    return 0


def makes(row):
    """`(item, count)` for a spell that creates one, or `None`.

    The count is `EffectBasePoints + EffectDieSides`, which is what
    `SpellInfo::Effect::CalcValue` comes to for a die of one side: the stored
    base is one short of the real number and the die makes it up.
    """
    eff = row[F_EFFECT:F_EFFECT + 3]
    for i in range(3):
        if eff[i] == E_CREATE_ITEM and row[F_ITEM_TYPE + i]:
            return row[F_ITEM_TYPE + i], max(1, row[F_BASE + i] + row[F_DIE + i])
    return None


def needs(row):
    """The eight reagent slots, as `[[item, count], …]`."""
    return [[row[F_REAGENT + i], row[F_REAGENT_COUNT + i]]
            for i in range(8) if row[F_REAGENT + i]]


def recipe_items(base, have):
    """`{craft spell: recipe item}` for every recipe this slice can reach.

    A recipe is read once and teaches for ever, so a cooking recipe on a
    Goldshire shelf is a row in the crafting list and a cooking recipe in
    Stranglethorn is not.  `have` is what the slice can reach at all, which is
    `items.wanted` — one script decides what exists here.
    """
    out = {}
    path = os.path.join(base, 'item_template.sql')
    col = columns(path)
    for line in rows(path):
        f = split(line)
        try:
            entry = int(f[col['entry']])
            if entry not in have or int(f[col['class']]) != RECIPE_CLASS:
                continue
            taught = int(f[col['spellid_2']])
        except (ValueError, KeyError, IndexError):
            continue
        if taught:
            out.setdefault(taught, entry)
    return out


def build(client, base, have, gates=(), upto=None):
    """`(doc, wanted)` — the trades, their recipes, and every id they need.

    `wanted` is the closure: every reagent and every product of every shipped
    recipe.  `items.py` adds it to its own want list and exempts it from the
    slice's level ceiling, for the reason issue 199 landed on — **a ceiling is
    a rule about shelves.**  A bandage you tie is not a bandage somebody sold
    you, and neither is the cloth it is made of.

    The sift runs to a fixed point and that is not a flourish.  A copper bar is
    not on any shelf and falls off nothing: it is smelted, and half of
    smithing's first rank is made of it.  Asking "can this world yield every
    reagent" once, against what the world yields *before* anybody makes
    anything, threw away every recipe whose reagent was itself a recipe —
    seven of engineering's, ten of smithing's — and then the malachite in the
    bag had nothing to do.  So the answer grows: admit what the world already
    holds, add what those recipes make, go round again.
    """
    upto = upto or LEVELS[1]
    spells = {r[0]: r for r in dbc(client, 'Spell')}
    sla = dbc(client, 'SkillLineAbility')
    if not spells or not sla:
        return None, set()

    live = here_creatures(base)
    at, sells, kind = trainer_lists(base)

    # Which trades have somebody here to teach them, and which creatures.
    who = {}
    for creature in sorted(live):
        t = at.get(creature)
        if t is None or kind.get(t) != TRADE_TRAINER:
            continue
        for _sid, _cost, line, _need, _level in sells.get(t, ()):
            if line in SKILL_NAME:
                who.setdefault(line, set()).add(creature)

    from_item = recipe_items(base, have)

    # Which skill uses a given item as a reagent **anywhere in the game** and
    # not only here.  This is what lets `check_gathering` tell a hole from an
    # edge: a malachite comes out of a copper vein and is also cut by a
    # jeweller, and no jeweller stands here.
    uses = {}
    for r in sla:
        if r[SL_SKILL] not in SKILL_NAME:
            continue
        row = spells.get(r[SL_SPELL])
        if row is None or not makes(row):
            continue
        for e, _n in needs(row):
            uses.setdefault(e, set()).add(r[SL_SKILL])

    # Why a material this world yields has nothing to make, when it has
    # nothing to make.  One of four, and two of them are boundaries this game
    # drew on purpose — no trainer for that trade stands here, or the recipe
    # asks a rank these levels cannot reach.  The other two are holes.
    WHY = {'rank': 1, 'goods': 2, 'untaught': 3}
    reason = {}

    def blame(items, word):
        for e, _n in items:
            if reason.get(e, 9) > WHY[word]:
                reason[e] = WHY[word]

    # Every recipe a person here could come to hold, before asking whether the
    # world can supply it.
    caps, cand, cut = {}, {}, Counter()
    for skill in sorted(who):
        seen = {}
        for creature in sorted(who[skill]):
            for row in sells[at[creature]]:
                seen[row[0]] = row
        ranks = rank_spells(spells, seen.values(), skill)
        cap, took = ceiling(ranks, upto)
        if not cap:
            cut['no rank a person of this level can buy'] += 1
            continue
        caps[skill] = (cap, took)

        # What each of this skill's abilities costs to be taught, out of the
        # trainers standing here.
        price = {r[0]: (r[1], r[3]) for r in seen.values() if r[2] == skill}

        mine = {}
        for r in sla:
            if r[SL_SKILL] != skill:
                continue
            row = spells.get(r[SL_SPELL])
            if row is None:
                continue
            made = makes(row)
            if not made:
                continue
            want = needs(row)
            if not want:
                cut['makes something out of nothing'] += 1
                continue
            if r[SL_ACQUIRE] in FREE:
                how, cost, need = 0, 0, r[SL_MIN]
            elif r[SL_SPELL] in price:
                cost, need = price[r[SL_SPELL]]
                how = 1
            elif r[SL_SPELL] in from_item:
                how, cost, need = from_item[r[SL_SPELL]], 0, r[SL_MIN]
            else:
                cut['taught by nobody in this slice'] += 1
                blame(want, 'untaught')
                continue
            if need > cap:
                cut['asks a rank this game cannot reach'] += 1
                blame(want, 'rank')
                continue
            # The same ability can be filed twice — once bought and once
            # handed over at a higher rank — and the row a person meets first
            # is the one that matters.  Lowest rank wins.
            row_ = (need, r[SL_SPELL], how, cost, made, want,
                    r[SL_YELLOW], r[SL_GREY])
            if r[SL_SPELL] not in mine or row_ < mine[r[SL_SPELL]]:
                mine[r[SL_SPELL]] = row_
        cand[skill] = sorted(mine.values())

    # And now the fixed point.
    reach = set(have)
    taken, left = {s: [] for s in cand}, {s: list(v) for s, v in cand.items()}
    while True:
        got = False
        for skill, rows_ in left.items():
            keep = []
            for row_ in rows_:
                if all(e in reach for e, _n in row_[5]):
                    taken[skill].append(row_)
                    reach.add(row_[4][0])
                    got = True
                else:
                    keep.append(row_)
            left[skill] = keep
        if not got:
            break
    for skill, rows_ in left.items():
        for row_ in rows_:
            cut['made of something this world has not got'] += 1
            blame(row_[5], 'goods')

    # And the trades that gate something without making anything.
    #
    # Herbalism makes nothing and skinning makes nothing, and dropping them for
    # that would take the game back to where issue 200 found it: two hundred
    # nodes standing in a field with nobody able to open one.  What a trade is
    # *for* is either a recipe or a lock, and the locks are in the world —
    # `objects.json` carries the skill on every node — while skinning's is in
    # the client, filed under the spell that does it.
    opens = set(gates)
    for r in sla:
        row = spells.get(r[SL_SPELL])
        if row is not None and E_SKINNING in row[F_EFFECT:F_EFFECT + 3]:
            opens.add(r[SL_SKILL])

    trades, out_recipes = {}, []
    for skill in sorted(taken):
        if not taken[skill] and skill not in opens:
            cut['nothing it can make is reachable here'] += 1
            continue
        if skill not in caps:
            continue
        cap, took = caps[skill]
        trades[str(skill)] = {
            'word': SKILL_NAME[skill],
            'at': sorted(who[skill]),
            'cap': cap,
            'does': does(spells, took[0][0]) if took else 0,
            'ranks': [[r[0], r[1], r[3], r[4], r[5]] for r in took],
        }
        for need, sid, how, cost, made, want, yellow, grey in sorted(taken[skill]):
            out_recipes.append([skill, sid, need, how, cost,
                                made[0], made[1], want, yellow, grey])

    if cut:
        print('  %d recipes left out: %s'
              % (sum(cut.values()),
                 ', '.join('%s %d' % (k, n) for k, n in cut.most_common())))

    doc = {'trades': trades, 'recipes': out_recipes}
    wanted = set()
    for r in out_recipes:
        wanted.add(r[5])
        for e, _n in r[7]:
            wanted.add(e)
    shipped = {e for r in out_recipes for e, _n in r[7]}
    mine_ = set(who)
    doc['unused'] = {str(e): (0 if not (ss & mine_) else
                              reason.get(e, WHY['untaught']))
                     for e, ss in uses.items() if e not in shipped}
    return doc, wanted


def check(doc, items):
    """Two promises, both of them about closure.

    The first is the one issue 200 asked for in those words: **a trade that
    yields a material has a recipe that uses it.**  Read off the shipped
    files rather than off this script's own working — `objects.json` says what
    a node gives and at what rank, and the recipe list says what a recipe
    takes, and the two have to meet.

    The second is issue 199's, one turn further in: a recipe that names an item
    is a promise that the item has a row.
    """
    recipes = doc['recipes']
    trades = doc['trades']
    loose = [r for r in recipes
             if str(r[5]) not in items
             or any(str(e) not in items for e, _n in r[7])]
    print(f'check: {len(recipes)} recipes over {len(trades)} trades, '
          f'{len(loose)} of them naming an item with no row behind it')
    assert not loose, f'a recipe names an item this world never baked: {loose[:4]}'


def gathered(where):
    """`{skill id: {item: rank the node asks for}}`, out of the baked world.

    `objects.json` carries the trade and the rank on every node row because
    `objects.py` read them off `Lock.dbc` — so what a person can dig up, and
    what it costs in skill to dig it up, is already a fact on disk.
    """
    out = {}
    path = os.path.join(where, 'objects.json')
    if not os.path.exists(path):
        return out
    with open(path) as f:
        doc = json.load(f)
    for row in doc.get('objects', []):
        trade, rank, haul = row[4], row[5], doc['hauls'][row[7]]
        if not trade:
            continue
        for item in haul:
            got = out.setdefault(trade, {})
            got[item[5]] = min(got.get(item[5], rank), rank)
    return out


def check_gathering(doc, where, have):
    """What a person digs up has something to be made into.

    This is issue 200's promise and it comes in two halves, because only one
    of them can be stated as an absolute.

    The census is the honest half.  A material this world yields is used by a
    shipped recipe, or it is not, and when it is not the reason is one of four
    edges this game has already drawn: nobody here teaches the trade that
    works it, the recipe asking for it wants a rank these levels cannot reach,
    the recipe's *other* reagents are not in this world, or no trainer and no
    written recipe in this slice teaches it.  Lesser moonstone comes out of a
    mithril vein and every smith's use for it is made of iron bars, and no
    node in these bounds gives iron ore — so it goes in the bag and stays
    there, and that is the slice's edge rather than a hole.

    The assertion is the falsifiable half: **a gathering trade a person can
    learn here has to yield something a person can here use.**  Paying a
    trainer to learn to dig up things that nothing takes is the shape of bug
    this repository keeps finding — a field computed and never read, one turn
    out into the world.
    """
    caps = {int(k): t['cap'] for k, t in doc['trades'].items()}
    used = {e for r in doc['recipes'] for e, _n in r[7]}
    # 0 nobody here teaches a trade that uses it, 1 it wants a rank this game
    # cannot reach, 2 its other reagents are not in this world, 3 no trainer
    # and no written recipe here teaches it.
    WORD = {0: 'worked by a trade nobody here teaches',
            1: 'wanted at a rank this game cannot reach',
            2: 'wanted by a recipe whose other halves are not in this world',
            3: 'wanted only by a recipe nobody here teaches'}
    away = doc.get('unused', {})
    feeds, reach, dead, lost = Counter(), 0, Counter(), []
    for trade, items in sorted(gathered(where).items()):
        cap = caps.get(trade, 0)
        if not cap:
            continue
        for item, rank in sorted(items.items()):
            if rank > cap:
                continue
            reach += 1
            if item in used:
                feeds[trade] += 1
            elif away.get(str(item)) in WORD:
                dead[WORD[away[str(item)]]] += 1
            else:
                lost.append((trade, item, rank))
    print(f'check: {reach} materials can be gathered at a rank this game '
          f'reaches, {sum(feeds.values())} of them feed a recipe here')
    for words, n in dead.most_common():
        print(f'  {n} do not, and are {words}')
    assert not lost, \
        'something can be gathered here for no reason at all: %s' % (lost[:6],)
    idle = sorted(SKILL_NAME[t] for t in caps
                  if t in gathered(where) and not feeds[t])
    assert not idle, \
        'a trade this game teaches digs up nothing this game can use: %s' % idle


def check_closure(doc, have):
    """Nothing on a recipe's list is a thing this world cannot give.

    The fixed point in `build` decides this and reads its own working while it
    does, so the promise is restated here against the shipped document: every
    reagent of every shipped recipe is either something the world already
    yields — a shelf, a corpse, a chest, a node, an errand's pay — or the
    product of another shipped recipe.  A copper bar is the second kind, which
    is the whole reason the sift has to go round more than once.
    """
    made = {r[5] for r in doc['recipes']}
    short = [(r[1], e) for r in doc['recipes'] for e, _n in r[7]
             if e not in have and e not in made]
    print(f'check: {len(doc["recipes"])} recipes, {len(short)} of them asking '
          f'for a reagent this world neither yields nor makes')
    assert not short, f'a recipe asks for what nobody here can get: {short[:6]}'


def main(acore, client, out):
    # **Loudly**, because the first bake of this stage shipped an empty file.
    # `bake.py` keeps a little table of which script wants its arguments in
    # which order, this one was not in it, and so it was handed the world path
    # where the client goes: no `Spell.dbc`, no recipes, no error.  A stage
    # declared to need the client is skipped outright when there is none, so
    # reaching here without one is a wiring fault and not a machine without a
    # game installed.
    if not client or not os.path.isdir(client):
        sys.exit(f'trades needs the game client and {client!r} is not one — '
                 f'a recipe lives in SkillLineAbility.dbc and nowhere else')
    base = os.path.join(acore, 'data/sql/base/db_world')
    import items as goods
    object_loots = set()
    made = os.path.join(out, 'objects.json')
    if os.path.exists(made):
        with open(made) as f:
            for row in json.load(f).get('objects', []):
                object_loots.add(row[8])
    have, _stock, _here, _drops = goods.wanted(base, acore, object_loots,
                                               client, out, made=False)

    # Which trades the world itself asks for, out of the baked nodes.
    gates = set()
    made_ = os.path.join(out, 'objects.json')
    if os.path.exists(made_):
        with open(made_) as f:
            for row in json.load(f).get('objects', []):
                if row[4]:
                    gates.add(int(row[4]))
    doc, wanted = build(client, base, set(have), gates)
    if doc is None:
        sys.exit('this client has no Spell.dbc or no SkillLineAbility.dbc')

    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, 'trades.json')
    with open(path, 'w') as f:
        json.dump(doc, f)
    print(f'{len(doc["recipes"])} recipes over {len(doc["trades"])} trades '
          f'-> {path}')
    for skill, t in sorted(doc['trades'].items(), key=lambda kv: kv[1]['word']):
        n = sum(1 for r in doc['recipes'] if r[0] == int(skill))
        print('  %-16s to %3d, %2d trainer(s), %2d recipes'
              % (t['word'], t['cap'], len(t['at']), n))
    if doc['recipes']:
        check_closure(doc, set(have))
        check_gathering(doc, out, set(have))


if __name__ == '__main__':
    main(os.path.expanduser(sys.argv[1] if len(sys.argv) > 1
                            else '~/src/azerothcore-wotlk'),
         os.path.expanduser(sys.argv[2] if len(sys.argv) > 2
                            else '~/workspace/warmane'),
         sys.argv[3] if len(sys.argv) > 3 else 'public/world')
