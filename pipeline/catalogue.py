#!/usr/bin/env python3
"""File everything that was acquired, so a bake step can ask for a thing.

  python3 pipeline/catalogue.py              build it, print the summary
  python3 pipeline/catalogue.py tree         what is filed under `tree`
  python3 pipeline/catalogue.py --stray      what the classifier could not place

Writes `pipeline/catalogue.json` — the register the rest of the pipeline reads
instead of naming paths — and `art/ASSET-CATALOGUE.md`, which is the same thing
for a person.

**The point is the `kind`, not the list.**  A directory of forty thousand files
is not an asset library; it is a directory.  What makes it usable is that
something has decided which of them is a tree, and written that decision down
where a bake step can query it — `for a in catalogue.of('tree')` rather than a
path typed into `render_kit.py` and forgotten.

The classifier is keywords on the path, which is crude, and the honest number
is `--stray`: how much it could not place.  That number is printed on every
run rather than hidden, because the last time this repository classified things
by name it left 5,151 creature names with no kind and only found out by
counting.
"""
import json
import os
import re
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sources as S  # noqa: E402

ROOT = os.path.expanduser(os.environ.get('ABYSS_ASSETS', '~/src/abyss-assets'))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'catalogue.json')

MODEL = {'.glb', '.gltf', '.fbx', '.obj', '.blend'}
IMAGE = {'.png', '.jpg', '.jpeg', '.svg', '.webp'}
SOUND = {'.ogg', '.wav', '.mp3', '.flac'}
TYPE = {'.ttf': 'font', '.otf': 'font', '.woff': 'font', '.woff2': 'font',
        '.ogg': 'audio', '.wav': 'audio', '.mp3': 'audio', '.flac': 'audio'}

# Skipped outright: previews, licences, engine projects, editor leftovers.  A
# pack ships as much packaging as art, and a catalogue that files the sample
# renders is a catalogue that offers you a picture of a tree.
SKIP_DIR = ('preview', 'previews', 'sample', 'samples', 'screenshot', 'unity',
            'unreal', 'godot', 'isometric', 'renders', 'docs', '.git',
            'node_modules', '__macosx')
SKIP_FILE = re.compile(
    r'(license|licence|readme|credits?|changelog|preview|sample|thumbnail|'
    r'\.blend\d|\.meta|\.import|\.ds_store)', re.I)

# Most specific first: a `stone_wall` is a wall, and `tree_stump` is a tree,
# so whichever list is checked first decides — which is why `building` sits
# above `rock` and `vegetation` above `prop`.
KINDS = (
    ('ui', ('ui', 'panel', 'button', 'frame', 'border', 'cursor', 'prompt',
            'slider', 'checkbox', 'tooltip', 'progress', 'hud')),
    ('creature', ('monster', 'dragon', 'skeleton', 'zombie', 'orc', 'goblin',
                  'slime', 'spider', 'bat', 'wolf', 'bear', 'boar', 'deer',
                  'rat', 'snake', 'ghost', 'demon', 'golem', 'troll', 'ogre',
                  'mimic', 'beast', 'enemy', 'animal', 'fish', 'chicken',
                  'cow', 'sheep', 'horse', 'pig', 'cat', 'dog', 'bunny',
                  'rabbit', 'mushroom-king', 'yeti', 'werewolf', 'shark')),
    ('weapon', ('sword', 'axe', 'bow', 'arrow', 'staff', 'wand', 'dagger',
                'mace', 'hammer', 'spear', 'shield', 'crossbow', 'quiver',
                'weapon', 'blade')),
    ('armour', ('armor', 'armour', 'helmet', 'helm', 'boots', 'gloves',
                'gauntlet', 'shoulder', 'chestplate', 'cloak')),
    ('character', ('character', 'human', 'villager', 'knight', 'mage', 'rogue',
                   'barbarian', 'townsfolk', 'person', 'avatar', 'adventurer')),
    ('vegetation', ('tree', 'bush', 'plant', 'flower', 'grass', 'leaf',
                    'log', 'stump', 'cactus', 'palm', 'pine', 'fern', 'crop',
                    'wheat', 'hedge', 'vine', 'moss', 'lily', 'reed')),
    ('rock', ('rock', 'stone', 'cliff', 'boulder', 'ore', 'crystal', 'gem',
              'stalagmite', 'stalactite')),
    ('building', ('house', 'building', 'wall', 'roof', 'door', 'window',
                  'tower', 'castle', 'church', 'tavern', 'shop', 'hut',
                  'tent', 'bridge', 'gate', 'stair', 'floor', 'pillar',
                  'column', 'arch', 'fence', 'ceiling', 'chimney', 'balcony',
                  'market', 'mill', 'barn', 'stable', 'dungeon')),
    ('prop', ('barrel', 'crate', 'box', 'chest', 'cart', 'wagon', 'bucket',
              'pot', 'jar', 'bag', 'sack', 'table', 'chair', 'bench', 'bed',
              'shelf', 'lamp', 'lantern', 'torch', 'candle', 'banner', 'flag',
              'sign', 'well', 'anvil', 'forge', 'campfire', 'fire', 'tomb',
              'grave', 'coffin', 'statue', 'fountain', 'ladder', 'rope',
              'chain', 'book', 'scroll', 'potion', 'coin', 'key', 'food',
              'bread', 'meat', 'apple', 'furniture', 'bottle', 'basket',
              'cauldron', 'bone', 'skull', 'cheese', 'fruit', 'vegetable')),
    ('particle', ('particle', 'smoke', 'spark', 'flame', 'magic', 'star',
                  'glow', 'trail', 'explosion', 'fx', 'light', 'muzzle')),
    ('tile', ('tile', 'tileset', 'terrain', 'ground', 'map', 'spritesheet')),
)

