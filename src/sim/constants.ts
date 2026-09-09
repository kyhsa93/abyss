/** Simulation runs on a fixed timestep so results stay reproducible. */
export const TICK_RATE = 30
export const DT = 1 / TICK_RATE

/**
 * Circular arena centred on the origin.
 *
 * Everything else here is expressed relative to it: widening the floor without
 * widening ability ranges just moves the party out of range of each other.
 *
 * Doubled from four hundred and sixty, and the sentence above is the whole
 * reason that is a real change rather than a rendering one. The mechanics that
 * are written as a fraction of the room — the wedge, the split, the ring —
 * grew with it and ask the same question of a bigger floor. The
 * distances that are written as numbers did not: a bow still reaches as far as
 * it reached, a step still covers what a step covers, and a body walking out
 * of something still walks at the speed it always walked. So the room is twice
 * the room and the party's reach into it is what it was, which is what makes
 * space something a raid has to spend rather than something it has.
 */
export const ARENA_RADIUS = 920

/**
 * How many units a yard is, and it is read off the building rather than picked.
 *
 * The source measures everything in yards, and this game turns out to have been
 * built to that yardstick without ever writing it down: the first fight's floor
 * is ninety-four and a half yards across in the source — measured off the plan
 * that game draws of the floor, calibrated against a distance in its own
 * scripts — and eighteen hundred and forty units across here. So a yard is
 * 19.47 units, and read at that scale the rest of it lands where it should. A
 * spread mark is five and a half yards. A soak is seven. Those are the numbers
 * the source's own fights are written in.
 *
 * It is here so the things that were *not* built to it can say so in the same
 * unit: a body, a boss, and how far a melee reaches. See `PARTY_RADIUS`.
 */
export const YARD = ARENA_RADIUS * 2 / 94.5

/**
 * How wide the thing the raid is fighting is.
 *
 * Nine and seven tenths of a yard, which is the model geometry of the first
 * boss read out of the game's own data — a box 9.69 across against a
 * character's 0.95. It was five yards here, half of it, and a melee's standing
 * ring was measured from the middle of it rather than the edge, so the raid
 * fought from inside the boss.
 */
export const BOSS_WIDTH = Math.round(9.69 * YARD)

export const GLOBAL_COOLDOWN = 1.5

/**
 * The seconds every telegraph is given back, and the shortest one allowed.
 *
 * Every warning time in this game was tuned against the party that plays it,
 * and that party is not a person. A raider's `reactionDelay` is a quarter of a
 * second, a tenth off that by a ninth pull, and it covers the whole of
 * noticing: the AI sees a shape appear and begins walking out of it inside
 * three tenths of a second, every time, without ever having to work out which
 * shape it was.
 *
 * A person does not have that. Noticing something appeared, recognising which
 * of a dozen mechanics it is, deciding where the answer is and starting to
 * move is half a second before a foot leaves the ground, and that is for a
 * mechanic already learnt. The first time it is longer, which is the case
 * that matters most, because a fight nobody can read is a fight nobody can
 * learn.
 *
 * So the tuned numbers are correct and were left where they are — every sweep
 * written against them still says what it says — and the difference between a
 * raider's reflexes and a person's is granted here, once, where it can be
 * seen and argued with.
 *
 * Four tenths, which is a person's half-to-two-thirds of a second against the
 * quarter the roster rolls.
 *
 * Added rather than floored, and this is the part worth defending. A floor at
 * one global was the first draft, on the reasoning that no warning should be
 * shorter than the game's own unit of action. It is the wrong shape twice
 * over: moving costs no global, so a dodge never had to abandon a press in the
 * first place; and a floor deletes the difference between every count below
 * it. The split gives longer than the crush because it asks for a longer walk,
 * the drowning longer still — three numbers a tenth apart that a floor makes
 * one number, and with them the reason each was chosen. A constant added to
 * all of them moves the whole shelf and leaves every gap on it exactly where
 * it was.
 *
 * One mechanic is left out of it on purpose. See `CHANT_CAST`.
 */
export const NOTICE_GRANT = 0.4

export function readable(tuned: number): number {
  return tuned + NOTICE_GRANT
}

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
export const SOAK_TELEGRAPH = readable(5)

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
 * How briskly the raid takes its position during the count.
 *
 * Faster than it fights, because it is not fighting: this is the walk from the
 * doorway to where everybody agreed to stand, and at fighting pace a room the
 * size of the first one takes eight seconds of watching. Nothing is at stake
 * during it — no timers run, the boss has not moved — so the only thing the
 * pace decides is how long the count is.
 */
export const MUSTER_PACE = 1.7

/**
 * Warning time before a puddle detonates.
 *
 * This is the dial that decides whether reaction time matters. Too long and
 * even a distracted AI strolls out in time, which flattens the personalities
 * into identical competence.
 */
export const PUDDLE_TELEGRAPH = readable(1.6)

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
export const CRUSH_TELEGRAPH = readable(1.1)

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
export const FAULT_TELEGRAPH = readable(1.15)

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
export const SHALLOWS_TELEGRAPH = readable(1.15)

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

