#!/usr/bin/env python3
"""Every place this game is allowed to take art from, written down once.

  python3 pipeline/sources.py            what there is, by what it is for
  python3 pipeline/sources.py licences    what each licence obliges us to do
  python3 pipeline/sources.py gaps        what nothing here covers

This is the register, not the art.  `fetch_assets.py` acquires what is listed
here and `catalogue.py` files what was acquired; nothing else in the pipeline
is allowed to name a download URL, because a URL in a bake script is a piece of
provenance nobody can find again.

**A source is only in here if its licence is written down and its author is
knowable.**  `bake_tiles.py` already refuses to ship a tile that names no
author — the LPC sets carry a `MISSING:` section of pieces nobody recorded, and
a CC-BY tile with no author cannot be complied with.  A register that listed
"some site" would put that back.

What the game needs, against what these cover, is the `NEEDS` table.  It is the
useful half of the file: a list of sources is a bookmark folder, and a list of
needs with sources under them is a plan.
"""
import sys

# how a source is acquired:
#   'url'        one file at a stable address
#   'kenney'     the asset page carries an absolute link to its zip
#   'polypizza'  a bundle page lists model ids; each model page has a glb
#   'git'        a repository
#   'github'     the newest release of a repository, by asset name
#   'manual'     a human has to click.  Listed anyway — an itch.io page behind
#                a download form is still a source, and leaving it out would
#                make this register lie about what exists.
SOURCES = [
    # --- 3D kits, which is what gets rendered at this game's projection -----
    dict(id='kenney', name='Kenney game assets', author='Kenney (Kenney.nl)',
         licence='CC0-1.0', how='kenney', home='https://kenney.nl/assets',
         gives=['prop', 'building', 'vegetation', 'rock', 'character', 'ui',
                'icon', 'cursor', 'audio', 'particle', 'tile'],
         packs=[
             # 3D kits, at the scale and style the renders already use
             'fantasy-town-kit', 'nature-kit', 'mini-forest', 'castle-kit',
             'medieval-rts', 'tower-defense-kit', 'graveyard-kit',
             'modular-cave-kit', 'mini-dungeon', 'mini-arena',
             'mini-characters', 'blocky-characters', 'furniture-kit',
             'food-kit', 'survival-kit', 'pirate-kit',
             # 2D, for the parts of a game that are not in the world
             'ui-pack', 'ui-pack-rpg-expansion', 'ui-pack-adventure',
             'fantasy-ui-borders', 'cursor-pack', 'input-prompts',
             'game-icons', 'board-game-icons', 'particle-pack', 'light-masks',
             'prototype-textures',
             'roguelike-rpg-pack', 'roguelike-caves-dungeons',
             'roguelike-characters', 'tiny-dungeon', 'tiny-town',
             # sound
             'rpg-audio', 'impact-sounds', 'ui-audio', 'music-jingles',
         ]),
    dict(id='polypizza', name='Poly Pizza (Quaternius and others)',
         author='per model, recorded at fetch', licence='CC0-1.0 / CC-BY-3.0',
         how='polypizza', home='https://poly.pizza',
         gives=['creature', 'character', 'prop', 'building', 'vegetation',
                'weapon', 'item'],
         # Bundles, not the whole site.  These are the fantasy-shaped ones; the
         # animated creature packs are the reason this source is here at all,
         # since nothing else free has a rigged wolf with a bite in it.
         packs=[
             'Ultimate-Monsters-Bundle-5oyGWAmOB6',
             'Animated-Enemies-a53OJwHrhh',
             'Animated-Animal-Pack-ILAPXeUYiS',
             'Farm-Animal-Pack-1kUvRTPLzT',
             'Animated-Men-Pack-DAC9SDgMQT',
             'Animated-Women-Pack-HHSKxnk1mY',
             'Ultimate-Modular-Men-Pack-ZiH8muWqwQ',
             'Ultimate-Modular-Women-Pack-aCBDXDdTNN',
             'Ultimate-RPG-Items-Bundle-h8mhlZ0dG8',
             'Medieval-Village-Pack-NsHhjhlrfY',
             'Modular-Dungeons-Pack-HaFPqhAp3w',
             'Stylized-Nature-MegaKit-T34GZFA0fm',
             'Ultimate-Stylized-Nature-Pack-zyIyYd9yGr',
             'Ultimate-Fantasy-RTS-nSDjmACoSU',
             'Farm-Buildings-Bundle-ppbnhEfNEt',
             'Furniture-Pack-pgvx8Zkq8v',
             'Ultimate-House-Interior-Pack-2SXnFbwFzm',
             'Ultimate-Food-Pack-h3WC1gyRb4',
             'Survival-Pack-XzvQPP0yWB',
         ]),
    dict(id='modular-rpg', name='Modular RPG Characters',
         author='System G6 (Qoma)', licence='CC0-1.0', how='url',
         home='https://opengameart.org/content/modular-rpg-characters',
         url='https://opengameart.org/sites/default/files/modular_rpg_characters.7z',
         gives=['character', 'armour'],
         note='the player paperdoll; fifty actions, seven slots, two bodies'),

    # --- 2D, for everything that is not in the world ------------------------
    dict(id='game-icons', name='game-icons.net', author='Lorc, Delapouite and '
         'contributors (named per icon in the archive)', licence='CC-BY-3.0',
         how='url', home='https://game-icons.net',
         url='https://game-icons.net/archives/svg/zip/ffffff/transparent/'
             'game-icons.net.svg.zip',
         gives=['icon'],
         note='four thousand SVG icons, which is what a spellbook and a bag '
              'are made of.  CC-BY: the author is in the path and has to stay '
              'there'),
    dict(id='lpc', name='Universal LPC Spritesheet Generator',
         author='many, listed in CREDITS.csv', licence='CC-BY-SA-3.0 / GPL-3.0',
         how='git', home='https://github.com/LiberatedPixelCup/'
                         'Universal-LPC-Spritesheet-Character-Generator',
         url='https://github.com/LiberatedPixelCup/'
             'Universal-LPC-Spritesheet-Character-Generator.git',
         gives=['character', 'armour', 'weapon', 'tile'],
         note='768 layered garments on one body.  Four screen directions, '
              'which is the reason it lost the player to a render'),

    # --- surfaces and skies -------------------------------------------------
    dict(id='ambientcg', name='ambientCG', author='Lennart Demes',
         licence='CC0-1.0', how='api', home='https://ambientcg.com',
         url='https://ambientcg.com/api/v2/full_json',
         gives=['texture'],
         note='PBR materials for anything rendered, not for the drawn ground'),
    dict(id='polyhaven', name='Poly Haven', author='Poly Haven contributors',
         licence='CC0-1.0', how='api', home='https://polyhaven.com',
         url='https://api.polyhaven.com',
         gives=['texture', 'hdri'],
         note='an HDRI is how a render gets sky light that is not two suns'),

    # --- letters ------------------------------------------------------------
    dict(id='pretendard', name='Pretendard', author='길형진 (orioncactus)',
         licence='OFL-1.1', how='github',
         home='https://github.com/orioncactus/pretendard',
         url='orioncactus/pretendard', asset=r'Pretendard-[\d.]+\.zip',
         gives=['font'],
         note='everything a player reads here is Korean, and a Latin game font '
              'has no 한글 in it at all'),

    # --- listed, not fetchable ---------------------------------------------
    dict(id='quaternius-site', name='Quaternius (full packs)',
         author='Quaternius', licence='CC0-1.0', how='manual',
         home='https://quaternius.com',
         gives=['creature', 'character', 'prop', 'building', 'vegetation'],
         note='the same art as `polypizza` but packaged, with the .blend '
              'sources and every LOD.  Behind an itch.io download form'),
    dict(id='oga', name='OpenGameArt (the rest of it)', author='many',
         licence='CC0-1.0 / CC-BY-3.0 / CC-BY-SA-3.0 / GPL', how='manual',
         home='https://opengameart.org',
         gives=['creature', 'tile', 'icon', 'audio', 'vfx'],
         note='no bulk index worth trusting; each piece is its own decision '
              'and its own licence, and that is the point of the site'),
    dict(id='freesound', name='Freesound', author='many', licence='CC0-1.0 / '
         'CC-BY-4.0', how='manual', home='https://freesound.org',
         gives=['audio'],
         note='about half of it is CC0; the API needs a key and a login'),
]

