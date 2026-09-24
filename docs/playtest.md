# Playtest

Something plays this game every hour, all day, and files what it finds.

This file is the spec. `scripts/playtest.sh` decides only *when* to run and what
the job may touch; everything about what to play, what counts as a finding and
how to write it is here.

## Why a player, and not another check

There are seven checks in this repository and not one of them plays the game.
The harness runs the simulation with no browser. `rendercheck` calls the drawing
functions and asserts on numbers. `visualcheck` boots the real page, presses 66%
across and 95% down hoping that is still PULL, and asserts only that nothing
threw. `dungeoncheck`, `artcheck` and `touchcheck` hold geometric promises.

So the half of this game a player actually meets — eleven screens, a joystick,
five buttons, a map, an evening that saves itself — has only ever been tested by
the person who owns the repo, on a phone, one session at a time. Read the closed
issues: the teleporters that nobody could stand on, the twenty-five buildings
with no way in, the doorways that came out as holes in the roof, the walk that
went blind for fifteen minutes. Every one of them was found by playing, and
every one of them passed every check.

And beyond the bugs there is the thing no check can ever hold: **whether it is
worth playing.** That judgement is allowed here. It is the most valuable thing
this job produces and the hardest to earn, because the only way to have it is to
have actually sat through the twenty minutes.

## The session, in one list

1. `npm run playpick` — what to play. Not the session's choice; see below.
2. Re-check what was closed since last time (see *Re-evaluating*).
3. Write the play script to `playtest/plans/<yyyy-mm-dd>-<n>.play` and keep it.
4. `npm run playbot -- playtest/plans/<that> --view <the cell's view> --out <tmp>`
5. Read the journal. **Look at the shots.** A journal with no faults in it is
   not a good session; it is a session that has not been read yet.
6. File at most two issues.
7. Append one line to `playtest/sessions.jsonl` and revise
   `playtest/direction.md`.
8. Commit those two files, and nothing else.

## What to play is not the session's choice

`npm run playpick` reads `playtest/sessions.jsonl` and prints the least-played
value on every axis. Play that.

This is taken away from the session on purpose. Left to choose, a session plays
Marrowgar as a frost mage doing everything right — it is the first boss on the
list, the default spec, and the example in every doc — and twenty-four sessions
a day of the same pull is one session a day, repeated. The axes are in
`scripts/playpick.ts`; it balances each on its own rather than aiming at the
cross product, and the file says why.

The cell is a floor, not a ceiling. Inside it, play like somebody: get lost,
press the wrong thing, leave mid-fight, go and read the record, stand still for
a minute and see whether anything asks you to move. **The instruction that
matters most in this file: do something in each session that no session has done
before, and write that thing down in the ledger line.** A session that only ran
the cell is a fuzzer.

`--save fresh` means an empty profile: no unlocks, no history, no saved evening.
That is the state every real new player is in and the one the repo almost never
looks at. `carried` means reuse `playtest/profile/`, which is how anything about
a *second* evening gets seen at all.

## The driver

`npm run playbot -- <script>` runs a play script through a real browser against
a real dev server, on the real input path. It decides nothing and asserts
nothing about taste.

Commands, one per line, `#` for a comment:

| Command | What it does |
|---|---|
| `open [#hash]` | load the page; `#b=marrow&s=10&h=1` lands on the roster with a fight chosen |
| `targets` | every named control on the screen now, with its box |
| `tap <label>` | press one, by the name `targets` gave it |
| `tapxy <x> <y>` | press a canvas point, for when the answer is *nothing is there* |
| `key <k>` | a keypress: `1`–`5`, `w`/`a`/`s`/`d`, `escape`, `r`, `m` |
| `waitscreen <name> <secs>` | wait for a screen, and fault if it never comes |
| `play <style> <secs>` | behave a given way while a fight runs |
| `ui` | the same controls, measured: size, overlap, anything off the glass |
| `ladder <pulls> <secs>` | the same fight repeatedly, by something trying to learn it |
| `bill` | the player's own tally for the pull: mechanic hits, damage taken, per minute |
| `walkto <x> <y> <secs>` | steer to a world point — a pad, a door, the far corner of a room — and fault if it never gets there |
| `letgo` | drop the stick and any held key |
| `state` / `says` / `shot <name>` / `note <text>` / `wait <secs>` | record, photograph, annotate, pause |

