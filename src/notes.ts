import { ENCOUNTERS, MECHANIC_IDS, MECHANIC_NAMES, kitThrough, type MechanicId } from './sim/encounters'
import type { SimState } from './sim/types'

/**
 * What you know about each boss, written by having fought it.
 *
 * Nothing on a character in this game gets stronger, so the thing a pull can
 * pay out is not power — it is knowing what the fight is going to do. That
 * was already true and already invisible: the mechanics a boss owns are named
 * on the setup screen only as a count, and what any of them did to you last
 * time was thrown away with the meter when the overlay closed.
 *
 * So a page per boss, filled in by what has actually been in front of you: the
 * mechanics this fight has shown you, how many of them have landed, and how
 * much of the boss is still unmet. A mechanic you have never reached is left
 * named but blank rather than hidden — what is still up there is worth
 * knowing, the same reason the setup screen lists its locked rungs.
 *
 * It is a record, not a modifier. Nothing in a fight reads any of this, which
 * is the same rule the awards keep and the reason it can be kept per boss
 * rather than per pull without ever changing what a pull does.
 */

export interface BossNote {
  /** The boss's own id, so a re-ordered `ENCOUNTERS` cannot re-point a page. */
  boss: string
  pulls: number
  kills: number
  /** The deepest phase this boss has ever been taken to. */
  phase: number
  /**
   * Every mechanic this boss has shown you, and how many have landed on you.
   *
   * The key being present is the knowledge; the number is only how badly it
   * has gone. Zero is the interesting case — met it, never eaten it.
   */
  met: Partial<Record<MechanicId, number>>
}

export type Notes = Record<string, BossNote>

const KEY = 'abyss.notes'

export function empty(boss: string): BossNote {
  return { boss, pulls: 0, kills: 0, phase: 0, met: {} }
}

function valid(entry: unknown): entry is BossNote {
  if (typeof entry !== 'object' || entry === null) return false
  const note = entry as Partial<BossNote>
  return (
    typeof note.boss === 'string' &&
    typeof note.pulls === 'number' &&
    typeof note.kills === 'number' &&
    typeof note.phase === 'number' &&
    typeof note.met === 'object' &&
    note.met !== null
  )
}

export function load(): Notes {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const notes: Notes = {}
    for (const [id, entry] of Object.entries(parsed as Record<string, unknown>)) {
      // A page for a boss that no longer exists is dropped rather than kept:
      // there is no screen that could show it and no fight that could add to
      // it.
      if (valid(entry) && ENCOUNTERS.some((e) => e.id === id)) notes[id] = entry
    }
    return notes
  } catch {
    return {}
  }
}

export function save(notes: Notes): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(notes))
  } catch {
    // Private browsing and full quotas are not worth failing over.
  }
}

/**
 * Folds one finished pull into the page for the boss it was against.
 *
 * Every raid pull counts, a daily and a floor of a descent included: they are
 * all that boss doing that thing to you, and a page that only counted the
 * ordinary rungs would be blank for a player who mostly plays the daily.
 * Battlegrounds have no boss and no page.
 *
 * What it does not do is judge. The best kill and the cleanest one are kept by
 * `bests`, one row per thing worth being best at; this counts what has been
 * seen, which only ever grows.
 */
export function fold(notes: Notes, s: SimState): Notes {
  if (s.mode !== 'raid') return notes
  const fight = ENCOUNTERS[s.encounter]
  if (!fight) return notes

  const before = notes[fight.id] ?? empty(fight.id)
  const phase = Math.max(before.phase, s.phase)
  const met: Partial<Record<MechanicId, number>> = { ...before.met }

  // Shown by this pull, whether or not it landed: the phase reached is what
  // says how much of the fight was actually in front of you.
  //
  // Off the plan when there is one. A rolled fight throws what it bought and
  // nothing the boss would otherwise have thrown, so reading the ladder here
  // would file a mechanic as met on a night it never appeared — and the notes
  // are the one page in the game whose whole job is to be true about what you
  // have seen. A plan is not phase-gated the way a ladder is: `planned` lays
  // the same cadences over every phase, so everything bought is in front of
  // you from the first one.
  const shown = s.plan
    ? (Object.keys(s.plan.every) as MechanicId[])
    : kitThrough(fight, s.party.length, s.difficulty, s.phase)
  for (const id of shown) {
    met[id] = met[id] ?? 0
  }

  // And what it cost you. Only your own row — the party's mistakes are the
  // party's, and a page that counted theirs would say a fight you played
  // cleanly went badly.
  const you = s.actors.find((a) => a.isPlayer)
  const bill = you ? (s.tally[you.id]?.byMechanic ?? {}) : {}
  for (const [id, hits] of Object.entries(bill) as Array<[MechanicId, number]>) {
    met[id] = (met[id] ?? 0) + hits
  }

  return {
    ...notes,
    [fight.id]: {
      boss: fight.id,
      pulls: before.pulls + 1,
      kills: before.kills + (s.outcome === 'victory' ? 1 : 0),
      phase,
      met,
    },
  }
}

/** One boss's page, in the order the page is read. */
export interface NotePage {
  boss: string
  name: string
  pulls: number
  kills: number
  phase: number
  /** Every mechanic the boss owns, in ladder order, met or not. */
  rungs: Array<{ id: MechanicId; name: string; met: boolean; hits: number }>
  /** How many of the boss's own mechanics have been in front of you. */
  metCount: number
  /** The one that has landed on you most, if any has. */
  worst: MechanicId | null
}

/**
 * A boss's page, assembled from the note and the boss's own table.
 *
 * The ladder is the boss's, not the note's: what is worth knowing is how much
 * of this fight is still unmet, and a page built only from what was recorded
 * could never say that.
 */
export function pageFor(notes: Notes, encounter: number): NotePage | null {
  const fight = ENCOUNTERS[encounter]
  if (!fight) return null
  const note = notes[fight.id] ?? empty(fight.id)

  const rungs = fight.ladder.map((id) => ({
    id,
    name: MECHANIC_NAMES[id],
    met: note.met[id] !== undefined,
    hits: note.met[id] ?? 0,
  }))

  let worst: MechanicId | null = null
  for (const rung of rungs) {
    if (rung.hits > 0 && (worst === null || rung.hits > (note.met[worst] ?? 0))) worst = rung.id
  }

  return {
    boss: fight.id,
    name: fight.name,
    pulls: note.pulls,
    kills: note.kills,
    phase: note.phase,
    rungs,
    metCount: rungs.filter((r) => r.met).length,
    worst,
  }
}

/** How much of the whole game's mechanic list has been met, for the tab line. */
export function metOverall(notes: Notes): { met: number; total: number } {
  const met = new Set<MechanicId>()
  for (const note of Object.values(notes)) {
    for (const id of Object.keys(note.met) as MechanicId[]) met.add(id)
  }
  return { met: met.size, total: MECHANIC_IDS.length }
}
