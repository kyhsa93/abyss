import { CLASSES, type DifficultyId, type Pick, type SpecId } from './sim/classes'
import { ENCOUNTERS } from './sim/encounters'
import type { Outcome, Role, SimState } from './sim/types'

/**
 * What the meter said, pull by pull.
 *
 * The meter is the thing anyone actually reads during a fight and the thing
 * they argue about afterwards, so the record is the meter rather than a log
 * of outcomes. Kept in local storage: it outlives a pull, a party and a page
 * load, and nothing in a fight may read it.
 */

export interface Standing {
  name: string
  classId: string
  spec: string
  /**
   * Which board this row belongs on.
   *
   * Kept on the row rather than looked up from the class, because a record
   * outlives the roster: a spec that changes role in a later version must not
   * silently move an old row onto the other board.
   */
  role: Role
  dps: number
  hps: number
  isPlayer: boolean
}

export interface Attempt {
  /** Wall clock, stamped by the page rather than the simulation. */
  at: number
  size: number
  difficulty: DifficultyId
  outcome: Outcome
  /** Ranked the way the meter ranks, best first. */
  standings: Standing[]
  /**
   * Which boss, how long it took, and what you ate doing it.
   *
   * A log of who out-damaged whom says nothing about whether you are getting
   * better at this; these three do, and they are what a trend is read off.
   * Optional because a record written before they existed is still a record.
   */
  boss?: string
  seconds?: number
  mechanics?: number
}

const KEY = 'abyss.history'

/**
 * Kept deliberately short, and each pull deliberately shallow.
 *
 * Twenty pulls of nine rows is a night's worth of standings you can read
 * rather than a database you scroll, and it is a few kilobytes rather than
 * the several hundred a full twenty-five man board for forty pulls would be.
 */
export const HISTORY_LIMIT = 20
export const STANDING_LIMIT = 9

/**
 * What a row is measured on.
 *
 * Damage and healing are not the same unit and adding them was the meter's
 * oldest lie: a healer on three thousand a second was ranked above a damage
 * dealer on two thousand nine hundred as though the two numbers answered the
 * same question. They answer different ones, so each row is scored on its own,
 * and rows scored on different numbers are never ranked against each other.
 */
export function score(row: Standing): number {
  return row.role === 'healer' ? row.hps : row.dps
}

/** The unit a row is quoted in, since it is no longer always the same one. */
export function unit(row: Standing): 'dps' | 'hps' {
  return row.role === 'healer' ? 'hps' : 'dps'
}

/** Every party member's numbers, in no particular order. */
function tallied(s: SimState): Standing[] {
  const seconds = Math.max(1, s.time)
  return s.actors
    .filter((a) => a.faction === 'party')
    .map((a) => ({
      name: a.name,
      classId: a.classId,
      spec: a.spec,
      role: a.role,
      dps: Math.round((s.tally[a.id]?.damage ?? 0) / seconds),
      hps: Math.round((s.tally[a.id]?.healing ?? 0) / seconds),
      isPlayer: a.isPlayer,
    }))
}

/**
 * The record's ranking: two boards, one after the other.
 *
 * One row per person — this is a table of who was there, not a board — with
 * the damage board first and the healing board after it, each sorted on its
 * own number. Lives here rather than in the screens that draw it because the
 * record has to agree with what was on screen, and two rankings would
 * eventually be two different answers.
 */
export function standings(s: SimState): Standing[] {
  const rows = tallied(s)
  const damage = rows.filter((r) => r.role !== 'healer').sort((a, b) => b.dps - a.dps)
  const healing = rows.filter((r) => r.role === 'healer').sort((a, b) => b.hps - a.hps)
  return [...damage, ...healing]
}

/**
 * The two live boards, which are not a partition.
 *
 * A healer who spends a gap on damage did that damage and belongs on the
 * damage board for it; a druid who threw one heal belongs on the healing one.
 * So membership is having contributed the number rather than owning the role,
 * and a zero is left off rather than padding the board with rows that say
 * nothing. Whoever is reading it is put back on by the meter itself.
 */