The styles are `idle`, `mash`, `dodge`, `good`, `wander`, `melee`, `flee` and
`auto`. They exist because **an LLM cannot play a real-time raid**: a press has
to land inside a one-and-a-half second cast window and a decision costs seconds.
So the twitch is code, and the *choice* of twitch is the experiment. Each style
is a hypothesis about a player — the one who never moves, the one who never
stops, the one who does everything right — and a fight that ends the same way
under all of them is a fight that is not asking anything. `play` reports
`inDanger`, the share of samples spent standing in something that hurts, which
is the number that says whether the style actually played differently.

`window.__abyss` is read-only and stays that way. It says where things are and
what the rules make of that; getting there is done by playing. A driver that
could put the party where it wanted would produce evidence about the staging.

A phone session is played with two fingers, through CDP, because `Input` keys a
held button by pointer id and a one-pointer driver would have to let go of the
stick to cast. It also never presses a key: any keydown turns the touch overlay
off for the rest of the session, deliberately, so a driver that reached for `1`
would spend the fight on the desktop scheme with a phone's viewport. That is not
hypothetical -- it is what this driver did until `ui` was asked the same question
either side of a single keypress and the minimap and the autocast toggle were
there and then were not.

### Whether the fight can be learned at all

`README.md` says the thing that improves between attempts is *you*, and
`docs/upkeep.md` holds a band saying every fight is winnable by the ninth pull.
Neither has ever been measured against a player, because every player this repo
can simulate is a fixed function that plays the ninth pull exactly as it played
the first.

`ladder <pulls> <secs>` runs the same encounter over and over with the `learn`
style, which starts knowing nothing and may only learn from what a player can
see. It walks into every telegraph it has not been burned by; a patch that takes
health off becomes a patch it leaves early, and one that keeps hurting after it
has run out of lead becomes one it will not stand still for. Damage taken with
nothing underfoot is blamed on whatever **the boss** said just before — party
chatter is filtered out by speaker, which had to be learned the hard way: a
version without the filter decided "Moving!" was a mechanic and ran from the boss
thirty times because a healer had said it.

Nothing about a pull is replayed. A raid keys its seed off the pull count, so
pull two is a fresh roll of the same script — which is the point, because a
lesson that only works on one seed is memorisation.

**A flat curve does not mean the learner is bad.** Discriminate it, always, by
running the same cell under `idle` and `good` with `bill` after each, and compare
*per minute* — the learner's own standing off lengthens the fight, and a raw count
would credit a slow pull for being slow. If `good` is far better than the ladder's
best pull, the learner is the problem and the run says nothing about the game. If
`good` is no better, the fight is not rewarding play, and that is a finding.

The first ladder ever run is the example. On The Bonegrinder, ten players,
normal:

| | hits/min | taken/min | fight | raid |
|---|---|---|---|---|
| `idle` | 7.7 | 1240 | 116s | 10/10 |
| `good` | 11.6 | 1667 | 140s | 9/10 |
| `learn`, pulls 1–4 | 7.1 → 9.2 → 11.1 → 9.0 | | | |

Playing well was worse than doing nothing on every count, and `bonestorm` was the
top of the bill every time. That mechanic is not a patch on the floor — it is an
aura on the boss that hurts everything near it while the boss wanders — so
anything that keeps you near the boss, which is to say playing, is what it bills
for. See the open issue; do not re-file it.

### How much to script, and when to stop and look

**A long script is for the parts of the game that have a clock; a short one is
for everything else.**

Inside a fight there is no choice. A telegraph gives about a second and a half
and a round trip to decide costs several, so a fight has to be handed to `play`
and watched afterwards. That is not the good version of playing, it is the only
version, and it is why the in-fight behaviour is the one genuinely fixed thing
here: `good` plays the ninth pull exactly as it played the first.

Everywhere else -- menus, the map, an evening between rooms, the record, the
settings, getting out of somewhere -- **nothing is on a clock, so do not script
it.** Run three lines, read the journal, look at the shot, then decide the next
three. That is where a route nobody would find gets found, and a session that
wrote forty lines up front and ran them is a session that decided what it was
going to see before it saw anything.

**And when the vocabulary cannot say what you want to try, go around it.** The
commands above are the moves that turned out to be worth naming, not the limit of
what the game can be poked with. A double tap, a drag, two fingers pinching, a
press held through a cast, a reload halfway through a pull, a viewport that
changes mid-fight: write a one-off Playwright script under `playtest/plans/` and
run it with `node`. `playwright` is installed and the hook is on in the dev
server. The only rule that still holds is the one about staging: drive the game
through its own input, never by calling into it.

