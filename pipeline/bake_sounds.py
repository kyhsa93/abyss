#!/usr/bin/env python3
"""The sounds the game makes, who made them, and how loud each one is.

  python3 pipeline/bake_sounds.py public/art
  python3 pipeline/bake_sounds.py --listen        # a page to hear them on

`src/` had no `AudioContext` and no `new Audio`.  Nobody decided to make a game
with no sound; there was simply no plan for sound, and the wiki's own argument
for why that costs more here than it would elsewhere is short: in a tab-target
fight **the ear tells you the result before the eye does**, and the fun page
has already found that there is very little decision inside a fight.  If there
is little to decide, the least it can do is read clearly.

The source is `~/src/superpowers-asset-packs` — CC0, so the licence asks for
nothing — and the credit is generated from the list below anyway, the same way
`bake_ui.py` generates the icon credits.  A credit that is written by hand is a
credit that falls behind.

**They are shrunk on the way through.**  These are 44.1 kHz stereo and a sword
is 235 KB; the world a visitor downloads is 1.3 MB gzipped and a sound budget
that doubles it is not a sound budget.  Mono at 22,050 Hz is a quarter of the
bytes and is a blow landing, not a concert.

**And they are levelled, because the pack's mastering was deciding which
events a player could hear.**  Measured over the loudest tenth of a second of
each — which is roughly what an ear takes from a sound this short — the eight
spanned **10.5 dB**: `loot` sat 5.4 dB under the set and `hurt` 5.1 dB over it,
so the sound played most often in this game was the quietest thing in it and
was buried under every blow.  Nobody chose that; it is what happens when eight
files from four different packs are copied in at whatever level their own game
wanted.  Levelling here is not taste — the relative loudness of two events is a
statement about which one matters, and it should be made on purpose.

The judgement on the pack's *character* is in `art/SOUND-CREDITS.md`, and it
needed ears rather than numbers: `--listen` writes the page those ears used.
"""
import math
import os
import shutil
import struct
import sys
import wave

ROOT = os.path.expanduser(os.environ.get('ABYSS_SOUNDS',
                                         '~/src/superpowers-asset-packs'))

# What the game has to say out loud, in the order the wiki puts them.  A word
# on the left, a file on the right, and the third column is the thing on
# screen that says the same — **because turning the sound off may not lose
# information**, and that is a check rather than an intention.
WANTED = [
    ('hit', 'prehistoric-platformer/sound/hit-1.wav',
     'the damage number over whatever you hit'),
    ('miss', 'medieval-fantasy/sounds/woosh-1.wav',
     'the word for the outcome over it, and a line in the log'),
    ('crit', 'top-down-shooter/sounds/sword-2.wav',
     'the number, and “치명타” in the log'),
    ('hurt', 'prehistoric-platformer/sound/hit-2.wav',
     'the number over you and your health bar'),
    ('die', 'top-down-shooter/sounds/death.wav',
     'the log line, and waking up at a graveyard'),
    ('cast', 'medieval-fantasy/sounds/woosh-2.wav',
     'the square on the bar going dark'),
    ('level', 'space-shooter/sounds/power-up-1.wav',
     '“N레벨이 되었다” in the log and the bar emptying'),
    ('loot', 'space-shooter/sounds/gold-1.wav',
     'what was taken, in the log'),
]

