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

# Elwynn Forest, the same four numbers `synth_terrain.py` uses and for the same
# reason — see `pipeline/measure_zone.py`, which took them off the client's own
# area map.  A creature is in the slice if it is in the forest.
BOUNDS = (-9966.7, -8000.0, -1700.0, 1066.7)    # x lo, x hi, y lo, y hi
MAP = 0

# `creature` column order, from the dump's own CREATE TABLE.
C_GUID, C_ID, C_MAP, C_X, C_O = 0, 1, 4, 10, 13

# UNIT_NPC_FLAG bits, in the order we want them tested: the first that matches
# names the role, so the specific ones come before the ones almost everybody
# has.  Nearly every townsperson is a GOSSIP, so GOSSIP is last.
NPCFLAG = [
    ('trainer', 0x10 | 0x20 | 0x40),
    ('vendor', 0x80 | 0x100 | 0x200 | 0x400 | 0x1000000),
    ('innkeeper', 0x10000),
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
    ('horse', ('horse', 'stallion', 'mare', 'palomino', 'steed', 'pony')),
    ('kobold', ('kobold',)),
    ('murloc', ('murloc', 'makrura')),
    ('skeleton', ('skeleton', 'skeletal')),
    ('ghost', ('ghost', 'spectral', 'apparition', 'spirit')),
    ('bandit', ('defias', 'bandit', 'thug', 'cutpurse', 'rogue', 'brigand',
                'thief', 'lightfingers')),
    ('guard', ('guard', 'sentry', 'sentinel', 'watchman', 'marshal')),
]

# Anything that is a person and is not one of the above dresses as a townsman.
# Stated rather than defaulted: it is a decision about what the slice looks
# like, and it should be visible in the count the script prints.
PERSON_TYPES = {7, 6, 3, 10, 12}

# Type 9 is mechanical, and in this slice that is nine training dummies in the
# Stormwind practice yard.  They are equipment somebody set up, not somebody
# living here, and there is no sprite that would make one read as a creature.
SKIP_TYPES = {9}


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


def classify(name, ctype):
    if ctype in SKIP_TYPES:
        return None
    low = name.lower()
    for kind, words in KINDS:
        if any(w in low for w in words):
            return kind
    return 'townsfolk' if ctype in PERSON_TYPES else None


def role(flags, ctype, rank):
    for name, bits in NPCFLAG:
        if flags & bits:
            return name
    if rank:                       # elite, rare, boss — worth a second look
        return 'elite'
    return 'prey' if ctype in (1, 8) else 'idle'


# The player's own faction template.  Human is faction 1, whose template says
# FactionGroup 3 — the player bit and the Alliance bit — and everything in the
# world decides whether to swing at you by testing its own EnemyGroup against
# it.  Hard-coded because the player's race is, and because a constant that is
# a lookup of a constant is a lookup nobody can read.
PLAYER_FACTION = 1
PLAYER_GROUP = 3


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
            float(f[cls['attackpower']]), float(f[cls['damage_base']]))

    fac = {}
    fc = columns(os.path.join(base, 'factiontemplate_dbc.sql'))
    for line in rows(os.path.join(base, 'factiontemplate_dbc.sql')):
        f = split(line)
        fac[int(f[fc['ID']])] = (
            int(f[fc['Faction']]), int(f[fc['FactionGroup']]),
            int(f[fc['FriendGroup']]), int(f[fc['EnemyGroup']]),
            [int(f[fc[f'Enemies_{i}']]) for i in range(1, 5)],
            [int(f[fc[f'Friend_{i}']]) for i in range(1, 5)])
    return st, fac


def hostile(fac, template):
    """Does this one swing at a human, by the rule the core uses?

    Its listed enemies first, then its listed friends, and only then the group
    bits — which is the order that matters, because a template can name a
    faction it fights inside a group it otherwise leaves alone.
    """
    got = fac.get(template)
    if not got:
        return False
    _f, _group, _friend, enemy, enemies, friends = got
    if PLAYER_FACTION in enemies:
        return True
    if PLAYER_FACTION in friends:
        return False
    return bool(enemy & PLAYER_GROUP)


