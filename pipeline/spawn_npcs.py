#!/usr/bin/env python3
"""Pull the slice's inhabitants out of AzerothCore.

This is the one part of the world that does not care whether a client is
installed.  Terrain has two sources — the client's height grid is sharper than
anything a database knows — but where a wolf stands is a row in `creature`
either way, so there is a single spawn file and both worlds use it.

What comes out is a position, a facing, a level, a **kind**, a **role**, and
what that person can talk about.  Not a name, and not a sentence.  The kind
words are ours: `creature_template.name` is read to pick one and then dropped,
the same bargain `bake_terrain.py` makes with Blizzard's model paths.  `type`
and `family` were tried first and are not enough on their own — `family` is
only filled in for the beasts a hunter can tame, which is three quarters of
nothing here, and `type` puts a kobold, a murloc and a city guard in one
bucket called humanoid.

Two filters matter more than they look:

  * `game_event_creature` with a **positive** event id is a spawn that only
    exists during a holiday.  Without this the slice is 1,796 spawns of which
    703 are Pilgrim's Bounty turkeys and the beasts of Elwynn are a rounding
    error.  A negative id is the opposite — present normally, removed during
    the event — so those stay.
  * `pool_creature` is a spawn that shares a slot with others and is not always
    the one that got it.

There is a second bargain underneath the first one.  Everything conversational
in this database is Blizzard's prose — `npc_text`, `broadcast_text`,
`gossip_menu_option.OptionText`, every quest's title and body — and none of it
is used.  What is used is the *shape* of a conversation, which is all numbers:
a row in `creature_queststarter`, a list of item ids in `npc_vendor`, a
`trainer.Type` of 0 meaning a class trainer, a quest's `RequiredNpcOrGoCount1`
of 8.  Those come out; `src/talk.ts` writes the sentences.

Two things that look like data and are not:

  * `creature_template.gossip_menu_id` of 0 means *no menu*, and menu 0 in
    `gossip_menu_option` is the eighteen-row template of built-in option types
    that every client has.  Joining the two makes every guard in the world look
    like it has an eighteen-option conversation.
  * a quest's collection objective is almost always a quest item, and the item
    row says nothing worth saying.  Where it drops does: `creature_loot_template`
    keyed back through `creature_template.lootid` turns "eight of item 50432"
    into "eight off the wolves", which is the sentence a person would use.

  python3 pipeline/spawn_npcs.py <azerothcore dir> <out dir>
"""
import json
import math
import os
import re
import sys
from collections import Counter

# Where this game is, out of `slice.json` — one file for the whole pipeline.
# These four numbers used to be typed into three scripts, which is not a
# constant but three constants that happen to agree.  A creature is in the
# slice if it is in the forest.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from slice import BOUNDS, MAP  # noqa: E402,F401

# `creature` column order, from the dump's own CREATE TABLE.
C_GUID, C_ID, C_MAP, C_X, C_O = 0, 1, 4, 10, 13
# And the four columns of `creature` that say how a spawn behaves, which were
# not read at all: how long it takes to come back, how far it strays from its
# post, and whether it strays.  Every one of them was a constant here instead —
# thirty seconds, seven yards, and "anything that is not a shopkeeper wanders".
C_RESPAWN, C_WANDER, C_MOVE = 14, 15, 19

# UNIT_NPC_FLAG bits, in the order we want them tested: the first that matches
# names the role, so the specific ones come before the ones almost everybody
# has.  Nearly every townsperson is a GOSSIP, so GOSSIP is last.
NPCFLAG = [
    ('trainer', 0x10 | 0x20 | 0x40),
    # Before `vendor`, because an innkeeper is also a vendor and the vendor
    # bit is the commoner one — tested the other way round the slice reported
    # *no innkeepers at all*, which is not what a zone with a tavern in it
    # looks like.  Resting is the only thing that distinguishes them and it
    # needs to know which building is the inn.
    ('innkeeper', 0x10000),
    ('vendor', 0x80 | 0x100 | 0x200 | 0x400 | 0x1000000),
    ('banker', 0x20000),
    ('stablemaster', 0x400000),
    ('flightmaster', 0x2000),
    ('spirithealer', 0x4000),
    ('questgiver', 0x2),
    ('talker', 0x1),
]

# Name fragment to kind.  Order matters — the first hit wins, so a
# "Diseased Young Wolf" is a wolf before it is anything else.  Every kind here
# has art; a creature that matches nothing at all is reported, not guessed at,
# because a silent fallback is how a slice ends up full of identical men.
KINDS = [
    ('wolf', ('wolf', 'worg')),
    ('bear', ('bear',)),
    ('boar', ('boar', 'tusk')),
    ('spider', ('spider', 'tarantula')),
    ('deer', ('deer', 'fawn', 'stag', 'doe')),
    ('rabbit', ('rabbit', 'hare')),
    ('cow', ('cow', 'ox', 'cattle', 'bull')),
    ('sheep', ('sheep', 'ram', 'lamb')),
    ('chicken', ('chicken', 'rooster', 'hen')),
    ('cat', ('cat', 'kitten')),
    ('horse', ('horse', 'stallion', 'mare', 'palomino', 'steed', 'pony',
              'pinto')),
    ('kobold', ('kobold',)),
    # The three that were coming through as villagers.  Riverpaw gnolls are
    # sixty-seven of the slice's spawns and were drawn in a linen shirt; the
    # Blackrock orcs and the trolls are the far edge of the rectangle, and are
    # no more townsfolk than the gnolls were.
    ('gnoll', ('gnoll', 'riverpaw', 'hogger', 'mosh\'ogg')),
    ('orc', ('orc', 'blackrock', 'grunt', 'peon')),
    ('troll', ('troll',)),
    ('murloc', ('murloc', 'makrura')),
    ('skeleton', ('skeleton', 'skeletal')),
    ('ghost', ('ghost', 'spectral', 'apparition', 'spirit')),
    ('bandit', ('defias', 'bandit', 'thug', 'cutpurse', 'rogue', 'brigand',
                'thief', 'lightfingers')),
    ('guard', ('guard', 'sentry', 'sentinel', 'watchman', 'marshal')),
]

# `creature_template.family` — `CreatureFamily.dbc`, which is the game's own
# answer to "what animal is this".  A column that was present and never read,
# which is the shape of mistake this repository keeps meeting: 101 of the
# slice's 216 unclassified creatures are wolves, boars and spiders there is
# already art for, and nothing but the name was ever asked.  Only the families
# with a sheet are named here; the rest are declared below.
#
# It is asked **before** the name, and the reason is a bug it found: `orc` is a
# substring of `Porcine Entourage`, so two pigs were walking around the slice
# in an orc's skin.  A family is a number somebody filled in on purpose and a
# name is prose that happens to contain a word.
FAMILY = {1: 'wolf', 2: 'cat', 3: 'spider', 4: 'bear', 5: 'boar'}

# Anything that is a person and is not one of the above dresses as a townsman.
# Stated rather than defaulted: it is a decision about what the slice looks
# like, and it should be visible in the count the script prints.
PERSON_TYPES = {7, 6, 3, 10, 12}

# What is left out for want of a picture, said out loud.
#
# `objects.py` has had this gate since it was written and the creatures never
# did: 216 spawns a run went into a line that read `unclassified 216` and
# nothing had to be looked at.  The rule is the one `*_DEFAULT_OK` states for
# the terrain — leaving something out is fine, leaving something out that
# nobody has looked at is not — so anything that classifies to nothing and is
# not named here exits non-zero.
#
# Whole creature types first, because the judgment was made a type at a time.
# `creature_template.type` is the client's own enum.
TYPE_NOT_DRAWN = {
    2: 'dragonkin — 28 spawns, every one of them Burning Steppes drakes and '
       'wyrmkin that the slice rectangle clips a corner of',
    4: 'elemental — 8 spawns, the same corner of the Burning Steppes',
    8: 'critter — 42 rats, squirrels, beetles and crabs.  A critter has no '
       'loot, no fight and no reason to be swung at; it is ambience, and '
       'ambience drawn as the nearest sprite we own would be a rabbit '
       'pretending to be a rat',
    9: 'mechanical — 20 spawns, seventeen of them training dummies in the '
       'Stormwind practice yard.  Equipment somebody set up, not somebody '
       'living here',
}

# Then beast families with no sheet.  Named by the number rather than by the
# creature, so a wider slice does not grow this list one animal at a time.
FAMILY_NOT_DRAWN = {
    6: 'crocolisk — 6 spawns', 7: 'carrion bird — 2 spawns',
    20: 'bat — 7 spawns, and every one of them is filed under it by a '
        'database that files a scorpid as a bat',
}

