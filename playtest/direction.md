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

**2026-09-25, sharpened again: the same daily instance, three styles, and the
first outright idle kill against an active-style wipe.** `mode=daily` handed
druid:balance to a fresh save, and today's actual daily (confirmed by `targets`
on the daily screen before committing to a script — `daily.boss` is not
reachable as a `playpick` axis at all, see the driver-lesson note below) turned
out to be The Two Flasks, 25-player normal, SWARMING — the same boss and the
same day-key as 2026-09-25's earlier `mash` daily session, so this is a third
style on the literal same fight instance (identical party rolls and mechanic
timings; only the player's own actions differ), not just the same boss on a
different day:

```
mash (earlier session): wiped 106s, boss 19%, byMechanic={gather:2,caustic:242,reagent:1,hound:311}
good (2026-09-25-27.play): wiped 112.3s, boss 14%, aliveParty=12/25, byMechanic={gather:4,hound:620,reagent:2,caustic:114}
idle (2026-09-25-28.play): KILL 147.2s, aliveParty=9/25, byMechanic={gather:2,caustic:484}
```

`idle` is the only one of three styles that actually finished the fight —
`good` pressed 56 abilities and dodged, and still wiped worse than `mash`,
which pressed nothing but countdown-telegraph reactions. This is the first
mode=daily session in this job's history to run the idle/good discrimination
`docs/playtest.md`'s ladder section asks for, closing the gap the "Not yet
filed" section flagged on 2026-09-24 and again on 2026-09-25.

**Not filed — this is already the harness's own number.** `docs/upkeep.md`'s
balance table has The Two Flasks at idle 72% / good 40%, a +32 idle-over-good
gap, under "A raid rewarding play." A played session landing in the same
direction is confirmation of a number the upkeep job already owns, not a new
finding — same reasoning this file already applied to the Long Cold pair.

**Caution before reading too much into `hound`.** `good` ate 620 hound hits
and `idle` ate 0; it is tempting to read that as "standing still dodges the
hound" the way #267 reads bonestorm, but it likely is not. The hound's target
is `rng.pick(free)` (`src/sim/boss.ts:2989`) off the same shared, deterministic
RNG stream the whole fight draws from — same seed, since both runs are pull 1
of the same daily key — but every action either body takes (a cast's own
crit roll, an AI reaction) consumes a draw from that stream, so two runs that
behave differently arrive at the hound-target roll having consumed a different
number of prior draws and can land on a different name through no positional
cause at all. Worth a same-day pair where both styles are `good`-like (or both
`idle`) before trusting hound-targeting as a style effect rather than a
coincidence of which draw the two runs happened to be on.

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

**2026-09-25, sharpened by the first in-fight `wander` and the hardest cell a
healer has faced.** `wander` had only ever steered an `evening` between rooms
before now (two `mode=clear` appearances); this session ran it inside an
actual boss pull for the first time, on the first holy paladin this job has
played, at 25-heroic Bloodgorged -- the top rung of the door's own chain and
the hardest single-boss cell a healer spec has been given yet. The invite
hash is what got there at all: a fresh save's raid setup screen shows no boss
row and `unlocked=0` (only Bonegrinder 10N open, per `src/progress.ts`'s
chain), but `src/main.ts`'s invite handler deliberately unlocks whatever tier
a link names ("the chain is there so a new player meets the game in order,
not to stop somebody being invited past it"), so `open #b=gorged&s=25&h=1`
lands straight on the roster with that fight chosen.

`wander` presses a random ability slot round-robin every cycle and picks a
new random heading every twelve steps -- it does not target, does not react
to the game's own on-screen prompt ("THE TANK NEEDS YOU", screenshot
`mid.png`), and spent much of the fight out of healing range entirely ("Out
of range" on screen; `hits=28` at the 147s mark against 542 presses). A
second, longer run of the same pull through to a finish
(`playtest/plans/2026-09-25-36.play`) killed the boss at 159s: KILL, boss 0%,
21/25 raid alive (four members died), the player itself never once in danger
(`inDanger=0%` in both runs) and healing least of any healer on the board (14
hps, against 61-62 hps for the two AI healers). The two invocations of the
nominally same pull-1 fight produced different bills (`hits=28
taken=2833` through 147s vs `hits=4 taken=971` for the whole 159s) --
consistent with this line's existing caution that a style's own actions
consume draws from the shared RNG stream, so two runs of one script are not
bit-identical even on pull 1.

This is a sharper case than the idle-only readings so far: it is not merely
that pressing nothing costs nothing, it is that pressing something --
wrongly, out of range, ignoring the one prompt the game aimed at this
specific role -- still costs nothing at the hardest single difficulty the
game has. Four raid deaths did not turn the kill into a wipe. **Not a clean
disprove-by-`good`** (wander is not `good`), so this sharpens rather than
replaces the line's existing form; a `good`-style pass at the same cell would
say whether competent healing actually saves those four bodies or whether the
AI would have covered for them regardless.

Separately: the KILL screen reproduced the already-tracked banner/report
overlap (#275/#283's family) again -- four earned banners (First Blood,
Heroic, Full Raid, A Clean Board) stacked over the damage board with a "died
13s" line bleeding through underneath (screenshot `end.png`). Not filed
again; both issues are already open.

**2026-09-26, complicated by the first tank spec on the daily's own recurring
boss, and a mixed mechanism.** `mode=daily` gave The Two Flasks again (25
normal, SWARMING, its fourth prior appearance on this axis), for the first
time as warrior:protection, `melee` style, fresh save. Wiped at 126.4s, boss
at 6% -- closer than every other active-style pull this job has logged on
this exact boss (`good` 14%, `mash` 19%, `dodge` 24%), though still short of
the one `idle` pull that killed it outright at 147s. `bill`:
`byMechanic={"gather":5,"caustic":986,"reagent":2}` -- no `hound` entry at
all, where every non-tank pull of this boss on record took 300-1400 hound
hits. Read `src/sim/boss.ts:2987` afterward to see why: the hound's target
pool is `livingParty(s).filter(a => a.role !== 'tank' && ...)` -- tanks are
excluded from the mechanic outright, by role, not by anything a style chooses.
This is the first time that exclusion has been confirmed live rather than
just read off the source.

But the same pull's death was still self-inflicted, and by the driver, not
the game: 986 of the tank's own 993 mechanic hits were `caustic`, a ground
puddle, and the end screen's damage board shows why -- `You` took 8.2k damage
against the next-highest body's 4.6k, and finished last on the board at 38
dps despite tanking the entire fight. `scripts/playbot.ts`'s `melee` branch
(`acting === 'melee' && boss`) only ever computes a vector toward the boss; unlike
`dodge`/`good`, it has no `away`-from-standing-ground term at all, so a melee
body beelines straight through every puddle between it and the boss rather than
around it. So this one pull cannot cleanly separate two different effects
that both happened to land on the same body: a real game fact (tanks cannot be
hounded) that plausibly helped, and a driver-side gap (melee never dodges
ground hazards) that plausibly hurt, pulling the same pull in opposite
directions at once. A `good`-style pull on protection warrior specifically
(which does compute the away-from-standing term) would isolate the role
effect from the steering gap; worth running before this reads as evidence
either for or against line 1 on tank specs.

**2026-09-26, sharpened by the first `flee`-style pull run directly against a
boss (`play flee`, `mode=raid`, not a battleground or an evening's corridor
steering — checked the ledger, `flee` had only ever appeared in `battleground`
or `clear` mode before now) and the first Long Cold pull at its easiest
setting.** The Long Cold's only prior appearance on record was 25-heroic,
restoration shaman, `good` vs `idle` — this session ran it at the opposite
end, 10-normal, warrior:arms, fresh save, 390x844 touch
(`playtest/plans/2026-09-26-15.play`). A dps spec that presses nothing and
only moves away from danger (`flee` never calls an ability, same as `dodge`)
killed it in 86s with the raid at 10/10 and its own health at 592/1890 (31%),
`presses=0 inDanger=4%`. A fourth style now joins `idle`, `good`-as-healer and
`wander` in winning a cell outright while contributing zero of its own damage
or healing — the shape holds on a DPS role, a new boss, and the easiest
difficulty this line has tried it on, against the one time this boss has been
measured before at its hardest.

`bill` read `hits=436 hitsPerMin=304.5 taken=1298 takenPerMin=906.6
byMechanic={"chill":12,"cover":1,"instability":2,"flight":421}` — 421 of 436
mechanic hits were `flight`, which looked at first like a style effect worth
chasing (`flee` eating the most avoidable-looking mechanic by far). Reading
`src/sim/boss.ts`'s `updateFlight` first, rather than guessing, closed that
question immediately: it loops `livingParty(s)` unconditionally and applies
damage to every living member every tick the boss is aloft, no position check
at all (`landFlight`'s own impact does check distance, but that is the
landing, not the duration tick this bill is mostly counting) — the opposite of
`hound`'s `rng.pick(free)`-off-position targeting and `caustic`'s puddle. So
`flight`'s hit count says nothing about how `flee` steered; it is a fixed cost
every player in the raid pays alike, exactly as its own comment says ("off the
floor, and out of reach of everything... what it costs is not the damage: it
is fourteen seconds of a raid's damage"). Worth remembering before reading a
high mechanic-hit count as a style finding on this specific boss: check which
mechanic it actually was first.

**2026-09-26, sharpened by the first tank spec and the first `dodge`-style evening,
and the costliest raid outcome this line has had to still call a win.**
`mode=walk`, `boss=crowns` (a coverage label only -- see [[#6]]'s note below on
what that means -- the walk started at the door same as any other),
paladin:protection, `dodge`, 25-heroic, fresh save, 1280x800 desktop
(`playtest/plans/2026-09-26-19.play`). A fresh save opens nothing above
Bonegrinder 10-normal by itself (#273), so the 2026-09-26 driver-lesson recipe
(`open #b=marrow&s=25&h=1` -> `tap back` -> `tap raid`) reached a real
25-heroic WALK IN. Presses stayed at 0 for the whole evening -- `dodge` never
calls an ability, and a tank standing off cooldowns has nothing else pressing
it to -- and `inDanger` read 0% throughout: the player's own body took not one
hit.

Bonegrinder heroic still died in 48 seconds (`played style=dodge seconds=200
outcome=ongoing fightTime=48 phase=1 aliveParty=16/25 heroHp=2745/2745
bossHp=down presses=0 inDanger=0%`) -- close to the fastest heroic kill this
line has on record (`good`, 49s, 2026-09-26-14) -- but the raid paid for that
speed where the `good` kill did not: 9 of 25 dead (16/25 alive) against that
run's 25/25. Same boss, same difficulty, a comparable clear time, and the one
body that pressed nothing finished untouched while more than a third of the
party it was meant to be tanking for was on the floor. Every prior idle-shaped
win on this line kept the raid close to intact (10/10, 25/25, 24/25); this is
the first to trade real raid casualties for the free ride. Worth the same
caveat 2026-09-26's heroic-jitter note already raised: this cell is already
shown to have high run-to-run variance under active play, so one pull is
suggestive rather than a controlled pair -- a second `dodge` pull, or a
`good`-style tank pull at the same cell, would say whether nine deaths is what
a tank who never taunts costs a heroic raid specifically, rather than one
unlucky roll.

**2026-09-26, sharpened by the first pull of The Three Crowns this job has
ever fought (its two prior appearances were both `mode=walk` coverage labels
that never reached the room) and the sharpest case yet of "wrong still costs
nothing."** `mode=daily` (today's actual run, confirmed by probe: 25-player
normal, SWARMING), hunter:marksmanship, `melee`, 844x390 touch, carried
(behaves as fresh per #273). Two independent pulls of the same daily instance
(`2026-09-26-21.play`, three chunks to 218s; `2026-09-26-22-finish.play`, one
straight 257s pull) both landed on the same shape.

The Three Crowns puts the crown -- the one of three otherwise-identical
bodies that can actually be hurt -- on a rotating body, and the other two
"drink" (`thirst`) from whichever living party member stands nearest them;
`src/sim/boss.ts`'s own `untouchable()` makes a press against a body that
does not currently hold the crown do *nothing at all*, and its `updateThirst`
skips the crowned body and whichever was just ceded it, draining only the
rest. `src/sim/ai.ts` has the AI refuse a spot inside that drain radius
outright, so answering it (or falling into it) is the player's to do alone.
`melee`'s own steering (`scripts/playbot.ts`) just walks the player onto
`hud().boss`'s raw coordinate and swings there, with no idea whether that
body currently holds the crown -- and `hud().boss` (`src/main.ts:2910`)
exposes only one boss actor's name/hp/position, nothing about which of the
three bodies is real or where the other two stand, so the driver has no way
to do better even if the style were rewritten to try.

Both pulls of this daily instance spent effectively the *entire* fight this
way: `byMechanic` never carried a single `rotation`, `ballast`, `nuclei` or
`adds` hit despite `says` logging all four calls firing on schedule --
`thirst` was the only entry recorded, climbing from 1067 hits at 82.5s
(829/min) to 5274 hits by 257s (1230/min, still climbing) in the longer run.
The player's own hp fell to 662/1620 (41%) and it finished 18th-to-last of 25
on the damage meter at ~26-27 dps against a top line near 128 -- consistent
with most of its own presses landing on an untouchable target. And despite
an entire pull of a ranged dps parked on the one thing the raid is built to
keep clear of, dealing next to nothing and taking a mechanic meant to be
split or avoided entirely: `aliveParty` held at 25/25 both times and the
boss dropped cleanly to 10-20% on schedule. The raid did not merely survive
one body doing nothing (the shape every other entry on this line has); it
absorbed one body doing something *continuously wrong*, on the one fight in
the roster built specifically to bill wrongness, without so much as an
`inDanger` reading above 0% for that body's own health finishing the pull
alive both times.

**Not a clean instance of this line's own disprove-by-`good` condition**,
and worth flagging plainly rather than filing: `src/render/draw.ts`'s
`drawCourt` gives a real player an unambiguous visual (a filled disc under
the crowned body, a warm ring under whichever one is actively drinking) that
`melee`'s steering simply cannot see, so this is a demonstrated driver
vocabulary gap on this specific fight, not evidence a human would make the
same mistake. What it still shows cleanly is the raid's own tolerance for a
body executing about as wrong as this vocabulary can produce, for an entire
fight, on the one encounter that is explicitly a test of exactly that -- see
the matching driver-lesson note below.

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

**2026-09-26, a fifth confirmation, first shadow priest and a second `mash`
run.** `mode=walk` aimed at `whisper` again (the only repeat target this line
has had), this time priest:shadow (this job's first shadow priest pull of any
kind -- the one prior priest:shadow session was a battleground), `mash`,
10-normal, fresh save, 390x844 touch. Chased into THE VIGIL by the
threshold's watchmen exactly as the druid:restoration/`crowns` walk was,
wiped at 33.9s, `outcome:retry` tapped, re-wiped instantly with `hero.hp=0`
and every ability slot `locked`, and a second `evening` call over the same
stuck room produced the identical shape a room later --
`fault:evening-stuck {"at":"vigil","after":"wipe","rooms":3}`. Screenshot
(`after-evening-1.png`) is the same DEFEAT-screen shape as every prior
report. Not commented on #271 again -- five specs, four styles, two save
states and both touch and desktop viewports have now hit this exact wall the
same way, and this session adds a target boss (`whisper`, for the second
time) and a second `mash` reproduction rather than a new axis or a sharper
mechanism; the issue already says plainly what this confirms.

**2026-09-26, a sixth confirmation, first ranged dps class, and the first
`mode=clear` reproduction of the retry-wipe shape rather than [[#6]]'s no-wipe
stall.** `mode=clear`, mage:frost, `wander`, 10-normal, fresh, 1280x800 desktop
(`playtest/plans/2026-09-26-23.play`) -- deliberately the same
size/difficulty/style triple as the cell that first opened [[#6]]/#281 on
druid:guardian, to see whether the VIGIL wall is class-independent the way
`cross()`'s spec-blind steering predicts. It is, but not in the same shape:
the threshold's watchmen chased this pull down and killed it
(`crossed from=vigil to=vigil ... wiped at=vigil outcome=wipe wipes=1` at
56.3s), not the no-wipe stall the identical cell produced on druid:guardian.
PULL AGAIN was tapped and re-wiped instantly (`hero.hp=0`, every ability slot
`locked`), a second `evening` call over the same stuck room produced the
identical shape a room later, and the evening declared itself stuck at
118.5s: `fault:evening-stuck {"at":"vigil","after":"wipe","rooms":3}`. Not
commented on #271 again -- five specs, four styles and two save states had
already nailed down "PULL AGAIN never revives a travel-mode wipe"; this adds
a sixth spec (the first ranged pure-dps one) and the first confirmation under
`wander` specifically, where every prior #271 report used `mash`, `auto` or a
plain walk. Gate held shut (14 open `playtest` issues, unchanged), so nothing
filed.

Worth folding into [[#6]]'s own picture: the same size/difficulty/style triple
that stalled druid:guardian in place without ever wiping instead wiped and got
stuck here. Which of the two happens looks like it depends on whether the
threshold's watchmen actually catch the party this particular run, not on
anything about class, size or difficulty measured so far.

### 4. A battleground's own setup is remembered less reliably than a raid's

**2026-09-24, opened.** First battleground session this job has run (five
sessions in, `mode` had never come up on the least-played axis before now).
`playpick` gave conquest; the first pull was played straight — `open` ->
BATTLEGROUND -> `map:conquest` -> priest:shadow -> PULL -> `play flee 180` on
carried, 820x1180 touch. The Three Cairns ended in 145s at 146-400, a full
loss, with `presses=0` and `inDanger=0%` the whole way. The passive-body
finding from that pull now has its own line, [[#7]], sharpened by a second
map and style — it isn't about setup memory, so it doesn't belong on this
one.

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

**2026-09-25, sixth confirmation of a clean crossing, and the first stall
found in a room that is not THE VIGIL.** `mode=walk`, `boss=skyward` (a
coverage label only -- `evening` steers at no boss, so this walked in at the
door same as any other), paladin:retribution, `idle`, 25-heroic on a
`carried` save that behaved as fresh per #273's still-open port bug (setup
showed the locked default, 10-normal), 844x390 touch
(`playtest/plans/2026-09-25-37.play`). First `idle`-style evening this job
has ever run inside `mode=walk` or `mode=clear` at all -- checked the ledger
directly, `idle` had only appeared twice before this, both single `mode=raid`
pulls -- and worth running because `scripts/playbot.ts`'s `evening()` hands a
travel-mode room to `cross()`, and `cross()` takes no `style` argument at
all: a corridor is walked the same way whatever style was assigned, and only
a room in `raid` mode ever reads it. THE VIGIL crossed clean in 33.1s
(`9.7s` in to `42.8s` out, `presses=9`) -- a second clean crossing after
`melee`'s 26s one, and exactly what "corridors ignore style" predicts, since
an idle player is still walked by `cross()`'s own fixed-heading steering
regardless. The evening then killed The Bonegrinder inside the walk itself,
still under pure `idle`: `fightTime=178` of a `300`s budget, `aliveParty=10/10
heroHp=1800/1800 presses=0 inDanger=5%`, boss down, no report screen (the
evening reads the `raid`→`travel` mode drop and carries straight on, which
matches the README's "no report, no meter over the screen" description of a
walked boss kill) -- a fourth spec now on record for [[#1]]'s idle-wins
shape, and the first time it has been seen mid-evening rather than as a
standalone pull.

Two rooms later, `THE WEST CLIMB` -- ground between the first boss and the
second, per its own dungeon.ts entry, not a room with a boss in it --
burned its entire 300s budget without the chamber ever changing:
`fault:fight-outlasted-its-budget {"room":"westclimb", hero:
(-483.4,-7954.4)}`, `nearestDoorGot=12` (closest approach twelve units, never
inside the six-unit "waited" band `cross()` tracks -- `secondsAtTheDoor=0`).
The screenshot (`after-evening.png`) shows the same shape THE VIGIL's four
stalls made: all ten party members clustered together on the walkway, every
health bar full and green, nothing fighting or dying, `486s` on the clock and
no progress. This is the first time this job has seen the "evening parks
itself near a door and stops" failure anywhere other than THE VIGIL, which
argues #6/#281's mechanism is not specific to that one corridor -- it may be
a property of `cross()`'s own fixed-heading steering wherever it fires,
rather than something about THE VIGIL's watchmen. One room, one session,
same caveat every new corridor gets here: not yet three cells, so not yet a
sharper claim than "seen once, somewhere else."

**2026-09-25, seventh confirmation, and the first cell to see three styles
run against it.** `mode=clear`, druid:guardian, `flee`, 10-normal, fresh,
1280x800 desktop -- the exact cell `wander` (2026-09-25-17.play) and `good`
(2026-09-25-18.play) already stalled on in THE VIGIL, now run a third way.
`flee` stalled too, at 411.1s: `fault:fight-outlasted-its-budget
{"room":"vigil","hero":{"x":267.97,"y":-1561.16}}` -- 2 units from `good`'s
stall on this same cell (268.1,-1563.2) and 12 from `wander`'s
(274.5,-1572.7). The screenshot (`after-evening.png`) shows the same shape
every prior stall made: raid clustered by the campfire, a couple of members
fighting alone to the east, near-zero damage on the board (top parser line
44 dps), `189 left in it` not falling. Not new evidence that this cell
stalls -- that was already shown twice -- but the tightest convergence yet:
three different steering behaviours, one spec/size/difficulty/save, landing
within about a dozen units of each other. Still holds against `melee` and
`idle`, the only two styles that have ever crossed THE VIGIL clean, both on
*different* cells -- worth a `melee` or `idle` run on this specific
druid:guardian/10-normal/fresh cell before trusting that those two styles
cross any cell cleanly rather than this one in particular being unusually
open to them.

**2026-09-26, eighth confirmation, and the first clean `good` crossing --
on a much harder cell.** `mode=clear`, shaman:elemental, `good`, 25-heroic,
fresh (`carried` behaves as fresh per #273), 844x390 touch
(`playtest/plans/2026-09-26-13.play`). `good` had stalled THE VIGIL twice
before (2026-09-25-18, and again above under `flee`/`wander` on the same
10-normal druid:guardian cell); here it crossed in about 30 seconds
(`7.9s` at the door to `37.5s` at the boss's own room, `presses=6`), then
went straight into a live Bonegrinder-heroic pull. **This is the first
`mode=clear`/`mode=walk` session in this job's history to actually reach
25-heroic** rather than silently falling back to the fresh save's
10-normal default -- see the driver-lesson entry below on how. So the one
style that reliably stalled on a 10-normal cell crossed clean on a
25-heroic one, on the same run of `evening`'s own fixed corridor-steering
code (`cross()`, which -- per the 2026-09-25 note above -- ignores style
entirely and walks every corridor the same fixed way regardless of what is
assigned). That argues harder still against "style" being the operative
variable at all, and for size/difficulty (or whatever `cross()`'s own
steering does differently with a bigger, more heroic-tuned party in tow)
being what actually separates a clean crossing from a stall -- worth a
`good` or `wander` repeat on 25-heroic specifically, and a `melee`/`idle`
repeat on 10-normal, before this reads as "size/difficulty is the real
axis" rather than "two more coincidences."

Same session, pushed further (`playtest/plans/2026-09-26-14.play`,
identical script, a second fresh browser/pull): the first script's
Bonegrinder-heroic pull was still going at its 130s room budget
(`fight-outlasted-its-budget`, boss at 19%, phase 3, aliveParty 24/25,
heroHp 1081/1440), so a second, independent run of the *exact same script*
was given 200s for the fight instead and killed it in 49s flat
(`boss-down`, phase 1, aliveParty 25/25, heroHp 1012/1440) -- nearly three
times faster, one phase further behind if anything, with nobody down at
all. Both are nominally "pull 1" of Bonegrinder 25-heroic under `good`:
`src/main.ts`'s `rngFor` keys any `mode==='raid'` fight off
`BASE_SEED + attempt*7919`, not off `run.seed` (which is `Date.now()` and
only feeds the *travel*-mode corridor rolls per `roomSeed`), so the boss's
own timeline should be bit-identical at attempt 0 in both runs -- the
entire spread is `docs/playtest.md`'s already-documented "the number of
ticks inside a real second is not fixed" jitter in when `good`'s own
presses and dodges land, at a scale (a heroic pull that is not obviously
finishing within budget vs. one that ends with a perfect raid) this job
has not previously put a number on. Consistent with README's own claim
that heroic survival is "a cliff, not a slope": a millisecond of
press-timing drift that would be noise on normal apparently compounds into
pass/fail on heroic. Not a bug and not filed -- the cause is already known
and written down -- but worth remembering before reading any single
heroic `good`/`ladder` pull as representative of the cell without a repeat.

**Also resolves the 2026-09-24 "vigil overlay" note under *Not yet filed*,
below.** The `"N left in it"` text that note worried was a VIGIL-specific
overlay bugged into persisting past its own room turns out, on reading
`src/render/hud.ts:1568`, to be exactly what its own comment says it is: the
whole citadel's remaining living-boss-faction count, drawn throughout any
`s.travel.building === true` walk -- i.e. every room of a whole-building
evening, by design, not a leftover from THE VIGIL specifically. This
session's own journal shows the same count falling as the evening kills
things (`186` at the door, `173` two rooms and one dead boss later at THE
WEST CLIMB), which is the counter working, not sticking. No further look
needed; struck below.

**2026-09-26, ninth confirmation, a fifth style crossing clean and a second
clean crossing at 25-heroic specifically.** Same driver-lesson unlock recipe
as the shaman:elemental session above, this time paladin:protection, `dodge`,
fresh save, 1280x800 desktop, aimed at `crowns` -- a coverage label only, since
`evening` steers at no boss and this walked in at the door same as any other.
THE VIGIL crossed in about 31 seconds (`8.8s` at the door to `39.8s` in
`spire`, `presses=14`) -- the second style, after `good`, to cross clean
specifically at 25-heroic, where four of five styles tried so far have stalled
at 10-normal. Another data point for size/difficulty over style being what
actually separates a clean crossing from a stall. (What happened once inside
Bonegrinder's room is [[#1]]'s finding, not this one: the crossing was free,
the kill was not free for the raid.)

A fault fired mid-crossing and resolved itself one journal line later without
changing the outcome: `fault:nowhere-to-go-from-here {"at":"vigil"}` at 39.7s,
immediately followed by a normal `crossed from=vigil to=spire` and
`boss-woken` at 39.8s. Read `scripts/playbot.ts:1290-1373` afterward rather
than guess (own driver code, not `src/`): the fault fires when `ways()` comes
back empty for the room `cross()` still believes it is in, but the chamber had
evidently already changed underneath that check within the same 140ms tick --
the guard that would normally catch a chamber change runs once at the top of
the loop, before `ways()` is queried a few lines later, so a crossing that
completes mid-iteration can still trip the empty-`ways()` branch on stale
information. The line also carried `journalKeyClash: true`
(`scripts/playbot.ts:95`'s own collision-rename for a caller that reused
`at`/`kind` as a field name), working exactly as its own comment describes.
Driver lesson, not a game finding -- the evening finished normally (5/5 rooms,
0 wipes, no further faults) and this is entirely inside `scripts/playbot.ts`,
outside what this job may touch.

### 7. A battleground does not carry a passive body the way a raid does

Two battlegrounds now, two different maps, two different styles that never
press an ability, same shape: a body that only avoids and never fights costs
its own team the match. That is the mirror of [[#1]]'s raid `idle` findings,
where a body that presses nothing still wins comfortably because the AI party
carries it — here the AI party does not.

**2026-09-24, opened.** First battleground session this job ran: The Three
Cairns (conquest), priest:shadow, `flee`, carried, 820x1180 touch. `play flee
180`: `presses=0 inDanger=0%` the whole way, and the match ended in 145s at
146-400, a full loss.

**2026-09-25, second map, second style, same shape.** The Long Haul (escort),
the first pull this job has ever taken on this map — the one prior visit
(2026-09-25-7) only picked it in setup and reloaded, to catch #272, and never
fought it. shaman:elemental, `dodge`, carried, 820x1180 touch, three chunks of
`play dodge 100`:

```
104.9s played style=dodge seconds=100 outcome=ongoing bossHp=56% presses=0 inDanger=0%
210.2s played style=dodge seconds=100 outcome=ongoing bossHp=97% presses=0 inDanger=0%
307.6s fight-over outcome=defeat time=300
307.6s played style=dodge seconds=92  outcome=defeat  bossHp=0%  presses=0 inDanger=0%
```

`bill` read `hits=0 taken=0` in every one of the three chunks — `dodge` never
presses an ability at all (`scripts/playbot.ts`: only `mash`/`wander`/`good`/
`melee`/`learn` ever call `d.ability()`), so this is a body that both dealt
and took nothing for the full 300 seconds, finished at full health
(1440/1440) while three of its four AI teammates cycled through repeated
deaths (final board: `Wren died 11s`, `Bastion died 17s`, `Kestrel died 28s`,
`Vale died 34s` — respawn-timer readings, not first deaths; the minimap
already read `2 v 5` for our side at 97s), and the match still ended in
defeat. `hud().boss` in a battleground reads the contested cart's own
progress rather than a boss's health here: it fell from 100% to 56% in the
first 100 seconds, climbed back to 97% in the next 100 (pushed back, nearly
reversed), then collapsed to 0% and defeat in the last 92 — the four bodies
that were actually fighting could not hold that final push with a fifth
standing off untouched.

**Disproved by** a battleground where a style that presses nothing wins, at
any map. **Sharpened by** a `good`-style run on either map, to see whether
active play actually turns one of these around rather than merely trailing
less badly.

**2026-09-25, sharpened by the first active-style run, third map.** `playpick`
gave `mode=battleground map=flags spec=druid:feral style=auto view=1280x800
save=carried`. `README.md` says AUTO is "touch only", and reading
`src/main.ts`'s `hitAt()` confirmed why: the toggle only answers a tap when
`input.isTouchMode()` is true, so a desktop/mouse view has no control for
`style=auto` to press at all. `scripts/playbot.ts`'s own `play()` already
knows this (`no-autocast-toggle`, "no toggle on screen and no key for it --
playing good instead") but no prior session had actually confirmed the
fallback firing in a journal -- this one did, five times over two runs
(`playtest/plans/2026-09-25-33.play`, `-35.play`). So this cell became, in
effect, the first `good`-style attempt on any battleground map this line has
asked for. It did not turn the loss around: the feral druid went down within
15 seconds of the pull both times (`bossHp` in the journal is a red-team
member's name/hp, not a boss -- `src/sim/state.ts`'s `RED_NAMES`, not a
mechanic reading) and spent most of two ~40-45s windows dead, `hits=0` the
whole time in the second run. Effort did not help here because the body could
not survive contact at all, which is a different failure shape from the two
passive-style losses already on this line (flee/dodge, which never engaged
and never died) -- worth a same-map comparison against a style that actually
survives before reading this as the disproof-by-good the line's own condition
names, since dying immediately is not the same experiment as playing well and
still losing.

**2026-09-26, third map, dodge and good both tried on the same cell.** The
Long Haul (escort), warlock:destruction, 844x390 touch, carried (behaves as
fresh per #273). `dodge` (`-5.play`) repeated the shape this line already has
two examples of: `hits=0` for the full 300s, presses=0, `inDanger=0%`, full
health throughout, and the match still ended `outcome=defeat`. A `good`-style
companion pull on the identical map/spec/viewport (`-6.play`) went the same
way the flags feral druid did rather than turning the loss around: dead
within 13 seconds, and dead again by 38s -- a second confirmation that "dying
immediately" rather than "surviving but still losing" is what `good` looks
like on a battleground map so far, on a second class and a second map. Still
no `good`-style battleground run that survives long enough to test whether
active play actually helps; both attempts so far have been the body dying
before that question could be asked.

**2026-09-26, third map (conquest), and the first same-session bare-idle
control on a battleground.** `playpick` gave The Three Cairns (conquest),
druid:balance, `good`, 820x1180 touch, carried (behaves as fresh per #273) --
conquest had only ever seen `flee` before (2026-09-24). `good` (`-16.play`)
died at fightTime~9s (`aliveParty` 4/5), a third map and third spec where an
active style dies almost immediately (flags/druid:feral ~15s, escort/
warlock:destruction ~13s, now conquest/druid:balance ~9s) -- still no
`good`-style battleground pull that has survived long enough to test whether
active play actually helps.

What is new this time is a same-cell, same-session control: `-17.play`
reran the identical pull with no `play` call at all -- pure `wait`/`state`
polling, so no ability presses and no steering, the closest thing to `idle`
this vocabulary can express on a battleground -- and the player stayed
`alive:true` at full health (1485/1485) for the full 30 seconds polled,
completely untouched. Same cell, same session: doing nothing survived
cleanly, doing something died in nine seconds. That is the sharpest
single-session contrast this line has produced, and it says the same thing
[[#1]] says about raids: the body dies from what it does, not from what is
done to it.

A third script on the same cell (`-18.play`) chased down what looked, in
`-16.play`, like a stuck respawn -- three post-death `state` reads all showed
the player's own "up in Ns" respawn clock (`src/render/hud.ts:1548`) sitting
at 6-7s without reaching zero, across two screenshots 25 game-seconds apart.
Getting the player killed with one short `play good 15` and then polling with
nothing but bare `wait`/`state` afterward (no further `play` at all) showed a
clean revival instead: dead at fightTime~8.7s, still dead at ~13.8s, alive
again by ~19s -- about ten seconds, squarely inside `RESPAWN_EARLY=6`/
`RESPAWN_LATE=11`, and the player then stayed alive for the remaining ~20s
observed since nothing was asking it to fight again. Same conclusion as
*Tried and dropped*'s battleground-respawn note below, now confirmed on a
third map/spec: `-16.play`'s stuck-looking reads were an unlucky run of
re-dying between samples while still actively playing, not a stall in the
respawn itself.

Findings with nowhere to go yet: either the issue gate was shut when they turned
up, or they have only been seen once and once is an observation. A line here
either becomes an issue, gets promoted to a standing hypothesis, or goes to
*Tried and dropped* with the reason.

**2026-09-26, driver lesson, not a game finding.** How to get a `mode=clear`
or `mode=walk` cell to actually test the size/difficulty `playpick` assigns,
rather than silently falling back to a fresh save's locked 10-normal default
the way every prior session on this axis has (`#273` means `carried` behaves
as fresh, and a fresh save only has Bonegrinder 10-normal open). An invite
hash unlocks a tier but also sets `visiting = true`
(`src/main.ts:2136`), which makes the class screen's button start that one
fight directly (`atTheDoor()` returns false while `visiting`, so `walkIn()`
calls `startFight()` -- "one boss, one setting, and no evening around it")
rather than opening the door an `evening` script needs to walk through. The
fix is one extra round trip: `open #b=marrow&s=<size>&h=<0|1>` (any
first-boss id works, since the chain opens every rung *below* the one named
too), then `tap back` (roster's `back` reads `visiting` and returns to
`home`), then `tap raid` -- pressing RAID from home unconditionally sets
`visiting = false` and resettles the door's size/difficulty against the
tier just unlocked (`src/main.ts:1695`), landing on a real raid-setup screen
already showing the requested pair (confirmed by screenshot,
`playtest/plans/2026-09-26-12-probe4.play`, `RAID SIZE 25`, `DIFFICULTY
Heroic`, "you walk in at the threshold"). From there PICK YOUR CLASS reads
"WALK IN -- 25 player heroic," not "PULL," and `evening` behaves normally.
Used this session to run the first `mode=clear` session ever to actually
reach 25-heroic (see [[#6]] above). Worth reusing on any future `mode=clear`/
`mode=walk` cell that draws a size/difficulty a fresh save has not opened,
until #273 itself is fixed.

**2026-09-26, held, gate shut, but fully measured -- a real bug, twice
confirmed.** First `mode=menus` session on a non-touch viewport (1280x800,
mouse) -- the four prior menus sessions were all 820x1180,touch -- and the
first use of `key` with `escape` anywhere in this job's history (checked by
grepping every `.play` under `playtest/plans/`). That surfaced a driver
vocabulary bug before it surfaced a game one: `docs/playtest.md`'s own table
lists `escape` as the literal argument, but `scripts/playbot.ts`'s `key()`
hands the string straight to Playwright's `keyboard.press()` uncapitalized,
which throws `Unknown key: "escape"` -- `fault:driver-threw` on the first
attempt (`2026-09-26-10.play`, first run). `key Escape`, capitalized, is what
actually works. Driver lesson, not a game finding; `scripts/playbot.ts` is
outside what this job may touch, so it is written down rather than fixed.

The actual experiment: `src/input.ts`'s keydown listener sets
`menuRequested = true` on Escape *or* `p` (an entirely undocumented second
binding -- `README.md`'s own key list never mentions `p`) unconditionally,
whatever screen is showing, since the listener is attached to `window` and
never checks `screen` at all. But `takeMenuRequest()` -- the only place that
ever reads and clears that flag -- is called from exactly one site in the
whole file, inside the fight screen's own update function
(`src/main.ts:2283`, "leaving mid-fight is always available"). No menu screen
(settings, roster, composition, citadel, record) ever calls it.

So: pressed `key Escape` once on the SETTINGS screen, confirmed nothing
visibly changed there (`targets`/`state` identical before and after, as
expected -- nothing on that screen reads the flag). Then walked back to the
front page *without an intervening `open`* (an `open` mid-script reloads the
page and would have reset the flag along with everything else -- the first
attempt at this made exactly that mistake and the bug did not reproduce
until `open` was removed from the path), picked a class, and pressed PULL.

`tap pull` returned `screen=roster mode=travel` -- not `fight` -- in the very
same journal line as the tap itself. `waitscreen fight 15` timed out:
`fault:screen-never-came {"want":"fight","saw":{"screen":"roster","mode":
"travel","outcome":"ongoing"},"seconds":15}`. `state` in the meantime showed
the sim had genuinely moved on underneath the stuck screen -- `chamber=
"threshold"`, the ability bar reading `"range"` instead of the pre-pull
`"ready"` -- so pressing PULL did start the evening; the flag consumed it a
frame later and switched `screen` back to `roster` before the fight screen
was ever drawn, exactly the mechanism `main.ts:2283` predicts. The screenshot
taken at that point (`fight-immediately.png`) shows PICK YOUR CLASS still on
screen, fifteen seconds after PULL was pressed, with no error, no message,
and no visible reason the button did nothing. A second `tap pull` on the same
stuck roster screen recovered immediately and normally (`screen=fight`,
`chamber=threshold`, THE THRESHOLD drawn on screen, `fight-second-attempt.png`)
-- confirmed twice, in two separate `playbot` invocations
(`/tmp/pt-10c`, `/tmp/pt-10d`), same shape both times.

So the actual defect: **an Escape or P pressed anywhere before a player's
first pull of a session -- on a screen where it visibly does nothing at all
-- silently costs them their next PULL press**, with the evening already
moving underneath a screen that never updates to show it. A player who
reaches for Escape out of habit (to back out of settings, say) and then
wonders why the first PULL of their session did nothing would have no way to
learn why; the fix costs nothing to describe (either check `screen ===
'fight'` before setting the flag, or clear it on every screen change) but
this job edits `playtest/`, not `src/`. Fourteen open `playtest` issues held
the gate shut at session start (unchanged from the last several sessions) --
file this first thing once it reopens, with `playtest/plans/2026-09-26-10.play`
and both screenshots.

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

**Resolved, 2026-09-25 — not a bug, struck.** `src/render/hud.ts:1568`
answers it directly: `"N left in it"` is not a vigil overlay at all, it is
the whole citadel's remaining living-boss-faction count, drawn throughout
*any* whole-building walk (`s.travel.building === true`), by the code's own
comment ("what is left of the building, rather than what is left of the
stretch"). It is supposed to keep showing in every later room of the same
evening. A normal-pace, non-dash `evening` run this session (see [[#6]])
shows the same count falling as things die (`186` at the door, `173` two
rooms and a dead boss later, at THE WEST CLIMB) rather than sticking — the
counter working as designed, not the straggler bug this note guessed at.

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

**Filed, 2026-09-25, as #282.** The settings camera-row/README mismatch above
(2026-09-25, first raised while the gate was shut) reproduced clean on a fresh
run once the gate reopened — same seven `camera:0..6` controls, `IN` selected,
`ZOOM_STEPS`/`DEFAULT_ZOOM` unchanged — and was filed with a fresh script and
screenshot, since the original session's shot was never committed (`playtest/`
keeps no shots directory).

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

**Filed, 2026-09-25, as #283 — narrowed on the way in.** The banner-pile note
above (2026-09-24/25, warlock:destruction pair, held while the gate was shut)
reproduced independently on a third, unrelated cell (daily mode, druid:balance,
25-player, "First Blood" + "Full Raid" together) once the gate reopened, but
reading the actual draw code first changed the framing: `drawAwardBanners`
(`src/render/history.ts`) does offset each earned banner from the last
(`y = L.h * 0.22 + i * (h + 8)`) — the banners are not literally stacked on one
anchor. What overlaps is the banner *column* against the damage/healing
report below it: `drawOutcome`'s `reportTop` (`src/render/hud.ts`,
`Math.max(96, L.h * 0.26)`) is a fixed position that does not grow with how
many banners are showing, so even one earned banner's bottom edge reaches past
where the report starts, and two (or the `openedLine` unlock text on top)
push further into it. Filed with the corrected mechanism rather than the
original "no offset" description.

**2026-09-25.** First session ever to open THE CITADEL map screen
(`playtest/plans/2026-09-25-30.play`) — no prior session in
`sessions.jsonl` or this file had reached it; it is only accessible by
standing on a pad or, mid-evening on touch, by revealing the corner group
and pressing `map`. `ui` found it clean (one control, `back` at exactly
120x44, no overlap, nothing off the glass) and the room layout, passage
colours and "10-man normal — where you are, and what is still shut"
subtitle all match `README.md`'s own description.

What does not match: `README.md`'s "Getting in" section says "GIVE UP on
the map ends it and puts the next one back at the door." There is no
button on this screen called GIVE UP, or anything that behaves like it.
The only button present with nothing cleared yet is `BACK`
(`src/render/menu.ts:1309`), and pressing it does not end the evening —
measured directly: `tap back` took `screen` from `citadel` to `home` while
`mode` stayed `travel` and the run was left untouched (`targets`/`state`
before and after), and a fresh `open` -> `tap raid` afterward landed
straight back on `screen=fight mode=travel` at the same chamber
(`threshold`) rather than at any door. That is the same "RAID resumes
standing where you stood" behaviour the README documents as the *default*
two sentences earlier in the same paragraph, not the separate
ending-and-reset behaviour it claims for GIVE UP. The button that actually
matches "ends it and puts the next one back at the door" is `RESET`
(`layout.reset`, armed via a second press, "stands this evening's dead
back up" per its own comment) — but it only appears once at least one room
is cleared (`down > 0`), is not labelled GIVE UP anywhere, and *restarts*
the rung from scratch rather than merely ending the current sitting. So the
README describes a control this screen does not have, on a screen this job
had never opened before this session. **Held, gate shut** (14 open
`playtest` issues at session start) — a menu describing behaviour the code
does not have belongs in `playtest.md`'s "what is worth an issue" list
("a menu that says something untrue about the game behind it"); file it
first thing once the gate reopens, with this session's script.

**2026-09-25.** A possible player-respawn stall in a battleground, seen once
and not confirmed. `playtest/plans/2026-09-25-33.play` (druid:feral, Ebb and
Flow) showed `me` reading `hp=0 alive=false bar=[...locked]` continuously
across three `state` calls spanning fightTime 16s to 30s -- 14+ seconds after
the death that caused it, past both `src/sim/battleground.ts`'s
`RESPAWN_EARLY=6` and `RESPAWN_LATE=11` -- while the party's own `alive`
count recovered in the same window (3/5 -> 4/5). A dedicated follow-up
(`-34.play`, `state` polled directly every 5s with no `play` call in between,
so the driver's own abort-on-null quirk could not be cutting the observation
short) showed a clean, normal revival instead: dead at fightTime 12s, full
health and `alive:true` by fightTime 22s, about 10 seconds later, right where
the constants say it should land. A third run (`-35.play`) went back the
other way: dead at fightTime 15s and still reading `hp=0 alive=false
bar=[...locked]` at fightTime 39s, 24 seconds later, with no `alive:true`
sample caught in between despite two `state` reads in that span. Two runs
show the stall, one shows a clean respawn, and the two stalled runs both used
chained `play` calls (which can miss a respawn-then-redie cycle between
samples) while the clean one used bare `state` polling -- so this could be a
real intermittent stall, or it could be a body dying again within seconds of
every respawn against a battleground this small (5v5) and this rough on a
melee dps, and the chained-`play` runs simply never sampled the live window.
Not filed -- one clear methodology-clean revival is a disproof of "never
respawns" and there is no clean-polling run yet that shows the stall, so this
is not yet even a one-cell observation by the letter of it. Worth a repeat
using `-34.play`'s bare-`state`-polling method specifically, on a body that
dies again, before this goes anywhere further.

**Dropped, 2026-09-26.** Ran the repeat this note asked for, on a second spec
and map: The Long Haul (escort), warlock:destruction. A `good`-style pull
(`-6.play`) died at fightTime~13s and read `hp=0 alive=false bar=[...locked]`
across two more chained `play good 100` calls out to fightTime 38s -- the same
stuck-looking shape as `-33`/`-35`'s stalls, and the screenshot at that point
(`mid1.png`) even shows the game's own "up in 6s" respawn countdown on
screen, proving the state was mid-countdown, not stuck. The bare-polling
repeat (`-7.play`, `state` every 5s, one `play good 40` up front and no
chained `play` after) died at fightTime~14s and was back to `hp=1485/1485
alive=true` with a fresh, unlocked ability bar by the very next sample at
fightTime~24s -- a clean ten-second respawn, landing inside
`RESPAWN_EARLY=6`/`RESPAWN_LATE=11` same as `-34`'s. Two bare-polling runs now
agree (clean revival, ~10s, both times) against two chained-`play` runs that
each looked stuck at least once -- the stall was the chained-`play` sampling
gap the note already suspected, not a game bug. Moved to *Tried and dropped*.

**2026-09-25, driver lesson, not a game finding.** `style=auto` silently
becomes `style=good` (`scripts/playbot.ts`'s own `no-autocast-toggle` note)
on any `view` without a `,touch` suffix, because `src/main.ts`'s `hitAt()`
only answers the AUTO toggle when `input.isTouchMode()` is true and the
toggle is documented (`README.md`) as touch-only. Confirmed in a journal for
the first time this session (`-33.play`, `-35.play`) -- a prior `style=auto`
session on a desktop view (`2026-09-24T23:40Z`, mode=walk toward whisper)
never checked for the fallback line. Worth knowing before a future `playpick`
cell pairs `style=auto` with a non-touch `view`: it will play, but as `good`,
not as the thing the cell name promises.

**2026-09-26.** First session to actually type into the name field
(`src/render/nameinput.ts`) rather than read it off the code -- no prior
session had, since the `.play` vocabulary has no generic text-entry command.
Went around it with a one-off Playwright script
(`playtest/plans/2026-09-26-1-name-field.mjs`), on the assigned menus cell
(820x1180 touch, carried), driving the real `<input>` through real
`insertText` and real clipboard-paste keystrokes rather than calling into the
game.

Plain-text behaviour all held exactly as `README.md`'s "A name of your own"
describes: fifteen ASCII characters clipped to twelve
(`"aaaaaaaaaaaaaaa"` -> stored `"aaaaaaaaaaaa"`), mixed whitespace/tabs
collapsed and trimmed (`"  a\tb\n\nc  "` -> stored `"a b c"`), and a
whitespace-only field fell back to the default (`"    "` -> stored `"You"`).

The one hypothesis this was actually written to test -- whether the native
`<input maxlength=12>` (`src/render/nameinput.ts:50`), which the browser
enforces in UTF-16 *code units*, could split a surrogate pair before
`cleanName`'s own code-point-based slicing (`src/name.ts:42`) ever saw the
string, exactly the bug class `README.md` says was already caught and fixed
once -- did not reproduce. Tried four ways: typing 11 ASCII chars then one
astral emoji (13 units against the 12-unit cap), typing thirteen whole emoji
one at a time, and the same two shapes again via clipboard paste
(`page.keyboard.press('Control+v')`, with the context granted
`clipboard-read`/`clipboard-write`). All four: Chromium rejects the entire
overflowing insertion outright rather than truncating it, so the field's own
value never contained a lone surrogate in any of the four
(`hasLoneSurrogate` checked after every insert). Screenshots
(`name-2-emoji-boundary.png` through `name-6-paste-thirteen.png`) show a
clean field throughout, never a broken glyph.

**But it surfaced a real, smaller gap instead.** Because the DOM's
`maxLength=12` counts UTF-16 units and every emoji tried (`\u{1F600}`, an
astral character) costs two, the field silently stops accepting more emoji at
*six* characters (12 units / 2), not the twelve the "twelve characters"
promise names and `cleanName`'s own code-point cap would allow -- confirmed
both by typing and by pasting thirteen straight (`name-4-thirteen-emoji.png`,
`name-6-paste-thirteen.png`, both landing on exactly six, stored as six code
points, `[...s].length === 6`). A player who wants an all-emoji name can never
get further than six through the one control that offers it, with no message
saying why, on a screen the game presents as a plain twelve-character field
(screenshot `name-1-settings.png`). Not filed -- fourteen open `playtest`
issues held the gate shut this session too -- but worth an issue once it
reopens: `src/render/nameinput.ts`'s `field.maxLength = NAME_MAX` should
probably not be set at all (or set higher), since `cleanName` already owns
the real cap and does it correctly by code point.

Also observed, not a bug: `cleanName`'s newline-to-space handling
(`src/name.ts:38`, "so `a\nb` stays two words") can never actually be
exercised through this field, because a single-line `<input type="text">`
does not accept a literal `\n` on insertion at all -- typed or pasted, the
browser drops it before `value` ever sees it. The behaviour is dead code from
the real input path's point of view; it would only matter if a name ever
reached `cleanName` from somewhere other than this field.

Same session, briefly: the RECORD screen's AWARDS tab, never screenshotted by
either of the two prior menus sessions that opened it
(`playtest/plans/2026-09-26-2.play`, `record-awards.png`) -- "0 of 18 earned,"
matches a fresh-reading carried profile (still `#273`, re-confirmed rather
than re-filed). "The Whole Roster: Pull as all 9 classes" checked against
`src/sim/classes.ts`'s own `ClassId` union (nine: warrior, mage, warlock,
priest, paladin, hunter, rogue, shaman, druid) -- correct, not the
inconsistency it first looked like against `README.md`'s "one class in eight
tanks" line, which is a rough tank-odds phrase rather than a class count.

**2026-09-26, driver lesson, not a game finding.** First `style=auto` session
ever run on a genuine touch viewport (390x844,touch) where the AUTO toggle
could actually be pressed rather than silently falling back to `good` --
confirmed directly in the journal (`"auto":true` in the post-tap `state`, and
the restoration shaman's own power draining from 1050 to 412 over the fight,
proof the toggle really cast spells on the player's behalf) for the first time
in this job's history. The two prior `style=auto` ledger lines (2026-09-24
mage:frost, 2026-09-25 druid:feral) were both 1280x800 desktop, where
`src/main.ts`'s `isTouchMode()` gate forces the `good` fallback before the
movement question ever comes up at all.

Read `scripts/playbot.ts`'s own movement branch afterward to see why the pull
went so badly (below): `acting === 'auto'` matches none of the
`dodge`/`good`/`melee`/`wander`/`flee`/`learn` branches from line 929 on, so
`want` stays `null` and the driver calls `d.release()` every tick -- `auto`
never once steers, exactly like `idle`. But `README.md`'s own description of
AUTO says the feature exists precisely so a real player keeps steering while
AUTO handles the button presses ("the other thumb is about position, which is
the half of the game the screen is actually showing"). So every `auto`-style
session this job has ever run, and any future one under the current
vocabulary, tests "a body that casts automatically and never moves at all,"
not the thing the feature is actually for -- a gap in the driver's own
vocabulary, not a bug in the game.

On today's daily (The Two Flasks, 25-normal, SWARMING -- the third time this
job's `mode=daily` cell has drawn this exact boss -- shaman:restoration,
fresh, 390x844 touch, probed first via `2026-09-26-3-probe.play` to read the
class grid and confirm the day before committing): the stationary auto-cast
healer wiped at 68.1s with the boss still at 49%, the earliest and
least-progressed of every Two Flasks pull this job has logged (`good` reached
14% before its own wipe, `mash` 19%, and one `idle` run actually killed it at
147s) -- entirely on `hound` ("It has picked one of you — keep walking"),
which hit the stationary player 1,079 times in 68 seconds against every other
raid member's single-to-double-digit mechanic count. The end screen's own
healing board shows it directly: `You ... died 68s` next to a bolded, outlier
`1409` in the "taken mechanics" column, against teammates reading `3`, `11`,
`12`, `23` (`bill`: `hits=1409 hitsPerMin=1241.4 taken=4739
takenPerMin=4175.3`). This lives in `scripts/playbot.ts`, outside what this
job may touch, so it is written down rather than fixed. Worth a real fix (an
`auto` movement policy, e.g. reusing `dodge`'s steer-away-from-danger logic)
before trusting any past or future `auto`-style ledger line as evidence about
the game's own AUTO feature rather than about a body that never moves.

**2026-09-26, driver lesson, not a game finding.** `melee` (and by the same
logic, `good`'s own toward-boss term) steers at `hud().boss`'s raw
coordinate and nothing else -- fine on every fight that has one hittable
body, and silently wrong on The Three Crowns, the first fight in the roster
where the body the health bar names can be the *wrong* one to stand at or
hit. `src/main.ts:2910`'s `hud()` exposes only `bossOrNone(state)` (name, hp,
maxHp, x, y) -- nothing about `src/sim/boss.ts`'s `crowned()`/`untouchable()`
state, and nothing about the other two court bodies at all, so there is no
richer `window.__abyss` read that would let a smarter style avoid this
either; the gap is in what the driver's read-only window shows, not only in
how `melee` uses what it has. Measured directly this session (see [[#1]]'s
new Three Crowns entry above): two full pulls where a `melee`-style hunter's
`byMechanic` tally was 100% `thirst`, hitsPerMin climbing past 1200, own
health down to 41%, and 18th of 25 on the damage meter, despite `rotation`,
`ballast`, `nuclei` and `adds` all firing on schedule per `says`. `src/render/
draw.ts`'s `drawCourt` gives a real player a clean visual read on the same
question (a filled disc under the crowned body, a warm ring under whichever
decoy is actively drinking) that this driver vocabulary has no way to check,
so a human playing this fight would not make the mistake `melee` makes here.
Worth remembering before trusting a `melee`- or `good`-style ladder/bill
reading on this specific boss as evidence about the fight rather than about
the style's blind spot -- and worth an enhancement issue, once the gate
reopens, proposing `hud()` expose which court body currently holds the
crown (or the untouchable flag on the named boss), the same class of gap
`mode()` was added to close for travel-vs-fight.

**2026-09-26, held, gate shut, a real bug measured two independent ways.**
First `mode=menus` session to use the invite-hash unlock recipe and then
immediately try to reach a raid-setup screen behind it, rather than an
evening. `open #b=marrow&s=25&h=1` -> `tap back` -> `tap raid`
(`playtest/plans/2026-09-26-24.play`) did not land on a raid-setup screen at
all: it dropped straight into `screen=fight mode=travel`, mid-corridor in THE
WEST CLIMB, with a full ten-body paladin:retribution party already standing
where a much earlier session had left it (`heroHp=1800/1800`, `foes=173`
matching the HUD's own "173 left in it", ability bar reading `range` on every
melee slot). That is not what the 2026-09-26 driver-lesson recipe documented
elsewhere in this file predicts (a fresh raid-setup screen showing the
unlocked tier) -- it is [[#5]]'s own mechanism in a sharper and worse shape.
`scripts/playbot.ts`'s dev-server port is `5200 + ((pid + attempt*37) % 300)`,
only 300 possible values, and every playbot invocation against
`--profile playtest/profile` shares the same on-disk Chromium profile; #273
already established that two *different* ports never see each other's
`localStorage`, but said nothing about what happens when two *separate*
invocations, on two different days, coincidentally draw the *same* port. This
session's answer: they see the exact same origin, and therefore the exact
same saved run, with nothing to tell a player (or a driver) that what is
about to load is somebody else's abandoned evening from however long ago
rather than a clean slate.

Confirmed a second, independent way rather than trusted off one screenshot:
`scripts/playbot.ts` has no flag to aim at a specific port, so a raw
Playwright script (`playtest/plans/2026-09-26-24-reconnect.mjs`) started its
own `vite --port 5458 --strictPort` by hand and opened a persistent context on
`playtest/profile` at that exact origin. A bare page load read `screen=home`
(a fresh menu-backdrop pull, `me.spec` correctly remembered as `retribution`
from the last class picked -- README's "your pick is remembered between
visits" holds even here) -- but calling `window.__abyss.probe(412,420)` on the
RAID button confirmed the label (`"raid"`), and tapping it reproduced
`playbot`'s own reading exactly: `chamber:"westclimb"`, `foes:173`,
`heroPos:{x:-1509.5,y:-5956.8}`, `hp:1800/1800`, the same four ability slots
reading `"range"` -- pixel-identical party layout in the follow-up screenshot.
Two unrelated processes, one built by `playbot` and one built by hand, landed
on the same stuck evening because they happened to share a port.

Not the same finding as #271/#281's own VIGIL stalls -- this is not about
whether that West Climb walk itself is stuck, it is that **pressing RAID from
home can silently resume an arbitrary earlier session's abandoned evening
instead of showing the setup screen a player (or the "back then raid" unlock
recipe) asked for, with no signal that this happened.** A real player never
sees this, because a real browser always serves from one fixed port -- this
is `playbot`'s own port scheme turning a testing convenience into an
accidental cross-session collision, which is a `playtest/` driver problem
married to a genuine save-model question worth asking regardless: should
`RAID` from `home` ever silently resume a run this old, or should a stale
enough `run` prompt before resuming rather than walking straight into a live
fight? Fourteen open `playtest` issues held the gate shut at session start;
file once it reopens, referencing both scripts and noting this sharpens
#273 rather than duplicating it.

**2026-09-26, held, gate shut, cheap and clean.** Same session, the
battleground party screen. README's "one tank, one healer, three damage" cap
and its role-trade rule ("tap a tank into your own slot and the slot that was
tanking takes the one you gave up") had never actually been exercised by a
tap -- only `ui`-checked for size and overlap. `open` -> `tap battleground` ->
`tap map:conquest` -> `tap compose` (`playtest/plans/2026-09-26-25-bgparty.play`)
reached the picker, gave Bastion (till then `H Druid Heal`) a tank spec
(`Paladin Tank`), and the screenshot afterward
(`bgcompose-after-swap.png`) shows Wren -- who had been `T Druid Tank` --
now reading `H Shaman Heal`, exactly the trade README describes. Not a bug;
confirms the mechanic works.

But the screen both pulls happened on is titled **"THE RAID"**, in exactly
the same type as the real raid composition screen -- confirmed side by side
this session: the battleground version reads "THE RAID / 1 tank · 1 healer ·
3 damage" (`bgcompose.png`), and a same-session raid composition screen
(`playtest/plans/2026-09-26-26-titlecheck.play`, `raidcompose-title.png`)
reads "THE RAID / 2 tanks · 2 healers · 6 damage" -- identical header text,
correct subtitle either way, for two screens the game itself treats as
differently shaped (README: a raid's tank/healer counts are a soft cap, "one
or two tanks, one to three healers"; a battleground's five slots are "exact
rather than capped"). A battleground party is not a raid, and the one word
on screen that says what the group in front of you is called says the wrong
one. Falls under `docs/playtest.md`'s own "a menu that says something untrue
about the game behind it." Fourteen open `playtest` issues held the gate
shut; file once it reopens, with both screenshots side by side.

## Tried and dropped

**A battleground player-respawn stall.** Raised 2026-09-25 as a "Not yet
filed" observation (druid:feral, Ebb and Flow) after two chained-`play` runs
both showed a dead body reading `hp=0 alive=false bar=[...locked]` well past
`RESPAWN_LATE=11`, against one bare-`state`-polling run that revived cleanly
in ~10s. Dropped 2026-09-26 after a second spec and map (warlock:destruction,
The Long Haul) reproduced the same shape: a chained-`play` run looked stuck
(and its own screenshot showed the game's "up in 6s" respawn countdown mid-
capture, proof it was never actually stuck), while a bare-`state`-polling
rerun on the identical death revived cleanly in ~10s, same as the first
bare-polling run. Two clean bare-polling revivals against zero clean-polling
stalls: the appearance of a stall was `playbot`'s own abort-on-`hero()===null`
quirk missing the revival between samples, not a game bug. Driver lesson, not
a game finding -- nothing to fix in `src/`.

**2026-09-26, a third confirmation, on a third map.** [[#7]]'s conquest entry
above (`-16.play`/`-18.play`, druid:balance, The Three Cairns) looked stuck
the same way on first read -- three `state` calls that were already close to
bare, not buried in a long `play`, still showed dead with an unmoving "up in
Ns" readout. Getting the player killed once and then polling with nothing but
bare `wait`/`state` afterward (no `play` at all past the kill) showed the same
clean ~10s revival the first two confirmations found. Worth remembering that
even near-bare sampling can still land inside the abort-on-death gap if a
`play` call runs anywhere nearby -- only a `play` call followed by pure
`wait`/`state` settles it.
