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

/** Everyone within this radius of a spread target takes the hit. */
export const SPREAD_RADIUS = 110

export const ENRAGE_AT = 240
export const PHASE_TWO_HP = 0.7

export const MANA_REGEN_PER_SEC = 9

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
 * Reach of everything cast from a distance, and of the hunter's bow.
 *
 * One number rather than two: a band where a hunter's shots land but its
 * weapon does not would read as a bug, not as a rule.
 */
export const SPELL_RANGE = 340
