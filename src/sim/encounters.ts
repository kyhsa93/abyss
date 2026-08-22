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
  /**
   * Physical damage to everyone standing in reach.
   *
   * The only thing the boss does that armour answers — everything else it
   * throws is magic, which is why plate on a melee dealer was a line in a
   * table rather than a reason to bring one.
   */
  sweep: number
  /** A dot on somebody. Slow, unavoidable, and the healer's to solve. */
  rot: number
  /**
   * How often the armour break lands on whoever is holding the boss.
   *
   * The one mechanic aimed at the tanks rather than at the raid: it stacks on
   * the current target and makes everything physical hurt more, so a party
   * with two of them trades the boss and a party with one has to survive the
   * top of the stack. Every other mechanic here is answered by moving; this
   * one is answered by deciding who is standing there.
   */
  sunder: number
  /**
   * How often the whole party has to stand in one circle.
   *
   * The inverse of spread, and the only mechanic here that asks the party to
   * do something *together* rather than each get themselves out of the way.
   * What lands is divided by however many stood in it and then dealt to
   * everybody, so being outside does not save you — it costs the people who
   * went.
   */
  soak: number
  /**
   * How often something picks one of you and walks after it.
   *
   * The only mechanic here aimed at a single person, and the only one with
   * two answers: the one it picked runs, and everybody else decides whether
   * to chase it down or keep hitting the boss. Every other hostile in this
   * game goes for whoever is nearest, which the party answers by standing
   * somewhere else.
   */
  hunt: number
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
    sweep: number
    rot: number
    sunder: number
    soak: number
    hunt: number
  }
  /**
   * The colour this one is drawn in.
   *
   * Three bosses that differ in what they ask for still read as one boss when
   * they are the same red disc casting the same two spells. The tables were
   * always different — the Choir throws no cone and no ring at all, the
   * Tidebreaker no spread and no rot — but nothing the player *reads* said so.
   */
  accent: string
  /** What the two casts are called. Empty where the boss never casts it. */
  names: {
    slam: string
    breath: string
  }
  lines: {
    phaseTwo: string
    phaseThree: string
    adds: string
    shockwave: string
    /** Empty where the boss does not use the mechanic. */
    sweep: string
    rot: string
    sunder: string
    soak: string
    hunt: string
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
    hp: 47000,
    enrage: 240,
    phaseTwoHp: 0.7,
    phaseThreeHp: 0.4,
    swingDamage: 621,
    slamDamage: 1322,
    raidDamage: 129,
    mechanicDamage: 1,
    accent: '#ef4444',
    names: { slam: 'ABYSSAL SLAM', breath: 'TIDAL BREATH' },
    phases: {
      1: { swing: 2.0, puddle: 9, spread: 18, slam: 16, puddleCount: 1, raid: 9, breath: 20, shockwave: 0, adds: 0, sweep: 42, rot: 33, sunder: 11, soak: 0, hunt: 0 },
      2: { swing: 1.7, puddle: 8, spread: 15, slam: 13, puddleCount: 2, raid: 8, breath: 16, shockwave: 26, adds: 50, sweep: 35, rot: 27, sunder: 9, soak: 0, hunt: 0 },
      3: { swing: 1.5, puddle: 7, spread: 14, slam: 11, puddleCount: 2, raid: 7, breath: 14, shockwave: 21, adds: 42, sweep: 30, rot: 22, sunder: 8, soak: 0, hunt: 0 },
    },
    opening: { puddle: 9, spread: 17, slam: 13, raid: 11, breath: 21, shockwave: 27, adds: 45, sweep: 30, rot: 22, sunder: 14, soak: 0, hunt: 0 },
    lines: {
      phaseTwo: 'The tide rises!',
      phaseThree: 'DROWN WITH ME',
      adds: 'Rise, drowned ones',
      shockwave: 'The deep exhales',
      sweep: 'The tide sweeps in',
      rot: 'Rot on me — need a heal',
      sunder: 'Your guard breaks',
      soak: 'The undertow gathers — all of you',
      hunt: 'Something below has your scent',
    },
  },
  {
    // Nothing to dodge that a healer can dodge for you. The floor is busy and
    // the raid damage never stops, so this is the one that ends on mana.
    id: 'choir',
    name: 'The Choir Beneath',
    short: 'Choir',
    demand: 'stay apart, and out-heal the singing',
    hp: 55000,
    enrage: 230,
    phaseTwoHp: 0.65,
    phaseThreeHp: 0.35,
    swingDamage: 540,
    slamDamage: 1127,
    raidDamage: 180,
    mechanicDamage: 1.1,
    accent: '#e879f9',
    // No cone to get behind and nothing to run into, so the only thing it
    // casts is the one that hits whoever is holding it.
    names: { slam: 'DISCORDANT CHORD', breath: '' },
    phases: {
      1: { swing: 2.1, puddle: 8, spread: 11, slam: 18, puddleCount: 2, raid: 7, breath: 0, shockwave: 0, adds: 0, sweep: 0, rot: 20, sunder: 0, soak: 0, hunt: 0 },
      2: { swing: 1.9, puddle: 7, spread: 9, slam: 16, puddleCount: 2, raid: 6, breath: 0, shockwave: 0, adds: 0, sweep: 0, rot: 16, sunder: 0, soak: 0, hunt: 0 },
      3: { swing: 1.8, puddle: 6, spread: 8, slam: 14, puddleCount: 3, raid: 5.5, breath: 0, shockwave: 0, adds: 0, sweep: 0, rot: 14, sunder: 0, soak: 0, hunt: 0 },
    },
    opening: { puddle: 7, spread: 8, slam: 15, raid: 9, breath: 0, shockwave: 0, adds: 0, sweep: 0, rot: 12, sunder: 0, soak: 0, hunt: 0 },
    lines: {
      phaseTwo: 'Sing louder',
      phaseThree: 'THE CHOIR TAKES YOU',
      adds: '',
      shockwave: '',
      sweep: '',
      rot: 'A note is caught in me — heal',
      sunder: '',
      soak: '',
      hunt: '',
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
    hp: 48500,
    enrage: 250,
    phaseTwoHp: 0.75,
    phaseThreeHp: 0.4,
    swingDamage: 690,
    slamDamage: 1438,
    raidDamage: 108,
    mechanicDamage: 2.3,
    accent: '#22d3ee',
    names: { slam: 'SHATTERING BLOW', breath: 'RIPTIDE BREATH' },
    phases: {
      1: { swing: 1.9, puddle: 15, spread: 0, slam: 14, puddleCount: 1, raid: 11, breath: 11, shockwave: 16, adds: 30, sweep: 32, rot: 0, sunder: 0, soak: 0, hunt: 0 },
      2: { swing: 1.7, puddle: 13, spread: 0, slam: 12, puddleCount: 1, raid: 10, breath: 9.5, shockwave: 13, adds: 26, sweep: 28, rot: 0, sunder: 0, soak: 0, hunt: 0 },
      3: { swing: 1.5, puddle: 11, spread: 0, slam: 10, puddleCount: 1, raid: 9, breath: 8, shockwave: 10.5, adds: 22, sweep: 23, rot: 0, sunder: 0, soak: 0, hunt: 0 },
    },
    opening: { puddle: 14, spread: 0, slam: 11, raid: 13, breath: 10, shockwave: 15, adds: 28, sweep: 23, rot: 0, sunder: 0, soak: 0, hunt: 0 },
    lines: {
      phaseTwo: 'The water turns',
      phaseThree: 'NOTHING STANDS',
      adds: 'Break on them',
      shockwave: 'The undertow',
      sweep: 'Wide swing — out of reach',
      rot: '',
      sunder: '',
      soak: '',
      hunt: 'It has your scent',
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
