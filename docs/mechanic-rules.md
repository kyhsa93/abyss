# Designing a boss mechanic

Everything here was measured in this repo. Where a number is quoted, it came
out of a run rather than out of an argument, and several of these rules exist
because a mechanic was built the other way first and taught nothing.

## Read this before you read the rest

**The teaching numbers in this file were all re-taken.** `SimState.only`
narrows the kit to the mechanic under test, and kit length is also what sets
the tempo -- a short kit runs faster, so that a small raid meets a narrower
fight rather than a slack one. Isolating a mechanic therefore bought it the
one-rung tempo and fired it about twice as often as it ever does in a real
pull. Every teaching figure taken before that was fixed was reading a boss
nobody plays, and mechanics were accepted and rejected against a 12-point bar
that the tempo was clearing on their behalf.

Use `scripts/teachprobe.ts`. It pairs its seeds, so the boss, the party, the
placement and every roll are identical between the practised and unpractised
runs and only the reaction delay differs. The error bar it prints is the
spread of the per-seed difference, which is the quantity the design actually
produces -- typically around two points, not the eighteen an unpaired formula
would suggest.

## The bar, and the current field

    breath      21.4pp    removes 67% of the deaths
    mirror      19.8      62%
    burden       9.8      70%     over-scales; see below
    hand         9.2      93%
    gaze         9.7      95%     real at five, ten and twenty-five
    spire        9.0      67%
    fault        8.3      96%
    vessel       7.5      39%     over-scales both ways; see below
    knell        7.0      41%     real at ten and nowhere else; see below
    yoke         6.7      75%
    echo         6.6      100%
    verdict      6.0      57%
    shockwave    5.2      84%
    chant        4.5      96%     real at five, ten and twenty-five
    vigil        4.2      80%
    crush        3.3      97%
    shallows     2.4      98%
    brand        2.0      69%
    puddle       0.5      83%
    rot, sunder, spread, sweep, adds -- indistinguishable from nothing

**Read the field table at three sizes before believing it.** It is a ten-man
heroic table and always has been, and three mechanics measured across sizes in
the same round came out like this:

                 5 heroic        10 heroic       25 heroic
    mirror    49.0pp (49%)    19.8pp (62%)    51.5pp (53%)
    vessel    37.8   (40%)     7.5   (39%)    33.3   (76%)
    knell      0.0              7.0   (41%)     0.0
    gaze       7.0   (98%)     9.7   (95%)    27.9   (97%)
    chant      8.3   (89%)     4.5   (96%)     3.4   (93%)
    vigil      0.0              4.2   (80%)     0.2   (88%)

Two of them are three or more times the mechanic at the sizes either side of
the one they were tuned at, and the first pull at those sizes is a wipe: 100%
of unpractised five-mans and 96.5% of unpractised twenty-fives die to the
mirror. One number in the middle of a table is not a mechanic's worth, it is
one reading of it, and a rung sold at every size is sold at all three.

The burden is the one to be careful with. At twenty-five it runs five chains
at once, each tying up three bodies, so fifteen of twenty-five are carrying or
fetching at any moment and 80% of a *practised* raid dies -- there is nothing
left for practice to remove. It wants a cap on concurrent chains or a rung a
large raid does not reach.

Read both columns. Isolation leaves the raid under about a quarter of a real
pull's pressure, so there are barely any deaths left for a good mechanic to
remove and the points column compresses toward zero for everything except the
cone. The share removed does not shrink just because the count did: the echo
kills 6.6% of unpractised raids and none at all of practised ones, which is as
clean as teaching gets even though it is worth a third of the cone in points.

There is no fixed pass mark any more. A mechanic has to be `real` -- lower
bound above zero at 250 pairs -- and it has to earn its rung against that list.

## What a mechanic has to be

1. **Failure is binary at a single moment.** A pool announces itself for 1.6
   seconds and then takes everything inside it and nothing outside it. A wind
   that pushed people around a tick at a time taught exactly 0pp: proportional
   damage averages skill out.

2. **It has to land often enough that a pull is full of it.** The first brand
   arrived at 0.16 a second and taught nothing three separate times. But
   throughput is necessary, not sufficient -- see granularity below.

