# Prompts for generating the art

What to ask a generator for, how the asks are filed, and — the part worth
keeping rather than pasting into a chat window — why each line of a prompt is
in it. Every constraint below is there because getting it wrong cost this
repository a round.

The prompts are Korean and the prose around them is English. That is the split
`src/talk.ts` already makes: the words a person reads are one thing, the string
a machine consumes is another. A prompt is pasted verbatim, so it stays in the
language it is used in.

## How a prompt is filed

One primary axis and two tags. The primary axis is not negotiable — it decides
the *shape* of the sheet, and two classes cannot share one, because a ground
tile wants a camera pointing straight down and an actor eats sixteen cells on
its own.

### Primary: what the engine does with it

| class | sheet shape | per sheet | pipeline | what to check |
|---|---|---|---|---|
| `actor` | 8 directions × 2 rows | **one subject** | `render_actor` → `pack_actor` | direction order, foot line, does the walk read as a walk |
| `prop` | grid, one view each | ~20 | `bake_tiles` `RENDERED` | contact line, alpha margin |
| `paired` | the same thing, two ways round | in pairs | as `prop`, plus `across` | one picture along x, a different one along y |
| `ground` | seamless squares, camera straight down | ~12 | `bake_tiles` `GROUND` | **tile it 4 × 4 and look** |
| `ui` | no camera, no light | free | — | not built yet |

`paired` is its own class rather than a note on `prop` because a fence along x
and a fence along y are two different pictures, not one picture turned. Wired
the other way round, a field reads as a row of gates standing across their own
fence line — which is what this repository shipped for one commit.

### Tag one: how far it travels

This is the tag that decides the **order to generate in**, because it decides
how many times an asset pays for itself.

| tag | meaning | examples |
|---|---|---|
| `global` | anywhere on the continent | townsfolk, wolf, bear, barrel, cart |
| `biome` | one climate | broadleaf oak, meadow ground, timber-framed house |
| `zone` | one place | kobold, a named boss |

**Generate every `global` first, then `biome`, and `zone` last.** The other way
round means starting over with each new zone.

### Tag two: which biome, which is to say which palette

The only line of the block that changes: `temperate`, `arid`, `dark`, `snow`,
`volcanic`, `swamp`. Everything else — camera, light, background, scale — is
identical across all of them.

It only attaches to ground, vegetation and buildings. **A barrel has no
biome.** A barrel in the desert is a barrel, so nothing tagged `global` needs
a palette variant, and that is most of the list.

## The player is not on this list

Nineteen subjects and not one of them is the player, which is deliberate. A
townsman never changes his clothes, so his linen shirt belongs in his prompt
and there is nothing to take off. The player equips gear, and that makes him a
different kind of asset — not a harder one.

Equipment means the shirt is a separate image from the body, lining up with it
pixel for pixel in all eight directions and every frame of every clip. **No
prompt gets that.** A generator has no memory between calls, which is the same
fact that makes sheet 1 an attached reference — and a reference gets you a
similar person, not the same one. The second call's shirt does not fit the
first call's body, and no amount of describing it does.

So the player is rendered: `pipeline/render_paperdoll.py` photographs one rig
one slot at a time, and layers of the same rig in the same pose under the same
camera cannot drift. Occlusion comes free with it — the bare body is a holdout
while any other layer is photographed, so an arm swinging across a breastplate
cuts an arm-shaped hole in it, and that is the per-direction ordering table a
drawn paperdoll has to keep and this one does not.

## Zone is not an axis

It is a query, not a folder. Counted out of AzerothCore's `creature` table
across the whole of map 0, against the forest's own bounds:

| kind | in Elwynn | on the rest of the continent |
|---|---|---|
| townsfolk | 980 | **13,664** |
| guard | 130 | 719 |
| boar | 128 | 572 |
| bear | 47 | 488 |
| wolf | 233 | 426 |
| bandit | 200 | 424 |
| skeleton | 13 | 348 |
| cat | 18 | 340 |
| murloc | 162 | 313 |
| spider | 25 | 310 |
| rabbit | 90 | 224 |
| ghost | 29 | 183 |
| cow | 49 | 103 |
| horse | 49 | 93 |
| chicken | 24 | 85 |
| sheep | 20 | 61 |
| **kobold** | 199 | 42 |
| **deer** | 59 | 23 |

