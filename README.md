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

The party screen comes first: pick a slot, pick a class, hit PULL. Your party
is remembered between visits, so a return trip is one tap.

`WASD` to move, `1` `2` `3` for abilities, `R` to pull again, `Esc` to go back
to the party screen. On touch there is a `party` button under the fight
readout. Leaving without changing anything keeps your pull count, since the
AI's learning is tied to how many times *these* five have pulled.

On a touch device the controls are there from the start: a translucent stick
on the left that relocates to wherever you press, ability buttons down the
right edge, and a tap on the end-of-fight overlay to pull again. The canvas
fills the viewport and the layout is recomputed per orientation, so portrait
and landscape both work.

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

## Classes

| Class | Role | Armour | Phys. reduction | Health | Notes |
| --- | --- | --- | --- | --- | --- |
| Warrior | tank | plate | 50% + 260 block | 6200 | The only thing that survives a swing |
| Paladin | healer | plate | 42% + 150 block | 4600 | Slower, bigger heals and an emergency button |
| Priest | healer | cloth | 9% | 2900 | Sustained, leans on a heal-over-time |
| Druid | damage | leather | 20% | 3400 | Instant dot, one long finisher |
| Shaman | damage | mail | 27% | 3600 | Middling everything, short-cast finisher |
| Mage | damage | cloth | 9% | 2900 | Highest burst, on a 2.5s cast |
| Hunter | damage | mail | 27% | 3600 | Entirely instant; never stops damaging |
| Rogue | damage | leather | 20% | 3400 | Highest sustained damage, from melee |

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


Rotations are shared per role; what differs is the numbers and cast times.
That is enough to change how a class plays — the hunter keeps damaging while
it repositions, the mage has to choose between its cast and the puddle, and
the rogue has to be next to the boss to do anything at all, which is why it is
reliably the one standing in fire.

Personality belongs to the slot rather than the class. Kestrel gambles on long
casts with a telegraph already on the floor and reacts late; Wren bails early
and overheals.

**Ranged casts throw a visible bolt.** Damage still resolves the instant the
ability does — the bolt is a tell, not a mechanic, and the balance numbers are
identical with and without it. It homes on its target and lives in simulation
state rather than in the renderer, so replays stay frame-identical. Without it
a caster standing still looks the same whether it is working or idle.

**The simulation is deterministic.** Fixed 30 Hz timestep, seeded PRNG, stable
iteration order, render interpolation on top. `Math.random()` is never called
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
decision is when you can afford to stand still.

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
npm run touchcheck   # pointer mapping, joystick vector, multi-touch, layout bounds
npm run pwacheck     # manifest, icons, precache list and offline shell (runs in build)
npm run build
```

The harness is the main tool here. Tuning AI or balance without measuring it
produces party members that feel wrong in ways that are hard to name, so every
change to `ai.ts`, `boss.ts` or ability numbers should be followed by a run.

Since the party is now chosen, the harness runs several compositions —
including bad ones — with a deliberately mediocre scripted player, 24 runs per
cell:

| Composition | 1st pull | 5th | 9th | avg time |
| --- | --- | --- | --- | --- |
| 1 tank, 1 healer, 3 damage | 25% | 42% | 54% | 142s |
| 1 tank, 2 healers, 2 damage | 8% | 25% | 17% | 264s |
| 1 tank, 0 healers, 4 damage | 0% | 0% | 0% | 80s |
| 0 tanks, 1 healer, 4 damage | 0% | 0% | 0% | 76s |
| all melee | 4% | 0% | 4% | 155s |
| all caster | 33% | 54% | 50% | 142s |

Two healers works but grinds against the 240s enrage. Dropping the tank or the
healer entirely does not work at all, which is the intended shape. All-melee is
close to unplayable for the same reason it is a bad idea in the real thing:
everyone is stacked in the one place the boss is aiming.

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