/**
 * How close a melee gets, past the edge of what it is hitting.
 *
 * Five yards, which is the source's, and it is measured from the target's own
 * surface rather than from the middle of it — a thing with a nine-yard body
 * cannot be reached at five yards from its centre. It was fifty-two units from
 * the centre, which is two and two thirds yards *inside* a boss.
 */
export const MELEE_RANGE = 97

/**
 * How far away a bow needs its target.
 *
 * A drawn bow has a near edge that a spell does not: the hunter is the one
 * ranged class that cannot simply stand on what it is shooting. Just outside
 * melee, and just inside where the party AI already keeps its ranged.
 */
export const SHOT_MIN_RANGE = 156

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
export const SCHISM_TELEGRAPH = readable(1.5)

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

/**
 * How fast a body turns, in radians a second.
 *
 * Slower than a wrist and faster than the boss, which turns at 2.6 and is a
 * building. Nothing is decided by a bearing today -- the mechanic that was is
 * gone -- so what this buys is that the drawing does not snap: a body that
 * changed target would otherwise be facing the new one on the same frame it
 * decided to, which reads as the raid twitching rather than turning.
 */
export const TURN_RATE = 3.2

/**
 * How wide a body is, and it is measured rather than chosen.
 *
 * The world is already built to the source's own yardstick: the first fight's
 * floor is ninety-four and a half yards across in the source and eighteen
 * hundred and forty units here, which puts a yard at 19.47 units — and read at
 * that scale the rest of the game comes out where it should. A spread mark is
 * five and a half yards, a soak is seven. Those are the numbers that raid is
 * written in.
 *
 * A body was not. Thirty-four units across is one and three quarter yards,
 * where a character in the source measures 0.95 by its own model geometry —
 * near enough double. Everything that felt wrong about the scale is that one
 * number: a room half the size it should be measured in bodies, a boss barely
 * three times a body across, a melee range under three yards. The rooms were
 * right all along.
 *
 * Eighteen units across is 0.92 of a yard.
 */
export const PARTY_RADIUS = 9
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
export const TOLL_TELEGRAPH = readable(1.7)
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
export const GRASP_TELEGRAPH = readable(1.7)
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
export const REFUGE_TELEGRAPH = readable(2.2)
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

/**
 * How fast the drowned choir's drum runs.
 *
 * Here rather than beside the mechanic because the mark's own life is written
 * in beats of it — see `AURA_DURATION.echo` — and a mechanic whose two halves
 * live in files that import each other has nowhere to put the number they
 * share.
 */
export const ECHO_BEAT = readable(1.05)

/**
 * How long the enrage stays the number it was tuned as before it escalates.
 *
 * See the enrage in `combat.ts`. Long enough that every pull which resolves
 * resolves inside it.
 */
export const ENRAGE_GRACE = 30

/**
 * What a melee carrier pays for a raid cooldown, as a fraction of the count
 * everybody else pays.
 *
 * See `beginCast`. Two thirds, which over a three-minute pull is one extra
 * call from a roster with melee in it — enough to be a reason to bring one,
 * small enough that a raid of nothing but melee is not a different game.
 */
export const MELEE_CALL = 0.67

/**
 * The cold line: how far apart its patches sit, how many there are, how wide
 * each one is, how long the line takes to travel one step, and what standing
 * in a patch costs.
 *
 * The shape is the mechanic. A bearing is rolled off the boss and the floor
 * lights along it one patch at a time, so what a person sees is a line
 * crawling outward and what they answer is a single circle about to reach
 * them. Every other travelling shape in this game is a ring that asks the
 * whole raid to move at once; this asks one wedge of the room to step aside
 * while the rest of it carries on hitting.
 *
 * It begins outside the boss's own edge, which is what makes melee range the
 * safe place to be. That is deliberate and it is the point: the mechanic it
 * replaced on this ladder billed melee for standing where their job is, and
 * showed them nothing at all while it did.
 */
export const COLDFLAME_STEP = 52
export const COLDFLAME_REACH = 9
export const COLDFLAME_RADIUS = 44
export const COLDFLAME_CRAWL = 0.17
export const COLDFLAME_TELEGRAPH = readable(0.9)
/**
 * How long a patch holds the floor it took.
 *
 * Long enough to be a line rather than a row of moments. Outside a storm it is
 * also short enough that the floor comes back before the next cast is due,
 * which is the whole of the mechanic's promise there: one wedge steps aside,
 * the room carries on, and a second later the room is whole again.
 */
export const COLDFLAME_LINGER = 1.6

