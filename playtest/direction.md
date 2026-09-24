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

**2026-09-24, sharpened.** A second cell, further from the first: 10-player
*normal*, The Bonegrinder, protection warrior — the tank, the role with the
most to do if it does nothing. `open` -> walk in from the front page -> reach
the boss's own room -> `play idle 220`:

```
played style=idle seconds=220 outcome=ongoing fightTime=109 phase=1
  aliveParty=10/10 heroHp=2790/2790 bossHp=100% presses=0 inDanger=4%
```

`bossHp=100%` there is misleading on its own — it is reading the *next* pack
down the corridor, because the Bonegrinder was already dead. The state line
right after shows why: `mode` had dropped from `raid` back to `travel`, the
meter had reset to zero, and the boss's own health bar was gone from the
screen entirely. The tank killed the first boss of a normal-mode evening
without moving or pressing anything, at zero cost — full health at the end,
`inDanger` at 4%. Two cells now, two different bosses, two different roles,
same shape. Still no cell found where `idle` loses.

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

**2026-09-24, sharpened, leaning disproved.** Walked in from the front page on
a fresh save (touch, 390x844), from `threshold` through `vigil` into `spire`,
shooting at each chamber. `screen()` did stay `fight` the whole way, as
before. But the *picture* carried a signal the state variables do not: a
boss's name and health bar across the top of the screen only appears once
`mode()` is `raid` — the threshold and vigil shots, trash fight and all, never
draw one. So a player who knows to check for that bar can in fact tell travel
from a boss fight, reliably, without reading `mode()`. What is not yet tested
is whether a first-time player notices to look — this session already knew
what it was checking for. Narrowed rather than dropped: the confusion may be
the driver's problem more than the player's, but that needs a session that
plays *naively* to say for certain.

## Not yet filed

Findings with nowhere to go yet: either the issue gate was shut when they turned
up, or they have only been seen once and once is an observation. A line here
either becomes an issue, gets promoted to a standing hypothesis, or goes to
*Tried and dropped* with the reason.

**2026-09-24.** The vigil doorway's own overlay (`"N left in it"` / `"Ns till
standing"`) was still drawn at 269.7s into the session, with the room heading
reading `THE SPIRE` and `chamber()` agreeing — a whole room past where it
started. Sighted once, and only after a `walkto` dash that pulls just the
player forward through `vigil` and `spireway` far faster than the ten-body AI
party can keep up; the likely, non-buggy explanation is that the spring's
"most of the way up the passage" stop condition is checked against whichever
party member is furthest back, and a straggler left behind by a sprinting
player keeps it open. Worth a second look from a normal walking pace, not a
scripted dash, before this is trusted as a real finding.

## Tried and dropped

Nothing yet. When a line comes off the list it lands here with the reason, so it
does not get re-raised in a fortnight.
