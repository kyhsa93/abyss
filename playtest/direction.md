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

**2026-09-25, sharpened on the hardest cell and a third role.** The first two
cells were a tank and a dps -- roles a twenty-five-body raid can carry without.
A healer who presses nothing heals nobody, so The Long Cold (25-heroic, the
hardest single cell in the game per `README.md`'s own tables, and a boss whose
stated demand is literally "do nothing while it is on you") is the sharpest
test available. Two separate `playbot` invocations, same fresh-save pull-one
seed (`docs/playtest.md`'s "Re-evaluating" section: the first pull after `open`
is the same fight to the tick), restoration shaman, `good` vs `idle`:

```
110.1s played style=good seconds=108 outcome=victory fightTime=105 phase=3
  aliveParty=24/25 heroHp=520/1485 bossHp=down presses=22 inDanger=24%
 97.6s played style=idle seconds=95  outcome=victory fightTime=93  phase=3
  aliveParty=25/25 heroHp=1267/1485 bossHp=down presses=0 inDanger=30%
```

Idle didn't just avoid losing -- it won more comfortably on every count that
isn't itself a proxy for effort: faster kill (93s vs 105s), the whole raid
alive instead of one down, and more than twice the healer's own health left
over, despite taking *more* damage per minute doing it (`bill`:
`takenPerMin=1696.9` idle vs `1276.7` good). Third role, third boss, third
save state, still no cell where idle loses. This gap is already on
`docs/upkeep.md`'s own "raid rewarding play" table (Long Cold: +55, measured
under the old settings-based mechanic system) and is explicitly not proposable
as a new issue -- it is recorded here because the shape of *how* idle wins
(a healer, on the fight built around knowing when to do nothing) is new
evidence for this line specifically, not because the underlying gap is new.

**2026-09-25, complicated by a fourth boss and the first genuine mixed
result.** First idle/good pair on The Two Flasks played as a plain raid pull
(not the `daily` framing the two prior sessions on this boss used, so no
affix riding it), 10-player normal, warlock:destruction, fresh save, pull 1
both times (two separate `playbot` invocations, 390x844 touch, per the
driver-lesson below — never a second `open #hash` in one script). Both won:

```
idle style=idle seconds=180 outcome=victory fightTime=121 aliveParty=9/10  heroHp=973/1485 presses=0  inDanger=30% takenPerMin=1314.4 byMechanic={gather:3,caustic:554}
good style=good seconds=180 outcome=victory fightTime=122 aliveParty=10/10 heroHp=434/1485 presses=89 inDanger=6%  takenPerMin=1678.0 byMechanic={gather:3,hound:598,reagent:1}
```