export function damageBoard(s: SimState): Standing[] {
  return tallied(s)
    .filter((r) => r.dps > 0)
    .sort((a, b) => b.dps - a.dps)
}

export function healingBoard(s: SimState): Standing[] {
  return tallied(s)
    .filter((r) => r.hps > 0)
    .sort((a, b) => b.hps - a.hps)
}

/**
 * Which board the live meter is showing, and who is on it.
 *
 * Three rows on a portrait phone is no room for two boards, and the question
 * the meter answers during a pull is "am I pulling my weight" rather than
 * "how is everyone doing" — so it shows the board the reader is on. Decided
 * here rather than inside the drawing, because which board a player is
 * looking at is a rule about the game and a rule that lives in a draw call is
 * a rule nothing can check.
 */
export function meterBoard(s: SimState): { healing: boolean; rows: Standing[] } {
  const healing = s.actors.find((a) => a.isPlayer)?.role === 'healer'
  return { healing, rows: healing ? healingBoard(s) : damageBoard(s) }
}

/**
 * Nine rows out of a raid, split the way the raid is.
 *
 * Taking the first nine of a role-grouped board would keep the damage board
 * and throw the healing one away entirely: twenty-five men field twenty
 * damage rows before the first healer, so a record of a full raid would have
 * held no evidence that anybody was healed. So the cap is shared out in the
 * proportion the raid actually has, and the healing board is never rounded
 * down to nothing — one healer named is the difference between a partial
 * record and a wrong one.
 */
function capped(board: Standing[]): Standing[] {
  if (board.length <= STANDING_LIMIT) return [...board]
  const healers = board.filter((r) => r.role === 'healer')
  const damage = board.filter((r) => r.role !== 'healer')
  if (healers.length === 0) return damage.slice(0, STANDING_LIMIT)
  if (damage.length === 0) return healers.slice(0, STANDING_LIMIT)
  const share = Math.round((STANDING_LIMIT * healers.length) / board.length)
  // Both boards keep at least one row, whatever the rounding said.
  const forHealers = Math.max(1, Math.min(STANDING_LIMIT - 1, share))
  return [...damage.slice(0, STANDING_LIMIT - forHealers), ...healers.slice(0, forHealers)]
}

/** Builds the record of a finished pull. Pure, so the checks can call it. */
export function record(s: SimState, at: number): Attempt | null {
  if (s.outcome === 'ongoing') return null

  const board = standings(s)
  const top = capped(board)
  // Your own row is kept whatever it placed. A board you dropped off the
  // bottom of is a board that does not answer the question you opened it for.
  //
  // Put back into its own block rather than onto the end of the list: the
  // last row is a healing row now, so writing a damage dealer there would
  // both file them under the wrong ranking and evict the healer whose place
  // the cap had just gone to the trouble of reserving.
  const own = board.find((row) => row.isPlayer)
  if (own && !top.includes(own)) {
    const mine = (row: Standing) => (row.role === 'healer') === (own.role === 'healer')
    const last = top.map(mine).lastIndexOf(true)
    top[last >= 0 ? last : top.length - 1] = own
  }

  const player = s.actors.find((a) => a.isPlayer)
  return {
    at,
    size: board.length,
    difficulty: s.difficulty,
    outcome: s.outcome,
    standings: top,
    boss: ENCOUNTERS[s.encounter]?.id,
    seconds: Math.round(s.time * 10) / 10,
    mechanics: player ? (s.tally[player.id]?.mechanicHits ?? 0) : 0,
  }
}

