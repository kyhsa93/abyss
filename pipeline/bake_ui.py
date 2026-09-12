#!/usr/bin/env python3
"""Put the interface's icons where the page can fetch them, with their authors.

  python3 pipeline/bake_ui.py public/art

game-icons.net is CC-BY 3.0, and the thing CC-BY asks for is the author's name.
The archive answers that by construction: every icon sits in a directory named
after whoever drew it, so the path *is* the attribution — and the only way to
lose it is to flatten the tree on the way out.  So nothing is flattened.  A
file arrives at `ui/<artist>/<icon>.svg` and `art/UI-CREDITS.md` is generated
from the same list, which means the credits cannot fall behind the interface.

The SVGs are taken from the white-on-transparent cut of the archive, so the
page can tint them with `filter` rather than shipping one copy a colour.
"""
import os
import shutil
import sys

ROOT = os.path.expanduser(os.environ.get('ABYSS_ASSETS', '~/src/abyss-assets'))
ICONS = os.path.join(ROOT, 'game-icons', 'icons', 'ffffff', 'transparent', '1x1')

# What the interface actually has a use for today.  Kept short on purpose: an
# icon nothing presses is a file in a licence list.
WANTED = [
    ('lorc', 'broadsword'),          # the attack on the bar
    ('skoll', 'talk'),               # and talking to somebody
    ('sbed', 'health-normal'),       # the player frame
    ('lorc', 'wolf-head'),           # the target frame, when it is a beast
    ('delapouite', 'sword-brandish'),  # and when it is a person
]

CREDIT = ('game-icons.net', 'CC-BY 3.0', 'https://game-icons.net')


def main(out):
    where = os.path.join(out, 'ui')
    os.makedirs(where, exist_ok=True)
    got = []
    for artist, name in WANTED:
        src = os.path.join(ICONS, artist, name + '.svg')
        if not os.path.exists(src):
            sys.exit(f'{artist}/{name}.svg is not in the archive — '
                     f'run `npm run fetch game-icons`')
        into = os.path.join(where, artist)
        os.makedirs(into, exist_ok=True)
        shutil.copy2(src, os.path.join(into, name + '.svg'))
        got.append((artist, name))

    who, lic, url = CREDIT
    with open('art/UI-CREDITS.md', 'w') as f:
        f.write('# Interface credits\n\n'
                f'Icons from [{who}]({url}), {lic}. **The licence asks for the\n'
                'author by name**, and the author is the directory each icon\n'
                'sits in — which is why `public/art/ui` is not flattened.\n\n')
        for artist in sorted({a for a, _ in got}):
            mine = sorted(n for a, n in got if a == artist)
            f.write(f'* **{artist}** — {", ".join(mine)}\n')
    print(f'{len(got)} icons -> {where}/, '
          f'{len({a for a, _ in got})} authors in art/UI-CREDITS.md')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'public/art')