# What shape the file is, as opposed to what it depicts.  The two are separate
# questions and conflating them cost the first version of this table its most
# useful query: a sword icon is an icon *and* a weapon, and filing it under one
# of those means the spellbook cannot find it or the armoury cannot.
FORM = {'.glb': 'model', '.gltf': 'model', '.fbx': 'model', '.obj': 'model',
        '.blend': 'model', '.svg': 'icon', '.png': 'sprite', '.webp': 'sprite',
        '.jpg': 'texture', '.jpeg': 'texture'}
SURFACE = re.compile(r'(texture|albedo|basecolor|roughness|normal|metal|'
                     r'colormap|diffuse|_ao|height)', re.I)


def form_of(path, ext):
    """model, sprite, icon, texture, sound or font — by shape, not subject."""
    if ext in TYPE:
        return TYPE[ext].replace('audio', 'sound')
    parts = path.lower().replace('\\', '/').split('/')
    if ext in ('.png', '.webp') and ('textures' in parts[:-1]
                                     or parts[-1].startswith('tex_')
                                     or SURFACE.search(parts[-1])):
        return 'texture'
    return FORM.get(ext)


def hints(book):
    """Per-file facts a source recorded at the moment it was fetched.

    Keyed by whatever appears in the filename.  poly.pizza knows what each of
    its models is — the author tagged it — and the author's own words beat any
    keyword list run over a filename: `Mushnub` says nothing and its tags say
    Plant, Mushroom, Enemy, Monster.
    """
    out = {}
    for pack in book.get('packs', []):
        # `files` is a count for a source that arrives as an archive and a list
        # for one fetched a file at a time.  Both are the honest answer to "how
        # many files"; only the second has anything to say about each of them.
        got = pack.get('files')
        if not isinstance(got, list):
            continue
        for f in got:
            if isinstance(f, dict) and f.get('id'):
                out[f['id']] = f
    return out


def kind_of(path, ext, tags=()):
    """What a file is, from where it sits and the words in its name.

    Structure first, then words.  A file in a `textures/` directory is a
    texture whatever it is a texture *of*, and reading the words instead filed
    `textures/tex_human_male_heavy_armor.png` under `character`, because the
    pack's own directory is called `..._characters` and a directory name
    outvoted the filename.

    Then the filename before the rest of the path, for the same reason: the
    path says which pack, the name says which thing.
    """
    # Sound and type are not kinds.  `form` already says a file is an ogg; what
    # `kind` is for is what the ogg is *of*, and answering "audio" to that
    # question put three hundred footsteps and sword hits in one bucket with no
    # way to tell them apart.
    low = path.lower().replace('\\', '/')
    name = low.split('/')[-1]
    for scope in ([' '.join(tags).lower()] if tags else []) + [name, low]:
        words = set(re.split(r'[^a-z0-9]+', scope))
        for kind, keys in KINDS:
            if not keys:
                continue
            if any(k in words or (len(k) > 4 and k in scope) for k in keys):
                return kind
    return None


