# Abyss

**[Play it](https://kyhsa93.github.io/abyss/)**

A browser raid-boss prototype. You build a party of five from eight classes,
play one of them, and the other four are AI. No assets, no server, no network:
everything is shapes, timers and a deterministic simulation.

## Run it

```bash
npm install
npm run dev
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.
The workflow runs `npm run check` before building, so a broken encounter or a
type error blocks the deploy.

The raid screen comes first: pick a size (5, 10 or 25), a difficulty, then
fill the slots — or use the fill buttons, because setting twenty-five one tap
at a time is nobody's idea of a game.

**AUTO** builds the balanced composition for the size. **RANDOM** rolls one:
the role counts are kept, everything else is chance — which classes fill them
and where they stand. Drawing all five classes freely would leave you without
a tank about half the time, since only one class in eight tanks, and a pull
that cannot be won is a penalty rather than a surprise. Random raids come out
a little harder than balanced ones and entirely playable: 68% on a first
five-man pull against AUTO's 65%, 18% rising to 88% at twenty-five. Your party
is remembered between visits, so a return trip is one tap.

`WASD` to move — `Q` and `E` strafe left and right alongside `A` and `D`, since
there is no facing here for them to turn — `1` `2` `3` `4` for abilities, `R`
to pull again, `Esc` to go back
to the party screen. The keys are not printed on screen — the retry button
names its own shortcut and the rest is a raid game's standard layout. On touch there is a `party` button under the fight
readout. Leaving without changing anything keeps your pull count, since the
AI's learning is tied to how many times *these* five have pulled.

A press that cannot go out says why. Cooldowns and empty mana are already
drawn on the button, so the one reason nothing on screen was giving is being
too far away: the slot turns red while the target is out of reach, and
pressing it anyway prints `Out of range` over your character rather than doing
nothing, which is what a broken button also does. It costs no cooldown, so the
answer is to walk in and press again.

The party frames down the left are a grid of parties rather than one long
column: a party is a column read top to bottom, and the columns run left to
right three at a time before wrapping, so a ten-man is two columns side by
side and a twenty-five man is three and then two underneath.

The block is capped at half the screen height, and everything else follows
from that — the frames are as tall as half a screen divided by the rows they
have to hold, and as wide as that height allows at a fixed shape, so a frame
is never long and thin on one screen and square on another. Narrower than
three columns is only considered once three has been squeezed past legibility,
and then only if it actually comes out bigger: on a short screen fewer columns
means more rows, which is worse in the direction that is already binding. They
used to be a flat 108-150 by 46-70 whatever the screen and whatever the raid,
which was a five-man's frames worn by a twenty-five man and ran two screens
off the bottom.

On a touch device the controls are there from the start: a translucent stick
on the left that relocates to wherever you press, ability buttons down the
right edge, and a tap on the end-of-fight overlay to pull again. The canvas
fills the viewport and the layout is recomputed per orientation, so portrait
and landscape both work.

The top right corner carries a minimap and the bottom right a live meter. The
minimap is the whole floor at map scale — fire, boss, thralls, everyone else —
with a box marking the part of it currently on screen, which is the only thing
that tells you how much of the arena the camera is not showing you. The meter
ranks the raid on damage plus healing, the same way the after-action report
does so a healer is not permanently last, and your own row is always on it
even when you are twenty-fifth of twenty-five. Where the meter sits depends on
what is already in the corner: the thumbs own it on touch, and the centred
action bar reaches it in portrait without them, so it sits above whichever is
on screen and takes the corner itself only on a wide keyboard layout.

The camera is locked to your own character rather than to the arena: your
token stays in the middle of the viewport and the floor scrolls under it. In
a twenty-five player pull, finding yourself was the slowest thing on screen.
The middle of the viewport is not the middle of the arena — the arena is laid
out to fit between the top band and the thumbs, which on a portrait phone put
its centre in the upper third of the screen — so the arena's size now sets the
zoom and nothing else.

## Why it looks like this

Hardcore raiders barely look at boss models. They watch timer bars, debuff
icons and raid frames. The information a raid encounter actually runs on is
already abstract, so this prototype renders exactly that and nothing else.

## Design

**The boss is a script, not an AI.** A boss that improvises cannot be learned,
and learning the script is the entire genre. `src/sim/boss.ts` is a fixed
timeline with hard phase transitions. The only randomness is *who* gets
targeted, which keeps pulls from being identical without making them
unlearnable.

**The party members are AI, and their job is to look human.** `src/sim/ai.ts`
scores candidate positions and actions in three layers — stay alive, do your
role, fill with damage. A perfect bot reads as a robot, so on top of that sits
a humanity layer:

- reaction delay before danger is acted on, rolled per danger rather than per tick
- fumble rolls that make a tank occasionally eat a slam it could have blocked
- personalities (`steady`, `greedy`, `timid`) that shift panic thresholds
- a clustering term that pulls each member toward the group instead of toward
  the mathematically optimal tile

They also get sharper every pull, because real groups learn a fight by
repeating it.

## Size and difficulty

A raid is built from parties of five: ten is two parties, twenty-five is five.
They stand together in the arena and the roster screen lists them one row per
party, because grouping has consequences — a puddle dropped on one party is a
puddle on five people.

Support is capped for the whole raid rather than per party: **one or two
tanks, one to three healers.** More tanks than that is wasted on a
single-target fight, and the healer ceiling is what stops a larger raid simply
out-healing the encounter. Both caps are enforced rather than advised: a
third tank or a fourth healer cannot be selected on the party screen at all —
the entry is drawn locked — and a roster saved before the caps existed falls
back to the default instead of loading.

**A five-man is exact rather than capped: one tank, one healer, three
damage.** There is no arrangement of five slots that plays, so picking a role
there is read as a trade — tap a tank into your own slot and the slot that was
tanking takes the one you gave up. Refusing it instead would freeze the
composition, since a fixed shape has no legal intermediate state to pass
through and the player could never move off the role they started on.

So a twenty-five man is mostly damage, and it works out because the extra
damage shortens the fight rather than adding survival — 25-player normal wins
25% of first pulls rising to 70%, against a five-man's 45% to 65%.

Mechanics scale with headcount. A fixed number of puddles across twenty-five
players means any one player is almost never targeted, so without scaling the
bigger raid would be the easier one — puddles and spread marks both go up with
the roster, and adds come in larger waves.

Boss health is not linear with headcount either: larger groups lose
proportionally more time to mechanics, so a flat multiple per player would
again make 25 the soft option.

**Heroic raises boss health and nothing else**, which sounds thin and is not.
Tuning it revealed that fight length *is* the difficulty here: time spent
dodging is damage not dealt, which lengthens the fight, which brings round
more mechanics and drains more healer mana. Every attempt to also raise damage
or mechanic frequency took the win rate from 80% to 0% with nothing in
between — survival turns out to be a cliff, not a slope. It holds until
healing throughput is exceeded, then collapses.

| | 1st pull | 9th pull |
| --- | --- | --- |
| 5-player normal | 35% | 55% |
| 5-player heroic | 5% | 5% |
| 10-player normal | 60% | 90% |
| 10-player heroic | 15% | 40% |
| 25-player normal | 25% | 70% |
| 25-player heroic | 0% | 15% |

Five-man heroic is the hardest thing in the game: the same difficulty
multipliers with none of the slack a larger roster brings.

## Classes and roles

Most classes fill more than one role, and a class in a different role is a
different character: its own abilities, its own health and its own armour. A
protection warrior and an arms warrior share nothing but a name.

| Class | Tank | Heal | Damage |
| --- | --- | --- | --- |
| Warrior | ✓ | | ✓ |
| Paladin | ✓ | ✓ | ✓ |
| Druid | ✓ | ✓ | ✓ |
| Priest | | ✓ | ✓ |
| Shaman | | ✓ | ✓ |
| Mage | | | ✓ |
| Hunter | | | ✓ |
| Rogue | | | ✓ |

Fifteen combinations in all, and the raid screen lists them individually
rather than asking you to pick a class and then a role.

Rotations are shared per role; what differs is the numbers and the cast times.
That is enough to change how something plays — the hunter is entirely instant
and keeps damaging while it repositions, the mage's finisher is a 2.5s cast
that competes directly with dodging, and the rogue has to be next to the boss
to do anything at all.

The three tanks are not interchangeable either:

| | Health | Armour | Block | 540 swing lands as |
| --- | --- | --- | --- | --- |
| Warrior | 6200 | 50% | 260 | 138 |
| Paladin | 5800 | 49% | 240 | 153 |
| Druid (bear) | 9200 | 56% | — | 237 |

A flat block is worth a great deal against a fast weapon, so the druid pays
for having none with a far larger pool: harder to spike down, more of a drain
on the healers. Tuned to within a few points of each other in practice — a
druid-tank, shaman-healed five-man wins 58% by the ninth pull against the
default composition's 72%.

## Defence

Armour is a rating run through `armor / (armor + 9000)`, so it diminishes and
never approaches immunity. Shield carriers also remove a flat amount before
mitigation, which is worth more against many small hits than one large one —
the shape of a tank's job.

It only applies to the boss's weapon. Mechanics are magic and ignore armour
entirely, so a plate tank and a cloth caster take a puddle equally. The tank's
role is to stand in front of the swings, not to be immune to the fight.

That gap is the whole point:

| | 540 swing lands as | swings to die |
| --- | --- | --- |
| Warrior | 138 | 45 |
| Hunter | 395 | 9 |
| Mage | 491 | 6 |

A dealer that pulls threat has about ten seconds to live, which is why the
threat readout is on the party frames.

**Threat is taken, not handed out.** The table starts at zero for everyone,
including the tank, so the first thing a pull needs is somebody to take the
boss: every tank carries a taunt on its fourth slot — Taunt, Hand of
Reckoning, Growl — and it sets you a nose ahead of whoever the boss is
currently looking at rather than granting a pile of threat. Taking it back is
free; keeping it is the job. Tanks only taunt off a non-tank, so two of them
in a raid do not trade the boss back and forth across the melee on cooldown.


Rotations are shared per role; what differs is the numbers and cast times.
That is enough to change how a class plays — the hunter keeps damaging while
it repositions, the mage has to choose between its cast and the puddle, and
the rogue has to be next to the boss to do anything at all, which is why it is
reliably the one standing in fire.

Personality belongs to the slot rather than the class. Kestrel gambles on long
casts with a telegraph already on the floor and reacts late; Wren bails early
and overheals.

**Classes run on four different resources.** Warriors and bear druids on rage,
rogues and cat druids on energy, hunters on focus, everyone else on mana, and
every ability is paid for out of it. The resource sits on the spec rather than
the class, because one druid answers four different ways: rage in bear form,
mana as a caster, energy as a cat, mana again healing. What you are playing
decides it, not what you picked on the roster.

That is also why a pick names a spec rather than a role. The druid deals
damage two ways — Balance casts at range on mana, Feral swings a weapon on
energy — so "druid, dps" stopped being an answer to which character you meant.
Rosters saved before specs had names are migrated on load rather than thrown
away: a class and a role still identify the spec that existed when they were
saved.

They are three different problems, not one bar in three colours. Mana is a
budget for the whole fight: a caster spends faster than it regenerates and the
question is whether it lasts to the kill. Energy and focus refill on their own
at a rate that covers roughly a filler per global cooldown, so you are never
short of them for long, only right now — the question is whether you can
afford the expensive button as well. Rage is neither. It starts at zero and is
earned by landing weapon swings and by being hit, so a warrior opens a pull
able to do nothing at all, a tank being hit every couple of seconds ends up
with more than it can spend, and a warrior who cannot reach anything stays
poor. Ground damage is silent and lands thirty times a second, so it pays
nothing: standing in fire is not a rage generator.

Defensives and taunts are free. They are the answer to a mechanic, and an
answer that is sometimes unaffordable for a reason the button cannot show is
worse than having no resource at all.

**Weapons swing on their own.** Melee specs hit whatever is in reach every
three seconds and the hunter shoots from spell range, as physical damage, on
no global cooldown and with no press — white damage is what happens while you
are busy deciding, and without it a rogue standing in melee between presses
was doing literally nothing. Casters have none: a wand plink is not the
fantasy and not worth the numbers it would put on screen.

It is sized against what the party actually does rather than against the
ability tooltips. The AI loses damage to reaction delay and to walking out of
puddles; a weapon loses none, so white damage lands at nearly full uptime and
is worth far more per point than it looks. At fifty a swing it is about a
sixth of an auto-attacker's own output and a seventh of the raid's.

**Hits crit.** Fifteen percent of the time, for half again as much, marked as
a crit in the floating text — a kind the text has carried since long before
anything emitted one. They are the party's alone: incoming damage is the
healers' problem, and a boss that occasionally hits half again as hard makes
that a coin toss rather than a job. Mechanics never crit either, for the same
reason. A crit throws a wider burst with more spokes and shoves the view,
which is the only thing on screen that moves the camera; it falls off inside a
fifth of a second, because a shove that outlasts the hit reads as the game
stuttering. The world is shoved and the interface is not — a heads-up display
that shakes is one nobody can read.

Boss health went up seven and a half percent with them, the same as the damage
they add, so the encounter is the length it was.

**Bolts have a trail and a halo.** The trail is the last few places the bolt
was, thinning toward where it came from, and it lives in the renderer keyed by
projectile id — decoration has no business in a state that has to replay
identically. The halo is a radial gradient rather than a flat disc, which is
the difference between light and a circle of paint.

**A cast is drawn on the caster.** A ring gathers inward as it runs and a dial
fills clockwise around the token, which is the same number as the cast bar on
the party frame put where you are actually looking. Gathering rather than
expanding is the rule that keeps it readable: everything that leaves a token
is something that already happened, so something about to happen has to close
in. Completing it throws the ring off in the caster's colour; breaking it
collapses the ring back into them instead, so a cast that came apart never
looks like one that went off.

**Only your own numbers float.** What you dealt and what landed on you —
either end counts as yours. Twenty-four other people trading hits is a wall of
numbers over a fight whose actual state is already on the party frames and the
meter, which is the same reason only your own hits make a sound. The report at
the end still counts everything.

**Hits have a picture.** Every ability that lands and every weapon swing
queues an effect, and the renderer draws it from three primitives: a ring
expanding out of the hit, spokes radiating from it, and an arc where a melee
swing went. Bigger hits reach further, on a square root — a finisher deals ten
times a filler and drawing that literally would black out the arena. Heals
close inward instead of detonating.

The effects live in the renderer, not the simulation, for the same reason the
sound does: a pull replays identically from its seed, and particles ageing
inside the state would make that untrue. The simulation emits what happened on
a channel drained every tick, exactly as it does for sound, and the harness
never sees any of it.

They are drawn additively, which is the one thing that makes flat shapes read
as energy rather than as paint, and there is a cap on how many can be on
screen — a twenty-five man swinging and casting at once queues more than
anyone can read, and the oldest go first so the hit you are looking at is
never the one dropped.

**Every bolt is the colour of its own ability.** Fifty-one spells were flying
as four colours of dot; the table that tells them apart already existed, since
every ability needs a distinct icon. The shape and speed still come from the
kind of bolt it is, the colour now comes from the icon — thirty-four distinct
colours across the thirty-six abilities that put anything in the air.

**Ranged casts throw a bolt, and the bolt is the hit.** It leaves on the press
and resolves where it lands, roughly four tenths of a second later across a
spell's range, so range costs something now: a shot at a thrall about to die
is wasted, a heal can arrive after the person it was for, and two healers can
both be mid-flight on the same target. It used to resolve the instant the
ability did, with the bolt flying after damage that had already happened —
scenery rather than a mechanic. Its shape and speed still come from what the
ability is (heal, damage-over-time, finisher, filler) so a new spell gets one
automatically, its colour comes from the ability's own icon, and it lives in
simulation state rather than in the renderer, so replays stay frame-identical.

Anything used in melee or on yourself still lands on the press: there is
nothing in the air to wait for. A hunter's auto shot is the exception that
proves the rule — its damage happens where the hunter stands and the bolt is
drawn after the fact, so it carries no payload and lands nothing.

**Distances are all relative to the arena.** The floor has a world radius of
460 and everything else is expressed against it — ability ranges, the AI's
sampling rings, puddle size, how far out adds spawn. Widening the floor without
widening those just spreads the party out of range of each other, so they move
together. The renderer takes the radius from the simulation rather than
keeping its own copy, which is the sort of pair that silently drifts.

**The simulation is deterministic.** Fixed 30 Hz timestep, seeded PRNG, stable
iteration order, render interpolation on top. A frame that falls behind drops
the backlog rather than replaying it: catching up is visible as the fight
running at several times speed, which is worse than losing the time. The clock
lives in `src/loop.ts` as a pure function so that behaviour can be tested,
because getting it wrong does not throw — it just runs at the wrong speed. `Math.random()` is never called
inside `src/sim/`. That is what keeps replays, leaderboard verification and a
future server-authoritative port possible.

## Encounter

The Drowned Warden, phase transitions at 70% and 40% health.

| Mechanic | What it asks of you |
| --- | --- |
| Abyssal Slam | Tank cooldown, or the tank takes a large hit |
| Puddles | Move out fast; the warning is short and they linger |
| Tidal Breath | A frontal cone — get out of the front, or behind it |
| Shockwave | An expanding ring. It outruns you, so the answer is **in**, not out |
| Spread | The target walks away from everyone else |
| Thralls | Summoned adds beeline for the nearest body; dealers switch to them |
| Crushing tide | Unavoidable party damage — the floor under the healer |
| The boss itself | Faster than the whole party; you cannot outrun it |
| Enrage at 180s | A hard damage check |

Each one asks for something different, which is what stops the fight being a
single dodge repeated: puddles say leave where you stand, the breath says get
behind, the shockwave says come in, spread says separate, adds say switch
targets, and the tide asks nothing at all except that the healer kept up.

Only the tide cannot be dodged, and that is deliberate: a party that dodges
well takes almost nothing else, so without a floor of damage the healer is
never tested and the only failure mode left is the enrage timer.

Because it cannot be dodged it has to be legible, or losing health right after
stepping out of a puddle reads as a broken hitbox. It gets a countdown above
the arena, a pulse when it is about to land, and a screen flash when it does.
Residual puddle damage is silent by design, so anyone standing in fire is
ringed in red instead.

The puddle hit test allows a little grace at the rim — your token has to be
meaningfully inside, not merely overlapping the edge.

Your `Burst` has a two-second cast and movement cancels it, so the real
decision is when you can afford to stand still. A cancelled cast costs
nothing: mana is only spent when a cast resolves, and the cooldown is handed
back the moment it breaks. Charging for a spell that never went off made
standing in the fire the cheaper play, which is the opposite of the decision
the cast time is there to create.

## Installable and offline

The game ships as a PWA. Everything runs client-side, so once it is cached
there is nothing left to be online for — it is fully playable in airplane mode.

Freshness is handled in two layers, because a cache-first PWA will happily
serve a build that was replaced weeks ago:

- the worker fetches the page itself network-first, with a 3s timeout falling
  back to the cached shell, so a launch with any connection at all gets the
  current build. Hashed assets stay cache-first — a changed file has a
  different name, so a hit can never be stale.
- `sw.js` is registered with `updateViaCache: 'none'` and updated on load, and
  the page reloads once when a new worker takes over. The first visit is
  excluded, so nobody gets bounced on arrival.

Icons are generated, not drawn: `python3 scripts/make-icons.py` renders them
from the same shapes the game uses. The PNGs are committed; rerun it only if
the palette changes.

## Development

```bash
npm run check        # types, then headless render pass, then balance harness
npm run harness      # win rate and puddle-uptime by attempt number
npm run rendercheck  # draws every frame against a stub canvas, asserts controls land on screen
npm run touchcheck   # pointer and key mapping, joystick vector, multi-touch, layout bounds
npm run pwacheck     # manifest, icons, precache list and offline shell (runs in build)
npm run build
```

The harness is the main tool here. Tuning AI or balance without measuring it
produces party members that feel wrong in ways that are hard to name, so every
change to `ai.ts`, `boss.ts` or ability numbers should be followed by a run.

Since the party is now chosen, the harness runs several compositions —
including bad ones — with a deliberately mediocre scripted player, 24 runs per
cell:

60 runs per cell — an earlier 24 was small enough that the noise read as a
trend:

| Composition | 1st pull | 5th | 9th | avg time |
| --- | --- | --- | --- | --- |
| 1 tank, 1 healer, 3 damage | 62% | 78% | 87% | 122s |
| 1 tank, 2 healers, 2 damage | 40% | 43% | 53% | 226s |
| 1 tank, 0 healers, 4 damage | 7% | 13% | 10% | 79s |
| 0 tanks, 1 healer, 4 damage | 0% | 0% | 0% | 75s |
| all melee | 23% | 42% | 50% | 129s |
| all caster | 48% | 68% | 78% | 132s |
| druid tank, shaman healer | 28% | 52% | 57% | 124s |

Two healers works but grinds against the 240s enrage. Dropping the tank or the
healer entirely does not work at all, which is the intended shape. All-melee is
still the worst real composition, for the same reason it is a bad idea in the
real thing — everyone is stacked in the one place the boss is aiming — but it
is no longer close to unplayable: weapons swing whether or not you are in
position to press anything, and melee are the ones carrying them, so the gap
to all-caster closed from fifty points on a first pull to twenty-five.

Per-member detail for the default composition, `puddle uptime / units walked
per second`:

| Attempt | Bastion | Wren | Kestrel | Vale (rogue) |
| --- | --- | --- | --- | --- |
| 1st pull | 0.45% / 16 | 0.60% / 17 | 0.73% / 13 | 1.46% / 26 |
| 9th pull | 0.19% / 17 | 0.30% / 18 | 0.40% / 16 | 1.11% / 30 |

Two things are being watched here, and neither shows up in the win rate.

**Puddle uptime must stay ordered** — tank lowest, greedy dealer highest. If it
flattens, the humanity layer has stopped mattering and everyone is playing
identically well.

**Distance walked must stay low.** An earlier version had the party return to a
fixed home position whenever the floor cleared, and because that home was
defined relative to a moving boss, they chased it forever: the healer walked 70
units a second, pacing back and forth all fight. It looked busy and read as
broken. Movement is now only for danger and for genuinely being out of range.
