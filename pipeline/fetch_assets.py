#!/usr/bin/env python3
"""Acquire everything `sources.py` lists, into one tree, with its papers.

  python3 pipeline/fetch_assets.py              what is here and what is not
  python3 pipeline/fetch_assets.py --all        get everything fetchable
  python3 pipeline/fetch_assets.py kenney       one source

Lands in `$ABYSS_ASSETS` (default `~/src/abyss-assets`), one directory a
source, and writes a `SOURCE.json` beside each with the licence, the author,
the address it came from and the day it came.  **That file is the reason this
script exists.**  Art acquired by hand is art whose licence lives in a browser
tab: this repository already refuses to ship a tile that names no author, and
the only way to keep that promise at three thousand files is to record the
provenance at the moment of the download rather than reconstruct it later.

Nothing here is committed — the tree is somebody else's art — and nothing here
is edited.  `catalogue.py` reads it, the bake scripts read what catalogue.py
wrote, and the acquired files stay exactly as they arrived.
"""
import io
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sources as S  # noqa: E402

ROOT = os.path.expanduser(os.environ.get('ABYSS_ASSETS', '~/src/abyss-assets'))
UA = {'User-Agent': 'abyss-asset-fetch/1 (+https://github.com/kyhsa93/abyss)'}
PAUSE = 0.15            # between requests to one host, because they are free


def get(url, binary=True):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
    return data if binary else data.decode('utf-8', 'replace')


def unpack(data, where):
    """Extract an archive, or write it as a file if it is not one."""
    os.makedirs(where, exist_ok=True)
    if data[:2] == b'PK':
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            z.extractall(where)
        return len(z.namelist())
    if data[:6] == b"7z\xbc\xaf\x27\x1c":
        import py7zr                      # only this one source needs it
        with py7zr.SevenZipFile(io.BytesIO(data)) as z:
            z.extractall(where)
            return len(z.getnames())
    return 0


def fetch_kenney(src, where):
    """Each pack's asset page carries an absolute link to its own zip.

    The link is scraped rather than built.  The zip and the page's own preview
    image live under different content-hash directories — guessing the zip's
    from the image's returns a 404 that is 7 KB of HTML and looks like a
    download until something tries to open it.
    """
    got = []
    for pack in src['packs']:
        page = get('https://kenney.nl/assets/' + pack, binary=False)
        m = re.search(r'https://kenney\.nl/media/[^"]*\.zip', page)
        if not m:
            print('  !! no zip on the page for %s' % pack)
            continue
        data = get(m.group(0))
        n = unpack(data, os.path.join(where, pack))
        got.append(dict(pack=pack, url=m.group(0), bytes=len(data), files=n))
        print('  %-28s %6.1f MB %5d files' % (pack, len(data) / 1e6, n))
        time.sleep(PAUSE)
    return got


def fetch_polypizza(src, where):
    """A bundle page lists model ids; each model page carries one glb.

    Two requests a model and no API key.  The creature packs are the reason
    this source is worth the round trips: the glb that comes back is rigged and
    animated — idle, walk, bite, hit, death — and nothing else free has a wolf
    with a bite in it.
    """
    got = []
    for bundle in src['packs']:
        page = get('https://poly.pizza/bundle/' + bundle, binary=False)
        ids = sorted(set(re.findall(r'\\u002Fm\\u002F([A-Za-z0-9]+)', page)))
        into = os.path.join(where, bundle.rsplit('-', 1)[0])
        os.makedirs(into, exist_ok=True)
        models = []
        for mid in ids:
            try:
                mp = get('https://poly.pizza/m/' + mid, binary=False)
            except Exception as e:                      # noqa: BLE001
                print('  !! %s: %s' % (mid, e))
                continue
            g = re.search(r'https://static\.poly\.pizza/([0-9a-f-]{36})\.glb', mp)
            if not g:
                continue
            # The page's own record of the model, not its `<title>` — which is
            # set after load and is simply absent from the HTML, so reading it
            # named four hundred files after their own database ids.
            t = re.search(r'"Title":"([^"]+)"', mp)
            tags = re.search(r'"Tags":\[([^\]]*)\]', mp)
            # Per model, not per source.  The site aggregates: a bundle can be
            # CC0 and the model beside it CC-BY, and a licence recorded at the
            # source is a licence that is right on average and wrong on the one
            # file somebody ships.
            lic = re.search(r'"Licence":"([^"]+)"', mp)
            who = re.search(r'"Creator":\{"Username":"([^"]+)"', mp)
            anim = '"Animated":true' in mp
            name = re.sub(r'[^A-Za-z0-9_-]+', '-',
                          (t.group(1) if t else mid).strip()).strip('-')
            # The author's own words for what the thing is.  Worth more than
            # any keyword list run over a filename: `Mushnub` says nothing and
            # its tags say Plant, Mushroom, Enemy, Monster.
            tag = re.findall(r'"([^"]+)"', tags.group(1)) if tags else []
            path = os.path.join(into, '%s.%s.glb' % (name or 'model', mid))
            if not os.path.exists(path):
                with open(path, 'wb') as f:
                    f.write(get(g.group(0)))
                time.sleep(PAUSE)
            models.append(dict(id=mid, name=name, url=g.group(0), tags=tag,
                               licence=lic.group(1) if lic else None,
                               author=who.group(1) if who else None,
                               animated=anim))
            time.sleep(PAUSE)
        got.append(dict(pack=bundle, models=len(models), files=models))
        lics = sorted({m['licence'] for m in models if m['licence']})
        print('  %-44s %4d models  %s' % (bundle, len(models), ', '.join(lics)))
    return got