# And the two the family column has nothing to say about.
NAME_NOT_DRAWN = {
    'fizzles': 'a named toad, one of it',
}


# `item_template.class`.  Our words for a number, the same bargain the doodad
# kinds make with Blizzard's model paths — 4 is 4 whoever wrote the row down.
ITEM_CLASS = {
    0: 'provisions', 1: 'bags', 2: 'weapons', 3: 'gems', 4: 'armour',
    5: 'reagents', 6: 'ammunition', 7: 'materials', 9: 'recipes',
    11: 'quivers', 12: 'errand goods', 13: 'keys', 15: 'oddments',
    16: 'glyphs',
}

# `trainer.Type`, and for a class trainer `trainer.Requirement` is the class id.
TRAINER_TYPE = {0: 'class', 1: 'mounts', 2: 'trade', 3: 'beasts'}
CLASS_NAME = {
    1: 'warriors', 2: 'paladins', 3: 'hunters', 4: 'rogues', 5: 'priests',
    6: 'death knights', 7: 'shamans', 8: 'mages', 9: 'warlocks', 11: 'druids',
}
# `trainer_spell.ReqSkillLine`.  Plain craft nouns, ours the way `armour` and
# `weapons` are.  This is where the trade comes from and not from
# `trainer.Requirement`, which is zero for every one of the seventy-eight trade
# trainers in the dump — it is the class id column, and a trade has no class.
SKILL_NAME = {
    129: 'first aid', 164: 'smithing', 165: 'leatherworking', 171: 'alchemy',
    182: 'herbalism', 185: 'cooking', 186: 'mining', 197: 'tailoring',
    202: 'engineering', 333: 'enchanting', 356: 'fishing', 393: 'skinning',
    755: 'jewelcrafting', 762: 'riding', 773: 'inscription',
}


def rows(path):
    """mysqldump with one tuple to a line."""
    with open(path, encoding='utf-8', errors='replace') as f:
        for line in f:
            if line.startswith('('):
                yield line


def columns(path):
    """Column order, read out of the dump's CREATE TABLE rather than assumed."""
    head = open(path, encoding='utf-8', errors='replace').read(40000)
    return {c: i for i, c in enumerate(re.findall(r'^  `([A-Za-z_0-9]+)`', head, re.M))}


def split(line):
    """Split one dumped tuple on commas that are not inside a string.

    A regexp of alternatives was tried and is wrong in both directions: `[^,]+`
    swallows empty fields so every column after the first NULL is off by one,
    and `[^,]*` matches the empty string between every pair of tokens so every
    column is off by two.  Creature names contain commas and apostrophes, so
    the quoting has to be tracked rather than pattern-matched.
    """
    body = line.rstrip().rstrip(';').rstrip(',').strip()[1:-1]
    out, cur, quoted, esc = [], [], False, False
    for ch in body:
        if esc:
            cur.append(ch); esc = False
        elif ch == '\\':
            cur.append(ch); esc = True
        elif ch == "'":
            cur.append(ch); quoted = not quoted
        elif ch == ',' and not quoted:
            out.append(''.join(cur)); cur = []
        else:
            cur.append(ch)
    out.append(''.join(cur))
    return out


def classify(name, ctype, foe=False, family=0):
    """What the game says it is in, one of our own words out.

    Three axes in the order of how much each one is worth.  The **family** is
    a number somebody filled in saying which animal this is, so it goes first
    — see `FAMILY` for the two pigs that taught it.  The **name** is prose and
    it catches everything the family column is nought for, which is every
    person in the world.  And the **type** is the fallback's fallback: the
    fallback for a person used to be `townsfolk` whatever else was true of
    them, and eleven thousand creatures in this database are hostile humanoids
    whose names match none of the words above — so a gnoll, an orc and a
    succubus all arrived in a linen shirt.  Something that will swing at you is
    not a villager, and if nothing more specific fits it dresses as a robber.
    """
    if family in FAMILY:
        return FAMILY[family]
    low = name.lower()
    for kind, words in KINDS:
        if any(w in low for w in words):
            return kind
    if ctype in TYPE_NOT_DRAWN or ctype not in PERSON_TYPES:
        return None
    return 'bandit' if foe else 'townsfolk'


def not_drawn(name, ctype, family=0):
    """Why this one is left out, or `None` if nobody has said.

    The second half of the gate.  `classify` returning nothing is a decision
    either way; this is the line that says which of the two it was, and the
    caller exits non-zero when it comes back empty.
    """
    if ctype in TYPE_NOT_DRAWN:
        return TYPE_NOT_DRAWN[ctype]
    if family in FAMILY_NOT_DRAWN:
        return FAMILY_NOT_DRAWN[family]
    low = name.lower()
    for word, why in NAME_NOT_DRAWN.items():
        if word in low:
            return why
    return None


def role(flags, ctype, rank):
    for name, bits in NPCFLAG:
        if flags & bits:
            return name
    if rank:                       # elite, rare, boss — worth a second look
        return 'elite'
    return 'prey' if ctype in (1, 8) else 'idle'


# The player's own faction template.  Human is faction 1, and everything in the
# world is measured against it.  Hard-coded because the player's race is, and
# because a constant that is a lookup of a constant is a lookup nobody can read.
PLAYER_TEMPLATE = 1

# `FACTION_TEMPLATE_FLAG_HOSTILE_BY_DEFAULT`, the bit that makes a thing swing
# at everybody regardless of what its groups say.
HOSTILE_BY_DEFAULT = 0x2000

# What one thing thinks of another.  Three values because the game has three,
# and because two of them collapsed into one is what made Northshire unplayable
# — see `stance` below.
FRIEND, QUARRY, ENEMY = 0, 1, 2


def fight_tables(base):
    """AzerothCore's own arithmetic for what a creature is worth in a fight.

    Three tables and no invention.  `creature_classlevelstats` holds the health,
    armour, attack power and base damage of every (level, class) the game has;
    `creature_template` holds the per-creature multipliers over those; and
    `factiontemplate_dbc` holds who swings at whom.

    The damage formula is the core's: a weapon swing is the base damage plus
    the attack power spread over the swing — `AP / 14 * seconds` — and the
    maximum is the same with the base damage at one and a half.  Both are then
    multiplied by the template's own modifier.
    """
    st = {}
    cls = columns(os.path.join(base, 'creature_classlevelstats.sql'))
    for line in rows(os.path.join(base, 'creature_classlevelstats.sql')):
        f = split(line)
        st[(int(f[cls['level']]), int(f[cls['class']]))] = (
            float(f[cls['basehp0']]), float(f[cls['basearmor']]),
            float(f[cls['attackpower']]), float(f[cls['damage_base']]),
            float(f[cls['Strength']]))

    fac = {}
    fc = columns(os.path.join(base, 'factiontemplate_dbc.sql'))
    for line in rows(os.path.join(base, 'factiontemplate_dbc.sql')):
        f = split(line)
        fac[int(f[fc['ID']])] = {
            'faction': int(f[fc['Faction']]),
            # `Flags` was not read at all, and one of its bits is the only
            # thing that makes some creatures attack.
            'flags': int(f[fc['Flags']]),
            'group': int(f[fc['FactionGroup']]),
            'friend_group': int(f[fc['FriendGroup']]),
            'enemy_group': int(f[fc['EnemyGroup']]),
            'enemies': [int(f[fc[f'Enemies_{i}']]) for i in range(1, 5)],
            'friends': [int(f[fc[f'Friend_{i}']]) for i in range(1, 5)],
        }
    return st, fac


def _hostile_to(a, b):
    """`FactionTemplateEntry::IsHostileTo`, which is the core's own function.

    Its listed enemies first, then its listed friends, and only then the group
    bits — which is the order that matters, because a template can name a
    faction it fights inside a group it otherwise leaves alone.
    """
    if b['faction']:
        if b['faction'] in a['enemies']:
            return True
        if b['faction'] in a['friends']:
            return False
    return bool(a['enemy_group'] & b['group'])


def _friendly_to(a, b):
    """`FactionTemplateEntry::IsFriendlyTo`, the same shape the other way up."""
    if b['faction']:
        if b['faction'] in a['enemies']:
            return False
        if b['faction'] in a['friends']:
            return True
    return bool(a['friend_group'] & b['group'])


def _reaction(a, b):
    """`Unit::GetReactionTo` minus the reputation branch, which is never taken.

    The branch it leaves out is the one that reads a standing out of
    `Faction.dbc`, and it is left out because no faction in Elwynn has one: a
    faction can only have a standing if its `ReputationIndex` is not -1, and
    every faction a creature here belongs to is -1.  Checked against the
    client's own `Faction.dbc` rather than assumed.
    """
    if _hostile_to(a, b):
        return 'hostile'
    if _friendly_to(a, b):
        return 'friendly'
    if _friendly_to(b, a):
        return 'friendly'
    if a['flags'] & HOSTILE_BY_DEFAULT:
        return 'hostile'
    return 'neutral'