# Every place in this game a sound could go, and for each one either the word
# it uses or the reason it is silent.  The issue that asked for this wrote the
# list from memory — walking, hitting, being hit, dying, taking, levelling,
# opening a conversation, pressing a button — and the point of writing it down
# here instead is that **a gap with a reason on it is a decision and a gap with
# nothing on it is an oversight**, which is the same bargain `audit.py` makes
# with the classifiers' defaults.  `soundcheck` fails when a line here names a
# word that does not exist, and when the counts in the document have drifted
# from this table.
ROSTER = [
    ('a blow of yours lands', 'hit', None),
    ('a blow of yours is a critical', 'crit', None),
    ('a blow of yours misses, or is dodged, parried or blocked', 'miss', None),
    ('something lands a blow on you', 'hurt', None),
    ('something dies, you included', 'die', None),
    ('an ability goes off', 'cast', None),
    ('you gain a level', 'level', None),
    ('you take something — a corpse, a chest, a node, a reward', 'loot', None),
    ('you walk', None,
     'there is exactly one footstep in the whole collection and it is '
     '`western-fps-2d/sounds/sand-step.ogg`.  A footstep is not one sound: it '
     'is a cadence, and a different sample for grass, stone, wood and water, '
     'which this game already knows because `__floor` answers it.  One sand '
     'step under a forest is worse than silence'),
    ('a conversation opens', None,
     'the six `ninja-adventure/sounds/menu-*.ogg` are the candidates and they '
     'are a ninja game’s menu.  Held with the button below, because a UI '
     'voice is one decision and not two'),
    ('a button or a panel is pressed', None,
     'the same six, and the same decision.  This one also has a second '
     'objection: the phone presses a button on every attack, so a click here '
     'is a click under every swing'),
    ('you are attacked from behind, or something turns on you', None,
     'the aggro sound is the one thing on this list the log does *not* '
     'already say, so it is the strongest candidate left — and the pack has '
     'nothing for it that is not a monster grunt belonging to one creature'),
    ('an errand is taken or finished', None,
     '`medieval-fantasy/sounds/victory-*.wav` are named for it.  Left until '
     'the character question below is settled, because three of the eight '
     'already shipped are from games this is not'),
    ('a thing is made, or a lesson bought', None, 'the same three victories'),
    ('the wind, the water, a room tone', None,
     '`medieval-fantasy/sounds/forest-ambience.wav` exists and a loop is not '
     'a one-shot: it wants the fade, the pause and the zone that the music '
     'decision below declines for the same reasons'),
]

# Mono at this rate.  Twenty-two thousand is where a short, sharp sound stops
# getting better and starts getting bigger.
RATE = 22050

# Where the levelling puts each sound: the loudest tenth of a second of it,
# in dBFS.  Fourteen under is quiet enough that eight of them overlapping in a
# fight do not add up to a wall, and the ceiling below is what stops any one of
# them clipping on the way there.
LOUD_DB = -14.0
CEILING = 0.98

# Which packs are worth listening to next, for `--listen`.  The two the eight
# were *not* picked from, which is the finding that started this: the set holds
# a pack called `rpg-battle-system` and a pack called `medieval-fantasy`, and
# `level` and `loot` came out of a space shooter.
CANDIDATES = ['medieval-fantasy', 'rpg-battle-system', 'ninja-adventure']


