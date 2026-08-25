import type { DifficultyId, RaidSize } from './classes'

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

/**
 * The whole vocabulary, named once.
 *
 * `floor.ts` prices these and `boss.ts` schedules them; this is the list both
 * of them agree on. Everything a boss or a floor can ask for is here, and
 * nothing else is.
 */
export type MechanicId =
  | 'puddle'
  | 'spread'
  | 'breath'
  | 'shockwave'
  | 'adds'
  | 'sweep'
  | 'rot'
  | 'sunder'
  | 'soak'
  | 'hunt'

/** What each is called anywhere it has to be read rather than dodged. */
/**
 * Whether a mechanic grows with the roster or catches a fixed share of it.
 *
 * The distinction was in `boss.ts` all along, one implementation at a time,
 * and never written down — which is why the consequence took a round of
 * tuning to find. Something dropped *on people* asks more of a bigger raid
 * because there is more of it: puddles per cast, spread marks, add waves, a
 * gathering split among whoever stands in it. Something aimed at the *arena*
 * does not: a cone of a fixed angle catches roughly the same fraction of five
 * bodies as of twenty-five, and so does a ring of a fixed radius, and so does
 * whatever happens to be within reach of the boss.
 *
 * Read across a boss's ladder it predicts how that boss behaves at size, and
 * it is the reason `sizeMechanic` exists:
 *
 *   Choir        5/5 scale — a bigger raid gets more of everything
 *   Warden       4/5       — balances itself, and carries no weights
 *   Tidebreaker  2/5, and 0/2 at its opening — a bigger raid gets it free
 */
export const MECHANIC_SCALES: Record<MechanicId, boolean> = {
  puddle: true, // `puddleCount` per cast
  spread: true, // one mark per so many bodies
  adds: true, // a wave of `living / 6`
  soak: true, // split among whoever stands in it
  rot: true, // applied to each of them
  sunder: true, // the tank's, and a bigger raid brings a second
  hunt: true, // one stalker per quarry
  breath: false, // a cone of a fixed angle
  shockwave: false, // a ring of a fixed radius
  sweep: false, // whoever is in reach, which is the melee
}

