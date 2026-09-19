import type { PhaseTiming } from './encounters'

/**
 * One twist on the day's fight.
 *
 * The boss stays a script — that rule is the whole genre and nothing here
 * touches it. What an affix changes is a number the script already had, so
 * everything you learned last week still applies and has to be applied a
 * little differently. A fight that improvises cannot be learned; a fight whose
 * puddles linger twice as long is the same fight with less floor.
 *
 * They ride the daily rather than every pull, because a raid you are learning
 * has to be the same fight on the ninth attempt as on the first. The daily is
 * the one that is meant to be new.
 */
export type AffixId =
  | 'lingering'
  | 'swarming'
  | 'faltering'
  | 'quickened'
  | 'hastened'

export interface Affix {
  id: AffixId
  name: string
  /** What it does, in the words the player needs before the pull. */
  detail: string
}

/**
 * Five, and it was eight.
 *
 * Three of them named mechanics that are gone: the rot to bite harder, the
 * spread to reach further, the ring and the cone to come round sooner. An
 * affix whose whole content is a number on a mechanic nobody throws is a twist
 * that changes nothing, and the daily has exactly one of these a day -- so a
 * dead one is a day with no twist at all, announced as though it had one. That
 * happened once already to `lingering`, which spent a round multiplying values
 * on hazards that were all on their way out.
 */
export const AFFIXES: Affix[] = [
  { id: 'lingering', name: 'Lingering', detail: 'what the floor keeps, it keeps twice as long' },
  { id: 'swarming', name: 'Swarming', detail: 'twice as many thralls, half as often' },
  { id: 'faltering', name: 'Faltering', detail: 'healing lands for a quarter less' },
  { id: 'quickened', name: 'Quickened', detail: 'the boss swings a third faster' },
  { id: 'hastened', name: 'Hastened', detail: 'the enrage arrives more than two minutes early' },
]

export function affixById(id: AffixId | null): Affix | null {
  if (id === null) return null
  return AFFIXES.find((a) => a.id === id) ?? null
}

/** The affix's hand on a phase's timers. Everything else reads it in place. */
export function affixTiming(timing: PhaseTiming, affix: AffixId | null): PhaseTiming {
  switch (affix) {
    case 'swarming':
      return { ...timing, adds: timing.adds > 0 ? timing.adds * 2 : 0 }
    case 'quickened':
      return { ...timing, swing: timing.swing * 0.82 }
    default:
      return timing
  }
}

/** How many thralls a wave brings, as a multiplier. */
export function affixAddWave(affix: AffixId | null): number {
  return affix === 'swarming' ? 2 : 1
}

/** How long a puddle sits once it has gone off. */
export function affixLinger(affix: AffixId | null): number {
  return affix === 'lingering' ? 2 : 1
}

/** What healing is worth. */
export function affixHealing(affix: AffixId | null): number {
  return affix === 'faltering' ? 0.75 : 1
}



/** Seconds taken off the enrage. */
export function affixEnrage(affix: AffixId | null): number {
  // Forty seconds was nothing and ninety was barely more: an ordinary pull
  // ends well inside the timer, so the cut has to land near an actual kill
  // time before it is a damage check rather than a footnote.
  return affix === 'hastened' ? 135 : 0
}
