import { CLASSES, type DifficultyId, type Pick, type SpecId } from './sim/classes'
import { ENCOUNTERS } from './sim/encounters'
import type { Outcome, SimState } from './sim/types'

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
 * The meter's ranking.
 *
 * Damage plus healing, the same way the after-action report ranks, so a
 * healer is not permanently last on a board that only counts damage. Lives
 * here rather than in the meter because the record has to agree with what was
 * on screen — two rankings would eventually be two different answers.
 */
export function standings(s: SimState): Standing[] {
  const seconds = Math.max(1, s.time)
  return s.actors
    .filter((a) => a.faction === 'party')
    .map((a) => ({
      name: a.name,
      classId: a.classId,
      spec: a.spec,
      dps: Math.round((s.tally[a.id]?.damage ?? 0) / seconds),
      hps: Math.round((s.tally[a.id]?.healing ?? 0) / seconds),
      isPlayer: a.isPlayer,
    }))
    .sort((a, b) => b.dps + b.hps - (a.dps + a.hps))
}

/** Builds the record of a finished pull. Pure, so the checks can call it. */
export function record(s: SimState, at: number): Attempt | null {
  if (s.outcome === 'ongoing') return null

  const board = standings(s)
  const top = board.slice(0, STANDING_LIMIT)
  // Your own row is kept whatever it placed. A board you dropped off the
  // bottom of is a board that does not answer the question you opened it for.
  const own = board.find((row) => row.isPlayer)
  if (own && !top.includes(own)) top[top.length - 1] = own

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
  return typeof r.name === 'string' && typeof r.dps === 'number' && typeof r.hps === 'number'
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
  const best = (rows: Standing[]) =>
    rows.length > 0 ? Math.max(...rows.map((r) => r.dps + r.hps)) : 0

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
