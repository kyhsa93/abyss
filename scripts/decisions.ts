import type { PlayerInput, SimState } from '../src/sim/types'

/**
 * The decisions a fight asks for, as policies `decideprobe` can play.
 *
 * A decision is only a decision if it can be got wrong. The test of that is to
 * play the same seeds several ways -- always take it, never take it, take it
 * past a fixed threshold, and judge it -- and see whether judging beats every
 * rule that does not look. A lever where one rule ties judgement is compliance,
 * wherever it is put (the owner's finding, 2026-09-04).
 *
 * Each entry names its policies. `judge` is required and is the best play this
 * file knows; the others are the rules it has to beat. `decideprobe` adds the
 * three every fight gets -- `idle`, `rotate` and `played` -- so an entry only
 * writes what is particular to its decision. A fight with no entry is probed
 * with `played` standing in for `judge`.
 *
 * Empty. The first entry, the Crimson Gift's herald (#290), was built and
 * measured and did not pass, so it is not here; the rules it was built with,
 * the policies it was played by and the tables it produced are on that issue.
 */
export type Policy = (s: SimState, tick: number, pressed: number[]) => PlayerInput

export interface Decision {
  /** What is being decided, in a line. */
  what: string
  policies: Record<string, Policy> & { judge: Policy }
}

export const DECISIONS: Record<string, Decision> = {}