Seventeen of nineteen are continental; only the kobold and the deer lean this
way. File by zone and you draw the same townsman forty times.

What that costs, in sheets: **Elwynn is 24, of which 18 are `global`, 5 are
`biome:temperate` and 1 is `zone`** — `npm run prompt list` is the current
count and this sentence is not, so trust the command. A second temperate zone
is six to eight.
Westfall wants dry ground, dry vegetation and its own gnolls and coyotes;
Duskwood wants a dark palette and undead; Stormwind wants stone buildings and
paved ground and no new people at all.

The honest edge of this: AzerothCore has **5,151 creature names the classifier
has no kind for** — totems, elementals, drakes, kodos, raptors, gryphons,
crocolisks. A continent is not 24 sheets. A temperate forest is.

## The sheet is the unit of consistency

Anything that has to match has to be generated together. Anything in a
different sheet **will** drift — three model kits went into the last round and
none of them agreed about the colour of a leaf, which cost a whole pass
(`pipeline/grade_kit.py`); and the first character sheet that came back had its
three rows at 158, 146 and 141 pixels, a twelve per cent scale drift inside one
image.

So the real question when filing an asset is not *what is it* but **what does
it have to look like the same as**. Three kinds of fence in one sheet, because
a boundary made of three that disagree is a mess. Six townsfolk across two
sheets is fine, because they are supposed to differ.

## Naming

The axes go in the filename, so the pipeline can branch on it without a table:

```
actor_global_townsman_male
actor_zone_kobold_miner
prop_global_barrel
paired_biome_temperate_fence_rail
ground_temperate_meadow
prop_biome_temperate_oak
```

This is what the `kit_` prefix does today — it means "rendered rather than
cut" — done with three fields instead of one.

## Getting the text

**`prompts/` holds all of them, finished, in `order.txt` order.** Paste one and
go; nothing needs running. `pipeline/make_prompt.py` is what writes them:

```
npm run prompt list                 what there is
npm run prompt townsman             one, to stdout
npm run prompt -- --all prompts/    rewrite the committed set
npm run promptcheck                 are those files still what it writes?
```

A flag needs its own `--` through npm, which eats the first one for itself.

Nothing in *this* document is meant to be pasted: a prompt assembled by hand is
a prompt that drifts, and the block is only worth having if every sheet carries
it identically. `prompts/` is a second copy of that text and would drift the
same way, which is what `promptcheck` is for — the files are allowed to exist
because something compares them to the script.

## What the block says, and why each paragraph is in it

**카메라.** `src/main.ts` projects with `x - y` on the horizontal and `(x + y)`
halved on the vertical. That is a 2:1 diamond, and a 2:1 diamond is an
orthographic camera at an elevation of `atan(0.5)` — 26.57 degrees — looking
down the 45 degree diagonal. At any other elevation the sprite does not sit on
this ground, and no amount of scaling fixes it. The `ground` sheets replace
this paragraph outright: a tile is drawn from straight above.

**조명.** One key light, on the camera's own side. A 45 degree orthographic
camera sees exactly two faces of anything box-shaped, and the first building
rendered in this repository came out as a black silhouette with lit window
frames because the key was on the far side. The `ground` sheets replace this
paragraph too — a rim light repeated across a lattice is a lattice of rim
lights, which is a pattern and not a field.

**팔레트.** The one line that moves, and it moves as a whole line: it is the
biome tag. Four are written out. The `temperate` values are measured off the
reference concept art rather than invented.

**배경.** Transparent, and no baked shadow. The scene draws its own contact
shadow, sized off the sprite; a painted one doubles it and, worse, lands inside
the alpha bounding box and moves the foot line.

**축척.** One size and one foot line across every cell. `pipeline/pack_actor.py`
measures the lowest opaque row across the whole sheet and writes it in as
`anchor`; if the cells disagree with each other that number means nothing and
the character bobs as it walks. The first character sheet that came back had
its three rows at 158, 146 and 141 pixels.

**금지.** The negatives that keep coming back otherwise: flat cel shading,
low-poly, outlines, perspective.

## What each class adds