/**
 * How much of a hit a turned body keeps out while the fight is holding it.
 *
 * Not toughness for its own sake -- it is the window the decision needs. A
 * turned mind is a target now, and twenty-five raiders take a raider's health
 * bar off in about a second, which is inside the time it takes anybody to
 * notice: measured with no guard at all, the raid killed every single one of
 * its own, first pull and ninth alike, and a demand nobody can pass is no
 * better than one nobody can fail.
 *
 * The number is what the curve says rather than what sounded right. Measured
 * over a hundred turned bodies, twenty-five heroic, unpractised against
 * practised:
 *
 *     kept out    first pull    ninth pull
 *     none          20 / 20       19 / 20
 *     0.60          14 / 20       10 / 20
 *     0.75          12 / 20        7 / 20
 *     0.85           5 / 20        1 / 20
 *
 * At the low end the raid is a firing squad and practice barely shows; at
 * 0.85 an unpractised raid kills one of its own about a quarter of the time
 * and a practised one almost never, which is a rung rather than a tax. The
 * fight is holding this body and does not want it dropped in a second either.
 */
export const TURNED_GUARD = 0.85

/**
 * The same cold while the boss is spinning, which is a different mechanic
 * wearing the same patch.
 *
 * Outside a storm the line is one bearing, aimed, and gone before the next --
 * a question asked of one wedge of the room. Inside a storm the boss is not
 * facing anybody, and the original answer to "what does a thing that has
 * stopped being tanked do with a line" is: all of them at once, over and over,
 * turning as it goes, until the floor is a lattice you have to pick through
 * while the thing that made it chases somebody across it.
 *
 * Three arms, because two is a road and four is a grid, and a beat under the
 * time a patch holds -- so a cast is still burning when the next one crosses
 * it, which is the picture. Turning between casts rather than repeating, so
 * the lattice is one and not three lines drawn over themselves.
 *
 * The storm keeps its own damage and this keeps the line's, and neither is
 * raised for the other: what changes in a storm is how much of the floor is
 * spoken for, not what standing in it costs.
 */
export const COLDFLAME_ARMS = 3
export const COLDFLAME_STORM_BEAT = 2.6
export const COLDFLAME_STORM_LINGER = 4.2
/** How fast the fan turns between casts, in radians a second. */
export const COLDFLAME_SPIN = 0.7

/**
 * The blight, and the two mechanics made out of it.
 *
 * The room fills with something the whole raid is breathing, the boss drinks
 * it, and then gives it back. Three mechanics that are one idea, which is why
 * `REQUIRES` will not let a fight throw the later ones without the earlier.
 *
 * The numbers are a trade written as a subtraction. Every breath the boss
 * takes removes a share of what the room is doing to the raid and adds to what
 * the boss is doing to whoever it is hitting -- so the fight visibly gets
 * easier to stand in and harder to survive, and nobody is asked to do anything
 * about it. What it is for is the third one: the breath out returns everything
 * taken, at once, to everybody.
 */
export const BLIGHT_TICK = 19
export const BLIGHT_RELIEF = 0.3
/**
 * How many breaths it can hold.
 *
 * Three, and the cap is not decoration. Without it the count only ever comes
 * down when the boss breathes out — so a fight that bought the breath in and
 * not the breath out is a boss that gets faster and harder for as long as the
 * pull lasts, with nothing in the game able to stop it. That is a real
 * configuration: the ladder sells the fifth rung to a twenty-five man on
 * normal and the sixth only on heroic, and measured, normal read 8% won
 * against heroic's 73% — the easier setting being the harder fight, because
 * the harder one had the release valve.
 *
 * `REQUIRES` says the breath out needs the breath in. It cannot say the
 * reverse: that would make the fifth rung buy the sixth and leave the sixth
 * buying nothing. So the cap is what makes the pair safe to sell apart.
 */
export const INHALE_MAX = 3
/**
 * And how many it may hold when nothing in the kit can make it let go.
 *
 * `INHALE_MAX` above says the cap is what makes the breath in and the breath
 * out safe to sell on separate rungs. It is not, and the number that says so
 * is a straight measurement of the same fight with the breath in switched off:
 *
 *   cell            breath in on    off
 *   10 heroic            15%       100%
 *   25 normal             5%        35%
 *
 * Those are the two cells that buy the breath in and not the breath out, and
 * they are the two that move. Three breaths is +66% on the swing and a swing
 * timer at 0.74 of its own -- the body holding the boss takes two and a
 * quarter times the melee, for the rest of the pull, and nothing anybody does
 * takes it off. The cap stops it climbing; it does not make it a mechanic.
 *
 * So the cap asks the kit. With a way to let go, it may hold three and the
 * fight is the one it was written as: fill up, and then give it all back at
 * once. Without one, it holds a single breath -- the trade is still there and
 * still legible (the room thins, the tank's bill grows) and it stops being a
 * buff the raid cannot answer.
 */
export const INHALE_HELD_ALONE = 1
export const INHALE_POWER = 0.22
export const INHALE_HASTE = 0.12
export const PUNGENT_PER_BREATH = 470
/** What standing in a spore when it burst is worth against the breath out. */
export const INOCULATED_SHARE = 0.35
/** How close a body has to be to catch a spore, and to catch the reek. */
export const SPORE_REACH = 150
export const REEK_REACH = 130
/**
 * The swelling, and the stack it becomes lethal on.
 *
 * Nine is the answer and ten is the price, which is the whole mechanic: the
 * count is public, it climbs on a clock, and the raid either swaps in time or
 * loses the body holding the boss and whoever was standing near it. The one
 * demand in this game answered by a job rather than by a place.
 */