def fight_of(st, fac, level, cls, template, mods):
    """(health, min damage, max damage, swing ms, armour, hostile)."""
    hp_mod, dmg_mod, armour_mod, swing = mods
    base = st.get((level, cls)) or st.get((level, 1))
    if not base:
        return None
    hp, armour, ap, dmg = base
    t = max(swing, 1000) / 1000.0
    lo = (ap / 14.0 * t + dmg) * dmg_mod
    return (max(1, round(hp * hp_mod)), max(1, round(lo)),
            max(1, round((ap / 14.0 * t + dmg * 1.5) * dmg_mod)),
            int(swing), round(armour * armour_mod),
            1 if hostile(fac, template) else 0)


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
    hp, armour, ap, _dmg = base
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
        k = classify(f[col['name']].strip("'").replace("\\'", "'"), int(f[col['type']]))
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
        # A quest whose objective is none of kill, fetch or buy is an escort,
        # an explore or a talk-to, and every word of what it actually wants is
        # in text we do not use.  Offering it would be offering an empty box.
        gives = [quests[q] for q in starts.get(e, ()) if q in quests
                 and (quests[q]['kill'] or quests[q]['take'] or quests[q]['find'])]
        if gives:
            t['gives'] = sorted(gives, key=lambda q: q['lv'])[:4]
        if ends.get(e):
            t['takes'] = len(ends[e])
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
    pooled = {int(num.findall(line)[0])
              for line in rows(os.path.join(base, 'pool_creature.sql'))}

    spawns, dropped = [], Counter()
    for line in rows(os.path.join(base, 'creature.sql')):
        f = line[1:].split(',', C_O + 1)
        try:
            if int(f[C_MAP]) != MAP:
                continue
            guid = int(f[C_GUID])
            x, y = float(f[C_X]), float(f[C_X + 1])
            o = float(f[C_O])
        except (ValueError, IndexError):
            continue
        if not (BOUNDS[0] <= x <= BOUNDS[1] and BOUNDS[2] <= y <= BOUNDS[3]):
            continue
        if guid in seasonal:
            dropped['seasonal'] += 1
            continue
        if guid in pooled:
            dropped['pooled'] += 1
            continue
        spawns.append((int(f[C_ID]), x, y, o))

    tpl = os.path.join(base, 'creature_template.sql')
    col = columns(tpl)
    wanted = {e for e, _, _, _ in spawns}
    info = {}
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
        info[entry] = (classify(name, ctype), ctype,
                       int(f[col['minlevel']]), int(f[col['maxlevel']]),
                       int(f[col['npcflag']]), int(f[col['rank']]),
                       int(f[col['unit_class']]), int(f[col['faction']]),
                       (float(f[col['HealthModifier']]),
                        float(f[col['DamageModifier']]),
                        float(f[col['ArmorModifier']]),
                        int(f[col['BaseAttackTime']])))

    topics = talking(base, {e for e, _, _, _ in spawns if e in info and info[e][0]})
    topic_list, topic_at = [], {}
    for e, t in topics.items():
        topic_at[e] = len(topic_list)
        topic_list.append(t)

    stats, factions = fight_tables(base)
    kinds, roles, out_rows = [], [], []
    fights, fight_at = [], {}
    unknown = Counter()
    for entry, x, y, o in spawns:
        if entry not in info:
            dropped['no template'] += 1
            continue
        kind, ctype, lo, hi, flags, rank, cls, faction, mods = info[entry]
        if kind is None:
            unknown[ctype] += 1
            dropped['unclassified'] += 1
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
        out_rows.append([round(x, 2), round(y, 2), kinds.index(kind), facing,
                         level, roles.index(r), topic_at.get(entry, -1), fi])

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
        player = [with_weapon(stats, lv, (1, 3, 1900)) for lv in range(1, 11)]
        json.dump({'kinds': kinds, 'roles': roles, 'topics': topic_list,
                   'fights': fights, 'player': player, 'npcs': out_rows}, f)

    by_kind = Counter(kinds[r[2]] for r in out_rows)
    by_role = Counter(roles[r[5]] for r in out_rows)
    talkers = sum(1 for r in out_rows if r[6] >= 0)
    foes = sum(1 for r in out_rows if r[7] >= 0 and fights[r[7]][5])
    print(f'{len(out_rows):,} spawns, {len(kinds)} kinds  '
          f'({os.path.getsize(path) / 1024:.0f} KiB)')
    what = Counter(k for t in topic_list for k in t)
    print(f'  talk: {talkers} spawns over {len(topic_list)} topics  '
          + ', '.join(f'{k} {v}' for k, v in what.most_common()))
    print(f'  fights: {len(fights)} distinct, {foes:,} of them hostile')
    print('  dropped: ' + ', '.join(f'{k} {v}' for k, v in dropped.most_common()))
    print('  kinds: ' + ', '.join(f'{k} {v}' for k, v in by_kind.most_common()))
    print('  roles: ' + ', '.join(f'{k} {v}' for k, v in by_role.most_common()))
    if unknown:
        print('  ! unclassified types: ' + ', '.join(f'{k} x{v}' for k, v in unknown.items()))
    check(out_rows, kinds)


def check(out_rows, kinds):
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
    print(f'check: spawns span {far:.0f} yd, '
          f'facings ' + '/'.join(str(facings[d]) for d in range(4)))
    if len(facings) < 4 or min(facings.values()) < len(out_rows) / 40:
        sys.exit('the facings are not spread over four directions — orientation misread')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/src/azerothcore-wotlk'),
         sys.argv[2] if len(sys.argv) > 2 else 'public/world')