def stance(fac, template):
    """Where this one stands to a human warrior: friend, quarry, or enemy.

    **The core's reaction is not symmetric, and collapsing it into one boolean
    emptied Northshire.**  What was asked before was only "does it swing at
    me", and for the valley's own inhabitants the answer is no — a Kobold
    Vermin does not charge, a Diseased Young Wolf does not charge, a Defias
    Thug does not charge.  They are still what a level one warrior is sent to
    kill: the player's own faction template names the Monster group as an
    enemy, so they are red to him and he may swing first.  With one boolean
    driving both "may I attack it" and "does it attack me", 131 of the 220
    creatures that live in the starting valley were unkillable scenery.

    So: `ENEMY` is the ones that start the fight, `QUARRY` the ones that only
    finish it, and `FRIEND` the ones that never do.  Both halves come out of
    the same function the server uses, asked in both directions.
    """
    me = fac.get(PLAYER_TEMPLATE)
    it = fac.get(template)
    if not me or not it:
        return FRIEND
    if _reaction(it, me) == 'hostile':
        return ENEMY
    # Friendly is the narrow one, and neutral belongs with the quarry: a
    # yellow nameplate is a thing you may hit that will not hit you first.
    # Reading neutral as friendly left Elwynn's wolves and the valley's
    # Defias unkillable, which is most of what a level one warrior is for.
    if _reaction(me, it) == 'friendly':
        return FRIEND
    return QUARRY


def fight_of(st, fac, level, cls, template, mods):
    """(health, min damage, max damage, swing ms, armour, stance)."""
    hp_mod, dmg_mod, armour_mod, swing = mods
    base = st.get((level, cls)) or st.get((level, 1))
    if not base:
        return None
    hp, armour, ap, dmg, _str = base
    t = max(swing, 1000) / 1000.0
    lo = (ap / 14.0 * t + dmg) * dmg_mod
    return (max(1, round(hp * hp_mod)), max(1, round(lo)),
            max(1, round((ap / 14.0 * t + dmg * 1.5) * dmg_mod)),
            int(swing), round(armour * armour_mod),
            stance(fac, template))


# What a thing *is*, in our words, from `item_template.class` and its
# subclass.  The same bargain the doodads and the creature kinds make: the
# database says which drawer an item lives in and we supply the noun, because
# every item name in this dump is Blizzard's prose.
#
# A wolf drops meat and leather and a kobold drops junk and a candle, and that
# is the whole of what a player needs to know at this size.
GOODS = {
    (0, 1): 'potion', (0, 2): 'potion', (0, 3): 'potion',
    (0, 5): 'food', (0, 7): 'bandage', (0, 0): 'potion',
    (1, None): 'bag',
    (2, None): 'weapon',
    (4, None): 'armour',
    (6, None): 'ammunition',
    (7, 5): 'cloth', (7, 6): 'leather', (7, 7): 'ore', (7, 8): 'meat',
    (7, 9): 'herb', (7, None): 'material',
    (9, None): 'recipe',
    (11, None): 'quiver',
    (12, None): 'errand',
    (15, None): 'oddment',
}


# And inside `food`, what sort of food.  `item_template.FoodType` is the
# client's own enum and it was a column nobody read — which showed, because it
# is the only column that tells two of Goldshire's shop rows apart.  Items 159
# and 4540 are identical in every field this bake kept: `food`, no slot,
# quality 1, item level 5, buy 25, sell 1.  One is a drink and the other is
# bread, and `FoodType` is where that lives.  A shop that prints the same four
# characters and the same price on two consecutive lines is a shop with no way
# to choose, and this game does not use item names to fall back on.
FOOD_TYPE = {
    0: 'drink', 1: 'meat', 2: 'fish', 3: 'cheese', 4: 'bread',
    5: 'mushroom', 6: 'fruit', 7: 'raw meat', 8: 'raw fish',
}


def goods_of(cls, sub, food=None):
    """One of our words for an item, or `oddment` if it is nothing in
    particular — which is what most of what a kobold carries actually is."""
    word = GOODS.get((cls, sub)) or GOODS.get((cls, None)) or 'oddment'
    if word == 'food' and food is not None:
        return FOOD_TYPE.get(food, 'food')
    return word


# `conditions.SourceTypeOrReferenceId` — only the one this world can act on so
# far.  1 is "this row of a creature's loot table", keyed by the loot id in
# `SourceGroup` and the item in `SourceEntry`.
SRC_CREATURE_LOOT = 1
# And the condition types.  9 is "has this quest in the log"; 6 is "is on this
# side", which for a game with one race is always true and is read anyway so
# that a row nobody can satisfy is visible rather than invisible.
COND_QUEST_TAKEN, COND_TEAM = 9, 6
TEAM_ALLIANCE = 469


def loot_conditions(base):
    """When a drop is allowed to drop, out of `conditions`.

    14,630 rows, of which nine touch this slice: two say an item only falls
    while you hold a particular quest, and seven say it only falls for one
    side.  Small, and the wiki's first example of what goes wrong without the
    table — **quest loot dropping without the quest** — which is the sort of
    wrongness that looks exactly like generosity.

    The convention is the trap: **rows in the same `ElseGroup` are ANDed and
    different groups are ORed.**  Read the other way round the condition runs
    backwards, and neither direction looks like an error from outside — things
    are simply visible that should not be, or missing that should not be.

    Returns `{(loot id, item): [[condition, ...], ...]}`, outer list ORed.
    """
    path = os.path.join(base, 'conditions.sql')
    if not os.path.exists(path):
        return {}
    col = columns(path)
    groups = {}
    for line in rows(path):
        f = split(line)
        try:
            if int(f[col['SourceTypeOrReferenceId']]) != SRC_CREATURE_LOOT:
                continue
            key = (int(f[col['SourceGroup']]), int(f[col['SourceEntry']]))
            groups.setdefault(key, {}).setdefault(
                int(f[col['ElseGroup']]), []).append([
                    int(f[col['ConditionTypeOrReference']]),
                    int(f[col['ConditionValue1']]),
                    int(f[col['ConditionValue2']]),
                    int(f[col['NegativeCondition']])])
        except (ValueError, KeyError, IndexError):
            continue
    return {k: [v[g] for g in sorted(v)] for k, v in groups.items()}


# `item_template.class` 2.  One number, named once, because three places ask.
WEAPON_CLASS = 2

#: `item_template.FoodType`'s column, and how far a row has to be split to
#: reach it.  Read out of the dump's own `CREATE TABLE` by `columns()` in the
#: one place that can afford to; named here because two loot readers split a
#: fixed prefix rather than the whole row.
I_FOOD_TYPE = 133
ITEM_FIELDS = I_FOOD_TYPE + 1
#: `(class, subclass)` for food and drink, which is the only pair that has to
#: be split that far.
FOOD = (0, 5)

# `item_template.subclass` inside class 2, weapons, mapped onto the five
# sheets `bake_npcs.py` cuts.  The numbers are the client's own enum and the
# words are ours, the same bargain as everywhere else.
#
# Not every one of them is drawn, and the ones that are not are declared
# below rather than falling silently into an empty hand.
WEAPON_SUBCLASS = {
    0: 'axe', 1: 'axe',            # one hand and two
    4: 'mace', 5: 'mace',
    7: 'sword', 8: 'sword',
    10: 'staff', 6: 'staff',       # a polearm is a pole, and four of them
    15: 'dagger',
}

# What is carried and not drawn, counted.  A bow held at rest is a bow across
# the back and there is no sheet for that; a wand and a fishing pole are four
# spawns between them.
WEAPON_NOT_DRAWN = {
    2: 'bow', 3: 'gun', 16: 'thrown', 18: 'crossbow', 19: 'wand',
    13: 'fist', 14: 'misc', 20: 'fishing pole',
}


def item_classes(base):
    """`{entry: (class, subclass)}` for every item in the dump.

    Twelve columns of forty-six thousand rows, read with `split_head` for the
    same reason `loot_tables` does: the full split of `item_template` is a
    hundred and thirty fields and none of the rest is wanted here.
    """
    out = {}
    for line in rows(os.path.join(base, 'item_template.sql')):
        f = split_head(line, 3)
        try:
            out[int(f[0])] = (int(f[1]), int(f[2]))
        except (ValueError, IndexError):
            continue
    return out


