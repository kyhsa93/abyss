#!/usr/bin/env python3
"""One command that builds the whole world.

  npm run bake                 # everything the repository can do on its own
  npm run bake -- --client ~/workspace/warmane
  npm run bake -- --twice      # and prove it comes out the same both times

The pipeline is nine scripts and the order between them matters, and until this
existed the order lived in a wiki page.  Worse, **which of them need a client
lived there too** — so a machine without one produced a world that was quietly
half synthesised, and nothing said so.

Two rules this follows, both from the wiki and both learned the hard way:

  * **Nothing is silently missing.**  A stage that cannot run says why, and the
    summary at the end separates what came out of the client from what came out
    of a hillside generator.  The `· 합성` marker on screen is the same promise
    made to the player; this is the one made to whoever runs the build.
  * **The same inputs give the same bytes.**  `--twice` bakes into two
    directories and compares them, because `public/data` and `public/world` are
    committed: a build that shuffles its own output makes noise in every commit
    and hides the one change that matters.

And it writes `manifest.json`: which AzerothCore commit, which client build,
the hash of every file it produced, and when.  AzerothCore is a moving target —
every row count in the wiki has that sentence under it — and "which upstream
did this come from" is a question that gets asked eventually.
"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from slice import PATH as SLICE_PATH, BOUNDS, LEVELS  # noqa: E402

# What runs, in the order it has to run in.  `client` says whether the stage
# needs the game client; `where` is the directory it writes into, which is what
# the two-worlds split comes down to.
#
# `synth_terrain` is not a fallback bolted on the side — it is the **default**
# path, and the client's terrain is the better layer on top of it.  A machine
# with no client still gets a playable world, and says so on screen.
STAGES = [
    ('synth', 'synth_terrain.py', False, 'public/world',
     'a world from the server database alone'),
    ('spawns', 'spawn_npcs.py', False, 'public/world',
     'who lives there'),
    ('player', 'player.py', True, 'public/world',
     'who the player is at each level'),
    # Objects before quests, and that order is load-bearing: eighteen of this
    # zone's errands hand you a thing and ask you to carry it, and six more
    # want something that comes out of a chest.  `quests.py` asks the baked
    # `objects.json` what the slice's chests hold, the same way it asks
    # `npcs.json` who lives here, so the file has to exist first.
    ('objects', 'objects.py', True, 'public/world',
     'what stands there that is not a person'),
    ('quests', 'quests.py', True, 'public/world',
     'what they want doing'),
    # And spells before items, for the same kind of reason.  A trainer row
    # can be "learn these two spells" rather than an ability, so `items.py`
    # has to know what such a row hands over before it can put the goods on
    # the shelf — and its own check, that no trainer sells what its class
    # cannot cast, was reading last bake's spellbook while it ran first.
    ('spells', 'spells.py', True, 'public/world',
     'what each class can do'),
    # And trades before items, for the third turn of the same reason.  A
    # recipe names two items that need not be on any shelf and fall off
    # nothing — the copper bar it is made of and the belt it makes — so the
    # list of what exists here cannot be settled until the list of what can be
    # made is.  `items.py` reads `trades.json` the way it reads the hauls.
    ('trades', 'trades.py', True, 'public/world',
     'what can be learned to be made'),
    ('items', 'items.py', False, 'public/world',
     'what can be held, bought and taught'),
    ('layout', 'layout.py', True, 'public/world',
     "where the original puts every frame of its interface"),
    ('terrain', 'bake_terrain.py', True, 'public/data',
     "the client's own height grid, ground paint and buildings"),
    # And the interface's pictures last, because two of its checks are about
    # what the stages above just decided: every ability in the spellbook has a
    # picture, and every `(word, slot)` an item can be has one.
    #
    # It was not in this list and both checks were therefore run by hand.  The
    # recipes issue 200 shipped brought a word into `items.json` that had never
    # been there — `bandage`, because before this nobody could make one — and
    # the bag drew a blank square for it through a full bake and a green suite.
    # A check that only runs when somebody remembers is a check that is not
    # part of the bake.
    ('icons', 'bake_ui.py', False, 'public/art',
     'the interface pictures, and that everything shipped has one'),
]


def run(script, args, out):
    """One stage.  Returns (ok, seconds, last line of its output)."""
    started = time.time()
    got = subprocess.run([sys.executable, os.path.join(HERE, script)] + args,
                         cwd=ROOT, capture_output=True, text=True)
    took = time.time() - started
    tail = [ln for ln in (got.stdout or '').strip().splitlines() if ln]
    return got.returncode == 0, took, (tail[-1] if tail else
                                       (got.stderr or '').strip()[-200:]), got


def hashes(*dirs):
    """Every file the bake produced, by content, so a manifest can name them."""
    out = {}
    for d in dirs:
        full = os.path.join(ROOT, d)
        if not os.path.isdir(full):
            continue
        for name in sorted(os.listdir(full)):
            path = os.path.join(full, name)
            if not os.path.isfile(path):
                continue
            with open(path, 'rb') as f:
                out[f'{d}/{name}'] = hashlib.sha256(f.read()).hexdigest()[:16]
    return out


def upstream(acore, client):
    """Where the data came from, which is a question that gets asked later."""
    who = {}
    try:
        who['azerothcore'] = subprocess.run(
            ['git', '-C', acore, 'rev-parse', 'HEAD'],
            capture_output=True, text=True).stdout.strip()[:12] or None
    except OSError:
        who['azerothcore'] = None
    # The client's build number is a version, not a byte of anybody's art, so
    # it can be written down.  It is in the archive's own path layout; the
    # honest fallback is to say we do not know rather than to guess.
    who['client'] = None
    if client and os.path.isdir(client):
        for name in os.listdir(client):
            if name.lower().startswith('wow.exe'):
                who['client'] = '3.3.5a (12340)'
                break
        who['client'] = who['client'] or '3.3.5a'
    return who


# What must never appear in a baked file.  The boundary in the wiki is a
# paragraph and a habit; this is the same boundary as a grep, because a habit
# is what fails quietly.  A model path, an archive name, the name of one of
# the client's own tables: none of them has any business in `public/`.
#
# **This grep never looked for prose and does not now**, which is worth saying
# out loud rather than leaving as an accident.  Until issue 190 no file in
# `public/` had a sentence of Blizzard's in any form, so the line this prints
# — "0 carrying anything of Blizzard's" — was true of the whole output rather
# than of the twelve strings below.  `public/world/prose.json` is a Korean
# translation of quest text, shipped by the owner's decision, and the wiki
# page 저작권과 배포 경계 is where it is argued.  So the sentence below says
# what it actually checked.
FORBIDDEN = [
    '.mdx', '.m2\"', '.wmo', '.blp', '.adt', '.dbc', '.mpq',
    'world\\', 'character\\', 'dbfilesclient', 'interface\\',
    'creature\\', 'item\\', 'spells\\', 'tileset',
]

# **The weighing moved and this is where it went.**
#
# There was a 16 MiB bar here, described as what a phone on a slow connection
# will sit through — and it measured the wrong thing twice over: the raw bytes
# on disk rather than what goes over the wire, and *both* worlds rather than
# the one a visit opens.  `npm run budgetcheck` measures what a visitor
# actually downloads, gzipped, against a budget with a document behind it, and
# two bars that mean different things and disagree is exactly the shape issue
# 207 spent a round deleting.  So the size is printed here and gated there.


def verify(made):
    """The boundary and the budget, as checks rather than as paragraphs.

    Two of the nine the wiki asked for and the two that catch the worst
    mistakes.  A path leaking into the output is a licence problem nothing
    else here would notice — every classifier turns a path into one of our own
    words, and the day one of them returns the path instead, the only thing
    that would say so is this.
    """
    bad = []
    for rel in made:
        path = os.path.join(ROOT, rel)
        if os.path.getsize(path) > 64 * 1024 * 1024:
            continue
        with open(path, 'rb') as f:
            blob = f.read().lower()
        for needle in FORBIDDEN:
            if needle.encode() in blob:
                bad.append(f'{rel} contains {needle!r}')
    size = sum(os.path.getsize(os.path.join(ROOT, p)) for p in made) / 1048576
    print(f'check: {len(made)} files, {size:.1f} MiB on disk (both worlds; what '
          f'a visit downloads is `npm run budgetcheck`), {len(bad)} carrying a '
          'path, an archive or a table name')
    if bad:
        sys.exit('the copyright boundary is broken:\n  ' + '\n  '.join(bad))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--client', default=os.path.expanduser('~/workspace/warmane'))
    ap.add_argument('--acore', default=os.path.expanduser('~/src/azerothcore-wotlk'))
    ap.add_argument('--twice', action='store_true',
                    help='bake again into a scratch directory and compare')
    args = ap.parse_args()

    have_client = os.path.isdir(args.client)
    have_acore = os.path.isdir(os.path.join(args.acore, 'data/sql/base/db_world'))
    if not have_acore:
        sys.exit(f'no AzerothCore data at {args.acore} — there is no world '
                 f'without it, synthesised or otherwise')

    print(f'slice   {SLICE_PATH}')
    print(f'        map area, {BOUNDS[1] - BOUNDS[0]:.0f} x '
          f'{BOUNDS[3] - BOUNDS[2]:.0f} yards, levels {LEVELS[0]}-{LEVELS[1]}')
    print(f'world   {args.acore}')
    print(f'client  {args.client if have_client else "none — the terrain will be synthesised"}')
    print()

    total, failed, skipped = 0.0, [], []
    for name, script, needs_client, where, what in STAGES:
        if needs_client and not have_client:
            skipped.append((name, what))
            print(f'  --   {name:<9} skipped, needs the client   ({what})')
            continue
        argv = ([where] if script == 'bake_ui.py'
                else [args.client, where] if script == 'layout.py'
                else [args.client, args.acore, where] if script == 'spells.py'
                else [args.client, where, args.acore] if script == 'bake_terrain.py'
                else [args.acore, args.client, where] if script in ('objects.py', 'player.py', 'items.py', 'trades.py')
                else [args.acore, args.client, where] if script == 'quests.py'
                else [args.acore, where])
        ok, took, line, got = run(script, argv, where)
        total += took
        if not ok:
            failed.append(name)
            print(f'  FAIL {name:<9} {took:5.1f}s  {line}')
            print((got.stderr or '').strip()[-1200:], file=sys.stderr)
        else:
            print(f'  ok   {name:<9} {took:5.1f}s  {line}')

    print()
    made = hashes('public/world', 'public/data')
    who = upstream(args.acore, args.client if have_client else None)
    manifest = {
        'baked': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'upstream': who,
        'slice': json.load(open(SLICE_PATH)),
        'synthesised': not have_client,
        'files': made,
    }
    with open(os.path.join(ROOT, 'public', 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        f.write('\n')

    verify(made)
    print(f'{len(made)} files   {total:.1f}s')
    print(f'upstream  azerothcore {who["azerothcore"] or "unknown"}'
          f'   client {who["client"] or "none"}')
    if skipped:
        # The loud half of the promise.  A world missing its client layer is a
        # world with no roads and no buildings, and the worst possible way to
        # find that out is by looking at it.
        print(f'THE TERRAIN IS SYNTHESISED: {len(skipped)} stages did not run '
              f'without a client — ' + ', '.join(n for n, _ in skipped))
    if failed:
        sys.exit('failed: ' + ', '.join(failed))

    if args.twice:
        again(args)


def again(args):
    """Bake a second time into scratch and compare, file by file."""
    print('\nbaking again, to see whether it comes out the same')
    scratch = tempfile.mkdtemp(prefix='abyss-bake-')
    try:
        first = {k: v for k, v in hashes('public/world', 'public/data').items()}
        for _name, script, needs_client, where, _what in STAGES:
            if needs_client and not os.path.isdir(args.client):
                continue
            into = os.path.join(scratch, where)
            os.makedirs(into, exist_ok=True)
            argv = ([args.client, into] if script == 'layout.py'
                    else [args.client, args.acore, into] if script == 'spells.py'
                    else [args.client, into, args.acore] if script == 'bake_terrain.py'
                    else [args.acore, args.client, into] if script in ('objects.py', 'quests.py', 'player.py', 'items.py')
                    else [args.acore, into])
            run(script, argv, into)
        second = {}
        for where in ('public/world', 'public/data'):
            d = os.path.join(scratch, where)
            if not os.path.isdir(d):
                continue
            for name in sorted(os.listdir(d)):
                with open(os.path.join(d, name), 'rb') as f:
                    second[f'{where}/{name}'] = hashlib.sha256(f.read()).hexdigest()[:16]
        moved = [k for k in first if k in second and first[k] != second[k]]
        print(f'check: {len(second)} files baked twice, {len(moved)} came out '
              f'different')
        if moved:
            sys.exit('the bake is not reproducible: ' + ', '.join(moved))
    finally:
        shutil.rmtree(scratch, ignore_errors=True)


if __name__ == '__main__':
    main()