export const BLOAT_BURST_AT = 10
/**
 * The stack the other tank takes it on.
 *
 * One before the burst, which is what makes the count a decision rather than a
 * countdown: it is public from the first stack and there is exactly one beat
 * where the swap is both possible and necessary.
 */
export const BLOAT_SWAP_AT = BLOAT_BURST_AT - 1
export const BLOAT_POWER = 0.09
export const BLOAT_BURST = 4200
export const BLOAT_SPLASH = 190

/**
 * The storm: how far it reaches, what it costs, and how fast it charges.
 *
 * The reach is wide and the bill is worst at the middle.
 *
 * Flat inside it was the first shape, on the argument that a bill scaled to a
 * distance is a bill everybody pays some of. That reading holds for a mechanic
 * whose whole judgement is the gradient; it does not hold here, because the
 * pass and the fail are still binary -- outside the reach is nothing at all,
 * and the gradient only says how badly you failed once you are inside it. What
 * it buys is the thing a flat bill could not: a raid at the edge is nearly out
 * and a raid in the middle is being killed, so "get away" has a direction and
 * a degree rather than being one step over a line.
 *
 * `STORM_BITE` is what is left at the very edge. Full weight at the centre,
 * that fraction at the rim, straight line between.
 *
 * The speed is the boss's own, undiminished, and that is the whole argument
 * for the number. At eighty-two percent it was a hundred and forty-three
 * against a roster that walks between a hundred and fifty-five and a hundred
 * and seventy-five, so every class in the game outran it in a straight line
 * and the pick was answered by noticing it. Undiminished, nobody walks out
 * from under it, and what is left to decide is the thing worth deciding:
 * where you already were when it looked at you, and which way you drag it.
 *
 * The bill is two hundred and sixty rather than the two hundred and ten it
 * was carrying while the raid could not answer it at all. Measured across
 * both fixes, that number is a cliff rather than a slope -- at three hundred
 * and forty a twenty-five man wins four percent of its pulls and at four
 * hundred and twenty it wins none -- because the reach holds six of them at
 * once and the bill is not divided. Two hundred and sixty is the last value
 * where a twenty-five man loses pulls and still learns its way out of them.
 */
export const STORM_REACH = 260
export const STORM_TICK = 260
export const STORM_BITE = 0.35
export const STORM_SPEED = 1.0
/**
 * How long the storm keeps aiming at the same body.
 *
 * Five seconds, which over its twenty-four is four charges. Re-picking every
 * tick would mean it never really aims at anybody — a body one step further
 * out would turn it, and what a raid is deciding has to hold still long enough
 * to be worth deciding.
 *
 * Counted on the aura's `beat`, never on its `tickTimer`. See `Aura.beat`:
 * written on the wrong one this fired zero times in a pull and the storm was
 * one charge and then a boss standing still.
 */
export const STORM_REPICK = 5

/**
 * The Deathwhisper's numbers.
 *
 * Read together they are one fight rather than seven mechanics: the volley is
 * the floor everything else is measured against, the shard is what that floor
 * becomes if nobody cuts it, and the rest are ways of taking something the
 * raid was relying on — the ground under it, the tank's hold, one of the
 * summons' harmlessness, and finally one of the raid.
 */
export const DECAY_RADIUS = 105
export const DECAY_LINGER = 26
export const DECAY_DAMAGE = 240
/** The cast the tank cannot survive twice, and the window to cut it in. */
export const FROSTBOLT_CAST = readable(1.9)
export const FROSTBOLT_DAMAGE = 2600
export const VOLLEY_DAMAGE = 300
/** How close a shade has to be, and how fast it follows. */
export const SHADE_REACH = 90
export const SHADE_SPEED = 0.72
/** What the slight takes off the tank's hold. */
/**
 * What one slight takes off the hold, and how many the tank has before the
 * hold is gone.
 *
 * A count rather than an event, which is what the original is: it lands every
 * few seconds and at five the tank generates nothing at all, so it is a clock
 * that forces a swap rather than an accident that happens to cost one. Written
 * as a single application it was the second: one fact, arriving every
 * twenty-four seconds, that the other tank answered once and forgot.
 *
 * Off the rate rather than off the pile. Struck off what a tank has already
 * banked, one slight handed the boss straight to the other tank -- so the
 * count never reached two and there was nothing to decide. Off what it makes
 * from now on, the tank falls behind visibly and the raid swaps when it reads
 * that, which is the mechanic.
 *
 * A fifth of the rate each, five of them, so the last one leaves exactly
 * nothing: a tank told often enough that it does not matter cannot hold
 * anything at all.
 */