**`actor`** — eight directions, named in a stated order, and one sheet per
group of clips. Eight and not four because four leaves the pose 45 degrees out
half the time, which is the compromise this art direction exists to end; in a
stated order because five views at uneven spacing cannot be turned into eight.

**The whole action vocabulary is decided before anything is drawn.**
`pipeline/actions.py` is the catalogue — 40 clips, 69 frames — and it is
written out in full rather than grown a clip at a time, because adding one
later does not cost a row. It costs the subject: generating the same character
twice gets you two characters, and an image model has no memory between calls.
`npm run actions` prints it.

Three levels. A **clip** is one action and a sentence for each frame it takes —
a walk is four because fewer slides, a swing is three because a wind-up and a
follow-through are what make it land. A **group** collects the clips that
belong together: `base`, `melee`, `cast`, `ranged`, `state`, `social`. A
**role** says which groups a kind of creature has at all — a chicken has no
`melee` clips, because a chicken does not swing at anything and a row nobody
plays is a row of cells taken from the ones somebody does.

**A sheet is not a group.** A generator hands back one canvas whatever is asked
of it, so filing by group threw most of a canvas away every time a group came
to five rows — and paying for a canvas is the same act as typing a prompt. The
clips are packed instead, in order, up to a row budget, never splitting a clip
across two sheets. The budget is the same question as how tall an image the
tool will return: a cell wants 128 pixels, so 16 rows is 2,048 tall.

| `--rows` | image | sheets |
|---|---|---|
| 12 | 1024 × 1536 | 60 |
| **16** (default) | 1024 × 2048 | **52** |
| 24 | 1024 × 3072 | 36 |

Raise it as far as the tool will go. The count falls with it and nothing is
lost, because the rows are the same rows.

| role | groups | cells |
|---|---|---|
| `human` | all six | 488 |
| `humanoid` | base, melee, cast, state | 280 |
| `beast` | base, melee, state | 192 |
| `livestock` | base, state | 136 |
| `critter` | base, state | 88 |

Nineteen subjects, 4,648 cells, and as few sheets as the tool's canvas allows.

**Sheet 1 of any subject is generated first and is the identity reference for
the rest.** The packing is in order and `base` comes first, so sheet 1 always
carries the stand and the walk — the two poses everything else has to agree
with. Every later sheet names it and is generated with it attached. That is the
only thing holding a subject together across four calls.

**`prop`** — a grid at one stated scale, with a named reference object, because
"one scale" means nothing unless something in the picture fixes it.

**`paired`** — every object twice, once along each screen diagonal. Not one
picture turned.

**`ground`** — seamless squares with room between them, and nothing in a tile
big enough to notice when it repeats. Tile every one 4 × 4 before believing it.
A tile that does not repeat is a tile you find out about at 4 × 4 and never
before.

## How big anything is on screen

`PPY = 24` pixels to the yard, which is the constant `src/main.ts` draws with.
Horizontal extent is `yards × 24`; height is `yards × 24 × cos(26.57°)`, which
is `yards × 21.5`.

| | yards | pixels |
|---|---|---|
| one ground tile | 1.33 | a 64 × 32 diamond, cut as a 32 × 32 square |
| a person | 1.8 tall | 39 wide, 67 tall including the head |
| a storey, to the eaves | 2 | 43 |
| a fence section | 2 long | 48 |
| an oak | 5 tall | 107 |

A source cell wants to be two or three times the final size, so an `actor` cell
is 150–200 pixels and a sheet of sixteen of them is upwards of 1,600 across.
That arithmetic is why one subject is one sheet: nineteen creatures at sixteen
cells each is 304 cells, and 304 cells at 200 pixels does not fit in anything a
generator will hand back.

## Do one before doing twenty-four

Take `townsman` and nothing else. Put it through the whole pipeline: cut, pack,
atlas, and walk him around in the game. Then look at whether the eight
directions are in the order the sheet claims, whether the foot line holds while
he walks, and whether the walk reads as a walk.

Everything this repository got wrong about rendered characters was invisible
until one of them was in the game: eight directions that turned out to be eight
copies of one pose, a cast rendered at 39% of the size the arithmetic asked
for, and a standing frame that was the bind pose with its arms straight out.
None of those threw an error and all of them exited cleanly.
