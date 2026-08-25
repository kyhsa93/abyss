/** Simulation runs on a fixed timestep so results stay reproducible. */
export const TICK_RATE = 30
export const DT = 1 / TICK_RATE

/**
 * Circular arena centred on the origin.
 *
 * Everything else here is expressed relative to it: widening the floor without
 * widening ability ranges just moves the party out of range of each other.
 */
export const ARENA_RADIUS = 460

export const GLOBAL_COOLDOWN = 1.5

/**
 * A crit, on the party's own damage only.
 *
 * Not on what the boss deals: incoming damage is the healers' problem, and a
 * boss that occasionally hits for half again as much makes that a coin toss
 * rather than a job. On the party's side it is the opposite — it gives the
 * hits a reason to sometimes look bigger than they are, and the floating text
 * has had a `crit` kind waiting for one since before there were crits.
 */
/**
 * Rage for arriving.
 *
 * A charge is how a warrior opens a pull with something to spend, which is
 * the answer to a resource that starts at nothing.
 */
export const CHARGE_RAGE = 25

export const CRIT_CHANCE = 0.15
export const CRIT_MULTIPLIER = 1.5

/** Everyone within this radius of a spread target takes the hit. */
export const SPREAD_RADIUS = 110

/**
 * The circle the whole party has to be standing in, and how long it gives.
 *
 * Wide enough that twenty-five people fit and small enough that getting there
 * costs the melee their uptime and the casters a cast. Five seconds is about
 * two of those, which is the price of the mechanic.
 */
export const SOAK_RADIUS = 135
export const SOAK_TELEGRAPH = 5

/**
 * What the circle costs each of you when all of you stand in it.
 *
 * Per person rather than a flat total divided by the soakers, which is how it
 * was first written and which spirals: a flat total keeps its size as people
 * die, so a party down to two takes half of it each, which kills them, which
 * makes it worse for whoever is left. The share is measured against how many
 * are *alive* instead — everybody in is this number whatever the size of the
 * raid, half in is double it, and the multiplier stops at four so a circle
 * nobody reached is a disaster rather than an extinction.
 */
export const SOAK_EACH = 80

/**
 * The thing that picks somebody and walks after them.
 *
 * Slower than anybody it hunts, so it is always kiteable and never a death
 * sentence; heavy enough on contact that being caught is a real mistake; and
 * carrying enough health that killing it is a decision rather than a formality
 * — which is the other half of the mechanic, since the rest of the party has
 * to choose between the boss and the thing chasing their healer.
 */
export const STALKER_HP = 1400
export const STALKER_SPEED = 118
export const STALKER_DAMAGE = 240
export const STALKER_SWING = 1.4

/** How long it keeps looking before it gives up and comes apart. */
export const HUNT_DURATION = 16
export const SOAK_MAX_SHARE = 4

/**
 * Seconds between arriving on the floor and the pull starting.
 *
 * A fight that begins on the frame the screen appears begins before anyone has
 * found their own token, and the first thing this one asks is where you are
 * standing. Time does not pass during it: `s.time` and the boss script both
 * start at zero afterwards, so an encounter is the same length whether or not
 * a countdown ran in front of it.
 */
export const COUNTDOWN = 3

/**
 * The same, in ticks, which is what the state actually counts.
 *
 * Subtracting a thirtieth of a second ninety times leaves six ten-thousandths
 * of a femtosecond behind rather than zero, so a float count ends a tick late
 * and the sound that says go lands on the wrong one. Ticks are what the rest
 * of the simulation is measured in anyway.
 */
export const COUNTDOWN_TICKS = COUNTDOWN * TICK_RATE

/**
 * Warning time before a puddle detonates.
 *
 * This is the dial that decides whether reaction time matters. Too long and
 * even a distracted AI strolls out in time, which flattens the personalities
 * into identical competence.
 */
export const PUDDLE_TELEGRAPH = 1.6