export const MECHANIC_NAMES: Record<MechanicId, string> = {
  puddle: 'pools',
  spread: 'marks',
  breath: 'the cone',
  shockwave: 'the ring',
  adds: 'thralls',
  sweep: 'the sweep',
  rot: 'rot',
  sunder: 'the armour break',
  soak: 'the gathering',
  hunt: 'the stalker',
}

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
   * one is answered by deciding who is standing there — which is why no boss
   * puts it on its ladder before the fourth rung, since a five-man fields one
   * tank and is not allowed to answer it.
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

  /**
   * What that multiplier is worth at each raid size, for this boss alone.
   *
   * `SIZE_HEALTH` is the raid-size dial the whole game shares, and sharing it
   * is the problem: the three bosses do not sit the same way at the same size.
   * A twenty-five man walks over the Tidebreaker and loses to the Choir, and
   * one global number cannot move one without moving the other.
   *
   * `MECHANIC_SCALES` says why they differ, and it is not a fudge for it: a
   * boss made of things dropped on people asks more of a bigger raid on its
   * own, and one made of arena shapes asks the same of any raid, so the same
   * roster is worth different amounts against each. The Warden sits at four
   * fifths and needs no line here at all.
   *
   * It went unnoticed because the Tidebreaker had a second, accidental dial —
   * a shockwave band so wide at twenty-five that the pocket could not hold the
   * raid. That was not difficulty, it was an unperformable mechanic, and
   * taking it out left the boss with no size scaling at all.
   *
   * Omitted means one. A boss that reads the same at every size does not need
   * a line here.
   */
  sizeMechanic?: Partial<Record<RaidSize, number>>
  /**
   * What this one asks for, in the order it starts asking.
   *
   * The tables below hold the cadence of every mechanic a boss *can* throw;
   * this says how many of them it actually throws tonight, and which. A
   * five-man on normal gets the first two rungs, and every step up the raid
   * size or across to heroic buys one more — see `kitCount`.
   *
   * The order is the whole design. Three bosses whose first two rungs overlap
   * are three bosses that open the same way, and the opening is the only part
   * of a fight everybody sees: a party that wipes at forty percent has met
   * two mechanics and no more. So the first rungs are disjoint across all
   * three — pools and the sweep, marks and the stalker, the cone and the ring
   * — and the sets only begin to rhyme at the sizes where a raid has the
   * bodies to notice. No boss's ladder is a prefix or a subset of another's at
   * any rung, which is the thing that stops the second boss being the first
   * one wearing a different colour.
   */
  ladder: MechanicId[]
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
    // The ground fight. Nothing to get behind and nothing to run into: what it
    // does is make the floor unusable and then punish whoever is still
    // standing in reach of it, and at the sizes that field a second tank it
    // starts asking who that is.
    id: 'warden',
    name: 'The Drowned Warden',
    short: 'Warden',
    demand: 'the floor, and whoever is standing on it',
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
     *
     * Cut back to 41,000 when the ladders arrived. A five-man on normal used
     * to meet eight mechanics here and now meets two, and a health bar tuned
     * against the eight is a health bar the two cannot chew through before the
     * enrage — the fight would have become long rather than easy, which is the
     * worse of the two failures.
     */
    hp: 58000,
    enrage: 240,
    phaseTwoHp: 0.7,
    phaseThreeHp: 0.4,
    swingDamage: 621,
    slamDamage: 1322,
    raidDamage: 168,
    mechanicDamage: 1.7,
    accent: '#ef4444',
    // No cone and nothing to run into: the only thing it casts is the one
    // that lands on whoever is holding it.
    names: { slam: 'ABYSSAL SLAM', breath: '' },
    ladder: ['puddle', 'sweep', 'rot', 'sunder', 'soak'],
    phases: {
      1: { swing: 2.0, puddle: 9, spread: 0, slam: 16, puddleCount: 1, raid: 9, breath: 0, shockwave: 0, adds: 0, sweep: 42, rot: 33, sunder: 11, soak: 40, hunt: 0 },
      2: { swing: 1.7, puddle: 8, spread: 0, slam: 13, puddleCount: 2, raid: 8, breath: 0, shockwave: 0, adds: 0, sweep: 35, rot: 27, sunder: 9, soak: 34, hunt: 0 },
      3: { swing: 1.5, puddle: 7, spread: 0, slam: 11, puddleCount: 2, raid: 7, breath: 0, shockwave: 0, adds: 0, sweep: 30, rot: 22, sunder: 8, soak: 28, hunt: 0 },
    },
    opening: { puddle: 9, spread: 0, slam: 13, raid: 11, breath: 0, shockwave: 0, adds: 0, sweep: 30, rot: 22, sunder: 14, soak: 34, hunt: 0 },
    lines: {
      phaseTwo: 'The tide rises!',
      phaseThree: 'DROWN WITH ME',
      adds: '',
      shockwave: '',
      sweep: 'The tide sweeps in',
      rot: 'Rot on me — need a heal',
      sunder: 'Your guard breaks',
      soak: 'The undertow gathers — all of you',
      hunt: '',
    },
  },
  {
    // Nothing to dodge that a healer can dodge for you. The floor is quiet and
    // the raid damage never stops, so this is the one that ends on mana — and
    // everything it does lands on one person at a time.
    id: 'choir',
    name: 'The Choir Beneath',
    short: 'Choir',
    demand: 'stay apart, and out-heal the singing',
    hp: 46000,
    enrage: 230,
    phaseTwoHp: 0.65,
    phaseThreeHp: 0.35,
    swingDamage: 540,
    slamDamage: 1127,
    raidDamage: 138,
    // 1.35 while the spread — this boss's own signature — was not reading
    // this number at all. `detonateSpread` applied its damage straight, so the
    // dial reached the rungs that buy a puddle and missed the two that are a
    // spread and a rot. Now that everything goes through one funnel the same
    // fight is harder at the same number, and this is where it lands.
    mechanicDamage: 1.15,
    // The opposite problem: this is the boss a twenty-five man loses to. Its
    // last rung buys `adds`, and a wave of them against a raid already holding
    // a spread, a hunt and a puddle is the one place the size stops helping.
    // The five-man weight came up with the ladder. 0.82 was set while this
    // boss's first three rungs were a spread, a rot and a stalker — nothing
    // that punishes a mistake — so the number was holding down a fight that
    // was not going to hurt anybody anyway. With a puddle on the third rung it
    // was holding down a fight that could, and both five-man rungs were won as
    // often on a first pull as a ninth.
    sizeMechanic: { 5: 0.94, 25: 0.85 },
    accent: '#e879f9',
    names: { slam: 'DISCORDANT CHORD', breath: '' },
    // `puddle` third rather than fourth, and quicker than it was.
    //
    // Measured one mechanic at a time against a raid that has never seen the
    // fight, only two of the thirteen mechanic-and-boss pairs in this game
    // teach anything: the Warden's puddle costs an unpractised raid 31 points
    // of survival over a practised one, and the Tidebreaker's cone 29. Every
    // other pair lands between 0 and 5, which is to say the rung is passed or
    // failed on arrival and practice does not move it.
    //
    // The Choir held one of the two and had it on the fourth rung, where only
    // a ten-man heroic and above ever met it — and set so gently that the same
    // mechanic taught 2 points here against the Warden's 31. Its first three
    // rungs were a spread, a rot and a stalker, worth 2, 0 and 0. There was
    // nothing in them to learn, and the win rate said so: the ten-man normal
    // was won as often on a first pull as on a ninth.
    //
    // Third is as early as it can go. The three bosses must open on nothing in
    // common and the Warden opens with this, so the first two rungs are spoken
    // for whatever they hold.
    ladder: ['spread', 'rot', 'puddle', 'hunt', 'adds'],
    phases: {
      1: { swing: 2.1, puddle: 12, spread: 11, slam: 18, puddleCount: 1, raid: 7, breath: 0, shockwave: 0, adds: 58, sweep: 0, rot: 20, sunder: 0, soak: 0, hunt: 52 },
      2: { swing: 1.9, puddle: 11, spread: 9, slam: 16, puddleCount: 1, raid: 6, breath: 0, shockwave: 0, adds: 50, sweep: 0, rot: 16, sunder: 0, soak: 0, hunt: 45 },
      3: { swing: 1.8, puddle: 10, spread: 8, slam: 14, puddleCount: 1, raid: 5.5, breath: 0, shockwave: 0, adds: 42, sweep: 0, rot: 14, sunder: 0, soak: 0, hunt: 38 },
    },
    opening: { puddle: 12, spread: 8, slam: 15, raid: 9, breath: 0, shockwave: 0, adds: 52, sweep: 0, rot: 12, sunder: 0, soak: 0, hunt: 44 },
    lines: {
      phaseTwo: 'Sing louder',
      phaseThree: 'THE CHOIR TAKES YOU',
      adds: 'The chorus answers',
      shockwave: '',
      sweep: '',
      rot: 'A note is caught in me — heal',
      sunder: '',
      soak: '',
      hunt: 'One voice is following me',
    },
  },
  {
    // The opposite problem: nothing on the floor to stand in, and almost no
    // time standing anywhere. Rings to run into, a cone to get behind, and
    // something new to hit every time you have settled on a target.
    id: 'tidebreaker',
    name: 'The Tidebreaker',
    short: 'Tidebreaker',
    demand: 'come in, get behind, change target',
    hp: 54000,
    enrage: 250,
    phaseTwoHp: 0.75,
    phaseThreeHp: 0.4,
    swingDamage: 730,
    slamDamage: 1700,
    raidDamage: 265,
    // 2.55 while the shockwave was carrying the whole fight on its own. Once
    // the ring stopped deciding it — see `SHOCKWAVE_BAND` — every rung came
    // out at 95-100%, because the rest of the boss had never had to do
    // anything. This is what the rest of it is worth.
    mechanicDamage: 4.6,
    // A twenty-five man walked over this fight once the shockwave stopped
    // deciding it — 97% at the top of the practice curve. Five percent is all
    // it takes: healing covers about two fifths of what a raid takes, and past
    // that line the first death starts a spiral no dial can catch. Fifteen
    // percent put the same rung at zero.
    // Re-cut once the ring started working. The old line was fitted while the
    // shockwave hit nobody, so it was paying for a boss with four mechanics
    // rather than five; the five-man felt it worst, because a two-rung kit is
    // paid back as tempo and the rung that comes round fastest is the one a
    // live ring punishes hardest.
    sizeMechanic: { 5: 0.75, 10: 1.1 },
    accent: '#22d3ee',
    names: { slam: 'SHATTERING BLOW', breath: 'RIPTIDE BREATH' },
    ladder: ['breath', 'shockwave', 'sweep', 'adds', 'hunt'],
    phases: {
      1: { swing: 1.9, puddle: 0, spread: 0, slam: 14, puddleCount: 1, raid: 11, breath: 11, shockwave: 16, adds: 46, sweep: 32, rot: 0, sunder: 0, soak: 0, hunt: 44 },
      2: { swing: 1.7, puddle: 0, spread: 0, slam: 12, puddleCount: 1, raid: 10, breath: 9.5, shockwave: 13, adds: 40, sweep: 28, rot: 0, sunder: 0, soak: 0, hunt: 38 },
      3: { swing: 1.5, puddle: 0, spread: 0, slam: 10, puddleCount: 1, raid: 9, breath: 8, shockwave: 10.5, adds: 34, sweep: 23, rot: 0, sunder: 0, soak: 0, hunt: 32 },
    },
    opening: { puddle: 0, spread: 0, slam: 11, raid: 13, breath: 10, shockwave: 15, adds: 42, sweep: 23, rot: 0, sunder: 0, soak: 0, hunt: 45 },
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

/**
 * How many rungs of a boss's ladder tonight's raid actually meets.
 *
 * Two axes, one rung each, and both of them monotone: a bigger raid meets
 * more of the fight, and heroic meets one more than normal at the same size.
 *
 *   5 normal 2 · 5 heroic 3 · 10 normal 3 · 10 heroic 4 · 25 normal 4 · 25 heroic 5
 *
 * The size rungs are the honest half. Every mechanic in here already scales
 * its *volume* with the headcount — puddles per cast, spread marks, add waves
 * — which made a twenty-five man the same fight arriving in bigger pieces. It
 * is not: a raid of twenty-five has the bodies to answer a mechanic a
 * five-man cannot even be asked, which is the reason the size exists at all.
 *
 * Heroic is the half that was missing outright. It was twenty-two percent more
 * health and nothing else, so the honest description of it was "the same fight
 * for longer" — and the difficulty button said so, in those words. A rung
 * costs the raid something a health bar never can.
 */
export function kitCount(size: number, difficulty: DifficultyId): number {
  let rungs = 2
  if (size >= 10) rungs++
  if (size >= 25) rungs++
  if (difficulty === 'heroic') rungs++
  return rungs
}

/** Which mechanics this boss throws at this size and difficulty. */
export function encounterKit(
  encounter: Encounter,
  size: number,
  difficulty: DifficultyId,
): MechanicId[] {
  return encounter.ladder.slice(0, kitCount(size, difficulty))
}

/**
 * How much faster a short kit comes round.
 *
 * Two mechanics on the boss's own cadence is not an easier fight, it is a
 * quieter one — measured, a five-man normal Warden went from winning a fifth
 * of its first pulls to winning all of them, and the pulls were shorter and
 * emptier rather than gentler. Which is the wrong trade: what a small raid
 * should meet is a narrower fight, not a slack one.
 *
 * So the rungs a raid did not buy are paid back as tempo. A kit of two runs
 * its two ideas at about five-eighths of the interval, and by the full five it
 * is on the table's own numbers. The pressure still rises with the rungs —
 * five mechanics at full cadence ask for more per second than two at
 * five-eighths, and they ask for five different things — but the bottom of the
 * ladder is a fight rather than a wait.
 */
export function kitCadence(rungs: number): number {
  return Math.min(1, 1 - (kitCount(25, 'heroic') - rungs) * 0.127)
}

/**
 * Makes tonight's fight out of the boss's full table.
 *
 * Two things at once, because they are one decision: everything the kit did
 * not buy is switched off, and everything it did comes round at the tempo the
 * kit's size earns. Zeroing is the same switch the tables already use — every
 * scheduler in `boss.ts` reads a cadence of zero as "not this fight" — so
 * there is one rule for a mechanic being absent rather than two.
 */
export function gated(timing: PhaseTiming, kit: readonly MechanicId[]): PhaseTiming {
  const tempo = kitCadence(kit.length)
  const on = (id: MechanicId, every: number): number => (kit.includes(id) ? every * tempo : 0)
  return {
    ...timing,
    puddle: on('puddle', timing.puddle),
    spread: on('spread', timing.spread),
    breath: on('breath', timing.breath),
    shockwave: on('shockwave', timing.shockwave),
    adds: on('adds', timing.adds),
    sweep: on('sweep', timing.sweep),
    rot: on('rot', timing.rot),
    sunder: on('sunder', timing.sunder),
    soak: on('soak', timing.soak),
    hunt: on('hunt', timing.hunt),
  }
}

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

/**
 * Whether the boss owns this mechanic at all, at any size.
 *
 * The ladder rather than the phase tables: a table may carry a cadence for a
 * rung no raid ever reaches, and the question this answers — does this fight
 * have a cone in it — is about the boss, not about tonight.
 */
export function usesMechanic(encounter: Encounter, key: MechanicId): boolean {
  return encounter.ladder.includes(key)
}

export type { DifficultyId }