## Judging the layout and the convenience of it

Whether a screen is any good is a judgement, and it is one this job is expected
to make. Make it by looking — `shot`, then read the PNG. There is no substitute
and no counter to it: this repository has a record of a hook counter reading
green over a picture that was plainly wrong.

But three things about a layout are facts rather than taste, and `ui` measures
them, so an issue about convenience never has to say *looks small*:

- **Size**, against the 44px floor `touchcheck` holds the rest of the game to.
  The first run of `ui` ever made found the front page's week-reset at 300 by 24.
- **Overlap.** Two controls under one thumb means the player gets whichever the
  dispatch order happens to test first, which is not a thing they can learn.
- **Off the glass.** A control partly outside the viewport is the bug that made
  the phone unplayable twice, and it is a fault rather than a note.

The other half of convenience is not on any one screen: it is **how far away
things are**. The journal counts the presses, so the number of taps from the
front page to a fight, or from a wipe back into the same pull, is something a
session can just read off it and argue with. The map button exists because that
route used to be two screens and a back — the argument that won it was a count.

Convenience findings are worth a `ui` line, a shot, and a tap count, and they
are `enhancement`, not `bug`, unless something is unreachable.

## Re-evaluating what got fixed

**Every issue this job files carries its play script inline, verbatim, and the
cell it came from.** That is not politeness. It is the only way a later session
can tell whether a fix worked, and a bug report that cannot be re-run is a bug
report that gets closed on a guess.

So the first work of every session, before playing anything new:

```
gh issue list --state closed --label playtest --limit 30
```

**How much of a session actually replays.** A raid keys its seed off the pull
count and the count starts at zero on every page load, so the first pull after an
`open` is the same fight to the tick, every time, on any machine. A battleground
rolls its map from its own entry count and replays the same way. What does *not*
replay is when the presses land: the driver acts on the wall clock and the number
of ticks inside a real second is not fixed, so two runs of one script are the
same fight played slightly differently. Judge a re-run on what it shows, not on
whether the journal matches line for line — a session that calls a fix missing
because a number moved by one is a session that has wasted the fix.

For anything closed since the last ledger line, re-run the script that is in the
issue, unchanged, and comment with one of three answers:

- **Fixed.** Say what the journal says now, next to what it said then.
- **Fixed, and it cost something.** The evidence for the new problem, and a new
  issue if it is a different thing.
- **Not fixed.** Reopen, with what still happens.

Then the part that is the whole point of running this for months rather than
once: **a fix that landed is the moment to ask whether the argument that asked
for it still holds.** If three issues about the same complaint all got fixed and
the complaint is still true, the complaint was wrong about its cause, and that
belongs in `direction.md` — not in a fourth issue.

## The ledger line

`playtest/sessions.jsonl` is one JSON object per session, and its shape is fixed
because two other things read it: `playpick` reads `cell` to decide what is
under-played, and the next session reads `when` to know what has been closed
since. A line that leaves either out breaks the job quietly -- the picker starts
handing out the same cell and re-verification silently checks nothing.

```json
{
  "when": "2026-09-24T14:00Z",
  "cell": { "mode": "raid", "boss": "gorged", "size": "25", "difficulty": "heroic",
            "spec": "shaman:elemental", "style": "flee", "view": "1280x800", "save": "fresh" },
  "plan": "playtest/plans/2026-09-24-1.play",
  "new": "first session to leave a fight mid-pull and come back through the map",
  "faults": ["no-such-control: map, on fight"],
  "saw": "25-heroic Bloodgorged took 4m12s and the raid never dropped below 9/10",
  "verified": [{ "issue": 271, "verdict": "fixed" }],
  "filed": [274],
  "gate": "open",
  "message": "An evening left in the middle, and the way back in"
}
```

`new` is not optional and is not allowed to repeat a previous line: it is the one
field that stops this from being twenty-four identical sessions a day. `saw` is
the session in one sentence, because a ledger of cells and issue numbers cannot
be read back as a history of the game. `message` becomes the commit subject.

## `playtest/direction.md`

The standing view of what is wrong with this game. Not a log; a log is
`sessions.jsonl`. Every session either confirms a line, sharpens it, or drops it.

Rules for it:

- **At most seven standing hypotheses.** An eighth means one of the seven has
  been sitting there unexamined, and a list nobody prunes is a list nobody reads.
