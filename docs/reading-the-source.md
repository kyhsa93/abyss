# Reading the source's own drawings

Every room in this game is a measurement of a room in the raid it is taken
from, and the measurements come off pictures: the client's instance map, the
world coordinates in the instance's scripts, the boxes its area triggers are
built to. This file is how those pictures are read, and — more usefully — what
was got wrong by reading one without being told what it was a picture of.

## The mistake worth writing down

`ARENA_RADIUS` says the first fight's floor is a hundred and eighteen yards
across, and the note on it says where that came from: the client's map tile
for the lower spire, on which "the walkable disc inside the colonnade draws 84
by 88 pixels".

The 84 by 88 pixels are real. The word **walkable** was an assumption, and it
was wrong. On the instance map that circle is drawn in two colours:

| what is drawn | what it is |
| --- | --- |
| the **red** area, upper half, with the boss marker on it | the floor the fight is fought on |
| the **blue-green** area with an ice texture, lower half | an ice cliff — not floor at all |
| the **pale ring** around the whole circle, with ice chunks along it | a walkway that climbs around the outside |

So the first fight's room is not a disc a hundred and eighteen yards across.
It is a **half-disc**: a chord straight through the middle of that circle, the
floor on the near side of it, the drop on the far side. The room in this game
was twice the floor the source has there, and the half that did not exist was
the half a raid would fall off.

Nothing in the picture says which colour means floor. A person who has walked
the place says it in one sentence, and that sentence belongs here rather than
in a chat log, because the next measurement taken off this sheet will be taken
by somebody who has not walked it either.

## The lower spire, as the instance map draws it

Source: `InstanceMap-IcecrownCitadel1.jpg`, the client's own map for the floor,
mirrored at the WoWWiki archive
(`https://wowwiki-archive.fandom.com/wiki/File:InstanceMap-IcecrownCitadel1.jpg`).
Not committed here: it is Blizzard's art, and this repo ships only art it can
credit — see `art/`. It is a download and a crop away, and the numbers below
are what came off it.

The sheet is **1.3528 yards to the pixel**, which is not read off the picture:
the client's map tiles carry the world rectangle each one covers, and that is
the conversion for this one. The two independent spans in `ARENA_RADIUS`'s note
confirm it to within a couple of yards.

Measured on that sheet, with the circle's middle at (391, 415) in its pixels:

| | pixels | yards |
| --- | --- | --- |
| the bowl, edge to edge | 86 across | 116 |
| the floor: the bowl's upper half, cut on a chord through the middle | 43 deep | 58 |
| the walkway ring, outer edge | radius 57 | 77 |
| the walkway ring, width | 14 | 19 |
| the boss's marker, in from the chord | 17 | 23 |

The way through, as the map draws it, running down the page:

1. the great hall (Light's Hammer) and the corridor out of it, from the north;
2. into the **ring**, not into the room — the corridor meets the walkway;
3. the room itself: the half-disc, the boss at its middle, the ice cliff on the
   open side;
4. the ring again, round the outside of the room and climbing, until it is
   above the cliff;
5. and a **staircase down** off that height into the next hall, where the
   second fight is.

## What this game can and cannot hold

`RoomShape` is a convex two-dimensional shape and there is no elevation
anywhere in the simulation. Against the list above that means:

- **The half-disc is expressible.** A disc cut by a chord is convex, which is
  the whole of what `RoomShape` asks of a shape. It is a fourth kind and the
  reason for it is this file.
- **The cliff is expressible, and for free.** It is not floor: it is the part
  of the circle the room does not include. `roomHasOutside` already exists for
  a room you can step off.
- **The ring is not one room.** An annulus is concave, and this game does not
  buy path-finding — see `RoomShape`. What it is expressible as is a room
  beside the bowl with ground either end of it, which is what the Ledge is:
  the shape of the journey — out of the side, along past the ice, in at the far
  end — kept, and the circle of it dropped.
- **The climb is not expressible at all.** Walking round and coming out above
  the cliff is a change in height, and height is not a thing this game has. It
  reads as a walk around the outside; the stairs down are the passage that is
  already there.

## The instance's own data, which beats any picture

A map is a drawing of a place. A server that runs the place has to know the
place, so the emulator projects carry the same facts as numbers — and they are
public. Two of them were used here:

**TrinityCore's instance script** (`src/server/scripts/Northrend/IcecrownCitadel/`)
carries what the fight is *allowed* to be:

```
{ GO_LORD_MARROWGAR_S_ENTRANCE, DATA_LORD_MARROWGAR, DOOR_TYPE_ROOM },
{ GO_ICEWALL,                   DATA_LORD_MARROWGAR, DOOR_TYPE_PASSAGE },
{ GO_DOODAD_ICECROWN_ICEWALL02, DATA_LORD_MARROWGAR, DOOR_TYPE_PASSAGE },

{ DATA_LORD_MARROWGAR, new CircleBoundary(Position(-428.0f, 2211.0f), 95.0) },
{ DATA_LORD_MARROWGAR, new RectangleBoundary(-430.0f, -330.0f, 2110.0f, 2310.0f) },
```

`DOOR_TYPE_ROOM` is a door that opens when the encounter is *not running*;
`DOOR_TYPE_PASSAGE` is one that opens when it is *done* — the server's own
comments say so. So the first fight has one way in, shut while it is being
fought, and **two ways on, both ice, both shut until the boss is down**. Not a
reading of a picture: a table.

The two boundaries are ANDed, and the second one only bites on one edge: a
circle of radius ninety-five with everything past `x = -430` cut off, two
yards behind that circle's own middle. A half-disc, cut through the middle,
which is the same shape the map draws in two colours.

**AzerothCore's world database** (`data/sql/base/db_world/`) carries where
everything stands:

| what | entry | world x | world y |
| --- | --- | --- | --- |
| Lord Marrowgar | 36612 | -401.37 | 2211.14 |
| his room's door | 201857 | -338.09 | 2211.47 |
| ice wall | 201911 | -407.35 | 2147.88 |
| ice wall | 201910 | -412.97 | 2285.24 |
| the Oratory's door | 201563 | -520.44 | 2211.47 |

Read against the boss, that is: the way in sixty-three yards in front of him,
the drop twenty-nine yards behind him, the next fight's door a hundred and
nineteen yards behind that, and **the two ice walls sixty-three and
seventy-four yards out on either flank, six and twelve yards behind the line
he stands on**. Which is where a ramp round the outside of a bowl has to
start: at the ends of the cliff's edge. `RING_LEAN` in `dungeon.ts` is the
average of those two angles and nothing else.

### The ratios: a body, a boss, a pace, a reach

The unit in this game is a body, and what a body is worth is now the source's
own collision rather than the width of a picture of one.

| | source | where |
| --- | --- | --- |
| a body across | 0.778 yards | `DEFAULT_PLAYER_BOUNDING_RADIUS` 0.389, doubled |
| a body's run | 7.0 yards a second | `baseMoveSpeed[MOVE_RUN]` |
| melee's floor | 5.0 yards | `NOMINAL_MELEE_RANGE` |
| the first boss across | 9.0 yards | `creature_model_info` 31119, bounding radius 4.5 |
| the first boss's run | 8.5 yards a second | `creature_template` 36612, `speed_run` 1.21429 |

All four of the first three are in TrinityCore's headers; the boss's two are
rows in AzerothCore's world database.

In ratios, which is what the game actually holds: a body covers **nine of
itself a second**, melee reaches **six and a half bodies** past what it is
hitting, and the boss is **eleven and a half bodies** across. The yardstick
used to hang on a body 0.95 yards wide, off the model rather than the
collision, and every one of those ratios was a fifth short — which is most of
what "the map is too big" was. The map did not change; the pace did.

### The lower spire, from the instance's own coordinates

| | world x | yards from the way in |
| --- | --- | --- |
| the way in | 76.9 | 0 |
| the great hall, middle of its spawns | -62 | 139 |
| the first boss | -401.4 | 478 |
| the second fight's room, middle of its boundary | -595 | 672 |

The hall is a hundred and thirty yards wide by a hundred and twenty-five long
— every creature the instance places in it stands between x -125 and x 0 and
between y 2153 and y 2283 — and the walk from it to the first fight is two
hundred and ten yards of corridor, which is the stretch the raid fights its
way down.

Built at `BUILD_SCALE`, that is the lower spire this game has.

### One thing the data and the picture disagree about

Size. The boundary circle is ninety-five yards and the doors either side of
the room stand ninety and ninety-two yards off its middle, so the source's
bowl is about a hundred and eighty across. The same bowl measured off the map
tile — this file's own table — comes out a hundred and sixteen. The two
disagree by about a factor of one and a half, and the same factor turns up
again in the distance between rooms: the source puts the first two fights a
hundred and sixty-seven yards apart and this game's plan had two hundred and
sixty-five.

It resolves itself, and pleasantly. The rooms this game already had are close
to half the source's when both are measured in bodies — so taking the source's
own figures and building them at `BUILD_SCALE` lands almost exactly where the
rooms already stood: the first fight's floor comes out 1099 units against the
1103 it was, and the great hall 1504 against 1516. The map tile's yardage was
wrong and the game's rooms were not.

What is still the map tile's reading, and still to be re-taken: every room
above the first fight. Their numbers are in `dungeoncheck`'s size table,
marked. The next one is the second fight's — its boss's boundary is a hundred
and thirty-five by a hundred and fifty against the ninety-five square it is
built at — and moving it means re-laying the ten rocks and four doors that
`rendercheck` measures against its walls.

## What was built from this, and what was not

The first fight's room is an `apse` now: half a disc a hundred and sixteen
yards wide and fifty-eight deep, the boss twenty-three yards in front of the
straight side, the drop along it. Walking off the straight side is a fall;
walking into the curve is a wall. The room's own bowl — floor *and* ice — is
what the plan keeps other rooms out of, because the ice is part of the chamber
even though nobody stands on it.

The walkway is two rooms, the East Climb and the West Climb, one on each flank
— which is what a citadel of rooms and doors can hold of a ramp, and what the
source's two ice walls say there should be. Both are held shut by the fight, so
before the boss is down there is no way out of that room but the way in. Neither
climbs, because nothing in this game does.

There was a third room for an afternoon: a ledge across the head of the bowl
where the two meet. It is gone, and the reason is worth keeping. A room at the
head has both of its doors cut in the wall facing the bowl, a doorway apart,
because a door is placed where the bearing to the next room leaves this one —
so the two read as one door, and the build says so. Nothing in this game walks
round a curve; a ring of rooms around a bowl is the one shape it cannot hold.

## What is taken, what differs, and what is still on the table

The emulators carry the whole instance, not just its geometry. This is what
has been used, what the game does differently on purpose, and what is still
sitting there.

### The two fights of the lower spire, against their scripts

The kits match almost exactly, which is worth saying because they were built
from descriptions rather than from data:

| the source | here |
| --- | --- |
| Coldflame, Bone Spike Graveyard, Bone Storm, Bone Slice | coldflame, spike, bonestorm, and the tank's slam |
| Death and Decay, Frostbolt, Frostbolt Volley, Touch of Insignificance, Summon Shade, Dominate Mind, Dark Empowerment, add waves | decay, frostbolt, volley, insignificance, shade, dominate, empower, adds |

Every fight's cadence now comes off its own script, and that was the largest
single thing the data had left to settle. The rule used: **phase one is the
source's repeat, the opening is the source's first cast, and a range is its
midpoint.** Phases two and three keep the ratio each fight already had, so a
boss tightens the way it always did — the source has no phase-two cadence to
copy for most of them, because most of them have no phases.

`boss_lord_marrowgar.cpp`, as the shape all the rest are in:

| | source | here, phase one → three | opening |
| --- | --- | --- | --- |
| Coldflame | 5s, from 5s in | 5 → 3.7 | 5 |
| Bone Spike Graveyard | 15s, then 15–20s | 17.5 → 13.6 | 15 |
| Bone Storm | warned at 45–50s, then 90–95s | 92.5 → 74.6 | 47.5 |
| Bone Slice | enabled at 10s | the tank's slam, 19 → 15 | 14 |
| enrage | 10 minutes | 240s | |

The whole mapping, mechanic here ← event there. Everything unmarked is the
source's own number:

| fight | here ← source |
| --- | --- |
| Marrow (Lord Marrowgar) | coldflame ← Coldflame 5s · spike ← Bone Spike Graveyard 15–20s · bonestorm ← Bone Storm 90–95s, warned at 45–50s |
| Whisper (Lady Deathwhisper) | adds ← wave 60s (45s heroic) · decay ← Death and Decay 22–30s, first at 17s · dominate ← Dominate Mind 40–45s, first at 27s · empower ← Dark Empowerment 25s, first at 15s · frostbolt ← Frostbolt 12s · volley ← Frostbolt Volley 20s · insignificance ← Touch of Insignificance 6–9s · shade ← Summon Spirits 12s |
| Host (Festergut) | inhale ← Inhale Blight 33.5–35s, first at 25–30s · spore ← Gas Spore 40–45s, first at 20–25s · bloat ← Gastric Bloat 15–17.5s, first at 12.5–15s · vilegas ← Vile Gas 28–35s · blight, pungent — this game's own |
| Gorged (Deathbringer Saurfang) | adds ← Summon Blood Beast 40s, first at 30s · spill ← Boiling Blood 15–20s, first at 15.5s · siphon ← Blood Nova 20–25s, first at 17s · fester ← Rune of Blood 20–25s, first at 20s · champion ← Mark of the Fallen Champion, which is a bar rather than a clock |
| Confluence (Rotface) | spray ← Slime Spray 20s · infection ← Mutated Infection 14s · flood ← Ooze Flood 25s · slime ← Sticky Ooze 15s, first at 5s · engulf, ooze, merge — this game's own |
| Flasks (Professor Putricide) | hound ← Malleable Goo 21–26s · gather ← Slime Puddle 35s, first at 10s · decant ← Choking Gas Bomb 35–40s · caustic ← Unstable Experiment 35–40s · chase ← Unbound Plague 90s |
| Crowns (Blood Prince Council) | rotation ← Invocation of Blood 46.5s · nuclei ← Shadow Resonance 10–15s · thirst ← Conjure Flame 20s · ballast ← Kinetic Bomb 18–24s · prison ← Shock Vortex 15–20s |
| Gift (Blood-Queen Lana'thel) | gift ← Vampiric Bite 15s · bond ← Pact of the Darkfallen 30.5s, first at 15s · crimson ← Twilight Bloodbolt 20–25s · flight ← Air Phase, **not** taken |

Two were taken and put back, and both for the same reason — the source's
number describes something this game does not have:

- **`reagent`** is Mutated Plague, which the source casts every 25s and then
  every 10s. Here it is not a cast at all: it is a dose that stacks on whoever
  is tanking, so its "cadence" is the rate the stack grows. Written at the
  source's number it stopped landing.
- **`flight`** is the air phase, 124s in and every 100–120s after. This game's
  fights run 245 seconds and enrage; a mechanic on a two-minute clock fires
  once or not at all, and `rendercheck` caught it never firing. It stays at 52.

Two values this reading found backwards, both from the round that tuned these
fights without the numbers: this game threw Deathwhisper's volley twice as
often as the source and summoned a shade half as often.

### What ends a phase, and how little of it is health

Three phases at fixed shares of the health bar is this game's own pacing
device. It had to be invented, because the source mostly does not have one:

| fight | what ends a phase there | here |
| --- | --- | --- |
| Marrow (Marrowgar) | nothing. Bone Storm on a clock is the whole escalation | pacing, left alone |
| Whisper (Deathwhisper) | the mana barrier: the hit that outlasts it (`damage > GetPower(POWER_MANA)`), and the two phases throw **different mechanics** | phase two at 0.6, and the kit is split — see below |
| Host (Festergut) | nothing. The third inhale is the escalation | pacing, left alone |
| Gorged (Saurfang) | nothing ends a phase; the bar fills and buys marks. One health threshold exists: Frenzy at 30% (`HealthBelowPct(31) // AT 30%, not below`) | phase three was already 0.3, now written down as that |
| Confluence (Rotface) | nothing. Hasten Infections at 90s is the escalation | pacing, left alone |
| Flasks (Putricide) | **80% and 35%**, stated outright, with the boss stopping to drink at each | 0.8 and 0.35, was 0.68 / 0.34 |
| Crowns (Blood Council) | nothing. The invocation moves between three bodies every 46.5s | pacing, left alone |
| Gift (Lana'thel) | nothing. The air phase is a clock, 124s in | pacing, left alone |

**Deathwhisper is the one that mattered.** Her two phases are two different
fights, not one boss getting faster: behind the wall she summons waves, one of
them empowered, drops a plague and turns a mind, and deals no direct damage;
when the wall falls the script cancels every one of those (`CancelGroup`) and
she starts casting — frostbolt, volley, the mark on her tank, shades pulled out
of the raid. Only the plague and the turned mind cross the break, because the
source schedules those outside both phases.

Written here as one kit of eight thrown from the first second, that fight won
between nought and five percent of its pulls at every size and difficulty. The
mechanics were not too hard. They were all of them, always. It is now split the
way the script splits it.

**The share of the bar the wall is worth** is in the database rather than in
the script. `creature_template` carries a health and a mana modifier per
difficulty and `creature_classlevelstats` the level-83 base they multiply:

| | mana (the wall) | health | wall's share |
| --- | --- | --- | --- |
| ten normal | 3,264,800 | 3,346,800 | 49% |
| ten heroic | 11,193,600 | 13,387,200 | 46% |
| twenty-five normal | 3,264,800 | 6,693,600 | 33% |
| twenty-five heroic | 13,992,000 | 26,774,400 | 34% |

A fight here has one threshold rather than four, so it is their mean: two
fifths. (Those absolute numbers are five times the live ones — the emulator
applies a rate multiplier this table does not carry — which does not touch a
ratio.)

### The wave that is two creatures

Every summon in this game walks at a body and hits it. The Watcher's does not:
`SummonWaveP1` alternates between two entries, and they are not variants of
each other.

| | source | here |
| --- | --- | --- |
| Cult Fanatic | melee. Necrotic Strike every 17s (70% weapon damage and a 20,000 heal absorb), Shadow Cleave every 14s (19–21,000 in front), Vampiric Might every 25s (+25% damage, heals for 300% of damage dealt) | the thrall this game already had |
| Cult Adherent | stands off. Deathchill Bolt every 2.5s, 45 yards, 2s cast, 11.5–13.5k; Curse of Torpor every 18s; Shroud of the Occult every 10s | **`spawn: 'adherent'`** — walks to its own reach and casts from there |

Half of every wave, because the source's alternates two-to-one and then
one-to-two, which is half and half over a fight.

**What was left, and why.** Necrotic Strike's heal absorb is the same idea as
the Confluence's infection — healing that is *wrong* rather than insufficient —
and this repo's rule is that no fight repeats another fight's idea. Vampiric
Might and Shroud of the Occult are each a second new idea inside one wave.
Curse of Torpor is the slow the sludgeworks already has, cast by a body instead
of laid on a floor. The one that is genuinely new is the reach, and that is the
one that was taken.

**What it cost to find out.** Two things, both worth writing down:

- Matched by damage *a second* to a fanatic, the fight fell from 70% of its
  pulls to 15%. A fanatic spends most of a wave walking and then hits one body
  in armour; an adherent shoots from the moment it lands and its bolt is magic,
  which nothing in this game reduces. The bolt is worth one of a fanatic's
  swings now, at the source's own 2.5-second cadence: reach paid for in tempo.
- That was not the whole of it. A melee dealer picks the summon with the least
  health left, and the movement layer arranges the raid around the *boss* — so
  a melee that picked an adherent walked nowhere and swung at nothing for as
  long as it lived. Half the raid was standing still. A body that has to be
  next to what it hits now picks something it can reach.

### The rest of the building's trash

Every corridor is the source's own spawns, taken the way the first one was:
`creature` rows on map 631, clustered by position at thirteen yards, placed at
the distance they stand from the thing at the end of the walk, and converted at
`BUILD_SCALE`.

| corridor | what stands in it | packs |
| --- | --- | --- |
| the way to the first fight | The Damned, Servants of the Throne, Nerub'ar Broodkeepers, Ancient Skeletal Soldiers, four Deathbound Wards on wires — 48 bodies | 26 |
| **the Oratory** (both climbs) | 28 Deathspeakers — two scouts, two files of five, two of seven, a High Priest either side of the door. Every pack has a twin at the same distance on the other side of the centre line | 8 |
| **the Rampart of Skulls** | two Rotting Frost Giants at the far end, then gargoyles standing singly, then three on the way onto the ship. The other 32 bodies up there are two armies fighting each other | 6 |
| **Deathbringer's Rise** | nothing. Six bodies, all of them your own side's | — |
| **the plagueworks approach** | abominations, a knot of horrors, **twelve Vengeful Fleshreapers in one heap**, scientists standing singly, Stinky and Precious, and a Decaying Colossus on the airlock | 13 |
| **the crimson wing** | eight San'layn at the top of the stair, then threes and fours up the hall's two balconies, then the guard on the dais — 33 bodies | 10 |
| **the frostwing halls** | twenty Ymirjar in a funnel: threes, then singles alternating sides, then two threes abreast, then six across the way | 9 |
| **the whelp gauntlet** | two frostwyrms, and two heaps of fourteen Frostwing Whelps with a Frostwarden Handler in each | 4 |

**And how many of them there are is a raid size.** `creature.spawnMask` carries
a bit for each of the four settings, and fourteen of this raid's spawns are set
to one size and not the other. Two things follow, and one of them was a bug:

- The Oratory holds **twelve** Deathspeakers for a ten-man and **eighteen** for
  a twenty-five: two files led from the same two spots, five bodies each or
  eight, `spawnMask` 5 on the fives and 10 on the eights.
- The Rampart's "two" Rotting Frost Giants are **one giant, written twice**:
  the same position with `spawnMask` 5 on one row and 10 on the other. Counting
  bodies off a spawn table without reading that column doubles it.

Three numbers that used to be typed are facts now:

- **How far a pack notices.** `creature_template.detection_range` is twenty
  yards for every one of the six hundred creatures in this raid — the heaviest
  elite notices from exactly as far as the lightest — so it is that, converted,
  everywhere. It had been spread by hand between 230 and 260.
- **How many bodies are in one.** `creature.spawnMask`, read per size.
- **What a body in a pack is worth.** `creature_template.HealthModifier`
  against `creature_classlevelstats`, as a ratio to The Damned, square-rooted.
  The source's spread is forty to one between the lightest trash here and the
  heaviest, and a body worth forty is a boss standing in a corridor; the root
  keeps every ordering and brings the spread to about seven to one. A whelp is
  two thirds of a body, a frost giant six and a half.

### What a tooltip can settle, and what it cannot

The client's spell tables are the only source that can say how big a mechanic
is rather than what shape it is. Reading them turned up a clean line, and it is
not the one this file expected: **the source settles times, counts and
thresholds; it cannot settle percentages or distances.**

Distances, because this game compresses them on purpose — a caster stands
eighteen yards back here against the source's forty, for the reason written on
`SPELL_RANGE` — so a radius copied across would be a mechanic covering twice
the floor it should.

Percentages, because each one trades against this game's own health, healing
and damage, which are a fortieth of the source's and tuned against a fixed
roster. What the source says, against what this game does:

| | source | here | |
| --- | --- | --- | --- |
| Touch of Insignificance | −20% threat a stack | `SLIGHT_SHARE` 0.2 | already the same |
| Gastric Bloat | explodes at 10 stacks, +10% damage each | `BLOAT_BURST_AT` 10, `BLOAT_POWER` now 0.1 | taken |
| Inhale Blight | three of them, +30% damage each | `INHALE_MAX` 3, `INHALE_POWER` 0.22 | count taken, share kept |
| Dominate Mind | 12s, +200% damage | `turned` 12s, `TURNED_POWER` 1.3 | time already the same, share kept |
| Essence of the Blood Queen | 1 minute, +100% damage, heals 10% of damage dealt | `GIFT_LIFE` 60, `GIFT_POWER` 0.45, `GIFT_LEECH` 0.2 | time already the same, shares kept |
| Mutated Infection | 12s, −75% healing | `infected` now 12, `INFECTION_HEALING` 0.35 | time taken, share kept |
| Mark of the Fallen Champion | heals the boss 20% of its health on death | 5% here | kept |

And the times that were simply guessed and are now the source's:

| | was | now |
| --- | --- | --- |
| the spore's fuse (Gas Spore) | 7 | **12** |
| the infection (Mutated Infection) | 14 | **12** |
| the slight (Touch of Insignificance) | 16 | **30** |
| the shard's cast (Frostbolt) | 1.9 + notice | **2.0 + notice** |
| the spray's cast (Slime Spray) | 1.7 + notice | **1.5 + notice** |

Three more were already right and are worth naming, because a hand-tuned number
that lands on the source's is a sign the tuning was reading the same thing:
`GATHER_TELEGRAPH` is 5 and Ooze Flood is a five-second channel; `turned` is 12
and Dominate Mind is 12 seconds; `GIFT_LIFE` is 60 and the Essence lasts a
minute.

### The pads

Six now, and which rooms have them is not a choice. The instance places seven
Scourge Transporters:

| source | here |
| --- | --- |
| −17.1, 2211.5, z 30 | the way in |
| −503.6, 2211.5, z 63 | the Oratory's door |
| −615.1, 2211.5, z 200 | the Rampart of Skulls |
| −549.1, 2211.3, z 539 | Deathbringer's Rise |
| 4356.9, 2769.4, z 356 | the upper spire |
| 4199.4, 2769.4, z 351 | — the same landing's far end |
| 4356.6, 2565.8, z 220 | the frostwyrm's approach |

Two of the seven are the two ends of one landing, which is why six pads and not
seven. The two ramps out of the first fight had one each and the source has
none on either: a pad stands where a wing begins, and a ramp is not the
beginning of anything.

### Boss health: an order, not a set of ratios

The eight fights here carry between five and a half and fourteen million in the
source, counting the Watcher's mana barrier as part of her bar (it is what has
to be taken off her) and the council as its Blood Orb Controller's pool — the
three princes share one, `newPrince->SetHealth(me->GetHealth())`.

| | source, ten normal | ratio |
| --- | --- | --- |
| the three crowns | 5,647,725 | 0.81 |
| the last whisper | 6,611,600 | 0.95 |
| the bonegrinder | 6,972,500 | 1.00 |
| the confluence | 7,321,125 | 1.05 |
| the bloodgorged | 8,785,350 | 1.26 |
| the reeking host | 9,412,875 | 1.35 |
| the two flasks | 9,761,500 | 1.40 |
| the crimson gift | 14,154,175 | 2.03 |

The ratios cannot be used, and the reason is not scale. It is that in the
source the raid gears up between the wings: a boss at the back of the building
asks two and a half times what the first one did and still dies in four
minutes, because the people fighting it are stronger than they were. Here it is
the same roster on the same night against one enrage, so health *is* fight
length — the source's spread would put two fights past their enrage and two
under two minutes.

**Nor can the order be used**, which took a sweep to find out. The reasoning
was that the eight numbers the balance sweep arrived at were a *set*, so the
source could say which fight got which without moving anything: same total,
same eight values, dealt out in the source's order. It is wrong, and the way it
is wrong is worth keeping. A fight's health is not a number drawn from a shared
pool. It is that fight's own answer to that fight's own damage, and permuting
them moved four cells out of band in a single pass — the crimson gift, handed
the largest bar because the source's queen carries it, went to nought percent
at twenty-five; the three crowns, handed the smallest, went to a hundred at
every setting.

So the table above is a fact about the source and not a fact about this game,
and it is the one item on the whole inventory that was taken and then given
back. What it is still good for is the shape of an argument: if this game ever
grows a raid that gears up between wings, the order is here waiting.

### The source's own goals

Its achievement criteria are the one thing in the instance that is already a
*designed goal* rather than a fact about a fight — somebody decided what doing
each of these well looks like and wrote it down. Six of the eight are now
awards:

| source | here | the rule |
| --- | --- | --- |
| Boned | Nobody Left Standing | no spike ran its full term. The source's fails eight seconds after a body is impaled rather than when one is, so being pinned is not the mistake — leaving somebody pinned is |
| I've Gone and Made a Mess | A Clean Board | fewer than three marks out at ten, five at twenty-five, which is the source's own `RAID_MODE(3, 5, 3, 5)` |
| Flu Shot Shortage | Short of Shots | fewer than three covered — `DATA_INOCULATED_STACK < 3` |
| Dances with Oozes | Nothing Merged | no two small things ever became one |
| Nausea, Heartburn, Indigestion | Neither Goo Nor Gas | nobody caught by the chase or the gas |
| The Orb Whisperer | The Orb Whisperer | nobody touched by what the crown empowers |

The two that are not here — Full House (five kinds of cultist standing at once)
and Once Bitten, Twice Shy (whether one particular body ever wore the gift) —
ask about a *moment inside* a fight. An award here is judged from the state a
pull ended in, and that is what stops one from ever changing how a pull plays
out; taking those two would mean the simulation carrying a flag for the award
layer.

Taking the first of them changed a rule that was quietly wrong. The pin used to
bill a mechanic hit every tick, so a body pinned for four seconds was charged
four times and a fight with spikes read as four times the mistakes of one
without. A pin is one mistake with a length, and it is charged once now, where
it runs out.

### The shape of a fight's floor

Every fight has a boundary in `instance_icecrown_citadel.cpp`, and a boundary
is the one thing about a room that a picture cannot argue with:

| fight | boundary | across the walk × along it |
| --- | --- | --- |
| Marrowgar | `CircleBoundary(-428, 2211) r95` ∩ `RectangleBoundary(-430, -330, 2110, 2310)` | a half-disc, 190 × 95 |
| Deathwhisper | `RectangleBoundary(-670, -520, 2145, 2280)` | 135 × 150 |
| Saurfang | `RectangleBoundary(-565, -465, 2160, 2260)` | 100 × 100 |
| Festergut | `RectangleBoundary(4205, 4325, 3082, 3195)` | 120 × 113 |
| Rotface | `RectangleBoundary(4385, 4505, 3082, 3195)` | 120 × 113 |
| Putricide | `ParallelogramBoundary((4356, 3290), (4435, 3194), (4280, 3194))` | 155 × 96 |
| Blood Prince Council | `EllipseBoundary(4660.95, 2769.194) 85 × 60` | 120 × 170 |
| Blood-Queen Lana'thel | `CircleBoundary(4595.93, 2769.365) r64` | 128 × 128 |
| Sister Svalna | `RectangleBoundary(4291, 4423, 2438, 2653)` | 132 × 215 |
| Valithria | `RectangleBoundary(4112.5, 4293.5, 2385, 2585)` | 181 × 200 |
| Sindragosa | `EllipseBoundary(4408.6, 2484) 100 × 75` | 200 × 150 |

**Read a rectangle as a bound and a circle as a shape.** Nobody writes a circle
boundary for a square room, so Marrowgar's half-disc and the queen's circle are
floor plans; a rectangle may be the room or may be the box around it. That is
why what has been taken from this table is *proportion* rather than outline.

Seven of the eight fights here were already the right shape to within a fifth.
The eighth was turned ninety degrees, and had been for a year with its own
comment arguing against its own numbers: the laboratory is written as "wide,
shallow, and with straight walls" because the mechanic wants the raid to split
left and right, and it was built 1686 across by 2349 deep. The parallelogram
settles it — half again wider than deep — so it is 2530 by 1566 now, at the
floor it already had. `dungeoncheck` measures the ratio against this table so
that a room cannot be turned by eye again.

The council is deliberately not measured against its own boundary: the source
fights the council in the round chamber at the end of the Crimson Hall and the
queen in the hall, and this game swaps which fight is in which room. The hall's
own shape — 119 across by 77 along, off the two council doors — is what that
room is built to, and it is.

**And the sizes are taken too**, which was the last item on the whole list and
was left until last on purpose: floor is the single biggest lever this game has
(`docs/mechanic-rules.md` rule 5), so it arrives with a re-tune attached.

A rectangle is a bound rather than a shape, so a round room takes the mean of
its boundary's two sides as a diameter and a hall takes them as they are:

| | was | is | floor |
| --- | --- | --- | --- |
| the bonegrinder | apse r1099 back 335 | unchanged | — |
| the last whisper | 95 × 95 yd | 68 × 75 | −44% |
| the bloodgorged | 64 across | 50 | −39% |
| the reeking host | 84 across | 58 | −52% |
| the confluence | 82 across | 58 | −50% |
| the two flasks | 109 × 68 | 78 × 48 | −50% |
| the three crowns | 188 × 131 | 60 × 85 | −79% |
| the crimson gift | 63 across | 64 | +3% |

**And the re-tune it arrived with was one dial.** Thirty-one of the thirty-two
cells took a floor between half and a fifth of what they had and stayed inside
the band; the sludgeworks did not. Its whole mechanic is two small things not
reaching each other, so halving the floor is halving the mechanic's answer, and
ten heroic fell from 57% to 35% on the room alone. `sizeMechanic` at ten went
1.3 → 1.05 → 1.18: the first move overshot to 88%, which is the fight handed
over rather than fixed, and the second lands it at 73%. Nothing else moved.

The bonegrinder is the one that did not move, and it is the one worth reading.
Its boundary is a circle of 95 cut by a rectangle at x −430, and the circle's
middle is at −428 — so read off the circle the flat side is two yards behind
the middle and the room is very nearly a whole disc. It is not. **`back` is
measured from the boss**, and Marrowgar stands at −401.4, twenty-six and a half
yards in *front* of that middle: the drop behind him is 28.6 yards, which at
`BUILD_SCALE` is the 335 the room was already built at. Built off the circle
instead it comes out as two, which puts the boss on his own wall — and
`dungeoncheck` says so in three places at once, because a room whose middle is
within a body's width of its own edge is a room with no middle.

Two lengths had to become shares of the room, and both for the same reason: a
distance tuned against a room that has since moved is a promise about nothing.

- **The sludgeworks' patches.** `SLIME_PATCH` and `SLIME_DRY` were 210 and 300
  units. At a radius of 674 instead of 947 the arc went from just under a third
  of the floor to well over it, and the dry middle plus one patch grew past the
  wall — so the mechanic would have laid nothing at all. They are 0.2217 and
  0.3168 of the room now, which is what they were of the room they were tuned
  in, and rule 5 holds by arithmetic rather than by the room not moving.
- **The walk a blood beast has to make.** Sixteen bodies of ground, written when
  the bloodgorged's room had a radius of 739. It is thirty-nine hundredths of
  the room now, which is what sixteen bodies were of that one.

### The packs that are somewhere else when you get there

Fifteen creatures in this raid carry a `creature_addon` path, and five of them
stand in corridors this game builds:

| | path | what it walks |
| --- | --- | --- |
| a Damned on the way up | 3701100 | 50 yards **across** the corridor |
| two Rotting Frost Giants | 2087860 | 39 waypoints, x −330.7 to −235.8: 95 yards **along** the rampart |
| a Vengeful Fleshreaper | 3703800 | a 13-point loop around the plagueworks floor |
| Stinky | 2012400 | 78 yards **across**, x 4344.9 → 4267.0 |
| Precious | 2012470 | 74 yards **across**, the other way, at the same depth |

Two are built and three are not, and the line between them is this game's own
compression rather than taste. A corridor here is fifteen yards across where
the source's is a hundred and fifty — deliberately, because held ground a raid
can walk round is not held — so a patrol that walks *across* one moves a
twenty-yard circle by less than its own radius. That is arithmetic, not a
decision. A patrol that walks *along* a corridor is a decision, and both of
those are built: the giants walk most of the rampart, and the heap of twelve
Fleshreapers drifts up and down the plagueworks approach.

`dungeoncheck` holds the rule rather than the taste: every patrol must walk
further than it notices.

What a patrol adds is the only question a corridor did not already ask. A pack
asks *which one first*; a patrol asks *when*. It walks while it is asleep and
stops the moment it wakes, so what it changes is where the circle is when the
raid arrives, not how the fight goes once it starts.

### The source's own ladder

This game had a ladder once — a fight sold its mechanics one at a time as a
raid got bigger or braver — and it was retired, because a fight with a mechanic
taken out of it is not easier, it is emptier.

The source has one too, and it is four lines across the whole instance:

| | source | here |
| --- | --- | --- |
| Unbound Plague | `if (IsHeroic())` in Putricide's `Reset` | the chase, heroic only |
| Shadow Prison | `if (IsHeroic())` on all three princes | the binding, heroic only |
| Dominate Mind | `if (GetDifficulty() != RAID_DIFFICULTY_10MAN_NORMAL)` | the turned mind, everywhere but a ten-man on normal |
| the Watcher's second-phase waves | `if (IsHeroic())` | not expressible — a gate here is per mechanic, and this one is per phase |
| Vile Gas on Rotface | `if (IsHeroic())` | the Confluence does not carry that mechanic at all |

That is the whole of it. Everything else the instance varies by setting it
varies by *number* — how many spores, how many targets a blight needs, how long
a bone storm runs — and that is what `sizeMechanic` and the difficulty table
already do here.

The difference between the two ladders is worth stating, because it is the
reason one was removed and the other put in. This game's sold *ideas*: the
five-man never met the turned mind at all, so the fight it played was a
different and smaller fight. The source's gates a mechanic that changes what a
raid already knows how to do — a plague that has to be passed on, a binding
that charges for running — onto the setting where the raid has already won
once. It is a fight being a different fight, not a cheaper one.

### Read against AzerothCore, which is the one this repo cites

The cadences above were taken from TrinityCore's scripts and the coordinates
from AzerothCore's database, which is one raid read out of two emulators. They
are not the same raid. Reading AzerothCore's own scripts against what was built
turned up nine numbers that differ, and AzerothCore is the one this repo names
everywhere else, so it is the one that wins:

| | was (TrinityCore) | is (AzerothCore) |
| --- | --- | --- |
| the Watcher's volley | every 20s | **every 14s** (`Repeat(13s, 15s)`) |
| the Watcher's empowered body | every 25s, first at 15s | **every 21.5s, first at 25s** |
| the Watcher's plague | first at 17s | **first at 10s** |
| the Watcher's shard | first at 12s | first at 11s |
| the Watcher's shade | first at 12s | first at 13.5s |
| the Watcher's turned mind | first at 27s | first at 30s |
| the bonegrinder's spike | first at 15s | first at 12.5s |
| the reeking host's vile gas | first at 31.5s | **first at 35s** |
| the confluence's flood | first at 25s | **first at 8s** |
| the two flasks' chase | first at 90s | **first at 20s** |
| the two flasks' hound | every 23.5s | **every 27.5s** |
| the two flasks' caustic | first at 37.5s | first at 32.5s |
| the two flasks' gas | first at 32.5s | first at 37.5s |
| the crowns' rotation | first at 46s | first at 45s |
| the gift's bond | every 30.5s, first at 15s | every 30s, first at 20s |
| the gift's crimson | **every 22.5s, first at 12.5s** | **every 12.5s, first at 20s** |

The last one is the one worth looking at twice: the two numbers were the right
pair and the wrong way round. The bolt comes round every twelve and a half
seconds and is first thrown at twenty, and this game had it every twenty-two
and a half and first at twelve and a half — the repeat used as the opening and
a made-up number used as the repeat.

Two of the crowns' mechanics turn out not to be the source's at all, which the
mapping table above claimed they were. The binding is Shadow Prison, which the
princes cast once at the start of a heroic pull and never again — so it has no
cadence to take, and the seventeen and a half seconds here is this game's own
window on the same idea. The thirst has no counterpart in the source; those
princes fight, they do not drink.

### Counted again, and twice the trash

The corridors above were built by clustering the source's rows, and two of them
were built from a *summary* of those rows instead — a note in this file listing
five positions, written in an earlier round. Counting the rows themselves:

- **The way to the first fight is forty-eight bodies, not twenty-six.** What
  the summary lost was the Damned standing singly at the top of it, every one
  of the eight Nerub'ar Broodkeepers, and both files of Ancient Skeletal
  Soldiers. What it kept was the rhythm, which is why it read as right.
- **The crimson wing is twenty-eight, not eight.** That one was a wrong cut
  rather than a lost row: twenty of the twenty-eight stand *inside* the hall,
  and the hall is where the fight happens, so they were left out as the
  fight's room rather than the ground before it. But a raid clears them before
  it pulls, exactly as it clears the Oratory's Deathspeakers, and the Oratory
  is modelled that way. So the corridor holds all twenty-eight and is measured
  back from the princes rather than from the door.

Every other stretch matched to the body. The count is now checked rather than
trusted: hostile elites on map 631, minus the two armies fighting each other on
the rampart and the friendly escort in the frostwing halls, come to two hundred
and fifty-eight, and every one of them is in a corridor or in a fight that has
not been built.

### The other pair of tripwires

`gameobject` puts two Geist Alarms in the plagueworks approach, at (4335.6,
3026.4) and (4374.3, 3027.1), forty-five yards short of the airlock. What each
does is not wake something standing about: `spell_icc_geist_alarm` summons a
Vengeful Fleshreaper and five more around it at (4356.77, 2971.90) — which is
where the heap of twelve already stands, a hundred yards back down the
corridor. So they arrive behind a raid that has just walked past that heap.

Written the way the way up's stone wards are: two packs of six with no circle
at all, and a wire each. That is this game's word for "not there yet".

### A boss walks at its own pace

`creature_template.speed_run` is a multiplier of the source's base seven yards
a second, and it is the same unit this game's party speeds are already in. Every
boss here moved at 197 units — the bonegrinder's 1.21429 — and the roster's own
rows are not close to each other:

| | `speed_run` | units a second |
| --- | --- | --- |
| the last whisper | 1.14286 | 185 |
| the bonegrinder | 1.21429 | 197 |
| the bloodgorged, the three crowns, the crimson gift | 1.42857 | 231 |
| the reeking host, the confluence | 1.5873 | 257 |
| the two flasks | 1.71429 | 278 |

Against a party moving at 158 to 178, that is the difference between a fight
you can walk away from and one you cannot, and a raid that learned it on the
first boss had learned something untrue about every fight after it.

### Read and not taken, this round

- **A boss's size.** `creature_model_info` gives a bounding radius per model
  and the raid's rows are not usable: Saurfang's is 0.00, Festergut — an
  abomination the size of a room — is 0.31, and Marrowgar's is 4.5. `BOSS_WIDTH`
  is nine yards because Marrowgar's row happens to be the one that is real.
  Combat reach is populated everywhere and measures something else (how far
  melee reaches, 1.75 on a prince and 20.25 on Marrowgar), so it cannot stand
  in for a width either.
- **A boss's swing.** `BaseAttackTime` is 0 on four of the eight, which is the
  core's word for "use the default". Half a column is not a column.
- **The three crowns' stations.** The source puts three Empowering Blood Orbs
  at (4522.8, 2769.2), (4573.8, 2854.8) and (4574.2, 2683.5) — an isosceles
  triangle, two sides of a hundred yards and a base of a hundred and seventy.
  This game uses an equilateral triangle of seven hundred units, tuned so that
  moving between stations is four seconds of walking. Taking the source's would
  be taking a *distance*, and distance is the axis this game compresses; the
  shape would arrive without the reason for it.

### The corridor held by its floor

After the rise, the way up to the upper spire is the one stretch of this
building held by nothing with a health bar — and this game had nothing there at
all: `rise` and `crossing` were two rooms with a doorway between them.

The source fills it. Twelve Frost Freeze Traps stand in ninety yards of floor
(`creature` rows on map 631, x 4135.8 to 4225.1), `at_icc_saurfang_portal`
starts them the first time anybody steps through — alternating, half at one
second and half at eleven — and `at_icc_shutdown_traps` at the far end is what
turns them off. `SPELL_COLDFLAME_JETS` is a two-second cast and what it leaves
is Coldflame, "11000 Frost damage every 1 sec for 3 sec".

So: a two-second telegraph, a three-second burn, twenty-two seconds between,
two offsets. Everything downstream of that is the ground system this game
already has — `updateGround` runs in every mode and the renderer draws
`s.ground` in every mode, so a jet is eight lines and no new machinery.

It is worth having because of what it asks. Every other stretch of held ground
asks *which pack to wake first*; this one asks *when to be standing where*, and
that is a question a corridor could not ask before.

Two checks had to learn it. "No corridor can be crossed without waking
anything" read a corridor with nothing asleep in it as an unguarded walk —
nothing there can be woken, which is the point — so it counts jets as well and
says "meeting" rather than "waking". And "under a thousand yards of the citadel
is bare corridor" counted every gap between rooms whether anything stood in it
or not, so the citadel read as emptier the more crowded it got; bare means
holding nothing, and a passage with ground on it is not bare.

### The source says which bodies are a pack

`creature_formations` is the table that answers the question the clustering was
guessing at. AzerothCore writes eleven formations for this raid — a leader
guid, its members, and how far behind each one stands — and where there is one,
it is the pack.

It agreed with the clustering on the heap of twelve Fleshreapers, on the trio
of Damned patrolling the way up, and on the Darkfallen threes in the crimson
hall. It disagreed on two:

- **The Oratory's two files.** Written as four formations: a group of five and
  a group of eight on each side, led from the same spot, `spawnMask` 5 on the
  fives and 10 on the eights. Each file stands over about thirty yards, so
  clustering at thirteen split every one of them — six packs of two, three and
  four where the source has two packs whose size is five or eight depending on
  who walked in. Which is exactly what `count` and `crowd` are for.
- **The plagueworks abominations.** One pack of two, not two of one.

And the sweep found a filter bug of this file's own making. The extraction drops
friendly names by substring, and one of the substrings was `Commander` — meant
for the Ebon Blade and Argent Commanders standing about in the great hall, and
it quietly ate every one of the five **Darkfallen** Commanders in the crimson
hall as well. The wing is thirty-three bodies, not twenty-eight. A name filter
wide enough to be convenient is wide enough to be wrong, and nothing about the
count looked odd until the formations disagreed with it.

### The body in the pack worth killing first

A pack is a pile of health bars, and the answer to a pile of health bars is to
hit it — so which body first has never mattered in a corridor. In the source it
does, twice, and both are in stretches this game builds:

| | source | where it is written |
| --- | --- | --- |
| Nerub'ar Broodkeeper (8, the way up) | Dark Mending on its own side, every 15–25s | `npc_icc_nerubar_broodkeeper` |
| Deathspeaker Disciple (2 in the Oratory at ten, 4 at twenty-five) | Shadow Mend, every 15–30s | `smart_scripts` |
| Darkfallen Advisor (5, the crimson hall) | Shroud of Spell Warding on the lowest friendly, every 20–25s | `npc_darkfallen_advisor` |

Thirty-nine of this raid's creatures are `SmartAI` rather than C++, which is a
table this file had not opened: the Damned, every Deathspeaker, the gargoyles,
the wards and all six Darkfallen are scripted in `smart_scripts` and nowhere
else. Reading it is what turned up the third healer — and confirmed that the
rest of what is in there is damage, plus the one line that appears on nearly
every row of it, "call for help upon entering combat", which is what this
game's overlapping `pulls` circles already are.

Both are the same shape and it is the shape this game already teaches on the
Watcher's empowered body: there is one in the pack worth killing first, and
every default rule — nearest, lowest health — picks it last, because it stands
behind its pack and it is the one thing in the pack being healed. So the
corridor AI gets its first target call, and `dungeoncheck` asks the thing worth
asking: not that the heal exists, but that the raid answers it — every mender
dead before the pack it was in.

**And a third source time had to be given back.** Dark Mending is fifteen to
twenty-five seconds against a pull that lasts minutes; a corridor pack lives
about ten. At twenty, measured, eight menders on the way up healed nobody, not
once, in a walk that killed all forty-eight bodies. It is six with the first at
three — an opening and a repeat, which is the shape every cadence here has. A
mender that is ignored gets a heal off; one that is answered gets none, and
that is the decision being made rather than the mechanic being absent.

The trash has more kits than this — the Rotting Frost Giants stomp and breathe,
the Darkfallen Archmage polymorphs, the Fleshreapers leap — and none of the
rest is taken. `docs/mechanic-rules.md` is why: trash is a thing to spend, not
a thing to learn, and a corridor full of things to read is a fight with no boss
in it. What was taken is the one that turns a pile of health bars into a
choice.

### A stream that could not get out

Found by lengthening the way up rather than by looking for it. A spring sends
its bodies at a point deliberately outside the passage — "where they are going
is out" — and the floor deliberately keeps them on it. So a body streamed into
a corridor long enough that the party outruns it walks to the far wall, presses
against it, and never *arrives*: it never stops streaming, so it never turns
round and comes, and because it is awake and alive the walk it is standing in
can never end.

The way up going from twenty-six bodies to the forty-eight its rows carry is
what made the party slow enough to outrun the stream. A body walking out that
cannot walk any further out has arrived.

### Deliberately different

- **Health.** Forty-six thousand against a boss with about a million. The raid
  here is five to twenty-five bodies with this game's own damage; the bar is
  sized against them.
- ~~**The ladder.**~~ Gone both ways. This game's own is retired, and the
  source's four gates are built — see "The source's own ladder".
- **Names, and every line spoken.** The rule from the round that took these
  fights: the shape comes across and the name does not.
- **Scale.** The building is at `BUILD_SCALE` and there is no elevation, so a
  ramp is a room and a stair is a doorway.
- **Ranged reach.** Eighteen yards against the source's forty, for the reason
  written on `SPELL_RANGE`.

### Nine bodies, because thirty-seven is a phone's memory

The creatures came off the rows first and the *pictures* did not follow: for a
round the building was thirty-seven kinds drawn as one sprite at thirty-seven
sizes, which is a corridor of the same person, big and small. Size is a real
difference and it is not the one anybody reads first.

What the source's creature is, is in its name — the raid names them after what
they are — so the looks are grouped on that axis:

| look | what it is in the source | who wears it |
| --- | --- | --- |
| bone | armoured skeletons | The Damned, Ancient Skeletal Soldier, Deathbound Ward |
| cult | robed people | every Deathspeaker, the Plague Scientists |
| ghoul | risen dead | Servant of the Throne, Fleshreaper, Pustulating Horror, Spire Minion |
| hulk | stitched flesh | both abominations, the Frost Giants, the Colossus, Stinky, Precious |
| blood | San'layn | all seven Darkfallen |
| vrykul | Ymirjar | all five, and the Frostwarden Handler |
| stone | gargoyles | Spire Gargoyle |
| crawler | nerubians | Nerub'ar Broodkeeper |
| drake | frostwyrms | Frostwing Whelp, Spinestalker, Rimefang |

**Nine and not thirty-seven, and the reason is memory rather than taste.** A
look is a row of `public/art/lpc.webp`, the atlas is decoded whole, and a row
costs about six hundred kilobytes of it whether or not anything on screen is
wearing it. Nine took the sheet from 56.6 MB decoded to 65. Thirty-seven would
not fit on a phone.

**And where the source's creature is not a person, the sprite is the nearest
silhouette Liberated Pixel Cup has.** The set draws people: no spiders, no
quadrupeds, no dragons. So a Nerub'ar Broodkeeper is a carapace with a tail, a
Spire Gargoyle is stone with bat's wings and horns, and a frostwyrm is a
lizard's head with wings — each of them a shape that is not a person's, which
is the half of the job that survives being twenty pixels tall.

### The room the trash is in

Every corridor in this building was written as *held ground on a passage*,
because that is what the first one was: the way up to the first fight really is
a corridor with packs in it. The Oratory is not, and the rows say so plainly.

Take Lady Deathwhisper's boundary — `RectangleBoundary(-670, -520, 2145, 2280)`
— and ask which creatures stand inside it. All twenty-eight Deathspeakers do.
They are not on the way to her hall; they are in it, between fourteen and fifty
yards in front of her, and she is at the far end of the same room.

| | |
| --- | --- |
| Lady Deathwhisper | −634.7, 2211.4 |
| the two files, led from | −585.7, 2195.3 and −584.4, 2227.5 |
| the two High Priests | −620.1, 2167.4 and −619.3, 2256.1 |
| the Oratory's door | −503.6, 2211.5 |

Two things came out of putting them where they stand.

**A corridor could not hold the arrangement.** A passage here is twelve yards
wide and the hall is a hundred and thirty-five: the High Priests stand
forty-four yards out on either flank and the two files sixteen. Written as a
corridor, all four were squeezed onto the centre line and the shape of the
place — two files down the middle with a priest watching from each side — was
flattened into a queue.

**And the hall was in the building twice.** The source has one Oratory and this
game has two ramps up into it, so the corridor was hung on both: whichever ramp
you took you met twelve Deathspeakers, and the other twelve stood in the dark
on the ramp you did not take. A room holds its own once.

The same sweep over every other boundary says the Oratory is the only one:
Rotface's, Festergut's and Putricide's rooms contain nothing but the invisible
stalkers their scripts aim puddles at, Marrowgar's and Saurfang's are empty, and
the crimson pair overlap each other so heavily that the Darkfallen in the hall
are inside both — which is why the wing this game deliberately swaps rooms in is
left alone. See "The shape of a fight's floor".

**And the same reading settles where a boss stands in its own room.** A
boundary says where the walls are; it does not say where inside them the fight
happens, and that is a `creature` row. All three of this game's halls were built
`front` twice `back` — two thirds of the floor in front of the boss and one
third behind — which is not a measurement, it is the same guess made three
times.

| hall | boss, and the walls along the walk | was | is |
| --- | --- | --- | --- |
| the Oratory | Lady Deathwhisper at −634.7, walls −670 and −520 | 1157 / 578 | 1327 / 408 |
| the laboratory | Professor Putricide at 3262.9, walls 3194 and 3290 | 741 / 370 | 797 / 313 |
| the crimson hall | the three princes at 4680.3, ellipse 4575.95 to 4745.95 | 1311 / 656 | 1207 / 760 |

Each room keeps its floor to the unit — only the boss's place in it moves — and
each moves the same way the source does: the lich preaches from an altar near
her back wall, the professor works at a table at the back of his laboratory,
and the princes' dais is past the middle of the hall rather than at the end of
it. The benches in the Oratory were re-spaced with it: the first pair of seats
was at −440 in a room whose back wall is now −408, which is furniture standing
outside the building.

**What the room shapes still cannot hold.** Three bosses stand off the middle of
a *disc*, and a disc in this game is centred on its boss, so there is nowhere to
put the difference. Marrowgar is 26.6 yards in front of the middle of his own
circle, so the floor ahead of him is 68 yards in the source and 95 here (the
half-disc's cut behind him is right, at 28.6). The Blood-Queen stands 29 yards
off the middle of hers. Saurfang's spawn is three yards *outside* his own
boundary, because it is where he stands before he walks down. Written down
rather than fixed: an off-centre disc is a shape this game has no primitive
for, and inventing one to hold three numbers would be a worse trade than the
three numbers.

### Thirty-seven creatures where there was one

A corridor used to be one creature repeated. Every body in the building was a
"Watchman" with the same bar, the same size, the same speed and one swing, and
the packs were counts: five here, eight there. The rows say something else —
thirty-seven kinds stand between the door and the frost queen, and they are not
variations on each other.

A pack is a list of names now, read straight off `creature` in spawn order, and
four columns say what each name is:

| what | column | what it turned out to be |
| --- | --- | --- |
| how big a bar | `creature_template.HealthModifier` against `creature_classlevelstats` at level 83 | forty to one, end to end: a Frostwing Whelp is 0.26 of The Damned and a Rotting Frost Giant is 43 |
| how big a body | `creature_model_info.CombatReach` | a quarter of a player to six players wide |
| how fast | `creature_template.speed_run` | 0.57 (a gargoyle) to 2.0 (the two drakes) |
| what it does | `smart_scripts` and the C++ AIs | a third of them shoot rather than close; three of them heal |

Two of those need a note.

**`BoundingRadius` is the column this should have used for size, and it cannot
be used.** Six thousand of the twenty-four thousand models in the table carry
0.00 and eleven hundred carry exactly 2.00, and this raid's rows are in both
piles — a Frostwing Whelp is 0.00 and a Rotting Frost Giant is 0.54, which
would draw the biggest thing on the rampart smaller than a cultist. Combat
reach has defaults of its own, but it *orders* them correctly, and an ordering
is what a size is for here. This is the same lesson as the boss health ratios,
one table further down: a column being present is not a column being populated.

**Forty to one is a spread a corridor cannot hold.** A body worth forty
ordinary ones is a boss standing in a passage, and the pull that contains it is
either trivial or the wall the walk ends at. So health is the square root of
the source's ratio — every ordering kept, the spread brought to about seven to
one — which is the same move `SPELL_RANGE` makes on distance and for the same
reason: this game is a compression of that one, and the compression has to be
applied to the numbers that are ratios, not just to the ones that are lengths.

Size, pace and the two flags are taken whole; there is nothing to compress in
"it is three bodies wide" or "it shoots".

### Everything the source will give, and what has been taken

Four places hold it. Three are public and machine-readable; the fourth is the
one that answers what nobody can.

**TrinityCore's scripts** — `src/server/scripts/Northrend/IcecrownCitadel/`,
seventeen files, what the instance *does*:

| | status |
| --- | --- |
| boss boundaries — the shape of every fight's floor, as circles, rectangles, ellipses and one parallelogram | **taken** for all ten built fights, and there is one left over: `DATA_SISTER_SVALNA` |
| doors, and what opens them: `DOOR_TYPE_ROOM` while a fight runs, `DOOR_TYPE_PASSAGE` once it is done | **taken** — the two ice walls |
| the spirit alarms and the stoneform they take off | **taken** |
| every ability's schedule: first cast, repeat, and the `RAID_MODE` and `IsHeroic()` variants | **taken** for all ten built fights |
| what ends a phase: a health share, a mana bar, blood power, an air phase | **taken** — and five of the first eight have none. The ninth has none *by design*: its bar goes up, so a bar cannot be its own timer and its phases turn on the clock |
| what the adds are and what *they* cast | **taken** for the wave that has two kinds |
| the achievement criteria — "nobody impaled", "all five kinds alive at once" | **taken**, six of eight |
| every line spoken | not wanted: the names here are this game's own |

**AzerothCore's world database** — `data/sql/base/db_world/`, where everything
stands:

| | rows for this raid | status |
| --- | --- | --- |
| `creature` — every spawn, with position | 597 on map 631 | **taken** for the way to the first fight (133) |
| `gameobject` — every object, with position | 111 | **taken** for the great hall and the alarms |
| `creature_template` — name, rank, scale, speeds | all of them | **taken** for the first boss's pace |
| `creature_model_info` — bounding radius, combat reach | all of them | **taken**: it is the yardstick |
| `creature_addon` — auras and patrol paths | 15 of the 597 | **taken**, in part — see below |
| `waypoint_data` — the paths those fifteen walk | 15 paths | **taken** for the two that matter |
| the rest of the building: the Oratory (67), the ramparts (66), the plagueworks (62), the crimson hall (23), the frostwing halls (112) | 330 | **taken** — every corridor, counted off the rows |

**The client's own tables** — what the emulators do not carry, published at
wago.tools and readable through Wowhead's WotLK tooltip endpoint
(`nether.wowhead.com/wotlk/tooltip/spell/<id>`):

| | example | status |
| --- | --- | --- |
| a spell's range, cast time, duration and tick | Death and Decay: 200 yd, instant, 6000 shadow a second for 10s | **taken** for times; ranges and shares are this game's own |
| a spell's radius | some state it, some say "the affected area" | partly available |
| map tiles and the world rectangle each covers | the sheet this file's first table came off | **taken** |

**And what nothing gives.** The floor itself. Walkable geometry lives in the
client's WMO models and the navmesh built from them, so every room here is a
convex approximation of a shape no table describes — and elevation with it,
which is why a ramp is a room and a stair is a doorway.

### In the order it is worth taking

1. ~~**Every fight's cadence**, from its own script.~~ **Taken** — the table
   above. Every mechanic on all ten built fights, except the two that describe
   something this game does not have. The ninth and tenth read as this game's
   own inventions and are not: `suppress` is the Suppresser, `instability` is
   Instability, `buffet` is Mystic Buffet, `spike` is the ice tomb and `cover`
   is what you hide behind from the bomb. The names in this game are its own;
   the mechanics under them are the source's.
2. ~~**Phase triggers**: what actually ends a phase there.~~ **Taken** — and
   the finding was that there mostly are none. See below.
3. ~~**What the adds are.**~~ **Taken in part** — the wave is two creatures
   now, not one. See below for what was taken and what was left.
4. ~~**The rest of the building's trash.**~~ **Taken** — every corridor in the
   building is the source's own spawns now. See below.
5. ~~**Spell numbers** from the client tables.~~ **Taken** — the times. See
   below for the line between what a tooltip can settle here and what it
   cannot.
6. ~~**The teleport pads**, at the source's own coordinates.~~ **Taken** —
   seven transporter rows, six pads, and two ramps that had one and should
   not have.
7. ~~**Boss health ratios** between fights.~~ **Read and not taken** — neither
   the ratios nor even the order survive a sweep, and why is worth reading.
8. ~~**The source's own extra credit**: its achievement criteria.~~ **Six of
   eight taken.** The other two ask about a moment inside a fight.
9. ~~**The rooms' sizes**, off the same boundaries their shapes now come from.~~
   **Taken** — every fight's floor is its own `BossBoundaryData` entry at
   `BUILD_SCALE`.
10. ~~**What the trash actually is**: kind, size, speed and kit, per body.~~
   **Taken** — thirty-seven creatures where there was one, in `src/sim/trash.ts`.
   See above for the two columns that had to be handled rather than copied.
   That is the last item on this list.

### The boundary the room already had, which nobody had looked up

Two rooms were measured off the client's map tile because at the time they held
no fight, and a room with no fight in it has no `BossBoundaryData` entry to
read. Then both were given fights, and nobody went back to the table.

| room | what it was built from | what the source's own boundary says |
| --- | --- | --- |
| the dreaming hall | the frostwing tile: a circle 101.6 yards across | `RectangleBoundary(4112.5, 4293.5, 2385.0, 2585.0)` — **181 by 200 yards**, and a rectangle, so a hall |
| the frost queen's lair | the same tile: a circle 103.2 yards across | `EllipseBoundary(Position(4408.6, 2484.0), 100.0, 75.0)` — **200 by 150 yards** |

Both are nearly twice what the tile was read as. That is the same lesson as the
first fight's half-disc, pointed the other way: the tile is a picture of the
*floor* of a hall, and the boundary is the box the instance will let a fight
happen inside, which is the thing a fight's floor is here. So the ninth fight's
room went from a circle a quarter of the hall to the widest floor on the
roster — which is what issue #35 claimed it should be, arrived at from the
other end.

**The rule that follows: the day a room is given a fight, look its `DATA_` up
before touching its shape.** The tile is what a room is measured from only
while nothing fights in it.

### What is standing in the building that this game does not have

Counted off `creature` on map 631 against `src/sim/trash.ts`, hostile elites
only — every body with a hostile faction and a rank above nought. Three are
missing and each is a different kind of missing:

| | rows | where | what it is |
| --- | --- | --- | --- |
| **Sister Svalna** | 1, at (4356.7, 2484.3) | between the Ymirjar column and the dreaming hall | not trash: `boss_sister_svalna`, with a `BossBoundaryData` entry of her own — `RectangleBoundary(4291, 4423, 2438, 2653)` — and four Argent captains and Crok Scourgebane standing with her as an escort. An eleventh fight the roster does not have and the only one the source hands over already bounded. Her row: `HealthModifier` 200 against The Damned's 38, `CombatReach` 12, `speed_run` 2.28571 — the fastest thing in the building bar the two drakes. |
| **Val'kyr Herald** | 2, at (4430.4, 2768.6) and (4323.0, 2737.5) | inside the Upper Crossing | ordinary trash by its row — HM 80, reach 4, `speed_run` 1.07143, melee, and `npc_icc_valkyr_herald` casts Severed Essence every 25 seconds on two of the raid at ten and four at twenty-five, which summons a copy of whoever it hit. Left out **on purpose**: the hub is the one room in the citadel with nothing in it, because it is the one place the player is asked which way to go, and a room with a decision in it and a fight in it is a room with one of them. This is the only place the source and this building disagree about a body and the disagreement is deliberate. |
| **Risen Archmage** | 6, at (4182–4230, 2465–2505) | inside the dreaming hall | not trash either: they stand on the ninth fight's floor, which makes them part of that fight rather than something cleared before it. `saved` sells its wave as `adds` and the one that comes back wrong as `empower`; these are the bodies those are. |

Ambient rows are not on the list and are not missing: the three Spire Frostwyrms
circle the lower spire and cannot be attacked.

### The building's own furniture, off `gameobject`

A hundred and eleven rows on map 631, and most of them are not furniture — they
are the doors, the sigils, the six transporter pads and the four instance
portals, all of which this game holds as gates and pads rather than as things
in a room. What is left that a room could actually be *dressed* with is small
and it is nearly all in two places:

| where | rows | status |
| --- | --- | --- |
| the great hall | two forges and their coals, four anvils, four quenching barrels, eleven stacks of saronite, the runeforge | **taken** — see `vigil`'s `terrain` |
| the frozen throne | `Doodad_IceShard_standing01`–`04` at (473.7, −2096.5), (473.7, −2152.8), (533.6, −2152.8), (533.6, −2096.5); `Arthas Platform` and `Arthas Precipice` at (503.6, −2124.7); `Frozen Lavaman` and its two pillars at (426.6, −2123.9) | **not taken** — the room has no fight yet (#13) |
| everywhere else | three Empowering Blood Orbs in the crimson hall, a plague sigil, two sets of tubes, a grate | not taken, and mostly not wanted: an orb is a mechanic there, not a rock |

The throne's rows say one thing worth writing down before #13 is built: **the
props do not fit the room as it is currently measured.** The four shards sit
about 41 yards out from the platform's centre and the frozen throne itself 77,
against a tile reading that makes the whole shelf 114.6 yards across — so at
`BUILD_SCALE` the shards land inside the room and the throne lands outside it.
There is no `DATA_THE_LICH_KING` boundary to settle it with; that is the one
fight in the building the boundary table does not carry. Whoever builds #13
measures that room again, and the object rows are the better ruler.

## How to take a measurement off a picture

The point of the list below is that a number can be taken again by somebody
else and come out the same.

1. Fetch the sheet and say where it came from, in the note that uses it.
2. Find the ruler before measuring anything: a span on the sheet whose length
   in yards is known from somewhere that is not the sheet — a world rectangle,
   an area trigger, two scripted positions. Never a span that is itself being
   measured.
3. Crop the part being measured and draw a coordinate grid on it, rather than
   reading a shape by eye. Every number in the table above is a gridline.
4. Write down what each colour or texture *is*, from somebody who has been
   there. This is the step that was skipped, and it is the only step on this
   list that a picture cannot answer on its own.
5. Put the result in the note beside the constant, with the sheet, the ruler
   and the pixels — so the next person can disagree with the arithmetic rather
   than with the conclusion.