export const SLIGHT_SHARE = 0.2
export const SLIGHT_MAX = 5
/** What coming back wrong is worth, in damage and in health. */
export const EMPOWER_POWER = 2.1
export const EMPOWER_HEALTH = 1.6

// --- the gorged one, which is paid in what the raid lets happen -------------

/**
 * How wide a spill is, and what it costs whoever is in it.
 *
 * A hundred and twenty is a real walk from where a raid stands at rest. The
 * party keeps about thirty units off one another when nothing is happening, so
 * a radius that only just cleared that would be a mechanic answered by
 * standing still, which is a mechanic answered by nothing.
 *
 * The bill is per body and does not divide: a spill that split its damage
 * between whoever was caught would pay a raid for bunching up, which is the
 * opposite of what it is for.
 */
export const SPILL_RADIUS = 120
export const SPILL_DAMAGE = 760

/**
 * The line a festering wound comes off at.
 *
 * High, and that is the mechanic. A dot that fell off at half health would be
 * answered by the healing a body in trouble gets anyway; at eighty-five
 * percent the answer is a heal on somebody who is *fine*, which is the only
 * shape a reaction delay can be late for. Rule 3, stated from the other end.
 */
export const FESTER_LINE = 0.8

/**
 * What the wound takes when it lands, as a share of the body's own bar.
 *
 * Without it the mechanic could not happen. A wound that comes off above the
 * line and lands on somebody at full health comes off on the tick it landed:
 * measured over a full pull it ticked a tenth of a time, cost nothing, fed the
 * gauge nothing, and asked no healer for anything. The line is only a demand
 * if the body is under it, so the wound puts them there and the answer is to
 * lift them back out.
 *
 * A quarter, which is a body at full health landing well under the line and
 * nowhere near danger. What it costs is a heal that was going to somebody
 * else, which is the whole of what this mechanic is for.
 *
 * The pair of numbers matters more than either of them. The line has to sit
 * inside what a healer tops people up to anyway -- `topOffFor` is 0.82 for a
 * steady one -- or the answer is outside the rotation's own habits and the
 * wound runs its whole term every time, which is a bill rather than a
 * mechanic. It did: at a line of 0.85 every wound in the fight ticked all
 * twelve times.
 */
export const FESTER_BITE = 0.25

/**
 * How far the boss throws whoever it has swallowed, and what it costs.
 *
 * The radius is fixed and the room is not: this is the one demand on the
 * gorged one that a bigger raid meets exactly as a smaller one does, because
 * what it covers is a place rather than a share of the roster.
 */
export const GORGE_RADIUS = 150
export const GORGE_BURST = 900

// --- the confluence, which asks about the geometry between its own bodies ---

/**
 * The spray: a cone off the big arm, and the only ordinary demand this fight
 * makes.
 *
 * Deliberately ordinary. Five of the six rungs above it are about what the
 * fight's own bodies are doing to each other, and a boss whose every demand is
 * a new idea is a boss with nothing a player already knows how to answer.
 */
export const SPRAY_HALF_WIDTH = 0.7
export const SPRAY_RANGE = 420
export const SPRAY_DAMAGE = 640
export const SPRAY_CAST = readable(1.7)

/**
 * The infection: a dot whose expiry is a place rather than a number.
 *
 * What it costs while it runs is small and what it costs when it ends depends
 * on where the body wearing it was standing, which is the whole mechanic. The
 * healing it refuses is what makes the healer's timing a decision: taking it
 * off early is a choice about where the next small thing is born.
 */
/**
 * What the infection ticks for, which is small and has to be.
 *
 * The bill is not the mechanic: what it costs is a third of every heal aimed
 * at the carrier and a body on the floor where they were standing. At
 * seventy-five it was the largest single bill in the fight -- five hundred
 * ticks across a twenty-five man pull -- and a dot that big is answered by
 * healing rather than by walking, which is the mechanic replaced by its own
 * side effect.
 */
export const INFECTION_TICK = 45
export const INFECTION_HEALING = 0.35

/**
 * The health a carrier has to be taken to for it to burn out early.
 *
 * This is the healer's half of the mechanic and the reason it is a decision
 * rather than a dot. Left alone it runs its fourteen seconds and the small
 * thing is born wherever the carrier has ended up; pushed to full it ends
 * *now*, where they are standing now, which is a place somebody chose.
 *
 * Full rather than a line partway up, because the choice has to cost
 * something: a third of every heal aimed at that body is refused while it
 * runs, so ending it early is a real spend out of a healer who has a raid to
 * keep up. A cheap version of this is a mechanic that always ends early and
 * therefore never asks anything.
 */
export const INFECTION_FLUSH = 0.98

/** What one of the small things is, which is deliberately almost nothing. */
/**
 * What one of them hits for, which has to be almost nothing.
 *
 * The mechanic is a judgement rather than a bill: what the raid decides is
 * which of them to kill, which to leave, and which two must not meet. That
 * only holds while leaving one alone is cheap. At ninety-five a five-man died
 * to the small things themselves in every pull -- which is a fight about
 * damage wearing a fight about geometry's clothes.
 *
 * It is multiplied by what the thing has eaten, so the answer to a big one is
 * still to kill it, and the answer to a small one is still to watch it.
 */