def equipment(base, entries, items_of):
    """What each creature holds, out of `creature_equip_template`.

    309 rows of it touch this slice and nothing read one, so a guard with a
    broadsword, a kobold with a pickaxe and a farmer all stood with the same
    empty hands.

    Two things come out and the second one is the surprise.  The **main hand**
    decides what is drawn.  The **off hand** decides whether this one swings
    twice, and that is not a guess: `Creature::CanDualWield` (Creature.cpp:3356)
    looks up whatever is in the off-hand slot and asks only whether its class
    is a weapon.

    What does **not** come out of here is the swing timer, and the issue that
    asked for this expected it to.  `Creature::UpdateLevelDependantStats`
    (Creature.cpp:617) sets both attack times from `cInfo->BaseAttackTime`;
    the item is never consulted.  For a creature the equipped weapon is
    cosmetic plus dual wield, and the slice says the same thing out loud —
    87 spawns carry a weapon the template disagrees with by 500ms and using
    the item would have made every one of them swing at a rate the server
    never does.
    """
    path = os.path.join(base, 'creature_equip_template.sql')
    if not os.path.exists(path):
        return {}, Counter()
    col = columns(path)
    rowsof = {}
    for line in rows(path):
        f = split(line)
        try:
            cid, eid = int(f[col['CreatureID']]), int(f[col['ID']])
        except (ValueError, KeyError, IndexError):
            continue
        if cid in entries:
            rowsof.setdefault(cid, {})[eid] = (
                int(f[col['ItemID1']]), int(f[col['ItemID2']]))
    out, left = {}, Counter()
    for cid, byid in rowsof.items():
        # `creature_template.equipment_id` is not in this dump's schema, so
        # the set is the one the server falls back to: id 1, and failing that
        # whichever single one the row has.
        main, off = byid.get(1) or next(iter(byid.values()))
        word = None
        if main in items_of:
            cls, sub = items_of[main]
            if cls == WEAPON_CLASS:
                word = WEAPON_SUBCLASS.get(sub)
                if not word:
                    left[WEAPON_NOT_DRAWN.get(sub, f'subclass {sub}')] += 1
        dual = off in items_of and items_of[off][0] == WEAPON_CLASS
        if word or dual:
            out[cid] = (word, dual)
    return out, left


#: How far a loot table may point at another one before this gives up.
#
#: Measured rather than chosen: the deepest chain this slice can reach is two,
#: so three cuts nothing here and the report below says so out loud if a wider
#: slice ever reaches further.  A limit is needed whatever the number, because
#: the table can point at itself — the shape the wiki warned about.
REF_DEPTH = 3


def loot_rows(base, name):
    """One loot table file as `{entry: [(item, reference, chance, group, lo, hi)]}`.

    `Chance` comes out negative for grouped drops and the sign is the group's
    business, not ours.  A chance of **nought inside a group** is not "never":
    it is the table's way of saying every row of that group is equally likely,
    which is why the zero has to survive this far rather than being dropped
    here.
    """
    path = os.path.join(base, name)
    col = columns(path)
    out = {}
    for line in rows(path):
        f = split(line)
        try:
            out.setdefault(int(f[col['Entry']]), []).append(
                (int(f[col['Item']]), int(f[col['Reference']]),
                 abs(float(f[col['Chance']])), int(f[col['GroupId']]),
                 int(f[col['MinCount']]), int(f[col['MaxCount']])))
        except (ValueError, IndexError, KeyError):
            continue
    return out


def flatten(table, refs, cut, seen=(), depth=0):
    """A loot table with its references resolved, as `[(item, chance, lo, hi)]`.

    `Reference` is one of ten columns of a loot row and **nothing in this
    repository read it**: 153 of the 691 loot rows this slice can reach point
    at another table rather than at an item, over 50 distinct reference tables,
    and every one of them was being thrown away where the item lookup failed.
    It did not look like a bug — a creature that drops less than it should
    looks like a stingy creature.

    Three rules the table states about itself and this honours:

      * a reference can point at a reference, and does — 25 of the slice's 50
        are one deep and 7 are two.  So this recurses, with `REF_DEPTH` and a
        cycle guard, and **anything it refuses is counted rather than
        dropped**, which is the half of this the wiki asked for by name.
      * a chance of nought inside a group means the group is equally likely,
        so it becomes one over the size of the group rather than never.
      * entering a reference is itself a roll, so what comes out of it is
        scaled by the chance of the row that pointed there.  A 30% reference
        holding a 16% item is not a 16% item.
    """
    out = []
    # The size of each group, for the rows that state no chance of their own.
    sizes = Counter(g for _i, _r, _c, g, _lo, _hi in table if g)
    for item, ref, chance, group, lo, hi in table:
        if not chance and group:
            chance = 100.0 / max(1, sizes[group])
        if chance <= 0:
            continue
        if not ref:
            out.append((item, chance, lo, hi))
            continue
        if depth >= REF_DEPTH or ref in seen or ref not in refs:
            cut['too deep' if depth >= REF_DEPTH
                else 'points at itself' if ref in seen
                else 'no such reference table'] += 1
            continue
        for i, c, a, b in flatten(refs[ref], refs, cut, seen + (ref,), depth + 1):
            out.append((i, c * chance / 100.0, a, b))
    return out


#: `creature_template.type_flags` bits that say a corpse is opened with some
#: other trade — `Creature::GetRequiredLootSkill` (CreatureData.h:252) reads
#: exactly these three and falls through to skinning.  Measured for this slice
#: and **none of its 25 skinnable templates carries one**, so everything here
#: is skinned with skinning; the mask is read anyway so a wider slice is told
#: rather than quietly wrong.
SKIN_WITH_OTHER = 0x100 | 0x200 | 0x8000000


def skinning_tables(base, cut):
    """What comes off a carcass, by `creature_template.skinloot`.

    49 rows of `skinning_loot_template` touch this slice and the game had no
    third gathering trade at all — 207 herbs and 186 veins and **nought
    leather**, against 245 wolves, 137 boars, 45 bears and 17 sheep standing in
    it.  The wiki called that the cheapest answer to "is there a trade in this
    slice", because it is a third thing in a groove two things already run in.

    The same `flatten` as everything else: a skinning table points at a
    reference like any other.
    """
    iclass, sells = {}, {}
    for line in rows(os.path.join(base, 'item_template.sql')):
        f = split_head(line, 12)
        try:
            cls, sub = int(f[1]), int(f[2])
            # `FoodType` is column 133 and it is the only one that tells a
            # drink from a loaf — see `FOOD_TYPE`.  Reached in a second pass
            # over the few rows that are food rather than by splitting all
            # 46,096 to a hundred and thirty-four fields, which took this
            # script from six seconds to fourteen.
            food = (int(split_head(line, ITEM_FIELDS)[I_FOOD_TYPE])
                    if (cls, sub) == FOOD else 0)
            iclass[int(f[0])] = (cls, sub, food)
            sells[int(f[0])] = int(f[11])
        except (ValueError, IndexError):
            continue
    refs = loot_rows(base, 'reference_loot_template.sql')
    out = {}
    for lid, table in loot_rows(base, 'skinning_loot_template.sql').items():
        for item, chance, lo, hi in flatten(table, refs, cut):
            if item not in iclass:
                cut['no such item'] += 1
                continue
            out.setdefault(lid, []).append(
                (goods_of(*iclass[item]), min(100.0, chance), lo, hi,
                 max(0, sells.get(item, 0)), item, 0))
    for lid in out:
        out[lid].sort(key=lambda r: -r[1])
    return out


