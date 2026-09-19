import type { Outcome, SimState } from './sim/types'

/**
 * What you did on a given day's run, and only the best of it.
 *
 * One row per day rather than one per attempt: the point of a daily is that
 * everybody had the same fight, so what is worth keeping is the best answer
 * anybody gave it, not the twelve they gave first. Retries are allowed —
 * there is no server to cheat against, and a run you cannot practise is a run
 * you only ever see once.
 */
export interface DailyResult {
  /** YYYYMMDD, the same key the run is generated from. */
  key: number
  outcome: Outcome
  /** Seconds, on a kill. Lower is better and is the whole scoreboard. */
  time: number
  /** What the boss had left, on a loss. Lower is closer. */
  bossLeft: number
  attempts: number
  /** What was played, stored rather than recomputed: the boss list can grow. */
  boss: string
  spec: string
}

const KEY = 'abyss.daily'
const LIMIT = 60

export function load(): DailyResult[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is DailyResult =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as DailyResult).key === 'number' &&
        typeof (entry as DailyResult).time === 'number',
    )
  } catch {
    return []
  }
}

export function save(entries: DailyResult[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, LIMIT)))
  } catch {
    // Private browsing and full quotas are not worth failing over.
  }
}

export function todays(entries: DailyResult[], key: number): DailyResult | undefined {
  return entries.find((entry) => entry.key === key)
}

/**
 * Folds one finished run into the record.
 *
 * A kill always beats a loss; between two kills the faster wins; between two
 * losses the one that left the boss lower. Attempts keep counting either way,
 * because "cleared it on the eleventh try" is part of what happened.
 */
export function fold(
  entries: DailyResult[],
  key: number,
  s: SimState,
  boss: string,
  spec: string,
): DailyResult[] {
  const bossActor = s.actors[s.actors.length - 1]!
  const fresh: DailyResult = {
    key,
    outcome: s.outcome,
    time: Math.round(s.time * 10) / 10,
    bossLeft: Math.round((bossActor.hp / bossActor.maxHp) * 100),
    attempts: 1,
    boss,
    spec,
  }

  const existing = todays(entries, key)
  if (!existing) return [fresh, ...entries]

  const attempts = existing.attempts + 1
  const better =
    fresh.outcome === 'victory' && existing.outcome !== 'victory'
      ? fresh
      : fresh.outcome === 'victory' && existing.outcome === 'victory'
        ? fresh.time < existing.time
          ? fresh
          : existing
        : existing.outcome === 'victory'
          ? existing
          : fresh.bossLeft < existing.bossLeft
            ? fresh
            : existing

  return entries.map((entry) => (entry.key === key ? { ...better, attempts } : entry))
}
