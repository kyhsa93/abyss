/** Simulation runs on a fixed timestep so results stay reproducible. */
export const TICK_RATE = 30
export const DT = 1 / TICK_RATE

/** Circular arena centred on the origin. */
export const ARENA_RADIUS = 320

export const GLOBAL_COOLDOWN = 1.5

/** Cast bars break if the caster moves further than this while casting. */
export const CAST_MOVE_TOLERANCE = 2

/** Everyone within this radius of a spread target takes the hit. */
export const SPREAD_RADIUS = 90

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
export const MELEE_RANGE = 46