# What the game needs, and which of the above covers it.  A need with nothing
# under it is the useful line in this table.
NEEDS = {
    'ground tiles': ['lpc'],
    'vegetation': ['kenney', 'polypizza'],
    'rock and cliff': ['kenney', 'polypizza'],
    'buildings': ['kenney', 'polypizza'],
    'props and clutter': ['kenney', 'polypizza'],
    'dungeon and cave': ['kenney', 'polypizza'],
    'player body and gear': ['modular-rpg', 'polypizza'],
    'weapons in hand': ['polypizza', 'kenney', 'lpc'],
    'townsfolk and humanoids': ['polypizza', 'kenney', 'lpc'],
    'beasts and monsters': ['polypizza'],
    'critters and livestock': ['polypizza', 'lpc'],
    'spell and item icons': ['game-icons', 'kenney'],
    'interface frames': ['kenney'],
    'cursors': ['kenney'],
    'spell effects': ['kenney'],
    'sound': ['kenney', 'freesound'],
    'Korean type': ['pretendard'],
}


def by_id(sid):
    return next((s for s in SOURCES if s['id'] == sid), None)


def main(argv):
    what = argv[0] if argv else 'needs'
    if what == 'licences':
        for lic in sorted({s['licence'] for s in SOURCES}):
            who = [s['id'] for s in SOURCES if s['licence'] == lic]
            print('%-34s %s' % (lic, ', '.join(who)))
        print('\nCC0 asks for nothing.  CC-BY and CC-BY-SA ask for the author'
              '\nby name, and this repository writes them into art/*-CREDITS.md'
              '\nrather than a README nobody regenerates.')
        return
    if what == 'gaps':
        for need, who in NEEDS.items():
            live = [s for s in who if (by_id(s) or {}).get('how') != 'manual']
            if not live:
                print('%-26s nothing fetchable: %s' % (need, ', '.join(who)))
        return
    for need, who in NEEDS.items():
        print('%-26s %s' % (need, ', '.join(who)))
    print()
    for s in SOURCES:
        n = len(s.get('packs', ()))
        print('%-16s %-10s %-22s %s'
              % (s['id'], s['how'], s['licence'],
                 ('%d packs, ' % n if n else '') + ', '.join(s['gives'])))


if __name__ == '__main__':
    main(sys.argv[1:])