def read(path):
    """One wav, as a list of floats in [-1, 1], plus its rate."""
    with wave.open(path) as w:
        channels, width, rate, frames = (w.getnchannels(), w.getsampwidth(),
                                         w.getframerate(), w.getnframes())
        raw = w.readframes(frames)
    if width != 2:
        return None, rate
    samples = struct.unpack('<%dh' % (len(raw) // 2), raw)
    if channels == 2:
        samples = [(samples[i] + samples[i + 1]) / 2
                   for i in range(0, len(samples) - 1, 2)]
    return [s / 32768.0 for s in samples], rate


def resample(samples, rate):
    """Down to `RATE`, by whole steps, averaging rather than picking.

    Dropping every other sample of a sharp transient is how a sword turns into
    a click, which is the mistake this averages away.
    """
    step = max(1, round(rate / RATE))
    if step == 1:
        return samples, rate
    out = [sum(samples[i:i + step]) / step
           for i in range(0, len(samples) - step + 1, step)]
    return out, rate // step


def loudest(samples, rate, window=0.100):
    """The root-mean-square of the loudest `window` of it.

    Not the whole sound's RMS: that punishes a long tail, so a sound with a
    sharp hit and a two-second decay measures quieter than a flat buzz half its
    size.  Not the peak either, which is one sample and hears nothing.
    """
    n = max(1, int(rate * window))
    if len(samples) <= n:
        return (sum(s * s for s in samples) / len(samples)) ** 0.5
    run = sum(s * s for s in samples[:n])
    best = run
    for i in range(n, len(samples)):
        run += samples[i] * samples[i] - samples[i - n] * samples[i - n]
        best = max(best, run)
    return (best / n) ** 0.5


def onset(samples, rate):
    """When the sound arrives — the first sample above a tenth of its peak.

    Worth a column rather than a gate, because it is the one number that
    decides a question nobody can settle by counting: the whole argument for
    sound in this game is that **the ear reports the result before the eye
    does**, and `crit` is the result that matters most.  Measured, `hit`
    arrives in 6 ms and `crit` in 22 — so a critical lands *later* than an
    ordinary blow.  Whether 16 ms is heard as late is an ear's question and
    the page `--listen` writes is where it gets asked; what belongs here is
    the measurement, in front of whoever asks it.
    """
    peak = max(abs(v) for v in samples)
    for i, v in enumerate(samples):
        if abs(v) >= 0.1 * peak:
            return i / rate
    return 0.0


def db(v):
    """Decibels full scale.  Silence is not -inf here; it is -120, because a
    table with an infinity in it is a table nobody can read."""
    return 20 * math.log10(v) if v > 1e-6 else -120.0


def write(path, samples, rate):
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(struct.pack(
            '<%dh' % len(samples),
            *(max(-32768, min(32767, int(round(s * 32768)))) for s in samples)))
    return os.path.getsize(path)


def listen(out='shots/listen'):
    """A page to hear the eight on, beside what was not picked.

    The art round learned this the expensive way — *"3D 렌더는 LPC 옆에서
    뭉갠다"* was found by **standing them next to each other**, not by
    reasoning about either one.  A sound pack is the same, and there is no
    measurement in this file that can replace it.
    """
    os.makedirs(out, exist_ok=True)
    rows = []
    for word, rel, _seen in WANTED:
        dst = os.path.join(out, 'ship-%s.wav' % word)
        shutil.copy2(os.path.join('public/art/sound', word + '.wav'), dst)
        rows.append(('ships', word, rel, os.path.basename(dst)))
    for pack in CANDIDATES:
        where = os.path.join(ROOT, pack)
        for dirpath, _dirs, names in os.walk(where):
            if 'music' in dirpath or 'musics' in dirpath:
                continue
            for name in sorted(names):
                if not name.lower().endswith(('.wav', '.ogg')):
                    continue
                src = os.path.join(dirpath, name)
                flat = '%s-%s' % (pack, name)
                shutil.copy2(src, os.path.join(out, flat))
                rows.append((pack, os.path.splitext(name)[0],
                             os.path.relpath(src, ROOT), flat))

    with open(os.path.join(out, 'index.html'), 'w') as f:
        f.write('<!doctype html><meta charset=utf-8><title>소리</title>'
                '<style>body{font:14px system-ui;margin:2rem;max-width:60rem}'
                'tr:hover{background:#f4f4f4}td{padding:.2rem .6rem}'
                'audio{height:1.6rem}h2{margin-top:2rem}</style>'
                '<h1>소리를 들어 본다</h1>'
                '<p>위는 지금 게임이 내는 여덟 개, 아래는 안 고른 것들. '
                '음악은 뺐다.</p><table>')
        group = None
        for pack, word, rel, flat in rows:
            if pack != group:
                group = pack
                f.write('<tr><td colspan=3><h2>%s</h2></tr>' % pack)
            f.write('<tr><td><b>%s</b><td><audio controls src="%s"></audio>'
                    '<td><code>%s</code></tr>' % (word, flat, rel))
        f.write('</table>')
    print(f'{len(rows)} sounds -> {out}/index.html')
    print('  python3 -m http.server -d %s   then open it' % out)


def main(out):
    where = os.path.join(out, 'sound')
    os.makedirs(where, exist_ok=True)

    # Two passes, because levelling is a fact about the *set*: how loud one
    # sound should be is not a question you can answer holding one sound.
    got = []
    for word, rel, seen in WANTED:
        src = os.path.join(ROOT, rel)
        if not os.path.exists(src):
            sys.exit(f'{rel} is not in {ROOT}')
        samples, rate = read(src)
        if samples is None:
            sys.exit(f'{rel} is not 16-bit and this script only does 16-bit')
        samples, rate = resample(samples, rate)
        got.append((word, rel, seen, samples, rate, os.path.getsize(src)))

    target = 10 ** (LOUD_DB / 20)
    gains = {w: target / loudest(s, r) for w, _r, _s2, s, r, _n in got}
    # One scale over the whole set if the loudest would clip, rather than per
    # sound: pulling one sound down on its own is levelling it against a
    # different bar from the other seven, which is the thing being fixed.
    head = max(max(abs(v) for v in s) * gains[w] for w, _r, _s2, s, _r2, _n
               in got)
    trim = CEILING / head if head > CEILING else 1.0

    made, total, before = [], 0, 0
    for word, rel, seen, samples, rate, size in got:
        gain = gains[word] * trim
        levelled = [s * gain for s in samples]
        before += size
        total += write(os.path.join(where, word + '.wav'), levelled, rate)
        made.append((word, rel, seen, db(gain),
                     db(loudest(levelled, rate)),
                     db(max(abs(v) for v in levelled)),
                     len(levelled) / rate, onset(levelled, rate)))

    spread = max(m[4] for m in made) - min(m[4] for m in made)
    # Which packs the eight were actually drawn from, counted rather than
    # remembered.  This is the finding that started the round: a collection
    # with a pack called `rpg-battle-system` in it supplied this game's level
    # and loot sounds out of a space shooter.
    packs = {}
    for _w, rel, *_rest in made:
        packs.setdefault(rel.split('/')[0], []).append(_w)
    unused = 0
    for pack in ('medieval-fantasy', 'rpg-battle-system'):
        # Not `where`: that is the output directory, and reusing the name here
        # printed the source pack as the place the sounds had been written to.
        for _d, _s, names in os.walk(os.path.join(ROOT, pack)):
            if 'music' in _d:
                continue
            unused += sum(1 for n in names if n.lower().endswith(('.wav',
                                                                 '.ogg')))
    split = ', '.join(f'{p} gives {len(ws)} ({", ".join(ws)})'
                      for p, ws in sorted(packs.items()))
    with open('art/SOUND-CREDITS.md', 'w') as f:
        f.write('# Sound credits\n\n'
                'Every sound here is from the Superpowers asset packs, which '
                'are **CC0** — the\nlicence asks for nothing and the credit is '
                'here anyway, because a pack that\nasks for nothing still had '
                'somebody make it.\n\n'
                'Made by Pixel-boy for Superpowers.\n'
                'https://github.com/sparklinlabs/superpowers-asset-packs\n\n'
                'Written by `pipeline/bake_sounds.py`; `npm run soundcheck` '
                'holds the game to it.\n\n'
                '| what | from | and on screen | ms | arrives | levelled by '
                '| loudest 0.1 s |\n|---|---|---|---|---|---|---|\n')
        for word, rel, seen, gain, loud, _peak, secs, at in made:
            f.write(f'| `{word}` | `{rel}` | {seen} | {secs * 1000:.0f} | '
                    f'{at * 1000:.0f} ms | {gain:+.1f} dB | '
                    f'{loud:.1f} dBFS |\n')
        f.write(f'\nThe third column is not decoration: **turning the sound '
                'off may not lose\ninformation**, and `viewcheck` holds the '
                'game to it.\n\n'
                'The last two are the levelling.  The pack shipped these eight '
                f'spanning\n**{max(m[3] for m in made) - min(m[3] for m in made):.1f} dB** '
                'and they leave here inside\n'
                f'**{spread:.1f} dB** of each other, because relative loudness '
                'is a statement about\nwhich event matters and it should be '
                'made on purpose rather than inherited\nfrom four different '
                "games' mastering.\n\n"
                '## The character of it\n\n'
                'The eight come from **%d packs**:\n\n' % len(packs) +
                ''.join(f'  * `{p}` — {", ".join(ws)}\n'
                        for p, ws in sorted(packs.items())) +
                '\nWhich is the finding, and it is a count rather than a '
                'taste: this game is a\nmedieval one and **two of the eight '
                'come from a space shooter**, while the same\ncollection '
                'holds a `medieval-fantasy` pack and a `rpg-battle-system` '
                f'pack with\n**{unused} sounds** between them that were '
                'never opened.  That is the half of "does\nthe pack fit" a '
                'script can answer; the other half needed ears, and '
                '`--listen`\nwrites the page they used.  The verdict and the '
                'argument are on the wiki page 소리.\n\n'
                '## Where a sound could go, and does not\n\n'
                '| when | says | or why not |\n|---|---|---|\n')
        for when, word, why in ROSTER:
            f.write(f'| {when} | {"`%s`" % word if word else "—"} | '
                    f'{why or ""} |\n')
        quiet = [r for r in ROSTER if not r[1]]
        f.write(f'\n**{len(ROSTER) - len(quiet)} of {len(ROSTER)}** places in '
                f'this game have a voice and **{len(quiet)}** do not.  Every '
                'one of the\nsilent ones carries the reason, and '
                '`soundcheck` counts them both, so a place\nthat goes quiet '
                'without an argument fails a gate rather than going '
                'unnoticed.\n')

    print(f'{len(made)} sounds -> {where}/   '
          f'{before / 1024:.0f} KiB in, {total / 1024:.0f} KiB out '
          f'({total / before * 100:.0f}%)   '
          f'levelled to {spread:.1f} dB apart, {len(quiet)} places still quiet')
    for word, rel, _seen, gain, loud, peak, _secs, _at in made:
        print(f'  {word:<6} {gain:+5.1f} dB -> {loud:6.1f} dBFS '
              f'(peak {peak:5.1f})  {rel}')


if __name__ == '__main__':
    if '--listen' in sys.argv:
        listen()
    else:
        main(sys.argv[1] if len(sys.argv) > 1 else 'public/art')
