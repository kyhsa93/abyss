# Direction

What the playtest job currently believes is wrong with this game, and what would
show it wrong. `docs/playtest.md` says how this file is kept; the short version
is that every session either confirms a line, sharpens it, or drops it, and
seven standing lines is the cap.

Seeded on 2026-09-24 by the round that built the job, from two pulls. Two lines
is a start, not a view — most of this file has to be earned by playing.

## Standing

### 1. Doing nothing wins, so nothing you do is a decision

A pull of Marrowgar, ten players, heroic, frost mage, `play idle 70` — no
presses, no movement at all:

```
played style=idle seconds=70 outcome=ongoing fightTime=68 phase=2
  aliveParty=10/10 heroHp=695/1305 bossHp=45% presses=0 inDanger=8%
```

Seventy seconds of pressing nothing took the boss to 45%, cost the raid nobody,
and left the player at half health with the fight comfortably on track. The AI
party carried it, which is the mode working, but it means the one body a person
steers is not load-bearing.

**Disproved by** any cell where `idle` loses and `good` wins, at the same boss,
size and difficulty. Find one and this line narrows to the bosses it holds for
rather than the game.

**Watch out for** the honest counter-argument: the third law says nothing on the
character gets stronger and the AI has to read as a person, and a raid that
wipes without the player would be a raid of bots that cannot play. The finding
is not *the AI is too good*; it is that the player's presses have no visible
consequence. Those want different fixes.

Related: the fun diagnosis round already found ten-player normal winning from a
standing start. This is the same shape one difficulty up, which is worse.

### 2. The walk in and the fight are the same screen, and the player cannot tell

`screen()` says `fight` while the party is walking a corridor, while a boss is
up, and while a wipe is on the glass. The hook needed a second question —
`mode()` — before a driver could tell them apart, and a driver that watched only
`screen` stood in a room for fifteen minutes believing a fight it had never
started was still going.

A driver is not a player, so this is not automatically a bug. But the driver's
confusion came from the screen, and the screen is what the player has too.

**Disproved by** a session that reaches a boss by walking, from a fresh save,
and can say at every moment which of the two it was in from the picture alone.
Take the shots and look.

## Not yet filed

Findings with nowhere to go yet: either the issue gate was shut when they turned
up, or they have only been seen once and once is an observation. A line here
either becomes an issue, gets promoted to a standing hypothesis, or goes to
*Tried and dropped* with the reason.

Nothing yet.

## Tried and dropped

Nothing yet. When a line comes off the list it lands here with the reason, so it
does not get re-raised in a fortnight.
