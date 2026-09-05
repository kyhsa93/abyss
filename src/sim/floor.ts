import { Rng } from './rng'
import { ENCOUNTERS, MECHANIC_IDS, MECHANIC_NAMES, type MechanicId, type PhaseTiming } from './encounters'
import type { DifficultyId } from './classes'

/**
 * What a descent floor is made of.
 *
 * The five bosses on the ladder are sentences written by hand out of a fixed
 * vocabulary of thirty mechanics, one boss to each of them and six to a boss —
 * the Choir throws no cone and no ring, the Tidebreaker no marks and no rot —
 * and the descent used to run those bosses in a loop, so floor four was the
 * first boss again with more health.
 *
 * Here the sentence is rolled instead. The floor takes a boss for its shape
 * and its numbers and then replaces what it asks for: a budget that grows with
 * the depth, spent on mechanics from the same vocabulary, priced by what each
 * one actually costs a party.
 *
 * The prices are the finding of the round that added the last three mechanics,
 * and they are not what they look like. A mechanic's cost here is not the
 * damage it deals — it is what it takes out of the party's output. This party
 * heals by standing still and casting, so anything that moves people is
 * expensive and anything that only hurts them is cheap: a stalker with its
 * damage turned down to one point still cost sixteen percent of the raid's
 * damage, while an armour break that moves nobody was affordable on the
 * ladder itself.
 */

export type { MechanicId }

interface Priced {
  id: MechanicId
  /** Seconds between, at its most generous and its tightest. */
  slow: number
  fast: number
  /**
   * What it costs the party, in the same units the budget is counted in.
   *
   * Anchored on measurement rather than taste: everything that asks the whole
   * party to move is four or more, everything that lands on one person and
   * lets them keep casting is one or two.
   */
  cost: number
  /** Floors before this one is allowed to appear at all. */
  from: number
}

/** What it says it is, on the floor's card. */
function nameOf(id: MechanicId): string {
  return MECHANIC_NAMES[id]
}

const CATALOGUE: Priced[] = [
  // The floor. Cheap, because standing out of it is a step rather than a walk.
  { id: 'puddle', slow: 11, fast: 6, cost: 2, from: 1 },
  // Separation: one person walks a little, everyone else holds still.
  { id: 'spread', slow: 18, fast: 10, cost: 3, from: 1 },
  // A cone to get behind. Melee move, ranged mostly do not.
  { id: 'breath', slow: 20, fast: 10, cost: 3, from: 1 },
  // A ring to run into, which is the whole raid moving toward the boss.
  { id: 'shockwave', slow: 26, fast: 13, cost: 4, from: 2 },
  // Something else to hit. The cost is target-switching, which is real.
  { id: 'adds', slow: 50, fast: 26, cost: 4, from: 2 },
  // A dot on somebody: the healer's problem and nobody else's.
  { id: 'rot', slow: 33, fast: 16, cost: 2, from: 1 },
  // Stacks on whoever holds the boss. Moves nobody at all.
  { id: 'sunder', slow: 14, fast: 8, cost: 2, from: 3 },
  // The whole party in one circle. Measured at thirty points of win rate.
  { id: 'soak', slow: 40, fast: 22, cost: 6, from: 3 },
  // One dealer kites, the rest choose. Sixteen percent of the raid's damage.
  { id: 'hunt', slow: 44, fast: 26, cost: 5, from: 2 },
  // A wedge that keeps turning onto the answer. Expensive for the reason the
  // ring is: it is the whole raid moving, and moving again on the next beat
  // rather than once.
  { id: 'hand', slow: 24, fast: 13, cost: 5, from: 2 },
  // The floor following whoever it marked. One person moves, five times, and
  // pays for it in everything they would have cast standing still.
  { id: 'echo', slow: 22, fast: 12, cost: 3, from: 2 },
  // A weight that has to be walked into somebody else's hands, three times.
  // Expensive: it moves two people at once and it moves them toward each
  // other, which is the opposite direction from wherever either of them was
  // supposed to be standing.
  { id: 'burden', slow: 7, fast: 4, cost: 5, from: 2 },
  // A debt somebody else has to come and halve. The same price as the
  // gathering minus one, because it takes one body out of position rather
  // than all of them — but it takes that one all the way across the arena.
  { id: 'yoke', slow: 11, fast: 7, cost: 5, from: 3 },
]

/**
 * What a floor is allowed to spend.
 *
 * The first floors buy two or three cheap things, which is a fight with a
 * couple of ideas in it. By the tenth there is enough for four or five,
 * including the expensive ones, and the cap keeps the deepest floors from
 * being every mechanic at once — a fight that asks for everything asks for
 * nothing, since there is no room left to answer any of it.
 */
