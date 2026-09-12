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

`pipeline/make_prompt.py` holds it and prints it finished. Nothing in this
document is meant to be pasted: a prompt assembled by hand is a prompt that
drifts, and the block is only worth having if all twenty-four sheets carry it
identically.

```
python3 pipeline/make_prompt.py list          what there is
python3 pipeline/make_prompt.py townsman      one, to stdout
python3 pipeline/make_prompt.py --all out/    all of them, as .txt
```

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

**`actor`** — eight directions, named in a stated order, and five rows: one
standing and four of a walk. Eight directions and not four because four leaves
the pose 45 degrees out half the time, which is the compromise this art
direction exists to end; in a stated order because five views at uneven spacing
cannot be turned into eight.

Four walk frames and not one, because one held mid-stride is a character
sliding rather than walking — and `src/main.ts` already cycles four, so a sheet
with one is short of what the engine will play. The four are the cycle a walk
actually is: left foot down, passing, right foot down, passing.

There is a second sheet a subject can have, `<name>_combat`, and **nothing
generates it yet on purpose.** There is no combat in this game, so nothing
drives an attack, a flinch or a death. It exists because the expensive part of
coming back later is not the drawing — it is that generating the same character
twice gets you two characters. If it is wanted, generate it with the walk sheet
as an image reference rather than from the text alone.

The cell arithmetic is why this is two sheets and not one: 5 rows × 8 is 40
cells, 7 more rows is 96, and 96 cells at the 150–200 pixels a cell wants does
not fit in anything a generator hands back.

512 townsfolk is a great deal of one person. Take `townsman` and `townswoman`
two or three times over with different hair and cloth — the drawn sheet needed
the same thing, and two hundred redheads in identical white shirts is how that
was found out.

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
