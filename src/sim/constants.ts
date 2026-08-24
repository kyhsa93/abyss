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