3. **The answer has to route through a channel that carries the two
   numbers.** `reactionDelay` and `mistakeChance` are the whole of what
   separates a first pull from a ninth, and a mechanic answered by code that
   reads neither cannot be practised and will measure zero however lethal it
   is. `isSpotSafe` is the standing example: it is skill-independent, so a
   mechanic answered entirely by it measures nothing.

   This rule used to name `consider()` and say the two numbers lived "there
   and nowhere else", and that was already not true when it was written --
   `watchTheLine` is a second channel, built because a judgement is answered
   by a cast and the walking channel could not hold it. There are three now:

       currentDanger / consider()   answered by walking
       watchTheLine                 answered by a heal
       readTheField                 answered by what you hit, and by stopping

   The correction matters because of what it says about a mechanic that
   measures zero. The thralls were read for a round as proof that "the party's
   damage goes somewhere else" teaches nothing. It is not: nothing about
   *choosing a target* was ever delayed or fumbled, so the demand was answered
   identically on every pull by construction. Given a channel of its own, the
   same family of demands measures 7.0, 7.5 and 19.8 points. **Before
   concluding that a kind of demand cannot teach, check whether the code that
   answers it has ever been able to be late.** If it has not, building the
   channel is part of building the mechanic.

4. **Proximity mechanics anti-scale.** "Stand together" and "stand apart" get
   easier with more bodies, which is how one of them measured 97% at 25 and 0%
   at a five-man heroic. And **a raid at rest already stands about 30 units
   apart**, so a proximity rule is usually satisfied before the cast lands --
   the first burden handed itself off on the tick it was dealt, four hundred
   times in one pull, with the party AI never involved. That is not an easy
   mechanic, it is an absent one.

5. **Area denial super-scales, which is the mirror of 4.** The arena is a
   fixed 460 radius whatever the headcount, so a mechanic that eats floor per
   body wipes every first pull at 25 while a ten-man never notices. Cap how
   much can be out at once.

   And it is not only floor. Anything that writes one near-lethal bill per
   body caught in an instant super-scales the same way and for the same
   arithmetic: more bodies means more of them caught in the one instant, and
   the healers have the same second to cover all of them. The surface that
   hands damage back caught about three of ten and 32% of unpractised
   ten-mans died; at twenty-five it caught proportionally more and 96.5% died.
   Cap how many bills one instant may write, the way area denial caps how much
   ground may be out.

## What actually moves the number

**The telegraph, more than the payload.** Same boss, same 102-radius band,
same difficulty dial, one difference:

    sweep    no telegraph    0.1pp    18.6 hits unpractised -> 42.2
    crush    1.1s            19.9pp   18.6 -> 5.8

And its length is steep: 0.95s is a wall at 64pp, 1.10s is 21pp, 1.15s is a
formality at 14pp. Walking clear takes 0.31s, and whatever is left over is the
window a reaction delay fits inside. So decide *when it judges* before you
decide what it hits. This also means the mechanics currently measuring zero
are not beyond saving -- give one of them a wind-up and it becomes a teacher.

**Granularity, independently of throughput -- and finer is simply better.**
Holding the rate fixed at 0.30 a second and changing only the clumping, at 250
pairs each: two every 6.7 seconds taught 19.8pp, six every 20 taught 9.0, and
twelve every 40 taught 5.9. This was first measured as a peak with the middle
setting winning, and that was the tempo bug -- a doubled cadence saturating
the large clumps. It is monotone.

The cause looks like arithmetic rather than psychology. The raid stands inside
a band of radius 90-125, so twelve circles of radius 62 dropped in one instant
overlap heavily and deny far less distinct ground than the same twelve
arriving two at a time. The share of deaths practice removes barely moves
across that range (61%, 67%, 57%), so clumping is a dial on *how much pressure
there is*, not on *how learnable it is*. Rule 2 does not cover it.

**A delay has to be expressed at the scale of the answer it delays.**
`reactionDelay` is a quarter of a second for a steady raider and a tenth off
that by the ninth pull, which is calibrated for a sidestep -- a step costs
nothing but the step. Anything with machinery in front of it swamps that: a
heal sits behind a global cooldown and a two-second cast, and the judgement
taught 3.8 points until its delay was multiplied by six. It is not a quirk of
healing. A target call sits behind the same global cooldown and a rotation
already mid-press, and multiplied by five it produces the three entries above;
at 1x it produces the thralls. So the multiplier is a general instrument:
decide what the answer's machinery costs, and express the hesitation in the
same units.

**What the rotation does by default is what a target mechanic is fighting.**
The party's rule is "hit whatever is hurting the raid, lowest health first",
with no decision in it. A mechanic whose right answer *is* that rule teaches
nothing, which is the thralls in one sentence. Both of the ones that measure
here break the coincidence rather than lean on it:

  - the knell hurts nobody, so the default rule never looks at it, and
    somebody has to decide to leave a health bar that is asking to be hit;
  - the vessel hurts somebody, so the default rule aims straight at it, and
    the answer is to stop -- the default is the trap.

