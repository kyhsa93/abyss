#!/usr/bin/env python3
"""The words of a quest, which this repository spent a year refusing to carry.

  python3 pipeline/prose.py --source        # what there is to translate
  python3 pipeline/prose.py --check         # what is missing or has gone stale

**This is a reversal, and it is the owner's.**  `CLAUDE.md` said Blizzard's
sentences do not enter here and `quests.py`'s own docstring said the same in
more detail: *not the title, not the description, not a word of the dialogue*.
Issue 190 records the decision that overturned it — *"퀘스트는 문구를 조금씩
수정해서 사용하는 방향으로 가면 됨"* — so the rule now has three exceptions
rather than one, and the wiki page 저작권과 배포 경계 is where they are argued.

What that decision actually asks for is **a translation**, and measuring it is
half of what this file is for.  `quest_template_locale` has seven languages in
it and **koKR is not one of them**: in this expansion a quest's words are sent
by the server, so they are in no locale archive the client ships.  The names
that come out of `.dbc` files — a zone, a race, a class — have Korean and the
quest text does not, because they come from different places.

So three rules, and each one is a mistake this repository has already made
somewhere else:

  * **The English is never committed and never shipped.**  What is committed
    is the Korean, in `prose/quests.ko.json`, which is a written thing rather
    than a copied one.  The source stays where it is — a translation that
    keeps its original beside it is two copies of somebody else's prose.
  * **A translation knows what it was translated from.**  Each entry carries
    the hash of the English it came from, so the day AzerothCore changes a
    quest's text this says which lines have gone stale instead of shipping a
    Korean paragraph for an English one that no longer exists.  A second copy
    that cannot notice it has drifted is the shape this repository keeps
    finding.
  * **A quest with no prose falls back rather than going blank.**  Eight of
    the slice's quests have no `QuestCompletionLog` at all and one has no
    `LogDescription`; `src/talk.ts` still builds those from the shape, which
    is what it did for all of them until now.
"""
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

#: Where the Korean lives.  Beside the repository rather than inside the bake,
#: because it is **written** and everything in `public/world` is generated: a
#: hand-written file in a directory a bake overwrites is a file somebody loses.
KO = os.path.join(os.path.dirname(HERE), 'prose', 'quests.ko.json')

#: The six columns the issue names, and our word for each.
#:
#: `AreaDescription` is not among them and that is a measurement rather than an
#: omission: it is three characters long on average across this slice, because
#: it is the *zone* name and this game has its own words for those already.
FIELDS = [
    ('title', 'quest_template', 'LogTitle'),
    ('short', 'quest_template', 'LogDescription'),
    ('body', 'quest_template', 'QuestDescription'),
    ('doing', 'quest_template', 'QuestCompletionLog'),
    ('reward', 'quest_offer_reward', 'RewardText'),
    ('waiting', 'quest_request_items', 'CompletionText'),
]


def unquote(v):
    """One SQL string literal as the text inside it.

    `spawn_npcs.split` hands back the literal rather than the value, which
    nothing here had ever noticed because every column this pipeline reads is
    a number.  The first prose column read straight came out wearing its own
    quotes and every apostrophe in it doubled.
    """
    if not v or v == 'NULL':
        return ''
    if len(v) >= 2 and v[0] == "'" and v[-1] == "'":
        v = v[1:-1]
    return (v.replace("\\'", "'").replace('\\"', '"')
            .replace('\\r', '').replace('\\n', '\n')
            .replace('\\\\', '\\'))


def source(base, want):
    """`{id: {our word: the English}}` for the quests this game ships.

    Read and never written down.  The caller translates it and `check` holds
    the translation to the hash of what it was made from.
    """
    from spawn_npcs import columns, rows, split
    out = {}
    for table in sorted({t for _k, t, _c in FIELDS}):
        path = os.path.join(base, table + '.sql')
        if not os.path.exists(path):
            continue
        col = columns(path)
        mine = [(key, c) for key, t, c in FIELDS if t == table]
        for line in rows(path):
            f = split(line)
            try:
                i = int(f[col['ID']])
            except (ValueError, KeyError, IndexError):
                continue
            if i not in want:
                continue
            for key, c in mine:
                if c not in col:
                    continue
                v = unquote(f[col[c]])
                if v:
                    out.setdefault(i, {})[key] = v
    return out


def fingerprint(one):
    """What a quest's English hashes to, so a translation can go stale loudly.

    Over the fields in `FIELDS` order and not over the dict, because a hash
    that depends on the order a dict happened to be built in is a hash that
    changes when nothing has.
    """
    h = hashlib.sha256()
    for key, _t, _c in FIELDS:
        h.update(b'\x00')
        h.update(one.get(key, '').encode('utf-8'))
    return h.hexdigest()[:16]


def load():
    """The Korean, or an empty book if nobody has written any yet."""
    if not os.path.exists(KO):
        return {}
    with open(KO) as f:
        return json.load(f)


def shipped(base, want):
    """`({id: {word: Korean}}, report)` — what the page gets, and what is short.

    A quest whose Korean is missing, or was made from English that has since
    changed, is **left out of the shipped file** rather than sent as it is:
    `talk.ts` builds the sentence from the shape when there is no prose, which
    is what it did for every quest until this file existed, and a stale
    paragraph is worse than a built one because nothing on the screen says so.
    """
    have = load()
    src = source(base, want)
    out, missing, stale, thin = {}, [], [], {}
    for i in sorted(want):
        one = src.get(i, {})
        mine = have.get(str(i))
        if not mine:
            missing.append(i)
            continue
        if mine.get('src') != fingerprint(one):
            stale.append(i)
            continue
        # **Every field the original wrote, and no more.**  A translation that
        # is missing a paragraph the English has is a screen with a hole in
        # it, and one that *invents* a field the English never had is prose
        # this repository wrote and called a translation.  Both are named.
        short = [k for k in one if not mine.get(k)]
        extra = [k for k in mine if k != 'src' and k not in one]
        if short or extra:
            thin[i] = {'missing': short, 'invented': extra}
        out[str(i)] = {k: v for k, v in mine.items() if k != 'src'}
    return out, {'missing': missing, 'stale': stale, 'thin': thin}


def main(acore, out):
    """Print what there is to translate, or what has gone stale.

    `--source` writes the English to standard output as JSON so it can be
    translated somewhere else; it is not written to a file, because a file of
    it in this repository is the thing the first rule above refuses.
    """
    base = os.path.join(acore, 'data/sql/base/db_world')
    made = os.path.join(out, 'quests.json')
    if not os.path.exists(made):
        sys.exit('no quests.json — bake the quests first')
    with open(made) as f:
        want = {q['id'] for q in json.load(f).get('quests', [])}
    src = source(base, want)
    if '--source' in sys.argv:
        json.dump({str(i): {**one, 'src': fingerprint(one)}
                   for i, one in sorted(src.items())},
                  sys.stdout, ensure_ascii=False, indent=1)
        return
    _got, report = shipped(base, want)
    print(f'{len(want)} quests, {len(want) - len(report["missing"])} with '
          f'Korean prose')
    if report['missing']:
        print('  no prose yet: ' + ', '.join(str(i) for i in report['missing']))
    if report['stale']:
        print('  the English moved under these: '
              + ', '.join(str(i) for i in report['stale']))


if __name__ == '__main__':
    main(os.path.expanduser(sys.argv[1] if len(sys.argv) > 1
                            and not sys.argv[1].startswith('--')
                            else '~/src/azerothcore-wotlk'),
         'public/world')
