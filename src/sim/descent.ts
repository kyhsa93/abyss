import { ENCOUNTERS } from './encounters'

/**
 * How far down you got.
 *
 * A raid is a fight you learn by repeating it, which is the opposite of a run:
 * there is nothing to carry forward and nothing to lose. The descent is the
 * other shape — one attempt, boss after boss, each harder than the last, and
 * the party arrives at the next one in whatever state it left the last.
 *
 * No power is gained on the way down. That is the same rule the rest of the
 * game keeps: what improves between attempts is you, not a number on a
 * character. What the depth buys is a story worth telling — eleven floors is a
 * different sentence from four — and one number to beat.
 */

/**
 * Boss health, as a multiple of its own, at this depth.
 *
 * The first floors are deliberately below a raid's: a run that ends on floor
 * one most of the time is not a run, it is a raid with the retry button taken
 * away. It passes an ordinary pull's difficulty around the third floor and
 * keeps going from there.
 */
export function descentHealth(depth: number): number {
  // Zero is not a floor: an ordinary raid asks for none of this and must get
  // the boss it was tuned against. Reading `depth || 1` here instead handed
  // every raid in the game the first floor's numbers — a boss with 42% of its
  // health, which the harness would have caught and the eye would not.
  if (depth <= 0) return 1
  return 0.7 + (depth - 1) * 0.085
}

/** And what it hits for. Softer than the health: a wall is not a lesson. */
export function descentDamage(depth: number): number {
  if (depth <= 0) return 1
  return 0.82 + (depth - 1) * 0.025
}

/** Which boss a floor holds. They come round in order and keep coming. */
export function descentEncounter(depth: number): number {
  return Math.max(0, (depth - 1) % ENCOUNTERS.length)
}

/**
 * What the party gets back between floors.
 *
 * Not a full heal — then every floor is the first floor and the depth is only
 * a health bar on the boss. Not nothing either: a party that ends a floor at
 * ten percent has already lost the next one, and being told so a minute later
 * is not a decision, it is a wait.
 */
export const DESCENT_RECOVERY = 0.55

/** One of the fallen comes back on each floor, at a fraction of their health. */
export const DESCENT_REVIVE = 0.45
