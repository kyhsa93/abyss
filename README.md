# Abyss

A single-player browser RPG built on **AzerothCore**'s data and rules — the
world and the arithmetic come from the emulator, the art and the words are our
own.

Right now it draws one thing: a slice of Elwynn Forest, its terrain read out of
a WoW 3.3.5a client and its four thousand trees standing where the client says
they stand, rendered with CC0 models.

## Run it

```bash
npm install
pip3 install mpyq
npm run bake -- ~/path/to/wow-3.3.5a public/data
npm run dev
```

Without the bake step the page has nothing to draw. That is the honest state of
the project: the plan is for the game to be complete without a client, and the
path that fills the gap is not built yet.

## What is not here

**Nothing taken from a WoW client.** `pipeline/` is committed, its output is
not. The bake step drops Blizzard's model paths and keeps only a kind, so even
the scene description carries none of it. Blizzard's text — creature names,
quest bodies — is not used either.

The art is Kenney's *Nature Kit* and Quaternius's *RPG Characters*, both CC0.
See `public/models/CREDITS.md`.

## The plan

In the [wiki](https://github.com/kyhsa93/abyss/wiki). Thirty-odd pages, in
Korean, with the measurements that settled each decision. Start at the home
page; **저작권과 배포 경계** and **수직 슬라이스** are the two that constrain
everything else.

## History

This repository held a deterministic Icecrown Citadel raid prototype for about
four hundred commits. It was replaced, not lost — see tags `icc-final`,
`icc-longcold`, `icc-wip`.