Neither is "more damage elsewhere". Both are a moment at which a raid either
did the thing or did not, which is what rule 1 has always asked for.

**A hold has to reach the weapons, not only the buttons.** Auto-attacks pick
the nearest hostile with nobody deciding anything. Measured, that is not a
weakening, it is the whole mechanic: the surface that hands damage back is
worth 19.8 points with the swing held and

    mirror, weapons ungated    100.0% -> 100.0%    0.0pp

with it not. Both ends of the practice curve wipe, because every body in the
raid is billed on every cast whatever it decided. Eleven percent of the raid's
damage is enough to fail a demand outright, so a rule that only reaches the
buttons is not a rule.

**Not damage, past a point.** Raising a hit from 700 to 1000 left the gap flat
between 26 and 29pp. Once one hit is close to lethal, damage stops being a
teaching lever.

**Who pays, which is a different question from how much.** The knell writes
its bill to the whole raid at once and the vessel writes it to the two or
three bodies that earned it, and they are otherwise the same shape -- a
telegraphed instant, a binary outcome, the same channel, the same tuning
round. The vessel converts its failures into deaths at every size. The knell
converts them at exactly one, and at the other two it measures a flat zero
while plainly working: a twenty-five man pull hung nine bells, broke seven and
let two finish, and not one body died all fight.

The cause is that healing is a rate and a raid-wide bill is a rate. Spread
thin enough to be survivable at the size it was tuned for, the same total is
absorbed outright by a raid with more healers, and one point past that it
wipes the raid it was tuned for. There is no number between the two. An
individual bill near the top of a health bar has no such problem, because
nothing about a bigger raid makes one body harder to kill.

So: **if the answer to a mechanic is a raid-wide hit, expect it to exist at
one raid size only** unless the boss carries a weight for it. Bill bodies, not
rosters.

**And not how long the hazard stays, either.** Over a fourfold range at 250
pairs each -- 6s 8.7pp, 10s 9.0, 16s 7.8, 24s 10.0 -- linger sat inside its
own error bar. What teaches is the instant it lands, not the ground it leaves.
This one is worth knowing because it kills a whole family of design pitches:
"where will still be floor a minute from now" is a good sentence and not a
measurable mechanic. Pick a linger for what a long one costs the rest of the
game, not for what it buys.

**The boss more than the mechanic, and it is not close.** Every mechanic in
the game was moved onto one host -- the Warden, with its own cadence lent to
each so nothing went silent -- and measured at all three sizes. The result is
that there is no host-independent value of a mechanic at all:

    on the Warden      at its own boss
    puddle  35.2pp     0.5pp on the Choir
    echo    48.3       6.6  on the Choir
    breath  nobody died at any size      21.4 on the Tidebreaker

The cause is one number. `mechanicDamage` is 1.15 on the Choir, 1.7 on the
Warden and 4.6 on the Tidebreaker, and a mechanic's own damage was tuned
against whichever of those it was written for. The cone is built for 4.6, so
on 1.7 it lands at a bit over a third of what it is meant to and kills nobody;
the echo is built for 1.15, so on 1.7 it is half again as heavy and goes from
mid-field to the hardest thing measured.

A factor of four across the hosts swamps every dial a mechanic has. Cadence,
radius and telegraph are trim next to it. So when a mechanic is placed, the
placement is the tuning: the question is not which rung but which boss, and a
mechanic moved between two of them has to be re-measured rather than re-read.

Denial also multiplies badly against a boss whose other rungs all say *stand
somewhere specific* -- the cone's blind side, the ring's gap -- and it stayed a
wipe with the damage cut to 300, so that part is the denial rather than the
payload. A boss with no shape of its own absorbs it.

**For anything involving a second person:** a name that is recomputed is not a
name -- asking "who is furthest" every tick meant the answer changed as soon
as the bearer took two steps, and 32 casts a pull resolved with the carrier
alone. And a commitment that ends when it is met is not a commitment: bearers
that stopped reacting on arrival walked home and were outside again by the
time it mattered.

## A demand can be a moment rather than a place

Every mechanic that answers to `currentDanger` is answered by standing
somewhere else, and for a long time that was the whole vocabulary. Three
mechanics were built to ask for the other half of raiding -- hold your
rotation, cut the note, turn your back -- and all three are `real`. The note
is real at all three sizes, the gaze at all three, and the count at two of
them: a five-man heroic loses nobody to it at either end of the practice
curve.

    vigil    hold everything      4.2pp  80%    5h 0.0        25h 0.2
    chant    the one it named     4.5    96%    5h 8.3        25h 3.4
    gaze     turn your back       9.7    95%    5h 7.0        25h 27.9

