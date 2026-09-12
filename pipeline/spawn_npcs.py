#!/usr/bin/env python3
"""Pull the slice's inhabitants out of AzerothCore.

This is the one part of the world that does not care whether a client is
installed.  Terrain has two sources — the client's height grid is sharper than
anything a database knows — but where a wolf stands is a row in `creature`
either way, so there is a single spawn file and both worlds use it.

What comes out is a position, a facing, a level, a **kind** and a **role**.
Not a name.  The kind words are ours: `creature_template.name` is read to pick
one and then dropped, the same bargain `bake_terrain.py` makes with Blizzard's
model paths.  `type` and `family` were tried first and are not enough on their
own — `family` is only filled in for the beasts a hunter can tame, which is
three quarters of nothing here, and `type` puts a kobold, a murloc and a city
guard in one bucket called humanoid.

Two filters matter more than they look:

  * `game_event_creature` with a **positive** event id is a spawn that only
    exists during a holiday.  Without this the slice is 1,796 spawns of which
    703 are Pilgrim's Bounty turkeys and the beasts of Elwynn are a rounding
    error.  A negative id is the opposite — present normally, removed during
    the event — so those stay.
  * `pool_creature` is a spawn that shares a slot with others and is not always
    the one that got it.

  python3 pipeline/spawn_npcs.py <azerothcore dir> <out dir>
"""
import json
import math
import os
import re
import sys
from collections import Counter

CENTRE = (-9199.2, -32.1)    # the slice, out of the wiki page 수직 슬라이스
RADIUS = 600.0
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
        if (x - CENTRE[0]) ** 2 + (y - CENTRE[1]) ** 2 > RADIUS ** 2:
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
                       int(f[col['npcflag']]), int(f[col['rank']]))

    kinds, roles, out_rows = [], [], []
    unknown = Counter()
    for entry, x, y, o in spawns:
        if entry not in info:
            dropped['no template'] += 1
            continue
        kind, ctype, lo, hi, flags, rank = info[entry]
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
        out_rows.append([round(x, 2), round(y, 2), kinds.index(kind), facing,
                         (lo + hi) // 2, roles.index(r)])

    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, 'npcs.json')
    with open(path, 'w') as f:
        json.dump({'kinds': kinds, 'roles': roles, 'npcs': out_rows}, f)

    by_kind = Counter(kinds[r[2]] for r in out_rows)
    by_role = Counter(roles[r[5]] for r in out_rows)
    print(f'{len(out_rows):,} spawns, {len(kinds)} kinds  '
          f'({os.path.getsize(path) / 1024:.0f} KiB)')
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
    far = max(math.hypot(r[0] - CENTRE[0], r[1] - CENTRE[1]) for r in out_rows)
    if far > RADIUS:
        sys.exit(f'a spawn is {far:.0f} yd out, past the {RADIUS:.0f} yd slice')
    facings = Counter(r[3] for r in out_rows)
    print(f'check: furthest spawn {far:.0f} / {RADIUS:.0f} yd, '
          f'facings ' + '/'.join(str(facings[d]) for d in range(4)))
    if len(facings) < 4 or min(facings.values()) < len(out_rows) / 40:
        sys.exit('the facings are not spread over four directions — orientation misread')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/src/azerothcore-wotlk'),
         sys.argv[2] if len(sys.argv) > 2 else 'public/world')
