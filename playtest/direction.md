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

**2026-09-27, sharpened by the first `dodge`-style pull of The Long Cold at
any difficulty, and the closest same-cell style pairing this line has
produced.** `mode=raid`, warrior:arms, `dodge`, 10-normal, fresh save, 390x844
touch (`playtest/plans/2026-09-27-1.play`) — the exact spec/size/difficulty
the `flee` entry above already killed, now run under the other never-presses
style. `dodge` killed it in 84s (against `flee`'s 86s), raid at 10/10,
`presses=0 inDanger=15%` (against `flee`'s 4%). `bill`: `hits=446
hitsPerMin=316.8 taken=1208 takenPerMin=858.1
byMechanic={"chill":24,"cover":1,"flight":421}` — the same 421 `flight` hits
`updateFlight`'s unconditional every-tick damage already explains, `chill`
roughly doubled (24 against 12, consistent with `dodge` staying closer to
whatever it is steering away from than `flee`'s outright retreat), and the
end screen ranked the player last on the damage board at 10 dps
(`end.png`) — auto-attack swings with no ability ever pressed. The one real
divergence is the player's own finishing health: 1108/1890 (59%) under
`dodge` against 592/1890 (31%) under `flee`, despite `dodge` reading the
higher `inDanger` share — a fifth style now confirms [[#1]]'s shape on this
boss at its easiest setting, and the two never-press styles tried on the
identical cell land within two seconds of each other on everything that
matters (raid intact, boss dead, presses=0) while still disagreeing on how
comfortable the win felt for the one body being played. Same end screen
reproduced the already-tracked banner/report overlap (#275/#283's family) a
further way — two banners ("Kill it without losing anyone.", "Kill it in
under 110 seconds.") bleeding over the "OPENED" line and Orin's own damage
row respectively; not commented again, nothing new about the mechanism.
Fourteen open `playtest` issues held the gate shut; nothing filed.

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

**2026-09-26, the first clean disprove-by-`good` this line has ever produced,
and a mechanism instead of a coincidence.** Two independent `playbot`
invocations of the assigned cell (`mode=raid`, `boss=gorged`/The Bloodgorged,
`spec=priest:discipline`, 25-heroic, fresh, 390x844 touch) -- the third
healer spec on this line and the first idle-style pull of this specific
boss -- split cleanly instead of agreeing: `idle`
(`playtest/plans/2026-09-26-27.play`) wiped at 134s with the boss at 6%, from
the healer's own death (`hero.hp=0/1350`); `good` (`-28.play`, separate
invocation, same cell) killed it at 157s (`outcome=victory`, boss 0%). `bill`:
idle `hits=30 taken=3087 takenPerMin=1383.3 died=true
byMechanic={"spill":2,"fester":26,"adds":2}` against good's `hits=9
taken=2918 takenPerMin=1114.9 died=false
byMechanic={"spill":1,"gorge":6,"champion":2}` -- zero `fester` hits under
`good`, 26 under `idle`.

Read `src/sim/boss.ts`'s `scheduleFester` afterward rather than guess: its own
comment calls this "the only mechanic on this boss aimed squarely at the
healers... the one dot in this game that must not be ridden out" -- it lands a
stacking wound (`AURA_TICK.festering`: 90 damage/second for 12 seconds,
`combat.ts`) on a non-tank at random, and it only comes off if a healer
answers it; a healer that never casts cannot ever close it, and a wound left
running its full term is exactly the failure the comment says the mechanic
was built to punish. This is not another boss where idle happens to win by
more than good does -- it is the one mechanic in the roster written by name to
require the specific thing idle refuses to do.

This meets line 1's own "disproved by" condition for the first time: idle
lost, good won, same boss, size and difficulty. **Narrowed rather than
dropped** -- every other boss/spec pairing on this line so far (Marrowgar,
The Bonegrinder, The Long Cold, The Two Flasks, and gorged itself under a
different healer and style on 2026-09-25) still shows idle winning or trading
evenly, so the fair reading is that the hypothesis holds for most of the
roster and fails exactly where a fight was written with a mechanic that
specifically requires acting -- which is itself worth knowing: the game
already knows how to write a mechanic idle cannot answer, it has simply only
done it once so far.

**2026-09-26, sharpened by the first idle-style healer against a fight
already measured under an actively-wrong style, same daily instance, same
day.** `mode=daily` gave paladin:holy, `idle`, fresh save, 390x844 touch
(`playtest/plans/2026-09-26-39.play`); today's actual run (probed first,
`-38-probe.play`) was The Three Crowns, 25-player normal, SWARMING -- the
identical instance a same-day session already fought twice under
hunter:marksmanship/`melee` (`-21.play`/`-22-finish.play`, both landing the
whole fight on the untouchable decoy body and still finishing with
`aliveParty=25/25` and the boss at 10-20% by 218-257s). This is the first
healer role and the first idle-style run this fight has seen, and it tracked
the melee pulls closely rather than diverging from them: boss at 56% by
127s, 15% by 258s (against melee's 10-20% by 218-257s), `aliveParty=25/25`
throughout both checkpoints, `presses=0`, `inDanger=0%`.

The healing board on screen (`mid1.png`, `end.png`) makes the shape
unambiguous in a way `bill` alone would not: "healing per second" ranks four
AI healers at 32-88 hps each and lists the player's own row at a flat `0`
from the 127s mark to the 258s mark, while `THE TANK NEEDS YOU` sits on
screen at the end unanswered (`holy_shock`/`holy_light`/`beacon_of_light`
never left `"ready"` in any `state` call -- not one heal was ever cast). The
player's own hp did fall, 1530 to 1107 to 1063, entirely from `thirst`
(`byMechanic={"thirst":456}`, unchanged between the two checkpoints -- all of
it landed in the first 127s, then the crown's rotation moved the drain
elsewhere and never came back), and the three AI healers kept the idle body
alive despite it never healing anyone back -- the same one-way carry [[#1]]
has already shown a tank and a dps getting, now shown for a healer that
contributes literally nothing to the raid's own healing total. A fourth
boss, a third style, and the first time this line has caught the raid
carrying a body across a fight another style had already measured as
"actively wrong" rather than merely "passive" -- idle did not do better than
wrong-melee here, but it did not do worse either, which is its own point:
on this fight, healing at all is optional for the healer's own survival and
for the raid's.

**2026-09-26, sharpened by the first `good`-style pull of The Three Crowns and
the first tank spec on it, two independent pulls.** `mode=daily` gave
warrior:protection, `good`, carried (behaves as fresh per #273), 844x390
touch. Probed first (`-45-probe.play`): today's daily is still the same
instance -- The Three Crowns, 25-player normal, SWARMING -- a fourth style on
the identical fight this same day, after two `melee` pulls and one `idle`
pull. Driver lesson on the way in: the daily screen's class grid is indexed
(`class:0`..`class:16`), not named like the raid-setup screen's
`class:<spec>` tiles, and its button is `start`, not `pull` -- the first
attempt at `-45.play` used the raid-setup vocabulary and got two
`no-such-control` faults and a `screen-never-came` without ever starting a
fight; fixed and re-run clean.

Same shape as every prior style on this fight: `byMechanic` was 100%
`thirst` in both pulls (1338/3162/5585 hits across three 90s chunks in the
first pull; 1378/3052/4667/5590 across four chunks in the second, extended to
300s), `hitsPerMin` in the 900-1250 range throughout, and the end screen's
damage-per-second board ranked the player 21st of 25 at 14 dps in the second
pull's `finish.png` -- parked on the untouchable decoy for the entire fight,
exactly like the two `melee` pulls and the one `idle` pull already on record.
`good`'s away-from-standing-ground steering term made no difference here,
confirming direction.md's own read of `melee`'s code applies to `good` too:
`hud()` exposes only one boss body's position, so neither style can ever
learn which of the three is currently real.

What is new: `good` pushed the boss further than any prior style on this
fight (1% by 268s in the first pull, 6% by 300s in the second, against
melee's 10-20% by 218-257s and idle's 15% by 258s) -- the other 24 raid
bodies' own output, not this one, since a single parked tank cannot explain a
raid-wide DPS swing. And the second pull is the first time this fight has
shown any raid casualties across four pulls this session's history:
`aliveParty` held 25/25 through 178s then read 20/25 at 269s and 21/25 at
300s, while the first pull's `aliveParty` held 25/25 the whole 268s -- two
`good`-style pulls of the same daily key diverging this much by the far end
is consistent with the wall-clock press-timing jitter this file already
documents (RESULT: not a claim that `good` caused the deaths, since the
parked body's own position never changed between the two pulls and the dying
bodies were teammates it never touched). The player's own hp fell further
than any prior style too, 2790 to 882 (32%) in the second pull against
idle's healer holding 1063/1530 (69%) -- a tank standing in the drain radius
the whole fight pays for it in its own health where a healer or dps parked in
the same spot paid less, which tracks a tank's usual job of standing in
things rather than saying anything new about the crown mechanic itself.

Not filed -- fourteen open `playtest` issues held the gate shut all session --
and this is the fourth confirmation of a gap [[#1]]'s enhancement note (below,
"a real player has a clean visual read `hud()` cannot give a script") already
covers, not a new mechanism. Worth a `wander` or `dodge` pull on this fight
before treating "every driver style loses the crown puzzle" as complete --
those are the only two vocabulary styles this fight has not seen yet.

**2026-09-26, sharpened by the first `auto`-style evening and the first melee
dps on this line inside `mode=walk`.** `mode=walk` (`boss=skyward`, a coverage
label only), druid:feral, `auto`, 25-heroic, carried (behaves as fresh per
#273), 844x390 touch (`playtest/plans/2026-09-26-40.play`). The unlock recipe
reached a real 25-heroic evening and the run got through Bonegrinder heroic
clean (43s, `aliveParty=24/25`, `heroHp=1575/1575` -- full health,
`presses=0 inDanger=8%`) and partway through The Last Whisper (the first time
this line has any real numbers on that boss at 25-heroic) before the room's
200s budget ran out at 32% boss hp (`fault:fight-outlasted-its-budget`, phase
3, `aliveParty` still 24/25, `heroHp=1007/1575`, `inDanger=45%`). Across the
whole evening `bill` read `hits=22 hitsPerMin=6.7 taken=3976
takenPerMin=1208.7` -- a melee dps that (per the `auto` driver-lesson note
under *Not yet filed*, below) never steers, and stood roughly 207 units off
the boss for the entire second fight, dealt next to nothing (single-digit
hitsPerMin, on a spec whose whole kit is melee-range) and still never came
close to dying, on real heroic numbers rather than a normal-mode or
standalone-pull reading. A fifth shape now joins idle, `good`-as-healer,
`wander` and `flee` in carrying a body that contributes nothing, and the first
time this line's own shape has been measured inside `evening`/`mode=walk`
rather than a single `raid`/`daily`/`battleground` pull -- the raid killed one
heroic boss outright and cut a second to a third of its own health with the
one body meant to be meleeing it parked two hundred-odd units away the whole
time.

The two boss rooms did not cost the player evenly, though: `inDanger` was 8%
against Bonegrinder and 45% against The Last Whisper, and `heroHp` only
actually fell in the second fight (full to full across the first, 1575->1007
across the second). Consistent with the `auto` driver-lesson's account of
*why* -- a body that never moves is only as safe as whatever mechanics do not
care where it stands -- but this is the first reading to show the gap can be
large even without moving at all. Worth a `good`-style pull on The Last
Whisper specifically before reading 32%-in-200s as anything about the boss
rather than about a body meleeing air from two hundred units away.

**2026-09-26, sharpened by the first `flee`-style evening at 25-heroic and
the first healer given one.** `mode=clear`, shaman:restoration, 25-heroic,
carried (behaves as fresh per #273), 820x1180 touch
(`playtest/plans/2026-09-26-47.play`), reached via the driver-lesson unlock
recipe. `flee` had appeared in exactly two evenings before this, both
priest/druid at 10-normal (both stalled in THE VIGIL, [[#6]]'s own evidence);
this is the first at this size/difficulty and the first on a healer. Bonegrinder
heroic died at `fightTime=107` with `presses=0 inDanger=2%`, the healer's own
hp finishing untouched at `1485/1485`, and the raid at `24/25` (one dead) --
one heal never cast, one press never made, the boss down anyway, and only one
raid casualty against a room this line has already seen a `wander` healer cost
eight lives in at the same size and difficulty (2026-09-26, priest:discipline,
above). A sixth style/role pairing now joins idle, `good`-as-healer, `wander`,
`flee`-as-dps and `dodge` in carrying a body that contributes nothing, and the
first time a healer under a style that never even threatens to heal has still
cost the raid this little at heroic.

**2026-09-27, sharpened by the first `dodge` pull of The Three Crowns, answering
the open question its own prior entries left standing.** `mode=raid` (a direct
invite-hash pull, `open #b=crowns&s=10&h=0`, not a `daily` instance), the first
mode=raid, first 10-player and first non-`daily` appearance of this fight on
record, paladin:protection, `dodge`, fresh save
(`playtest/plans/2026-09-27-3.play`). `dodge` and `wander` were the only two
vocabulary styles this fight had never seen; this fills one of the two, and
the answer is not "loses the crown puzzle a fifth way" — it does not engage
with the puzzle at all. `byMechanic` read `{}` — empty — across all three
`bill` checkpoints (88s, 178s, 268s), the first Three Crowns pull on record
with zero mechanic hits of any kind, where every prior style (two `melee`
pulls, one `idle`, one `good`) spent the *entire* fight at 100% `thirst`.
`inDanger` held 0% throughout, `heroHp` finished at a full 2745/2745, and the
boss dropped from 100% to 5% over 268s with `aliveParty=10/10` the whole way.
The screenshots (`mid1.png`, `end.png`) show why: the player stands alone,
well clear of the court's drain rings, while "Out of its reach" fires
repeatedly for the *other* nine bodies caught in them — the same message the
2026-09-26 `wander` healer session read as the game correctly refusing to let
AI stand in the drain radius, now read from the one body that never walks
toward anything at all.

The mechanism is exactly what [[#1]]'s own prior Three Crowns entries already
named from source: `melee`/`good` steer at `hud().boss`'s raw coordinate, which
is sometimes the untouchable decoy, and walk straight onto it every time.
`dodge` has no toward-boss term in `scripts/playbot.ts` at all — only
away-from-danger — so it never has a reason to approach the crown, the decoys,
or the drain either. This is not the disprove-by-`good` condition (`dodge`
is not `good`), and it is not a new mechanism, just the other half of the one
already on record: the earlier pulls' 100%-`thirst` bill was purely a function
of a style that walks at a named target, not something intrinsic to the fight
or a broader limit on what any driver style can do here. Still worth the
`wander` pull to fill the second untried style, and still worth the `hud()`
crown-visibility enhancement already flagged, once the gate reopens — this
sharpens the existing note rather than closing it.

**2026-09-26, sharpened by the first flee-style loss this line has ever
recorded, on a boss its own upkeep table already flags as rewarding play.**
`mode=walk` (`boss=flasks`, a coverage label only), hunter:marksmanship,
`flee`, 25-heroic, fresh save, 390x844 touch
(`playtest/plans/2026-09-26-48.play`) — the first evening this line has given
a pure ranged dps under `flee` (every prior flee evening was a healer or a
tank), and the first at 25-heroic on any dps role at all. THE VIGIL and every
corridor after it crossed clean and fast (8.3s, then 26s, 16s, 11s — see
[[#6]]'s new entry below), and Bonegrinder heroic died at `fightTime=117s`
with the whole raid untouched: `aliveParty=25/25 heroHp=1620/1620 presses=0
inDanger=2%` — exactly this line's usual shape, a fourth boss now for a
flee-style clean carry.

Then, for the first time ever under `flee`, the shape broke. The Last Whisper
(25-heroic) woke at the door of THE ORATORY and wiped at 150s with the boss at
49%, the player's own `heroHp=0/1620` — flee's first recorded death — and
`aliveParty=24/25`. `outcome:retry` worked normally (this room stayed
`mode=raid`, not `travel`, matching [[#3]]'s existing read that boss-room
retries are fine and only travel-mode ones are broken) and the second attempt
ran the boss down to 11% before ending in `outcome=enrage` at 251s,
`aliveParty=21/25` (4 dead), the player dead again. The evening's 6-room
budget ran out mid-third-attempt, boss back near full (a fresh pull, as
expected).

Read `src/sim/combat.ts:915` before guessing why avoidance alone stopped
working: the enrage aura is "a boss damage amplifier" that "only doubles what
the raid is taking" and, per its own comment, "grows" the longer the fight
runs past the timer. That is not a telegraph to sidestep — it is a
multiplier on whatever the boss's existing attacks already land, so a body
that only ever moves away from danger has nothing to dodge once the boss's
ordinary hits alone are lethal. `docs/upkeep.md`'s own "raid rewarding play"
table already has The Last Whisper at played 94% / idle 78%, the smallest
positive gap on the list after Bloodgorged's — this is the first time this
line has actually played out that gap rather than read it off a table: 24
AI-only raiders can carry a zero-damage passive dps to 11% on their own, but
not through an enrage that keeps compounding, and a style built entirely
around not getting hit cannot survive a mechanic that isn't a hazard to avoid
in the first place. A third boss now joins Bloodgorged's fester and The Two
Flasks' mixed result as a case where [[#1]]'s shape does not hold —
distinct from both: Bloodgorged needed a specific action (healing) withheld,
this needed raw damage output withheld, and the cost landed on the clock
rather than on a dodgeable mistake.

**2026-09-27, sharpened by the first Three Crowns pull to actually resolve
rather than run out of its own script budget, and a probable overturn of an
earlier "wall-clock jitter" guess.** `mode=daily` (today's actual run,
probed first: The Three Crowns again, 25-player normal, SWARMING — the same
boss/affix pairing this line has now seen five times; the system clock read
UTC 2026-09-26 for the whole session, the same calendar day as the four
prior Three Crowns dailies logged above, so this is very likely the same
daily instance/seed as those, not a fresh roll — a same-instance comparison
this note leans on below, not a coincidence across two different days),
warlock:destruction, `style=auto`, fresh save, 1280x800 desktop
(`playtest/plans/2026-09-27-6.play`) — the first `mode=daily` session on a
non-touch viewport (all eight priors were `,touch`) and the first warlock on
any daily. `style=auto` on a non-touch view hit the already-known fallback
(`fault:no-such-control {"want":"auto"}`, then `no-autocast-toggle ... playing
good instead`, four times, once per `play` call) — a third context for that
driver-lesson (mode=walk, mode=battleground, now mode=daily) rather than a
new mechanism.

What is new: this run played long enough in one continuous pull
(four chunks summing past 290s) to catch something no prior Three Crowns
session's shorter or differently-timed chunks ever recorded —
`fight-over outcome=enrage time=287 phase=2`, boss at 36% (121,670/341,700),
`aliveParty=24/25`, the player itself the only death
(`heroHp=0/1485`, `died:true`). The end screen names it outright: "ENRAGE
WIPE — The Three Crowns · 287.3s · boss at 36% · pull 1" (`finish.png`), and
an earlier checkpoint (`mid1.png`, ~88s into the pull) shows a countdown
already ticking in the minimap corner — "enrage 162s" — that no script in
this vocabulary reads or reports on. The parked-on-the-decoy shape held
exactly as every prior style has shown it (`byMechanic={"thirst":3388}`, 100%
of the player's own mechanic hits, `end.png`/`finish.png` both show it
finishing last on damage among bodies that engaged at all).

This bears directly on the 2026-09-26 `good`-style protection warrior pull of
this same fight (above), whose second run lost four raid members between
269s and 300s and which this line credited to "wall-clock press-timing
jitter" for lack of a better explanation, having found no named mechanism at
the time. Given this session's own probe found the same boss/affix still
running under the same UTC calendar day, that earlier pull is plausibly the
*same* daily instance this one just watched resolve at 287s — a hard enrage
landing right inside that pull's own 269-300s death window is a much better
explanation than jitter for deaths clustering exactly there. **Not certain**:
the earlier session used a different spec in a different slot of the same
pool, which still reshuffles who else fills the raid, so it is a same-day,
likely-same-seed comparison rather than a byte-identical rerun. The earlier
guess should be read as superseded rather than standing, though — "jitter"
alone no longer explains the 2026-09-26 deaths as well as a named
`outcome=enrage` a few seconds later on what looks like the same fight does.

Gate held shut at 14 open `playtest` issues; not filed, and this is a
sharpening of the existing Three Crowns thread under this line rather than an
eighth standing hypothesis of its own.

**2026-09-27, the second of the fight's two untried styles, and the first
pull of this boss at heroic — which turned up a mechanic no prior session had
reached.** `mode=daily` (today's actual run, probed first via
`playtest/plans/2026-09-27-8-probe.play`): The Three Crowns again, but for
the first time at 25-player **heroic** rather than normal, carrying HASTENED
("the enrage arrives more than two minutes early"), priest:shadow, `wander`,
fresh save, 390x844 touch (`playtest/plans/2026-09-27-8.play`). The 2026-09-27
`dodge` entry above named `wander` as the one style this fight had not yet
seen; `dodge` answered "does it lose the crown puzzle" with "it never engages
the puzzle at all," since it has no toward-boss steering term. `wander` is a
different hypothesis: it presses a random ability slot round-robin *and*
picks a new random heading every twelve steps (`docs/playtest.md`'s own
description), so unlike `dodge` it has no reason to avoid the court either.

The pull wiped at 45.1s, phase 1, boss at 79% — the fastest this fight has
ever ended in this job's history, on every other style's own numbers (melee
218-257s, idle 258s, good 268-300s, dodge 268s, none of those a death; the one
prior wipe on record, the 2026-09-27 `auto`-as-`good` pull, went to 287s).
`bill`: `hits=1287 hitsPerMin=1710.9 taken=4457 takenPerMin=5925.1 died=true
byMechanic={"thirst":759,"prison":528}`. `thirst` is the already-known court
drain; `prison` is new — the first time this job has recorded it, on any
boss. Read `src/sim/encounters.ts` and `src/sim/boss.ts` rather than guess
why: The Three Crowns' kit lists `prison` fourth of five mechanics with
`gates: { prison: 'heroic' }` — it does not exist below heroic, which is why
nothing in this file has mentioned it before now: every prior Crowns pull, on
every style, was normal difficulty. `schedulePrison`'s own comment names it
"the one demand in this game answered by not doing the thing every other
demand is answered by... what it asks is which steps are worth paying for" —
ten seconds where every full stride costs more than the last
(`billWalking`: a body's own `walked` timer accumulates while it is moving
and resets the moment it stops, and the tick's damage scales with
`min(a.walked, PRISON_CAP)`).

That reads as close to a direct description of what `wander` cannot do.
Every other style this line has run has some way to hold still — `idle`
never moves at all; `dodge`/`good`/`flee` stop once nothing is chasing them —
but `wander`'s own hypothesis is a player who never settles, forced onto a
new heading every twelve steps whether or not anything asked for one. A
mechanic built to bill "which steps are worth it" cannot be answered by a
body with no concept of a step *not* being worth it. The end screen
(`end.png`) shows the shape plainly: every other raider's own "taken
mechanics" column reads a flat 147 (the raid-wide share of `thirst`'s
rotation), and the player's own row alone reads a red `1287` — the only
number on the board decided by this body's own steering rather than the
crown's schedule.

**Not a bug, and not filed** — the mechanic is doing exactly what its own
comment says it should, billing motion for its own sake, and a style that is
nothing but motion for its own sake is the cleanest possible demonstration of
that rather than evidence anything is wrong. This closes the specific
open question the `dodge` entry above left standing (both of the fight's two
untried vocabulary styles have now been run), but not the fight's heroic tier
itself — this is one pull deep at heroic, `mash` and `flee` have never
touched this boss at all, and it is still open whether a raid answering
`prison` properly (rather than a body that structurally cannot try) changes
anything about it. Gate held shut at 14 open `playtest` issues; not filed.

**2026-09-27, a sixth role now confirmed under idle, and the first melee dps
one.** `mode=clear`, druid:feral, `idle`, 10-normal, genuinely fresh save
(not carried-behaving-as-fresh), 1280x800 desktop
(`playtest/plans/2026-09-27-10.play`). Every prior idle confirmation on this
line was a tank, a ranged dps or a healer of some kind; a melee dps is the
stricter version of the same test, since it cannot tag a mechanic or land a
hit from range the way 2026-09-25's idle warlock:destruction pull still
could. THE VIGIL crossed clean in 27s (door-to-door, `presses=0`) and
Bonegrinder died at `fightTime=84` of a 200s budget:
`aliveParty=10/10 heroHp=1575/1575 bossHp=down presses=0 inDanger=10%` — a
full, clean, cost-free kill with a body that never once walked toward the
boss, on the one role whose kit requires standing next to it to do anything
at all. Same shape, sixth role, first melee one. See [[#6]]'s new entry
below for what the same evening found two rooms later.

**2026-09-27, a middle case between this line's usual "costs nothing" and
its one recorded "costs nine deaths."** `mode=raid`, paladin:holy, `wander`,
25-heroic, fresh save, 390x844 touch (`playtest/plans/2026-09-27-13.play`,
`open #b=marrow&s=25&h=1`) — the first genuinely-named mode=raid Bonegrinder
pull under `wander` (its one prior marrow appearance was a `mode=daily`
mislabel, the real daily being crowns), and the first time this line has put
a non-melee, non-tank spec in `wander`'s path of Bonegrinder's bonestorm
aura, which #267 already covers as punishing proximity regardless of what a
body is trying to do. `wander` presses a random ability slot round-robin and
picks a new heading every twelve steps with no idea where the boss's aura
is, unlike `idle` (never moves, already shown clean on this exact boss/
difficulty under other specs) or `dodge`/`good`/`flee` (retreat once
something is chasing them).

The kill landed at `fightTime=140` (phase 3), well past every other
25-heroic Bonegrinder kill this line has on record (43–56s under `good`,
`melee` and `dodge`), with `aliveParty=23/25` (two dead), the player's own
`heroHp=398/1530` (26%), `presses=505` total across the pull and `bill`:
`hits=8 hitsPerMin=3.4 taken=1667 takenPerMin=714.3
byMechanic={"spike":1,"bonestorm":7}`. The mid-fight screenshot (`mid1.png`)
shows the player's own token standing inside the boss's own bonestorm ring
at 77s, confirming the mechanic hit was proximity, not chance. The healing
board on the kill screen (`end.png`) has "You" last of four healers at 25
hps (not the flat 0 the idle Three Crowns healer read) — a `holy_shock`
apparently landing on itself or a neighbour by chance often enough to not
read as zero, while `holy_light`/`beacon_of_light` spent most of the fight
either `locked` or `range` per the mid-fight `state` reads.

**Read with the caution this file already carries about heroic's own
run-to-run jitter** (the 2026-09-26 shaman:elemental entry: two nominally
identical `good` pulls of this exact cell finished 49s and "still going at
130s," from press-timing alone) — a 140s kill on a spec that contributes
neither tanking nor damage is not cleanly attributable to `wander` slowing
the raid down, since the other 24 bodies' own output decides how fast the
boss dies regardless of what the healer does. What *is* directly
attributable to the style is the exposure: seven bonestorm hits and two
raid deaths on a pull that other specs/styles have cleared at this exact
cell with zero of either. This sits between line 1's usual "the AI carries
a passive body for free" shape and the one `dodge`-tank pull that cost nine
deaths for a fast, untouched clear — a body that presses things but presses
them uselessly (three-for-three spec, and this line's own driver-vocabulary
note on `wander`'s blind spot) pays a little rather than nothing or a lot.
Not filed — fourteen open `playtest` issues held the gate shut all session —
and this is a sharpening of both line 1 and #267's own bonestorm mechanism
(evidence it is not melee-specific) rather than a new hypothesis. The
kill screen's "Full Raid" banner reads "Kill it with twenty-five," which
`src/achievements.ts:106-111` confirms is a raid-size award (`party(s).length
=== 25`), not a no-deaths one — checked against source before it was
mistaken for a contradiction with the two actual deaths, and not the
already-tracked #275/#283 banner-overlap family either (no overlap was
visible on this viewport's kill screen).

**2026-09-27, sharpened by the first `dodge` pull of The Three Crowns at heroic,
and the deepest this fight has ever been pushed at that difficulty.**
`mode=daily` (today's actual run, probed first via
`playtest/plans/2026-09-27-15-probe.play`): The Three Crowns again, but this
time 25-player **heroic**, HASTENED — almost certainly the same instance as
2026-09-27's `wander` entry above (same boss/affix, same UTC day), paladin:
retribution, `dodge`, fresh save, 1280x800 desktop
(`playtest/plans/2026-09-27-15.play`) — the first `dodge` pull of this fight
at heroic (its one prior `dodge` appearance was 10-normal, mode=raid, above)
and the first melee-dps role this fight has seen (every prior spec was a
tank, a healer, or a ranged dps).

`byMechanic={}` across all four `bill` checkpoints (88s, 178s, 227s) — the
same zero-mechanic shape the 10-normal `dodge` pull already established from
source (`dodge` has no toward-boss term, so it never nears the court, the
decoys or the drain radius), now confirmed at heroic too. But where `wander`
wiped to `prison` in 45s at 79% boss hp, this pull went the furthest into
this fight at heroic this line has ever recorded: boss to 67% (88s), 23%
(178s), 6% (227s), `aliveParty=25/25` the whole way and `inDanger=0%`
throughout — before ending in `outcome=enrage` at 227.1s, the end screen
naming it outright ("ENRAGE WIPE · The Three Crowns · 227.1s · boss at 6% ·
pull 1", `ending.png`), the player itself the only fresh death
(`heroHp=0/1800`, `aliveParty=23/25`) and finishing dead last on the damage
board at 11 dps — a body that never once attacked.

Read alongside the 2026-09-26 `flee`-vs-The-Last-Whisper entry above rather
than treated as new: this is the second boss now where a style built only to
avoid danger runs headlong into the one mechanic avoidance cannot answer —
`combat.ts`'s enrage aura doubles whatever damage is already landing rather
than adding a telegraph to sidestep, and HASTENED's own two-minutes-early
enrage plus a raid carrying a zero-damage dps (this body's own 11 dps, last
of 25) plausibly explains why 25 AI-only bodies could bring the boss to 6%
but not the rest of the way before the clock caught them. **Not a clean
disprove-by-`good`** (`dodge` is not `good`), and not filed — the mechanism
is already on record and the gate held shut at thirteen open `playtest`
issues all session — but this is a second data point for "a style with
nothing to dodge has nothing to answer an enrage with," on a second boss and
a second affix, and the closest any style has come to actually finishing The
Three Crowns at heroic.

**2026-09-27, the costliest "active but wrong" case yet, and a whole evening
spent losing to the same boss instead of never meeting a second one.**
`mode=clear`, shaman:elemental, `melee`, 25-heroic, carried (behaves as fresh
per #273), 390x844 touch (`playtest/plans/2026-09-27-16.play`). The one prior
melee-style 25-heroic evening (rogue:assassination, 2026-09-27-7) crossed THE
VIGIL clean in 24.5s, but `src/sim/classes.ts` gives rogue the highest flat
`moveSpeed` in the roster (178), so [[#6]] already read that crossing as the
class, not size/difficulty or style, and left open whether `melee` itself
crosses cleanly on an ordinary-speed class. Shaman's own `moveSpeed` is 167,
the same middle tier as druid/mage — this pull crossed THE VIGIL in about 30s
(12.2s to 42.2s, presses=3), the same shape as `good`'s and `dodge`'s clean
25-heroic crossings, not a rogue-only result. A second point for [[#6]]'s own
size/difficulty reading, on a class this line had not yet used to test it.

Past the door, the same evening spent its *entire* five-room budget failing to
kill the one boss in it. THE BONEGRINDER (heroic) wiped four times running —
`fightTime` 138s, 137s, 135s, 129s, every one of them phase 3 (`phaseThreeHp:
0.33`, `src/sim/encounters.ts:1636`) with the boss at 7%, 7%, 9%, 9% and the
player itself the one death each time (`heroHp=0/1440`, `aliveParty` 23-24/25)
— close enough to a kill every time that a body doing real damage would
plausibly have finished it, and every prior active-style Bonegrinder-heroic
kill on record lands in 43-56s (`good`, `melee`-as-rogue, `dodge`), a third to
a quarter of this pull's length. `evening`'s own room counter never got past
`spire`: `reached=threshold -> vigil -> spire`, `rooms=5`, all four retries
spent on the same chamber, `NEXT`/a second boss never reached.

Read together with the line's own already-recorded driver-lesson (`melee`'s
steering in `scripts/playbot.ts` only ever computes a vector toward the boss,
with no away-from-hazard term, first flagged on the tank/Two-Flasks caustic
pull above) and elemental being a ranged spec forced into melee range ([[#7]]
already measured this shape dealing zero damage in a battleground): a fifth,
fresh pull begun once the evening's budget ran out read `hits=2 hitsPerMin=4.4
taken=548 takenPerMin=1198.5 byMechanic={"coldflame":2}` at the 27s mark —
close to no output at all, which is consistent with a body too slow to finish
the boss before its own exposure (standing in whatever coldflame/spike ground
the fixed beeline never steps out of) caught up with it. **Not confirmed as
the literal death mechanism** — no `bill` was called inside any of the four
actual wipes, only on the follow-up pull, so this reads as a strong
correlation (near-zero output, a fight that runs three times long, four
deaths in the same shape) rather than a measured cause. Distinct from #267
(bonestorm's hit-ratio reversal, 10-normal): this is a different mechanic pair
(coldflame/spike), a different scale (25-heroic), and a different symptom — not
an inefficient kill but a boss that never dies and an evening that never
leaves its own first room. Not filed — fourteen open `playtest` issues held
the gate shut all session — a strong candidate once it reopens, with this
script and a version that adds a `bill` call after each wipe to pin the
mechanic down before it is written up as one.

**2026-09-27, the first direct raid pull of The Last Whisper, and a second
named mechanic built to punish exactly what idle does — that this pull's own
dice happened to miss.** `mode=raid` (`open #b=whisper&s=10&h=0`, not an
evening or a daily; every prior reading of this boss came from inside
`mode=walk`/`clear` at 25-heroic, or from `docs/upkeep.md`'s own table),
warrior:protection, `idle`, 10-normal, fresh save, 844x390 touch
(`playtest/plans/2026-09-27-17.play`) — the first idle-style reading of this
specific boss and the first tank spec against it. `docs/upkeep.md`'s "raid
rewarding play" table has The Last Whisper at played 94% / idle 78%, the
second-smallest gap on the whole roster after Bloodgorged's — the two fights
this file has already shown resist line 1's usual shape (Bloodgorged's
`fester`, above, and this same boss's own enrage beating a `flee` dps on
2026-09-26).

`idle` still won it outright: `fightTime=139`, `outcome=victory`,
`aliveParty=10/10`, `presses=0`, `heroHp=2069/2790` (74%) — but for the first
time on this line, `inDanger` moved hard mid-pull rather than sitting near
zero throughout: 3% for the first 88s, then 77% for the closing 51s. `mid.png`
shows why — the player's own token sitting directly under the boss, inside two
overlapping magenta rings, with `decay` ("The ground is going over — off it")
and `volley` ("Cold, all of it, all of you") both up on screen at once — and
`bill` read only `byMechanic={"volley":6,"decay":2}` across the whole fight,
a low hit count against that much time spent inside the rings.

The `says` log this phase also fired `shade` ("Something is following you —
keep walking"), and `src/sim/boss.ts`'s `scheduleShade`/`updateShades` name it
in as many words: "the aura alone would be a dot with a long name: it would
tick on somebody standing perfectly still, and the mechanic is that standing
still is the one thing that does not work... outrun by walking and never
outrun by being somewhere clever." Reading the code: the mark starts pinned to
wherever the marked body stood the instant it was picked, then chases at a
fraction of that body's own move speed — so a body that never moves again
after being marked never separates from its own mark, and the tick keeps
landing at full strength for as long as the mark is up. This pull's own `bill`
carries no `shade` entry at all, which reads as the mark simply never landing
on this idle body (`count = max(1, round(partySize/10))` marks one raider at
random per cast, in a ten-player pull) rather than idle having any answer to
it — a bill of `{}`-for-shade here is a miss, not evidence. **Not a disprove of
line 1, and not a confirmation either**: this is the second mechanic this line
has now read straight from source as purpose-built against standing still
(after Bloodgorged's `fester`), on the second of upkeep's own two
closest-to-rewarding-play fights, and both times the actual pull that could
have tested it did not land the mechanic on the idle body. Worth a longer idle
pull of this exact cell, or several, to catch a `shade` mark actually landing
on the player before reading this boss as another disprove-by-`good` candidate
or as a third confirmation of line 1's usual shape. Not filed — fourteen open
`playtest` issues held the gate shut all session, and this is a sharpening of
the existing Bloodgorged/Last-Whisper thread rather than a new hypothesis.

**2026-09-27, the longer pull the entry above asked for, and a `shade` mark
that finally lands.** `mode=walk` (`boss=gift`, a coverage label only),
warlock:destruction, `style=auto`, 25-heroic, carried (behaves as fresh per
#273), 844x390 touch (`playtest/plans/2026-09-27-20.play`). The one prior
`auto`-style evening at this size/difficulty (2026-09-26, druid:feral, above)
was a melee dps that never approaches anything; this is the first ranged one,
so it also speaks to that entry's own open question ("worth a `good`-style
pull on The Last Whisper specifically before reading 32%-in-200s as anything
about the boss rather than about a body meleeing air") from the other side —
a spec whose whole kit casts from range, under the same never-steers style.

THE VIGIL crossed clean (8.9s door to door, no stall — another class
confirming [[#6]]'s clean-crossing shape), and Bonegrinder heroic died in 50s
with `aliveParty=24/25`, `heroHp=1410/1485` (95%), `presses=0 inDanger=6%` —
this line's usual free ride. Two short corridors later (9.4s, 12.4s) the
evening reached The Last Whisper heroic and ran out its full 200s room budget
without a kill: boss to 41% (157,844/388,600), `aliveParty=24/25`, `presses=0`,
`heroHp` down to 672/1485 (45%), `inDanger` up to 32%. `bill`: `hits=19
hitsPerMin=5.8 taken=2590 takenPerMin=787.6
byMechanic={"volley":4,"decay":1,"shade":14}`.

`shade:14` is the number the entry above was waiting for: fourteen hits over
197s, where the 10-normal idle warrior three sessions ago read a flat zero on
the same boss and called it "a miss by the random target roll, not evidence
idle handles it." `src/sim/boss.ts`'s own comment on `updateShades` says the
mark "closes at most of a body's speed — outrun by walking and never outrun
by being somewhere clever," which a body that never moves cannot do by
construction. Not a controlled pair against that earlier pull (different
style, size and difficulty), but it is the first time this line has actually
watched the mechanic connect with a stationary body rather than miss it, in
the direction the source comment already predicted, and this pull ran out its
room budget at 41% rather than dying the way the 10-normal one killed clean —
consistent with, though not proof of, the mark costing something real.

The ability bar read `shadow_bolt`/`chaos_bolt` at `"range"` for the whole
pull, never `"ready"` — worth flagging rather than trusting at face value,
since `SPELL_RANGE` (`src/sim/constants.ts:529`, 18 yards ≈ 416 units) is well
past the 73-unit gap the end-of-budget fault measured between hero and boss
(`away:73`), and the mid-fight screenshot (`mid.png`) shows the player's own
token standing in the thick of the boss's own ring effects, not off to the
side. Read `src/sim/sim.ts`'s `playerTarget()` before trusting "even a ranged
spec gets nothing from range under `auto`" as settled: a damage press targets
the lowest-hp living non-boss `'boss'`-faction actor over the boss itself when
one exists, so a persistently-blocked bar could mean the press was aimed at
something else in the room. The Last Whisper's own kit list (`encounters.ts:
1930`) names no add-spawning mechanic, which argues against that reading, but
this session never called `foesAt()` to check directly, so it is recorded
rather than asserted. What is measured cleanly is the output: `hitsPerMin=5.8`,
next to the druid:feral `auto` evening's `hitsPerMin=6.7` on the same boss/
size/difficulty shape — both near the floor regardless of kit, which tracks
`scripts/playbot.ts` having no `acting === 'auto'` branch in its steering at
all (confirmed by reading the file: only `dodge`/`good`/`melee`/`wander`/
`flee`/`learn` ever set `want`). A caster gains nothing from being ranged when
the body that would need to stand somewhere in range never chooses to move
there in the first place. Not filed — fourteen open `playtest` issues held the
gate shut all session; this closes the open question two entries above left
standing and sharpens the Bloodgorged/Last-Whisper thread rather than adding
an eighth hypothesis.

**2026-09-27, the first genuinely-issued `good` command against The Three
Crowns at heroic, and the deepest this fight has ever been pushed before an
enrage ended it.** `mode=daily` (today's actual run, probed first via
`playtest/plans/2026-09-27-21-probe.play`): The Three Crowns again, 25-player
**heroic**, HASTENED — the seventh time this UTC day has served this exact
boss/affix pairing, and "no attempt yet today" on the setup screen confirming
a fresh instance rather than a resume. paladin:retribution, `style=good`,
fresh save, 390x844 touch (`playtest/plans/2026-09-27-21.play`). Every prior
heroic reading of this fight came from `dodge` (no toward-boss steering term
at all, so it never engages the crown puzzle and never took a mechanic hit) or
`wander` (wiped to `prison` in 45s), or from `auto` silently falling back to
`good`'s own engine on a desktop viewport with no autocast toggle
(warlock:destruction, a ranged caster, 2026-09-27-6). This is the first time
an actual `play good`/`evening good` command has run against this fight at
heroic on a melee dps — the role most likely to be walked straight onto the
untouchable decoy by `good`'s toward-`hud().boss` steering term, the same
mechanism [[#1]]'s own prior Three Crowns entries already named from source.

It was: `byMechanic` read 100% `thirst` across all three `bill` checkpoints
(1075 at 87s, 2128 at 178s, 3029 at 248s) — the same parked-on-the-decoy shape
every toward-boss style has shown on this fight, now confirmed on a melee dps
under a real `good` command rather than a caster or a fallback. But unlike
every prior heroic pull, this one actually pressed a real rotation the whole
way (hitsPerMin 737 → 719 → 733, `mid1.png` shows the player standing in the
crown's own ring with a live "enrage 162s" readout in the minimap corner) and
pushed the boss further than any prior style at this difficulty: 68% at 87s,
33% at 178s, 22% at the 248s cutoff — past `dodge`'s 6%-at-227s and
`wander`'s 79%-at-45s, both already on record. Then `fight-over outcome=enrage
time=248 phase=3` ended it, boss still at 22%, `aliveParty=9/25` — sixteen of
twenty-five dead, the worst raid casualty count this fight has produced under
any style so far (`dodge`'s own enrage wipe lost two, `wander`'s lost one).
The end screen (`mid3.png`) names it outright ("ENRAGE WIPE · The Three
Crowns · 248.1s · boss at 22% · pull 1") and lists all sixteen deaths by name
and time, with the player itself among them (`heroHp=0/1800`) and last of the
17 non-dashed rows on the damage board at 68 dps despite having pressed the
most abilities of any pull this line has recorded on this fight.

This bears directly on the 2026-09-26 `good`-style protection-warrior pull of
this same fight, whose raid lost four members between 269s and 300s with no
named mechanism at the time (later read as "plausibly the same enrage" once
2026-09-27's `auto`-as-`good` pull produced a named `outcome=enrage` at 287s
on what looked like the same daily instance). This pull removes the remaining
doubt: a real, directly-issued `good` command, on a fresh instance of the
identical boss/affix, produces the identical named `outcome=enrage` a third
time, at a similar boss-health checkpoint (22%, next to the other two pulls'
36% and an inferred mid-20s%), with a raid death toll now measured cleanly
rather than guessed at. Three independent `good`-shaped pulls, three enrage
wipes, no exceptions yet recorded for this style at this difficulty on this
boss. Not filed — fourteen open `playtest` issues held the gate shut all
session — and this sharpens the existing Three Crowns thread (both the crown-
puzzle mechanism and the enrage-timing question the 2026-09-26/2026-09-27
`good` pulls left open) rather than adding an eighth hypothesis.

**2026-09-27, a third measurement of the `shade` mark, the highest hit count
yet, and the first healer under `mash` to actually get a full evening.**
`mode=clear`, druid:restoration, `mash`, 25-heroic, carried (behaves as fresh
per #273), 820x1180 touch (`playtest/plans/2026-09-28-7.play`), via the
driver-lesson unlock recipe. Every prior `mash`-healer reading on this line
stalled inside THE VIGIL or wiped inside a single room at 10-normal (the
`crowns`/`whisper` walk probes and the Confluence daily, above); this is the
first time that pairing has been handed a real `evening` command, and the
first at heroic.

THE VIGIL crossed clean in 6s door-to-door — another class, another style,
still no stall, sharpening [[#6]] rather than this line. Bonegrinder heroic
died at `fightTime=78`, `aliveParty=25/25`, `heroHp` finishing a full
1440/1440, `presses=559` — `mash`'s round-robin never sets `want` in
`scripts/playbot.ts` (it does not steer any more than `idle` does inside a
fight), but README's "every heal aimed at whoever is furthest from full"
means those blind presses still landed as healing rather than the wasted
motion a dps's round-robin would be, and the room fell the same free way
[[#1]]'s idle/`wander`/`flee` healers already have. The Last Whisper heroic
then ran its full 220s room budget out at boss **2%** (9472/388,600),
`heroHp` down to 920/1440 (64%), `inDanger=28%`, `bill`:
`byMechanic={"decay":2,"shade":42,"volley":8}`.

`shade:42` is the third reading of the mechanic named above as built
specifically to punish standing still, and by far the largest: zero on a
10-normal idle tank (a miss by the random target roll), 14 on a 25-heroic
`auto` warlock over a 197s pull, now 42 over 218s on a 25-heroic `mash`
healer — every number bigger than the last, on a body construction keeps
predicting will never separate from its own mark once it stops moving. Not a
controlled progression (three different specs, two different sizes/styles),
but the direction is the same every time source says it should be, and this
is the longest single exposure yet. The near-kill (2% left, budget-limited
rather than a wipe or a clean victory) is this line's own script-timing
artifact, not a boss finding — a longer room budget would likely have
finished it, given 25/25 stayed alive the whole way. Not filed — fourteen
open `playtest` issues held the gate shut all session — this sharpens the
existing Bloodgorged/Last-Whisper thread rather than adding an eighth
hypothesis.

**2026-09-28, a second zero-`shade` idle pull, and a source-backed reason to
stop reading that as luck.** `mode=raid` (`open #b=whisper&s=10&h=0`, the
exact cell #1's own tank-idle pull used above), paladin:holy, `idle`, fresh
save, 390x844 touch (`playtest/plans/2026-09-28-8.play`) — the first idle
*healer* read of this boss, a stricter case than the tank: a healer under
idle has nothing to answer a landed mark with even if it lands, no self-heal
and no movement to break the chase. `idle` won it clean again: `victory`,
`fightTime=138` (within a second of the tank pull's 139s on the same cell),
`aliveParty=10/10`, `presses=0`, `heroHp` finishing 744/1530 (49%, lower than
the tank's 74%), `inDanger` read 35% across the first 80s then 0% by the
end — the opposite shape from the tank pull's 3%-then-77%. `bill`:
`byMechanic={"decay":1,"volley":6}` across the whole fight — zero `shade`
again, the second 10-normal idle pull in a row to read that way.

Read `scheduleShade` (`src/sim/boss.ts:1162`) before calling a second zero a
coincidence: `count = Math.max(1, Math.round(s.party.length / 10))` is not
the `RAID_MODE`-style headcount scaling most of this boss's other mechanics
use — at a 10-player party it is exactly 1, so every shade cast marks one
body out of ten, and a specific stationary player's odds of ever being that
one body are low per cast and roughly independent across the fight's dozen
or so casts (phase 2 and 3 cadences of 12s/10.4s over a ~125s post-opening
window). At 25 players the same formula gives 3 marks per cast — the two
pulls that actually caught a stationary body (`auto`-warlock, `mash`-druid,
both above) were both 25-player. Two 10-normal idle misses next to two
25-player idle-adjacent hits is consistent with the mark's own count scaling
by size being *why* a small idle pull reads as if idle answers shade, rather
than idle actually answering it — the same body would very likely have taken
a hit or two at 25-player. Not filed — the mechanic is doing what its own
count formula says it should, not a bug — but worth the size-scaling framing
being made explicit in this line rather than left as "a miss by the random
target roll" a third time: the honest reading is that shade is a real
"line 1 does not hold" mechanic (disprove-by-`good` territory, alongside
Bloodgorged's `fester`) that a 10-player pull is simply the wrong scale to
observe by. A 25-heroic or 25-normal idle pull of this exact boss, long
enough to catch several casts, would settle it properly; every reading of
this mechanic so far has been at 10-normal (idle, twice) or 25-heroic
(`auto`, `mash`, neither a body that truly never acts) and none has been the
controlled idle/`good` pair the line's own disprove condition asks for.

**2026-09-28, a third role now confirmed at the single hardest cell in the
game, within seven seconds of the healer's own idle time.** `mode=raid`
(`open #b=cold&s=25&h=1`), mage:frost, `dodge`, 25-heroic, carried (behaves as
fresh within one invocation per #273), 390x844 touch
(`playtest/plans/2026-09-28-13.play`) — The Long Cold's only prior appearances
at this size and difficulty were a restoration shaman under `good`/`idle`
(2026-09-25, above); every reading of it since has been at 10-normal, its
easiest setting. This is the first ranged-caster dps on this boss at all (the
other non-healer reading was warrior:arms, a melee role) and the first
`dodge`-style pull of it at heroic — `dodge` presses nothing and only steers
away from danger, so it is a zero-action style the same way `idle` is, tested
here on the hardest cell instead of the easiest one.

It won clean: `victory` at `fightTime=99` (against the idle-healer's 93s and
the good-healer's 105s, same cell, different spec), `aliveParty=25/25`
throughout, `presses=0`, `heroHp` finishing 834/1305 (64%), `inDanger` 16%
then 9%. `bill`: `byMechanic={"breath":1,"instability":2,"flight":422,"haul":1}`
— `flight` is the already-read unconditional per-tick raid-wide cost
(`updateFlight`, no position check, per the 2026-09-26 `flee` entry above),
not a style effect. A third role now confirms this line's shape at the top of
the difficulty ladder rather than only at the bottom or in the middle: a
zero-press ranged dps finished this pull almost exactly as fast and exactly
as intact as the zero-press healer already had, on the one cell README itself
names as the hardest in the game. The kill screen reproduced the
already-tracked banner/report overlap (#275/#283's family) once more
("Nobody Fell" over "Kill it without losing anyone", "Inside Two Minutes"
over "Kill it in under 110 seconds") — not commented or filed again, both
issues already open and nothing new about the mechanism. Gate held shut at
fourteen open `playtest` issues; not filed.

**2026-09-28, the first full evening under `auto`, and the closest an
`auto`-style pull has come to killing The Last Whisper at heroic.**
`mode=clear`, rogue:assassination, `style=auto`, 25-heroic, carried (behaves
as fresh per #273), 844x390 touch (`playtest/plans/2026-09-28-17.play`).
Every `auto` session on record so far was `mode=walk`, a single coverage-label
fight; no `mode=clear` evening (checked against all eleven prior `clear`
entries in `sessions.jsonl`) had run under this style before. Rogue is also
the fastest class in the roster (`moveSpeed` 178, [[#6]]'s own reading), and
this is the first time `auto` has been paired with it.

Both corridors before the first boss crossed exactly as [[#6]] already
predicts at 25-heroic — clean, 5.2s then 24.5s — and Bonegrinder heroic died
at `fightTime=45` inside the room's own 200s play budget
(`aliveParty=25/25 heroHp=1530/1530 presses=0`), the usual free ride. Past it,
two more short corridors (8.6s, 12.2s) reached The Last Whisper heroic, where
`auto` wiped outright for the first time on record: `fightTime=110`, boss at
36%, the player's own death (`heroHp=0/1530`), `aliveParty=24/25`. The two
priors on this boss (druid:feral melee, warlock:destruction ranged, both
above) never wiped — they only ever ran out of their own room's play budget
mid-fight. `outcome:retry` worked normally (a boss-room retry, not [[#3]]'s
broken travel-mode one), and the second pull got further than any `auto` pull
of this boss has: boss down to 13% by `fightTime=197` with the whole raid
alive (`aliveParty=25/25`, against the priors' 24/25), before the room's 200s
budget ran out (`fault:fight-outlasted-its-budget`, `away=331`).

`bill` on that second pull: `hits=30 hitsPerMin=9.1 taken=2546
takenPerMin=774.3 byMechanic={"decay":1,"shade":20,"volley":9}` — a third
data point for this line's own `shade` reading (a mark that "closes at most
of a body's speed," per `src/sim/boss.ts`'s comment, so a body that never
moves never separates from it): 20 hits here, more than the ranged warlock's
14 and the stationary tank's zero-by-miss, on the class with the highest
`moveSpeed` in the roster and therefore the one that should be furthest from
its own mark if speed mattered here — it does not, because `auto` never
converts that speed into motion. The ability bar confirms it directly:
`sinister_strike`/`rupture`/`eviscerate` read `"range"` at the very first
state check (before the boss even existed) and still read `"range"` at the
last one, 197 seconds into a real fight, while `sprint`/`evasion` (self-only,
no range check) sat `"ready"` throughout — the same shape the missing
`acting === 'auto'` steering branch in `scripts/playbot.ts` already explains
for a ranged caster, now confirmed on a melee class whose three core buttons
need proximity `auto` never supplies.

Not filed — fourteen open `playtest` issues held the gate shut all session —
and this sharpens the existing `auto` driver-lesson and this line's own shape
(a body that cannot act, by construction rather than by choice, still gets
carried to the edge of a heroic kill) rather than adding an eighth hypothesis.
**Driver lesson, not a game finding:** `evening auto 200 6`'s own
200-second-per-room budget does not shorten when a boss dies early —
Bonegrinder's own kill landed at 45s but the room's `play` call still ran the
full 200, costing about 155 seconds of real wall-clock time on an empty room.
A shorter per-room budget (90-120s) would have let this same six-room script
reach a seventh checkpoint or a third pull in the same real time; worth
remembering before handing `evening` a flat number this large again.

**2026-09-28, a fourth boss where enrage beats an actively-played pull
outright, and the first ever finish of the roster's single biggest
played/idle gap.** `mode=daily` (today's actual run: The Skyward Deck,
25-player heroic, HASTENED, probed first via
`playtest/plans/2026-09-28-18-probe.play`), druid:balance, `style=good`,
fresh save, 390x844 touch (`playtest/plans/2026-09-28-18.play`). This boss
had two fragments on record before now (2026-09-26 `mash`, killed on a
retry, 10-normal; 2026-09-27 `good`, left open at 52% when an evening's room
budget ran out, also 10-normal) and no session had ever fought it at heroic,
via `mode=daily`, or to any actual finish. `docs/upkeep.md`'s "raid rewarding
play" table has it at the largest gap on the whole list (played 76% / idle
6%, +70), which made an actual played reading of it worth chasing on its own
terms, independent of this line's own hypothesis.

A real `good` command, pressing a real rotation (52, then 41, then 3 presses
across three checkpoints; `hitsPerMin` 12.4 → 109.5 → 112.6 as phase 2 opened
mechanics up), pushed the boss to 68% by 87s and 35% by 177s before ending in
`fight-over outcome=enrage time=184 phase=2`, boss at 33%, the player itself
the death (`heroHp=0/1485`), `aliveParty=24/25`. This is not a new mechanism —
the enrage aura is the same one already read from `combat.ts` against The
Last Whisper and The Three Crowns, above — but it is the fourth distinct boss
now (after Bloodgorged's `fester`, The Last Whisper's enrage-vs-`flee`, and
The Three Crowns' three enrage wipes under `good`) where this line's own
disprove-by-`good` condition produces a loss rather than a win, and the first
time it has happened on the fight upkeep's own table says should reward
playing the most. **Not a disprove of line 1 in general** (most of the
roster still shows idle/passive winning outright), but it sharpens the
pattern rather than adding to it: every confirmed exception so far is an
enrage or a healer-specific dot, never a puddle or an add wave, which keeps
narrowing what kind of mechanic actually answers this line rather than just
cataloguing more of them.

See *Not yet filed*, below, for a source-confirmed display bug this same pull
turned up: the minimap's own `enrage 83s` reading, six seconds before the
wipe, was wrong by exactly the HASTENED affix's own 135-second discount.

**2026-09-29, this "enrage beats a played pull" reading corrected: it was
never the raid losing, and doing nothing proves it by winning the same
fight.** `mode=daily` (today's real run, probed first: The Skyward Deck still
25-heroic HASTENED, the same instance the three deaths below all share),
druid:feral, `style=dodge` (zero presses, no toward-boss term at all), fresh
save, 1280x800 desktop (`playtest/plans/2026-09-29-4.play`). Four checkpoints,
`bill` after each: boss 100% -> 68% (87s) -> 36% (178s) -> 3% (268s) -> **0%,
`fight-over outcome=victory time=278`**, `aliveParty=21/25`, `presses=0` the
entire fight, `byMechanic` empty or a single incidental `rocket` hit at every
checkpoint. A body that did nothing at all, on the roster's single largest
played/idle gap (`docs/upkeep.md`: played 76% / idle 6%, +70), watched the
other 24 kill the boss clean.

That is the opposite of what the three prior reads of this identical
instance found, all cited above as "line 1's own disprove-by-good condition
losing": `good`/druid:balance died to `outcome=enrage` at 184s, boss 33%,
`aliveParty=24/25`; `mash`/shaman:elemental died to `outcome=enrage` at
199.3s, boss 26%, `aliveParty=24/25`; `wander`/paladin:protection died to
`outcome=wipe` at 18s, boss 92%, `aliveParty=24/25`
(`playtest/out/2026-09-28-30/journal.jsonl`, confirmed directly). **All
three "losses" were one body dying, not the raid** -- 24 of 25 were alive
in every one of them, same as this session's own winning pull, which also
lost 4 along the way (21/25) and still finished the boss.

Read `src/sim/sim.ts:778-792` rather than guess why: for a non-`saving`
encounter, victory is `!b.alive` -- but the *loss* branch two lines later
checks `player !== undefined && !player.alive` and ends the pull right
there (`s.outcome = enrage-aura-present ? 'enrage' : 'wipe'`), before ever
reaching the real wipe check on the next line, `livingParty(s).length === 0`.
The pull ends -- and is labelled a wipe or an enrage -- the instant the one
actor flagged `isPlayer` dies, whatever the other twenty-four are doing.
`good` and `mash` pressed a rotation that put their own body in the way of
something the fight was actually asking to be dodged; `dodge` never engaged
that hazard at all and simply outlived it, and the identical AI raid it
was riding along with did the rest, the same shape line 1 has shown all
along -- the player's own actions costing the player's own body, not the
fight, is one more reading of "nothing you do is a decision," not an
exception to it. **The "fourth boss where enrage beats a played pull"
framing above is superseded, not standing**: this fight has never actually
been shown to beat the raid, only to kill the one body a driver was
steering.

**Not yet filed** carries the sharper version of this as its own
engine-level finding, since `scripts/harness.ts` -- the balance harness
`docs/upkeep.md`'s own bands and this exact +70 gap are drawn from -- reads
`s.outcome` through the identical `isPlayer` actor
(`harness.ts:28`, `harness.ts:791`: `if (s.outcome === 'victory') wins++`).

**2026-09-28, the first idle pull of The Confluence, and a third kind of
mechanism that beats this line -- not an enrage and not a healer's dot, but a
positional one that turns standing still into a standing melee sink.**
`mode=raid`, rogue:assassination, `idle`, 10-normal, fresh save, 390x844
touch (`playtest/plans/2026-09-28-22.play`) -- completing an idle/mash/good
triangle on the one boss `docs/upkeep.md`'s own "raid rewarding play" table
already flags as the second-largest played-over-idle gap (+54, after
Bloodgorged). The other two corners were already on record: `mash`
(2026-09-26-41.play, `mode=raid`) wiped at 84.2s, boss at 23%,
`aliveParty=7/10`; `good` (2026-09-27-9.play, reached through an evening)
killed it clean, `aliveParty=10/10`. `idle` did not just fail to win, it lost
worse than the mashing pull did: wiped at `fightTime=108`, boss at 7%
(further down than mash's pull, since nine other bodies still dealt damage
for longer), but `aliveParty=3/10` -- seven dead including the player itself
(`heroHp=0/1530`), `presses=0 inDanger=85%`, `bill`:
`taken=3035 takenPerMin=1680.9 died=true
byMechanic={"infection":43,"ooze":3,"spray":2,"engulf":1}`. This meets line
1's own disprove condition on the letter of it: same boss, same size, same
difficulty, idle loses where good already won clean.

Read `src/sim/boss.ts` afterward rather than guess why, since `taken mechanics`
on the end screen (`end.png`) showed heavy hits landing on several AI bodies
too, not only the player. `scheduleInfection` (`boss.ts:2642`) hands a
random non-tank, non-infected body a dot (`INFECTION_TICK`, 12/s,
`combat.ts:289`) that also cuts incoming healing while it runs
(`combat.ts:1129`). The dot always ends the same way -- it "births" an ooze
exactly where the carrier is standing at that moment (`birthOoze`,
`boss.ts:2677`) -- but it can end two ways: naturally, once its duration runs
out (`sim.ts:464`), or early, the instant the carrier's own hp climbs back
above a flush fraction (`sim.ts:361`, which spawns the ooze right there rather
than waiting). Healing does not prevent the ooze; per the code's own comment,
"a wound is answered by getting a body *out of* trouble, and this one is
answered by getting a body that is not in trouble all the way to the top...
what it buys is not the carrier's health, it is where the thing it leaves
behind will stand" -- and the healing-reduction debuff makes reaching that
early flush harder while infected, keeping the carrier closer to wherever it
was already standing. Either way the ooze walks at its own maker "for as long as they are
standing" (`boss.ts:2690-2694`) and melees them on arrival, growing stronger
every time it merges with another ooze (`oozeDamage` scales with what it has
"eaten", `boss.ts:2705-2707`). The function's own comment calls this
"something on a body that will be a body when it stops" and names the whole
answer explicitly: "the small things are slow by design... a body can walk
away from one" (`boss.ts:2713`). A body born already in melee range of a
target that never moves can never be walked away from -- idle does not merely
fail to dodge this mechanic, it guarantees the ooze it spawns starts and stays
in position to hit it, for the rest of the fight, growing if anything else
wanders close enough to feed it.

**Not as clean as Bloodgorged's fester disprove**, and worth saying plainly:
the AI itself does try to answer this mechanic (`ai.ts:1347`, `getAura(actor,
'infected')` registers as a `danger` worth acting on, `ai.ts:304`'s
`infection:self` case), and it still lost badly here (`aliveParty=3/10`,
worse than the `mash` pull's `7/10`) -- so this fight reads as generally hard
or high-variance (matching the mash session's own "suggestive but not
conclusive" note) rather than a case where idleness alone is the whole
explanation, the way a healer withholding heals was the whole explanation on
Bloodgorged. What is clean is the shape of the mechanism itself: this is the
first exception on this line that is neither an enrage (Last Whisper,
Skyward Deck, three Three Crowns pulls) nor a healer-specific dot
(Bloodgorged), but a mechanic that punishes not moving specifically, on the
one boss whose own source comment says its demand "is not about where the
raid is standing... it asks about the geometry between the fight's own
bodies" -- exactly the shape a style with zero movement was always going to
answer worst of all three tried so far.

**2026-09-28, sharpened by the first `dodge`-style evening on a melee dps, and
the first evening to carry a never-attacking body through two boss kills in a
row.** `mode=clear`, warrior:arms, `dodge`, 10-normal, fresh save, 1280x800
desktop (`playtest/plans/2026-09-28-20.play`). `dodge` never calls an ability
at all, and this is the first time it has been given a spec with no ranged
option across a full evening rather than a single pull. Both wing bosses this
evening reached went down with the raid intact and the player barely
touched: Bonegrinder killed at `fightTime=165` (`aliveParty=10/10
heroHp=1890/1890 presses=0 inDanger=1%`), and The Last Whisper -- the same
boss whose enrage a `flee`-style dps has already died to once, above -- killed
even faster at `fightTime=60` (`aliveParty=10/10 heroHp=1886/1890 presses=0
inDanger=0%`). Zero faults across the whole 8-room budget, and the run ended
at a room this line has only reached once before (`THE MOORING`,
`after-evening.png`: "THE WAY AHEAD IS HELD · 9 still standing"). Another
confirmation that the shape holds even when the never-attacking body is asked
to carry across two consecutive bosses in the same sitting, not just one
pull -- see [[#6]]'s own new entry below for what the same run's corridor
crossing adds to that line.

**2026-09-28, sharpened at 25-heroic specifically, and a direct complication
of the 2026-09-26 tank/`dodge` entry above.** `mode=clear`, paladin:
retribution, `dodge`, 25-heroic, carried (behaves as fresh per #273), 844x390
touch (`playtest/plans/2026-09-28-29-extended.play`, after a first 150s-budget
run cut Bonegrinder off at 1% -- `playtest/plans/2026-09-28-29.play`). Same
size, difficulty and style as the 2026-09-26 paladin:protection pull that
killed Bonegrinder-heroic in 48s but lost 9 of 25 raiders doing it -- this run
is the same boss, same style, same difficulty, a different spec on the same
class, and killed it in 64s with `aliveParty=25/25 heroHp=1800/1800
presses=0 inDanger=0%`: full raid, full health, on a body that pressed
nothing the entire fight. Went on, still under `dodge`, to clear THE WEST
CLIMB and reach The Last Whisper with the raid still 25/25, taking it to 26%
before the room's 220s budget ran out (`fight-outlasted-its-budget`, not a
wipe). Five rooms, one full clean 25-heroic kill, zero deaths anywhere --
against the earlier pull's nine deaths on the identical boss/style/difficulty
triple. The variable that changed is role: a tank standing off every
cooldown leaves nothing between the boss and the raid it is meant to
front, where a dps doing nothing costs the raid nothing because nothing was
counting on it. Sharpens the 2026-09-26 entry's own open question -- worth
naming this as a tank-specific cost rather than a `dodge`-specific one, though
a second protection-spec `dodge` pull at this exact cell would make it a
clean pair rather than two single pulls a role apart.

**2026-09-28, the fastest death this whole line has ever recorded, and the
first look at *why* Skyward Deck sits at the roster's largest played/idle
gap rather than just confirming that it does.** `mode=daily` (today's run
had not rolled over: still The Skyward Deck, 25-player heroic, HASTENED --
the same instance the `good` and `mash` sessions above already ran),
paladin:protection, `wander`, fresh save, 390x844 touch, probed first
(`playtest/plans/2026-09-28-30-probe.play`) to find which `class:N` daily
tile is Paladin Tank before committing
(`playtest/plans/2026-09-28-30.play`). Neither of this fight's two prior
played readings was a tank -- both were squishy dps (druid:balance `good`,
died to enrage at 184s boss 33%; shaman:elemental `mash`, died to enrage at
199s boss 26%) -- and paladin:protection had only met `mode=daily` once
before, against a different boss entirely (The Reeking Host, 2026-09-24).

It did not last one `play` chunk: `fight-over outcome=wipe time=18 phase=1`,
`aliveParty=24/25`, the player itself the death (`heroHp=0/2745`),
`bill: taken=7193 takenPerMin=24521.6 died=true byMechanic={}` -- 18 seconds
into the pull, against 184s and 199s for the two dps deaths on the identical
instance, and faster than any death this entire file has on record for any
style on any boss. The WIPE screen's own banner (`end.png`) has a raid-chat
line cut off at the very top of the shot reading `"...Aimed at the tank; it
needs a defensive"` -- `src/render/hints.ts:20` names this `slam`'s own
advice text (`title: 'ABYSSAL SLAM'`), and `src/sim/encounters.ts:3706-3707`
confirms Skyward Deck schedules its own `opening.slam` cast at 14 seconds
into every pull, phase 1's own recast at 16s after that. `src/sim/boss.ts:
4339-4356`'s `resolveBossCast` shows what the telegraph is actually asking
for: `boss_slam` lands only on whichever body is within melee range when the
cast resolves, for `fight(s).slamDamage` (1100 raw for this boss) run through
`hit()` -- `fightScale`, heroic's `1.05` times this boss's own `sizeMechanic`
25-player weight (`0.62`) -- then `applyDamage`'s block-then-armour
mitigation, exactly the kind of hit a tank's own defensive cooldown
(`divine_protection`, slot 5 on this spec's bar) exists to blunt. `wander`
has no such logic anywhere in `scripts/playbot.ts`: per the source read
under [[#6]] above, it round-robins slots 1-5 in fixed order regardless of
what a telegraph is asking for, so slot 5 gets pressed on schedule rather
than in answer to anything, and the opening slam at 14s landed on whatever
slot the round-robin happened to be sitting on.

**Not a clean disprove-by-`good`, and not primarily a game finding** -- no
`good`-style tank pull of this exact cell exists yet to show a defensive
timed correctly surviving the same cast, so this cannot yet separate "the
mechanic is properly lethal without an answer" from "`wander`'s round-robin
answers nothing in particular, the same blind spot already named for every
other style-specific mechanic on this line." What it does show cleanly,
for the first time on this line: `docs/upkeep.md`'s own +70 gap for this
fight is not merely "more mechanics happen here" -- it is at least partly a
single scheduled, single-target, role-specific cooldown check, a different
shape from every other mechanism this line has catalogued so far (an aura
that punishes proximity, a dot that punishes standing still, a raid-wide
enrage that punishes a slow kill). Worth a `good`-style protection paladin
on this exact cell, timing the defensive to the 14s opening slam on purpose,
before reading 18-second tank deaths as anything more than `wander`'s own
blindness meeting the one mechanic on the roster built to punish it hardest.

**2026-09-29, the first raid-mode kill of The Last Whisper this job has ever
finished, and a blind healer topping the meter.** `mode=raid`,
shaman:restoration, `mash`, 10-normal, fresh, 390x844 touch
(`playtest/plans/2026-09-29-2.play`). This boss has appeared four times
before (mage:frost/`auto` under `mode=clear`, never reached it;
priest:shadow/`mash` under `mode=walk`, wiped in THE VIGIL before ever
reaching it; warrior:protection/`idle` and paladin:holy/`idle` under
`mode=raid`) and none of the four ever produced a finished pull of the boss
itself — this is the first. `mash` has no movement branch at all
(`scripts/playbot.ts`'s steering only covers `dodge`/`good`/`melee`/`wander`/
`flee`/`learn`), so the healer stood on its spawn point, round-robinning
slots 1-5 blind, for the entire 172.5s kill. Raid finished 10/10, the
player itself at 703/1485 (47%), no faults. `bill`:
`byMechanic={"decay":1,"volley":8}` — nine mechanic hits total over the
whole fight, and per `src/sim/encounters.ts:129-131` both are the fight's
unavoidable, non-positional ones (`volley`: "everybody at once, which is
everybody at any size"; `decay`: "a patch of a fixed size, wherever it
lands"). The room's own named demand — "cut the shard, swap the hold, and
hold off your own" — never appears in the bill at all: no `shard` or `hold`
entry either landed on this player or was answered by it. So this pull does
not actually test whether standing on one spot survives the room's own
distinguishing straight-line mechanics; it only shows that the fight's
generic raid-wide chip damage is survivable stationary, same shape as every
other cell on this line. The KILL screen's own healing board
(`outcome.png`) is the sharper oddity: `You` (mash, blind, unmoving) read 55
hps against the AI healer Nara's 53, topping the two-healer board and
earning "Top of the Meter." Read against `README.md`'s own account of
target selection ("heals to whoever is furthest from full" — the same
auto-aim [[#1]]'s "Every press aimed at the boss" fix gave every heal
button), this is not mysterious: a press that lands always lands on the
neediest body regardless of who or where the caster is, so a blind
round-robin loses nothing to bad targeting, only to whatever time it wastes
pressing an ability that is still on cooldown. Not a disprove or a sharpen
of the line's own "idle wins" claim — `mash` presses constantly, it is not
idle — but it is the same family of evidence: a body contributing nothing
resembling considered play still finished ahead of the AI on the one board
that was actually its own job. Worth a `wander` or `good`-style healer pull
on this exact boss before concluding the room's shard/hold mechanics are
survivable stood still — this pull never drew either one.

**2026-09-29, the last open role on the hardest cell: a tank, on The Long
Cold, at 25-heroic.** `mode=raid`, warrior:protection, 25-heroic, fresh save,
844x390 touch. This boss had been read four times before -- restoration
shaman good/idle (2026-09-25), warrior:arms flee and dodge at 10-normal
(2026-09-26/27), mage:frost dodge at 25-heroic (2026-09-28) -- covering
healer and both dps flavours, never a tank, and never a protection warrior
on this boss at all (its one prior good/idle pair in this hypothesis was on
The Bonegrinder, 10-normal, a different boss and a different difficulty).
`open #b=cold&s=25&h=1` -> `class:warrior:protection` -> `pull` ->
`play good 200`, then, in a **separate `playbot` invocation** (the mid-script
`open #hash` a second time is the same-document fragment-navigation trap
this file already names two paragraphs above -- caught before it cost the
data this time, not after) -> the identical `open` -> `play idle 200`:

```
good: fight-over time=100 aliveParty=25/25 heroHp=2141/2790 (77%) presses=40
      inDanger=31% hits=503 hitsPerMin=300.9 taken=3805 takenPerMin=2276.2
idle: fight-over time=101 aliveParty=25/25 heroHp=2737/2790 (98%) presses=0
      inDanger=28% hits=494 hitsPerMin=294.2 taken=2072 takenPerMin=1234.1
```

Both cleared with the full raid standing and inside a second of each other on
fight length. Idle finished at 98% of its own health against good's 77%,
took barely more than half the damage per minute (1234.1 vs 2276.2), and
spent less time in danger (28% vs 31%) despite never pressing `shield_wall`
or moving to block anything. `outcome.png` for both pulls puts `You` at the
bottom of the damage board either way (rank 15 of 19, a tank's normal spot)
and shows the same `Held It`/`Inside Two Minutes` award banners sitting over
the report table the #283 family already tracks -- not filed again here.
Fourth role, fourth confirmation shape, and now the hardest cell in the game
has been read under all four roles (healer, ranged dps, melee dps, tank)
with idle never once behind good on any axis that is not itself a proxy for
effort.

**2026-09-29, the first full evening -- not one pull -- won without a single
press.** `mode=walk`, druid:balance, `flee` (a style that never calls
`d.ability()`), 10-normal, carried (behaves as fresh per #273), 844x390 touch
(`playtest/plans/2026-09-29-9.play`, full detail under [[#6]]'s new entry
above). Every prior reading on this line is one pull with a fixed style
compared against `idle`; this one never pressed anything to begin with and
ran the whole scripted evening, not a single fight. Result: THE VIGIL crossed
clean, Bonegrinder killed (`aliveParty=10/10 heroHp=1485/1485 presses=0
inDanger=1%`), two more corridors crossed clean, The Last Whisper killed
(`aliveParty=10/10 heroHp=1362/1485 presses=0 inDanger=0%`), a final corridor
crossed into a ninth room -- zero faults anywhere, two boss kills, the whole
raid never below full strength, `bill hits=0 taken=0` the entire way. Every
prior confirmation of this line was a single pull; this is the first time the
shape has held across two consecutive kills inside one continuous evening,
which is a stronger claim than "one fight can be won standing still" -- it is
"an evening can be won standing still, more than once in a row."

**2026-09-29, Bloodgorged's own `gorge` punishes an actively-wrong style the
same way its `fester` punishes a passive one -- and the `daily.boss` coverage
label cost two prior sessions a boss they never actually fought.** `mode=daily`
gave `boss=confluence` (a coverage label only) with paladin:protection,
`style=melee`, fresh save, 390x844 touch (`playtest/plans/2026-09-29-10.play`).
Probed first: today's actual daily is The Bloodgorged, 25-player **normal**,
FALTERING ("healing lands for a quarter less") -- and checking `sessions.jsonl`
against this line's own driver-lesson on `daily.boss` first showed that the
two prior sessions labelled `"boss": "gorged"` under `mode=daily`
(2026-09-27, priest:shadow/`wander`; 2026-09-28, paladin:protection/`wander`)
both rolled a different real fight that day (The Three Crowns, The Skyward
Deck) and never touched Bloodgorged at all. So this is the first tank reading
of this boss to actually land on it, the first at 25-normal (the three real
priors were 25-heroic twice and 10-normal once), and the first `melee`-style
pull of it on record.

`melee`'s own steering (`scripts/playbot.ts`, already read into this file
above) walks the player onto the boss's raw coordinate and swings there, with
no telegraph awareness -- and `says` caught the exact telegraph it never
answered: "Off the boss, it is about to spit" / "Leave that one alone," five
lines of it across the pull, none acted on. `bill` at each checkpoint:
`t=57 hits=2 byMechanic={"gorge":2}`, `t=118 hits=12 byMechanic={"gorge":12}`,
wipe at `t=143 hits=18 byMechanic={"gorge":18} taken=6435 takenPerMin=2699.4
died=true` -- every mechanic hit this pull recorded was `gorge`, and its rate
is more than double the 2026-09-26 `good` pull's total taken-per-minute
(1114.9, only 6 of which were `gorge`) and nearly double the `idle` pull's
(1383.3, dominated by `fester` instead). The tank died at `bossHp=2%`
(6113/375200) with `aliveParty=22/25` -- the raid otherwise intact and the
boss a handful of seconds from dead.

This reads as a second, distinct mechanism on the same boss: `fester`
(this hypothesis's 2026-09-26 entry above) punishes a healer that never acts;
`gorge` punishes a body that never leaves melee range, which `melee`'s own
steering guarantees. Not a disprove or confirm of this line itself (`melee`
is neither `idle` nor `good`), but it sharpens the same Bloodgorged thread
into a boss with two independently-confirmed, differently-shaped answers to
"what does idle-shaped play cost you" -- on top of being the clearest case yet
of the isPlayer-outcome bug under *Not yet filed* below (2% boss health,
22/25 raid alive, the fight still called a flat wipe).

**2026-09-29, first completed 25-heroic reading of The Two Flasks on record,
under `mash`.** `mode=raid` (`boss=flasks`, druid:feral, `mash`, 25-heroic,
carried, 820x1180 touch, `playtest/plans/2026-09-29-11.play`). Every prior
25-heroic attempt at this boss was `mode=walk`/`flee` and never got past THE
VIGIL; this went straight in on an invite hash and fought it. `mash` presses a
random ability slot with no telegraph awareness at all (the same blind,
judgement-free shape as `idle` in spirit, just not idle's zero presses) and
killed at 130s with `aliveParty=24/25`, one death, `hits=437 hitsPerMin=201.4
taken=3075 takenPerMin=1417.4`. Not a clean `idle`-vs-`good` pair so it does
not sharpen this line's own test directly, but it is a second data point (after
the daily-mode idle/good/mash trio above) that this boss's hardest published
cell falls to undirected pressing about as easily as its normal one did --
worth a real `idle` vs `good` pair at this exact size/difficulty before
concluding more.

The result screen (`mid2.png`) also handed #283 the reproduction its own text
says it was missing: three award banners at once (`First Blood`/`OPENED The
Three Crowns`, `Heroic`, `Full Raid`) stacked over the damage board's top three
rows, with a surviving screenshot this time. Commented on #283 rather than
filing -- same root cause the issue already names, just the three-banner case
it noted no screenshot existed for.

**2026-09-29, the first `ladder` run this job has ever executed, and the
sharpest split yet: idle wins clean in one pull while `learn` never wins in
four.** `mode=raid` (not daily), boss=flasks, warlock:destruction, 10-normal,
fresh save, 390x844 touch -- the exact cell `playpick` returned this session,
already carrying an idle/good pair from 2026-09-25
(`playtest/plans/2026-09-25-20.play`: idle takenPerMin=1314.4, good
takenPerMin=1678.0). Checked first: grepped all 188 prior `.play` files for
the literal `ladder` command and found zero -- despite `docs/playtest.md`'s
own "Whether the fight can be learned at all" section, with its worked
Bonegrinder table, existing since the job was seeded.

Ran a fresh idle pull on this cell again for a same-session comparison point
(`playtest/plans/2026-09-29-20.play`: victory at fightTime=125,
aliveParty=10/10, heroHp=641/1485, presses=0, inDanger=31%,
hitsPerMin=550.1, takenPerMin=2500.3), then `ladder 4 90` on an independent
fresh pull of the identical cell (`playtest/plans/2026-09-29-21.play`):

```
#1 ongoing 87s  hits=497(342.8/min) taken=1806(1245.5/min)      worst=houndx497
#2 wipe    123s hits=543(264.9/min) taken=2737(1335.1/min) DIED worst=houndx542
#3 ongoing 87s  hits=0(0/min)       taken=315(217.2/min)        worst=none
#4 wipe    131s hits=400(183.2/min) taken=1674(766.7/min) DIED  worst=houndx393
```

`wins=0/4` -- the boss never died once across four attempts, both budget-outs
stalled around boss 36-37% and both wipes landed at boss 12-13%, so this was
not a ladder gradually closing in on a kill. The curve is not monotonic
either: pull 3 is a clean outlier at zero mechanic hits for the whole 87
seconds, sandwiched between two pulls hit for hundreds. And despite taking
less damage per minute on every single pull than idle's own 2500.3/min,
`learn` never once produced idle's outcome -- idle killed this boss clean in
its one and only pull, at zero presses, while four pulls of a style built to
imitate a player who reacts to what it has already seen came away with
nothing. This is the sharpest version of this line yet: not just "idle
doesn't lose," but "the style closest to a player actually trying, run four
times over, does worse than a player who never touches the controls at all."

**Not a clean disprove-or-confirm** -- `learn` is not `good`, so this does
not literally satisfy the line's own disproof condition ("any cell where
idle loses and good wins"). But it is new evidence in the same direction,
from a mechanism (`ladder`) this job had never once exercised, and it closes
a gap `docs/playtest.md` itself names: "Neither has ever been measured
against a player."

**Not filed** -- fourteen open `playtest` issues held the gate shut, and this
sharpens an existing line rather than opening a new one regardless. Worth a
repeat with more pulls (the spec's own default is nine) once there is room,
to see whether pull 3's zero-hit anomaly is a real skill state the learner
reached and then lost, or noise from one lucky mechanic-target roll.

**2026-09-30, first `mash`-style pull of any tank spec, and the cost of doing
nothing turns out to land on the player, not the raid.** `mode=raid`
(boss=whisper, warrior:protection, `mash`, 10-normal, fresh, 390x844 touch --
`playtest/plans/2026-09-30-1.play`). `mash` round-robins ability slots 1-5
with no steering of its own, so a tank under it stands on its spawn point the
whole pull and presses its own kit blind. Ran the identical script twice
(fresh `open` each time, so a fresh seed both times, per `docs/playtest.md`'s
own note that only the *first* pull after `open` is fixed):

```
seed A: played mash 240s total, outcome=ongoing phase=2 bossHp=41%
  heroHp=969/2790 (35%) hits=5 hitsPerMin=1.3 enrage countdown=2s at cutoff
seed B: played mash 121s total, outcome=victory phase=3 bossHp=0%
  heroHp=1864/2790 (67%) hits=7 hitsPerMin=3.6 aliveParty=10/10 throughout
```

Both seeds show the same shape as this line's other entries -- `aliveParty`
never dropped below 10/10 in either run, and the raid's own nine bodies did
essentially all of the killing (7 landed hits from the player across the
whole of seed B's clean win). What is new here is where the cost of that
actually lands: not on the raid's outcome, which is fine either way, but on
the *player's own* survival margin, which is not fine either way -- seed A's
mash tank stood in a repeating `decay` ground effect it never stepped out of
(mash has no steering) and was one enrage tick from finding out what a wipe
under this line looks like, at 35% of its own health, while seed B cleared
without incident in half the time on the same script. A style built to prove
"nothing you do is a decision" for the *raid* found a case where it is very
much a decision for the *character holding the controls* -- just one the
raid's win condition does not price in.

**Not filed** -- fourteen open issues held the gate shut. Also not a clean
disprove-or-confirm (mash is not `good`), so this sharpens rather than
resolves the line: worth an `idle` vs `mash` pair on this exact cell once
there is room, to see whether standing still *without* pressing anything
would have taken the same `decay` tick mash's blind presses did nothing to
avoid, or whether mash's own button-mashing is what kept the player rooted
in it.

**2026-09-30, the deepest `auto`-style progress yet against The Last Whisper
heroic, on a spec and viewport this pairing had never seen.** `mode=walk`,
druid:balance, `auto`, 25-heroic, 820x1180 touch, carried-behaves-as-fresh
(`playtest/plans/2026-09-30-6.play`) -- the fourth `auto` evening to reach
this boss (after druid:feral/844x390, warlock:destruction/844x390,
hunter:marksmanship/844x390, all on other viewports) and the first on
820x1180. THE VIGIL crossed clean (`10.7s` in, `41s` total) and Bonegrinder
died at `fightTime=62` (`aliveParty=25/25 heroHp=1485/1485 presses=0`) --
[[#6]]'s now-routine clean 25-heroic crossing under `auto`, a further
confirmation rather than new evidence. The Last Whisper then ran its 200s
room budget down to `boss=12%` (`bill hits=23 hitsPerMin=7 taken=3082
takenPerMin=933.9 byMechanic={"volley":7,"decay":2,"shade":14}`) --
further than any prior `auto` attempt on this exact fight: feral stalled at
32%, warlock at 41%, marksmanship at 43% (the last one landing only 1 hit
all fight to a range dead-zone). hitsPerMin (7) is close to feral's (6.7)
and warlock's (5.8), so the deeper boss health is not obviously explained by
landing more hits -- more likely the shared-RNG-stream variance this line's
own caution already names (different runs consume the same deterministic
stream at different rates and land on different crit/target rolls), not a
new mechanism. Not written up as a disproof or a new line: same shape as
every other `auto` reading, a wider spread on the same axis rather than a
different axis. **Not filed** -- fourteen open issues still held the gate
shut (unchanged since the last ledger line; nothing closed to re-verify).

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

**2026-09-28, seventh confirmation, first `flee` style and first hunter
class.** `mode=walk` (`boss=marrow`, a coverage label only), hunter:
marksmanship, `flee`, 10-normal, genuinely fresh save (not
carried-behaving-as-fresh), 1280x800 desktop
(`playtest/plans/2026-09-28-6.play`). Every #271 confirmation so far used
`mash`, `wander` or `auto`; hunter's own flat `moveSpeed` (173, per [[#6]]'s
own source reading) is the second-highest in the roster after rogue's, and
this crossed THE THRESHOLD's own door in 8.2s, as fast as rogue's clean
crossings. But the raid never reached THE SPIRE: caught inside THE VIGIL
itself by the threshold's own chasing watchmen (`stillAlive` reading 185-186
The Damned throughout, `closestGot=16` units from the far door), it wiped at
34.6s. `outcome:retry` tapped and produced the identical shape every prior
report has: an instant re-wipe with `hero.hp=0` and every ability slot
`locked`, and a second `evening` call over the same stuck room produced the
same shape a room later -- `fault:evening-stuck
{"at":"vigil","after":"wipe","rooms":3}` at 95.6s. A seventh spec, and the
first under a style built to retreat from danger rather than beeline or
wander into it -- but `cross()`'s own fixed corridor-steering (already
established under [[#6]]: it ignores style entirely) means `flee`'s own
away-from-danger term never actually ran here, so the wipe is the corridor's
watchmen catching up regardless of style, not a `flee`-specific interaction.
Not commented on #271 again -- seven specs and now four styles have hit this
exact wall the same way, and the qualifier still standing is only "at least
in THE VIGIL."

**2026-09-28, eighth confirmation, first healer, first `melee` style, and the
first at 25-heroic.** `mode=walk` (`boss=gift`, a coverage label only),
priest:discipline, `melee`, 25-heroic, carried (behaves as fresh per #273),
844x390 touch (`playtest/plans/2026-09-28-23.play`). Every prior #271
confirmation was 10-normal on a dps or an unclear role under `mash`, `wander`,
`auto` or `flee`; this is the first healer put through it, the first under a
style with no away-from-danger term at all (`melee` beelines at `hud().boss`,
per the 2026-09-26 tank-melee note), and the first at the hardest
size/difficulty pairing in the game. THE THRESHOLD crossed clean (5.9s), then
THE VIGIL's watchmen caught the party mid-crossing and wiped it at 39.6s
(`closestGot=14`, `presses=11` -- the healer's own casts, not steering).
`outcome:retry` tapped: the same shape every prior report has, an instant
re-wipe at 70.1s with `presses=0`, `closestGot=n/a` (no movement even
attempted), and a second `evening` call over the same stuck room produced the
identical shape a room later -- `fault:evening-stuck
{"at":"vigil","after":"wipe","rooms":3}` at 100.6s. `after-evening.png` shows
the exact DEFEAT-screen shape every prior report has: "0.0s · 0 down", every
raider's own dps/hps/taken-mechanics column reading a flat `-`/`0`, PULL AGAIN
highlighted and nothing on the board. Not commented on #271 again -- eight
specs, five styles, two sizes and two difficulties have now hit this exact
wall the same way; the qualifier still standing is only "at least in THE
VIGIL," and this session finds nothing that narrows it further, only that it
holds at the far end of every axis tried so far. Gate held shut at fourteen
open `playtest` issues; not filed.

**2026-09-28, ninth confirmation, first paladin:holy evening ever and the
first `flee`+healer pairing.** `mode=walk` (`boss=saved`, a coverage label
only), paladin:holy, `flee`, 10-normal, carried (behaves as fresh per #273),
390x844 touch (`playtest/plans/2026-09-28-25.play`). Checked sessions.jsonl
first: paladin:holy has been played four times before this and never once
inside `mode=walk` or `mode=clear` — every prior reading was a standalone
`mode=raid` or `mode=daily` pull, so this is the first evening this class/
spec has ever walked, full stop. It is also the second `flee`-style
confirmation of this wall (after the seventh, hunter:marksmanship) and the
first time `flee` has been paired with a healer specifically — the eighth
confirmation put a healer through `melee` (no away-from-danger term at all),
this puts one through the style built to retreat. THE THRESHOLD crossed
clean (8.2s, `presses=0`), then THE VIGIL's watchmen caught the party
mid-crossing (`closestGot=13`, `presses=9` — the healer's own casts while
retreating) and wiped it at 35.9s. `outcome:retry` tapped: the identical
shape every prior report has, an instant re-wipe at 66.4s with `presses=0`
and `closestGot=n/a` (no movement even attempted), and a second `evening`
call over the same stuck room produced the same shape a room later —
`fault:evening-stuck {"at":"vigil","after":"wipe","rooms":3}` at 96.8s.
`after-evening.png` is the same DEFEAT-screen shape as every prior report:
"0.0s · 0 down", every column a flat `-`/`0`, PULL AGAIN highlighted and
nothing on the board. Not commented on #271 again — nine specs and five
styles have now hit this exact wall the same way, and `flee`'s own
away-from-danger term still never runs inside it, for the same reason the
seventh confirmation already named: `cross()` ignores style entirely. Gate
held shut at fourteen open `playtest` issues; not filed. Nine confirmations
across nine specs is enough that this line should stop collecting specs and
start asking the one question it has not yet: whether PULL AGAIN's failure
is specific to a wipe that happens *while `cross()` is mid-crossing*, or
whether a travel-mode wipe anywhere else in the building (a corridor this
job has not yet gotten a party killed in) fails the same way. Every
confirmation so far is THE VIGIL; no session has tried to force a wipe in a
different corridor on purpose.

**2026-09-28, tenth confirmation, and the first to bypass `cross()` entirely.**
`mode=raid` (`boss=marrow`, mage:frost, `idle`, 10-normal, fresh, 844x390
touch, `playtest/plans/2026-09-28-26.play`) -- every prior confirmation went
through `evening`'s own `cross()` (`mode=walk`/`mode=clear`); this one never
called `evening` at all. Walked in the real front-door way (front page ->
RAID -> class pick -> PULL, only the second `mode=raid` session ever to do
that instead of an invite-hash shortcut -- see [[#1]]'s sibling note, though
this line is the one that benefited), then drove straight at the boss's room
with the driver's own `walkto`, which has no combat or survival behaviour of
its own. THE VIGIL's watchmen caught the player mid-walk and killed it at
33.5s (`hp=0/1305`, `aliveParty=9/10`) -- `walkto`'s own `could-not-walk-there`
fault fired because the player died before reaching the target, not because
the path was blocked. `outcome:retry` tapped: the identical shape every
`cross()`-driven report has had, an instant DEFEAT-screen redisplay
("0.8s · 0 down", `after-retry.png`) with every ability slot `locked` and
nothing restarted. Re-ran a second time with the same script for a clean
screenshot pair; both runs died in THE VIGIL and both retries failed the same
way. This answers the ninth confirmation's open question: the bug is not in
`cross()`'s own re-entry handling, since a wipe reached without `cross()`
ever running fails identically. Commented on #271 with both journal excerpts
rather than filing again. Still open: whether the wall is specific to THE
VIGIL as a room, or to any travel-mode death anywhere in the building --
every confirmation, `cross()`-driven or not, has still only ever happened in
this one corridor.

**2026-09-28, eleventh confirmation, and the first to test whether `melee`'s
one clean crossing was a style effect or a class-speed effect.** `mode=walk`
(`boss=crowns`, a coverage label only), warlock:destruction, `melee`,
10-normal, fresh save, 1280x800 desktop
(`playtest/plans/2026-09-28-32.play`). [[#6]]'s seventh-confirmation note
names `melee` and `idle` as "the only two styles that have ever crossed THE
VIGIL clean," but the single `melee` clean crossing on record (2026-09-25,
rogue:assassination) is also the single fastest class in the roster
(`moveSpeed` 178), and the eighth #271 confirmation already ran `melee`
through a different size/difficulty (priest:discipline, 25-heroic) and got a
wipe, not a clean pass -- the two `melee` data points had never actually told
style apart from class speed or size/difficulty. Warlock:destruction sits at
`moveSpeed` 158, tied for the slowest tier with three classes that have
already stalled or wiped this exact 10-normal/fresh cell under other styles.
It did not cross clean either: THE THRESHOLD in 9.3s, then caught by THE
VIGIL's own watchmen and wiped at 35s (`closestGot=14`, `presses=9`).
`outcome:retry` tapped: the identical shape every prior #271 report has had,
an instant re-wipe with `hero.hp=0` and every ability slot `locked`, and a
second `evening` call over the same stuck room reproduced it a room later --
`fault:evening-stuck {"at":"vigil","after":"wipe","rooms":3}` at 95.9s.
`end.png` is the same DEFEAT-screen shape as every prior report: "0.0s ·
0 down". Eleven specs and five styles have now hit the #271 retry wall;
`melee`'s own record is now one clean crossing (fastest class) against two
wipes (slowest-tier class, both sizes tried), which points at class speed
doing the work in the one clean pass rather than the style itself -- folded
into [[#6]] above. Gate held shut at fourteen open `playtest` issues; not
filed, nothing here beyond another #271 confirmation.

**2026-09-29, twelfth confirmation: the first clean `flee`-style VIGIL
crossing on record, and a second westclimb stall that does not look like the
first one.** `mode=walk` (`boss=gift`, a coverage label only), druid:
restoration, `flee`, 10-normal, carried (behaves as fresh per #273), 844x390
touch (`playtest/plans/2026-09-29-16.play`) -- first druid:restoration
evening this job has ever run (its five prior readings were all standalone
`mash`/`auto` pulls). THE THRESHOLD crossed clean in 10.8s, and THE VIGIL
crossed clean too, in 41.6s (`crossed from=vigil to=spire ... presses=10`,
the healer's own casts while moving) -- the first time `flee` itself has
crossed VIGIL clean (it has wiped there twice before, hunter:marksmanship and
paladin:holy, both this exact style/size/difficulty) and only the third clean
VIGIL crossing this line has on record at all, after one `melee` and one
`idle`. Druid's own `moveSpeed` (167) sits between hunter's (173, wiped) and
paladin's (158, wiped) -- a mid-speed class crossing where a faster one did
not is a fourth data point against the eleventh confirmation's tentative
"class speed decides it" reading, and argues harder for that entry's own
alternative: whether the threshold's watchmen happen to catch the party this
particular run, not anything measured about the class. The evening then
walked straight into The Bonegrinder's room and killed it with no report
screen (`boss-woken` then `boss-down`,
`played style=flee seconds=240 ... fightTime=128 aliveParty=10/10
heroHp=1440/1440 bossHp=down presses=0 inDanger=2%`) -- unremarkable on its
own, [[#1]]'s idle/flee-wins shape again, already well covered.

Room 3 (`westclimb`) is the new ground. `fault:fight-outlasted-its-budget
{"room":"westclimb","seconds":240,...}` at 521.8s, `closestGot=553` -- the
evening burned its whole 240s budget without the door coming anywhere near
reach. This is only the second stall this job has ever recorded outside THE
VIGIL (the first, 2026-09-25, paladin:retribution/`idle`, also stalled in
westclimb, at `nearestDoorGot=12`) -- but the two do not look alike beyond
the room's name: that one parked the party twelve units from the door,
functionally at the point of leaving; this one never got within five hundred
units of it. `after-evening.png` shows the party clustered at the foot of a
diagonal wall on the room's western edge, well short of any doorway, all ten
members at full health and fighting nothing (`hits=0 taken=0` for the full
368s chamber time) -- closer in shape to `cross()` aiming the party at a
point it cannot walk past than to THE VIGIL's watchmen-convergence stalls.
Two westclimb stalls under two different classes and styles (`idle`, `flee`)
is enough to say the failure is not THE VIGIL-specific -- #281's own title
still only names THE VIGIL -- but the very different `closestGot` (12 against
553) means "the same failure, a second place" is not yet established either.
Worth a third westclimb stall that reads the door's own coordinate against
the party's mid-stall, to say whether `cross()` is aiming at a point it
cannot reach or just aiming badly from far away. Not filed -- gate held shut
at fourteen open `playtest` issues.

**2026-09-29, thirteenth confirmation, and the first outside THE VIGIL --
answering the ninth confirmation's open question.** `mode=clear`,
shaman:restoration, `melee`, 25-heroic, genuinely fresh save, 1280x800 desktop
(`playtest/plans/2026-09-29-23.play`) -- the first melee-style evening ever
run on a healer spec (every prior `melee` reading was a dps or a tank), and
the first shaman:restoration evening under anything but `flee`. THE VIGIL
itself crossed clean in 5.6s door to door (`7.6s` to `13.2s`, `presses=0`),
adding a data point to [[#6]]'s own "25-heroic never stalls VIGIL" reading,
and the Bonegrinder heroic pull died inside the crossing at full health
(`aliveParty=24/25 heroHp=1485/1485 presses=7`) -- unremarkable, [[#1]]'s
idle-wins shape again.

Rooms 4-6 (eastclimb, oratory) crossed clean and The Last Whisper died on a
retry (first attempt hit its own `outcome=enrage` at 2% boss hp with the
healer itself dead, `heroHp=0/1485`, a real boss-timer loss, not this bug --
`outcome:retry` worked normally on that boss-room wipe, matching the "Not yet
filed" notes above that boss-room retries are fine and only travel-mode ones
are not). Past that, room 8 (`westclimb`) is what every #271 confirmation
before this one had never tried: an actual corridor wipe outside THE VIGIL.
`cross()` named `"took":"oratory"` `why="toward a lit pad"` while standing in
westclimb (`ways=["oratory@273","spire@514"]`, `lit=["threshold","oratory",
"mooring"]`), then the driver opened the map and rode the lit pad to
`mooring` -- and the state read back from that very tap already showed
`outcome=wipe`, with the `crossed` line logged a beat later reading
`from=westclimb to=mooring endedAt=null presses=5`, then
`wiped at=westclimb outcome=wipe wipes=2` -- westclimb's own packs
(`nearest=Blighted Abomination,Blighted Abomination,Plague Scientist,
Pustulating Horror` on every crossing line through this stretch) killed the
party while `cross()` was mid-decision about the pad, not the VIGIL's
watchmen.

`outcome:retry` was tapped exactly as every prior report did, and got the
exact same shape: `room n=9/10 room=mooring` re-wiped instantly
(`crossed from=mooring to=mooring ... closestGot=n/a endedAt=null
presses=0`, `wiped ... wipes=3`), retried again, re-wiped identically
(`wipes=4`), and the evening gave up: `fault:evening-stuck
{"at":"mooring","after":"wipe","rooms":10}` at 1086.3s. `end.png` is the
identical DEFEAT-screen shape as every other #271 screenshot: "THE MOORING",
"0.0s · 0 down", every damage-board row a flat `-`/`0`, PULL AGAIN
highlighted. The final `state` matches every other #271 report's numbers
exactly: `hero.hp=0/1485`, `alive:false`, every ability slot
`"status":"locked"`, `outcome:"wipe"`. The `evening` summary line names it
plainly:
`walked=[...,"westclimb(travel,wipe,18s)","mooring(travel,wipe,0s)",
"mooring(travel,wipe,0s)"]`, `reached=... -> westclimb -> mooring`,
`endedAt=mooring`.

This answers the ninth confirmation's open question directly: a travel-mode
wipe *outside* THE VIGIL fails to retry the exact same way, with the exact
same symptom (`hero.hp=0`, every slot `locked`, instant 0-second re-wipes).
"At least in THE VIGIL" no longer holds as a qualifier -- twelve confirmations
found the wall only where they looked for it, and the thirteenth found it
the first time it looked somewhere else. One wrinkle worth flagging for
whoever reads this next: the room the evening calls "stuck" (`mooring`) is
not the room the party actually died in (`westclimb`) -- the death landed
mid-pad-ride, so the stuck room name follows the pad's destination, not the
death's location. Worth checking from source (`scripts/playbot.ts`'s
`cross()`/pad-ride handling alongside `src/main.ts`'s own retry path) before
this is filed: whether the bug is "a travel wipe never retries" full stop,
or specifically "a wipe that lands while a pad-ride is in flight never
retries," which this one sighting cannot tell apart on its own. Not filed --
fourteen open `playtest` issues held the gate shut -- but this is the
strongest single candidate this line has produced for actually narrowing
#271's own scope beyond "THE VIGIL," and the reproduction
(`playtest/plans/2026-09-29-23.play`, `playtest/out/2026-09-29-23/`) is a
full evening script rather than a single-corridor `mode=walk`, so it also
exercises the retry wall from a genuinely different setup path (`#b=marrow
&s=25&h=1` unlock into `mode=clear`) than any prior #271 report.

**2026-09-29, fourteenth confirmation and the mechanism, read from source
rather than played.** The picked cell (`mode=clear`, shaman:elemental, `flee`,
10-normal, fresh, 390x844 touch, `playtest/plans/2026-09-29-25.play`) is the
first `flee`+shaman:elemental clear evening and the first for this spec at
its own default tier rather than 25-heroic carried. THE VIGIL wiped at 35.3s
(`closestGot=10`), `outcome:retry` was tapped, and it re-wiped instantly
(`closestGot=n/a`) exactly as every prior report: a second retry the same,
`fault:evening-stuck {"at":"vigil","after":"wipe","rooms":3}` at 96.2s, final
state `hp=0/1440 alive=false` with all five ability slots `"status":"locked"`
(`end.png` matches every other #271 screenshot's DEFEAT shape pixel for
pixel: "0.0s · 8 down", flat `-`/`0` board, PULL AGAIN highlighted). No pad
was involved -- a plain `cross()` corridor wipe -- which already narrows the
thirteenth confirmation's open question toward "any travel wipe," not just
one landing mid-pad-ride.

While the gate held this shut anyway (still fourteen open `playtest`
issues), this session read `src/main.ts` rather than adding a fifteenth spec,
and the read explains all fourteen confirmations at once. `restart()` (1470),
on a travel room, resets `run.carried` via `wipedRoom()` and then calls
`reenter()` -> `walkTo()` (1274). `walkTo()`'s own first line is `harvest()`
(1039), which only acts while `state.mode === 'travel'` -- true here, because
`state` is still the just-died corridor, not yet replaced. `harvest()` reads
`carriedOut(state)` off that dead state (a dead actor's share is `-1`) and
writes it back into `run.carried`, clobbering the reset `wipedRoom()` made one
line earlier. `walkTo()` then sets `roomCarried = [...run.carried]` (now all
`-1`), builds a fresh corridor `SimState`, and calls `carryInto(state)` (859),
which turns any actor with a negative `roomCarried` share into `alive=false,
hp=0` -- so the brand-new corridor is painted dead before its first tick.
Boss-room retries (`enterRoom()`) never call anything with this shape while
`state.mode` is `'raid'`, so `harvest()` no-ops there, which is the whole
reason a boss-room PULL AGAIN works and a corridor one never has. Commented
the mechanism on #271 with these line numbers rather than filing (a comment
is not one of the two issues, and the practice of adding findings to #271
under a shut gate is already established on this line). Not yet actually
fixed by anyone -- this is a reading, not a patch, and the fix belongs to
`docs/upkeep.md`'s gate -- but the open question this line has carried since
the ninth confirmation ("is PULL AGAIN broken full stop, or only for a wipe
that lands mid-pad-ride") is answered: it is not about pads at all, it is
`harvest()` running once too many times.

**This sub-line is done.** Sharpened all the way to a source-level cause and
a comment on #271 with it; nothing further to add by playing more cells. The
outer hypothesis (a travel-mode wipe cannot be retried) stays standing only
in the sense that nobody outside this job can act on it until `docs/upkeep.md`
picks it up -- fourteen confirmations plus a mechanism is the ceiling this
line can reach from inside a shut gate.

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

**2026-09-28, corrected: `melee`'s one clean crossing does not replicate.**
[[#3]]'s eleventh confirmation ran `melee` a third time (warlock:destruction,
10-normal, `moveSpeed` 158, the slowest tier in the roster) and it wiped in
THE VIGIL rather than crossing clean, same as the eighth #271 confirmation's
`melee` reading (priest:discipline, 25-heroic). `melee`'s record is now one
clean crossing, by rogue:assassination -- the single fastest class,
`moveSpeed` 178 -- against two wipes on slower classes at both sizes tried.
That reads as class speed doing the work in the one clean pass, not the
style: this line should stop calling `melee` a style that crosses clean and
start reading its one clean data point as a speed effect wearing a style's
name, alongside `idle`, whose own clean crossings ([[#6]]'s sixth and later
confirmations above) hold across slower classes too and so are not explained
away the same way.

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

**2026-09-26, tenth confirmation, a second style crossing on the same class,
and the tightest style-independence pairing this line has produced.**
`mode=clear`, rogue:assassination, `mash`, 10-normal, fresh, 820x1180 touch
(`playtest/plans/2026-09-26-32.play`). The only other clean 10-normal VIGIL
crossing on record (the fifth-style entry above) was this exact class under
`melee`, 26 seconds door-to-door. This run, same class and cell, different
style, crossed in almost the same time: door at 22.1s, out at 48s, 25.9
seconds, `presses=3`. Two different steering algorithms (`melee`'s beeline
and `mash`'s urgent-telegraph-reactive movement), same class, same
size/difficulty/save, landing within a second of each other -- a tighter
match than either of the two 25-heroic clean crossings (`good`/`dodge`, on
two different classes) managed against the 10-normal stalls. That argues for
something about rogue:assassination specifically (its own move speed, a
racial, or simply this class's starting position relative to the corridor)
rather than size/difficulty being the deciding variable after all -- **not
settled**, since a fresh save's roomSeed is keyed off `Date.now()` per
`docs/playtest.md`'s own note, so two rogue pulls landing close could still
be two lucky rolls of the watchmen's placement rather than a class effect.
Worth a `wander`, `good` or `flee` pull on rogue:assassination specifically
(the three styles that have stalled on *other* classes at this exact cell)
before trusting "the class" over "the seed."

Same session, the evening went far past THE VIGIL for the first time in this
job's history: eight distinct chambers across eleven of a twelve-room budget
(`threshold -> vigil -> spire -> westclimb -> oratory -> eastclimb -> mooring
-> rise`), two bosses killed clean under `mash` (Bonegrinder at 400.2s of
play, phase 1; The Last Whisper at 400.1s of play, phase 1), and the first
mid-evening wipe this job has seen happen *inside* an actual boss room rather
than in a travel corridor -- The Skyward Deck, 62s into the pull, phase 2,
`heroHp=0/1530` (the player dead), `aliveParty=9/10`, boss at 63%. That
matters for [[#3]]: `outcome:retry` was tapped on this wipe and it worked
completely normally -- `mode` read `raid` (not `travel`) on the very next
journal line, the room counter advanced (`room n=9/12`), and the retried pull
went on to kill the boss cleanly 400 seconds later. [[#3]]'s own reports have
all been travel-mode wipes (a corridor pack catching the party before a boss
room); this is the first same-job evidence that a *boss-room* wipe's own
PULL AGAIN works exactly as advertised, which narrows [[#3]] toward "travel
wipes specifically," not "wipes in general," rather than broadening it.

The evening ultimately did stop, at a room this line has never named before:
THE RISE, past the door the boss room (`mooring`) let out through. See
*Not yet filed*, below, for the mechanism and why it is not yet a standing
hypothesis.

**2026-09-26, eleventh confirmation, and a mechanism read straight off the
source rather than guessed at.** `mode=walk` (`boss=host`, a coverage label
only), priest:discipline, `wander`, 25-heroic, fresh save, 1280x800 desktop
(`playtest/plans/2026-09-26-46.play`) -- the first `wander`-style evening at
25-heroic (its one prior evening appearance, druid:guardian, was 10-normal)
and the first healer given a `wander` evening at all. THE VIGIL and the
crossing after it both went clean and fast (5.7s, then 30.9s to THE SPIRE),
and Bonegrinder heroic died at fightTime=87s -- but then, after killing it,
the evening spent the rest of its 6-room budget going nowhere: THE SPIRE ->
THE WEST CLIMB crossed forward in 7.8s, but the very next door-to-door hop,
aimed squarely at the one unvisited door (`took=oratory why=unvisited
ways=["oratory@253","spire@50"]`), reported `crossed from=westclimb to=spire`
3.9 seconds later -- backward, into the room it had just left, despite the
driver steering the player at oratory's own centre the whole time. The next
room (back in THE SPIRE, aimed at `eastclimb`) then burned its entire 260s
budget without changing chambers at all (`closestGot=160`), ending the
evening at `fault:fight-outlasted-its-budget` after 5 of 6 rooms.

Read `src/main.ts` before guessing why a crossing would go backward: the room
the evening thinks it is in (`state.chamber`, what `chamber()` and every door
decision in `cross()` are keyed off) is set by `roomUnderfoot()`
(`src/main.ts:994`), and that function tests not the player's own position but
`partyMiddle()` -- the centroid of every living party body. `partyMiddle`'s own
comment, three functions up (`src/main.ts:939`), already describes exactly
this failure for a different check that used to have it: "the raid walks in a
huddle around whoever is leading it, so the huddle's centre trails the player
by most of its own width... driven straight at the Oratory's pad for a
minute, the middle closed to a hundred and twenty-nine units and then settled
at a hundred and fifty-five" -- which is why `padHere()` was rewritten to ask
the player's own body instead. `roomUnderfoot()` was not: it still asks the
huddle. A corridor with packs actually fighting the raid (West Climb's own
watchmen; this run's `crossed` lines counted over a hundred foes still up) is
exactly the case where the centroid lags worst, because bodies peel off to
fight rather than walking, and a lagging centroid reads as the room not
having changed, or -- if enough stragglers are still on the near side of a
shared boundary -- as having changed *backward*.

This gives [[#6]]'s existing shape (stalls at VIGIL, at WEST CLIMB once
before under `idle`, now at SPIRE/WEST CLIMB under `wander`) a mechanism with
a source citation and a proven precedent, rather than "cross()'s fixed
heading" or "an unreachable pad" as the two live guesses. **Not yet the
full answer** -- this run never confirmed the player's own body was actually
past the door while the centroid lagged, which would need a script that reads
`hero()` and a party-position hook side by side while stuck, and no such hook
is in the driver's current vocabulary. Worth one before promoting "the
centroid, not the player, decides the room" from a read of the source to a
measured fact.

**Same session, sharpens [[#1]].** The Bonegrinder-heroic kill above is the
first heroic pull on record where a *healer* under a non-idle, non-good style
carried real raid casualties rather than a clean sweep: `aliveParty=17/25`
(8 dead) at the kill, `heroHp=1350/1350` (the healer itself untouched),
`presses=1079`, `inDanger=3%`. Every prior heroic idle/passive-shaped win on
this line (the two [[#1]] tank/dps cases, the wandering holy paladin at
Bloodgorged) either kept the raid intact or was measured on a different boss
entirely; this is the first time a `wander` healer's own flailing (round-robin
presses with no target awareness, the same blind spot already measured on
Bloodgorged) has been priced in raid deaths on a real heroic kill rather than
in the healer's own missed heals. Consistent with the line's standing
argument -- the body survives regardless of what it does -- but this is the
sharpest case yet of the raid, not the player, paying for it.

**2026-09-26, twelfth confirmation, a third style crossing clean specifically
at 25-heroic, and a much harder stall found downstream of it.** `mode=clear`,
shaman:restoration, `flee`, 25-heroic, carried (behaves as fresh per #273),
820x1180 touch (`playtest/plans/2026-09-26-47.play`). `flee` had stalled THE
VIGIL twice before, both times at 10-normal (priest:discipline and
druid:guardian, both above); here it crossed in about 29 seconds (door at
9.2s, out at 38.4s, `presses=9`) -- a third style, after `good` and `dodge`,
to cross THE VIGIL clean specifically at 25-heroic where four of five styles
tried at 10-normal have stalled. Another point for size/difficulty, not
style, being what actually separates a clean crossing from a stall here.

But the evening did not get away clean: past a Bonegrinder-heroic kill (see
[[#1]]'s new entry above), THE WEST CLIMB stalled for the entire 260s budget
given it, worse than the one other stall this line has on record for this
room -- but read `scripts/playbot.ts`'s `cross()` (line 1283) before crediting
`flee` for it, per this repo's own rule about not guessing what a source
would say. `cross()` steers with one fixed `d.steer()` call per loop and never
branches on `acting`/style at all -- confirming in code what the 2026-09-25
idle-style entry above already established by inference ("corridors ignore
style"). So whatever pushed `closestGot` to 553 (against a
`westclimb`-to-`westclimb` self-loop, `stillAlive=167`) was not `flee`'s own
away-from-boss term; that term only ever runs inside `play()`'s in-fight
branches, which `cross()` never calls.

The comparison to the one other WEST CLIMB stall on record (`nearestDoorGot=12`,
above) also is not the controlled pair it first looks like: that session's own
text says its `carried` save "behaved as fresh per #273's still-open port bug
(setup showed the locked default, 10-normal)" -- it was never actually
25-heroic despite the cell asking for it. So `553` vs `12` compares a real
25-heroic corridor (25 bodies, `stillAlive=167`) against a 10-normal one that
silently downgraded, not two runs of the same size and difficulty. The more
grounded reading, tying back to the `roomUnderfoot()`/`partyMiddle()` centroid
mechanism already read from source this session (above): more raiders in a
bigger, harder pull mean more bodies peeling off to fight rather than walk,
which is exactly what that mechanism says drags the crossing check's own
measure of "closest" (whatever it is keyed to) further from the door. Worth a
`flee` or any other style's West Climb crossing at 10-normal on a save that
has genuinely reached that size/difficulty, and a same-size/difficulty repeat
at 25-heroic under a different style, before trusting 553-vs-12 as anything
more than the size difference this pairing failed to control for.

**2026-09-26, thirteenth confirmation, a second style crossing clean at
25-heroic and the first dps role to do it.** `mode=walk`, hunter:
marksmanship, `flee`, 25-heroic, fresh save, 390x844 touch
(`playtest/plans/2026-09-26-48.play`) -- every prior 25-heroic clean crossing
was a healer (shaman:restoration, above) or steered by a beeline/away-from-
danger term on a tank (`good`, `dodge`); this is the first ranged pure-dps
body to try it, and the first genuinely fresh (not carried-behaving-as-fresh)
25-heroic evening on this axis. Every corridor this evening touched crossed
without a single stall: THE VIGIL in 8.3s total (door to boss-room), then
26s to THE SPIRE, 16s to THE EASTCLIMB, 11s to THE ORATORY -- four crossings,
zero faults, the cleanest run of corridors this line has recorded in one
evening. A second style now confirms clean 25-heroic crossings alongside
`good` and `dodge`, on a fourth spec entirely, which keeps stacking evidence
for size/difficulty over style as the variable that separates a clean
crossing from a [[#6]] stall -- though the West Climb stall two entries above
(same 25-heroic, a different corridor) says the correlation is not absolute
either way, so "cleaner at 25-heroic" reads more true than "never stalls at
25-heroic."

**2026-09-27, fourteenth confirmation, and the "class vs seed" question the
2026-09-26 `mash` entry left open is answered from source rather than by
another repeat.** `mode=clear`, rogue:assassination, `melee`, 25-heroic,
carried (behaves as fresh per #273), 844x390 touch
(`playtest/plans/2026-09-27-7.play`), via the driver-lesson unlock recipe.
THE VIGIL crossed in 24.5s (door at 8.2s, out at 32.7s, `presses=3`) --
within a second of this same class's two 10-normal crossings on record
(`melee` 26s, `mash` 25.9s) despite a fourteen-point jump in difficulty and
a two-and-a-half-times bigger raid. Read `src/sim/classes.ts` rather than
run a fourth repeat: every class has its own flat `moveSpeed`, and rogue's
is 178 -- the highest in the roster, against 158 for warrior/paladin/
priest/warlock, 167 for druid/shaman/mage, and 173 for hunter. `cross()`
steers in a straight line at a fixed target regardless of style (already
established under this line), so a flat speed stat that is highest of any
class explains a consistently fast straight-line crossing directly, on any
size or difficulty, without needing the size/difficulty a stalled cell
happened to be measured at. This settles the specific "not settled" note
from 2026-09-26 -- it is the class, not the seed -- and it means rogue's own
three-for-three clean-crossing record should not be read as further
evidence for "size/difficulty separates clean from stall" the way the
2026-09-26 entries above do, since a faster class would cross clean at
10-normal too by the same mechanism (and, per the two 10-normal entries
already on record, does).

The rest of the evening: Bonegrinder heroic died at `fightTime=56`
(phase 1, `aliveParty=25/25 heroHp=1530/1530 presses=44 inDanger=2%`) --
full raid, full health, the fastest heroic kill this line has logged under
`melee` and a clean sweep on the one boss whose bonestorm aura this job's
own #267 already measured as reversing melee's hits-to-damage ratio at
10-normal. **Not a contradiction of #267, checked against source rather
than assumed:** `byMechanic` carried no `bonestorm` entry at all, but
`src/sim/encounters.ts`'s own `opening` table schedules Bonegrinder's
first-ever bonestorm cast at 47.5s into the pull (`openingTimers`'s own
comment: "every mechanic's first cast, read off a boss's opening table")
-- eight and a half seconds before this kill landed. The storm never got a
second cast (phase 1's own recurrence is 92.5s), so a fast heroic kill
avoiding it here says nothing about melee and bonestorm's own relationship,
only that this particular pull ended before the mechanic had time to bite
more than once. Worth remembering alongside the existing `flight`/`hound`
driver-lessons: check a mechanic's own timing before reading a zero count
as a style (or difficulty) effect. Past Bonegrinder, `spire -> eastclimb ->
oratory` crossed clean and fast too (9s, 11s), and the evening's 5-room
budget ended mid-pull on The Last Whisper at `fightTime=197`, boss at 12%,
`heroHp=1158/1530 presses=41 inDanger=0%`,
`fault:fight-outlasted-its-budget` -- real progress cut short by the
script's own budget, not a stall of [[#6]]'s shape (the fault fired with
the fight still closing on the boss, not parked motionless near a door).
Fourteen open `playtest` issues held the gate shut; nothing filed.

**2026-09-27, fifteenth confirmation, and the first clean crossing that
matches this line's own disprove condition on the letter of it.** `mode=walk`
(`boss=confluence`, a coverage label only), druid:guardian, `good`, 10-normal,
carried (behaves as fresh per #273), 820x1180 touch
(`playtest/plans/2026-09-27-9.play`) -- the exact spec, style, size and
difficulty that opened this line on 2026-09-25 (`wander`/`good`, seed A/B,
both stalling at 259-400s within a dozen units of each other) and that
`flee` stalled a third time on 2026-09-25. No session had run `good` on
this precise cell again since the opening pair. This time THE VIGIL crossed
in about 30 seconds (`10.4s` at the door to `40.6s`, waking The Bonegrinder
directly, `presses=15`) -- the first clean 10-normal crossing this line has
ever recorded under `good` specifically, where every 10-normal `good`/`wander`/
`flee` run before it stalled and every clean 10-normal crossing on record
belonged to rogue:assassination (already explained by its own
above-average `moveSpeed`, not by size/difficulty or style).

This meets the line's own stated disprove condition -- "an evening crossing
THE VIGIL under any of these styles from a fresh save at this size/
difficulty" -- on the same class, style, size and difficulty as the original
stall, with only the seed differing (fresh/carried's `roomSeed` is keyed off
`Date.now()`, per this file's own repeated note). **Narrowed, not
dropped**: fourteen confirmed stalls and clean crossings together already
argued style and class matter less than this file first thought, and the
size/difficulty theory itself had cracks (a West Climb stall at 25-heroic,
a `wander` stall at 25-heroic past VIGIL). This is the cleanest single data
point yet for the reading several 2026-09-26 entries were already leaning
toward: the watchmen's own seeded placement, not any property of the party
crossing them, decides whether a given evening's VIGIL is a corridor or a
wall. The evening carried on cleanly for six more rooms after this --
Bonegrinder and The Last Whisper both killed clean (10/10 alive, `heroHp`
finishing at 4050/4140 after the second kill), a working pad-ride from West
Climb to Mooring (`cross()` choosing `why=toward a lit pad` over the nearer
unlit door, landing exactly on the intended room), and a Skyward Deck pull
still open at 52% boss hp when the script's 8-room budget ran out
(`fight-outlasted-its-budget`, `aliveParty=9/10`) -- the furthest into the
citadel and the first wing boss this job's own evening-mode sessions have
ever put real numbers on. See *Not yet filed*, below, for what the same
session found by pressing the fight screen's own `map` corner button while
that pull was still live.

**2026-09-27, a different failure shape in the same category: past the first
boss, an evening can loop forever between two already-cleared rooms rather
than stalling in one spot.** `mode=clear`, druid:feral, `idle`, 10-normal,
genuinely fresh save, 1280x800 desktop (`playtest/plans/2026-09-27-10.play`,
[[#1]]'s new entry above). THE VIGIL and Bonegrinder both went cleanly
(27s crossing, 84s kill). Past that, the evening crossed `spire -> westclimb
-> spire -> eastclimb -> oratory` without a single fault -- and then, in
Oratory, never engaged The Last Whisper (`encounter: 1`,
`src/dungeon.ts:535-547`, its own boss) at all: no `boss-woken` line for
`oratory` anywhere in the journal. Seventeen seconds after entering the room
it rode Oratory's own pad (lit since Bonegrinder's death, `pad:
killed('spire')`) to Threshold, the only other lit room, then rode
Threshold's pad straight back to Oratory, and the evening's 8-room budget
ran out there: `reached=threshold -> vigil -> spire -> westclimb -> eastclimb
-> oratory`, `wipes=0`, no fault raised at any point.

Read `scripts/playbot.ts:1283`'s `cross()` and `src/main.ts:3033`'s
`asleep()` rather than guess why. `cross()` checks the room's own boss first,
every tick, before ever falling back to a door or a pad -- the fix its own
neighbouring comment (`src/main.ts:3020-3026`) says was written for exactly
this shape ("eastclimb to oratory to westclimb, with the Watcher asleep and
untouched"). But the very first tick standing in Oratory found no match, so
the same tick's fallback fired instead: Oratory's only forward door (to
Mooring) is gated on Whisper being dead and so never appears in `ways()` at
all, every other door was already `been`, and with `padLit()` true the walk
rode the pad on the spot rather than ever stepping toward the boss. The pad
screen's own room list then only ever offered the *other* already-visited
pad room each time (`lit=["threshold"]`, then `lit=["oratory"]` on the
return trip), so the two pads just traded the party back and forth for the
rest of the budget.

**Not yet confirmed which of two things emptied the boss check**: whether
`asleep()` genuinely carried no entry for Oratory's own warden from where the
party was standing (a scoping question about what `travel.corridor.packs`
holds once the party has crossed into a new room), or whether it did and
`cross()`'s single-tick pad decision simply won the race before any step was
taken toward it. `asleep()` is not a hook this vocabulary exposes on its own
(only through `cross()`'s internal use), so telling the two apart needs
either a one-off script that reads `window.__abyss.asleep()` directly while
standing in Oratory, or a hook added for it -- and this is one sighting, not
three, so it is recorded here rather than promoted. What the journal alone
already shows without any further reading: an evening can spend its whole
remaining room budget shuttling between two already-cleared rooms once its
only forward path needs a boss the walk never attempts to reach, and none of
it shows on screen as a fault, a wipe, or a message saying the way is shut --
it reads exactly like ordinary progress, `walked-on`/`took-the-pad` lines and
all, until the budget silently runs out.

**2026-09-28, a third failure shape on the identical cell, this time a hard
budget-out rather than a quiet loop.** `mode=walk` (`boss=gorged`, a coverage
label only), druid:feral, `style=auto`, 10-normal, genuinely fresh save,
1280x800 desktop (`playtest/plans/2026-09-28-16.play`) -- the same
spec/size/difficulty/save/viewport as the 2026-09-27 `idle` entry immediately
above, differing only in style (`auto`, which the desktop fallback plays as
`good`: presses abilities and steers). THE VIGIL and Bonegrinder both went
clean again (crossed at 8.1s/36s, killed at `fightTime=175` of the 300s room
budget, `aliveParty=10/10 heroHp=1575/1575 presses=81 inDanger=1%`) --
matching every prior clean reading of this exact cell.

Past that it diverged from both prior shapes. `spire -> westclimb` crossed
clean (9.3s), but the *next* hop broke differently again: the door log named
`"took":"oratory"` (`ways=["oratory@187","spire@62"]`), yet the `crossed`
event four seconds later read `"from":"westclimb","to":"spire"` -- the
announced target and the room the game actually logged arriving in do not
match, and the room it landed back in is the *nearer* of the two candidate
doors, not the one named "took." From `spire` a second time, the door log
named `"took":"eastclimb"` (`ways=["eastclimb@2025","vigil@1463",
"westclimb@438"]`, eastclimb the *farthest* of the three, picked purely for
being unvisited), and this time nothing arrived anywhere at all for the rest
of the room's budget: `"from":"spire","to":"spire","closestGot":1889` at
`650.3s` -- a crossing whose own source and destination are the identical
room, after the full `300`s allowance, `fault:fight-outlasted-its-budget`.
`after-evening.png` shows why it reads as a stall and not a fight: the whole
visible party (six frames with a value, four reading a flat `0`) stands
bunched in one small cluster in open ground, nothing drawn nearby to fight,
the HUD's own "onward" label reading **"The West Climb"** -- a *third* room
name, matching neither the door log's "took: oratory" nor its later "took:
eastclimb" -- and the minimap corner still reading "137 left in it," the same
building-wide remaining-enemy count this line's own priest:discipline entry
already read off a stalled corridor.

Three sightings now on this identical spec/size/difficulty/save/viewport
cell (`druid:feral`, 10-normal, fresh, 1280x800) share a room ("spire" or its
neighbours) and a mechanism-shaped absence -- style differs each time
(`idle` looped between two already-lit pads; this one names a door,
"crosses" into itself, and silently eats a full room budget) -- but none of
the three ever shows a fault, a wipe or a spread-out fight to blame it on.
**Not filed** (fourteen open `playtest` issues held the gate shut this
session too), and this reads as a further variant of this line's own
mechanism rather than a fourth hypothesis: whatever decides "which door did
we actually arrive through" (the mismatch between a door's own `"took"`
label and the `crossed` event's `to`) is the thing worth reading from source
before the next repeat of this cell, rather than guessing from the journal
alone a second time.

**2026-09-28, a second clean crossing, a different style and spec than the
first.** `mode=clear`, warrior:arms, `dodge`, 10-normal, fresh save, 1280x800
desktop (`playtest/plans/2026-09-28-20.play`) -- the same size/difficulty
every stall on this line has used, and only the second style (after
rogue:assassination's `melee` crossing, 2026-09-25) to cross THE VIGIL
without stalling at all. `9.8s crossed from=threshold to=vigil ...
presses=0` then `41.2s crossed from=vigil to=spire ... presses=6
stillAlive=1 nearest=The Bonegrinder` -- 31.4 seconds door to door, not the
250-400s convergent stall this line opened on. Two clean crossings now
against four stalls, and the two clean runs do not obviously share a cause
either: rogue:assassination/`melee` (beelines) and warrior:arms/`dodge`
(retreats only) have opposite steering, against the stalled runs' own mix of
`wander`/`good`/`flee`/`wander` on druid:guardian/priest:discipline/
mage:frost. Still reads as seed/watchman-placement luck rather than a
property of style, spec or role -- worth remembering this is now two data
points on each side, not four-against-one.

**Driver lesson, not a game finding, from the same run.** The journal read
`41.2s boss-woken room=spire` (a fresh `chamber()` read, per
`scripts/playbot.ts:1528`'s own comment: "the room the fight is in, not the
one the slice began in") but `341.4s boss-down room=vigil` for the *same*
fight -- `evening()`'s `boss-down` line (`playbot.ts:1554`) logs `at`, the
room the slice started the turn in, rather than re-querying `chamber()` the
way `boss-woken` three lines earlier deliberately does. Worth remembering
when reading any evening journal where a boss is fought through a doorway:
`boss-down`'s own `room` field names where the party was standing when the
room's turn began, not where the boss actually died.

**2026-09-28, a third clean crossing, the second at 25-heroic, and the
deepest evening this line has reached with zero wipes.** `mode=clear`,
paladin:retribution, `dodge`, 25-heroic, carried (behaves as fresh per #273),
844x390 touch (`playtest/plans/2026-09-28-29-extended.play`). THE VIGIL
crossed in 31.3s door to door (`8.6s` in, `39.9s` out, `presses=4`) -- close
to the same ~31s the other 25-heroic `dodge` crossing took (2026-09-26,
paladin:protection), a different spec on the same class landing within a
second of the first. The evening then kept going past every stall this line
has on record: Bonegrinder-heroic killed clean (`aliveParty=25/25
heroHp=1800/1800 presses=0`, see [[#1]]'s new entry above for what that kill
itself says), through THE WEST CLIMB with no fault, into The Last Whisper's
room, taken to 26% before the room's own budget ran out -- five rooms
reached, one full boss kill, and not one wipe anywhere in it. The deepest any
`mode=clear`/`mode=walk` session has gotten on this line without [[#3]]'s
retry wall ever firing, because nothing died to trigger it. Three `dodge`
crossings now (10-normal warrior:arms, 25-heroic paladin:protection, 25-heroic
paladin:retribution), zero `dodge` stalls -- worth flagging as the one style
that has never once stalled THE VIGIL, against `wander`/`good`/`flee` each
stalling it at least once.

**2026-09-28, a fourth clean crossing, and a new deepest zero-wipe evening --
this time under `good`, not `dodge`, and on a tank.** `mode=clear`,
druid:guardian, `good`, 25-heroic, carried (behaves as fresh per #273),
820x1180 touch (`playtest/plans/2026-09-28-31.play`). First mode=clear evening
on druid:guardian at 25-heroic (its three prior clear/walk appearances were
all 10-normal) and the first good-style tank pushed through a whole evening.
THE VIGIL crossed door to door in 29.9s (`9.8s` in, `39.7s` out, `presses=15`,
`closestGot=8`) -- a fourth clean 25-heroic crossing against the same four
10-normal stalls this line opened on, and the first under `good` specifically
at this size/difficulty (the only prior `good` reading on this line stalled at
10-normal). Bonegrinder-heroic then died inside the crossing itself, same as
every other clean-VIGIL evening: `fightTime=78 aliveParty=25/25
heroHp=4140/4140 presses=87 inDanger=2%`, full health, nobody down. THE WEST
CLIMB analogue (eastclimb, 9.3s) and a second short corridor (oratory-bound,
12.3s) both crossed with no fault, reaching The Last Whisper's room at 281.6s.

There `good` played its full 220s budget and did not finish: `fight-over`
never fired, `fault:fight-outlasted-its-budget` instead, at `fightTime=217
phase=3 aliveParty=25/25 heroHp=3494/4140 bossHp=21% presses=53 inDanger=12%`
(`bill`: `hits=9 taken=7590 takenPerMin=2090.3 died=false
byMechanic={"decay":2,"volley":7}`). Same room, same budget (220s) as
2026-09-28's paladin:retribution/`dodge` run, which stopped at 26% with
`presses=0` -- `good`'s own presses are the plausible reason it reaches 5
points lower in the same window, since `dodge` does not attack at all. Five
rooms reached, one full boss kill, the whole raid still alive and above 80%
on its own tank, and not one wipe anywhere in it: the deepest this line has
now measured a zero-wipe evening go, on boss-hp-remaining rather than just
rooms-reached. Fifth clean 25-heroic crossing overall counting this and the
`idle`/`dodge`x3 runs already on this line; still zero 25-heroic stalls
against four 10-normal ones, which keeps sharpening this line toward "size or
difficulty, not style," as the axis that actually predicts a VIGIL stall.

**2026-09-29, a same-class, same-size/difficulty split that undercuts both the
speed and the style theories at once.** `mode=walk` (`boss=saved`, a coverage
label only), druid:balance, `flee`, 10-normal, carried (behaves as fresh per
#273), 844x390 touch (`playtest/plans/2026-09-29-9.play`) -- the first evening
this spec has ever walked. THE VIGIL crossed door to door in 29.9s (`8.5s` in,
`38.4s` out, `presses=3`) -- squarely inside the ~30s clean-crossing band every
25-heroic clean run above shares, not the 250-400s convergent stall. The
evening then ran clean through its whole 8-room script: Bonegrinder killed
(`fightTime=182 aliveParty=10/10 heroHp=1485/1485 presses=0 inDanger=1%`), two
more corridors crossed with no fault, The Last Whisper killed
(`fightTime=134 aliveParty=10/10 heroHp=1362/1485 presses=0 inDanger=0%`), and
a final corridor crossed into a ninth room -- zero faults, zero wipes, two full
boss kills, the whole raid untouched, on a body that pressed nothing all
evening (`bill hits=0 hitsPerMin=0`).

Two things this splits apart. First, style: `flee` has now stalled once
(the fourth confirmation above, priest:discipline, 10-normal, mode=clear) and
crossed clean once (this session), so `flee` itself predicts nothing. Second,
speed: druid's `moveSpeed` is 167 (`src/sim/classes.ts:618`) -- identical for
every spec of the class -- and this line *opened* on druid:guardian stalling
at this exact 10-normal tier under `wander`. Same class, same moveSpeed, same
size and difficulty, opposite outcome, different spec and style. Between a
same-speed style split and a same-class same-tier speed split, "seed/watchman-
placement luck" (floated as the alternative back at the fifth confirmation) is
now the explanation with the fewest live counter-examples, not spec, style or
class speed. Not filed -- fourteen open `playtest` issues held the gate shut
-- and this reads as sharpening the existing line rather than a new one: the
25-heroic-vs-10-normal split still holds (five clean 25-heroic runs, zero
stalls) but "why 10-normal sometimes stalls" still has no answer that survives
its own counter-examples.

**Same run, a small and probably-too-small-to-matter complication to #279.**
`ui` on this exact cell (820x1180 touch, druid:guardian's 5-slot bar) reported
`overlapping=["auto / ability:5","auto / ability:4", ...]` alongside the
already-understood ability-vs-ability false positives. #279's own table
computed `auto`'s isolated hit circle as clearing 52px at this viewport, wide
of the 44px floor, and did not check it against its neighbours here. Working
`theme.ts`'s own formulas at 820x1180 (`btnR=25.42`, `autoR*1.3=27.09`,
`btnHit=btnR*1.32=33.55`) puts `autoPos` at `(724.66,1027.26)` and
`ability:4`/`ability:5` (the upper-row pair nearest it) at `(752.62,1079.92)`
and `(696.70,1079.92)` -- both 59.6 units from `autoPos`, against a summed
hit-radius of 60.64. The circles really do overlap, by about one pixel of
radius, and `auto` is checked unconditionally before the ability buttons'
nearest-neighbor contest (`src/main.ts:2717`), so that sliver is a real,
if tiny, dead zone rather than a grid-sampling artifact. Not filed and
probably not worth its own issue even once the gate opens -- a ~1px sliver on
a 27-33px hit radius is far below where a real thumb would ever land on the
boundary -- but worth remembering if a future session ever sees a press near
the top of the ability cluster silently toggle `auto` instead of firing.

**2026-09-29, the same idle/10-normal/fresh cell repeated on a different
class, and the Oratory pad-loop from 2026-09-27 does not reproduce.**
`mode=clear`, warrior:arms, `idle`, 10-normal, genuinely fresh save,
1280x800 desktop (`playtest/plans/2026-09-29-12.play`) -- identical on
every axis (style, size, difficulty, save, viewport, room budget of 8,
200s per room) to 2026-09-27-10's druid:feral idle evening except the
class, run specifically to test whether that session's pad-loop was
something idle triggers or something the seed rolled. THE VIGIL crossed
clean (`8.8s` to the door, `41.9s` total, `presses=0`), Bonegrinder died
inside the crossing at `fightTime=73` full health (`aliveParty=10/10
heroHp=1890/1890 bossHp=down`) -- [[#1]]'s shape holding again, first
warrior:arms idle evening on record. The path past it was the identical
sequence the druid:feral run took, `spire -> westclimb -> spire ->
eastclimb -> oratory`, all four crossings clean and fault-free.

But in Oratory this run diverged completely: `293.6s crossed
from=oratory to=oratory aimedAt=boss:whisper`, 7.9 seconds after
entering the room, followed immediately by `boss-woken` -- where the
druid:feral run's own boss-check never matched at all across the 17
seconds before it gave up and rode the pad. The Last Whisper died at
`fightTime=23` (`aliveParty=10/10 heroHp=1706/1890 bossHp=down`), a
noticeably harder kill than Bonegrinder's -- `inDanger=28%` against `3%`,
and the first real damage (184 hp) an idle body has taken on this
specific room path -- but still a clean win, and the evening then rode
the newly-lit Oratory pad to Mooring correctly (`took-the-pad
from=oratory to=mooring wanted=mooring`), arriving on "THE WAY AHEAD IS
HELD, 9 still standing" with no fault anywhere in the whole run (0
distinct faults, 8/8 room budget used). `after-evening.png` and
`arrive-threshold.png` both read clean, no rendering defect either.

Same style, same cell parameters, same room-to-room path, opposite
outcome on the one room that mattered -- the cleanest evidence yet that
2026-09-27's pad-loop is not something `idle` itself triggers (this run
never walked toward the boss either, and found it anyway) but something
the fresh save's `Date.now()`-keyed `roomSeed` decides per visit, in
line with this hypothesis's own running theory that seed/watchman
placement, not style or class, is what actually separates a clean
crossing from a stall. Does not settle *which* of the two mechanisms
2026-09-27's own read of `asleep()`/`cross()` left open -- this run
simply landed on the lucky side of whatever that mechanism is -- but it
weakens "idle-style is the trigger" specifically, since the one variable
held constant here (style) produced the one outcome that changed. Not
filed -- fourteen open `playtest` issues held the gate shut.

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

**2026-09-26, sharpened by the first healer-role battleground pull and the
first genuine-touch `auto` attempt on any battleground.** Every prior
battleground session on this line was a DPS spec (priest:shadow, hunter:
marksmanship, shaman:elemental, druid:feral, warlock:destruction, druid:
balance); `playpick` gave `map=flags` (Ebb and Flow), `spec=druid:
restoration`, `style=auto`, `844x390,touch`, carried (behaves as fresh per
#273) -- the first healer this line has put on any battleground, and the
first `style=auto` battleground pull on a real touch viewport (the only prior
attempt, 2026-09-25's druid:feral, was 1280x800 desktop and silently fell
back to `good` before the movement question ever came up). `hud.auto`
genuinely flipped `false` -> `true` after the tap in all three runs this
session (`playtest/plans/2026-09-26-29.play` through `-31.play`), confirming
the toggle answers here.

What it bought was close to nothing. `auto` never steers (the same driver-
vocabulary gap already noted above for the daily-mode restoration shaman), so
the healer stood at its opening position all match, and the action bar shows
why that is fatal for this spec specifically: `healing_touch`/`rejuvenation`/
`swiftmend`/`starsurge` spent nearly the entire match reading `"range"` --
out of range of anyone to heal -- because nothing it targets holds still on
this map. The cleanest single number is from `-31.play`: `power` sat at
`1000/1000`, completely untouched, through the first 80 seconds of the match,
while the party dropped from 5/5 to 3/5 around it -- eighty seconds of a
healer that would have cast on the first tick something came into range, and
nothing ever did. All three runs ended the same way regardless: the player
itself died (`-29.play` ~83s, `-30.play` ~127s after one mid-match
revive-and-redie cycle, `-31.play` ~89s), each time with `byMechanic={}` --
nothing to blame it on but standing still.

**Not a clean instance of this line's own disprove-by-`good` condition, and
not primarily a game finding** -- a real player has a second thumb free
specifically so this does not happen (README's own words: "the other thumb
is about position, which is the half of the game the screen is actually
showing"), and the driver's `auto` style has no positioning logic at all,
unlike `dodge`/`good`/`melee`. What it still shows cleanly, and for the
first time on any battleground: even a body that is actively *trying* to
act -- ability ready, mana full, an ally presumably needing it somewhere on
the map -- gets reduced to the same zero-output shape every purely passive
style on this line already produces, because nothing here carries a
stationary body toward the fight the way [[#1]]'s raid AI carries an idle
one. Worth a `good`-style restoration druid on the same map before
concluding anything about the class rather than the driver's own positioning
gap.

**2026-09-26, sharpened by the second `melee`-style ranged spec and the
first `melee` pull on this map.** `playpick` gave The Long Haul (escort),
shaman:elemental, `melee`, 820x1180 touch, carried (behaves as fresh per
#273). The only other `melee`-style battleground pull on record is a
marksmanship hunter on Ebb and Flow, also a ranged spec forced into melee
range, which read `hitsPerMin=0` for the whole match. This one matched it
exactly: `2026-09-26-42.play`'s three chunks (`bill` after each) all read
`hits=0 hitsPerMin=0`, the player died at fightTime~14s and the cart
(`Corvin`, the map's own contested-progress reading) swung from 85% to 53%
back to 97% while `aliveParty` fell from 5/5 to 3/5 by fightTime 46s --
consistent with three of five actually fighting and two (this body, and
whichever else) not. Second ranged spec, second map, same shape: `melee` is
not a hypothesis about a player who plays badly, it is a hypothesis about a
player who cannot deal damage at all with this kit, and that has now been
shown twice without ever isolating whether a *melee-capable* class under
`melee` style would fare differently on a battleground. Worth a `melee`-style
warrior or rogue on either map before trusting "melee style loses" as
evidence about battlegrounds rather than about pairing a ranged kit with a
beeline-to-target steering algorithm.

**2026-09-27, complicated by the first passive-style death this line has ever
recorded, on the one map with a mechanic that specifically hunts a passive
body.** `mode=battleground`, `map=flags` (Ebb and Flow), `spec=mage:frost`,
`style=flee`, 844x390 touch, carried (behaves as fresh per #273) --
checked against every `.play` under `playtest/plans/` before committing:
the first `flee`-style pull on this map (its three priors were all conquest
or escort) and the first mage on any battleground at all
(`playtest/plans/2026-09-27-14.play`). Every `flee`/`dodge` pull on record
before this one -- three of them, two maps -- read `hits=0 taken=0` for the
entire match, untouched start to finish. This one did not: `bill` read
`taken=0` at fightTime=57s, `taken=1064 takenPerMin=521.6` (`heroHp`
241/1305) at fightTime=122s, and the player was dead by fightTime=140s
(`heroHp=0/1305`, `fault:not-a-number` firing the same way a raid wipe
does), `presses=0` throughout -- the first death this line has ever
recorded on a body that never pressed anything.

The mid-match screenshot (`mid2.png`) shows why: a dashed blue ring drawn
around "You" specifically, which `src/render/draw.ts:976-988`'s own comment
says is drawn "over [the carrier], where the eye is already looking" --
the player had become a flag carrier. Read `src/sim/battleground.ts` rather
than guess how, since `flee` never presses anything and a raid never asks a
player to opt into carrying something: `updateFlags`'s dropped-flag branch
(line 934) hands carrier status to whoever is simply standing within
`FLAG_PICKUP` of a flag on the ground, no press or intent required, and
`CARRIER_SPEED=0.82`/`CARRIER_FRAGILITY=1.25` (the file's own comment:
"a carrier is slower and takes more, which is what turns 'kill the carrier'
from a suggestion into something that happens") apply automatically the
instant that happens, whether or not the carrier has any intention of
running it home. `flee`'s own steering only ever moves away from whatever
is nearest and threatening -- it has no notion of "you are carrying
something" or "drop it" or "the friendly base is a destination" -- so once
the pickup happened by proximity alone, the penalty stacked for the rest of
the body's life with no way for this style to answer it.

**Not a clean instance of anything on this line, and not filed regardless
(gate shut)** -- this is the one battleground mechanic built to make
standing near the wrong spot costly regardless of what a body presses,
which cuts the other way against [[#7]]'s own shape rather than confirming
it: a passive body is not free here the way it is on conquest/escort, but
only because an *automatic, no-input* pickup turned it into a bigger target,
not because playing passively stopped working on its own. Worth a same-map
`dodge`/`idle` pair before trusting this as "flags punishes passivity"
rather than "flags punishes whichever body wanders over a dropped flag,
active or not" -- the mechanism has nothing to do with `flee` specifically
once the pickup happens, only the pickup itself does.

**2026-09-28, closes the melee-capable-kit question, and corrects a stale
misreading of `hud().boss` on this map that this line has carried since the
day it opened.** `mode=battleground`, `map=escort` (The Long Haul),
`spec=paladin:protection`, `style=melee`, 844x390 touch, carried (behaves as
fresh per #273) -- the first melee-capable kit (a tank, with a real melee
weapon) this line has given `style=melee` on any battleground; both priors
(hunter:marksmanship on Ebb and Flow, shaman:elemental on this same map)
were ranged casters, which left open "worth a melee-style warrior or rogue
on either map before trusting 'melee style loses' as evidence about
battlegrounds rather than about pairing a ranged kit with a beeline-to-
target steering algorithm." Two independent pulls of the identical cell
(`playtest/plans/2026-09-28-9.play`, three chunked `play melee 90` calls;
`-9-respawn-check.play`, a one-`play`-then-bare-poll follow-up run to settle
a stuck-looking death) answer it: a melee-capable kit changes nothing. Across
both pulls the player pressed an ability four times total while alive (1 in
the first pull, 3 in the second) and connected zero of them --
`hits=0 hitsPerMin=0` in every `bill` window either run produced, same shape
as both ranged-spec priors.

The first pull's chained `play` calls read the player dead from `fightTime`
27s clear through 67s (`heroHp=0/2745 alive=false`, ability bar `locked`),
well past `RESPAWN_LATE=11` -- worth checking before trusting as a real stall,
per this file's own *Tried and dropped* precedent (three prior "stuck death"
reads on this exact job, all resolved as the chained-`play` abort-on-death
sampling gap). The follow-up settled it a fourth way: one `play melee 40`
call to get the tank killed, then nothing but bare `wait`/`state` -- dead at
27.5s, alive again with a full ability bar by 37.7s, squarely inside
`RESPAWN_EARLY=6`/`LATE=11`. Not a new stall; a fourth confirmation of the
same driver artifact, now on a tank spec.

**The real correction:** this line's own 2026-09-25 escort entry read
`hud().boss`'s falling-then-rising hp on this map as "the contested cart's
own progress," but a `bossOrNone`/`RED_NAMES` read on a different map 22
lines later in this same file already had the right answer and was never
reconciled against it. Reading `src/sim/state.ts`'s `createBattlegroundState`
(406-438) settles it for good: every battleground, `escort` included, seeds
five real actors onto the red side with `id: BOSS_ID..BOSS_ID+4` and names
them off `RED_NAMES = ['Corvin', 'Sable', 'Thane', 'Ember', 'Grimsby']`;
`bossOrNone` (`src/sim/combat.ts:115`) returns whichever actor holds
`BOSS_ID`, which is always `red[0]` -- literally "Corvin," a specific enemy
player with his own hp pool, not a cart. `hud()` (`src/main.ts:2910`) exposes
only that one actor's `name`/`hp`/`maxHp`/`x`/`y` -- there is no cart-progress
field anywhere in it, and `bg.carts` (`src/sim/battleground.ts:660`) is a
wholly separate structure `hud()` never reads. So every `bossHp` reading this
line has logged on `escort` was Corvin's own health rising and falling from
being hit and healed by his own team, the same as on every other map, not a
tug-of-war meter -- the "56% -> 97%, pushed back, nearly reversed" language
in the 2026-09-25 entry describes a real enemy getting topped up by a healer,
not a cart rolling backward. This does not change any prior entry's numbers,
only how they should be read; the 2026-09-25 line is superseded rather than
struck, per this file's own convention for an overturned guess.

That correction also sharpens what `melee`'s steering (`want = boss.x-hero.x,
boss.y-hero.y` when `far>4`, `scripts/playbot.ts:952`) is actually doing on a
battleground: it beelines the player, alone, at one specific named enemy's
raw coordinate -- ignoring the other four red bodies and every teammate --
which is a real reachable target, not a marker with no meaning attached to
it. That a melee-capable tank still never landed a hit before dying twice at
~27s says the zero-connection shape was never about kit-vs-range at all: a
solo beeline at one enemy's coordinate through open ground, with no notion
of the other four bodies who can reach the player first, gets a body killed
before arrival regardless of what it is holding. Not filed -- fourteen open
`playtest` issues held the gate shut -- and this closes [[#7]]'s own
2026-09-26 open question rather than opening a new one: `melee` does not
work on a battleground for any kit, and the reason is the steering's own
blindness to the other four enemies, not a class mismatch.

**2026-09-28, closes the "good-style healer" open question the 2026-09-26
auto-healer entry left standing, and extends the "good dies almost
immediately" shape to a healer.** `mode=battleground`, `map=flags` (Ebb and
Flow), `spec=shaman:restoration`, `style=good`, 844x390 touch, fresh save (the
first non-carried healer this line has put on any battleground) --
`playtest/plans/2026-09-28-14.play`, with two follow-ups
(`-14-respawn-check.play`, `-14-extended.play`) to settle what the chained
`play` calls looked like they were showing. The 2026-09-26 auto-healer entry
above left an open question: "worth a `good`-style restoration druid on the
same map before concluding anything about the class rather than the driver's
own positioning gap" -- `good` is the one style whose steering actually moves
toward a target, unlike `auto`. The answer is not "it heals better once it can
move": it dies before that question can even be asked. The first pull's `bill`
read `hits=0 hitsPerMin=0 taken=1523 takenPerMin=5900-6300 died=true
byMechanic={}` from `fightTime=14.5s` onward, and the player was still reading
`alive:false` at `fightTime=45s`, three chained `play good` calls later --
looking, on its face, like a stuck respawn.

A bare-poll follow-up (one `play good 20`, then pure `wait`/`state`, per this
file's own *Tried and dropped* method) settled it a fifth way: dead at 16.2s,
still dead at 21.3s, alive again by 26.3s (872/1485, bar reading `"range"`),
dead again by 36.4s, alive again by 51.5s (1270/1485, bar reading `"ready"`)
-- both revivals squarely inside `RESPAWN_EARLY=6`/`LATE=11`, the same clean
recovery every prior confirmation of this artifact has shown, now on `flags`
and on a healer under `good` specifically. A third script
(`-14-extended.play`) showed the sharper edge of the artifact itself: three
chained `play good 60` calls issued back-to-back while the player was already
dead at call-start each returned in under a second of wall-clock time,
advancing the simulated clock by only a couple of ticks each -- `play()`
does not merely miss a revival between samples, it appears to return almost
immediately when `hero()` already reads null at the call's own start, which is
why a chain of such calls can read "dead" for far longer than any one
`RESPAWN_LATE` window without anything in the game actually being stuck.

But the death itself is the real finding: `hits=0 hitsPerMin=0` in every
`bill` reading across both pulls, despite the bar reaching `"ready"` briefly
after each revival -- this healer never got a single heal off before dying
again. `fightTime` of first death (14-16s across the two pulls) lands in the
same 9-16s band as every prior `good`-style battleground death already on
this line (druid:feral/flags ~15s, warlock:destruction/escort ~13s,
druid:balance/conquest ~9s) -- a fourth spec, and the first healer, in that
band. The `pulled.png` screenshot shows a likely mechanism: the whole 5-body
party spawns clustered directly on top of Corvin's own position (a large "3"
countdown ring drawn right over him), and `good`'s beeline-at-`hud().boss`
steering (already read from source in the 2026-09-28 escort entry) walks
whatever body holds it straight into that cluster with no notion of how
fragile it is. A healer with real steering does not fare any better than the
three DPS specs already measured this way -- the shape this line already had
("`good` dies almost immediately on a battleground") turns out not to be
about role at all.

Findings with nowhere to go yet: either the issue gate was shut when they turned
up, or they have only been seen once and once is an observation. A line here
either becomes an issue, gets promoted to a standing hypothesis, or goes to
*Tried and dropped* with the reason.

**2026-09-26, held, gate shut, a new stall shape and a new fault.** The
[[#6]] evening above (rogue:assassination, `mash`, 10-normal, fresh,
820x1180 touch, `playtest/plans/2026-09-26-32.play`) got further than any
prior evening -- past two boss kills and a boss-room wipe-and-recover -- and
then stopped for the first time in a room this line has never named: THE
RISE, past THE MOORING. First `scripts/playbot.ts`'s own pad-approach
(`pad()`, line 1241) failed to reach the room's teleporter inside its 60-
second budget and logged a fault this job's journals have never carried
before: `fault:could-not-stand-on-the-pad
{"at":"rise","pad":{"x":3356.12,"y":-11401.07}}`. `cross()`'s fallback then
tried the ordinary door-steering path instead (`"why":"toward a lit pad"`)
and also failed to close the distance in the room's full 400-second budget --
`closestGot=50`, ending 400 units from where it started -- so the evening
declared `fault:fight-outlasted-its-budget {"room":"rise", ...}` and stopped
at 11 of its 12-room budget. The screenshot (`after-evening.png`) shows the
exact shape every VIGIL/West Climb stall has shown: the whole ten-body party
clustered together and untouched near a landmark (a pair of tall pillars),
full green health bars, the damage meter reading `1 You / raid 0`, `662s` on
the clock, nothing happening.

Read `pad()`'s own code before guessing: it walks a straight line at the
pad's raw coordinate with no obstacle awareness at all, the same
blind-beeline shape `cross()`'s own door-steering already has (the mechanism
[[#6]] has been narrowing toward all session). So this could be the same
class of thing -- a straight line from wherever the party happened to be
that a hazard or a gap in THE RISE's own ground sits across -- or it could be
a genuinely unreachable pad, and only one pull has ever reached this room to
say. Fourteen open `playtest` issues held the gate shut; worth a repeat evening
that reaches THE RISE by a different route or class before filing, since a
single pull is what [[#6]]'s own history says not to trust yet, and worth
checking `src/dungeon.ts`'s own entry for `rise` first per this repo's
`docs/reading-the-source.md` rule, rather than guessing further from one
screenshot.

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

**2026-09-26, confirmed a second way -- `p` shares the bug exactly, and a
second, unconfirmed anomaly turned up alongside it.** Same cell
(`mode=menus`, 1280x800 mouse, carried), no prior session had tried the
undocumented `p` binding specifically (only `Escape`). `open` -> `tap
settings` -> `key p` -> `tap back` -> `tap raid` -> `tap next` -> `tap
class:mage:frost` -> `tap pull` (`playtest/plans/2026-09-26-34.play`,
`/tmp/pt-34`) reproduced the identical shape: `tap pull` returned
`screen=roster mode=travel`, never `fight`; `state` showed the evening
already moving underneath (`chamber:"threshold"`, ability bar `"range"`);
the screenshot (`after-pull.png`) shows PICK YOUR CLASS still on screen with
the button reading "WALK IN -- 10 player normal" and the green line
underneath already reporting "The Threshold -- nothing left alive in it". A
second `tap pull` on the same stuck screen, appended to the same script
and re-run, recovered normally into `screen=fight`. `p` and `Escape` are the
same defect, not two.

Chasing the recovery run further turned up something this note cannot yet
explain: re-running the *entire* script from `open` (not a second tap in the
same session -- a fresh `playbot` invocation, a different port, a different
travel-mode seed, confirmed by the journal's own `seed=` line differing
between runs) had `tap raid` land straight on `screen=roster mode=travel`,
skipping the raid-setup screen entirely, and `tap pull` immediately returned
`outcome=wipe` at `chamber=vigil` -- an evening that had already been walked
into THE VIGIL and lost, with no setup screen, no class pick and no pull
ever knowingly pressed by the script for it. The DEFEAT screen
(`playtest/plans/2026-09-26-34.play` rerun, second invocation) matches
[[#3]]'s already-documented shape exactly. This is not #273's port-collision
mechanism -- the two invocations used different ports (5312 and 5447) and
different seeds, which #273's own test already treats as proof of separate
origins with no shared `localStorage`. Two follow-up controls on fresh
invocations -- `open` -> `tap raid` alone, and `open` -> `tap settings` ->
`tap back` -> `tap raid` with no key press at all -- both showed the normal
setup screen (`playtest/plans/2026-09-26-35-control.play`,
`-36-control2.play`), isolating the trigger to the `p` press specifically.
But a third attempt at the exact same sequence that produced the anomaly
(`open` -> `tap settings` -> `key p` -> `tap back` -> `tap raid`,
`-37-repro.play`) came back normal on the very next try. One anomalous run
out of two attempts at the identical script is not yet a finding -- it reads
as wall-clock timing jitter in when the stale flag gets consumed relative to
the `raid` tap, the same class of thing this file already documents for
heroic pull outcomes, but on a screen transition instead of a boss timeline.
Not filed regardless (gate shut) and not promoted to a standing hypothesis --
worth a repeat that captures `says`/`state` on every intervening frame if it
turns up a third time, before trusting a mechanism rather than a coincidence.

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

**2026-09-28, resolved: confirmed a driver artifact, not a game bug.**
`mode=menus`, 820x1180 touch. `docs/playtest.md`'s own "go around the
vocabulary" allowance used for the first time on this specific question: a
one-off Playwright script
(`playtest/plans/2026-09-28-27-share-clipboard.mjs`) started its own `vite`
on a fixed port outside `playbot`'s own 5200-5500 range, opened a plain
(non-persistent, so nothing under `playtest/profile` was touched) context
with `permissions: ['clipboard-read', 'clipboard-write']` granted at
creation — the one thing `scripts/playbot.ts` never does and cannot be
asked to do from a `.play` script — and tapped the exact box a same-viewport
`targets` call had just read (`share@476,1132 120x40`,
`playtest/plans/2026-09-28-27-probe.play`).

With real clipboard permission, the button read **COPIED** (`after.png`,
against `before.png`'s plain `SHARE`) and `navigator.clipboard.readText()`
immediately afterward returned the exact text `gameMessage()` builds:
`"Abyss — a raid boss, or five people who would rather you left\nhttp://127.0.0.1:5900/"`
— no bosses-killed line, correctly, since this was a fresh, non-persistent
context with an empty `bests` record, matching `gameMessage()`'s own "a
player who has done nothing yet claims nothing" rule. This closes the
question the 2026-09-25 note left open: given the permission a real phone or
desktop browser actually has, `share()` works exactly as `README.md`
describes. `NO LUCK` in every prior session's reading was `scripts/playbot.ts`
never granting clipboard access, not a defect in `src/share.ts`. Nothing to
file — moved here as the resolution rather than left as an open question.

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

**2026-09-27, sharpened by actually pressing RESET through, rather than
reading its two-press shape off `main.ts`'s own comment.** `mode=menus`,
820x1180 touch, carried (behaves as fresh per #273): rogue:assassination,
`evening good 300 2` to kill Bonegrinder 10-normal (`run.cleared.length`
now 1, the precondition RESET needs to even appear), then `tap minimap` ->
`tap map` to reach the citadel with a real down-count on it
(`playtest/plans/2026-09-27-18.play`).

The two-press arm is real and disarms the way the code says: `citadel-clean.png`
shows the button reading `RESET`; one tap on it (no other state change --
`state` is identical before and after, this screen carries no hook for the
arm flag) turns it to `PRESS AGAIN` in the same red outline
(`citadel-armed.png`); an unrelated `tapxy 30 30` on empty map background
turns it back to `RESET` (`citadel-disarmed.png`) -- confirming live, for
the first time, `main.ts`'s "every other press on this screen disarms it."
Arming it again and pressing it through did not stop on this screen at
all: the very next journal line reads `screen=fight mode=travel
outcome=ongoing chamber=threshold hud={"time":0.133,"tick":4,...}` --
no confirmation dialog, no stop on `citadel` or `home`, straight into a
brand-new evening's first room (`citadel-after-reset.png` is not a citadel
screenshot at all; it is THE THRESHOLD, "186 left in it," a full fresh
roster). That broke this script's own trailing `tap back`/`tap raid`
lines (`fault:no-such-control`, twice) since neither control exists on a
fight screen -- a script mistake, not a game one, but worth remembering:
RESET's confirm press lands the player in the fight itself, not back on a
menu.

**This changes the shape of the finding, not just its evidence.** The
2026-09-25 note above reads as "the screen is missing the control README
promises." Having now pressed it through: RESET's actual function *is*
exactly what README describes for GIVE UP -- it ends the evening and puts
the next one at the door, instantly and without ceremony. The gap is
narrower than "missing a feature": the control that does this is named
RESET rather than GIVE UP, only exists once something is down, and
*restarts the rung from scratch* rather than merely closing out the
current sitting (so a player who has cleared four rooms and wants to stop
for the night without losing them has no control that does that -- only
one that keeps their progress by leaving it be, or one that throws it all
away and starts the rung over). Separately, and newly measured: `main.ts`'s
own comment on the arm step promises it is "what prints how many rooms are
about to stand again," and it prints nothing of the kind -- the subtitle
line (`"10-man normal — 1 down, 1 rooms entered — locked for 2 more days"`)
is byte-identical across `citadel-clean.png` and `citadel-armed.png`; the
only visible change anywhere on arming is the button's own label. Still
**held, gate shut** (fourteen open `playtest` issues, unchanged this
session) -- file once it reopens, with both this session's script and
2026-09-25's, and lead with the sharper claim: not an absent GIVE UP, a
RESET that already does GIVE UP's job under the wrong name, with a promised
preview that never draws.

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

**Confirmed a third way, 2026-09-26.** The assigned cell this session
(`mode=battleground`, `map=escort`, `spec=shaman:elemental`, `style=melee`,
820x1180 touch, carried) produced the identical shape on a third spec and
style: `2026-09-26-42.play`'s chained `play melee 90` calls read
`hp=0/1440 alive=false bar=[...locked]` across three samples spanning
fightTime 14s to 46s -- 32 seconds looking stuck. A dedicated bare-polling
follow-up on the same cell (`2026-09-26-43-respawn-check.play`, one `play
melee 15` to force the death, then `state` every 5s with no further `play`)
died at fightTime~17s and was back to `hp=1440/1440 alive=true` with a fresh
ability bar by the very next sample at fightTime~22s -- a clean five-second
respawn, inside `RESPAWN_EARLY=6`. Third spec (druid:feral, warlock:
destruction, now shaman:elemental), third confirmation of the same
mechanism: this artifact is the chained-`play` sampling gap, not a
respawn bug, on any spec or style tried so far.

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

**2026-09-26, confirmed a fourth way, and the first inside `evening`.**
`mode=walk`, druid:feral, 25-heroic (`playtest/plans/2026-09-26-40.play`, see
[[#1]]'s new entry above for the numbers). `cross()` still steers every
corridor itself regardless of style, so the gap only ever shows once a room's
own boss wakes and `play()` starts reading `auto` -- confirmed again here: a
melee dps standing ~207 units off the boss for an entire fight, dealing
single-digit hitsPerMin. Same mechanism, fourth context (raid, daily,
battleground, now evening) and fourth class shape (caster dps, healer, healer,
now melee dps) -- nothing left to learn from a fifth confirmation of the same
missing movement policy; further sessions should spend an `auto` cell on
whatever the assigned spec/mode is and simply note the shape holds, rather
than re-deriving the mechanism each time.

**2026-09-29, a fifth confirmation, and the first case where the gap works in
the class's own favour.** `mode=clear`, hunter:marksmanship, 25-heroic, carried
(behaves as fresh per #273), 820x1180 touch (`playtest/plans/2026-09-29-7.play`)
-- the first `mode=clear` evening this job has ever given hunter:marksmanship
(its two priors were both `mode=walk` single-corridor coverage labels under
`flee`) and the first `auto`+`clear`+25-heroic reading on a ranged spec rather
than the one prior melee reading (rogue:assassination, 2026-09-28-17.play).

THE VIGIL crossed clean in 25.8s (hunter's own `moveSpeed` 173, second-fastest
in the roster per [[#6]]'s own reading), then Bonegrinder-heroic woke
immediately. The first pull nearly killed it solo-standing: wiped at
`fightTime=141` (phase 3) with the player itself the death (`heroHp=0/1620`)
but the boss down to 4% (`bossHp=4%`), `aliveParty=24/25` -- the closest an
`auto` pull has ever come to a kill on the first attempt anywhere on this
line. `outcome:retry` worked normally and the second pull killed clean:
`fightTime=59`, `aliveParty=25/25`, `heroHp=1620/1620` (full health),
`presses=0` throughout both pulls. Past that, two more corridors crossed
clean (9s, 12.3s) into The Last Whisper heroic, where `auto` again did real
work: `fight-outlasted-its-budget` at `fightTime=197` with the boss at 54%
and the whole raid alive (`aliveParty=25/25`, `heroHp=1366/1620`), not the
near-zero-progress shape every melee/caster `auto` reading on this line has
shown.

Read `src/render/hud.ts:1748-1753` rather than guess why a body that never
moves did this well: marksmanship's own `distance` HUD widget
(`` `+${bonus}% AT RANGE` ``) grants up to +35% wherever the kit already
rewards standing 150-330 units from the target, scaling with the gap
(`(gap-150)/180`, clamped to 1, times 35) -- a real, intentional class
mechanic (confirmed on screen, `end.png` reads "+35% AT RANGE" in green on
both shots), not a bug. `auto`'s own steering gap (already established: it
never sets a `want` vector at all, so the body stands wherever the pull left
it) has, on every prior class tried, meant standing somewhere the boss's own
demands do not reward -- melee out of range, casters in the open. Here the
pull's own opening position already sits inside marksmanship's own reward
band, so the identical "never moves" defect that starved every earlier `auto`
reading instead parks this class inside its own damage bonus for free.

**Not a disproof of the driver-lesson's own shape** ("auto never steers"
still holds, confirmed again by `presses=0` and the player's own position
never changing) -- but it is the first case where that gap helps rather than
hurts, and it means a future `auto` reading's hits/damage numbers should be
read against the specific spec's own positioning demand before being treated
as evidence about "auto" uniformly, the same caution this file already
applies to `hound`/`flight` timing. Driver lesson, not filed as a game finding
(gate shut at fourteen open issues); `scripts/playbot.ts` is outside what this
job may touch.

**2026-09-29, a sixth confirmation, and the free ride does not survive the
very next boss.** `mode=walk`, `boss=marrow` (a coverage label only -- the
walk starts at the door same as any other), hunter:marksmanship, `auto`,
25-heroic, carried (behaves as fresh per #273), 844x390 touch
(`playtest/plans/2026-09-29-24.play`) -- the first `auto`+marksmanship
reading inside an actual evening (multiple rooms and corridors) rather than
a single `mode=clear` sitting, and a direct answer to the caution the entry
above ends on: read a spec's own positioning demand against the room, not
against "auto" in general.

THE VIGIL crossed clean in 25.6s (`presses=3`) -- a further confirmation of
[[#6]]'s "25-heroic crosses clean regardless of style" pattern, now
unsurprising after a dozen-plus confirmations, not written up there again.
Bonegrinder-heroic woke immediately after and died clean at `fightTime=86`,
`aliveParty=24/25`, `heroHp=1620/1620` (full health), `presses=0
inDanger=4%` -- the fifth entry's free ride repeating on the same boss this
line has now seen it on twice. Two more corridors crossed clean into The
Last Whisper heroic, and there the shape inverted completely: the room ran
out its full 240s budget at `fightTime=237`, boss at 43%, `aliveParty=24/25`,
`heroHp=1050/1620` (65%, so the body was taking real damage, just landing
none), and `bill` read `hits=1 hitsPerMin=0.3 taken=3129 takenPerMin=790.8
byMechanic={"volley":1}` -- one landed ability in nearly four minutes.
`end.png` (zoomed) shows why: the distance widget read `+0% AT RANGE`, not
the `+35%` the fifth entry's Bonegrinder pull found, and `state`'s own ability
bar (`steady_shot`/`serpent_sting`/`aimed_shot`) read `status:"range"` --
`src/sim/combat.ts:1317`'s out-of-range block -- at both the opening check
and 237 seconds later. Two different range gates, both failing at once:
`src/render/hud.ts:1751`'s bonus needs `dist(player,target) > 150` and the
ability's own cast needs `gap <= ability.range + target.radius`, so a fixed
opening position can land a marksmanship body in the gap between them --
too close for the standing-still bonus, still too far to swing -- and
`auto`'s own no-steering defect (established above) means nothing ever
closes it. The whole fight's damage board shows the cost directly: 28th of
25-ish ranked bodies at 14 dps, last on the board.

**Sharpens [[#1]] rather than [[#6]]'s or the fifth entry's own line**: the
raid did not wipe, and did not even come close (`aliveParty` held at 24/25
the whole evening, same as the Bonegrinder pull) with the one body in the
room contributing one landed hit across an entire boss encounter --
another instance of this line's own shape (a body doing nothing does not
cost the raid), this time produced by `auto`'s driver gap rather than a
style choice, and on the very next room after the same spec/style pairing
looked like it had found a systematic advantage. The fifth entry's own
reading was positional luck specific to Bonegrinder's fixed engagement
point, not a marksmanship-plus-`auto` synergy -- worth remembering before
crediting `auto` with "working" on a spec again without checking the
specific room's own geometry first. Driver lesson, not filed as a game
finding (gate shut at fourteen open issues).

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

**2026-09-26, held, gate shut, a real bug measured by source geometry as well
as by the journal.** The [[#1]] idle/good pair above (`-28.play`, `good`,
victory on The Bloodgorged 25-heroic, 390x844 touch) surfaced a second thing
on the way: the instant the boss died, `state` read `screen=roster` (the
class-pick screen, "PICK YOUR CLASS") rather than the fight screen's own
end-of-fight overlay -- no KILL banner, no damage/healing board, no "OPENED"
tier line, nothing -- even though the script never issued a `tap` after `play
good 200` finished (only `state`/`shot`/`says`/`bill`). The companion `idle`
pull, run identically apart from style, stayed on the fight screen with its
WIPE overlay exactly as expected (screenshot `ending.png`, `/tmp/pt-27`), so
this is not a mode/chamber quirk shared by both -- `state` showed
`chamber:null` in both journals, so this is a standalone raid pull reached by
the usual invite-hash recipe, not an evening room.

`scripts/playbot.ts`'s own `ability()` never journals its presses (by its own
comment: "a four-minute fight is a thousand presses and the interesting
number is the count"), so the exact tap that did this is not directly in the
log -- but the geometry explains it without needing to guess further. On this
exact viewport (390x844, portrait, touch), `src/render/theme.ts`'s
ability-button layout (`btnR=17, btnX=359, btnGap=37.4, btnBottom=801,
row=32.5`) puts ability slots 4 and 5 at `(340.3, 768.5)` and `(302.9,
768.5)`; `src/render/hud.ts`'s `outcomeButtons(next=true)` (three buttons,
since a fresh-save gorged kill opens the next tier) puts the `party`/CHANGE
PARTY button at `x:264-378, y:743.6-797.6` on the same viewport -- both
ability points sit inside that rectangle. `main.ts`'s own fight-update code
(`if (state.outcome !== 'ongoing' && tap) { const hit = hitOutcome(...); if
(hit === 'party') { screen = 'roster'; ... } }`) runs on any tap once the
outcome is no longer `ongoing`, with no check for whether the tap was actually
meant for the overlay. `good`/`mash`/`melee`/`learn` all call `d.ability()`
every tick or so; `idle`/`dodge`/`flee` never do -- exactly the styles that
have shown this and the styles that have not.

So: on this viewport, an ability press that lands in the same frame a fight
ends in victory can be read as a tap on CHANGE PARTY and silently skip the
entire report -- the banners, the damage board, the "OPENED" line -- straight
back to class-select, for the one outcome (a kill worth reading) the screen
exists to show. A real player mashing an ability right as the boss dies would
hit this exactly the same way, not just a driver. Not filed -- fourteen open
`playtest` issues held the gate shut this session -- but worth a repeat with a
deliberately late ability-press timed against a kill, and a check of whether
the same overlap exists at other touch viewports, before filing once the gate
reopens.

**2026-09-26, first true `mode=raid` pull of The Confluence this job has ever
run.** The boss id had appeared once before (2026-09-25, `mode=daily`), but a
daily's `boss` label is unreachable and that session's actual daily turned out
to be The Two Flasks -- so every number here is new. `spec=druid:restoration`,
`style=mash`, 10-normal, fresh, 390x844 touch
(`playtest/plans/2026-09-26-41.play`). Worth the read first: `docs/upkeep.md`'s
own "raid rewarding play" table has Confluence at played=72%/idle=18%, a +54
gap in *playing's* favour -- the opposite direction from nearly every entry on
[[#1]], and `src/sim/boss.ts`'s own comment says why: this is "the one boss on
this roster whose demand is not about where the raid is standing... it asks
about the geometry between the fight's own bodies" (an `infection` mark that
must not be allowed to end up near another one).

Wiped at 84.2s with the boss at 23% (a 77% pull), three of ten dead including
the player itself (`aliveParty=7/10`, `heroHp=0/1440`), `presses=308
inDanger=82%`. `bill`: `hits=9 hitsPerMin=6.4 taken=2088 takenPerMin=1487.3
byMechanic={"spray":2,"infection":6,"engulf":1}` -- only nine mechanic hits
total, so the death reads as raid/boss-melee attrition piling up under a
healer that could not out-heal it, not a single dodgeable mistake. `says`
caught the mechanic's own vocabulary for the first time: "Carrying — taking it
wide" (an infected body correctly walking off, matching the source comment
that infection should never be dragged toward another mark) and "It is eating
them — swap before eight" (a numeric countdown before a merge, not yet seen
written down anywhere in this file). Not a clean instance of anything on
[[#1]] -- `mash` is not `idle` or `good`, so this cannot disprove or confirm
that line -- but it is suggestive in the opposite direction every other entry
there points: an active-ish style still lost most of the raid and the fight,
on the one boss the harness's own numbers already say rewards playing well.
Worth an `idle`/`good` pair on this specific boss before it goes further --
if `idle` loses here too (plausible, since nothing about the fight favours
standing still) this would be the second boss on record, after gorged's
fester mechanic, where the roster's usual shape flips.

The end screen also reproduced the already-tracked `DOWN`-text-over-report
overlap (#275's family) a fourth way -- a WIPE at normal difficulty, not a
heroic KILL -- exactly as the 2026-09-25 note on this same issue already
confirmed happens on every outcome, not just heroic kills. Not commented
again; nothing new about the mechanism.

**2026-09-26, held, gate shut, a third under-44px control found by source
math as well as by `ui`.** First `mode=menus` session honestly labelled
`save=fresh` -- every prior menus session (2026-09-24-9, -19, -30,
2026-09-26-1, -10, -24, -34) passed `--profile playtest/profile`, but #273
already showed a carried run only ever sees its own invocation's port, so
every one of those was actually playing a fresh origin without the ledger
saying so; this is the first to skip `--profile` outright and the first
`mode=menus` session on a desktop/mouse viewport with no carried-desktop
history to compare against a genuinely fresh one
(`playtest/plans/2026-09-26-44.play`, 1280x800, `/tmp/pt-44`). The front
page, raid setup (both dropdowns read `1/2`, matching a fresh save's single
open rung), settings, RECORD (`0 pulls . 0 kills`, `nothing pulled yet`),
DAILY and BATTLEGROUND setup screens all matched `README.md` and prior
reports; the front page's SHARE still read `NO LUCK` (already-known CDP
clipboard-permission artifact, not filed).

What is new: `ui` on the settings screen flagged `camera:3 40x52` under the
44px floor (`under44=["camera:3 40x52"]`, `journal.jsonl:25`) -- the same
seven-button camera-zoom row #282 already covers for a stale README (four
steps described, seven built), but nobody had run `ui` against that row and
read the `under44` field before. Read `src/render/menu.ts`'s own layout math
rather than trust one viewport's rounding: `settingsLayout()`'s `spread()`
divides a row of width `w = min(340, L.w - 2*pad())` into `ZOOM_NAMES.length`
(7) equal buttons with a fixed 6px gap between them -- `cw = (w - 6*6) / 7`.
`w` caps at 340 on every viewport wide enough to matter (anything much past
360px), so `cw = (340 - 36) / 7 ≈ 43.43px`, under 44 by construction, for
all seven buttons, not only the one `ui` happened to round down this run.
The screenshot (`settings.png`) shows why only one got flagged in practice --
antialiasing/rounding puts some right at the 44px edge and only the
narrowest label ("IN", the default step) under it on this exact run -- but
the source math says the whole row is built one pixel-and-a-bit under the
floor the rest of the game holds to, at `docs/playtest.md`'s own "facts
rather than taste" standard. Distinct from #276 (fight-screen corner
buttons) and #279 (the AUTO toggle) -- a third screen, a third control,
same floor. Fourteen open `playtest` issues held the gate shut at session
start (unchanged); file first thing once it reopens, with this script and
the `settings.png` shot, and reference the `cw≈43.43` derivation alongside
the live `under44` reading so the report does not rest on one run's
rounding alone.

**2026-09-27, driver lesson, not a game finding, and the first `mash`-style
battleground pull this job has run.** Read `scripts/playbot.ts`'s own movement
branch before running the cell (`mode=battleground`, `map=conquest`,
`spec=druid:balance`, `style=mash`, 844x390 touch, carried), same as the
existing `auto` driver-lesson note above did: `mash` is not among the
`dodge`/`good`/`melee`/`wander`/`flee`/`learn` branches that ever set `want`, so
it never steers at all -- it only presses an ability every tick, round-robin,
same press logic as `wander` minus `wander`'s own random heading. Confirmed
live rather than trusted off the read: the player never moved from its pull
position the entire match (`me.x/y` absent from every `state` line but the
boss/cart-progress reading `Corvin` walked from `(1028,-68)` to `(-14,-232)`
relative to it while the player's own ability bar read `"range"` on every
offensive slot at every one of four checkpoints, 4.5s through 183.2s, without
ever once clearing). 595 presses total (`354+241+0` across three `bill`
windows) connected with literally nothing: `hits=0 hitsPerMin=0 taken=0
byMechanic={}` in all three, `heroHp=1485/1485 inDanger=0%` unbroken start to
finish. The match still ended `outcome=defeat` at `fightTime=171` -- short of
conquest's own 300s clock, meaning the other side reached the point cap while
this body contributed to neither offense nor defense.

**Why this reads differently from every prior `mash` ledger line.** Every
earlier `mash` pull on record is `mode=raid`, where the walk-in already stands
the player within range of the boss before a fight starts, so round-robin
presses land regardless of whether `mash` ever steers (`The Two Flasks`,
warrior:arms: `hits=556 hitsPerMin=315.7`). A battleground has no such walk-in
-- README's own conquest description is "hold ground," which is somewhere on
the map, not at the spawn -- so the one style whose driver code has never had a
reason to steer is the one style a battleground was always going to expose.
**Not the same finding as [[#7]]'s own flee/dodge entries**, which press
nothing on purpose and read as a deliberate hypothesis about a player who only
avoids; this is a body trying to fight (595 presses, an ability queued
every tick) that cannot, because the vocabulary that presses buttons and the
vocabulary that decides where to stand never overlap for this one style. Not
filed -- gate shut, and the mechanism is entirely inside `scripts/playbot.ts`,
outside what this job may touch -- but worth remembering before reading any
`mash`-style battleground bill as a finding about the fight rather than about
this gap: it will read `hits=0` on every map, the same way `auto` does, unless
`mash` is given the same kind of steering term `dodge`/`good` already have.

**2026-09-27, held, gate shut, a real mismatch confirmed by pressing the
thing rather than reading it off the source.** `mode=menus`, `view=1280x800`,
`save=carried` (which #273 means this played as a genuinely fresh, honest
desktop/mouse session). This exact view/save pair had been hit twice before
(2026-09-26T05:00, T18:45), both chasing the Escape/`p` key bug; the
composition ("THE RAID") screen had been opened and its trade rule exercised
once (2026-09-26, battleground version, #titlecheck session) but no session
had ever pressed a spec tile specifically to provoke a legality refusal on
the raid's own composition screen and watch what the screen looked like
right before the tap.

README's "Getting in" section states the caps are enforced visually: "a
third tank or a fourth healer cannot be selected on the party screen at
all — the entry is drawn locked." Reading `src/render/composition.ts`'s
`drawComposition` first: every spec tile in the picker is drawn by the same
loop with the same `tile()` call, and the only per-tile state is `chosen`
(a highlight on the currently-picked one) — there is no locked/disabled
visual branch anywhere in the file, and `hitComposition` answers every tile
identically regardless of whether picking it would be legal.

Confirmed live: reached a fresh 10-man roster already sitting at the
tank cap (`Nara`/warrior and `Pike`/druid, "2 tanks · 2 healers · 6 damage"),
opened the player's own dps slot, and pressed a tank spec
(`spec:warrior:protection`). The tile looked exactly like every other tile
before the press (screenshot `compose-slot0-open.png`) and exactly like every
other tile after it (`compose-after-3rd-tank.png`) — nothing dims, nothing
locks, nothing changes about the tile itself. What changes is the note line
underneath the summary, which switches from "what does You play?" to a red
"10 fields at most 2 tanks" — `compose.ts`'s `refusal()` message, drawn only
*after* the tap, not a pre-emptive lock. A second tank spec
(`spec:paladin:protection`) on the same open slot produced the identical
shape. The slot itself never changed (confirmed by dismissing and reading
the board back unchanged). So the mechanism README describes (a locked
entry, visible before you press it) and the mechanism the code has (a
uniform tile, a refusal sentence after) are different things, and the
screen a player is actually looking at is the second one. Falls under
`docs/playtest.md`'s "a menu that says something untrue about the game
behind it." Fourteen open `playtest` issues held the gate shut all session;
file once it reopens, with `playtest/plans/2026-09-27-4.play` and the three
screenshots (`compose-slot0-open.png`, `compose-after-3rd-tank.png`,
`compose-dismissed.png`).

**2026-09-27, seen once, not reproduced, not a finding.** While running the
above script the *first* time (same cell, `--profile playtest/profile`), the
composition board read back completely different after `tap dismiss` than
it had before the picker was ever opened — every non-player slot's class and
spec changed (`Bastion` from `H Priest Heal` to `D Rogue`, `Nara` from
`T Warrior Tank` to `H Paladin Heal`, and so on), while the role *counts*
held at "2 tanks · 2 healers · 6 damage" throughout and the action log showed
only `tap slot:0`, two refused spec presses, one faulted `tap slot:2` (no
click reached the page), and `tap dismiss` — no `reroll`, no `auto`, nothing
that source-reading says should touch `composing.party`. Three follow-up
scripts built to isolate it — the identical tap sequence with and without
`--profile`, one with only a single refusal, one with the exact fault
included — all read the board back byte-for-byte unchanged after dismiss.
One sighting against three clean non-reproductions is not a cell by this
file's own standard (`docs/playtest.md`'s "a thing seen once is an
observation"); recorded rather than chased further, in case it recurs on a
`--profile` run specifically (the one condition that differed between the
sighting and two of the three failed repros) and becomes worth a fourth
attempt.

**2026-09-27, held, gate shut, a real bug found by pressing a documented
control mid-fight rather than reading it off the source.** Same session as
[[#6]]'s new clean-VIGIL entry above (`playtest/plans/2026-09-27-9.play`),
continued past the evening itself: with The Skyward Deck still an open pull
(`mode=raid outcome=ongoing`, boss at 52%, 9/10 party alive), pressed the
fight screen's own corner `map` control (`src/main.ts:2303`'s
`walkingAnEvening()` gate, visible in the screenshot `after-evening.png`
next to `party`/`settings`) for what the journal shows is the first time any
session has tapped it while a boss fight was actually live rather than
mid-corridor. It worked exactly as `main.ts` says -- `screen` became
`citadel` -- but two things followed that no report has caught before.

**The fight does not pause.** `state` read `hud.time=198.4` the instant
before the tap and `hud.time=199.5` on the very next `state` call taken
*from the citadel screen*, with the boss's own hp reading 65,674 then
65,264 across the same gap -- the encounter kept simulating a full second
behind the map with no way to act on it (`citadel-view.png` shows the live
pull's own sprites and health bars rendered faintly in the background,
mid-fight, under the room graph). A player who checks the map out of
curiosity during a pull is not pausing to look, they are standing in the
fight blind for however long they read it.

**And `tap back` did not return to the fight.** `targets` on the citadel
screen read `["room:oratory","room:threshold","back","reset"]` (`reset` is
`GIVE UP`'s own control id, confirming README's map description down to the
button that ends a run) -- correct and unsurprising on its own, since
`mooring`, the room the live pull is actually in, is not a valid pad
destination while its own fight is unresolved. But pressing `back`
(screenshot `after-back.png`) landed on `screen=home` -- the ABYSS front
page, RAID/BATTLEGROUND/TODAY'S RUN tiles and all -- not back on the fight,
even though `state` read `mode=raid outcome=ongoing chamber=mooring` with
the same live boss hp on the very same line. The run is still there by the
state the hook reports; what a player actually sees after pressing the one
button the map screen offers to leave it is the front page, with nothing on
it saying a Skyward Deck pull is still open two menus back. Not filed --
fourteen open `playtest` issues held the gate shut all session -- but this
reads as more than a `mode()`-style semantic gap ([[#2]]): a real player who
taps `map` mid-pull, reads it for a few seconds, and taps `back` is handed a
menu that looks like nowhere they were, with an unwatched pull still ticking
behind it. Worth checking on the next session whether pressing RAID from
that state resumes the live Skyward Deck pull (per #273/#281's own port
caveats) or drops it, before writing the fix this deserves -- and whether
the same non-pause holds for the corner `map` button reached outside an
evening's own travel mode, since this session only ever pressed it during
one.

**2026-09-27, held, gate shut, the open question above answered: it drops
it.** `mode=menus`, `820x1180,touch`, `carried` (#273 means this played
fresh). First attempt (`playtest/plans/2026-09-27-11.play`, frost mage,
`idle`) never reached a live pull at all -- THE VIGIL's watchmen caught it,
it wiped twice, and `outcome:retry` landed it in [[#3]]'s own already-tracked
stall (`fault:evening-stuck {"at":"vigil","after":"wipe","rooms":3}`, a
seventh-plus confirmation, first one reached from a `mode=menus` script
rather than `clear`/`walk`). That did answer a smaller, adjacent question
cleanly, though: from that stuck wipe screen, `tap map` -> `tap back` ->
`tap raid` landed right back on the identical stuck `screen=fight
mode=travel outcome=wipe chamber=vigil` state, byte-for-byte the same `hud`
reading -- so RAID from home does not silently discard a *stuck* run either;
it resumes exactly what was there.

The real question needed an actual `ongoing` pull, so the second attempt
(`-12.play`) used rogue:assassination (the class whose own flat `moveSpeed`
[[#6]]'s own entries already read as the reason it crosses THE VIGIL
cleanly) under `good`, with `evening good 60 3` -- a per-room budget short
enough that Bonegrinder 10-normal (never finished under 84s by any style on
record) would still be mid-fight when `evening` handed back control. It
worked exactly as aimed: `fault:fight-outlasted-its-budget` fired with the
boss at 47% (47,600/101,200 hp), phase 2, `aliveParty=10/10`, a live enrage
timer ticking (`enrage 183s` on screen, `mid-evening.png`) -- an honestly
`ongoing` pull, not a stall or a wipe.

`tap map` (after `tap minimap` to reveal the corner group, the same route
`leaveFight()`'s own comment documents) moved to `screen=citadel` with `state`
still reading `mode=raid outcome=ongoing chamber=spire`, and the boss kept
dying underneath it exactly as the prior session's own reading predicted:
hp read 46,493 on the citadel screen, down from 47,600 the instant before the
tap, and the player's own hp kept falling too (1215 -> 1134 -> 1023) purely
from standing in the fight's own hazards while the map was up. `tap back`
landed on `screen=home` (the ABYSS front page) with `state` still reading the
same live `mode=raid outcome=ongoing chamber=spire`, boss hp unchanged since
the last sample -- confirming the front page itself is just another menu
sitting over a fight that has not stopped.

Then `tap raid` -- the one press this whole thread has been building to.
`state` immediately afterward read `screen=fight mode=travel outcome=ongoing
chamber=spire hud.time=0.067 tick=2 phase=1 boss=null`. Not a resume: the
boss is gone entirely (`boss: null`, where the line before had a name, an hp
and a maxHp), phase reset from 2 back to 1, `hud.time` reset from 58.2s to a
fraction of a second, and `mode` itself flipped from `raid` back to `travel`
-- the exact shape of a room nobody has fought in yet. The screenshot
(`after-raid-retap.png`) confirms it without needing the numbers: no boss
health bar across the top at all, "THE SPIRE / onward — The Vigil / 9 still
standing" printed on screen -- the same room-entry banner a party sees
walking in cold, not a live pull resuming. The party itself survived (still
10/10, hp intact from where the fight left it), but the pull's own progress
-- 53% of Bonegrinder's health, an enrage clock already at 183s of however
long it runs -- is simply gone, to be fought over again from a fresh phase 1
whenever the party walks back up to the boss.

This is worse than a wipe, not a cosmetic gap: a wipe at least tells the
player something went wrong and costs the pull on purpose (README's own
promise). Here nothing failed -- ten of ten alive, boss below half health,
no wipe screen, no message -- and checking the map is what erased it. Not
filed, fourteen open `playtest` issues holding the gate shut all session; a
strong candidate for the first slot once it reopens, with both scripts
(`-11.play`'s stuck-wipe control case and `-12.play`'s live-pull drop) and
the three screenshots (`mid-evening.png`, `citadel-mid-fight.png`,
`after-raid-retap.png`).

**2026-09-27, sharpened by the first tank spec `mash` has ever been given on
a battleground, and the first time this line has separated "a passive body"
from "the specific role that body vacated."** `mode=battleground`,
`map=conquest`, druid:guardian, `mash`, fresh save, 1280x800 desktop
(`playtest/plans/2026-09-27-19.play`). `mash` had already been shown, from
source, to have no steering branch at all in `scripts/playbot.ts` -- it never
leaves its own pull spot on any map, which the one prior `mash` battleground
pull (2026-09-27-2, druid:balance/carried/touch, same map) confirmed live: a
DEFEAT at 171s, 236-400, the player's own damage row blank the whole match.
This session repeats that shape on a tank instead of a dps, and README's own
"Battlegrounds" section says why that is not just a repeat: a battleground's
five roles are an exact trade, one tank/one healer/three damage, so picking
the tank spot does not add a sixth body standing off to the side -- it means
the team's *only* tank is the one that never engages.

The match ended in DEFEAT at 153s, **126-400** -- eighteen seconds faster and
110 points worse than the dps-`mash` pull's 236-400 loss on the identical map
and style. The end screen (`mid2.png`) shows the shape: "You" (guardian) reads
`Out of range` with every column dashed (0 dps, 0 hps, 0 taken, 0 mechanics),
exactly like the prior dps pull's blank row, but three of the four remaining
bodies are dead (Vale, Kestrel, Wren, all `died` timestamps under 46s) against
one healer (Bastion) left alive at 560 hp -- a worse casualty count than the
dps-`mash` pull's own three-of-four-dead reading reached only by the full
171s. **Not a controlled pair** (viewport, touch and save state all differ
between the two pulls, and `roomSeed`/rock layout is rolled per entry per
README's own "Battlegrounds" section), so this is one comparison, not a
mechanism proven from source the way `mash`'s own lack of steering already
is -- but it is the first data point this line has that losing the specific
role a passive body vacated costs more than losing an interchangeable one,
where every prior #7 entry treated "which role" as incidental to "presses
nothing." Worth a second tank-spec `mash` pull, ideally matched on viewport
and save state to the 2026-09-27-2 pull, before promoting "losing the tank
specifically is worse" from one comparison to a sharper claim. Gate held shut
at fourteen open `playtest` issues; not filed.

**2026-09-28, a confirmation rather than a complaint: README's "Getting
better at it" section, tested end to end for the first time.** `mode=menus`,
820x1180 touch, carried (behaves as fresh per #273). Every prior menus/carried
session that opened RECORD found it empty (`0 pulls . 0 kills`), because
#273's port-per-invocation bug means a `carried` save never actually survives
between two separate `playbot` calls -- but nobody had checked whether it
carries correctly *within* one invocation, across two real kills, which is
the whole premise the comparison line and personal-best banners need to prove
themselves at all. This session did: a direct `mode=raid` pull
(`open #b=marrow&s=10&h=0`) of Bonegrinder 10-normal, killed with
`good`/warrior:arms, `tap outcome:retry` for a second identical pull, killed
again, then `key Escape` -> `tap back` -> `tap record`
(`playtest/plans/2026-09-28-4.play`, `-5.play`; two earlier attempts,
`-1-probe.play` through `-3.play`, mistimed the retry tap against a boss
still finishing off residual DoT and are kept as the record of that mistake).

The first kill's screen (`kill1.png`) carried only the four fixed
first-pull banners (First Blood, Nobody Fell, Inside Two Minutes, Nobody Left
Standing) and no comparison line at all -- matching README's own "a trend
needs two kills to have a direction, so it says nothing until there are two."
The second kill (`kill2.png`, `fightTime=106` against the first's `105`) read
**"0.9s slower than your last kill — 2 kills on this one"**, plus two
personal-best banners neither pull could have earned on its own: **"CLEANEST
KILL — The Bonegrinder on 16 mechanic hits, down from 23"** and **"YOUR
BIGGEST PULL — 7.8k damage, past 7.0k"** -- both comparing directly against
the first kill's own numbers, silent on the first kill exactly as README
says a first recording should be. Opening RECORD afterward, still the same
invocation, read `2 pulls . 2 kills . your best 79 . raid best 191` with
both kills' full damage/healing boards listed correctly and in the right
order (most recent first). Every piece of this system that this job has
never been able to test end-to-end -- because every previous read was either
a cold profile or a single kill with nothing to compare against -- worked
exactly as documented on the first real attempt. **Not a bug, and not a
standing hypothesis**; recorded because a core, never-verified claim from
`README.md` turning out to be true the first time it was actually tested is
itself worth knowing, the same way this file already records confirmed-not-a-
bug readings (the VIGIL overlay note, the emoji-lock-glyph note, above).

The already-tracked banner/report overlap (#275/#283's family) reproduced on
both kill screens (the four first-pull banners over the damage-board header
on `kill1.png`; the personal-best banners over the same header, and `DOWN`
over the `Vale` row, on `kill2.png`) -- not commented or filed again, both
issues already open and this adds nothing new about the mechanism.

**2026-09-28, a third shape: not "presses nothing and survives" and not
"beelines in and dies fast," but dies once anyway and then leaves the match
for good.** `mode=battleground`, `map=escort` (The Long Haul),
priest:discipline, `style=wander`, carried (behaves as fresh per #273),
820x1180 touch (`playtest/plans/2026-09-28-19.play`) -- checked
`sessions.jsonl` first: every prior battleground cell used
`dodge`/`flee`/`melee`/`good`/`auto`/`mash`, so this is the first `wander`
pull on any battleground, and the first healer under it.

The body died once, at `fightTime=54` (`FAULT not-a-number` at 59.6s cut the
first `play wander 90` short at `seconds=56`; the second `play` call aborted
almost immediately too, `seconds=0` -- both are the already-documented
"Tried and dropped" driver artifact, chained `play` aborting while
`hero()===null`, not a new finding). That death lands nowhere near every
`good`-style battleground death this line has on record, all in a 9-16s band
from spawning clustered on the enemy actor Corvin -- 54s is three to six
times later, and `mid1.png` shows why it is a different mechanism: the "DEAD"
body is off to one side, not inside the visible melee scrum by the cart, with
a hazard ring and a `DOWN` callout on a different party member nearby (cart
progress 20%/20%, `4 v 3`). `wander`'s round-robin ability presses and
twelve-step random headings are neither `good`'s beeline into the cluster nor
`flee`/`dodge`'s retreat-only logic, so a death this much later, in a
different place, is consistent with "wanders into *something*, eventually"
rather than either of #7's two established shapes.

What happened after respawn is the new part. By the third checkpoint
(`fightTime=154`, of the map's 300s cap), the body was back at full health
(`heroHp=1350/1350`) but `mid3.png` shows it alone, isolated, with `Out of
range` printed over it and every damage/heal slot on the bar reading
`"range"` rather than `"ready"` -- the cart bars read 31% (own side) against
71% (enemy), both `held`, meaning neither side currently has anyone standing
with either cart. `bill`'s `hits` stayed at 0 for the entire tracked match and
the healing-per-second board (`mid1.png`) credited "You" for only 14 hps
before the death, nothing after. Unlike `mash`/`auto` on a battleground,
which read the same zero-output shape from a documented absence of any
steering branch in `scripts/playbot.ts`, `wander` *does* steer -- it simply
steers at nothing in particular, so a healer under it can die once from being
in the wrong place and then wander somewhere even more wrong for the rest of
the match, contributing less than `flee`/`dodge`'s untouched-but-useless
bodies (which at least never die) and dying later and differently than
`good`'s beeline-into-Corvin bodies (which at least tried).

**Not a controlled comparison** -- one pull, rocks and the enemy roster are
rolled fresh per entry per README's own "Battlegrounds" section, and the
match never reached a result inside this script's window (still `ongoing` at
154.3s of 300s when the script ended). Worth a second `wander` pull on either
map, and a `good`-style healer pull for comparison (every `good` pull on
record so far has been a dps or a tank), before this reads as more than one
data point for a third shape. Gate held shut at fourteen open `playtest`
issues; not filed.

**2026-09-28, the `good`-style healer pull the line kept asking for, and it
answers with a sharper claim than "healers die too."** `playpick` gave
`map=conquest` (The Three Cairns), `spec=druid:restoration`, `style=auto`,
1280x800 desktop, fresh (`playtest/plans/2026-09-28-28.play`) -- desktop means
`isTouchMode()` gates AUTO off exactly as it did for the 2025-09-25 feral
druid, and the journal confirms the fallback fired three times
(`no-such-control want=auto`, `no-autocast-toggle ... playing good instead`),
so this cell is the `good`-style restoration druid the 2026-09-26 entry above
asked for -- just on a third map (conquest) rather than a repeat of flags.

It died at `fightTime=9` (`bill`: `hits=0 hitsPerMin=0 taken=1584
takenPerMin=10759.2 died=true byMechanic={}`), one press landed
(`presses=1`) before `heroHp=0/1440`, `aliveParty` down to 4/5.
`mid1.png` shows why: the body is inside a red hazard ring with a `-58` tick
and a `DOWN` callout on another party member in the same ring, 8.6s into the
match -- a beeline into the opening scrum, same as every other `good` death
on this line.

The sharper part is the number itself: 2026-09-26's `good`-style
druid:balance pull on this *same* map also died at `fightTime~9s` (line
above). Two different roles -- a healer casting `healing_touch`/
`rejuvenation` and a boomkin casting `starsurge` -- on two different kits,
under the identical style, on the identical map, dying at the identical
second. That is a tighter match than role or kit can explain by coincidence,
and it reframes the 2026-09-26 `melee` entry's open question ("a hypothesis
about a player who cannot deal damage... not yet isolating whether a
melee-capable class would fare differently"): the common factor across every
`good` death this line has now recorded is not the kit, it is conquest's own
opening geometry -- something at or near this map's spawn that punishes
closing distance in the first ~9 seconds regardless of who is doing it. Set
against the flags touch-`auto` healer above, which stood still and lived to
`fightTime` 83-127s doing nothing: on a battleground, moving toward the
fight killed a healer roughly ten times faster than standing still did,
which is [[#1]]'s raid shape ("doing nothing wins") but sharper here, because
this line already has the *reason* nothing beats acting on a raid (the AI
carries an idle body) and battlegrounds have no such carry -- so the same
outcome here is not evidence of the same mechanism, it is two different
mechanisms that happen to reward the same non-input. Worth a `good`-style
pull on conquest with a melee-capable spec before trusting "the map's opening
geometry" over "any style that closes distance dies here"; not filed, gate
held shut at fourteen open issues.

**2026-09-29, a second `flee` pull on flags, this time with a melee-capable
kit, and the carrier death from 2026-09-27 does not reproduce.** `playpick`
gave `mode=battleground map=flags spec=warrior:arms style=flee view=
844x390,touch save=carried` (behaves as fresh per #273) -- the first
warrior:arms pull on any battleground (eleven priors covered druid x4,
shaman x3, hunter, mage, paladin, priest x2, warlock, never a warrior), and
only the second `flee`-style pull this line has ever run on Ebb and Flow.
Three chunks of `play flee`, summing past the map's real 180s limit (#278)
on purpose: `presses=0 inDanger=0%` throughout, `bossHp` (actually the
tracked enemy `Corvin`'s hp, per this map's own `hud().boss` misreading)
drifting 74% -> 98% -> 100% as the driver simply lost and regained proximity
to whoever was nearest. Unlike 2026-09-27's mage:frost, this body never grew
the dashed flag-carrier ring -- `mid2.png` shows the ring around the
*dropped flag itself* ("1 in to 2"), with the player's own green ring
well clear of it -- and it never took the `CARRIER_FRAGILITY` spike that
killed the mage. `bill` read `taken=0` at fightTime 57s and 122s and only
`taken=215 takenPerMin=71.7` by the 180s whistle, `died=false` throughout,
finishing at `heroHp=1675/1890` (89%). The match still ended
`outcome=defeat`, `Ebb and Flow · 180s · 1 - 2` (`mid3.png`), with four of
the other five party frames reading dead on the end board (`Vale died 9s`,
`Kestrel died 22s`, `Wren died 32s`, `Bastion died 35s` -- relative death
clocks per this line's own established reading of these boards, not first
deaths).

This is the same-map `flee` repeat the 2026-09-27 entry asked for (it asked
for `dodge`/`idle` specifically; this substitutes a second `flee` pull with a
different, melee-range kit) and it comes out on the side of "flags punishes
whichever body wanders over a dropped flag, active or not" rather than
"flags punishes flee": same style, same map, no carrier pickup this time,
ordinary passive-survives shape (chip damage instead of a fatal spike,
consistent with [[#7]]'s other `flee`/`dodge` entries). **Not a controlled
comparison** -- rocks and the enemy roster are rolled fresh per entry per
README's own "Battlegrounds" section, and whether this body crossed a
dropped flag's `FLAG_PICKUP` radius at any point is a matter of where the
flag happened to be sitting, not something this script measured directly.
Worth a same-map `dodge`/`idle` pair, as originally asked, before closing
this question; not filed, gate held shut at fourteen open issues.

**2026-09-29, `mode=menus` at an actual phone viewport for the first time,
and a second confirmation of the camera-row under-44px defect, now on a
touch device rather than a mouse.** `playpick` gave `mode=menus,
view=390x844,touch, save=carried` (behaves as fresh per #273). All sixteen
prior `mode=menus` sessions ran at 820x1180,touch or 1280x800 desktop --
390x844 and 844x390, the two viewports that actually match a phone, had
only ever carried a single fight (#279) or the bare front page (#266)
through this axis, never the deep menu screens. This session walked raid
setup, the difficulty dropdown, classpick, composition (including an
individual slot tap), THE CITADEL map (reached the same way as
2026-09-25's first citadel session: walk in, `tap map`), the battleground
setup and composition screens, settings, and credits, all at 390x844
(`playtest/plans/2026-09-29-5.play`, `--out playtest/out/2026-09-29-5`).
Zero faults. Every screen's `ui` reading came back `offGlass=[]`, and the
screenshots (`citadel-narrow.png`, `compose.png`, `bg-setup-narrow.png`,
`settings-narrow.png`) all read clean and legible at this width -- the
layouts described throughout `README.md`'s "Getting in" section hold down
to a real phone's narrowest common width, not just the wider touch profile
(820x1180) every prior menus session happened to use.

The one live measurement that was not clean: `ui` on settings flagged
`camera:1 40x52` under the 44px floor (`under44=["camera:1 40x52"]`) --
the same seven-button camera-zoom row the 2026-09-26 entry above derived
from source math (`settingsLayout()`'s `spread()`: `cw = (340 - 36) / 7 ≈
43.43px`, under 44 by construction on every viewport wide enough for the
row to hit its 340px cap, which includes this one). That entry's only live
`under44` reading was on a 1280x800 desktop/mouse viewport, where the
44px touch floor is arguably academic; this is the first time the same
row has read under44 on a genuine touch viewport, where it is not. Two
different buttons flagged in practice (`camera:3` at 1280x800,
`camera:1` here) across two different viewports, exactly the
antialiasing-noise-around-a-universal-defect shape that entry predicted.
Not filed -- fourteen open `playtest` issues held the gate shut -- but
this sharpens rather than duplicates the existing hold: file the source
derivation together with both live readings (1280x800 desktop and this
session's 390x844 touch) once the gate opens, so the report does not rest
on either run's rounding alone.

**2026-09-29, the second `wander` pull this line has ever run, first time on
conquest, and the first `wander` battleground pull to actually reach a result
screen.** `playpick` gave `mode=battleground map=conquest spec=priest:shadow
style=wander view=1280x800 save=fresh` (`playtest/plans/2026-09-29-8.play`).
The only prior `wander` pull (2026-09-28-19, escort, priest:discipline,
carried) died once at `fightTime=54` and then drifted `Out of range` for the
rest of the match, but the script ended with the match still `outcome=ongoing`
at 154.3s of the map's 300s window -- nobody had actually seen how a `wander`
pull *resolves*.

This one resolved, and cleanly: the priest never died at all. `heroHp` stayed
at `1350/1350` through the first 90s chunk and was still `1272/1350` (94%) at
the `outcome=defeat` result 158s in -- `bill`'s running `taken` never passed
78 across the whole match (`takenPerMin=29.6` by the end). `mid1.png` shows
why: `Out of range` printed center-screen at 87.5s, and the `state` json's own
`bar` reads `"range"` on all four offensive slots (`mind_flay`,
`shadow_word_pain`, `mind_blast`, `shadow_word_death`) -- 739 presses total
across the two `play wander` calls (`presses=427` then `312`), essentially all
of them thrown at nothing in range. The end-of-match board (`mid3.png`)
confirms the shape numerically: `You` (Priest) posted `dps=4`, `taken=78`
against `Vale` (Mage) `dps=78 taken=4.8k`, `Bastion` (Mage) `dps=44
taken=8.7k`, `Wren` (Druid) `dps=24 hps=14 taken=22k` -- the wandering body
was two to three orders of magnitude less involved than any of its own
teammates, on both sides of the ledger, and never once in danger
(`inDanger=0%` every `played` line). The match still ended `171 – 400`,
`DEFEAT`.

This is the sharpest reading [[#7]] has produced: not "dies once, then
contributes nothing" (the escort pull) and not "beelines in and dies in
9-16s" (`good`'s shape), but a body that is functionally absent from the
match in every column of its own damage board -- barely scratching the enemy,
barely scratched itself -- while the four AI teammates who actually fought
(and died: `Vale` 54s, `Bastion` 17s, `Wren` 28s, `Kestrel` 38s) lost anyway.
**Not a controlled comparison** -- rocks and the enemy roster roll fresh per
README's own "Battlegrounds" section -- but it is a second map and a second
spec agreeing with the first `wander` pull's direction, and the first to show
what a full, undisturbed `wander` match actually looks like end to end. Gate
held shut at fourteen open issues; not filed.

**2026-09-29, the second tank-spec `mash` pull this line asked for, matched
on viewport to the first, and the first time this line has actually watched
a battleground run its own clock out.** `playpick` gave `map=escort spec=
druid:guardian style=mash view=1280x800 save=carried` (behaves as fresh per
[[#5]]) -- exactly the follow-up the 2026-09-27 conquest entry above asked
for: same role, same style, same 1280x800 desktop viewport, a different map.

The first attempt (`playtest/plans/2026-09-29-19.play`) reproduced the
already-understood driver gap rather than the game: the tank died at
`fightTime~107` (`heroHp=0/4140`, three of five teammates already dead by
97s) and every further chained `play` call aborted in 0s on `hero()===null`
(`FAULT not-a-number` x2), the same "Tried and dropped" artifact the
wander/escort entry above hit. But the state read just before the abort
showed something the conquest pull never did: both cart bars reading
`31%`/`57%`, one `held` and the other freshly gone from `pushing` to
`stopped` -- not the rout shape a dead tank produced on conquest.

Three follow-up runs (`-19b`, `-19c`, `-19d.play`) switched to bare
`wait`/`state` polling after the first `play mash 100` chunk instead of
chaining more `play` calls, specifically to watch past a death without
tripping the abort. All three showed the same pattern: the tracked tank
died and revived on the normal battleground respawn clock (`RESPAWN_EARLY=6`/
`RESPAWN_LATE=11`, matching [[#7]]'s 2026-09-26 conquest confirmation) rather
than staying down, `aliveParty` oscillated 2-4/5 the whole match, and both
cart bars stayed in the 30s-90s percent range, `held` or `stopped`, never
`pushing` all the way to an arrival -- `-19c.play` reached `fightTime=227`
at `36%`/`78%` `held`/`held`, `-19d.play` reached `fightTime=297.5`
(`"3s left"` on screen) at `37%`/`94%` `held`/`stopped`. A last run
(`-19e.play`, same cell, long enough to poll past the cap) finally caught a
real result: `outcome=defeat time=300` -- **`The Long Haul · 300s · 0 – 0`**,
neither cart ever arriving. The damage board there confirms `mash`'s tank
contributed almost nothing (`You`: `dps=7 hps=6 taken=6.1k`, against
teammates' `dps` 40-85 and `taken` 6k-19k) and died once at 109s, matching
every other `mash` reading this line has -- the mechanism (`mash` never
leaves its pull spot, per source, so a tank given it never tanks) is
unchanged from the conquest pull.

What is new is the outcome shape, not the mechanism: the conquest tank-mash
pull lost a blowout, `126-400`, in 153s; four escort tank-mash attempts on
the identical role/style/viewport never once produced a rout, and the one
that ran the full clock timed out at a dead heat, `0-0`. That directly
complicates last session's tentative reading -- "losing the tank
specifically is worse" was one comparison on one map, and the second map
under the same passive-tank condition shows the opposite shape: escort's
own pace (a slow tug-of-war that both sides can leave "held" or "stopped"
for most of a match, per its own README description) looks more resistant
to one absent role than conquest's contested point, not less. **Sharpened
rather than confirmed:** [[#7]]'s core claim (a passive body costs its own
team, where a raid's AI would carry it) still holds -- the mash tank never
did what a tank does, on every one of five readings now, across two maps --
but "which role you lose" does not generalize the way one data point
suggested, and the map is doing at least as much work as the role. Gate held
shut at fourteen open issues; not filed. Reproduction: `playtest/plans/
2026-09-29-19.play` through `-19e.play`, `playtest/out/2026-09-29-19e/shots/
final.png` for the `0-0` board.

**2026-09-30, the first melee spec under `wander`, and the first pull that
connects this line's two threads instead of adding a third.** `playpick` gave
`map=conquest spec=rogue:assassination style=wander view=844x390,touch
save=fresh` -- rogue:assassination's first battleground pull ever (its nine
priors were all `raid`/`walk`/`clear`) and `wander`'s first phone-touch
reading (its one prior conquest pull, 2026-09-29-8, was desktop 1280x800).

`playtest/plans/2026-09-30-5.play`: `play wander 90` opened exactly like the
priest:shadow wander pull above -- `Out of range` on screen (`mid1.png`),
`bar` reading `"range"` on all three offensive slots, `hits=0 hitsPerMin=0`
across 364 presses, isolated from every red circle on the minimap, at
`fightTime=87` `heroHp=662/1530` `aliveParty=3/5`. Sixty-forty **that a melee
kit would still land nothing while wandering was itself worth confirming**:
the ranged priest's zero hits could be read as "never gets close enough
to be in range of anything," but a melee spec's engage range is short
enough that random wandering should eventually put it inside it by chance
alone if the movement pattern ever approaches an enemy -- and it still read
`hits=0` for the entire 106s the fight lasted, so `wander`'s own path isn't
converging on a target even at melee range, not just failing to close a
ranged gap.

What's new past that confirmation: the *consequence* diverged from the
ranged pull's for the first time this line has actually shown, on the same
map. Between the `fightTime=87` and `fightTime=100` samples the tracked
body crossed from empty ground into a contested point's own hazard ring
(`mid2.png`: `You` reads `DOWN` standing inside a red capture-zone circle
overlapping a second body) and died there, `takenPerMin` jumping from 597
to 1182 across the transition, `died=true`, zero hits landed in its entire
time alive. The ranged priest's wander pull (2026-09-29-8) never crossed
into a hazard at all and survived the full match, hitless but untouched;
this melee pull also never landed a hit, but the same short range that
should have been its chance to engage instead put it inside the point's own
danger radius the moment `wander`'s path happened to cross it, and it died
there having contributed nothing on the way in. Read together with the
`good`-style casters that beelined into this same map's opening scrum and
died at ~9s ([[#7]], 2026-09-28): three different styles now agree that
conquest's contested-point geometry is lethal to close, whether the body
is aiming at it (`good`) or wandering through it by accident (`wander`) --
`flee`/`dodge`, which never engage on purpose, remain the only styles that
survive it. `bill` for the full pull: `hits=0 hitsPerMin=0 taken=2081
takenPerMin=1182 died=true byMechanic={}`. Gate held shut at fourteen open
issues; not filed. Reproduction: `playtest/plans/2026-09-30-5.play`,
`mid1.png`/`mid2.png`/`mid3.png`.

**2026-09-30, the first pure-healer kit under `melee`, and the first time
this line has shown the zero-press shape costing a body its own survival
tools rather than only its damage.** `playpick` gave `map=flags` (Ebb and
Flow), `spec=paladin:holy`, `style=melee`, `1280x800`, carried (behaves as
fresh per #273) -- paladin:holy's first battleground pull of any kind (its
one prior outing was `mode=raid`, `style=wander`) and the first time any
healer spec has been given `melee` style. Every prior `melee` reading on
this line (marksmanship hunter on this same map, elemental shaman on
escort, protection paladin on escort) was a spec that could in principle
deal damage close up; a holy paladin's whole bar is heals and one shield,
so this asks a sharper version of the standing question: does `melee`'s
walk-at-the-nearest-enemy steering fail a support kit the same way, or
differently?

The same, and worse. `playtest/plans/2026-09-30-8.play`: `state` right
after `pull` showed four of five slots (`holy_light`, `beacon_of_light`,
`lay_on_hands`, `divine_shield`) already `ready` -- a real chance to use
something before the fight even started moving. It never took it:
`play melee 90` walked the body straight at the nearest red player and it
was dead by `fightTime=15` (`-120`/`DOWN`, `mid1.png`), `bill` reading
`hits=0 hitsPerMin=0 taken=1585 takenPerMin=6284.1 died=true
byMechanic={}` -- the same zero-press shape [[#7]] already has for
marksmanship/elemental/protection under `melee`, but this is the first
time the presses that never happened were **heals it could have cast on
itself**, not damage it could have dealt to something. Reading
`scripts/playbot.ts:952-954,1016-1019`: `melee`'s own loop only reaches the
ability-press branch when `want === null` (nothing left to walk toward),
and stays in the steer branch the entire time `far > 4` from the nearest
enemy -- a distance measured to a target the body has no reason to close
with when its own kit has nothing to do there, so the four ready heals sat
unpressed for the full fifteen seconds it took the enemy team to kill it.
The bar even carried a `'WORTH MOST ON THE TANK'` prompt on screen the
whole time (`bg-start.png`, `src/render/hud.ts:1794`) -- a real in-game
hint naming a teammate to help, that `melee`'s steering has no vocabulary
to read.

The revival matches the map's own established shape rather than adding a
new one: alive again by `fightTime=21` (`mid3.png`, `hp=1530/1530`), three
of the four heals now reading `"range"` (`holy_light`/`beacon_of_light`/
`lay_on_hands`), same "out of range of anyone to heal" reading this line's
2026-09-26 `auto`-restoration-druid entry already found on this exact map
-- except that entry blamed `auto`'s total lack of steering, and this one
shows `melee`'s steering produces the identical dead bar by pointing the
body at the enemy team instead of at no one in particular. The raid's own
progress carried on regardless: `mid3.png`'s banner reads "theirs taken by
Bastion" -- a teammate scored a capture while the healer was dead, the same
"AI carries the match, the passive body does not help it" shape [[#7]]'s
opening line already names.

`ui` on this cell reproduced #276's own under-44 and ability-cluster
overlap findings (`under44=["party 84x32","settings 172x32"]`,
`overlapping` the same `ability:5`/`ability:4`-vs-neighbour slivers as
every prior desktop `ui` read) -- nothing new, an open issue already. Gate
held shut at fourteen open issues; not filed. Reproduction:
`playtest/plans/2026-09-30-8.play`, `bg-start.png`/`mid1.png`/`mid2.png`/
`mid3.png`.

### Not yet filed

Observations that do not belong to any of the seven numbered hypotheses above,
held here until the gate opens (or a session drops them, with the reason).

**2026-09-28, a daily's own retry never sharpens its AI, and the WIPE banner's
own pull counter is the proof.** `mode=daily` gave priest:shadow, `wander`,
fresh save, 1280x800 desktop. Probed first
(`playtest/plans/2026-09-28-10-probe.play`): today's actual daily is The
Three Crowns, 25-player heroic, HASTENED -- almost certainly the same
instance a 2026-09-27 session already ran under this exact spec and style
(`playtest/plans/2026-09-27-8.play`), which wiped to `prison` at 45.1s,
phase 1, boss at 79%. No session has ever retried a daily past pull 1 in one
continuous `playbot` invocation (the only way to get a real second pull rather
than a fresh reload's pull 1 again, per this file's own `open #hash`
same-document-navigation lesson under hypothesis 1): this one did
(`playtest/plans/2026-09-28-12.play`), via `tap outcome:retry` straight off
the first wipe, no `open` in between.

The two pulls read as statistically the same fight: pull 1 wiped at
`fightTime=45` (44.6s on the WIPE screen), boss 78%,
`byMechanic={"thirst":730,"prison":511}`, `aliveParty=24/25`; pull 2 wiped at
`fightTime=46` (45.7s), boss 79%, `byMechanic={"thirst":685,"prison":545}`,
`aliveParty=24/25` -- no improvement on any axis, where every ladder-style
pull-over-pull comparison this line has ever run (the Bonegrinder `learn`
example in `docs/playtest.md` itself, 7.1 to 11.1 hits/min by pull 3) shows
real movement by the second attempt. The screenshots are the sharper evidence:
`p1-end.png` and `p2-mid1.png` both print "The Three Crowns · ~45s · boss at
7X% · **pull 1**" -- the second wipe's own banner never advanced to "pull 2"
at all.

Read `src/main.ts`'s `buildState` (767-784) rather than guess why: an ordinary
pull calls `createState(BASE_SEED, attempt, party, difficulty, encounter)` and
a room's own fight calls `createState(roomSeed(run, roomId), attempt, ...)` --
both pass the real `attempt` variable, which `restart()` (line 1487)
increments unconditionally on every retry, daily included. But the
`playingDaily` branch reads `createState(daily.seed, 0, party, difficulty,
encounter, daily.affix)` -- a **literal `0`**, not `attempt`. `s.attempt` (the
value the WIPE banner prints via `pull ${s.attempt + 1}`, `src/render/hud.ts:
2114`) is exactly this argument, and `src/sim/state.ts:47`'s own comment
("Later pulls produce sharper AI. Real raid groups get better at a fight by
repeating it") names the mechanism this argument drives. A daily retry never
passes it anything but zero, so the AI party is replayed at pull-1 skill on
every single attempt, forever -- `README.md`'s own words, "Retries are allowed
and counted... a run you cannot practise is one you only ever see once,"
promise the opposite of what the source does for this one mode.

**Not filed -- fourteen open `playtest` issues held the gate shut** -- but
this is a source-confirmed bug, not a taste note, and the first time this job
has actually looked at why two nominally-successive readings of the same
daily (2026-09-27's and today's) kept landing on near-identical numbers
rather than the improvement a second pull shows everywhere else on this line.
File as a bug the first session the gate opens, with
`playtest/plans/2026-09-28-12.play` as the reproduction and `p1-end.png`/
`p2-mid1.png` as the banner evidence.

**2026-09-28, the minimap's own enrage countdown is reading the wrong number
on every HASTENED fight, by exactly the affix's own discount.** `mode=daily`
(today's actual run rolled over since the last several sessions: probed first
via `playtest/plans/2026-09-28-18-probe.play`, The Skyward Deck, 25-player
heroic, HASTENED -- the first time this job has ever fought this boss at
heroic, or via `mode=daily` at all; its two prior appearances were 10-normal
evening fragments, one killed on retry under `mash`, one left open at 52%
when a room budget ran out), druid:balance, `style=good`, fresh save,
390x844 touch (`playtest/plans/2026-09-28-18.play`). `docs/upkeep.md`'s own
"raid rewarding play" table has this fight at the single largest played/idle
gap in the whole roster (played 76% / idle 6%, +70) and no session had ever
played it to a finish.

It did not reach one: `fight-over outcome=enrage time=184 phase=2`, boss at
33% (129,221/388,600), the player itself the death (`heroHp=0/1485`),
`aliveParty=24/25`. `mid2.png`, taken 6.6 seconds earlier at `177.4s`, shows
the minimap corner reading `enrage 83s` -- the display promising more than a
minute and a half of runway right before the fight ended in the thing it was
counting down to. That gap was worth checking against source rather than
filed as "the countdown is just wrong sometimes."

`src/render/hud.ts:1572` computes `enrageIn = encounterAt(s.encounter).enrage
- s.time` -- the encounter's raw, un-affixed enrage second (`enrage: 260` for
The Skyward Deck, `src/sim/encounters.ts:3706`; `260 - 177.4 = 82.6`, which
rounds to the exact `83s` on screen). But `src/sim/boss.ts:527` decides when
the enrage aura actually attaches with `enrageAt = encounter.enrage -
affixEnrage(s.affix)`, and `affixEnrage('hastened')` returns `135`
(`src/sim/affix.ts:84-89` -- "more than two minutes early", matching the
affix's own advertised text). So the real enrage attached at `260 - 135 =
125s`, some 52 seconds before the `mid2.png` shot, and the HUD's countdown
was never told: it keeps subtracting from the un-adjusted `260` for the rest
of the pull, so every HASTENED fight's minimap displays a number that is
wrong by exactly `135` seconds low on danger for the whole back half of the
timer -- the display would not have hit zero until `s.time=260`, seventy-six
seconds after this pull was already over.

`combat.ts:947-952`'s own damage-ramp math has the identical bug in a second
place: `since = s.time - encounterAt(s.encounter).enrage - ENRAGE_GRACE` also
reads the raw `260`, not the affix-adjusted `125`, so the exponential ramp
("flat for the first half minute and doubling every half minute after," per
its own comment) would not itself begin until `s.time > 290` -- meaning a
HASTENED pull's enrage is flatly doubled (not yet ramping) for however long
it lasts past the real, affix-adjusted `enrageAt`, and the ramp comment's own
worked example ("pulls resolve around 110 to 135 seconds and the enrage is at
233") was written before HASTENED existed and no longer describes what a
HASTENED pull's own numbers do. Both bugs share one root cause -- two
call sites computing "time since/until enrage" against `encounter.enrage`
directly instead of through the same `enrageAt` `boss.ts` already derives --
and both are readable from source without a second pull to confirm, though a
same-day HASTENED pull that survives past `s.time=125` on a *different* boss
would show the same wrong countdown and confirm this is not specific to The
Skyward Deck's own numbers.

**Not filed -- fourteen open `playtest` issues held the gate shut** -- but
this is a source-confirmed display bug with the exact numbers that predict
it, not a taste note, and it directly undercuts the one thing an enrage
countdown exists for: `README.md`'s own account of the genre says "the whole
of learning one is learning when things happen," and a timer that is wrong
by over two minutes on the one affix built to move that number is telling a
learning player the opposite of the truth for the second half of every
HASTENED pull. File as a bug the first session the gate opens, with
`playtest/plans/2026-09-28-18.play` as the reproduction, `mid2.png` as the
screenshot evidence, and both `hud.ts:1572` and `combat.ts:950` named as the
two sites needing the affix-adjusted `enrageAt` instead of the raw
`encounter.enrage`.

**2026-09-28, a second confirmation, different spec and style, same day's
instance.** `mode=daily` (still The Skyward Deck, 25-heroic, HASTENED --
today's run had not rolled over), shaman:elemental, `mash`, fresh save,
1280x800 desktop (`playtest/plans/2026-09-28-24.play`), the first
shaman:elemental pull and the first `mash`-style pull this job has ever run
against this boss. Same death: `fight-over outcome=enrage time=199 phase=3`,
boss at 26% (99,108/388,600), `heroHp=0/1440`. `mid2.png`, taken 21.2s
earlier at `178.1s`, shows the minimap reading `enrage 82s` -- almost the
identical wrong number the `good`-style run's `mid2.png` showed at `177.4s`
(`enrage 83s`), one second apart on a completely different spec and press
pattern, which is exactly what a display bug reading a fixed, un-affixed
constant (`encounter.enrage=260`) should produce: it does not track how the
pull is played, only `s.time`. `mash` survived 15 seconds longer than `good`
before the enrage killed it (199s against 184s) and left the boss 7 points
lower (26% against 33%) -- consistent with `mash`'s own random button
presses doing more incidental damage than a considered rotation on a fight
where positioning, not the rotation, is what a HASTENED pull actually asks
for. Two specs, two styles, two viewports, one identical wrong countdown.
Same reproduction and fix sites as above; nothing left to sharpen here
before it is filed.

**2026-09-28, the credits screen, the settings screen's sound/volume/backdrop
rows, and a heading that runs clean off the edge of the canvas -- the first
session on any of these.** `mode=menus`, 820x1180 touch, carried (behaves as
fresh per #273). Checked first: `sessions.jsonl` and this file both have zero
prior hits for "sound", "volume", "backdrop"/"ambience" or "credits" across
thirteen prior `mode=menus` sessions -- every one of them went to composition,
the citadel map, the name field, the invite-hash unlock recipe, or the RESET
control instead. `targets` and `ui` on both screens
(`playtest/plans/2026-09-28-21.play`) read clean: 17 controls on settings, one
on credits, `under44=[] offGlass=[] overlapping=[]` both times -- the toggles
themselves behave exactly as their own code says (muting sound greys out the
whole VOLUME row; turning BACKDROP off drops the entire menu's animated scene
to flat black, not just its own button's live preview) and none of that is
worth an issue.

The screenshot is the finding: `credits.png` shows the second art set's own
heading, `` `THE FLOOR AND WHAT STANDS ON IT — Liberated Pixel Cup tilesets` ``
(`src/credits.ts`'s `what`/`set` fields for the terrain set), running past the
right edge of the 820px canvas and stopping mid-word at "...Liberated Pixe" --
the licence name and the rest of the set's own title never appear anywhere on
screen. The first art set's heading (`THE BODIES ON THE FIELD — Liberated
Pixel Cup`, shorter) fits on one line cleanly on the same screenshot, so this
is specific to the second heading's length, not a wholesale layout failure.

Read `src/render/menu.ts`'s `drawCredits`/`paragraph` rather than guess why:
the licence list and author list under each heading go through `paragraph()`,
"the only wrapping in this file, because it is the only screen made of prose"
-- but the heading line itself (`` ctx.fillText(`${set.what.toUpperCase()} —
${set.set}`, left, y) ``) is a bare `fillText`, never passed through
`paragraph` or measured against `creditsLayout().width` (560px) at all. And
`scripts/rendercheck.ts`'s own credits check (searched for "credits" first,
found the exact block) stubs `measureText` as `text.length * 6` specifically
so `drawCredits`'s wrapping "is exercised rather than short-circuited," then
only asserts that every author name string appears somewhere in the
concatenated draw calls and that the BACK button is on screen -- it never
measures the heading's own drawn width against the canvas, real or stubbed.
This is the exact shape `docs/playtest.md`'s own warning names: a check reading
green over a picture that is plainly wrong, because the thing that broke
(a real font's character width against an un-wrapped line) is not the thing
the check's fake metric was ever asked about.

Worth filing once the gate opens: this is licence-attribution text specifically
-- `src/credits.ts`'s own comment calls attribution "a condition of most of
the licences this game's art is under" -- so text that never renders is not a
cosmetic gap on this one screen. Not filed this session; fourteen open
`playtest` issues held the gate shut. Reproduction:
`playtest/plans/2026-09-28-21.play`, screenshot `credits.png` under this
session's `--out` directory, fix candidates named for whoever picks it up:
either route the heading through `paragraph()` too, or shrink/wrap it to
`creditsLayout().width` the same way the body text already respects.

**2026-09-28, the win screen's own rung button, pressed for the first time
this job has ever pressed it.** `mode=menus`, 820x1180 touch, carried (behaves
as fresh per #273). Not a bug: a confirmation, kept here so the next session
does not spend a cell re-deriving it.

Every prior standalone-kill session (the 2026-09-28 02:00 kill-comparison
session, and the two enrage-countdown daily sessions above) reopened the next
fight with a fresh `open #hash` rather than actually tapping the button
`advanceLabel`/`hitOutcome` draw on a win screen (`src/render/hud.ts:182`,
`src/main.ts:2347`'s `else advanceTier()`). Nobody had watched
`progress.ts`'s own promise -- "a kill opens exactly one rung… and pressing
the advance button drops straight into it" -- actually happen.

`open #b=marrow&s=10&h=0` (Bonegrinder, 10-man normal, tier 0 on the chain),
`warrior:arms`, killed at `fightTime=115` (`playtest/plans/2026-09-29-1.play`,
run once to the kill and once more end-to-end after adding the `tap
outcome:next` step -- both kills landed at 114-115s, the small difference
being wall-clock press timing per `docs/playtest.md`'s own note on what does
and does not replay). `outcome.png` shows the button reading `10-MAN HEROIC`
exactly as `tierLabel({size:10, difficulty:'heroic'})` predicts
(`src/progress.ts:218`), not a generic `NEXT BOSS`. Tapping it
(`targets` gave the label `outcome:next`) went straight from
`screen=fight outcome=victory` to `screen=fight outcome=ongoing` with no
setup screen in between -- `advanced.png` shows `The Bonegrinder`, `101,200`
max hp, `pull 1`, a fresh three-second count (`countdown:80` ticks in the
`state` json). Boss max hp is unchanged from the normal pull's `101200` --
checked against source rather than read as a display bug: `DIFFICULTIES.heroic
= { health: 1.0, ... }` in `src/sim/classes.ts:1182`, with its own comment
("Health is left alone entirely… a longer fight is more casts of everything")
saying identical boss health between normal and heroic is the design, not a
miss. The mechanism works exactly as `progress.ts` and `README.md`'s "an
evening that has run out says so" both describe it.

One loose thread, not chased this session: `outcome.png`'s "OPENED 10-man
heroic — kill the same fight, 10 of…" banner (the `main.ts:2494` line said
only on the pull that earns a rung) sits partly behind the `First Blood`
award banner, the same shape of overlap #283 already reports for the
damage/healing report -- but this is a different piece of text than #283
names, so it is left as an observation here rather than folded into that
issue on a guess. Whoever re-reads #283 for the credits/enrage/daily-retry
backlog above should check whether this is the same `reportTop`-does-not-grow
root cause or a second one.

**2026-09-29, a pull's outcome is decided by one actor's death, not the
raid's, and the same field feeds the balance harness's own win rates.**
`mode=daily`, druid:feral, `style=dodge` (zero presses all fight), fresh
save, 1280x800 (`playtest/plans/2026-09-29-4.play`, full detail and source
citation under hypothesis 1's 2026-09-29 entry above). A body that pressed
nothing rode the same Skyward Deck 25-heroic HASTENED instance three prior
sessions had each recorded as an `outcome=enrage`/`outcome=wipe` loss to a
clean **victory** at 278s -- and in every one of those three losses,
`aliveParty` read `24/25`: one body down, not the raid.

`src/sim/sim.ts:783-788` ends a non-`saving` pull and sets `s.outcome` the
instant `s.actors.find(a => a.isPlayer)` is dead, before the actual
all-dead check on the next line (`livingParty(s).length === 0`) is ever
reached. That is playtest's own driver's problem when a script is steering
one body through a raid of twenty-four AI -- but `scripts/harness.ts:28`
builds its "crude stand-in for a competent human" the same way, with a real
`isPlayer` actor, and `scripts/harness.ts:791` counts a win with
`if (s.outcome === 'victory') wins++` -- the identical field. Every spec win
rate, cell win rate and the "raid rewarding play" played/idle table in
`docs/upkeep.md` (including the exact +70 Skyward Deck gap that sent this
line chasing the fight in the first place) is very likely counting "did the
one tracked body survive," not "did the raid clear the boss." Not
confirmed against the harness directly this session -- that would mean
instrumenting `harness.ts` itself, past what a playtest session may touch --
but the mechanism is the same field, the same actor flag, and the same
early-return order, read from the same file, so this is a source-backed
suspicion rather than a guess.

**Not filed -- fourteen open `playtest` issues held the gate shut** -- but
this is arguably the most consequential finding this job has produced: if
correct, a meaningful share of `docs/upkeep.md`'s own red-band history was a
policy actor dying alone, not the raid failing, which is a different bug in
a different place (`scripts/harness.ts`, upkeep's own tool, not `src/`) that
playtest cannot fix and can only flag. File as a bug the first session the
gate opens, pointing at `sim.ts:783-792` and `harness.ts:28,791` together,
with `playtest/plans/2026-09-29-4.play` (the winning `dodge` pull) and
`playtest/out/2026-09-28-30/journal.jsonl` (a `24/25`-alive "wipe" from the
same instance, kept on disk) as the two reproductions, and a note asking
upkeep's own job to check whether `harness.ts`'s win-rate loop should test
`livingParty` non-empty rather than `s.outcome` before trusting any band
this number moves.

**2026-09-29, a second boss, a closer margin, and three deaths rather than
one.** `mode=daily` gave paladin:protection, `melee`, fresh, 390x844 touch
(`playtest/plans/2026-09-29-10.play`, full detail under hypothesis 1's
matching entry above). Today's actual daily (probed first) was The
Bloodgorged, 25-normal FALTERING, not The Skyward Deck -- a different boss
than every prior confirmation of this bug, and the first where more than one
raider was down (`aliveParty=22/25`, not `24/25`) when `s.outcome` flipped.
The margin is the sharper part: boss at 2% (`6113/375200`), not the 26-33%
the three Skyward Deck readings showed -- this pull was seconds, not tens of
seconds, from a real kill when the instant-on-player-death rule ended it as a
flat `wipe`. Confirms the mechanism generalises past one boss and past the
"exactly one body down" shape; still the same `sim.ts:783-788`/
`harness.ts:28,791` pair, still not filed (gate shut), no new reproduction
needed beyond adding this plan to the two already on file.

**2026-09-29, the RECORD screen's third tab, opened for the first time this
job has ever opened it.** `mode=menus`, 820x1180 touch, carried (behaves as
fresh per #273). Not a bug: a confirmation, kept here so the next session
does not spend a cell re-deriving it.

Seventeen prior `mode=menus` sessions had read the PULLS and AWARDS tabs
(the AWARDS tab first on 2026-09-26) but never BOSSES, and so never a boss's
own notes page (`src/notes.ts`) -- the mechanism `README.md`'s "Getting
better at it" leans on for the game's whole "nothing on the character gets
stronger, so what a pull pays out is knowing the fight" claim.

`open #b=marrow&s=10&h=0` (Bonegrinder, 10-man normal), `warrior:arms`,
`play mash 150` to a kill at `fightTime=114`
(`playtest/plans/2026-09-29-13.play`), then `tap outcome:party` -> `tap
back` -> `tap record` -> `tap tab:bosses`, all in one invocation so the
carried profile survives (`docs/playtest.md`'s own `#273` lesson). Zero
driver faults across 30 journal lines. The list read "3 of 62 mechanics
met", Bonegrinder alone at the top in red with "1 pull . 1 kill . 3/3" and
every other boss dimmed with "never pulled . 0/N" (`record-bosses-list.png`)
-- opening Bonegrinder's own page named its three mechanics by their real
names and hit counts, "the cold line caught you 15x", "the spikes never
caught you", "the storm caught you 12x" (`record-bosses-page-marrow.png`),
matching `mash`'s own `byMechanic` tally exactly in shape (three distinct
mechanics landing, none at zero given a blind-mash style). A second boss's
page (The Last Whisper, never pulled) read honestly blank: "never pulled --
everything below is still ahead of you", all seven of its mechanics listed
by name and "not met" (`record-bosses-page-second.png`). The page's own
"ALL BOSSES" back label (`src/render/history.ts`'s `drawBack`) does return
to the boss list rather than exiting the screen, and a second `back` from
the list correctly exits to home -- the hit test answers the same
`{kind:'back'}` either way, so the label was the only thing that could have
lied, and it did not. `src/notes.ts` and its screen work exactly as
commented, on the first real playthrough of them.

**2026-09-29, the second `wander` pull on escort ever, the first on a fresh
save and the first on a dps rather than a healer, and a third distinct way a
`wander` body has died on this map.** `mode=battleground`, `map=escort` (The
Long Haul), mage:frost, `style=wander`, fresh save, 390x844 touch
(`playtest/plans/2026-09-29-14.play`). The only prior `wander` pull on escort
(2026-09-28-19, priest:discipline, carried) died at `fightTime=54` near a
hazard ring and then drifted, isolated, for the rest of what the script saw.

For the first 97 seconds the body stood completely apart from the fight --
`mid1.png` shows a lone token with "Out of range" printed over it and
nothing else in the visible frame, the damage board crediting it 0 against
teammates' 17-106 despite 374 presses (`bill`: `hits=0 hitsPerMin=0`), every
ability locked at `"range"` the whole time. It then died between `fightTime`
97 and 120 (`taken=1624` in that window, `aliveParty` 3/5 -> 2/5), still
isolated by position rather than caught in an opening scrum -- a third
distinct death shape for `wander` on this map, after the healer's ring-death
and this one's solitary one.

The match never reached a result screen again: the second `play wander 100`
call aborted after 0 seconds (`FAULT not-a-number {hero:null}`), the exact
already-documented "Tried and dropped" driver artifact (a chained `play`
giving up once `hero()===null`), now reproduced on a fresh save and a dps
for the first time. `wander`/escort is 0-for-2 on ever reaching a result
screen in this job's history, but both failures are the driver's own polling
gap, not a game symptom -- confirmed by the cart-hold percentages still
ticking between `mid2.png` and `mid3.png` (33%/70%, timestamps 1.1s apart)
while the journal itself stood still.

**Not filed** -- gate shut at fourteen open issues, and the driver half of
this is already covered by "Tried and dropped" rather than filable on its
own. Worth a future session: drive a `wander`/escort pull past a death with
bare `wait`/`state` polling instead of a chained `play` (the workaround
"Tried and dropped" already names for this exact gap), to see for the first
time whether this pairing ever reaches 300s or a cart arrival.

**2026-09-29, a third confirmation of the single-actor-death bug, and the
first showing what it actually costs a live evening.** `mode=walk`
(`boss=skyward`, a coverage label only), priest:discipline, `good`, 25-heroic,
carried (behaves as fresh per #273), 820x1180 touch
(`playtest/plans/2026-09-29-17.play`) -- the first `good`-style, first
touch-viewport, and first priest:discipline evening at this size/difficulty.
THE VIGIL crossed door to door in 31.1s (`10.0s` in, `41.3s` out, `presses=9`),
a sixth-or-so clean 25-heroic crossing against [[#6]]'s now-consistent
zero-stall record at this tier, and The Bonegrinder woke immediately on
arrival (`boss-woken` at the same tick the corridor let go).

What followed is the finding: four straight `outcome=wipe` readings on that
one boss, at `fightTime` 132, 136, 132 and 145 seconds, with `bossHp` reading
8%, 4%, 6% and 1% and `aliveParty` reading 24/25, 21/25, 24/25 and 21/25 each
time -- the raid itself never below 21 of 25 standing, and the boss within a
single-digit percent of dead on every single attempt, while `heroHp` read
flat `0/1350` at every wipe: the priest itself, and only the priest, was ever
the reason `s.outcome` flipped. The fifth attempt (`room n=6/10`) killed it
clean (`aliveParty=23/25 heroHp=1350/1350 bossHp=down presses=41`), and the
evening carried on through eastclimb, oratory and two pad rides with no
further fault before its 10-room budget ran out.

This is the same mechanism the two 2026-09-29 `mode=daily` entries above
named from source (`sim.ts:783-788`'s `s.actors.find(a => a.isPlayer)` check
firing before the real all-dead check on the next line) but the first time
it has been seen inside a live `mode=walk` evening rather than a standalone
pull, and the first time the cost has been visible end to end: four retries
and roughly 530 seconds of `played` time spent re-fighting a boss the raid
had already all but killed four times over, because the one body a person
steers happened to be the one that died each time on what a raid win-check
would have called a win. `PULL AGAIN` itself worked correctly on every one of
these four (unlike #271's corridor-wipe wall -- this is a boss room, not
THE VIGIL, and the room counter advanced normally each retry: n=3/10 through
6/10), so this is purely the outcome field lying, not a stuck evening. Not
filed -- fourteen open `playtest` issues held the gate shut -- but this
sharpens rather than merely repeats the standing note: file it as the same
bug the first session the gate opens, with this plan and its four wipe/retry
journal lines added as the reproduction that shows real cost, not just a
single anomalous pull.

Same run, `ui` on priest:discipline's healer bar at 820x1180 touch (never
checked before -- the two prior priest:discipline `ui` calls were at 390x844
and 1280x800): `under44=["map 84x28","party 84x28","settings 172x28"]`,
already #276's own finding reproduced on a third spec, and
`overlapping=["auto / ability:5","auto / ability:4","ability:5 / ability:3",
"ability:5 / ability:2","ability:4 / ability:2","ability:4 / ability:1"]` --
the same `auto`-vs-neighbour sliver 2026-09-29's druid:guardian entry
measured as a true, if tiny (~1px of radius), overlap at this exact
viewport, now confirmed on a second class with a differently-labelled bar
(`Flip Away`/`Rebuke`/`Quick Mend`/`Steady Mend`/`Mend`, not a dps kit).
Nothing new here -- both shapes were already understood -- so not written up
as its own line.

**2026-09-29, the same day's instance fought twice, and the single-actor-death
bug caught inflating an outcome rather than only deflating one.** `mode=daily`
gave paladin:retribution, `dodge`, fresh, 844x390 touch
(`playtest/plans/2026-09-29-18.play`, probed first via `-18-probe.play`).
Today's daily was, again, The Bloodgorged, 25-normal FALTERING -- the
identical boss/size/difficulty/affix a same-day session had already fought a
few hours earlier as paladin:protection/`melee` (`2026-09-29-10.play`,
written up above), and per `docs/playtest.md`'s own account of `mode=daily`
("the same fight for everybody, until midnight") and the daily-retry bug's
own source citation (`createState(daily.seed, 0, ...)`, always attempt zero)
both runs are pull one of the exact same seed -- the closest thing to a
controlled pair this line has had, one role and style swapped for another on
a fight neither could steer.

The protection/melee run wiped at boss 2% (`6113/375200`) with
`aliveParty=22/25` -- a raid three bodies down, seconds from a kill, called a
flat loss because the player itself (standing in melee range) was the one
death. This retribution/`dodge` run never let its own body take a mechanic at
all (`inDanger=0%` the whole way, `bill`'s only `byMechanic` entry across the
whole fight is `gorge`, a direct-target hit rather than a floor patch, so
dodge's floor-avoidance policy had nothing to do here) and read a clean
`outcome=victory` at `fightTime=156`, `bossHp=0%` -- with `aliveParty=14/25`,
eleven of twenty-five dead, a worse raid than the one the melee run's session
called a wipe over. The tracked body's own health (`heroHp=250/1800` at the
end, down from `609/1800` at the 87s mark, never zero) is the entire reason
the two readings point opposite ways on the same seed: a raid at 88% strength
lost because one body died, a raid at 56% strength won because that same slot
didn't. Same mechanism as the three entries above
(`sim.ts:783-788`/`harness.ts:28,791`), same non-filing (gate still shut at
fourteen open issues), but the sharpest pairing yet, because it is not two
different days' instances compared by argument -- it is the identical fight,
read twice, disagreeing with itself in both directions depending on which
body happened to be the tracked one. Reproduction on file:
`2026-09-29-10.play` (the wipe) and `2026-09-29-18.play` (the victory), same
day-key, both attempt zero.

**2026-09-29, the DAILY screen's own SHARE and a kill screen's own SHARE,
each pressed by a session for the first time, with real clipboard
permission granted from the start.** `mode=menus`, 820x1180 touch, carried
(behaves as fresh per #273). Not a bug: a confirmation, kept here so the
next session does not spend a cell re-deriving it.

`README.md`'s "Sharing" section names three SHARE buttons -- front page,
today's screen, and the results screen -- and only the front page's had
ever actually been pressed with clipboard access granted: `grep -l 'tap
share' playtest/plans/*.play` turns up exactly two hits
(`2026-09-25-19.play`, `2026-09-26-44.play`), both on the front page, and
2026-09-28-27's own clipboard-permission fix (the one that turned a
`NO LUCK` reading into a confirmed `COPIED`, by granting
`clipboard-read`/`clipboard-write` at context creation, which
`scripts/playbot.ts` itself never does) only ever re-tested that same
button. The daily and results buttons were untested twice over: never
tapped by any script, and never tapped with a context that could actually
read back what landed in the clipboard.

A one-off Playwright script
(`playtest/plans/2026-09-29-22-share-daily-results.mjs`, its own `vite` on
a spare port, one context with `permissions: ['clipboard-read',
'clipboard-write']` granted up front) pressed both. `open` -> `tap daily`
-> `tap share` read the clipboard as `"Abyss — 2026-09-29\nThe Bloodgorged
· 25 player · normal\nFaltering: healing lands for a quarter
less\nnot attempted yet\nhttp://.../#d=20260929"` (`daily-after.png`,
button reading `COPIED`) -- boss, size, difficulty, the day's affix and its
own detail line, "not attempted yet" (a fresh profile, no daily result on
file), and a day-link, matching `dailyMessage()`
(`src/share.ts:85-101`) field for field. `open #b=marrow&s=10&h=0` -> `tap
class:warrior:arms` -> `tap pull` -> idle (zero presses, the same style
hypothesis 1 has repeatedly shown wins this exact pull) to a clean
`KILL` at `fightTime=124.0` -> `tap outcome:share` read `"Abyss — The
Bonegrinder\n10 player · normal · killed in 124.0s\nas Warrior DPS, 30
mechanics eaten\nhttp://.../#b=marrow&s=10&h=0"` (`outcome-after.png`),
matching `killMessage()` (`src/share.ts:108-123`) exactly, including a
fight-link rather than a day-link. Both of README's remaining claims hold
exactly as written, on the first real press either one has ever had.

Driver lesson, not a game finding: the script's first run faulted
`no-such-control: share` on the outcome screen, because its own hand-rolled
label matcher only tried an exact match and a `label:` prefix, not the
`.includes()` fallback `scripts/playbot.ts`'s real `Driver.tap()` also
carries -- the outcome overlay's actual control is named `outcome:share`,
not `share`, and only the third fallback catches it. Worth remembering
before writing another one-off script against `window.__abyss.targets()`:
copy all three matching rules, not the two that look sufficient.

Incidental to this, not new: `outcome-after.png` reproduces #283's banner
overlap a second time over -- `First Blood`/`Nobody Fell`/`Nobody Left
Standing` stacked three deep over the damage board's top three rows (Vale,
Kestrel, Wren) and partly over the `OPENED 10-man heroic` rung banner
2026-09-29's earlier win-screen entry above already flagged as a possible
second instance of the same root cause. Nothing sharper than that earlier
note says already, so not written up as its own line -- left for whoever
picks up #283.

**2026-09-29, a personal best is only ever saved to disk on the pull that
beats an existing one, so a normal playthrough that kills each boss once
never has a single one on record.** `mode=menus`, 820x1180 touch, carried
(behaves as fresh per #273). The one thing no prior menus session had tried:
the front page's own SHARE button (tested clean by 2026-09-28-27 and
2026-09-29-22, both against an empty `bests` record) with an actual kill on
the board first, to read the "N of M bosses down" / "`<boss>` in `<time>`s"
half of `gameMessage()` that "a player who has done nothing yet claims
nothing" was always covering for.

A one-off Playwright script
(`playtest/plans/2026-09-29-26-share-progress.mjs`, its own `vite`, a fresh
`Page` per phase per hypothesis-1's own same-document-navigation lesson so
each `#hash` open is a real navigation) read the front page's SHARE before
touching anything (`"Abyss — a raid boss, or five people who would rather
you left\nhttp://.../"`, `before.png`), then opened `#b=marrow&s=10&h=0`,
picked warrior:arms and pulled, idle style. The fight read
`outcome=victory` at `fightTime=122.4` (`kill.png` -- a clean KILL,
`OPENED 10-man heroic` banner earned, matching hypothesis 1's own idle-wins
shape). A fresh `Page` back on the front page (`home-after-kill.png`,
confirming `screen()==="home"`) then pressed SHARE again -- and read back
the exact same string as before the kill, byte for byte, no boss count, no
kill line.

Read `src/main.ts:2536-2541` rather than guess why:

```ts
const moved = beat(bests, state)
bests = moved.bests
if (moved.beaten.length > 0) {
  saveBests(bests)
  ...
```

`saveBests` only runs inside the `beaten.length > 0` branch. `beat()`
(`src/bests.ts:66-95`) itself is correct and says why in its own comment --
"the first time something is recorded is not a personal best... an
announcement that fires every time announces nothing" -- so a first-ever kill
of a boss deliberately produces `beaten: []` while still writing
`next.kills[boss.id] = time` into the *in-memory* `bests` object it returns.
`main.ts` reads that comment as "nothing to save" instead of "nothing to
announce", and the two are not the same thing: the updated record sits in the
`bests` variable for the rest of the tab's life but is never handed to
`saveBests`, so `localStorage['abyss.bests']` never receives it. A second
diagnostic script (`playtest/plans/2026-09-29-27-diag-bests.mjs`) confirmed
directly rather than inferred: `localStorage.getItem('abyss.bests')` read
`null` both before the pull and immediately after the victory (same `Page`,
no navigation at all, so this is not a reload/origin artifact) -- while
`localStorage.getItem('abyss.history')` in the same breath held the full
attempt record (`{"boss":"marrow","seconds":124.3,"outcome":"victory",...}`),
proving `history` and `bests` are written on genuinely different schedules
and only `bests` is silently skipped. `saveBests` has exactly one call site
in the whole file (grepped), so there is no second path that could catch this
later.

The practical shape: **any player who kills each boss once, in order, the way
the chain is built to be played, will never have a single boss on their own
`bests` record** -- it only starts saving from the first time a *repeat* kill
of the same boss happens to be faster or cleaner than the one before it, or a
pull happens to out-damage a previous best by more than 2%. That silently
breaks two things README promises rather than one: the front page's own
"Sharing" line (`gameMessage()`'s "N of M bosses down" / furthest-boss-in-Ts
line, the entire reason that share message is worth sending "next to the
record"), and the awards/results-screen personal-best banners
("Getting better at it": "personal bests announce themselves as they are
beaten" -- true only once one already exists to beat). The kill-to-kill trend
line on the results screen is unaffected, because it reads `history`, which
saves correctly and unconditionally.

**Not filed -- fourteen open `playtest` issues held the gate shut all
session** (283, 282, 281, 279, 278, 276, 275, 274, 273, 272, 271, 269, 267,
266) -- but this is a source-confirmed bug with a one-line fix (save `bests`
unconditionally after `beat()`, the same way `unlocked`/`saveSetup()` a few
lines above it already does), not a taste note, and it is the first session
to actually exercise the record-carrying half of the front page's SHARE
message rather than only its empty-record fallback. File as a bug the first
session the gate opens, with `playtest/plans/2026-09-29-26-share-progress.mjs`
and `playtest/plans/2026-09-29-27-diag-bests.mjs` as the two reproductions,
`before.png`/`kill.png`/`home-after-kill.png`/`after.png` under
`/tmp/pt-30-1-share-progress/` as the screenshot evidence, and
`src/main.ts:2536-2541` plus `src/bests.ts:66-95` named as the fix site.

**2026-09-30, escaping a daily fight leaves the class-select screen telling
you the wrong room is next.** `playpick` gave `mode=daily boss=crowns
spec=priest:shadow style=dodge view=1280x800 save=carried`. Probed first
(`playtest/plans/2026-09-30-2-probe.play`): today's actual daily is The
Bloodgorged, 25-player normal, FALTERING. `playtest/plans/2026-09-30-2.play`
ran it under `dodge` (first priest:shadow daily on record, first `dodge`
against this boss/size/difficulty/affix) and wiped at `fightTime=128` boss
13%, `aliveParty=22/25`, `byMechanic={"fester":12,"gorge":4,"champion":3,
"spill":1}` -- the player died at 479/1350 by 88s while `inDanger` read 0%
both readings, consistent with `fester`/`gorge`/`champion` being
target-picked hits rather than ground the player stood in. Its closing `key
escape` (lowercase, exactly as `docs/playtest.md`'s own command table spells
it) threw `driver-threw: keyboard.press: Unknown key: "escape"` --
already-known (2026-09-26-10's finding, standing in this file already:
Playwright wants `Escape` capitalized), not new by itself.

Redone with the right case (`playtest/plans/2026-09-30-3.play`,
`-4.play`) to reach what -10's session never got to: what happens after.
`key Escape` from the daily fight (tried both after a full wipe and 3s into
an untouched pull -- same result either time) lands on the ordinary RAID
class-select screen, and that screen's own banner reads **"first room — The
Bloodgorged — give it nothing, and carry what it takes"**
(`roster-after-escape.png`) -- naming the daily's boss as the very next room
of a raid evening. It is not: pressing that screen's own WALK IN button
starts a real evening at `chamber=threshold` (`after-pull.png`, "THE
THRESHOLD / onward — The Vigil", `boss=null`), which is the citadel's actual
first room and has nothing to do with The Bloodgorged.

Read rather than guessed: `src/main.ts:1787` sets the shared `encounter`
variable to `daily.encounter` when a daily fight is built, and `roster.ts:294`
prints `"first room — " + headline.name` straight off whatever `encounter`
currently holds. The *only* place that resets it to the citadel's real first
fight is `updateRaidSetup`'s own `next` handler (`main.ts:1841-1844`,
`encounter = firstFight()`), which fires on the raid size/difficulty
screen's NEXT press -- a screen this path never visits. Escaping a fight
(`main.ts:2282-2287`, `takeMenuRequest()`) never touches `encounter` either,
so a daily's boss sits in it until something on the raid setup screen
overwrites it. The mechanism is general to any fight escaped without going
through raid setup first, but daily is the one case this session found where
the label and the truth visibly disagree, because a daily's own boss is
never the citadel's first room.

This is exactly `docs/playtest.md`'s own "a menu that says something untrue
about the game behind it" -- not a taste note. **Not filed -- fourteen open
`playtest` issues held the gate shut all session** (283, 282, 281, 279, 278,
276, 275, 274, 273, 272, 271, 269, 267, 266). File as a bug the first session
the gate opens, with `playtest/plans/2026-09-30-4.play` as the reproduction
(shortest path: `open` -> daily -> pick a class -> start -> `key Escape` ->
`tap pull`) and `roster-after-escape.png` / `after-pull.png` as the
screenshot evidence, `src/main.ts:1787`, `1841-1844`, `2282-2287` and
`src/render/roster.ts:294` named as the mechanism.

**2026-09-30, the RECORD screen's boss list has no scroll, and on a landscape
phone that hides most of it forever.** `playpick` gave `mode=menus
view=844x390,touch save=fresh` -- the twentieth `menus` cell run, but the
first at this viewport (fifteen-plus prior fight sessions had used 844x390,
none of them just navigating menus) and only the second honestly `fresh` one.
Walked the front page, RAID setup, class select, BATTLEGROUND setup, daily
setup and SETTINGS at this shape first (`playtest/plans/2026-09-30-7.play`) --
all clean, `under44` catches every button's height by a few px everywhere
(`raid 340x40`, `back 120x32`, etc.) but every screenshot reads comfortably
sized and nothing overlaps or sits off the glass, so none of that is worth the
gate.

RECORD's own BOSSES tab is different in kind, not degree. `tap record` ->
`tap tab:bosses` -> `targets` returned only `boss:0`..`boss:3`, and the
screenshot (`record-bosses-empty.png`) prints "7 more below" under them --
11 encounters are built (`dungeoncheck` says so), 7 of them permanently off
this screen. Re-ran the same two taps at `1280x800` desktop for contrast
(`/tmp/check-history-taller.play`): `boss:0`..`boss:5`, six of eleven, "5
more below" -- so this is not landscape-phone-specific, it is every viewport
this job has ever measured, and the phone cell just makes it worst.

Read rather than guessed: `src/render/history.ts`'s `historyLayout` (75-123)
builds the `bosses` array by stepping down from the same fixed `top` until
`ry + bossH > bottom`, then simply stops -- there is no scroll offset
anywhere in the file, no scroll/wheel/swipe listener anywhere in
`src/input.ts` or `src/main.ts`, and the "N more below" line (412-416) is the
screen's own admission that it knows the list is bigger than what it drew.
The awards list (511-557) and the pulls-per-boss blocks (75-100) share the
same `historyLayout` and the same silent cutoff. Nothing filters this by
difficulty or unlock state -- a save with real history (kills, ladders,
awards) will run into the same wall sooner, not later, since a killed boss's
row carries more to show, not less.

This is `docs/playtest.md`'s own "a screen with no way out" and arguably "a
menu that says something untrue about the game behind it" -- "more below"
promises content that no input in this game can ever reach. **Not filed --
fourteen open `playtest` issues held the gate shut all session** (283, 282,
281, 279, 278, 276, 275, 274, 273, 272, 271, 269, 267, 266). File as a bug the
first session the gate opens, with `playtest/plans/2026-09-30-7.play` as the
reproduction (`open` -> `tap record` -> `tap tab:bosses`) and
`record-bosses-empty.png` (844x390, 4/11 shown) plus
`/tmp/pt-tall/shots/bosses-tall.png` (1280x800, 6/11 shown) as the screenshot
evidence, `src/render/history.ts:75-123` and `:412-416` named as the
mechanism.

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