None of them is a place, so none of them leaves ground and none of them is
read by `isSpotSafe`. They resolve on one tick and there is nothing of them a
tick later.

**They needed a fourth channel, and the first draft measured the cost of not
having one.** Written on the walking channel -- the obvious place, because
`consider()` is where a hazard with a telegraph belongs -- the vigil was worth
2.5 points and the gaze 7.0. The trouble is not that the walking channel is
slow, it is that reacting on it *means walking*: an actor that spends its
danger slot on "stand still and do nothing" is handed straight to
`findSafeSpot` and given a tile to go to. Moved onto a channel of their own,
with their own three fields on `AiProfile`, the same two mechanics measure 4.2
and 9.7 with nothing else changed. There are four channels now:

    currentDanger / consider()   answered by walking
    watchTheLine                 answered by a heal
    readTheField                 answered by what you hit, over a window
    holdTheBeat                  answered by what you are doing at one tick

**A hold has to reach the weapons, and this is the second measurement of that
rule rather than the first.** The vigil reads whether a body was working when
the count sealed, and the first version read only the buttons -- a cast in
progress, or a global still running. Auto-attacks set neither, so every melee
in the raid kept swinging through a demand to stop and the mechanic never
noticed. Reading the swing timer as well, and holding the swing through
`mayStrike` the way the closed surface does, is part of the 2.5 -> 4.2.

**Bill bodies, not rosters -- confirmed from the other direction.** The chant
names one raider and lands on the raid if that raider is slow, so the obvious
bill was a flat share to everybody. That version measured 19.1 points at a
ten-man, 0.2 at twenty-five and 0.0 at five: one raid size, exactly as the
rule says. Moving the weight onto the body that earned it -- one near-lethal
bill, and a token share for everybody else so it still reads as collective --
gives 8.3 at five, 4.5 at ten and 3.4 at twenty-five. It is worth less at its
best size and it exists at all three, which is the trade the rule is
describing. Note also that the roster-billed version was the second-highest
number in the whole field at the time, and it was wrong: **a big number at one
size is evidence about that size and nothing else.**

**Set the count against what the answer costs.** The telegraph is the steepest
dial in the game, and what it is measured against is the machinery in front of
the answer. A pool's 1.6 seconds has to hold a delay and a 0.31-second walk. A
note is answered by one press, which takes no time at all, so the whole count
is slack and the count is a direct probe of `reactionDelay`. At 2.1 seconds
the chant was cut 12.6 times a pull and failed 0.1 times, and taught 0.8
points with a bar wider than the figure. At 1.25 seconds, inside the range a
greedy raider rolls on a first pull and outside the range it rolls on a ninth,
the same code teaches. Nothing else about it changed.

**Do not define the danger by the failure it causes.** The obvious way to
write the vigil is to raise it only for a body that would be caught if the
count landed now. That oscillates: the moment such a body holds its demand
clears, the moment its demand clears it starts working again, and the pair
re-roll a delay every few ticks until one happens to land inside the count.
The demand has to be the *count*, so the delay is rolled once and what it
decides is whether the answer started in time. This is the schism's "a
formation is not a step" one turn further on -- there the danger had to
outlive the nearest problem, here it must not be defined by the problem at
all.

**A flat demand and a flat bill can still triple the points column, and the
difference is the raid's own margin.** The gaze is worth 7.0 at five, 9.7 at
ten and 27.9 at twenty-five, which is the spread the rule above says to be
suspicious of. It is worth knowing what it is not. Measured on the same code:

    gaze, unpractised    10 heroic   1.43 failures a body   2540 taken a body
                         25 heroic   1.50                   2588

The demand per body is flat, the bill per body is flat, and no instant writes
anything like a bill per body -- about one body a cast at ten and two and a
half at twenty-five, against a headcount two and a half times larger. So this
is not rule 5's super-scaling and a cap on bills would be machinery for a
problem that is not there. What moved is the raid: 2540 a body is just under a
ten-man's wipe line and 2588 is over a twenty-five man's, so the same fight
converts to deaths at one size and not at the other.

Which is the general form of "read the field table at three sizes". The points
column is not a property of a mechanic. Two of its three inputs -- what the
mechanic demands and what it bills -- can both be flat across the roster while
the number it produces triples, because the third input is how much margin the
raid had before it started.

