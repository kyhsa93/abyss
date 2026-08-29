# Upkeep

Once a week, something looks at this game and asks whether it is still the game
the README says it is. Most weeks the answer is yes and nothing happens.

This file is the spec. `scripts/upkeep.sh` only decides *when* to run.

## What this exists to catch

The simulation is deterministic — fixed seeds, no `Math.random()` in `sim/`. Run
the harness twice without touching the code and you get the same tables to the
digit. **Nothing here drifts on its own.** Everything this job can find was put
there by a commit.

That is the whole problem. `npm run check` prints spec win rates, boss win
rates, size tables, floor tables and battleground tables, and then a person is
supposed to read several hundred numbers after a fifty-minute run. Nobody reads
them. A tuning commit that also moved something three tables away ships, and the
only thing that notices is a player who cannot win on a spec they liked.

So: the bands below are enforced by `npm run balancecheck`, which runs inside
`npm run check`. This job is what happens when a band goes red, plus a weekly
look at whether the concept still holds.

## The bands

They live in `scripts/balancecheck.ts`, which runs the harness once inside
`npm run check`, prints its tables as before, and then fails if a line below is
crossed. They encode design intent, not measurement, and each is wide enough
that noise cannot trip it — two standard errors on a forty-pull win rate is
about sixteen points, so anything tighter would be measuring the seed.

| Band | Line | Where it sits today |
|---|---|---|
| No spec is a trap | every spec wins ≥ 50% | lowest is 70% (Warrior DPS, Warlock, Paladin Heal, two tanks) |
| Every fight is winnable by pull 9 | every size/difficulty cell ≥ 50% | lowest is 68% (Choir 5 normal) |
| The descent ends somewhere worth telling | median floor 4–10 | 7 |
| A battleground rewards playing it | `ai` beats `idle` by ≥ 20 points | 47, 50 and 57 across the three maps |

**No spec is a trap.** The class screen is the one decision this game asks of
you, and a spec that cannot clear the reference fight makes that screen a lie.

**Every fight is winnable by pull 9.** A fight is learned by repeating it. A
cell still unwinnable after nine attempts is not teaching, it is refusing.

**The descent ends somewhere worth telling.** A median of two is a wall and a
median of fifteen is a treadmill; neither is a sentence anybody would say out
loud.

**A battleground rewards playing it.** The four drives are the same five players
told to care about different things. If standing still scores like playing, the
map is scenery.

Every band was checked by breaking it on purpose before it went in — a doctored
harness output with a 41% spec, a 44% cell, a median floor of 2 and a map where
playing beats idling by 15 points each fail with the line named. A band nobody
has seen fail is a band nobody knows works.

`ABYSS_HARNESS_OUT=<file>` reads saved tables instead of running the harness,
which is how the bands were tested without paying an hour for each one, and how
this job checks them against the run it already read.

### What the bands deliberately do not cover

Difficulty ordering. Heroic is expected to be harder than normal at the same
boss and size, and today it often is not — see the open issue. That belongs in a
band, but a band that is red the day it lands teaches the wrong lesson: the
first thing anybody would do is widen it. It goes in once the fight is fixed.

## What the job may change, and what it may not

**It may retune numbers to bring a red band back inside.** Ability damage,
cooldowns, health pools, timings — the constants the harness measures. It runs
`npm run check` and pushes only if the whole thing passes.

**It may not decide anything with taste in it.** New mechanics, new modes, new
content, changing what a spec *is*, moving a band. Those go to issues.

The line is: if the harness can prove the change did what it was for, the job
may make it. If the only argument is that it feels better, it is an issue.

**It may not move a band to make a red one green.** That is the one edit that
turns this whole file into decoration. Bands change when a person changes them.

**It may not touch the concept.** `README.md`'s "What it is" section and the
four laws under it are not the job's to edit. If a law now costs more than it
buys, that is an issue with an argument in it, not a commit.

## The weekly concept audit

Beyond the bands, check that the four laws still hold in the code. These are
cheap greps and each one has caught a real thing in this repository before:

1. **The boss is a script.** `src/sim/boss.ts` stays a fixed timeline. Randomness
   picks targets, never actions or timings.
2. **Everyone else reads as a person.** The humanity layer is still wired:
   reaction delay, fumbles, personalities, the clustering term. A regression
   here does not show up in win rates — a party of perfect bots wins *more*.
   The signal is the puddle-time ordering: tank < timid healer < steady dps <
   greedy dps. If that ordering breaks, personality stopped mattering.
3. **Nothing on your character gets stronger.** No gear, no level, no currency,
   no stat that persists between pulls. Unlocks open content, never power.
4. **The simulation is deterministic.** No `Math.random()` under `src/sim/`, no
   `Date.now()` in anything the sim reads.

## Rules

**0 issues is a normal week.** Two is the cap and it is a cap, not a target.
Proposals are unfalsifiable and infinitely available; ten of them and nobody
reads the list, and then the one that mattered is buried with the rest.

**Do not ask questions.** This runs headless — there is nobody to answer. Decide,
act or do not act, and report why.

**Do not check whether another copy is running.** The runner holds a `flock`.
The `upkeep.sh` and `claude -p` in the process list are you.

**Measure before you claim.** Every number in an issue or a commit message comes
from a command that was actually run, and the command goes in with it.

**One thing per issue.** A list of improvements is an issue nobody can close.

**Read `README.md` first**, the "What it is" section especially. A proposal that
cannot be described as *content that would otherwise need other people* does not
belong in this game, however good it is.

## Already decided, do not propose again

- **Cutting battlegrounds.** Considered on 2026-08-29 and kept. It is one of the
  four shapes.
- **Character progression, loot, gacha, matchmaking, live services, art assets.**
  Each breaks one of the four laws. The README says which.
- **Making the boss react to the party.** That is the first law.

## Procedure

1. `gh issue list --state all --limit 100` — what is already known, open and closed
2. `README.md` "What it is", then this file
3. `git log --oneline -20` — what landed since last week
4. `npm run check` — this runs the harness once and the bands with it
5. If a band is red: find which commit moved it, retune, re-run `npm run check`,
   push. If retuning would need a design decision, open an issue instead.
6. Run the four greps above. Anything broken is an issue, not a commit.
7. Report: what was checked, what was changed, what was filed, and why not more.
