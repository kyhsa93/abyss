import { damageBoard, healingBoard, standings, type Attempt } from './history'
import { CLASSES } from './sim/classes'
import { ENCOUNTERS, type MechanicId } from './sim/encounters'
import type { AuraId, SimState } from './sim/types'

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

/** This pull's fight, by id, so an award can be about one of them. */
const fight = (s: SimState) => ENCOUNTERS[s.encounter]?.id

/** How many times the raid, all of it, was billed for these mechanics. */
const billed = (s: SimState, ...ids: MechanicId[]): number =>
  party(s).reduce(
    (total, a) => total + ids.reduce((n, id) => n + (s.tally[a.id]?.byMechanic[id] ?? 0), 0),
    0,
  )

/** How many bodies are wearing this at the end. */
const wearing = (s: SimState, id: AuraId): number =>
  party(s).filter((a) => a.auras.some((au) => au.id === id)).length

/**
 * A kill on one fight, judged by one rule.
 *
 * These six are the source's own achievement criteria, which are the one thing
 * in the whole instance that is *already* a designed goal for these fights
 * rather than a fact about them -- somebody sat down and decided what doing a
 * fight well looks like, and wrote it down. They are worth more than anything
 * else left in the data for that reason.
 *
 * Two of its eight are not here and both for the same reason: they ask a
 * question about a moment inside the fight rather than about the fight. Full
 * House wants five kinds of cultist standing at once, and Once Bitten wants to
 * know whether a particular body ever wore the gift. Nothing in this file can
 * see inside a pull -- an award is judged from the state the pull ended in,
 * which is what stops one from ever changing how a pull plays out -- so taking
 * those two would mean the simulation carrying a flag for the award layer, and
 * that is the trade this file exists not to make.
 */
function onKill(
  id: string,
  name: string,
  detail: string,
  boss: string,
  rule: (s: SimState) => boolean,
): Award {
  return { id, name, detail, earned: (s) => won(s) && fight(s) === boss && rule(s) }
}

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
  // --- the six the source already designed --------------------------------
  onKill(
    'unbroken',
    'Nobody Left Standing',
    'Kill the Bonegrinder with every spike broken in time.',
    // Boned: the source's own fails eight seconds after a body is impaled
    // rather than when one is, so what this asks is that no pin ran out.
    'marrow',
    (s) => billed(s, 'spike') === 0,
  ),
  onKill(
    'clean_board',
    'A Clean Board',
    'Kill the Bloodgorged with fewer than three marks out.',
    // I've Gone and Made a Mess: fewer than three at ten, five at
    // twenty-five, which is the raid's own size read the source's way.
    'gorged',
    (s) => wearing(s, 'championed') < (party(s).length > 10 ? 5 : 3),
  ),
  onKill(
    'short_of_shots',
    'Short of Shots',
    'Kill the Reeking Host with fewer than three of you covered.',
    // Flu Shot Shortage: `DATA_INOCULATED_STACK < 3`.
    'host',
    (s) => wearing(s, 'inoculated') < 3,
  ),
  onKill(
    'nothing_merged',
    'Nothing Merged',
    'Kill the Confluence without two small things ever becoming one.',
    // Dances with Oozes.
    'confluence',
    (s) => billed(s, 'merge') === 0,
  ),
  onKill(
    'neither_goo_nor_gas',
    'Neither Goo Nor Gas',
    'Kill the Two Flasks with nobody caught by the chase or the gas.',
    // Nausea, Heartburn, Indigestion: nobody hit by Malleable Goo or a
    // Choking Gas Bomb.
    'flasks',
    (s) => billed(s, 'hound', 'decant') === 0,
  ),
  onKill(
    'orb_whisperer',
    'The Orb Whisperer',
    'Kill the Three Crowns with nobody touched by what the crown empowers.',
    // The Orb Whisperer: no damage taken from an empowered ability.
    'crowns',
    (s) => billed(s, 'prison', 'thirst', 'ballast') === 0,
  ),
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