/**
 * Warning time before the floor around the boss caves in.
 *
 * Shorter than a puddle's on purpose. A puddle is a place you walk away from
 * and this is a place the whole melee half of the raid is already standing
 * in, so the question is not whether they noticed but whether they noticed
 * *in time* — and this is the only dial that decides that.
 *
 * It is also the whole mechanic, and it is steep. The walk out is fifty units
 * and about a third of a second, so what is left over is what a reaction has
 * to fit inside, and measured against a ten-man heroic the entire mechanic
 * lives in two tenths of a second:
 *
 *   0.95  forty-two points of teaching, and forty-five percent of a first
 *         pull dead — a wipe mechanic
 *   1.10  twenty-one points, twenty-three percent dead, ninety-five percent
 *         of first pulls still won
 *   1.15  fourteen points, and sixteen percent — an unpractised raid strolls
 *         out of it about as reliably as a practised one
 *
 * The middle one, which is a first pull that is punished and a ninth that is
 * not, rather than either a formality or a wall.
 */
export const CRUSH_TELEGRAPH = 1.1

/**
 * Warning time before half the floor gives way.
 *
 * The crush's dial, against a longer walk, and it behaves the same way: the
 * whole mechanic lives inside two tenths of a second. The crush asks for a
 * step of fifty units; this asks for however deep into the condemned half a
 * body was standing, which for a raid operating at ninety to a hundred and
 * twenty-five from the boss is about sixty-five on average and twice that at
 * the back. What is left of the count after the walk is the window a reaction
 * fits inside, and that window is the mechanic.
 *
 * Swept against a ten-man heroic, twenty pulls a step, as the share of an
 * unpractised raid dead against a practised one — and every row of it taken
 * while an isolated mechanic still got the one-rung tempo, so read the shape
 * of the column rather than the heights. The rows are comparable with each
 * other because they were all wrong by the same factor; none of them is
 * comparable with anything measured since.
 *
 *   1.35  4.5% against 1.0% — a formality; the raid strolls across
 *   1.15  23.5% against 1.5%
 *   1.05  45.5% against 4.0%
 *   0.95  61.5% against 9.5% — a wipe mechanic
 *
 * The second, which is where the crush's own dial sits and for the same
 * reason: a first pull that is punished and a ninth that is not. Re-taken at
 * the cadence the mechanic actually has, two hundred and fifty paired pulls
 * put that setting at 8.6% against 0.4% — 8.3 points, and 96% of the deaths
 * there were to remove. That is second in the field behind the cone's 21.4,
 * and the sweep would want re-running before anybody moved the dial off it.
 */
export const FAULT_TELEGRAPH = 1.15

/**
 * Warning time before everything except the shallows goes under.
 *
 * The same shelf as the split's, and the honest finding here is that this is
 * *not* the dial this mechanic turns on. Shortening it from 1.15 to 1.05 left
 * an unpractised raid at exactly the same figure and cost a practised one
 * half a point — because what fails here is not the walk, it is the noticing:
 * a fumble is a second and a half late whatever the count says, and everybody
 * who noticed at all had time to reach a patch.
 *
 * What moved it was volume. The death rate in this game is a step function of
 * total mechanic damage per body — the measured line is 1937 for no deaths at
 * all and 2645 for a wipe — so a mechanic landing under that line reads as
 * teaching nothing however cleanly it separates the pulls. Three settings, as
 * damage totalled per body across a pull and then the pulls dead, unpractised
 * against practised, all three at the doubled tempo an isolated mechanic used
 * to be given, so again: the column has a shape and the heights are stale.
 *
 *   every 20s, 850, a count of 1.90   448 a body    0.0% against 0.0%
 *   every 12s, 1000, a count of 1.35  1581 a body   3.5% against 0.0%
 *   every 10s, 1000, a count of 1.15  2278 a body  16.5% against 0.5%
 *
 * The separation was there the whole way down — even the first setting was
 * catching an unpractised raid three times as often as a practised one — and
 * none of it reached the number the probe reads until the total crossed the
 * line.
 *
 * At the real cadence the third setting lands about half that per body, and
 * two hundred and fifty paired pulls put it at 2.5% against 0.0%: 2.4 points,
 * and 98% of the deaths there were to remove. Mid-field on points, between
 * the crush and the brand, and near the top of the field on the share — which
 * is the pair of columns this mechanic was always going to sit oddly across,
 * because most of what it costs a raid is the walk and the probe cannot see
 * uptime.
 *
 * Which is the thing worth writing down for the next one of these: check what
 * the mechanic totals per body before concluding anything about its shape.
 */
