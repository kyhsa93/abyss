#!/usr/bin/env python3
"""What each class can do, out of the client's own tables.

  python3 pipeline/spells.py [client] [azerothcore] [out]

Two sources and neither of them invented.  **AzerothCore** says which abilities
a class has and at what level — `trainer_spell`, joined to the class through
`trainer.Requirement` — and the **client's `Spell.dbc`** says what each of them
costs and does.  Between them a level 5 warrior knows four things, and every
number attached to them is the game's.

**One book a class, and the classes are `slice.json`'s.**  This was one book
and the book was the warrior's, which is the shape `slice.py` exists to stop:
the file said `WARRIOR_TRAINER = 1` and a second class would have been a
second constant.  It is a join now — `pipeline/classes.py` is the four columns
that differ between a warrior and a priest — and the id that was written down
turns out to have been half an answer, because the warrior has trainers 1
*and* 2.

Three things a warrior does not have arrive with the other five, and all three
are columns that were being read and thrown away:

  * **what a thing costs is not rage.**  `powerType` was parsed and never
    used, so every cost in this file was divided by ten whatever it was —
    which is right for rage and wrong for a rogue's energy by a factor of ten.
  * **and it is not always a number.**  In this expansion a caster's costs are
    a *percentage of base mana*, in a column two hundred fields along, and a
    spell whose whole cost lives there reads as free.
  * **casting takes time.**  `SpellCastTimes.dbc` was resolved for the foes
    and shipped for the player, where nothing read it: a warrior's abilities
    are all instant, so a field that was always nought looked like a field
    that did not matter.

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
import re
import struct
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bake_terrain import Client  # noqa: E402
from slice import LEVELS, CLASSES, CLASS_ID, RACES, RACE_ID  # noqa: E402
from classes import POWER_WORD, SCALE  # noqa: E402

# The Korean client keeps `DBFilesClient` in its own patch archive, ahead of
# everything the terrain reader looks in.
CHAIN = ['koKR/patch-koKR-3.MPQ', 'koKR/patch-koKR-2.MPQ', 'koKR/patch-koKR.MPQ',
         'koKR/locale-koKR.MPQ', 'patch-3.MPQ', 'patch-2.MPQ', 'patch.MPQ',
         'lichking.MPQ', 'expansion.MPQ', 'common-2.MPQ', 'common.MPQ']

# 3.3.5a `Spell.dbc`, by index into its 234 fields.
F_POWER, F_COST = 41, 42
# And the cost that is not a number.  Wrath moved a caster's costs to a share
# of the base mana of whoever is casting — so Smite's cost is nine, of a
# priest's own bar, and `manaCost` beside it is nought.  Read only `manaCost`
# and every spell a priest, mage, warlock or paladin owns is free.
#
# The field was found the way the global cooldown's was: the one column that
# is a small percentage for Smite and for Fireball and nought for a heroic
# strike, which lands it immediately after the four locale string blocks and
# immediately before `StartRecoveryCategory` — where a 3.3.5 layout says
# `ManaCostPercentage` is.
#
# It is **not** resolved to a number here, because it cannot be: a cost that
# is a share of the caster's own bar is a fact about the cast and not about
# the spell.  `src/sim/stats.ts` has the base mana and does the arithmetic.
F_COST_PCT = 204
# What a combo point is worth, which is a float in an int column — the same
# packing `SpellRange.dbc` and `SpellRadius.dbc` use.  Eviscerate is one
# damage and five more a point, so read as an integer it is a five-point
# finisher that hits for one.
F_COMBO = 119
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
#: Where a `does` row keeps the spell it fires, for the checks below.
TRIGGERS = 5
#: `SPELL_AURA_MOD_BASE_RESISTANCE_PCT` and
#: `SPELL_AURA_MOD_DAMAGE_PERCENT_TAKEN`, both of them read only to be checked.
A_BASE_RESISTANCE_PCT, A_DAMAGE_PCT_TAKEN = 101, 87
#: `SPELL_AURA_MOD_SHAPESHIFT`, which is how a stance says it is one.
A_SHAPESHIFT = 36

# Which passive a stance actually is.
#
# The stance spell itself says almost nothing — one aura of `MOD_SHAPESHIFT`
# whose `EffectMiscValue` is the form number, 17 and 18 — and the numbers live
# in a hidden passive the core names per form
# (`AuraEffect::HandleAuraModShapeshift`, SpellAuraEffects.cpp:1382-1387).
# Read through, Battle Stance is -20% threat and Defensive Stance is -10%
# damage taken, -5% damage done and +45% threat, all of it the client's.
#
# Keyed on the form rather than on the stance, because the form is the number
# the client states and the core switches on.
FORM_PASSIVE = {17: 21156, 18: 7376}
F_MISC = 110

#: `SPELL_EFFECT_LEARN_SPELL`, which is a trainer row that is not an ability.
#:
#: A paladin buys 10321 at level 4 and what he gets is two other spells — the
#: judgement and the seal — because the thing on the shelf teaches rather than
#: does.  Followed, because "what does this class learn by ten" is the
#: question, and a book that lists the receipt instead of the goods answers a
#: different one.
E_LEARN = 36


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


# What the class is given rather than sold, and where it comes from.
#
# Five abilities were missing from this book and the wiki had already worked
# out why: they are in no trainer's list anywhere in the dump — checked, all
# five — because a warrior is *given* them.  `SkillLineAbility.dbc` files them
# under the three skill lines `playercreateinfo_skills` hands a human warrior
# at creation: 26 Arms, 256 Fury, 257 Protection.
#
# One of the five is genuinely derivable and the other four are not, and the
# difference is a column.  `Player::LearnSkillRewardedSpells`
# (Player.cpp:12256) learns a skill's abilities only where `AcquireMethod` is
# 1 or 2, and of the five **only Battle Stance has one** — so that one falls
# out of the rules and the rest have to be named.  Which is what the wiki
# concluded on its own: *five lines, written by hand; this is a footnote and
# not a hole.*
#
# Except it is four.  Berserker Stance is `spellLevel` **30** in this client
# and this game stops at ten, so it is out of the slice the same way a
# Westfall quest is, and no amount of hand-writing changes that.
LEARNED_ON_SKILL_VALUE, LEARNED_ON_SKILL_LEARN = 1, 2

#: `Spell.dbc` field 4, and the one bit of it read here: a passive is not an
#: ability, and two of the candidates are the stances' own hidden passives.
F_ATTRIBUTES, ATTR_PASSIVE = 4, 0x40

#: Given by nobody and derivable from nothing — see above.  Keyed on the class,
#: and each entry is `SkillLineAbility.dbc`'s own row for it, so the claim is
#: checkable.
#:
#: **Only the warrior has any**, and that is a measurement rather than a hope:
#: `main` prints, per class, every ability filed under the class's own skill
#: lines within this slice's levels that neither a trainer sells nor the skill
#: rules learn.  For the other five the whole of that list is talent proc
#: spells — a stun a talent adds to a blast wave, a heal a talent adds to a
#: renew — and a talent this game has none of is not an ability its owner is
#: missing.
BY_HAND = {
    1: {
        71: 'Defensive Stance — SkillLineAbility 6101, skill 257, spellLevel 10',
        355: 'Taunt — SkillLineAbility 6114, skill 257, spellLevel 10',
        7386: 'Sunder Armor — SkillLineAbility 6109, skill 257, spellLevel 10',
    },
}

#: And what is named and still left out, with the number that decides it.
TOO_HIGH = {2458: 'Berserker Stance — spellLevel 30, and this game ends at 10'}


def given(client, spells, upto, cls, skills, sla=None):
    """Everything a class is handed, as `({id: level}, [left out])`.

    Two halves for two reasons, both of them above.  The derived half asks
    `SkillLineAbility.dbc` the question the core asks it and drops anything
    passive; the named half is `BY_HAND`, ids the core would not learn either,
    with the row that says where each came from.

    The third return is the one that makes the second honest: **every ability
    filed under this class's own skill lines, in range, that neither half
    picked up**.  That list is how the warrior's three were found in the first
    place, and leaving it uncounted is how a fourth would be missed.
    """
    out, spare = {}, {}
    for r in sla:
        _id, skill, sid, _race, mask = r[0], r[1], r[2], r[3], r[4]
        if skill not in skills or not mask & (1 << (cls - 1)):
            continue
        sp = spells.get(sid)
        if sp is None or sp[F_ATTRIBUTES] & ATTR_PASSIVE:
            continue
        lv = sp[F_LEVEL]
        if not 1 <= lv <= upto:
            continue
        if r[9] in (LEARNED_ON_SKILL_VALUE, LEARNED_ON_SKILL_LEARN):
            out[sid] = lv
        else:
            spare[sid] = lv
    for sid in BY_HAND.get(cls, ()):
        sp = spells.get(sid)
        if sp is None:
            sys.exit(f'{sid} is not in this client')
        if not 1 <= sp[F_LEVEL] <= upto:
            sys.exit(f'{sid} is spellLevel {sp[F_LEVEL]}, outside 1..{upto} — '
                     'move it to TOO_HIGH rather than shipping it')
        out[sid] = sp[F_LEVEL]
    return out, spare


def starts_with(base, race, cls):
    """Which skill lines this race and class are created holding.

    Asked rather than asserted.  The warrior's three were written down here as
    a tuple and checked against the table; six classes is thirty-odd lines of
    them, and a list that has to be kept in step with a table it is read from
    is the second copy this repository keeps deleting.
    """
    from classes import skills_of
    mine = skills_of(base, race).get(cls, set())
    if not mine:
        sys.exit(f'a human of class {cls} starts with no skills at all — '
                 'playercreateinfo_skills moved')
    return mine


def known(base, upto, cls, trainers, bar, spells, grants):
    """Every ability of this class a human has by `upto`, as {id: level}.

    Two tables.  `playercreateinfo_action` is the bar a new character is
    created holding — which is what the class starts with, and the only
    statement of it in this dump, since `playercreateinfo_spell_custom` has no
    rows.  `trainer_spell`, for **every** trainer of the class, is everything
    the trainers will add.

    The prerequisites named in a trainer row are *not* starting abilities.
    Reading them that way put Mortal Strike and Devastate on a level 1
    warrior's list — both talents, both named as a requirement by something
    else, neither taught by anybody at level 1.

    A row that teaches rather than does is followed: `E_LEARN` names the
    spells it hands over, and those are what the class ends up with.  What it
    was is not thrown away — `grants` carries it, because `items.py` puts the
    row on a trainer's shelf and the shelf has to offer the goods rather than
    the receipt.
    """
    from spawn_npcs import columns, rows, split
    out, free = {}, set()
    for sid in bar:
        out[sid] = 1
        free.add(sid)
    path = os.path.join(base, 'trainer_spell.sql')
    col = columns(path)
    for line in rows(path):
        f = split(line)
        if int(f[col['TrainerId']]) not in trainers:
            continue
        lv = int(f[col['ReqLevel']]) or 1
        if lv > upto:
            continue
        sid = int(f[col['SpellId']])
        r = spells.get(sid)
        taught = [r[F_TRIGGER + i] for i in range(3)
                  if r and r[F_EFFECT + i] == E_LEARN and r[F_TRIGGER + i]] \
            if r else []
        if taught:
            grants[sid] = taught
        for got in (taught or [sid]):
            out.setdefault(got, lv)
    return out, free


# The effect numbers that name another spell, so the closure knows to follow
# them.  `TRIGGER_SPELL` and its two friends put a spell id in the effect's
# own trigger field; an aura of `PERIODIC_TRIGGER_SPELL` does the same.
#
# **This was 110 and 110 is `EffectMiscValue`**, which is the field that says
# which shapeshift a stance is rather than which spell an effect fires.  Every
# lookup through it therefore came back nought, which is what a spell that
# triggers nothing looks like — so the closure has been walking a graph with
# its edges cut off since it was written, and three abilities have been
# missing the half of themselves that lives in the triggered spell:
#
#   * Sunder Armor 7386 fires 58567, which is the armour off the target —
#     -4% a go, five of them, thirty seconds.  Without it 7386 is a
#     fifteen-rage button that does nothing at all.
#   * Bloodrage 2687 fires 29131, ten rage a second for ten seconds.
#   * Charge 100 fires 7922, which is the stun that makes it an opener.
#
# Found by asking which field of Charge holds 7922, the same way the global
# cooldown's column was found, and `check` below holds it to that.
F_TRIGGER = 116

# And how many of the same thing may sit on a target at once.  Found the same
# way: the field that is five for 58567, which is the game's own five-stack
# Sunder Armor.  A debuff that does not say how deep it goes is a debuff whose
# depth somebody here would have to choose.
F_STACK = 49
# How fast it flies and what school it is.  `Speed` is a float packed into an
# int column, yards a second, and nought for everything that lands the moment
# it goes off — `Spell::prepare` puts a spell with a speed on a delay of
# distance over speed (Spell.cpp, `m_delayMoment`), which is the whole
# difference between a frostbolt and a smite.  `SchoolMask` is one bit a
# school: 1 physical, 2 holy, 4 fire, 8 nature, 16 frost, 32 shadow, 64
# arcane.
F_SPEED, F_SCHOOL = 47, 225
E_TRIGGER_SPELL, E_TRIGGER_MISSILE, E_PERSISTENT_AREA = 64, 32, 27
A_PERIODIC_TRIGGER = 23


#: The core, for the corrections it makes to `Spell.dbc` at load.  Same bargain
#: `npm run corecheck` makes: `$ABYSS_CORE` or `~/src/acore-src`, and a machine
#: without a checkout says so rather than pretending there was nothing to apply.
CORE = os.environ.get('ABYSS_CORE') or os.path.expanduser('~/src/acore-src')
SPELLS_SRC = os.path.join('src', 'server', 'game', 'Spells')

#: `SpellInfo`'s own member names, and which field of a `Spell.dbc` row this
#: script reads each one from — per effect for the first table, once a spell
#: for the second.  A correction to a member that is not in either is a
#: correction to something this game does not read, and is reported as such.
FIX_EFFECT = {'BasePoints': F_BASE, 'DieSides': F_DIE, 'Effect': F_EFFECT,
              'ApplyAuraName': F_AURA, 'Amplitude': F_PERIOD,
              'TriggerSpell': F_TRIGGER, 'MiscValue': F_MISC,
              'RadiusEntry': F_RADIUS}
FIX_SPELL = {'DurationEntry': F_DURATION, 'RangeEntry': F_RANGE,
             'CastTimeEntry': F_CAST, 'CategoryEntry': F_CATEGORY,
             'ManaCost': F_COST, 'PowerType': F_POWER,
             'RecoveryTime': F_RECOVERY,
             'CategoryRecoveryTime': F_CATEGORY_RECOVERY,
             'StartRecoveryTime': F_GCD, 'StackAmount': F_STACK}


def enum_values(path, prefix):
    """`{NAME: number}` for every `PREFIX_NAME = N` in a C++ header."""
    if not os.path.exists(path):
        return {}
    with open(path, encoding='utf8', errors='replace') as f:
        return {m.group(1): int(m.group(2)) for m in
                re.finditer(r'\b(%s\w+)\s*=\s*(\d+)' % prefix, f.read())}


def effect_names(core):
    """`{number: SPELL_EFFECT_NAME}`, off the handler table's own comments.

    The enum lives in `SharedDefines.h`, which the sparse checkout does not
    have; `SpellEffects.cpp` lists every handler with `// 2 SPELL_EFFECT_...`
    beside it, which is the same fact in a file that is here.
    """
    path = os.path.join(core, SPELLS_SRC, 'SpellEffects.cpp')
    if not os.path.exists(path):
        return {}
    with open(path, encoding='utf8', errors='replace') as f:
        return {int(m.group(1)): m.group(2) for m in
                re.finditer(r'//\s*(\d+)\s+(SPELL_EFFECT_\w+)', f.read())}


def corrections(core=CORE):
    """Every `ApplySpellFix` in `SpellInfoCorrections.cpp`, statement by statement.

    Issues 75 and 76 handed this to each other and it was dropped in between:
    *"the data is right and it runs differently from AzerothCore"* is what the
    file is for, and the count of how much of it touches this slice was the
    next step both closing comments named and neither took.

    Returns `[(spell, line, member, effect or None, operator, value or None,
    guarded)]` in file order, or `None` without a checkout.  `value` is a plain
    number where the right-hand side is one — a literal, an entry passed to a
    store's `LookupEntry`, or an `SPELL_AURA_*` name — and `None` otherwise;
    `guarded` is a block with an `if` or a loop in it, whose statements this
    does not claim to understand.
    """
    path = os.path.join(core, SPELLS_SRC, 'SpellInfoCorrections.cpp')
    if not os.path.exists(path):
        return None
    with open(path, encoding='utf8', errors='replace') as f:
        text = f.read()
    auras = enum_values(os.path.join(core, SPELLS_SRC, 'Auras', 'SpellAuraDefines.h'),
                        'SPELL_AURA_')
    out = []
    head = re.compile(r'ApplySpellFix\(\s*\{(?P<ids>[^}]*)\}\s*,\s*'
                      r'\[\]\(SpellInfo\s*\*\s*spellInfo\)\s*\{')
    stmt = re.compile(r'spellInfo->(?P<member>\w+)'
                      r'(?:\[(?:EFFECT_)?(?P<eff>\d+)\])?(?:\.(?P<sub>\w+))?'
                      r'\s*(?P<op>[|&+\-*]?=)\s*(?P<value>[^;]+);')
    for m in head.finditer(text):
        ids = [int(x) for x in re.findall(r'\b\d+\b',
                                          re.sub(r'//[^\n]*', '', m.group('ids')))]
        depth, i = 1, m.end()
        while depth and i < len(text):
            depth += {'{': 1, '}': -1}.get(text[i], 0)
            i += 1
        body = text[m.end():i - 1]
        guarded = bool(re.search(r'\b(if|for|while|switch)\b',
                                 re.sub(r'//[^\n]*', '', body)))
        first = text.count('\n', 0, m.end()) + 1
        code_ = re.sub(r'//[^\n]*', '', body)
        # Every statement that writes through `spellInfo->`, and the ones the
        # pattern cannot read are kept as such rather than skipped: a
        # correction this does not understand is not a correction that is
        # not there.
        for seg in re.finditer(r'spellInfo->[^;]*;', code_):
            if not stmt.fullmatch(seg.group(0)):
                line = first + body.count('\n', 0, seg.start())
                for sid in ids:
                    out.append((sid, line, ' '.join(seg.group(0).split())[:48],
                                None, None, None, guarded))
        for st in stmt.finditer(code_):
            per_effect = st.group('member') == 'Effects' and st.group('sub')
            member = st.group('sub') if per_effect else st.group('member')
            eff = int(st.group('eff')) if per_effect else None
            raw = st.group('value').strip()
            value = None
            if re.fullmatch(r'-?\d+', raw):
                value = int(raw)
            elif re.fullmatch(r'\w+Store\.LookupEntry\((\d+)\)', raw):
                value = int(re.search(r'\((\d+)\)', raw).group(1))
            elif raw in auras:
                value = auras[raw]
            line = first + body.count('\n', 0, st.start())
            for sid in ids:
                out.append((sid, line, member, eff, st.group('op'), value, guarded))
    return out


def apply_corrections(spells, fixes):
    """Put the core's corrections into the rows this script reads.

    Only a plain assignment of a plain number to a field this script reads is
    applied; everything else is reported with the reason it was not.  Applied
    to every spell the file names rather than to the slice's alone, because it
    is what the server does at load and the slice is not known until the
    closure has been walked — the report is made over the slice afterwards.

    Returns `[(spell, line, what, how)]`.
    """
    done = []
    for sid, line, member, eff, op, value, guarded in fixes:
        r = spells.get(sid)
        if r is None:
            continue
        what = member if eff is None else 'Effects[%d].%s' % (eff, member)
        if op is None:
            done.append((sid, line, what, 'a statement this does not parse'))
            continue
        col = FIX_EFFECT.get(member) if eff is not None else FIX_SPELL.get(member)
        if col is None:
            done.append((sid, line, what, 'a field this game does not read'))
            continue
        if op != '=' or value is None or guarded:
            done.append((sid, line, what, 'a field it reads, but not a plain number'))
            continue
        row = list(r)
        row[col + (eff or 0)] = value
        spells[sid] = tuple(row)
        done.append((sid, line, what, 'applied'))
    return done


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

    # And the two index columns that were resolved without a fact behind them.
    # Radius has 6343 at eight yards and the global cooldown has 6673 at 1,500;
    # the cast time and the category were found the same way and never held to
    # anything, so a layout that slipped by one would have shipped quietly.
    #
    #   * `CastingTimeIndex` — Shadow Bolt, rank one, takes 1.7 seconds.  An
    #     odd number on purpose: 1,500 is half the casts in the game, and a
    #     neighbouring field that happened to index a 1.5 second row would pass.
    #   * `Category` — the two warrior stances share one, because changing
    #     stance puts the other on the same one-second wait; and Thunder Clap,
    #     which is not a stance, does not have it.  A wrong field gives two
    #     different numbers, or the same nought.
    bolt = spells.get(686)
    if not bolt or casts.get(bolt[F_CAST]) != 1700:
        sys.exit('Spell.dbc cast time index is wrong: 686 casts in %s'
                 % (bolt and casts.get(bolt[F_CAST])))
    stances = [spells.get(s_) and spells[s_][F_CATEGORY] for s_ in (2457, 71, 6343)]
    if not stances[0] or stances[0] != stances[1] or stances[2] == stances[0]:
        sys.exit('Spell.dbc category field is wrong: 2457, 71 and 6343 are in %s'
                 % stances)

    # The core's corrections, before anything is built out of the rows they
    # correct — see `corrections`.  Reported in `finish`, over the slice.
    fixes = corrections()
    fixed = apply_corrections(spells, fixes) if fixes is not None else None

    # How far up this game goes, out of `slice.json` rather than a default
    # argument nobody outside this file could see.
    upto = upto or LEVELS[1]
    world = os.path.join(acore, 'data/sql/base/db_world')

    # Who this game's classes are, and the four columns that differ between
    # them.  All four are joins rather than constants — see `classes.py`.
    from classes import trainers_of, bars_of, powers_of
    sla = dbc(c, 'SkillLineAbility')
    sells = trainers_of(world)
    bars = bars_of(world, RACE_ID[RACES[0]])
    power_of = powers_of(c)
    books, unlearned, grants = {}, {}, {}
    for word in CLASSES:
        cls = CLASS_ID[word]
        want, free = known(world, upto, cls, set(sells.get(cls, ())),
                           bars.get(cls, set()), spells, grants)
        # And what nobody sells, which is where five of the warrior's were
        # hiding.  Given abilities are `free` in exactly the sense the
        # starting bar is: there is no trainer row and no money.
        handed, spare = given(c, spells, upto, cls,
                              starts_with(world, RACE_ID[RACES[0]], cls), sla)
        for sid, lv in handed.items():
            want.setdefault(sid, lv)
            free.add(sid)
        unlearned[word] = sorted(set(spare) - set(want))
        # **Keyed on the class id and not on the word.**  `slice.json`'s words
        # are this repository's; the id is the game's, and it is what a
        # character carries, what a trainer's `Requirement` is and what the
        # creation screen's buttons are.  A word key would need a word-to-id
        # table in `src/`, which is the table `slice.py` exists to be the only
        # copy of.
        books[str(cls)] = build(want, free, spells, ranges, radii, casts,
                                durations, power_of.get(cls, 0))

    # The book the checks below read, and the one a warrior presses.  Every
    # assertion in this file is a fact about a warrior's abilities, because
    # they are what the field offsets were found against.
    out_rows = books.get(str(CLASS_ID['Warrior']), [])
    return finish(books, out_rows, unlearned, grants, spells, ranges, radii,
                  durations, acore, out, upto, c, fixed)


def speed_of(r):
    """`Spell.dbc`'s speed, which is a float stored in an int column."""
    return struct.unpack('<f', struct.pack('<i', r[F_SPEED]))[0]