def loot_tables(base, kinds_by_entry, cut=None):
    """What each creature carries: coins, and things by what sort they are.

    `creature_loot_template` keyed through `creature_template.lootid`, which is
    the same path the quest objectives already take through this file, with
    `reference_loot_template` resolved into it by `flatten`.
    """
    gated = loot_conditions(base)
    iclass, sells = {}, {}
    for line in rows(os.path.join(base, 'item_template.sql')):
        f = split_head(line, 12)
        try:
            cls, sub = int(f[1]), int(f[2])
            # `FoodType` is column 133 and it is the only one that tells a
            # drink from a loaf — see `FOOD_TYPE`.  Reached in a second pass
            # over the few rows that are food rather than by splitting all
            # 46,096 to a hundred and thirty-four fields, which took this
            # script from six seconds to fourteen.
            food = (int(split_head(line, ITEM_FIELDS)[I_FOOD_TYPE])
                    if (cls, sub) == FOOD else 0)
            iclass[int(f[0])] = (cls, sub, food)
            sells[int(f[0])] = int(f[11])
        except (ValueError, IndexError):
            continue

    cut = Counter() if cut is None else cut
    refs = loot_rows(base, 'reference_loot_template.sql')
    by_loot = {}
    for lid, table in loot_rows(base, 'creature_loot_template.sql').items():
        for item, chance, lo, hi in flatten(table, refs, cut):
            if item not in iclass:
                cut['no such item'] += 1
                continue
            # The price is this item's, carried with the drop.  Taken as a
            # median over everything the word covers it came out at 1.7 gold
            # for a "weapon" — which is a real price, of a real sword, dropped
            # by something on the far side of the zone at level seventy.  A
            # level 5 bandit's weapon is worth what *his* weapon is worth.
            # The id travels with the drop as well as our word for it.
            # Without it a sword arrives in the bag as the noun "weapon" and
            # can never be held — which is why there was no equipment: an item
            # lost its identity on the way in.
            # What has to be true for it to fall.  A quest item that falls
            # without the quest is the wiki's own first example of what goes
            # missing with this table, and it looks like generosity rather
            # than like a bug.  The condition is keyed on the table the row
            # was *written* in, so a referenced row carries the reference's
            # conditions and not the creature's — which is right: the
            # reference is where somebody wrote the rule down.
            need = 0
            for either in gated.get((lid, item), ()):
                for kind, v1, _v2, negate in either:
                    if kind == COND_QUEST_TAKEN and not negate:
                        need = v1
            by_loot.setdefault(lid, []).append(
                (goods_of(*iclass[item]), min(100.0, chance), lo, hi,
                 max(0, sells.get(item, 0)), item, need))
    # Best first, so the eight this ships per creature are the eight worth
    # shipping.  Before references were resolved the order was the table's and
    # eight was never a squeeze; a resolved table can be forty rows long.
    for lid in by_loot:
        by_loot[lid].sort(key=lambda r: -r[1])
    return by_loot


def with_weapon(st, level, weapon):
    """The player's line, which is a creature's plus what he is holding.

    Same arithmetic as everything he swings at: the weapon's own range, plus
    the attack power spread over the swing.  His health, armour and attack
    power come from `creature_classlevelstats` at his level and class, because
    this dump has no player table and inventing one would put the only made-up
    number in the fight on the player's side.
    """
    base = st.get((level, 1))
    if not base:
        return None
    hp, armour, _ap, _dmg, strength = base
    # A warrior's attack power comes from Strength, not from the attack power
    # column — that column is what a *creature* of this level and class swings
    # with, and it is a third of a player's.  Using it gave the hero three
    # damage a swing against a hundred-health wolf, which is a fight he cannot
    # finish.  Strength times two, plus three a level, less twenty: the game's
    # own line, and Strength is in the same table.
    ap = strength * 2 + level * 3 - 20
    wlo, whi, delay = weapon
    t = delay / 1000.0
    add = ap / 14.0 * t
    return [max(1, round(hp)), max(1, round(wlo + add)), max(1, round(whi + add)),
            delay, round(armour), 0]


def split_head(line, n):
    """The first `n` fields of a tuple, quote-aware, then stop.

    `item_template` is forty-six thousand rows of a hundred and thirty columns
    and the interesting ones are the first eleven.  Splitting all of them costs
    a minute; splitting eleven costs nothing.
    """
    body = line.rstrip().rstrip(';').rstrip(',').strip()[1:]
    out, cur, quoted, esc = [], [], False, False
    for ch in body:
        if esc:
            cur.append(ch); esc = False
        elif ch == '\\':
            esc = True
        elif ch == "'":
            quoted = not quoted
        elif ch == ',' and not quoted:
            out.append(''.join(cur)); cur = []
            if len(out) == n:
                return out
        else:
            cur.append(ch)
    out.append(''.join(cur))
    return out


def talking(base, entries):
    """What each of `entries` can hold a conversation about.

    Every field here is a count, an id or a level.  Nothing that anybody wrote.
    """
    num = re.compile(r'-?\d+')

    def pairs(name, a=0, b=1):
        out = {}
        for line in rows(os.path.join(base, name)):
            f = num.findall(line)
            out.setdefault(int(f[a]), []).append(int(f[b]))
        return out

    starts = pairs('creature_queststarter.sql')
    ends = pairs('creature_questender.sql')

    # Items: class and buy price, for the vendors; and which creature drops
    # one, for the quests.
    iclass, iprice = {}, {}
    for line in rows(os.path.join(base, 'item_template.sql')):
        f = split_head(line, 11)
        try:
            iclass[int(f[0])] = int(f[1])
            iprice[int(f[0])] = int(f[10])
        except (ValueError, IndexError):
            continue

    tpl = os.path.join(base, 'creature_template.sql')
    col = columns(tpl)
    loot_of, kind_by_entry = {}, {}
    for line in rows(tpl):
        f = split(line)
        try:
            e = int(f[0])
        except ValueError:
            continue
        k = classify(f[col['name']].strip("'").replace("\\'", "'"),
                     int(f[col['type']]), family=int(f[col['family']]))
        if k:
            kind_by_entry[e] = k
        li = int(f[col['lootid']])
        if li:
            loot_of.setdefault(li, []).append(e)

    drops = {}      # item -> Counter of kinds that carry it
    for line in rows(os.path.join(base, 'creature_loot_template.sql')):
        f = line[1:].split(',', 2)
        try:
            lid, item = int(f[0]), int(f[1])
        except (ValueError, IndexError):
            continue
        for e in loot_of.get(lid, ()):
            if e in kind_by_entry:
                drops.setdefault(item, Counter())[kind_by_entry[e]] += 1

    # Quests, but only the ones somebody in the slice hands out.
    wanted_q = {q for e in entries for q in starts.get(e, ())}
    qcol = columns(os.path.join(base, 'quest_template.sql'))
    quests = {}
    for line in rows(os.path.join(base, 'quest_template.sql')):
        f = split(line)
        try:
            q = int(f[0])
        except ValueError:
            continue
        if q not in wanted_q:
            continue
        kill, take, find = [], [], []
        for i in (1, 2, 3, 4):
            t = int(f[qcol[f'RequiredNpcOrGo{i}']])
            c = int(f[qcol[f'RequiredNpcOrGoCount{i}']])
            if t > 0 and c and t in kind_by_entry:
                kill.append([kind_by_entry[t], c])
        for i in range(1, 7):
            it = int(f[qcol[f'RequiredItemId{i}']])
            c = int(f[qcol[f'RequiredItemCount{i}']])
            if not (it > 0 and c):
                continue
            src = drops.get(it)
            if src:
                take.append([src.most_common(1)[0][0], c])
            else:
                # Class 12 is a quest item, and one nothing in the slice drops
                # came off a chest, a bush or somebody's hand — all of which
                # live in text.  It is something to find, and that is all the
                # numbers say.
                cl = iclass.get(it, 15)
                find.append([None if cl == 12 else ITEM_CLASS.get(cl, 'oddments'), c])
        quests[q] = {'lv': int(f[qcol['QuestLevel']]),
                     'coin': int(f[qcol['RewardMoney']]),
                     'kill': kill, 'take': take, 'find': find}

    # Vendors, grouped by what kind of thing it is and what it costs.
    vendor = {}
    for line in rows(os.path.join(base, 'npc_vendor.sql')):
        f = num.findall(line)
        vendor.setdefault(int(f[0]), []).append(int(f[2]))

    # `creature_template_movement.Swim` is **not** the column for "lives in
    # water", and it is worth writing down that it was tried.  Measured over
    # this slice it says every wolf, boar, rabbit and chicken swims and not
    # one murloc does — 233 wolves to 0 murlocs.  What it means is whether the
    # server may move the creature through water at all, which for a land
    # animal chasing you into a lake is yes and for a murloc that never leaves
    # its own pond is no.  The question here is the other one, and the answer
    # to it is in `src/main.ts`, derived from where the kind actually stands.

    # Trainers.  `Type` says class / mount / trade / beast, and for a class
    # trainer `Requirement` is the class id.
    tid = {}
    for line in rows(os.path.join(base, 'creature_default_trainer.sql')):
        f = num.findall(line)
        tid[int(f[0])] = int(f[1])
    tmeta = {}
    for line in rows(os.path.join(base, 'trainer.sql')):
        f = split(line)
        tmeta[int(f[0])] = (int(f[1]), int(f[2]))
    tspell = {}
    for line in rows(os.path.join(base, 'trainer_spell.sql')):
        f = num.findall(line)
        tspell.setdefault(int(f[0]), []).append((int(f[8]), int(f[3])))

    # A real gossip menu, which here means one whose options open another menu.
    # `gossip_menu_id` of 0 is *no menu*, and menu 0 is the client's own
    # eighteen built-in option types — joined naively, every guard in Azeroth
    # appears to hold an eighteen-option conversation.
    submenus = Counter()
    for line in rows(os.path.join(base, 'gossip_menu_option.sql')):
        f = split(line)
        if int(f[0]) != 0 and int(f[5]) == 1:
            submenus[int(f[0])] += 1
    menu_of = {}
    for line in rows(tpl):
        f = split(line)
        try:
            e = int(f[0])
        except ValueError:
            continue
        if e in entries:
            menu_of[e] = int(f[col['gossip_menu_id']])

    topics = {}
    for e in entries:
        t = {}
        # Errands used to be *described* here — a line saying what somebody
        # wanted, with nothing behind it.  `pipeline/quests.py` writes the real
        # ones now and `src/quest.ts` hands them over, counts them and pays
        # them, so a topic no longer carries work at all.
        if vendor.get(e):
            by = {}
            for it in vendor[e]:
                c = ITEM_CLASS.get(iclass.get(it, 15), 'oddments')
                g = by.setdefault(c, [0, None, 0])
                g[0] += 1
                p = iprice.get(it, 0)
                g[1] = p if g[1] is None else min(g[1], p)
                g[2] = max(g[2], p)
            t['shop'] = sorted(([c] + v for c, v in by.items()),
                               key=lambda r: -r[1])
        if e in tid and tid[e] in tmeta:
            kind, req = tmeta[tid[e]]
            spells = tspell.get(tid[e], [])
            levels = [lv for lv, _ in spells]
            # The first rank of a trade requires no skill, so the zeroes are
            # not evidence of anything; the mode of the rest is the trade.
            skills = Counter(sk for _, sk in spells if sk)
            t['train'] = {
                'of': TRAINER_TYPE.get(kind, 'trade'),
                'who': (CLASS_NAME.get(req) if kind == 0 else
                        SKILL_NAME.get(skills.most_common(1)[0][0])
                        if skills else None),
                'n': len(spells),
                'lo': min(levels) if levels else 0,
                'hi': max(levels) if levels else 0,
            }
        if submenus.get(menu_of.get(e, 0)):
            t['directs'] = submenus[menu_of[e]]
        if t:
            topics[e] = t
    return topics


