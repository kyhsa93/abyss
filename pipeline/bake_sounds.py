#!/usr/bin/env python3
"""The sounds the game makes, and who made them.

  python3 pipeline/bake_sounds.py public/art

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
"""
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

# Mono at this rate.  Twenty-two thousand is where a short, sharp sound stops
# getting better and starts getting bigger.
RATE = 22050


def shrink(src, dst):
    """One sound, downmixed to mono and halved in rate, 16-bit."""
    with wave.open(src) as w:
        channels, width, rate, frames = (w.getnchannels(), w.getsampwidth(),
                                         w.getframerate(), w.getnframes())
        raw = w.readframes(frames)
    if width != 2:
        shutil.copy2(src, dst)
        return os.path.getsize(dst)
    samples = struct.unpack('<%dh' % (len(raw) // 2), raw)
    if channels == 2:
        samples = [(samples[i] + samples[i + 1]) // 2
                   for i in range(0, len(samples) - 1, 2)]
    step = max(1, round(rate / RATE))
    # Averaged rather than picked: dropping every other sample of a sharp
    # transient is how a sword turns into a click.
    out = [sum(samples[i:i + step]) // step
           for i in range(0, len(samples) - step + 1, step)]
    with wave.open(dst, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate // step)
        w.writeframes(struct.pack('<%dh' % len(out), *out))
    return os.path.getsize(dst)


def main(out):
    where = os.path.join(out, 'sound')
    os.makedirs(where, exist_ok=True)
    made, total, before = [], 0, 0
    for word, rel, seen in WANTED:
        src = os.path.join(ROOT, rel)
        if not os.path.exists(src):
            sys.exit(f'{rel} is not in {ROOT}')
        dst = os.path.join(where, word + '.wav')
        before += os.path.getsize(src)
        total += shrink(src, dst)
        made.append((word, rel, seen))

    with open('art/SOUND-CREDITS.md', 'w') as f:
        f.write('# Sound credits\n\n'
                'Every sound here is from the Superpowers asset packs, which '
                'are **CC0** — the\nlicence asks for nothing and the credit is '
                'here anyway, because a pack that\nasks for nothing still had '
                'somebody make it.\n\n'
                'Made by Pixel-boy for Superpowers.\n'
                'https://github.com/sparklinlabs/superpowers-asset-packs\n\n'
                '| what | from | and on screen |\n|---|---|---|\n')
        for word, rel, seen in made:
            f.write(f'| `{word}` | `{rel}` | {seen} |\n')
        f.write('\nThe third column is not decoration: **turning the sound off '
                'may not lose\ninformation**, and `viewcheck` holds the game '
                'to it.\n')

    print(f'{len(made)} sounds -> {where}/   '
          f'{before / 1024:.0f} KiB in, {total / 1024:.0f} KiB out '
          f'({total / before * 100:.0f}%)')
    for word, rel, _seen in made:
        print(f'  {word:<6} {rel}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'public/art')
