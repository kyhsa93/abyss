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

// --- the three whose answer is an instant ----------------------------------
//
// Everything above this line is a shape and a step. What follows is the same
// telegraph-then-judge machinery with the shape taken out: the count runs, and
// at the instant it lands what is read is not a position but what a body was
// *doing*. That is the only reason the three are grouped -- they cost the same
// thing, which is the part of a rotation that fits inside the count, and none
// of them can be answered by walking.

/**
 * How long the vigil counts before it seals.
 *
 * Set from the crush rather than invented. The crush warns for 1.1 seconds
 * against a step that costs 0.31, and its length is the steepest dial in the
 * game: a tenth shorter is a wall and a twentieth longer is a formality. What
 * this asks costs `VIGIL_HELD` instead of a step, so the count is that plus
 * about the same slack the crush leaves over -- long enough that a reaction
 * delay fits inside it and short enough that it does not fit twice.
 */
export const VIGIL_TELEGRAPH = 1.3

/**
 * How long a body has to have been doing nothing before the vigil passes over
 * it.
 *
 * Read off the global cooldown rather than chosen: a rotation presses
 * something the instant the global is up, so "did you press anything recently"
 * is exactly `gcd > GLOBAL_COOLDOWN - this`. At 0.45 the demand is to have
 * stopped a little under half a second before it lands, which is one
 * hesitation and not a plan.
 */
export const VIGIL_HELD = 0.45

/**
 * How long the chant runs before it lands on everybody.
 *
 * The first number here was 2.1, on the reasoning that one body's roll is
 * riskier than a whole raid's and should be given room. Measured, it was cut
 * 12.6 times a pull and failed 0.1 times -- an unpractised raid answered
 * essentially every note, and the mechanic taught 0.8 points with a bar
 * wider than the figure.
 *
 * The cause is that the answer has no duration. A pool is answered by a step
 * that takes 0.31 seconds, so the count has to hold a delay *and* a walk; a
 * note is answered by a press, so the whole count is slack. What sets this
 * number is therefore the delay alone, and it is set just inside the range a
 * greedy raider rolls on its first pull and outside the one it rolls on its
 * ninth.
 */
export const CHANT_CAST = 1.25

/**
 * How much slower noticing your own name is than noticing fire.
 *
 * The judgement needed the same idea and needed six of it: reading a raid
 * frame, deciding whose problem somebody else's health bar is, and re-aiming
 * is not a sidestep. This is the smaller version of the same argument. The
 * mark is on you and the answer is one press, so most of the delay is real
 * reaction -- but a debuff appearing on your own frame is still a thing that
 * has to be read rather than seen underfoot.
 *
 * It was put in for a measured reason and the reason is worth keeping. At a
 * flat delay every personality answers a note without a fumble, so the whole
 * gap came from the mistake roll and the mechanic was a probe of one of the
 * two skill numbers rather than of both. Doubled, the greedy raider's own
 * delay crosses the count on a first pull and clears it on a ninth, which is
 * what the count is supposed to be measuring.
 */
export const CHANT_NOTICE = 2

/** How long the gaze holds open before it takes whoever is still watching. */
export const GAZE_TELEGRAPH = 1.2

/**
 * How far off the boss's bearing counts as looking away.
 *
 * A wide arc rather than a narrow one, so that the answer is a turn and not a
 * pixel. Sixty degrees off is unmistakably not watching, and it is reached in
 * a third of a second at `TURN_RATE` -- which leaves the same kind of slack
 * inside `GAZE_TELEGRAPH` that a step leaves inside the crush's count.
 */
export const GAZE_ARC = 1.05

/**
 * How fast a body turns, in radians a second.
 *
 * Slower than a wrist and faster than the boss, which turns at 2.6 and is a
 * building. What the number is actually for is to stop the answer being free:
 * a turn that resolved on the tick it was decided would make the gaze a pure
 * reaction-delay probe with no cost of its own, and every mechanic here is
 * supposed to bill something.
 */
export const TURN_RATE = 3.2
/**
 * The plate somebody has to stand on, and how long the raid has to send them.
 *
 * Laid out past where the raid operates rather than under it. A price nobody
 * has to walk to is a price the raid pays by standing where it already was,
 * which is the shape the first handoff had and the reason it measured at
 * nothing: this party is a blob ninety units across and anything drawn on top
 * of it is answered before it is read. Out at a hundred and seventy-five,
 * along the bearing the nominee already holds, it is a deliberate journey
 * away from the fight and back and it is the same length every cast.
 *
 * The count is what a journey of that length needs and no more. Walking clear
 * of something takes about a third of a second and a reaction fits in what is
 * left over; this is a walk of a hundred units or so at about a hundred and
 * sixty a second, which is most of a second on its own, so the count has to
 * carry that walk plus the room for noticing late.
 *
 * Two tenths shorter than it was, and the shortening is the whole of what
 * this mechanic has: at 2.0 it read 2.5pp at ten, 0.8 at twenty-five and
 * nothing at all at five, and at 1.7 it reads 2.8 / 0.6 / 2.2, which is real
 * at every size. What moved was the miss rate rather than the payload, which
 * is what the arena notes say to expect -- the telegraph is the lever and the
 * damage is not. What it cost is the share: 85% of the deaths were practice's
 * to remove at 2.0 and 57% at 1.7, because a shorter count turns some of the
 * misses into ones nobody could have made.
 */