def patrols(base):
    """Every leg of every patrol in the slice, as `(x, y)` pairs.

    The same 187 routes `walkable` measures the steepest of, handed back whole
    so the terrain can be asked a harder question than "how steep does it get":
    **is every point the server walks a creature over a point we would let
    anybody stand on?**
    """
    path = os.path.join(base, 'waypoint_data.sql')
    if not os.path.exists(path):
        return []
    col = columns(path)
    paths = {}
    for line in rows(path):
        f = split(line)
        try:
            pid, pt = int(f[col['id']]), int(f[col['point']])
            x, y = float(f[col['position_x']]), float(f[col['position_y']])
        except (ValueError, IndexError, KeyError):
            continue
        if not (BOUNDS[0] <= x <= BOUNDS[1] and BOUNDS[2] <= y <= BOUNDS[3]):
            continue
        paths.setdefault(pid, []).append((pt, x, y))
    out = []
    for pts in paths.values():
        pts.sort()
        out.append([[round(x, 2), round(y, 2)] for _pt, x, y in pts])
    return out


def walkable(base):
    """The steepest ground the server itself walks a creature over.

    The limit on climbing was a guess in a comment — fifty degrees, "roughly
    where a person stops being able to walk up something" — and a guess in that
    position is a wall in the wrong place.  At fifty the mountain between
    Northshire and the east has a switchback in it: a route a hundred yards up
    where every step is between 1.14 and 1.19, threading just under the limit,
    and a flood fill from the abbey walks it and comes out on ground that
    belongs to no zone at all.

    `waypoint_data` settles it without anybody choosing a number.  It is 187
    patrol routes in this slice and 3,954 legs of walking, laid down by the
    people who run the server, and **not one of them climbs steeper than 0.90**
    — forty-two degrees.  Half are under 0.04.  That is the world's own
    statement of what walking is, so it is what this returns.
    """
    p = os.path.join(base, 'waypoint_data.sql')
    if not os.path.exists(p):
        return None
    col = columns(p)
    paths = {}
    for line in rows(p):
        f = split(line)
        try:
            pid, pt = int(f[col['id']]), int(f[col['point']])
            x, y = float(f[col['position_x']]), float(f[col['position_y']])
            z = float(f[col['position_z']])
        except (ValueError, IndexError):
            continue
        if not (BOUNDS[0] <= x <= BOUNDS[1] and BOUNDS[2] <= y <= BOUNDS[3]):
            continue
        paths.setdefault(pid, []).append((pt, x, y, z))
    worst = 0.0
    legs = 0
    for pts in paths.values():
        pts.sort()
        for a, b in zip(pts, pts[1:]):
            flat = math.hypot(b[1] - a[1], b[2] - a[2])
            if flat < 1:
                continue
            legs += 1
            worst = max(worst, abs(b[3] - a[3]) / flat)
    return (round(worst, 3), legs, len(paths)) if legs else None


def moving(base):
    """How each creature gets about, from `creature_template_movement`.

    Two of its columns were never read and both are behaviour: `Swim` says
    whether a thing can be in water at all, and `Rooted` says it cannot move,
    which 193 of them cannot.

    **The table holds the exceptions, not the rule.**  Only 101 of the 657
    creatures in this slice have a row at all; the rest take the core's own
    defaults, which are swim yes and rooted no.  Read the other way round —
    absent means cannot — every wolf in Elwynn would be unable to cross a
    stream, and 90 of the 101 rows that *are* there say exactly that, which is
    what makes them worth having.
    """
    p = os.path.join(base, 'creature_template_movement.sql')
    if not os.path.exists(p):
        return {}
    col = columns(p)
    out = {}
    for line in rows(p):
        f = split(line)
        try:
            e = int(f[col['CreatureId']])
        except (ValueError, IndexError):
            continue

        def bit(name):
            v = f[col[name]]
            return 1 if v not in ('0', 'NULL', '') else 0
        out[e] = (bit('Swim'), bit('Rooted'))
    return out


