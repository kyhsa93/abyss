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

**This file owns the mapping, not just the file list**, and that is the change
that mattered.  There used to be two lists: `WANTED` here, which decided what
was copied, and `ICON_OF` in `src/main.ts`, which decided what was *drawn*.
`ICON_OF` had four entries because the bar had four squares the day it was
written; the bar grew to twelve and the table did not, and `?? 'sword-slice'`
quietly put one picture on seven abilities — including a human racial that
shakes off a snare, drawn as a sword.  A default that is nearly right is how
this repository keeps losing rounds.

So the maps below are the only statement of which picture goes with what, the
bake copies exactly what they name, and `public/art/ui.json` carries them to
the page.  A spell with no entry fails the bake rather than getting a sword.
"""
import json
import os
import shutil
import sys

ROOT = os.path.expanduser(os.environ.get('ABYSS_ASSETS', '~/src/abyss-assets'))
ICONS = os.path.join(ROOT, 'game-icons', 'icons', 'ffffff', 'transparent', '1x1')

# The furniture: the things on screen that are not an ability or an item.
CHROME = {
    'attack': ('lorc', 'broadsword'),      # the attack on the bar
    'talk': ('skoll', 'talk'),             # and talking to somebody
    'health': ('sbed', 'health-normal'),   # the player frame
    'beast': ('lorc', 'wolf-head'),        # the target frame, when it is one
    'person': ('delapouite', 'sword-brandish'),   # and when it is not
}

# One picture an ability, and every ability in the book has one.
#
# The words beside them are `src/talk.ts`'s, which is the only place this
# game's own name for a spell lives; the ids are the client's.
ABILITY = {
    78: ('lorc', 'sword-slice'),           # 내려치기
    284: ('lorc', 'saber-slash'),          # 내려치기 2
    6603: ('lorc', 'fist'),                # 맨손 공격
    6673: ('lorc', 'shouting'),            # 외침
    100: ('delapouite', 'charging-bull'),  # 달려들기
    6546: ('lorc', 'tread'),               # 달려들기 2
    772: ('lorc', 'bleeding-wound'),       # 찢기
    3127: ('lorc', 'edged-shield'),        # 막기 자세
    6343: ('lorc', 'thunder-struck'),      # 천둥벼락
    34428: ('lorc', 'trophy'),             # 승리의 예감
    1715: ('lorc', 'foot-trip'),           # 다리 걸기
    2687: ('lorc', 'bleeding-heart'),      # 피의 욕망
    59752: ('skoll', 'breaking-chain'),    # 정신 집중
    # The four nobody sells — see issue 148.
    2457: ('cathelineau', 'swordman'),     # 전투 자세
    71: ('lorc', 'shield-reflect'),        # 방어 자세
    355: ('lorc', 'screaming'),            # 도발
    7386: ('lorc', 'cracked-shield'),      # 방어구 부수기
    # And the five other classes, in the order `slice.json` names them.  Every
    # one of these is a picture chosen for **what the ability does** rather
    # than for what the original draws — the original's icons are Blizzard's
    # art and this repository does not take art.  A heal is a hand with light
    # in it whatever the client calls it.
    465: ('lorc', 'shield-echoes'),     # 헌신의 기운
    10290: ('lorc', 'bordered-shield'), # 헌신의 기운 2
    498: ('lorc', 'winged-shield'),     # 신의 보호
    633: ('delapouite', 'hand-of-god'), # 손 얹기
    635: ('delapouite', 'healing'),     # 성스러운 빛
    639: ('lorc', 'shining-heart'),     # 성스러운 빛 2
    853: ('lorc', 'hammer-drop'),       # 심판의 망치
    1022: ('lorc', 'magic-shield'),     # 보호의 축복
    1152: ('delapouite', 'holy-water'), # 정화
    19740: ('lorc', 'muscle-up'),       # 힘의 축복
    20154: ('lorc', 'sun-radiations'),  # 정의의 일격
    20271: ('lorc', 'gavel'),           # 심판
    21084: ('lorc', 'holy-symbol'),     # 정의의 인장
    53: ('lorc', 'backstab'),           # 등 찌르기
    674: ('lorc', 'daggers'),           # 쌍수 무기
    921: ('delapouite', 'robber'),      # 소매치기
    1752: ('lorc', 'knife-thrust'),     # 사악한 일격
    1757: ('lorc', 'stiletto'),         # 사악한 일격 2
    1776: ('lorc', 'sword-wound'),      # 후벼파기
    1784: ('lorc', 'hood'),             # 은신
    2098: ('lorc', 'cloak-dagger'),     # 절개
    6760: ('delapouite', 'dagger-rose'), # 절개 2
    2764: ('lorc', 'arrow-flights'),    # 던지기
    2983: ('darkzaitzev', 'running-ninja'), # 전력 질주
    5171: ('lorc', 'sparkling-sabre'),  # 난도질
    5277: ('delapouite', 'invisible'),  # 회피
    6770: ('lorc', 'sleepy'),           # 기절시키기
    17: ('lorc', 'shield-bounces'),     # 신의 방패
    139: ('zeromancer', 'heart-plus'),  # 소생
    585: ('lorc', 'sunbeams'),          # 성스러운 일격
    591: ('lorc', 'beams-aura'),        # 성스러운 일격 2
    586: ('lorc', 'cloud-ring'),        # 소멸
    589: ('lorc', 'evil-moon'),         # 어둠의 고통
    594: ('lorc', 'shadow-grasp'),      # 어둠의 고통 2
    1243: ('lorc', 'prayer'),           # 인내의 기도
    2006: ('lorc', 'angel-wings'),      # 일으키기
    2050: ('lorc', 'miracle-medecine'), # 하급 치유
    2052: ('lorc', 'glowing-hands'),    # 하급 치유 2
    2053: ('lorc', 'meditation'),       # 하급 치유 3
    8092: ('lorc', 'brain-freeze'),     # 정신 분열
    5019: ('lorc', 'crystal-wand'),     # 지팡이 사격
    116: ('lorc', 'ice-bolt'),          # 얼음 화살
    205: ('delapouite', 'ice-spell-cast'), # 얼음 화살 2
    118: ('lorc', 'spotted-mushroom'),  # 변이
    122: ('lorc', 'frozen-orb'),        # 서리 고리
    133: ('lorc', 'fireball'),          # 화염구
    143: ('delapouite', 'fire-spell-cast'), # 화염구 2
    168: ('lorc', 'ice-shield'),        # 서리 갑옷
    7300: ('lorc', 'snowflake-1'),      # 서리 갑옷 2
    1459: ('delapouite', 'bolt-spell-cast'), # 비전 지능
    2136: ('lorc', 'fire-bomb'),        # 화염 작렬
    5143: ('lorc', 'magic-palm'),       # 비전 화살
    5504: ('sbed', 'water-drop'),       # 물 만들기
    587: ('delapouite', 'water-flask'), # 물 만들기 2
    5505: ('delapouite', 'bread'),      # 음식 만들기
    172: ('lorc', 'spiral-bloom'),      # 부패
    348: ('carl-olsen', 'flame'),       # 제물
    707: ('lorc', 'burning-embers'),    # 제물 2
    686: ('lorc', 'magic-swirl'),       # 어둠의 화살
    695: ('lorc', 'fire-ray'),          # 어둠의 화살 2
    687: ('lorc', 'skull-shield'),      # 악마의 가죽
    696: ('lorc', 'mineral-heart'),     # 악마의 가죽 2
    688: ('lorc', 'imp-laugh'),         # 임프 부르기
    702: ('delapouite', 'arm-sling'),   # 약화의 저주
    980: ('lorc', 'poison-bottle'),     # 고통의 저주
    1120: ('delapouite', 'soul-vessel'), # 영혼 흡수
    1454: ('lorc', 'life-tap'),         # 생명 전환
    5782: ('lorc', 'terror'),           # 공포
    6201: ('lorc', 'heart-drop'),       # 생명석 만들기
}

# And one an item, by the pair `items.py` reduces 1,429 rows to: our word for
# what sort of thing it is, and where it goes.  Thirty-one pairs cover every
# item in this game, which is the whole reason this is affordable — the wiki's
# own rule is *quality by colour, kind by shape, exceptions by hand*, and there
# are no exceptions yet.
#
# The slot is what separates a breastplate from a boot, so `armour` alone is
# not a picture: eleven of these differ only in where the thing is worn.
GOODS = {
    ('weapon', 'weapon'): ('lorc', 'broadsword'),
    ('weapon', 'ranged'): ('delapouite', 'bow-arrow'),
    ('weapon', ''): ('lorc', 'battle-axe'),
    ('armour', 'chest'): ('delapouite', 'chest-armor'),
    ('armour', 'legs'): ('delapouite', 'leg-armor'),
    ('armour', 'hands'): ('delapouite', 'gauntlet'),
    ('armour', 'feet'): ('lorc', 'leather-boot'),
    ('armour', 'wrist'): ('skoll', 'bracers'),
    ('armour', 'belt'): ('lucasms', 'belt'),
    ('armour', 'offhand'): ('willdabeast', 'round-shield'),
    ('armour', 'back'): ('delapouite', 'cape'),
    ('armour', 'shirt'): ('lucasms', 'shirt'),
    ('armour', 'head'): ('sbed', 'helmet'),
    ('armour', 'shoulder'): ('delapouite', 'shoulder-armor'),
    ('armour', 'weapon'): ('lorc', 'shield-reflect'),
    ('armour', ''): ('willdabeast', 'chain-mail'),
    ('errand', ''): ('lorc', 'swap-bag'),
    ('errand', 'offhand'): ('lorc', 'gem-chain'),
    ('oddment', ''): ('delapouite', 'dice-six-faces-one'),
    ('potion', ''): ('lorc', 'potion-ball'),
    # `food` split by `item_template.FoodType`, which is the only column that
    # tells two of Goldshire's shop rows apart — a drink and a loaf, identical
    # in every other field the bake keeps.  This gate caught all six the
    # moment the split landed, which is what it is for.
    ('food', ''): ('delapouite', 'steak'),
    ('drink', ''): ('delapouite', 'water-flask'),
    ('bread', ''): ('delapouite', 'bread'),
    ('cheese', ''): ('lorc', 'cheese-wedge'),
    ('fish', ''): ('darkzaitzev', 'fish-cooked'),
    ('fruit', ''): ('lorc', 'grapes'),
    ('mushroom', ''): ('lorc', 'mushroom-gills'),
    ('raw meat', ''): ('lorc', 'meat-cleaver'),
    ('raw fish', ''): ('darkzaitzev', 'fried-fish'),
    ('meat', ''): ('lorc', 'meat-cleaver'),
    ('recipe', ''): ('lorc', 'scroll-unfurled'),
    ('material', ''): ('lorc', 'stone-block'),
    ('bag', ''): ('delapouite', 'backpack'),
    ('quiver', ''): ('delapouite', 'quiver'),
    ('ammunition', ''): ('lorc', 'arrowhead'),
    ('arrow', ''): ('lorc', 'arrowhead'),
    ('bullet', ''): ('lorc', 'crossed-pistols'),
    ('herb', ''): ('delapouite', 'herbs-bundle'),
    ('cloth', ''): ('delapouite', 'rolled-cloth'),
    ('leather', ''): ('delapouite', 'animal-hide'),
    ('ore', ''): ('faithtoken', 'ore'),
    # And the one word this game had no picture for until it could make one:
    # ten bandages are on shelves in this slice and a first aider ties more.
    ('bandage', ''): ('lorc', 'bandage-roll'),
}

# The empty squares of the character sheet.  A slot with nothing in it used to
# be an empty box and a word, so the sheet said *which squares were full*
# rather than *what he is wearing* — the same picture in grey says both.
EMPTY = {
    'head': ('sbed', 'helmet'),
    'shoulder': ('delapouite', 'shoulder-armor'),
    'shirt': ('lucasms', 'shirt'),
    'chest': ('delapouite', 'chest-armor'),
    'belt': ('lucasms', 'belt'),
    'legs': ('delapouite', 'leg-armor'),
    'feet': ('lorc', 'leather-boot'),
    'wrist': ('skoll', 'bracers'),
    'hands': ('delapouite', 'gauntlet'),
    'back': ('delapouite', 'cape'),
    'weapon': ('lorc', 'broadsword'),
    'offhand': ('willdabeast', 'round-shield'),
    'ranged': ('delapouite', 'bow-arrow'),
}

CREDIT = ('game-icons.net', 'CC-BY 3.0', 'https://game-icons.net')


def path_of(pair):
    return '%s/%s.svg' % pair


def check(out):
    """Every ability in every book has its own picture, and no two share one.

    The second half is the one that would have caught this: seven squares of a
    twelve-square bar were drawing the same sword, and a count of icons would
    have said nine files and been quite happy.

    **Across the books and not within one**, which is the reading six classes
    forced.  Two abilities that share a picture are two squares a player
    cannot tell apart, and whether they sit on the same bar has nothing to do
    with it — a warrior's and a rogue's are both on somebody's screen.  Three
    ids genuinely are on more than one bar (the plain attack, the wand, and
    the racial), and those are one ability each rather than two sharing.
    """
    book = os.path.join(os.path.dirname(out), 'world', 'spells.json')
    if not os.path.exists(book):
        return
    with open(book) as f:
        doc = json.load(f)
    books = doc.get('books', {})
    ids = sorted({sp['id'] for rows in books.values() for sp in rows})
    missing = [i for i in ids if i not in ABILITY]
    if missing:
        sys.exit('the spellbook has %d abilities with no picture: %s'
                 % (len(missing), missing))
    twice = {}
    for i in ids:
        twice.setdefault(ABILITY[i], []).append(i)
    shared = {k: v for k, v in twice.items() if len(v) > 1}
    if shared:
        sys.exit('two abilities draw the same picture: %s' % shared)
    print(f'check: {len(ids)} abilities over {len(books)} books, '
          f'{len(set(ABILITY[i] for i in ids))} pictures, none of them shared')


def check_goods(out):
    """And every (word, slot) pair an item can be has one too."""
    made = os.path.join(os.path.dirname(out), 'world', 'items.json')
    if not os.path.exists(made):
        return
    with open(made) as f:
        items = json.load(f)['items']
    pairs = {(v[0], v[1]) for v in items.values()}
    missing = sorted(pairs - set(GOODS))
    if missing:
        sys.exit('%d kinds of item have no picture: %s' % (len(missing), missing))
    print(f'check: {len(pairs)} kinds of item over {len(items):,} rows, '
          f'all of them drawn')


def main(out):
    where = os.path.join(out, 'ui')
    os.makedirs(where, exist_ok=True)
    wanted = sorted({*CHROME.values(), *ABILITY.values(), *GOODS.values(),
                     *EMPTY.values()})
    for artist, name in wanted:
        src = os.path.join(ICONS, artist, name + '.svg')
        if not os.path.exists(src):
            sys.exit(f'{artist}/{name}.svg is not in the archive — '
                     f'run `npm run fetch game-icons`')
        into = os.path.join(where, artist)
        os.makedirs(into, exist_ok=True)
        shutil.copy2(src, os.path.join(into, name + '.svg'))

    # The mapping, carried to the page so `src/` reads it rather than keeping
    # a second copy that drifts.
    with open(os.path.join(out, 'ui.json'), 'w') as f:
        json.dump({
            'chrome': {k: path_of(v) for k, v in CHROME.items()},
            'spells': {str(k): path_of(v) for k, v in ABILITY.items()},
            # A pair flattened to one string, because JSON has no tuple key.
            'goods': {f'{w}|{s}': path_of(v) for (w, s), v in GOODS.items()},
            'slots': {k: path_of(v) for k, v in EMPTY.items()},
        }, f, indent=1, sort_keys=True)

    who, lic, url = CREDIT
    with open('art/UI-CREDITS.md', 'w') as f:
        f.write('# Interface credits\n\n'
                f'Icons from [{who}]({url}), {lic}. **The licence asks for the\n'
                'author by name**, and the author is the directory each icon\n'
                'sits in — which is why `public/art/ui` is not flattened.\n\n'
                'Generated by `pipeline/bake_ui.py` from the same tables the\n'
                'interface draws from, so this list cannot fall behind it.\n\n')
        for artist in sorted({a for a, _ in wanted}):
            mine = sorted(n for a, n in wanted if a == artist)
            f.write(f'* **{artist}** — {", ".join(mine)}\n')
    size = sum(os.path.getsize(os.path.join(where, a, n + '.svg'))
               for a, n in wanted)
    print(f'{len(wanted)} icons -> {where}/, '
          f'{len({a for a, _ in wanted})} authors in art/UI-CREDITS.md, '
          f'{size / 1024:.0f} KiB')
    check(out)
    check_goods(out)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'public/art')