**A five-man heroic can read exactly zero because nobody dies at all.** The
vigil measures 0.0 at five on both attempts. The diagnostic shows it thrown
and failed there; there is simply nothing left for a death rate to express.
Isolation compresses the points column and at five it can compress it flat, at
which point the share-removed column has no denominator either and both
columns say nothing rather than saying no.

**Use `scripts/momentprobe.ts` before believing a zero.** A gap of nothing has
two causes the gap cannot tell apart: a demand nobody has to answer, and a
demand everybody fails for too little to matter. It prints casts a pull,
failures a pull, deaths and damage per body, and it is the reason the chant is
in this file at all rather than discarded at 0.8. A failure count still may
not be used to argue that a mechanic is alive, only to explain why it is not.

## Traps

- **Dodged, then walked back into.** An AI that leaves a hazard returns
  through `outOfPosition` -> `idlePosition` before the thing has resolved. The
  general fix (running `idlePosition` through `isSpotSafe`) cost the brand
  10pp, because not walking back onto your own floor is most of what the brand
  teaches. Narrow it to the live mechanic.
- **Hand-kept lists of mechanic ids.** `planned()` carried one, `brand` was
  never added to it, and a descent floor built to the Warden's shape threw
  brands nobody bought -- while the check written to catch exactly that
  carried a copy of the same list with the same name missing. Read the set off
  `MECHANIC_IDS`, which comes from a table the compiler forces to be complete.
- **An id is not a name.** `nextObjectId` numbers every object in a fight --
  actors, ground, chat lines, floating numbers -- from one, and the raid's own
  slots are numbered one up to the headcount, so a summoned body can carry a
  raider's id and `find` walks the party first. Everything summoned before this
  round arrives forty seconds in, by which point the counter is in the
  hundreds, so nobody had met it: measured, the counter clears the roster at
  t=0.03 in a five-man and t=1.53 at ten and twenty-five, and the earliest
  opening on any table is seven and a half seconds. A check that starts a
  mechanic at t=0 walks straight into it, and it is not a check-only problem --
  the bell resolved its own count by killing the raider that shared its id, in
  silence. Look a summoned body up by faction as well as by id.

- **Checks that bet on a roll.** One check named a raider up front and assumed
  a one-in-ten mark landed on them. It passed only because the brand bug was
  shifting the RNG stream, and broke the moment the bug was fixed. Adopt
  whichever body the mechanic actually chose.
- **Long-lived ground breaks the rendercheck stand-ins**, which flee anything
  within `radius + 20` and will flee forever if it never expires, pressing
  nothing.
- **The Warden is a fixture for unrelated checks.** Spec parity, autocast
  cadence and the mashing comparison are all measured on Warden pulls, so
  changing a Warden rung moves three checks that have nothing to do with the
  mechanic.
- **Icon colours must not collide.** rendercheck enforces it.
- **Removing a mechanic from a boss** breaks checks that assumed that boss
  owned two particular things at once.
- **Do not chase a peak in a tuning sweep.** A 60-run sweep showed 32pp at one
  setting with 25 and 26 either side; at 120 runs it was 27. Take the middle
  of a plateau.

## The battlefield, as measured

- The raid clusters at radius 90-125 from the boss. The arena is 460, so most
  of it is empty ground.
- Bodies at rest sit about 30 apart.
- The boss moves during 2% of the fight. The tank holds it.
- Boss-to-tank distance averages 52 and is over 70 for 1% of the time.
- Melee range 52, spell range 340, pool radius 92.
- **There is a threshold.** At ten-man heroic, 1937 total damage per body
  kills nobody and 2645 wipes the raid. One mechanic's room is about half a
  health bar per person.

## Every place a mechanic has to be wired

    encounters.ts  MechanicId / MECHANIC_NAMES / MECHANIC_SCALES /
                   PhaseTiming field / lines field and a line per boss /
                   cadences in each boss's phase 1-3 and opening tables
    types.ts       SimState.next<Name> timer / GroundKind if it is ground /
                   AuraId if it is an aura
    state.ts       initial timer value in both state constructors
    boss.ts        schedule<Name>() and its call / a branch in the ground loop
    sim.ts         aura expiry, if it needs any
    ai.ts          a consider() entry in currentDanger, and candidate spots
                   -- or, if the answer is not a walk, an entry in whichever
                   other channel carries it, and a pair of fields of its own
                   on AiProfile: the channels must not share a slot, since a
                   real pull asks all of them at once
    draw.ts        a draw function if it is ground
    icons.ts       boss_<name>, in a colour nothing else uses
    rendercheck.ts an entry in DRAWN, plus assertions of its own

`brand` is the worked example that touches all of them.