export const SHALLOWS_TELEGRAPH = 1.15

/**
 * How much floor each shallow leaves standing, and how many of them there are.
 *
 * Small enough that the raid cannot stand where it already was — three
 * patches of this size sit inside the ring the raid operates on and cover
 * something under half of it — and large enough that a patch holds a raid of
 * twenty-five, since nothing in this game collides and a patch that could not
 * would be a lie told by the picture rather than a mechanic.
 */
export const SHALLOWS_RADIUS = 78
export const SHALLOWS_COUNT = 3

/**
 * How close the weight has to be carried before it changes hands.
 *
 * Narrow on purpose. Wide enough and the handoff happens by accident: this
 * party clusters, so anything much past a hundred units means the burden is
 * answered by standing where you already were, and a mechanic whose answer is
 * to keep doing what you were doing is not a mechanic. This is about two
 * thirds of a melee's reach, so it is a deliberate walk into somebody.
 */
export const BURDEN_REACH = 62

/**
 * How many fresh pairs of hands it takes before the weight is spent.
 *
 * Three rather than one. One is a pass, and a pass is over the moment it
 * happens; three is a chain, and a chain is the thing that has to be kept
 * going while the rest of the fight carries on underneath it. It is also what
 * makes the memory on the aura matter — by the third leg the raid has run out
 * of the people standing nearest and has to go and find somebody.
 */
export const BURDEN_HANDS = 3

/**
 * What a burden costs whoever is still holding it when the fuse runs out.
 *
 * Scaled by how far along the chain it got, so the raid pays most for the
 * handoff it nearly finished. Dropping the weight on the first leg is a
 * mistake; dropping it on the third is a mistake that wasted everybody's
 * walk, and it should read that way.
 */
export const BURDEN_DAMAGE = 900
export const BURDEN_PER_HAND = 0.55

/** What carrying it costs in speed, on top of everywhere else you have to be. */
export const BURDEN_SLOW = 0.86

/**
 * How close you have to stand to take a share of somebody else's yoke.
 *
 * Wider than the burden's reach and narrower than the gathering's circle. The
 * gathering is a place, so it can afford to be found from across the arena;
 * this is a person, and a person who is still moving, so the radius has to be
 * something a raid can hold around a body rather than a target it walks to
 * once and stands in.
 */
export const YOKE_REACH = 45

/**
 * What a yoke costs each of the two when the one who was called for came.
 *
 * Two of them and nobody else, which took three shapes to arrive at. The first
 * divided a fixed total among everyone standing close enough, and a fixed
 * total is the wrong shape for the same reason the gathering's was: the raid
 * pays it whatever it does, so practice can move the distribution and never
 * the bill. The second priced it per head against how many turned up, which
 * fixes the spiral but not the bill — everyone nearby still pays, so the
 * mechanic's sustained cost rises with how well it is answered, and the only
 * way to make it affordable was to run it so rarely that a pull barely
 * contained it. Measured, both wiped a practised raid as reliably as an
 * unpractised one at every number that made carrying it alone lethal.
 *
 * Billed to the pair instead, the sustained cost is two of these however many
 * bodies happen to be standing around, which is what lets it come round often
 * enough to be worth learning. The rest of the raid is not being asked to pay;
 * one of them is being asked to go.
 */
export const YOKE_SHARE = 105

/**
 * What it costs the one who owes it when nobody came.
 *
 * A dealer's whole health bar, near enough. It has to be, because this is the
 * only hit in the fight that is charged to somebody who did nothing wrong: the
 * carrier cannot fetch its own bearer and cannot pay less by playing better,
 * so if it is survivable then looking away is free and the mechanic is a
 * suggestion. What makes it fair is that it is loud, it is slow, and the
 * person who has to answer it is named.
 */
export const YOKE_ALONE = 1500

/** Melee actors need to be this close to their target to swing. */
export const MELEE_RANGE = 52

/**
 * How far away a bow needs its target.
 *
 * A drawn bow has a near edge that a spell does not: the hunter is the one
 * ranged class that cannot simply stand on what it is shooting. Just outside
 * melee, and just inside where the party AI already keeps its ranged.
 */
export const SHOT_MIN_RANGE = 90

