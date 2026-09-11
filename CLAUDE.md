# Working on this repo

Abyss is a single-player browser RPG built on **AzerothCore**'s data and rules.
The plan lives in the [wiki](https://github.com/kyhsa93/abyss/wiki) — thirty-odd
pages of it, in Korean — and this file is only the part you need before
touching the code.

**Read the wiki first.** Nearly every question that starts "why is it done this
way" is answered there, usually with the measurement that settled it.

## What is here

```
pipeline/   reads the client's MPQ archives and bakes a slice of terrain
src/        the scene.  three.js, no simulation yet
public/     CC0 models (committed) and baked terrain (not committed)
```

The ICC raid prototype that used to be here is gone. It is not lost: tag
`icc-final`, plus `icc-longcold` for two bosses that only existed on a branch
and `icc-wip` for work that was uncommitted the day it was deleted.

## The rules that survived the rewrite

**Never read walkability off a picture.** A map says where a shape is. It does
not say what the shape *is*. The previous prototype lost a round to this: a
boss room measured correctly off the client's map tile turned out to be half
floor and half ice cliff. Read the server's numbers instead — `.adt` height
grids, the world database, the emulator's own boundary tables.

**A number tuned by hand twice is a number that should be derived.** If you
run a check, nudge a constant, and run it again — stop and make the constant
come out of the thing it is really a function of.

**Every geometric promise gets a check.** Anything that would be a bug a player
can see. The rule earned its place twice over: the tile index formula in the
plan was written `32 - floor(x/T)` instead of `floor(32 - x/T)`, and the wrong
tile is a file that exists, so nothing but a check on a known coordinate would
ever have caught it.

**Look at it.** The render path only runs in a browser, so a change to the
scene is not finished until it has been seen: `npx vite`, then drive it with
Playwright (`node_modules/playwright`, Chromium is installed). Screenshots
catch what checks do not — the ground being invisible because every triangle
was wound backwards, for one.

**Come back with a result, not with a step.** Fetch, measure, build, check,
look, fix — the whole loop, then report. Decide the details yourself and say
which way you decided; ask only when the answer changes what the game *is*.

## Two things that are not negotiable

**Nothing extracted from a WoW client enters this repository.** Not the bytes,
not a re-encoding of the bytes, not Blizzard's file paths. `pipeline/` is
committed; what it writes is in `.gitignore`, and the bake step throws away
model paths and keeps only a kind (`tree`, `rock`, `fence`). The wiki page is
**저작권과 배포 경계**.

**Blizzard's sentences are not used either.** Creature names, quest text,
gossip. The structure comes from AzerothCore; the words are ours.

## Finishing a change

`npm run check` is `tsc`, and it is fast. That is the whole gate right now,
which says more about how early this is than about the standard.

## Style

Comments explain *why*, and the reason a thing is not something else. Most
comments here carry a mistake that was actually made — keep that: it is what
stops the mistake being made again. Docs and comments are in English; the
person who owns this repo is written to in Korean, and GitHub issues on it are
in Korean.
