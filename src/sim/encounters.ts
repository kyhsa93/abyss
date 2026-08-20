import type { DifficultyId } from './classes'

/**
 * The bosses, in the order they are fought.
 *
 * A boss here is a table rather than a class: the timeline code in `boss.ts`
 * is the same for all of them and only the numbers differ. That is deliberate.
 * A second boss written as a second script would double the code that decides
 * what a mechanic does, and the two copies would drift — the shockwave that
 * has to be entered rather than fled is a rule that took three attempts to get
 * right, and it is not being written twice.
 *
 * What separates them is *which* mechanics they lean on, since each one asks
 * for something different: puddles say leave where you stand, the breath says
 * get behind, the shockwave says come in, spread says separate, adds say
 * change target, and the raid hit says nothing at all except that the healer
 * kept up. A boss is a sentence made of those.
 */
export interface PhaseTiming {
  swing: number
  puddle: number
  spread: number
  slam: number
  puddleCount: number
  /** Unavoidable party-wide damage; the healer's actual test. */
  raid: number
  /** 0 disables the mechanic for that phase. */
  breath: number
  shockwave: number
  adds: number
}

export interface Encounter {
  id: string
  name: string
  /** For tabs and anywhere else the full name does not fit. */
  short: string
  /** One line on what this one asks of you, shown before the pull. */
  demand: string
  hp: number
  /** Seconds before the fight is lost outright. */
  enrage: number
  /** Health fractions the phases turn on. */
  phaseTwoHp: number
  phaseThreeHp: number
  swingDamage: number
  slamDamage: number
  raidDamage: number
  /**
   * Multiplier on everything the floor does — puddles, the cone, the ring.
   *
   * The shapes are the same for every boss, so this is what says whether
   * standing in one is a mistake or a death. It is the difference between a
   * fight that asks for attention and one that asks for precision, and it is a
   * multiplier rather than three numbers because a boss whose puddles hurt and
   * whose cone does not is a boss nobody can read.
   */
  mechanicDamage: number
  phases: Record<number, PhaseTiming>
  /**
   * Seconds to the first of each mechanic.
   *
   * Separate from the phase timers because an opening is not a cadence: the
   * first puddle wants to land while the pull still feels calm, and a boss
   * whose first shockwave arrives on its normal interval has spent a third of
   * phase one doing nothing.
   */
  opening: {
    puddle: number
    spread: number
    slam: number
    raid: number
    breath: number
    shockwave: number
    adds: number
  }
  lines: {
    phaseTwo: string
    phaseThree: string
    adds: string
    shockwave: string
  }
}