export const OOZE_DAMAGE = 50
/**
 * How much health one of them has, per body in the raid.
 *
 * Not "how long does it take to kill" -- it is "does it survive being stood
 * next to". At forty a small thing died to the white damage of whoever it
 * walked at, so a ten-man never had two of them alive at once and the mechanic
 * the fight is built on could not happen at all below twenty-five. Killing one
 * has to be a thing somebody decided to do.
 */
export const OOZE_HP_PER_BODY = 120
export const OOZE_SPEED = 0.55

/**
 * How close two of them have to be, and what a merged one is worth.
 *
 * Seventy is a little over three body widths: close enough that two walking at
 * the same person will find each other, and far enough that a raid watching
 * for it has somewhere to stand between them.
 *
 * Five is where it stops being a body and becomes an event. The count is drawn
 * on it, so the raid is answering a number it can read rather than a size it
 * has to judge.
 */
export const MERGE_REACH = 70
export const MERGE_BURST_AT = 5
export const MERGE_BURST_REACH = 200
export const MERGE_BURST_DAMAGE = 2400

/**
 * How many of the small things may be alive at once, whatever the headcount.
 *
 * Rule 5, and the one place this fight could have broken it. What a bigger
 * raid should meet is a harder geometry, not an unanswerable one -- twelve of
 * them on a twenty-five man is not a geometry, it is noise. The roster buys
 * them more often instead, which is the same pressure with an answer still
 * attached.
 */
export const OOZE_CAP = 8

/**
 * The flood: ground that spreads from the boss and slows what stands on it.
 *
 * It hurts nobody, and rule 1 says that on its own it teaches nothing -- which
 * is true and is not what it is for. What it does is make the geometry
 * expensive to fix late: a raid that sees two of them converging with ten
 * seconds to spare can walk between them, and one that sees it with three
 * cannot, because the floor in between is slow.
 *
 * The small things are slowed by it too. Without that it would be a tax on the
 * raid rather than a fact about the room, which is a different mechanic
 * wearing this one's name.
 */
export const FLOOD_REACH = 340
export const FLOOD_SPREAD = 12
export const FLOOD_LINGER = 30
export const FLOOD_SLOW = 0.6

/**
 * The engulfing: what the boss does with the small things nobody cleared.
 *
 * A tank swap made out of this fight's own material. Every other stack in this
 * game is a thing the boss does on a clock; this one is the dealers' mistake
 * arriving on the tank, which is what makes the swap a consequence rather than
 * a chore.
 */
export const ENGULF_REACH = 150
export const ENGULF_POWER = 0.12
export const ENGULF_MAX = 8
export const ENGULF_BURST = 3800
export const ENGULF_BURST_REACH = 170

// --- the two flasks, which ask for two answers on one clock -----------------

/**
 * The caustic pool: the ordinary demand, and the one that narrows the room.
 *
 * Its residue is long on purpose. The other two demands on this fight are
 * about *where the raid can be standing* -- a circle everybody has to reach
 * and a body that has to keep walking -- and floor that stays for twelve
 * seconds is what turns three separate questions into one.
 *
 * The bill is split the way rule 1 asks: a large binary hit at the instant it
 * lands, and a rate afterwards for anybody who stayed. The instant is the
 * mechanic; the rate is the consequence.
 */
export const CAUSTIC_RADIUS = 95
export const CAUSTIC_TELEGRAPH = readable(1.4)
export const CAUSTIC_LANDING = 900
export const CAUSTIC_TICK = 170
export const CAUSTIC_LINGER = 8

/**
 * The hound: a thing that cannot be killed, walking at one body.
 *
 * Slower than a person, so walking opens the gap and standing closes it, and
 * the whole of what it asks is that one named body keep moving for
 * twenty-two seconds. It has no health because a killable one would be
 * answered by turning the damage round, which is a different mechanic and one
 * this fight already has nowhere to put.
 */
export const HOUND_REACH = 75
export const HOUND_TICK = 280
export const HOUND_SPEED = 0.78

/**
 * The gathering: everybody inside one circle, and the bill divided by whoever
 * came.
 *
 * Five seconds is the longest count in the game, and it is long for one
 * reason: the circle lands on the hound's quarry and follows them while it
 * counts. Twenty-five people can walk to a moving point in five seconds. They
 * cannot in three, and in eight the quarry has crossed the room and the circle
 * means nothing.
 */
export const GATHER_RADIUS = 160
export const GATHER_TELEGRAPH = 5
/**
 * What the gathering costs, per body in the raid rather than in total.
 *
 * The pot is the roster's size times this, and it is divided by whoever
 * actually stood in the circle -- so a raid that all came pays this each,
 * whatever size it is, and a raid that half came pays double each. A flat pot
 * would be the same mechanic at twenty-five and an execution at five: nine
 * thousand split five ways is eighteen hundred a head and split twenty-five
 * ways is three hundred and sixty, which is rule 4 arriving through the
 * arithmetic instead of through the demand.
 *
 * Nobody at all pays the whole pot each, at every size, which is the failure
 * state and is meant to be one.
 */