/**
 * Reach of everything cast from a distance, and of the hunter's bow.
 *
 * One number rather than two: a band where a hunter's shots land but its
 * weapon does not would read as a bug, not as a rule.
 */
export const SPELL_RANGE = 340

/**
 * What a health bar is worth, everywhere.
 *
 * Every ability in the game was numbered against a boss: forty-six to
 * fifty-eight thousand health, five people, a couple of minutes. That works
 * out to about sixty-five damage a second each, and sixty-five a second is
 * nothing at all against the four thousand a player used to carry — over a
 * minute of being hit without pause to kill one. A battleground never gives
 * anyone that minute, and the ones measured before this spent two thirds of
 * their length with nobody in range of anybody, so a match killed a player
 * under twice and the fights on the point decided nothing.
 *
 * The gap was never a balance choice. It is that the receiving end of those
 * numbers had only ever been a boss: a raider dies to a mechanic, one
 * enormous hit, and a battleground has no mechanics, so sustained damage is
 * the whole of it and it has to be able to finish the job.
 *
 * So the bar moves for everyone rather than for one mode. What that costs is
 * that everything else denominated in health bars has to move with it or the
 * raid changes underneath us, and three things are: healing, the flat part of
 * a tank's mitigation, and every point of damage the fight itself deals. All
 * three are scaled at their own funnel, which is why the raid tables come out
 * the same on either side of this number and the battleground does not — the
 * one thing deliberately left alone is what a player's abilities do, and in a
 * battleground that is all there is.
 */
export const HEALTH = 0.45

/** A health bar, in the units the rest of the game is written in. */
export function bar(hp: number): number {
  return Math.round(hp * HEALTH)
}

/**
 * How long the raid gets to come apart into its groups.
 *
 * Shorter than the walk it pays for looks like it should allow. The answer
 * here is a place rather than a line, and a place two hundred units away is a
 * second and a quarter at a walk — but the split is cut where the raid is
 * already standing, so nobody walks the whole radius: each group shuffles
 * outward along the bearing it already held, which is nearer a hundred and
 * ten.
 *
 * At two and a tenth, with random marks and a walk across the arena, a
 * practised raid still lost a fifth of its bodies and an unpractised one was
 * indistinguishable from it — the walk was so long that everybody was late
 * and lateness stopped meaning anything. Cut where they stand and counted
 * down faster, the same two numbers separate the pulls again.
 */
export const SCHISM_TELEGRAPH = 1.5

/**
 * How far apart the groups have to be before they count as apart.
 *
 * Wide enough that the raid's own resting shape never satisfies it — the
 * whole party stands inside a circle of about this radius — so the answer is
 * always to break up and never to stand still and be lucky.
 *
 * And narrower than `SCHISM_APART` by enough to hold a group. Two muster
 * points three hundred and eighty apart with this much room demanded around
 * every body leaves ninety-five a side for the group itself to spread over,
 * which is about what a third of a raid occupies. Set any closer to the
 * separation and the mechanic stops being a question about the formation and
 * becomes one about how tightly the groups happen to have bunched.
 */
export const SCHISM_ROOM = 190

/**
 * How far apart the groups are asked to stand.
 *
 * The separation rather than the radius the groups stand on, so that the
 * arrangement says one thing at every size. Muster points placed at a fixed
 * distance from the boss get closer to each other the more of them there are
 * — three of them on a ring are only a bit over one and a half times that
 * radius apart, against twice it for a pair — so a twenty-five man would have
 * been asked to fit a third group into a gap that had shrunk by the same rule
 * that added it. Written this way the ring grows instead, and the gap between
 * groups is the same wherever the raid is cut.
 *
 * It is not, on its own, what made the mechanic performable at twenty-five —
 * that was cutting the groups where the raid already stands rather than
 * dealing them at random, and the measurement is in `scheduleSchism`. This is
 * the rule that keeps the geometry honest once the cut has been made.
 */
export const SCHISM_APART = 380

/**
 * How close to its own muster point a group counts as gathered.
 *
 * Loose enough that a group is a group rather than a single tile everybody is
 * standing on — the arrangement being asked for is several crowds, not several
 * points — and tight enough that a body still drifting between two of them is
 * not finished walking.
 */
export const SCHISM_MUSTER_ROOM = 80