export const TOLL_TELEGRAPH = 1.7
export const TOLL_RADIUS = 66
export const TOLL_RANGE = 175

/**
 * What the toll costs the one who went, and what it costs everybody when
 * nobody did.
 *
 * Flat rather than a share of a bar, which is the whole of the choice. A
 * fixed number is a different fraction of every body in the raid, so the
 * nomination is a real decision — send the one with the most left and it is a
 * heavy hit, send the one the last three mechanics have already worked on and
 * the toll finishes them. The raid picks whoever can currently afford it, and
 * a raid that cannot afford it anywhere is a raid that has already lost this
 * one.
 *
 * And the two numbers are the two bad outcomes, priced against each other.
 * Paying is cheap per pull because one body pays it; not paying is dearer per
 * pull because all of them do. That ordering is the reason practice has
 * anything to remove, and it was not the first arrangement tried: with the
 * paid branch at 760 the raid was billed eleven times a pull whatever it did,
 * the plate was missed as often on a ninth pull as on a first, and the whole
 * thing measured 6.0pp with a 16.1 bar around it. A mechanic whose *answered*
 * branch is expensive bills a practised raid the same total as a green one,
 * however well it is played, which is the shape that has already been
 * measured and thrown away twice here.
 *
 * The unpaid hit lands on the one body that was asked to go and did not, and
 * that is the correction this mechanic exists to record. It was a hit on
 * every living body first, and it produced the raid-wide signature exactly:
 * 13.0pp at twenty-five, 7.6 at ten and 0.8 with a 3.7 bar at five, which is
 * nothing -- a rate against a roster, absorbed by a big one and lethal to a
 * small one with no size in between. On a slope like that the damage number
 * never settles either: 900 bought 2.9pp, 1400 bought 7.6 and 1900 bought
 * 20.2, still climbing, because what was being raised was everybody's bill.
 *
 * Written to the named body, the mechanic reads 2.8 / 0.6 / 2.2 at ten,
 * twenty-five and five -- smaller everywhere and real at all three rather
 * than at one. It also means the number here has one job: to be past the top
 * of a health bar, so that being asked and not going is fatal. Anything above
 * that changes nothing, which is what the arena notes say about damage.
 */
export const TOLL_PRICE = 320
export const TOLL_UNPAID = 3400

/**
 * How far the grasp reaches, and how long it is coming.
 *
 * A wide circle on a short count, which is the opposite way round from the
 * plate above and for the opposite reason. Nobody has anywhere to be: what it
 * asks is that the ground it named is not the ground you are standing on when
 * it closes, and the raid clusters, so the circle has to be wider than the
 * crowd or it is asking one person a question.
 */
export const GRASP_TELEGRAPH = 1.7
export const GRASP_REACH = 118

/**
 * What it takes, and how much worse everybody else's slowness makes it.
 *
 * Billed whole to one body rather than divided among the ones it caught. A
 * total split between whoever is standing in it is the shape that goes into
 * the raid unchanged however well it is played -- it has been measured twice
 * here, on the gathering and on the yoke's first draft, and both times a
 * practised raid was wiped as reliably as a green one. Concentrated instead,
 * the sustained cost is one hit a cast whatever the headcount, and what
 * practice moves is the size of it.
 *
 * Capped, because the multiplier is the part that could run away. Six bodies
 * caught at twenty-five would otherwise bill one of them for six, which is
 * not a lesson, it is an execution.
 *
 * The payload is on a plateau, which is what a bill written to one body does:
 * 2100 measured 22.5pp and 2600 measured 25.6, error bars overlapping, so the
 * lower of the two is taken. What the number actually has to do is be lethal
 * to a body the fight has already worked on and survivable by one it has not,
 * and 1600 against a dealer's bar is that. The teaching is in the count and
 * in how many bodies were still inside, not here.
 */
export const GRASP_DAMAGE = 1600
export const GRASP_PER_HEAD = 0.5
export const GRASP_CAP = 3.0

/**
 * The stones, and the room on one.
 *
 * Exactly as many as it marks, so a raid that divides itself correctly pays
 * nothing at all. That is deliberate and it is the difference between this
 * and a mechanic that cannot be practised: one stone short and somebody dies
 * on every cast however well it was answered, which puts a fixed bill into
 * the raid and leaves practice nothing to take out.
 *
 * Small enough to hold one. Nothing in this game collides, so what makes a
 * stone hold one body is the rule that only the nearest of the marked keeps
 * it -- the radius is what says how precisely a body has to arrive, not how
 * many can stand there.
 */
export const REFUGE_TELEGRAPH = 2.2
export const REFUGE_RADIUS = 46
export const REFUGE_RING = 175

/**
 * What being crowded out costs.
 *
 * Heavy, because it is the only thing the mechanic does: a raid that sorted
 * itself takes none of this, so the number is not a per-pull tax, it is the
 * price of one body being in the wrong place at one instant.
 */
export const REFUGE_DAMAGE = 3700