def main(acore, out):
    base = os.path.join(acore, 'data/sql/base/db_world')
    for name in ('creature.sql', 'creature_template.sql',
                 'game_event_creature.sql', 'pool_creature.sql'):
        if not os.path.exists(os.path.join(base, name)):
            sys.exit(f'missing {os.path.join(base, name)}')

    num = re.compile(r'-?\d+')
    seasonal = set()
    for line in rows(os.path.join(base, 'game_event_creature.sql')):
        event, guid = num.findall(line)[:2]
        if int(event) > 0:
            seasonal.add(int(guid))
    pooled, limit = {}, {}
    ppath = os.path.join(base, 'pool_creature.sql')
    pcol = columns(ppath)
    for line in rows(ppath):
        f = split(line)
        try:
            pooled[int(f[pcol['guid']])] = int(f[pcol['pool_entry']])
        except (ValueError, KeyError, IndexError):
            continue
    tpath = os.path.join(base, 'pool_template.sql')
    tcol = columns(tpath)
    for line in rows(tpath):
        f = split(line)
        try:
            limit[int(f[tcol['entry']])] = int(f[tcol['max_limit']])
        except (ValueError, KeyError, IndexError):
            continue

    # Who walks with whom.  `creature_formations` is 6,021 rows and eleven
    # groups of it stand in this slice, the biggest eight strong.  Without it
    # everything comes at you one at a time and pulling — the one decision the
    # fun page finds in this game's combat — is not a decision.
    packs = {}
    fpath = os.path.join(base, 'creature_formations.sql')
    fcol = columns(fpath)
    for line in rows(fpath):
        f = split(line)
        try:
            packs[int(f[fcol['memberGUID']])] = int(f[fcol['leaderGUID']])
        except (ValueError, KeyError, IndexError):
            continue

    spawns, dropped = [], Counter()
    for line in rows(os.path.join(base, 'creature.sql')):
        f = line[1:].split(',', C_O + 1)
        try:
            if int(f[C_MAP]) != MAP:
                continue
            guid = int(f[C_GUID])
            x, y = float(f[C_X]), float(f[C_X + 1])
            # And the height, which is the only thing in this repository that
            # knows where the caves are — see the row this ends up in.
            cz = float(f[C_X + 2])
            o = float(f[C_O])
        except (ValueError, IndexError):
            continue
        if not (BOUNDS[0] <= x <= BOUNDS[1] and BOUNDS[2] <= y <= BOUNDS[3]):
            continue
        if guid in seasonal:
            dropped['seasonal'] += 1
            continue
        # A pooled creature shares a slot with others.  Kept, rather than
        # dropped: `pool_template.max_limit` says how many of a slot stand at
        # once and the scene stands up that many, the same way the game
        # objects do.  Dropped, the forest loses every creature the server
        # rotates — and what it rotates is exactly the interesting ones.
        pool = pooled.get(guid, 0)
        # The three columns after the orientation, which the fast split does
        # not reach: `line[1:].split(',', C_O + 1)` stops at it.
        g = split(line)
        spawns.append((int(f[C_ID]), x, y, o, guid, pool, limit.get(pool, 0),
                       packs.get(guid, 0),
                       int(float(g[C_RESPAWN])), float(g[C_WANDER]),
                       int(g[C_MOVE]), cz))

    tpl = os.path.join(base, 'creature_template.sql')
    col = columns(tpl)
    stats, factions = fight_tables(base)
    swims = moving(base)
    # `(steepest, legs, routes)`.  Named for what it is: this was `got`, and
    # `got` is reused eighty lines further down for a creature's fight row, so
    # the check at the end printed a creature's health as the climbing limit —
    # or rather it did not, because it also exited with a `NameError` first.
    climb = walkable(base)
    walk = climb[0] if climb else 0.0
    wanted = {e for e, *_ in spawns}
    info = {}
    why = {}
    ways = {}
    for line in rows(tpl):
        f = split(line)
        try:
            entry = int(f[0])
        except ValueError:
            continue
        if entry not in wanted:
            continue
        name = f[col['name']].strip("'").replace("\\'", "'")
        ctype = int(f[col['type']])
        # How it moves and how far it sees, from the template rather than from
        # a constant here.  `speed_walk` and `speed_run` are multipliers of the
        # game's own 2.5 and 7.0 yards a second; `detection_range` is the
        # aggro radius, which was a flat twenty.
        ways[entry] = (round(float(f[col['speed_walk']]), 2),
                       round(float(f[col['speed_run']]), 2),
                       round(float(f[col['detection_range']]), 1),
                       round(float(f[col['ExperienceModifier']]), 2))
        family = int(f[col['family']])
        # Kept beside the tuple rather than in it: the only thing that ever
        # asks is the gate below, and it asks about the ones that did not
        # classify.
        why[entry] = (not_drawn(name, ctype, family), ctype, family)
        info[entry] = (classify(name, ctype,
                                stance(factions, int(f[col['faction']]))
                                != FRIEND, family), ctype,
                       int(f[col['minlevel']]), int(f[col['maxlevel']]),
                       int(f[col['npcflag']]), int(f[col['rank']]),
                       int(f[col['unit_class']]), int(f[col['faction']]),
                       (float(f[col['HealthModifier']]),
                        float(f[col['DamageModifier']]),
                        float(f[col['ArmorModifier']]),
                        int(f[col['BaseAttackTime']])),
                       int(f[col['lootid']]),
                       (int(f[col['mingold']]), int(f[col['maxgold']])),
                       # What comes off the carcass, and whether it comes off
                       # with a knife at all.
                       (int(f[col['skinloot']])
                        if not int(f[col['type_flags']]) & SKIN_WITH_OTHER
                        else 0))

    # What is in the hand.  `creature_equip_template` is 309 rows touching
    # this slice and was read by nothing at all.
    holds, not_held = equipment(base, wanted, item_classes(base))

    topics = talking(base, {e for e, *_ in spawns
                            if e in info and info[e][0]})
    topic_list, topic_at = [], {}
    for e, t in topics.items():
        topic_at[e] = len(topic_list)
        topic_list.append(t)

    lost = Counter()
    carried = loot_tables(base, None, lost)
    skins = skinning_tables(base, lost)
    goods, hauls, haul_at = [], [], {}
    kinds, roles, out_rows, arms = [], [], [], []
    fights, fight_at = [], {}
    unknown = Counter()
    left_out, undeclared = Counter(), Counter()
    moves, move_at = [], {}
    for entry, x, y, o, guid, pool, most, leader, respawn, wander, mtype, z \
            in spawns:
        if entry not in info:
            dropped['no template'] += 1
            continue
        kind, ctype, lo, hi, flags, rank, cls, faction, mods, lootid, purse, \
            skinid = info[entry]
        if kind is None:
            reason, ct, fam = why[entry]
            # Declared or not, it is counted the same way; the difference is
            # whether the run survives the end of this function.
            (left_out if reason else undeclared)[reason or (ct, fam)] += 1
            unknown[ctype] += 1
            dropped['no picture'] += 1
            continue
        r = role(flags, ctype, rank)
        if kind not in kinds:
            kinds.append(kind)
        if r not in roles:
            roles.append(r)
        # Orientation is radians about +x, and +x is up the screen, so the four
        # LPC rows fall out of it directly: 0 up, pi/2 left, pi down, 3pi/2
        # right.  That agreement is luck, and it is checked below.
        facing = int(round(o / (math.pi / 2))) % 4
        level = (lo + hi) // 2
        # What a fight with this one costs, deduplicated: 1,884 spawns come to
        # a few dozen distinct sets of numbers, because everything of one kind
        # at one level is worth exactly the same.
        got = fight_of(stats, factions, level, cls, faction, mods)
        if got is None:
            fi = -1
        else:
            if got not in fight_at:
                fight_at[got] = len(fights)
                fights.append(list(got))
            fi = fight_at[got]
        # And what it is carrying, deduplicated the same way: a kobold is a
        # kobold's pockets whichever kobold it is.
        items = []
        for word, chance, clo, chi, sell, item, need in carried.get(lootid, [])[:8]:
            if word not in goods:
                goods.append(word)
            items.append([goods.index(word), round(chance, 1), clo, chi, sell,
                          item, need])
        haul = (purse[0], purse[1], tuple(map(tuple, items)))
        if haul not in haul_at:
            haul_at[haul] = len(hauls)
            hauls.append([purse[0], purse[1], items])
        # And what comes off it afterwards, in the same shape and the same
        # list — a skin is a pocket with no coins in it.  Kept separate from
        # the pocket because the two are taken at different times: a corpse
        # becomes skinnable only once its ordinary loot is gone
        # (`Creature::AllLootRemovedFromCorpse`, Creature.cpp:3152).
        skinned = []
        for word, chance, clo, chi, sell, item, _need in skins.get(skinid, [])[:6]:
            if word not in goods:
                goods.append(word)
            skinned.append([goods.index(word), round(chance, 1), clo, chi,
                            sell, item, 0])
        pelt = (0, 0, tuple(map(tuple, skinned)))
        if not skinned:
            hide = -1
        else:
            if pelt not in haul_at:
                haul_at[pelt] = len(hauls)
                hauls.append([0, 0, skinned])
            hide = haul_at[pelt]
        # The entry comes out too, because a quest is keyed on it: a quest
        # names the creature that gives it and the creature you kill eight of,
        # and a kind — `kobold` for all three of Northshire's — cannot tell
        # those apart.  It is a number and not a name, so it may leave.
        # How this one moves, deduplicated: 1,886 spawns come to a few dozen
        # distinct answers, because everything of one kind on one post behaves
        # the same.
        w, run, notice, xpmod = ways.get(entry, (1.0, 1.14, 20.0, 1.0))
        swim, rooted = swims.get(entry, (1, 0))
        way = (w, run, notice, xpmod, respawn,
               round(wander, 1) if mtype == 1 and not rooted else 0.0,
               0 if rooted else mtype, swim)
        if way not in move_at:
            move_at[way] = len(moves)
            moves.append(list(way))
        # `guid` and `leader` are the world's own identities, which is what a
        # pack and a shared slot are keyed on.  `pool` is which slot and `most`
        # how many of it stand at once.
        # `z` comes last and it is not decoration: a creature standing six
        # yards under the baked surface is standing in a cave, and that is the
        # only thing in this repository that knows where the caves are.  A
        # mine is a hole cut out of the terrain itself — the height field has
        # one z for an (x, y) and cannot hold a tunnel — so the shape has to
        # come from somewhere, and the server knowing where its creatures put
        # their feet is the same structural fact the heights already lean on.
        # What this one is holding, as an index into `arms`, and whether it
        # swings twice.  Only a person carries one, and the test is the data's
        # rather than the art's: the weapon sheets are drawn for LPC's body,
        # and `creature_equip_template` cheerfully hands a sword to a chicken
        # and a mace to a bear — three rows of it in this slice do exactly
        # that.  `PERSON_TYPES` is the same test `classify` already makes.
        word, dual = holds.get(entry, (None, False))
        if word and ctype in PERSON_TYPES:
            if word not in arms:
                arms.append(word)
            weapon = arms.index(word)
        else:
            weapon = -1
        out_rows.append([round(x, 2), round(y, 2), kinds.index(kind), facing,
                         level, roles.index(r), topic_at.get(entry, -1), fi,
                         haul_at[haul], entry, move_at[way],
                         guid, pool, most, leader, round(z, 1),
                         weapon, 1 if dual else 0, hide])

    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, 'npcs.json')
    with open(path, 'w') as f:
        # The player, at every level the forest is worth fighting through.
        # This dump has no `player_classlevelstats`, so he is statted as a
        # creature of his level and class would be — which is the same
        # arithmetic everything he swings at uses, and is why a fight with a
        # level 5 wolf comes out as a fight with a level 5 wolf.
        # The sword a human warrior starts with: `item_template` entry 25,
        # "Worn Shortsword", 1 to 3 damage on a 1.9 second delay.  Transcribed
        # rather than looked up, because scanning forty-six thousand item rows
        # for three numbers is a bake step nobody would keep.
        #
        # Unarmed, a level 5 hero and a level 5 wolf trade four damage a swing
        # and the fight runs forty seconds.  A weapon is most of what a person
        # hits with in this game, and leaving it out was not a simplification —
        # it was a different game.
        player = [with_weapon(stats, lv, (1, 3, 1900)) for lv in range(1, 21)]
        # What each level costs, straight out of `player_xp_for_level`.
        need = {}
        xc = columns(os.path.join(base, 'player_xp_for_level.sql'))
        for line in rows(os.path.join(base, 'player_xp_for_level.sql')):
            # Not `f`: that is the open file two lines down, and shadowing it
            # here wrote a list where the JSON should have gone.
            g = split(line)
            need[int(g[xc['Level']])] = int(g[xc['Experience']])
        ladder = [need.get(lv, 0) for lv in range(1, 21)]
        json.dump({'kinds': kinds, 'roles': roles, 'topics': topic_list,
                   'walk': walk,
                   # What the people of this slice are holding, as words the
                   # atlas has a sheet for.
                   'arms': arms,
                   # Every patrol the server lays down in this slice, whole.
                   # It is the only authority on "can a body be here" that
                   # does not need a 2.2 GB navigation mesh built first — see
                   # issue 93 — and `viewcheck` walks all of it.
                   'patrols': patrols(base),
                   # `[walk mult, run mult, notice yards, xp mult, respawn
                   # seconds, wander yards, movement type, swims]`, per row.
                   'moves': moves,
                   'fights': fights, 'player': player, 'ladder': ladder,
                   'goods': goods, 'hauls': hauls, 'npcs': out_rows}, f)

    by_kind = Counter(kinds[r[2]] for r in out_rows)
    by_role = Counter(roles[r[5]] for r in out_rows)
    talkers = sum(1 for r in out_rows if r[6] >= 0)
    quarry = sum(1 for r in out_rows
                 if r[7] >= 0 and fights[r[7]][5] == QUARRY)
    enemies = sum(1 for r in out_rows
                  if r[7] >= 0 and fights[r[7]][5] == ENEMY)
    print(f'{len(out_rows):,} spawns, {len(kinds)} kinds  '
          f'({os.path.getsize(path) / 1024:.0f} KiB)')
    what = Counter(k for t in topic_list for k in t)
    print(f'  talk: {talkers} spawns over {len(topic_list)} topics  '
          + ', '.join(f'{k} {v}' for k, v in what.most_common()))
    print(f'  fights: {len(fights)} distinct; {enemies:,} start one, '
          f'{quarry:,} only finish one')
    # What the references could not reach, said out loud.  The wiki asked for
    # this by name — "a report of what is left over", not a silent cut — and
    # it is the only thing standing between "this creature drops little" and
    # "this creature's drops were thrown away".
    if lost:
        print('  loot references not followed: '
              + ', '.join(f'{k} {v}' for k, v in lost.most_common()))
    # And the check the wiki asked for: a creature the database gives a loot
    # table to has to drop something.  A table whose every row was a reference
    # used to come out empty, and an empty pocket reads as a stingy creature
    # rather than as a column nobody read.
    barren = Counter()
    for r in out_rows:
        if info[r[9]][9] and not hauls[r[8]][2]:
            barren[kinds[r[2]]] += 1
    if barren:
        print('  ! carry a loot table and drop nothing: '
              + ', '.join(f'{k} {v}' for k, v in barren.most_common()))
        sys.exit(1)
    carry = sum(1 for r in out_rows if hauls[r[8]][2])
    print(f'  loot: {len(hauls)} distinct, {carry:,} spawns carry something')
    sold = [i[4] for h in hauls for i in h[2] if i[4]]
    print(f'  worth: {len(goods)} words, {len(sold)} priced drops, '
          f'median {sorted(sold)[len(sold) // 2] if sold else 0}동')
    print('  dropped: ' + ', '.join(f'{k} {v}' for k, v in dropped.most_common()))
    print('  kinds: ' + ', '.join(f'{k} {v}' for k, v in by_kind.most_common()))
    print('  roles: ' + ', '.join(f'{k} {v}' for k, v in by_role.most_common()))
    skinnable = sum(1 for r in out_rows if r[18] >= 0)
    purse_of_hide = sum(
        sum(c * (row[1] / 100.0) * (row[2] + row[3]) / 2 * row[4]
            for row in hauls[r[18]][2]) * 1
        for r in out_rows if r[18] >= 0 for c in (1,))
    print(f'  skinning: {skinnable:,} carcasses, '
          f'{purse_of_hide:,.0f}동 if every one were skinned once')
    armed = Counter(arms[r[16]] for r in out_rows if r[16] >= 0)
    both = sum(1 for r in out_rows if r[17])
    print(f'  in hand: {sum(armed.values()):,} of {len(out_rows):,} carry '
          f'something drawn — '
          + ', '.join(f'{k} {v}' for k, v in armed.most_common())
          + f'; {both} swing twice'
          + (('; carried and not drawn: '
              + ', '.join(f'{k} {v}' for k, v in not_held.most_common()))
             if not_held else ''))
    # What has no picture, and whether anybody said so.  The list used to be
    # one number — `unclassified 216` — which is a count with no decision
    # behind it, and the whole point of the gate is that leaving something out
    # has to be a sentence somebody wrote.
    if left_out:
        print(f'  {sum(left_out.values())} left out for want of a picture, '
              f'declared:')
        for reason, n in left_out.most_common():
            print(f'      {n:5d}  {reason}')
    if undeclared:
        print(f'  {sum(undeclared.values())} left out that nobody has looked '
              f'at:')
        for (ct, fam), n in undeclared.most_common(14):
            print(f'      {n:5d}  type {ct} family {fam}')
        # The same gate `objects.py` has had since it was written and this
        # script never did.  Skipping is fine; skipping something nobody has
        # looked at is not.
        sys.exit(1)
    check(out_rows, kinds, climb)


