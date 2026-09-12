# Abyss

A single-player browser RPG built on **AzerothCore**'s data and rules — the
world and the arithmetic come from the emulator, the art and the words are our
own.

Right now it draws one thing: **the whole of Elwynn Forest** in quarter view —
1,967 by 2,767 yards of it, the bounds measured off the client's own area map
rather than chosen. Its terrain is read out of a WoW 3.3.5a client, its 12,451
trees, fences and buildings stand where the client says they stand, and 1,884
inhabitants stand where the world database puts them. Walked around with WASD.
**356 of them will talk to you**: press **E**.

On a phone it is a thumb stick and a button. The stick appears wherever you put
your thumb down, two fingers pinch the camera, and the button lights up when
there is somebody close enough to hear you.

**The game is in Korean and the code is not.** `wolf`, `provisions`,
`questgiver` come out of the pipeline and stay English for their whole life,
because they are keys — into the sprite atlas, into a JSON file that is already
written — and `src/talk.ts` looks the Korean up from them. Comments and these
documents are English; everything a player reads is not.

What they say is assembled from what the database says they can *do* — how many
lines a trader keeps and what the cheapest and dearest of them cost, how many
lessons a teacher has and from what level, what an errand actually wants dead or
fetched — so nobody can claim something the data does not support. None of the
sentences are Blizzard's; see below.

## Run it

```bash
npm install
npm run dev
```

That is the whole of it. The world it opens on is built out of AzerothCore and
nothing else: the height comes from interpolating the ground beneath every
creature and object the world database records in the slice, about five
thousand of them, and the scenery is scattered by us.

If you own a 3.3.5a client you can lay the real thing over it:

```bash
pip3 install mpyq
npm run bake -- ~/path/to/wow-3.3.5a public/data
```

The page prefers that when it is there, and says which one it is drawing. The
inhabitants are not behind that switch: where a wolf stands is a row in
`creature` whether or not a client is installed, so there is one spawn file and
it is committed.
Against the client's own grid the interpolation is out by a **median of
2.5 yards** — right where people stand, and wrong where nobody does, which is
the honest shape of what a server knows about a floor.

## What is not here

**Nothing taken from a WoW client.** `pipeline/` is committed, its output is
not. The bake step drops Blizzard's model paths and keeps only a kind, so even
the scene description carries none of it. Blizzard's text — creature names,
quest bodies — is not used either.

**Blizzard's words, including creature names.** The kind of a spawn — `wolf`,
`kobold`, `murloc` — is picked by reading `creature_template.name` in the
pipeline and then dropping it; the kind words are ours, and the name never
reaches the browser.

**The scenery is not drawn at all.** `pipeline/render_kit.py` builds it out of
three CC0 model kits — [Fantasy Town](https://kenney.nl/assets/fantasy-town-kit),
[Nature](https://kenney.nl/assets/nature-kit) and
[Mini Forest](https://kenney.nl/assets/mini-forest), about 500 models between
them — and photographs each piece in headless Blender at the camera
`src/main.ts` projects with: orthographic, 2:1, elevation `atan(0.5)` down the
45° diagonal. Trees, bushes, rocks, fences, buildings, carts, stalls, logs,
grass, flowers and mushrooms all come from there.

So are the people who have a model — the hero, the townsfolk, the guards and
the bandits. `pipeline/render_actor.py` turns a rigged
CC0 character eight times and photographs each — so the hero, the townsfolk,
the guards and the bandits face the way they are going, which four drawn poses
in a quarter view cannot. The kobolds, the murlocs and every animal keep the
drawn sheet: there is no CC0 model set for fantasy monsters or forest animals
in this style, and that was looked for rather than assumed.

The art is Liberated Pixel Cup — the tilesets, the character parts and four
animal packs from OpenGameArt, cut and composited by `pipeline/`. It is
variously CC-BY-SA 3.0, CC-BY 4.0, GPL 3.0 and OGA-BY 3.0, **and those carry**:
see `art/LPC-CREDITS.md`, `art/LPC-TERRAIN-CREDITS.md` and
`art/NPC-CREDITS.md`, all generated from the tables the art is built from. Nothing is used from the tilesets' `MISSING:` section — a CC-BY tile
whose author nobody recorded cannot be complied with.

## The plan

In the [wiki](https://github.com/kyhsa93/abyss/wiki). Thirty-odd pages, in
Korean, with the measurements that settled each decision. Start at the home
page; **저작권과 배포 경계** and **수직 슬라이스** are the two that constrain
everything else.

## History

This repository held a deterministic Icecrown Citadel raid prototype for about
four hundred commits. It was replaced, not lost — see tags `icc-final`,
`icc-longcold`, `icc-wip`.
