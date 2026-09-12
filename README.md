# Abyss

A single-player browser RPG built on **AzerothCore**'s data and rules — the
world and the arithmetic come from the emulator, the art and the words are our
own.

Right now it draws one thing: a slice of Elwynn Forest — its terrain read out of
a WoW 3.3.5a client, its trees standing where the client says they stand, drawn
in Liberated Pixel Cup pixel art and walked around with WASD.

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

The page prefers that when it is there, and says which one it is drawing.
Against the client's own grid the interpolation is out by a **median of
2.5 yards** — right where people stand, and wrong where nobody does, which is
the honest shape of what a server knows about a floor.

## What is not here

**Nothing taken from a WoW client.** `pipeline/` is committed, its output is
not. The bake step drops Blizzard's model paths and keeps only a kind, so even
the scene description carries none of it. Blizzard's text — creature names,
quest bodies — is not used either.

The art is Liberated Pixel Cup — the tilesets and the character parts, cut and
composited by `pipeline/`. It is variously CC-BY-SA 3.0, GPL 3.0 and OGA-BY
3.0, **and those carry**: see `art/LPC-CREDITS.md` and
`art/LPC-TERRAIN-CREDITS.md`, both generated from the tables the art is built
from. Nothing is used from the tilesets' `MISSING:` section — a CC-BY tile
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
