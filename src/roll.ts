/**
 * One stream of chance, with a state you can write down.
 *
 * `Math.random()` was called from fifteen places and none of them could be
 * reproduced.  That is two problems rather than one.
 *
 * The first is the save.  A save that does not carry the stream's position is
 * a save you can reload to re-roll a drop you did not like — load, open the
 * chest, load again — and that is not a rule anybody wrote down, it is a
 * consequence of forgetting one number.
 *
 * The second is the checks.  A hit table is a distribution and a distribution
 * is only testable if you can run the same twenty thousand rolls twice.
 *
 * The generator is mulberry32: thirty-two bits of state, four operations, and
 * a period long enough that a single character will never see the end of it.
 * It is not cryptographic and does not need to be — what it needs is to be one
 * number and to be written down.
 */
let state = (Date.now() ^ 0x9e3779b9) >>> 0

/** A number in [0, 1), and the stream moves on. */
export function roll(): number {
  state = (state + 0x6d2b79f5) >>> 0
  let t = state
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** An integer in `[lo, hi]`, inclusive, which is what most callers wanted. */
export const between = (lo: number, hi: number): number =>
  lo + Math.floor(roll() * Math.max(1, hi - lo + 1))

/** Where the stream is, for the save. */
export const seed = (): number => state
export function reseed(to: number) { state = to >>> 0 }