export const GATHER_PER_BODY = 460

/**
 * The flasks: a long count on a small circle, which is the fight's one demand
 * answered by being early.
 *
 * Everything else here is answered by reacting. This is answered by walking
 * away from something that will not matter for another fifteen seconds, which
 * is the one thing a reaction channel cannot express -- see `walkEarly` in
 * `ai.ts`, which is the channel written for exactly this.
 *
 * Standing on one holds its count. That is not a mercy: it is what makes a
 * flask a place somebody has to spend time in rather than a timer everybody
 * walks away from and forgets.
 */
export const DECANT_RADIUS = 110
export const DECANT_COUNT = 20
export const DECANT_DAMAGE = 5200
export const DECANT_TICK = 220

/**
 * The reagent: the boss drinking its own work, and the tank paying for it.
 *
 * Seven, and the swap is at six. The count is public on the tank from the
 * first one, so what the raid is answering is a number it can read rather
 * than a surprise.
 */
export const REAGENT_POWER = 0.11
export const REAGENT_MAX = 7
export const REAGENT_BURST = 4000
export const REAGENT_BURST_REACH = 160

// --- the sludgeworks, whose floor is part of the fight ----------------------

/**
 * The slime that rises at the edge of the sludgeworks, and never in the
 * middle.
 *
 * A room mechanic rather than a boss's, which is why it is carried at every
 * size rather than sold on a rung: what it does is take away the outside of
 * the floor for a while, and a room that is smaller for a five-man than for a
 * twenty-five is a different room rather than an easier one.
 *
 * Two numbers hold rule 5 down. The middle never floods, so there is always
 * somewhere to be; and the arc is capped so that what is covered at any one
 * moment stays under a third of the floor. Area denial super-scales, and a
 * flooded room with merging bodies in it is a moment with no answer in it.
 */
export const SLIME_PATCH = 210
export const SLIME_ARC = 4
export const SLIME_DRY = 300
export const SLIME_TELEGRAPH = readable(1.8)
export const SLIME_LINGER = 10
export const SLIME_TICK = 190

// --- the three crowns, of which one is real --------------------------------

/**
 * How long the crown takes to move, and how long between moves.
 *
 * Four seconds of warning, and the warning names the body it is going to
 * rather than merely saying that something is about to change: a raid that
 * cannot see where it is going cannot be late for it, and a raid that cannot
 * be late for it is a raid this measures nothing on.
 */
export const CROWN_TELEGRAPH = 4

/**
 * What the two bodies without the crown take out of whoever stands near them.
 *
 * The half of this fight that makes all three bodies matter. Standing where
 * the raid wants to stand -- around the one it can actually hurt -- is only
 * free if the other two are somewhere else, and the crown moves every
 * forty-five seconds, so where the raid may stand moves with it.
 *
 * It heals the shared bar rather than only billing the raid, because a bill is
 * the healers' problem and a heal is everybody's: a rotation nobody answered
 * costs the pull its progress rather than a body its health.
 */
export const THIRST_REACH = 170

/**
 * What a second of being drunk from costs the body it is drinking from.
 *
 * Small, and it has to be: two of the three bodies are always drinking, so
 * this is the one bill in the fight that is running whenever anybody has
 * mispositioned -- which, in a room whose three stations are nine hundred
 * units apart, is most of the time for a five-man. At three hundred and forty
 * it killed every raid at every size before the boss reached half.
 *
 * What the mechanic is for is the *heal* it gives the boss, not this: this is
 * only what stops the raid ignoring it.
 */
export const THIRST_TICK = 150
/**
 * What a second of drinking gives back, as a share of the whole bar.
 *
 * A share rather than a fraction of the bill, and the difference is the sort
 * of thing this codebase learns the hard way: what a mechanic bills is written
 * in one currency and what a raid deals is written in another, so "it heals
 * half of what it drinks" turned out to mean "it heals faster than a ten-man
 * can damage it" -- the bar went *up* for the eighty seconds after the first
 * rotation and no size could finish the fight.
 *
 * A tenth of a percent a second, and two mouths, so a minute of nobody
 * noticing is about an eighth of the fight given back.
 */
export const THIRST_HEAL = 0.0011

/**
 * The thing that must not reach the floor.
 *
 * Two of them, always, whatever the headcount -- rule 5 -- and the answer is
 * damage rather than movement, which is what makes it fight the rotation for
 * the same hands. Hitting it sends it back up; ignoring it costs everybody
 * inside two hundred and forty units.
 */
export const BALLAST_FALL = 22
export const BALLAST_REACH = 240
export const BALLAST_DAMAGE = 3600
export const BALLAST_LIFT = 6