def glb_facts(path):
    """Animation names and mesh count, read out of the glb's JSON chunk.

    Whether a model is animated is the one fact that decides what it can be:
    an unrigged wolf is scenery.  It is in the file and costs one read to know,
    and asking later means opening Blender.
    """
    try:
        with open(path, 'rb') as f:
            head = f.read(12)
            if head[:4] != b'glTF':
                return {}
            ln, ty = struct.unpack('<II', f.read(8))
            if ty != 0x4E4F534A:
                return {}
            j = json.loads(f.read(ln))
    except Exception:                                   # noqa: BLE001
        return {}
    out = {'meshes': len(j.get('meshes', []))}
    anims = [a.get('name', '?') for a in j.get('animations', [])]
    if anims:
        out['animations'] = anims
    if j.get('skins'):
        out['rigged'] = True
    return out


def image_size(path):
    """Width and height without decoding the pixels.

    PNG and JPEG headers carry it; an SVG's viewBox does.  Decoding forty
    thousand images to learn two numbers would take longer than the download
    did.
    """
    try:
        with open(path, 'rb') as f:
            head = f.read(4096)
        if head[:8] == b'\x89PNG\r\n\x1a\n':
            w, h = struct.unpack('>II', head[16:24])
            return [w, h]
        if head[:2] == b'\xff\xd8':
            with open(path, 'rb') as f:
                data = f.read()
            i = 2
            while i < len(data) - 9:
                if data[i] != 0xFF:
                    i += 1
                    continue
                m = data[i + 1]
                if 0xC0 <= m <= 0xCF and m not in (0xC4, 0xC8, 0xCC):
                    h, w = struct.unpack('>HH', data[i + 5:i + 9])
                    return [w, h]
                i += 2 + struct.unpack('>H', data[i + 2:i + 4])[0]
            return None
        if b'<svg' in head:
            m = re.search(rb'viewBox="([\d.\s-]+)"', head)
            if m:
                v = m.group(1).split()
                return [int(float(v[2])), int(float(v[3]))]
    except Exception:                                   # noqa: BLE001
        return None
    return None


def papers(root):
    """The licence and author of each source, read off its own SOURCE.json."""
    out = {}
    for sid in sorted(os.listdir(root)) if os.path.isdir(root) else []:
        book = os.path.join(root, sid, 'SOURCE.json')
        if os.path.exists(book):
            out[sid] = json.load(open(book))
    return out


def walk(root, books):
    rows = []
    for sid, book in books.items():
        base = os.path.join(root, sid)
        told = hints(book)
        for here, dirs, files in os.walk(base):
            dirs[:] = [d for d in dirs if d.lower() not in SKIP_DIR]
            for n in sorted(files):
                if SKIP_FILE.search(n) or n == 'SOURCE.json':
                    continue
                ext = os.path.splitext(n)[1].lower()
                if ext not in MODEL | IMAGE | SOUND | set(TYPE):
                    continue
                path = os.path.join(here, n)
                rel = os.path.relpath(path, root)
                pack = os.path.relpath(here, base).split(os.sep)[0]
                # `<Title>.<id>.glb` — the id is how a row finds what the
                # fetcher was told about it.
                bits = os.path.splitext(n)[0].rsplit('.', 1)
                said = told.get(bits[-1]) if len(bits) > 1 else None
                tags = (said or {}).get('tags') or ()
                kind = kind_of(rel, ext, tags)
                row = {'id': rel.replace(os.sep, '/'), 'source': sid,
                       'name': bits[0], 'kind': kind,
                       'pack': pack if pack != '.' else sid,
                       'form': form_of(rel, ext), 'format': ext[1:],
                       'bytes': os.path.getsize(path)}
                if said:
                    row['tags'] = list(tags)
                    # Per file, not per source: this site aggregates, so a
                    # licence taken from the source is right on average and
                    # wrong on the one file somebody ships.
                    for k in ('licence', 'author'):
                        if said.get(k):
                            row[k] = said[k]
                if ext == '.glb':
                    row.update(glb_facts(path))
                elif ext in IMAGE:
                    wh = image_size(path)
                    if wh:
                        row['size'] = wh
                rows.append(row)
    # Everything is in the register, kind or no kind.  Holding the unplaced
    # ones back would have hidden three thousand icons: game-icons names its
    # art for what it depicts — `acid`, `abacus`, `achievement` — so an icon
    # this taxonomy has no word for is still perfectly findable by name, and
    # dropping it because a keyword list did not recognise it is the classifier
    # deciding what exists.
    stray = [r for r in rows if not r['kind']]
    return rows, stray