For the first time this does not cleanly go idle's way. Idle finished
healthier in its own body (973/1485, 65%, against good's 434/1485, 29%) and
the kill took about the same time either way (121s vs 122s) — but idle's raid
lost a member (9/10) that good's raid did not (10/10), and good took more
total damage doing it (`takenPerMin` 1678 vs 1314). Three prior cells all had
idle ahead on every axis at once; this one trades a body for a death instead.
**Not a disproof** — the fight was still won both ways, so idle did not
*lose* by the line's own test — but the first cell where idle's cost shows up
instead of reading as zero.

**Same pair also overturns a "Not yet filed" guess rather than confirming
it.** `caustic` went from 554 hits under idle to 0 under good, and `hound`
went from 0 under idle to 598 under good — only `gather` (3, both runs)
landed the same way. That is the opposite of the 2026-09-24/2026-09-25
daily-mode note below, which guessed `caustic` was "an unavoidable raid-wide
tick... rather than anything a style choice touches" off one coincidence — the
same hit count, 242, showing up in two different daily pulls. This pair says
caustic is exactly as avoidable as hound is: a body that never moves just
sits in whichever puddle lands on it for the rest of the fight. The daily-mode
guess was wrong, not merely unconfirmed, and is struck rather than carried.

**Driver lesson, not a game finding:** the first attempt at this comparison
put both pulls in one script with a second `open #b=cold&s=25&h=1` mid-run to
reset between them. It didn't reset anything -- the app clears the invite hash
from the address bar after reading it once (`README.md`, "Sharing"), so the
second `open` was a fragment-only difference from the already-cleared current
URL, and Playwright (matching real browser fragment-navigation semantics)
treated it as a same-document navigation: no reload, no new pull, just the
first pull's own end-of-fight state read a second time. Split into two
`playbot` invocations instead. Worth remembering before writing a multi-pull
script that reaches for `open #hash` a second time.

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

### 3. A wipe on the way between rooms cannot be retried, and stalls the evening

`docs/playtest.md` and the README both say a wipe should cost the pull, not
the night: "What you killed stays dead; a wipe costs the pull and not the
night." That is written about the building in general, not just a boss's own
room, and the walk between rooms is explicitly a fight too — `mode` reads
`travel` while it runs, and the README says packs in a corridor are placed to
punish carelessness on purpose.

**2026-09-25 (first `mode=clear` session to leave a ledger line).** 10-normal
(the open substitute for a fresh save's locked 25-heroic), paladin
retribution, `evening wander 150 5`. Wiped in THE VIGIL corridor at 40.9s.
Pressing PULL AGAIN (`tap outcome:retry`) did not restart it — `outcome`
stayed `wipe` through the full 30-second wait `evening` gives a room to
change state, so the next room began with the fight still showing `wipe`, was
counted as a second instant wipe with `hero()` returning `null`, and the
evening declared itself stuck: `fault:evening-stuck {"at":"vigil","rooms":3}`
at 101.8s. Filed as #271, with the journal lines and both play scripts.

A same-`--profile` reload afterward did not recover it either: `open` then
`tap raid` landed on a brand-new raid-setup screen (default frost mage, The
Bonegrinder at full health, "you walk in at the threshold") instead of
`src/main.ts`'s own resume path (`if (run) { ... standIn(run.at, null) }`).
The stuck evening was not just unretryable, it was gone.

**Discriminated, not yet generalised.** The same corridor crossed cleanly
under `good` in a separate run (0 wipes, 10/10 alive, hero hp 275/1800), so
THE VIGIL is not unconditionally lethal — the bug is the retry, not the
difficulty. What is not yet known is whether every travel-mode wipe fails to
retry the same way, or whether this is specific to THE VIGIL or to the
paladin/10-normal combination. One room, one session.

**2026-09-25, confirmed a second way, same room.** `mode=walk` toward `crowns`
(the wing boss is irrelevant here -- the walk never got past the second room),
druid restoration, `mash`, 10-normal, fresh save, 390x844 touch -- a different
class, style, difficulty and save state than the first report, in the same
corridor. Chased into THE VIGIL by the threshold's own watchmen (`stillAlive`
read 185-186 `The Damned` the whole way), wiped at 26s, PULL AGAIN tapped:
re-wiped at 0.0s with `hero.hp=0` and every ability slot `locked` -- not
"outcome stayed wipe" this time but the party never coming back up at all.
Tapped again: same. A brand-new `evening` call against the same stuck room
did not recover it either. Both post-wipe screenshots
(`after-evening-1.png`, `after-evening-2.png`, from two separate `evening`
calls) are pixel-identical: "0.0s · 8 down", PULL AGAIN highlighted, nothing
moving. Commented on #271 rather than filing again -- same room, and the two
reports together already say plainly that PULL AGAIN's failure to revive the
party is spec/style/save-independent, at least in THE VIGIL.

**Disproved by** a travel-mode wipe, anywhere in the building, where PULL
AGAIN does restart the room. **Sharpened toward "every travel wipe is like
this"** by a wipe in a *different* corridor showing the same failure --
the two confirmations so far are both THE VIGIL, so "every travel wipe" is
still open. **Sharpened toward "PULL AGAIN never revives the party" itself**
(rather than the earlier framing that only `outcome` was wrong) by this
session's `hero.hp=0`/`locked`-bar reading -- worth checking on the next
report whether that is the actual defect PULL AGAIN has.

**2026-09-25, confirmed a third way, still the same room.** `mode=walk` aimed
at `whisper` (past `spire`'s marrow fight, never reached), frost mage (dps,
neither of the first two roles), first-ever use of `style=auto` (autocast
toggle on, otherwise stands still), first non-touch desktop viewport
(1280x800, mouse) for this line, carried save (which #273 means starts fresh
inside one `playbot` run). Wiped in THE VIGIL at 49s (`wipes=1`), tapped
`outcome:retry`, and landed straight back on `outcome=wipe`, `hero.hp=0`,
every ability `locked` -- `evening` called it `evening-stuck` at
`reached: threshold -> vigil`. Screenshot (`after-evening.png`) is the same
shape DEFEAT screen as the other two reports. Commented on #271 rather than
filing again. Four axes (spec, style, save state, viewport) have now each
varied across the three confirmations and the room and the symptom have not
-- "PULL AGAIN never revives a travel-mode wipe" is the stronger of the two
framings and "at least in THE VIGIL" is the only qualifier still standing.

### 4. A battleground's own setup is remembered less reliably than a raid's

**2026-09-24, opened.** First battleground session this job has run (five
sessions in, `mode` had never come up on the least-played axis before now).
`playpick` gave conquest; the first pull was played straight — `open` ->
BATTLEGROUND -> `map:conquest` -> priest:shadow -> PULL -> `play flee 180` on
carried, 820x1180 touch. The Three Cairns ended in 145s at 146-400, a full
loss, with `presses=0` and `inDanger=0%` the whole way: a flee-style body that
never fights costs its team the match, which is the opposite shape from the
raid `idle` findings in [[#1]] — worth returning to with a `good` comparison
on this same map before it says anything about battlegrounds generally.

While still in the same session, picked The Long Haul (escort) instead and
left without pulling, then reloaded on the same `--profile`. The pick was
gone: the front page came back with RAID highlighted, not BATTLEGROUND, while
conquest had correctly survived an identical reload earlier in this same
session (`146.6s open ... mode=battleground`). Read `src/main.ts`'s
`loadMode()` afterward to understand why rather than guess: it accepts only
`raw === 'conquest' || raw === 'flags'` and falls back to raid on anything
else, while `saveSetup()` writes whatever `mode.bg` is, escort included. Filed
as #272, with both play-script segments and the screenshots showing the
selected-map screen before the reload and the RAID-highlighted front page
after it.

**Disproved by** a fix landing and a reload after picking escort coming back
on BATTLEGROUND/escort rather than RAID.

### 5. A `carried` save only carries within one `playbot` run, not between them

`docs/playtest.md` calls `carried` "how anything about a *second* evening gets
seen at all", and `playpick` tracks `save` as its own axis on that promise.

**2026-09-25, opened.** First `mode=menus` session, carried save. Opened
RECORD and got `0 pulls · 0 kills`, `nothing pulled yet` — on the exact
profile (`playtest/profile/`) that a real 2026-09-24 session had already used
to wipe The Two Flasks (`"boss":"flasks","seconds":151.7,"mechanics":244`,
paladin protection tank, 25-normal). Read straight off the profile's own
leveldb log rather than guessed: `abyss.history` has been written to exactly
once, ever, by that original session, and never read back non-empty since.

The cause is `scripts/playbot.ts`'s own dev-server port: `5200 +
((process.pid + attempt * 37) % 300)`, a new value every invocation because
`process.pid` is. `localStorage` is scoped per origin, port included, so
`--profile` reusing the same Chromium user-data directory does not reuse the
same storage bucket across two separate `npm run playbot` calls — only within
one. Measured this session: seven straight `playbot` invocations against the
same `--profile playtest/profile` printed seven different ports (5344, 5228,
5391, 5278, 5307, 5443, 5328). Filed as #273.

This does not touch #272 — that reproduction stayed inside one `playbot`
run (`open` called twice on one page, same port throughout) — but it means
every *other* `carried` cell in `sessions.jsonl` that relied on a previous,
separate session's state was running on a fresh origin in disguise, and any
session that concluded something from "the profile remembered X" needs to
have actually stayed inside one script to say so.

**Disproved by** a fix (a fixed port for a given `--profile`, or an explicit
localStorage snapshot/restore step) landing, and a `carried` session across
two separate `playbot` invocations actually reading back a prior one's state.

### 6. THE VIGIL stalls any evening at one fixed point, win or lose

An `evening` walked into THE VIGIL does not reliably cross it. It is not a
wipe -- the party stays alive, at full health, dealing and taking nothing --
it simply stops making progress, converged on the same few square units
regardless of style, spec or seed. Filed as #281.

**2026-09-25, opened, three convergent runs.** `wander` (druid:guardian,
seed A): `fault:fight-outlasted-its-budget` at 400s, hero=(274.5,-1572.7).
`good` (same cell, seed B, a different steering algorithm entirely -- an
explicit beeline to the boss rather than a random heading): same fault at
259.1s, hero=(268.1,-1563.2), 11.4 units from the first. A third run, after
0f03ad9 landed (the unrelated `hud().boss`/`evening` fix for #268, which
touches this exact fault and the `good`-style steering code): `wander` again,
same fault at 400s, hero=(272.50,-1573.07) -- within a few units of both
priors, and unaffected by that fix (vigil has no boss, so `boss`/`away` on the
fault both read null -- this is a different bug one layer up).

**2026-09-25, fourth confirmation, `flee`.** First flee-style evening
anywhere in raid/clear mode (flee had only been used in a battleground
before) and first mode=clear session on a healer spec (priest:discipline).
Same fault at 300s, hero=(267.88,-1561.31) -- again within a few units of the
other three. `bill`: `hits=0 taken=0` for the full 300s, hero hp 1350/1350
start to finish. A style built to run from every pack converges on the exact
same spot as one that beelines the boss and one that wanders randomly, which
argues the stall is positional, not a survival or engagement problem.

Screenshots across all runs show the same shape: a fraction of the raid
clustered by a campfire on the near side, a straggler alone to the west, and
two or three members fighting alone far to the east -- the party split and
static, the minimap's "N left in it" count not falling toward zero (191,
189 seen). `src/dungeon.ts`'s own comment says this hall was built to have no
packs of its own and to be walked through, not fought in; the README says the
chasing watchmen stop "when the raid is most of the way up the passage." None
of the four runs got there.

**Disproved by** an evening crossing THE VIGIL under any of these styles from
a fresh save at this size/difficulty. **Narrowed by** a run that reaches a
different stopping point under a fifth style or a different spec/size --
so far spec, style and seed have all varied and the point has not moved by
more than about a dozen units.

**2026-09-25, complicated by a fifth style that did not stall at all.**
`mode=walk` aimed at `saved`, rogue:assassination, `melee`, 10-normal, fresh
save, 844x390 touch, walked from the front door (`evening melee 200 10`).
THE VIGIL took 26 seconds, not 250-400: `7.5s crossed from=threshold to=vigil
... presses=0` then `33.9s crossed from=vigil to=spire ... presses=2
stillAlive=1 nearest=The Bonegrinder`, walking straight past the four prior
runs' stopping point (y≈-1560 to -1573) into the boss's own room (y≈-5873).
Commented on #281 rather than rewriting it outright -- the issue's own
disproof condition names re-trying wander/good/flee, not a new style, so
this is not a clean disproof by the letter of it, but "regardless of style"
is not what a clean 26-second crossing looks like either. Worth a repeat of
`melee` specifically before touching the wording further: one clean pass
against four convergent stalls could be a real style effect or could be the
corridor's own seed-rolled watchmen placement missing this run entirely by
chance. Not dropping the line -- four stalls are still four stalls -- but it
no longer gets to say "any style, any seed" without a footnote.

Same session, same party, moved the finding downstream instead: past THE
VIGIL clean, the evening spent its entire ten-room budget wiping on the very
first boss, The Bonegrinder, eight times running, without ever winning
once -- `heroHp=0/1530` (the player dead) on all eight wipes while
`aliveParty=9/10` held. This is issue #267's bonestorm-punishes-proximity
finding at its most literal: a melee body cannot leave the aura's reach the
way a frost mage's `good` can choose to, so there was no `idle`-side win to
even compare against. Commented on #267 rather than filing a duplicate.

## Not yet filed

Findings with nowhere to go yet: either the issue gate was shut when they turned
up, or they have only been seen once and once is an observation. A line here
either becomes an issue, gets promoted to a standing hypothesis, or goes to
*Tried and dropped* with the reason.

**2026-09-24.** First daily-mode session to finish: `mode=daily`, "The Two
Flasks" (25 normal, FALTERING), paladin protection, `dodge`, 1280x800 desktop,
carried save. Wiped at 152s, 24% boss, `bill` blamed nearly all of it on
`caustic` — 242 mechanic hits in 152s (95.5/min) against a style that is
supposed to actively dodge. Same shape as issue #267's bonestorm complaint
(playing/moving into something that keeps hurting), but a different boss and
only one pull with no `idle`/`good` comparison to discriminate whether the
style or the fight is at fault — see how `docs/playtest.md`'s ladder section
insists on that comparison before believing a flat or hostile curve. Filed
issue #269 instead, about a real `not-a-number` fault at the same wipe. Worth
a `ladder` run on this boss before trusting the caustic number as a complaint
of its own.

**2026-09-25, second data point, same boss, still no ladder.** `playpick`
gave `mode=daily`; today's actual run (the daily boss is not a choice — see
the driver-lesson entry below) was again The Two Flasks, this time 25 normal
SWARMING, played as warrior:arms on `mash` (first arms warrior this job has
played), 844x390 touch, carried save. Wiped at 106s, boss at 19% (further
along than the dodge run's 24% at 152s, so mash actually out-damaged dodge
before dying, not just died faster). `bill`: `hits=556 hitsPerMin=315.7
taken=3095 takenPerMin=1757.4 byMechanic={"gather":2,"caustic":242,
"reagent":1,"hound":311}`. Two things worth flagging rather than filing:
`caustic` landed exactly 242 times in *both* pulls, a different day's seed
and a different style apart — consistent with `caustic` being an unavoidable
raid-wide tick (per `src/sim/encounters.ts`, `mechanicDamage`/`raidDamage`
apply regardless of position) rather than anything a style choice touches, so
the earlier "blamed nearly all of it on caustic" framing underweighted what
a non-dodging style actually eats. This pull's real story is `hound` —
`src/sim/constants.ts` describes it as "a thing that cannot be killed,
walking at one body" — at 311 hits, 40% more than caustic and never
mentioned in the dodge-style report at all. A style that only reacts to
countdown telegraphs (`mash`'s own "urgent" check) and never runs from a
persistent chaser eating nearly three hound-hits a second for 106 seconds is
exactly what `mash` is a hypothesis about, so this is not yet a complaint —
it needs the `idle`/`good` discrimination the ladder section asks for before
it says anything about the fight rather than about the style. Still worth
a `ladder` run on this boss; now specifically watch `hound`, not `caustic`.

**Superseded, 2026-09-25.** The "unavoidable raid-wide tick" guess above was
wrong, not just unconfirmed — see [[#1]]'s idle/good pair on the same boss,
which got 554 `caustic` hits under idle and 0 under good. `caustic` is
avoidable by moving, exactly like `hound`; the 242-both-times coincidence
this note leaned on was two daily pulls that happened to stand still in the
same place, not a raid-wide tick.

**2026-09-24.** `ui`'s overlap check compares drawn bounding boxes, not the
game's own hit-test circles. At 1280x800 it flagged four pairs among the five
ability buttons (`ability:5/3`, `5/2`, `4/2`, `4/1`) — worked out by hand
against `src/render/theme.ts`'s own `btnR`/`btnGap` formula (`btnR = clamp(min(w,h)*0.031, 17, 26)`,
`btnGap = btnR*2.2`), the closest pair sits at ~54.7px center-to-center against
a `btnR*2` dispatch threshold of ~49.6px — a ~5px margin, not an overlap. It
matches `touchcheck`'s own circle-radius overlap check (which passes; tested at
1440x900, not 1280x800, but the two scale together below the radius clamp) and
the screenshot shows no visible crowding either. **Not filed** — this is `ui`
measuring the icon art's square footprint, not the actual clickable region,
and would have been a wrong issue. Worth remembering next time `ui` flags
overlap on this specific corner cluster: check the real hit-radius before
trusting the rectangle test.

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

**2026-09-25.** The raid-setup difficulty dropdown draws a lock glyph (🔒,
`src/render/menu.ts`) next to a locked option; on this machine it rendered as
a missing-glyph tofu box instead of a padlock, next to "Heroic" (screenshot
`difficulty-open.png`, crop `heroic_lock_crop.png`). `fc-list` confirms this
machine has no emoji font installed at all, so this may be purely an artifact
of the environment `playbot` runs in rather than something a real phone or
desktop browser -- which normally ship a color-emoji font -- would ever show.
**Not filed.** Worth a second look if it ever turns up on a machine known to
have an emoji font, or worth asking whether the game should draw its own
lock shape rather than depend on a pictographic character either way.

**2026-09-25.** First-ever Ebb and Flow (flag) battleground session: hunter
marksmanship, `melee` style, fresh save, 390x844 touch. Two things came out of
it, filed as #278 and #279.

`README.md`'s battleground table says Ebb and Flow ends at "3 captures, or
360s". It does not: `src/sim/battleground.ts` gives each map its own constant
(`CONQUEST_LIMIT = 300`, `FLAG_LIMIT = 180`, `ESCORT_LIMIT = 300`), and Flag's
180 is exactly half of what the README row claims — Conquest and Escort's own
300s do match their rows, so this is not a stale table across the board, just
the one row. The game's own DEFEAT screen agrees with the code, not the doc:
`Ebb and Flow · 180s · 0 — 2`, and the journal's own `fight-over
outcome=defeat time=180` lands exactly on the code's constant. Filed as #278.

Separately, `ui` flagged the `auto` toggle under the 44px floor (36x40) on
this same screen, alongside the ability buttons' already-known false-positive
overlap (2026-09-24, above). This one is not the same false lead: `auto` is
tested by its own isolated circle in `src/main.ts`'s `hitAt()`
(`Math.hypot(...) <= L.autoR * 1.3`), checked *before* the ability buttons'
nearest-neighbor contest, so it never competes for a shared pixel the way the
five ability buttons do. Working the same formula
(`btnR = clamp(min(w,h)*0.031, 17, 26)`, `autoR = btnR*0.82`) that explained
the false lead now confirms a real one: at the two narrow touch viewports
(390x844, 844x390) `btnR` sits at its clamped floor of 17 and the toggle's
real dispatch circle comes out to 36.2px across; at 820x1180 or on desktop it
clears 52px. So this is real, isolated to the two phone-shaped viewports, and
distinct from #276 (the map/party/settings corner buttons, a different
formula). Filed as #279.

**Driver lesson, not a game finding.** `playbot`'s own `play` loop treats
`hero() === null` as `fault:not-a-number` and aborts the call — right for a
raid wipe, wrong for a battleground death, where the README says the dead
"come back after twelve seconds at their own base" and this is completely
normal. A `melee`-style marksmanship hunter (a ranged spec run straight at
five opponents) died repeatedly across this match and kept tripping the
fault, cutting several `play` calls down to a handful of seconds; chaining
`play melee 200` calls with a `wait` between them got all the way to the
match's real end (`outcome=defeat` at `time=180`) despite that, but a script
expecting one long `play` call to cover a whole battleground pull should
expect it to be cut short by this instead, the same way the `open #hash`
mid-script lesson under [[#1]] is worth knowing before it costs a session.
Also observed but not yet a finding: `bill`'s `hitsPerMin` read 0 for this
hunter across the entire 180s match under `melee` style — plausibly because a
marksmanship kit is entirely ranged and standing in melee range is simply the
worst thing a hunter can do, which is exactly what `melee` as a style
hypothesis is for rather than a sign of anything broken. Worth a look if a
future `ladder`/style comparison on a ranged spec turns up the same shape
against `good`, per the discriminating method in `docs/playtest.md`.

**2026-09-25, driver lesson, not a game finding.** `scripts/playpick.ts` gives
`mode=daily` cells a `boss`, drawn the same way a `mode=raid` cell's is
(`leanest(sessions, 'boss')`, line 116) — but a daily's boss is never a
choice. `src/sim/daily.ts`'s `dailyFor()` draws the encounter from
`new Rng(dailyKey(date))`, keyed off the UTC date; there is no control on the
daily screen (confirmed by `targets` on it this session: seventeen `class:N`
tiles, `back`, `share`, `start`, nothing that names a boss) that could ever
make the assigned boss come up. This session was handed `boss=gift` and
played whatever the day actually was (The Two Flasks) instead, the same way
past sessions played the setup screen's default when a cell's `size`/
`difficulty` turned out to be locked. Worth knowing before a future session
loses time trying to reach a specific `boss` on a `daily` cell: it cannot be
steered, only recorded after the fact, so the ledger's `boss` field for
`mode=daily` lines is closer to a coincidence than a target. This lives in
`scripts/playpick.ts`, outside what this job may touch, so it is written down
rather than fixed.

**Promoted, 2026-09-25.** The druid:guardian vigil-stall note that stood here
(wander/good, both parking within 11 units of each other) is now [[#6]], with
two further confirmations (a third seed post-0f03ad9, and a fourth under
`flee`). Filed as #281.

**2026-09-25, gate was shut so held here — strong enough to file the moment
it opens.** Second `mode=menus`/carried/820x1180-touch session (first was
2026-09-25-9, which covered the front page through composition and glanced
at settings without touching it). This one went where that one didn't: the
front page's own SHARE button, the settings screen's name field and camera
row, the BATTLEGROUND setup screen and the DAILY screen, all via `targets`
and `ui`.

README's own "How close the camera sits" section says the game has "four
settings, from the arena fitted to the screen out to nearly twice that,"
with "the default \[as\] the closest step." The settings screen disagrees
with its own doc: this session's `targets` on `settings` listed seven camera
controls, not four — `camera:0` through `camera:6` — and the screenshot
(`settings.png`) shows them labelled `FAR BACK MID IN OVER TAUT FACE`, with
`IN` (the fourth of seven) drawn selected, not `FAR` (the first, "the arena
fitted to the screen"). `src/render/theme.ts:426-427` confirms the live
values: `ZOOM_STEPS = [1, 2.5, 3.6, 5.5, 7.5, 10.2, 13.8]`, topping out at
nearly *fourteen* times the fitted radius, not "nearly twice." `DEFAULT_ZOOM
= 3` (line 443) matches the `IN` selection seen on screen, and the code's
own comment on it says so explicitly, in words that directly contradict the
doc: "Not the closest step and not the fitted one... Written as an index
rather than 'the last one', because the last one is now closer than a raid
wants to fight at and it should still be reachable." The doc describes an
earlier four-step camera that the code has since grown past on both ends —
same shape as #278 (Ebb and Flow's README time limit going stale against
`src/sim/battleground.ts`), just in prose rather than a table. Not filed —
twelve `playtest` issues were open at session start. File the moment the
gate reopens; code, doc and screenshot all already agree with each other
and disagree with the same doc section, so this does not need a second look.

**2026-09-25, driver lesson, not a game finding.** The front page's own
SHARE button (`README.md`'s "Sharing" section: "the button says `COPIED`
for a moment afterwards") read `NO LUCK` after being tapped this session
(`front-shared.png`), which `src/main.ts` only sets when `src/share.ts`'s
`share()` returns `'failed'` — neither `navigator.share` nor
`navigator.clipboard.writeText` succeeded. `scripts/playbot.ts` never grants
its browser context clipboard permissions and the CDP session has no share
sheet to hand off to, so this reads as the same class of thing as the
2026-09-25 emoji-lock-glyph note above: an artifact of what this driver's
browser context can offer rather than something a real phone or desktop
browser — which do have a share sheet or a permitted clipboard — would hit.
Not filed. Worth a second look only if a session can first confirm the
CDP context actually has clipboard-write and still sees `NO LUCK`.

**2026-09-25, gate was shut so held here — strong enough to file the moment
it opens.** Both pulls of [[#1]]'s idle/good pair (The Two Flasks, 10-normal,
warlock:destruction, fresh save — this profile's first-ever kill) landed on a
KILL screen with every earned banner drawn at the same anchor, stacked on top
of each other instead of laid out. `idle-end.png`: "First Blood" boxed over
"OPENED: 25-man normal" over a gold "Heroic / Kill it on heroic" teaser, with
#275's already-reported undimmed "DOWN" floating text cutting through the
party rows underneath all three. `good-end.png` — a second, independent pull,
different driver seed, run second — adds a fourth banner, "Nobody Felt It /
Kill it without losing anyone" (earned because that pull kept the whole raid
alive, unlike the idle pull), and a fifth, "Blood Price", piled the same way.
Two different pulls with two different banner sets landed on the same
illegible stack both times, so this is not one unlucky pairing — it is what a
fresh save's first kill looks like. #275 reported the "DOWN" text specifically
and only on a 25-heroic kill; this is the same undimmed-text family but at
10-normal, and it is bigger than one stray string — every banner a kill earns
competes for the same spot on screen with no sequencing and no offset between
them. Not filed — twelve `playtest` issues were open at session start. File
the moment the gate reopens; two independent reproductions already agree, it
does not need a third.

## Tried and dropped

Nothing yet. When a line comes off the list it lands here with the reason, so it
does not get re-raised in a fortnight.
