# Abyss

A browser raid-boss prototype. You play one damage dealer; the tank and healer
are AI party members that fight alongside you. No assets, no server, no
network — everything is shapes, timers and a deterministic simulation.

## Run it

```bash
npm install
npm run dev
```

`WASD` to move, `1` `2` `3` for abilities, `R` to pull again.

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

**The simulation is deterministic.** Fixed 30 Hz timestep, seeded PRNG, stable
iteration order, render interpolation on top. `Math.random()` is never called
inside `src/sim/`. That is what keeps replays, leaderboard verification and a
future server-authoritative port possible.

## Encounter

The Drowned Warden, one phase transition at 70% health, three mechanics:

| Mechanic | What it asks of you |
| --- | --- |
| Abyssal Slam | Tank cooldown, or the tank takes a large hit |
| Puddles | Move out; they linger and shrink the usable floor |
| Spread | The target walks away from everyone else |
| Enrage at 180s | A hard damage check |

Your `Burst` has a two-second cast and movement cancels it, so the real
decision is when you can afford to stand still.

## Development

```bash
npm run check        # types, then headless render pass, then balance harness
npm run harness      # win rate and puddle-uptime by attempt number
npm run rendercheck  # runs the whole draw path against a stub canvas
npm run build
```

The harness is the main tool here. Tuning AI or balance without measuring it
produces party members that feel wrong in ways that are hard to name, so every
change to `ai.ts`, `boss.ts` or ability numbers should be followed by a run.

Current baseline, with a deliberately mediocre scripted player:

| Attempt | Win rate | Avg time in a live puddle |
| --- | --- | --- |
| 1st pull | 23% | 1.51% |
| 5th pull | 43% | 1.20% |
| 9th pull | 70% | 0.80% |