def summary(rows, stray, books):
    kinds = {}
    for r in rows:
        kinds.setdefault(r['kind'] or '(no kind)', []).append(r)
    lines = ['# What art this game has, and whose it is', '',
             'Built by `pipeline/catalogue.py` out of what',
             '`pipeline/fetch_assets.py` acquired. Do not edit; run it.', '',
             '## Whose', '',
             '| source | licence | author | files |', '|---|---|---|---|']
    for sid, b in sorted(books.items()):
        n = sum(1 for r in rows if r['source'] == sid)
        lines.append('| %s | %s | %s | %d |'
                     % (b['name'], b['licence'], b['author'], n))
    lines += ['', 'CC0 asks for nothing. **CC-BY and CC-BY-SA ask for the '
              'author by name**, and', 'the author of a game-icons piece is '
              'the directory it sits in — so the path is', 'the attribution '
              'and it has to survive into whatever the bake writes.', '',
              '## What', '',
              'Two questions, kept apart: **kind** is what a file depicts and '
              '**form** is what', 'shape it is in. A sword icon is both, and '
              'filing it under one of them means', 'either the spellbook or '
              'the armoury cannot find it.', '']
    forms = sorted({r.get('form') for r in rows if r.get('form')})
    lines += ['| kind | ' + ' | '.join(forms) + ' | animated | total |',
              '|---' * (len(forms) + 3) + '|']
    for kind, rs in sorted(kinds.items(), key=lambda kv: -len(kv[1])):
        cells = [str(sum(1 for r in rs if r.get('form') == f) or '') for f in forms]
        anim = sum(1 for r in rs if r.get('animations'))
        lines.append('| `%s` | %s | %s | %d |'
                     % (kind, ' | '.join(cells), anim or '', len(rs)))
    lines += ['', '%d files. %d of them carry no kind — they are in the '
              'register all the same and' % (len(rows), len(stray)),
              'findable by name; `python3 pipeline/catalogue.py --stray` '
              'lists them.', '']
    return '\n'.join(lines), kinds


def load():
    """The catalogue, for a bake step that wants to ask for a kind."""
    return json.load(open(OUT))


def of(kind, **where):
    """Every asset of a kind, filtered: `of('tree', source='kenney')`."""
    out = [r for r in load()['assets'] if r['kind'] == kind]
    for k, v in where.items():
        out = [r for r in out if r.get(k) == v]
    return out


def main(argv):
    books = papers(ROOT)
    if not books:
        sys.exit('nothing under %s — run pipeline/fetch_assets.py --all' % ROOT)
    rows, stray = walk(ROOT, books)
    text, kinds = summary(rows, stray, books)
    with open(OUT, 'w') as f:
        # No separate list of the unplaced: they are rows in `assets` with a
        # null kind, and writing them twice made a quarter of this file a copy
        # of the other three quarters.
        json.dump({'root': ROOT, 'sources': books, 'assets': rows}, f)
    with open('art/ASSET-CATALOGUE.md', 'w') as f:
        f.write(text)

    if argv and argv[0] == '--stray':
        for r in stray[:400]:
            print(r['id'])
        print('\n%d unplaced of %d' % (len(stray), len(rows) + len(stray)))
        return
    if argv:
        for r in kinds.get(argv[0], [])[:400]:
            extra = ('  [%s]' % ', '.join(r['animations'][:4])
                     if r.get('animations') else '')
            print('%-72s %s%s' % (r['id'], r['format'], extra))
        print('\n%d under %r' % (len(kinds.get(argv[0], [])), argv[0]))
        return
    print(text)


if __name__ == '__main__':
    main(sys.argv[1:])
