# Abyss

**[Play it](https://kyhsa93.github.io/abyss/)**

A browser raid-boss prototype. A five-player group — one tank, one healer,
three damage dealers — takes on a scripted boss. You play one of the dealers;
the other four are AI. No assets, no server, no network: everything is shapes,
timers and a deterministic simulation.

## Run it

```bash
npm install
npm run dev
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.
The workflow runs `npm run check` before building, so a broken encounter or a
type error blocks the deploy.

`WASD` to move, `1` `2` `3` for abilities, `R` to pull again.

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

The party:

| Member | Role | Personality |
| --- | --- | --- |
| You | damage | — |
| Bastion | tank | steady |
| Wren | healer | timid |
| Kestrel | damage | greedy |
| Vale | damage | steady |

Personality is not cosmetic. Kestrel gambles on long casts with a telegraph
already on the floor and reacts late, so it out-damages the others and is
reliably the one standing in fire. Wren bails early and overheals.

**The simulation is deterministic.** Fixed 30 Hz timestep, seeded PRNG, stable
iteration order, render interpolation on top. `Math.random()` is never called
inside `src/sim/`. That is what keeps replays, leaderboard verification and a
future server-authoritative port possible.

## Encounter

The Drowned Warden, one phase transition at 70% health, three mechanics:

| Mechanic | What it asks of you |
| --- | --- |
| Abyssal Slam | Tank cooldown, or the tank takes a large hit |
| Puddles | Move out fast; the warning is short and they linger |
| Spread | The target walks away from everyone else |
| Crushing tide | Unavoidable party damage — the healer's mana is the real timer |
| The boss itself | Faster than the whole party; you cannot outrun it |
| Enrage at 180s | A hard damage check |

Only the tide cannot be dodged, and that is deliberate: a party that dodges
well takes almost nothing else, so without a floor of damage the healer is
never tested and the only failure mode left is the enrage timer.

Your `Burst` has a two-second cast and movement cancels it, so the real
decision is when you can afford to stand still.

## Development

```bash
npm run check        # types, then headless render pass, then balance harness
npm run harness      # win rate and puddle-uptime by attempt number
npm run rendercheck  # draws every frame against a stub canvas, asserts controls land on screen
npm run touchcheck   # pointer mapping, joystick vector, multi-touch, layout bounds
npm run build
```

The harness is the main tool here. Tuning AI or balance without measuring it
produces party members that feel wrong in ways that are hard to name, so every
change to `ai.ts`, `boss.ts` or ability numbers should be followed by a run.

Current baseline, with a deliberately mediocre scripted player, 30 runs per row.
Each member column is `time in a detonated puddle / units walked per second`:

| Attempt | Win rate | Bastion | Wren | Kestrel | Vale |
| --- | --- | --- | --- | --- | --- |
| 1st pull | 33% | 0.06% / 10 | 0.15% / 14 | 0.25% / 11 | 0.09% / 12 |
| 5th pull | 47% | 0.09% / 12 | 0.07% / 15 | 0.22% / 12 | 0.20% / 15 |
| 9th pull | 60% | 0.02% / 10 | 0.05% / 14 | 0.07% / 13 | 0.07% / 14 |

Two things are being watched here, and neither shows up in the win rate.

**Puddle uptime must stay ordered** — tank lowest, greedy dealer highest. If it
flattens, the humanity layer has stopped mattering and everyone is playing
identically well.

**Distance walked must stay low.** An earlier version had the party return to a
fixed home position whenever the floor cleared, and because that home was
defined relative to a moving boss, they chased it forever: the healer walked 70
units a second, pacing back and forth all fight. It looked busy and read as
broken. Movement is now only for danger and for genuinely being out of range.