def build(want, free, spells, ranges, radii, casts, durations, power):
    """One class's book, as rows.

    `power` is the class's own — `ChrClasses.dbc`'s `DisplayPower` — and a
    spell that says something else says it for itself: Bloodrage and Life Tap
    are paid for in health by a warrior and a warlock alike.
    """
    out_rows = []
    for sid, lv in sorted(want.items(), key=lambda kv: (kv[1], kv[0])):
        r = spells.get(sid)
        if r is None:
            continue
        lo, hi = ranges.get(r[F_RANGE], (0.0, 5.0))
        # What it is paid for with, and what a bar of that is stored at.  Rage
        # is kept at ten times what the bar shows and energy is not, which is
        # the whole reason this was wrong the moment a rogue existed.
        mine = r[F_POWER] if r[F_POWER] else power
        row = {
            'id': sid, 'level': lv,
            'power': mine,
            'cost': r[F_COST] // SCALE.get(POWER_WORD.get(mine, ''), 1),
            # And the half of a cost that is a share of the caster's own bar
            # rather than a number — see `F_COST_PCT`.
            **({'pct': r[F_COST_PCT]} if r[F_COST_PCT] else {}),
            'cool': max(r[F_RECOVERY], r[F_CATEGORY_RECOVERY]),
            'reach': [lo, hi],
            # Whether he is created holding it.  Everything else is bought
            # from a trainer — `playercreateinfo_action` is the bar a new
            # character of the class is made with.
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
                      r[F_AURA + i], r[F_PERIOD + i], r[F_TRIGGER + i],
                      r[F_MISC + i]]
                     for i in range(3) if r[F_EFFECT + i]],
            # How deep the same thing may sit on one target.  Sunder Armor's
            # five, which is the client's and not a choice made here.
            'stack': r[F_STACK],
            # How fast it flies, and which school — the second is what a bolt
            # and the flash where it lands are coloured by.
            **({'speed': round(speed_of(r), 2)} if speed_of(r) else {}),
            'school': r[F_SCHOOL],
        }
        # What a combo point adds, per effect — a float packed into an int
        # column.  Only the rogue's finishers have one, and without it
        # Eviscerate is a five-point finisher that hits for one.
        combo = [round(f, 1) for f in struct.unpack(
            '<3f', struct.pack('<3i', *(r[F_COMBO + i] for i in range(3))))]
        if any(combo):
            row['combo'] = combo
        # What a stance is, once the form it names is followed to the passive
        # that carries its numbers.  Four fields deep and every one of them a
        # column: the stance's aura says the form, the core says which passive
        # that form is, and the passive says the percentages.
        form = next((r[F_MISC + i] for i in range(3)
                     if r[F_AURA + i] == A_SHAPESHIFT), 0)
        if form in FORM_PASSIVE:
            p = spells.get(FORM_PASSIVE[form])
            if p is None:
                sys.exit(f'form {form}\'s passive {FORM_PASSIVE[form]} is not '
                         'in this client')
            row['stance'] = form
            row['does'] += [[p[F_EFFECT + i], p[F_BASE + i] + 1, p[F_DIE + i],
                             p[F_AURA + i], p[F_PERIOD + i], p[F_TRIGGER + i],
                             p[F_MISC + i]]
                            for i in range(3) if p[F_EFFECT + i]]
        out_rows.append(row)
    return out_rows


