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
    chant       19.1      97%     collapses to 0.2 at twenty-five; see below
    burden       9.8      70%     over-scales; see below
    hand         9.2      93%
    spire        9.0      67%
    fault        8.3      96%
    gaze         7.0      51%     rises to 11.0 at twenty-five
    yoke         6.7      75%
    echo         6.6      100%
    verdict      6.0      57%
    shockwave    5.2      84%
    crush        3.3      97%
    vigil        2.5      46%
    shallows     2.4      98%
    brand        2.0      69%
    puddle       0.5      83%
    rot, sunder, spread, sweep, adds -- indistinguishable from nothing

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

3. **The answer has to route through `consider()` in ai.ts.** Reaction delay
   and mistake chance live there and nowhere else. `isSpotSafe` is
   skill-independent, so a mechanic answered entirely by it cannot be
   practised and will measure zero however lethal it is.

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

**Not damage, past a point.** Raising a hit from 700 to 1000 left the gap flat
between 26 and 29pp. Once one hit is close to lethal, damage stops being a
teaching lever.

**And not how long the hazard stays, either.** Over a fourfold range at 250
pairs each -- 6s 8.7pp, 10s 9.0, 16s 7.8, 24s 10.0 -- linger sat inside its
own error bar. What teaches is the instant it lands, not the ground it leaves.
This one is worth knowing because it kills a whole family of design pitches:
"where will still be floor a minute from now" is a good sentence and not a
measurable mechanic. Pick a linger for what a long one costs the rest of the
game, not for what it buys.

**The boss more than the mechanic.** The same code taught 26pp on one boss and
16 on another, and made the first unbeatable at every difficulty while leaving
the second fair. Floor denial multiplies badly against a boss whose other
rungs all say *stand somewhere specific* -- the cone's blind side, the ring's
gap -- and it was still a wipe with damage cut to 300, so the cause is the
denial, not the payload. A boss with no shape of its own absorbs it.

**For anything involving a second person:** a name that is recomputed is not a
name -- asking "who is furthest" every tick meant the answer changed as soon
as the bearer took two steps, and 32 casts a pull resolved with the carrier
alone. And a commitment that ends when it is met is not a commitment: bearers
that stopped reacting on arrival walked home and were outside again by the
time it mattered.

## A demand can be a moment rather than a place

Twenty-one mechanics in and every one of them was answered by standing
somewhere else. That is not a property of the genre, it is a property of this
AI: `consider()` ranks dangers, and the only thing reacting to one ever did was
run `findSafeSpot`. Three mechanics were built to test whether the other half
of raiding measures -- interrupt it, hold your rotation, turn your back -- and
all three are `real`.

    vigil    hold your rotation      2.5pp    46%   0.9 at 25, 0.0 at 5
    chant    one named body cuts    19.1      97%   0.2 at 25, 0.0 at 5
    gaze     turn away             11.0*      95%   *at 25; 7.0 at 10, 2.7 at 5

Five things came out of building them, and three of those change how a
mechanic should be read rather than how one should be written.

**A non-positional answer needs its own branch, or it is answered by a
sidestep.** The reacting path picks a tile, re-picks it when the tile goes bad,
and drops whatever cast the walk would have broken. Run a "stop doing things"
demand through that and it is satisfied for free by the walk it did not ask
for. The three above are split off before the movement branch, and the vigil's
whole answer is `useAbilities` never being reached -- a refusal cannot be
expressed as something the rotation presses.

**Do not define the danger by the failure it causes.** The obvious way to write
the vigil is to raise it only for a body that would be caught if it landed now.
That oscillates: the moment such a body holds, its danger clears; the moment
its danger clears it presses again, and the pair re-roll a reaction delay every
few ticks until one happens to land inside the count. The danger has to be the
*count*, so that the delay is rolled once and what it decides is whether the
answer started in time. This is the schism's "a formation is not a step" one
step further on -- there the danger had to outlive the nearest problem, here it
must not be defined by the problem at all.

**Set the count against what the answer costs, not against the count you liked
the sound of.** The doc already says the telegraph is the steepest dial; what
it did not say is what the dial is measured against. A pool's 1.6 seconds holds
a 0.31-second walk and a delay. A note is answered by a press, which takes no
time at all, so the whole count is slack and the count is therefore a direct
probe of `reactionDelay`. Written at 2.1 seconds the chant was cut 12.6 times a
pull and failed 0.1 times -- an unpractised raid answered essentially every one
-- and taught 0.8pp with a bar wider than the figure. At 1.25 seconds, inside
the range a greedy raider rolls on a first pull and outside the one it rolls on
a ninth, the same code teaches 19.1. Nothing else about it changed.

**`MECHANIC_SCALES` says what is dealt per head. It does not predict how a
mechanic plays at size, and the two can point opposite ways.** All three of
these deal nothing per head and all three are `false`. Measured at ten and at
twenty-five on the same boss, the gaze goes 7.0 -> 11.0 and the note goes
19.1 -> 0.2. The difference is granularity against the healing budget: the gaze
asks every body a separate question every nine seconds, so its cost tracks the
headcount and outruns the healers, while the note is one enormous raid-wide
spike two or three times a pull, and whether a spike kills anybody is a
question about how much a raid of that size can absorb. Coarse mechanics get
easier with bodies and fine ones get harder, whatever the column says.

**A five-man heroic can read exactly zero because nobody dies at all, which is
not the same as the mechanic being absent.** The vigil and the note both
measured 0.0% dead on *both* attempts at five. The diagnostic shows the vigil
being thrown and failed there; there was simply nothing left for a death rate
to express. Isolation compresses the points column, and at five it can compress
it flat -- at which point the share-removed column has no denominator either
and both columns say nothing rather than saying no.

**Use `scripts/momentprobe.ts` before believing a zero.** A gap of nothing has
two causes that the gap cannot tell apart: a demand nobody is failing, and a
demand everybody is failing for too little to matter. It prints casts a pull,
failures a pull and damage taken per body, and it is the reason the chant is in
this file at 19.1 rather than discarded at 0.8. Failure counts still may not be
used to argue a mechanic is alive -- only to explain why it is not.

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
    ai.ts          a consider() entry in currentDanger, and candidate spots --
                   or, if the answer is not a position, a branch of its own
                   before the movement one
    draw.ts        a draw function if it is ground
    icons.ts       boss_<name>, in a colour nothing else uses
    rendercheck.ts an entry in DRAWN, plus assertions of its own

`brand` is the worked example that touches all of them.
