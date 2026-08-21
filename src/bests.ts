import { ENCOUNTERS } from './sim/encounters'
import type { SimState } from './sim/types'

/**
 * Personal bests, and the moment one of them moves.
 *
 * Nothing on a character in this game gets stronger — the party learns and the
 * player learns, and neither of those has a bar. So the evidence that anything
 * is improving has to be the record itself, and a record that is only visible
 * on a screen you open afterwards is a record nobody notices beating.
 *
 * Kept apart from the pull history, which is a log: this is one row per thing
 * worth being best at, and it only ever moves in one direction.
 */
export interface Bests {
  /** Fastest kill per boss, in seconds, keyed by the boss's own id. */
  kills: Record<string, number>
  /** Fewest mechanics eaten in a kill, per boss. */
  clean: Record<string, number>
  /** Deepest floor of a descent. */
  depth: number
  /** Most damage dealt in one pull, by you. */
  damage: number
}

const KEY = 'abyss.bests'

export function empty(): Bests {
  return { kills: {}, clean: {}, depth: 0, damage: 0 }
}

export function load(): Bests {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return empty()
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return empty()
    const value = parsed as Partial<Bests>
    return {
      kills: typeof value.kills === 'object' && value.kills !== null ? value.kills : {},
      clean: typeof value.clean === 'object' && value.clean !== null ? value.clean : {},
      depth: typeof value.depth === 'number' ? value.depth : 0,
      damage: typeof value.damage === 'number' ? value.damage : 0,
    }
  } catch {
    return empty()
  }
}

export function save(bests: Bests): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(bests))
  } catch {
    // Private browsing and full quotas are not worth failing over.
  }
}

/** One thing that just got better, in the words it should be announced in. */
export interface Beaten {
  name: string
  detail: string
}

/**
 * Folds a finished pull into the record, and says what moved.
 *
 * The first time something is recorded is not a personal best — "your fastest
 * kill of a boss you have killed once" is every kill, and an announcement that
 * fires every time announces nothing.
 */
export function beat(bests: Bests, s: SimState, depth: number): { bests: Bests; beaten: Beaten[] } {
  const beaten: Beaten[] = []
  const next: Bests = {
    kills: { ...bests.kills },
    clean: { ...bests.clean },
    depth: bests.depth,
    damage: bests.damage,
  }

  const boss = ENCOUNTERS[s.encounter]
  const player = s.actors.find((a) => a.isPlayer)
  const own = player ? s.tally[player.id] : undefined

  if (boss && s.outcome === 'victory') {
    const time = Math.round(s.time * 10) / 10
    const had = next.kills[boss.id]
    if (had === undefined) next.kills[boss.id] = time
    else if (time < had) {
      next.kills[boss.id] = time
      beaten.push({
        name: 'FASTEST KILL',
        detail: `${boss.name} in ${time.toFixed(1)}s, ${(had - time).toFixed(1)}s off your best`,
      })
    }

    const hits = own?.mechanicHits ?? 0
    const cleanest = next.clean[boss.id]
    if (cleanest === undefined) next.clean[boss.id] = hits
    else if (hits < cleanest) {
      next.clean[boss.id] = hits
      beaten.push({
        name: hits === 0 ? 'UNTOUCHED' : 'CLEANEST KILL',
        detail:
          hits === 0
            ? `${boss.name} without eating a single mechanic`
            : `${boss.name} on ${hits} mechanic hits, down from ${cleanest}`,
      })
    }
  }

  if (depth > 0 && depth > next.depth) {
    const had = next.depth
    next.depth = depth
    if (had > 0) {
      beaten.push({ name: 'DEEPER THAN EVER', detail: `floor ${depth}, past your old ${had}` })
    }
  }

  const dealt = Math.round(own?.damage ?? 0)
  if (dealt > next.damage) {
    const had = next.damage
    next.damage = dealt
    if (had > 0 && dealt > had * 1.02) {
      beaten.push({
        name: 'YOUR BIGGEST PULL',
        detail: `${(dealt / 1000).toFixed(1)}k damage, past ${(had / 1000).toFixed(1)}k`,
      })
    }
  }

  return { bests: next, beaten }
}