def finish(books, out_rows, unlearned, grants, spells, ranges, radii,
           durations, acore, out, upto, c, fixed=None):
    """The parts that are the world's rather than one class's, and the checks.

    Split out because `main` had grown into one function that read six tables,
    built a book and asserted eight facts; with six books to build the middle
    of it became a loop and the two ends did not.
    """
    # The layout, checked against a fact rather than trusted.  Spell 78 is a
    # rage ability that costs fifteen; if the offsets are off by one this comes
    # back as something else and the whole table is quietly wrong.
    check = next((r for r in out_rows if r['id'] == 78), None)
    if not check or check['cost'] != 15 or check['power'] != 1:
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
    # And the field that says which spell an effect fires, which was
    # `EffectMiscValue` for the whole life of this script.  Sunder Armor is
    # nothing but a trigger — fifteen rage and one effect — so read from the
    # wrong column it is a button that costs and does not act, which is
    # exactly what a spell with no trigger looks like.  The thing it fires
    # takes 4% of the armour off and five of them may sit there at once, and
    # both numbers are the client's.
    sunder = next((r for r in out_rows if r['id'] == 7386), None)
    fired = sunder and next((e[TRIGGERS] for e in sunder['does'] if e[TRIGGERS]), 0)
    debuff = spells.get(fired or 0)
    if not debuff or debuff[F_STACK] != 5 \
            or A_BASE_RESISTANCE_PCT not in [debuff[F_AURA + i] for i in range(3)]:
        sys.exit('Spell.dbc trigger field is wrong: 7386 fires %s' % fired)
    # And the flight, the same way.  A frostbolt flies at 28 yards a second and
    # is frost; read one field out, the speed comes back nought and every bolt
    # in the game lands the moment it is thrown, which is exactly what this
    # game did before it read the column.
    frost = next((r for r in out_rows if r['id'] == 116), None)
    if frost and (frost.get('speed') != 28 or frost['school'] != 16):
        sys.exit('Spell.dbc speed or school field is wrong: 116 came back %s'
                 % frost)
    # And the stance, which is four columns deep: the aura says the form, the
    # core says which passive that form is, and the passive says the numbers.
    # Defensive Stance has to come back taking a tenth off what hits you.
    guard = next((r for r in out_rows if r['id'] == 71), None)
    taken = guard and next((e[1] for e in guard['does']
                            if e[3] == A_DAMAGE_PCT_TAKEN), None)
    if guard is None or guard.get('stance') != 18 or taken != -10:
        sys.exit('the stance passive did not come through: 71 is %s' % guard)

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
                **({'speed': round(speed_of(r), 2)} if speed_of(r) else {}),
                'school': r[F_SCHOOL],
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
        {r['id'] for b in books.values() for r in b}
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
    # Which triggers this reads, and it is now four.
    #
    # `SMART_EVENT_RANGE` joins the three because it needs no state: *the
    # thing you are fighting has come within so many yards*, which the scene
    # already knows to a fraction of a yard.  The three that were left out
    # after issue 196's census all need the interpreter to have a memory —
    # a linked row is the line above having fired, a timed action list is a
    # second script on a clock, a phase mask is a mode — and the census is
    # what says none of the three buys a single fight in this slice.
    E_UPDATE_IC, E_HEALTH_PCT, E_AGGRO, E_RANGE = 0, 2, 4, 9
    A_CAST = 11
    #: `SMART_ACTION_CALL_TIMED_ACTIONLIST`, which is the recursive one.
    A_TIMED_LIST = 80
    smart = os.path.join(acore, 'data/sql/base/db_world/smart_scripts.sql')
    cues, skipped_cues = {}, {}
    # The whole census, not just the casts.  Issue 196 asked the interpreter to
    # **count the lines it cannot read**, which is a different question from
    # counting the casts it skipped: most of `smart_scripts` is not a cast at
    # all, and "how much of this creature's script do we run" is only
    # answerable against the whole of it.
    seen_rows = 0
    by_action, by_event = {}, {}
    stateful = {'link': 0, 'timed list': 0, 'phase': 0}
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
            seen_rows += 1
            by_action[act] = by_action.get(act, 0) + 1
            by_event[event] = by_event.get(event, 0) + 1
            # The three the wiki left open, counted where they actually are.
            try:
                if int(f[col3['link']]):
                    stateful['link'] += 1
                if int(f[col3['event_phase_mask']]):
                    stateful['phase'] += 1
            except (ValueError, KeyError, IndexError):
                pass
            if act == A_TIMED_LIST:
                stateful['timed list'] += 1
            if act != A_CAST:
                continue
            if event not in (E_UPDATE_IC, E_HEALTH_PCT, E_AGGRO, E_RANGE):
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
    for row in (r for b in books.values() for r in b):
        if row['id'] in threat:
            row['threat'] = threat[row['id']]

    # And the spells the player's own abilities fire, which are half of three
    # of them.  Only one step out: Sunder Armor's debuff, Bloodrage's rage and
    # Charge's stun are all direct triggers, and shipping the whole closure
    # would ship a hundred and thirty spells nothing presses.
    linked = []
    seen = set()
    own = {r['id'] for b in books.values() for r in b}
    for row in (r for b in books.values() for r in b):
        for e in row['does']:
            fired = e[TRIGGERS]
            if not fired or fired in seen or fired in own:
                continue
            r = spells.get(fired)
            if r is None:
                continue
            seen.add(fired)
            linked.append({
                'id': fired,
                'holds': durations.get(r[F_DURATION], 0),
                'stack': r[F_STACK],
                'does': [[r[F_EFFECT + i], r[F_BASE + i] + 1, r[F_DIE + i],
                          r[F_AURA + i], r[F_PERIOD + i], r[F_TRIGGER + i],
                          r[F_MISC + i]]
                         for i in range(3) if r[F_EFFECT + i]],
            })

    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, 'spells.json')
    with open(path, 'w') as f:
        # **`books` and not `spells`.**  One book was a key called `spells`
        # and six are a map keyed on the class, and the scene picks the one
        # the character is.  Nothing reads the old key: a second key holding
        # the warrior's book "for compatibility" is the two-lists-that-drift
        # mistake this repository has paid for four times.
        json.dump({'books': books, 'melee': melee, 'foes': foes,
                   'cues': cues, 'linked': linked, 'grants': grants}, f)
    print(f'{sum(len(b) for b in books.values())} abilities over '
          f'{len(books)} classes to level {upto} -> {path}'
          f'   combat range {melee} yards')
    by_word = {str(CLASS_ID[w]): w for w in CLASSES}
    for key, rows_ in sorted(books.items(), key=lambda kv: by_word[kv[0]]):
        word = by_word[key]
        by = {}
        for r in rows_:
            by[r['power']] = by.get(r['power'], 0) + 1
        print('  %-9s %2d abilities, paid for in %s'
              % (word, len(rows_),
                 ', '.join('%s x%d' % (POWER_WORD.get(k, k), v)
                           for k, v in sorted(by.items()))))
        if unlearned.get(word):
            # Every ability filed under the class's own skill lines, in range,
            # that no trainer sells and no skill rule learns.  This is the
            # list the warrior's three were found in; printing it is what
            # stops a fourth being missed in silence.
            print('       %d in range that nobody teaches: %s'
                  % (len(unlearned[word]), unlearned[word]))
    print('  ' + (', '.join(f"{r['id']} fires {e[TRIGGERS]}" for r in out_rows
                            for e in r['does'] if e[TRIGGERS])
                  or 'nothing fires anything, which is what the wrong column '
                     'looked like'))
    runnable = sum(1 for v in foes.values() for sp in v
                   if any(e in (2, 6, 3, 58) for e, *_ in sp['does']))
    print(f'  {len(foes)} kinds of creature carry '
          f'{sum(len(v) for v in foes.values())} abilities between them, '
          f'{runnable} of which this engine can run')
    # What this slice ships, for the two reports below: the closure (which
    # starts from every book and every creature's list) and the passives a
    # stance is really made of.
    shipped = set(reached) | set(FORM_PASSIVE.values())
    if fixed is None:
        print(f'  SpellInfoCorrections.cpp: no core checkout at {CORE}, so the '
              'corrections the server makes at load are neither applied nor counted')
    else:
        mine = [x for x in fixed if x[0] in shipped]
        print(f'  SpellInfoCorrections.cpp corrects {len({x[0] for x in fixed}):,} '
              f'spells in this client, {len({x[0] for x in mine})} of the '
              f'{len(shipped)} this slice ships')
        for how in ('applied', 'a field it reads, but not a plain number',
                    'a statement this does not parse',
                    'a field this game does not read'):
            rows_ = [x for x in mine if x[3] == how]
            if rows_:
                print(f'    {how}: ' + ', '.join(
                    f'{sid} {what} (:{line})' for sid, line, what, _ in rows_))
    # And which effects and auras those spells are made of, which issue 76
    # asked for by name — the whole enums are 165 and 317, and the part of
    # them an engine for this slice has to know is this list.
    eff_n, aura_n = Counter(), Counter()
    for sid in shipped:
        r = spells.get(sid)
        for i in range(3):
            if r and r[F_EFFECT + i]:
                eff_n[r[F_EFFECT + i]] += 1
            if r and r[F_AURA + i]:
                aura_n[r[F_AURA + i]] += 1
    e_names = effect_names(CORE)
    a_names = {v: k for k, v in enum_values(
        os.path.join(CORE, SPELLS_SRC, 'Auras', 'SpellAuraDefines.h'),
        'SPELL_AURA_').items()}
    print(f'  the {len(shipped)} spells use {len(eff_n)} kinds of effect and '
          f'{len(aura_n)} kinds of aura:')
    print('    ' + ', '.join(f'{e_names.get(k, k)} x{v}'
                             for k, v in sorted(eff_n.items())))
    print('    ' + ', '.join(f'{a_names.get(k, k)} x{v}'
                             for k, v in sorted(aura_n.items())))
    print(f'  the closure over them reaches {len(reached)} spells'
          + (f', and stopped at {len(stopped)} more — {sorted(stopped)[:8]}'
             if stopped else ' and closed'))
    print(f'  {len(cues)} of them are told *when* by `smart_scripts`: '
          f'{sum(len(v) for v in cues.values())} cues'
          + (f', and {sum(skipped_cues.values())} more on triggers this engine '
             f'does not have ({sorted(skipped_cues)})' if skipped_cues else ''))
    # And how much of the script this engine reads at all, which is the number
    # issue 196 asked for.  A creature's behaviour is 383 rows in this slice
    # and the casts are a fifth of them; the rest is talking (Blizzard's
    # prose), walking a path, or setting a flag for another row to read.
    if seen_rows:
        run = sum(len(v) for v in cues.values())
        print(f'  smart_scripts: {seen_rows} rows touch this slice, {run} of '
              f'them run ({100 * run / seen_rows:.0f}%)')
        print('    by action, unread: '
              + ', '.join(f'{k} x{v}' for k, v in
                          sorted(by_action.items(), key=lambda kv: -kv[1])[:8]
                          if k != A_CAST))
        print('    the three that would need a memory: '
              + ', '.join(f'{k} {v}' for k, v in stateful.items())
              + ' — none of them carries a cast this slice can reach, '
                'see the wiki page 데이터: NPC 행동')
    if unrun:
        print('  effects it cannot run, by how often: '
              + ', '.join(f'{k} x{v}' for k, v in
                          sorted(unrun.items(), key=lambda kv: -kv[1])))
    WORD = POWER_WORD
    for r in out_rows:
        print('  %-6d level %-3d %3d %-6s %5dms  reach %s  %s'
              % (r['id'], r['level'], r['cost'], WORD.get(r['power'], '?'),
                 r['cool'], r['reach'], r['does']))


if __name__ == '__main__':
    main(os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else '~/workspace/warmane'),
         os.path.expanduser(sys.argv[2] if len(sys.argv) > 2 else '~/src/azerothcore-wotlk'),
         sys.argv[3] if len(sys.argv) > 3 else 'public/world')