function validStanding(row: unknown): row is Standing {
  if (typeof row !== 'object' || row === null) return false
  const r = row as Partial<Standing>
  if (typeof r.name !== 'string' || typeof r.dps !== 'number' || typeof r.hps !== 'number') {
    return false
  }
  // A record written before the boards were split has no role on it. Read one
  // off the numbers rather than dropping the row: whoever healed more than
  // they hit was the healer, which is the same answer the old board's own
  // label logic gave, so an old night reads the way it always did.
  if (r.role !== 'tank' && r.role !== 'healer' && r.role !== 'dps') {
    ;(row as Standing).role = r.hps! > r.dps! ? 'healer' : 'dps'
  }
  return true
}

function valid(entry: unknown): entry is Attempt {
  if (typeof entry !== 'object' || entry === null) return false
  const a = entry as Partial<Attempt>
  if (typeof a.at !== 'number' || typeof a.size !== 'number') return false
  if (a.outcome !== 'victory' && a.outcome !== 'wipe' && a.outcome !== 'enrage') return false
  if (a.difficulty !== 'normal' && a.difficulty !== 'heroic') return false
  return Array.isArray(a.standings) && a.standings.every(validStanding)
}

export function load(): Attempt[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // One bad row does not throw the night away: the rest still reads.
    return parsed.filter(valid).slice(0, HISTORY_LIMIT)
  } catch {
    return []
  }
}

/** Newest first, capped. Returns the list to draw rather than mutating one. */
export function append(entries: Attempt[], entry: Attempt): Attempt[] {
  return [entry, ...entries].slice(0, HISTORY_LIMIT)
}

export function save(entries: Attempt[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries))
  } catch {
    // Private browsing and full quotas are not worth failing over.
  }
}

export interface Totals {
  pulls: number
  kills: number
  /** The best the player has personally managed, over every pull kept. */
  bestOwn: number
  /** And the best anybody managed, which is usually not the same number. */
  bestAny: number
}

/**
 * How the last few goes at one boss are trending.
 *
 * Kills only, and the same boss at the same difficulty — a wipe has no time to
 * compare and a heroic pull is not the same question as a normal one. Two is
 * the fewest that can have a direction.
 */
export interface Trend {
  boss: string
  kills: number
  latest: number
  previous: number
  /** Negative is faster, which is better; in seconds. */
  delta: number
  mechanics: number
  mechanicsBefore: number
}

export function trend(entries: Attempt[], boss: string, difficulty: DifficultyId): Trend | null {
  const kills = entries.filter(
    (entry) =>
      entry.outcome === 'victory' &&
      entry.boss === boss &&
      entry.difficulty === difficulty &&
      typeof entry.seconds === 'number',
  )
  if (kills.length < 2) return null

  // Newest first, which is the order the record is kept in.
  const latest = kills[0]!
  const previous = kills[1]!
  return {
    boss,
    kills: kills.length,
    latest: latest.seconds!,
    previous: previous.seconds!,
    delta: latest.seconds! - previous.seconds!,
    mechanics: latest.mechanics ?? 0,
    mechanicsBefore: previous.mechanics ?? 0,
  }
}

export function totals(entries: Attempt[]): Totals {
  const own = entries.flatMap((e) => e.standings.filter((r) => r.isPlayer))
  const any = entries.flatMap((e) => e.standings)
  // Each row against its own number, since the two are not comparable and a
  // best that summed them was a best at nothing in particular.
  const best = (rows: Standing[]) => (rows.length > 0 ? Math.max(...rows.map(score)) : 0)

  return {
    pulls: entries.length,
    kills: entries.filter((e) => e.outcome === 'victory').length,
    bestOwn: best(own),
    bestAny: best(any),
  }
}

/** How a pick reads on a row: the class, and the spec when it is not obvious. */
export function label(classId: string, spec: string): string {
  const cls = CLASSES[classId as Pick['classId']]
  if (!cls) return classId
  if (cls.specs.length === 1) return cls.name
  const found = cls.specs.find((s) => s.id === (spec as SpecId))
  if (!found) return cls.name
  return `${cls.name} ${found.id[0]!.toUpperCase()}${found.id.slice(1)}`
}
