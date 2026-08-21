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
  | 'restless'
  | 'quickened'
  | 'festering'
  | 'scattering'
  | 'hastened'

export interface Affix {
  id: AffixId
  name: string
  /** What it does, in the words the player needs before the pull. */
  detail: string
}

export const AFFIXES: Affix[] = [
  { id: 'lingering', name: 'Lingering', detail: 'puddles stay twice as long' },
  { id: 'swarming', name: 'Swarming', detail: 'twice as many thralls, half as often' },
  { id: 'faltering', name: 'Faltering', detail: 'healing lands for a quarter less' },
  { id: 'restless', name: 'Restless', detail: 'shockwaves and breaths come round faster' },
  { id: 'quickened', name: 'Quickened', detail: 'the boss swings a third faster' },
  { id: 'festering', name: 'Festering', detail: 'the rot bites twice as hard' },
  { id: 'scattering', name: 'Scattering', detail: 'spread marks reach further' },
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
    case 'restless':
      return {
        ...timing,
        // Half rather than two thirds. At the gentler figure the party simply
        // stood closer together and took *less* damage overall — the shockwave
        // asks people to come in, and asking more often was doing them a
        // favour.
        shockwave: timing.shockwave > 0 ? timing.shockwave * 0.45 : 0,
        breath: timing.breath > 0 ? timing.breath * 0.5 : 0,
      }
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

/** What the boss's dot is worth. */
export function affixRot(affix: AffixId | null): number {
  return affix === 'festering' ? 1.55 : 1
}

/** How far a spread mark reaches. */
export function affixSpread(affix: AffixId | null): number {
  return affix === 'scattering' ? 1.5 : 1
}

/** Seconds taken off the enrage. */
export function affixEnrage(affix: AffixId | null): number {
  // Forty seconds was nothing and ninety was barely more: an ordinary pull
  // ends well inside the timer, so the cut has to land near an actual kill
  // time before it is a damage check rather than a footnote.
  return affix === 'hastened' ? 135 : 0
}
