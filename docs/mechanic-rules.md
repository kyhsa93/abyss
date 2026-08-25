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
    hand         9.2      93%
    echo         6.6      100%
    verdict      6.0      57%
    shockwave    5.2      84%
    crush        3.3      97%
    brand        2.0      69%
    puddle       0.5      83%
    rot, sunder, spread, sweep, adds -- indistinguishable from nothing

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

**Granularity, independently of throughput.** Holding the rate fixed at 0.48 a
second and changing only the clumping: one every 9 seconds taught 13pp, four
every 18 taught 29pp, six every 27 taught 15pp. A trickle asks nobody to
decide anything and a downpour has no answer. This is a lever of the same size
as rate, and rule 2 does not cover it.

**Not damage, past a point.** Raising a hit from 700 to 1000 left the gap flat
between 26 and 29pp. Once one hit is close to lethal, damage stops being a
teaching lever; cadence and how long the hazard stays are what remain.

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
    ai.ts          a consider() entry in currentDanger, and candidate spots
    draw.ts        a draw function if it is ground
    icons.ts       boss_<name>, in a colour nothing else uses
    rendercheck.ts an entry in DRAWN, plus assertions of its own

`brand` is the worked example that touches all of them.
