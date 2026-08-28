import { damageBoard, healingBoard, standings, type Attempt } from './history'
import { CLASSES } from './sim/classes'
import type { SimState } from './sim/types'

/**
 * Things worth having done.
 *
 * Judged from the pull that just ended plus everything kept before it, in one
 * pure function each, so an award is a rule you can read rather than a flag
 * somebody remembered to set. Nothing in a fight can see any of this: the
 * simulation does not know awards exist, which is what stops one from ever
 * changing how a pull plays out.
 */

export interface Award {
  id: string
  name: string
  detail: string
  /** The pull that just finished, and the record including it. */
  earned: (s: SimState, history: Attempt[]) => boolean
}

const won = (s: SimState) => s.outcome === 'victory'

/**
 * Every class the player has pulled as.
 *
 * Read off their own row in each kept board, which the record always keeps
 * whatever it placed — so this cannot quietly stop counting on a night where
 * they finished last.
 */
const played = (history: Attempt[]): Set<string> =>
  new Set(history.flatMap((e) => e.standings.filter((r) => r.isPlayer).map((r) => r.classId)))

const player = (s: SimState) => s.actors.find((a) => a.isPlayer)
const party = (s: SimState) => s.actors.filter((a) => a.faction === 'party')

export const AWARDS: Award[] = [
  {
    id: 'first_kill',
    name: 'First Blood',
    detail: 'Kill the Drowned Warden.',
    earned: (s) => won(s),
  },
  {
    id: 'heroic_kill',
    name: 'Heroic',
    detail: 'Kill it on heroic.',
    earned: (s) => won(s) && s.difficulty === 'heroic',
  },
  {
    id: 'raid_kill',
    name: 'Full Raid',
    detail: 'Kill it with twenty-five.',
    earned: (s) => won(s) && party(s).length === 25,
  },
  {
    id: 'flawless',
    name: 'Nobody Fell',
    detail: 'Kill it without losing anyone.',
    earned: (s) => won(s) && party(s).every((a) => a.alive),
  },
  {
    id: 'untouched',
    name: 'Untouched',
    detail: 'Kill it without standing in anything.',
    earned: (s) => {
      const you = player(s)
      return won(s) && you !== undefined && (s.tally[you.id]?.mechanicHits ?? 0) === 0
    },
  },
  {
    id: 'quick',
    name: 'Inside Two Minutes',
    detail: 'Kill it in under 110 seconds.',
    earned: (s) => won(s) && s.time < 110,
  },
  {
    id: 'top_of_meter',
    name: 'Top of the Meter',
    detail: 'Finish a kill first on your own board.',
    // Your own board, since there are two of them and they are not ranked
    // against each other: topping the damage board as a healer would be an
    // award for a fight nobody asked you to have.
    earned: (s) => {
      const you = player(s)
      if (!won(s) || !you) return false
      const board = you.role === 'healer' ? healingBoard(s) : damageBoard(s)
      return board[0]?.isPlayer ?? false
    },
  },
  {
    id: 'held_it',
    name: 'Held It',
    detail: 'Tank a kill: finish it holding the most threat.',
    earned: (s) => {
      const you = player(s)
      if (!won(s) || !you) return false
      const top = party(s).reduce((best, a) =>
        (s.threat[a.id] ?? 0) > (s.threat[best.id] ?? 0) ? a : best,
      )
      return top.id === you.id
    },
  },
  {
    id: 'kept_them_up',
    name: 'Kept Them Up',
    detail: 'Heal more than anyone did damage, in a kill.',
    earned: (s) => {
      const you = player(s)
      if (!won(s) || !you) return false
      const board = standings(s)
      const mine = board.find((row) => row.isPlayer)
      return mine !== undefined && mine.hps > Math.max(0, ...board.map((row) => row.dps))
    },
  },
  {
    id: 'persistent',
    name: 'Ten Pulls In',
    detail: 'Pull it ten times.',
    earned: (_s, history) => history.length >= 10,
  },
  {
    id: 'tourist',
    name: 'Tried Everything',
    detail: 'Pull as five different classes.',
    earned: (_s, history) => played(history).size >= 5,
  },
  {
    id: 'every_class',
    name: 'The Whole Roster',
    detail: `Pull as all ${Object.keys(CLASSES).length} classes.`,
    earned: (_s, history) => played(history).size >= Object.keys(CLASSES).length,
  },
]

const KEY = 'abyss.awards'

/** Award id to when it was first earned. */
export type Earned = Record<string, number>

export function load(): Earned {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const known = new Set(AWARDS.map((a) => a.id))
    // An award that no longer exists is dropped rather than kept as a ghost
    // on a screen that has no row to draw it in.
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        ([id, at]) => known.has(id) && typeof at === 'number',
      ),
    ) as Earned
  } catch {
    return {}
  }
}

export function save(earned: Earned): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(earned))
  } catch {
    // Private browsing and full quotas are not worth failing over.
  }
}

/**
 * What the pull that just ended earned that was not already held.
 *
 * Returns only the new ones, so the announcement is of something that just
 * happened rather than of everything ever done.
 */
export function check(s: SimState, history: Attempt[], earned: Earned, at: number): Award[] {
  const fresh: Award[] = []
  for (const award of AWARDS) {
    if (earned[award.id] !== undefined) continue
    if (!award.earned(s, history)) continue
    earned[award.id] = at
    fresh.push(award)
  }
  return fresh
}
