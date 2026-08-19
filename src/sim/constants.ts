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
