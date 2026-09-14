#!/usr/bin/env python3
"""Which classes this game has, and every fact that differs between them.

  from classes import trainers_of, skills_of, powers_of, POWER_WORD

`slice.json` names the classes and `slice.py` turns the names into the ids the
world database uses.  This file is the next layer down: the handful of things
that are *not* the same for a warrior and a priest, each of them read out of a
table rather than typed here.

It exists because `spells.py` opened with `WARRIOR_TRAINER = 1` — one class's
trainer id, found once by hand and written down.  A second class would have
been a second constant, and six would have been six, which is the shape
`slice.py`'s own docstring refuses: *four numbers in three places is not a
constant, it is three constants that happen to agree today*.  Every one of
them is a column:

| was going to be typed | is read from |
| --- | --- |
| the trainer id per class | `trainer.Type = 0` and its `Requirement` |
| which skill lines a class starts with | `playercreateinfo_skills` |
| what a class starts on its bar | `playercreateinfo_action` |
| rage, mana or energy | `ChrClasses.dbc`'s `DisplayPower` |

The last one is the client's because AzerothCore's `chrclasses_dbc.sql` is a
schema with no rows — the same hole `questxp_dbc` has, and for the same reason:
the core reads that table out of the client at run time.
"""
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

#: `ChrClasses.dbc`'s `DisplayPower`, by the numbers the core's `Powers` enum
#: uses.  `-2` is not in that enum: it is `Spell.dbc`'s own spelling of "this
#: costs health", which is what Bloodrage and Life Tap are.
POWER_WORD = {-2: 'health', 0: 'mana', 1: 'rage', 3: 'energy', 6: 'runic'}

#: Which field of `ChrClasses.dbc` says so.  Found rather than looked up, the
#: way this repository's other offsets were: it is the only one of sixty that
#: is 1 for the warrior, 3 for the rogue, 6 for the death knight and nought for
#: everybody else, and `powers_of` holds it to exactly that.
F_DISPLAY_POWER = 2

#: What a bar of each holds.  Rage and energy are flat hundreds the core sets
#: in `Player::SetCreatePowers`; mana is not a constant at all — it is the
#: class's `BaseMana` for the level plus the intellect curve, so it is a row of
#: `player.json` and not a number here.
FULL = {'rage': 100, 'energy': 100}

#: And what a power is stored at.  `Spell.dbc` keeps rage and runic power at
#: ten times what the bar shows and everything else at face value.
SCALE = {'rage': 10, 'runic': 10}


def trainers_of(base):
    """`{class id: [trainer id]}` — every class trainer in the dump.

    `trainer.Type` is what kind of trainer it is and `Requirement` is what it
    wants; for type 0, a class trainer, that requirement **is the class**.  So
    the whole table of which trainer teaches whom is two columns, and the one
    id that used to be written down here turns out to have been half an
    answer: the warrior has trainers 1 *and* 2.
    """
    from spawn_npcs import columns, rows, split
    path = os.path.join(base, 'trainer.sql')
    col = columns(path)
    out = {}
    for line in rows(path):
        f = split(line)
        try:
            kind, req = int(f[col['Type']]), int(f[col['Requirement']])
        except (ValueError, KeyError, IndexError):
            continue
        if kind == 0:
            out.setdefault(req, []).append(int(f[col['Id']]))
    return {k: sorted(v) for k, v in out.items()}


def skills_of(base, race):
    """`{class id: {skill line}}` — what each class is created knowing.

    `playercreateinfo_skills` is masks rather than ids, and both masks are
    allowed to be nought, which means anybody.  The armour and weapon
    proficiencies are in here too, which is how a mage's single 415 and a
    warrior's 413, 414, 415 say in the data what everybody knows: one of them
    wears cloth and the other does not.
    """
    from spawn_npcs import columns, rows, split
    path = os.path.join(base, 'playercreateinfo_skills.sql')
    col = columns(path)
    bit = 1 << (race - 1)
    out = {}
    for line in rows(path):
        f = split(line)
        try:
            rmask, cmask = int(f[col['raceMask']]), int(f[col['classMask']])
            skill = int(f[col['skill']])
        except (ValueError, KeyError, IndexError):
            continue
        if rmask and not rmask & bit:
            continue
        for cls in range(1, 12):
            if not cmask or cmask & (1 << (cls - 1)):
                out.setdefault(cls, set()).add(skill)
    return out


def bars_of(base, race):
    """`{class id: {spell id}}` — the bar a new character is created holding.

    `type` 0 is a spell; the other rows are macros and items.  This is the
    only statement in the dump of what a class *starts* with, since
    `playercreateinfo_spell_custom` has no rows.
    """
    from spawn_npcs import columns, rows, split
    path = os.path.join(base, 'playercreateinfo_action.sql')
    col = columns(path)
    out = {}
    for line in rows(path):
        f = split(line)
        try:
            if int(f[col['race']]) != race or int(f[col['type']]) != 0:
                continue
            out.setdefault(int(f[col['class']]), set()).add(
                int(f[col['action']]))
        except (ValueError, KeyError, IndexError):
            continue
    return out


def powers_of(client):
    """`{class id: power}` out of `ChrClasses.dbc`, checked against four facts.

    A warrior swings on rage, a rogue on energy, a death knight on runic power
    and a mage on mana.  Read from the wrong field every class comes back
    nought, which looks exactly like a game where everybody casts on mana —
    and a game where the rogue has a mana bar is a game nobody would report as
    broken until they tried to press something.
    """
    import bake_terrain
    data, _src = client.read('DBFilesClient\\ChrClasses.dbc')
    if data is None:
        sys.exit('ChrClasses.dbc is not in this client')
    magic, n, fields, rsize, _sb = struct.unpack_from('<4sIIII', data, 0)
    if magic != b'WDBC':
        sys.exit('ChrClasses.dbc is not a dbc')
    out = {}
    for i in range(n):
        row = struct.unpack_from('<%di' % fields, data, 20 + i * rsize)
        out[row[0]] = row[F_DISPLAY_POWER]
    want = {1: 1, 4: 3, 6: 6, 8: 0}
    got = {k: out.get(k) for k in want}
    if got != want:
        sys.exit('ChrClasses.dbc field %d is not DisplayPower: %s'
                 % (F_DISPLAY_POWER, got))
    return out