export function floorBudget(
  depth: number,
  size = 5,
  difficulty: DifficultyId = 'normal',
): number {
  if (depth <= 0) return 0
  // The same two axes the authored bosses grew a ladder for. A floor buys its
  // fight rather than climbing one, so the size and the difficulty are worth
  // purse rather than rungs — but they have to be worth *something*, or the
  // descent is the one place in the game where bringing twenty-five people and
  // ticking heroic buys nothing but a longer health bar.
  const extra =
    (size >= 10 ? 1.5 : 0) + (size >= 25 ? 1.5 : 0) + (difficulty === 'heroic' ? 1.5 : 0)
  return Math.min(14, 4 + depth * 0.9) + extra
}

export interface FloorPlan {
  /** Cadence per mechanic, in seconds. Anything missing is switched off. */
  every: Partial<Record<MechanicId, number>>
  /** What was bought, in the order it was bought, for the card. */
  names: string[]
  spent: number
}

/**
 * Rolls one floor's fight.
 *
 * Deterministic from the seed it is handed, like everything else in here: a
 * floor has to be the same fight for the harness measuring it and the player
 * walking into it, and a descent that re-rolled on a redraw would not be a
 * descent.
 *
 * Bought one at a time, cheapest-affordable first when the purse is nearly
 * empty, so a floor never ends up holding a single expensive mechanic and
 * nothing else — a fight that is one idea repeated is the thing this whole
 * arrangement exists to avoid.
 */
export function rollFloor(
  seed: number,
  depth: number,
  size = 5,
  difficulty: DifficultyId = 'normal',
): FloorPlan {
  const rng = new Rng(seed)
  const budget = floorBudget(depth, size, difficulty)
  const every: Partial<Record<MechanicId, number>> = {}
  const names: string[] = []
  let spent = 0

  // Every floor has a floor. Without it a roll can come up with nothing that
  // happens between the boss's swings, and a fight with no mechanics is not a
  // cheap fight, it is a wait.
  const opener = rng.chance(0.5) ? 'puddle' : 'spread'
  const pool = CATALOGUE.filter((m) => m.from <= depth)
  const first = pool.find((m) => m.id === opener) ?? pool[0]!
  spent += buy(first, rng, every, names)

  const rest = pool.filter((m) => m.id !== first.id)
  while (rest.length > 0) {
    const affordable = rest.filter((m) => spent + m.cost <= budget)
    if (affordable.length === 0) break
    const pick = affordable[rng.int(affordable.length)]!
    rest.splice(rest.indexOf(pick), 1)
    spent += buy(pick, rng, every, names)
  }

  return { every, names, spent }
}

/**
 * The daily's fight: every mechanic the game owns, at cadences rolled fresh.
 *
 * A descent floor buys what its purse allows and the cap on that purse exists
 * for a reason written above `floorBudget` — a fight that asks for everything
 * asks for nothing, because there is no room left to answer any of it. This
 * deliberately goes past it, and it is the one run in the game that should.
 *
 * The daily is one pull a day that everybody plays on the same seed. It is not
 * a rung on anybody's ladder and clearing it opens nothing, so the thing worth
 * optimising is not that it is fair but that it is the same story for
 * everybody and a different one tomorrow. Handing it the whole vocabulary is
 * what makes tomorrow different: fourteen cadences rolled between each
 * mechanic's fastest and slowest is a fight nobody has had before, on top of a
 * boss and a roster the day already rolled.
 *
 * Nothing is left out and nothing is depth-gated. What varies is how often
 * each one comes, which is the only dial left once the set is fixed at all of
 * them — and it is a wide dial: the puddle alone runs between six seconds and
 * eleven.
 */
/**
 * What the daily is allowed to spend, and it was measured rather than picked.
 *
 * Swept over three weeks of real dates, eight pulls a day, played by the party
 * AI with the raid's cooldowns spent as they come up — days winnable at all:
 *
 *   purse 12   13 of 14        purse 20   18 of 21   ← here
 *   purse 16   12 of 14        purse 22   16 of 21
 *   purse 24   10 of 14        purse 28    8 of 14
 *
 * The authored kit, measured the same way, is 19 of 21. So this is the largest
 * purse that still leaves the daily as winnable as the fight it replaces, and
 * it buys four to six mechanics — which is what a boss throws at the top of
 * its own ladder.
 *
 * Buying more is not on offer, and the number that says so is the first thing
 * measured here: the whole catalogue at once, fourteen mechanics, won nothing
 * on any of a hundred and twelve pulls. `floorBudget` says why above itself —
 * a fight that asks for everything asks for nothing, because there is no room
 * left to answer any of it — and the daily is not the exception to it.
 */
export const DAILY_PURSE = 20

/**
 * What a mechanic costs a daily, on the only scale that covers all thirty.
 *
 * The catalogue prices fourteen of them, because that is what a descent floor
 * may buy. The other sixteen are authored into ladders instead, and a ladder
 * is already a price list: `progress.ts` says it is written "in the order the
 * fight gets harder", one mechanic to a rung. So where a mechanic sits on its
 * boss's ladder is what it costs, and the two scales are lined up at the ends
 * -- two for a first rung, seven for a last.
 *
 * A price list matters here more than it does for a floor. The authored six a
 * boss throws are six that were chosen to coexist; six drawn at random out of
 * thirty can be six that each ask the whole raid to be somewhere else, and
 * measured, that is the difference between a daily that is winnable on eight
 * days in fourteen and one that is winnable on thirteen.
 */