- Each one says what would **disprove** it and what has actually been observed,
  with the session dates. A line with no observations after three sessions that
  looked for them gets dropped.
- Dropped lines move to *Tried and dropped* with the reason. That section is
  what stops the same proposal being re-raised every fortnight, which is the
  failure mode of any job that runs forever.
- When the game changes underneath a line, rewrite the line. This file is
  allowed to be wrong; it is not allowed to be stale.

## What is worth an issue

**The faults the driver flags** are always worth reading and not always worth
filing. `page-threw`, `fight-stalled` and `not-a-number` are bugs. A
`no-such-control` may be the script asking for the wrong thing — check the
`saw:` list before believing it. `console-error` from the dev server's own
tooling is noise.

**The half no check can hold.** A route a player would not find. A screen with
no way out. A fight that is over before it starts, or one where nothing you do
changes the ending. A decision the game claims to offer where every answer is
the same. Twenty minutes that ask nothing of you. A menu that says something
untrue about the game behind it.

**Direction, systems and the engine are in scope.** If the honest finding is
that the third law costs more than it buys, or that the walk between rooms is
dead time, or that a mode should not exist, file it — with the argument standing
on something that happened this session and the journal line quoted. The bar is
evidence, not modesty.

**Not worth an issue.** Taste with nothing behind it. A number `balancecheck`
already holds — that is `docs/upkeep.md`'s job. Anything on the *already
decided* list in `docs/upkeep.md`, or that breaks one of the four laws in
`README.md`'s "What it is". A second copy of an open issue: comment on that one
instead, because a second issue is how the first one stops getting read.

## Caps, and the gate that matters

**Two per session, hard.** 0 is a normal session and most sessions are.

**If there are twelve or more open `playtest` issues, file nothing new.** Spend
the session re-verifying, playing the cell, and sharpening `direction.md`. This
is the honest answer to running a bot twenty-four times a day: a backlog nobody
can work through is indistinguishable from noise, and the issue that mattered is
buried in it. Say in the ledger line that the gate was shut.

A shut gate must not lose the finding. Write it under *Not yet filed* in
`direction.md`, with the journal line, and file it the first session the gate
opens — or drop it there, with the reason, if by then it has stopped being true.
That section is also where a session puts something it is not yet sure enough
about to spend one of its two issues on: a thing seen once is an observation, and
a thing seen in three different cells is a bug report.

## What the job may touch

**`playtest/` and nothing else.** Not `src/`, not the other docs, not this file.
It does not fix the game — a fix wants a person, or `docs/upkeep.md`'s job,
which is the one with the hour-long gate behind it. Anything this job would like
changed is an issue.

The commit is the ledger line, `direction.md`, and the play script. `npm run
check` is not run, because nothing this job commits is code and the check takes
an hour.

## Rules

- **Do not ask questions.** This runs headless; nobody is there. Decide, act or
  do not act, and report why.
- **There is no later.** A `playbot` run started in the background and left to
  finish after the session ends is a run nobody reads: when the session stops, the
  tree is committed as it stands. Wait for it, polling, or stop it early and write
  up what there is. The second session ever run lost its hour to exactly this, and
  left a plan file with no ledger line behind it.
- **Write the ledger line even when the session went badly.** `playpick` counts
  lines, so a missing one makes the next session replay this one's cell. A line
  that says the run was abandoned and why beats no line.
- **Do not look for other copies of yourself.** The runner holds a `flock`. The
  `playtest.sh` and `claude -p` in the process list are you.
- **Measure before you claim.** Every number in an issue comes from a journal
  line or a command that was run, and it goes in with it.
- **One thing per issue.** A list of improvements is an issue nobody can close.
- **Look at the screenshots.** This repo has a record of hook counters reading
  green over a picture that was plainly wrong — a projectile counted as drawn
  while what was on screen was a flat disc. A claim about what the game looks
  like is made by looking.
- Issues are in Korean. Labels: `playtest`, plus `bug` or `enhancement`.

## Procedure

1. `cat playtest/direction.md` — what is already believed
2. `tail -5 playtest/sessions.jsonl` — what the last sessions did
3. `gh issue list --state all --label playtest --limit 40` — open and closed
4. Re-verify anything closed since the last ledger line
5. `npm run playpick` — the cell
6. Write the script, run it, read the journal, look at the shots
7. File up to two, unless the gate is shut
8. Append the ledger line, revise `direction.md`, commit both plus the script
9. Report: the cell, what was new about this session, what was found, what was
   filed, and why there was not more