def check(out_rows, kinds, walk=None):
    """Two promises a player would notice being broken.

    Everyone is inside the slice — a spawn outside it is a creature standing in
    a part of the world that was never built, and the renderer would happily
    draw it on the void.  And the facings are spread over all four directions:
    if the orientation column were being read as degrees, or off by a column,
    every NPC in the world would face the same way and nothing else would say so.
    """
    out_x = [r[0] for r in out_rows]
    out_y = [r[1] for r in out_rows]
    if (min(out_x) < BOUNDS[0] or max(out_x) > BOUNDS[1]
            or min(out_y) < BOUNDS[2] or max(out_y) > BOUNDS[3]):
        sys.exit('a spawn is outside the forest')
    far = max(max(out_x) - min(out_x), max(out_y) - min(out_y))
    facings = Counter(r[3] for r in out_rows)
    # The climbing limit, which is the one number in this file that another
    # file depends on.  It used to be read here off a name that only existed
    # inside `main`, so this whole script exited with a `NameError` on its last
    # line — every run, for as long as it has had a check.  Nothing noticed
    # because nothing ran it: see issue 105.
    if walk:
        print(f'walk: steepest of {walk[1]:,} patrol legs over {walk[2]} routes '
              f'is {walk[0]:.2f} ({math.degrees(math.atan(walk[0])):.0f} deg) — '
              f'that is the climbing limit')
    print(f'check: spawns span {far:.0f} yd, '
          f'facings ' + '/'.join(str(facings[d]) for d in range(4)))
    if len(facings) < 4 or min(facings.values()) < len(out_rows) / 40:
        sys.exit('the facings are not spread over four directions — orientation misread')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/src/azerothcore-wotlk'),
         sys.argv[2] if len(sys.argv) > 2 else 'public/world')