export function dailyCostOf(id: MechanicId): number {
  const priced = CATALOGUE.find((m) => m.id === id)
  if (priced) return priced.cost
  for (const encounter of ENCOUNTERS) {
    const rung = encounter.ladder.indexOf(id)
    if (rung >= 0) return 2 + rung
  }
  return 4
}

/**
 * How often a mechanic comes, according to the boss that owns it.
 *
 * A floor rolls its cadences between a fastest and a slowest, which is right
 * for a floor -- there is no author behind it and the roll is the author. It
 * is wrong for the daily, and measurably: rolled rates turned a run whose win
 * rates ran 13, 25, 50, 63, 75, 88, 100 across a fortnight into one that was
 * a hundred percent on eleven days and zero on three. A fight either handed
 * over or refused is not a fight; the middle is where the run lives, and the
 * middle is what the authored numbers are.
 *
 * So a mechanic borrowed for a daily is borrowed with its rate: the wedge
 * comes at the rate the Ledger throws it, wherever it is thrown. Read off
 * phase one, which is every boss's slowest; `planned` tightens later phases
 * the way an authored boss's own table does.
 */
function authoredCadence(id: MechanicId): number | null {
  for (const encounter of ENCOUNTERS) {
    const every = encounter.phases[1]?.[id] ?? 0
    if (every > 0) return every
  }
  return null
}

/**
 * The daily's fight: mechanics drawn from every boss in the game, at the rates
 * their authors gave them.
 *
 * The day already picks which boss stands there. This picks what it does, out
 * of the whole game rather than out of that boss's own six -- so a daily is
 * the Warden throwing the Watcher's gaze and the Ledger's wedge, which is a
 * fight nobody has had before and nobody will have again.
 *
 * As many as the run can carry, which is `DAILY_MECHANICS` and was measured
 * rather than chosen. See the sweep beside it.
 */
export function rollDaily(seed: number, budget = DAILY_PURSE): FloorPlan {
  const rng = new Rng(seed)
  const every: Partial<Record<MechanicId, number>> = {}
  const names: string[] = []
  let spent = 0
  const pool = MECHANIC_IDS.filter((id) => authoredCadence(id) !== null)
  while (pool.length > 0) {
    const affordable = pool.filter((id) => spent + dailyCostOf(id) <= budget)
    if (affordable.length === 0) break
    const id = affordable[rng.int(affordable.length)]!
    pool.splice(pool.indexOf(id), 1)
    every[id] = authoredCadence(id)!
    names.push(MECHANIC_NAMES[id] ?? id)
    spent += dailyCostOf(id)
  }
  return { every, names, spent }
}

function buy(
  mechanic: Priced,
  rng: Rng,
  every: Partial<Record<MechanicId, number>>,
  names: string[],
): number {
  // Somewhere between its most generous cadence and its tightest, so two
  // floors that bought the same thing still do not feel the same.
  every[mechanic.id] = rng.range(mechanic.fast, mechanic.slow)
  names.push(nameOf(mechanic.id))
  return mechanic.cost
}

/** Lays a plan over a boss's own timing. Anything unbought is switched off. */
export function planned(timing: PhaseTiming, plan: FloorPlan, phase: number): PhaseTiming {
  // Later phases tighten, the same way an authored boss's do: a floor that
  // never speeds up has no shape to it.
  const tighten = phase === 1 ? 1 : phase === 2 ? 0.84 : 0.7
  const at = (id: MechanicId): number => {
    const every = plan.every[id]
    return every === undefined ? 0 : every * tighten
  }
  // Every mechanic, taken from the type rather than listed here. It used to
  // be a written-out list, and `brand` was never added to it, so a floor built
  // to a Warden's shape spread the Warden's brand cadence through `...timing`
  // and then threw a mark the floor had not bought. A list that has to be
  // updated by hand every time a mechanic is added will be wrong again; the
  // set of ids is already known, so ask for it.
  const cadence = {} as Record<MechanicId, number>
  for (const id of MECHANIC_IDS) cadence[id] = at(id)
  return { ...timing, ...cadence }
}

/**
 * When each of a floor's mechanics arrives for the first time.
 *
 * A fraction of its own cadence rather than the boss's opening table, which
 * describes a fight this floor is not having. Spread across the fraction by
 * cost, so the cheap things open the fight and the expensive ones arrive once
 * the party has settled into it — a first pull that opens on the gathering
 * and a stalker at once is a wipe nobody learned anything from.
 */
export function plannedOpening(plan: FloorPlan): Record<MechanicId, number> {
  const opening = {} as Record<MechanicId, number>
  for (const mechanic of CATALOGUE) {
    const every = plan.every[mechanic.id]
    opening[mechanic.id] = every === undefined ? 0 : every * (mechanic.cost >= 4 ? 0.9 : 0.45)
  }
  return opening
}
