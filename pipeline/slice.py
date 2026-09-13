#!/usr/bin/env python3
"""What this game is a slice of, in one file.

  from slice import BOUNDS, MAP, LEVELS, START

The wiki's most important requirement for the pipeline is that **widening the
slice must not be a code change** — and until this file existed it was three
code changes, because the same four numbers were typed into `audit.py`,
`spawn_npcs.py` and `synth_terrain.py`, and the map id into two of them.  Four
numbers in three places is not a constant, it is three constants that happen to
agree today.

`slice.json` sits at the top of the repository so the answer to "where is this
game" is visible from outside the pipeline, which it was not.  The numbers in
it are measured rather than chosen: `measure_zone.py` takes the bounding box of
every chunk the client labels area 12 and `--write` puts the result here.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(os.path.dirname(HERE), 'slice.json')


def load(path=PATH):
    with open(path) as f:
        return json.load(f)


_SLICE = load()
_REGION = _SLICE['regions'][0]

#: x lo, x hi, y lo, y hi — the box every stage filters on.
BOUNDS = tuple(_REGION['bounds'])
#: Which map, which is Azeroth.
MAP = _REGION['map']
#: The area id the bounds were measured from.
AREA = _REGION.get('area', 0)
#: Lowest and highest level this game goes to, which is what `spells.py` reads.
LEVELS = tuple(_SLICE.get('levels', (1, 10)))

#: How far past the ceiling a quest may sit and still be one this game offers.
#:
#: Ours, and it has to be: `Player::SatisfyQuestLevel` is the only level rule
#: the server has and it checks `MinLevel` alone — nothing stops a level one
#: taking a level seventy errand except where its giver stands.  Two, because
#: an errand a couple of levels above you is one you go and do, and it was
#: already chosen twice in this pipeline before it was named once: `items.py`
#: weighed the purse over `LEVELS[1] + 2` and `quests.py` did not filter at
#: all, which is two constants that did not agree.
REACH_OVER = 2
#: Where a new character stands, out of `playercreateinfo`.
START = tuple(_SLICE.get('start', (0.0, 0.0)))
RACES = _SLICE.get('races', [])
CLASSES = _SLICE.get('classes', [])

# The one place a word in `slice.json` becomes the number the world database
# uses.  It was two places and neither of them was here: `items.py` opened with
# `HUMAN, WARRIOR = 1, 1` while carrying a `CLASS_ID` table it used for
# trainers only, and `quests.py` read neither — so a game with one class was
# offering twenty-nine quests to classes it does not have.
#
# `chr_classes` and `chr_races` in the client hold these ids; they are written
# out because a name-to-id table of twelve rows read from a `.dbc` is a client
# dependency for the one stage that has no other reason to open one.
CLASS_ID = {'Warrior': 1, 'Paladin': 2, 'Hunter': 3, 'Rogue': 4, 'Priest': 5,
            'DeathKnight': 6, 'Shaman': 7, 'Mage': 8, 'Warlock': 9,
            'Druid': 11}
RACE_ID = {'Human': 1, 'Orc': 2, 'Dwarf': 3, 'NightElf': 4, 'Undead': 5,
           'Tauren': 6, 'Gnome': 7, 'Troll': 8, 'BloodElf': 10, 'Draenei': 11}


def _mask(names, table, what):
    bits = 0
    for n in names:
        if n not in table:
            raise SystemExit(f'slice.json names a {what} nobody knows: {n}')
        bits |= 1 << (table[n] - 1)
    return bits


#: What `AllowableClasses` and `AllowableRaces` have to overlap for a thing to
#: be for this character.  Nought in either column means anybody, and so does
#: -1 — both spellings are in the dump.
CLASS_MASK = _mask(CLASSES, CLASS_ID, 'class')
RACE_MASK = _mask(RACES, RACE_ID, 'race')


def allows(mask, wanted):
    """Whether a bitmask column lets this slice's character through.

    Two spellings of "anybody" and both are in the dump: `0` and `-1`.
    """
    return mask in (0, -1) or bool(mask & wanted)


def rewrite(bounds, path=PATH):
    """Put a freshly measured box back in the file, keeping everything else.

    The measurement already existed and its output was copied by hand into
    three source files, which is the same thing as not having it.
    """
    with open(path) as f:
        doc = json.load(f)
    doc['regions'][0]['bounds'] = [round(v, 1) for v in bounds]
    with open(path, 'w') as f:
        json.dump(doc, f, indent=2, ensure_ascii=False)
        f.write('\n')
    return doc['regions'][0]['bounds']