export const ENCOUNTERS: Encounter[] = [
  {
    id: 'warden',
    name: 'The Drowned Warden',
    short: 'Warden',
    demand: 'every mechanic, none of them often',
    /**
     * Raised from 36,000 when the party got weapons.
     *
     * Auto-attacks add about eleven percent to what the raid actually lands —
     * measured rather than assumed, because their theoretical uptime is
     * nothing like their real one: melee walk out of puddles, lose range and
     * die. Left alone that turned a 43% first pull into a 73% one. The health
     * follows the damage, and by the same fraction at five, ten and
     * twenty-five, so one number covers every size.
     *
     * Raised again from 40,000 for crits, which add about seven and a half
     * percent at a chance of fifteen and a multiplier of one and a half. The
     * encounter should be the length it was: what a crit changes is how a hit
     * looks, not how long the fight runs.
     */
    hp: 45000,
    enrage: 240,
    phaseTwoHp: 0.7,
    phaseThreeHp: 0.4,
    swingDamage: 540,
    slamDamage: 1150,
    raidDamage: 133,
    mechanicDamage: 1,
    phases: {
      1: { swing: 2.0, puddle: 9, spread: 18, slam: 16, puddleCount: 1, raid: 9, breath: 20, shockwave: 0, adds: 0 },
      2: { swing: 1.7, puddle: 8, spread: 15, slam: 13, puddleCount: 2, raid: 8, breath: 16, shockwave: 26, adds: 50 },
      3: { swing: 1.5, puddle: 7, spread: 14, slam: 11, puddleCount: 2, raid: 7, breath: 14, shockwave: 21, adds: 42 },
    },
    opening: { puddle: 9, spread: 17, slam: 13, raid: 11, breath: 21, shockwave: 27, adds: 45 },
    lines: {
      phaseTwo: 'The tide rises!',
      phaseThree: 'DROWN WITH ME',
      adds: 'Rise, drowned ones',
      shockwave: 'The deep exhales',
    },
  },
  {
    // Nothing to dodge that a healer can dodge for you. The floor is busy and
    // the raid damage never stops, so this is the one that ends on mana.
    id: 'choir',
    name: 'The Choir Beneath',
    short: 'Choir',
    demand: 'stay apart, and out-heal the singing',
    hp: 53000,
    enrage: 230,
    phaseTwoHp: 0.65,
    phaseThreeHp: 0.35,
    swingDamage: 470,
    slamDamage: 980,
    raidDamage: 186,
    mechanicDamage: 1.1,
    phases: {
      1: { swing: 2.1, puddle: 8, spread: 11, slam: 18, puddleCount: 2, raid: 7, breath: 0, shockwave: 0, adds: 0 },
      2: { swing: 1.9, puddle: 7, spread: 9, slam: 16, puddleCount: 2, raid: 6, breath: 0, shockwave: 0, adds: 0 },
      3: { swing: 1.8, puddle: 6, spread: 8, slam: 14, puddleCount: 3, raid: 5.5, breath: 0, shockwave: 0, adds: 0 },
    },
    opening: { puddle: 7, spread: 8, slam: 15, raid: 9, breath: 0, shockwave: 0, adds: 0 },
    lines: {
      phaseTwo: 'Sing louder',
      phaseThree: 'THE CHOIR TAKES YOU',
      adds: '',
      shockwave: '',
    },
  },
  {
    // The opposite problem: little on the floor to stand in, and almost no
    // time standing anywhere. Rings to run into, a cone to get behind, and
    // something new to hit every time you have settled on a target.
    id: 'tidebreaker',
    name: 'The Tidebreaker',
    short: 'Tidebreaker',
    demand: 'come in, get behind, change target',
    hp: 47000,
    enrage: 250,
    phaseTwoHp: 0.75,
    phaseThreeHp: 0.4,
    swingDamage: 600,
    slamDamage: 1250,
    raidDamage: 112,
    mechanicDamage: 2.3,
    phases: {
      1: { swing: 1.9, puddle: 15, spread: 0, slam: 14, puddleCount: 1, raid: 11, breath: 11, shockwave: 16, adds: 30 },
      2: { swing: 1.7, puddle: 13, spread: 0, slam: 12, puddleCount: 1, raid: 10, breath: 9.5, shockwave: 13, adds: 26 },
      3: { swing: 1.5, puddle: 11, spread: 0, slam: 10, puddleCount: 1, raid: 9, breath: 8, shockwave: 10.5, adds: 22 },
    },
    opening: { puddle: 14, spread: 0, slam: 11, raid: 13, breath: 10, shockwave: 15, adds: 28 },
    lines: {
      phaseTwo: 'The water turns',
      phaseThree: 'NOTHING STANDS',
      adds: 'Break on them',
      shockwave: 'The undertow',
    },
  },
]

export const FIRST_ENCOUNTER = 0

/** Clamped rather than checked: a saved index outliving its boss is not fatal. */
export function encounterIndex(index: number): number {
  return Math.max(0, Math.min(ENCOUNTERS.length - 1, Math.round(index)))
}

export function encounterAt(index: number): Encounter {
  return ENCOUNTERS[encounterIndex(index)]!
}

/** Whether anything follows this one. */
export function hasNext(index: number): boolean {
  return index < ENCOUNTERS.length - 1
}

/** A spread of zero disables the mechanic, the same as the other timers. */
export function usesMechanic(
  encounter: Encounter,
  key: 'breath' | 'shockwave' | 'adds' | 'spread',
): boolean {
  return Object.values(encounter.phases).some((p) => p[key] > 0)
}

export type { DifficultyId }