def fetch_url(src, where):
    data = get(src['url'])
    n = unpack(data, where)
    if not n:
        os.makedirs(where, exist_ok=True)
        with open(os.path.join(where, src['url'].rsplit('/', 1)[-1]), 'wb') as f:
            f.write(data)
        n = 1
    print('  %6.1f MB %5d files' % (len(data) / 1e6, n))
    return [dict(pack=src['id'], url=src['url'], bytes=len(data), files=n)]


def fetch_github(src, where):
    """The newest release of a repository, picked by asset name.

    Not a `releases/latest/download/<name>` link, which is only stable while
    the name is: Pretendard's zip carries its version in the filename, so the
    guessed address 404s the day it is published and keeps 404ing quietly.
    """
    api = 'https://api.github.com/repos/%s/releases/latest' % src['url']
    rel = json.loads(get(api, binary=False))
    want = re.compile(src['asset'])
    hit = next((a for a in rel.get('assets', []) if want.fullmatch(a['name'])),
               None)
    if hit is None:
        raise SystemExit('%s: no asset matching %s in %s'
                         % (src['id'], src['asset'], rel.get('tag_name')))
    data = get(hit['browser_download_url'])
    n = unpack(data, where)
    print('  %s  %6.1f MB %5d files' % (rel.get('tag_name'), len(data) / 1e6, n))
    return [dict(pack=rel.get('tag_name'), url=hit['browser_download_url'],
                 bytes=len(data), files=n)]


def fetch_git(src, where):
    if os.path.isdir(os.path.join(where, '.git')):
        print('  already cloned')
        return [dict(pack=src['id'], url=src['url'], clone='existing')]
    subprocess.run(['git', 'clone', '--depth', '1', src['url'], where],
                   check=True)
    return [dict(pack=src['id'], url=src['url'], clone='depth-1')]


HOW = {'kenney': fetch_kenney, 'polypizza': fetch_polypizza,
       'url': fetch_url, 'git': fetch_git, 'github': fetch_github}


def one(src):
    where = os.path.join(ROOT, src['id'])
    print('%s  (%s, %s)' % (src['name'], src['author'], src['licence']))
    got = HOW[src['how']](src, where)
    os.makedirs(where, exist_ok=True)
    with open(os.path.join(where, 'SOURCE.json'), 'w') as f:
        json.dump(dict(id=src['id'], name=src['name'], author=src['author'],
                       licence=src['licence'], home=src['home'],
                       how=src['how'], fetched=time.strftime('%Y-%m-%d'),
                       packs=got), f, indent=1)
    return got


def status():
    print('root %s\n' % ROOT)
    for src in S.SOURCES:
        where = os.path.join(ROOT, src['id'])
        book = os.path.join(where, 'SOURCE.json')
        if os.path.exists(book):
            meta = json.load(open(book))
            files = sum(len(f) for _d, _s, f in os.walk(where))
            state = 'fetched %s, %d files' % (meta['fetched'], files)
        elif src['how'] == 'manual':
            state = 'by hand: ' + src['home']
        elif src['how'] == 'api':
            state = 'on demand, not bulk (see sources.py)'
        else:
            state = 'not fetched'
        print('%-16s %-12s %s' % (src['id'], src['licence'].split(' ')[0], state))


def main(argv):
    if not argv:
        return status()
    if argv[0] == '--all':
        want = [s for s in S.SOURCES if s['how'] in HOW]
    else:
        want = [s for s in S.SOURCES if s['id'] in argv]
        missing = set(argv) - {s['id'] for s in want}
        if missing:
            sys.exit('no such source: %s' % ', '.join(sorted(missing)))
        stuck = [s['id'] for s in want if s['how'] not in HOW]
        if stuck:
            sys.exit('%s is not fetchable from here; see sources.py'
                     % ', '.join(stuck))
    bad = []
    for src in want:
        # One source failing does not stop the others.  A register of eleven
        # places is a register of eleven things that can each be down, renamed
        # or rate-limited today, and an acquisition that stops at the first is
        # an acquisition nobody can leave running.
        try:
            one(src)
        except Exception as e:                          # noqa: BLE001
            bad.append((src['id'], e))
            print('  !! %s: %s' % (src['id'], e))
    print('\n%d of %d sources under %s' % (len(want) - len(bad), len(want), ROOT))
    if bad:
        sys.exit('failed: ' + ', '.join(i for i, _e in bad))


if __name__ == '__main__':
    main(sys.argv[1:])