/**
 * The grain, and what carrying one is worth.
 *
 * The one errand in this game handed to the body whose job is to stand still.
 * It appears next to a body without the crown, which is inside the thirst, so
 * fetching it costs the tank exactly the thing the raid is trying to avoid.
 */
export const NUCLEUS_REACH = 40
export const NUCLEUS_LIFE = 18
export const NUCLEUS_HOLD = 14
export const NUCLEUS_GUARD = 0.6

/**
 * The stillness, and what a step costs while it is on.
 *
 * The only demand in this game answered by *not* walking, and it climbs with
 * the seconds spent walking so that one step is cheap and a crossing is not.
 * What it asks is not that the raid stand still -- the fight is still throwing
 * things that have to be left -- but that it choose which steps are worth
 * paying for.
 */
export const PRISON_TICK = 120

/**
 * How far the climb goes before it stops climbing.
 *
 * Six seconds, which is a body that has crossed the room. Uncapped it is not a
 * mechanic, it is a rule that says the last body walking dies -- and the fight
 * asks the raid to spend some of this deliberately, so what it costs has to be
 * something a raid can decide to pay.
 */
export const PRISON_CAP = 6

// --- the crimson gift, which is a handoff with its sign flipped -------------

/**
 * The gift, and the two clocks that make it one.
 *
 * Every handoff in this game has been a debt: somebody takes it because it has
 * to be taken. This one makes the body holding it stronger, and passing it
 * leaves *both* of them holding one -- so the raid's own success is what fills
 * the room with them.
 *
 * Two clocks rather than one, and that is the difference between a mechanic
 * and an ambush. The first sixty seconds are the gift; the ten after it are
 * the warning, and during those ten everybody -- the holder included -- knows
 * that this body is now a problem. A version that simply turned hostile at the
 * end of the first clock would be a mechanic with no telegraph, which is the
 * one thing every other demand in this game has.
 */
/**
 * How far the gift is handed, which is a touch.
 *
 * Off the body rather than written down, because what the mechanic says is
 * "touch somebody": three radii is two bodies side by side with a little
 * between them, about a yard and a half.
 *
 * It was fifty-five units, and that number was chosen while the raid stood
 * bunched inside a boss drawn at half its size. Measured against the ring a
 * raid actually stands on now — off a nine-and-a-half-yard boss — fifty-five
 * reaches a neighbour every single time, and a handoff that never fails is a
 * mechanic that never fires: the build caught the fight no longer throwing its
 * own last rung. At a touch it fails often enough to be a thing you go and do.
 */
export const GIFT_REACH = PARTY_RADIUS * 3
export const GIFT_POWER = 0.45
export const GIFT_LEECH = 0.2
export const GIFT_LIFE = 60
export const GIFT_SOURING = 10

/**
 * The bond, and how far two bodies may be from each other.
 *
 * It exists to pull against the gift: the gift says go and find somebody
 * clean, and this says do not leave your partner -- and when the same body
 * has both, the two demands point in different directions, which is the
 * hardest moment in the fight and the reason both are on the ladder.
 */
export const BOND_REACH = 200
export const BOND_TICK = 3
export const BOND_LIFE = 18

/**
 * What a doubling leaves on the floor.
 *
 * The one piece of ground in this game made by the raid rather than by the
 * boss. Its answer is not walking out of it -- it is *choosing where to stand
 * when passing*, which is a decision taken a full minute before the floor
 * exists.
 */
export const STAIN_RADIUS = 120
export const STAIN_TICK = 290
export const STAIN_LIFE = 35

/**
 * The flight: fourteen seconds in which there is nothing to hit.
 *
 * The storm is the nearest thing this game has and it is not close: a storming
 * boss has let go and is walking, and it can still be hit. This one cannot be
 * touched at all, which is why the enrage on that fight is the shortest on the
 * roster -- four flights is fifty-six seconds of a raid doing no damage.
 */
export const FLIGHT_LIFE = 14
export const FLIGHT_TICK = 35
export const FLIGHT_REACH = 300
export const FLIGHT_LANDING = 1400
/**
 * How long the circle she is coming down into is on the floor before she is.
 *
 * Five seconds rather than three, and the difference is twenty-five bodies:
 * the landing covers three hundred units of a room eight hundred across, so
 * what it asks is that the whole raid cross most of a radius. At three
 * seconds -- plus a reaction delay -- that is not a demand, it is a bill, and
 * measured it took a twenty-five man from sixty-three percent health to two
 * bodies alive inside half a minute.
 */
export const FLIGHT_WARNING = 5

/**
 * The crimson: a raid-wide hit that costs what the raid has been enjoying.
 *
 * This is what closes the fight. The first rung says pass it and it doubles;
 * this one says every doubling is on the bill, so how many to run is a
 * decision the raid makes and then pays for on a thirty-three second clock.
 */
export const CRIMSON_BASE = 420
export const CRIMSON_PER_GIFT = 230
export const CRIMSON_CAST = readable(2.2)
