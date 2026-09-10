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

The *cadence* does not, and this is the largest single thing the data could
still settle. `boss_lord_marrowgar.cpp` schedules its events outright:

| | source | here, phase one → three |
| --- | --- | --- |
| Coldflame | 5s, from 5s in | 13s → 9.5s |
| Bone Spike | 15s, then 15–20s | 27s → 21s |
| Bone Storm | warned at 45–50s, then every 90–95s; twenty seconds long at ten, thirty at twenty-five; the boss moves at three times its own speed and re-picks three times | one beat, 62s → 50s, re-picked every 5s |
| the tank's cleave | enabled at 10s | slam, 19s → 15s |
| enrage | 10 minutes | 240s |

Lady Deathwhisper's are in the same shape: waves every 60s at ten and 45s at
heroic (here 44s → 34s), Frostbolt every 12s (here 21s → 16s), the volley
every 20s (here 12s → 9s), Insignificance every 6–9s (here 10s → 8s), a shade
every 12s (here 26s → 20s).

Two of those are backwards — this game throws the volley twice as often as the
source and a shade half as often — and neither was a decision. They came out of
tuning a fight nobody had the source's numbers for.

### Deliberately different

- **Health.** Forty-six thousand against a boss with about a million. The raid
  here is five to twenty-five bodies with this game's own damage; the bar is
  sized against them.
- **The ladder.** The source varies a fight by raid size and difficulty inside
  one script (`RAID_MODE`); this game sells whole mechanics by rung.
- **Names, and every line spoken.** The rule from the round that took these
  fights: the shape comes across and the name does not.
- **Scale.** The building is at `BUILD_SCALE` and there is no elevation, so a
  ramp is a room and a stair is a doorway.
- **Ranged reach.** Eighteen yards against the source's forty, for the reason
  written on `SPELL_RANGE`.

### Everything the source will give, and what has been taken

Four places hold it. Three are public and machine-readable; the fourth is the
one that answers what nobody can.

**TrinityCore's scripts** — `src/server/scripts/Northrend/IcecrownCitadel/`,
seventeen files, what the instance *does*:

| | status |
| --- | --- |
| boss boundaries — the shape of every fight's floor, as circles, rectangles, ellipses and one parallelogram | **taken** for the first fight |
| doors, and what opens them: `DOOR_TYPE_ROOM` while a fight runs, `DOOR_TYPE_PASSAGE` once it is done | **taken** — the two ice walls |
| the spirit alarms and the stoneform they take off | **taken** |
| every ability's schedule: first cast, repeat, and the `RAID_MODE` and `IsHeroic()` variants | available — the biggest thing left |
| what ends a phase: a health share, a mana bar, blood power, an air phase | available |
| what the adds are and what *they* cast | available |
| the achievement criteria — "nobody impaled", "all five kinds alive at once" | available |
| every line spoken | not wanted: the names here are this game's own |

**AzerothCore's world database** — `data/sql/base/db_world/`, where everything
stands:

| | rows for this raid | status |
| --- | --- | --- |
| `creature` — every spawn, with position | 597 on map 631 | **taken** for the way to the first fight (133) |
| `gameobject` — every object, with position | 111 | **taken** for the great hall and the alarms |
| `creature_template` — name, rank, scale, speeds | all of them | **taken** for the first boss's pace |
| `creature_model_info` — bounding radius, combat reach | all of them | **taken**: it is the yardstick |
| `creature_addon` — auras and patrol paths | 5 of the 597 | available, and small: this raid stands still |
| `waypoint_data` — the paths those five walk | 5 paths | available; nothing here patrols yet |
| the rest of the building: the Oratory (67), the ramparts (66), the plagueworks (62), the crimson hall (23), the frostwing halls (112) | 330 | available |

**The client's own tables** — what the emulators do not carry, published at
wago.tools and readable through Wowhead's WotLK tooltip endpoint
(`nether.wowhead.com/wotlk/tooltip/spell/<id>`):

| | example | status |
| --- | --- | --- |
| a spell's range, cast time, duration and tick | Death and Decay: 200 yd, instant, 6000 shadow a second for 10s | available — and it is exactly the class of number this game tunes by hand |
| a spell's radius | some state it, some say "the affected area" | partly available |
| map tiles and the world rectangle each covers | the sheet this file's first table came off | **taken** |

**And what nothing gives.** The floor itself. Walkable geometry lives in the
client's WMO models and the navmesh built from them, so every room here is a
convex approximation of a shape no table describes — and elevation with it,
which is why a ramp is a room and a stair is a doorway.

### In the order it is worth taking

1. **Every fight's cadence**, from its own script. Thirteen of them, all in the
   same shape as the two read here, and the two that were read turned up two
   values this game had backwards.
2. **Phase triggers**: what actually ends a phase there, against three phases
   on a timer here.
3. **What the adds are.** Cult Fanatics and Adherents have kits of their own —
   Necrotic Strike, Shadow Cleave, Vampiric Might, Deathchill Bolt — and this
   game's waves are bodies with a health bar.
4. **The rest of the building's trash**, the same way the first corridor's was
   taken: 330 spawns, already clustered by room.
5. **Spell numbers** from the client tables — radius, duration, tick — which is
   the one source that can settle a mechanic's size rather than its shape.
6. **The teleport pads**, at the source's own coordinates.
7. **Boss health ratios** between fights, even where the absolute numbers
   cannot be used.
8. **The source's own extra credit**: its achievement criteria are goals
   already designed for these fights.

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
