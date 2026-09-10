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

## What was built from this, and what was not

The first fight's room is an `apse` now: half a disc a hundred and sixteen
yards wide and fifty-eight deep, the boss twenty-three yards in front of the
straight side, the drop along it. Walking off the straight side is a fall;
walking into the curve is a wall. The room's own bowl — floor *and* ice — is
what the plan keeps other rooms out of, because the ice is part of the chamber
even though nobody stands on it.

The walkway is a room called the Ledge, which is what a citadel of rooms and
doors can hold of a ramp: the way on leaves the first fight by the side of the
room, runs along a ledge past the ice, and turns in at the far end. It does not
climb, because nothing in this game does.

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
