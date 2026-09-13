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
