# Working on this repo

Abyss is a single-player browser RPG built on **AzerothCore**'s data and rules.
The plan lives in the [wiki](https://github.com/kyhsa93/abyss/wiki) — thirty-odd
pages of it, in Korean — and this file is only the part you need before
touching the code.

**Read the wiki first.** Nearly every question that starts "why is it done this
way" is answered there, usually with the measurement that settled it.

## What is here

```
pipeline/   bakes the world.  `measure_zone.py` says how big Elwynn Forest is
            and the other three take their bounds from what it found.  `synth_terrain.py` builds one out of AzerothCore
            alone and it is committed; `bake_terrain.py` reads a real client's
            and it is not.  `spawn_npcs.py` pulls the inhabitants out of
            AzerothCore, and there is only one of those because a creature's
            position does not depend on a client.  `bake_tiles.py`,
            `bake_sprites.py` and `bake_npcs.py` cut the art out of LPC and
            four animal packs
src/        the scene (`main.ts`, canvas 2D, no simulation yet), what the
            people of it say (`talk.ts`) and the controls a phone has
            (`touch.ts`).  The pipeline carries out the numbers of a
            conversation and `talk.ts` writes the sentences: that split is what
            keeps Blizzard's prose out and stops an NPC claiming something the
            data does not support
docs/       `art-prompts.md` — why each line of a prompt is in it, filed by what
            the engine does with it (`actor` / `prop` / `paired` / `ground`),
            then by how far the asset travels (`global` / `biome` / `zone`).
            Zone is a query and not a folder: seventeen of the forest's
            nineteen creature kinds are continental.  The prompts are Korean
            and the prose around them is English, the same split `talk.ts`
            makes — a prompt is pasted verbatim, so it stays in the language
            it is used in.  The document holds no prompt text: `npm run
            prompt <id>` prints it finished, because the same paragraph in two
            places is two paragraphs that drift
scripts/    checks that need a browser.  `padcheck.mjs` drives the touch
            controls with Chromium's own touch input over CDP; `viewcheck.mjs`
            asserts what the quarter view promises about geometry
public/art  the baked art (committed), including `kit/` — the renders, which
            are art this repository made rather than cut.  public/data is not
            (see below)
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
catch what checks do not — a hillside speckled with gravel because a threshold
was put on a signed gradient instead of its magnitude, for one.

**A geometric promise the camera makes gets a check too.** `npm run viewcheck`
asserts the projection is 2:1, that each of WASD walks the way the screen says,
that the scenery sorts back to front on `x + y`, and that the ground still hits
the refresh rate. None of those is visible in a still: a stick that walks you
north when you push up looks perfectly fine until you try to aim.

**And look at it on a phone.** `npm run dev` then `npm run padcheck` opens it
as an iPhone, drives it with real touch input and writes the screenshots to
`shots/`. Three things that were correct on a desktop were wrong there: a
readout seventy-two columns wide, a panel covering the person talking, and a
help line printed on top of the buttons.

**The art decides the projection — and the projection was overruled anyway.**
LPC's people are drawn facing up, down, left and right; the world is now drawn
in quarter view, where none of the four world directions is any of those. That
was asked for deliberately and it is what the repo does, but the bill is real
and it is paid in one place: `facing()` picks a pose from the *screen-space*
velocity rather than the world one, so the four world diagonals land exactly on
the four poses and the four world axes land exactly between two of them. No
amount of code fixes that; only an eight-direction sprite set would.

Everything else the projection touches is derived from two functions,
`screenX`/`screenY` and the inverse `worldAt`, and nothing else is allowed to
know how the camera works: the stick, the keys, the tile loop and the camera
lift all go through them. Two things that were quietly wrong for a while
because they did not: WASD, which walked you diagonally while the screen said
"up", and the talk panel's camera lift, which moved along world x and carried
the pair of you off to the right as the panel opened.

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

**Three kits do not agree about colour, and the drawn art owns the palette.**
`pipeline/grade_kit.py` runs after `render_kit.py` and pulls the renders' greens
onto the hue of the grass tiles the bake cuts — greens only, hue only. Greens
only because nothing else clashes: grading the whole wheel onto the ground's
palette was tried and it turned every roof in the village orange. Hue only
because the shading is the reason for rendering at all. The band's top is 195°
because the foliage was measured — the oak is 170, the bushes 165, the pines
sit exactly on 185 — and a band that stopped at 185 moved every leaf in the
wood except the pines'.

**A rendered piece is a third way of getting art, and the camera is not a
style choice.** `pipeline/render_kit.py` builds things out of a CC0 3D kit and
photographs them at the exact projection `src/main.ts` draws in — orthographic,
2:1, elevation `atan(0.5)` down the 45° diagonal — with the pixels-per-yard
derived from `PPY` rather than nudged. Any other elevation is a different
game's isometric and the sprite will not sit on this ground. It solves three
things a drawn sheet cannot: the projection is ours, every asset is lit
identically, and eight directions of a character is eight rotations rather than
eight drawings.

**Art carries its author.** The LPC tilesets ship a `MISSING:` section — tiles
nobody recorded the author of. A CC-BY tile with no author cannot be complied
with, so `pipeline/bake_tiles.py` refuses a piece that names none, and all
three credit files are generated from the tables the art is built from.

**A spritesheet's grid is measured, not divided.** Four of the animal packs
disagree about cell size and about which row faces which way — the wolf sheet
is two zones at 32x64 and 64x32, and the bear and the deer are ordered up,
left, *right*, down. Every wrong reading of a grid divides evenly, so the only
thing that catches it is cutting the sheet and looking at all four directions:
`bake_npcs.py` writes `npcs-contact.png` for exactly that.

## Finishing a change

`npm run check` is `tsc`, and it is fast. That is the whole gate right now,
which says more about how early this is than about the standard.

## Language

**Everything a player reads is Korean; everything a program reads is English.**
The ids the pipeline writes — `wolf`, `provisions`, `smithing`, `questgiver` —
are keys into the sprite atlas and into a JSON file that is already written, so
they never change shape; `src/talk.ts` holds the tables that turn them into
nouns. A missing entry shows the id, which is how you find it.

Korean is not English with the words swapped. Three things it costs:

  * a counter is a noun and takes a space after a numeral — 네 가지, not 네가지
    — but joins to digits, 46가지 (맞춤법 제43항)
  * a particle agrees with the syllable before it, 전사**를** against
    사냥꾼**을**, so it cannot be written into a sentence that has a lookup in
    it; `josa` in `talk.ts` picks it off the final consonant
  * a Hangul glyph is two columns where a Latin one is one, and the font a
    phone falls back to for Korean is not monospace at all — so nothing lines
    up by counting spaces. The readout is a CSS grid for that reason

## Style

Comments explain *why*, and the reason a thing is not something else. Most
comments here carry a mistake that was actually made — keep that: it is what
stops the mistake being made again. Docs and comments are in English; the
person who owns this repo is written to in Korean, and GitHub issues on it are
in Korean.
