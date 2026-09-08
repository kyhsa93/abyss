import {
  CHAMBERS,
  PASSAGES,
  chamberAt,
  gateOpen,
  padsLit,
  passageBetween,
  passageKey,
  reachable,
  type Chamber,
} from './dungeon'
import type { Corridor } from './sim/travel'
import type { DifficultyId, RaidSize } from './sim/classes'

/**
 * One evening in the citadel.
 *
 * The raid is a fight learned by repeating it, which is one room at a time
 * forever. This is the shape that leaves out — twelve rooms in an order, a
 * door at the bottom and a throne at the top, and an evening that ends
 * somewhere between them, with what you killed still dead when you come back.
 *
 * What it keeps is deliberately small: where the party is standing, what is
 * dead, and what the party walked out of the last room with. Everything else —
 * which fight is in which room, what opens what — is the map, and a run that
 * carried its own copy of that would be a run that could disagree with it.
 */

export interface Run {
  /** The evening's own seed. Each room derives its fight's seed from this. */
  seed: number
  size: RaidSize
  difficulty: DifficultyId
  /** Where the party is standing. */
  at: string
  /** Rooms whose fight is down, in the order they fell. */
  cleared: string[]
  /**
   * What each slot walked out of the last room with, as a fraction of its own
   * health, and -1 for a body that did not walk out at all.
   *
   * By slot rather than by name: the roster is fixed for the evening, so the
   * index is the person, and a saved run that stored names would break the
   * first time somebody renamed themselves between two rooms.
   */
  carried: number[]
  /** How many rooms have been entered, cleared or not. The evening's length. */
  entered: number
  /**
   * Doors whose ground has been taken, by `passageKey`.
   *
   * A corridor is walked once an evening and then it is a door like any other.
   * Paying for it twice would make it a toll, and what it is is the price of
   * getting there the first time — which is also the whole worth of a pad:
   * once the wing is done, the walk to it stops being part of it.
   */
  walked: string[]
  /**
   * Rooms the party has stood in tonight.
   *
   * What makes a pad worth lighting. The gate on a pad says the citadel has
   * opened it; this says the party has actually been there — and a pad that
   * teleported you somewhere you had not walked to would be a citadel with the
   * corridors switched off, which is most of what an evening in it is.
   */
  visited: string[]
}

/**
 * What it costs to go somewhere from where the party is standing.
 *
 * The four answers the map can give, and they are the whole of how an evening
 * moves. Anywhere further than one door is not one of them: a citadel you can
 * cross by pressing the far end is a menu with a drawing over it, and the pads
 * are the game's own answer to not wanting to walk it again.
 */
export type Step =
  | { kind: 'here' }
  | { kind: 'step'; to: string }
  | { kind: 'walk'; to: string; corridor: Corridor; key: string }
  | { kind: 'jump'; to: string }
  | { kind: 'shut' }

/**
 * What a room gives back on the way in.
 *
 * The numbers the retired descent was tuned with, kept on purpose: they were
 * fitted to exactly this question — a party that finished at ten percent has
 * already lost the next room, and being told so a minute later is not a
 * decision — and there is no reason to believe a room differs from a floor
 * before anything has been measured.
 *
 * Half of what a room gives back is bought rather than granted now: a corridor
 * mends the party while nothing in it is awake (see `CORRIDOR_MEND`), so a
 * raid that clears the ground and then walks it arrives healthier than one
 * that pushes through with a pack still up. What is left here is the floor
 * under that — the doors with no ground behind them, and the first room of the
 * evening.
 */
export const ROOM_RECOVERY = 0.55
export const ROOM_REVIVE = 0.45

/** The room every evening starts in. */
export const DOOR = 'threshold'

export function startRun(seed: number, size: RaidSize, difficulty: DifficultyId): Run {
  return {
    seed,
    size,
    difficulty,
    at: DOOR,
    cleared: [],
    carried: [],
    entered: 0,
    walked: [],
    visited: [DOOR],
  }
}

/** Whether the ground behind this door has already been taken tonight. */
export function isWalked(run: Run, key: string): boolean {
  return run.walked.includes(key)
}

/** The ground taken, which is a door that costs nothing from here on. */
export function walkedTo(run: Run, key: string, at: string, carried: number[]): Run {
  return {
    ...run,
    at,
    carried,
    walked: isWalked(run, key) ? run.walked : [...run.walked, key],
    visited: run.visited.includes(at) ? run.visited : [...run.visited, at],
  }
}

/** Standing somewhere the party could already walk to. */
export function stepped(run: Run, at: string): Run {
  return { ...run, at, visited: run.visited.includes(at) ? run.visited : [...run.visited, at] }
}

/**
 * How the party gets to a room, or that it cannot.
 *
 * A lit pad first, because that is what a pad is for and it reaches anywhere:
 * the source lights them as wings fall, and what they buy is exactly the walk
 * this function otherwise charges for. Then the door itself, which is either
 * clear or held.
 */
export function stepTo(run: Run, to: string): Step {
  if (to === run.at) return { kind: 'here' }
  const chamber = chamberAt(to)
  if (!chamber) return { kind: 'shut' }
  const cleared = new Set(run.cleared)
  // A pad, which is the only thing on this map that reaches further than a
  // door — and only to somewhere the party has already walked to. Lighting one
  // for a room nobody has been to would switch the corridors off.
  if (run.visited.includes(to) && padsLit(cleared).some((c) => c.id === to)) {
    return { kind: 'jump', to }
  }
  const passage = passageBetween(run.at, to)
  if (!passage || !gateOpen(passage.gate, cleared)) return { kind: 'shut' }
  const key = passageKey(passage.from, passage.to)
  if (passage.corridor && !isWalked(run, key)) {
    return { kind: 'walk', to, corridor: passage.corridor, key }
  }
  return { kind: 'step', to }
}

/** Every door out of where the party is standing, and the pads. */
export function ways(run: Run): Array<{ to: string; step: Step }> {
  const seen = new Set<string>()
  const out: Array<{ to: string; step: Step }> = []
  for (const passage of PASSAGES) {
    for (const [a, b] of [
      [passage.from, passage.to],
      [passage.to, passage.from],
    ]) {
      if (a !== run.at || seen.has(b)) continue
      seen.add(b)
      out.push({ to: b, step: stepTo(run, b) })
    }
  }
  for (const pad of padsLit(new Set(run.cleared))) {
    if (seen.has(pad.id) || pad.id === run.at || !run.visited.includes(pad.id)) continue
    seen.add(pad.id)
    out.push({ to: pad.id, step: stepTo(run, pad.id) })
  }
  return out.filter((w) => w.step.kind !== 'shut')
}

export function isCleared(run: Run, id: string): boolean {
  return run.cleared.includes(id)
}

/** Everywhere the party could walk to right now. */
export function open(run: Run): Chamber[] {
  const cleared = new Set(run.cleared)
  return CHAMBERS.filter((c) => reachable(cleared).has(c.id))
}

/**
 * The rooms worth walking into: reachable, holding a fight, still alive.
 *
 * A room whose fight is not built yet is not one of them. The map knows all
 * twelve and the game has three, and a run that offered a door onto an empty
 * room would be offering a bug. Getting *to* a room is a different question —
 * see `stepTo`.
 */
export function enterable(run: Run): Chamber[] {
  return open(run).filter((c) => c.encounter !== null && !isCleared(run, c.id))
}

/** Whether the evening is over, which is the throne going down. */
export function finished(run: Run): boolean {
  return isCleared(run, 'throne')
}

/**
 * The seed a room's fight runs on.
 *
 * Off the evening and the room rather than off a pull count: the same room in
 * the same evening is the same fight, so a wipe and a second try are two
 * attempts at one thing rather than two different things. Across evenings it
 * moves, because an evening is not something you learn by heart.
 */
export function roomSeed(run: Run, id: string): number {
  let hash = 0
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return run.seed + Math.abs(hash) * 7919
}

/** Walking into a room. Nothing about the fight, only where the party is. */
export function enter(run: Run, id: string): Run {
  if (!open(run).some((c) => c.id === id)) return run
  return { ...run, at: id, entered: run.entered + 1 }
}

/**
 * A room won: what is dead, and what the party walked out with.
 *
 * The health is stored as a fraction rather than as a number so that the next
 * room can hand it to a body of any size — a five-man and a twenty-five man
 * are the same slots at different totals, and a run that stored raw health
 * would have to know which.
 */
export function cleared(run: Run, id: string, carried: number[]): Run {
  if (isCleared(run, id)) return { ...run, carried }
  return { ...run, cleared: [...run.cleared, id], carried }
}

/**
 * A wipe: the room stays alive and the party goes back to what it walked in
 * with.
 *
 * Not to full. What a wipe costs in this game is the pull, and what it must
 * not cost is the evening — the fights already down stay down, which is the
 * rule the source keeps and the reason a raid night survives its own last
 * boss. `carried` is left exactly as it was on the way in, which is what the
 * caller took a copy of.
 */
export function wiped(run: Run, was: number[]): Run {
  return { ...run, carried: was }
}

const KEY = 'abyss.citadel'

export function save(run: Run | null): void {
  try {
    if (run === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(run))
  } catch {
    // A run that cannot be saved is still a run. Storage is refused in a
    // private window and full on a phone, and neither is a reason to stop
    // playing the one in front of you.
  }
}

/**
 * The evening, resumed.
 *
 * Every field is checked rather than trusted: this is the one save in the game
 * that names rooms, and a room that has been renamed or removed between two
 * versions must not strand the party inside it. Anything that does not read
 * back cleanly is no run at all, which puts the player at the door with
 * nothing lost but an evening they were not in the middle of.
 */
export function load(): Run | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const value = parsed as Partial<Run>
    if (typeof value.seed !== 'number' || typeof value.at !== 'string') return null
    if (!chamberAt(value.at)) return null
    const cleared = Array.isArray(value.cleared)
      ? value.cleared.filter((id): id is string => typeof id === 'string' && chamberAt(id) !== undefined)
      : []
    const carried = Array.isArray(value.carried)
      ? value.carried.filter((n): n is number => typeof n === 'number')
      : []
    const walked = Array.isArray(value.walked)
      ? value.walked.filter((id): id is string => typeof id === 'string')
      : []
    const visited = Array.isArray(value.visited)
      ? value.visited.filter((id): id is string => typeof id === 'string' && chamberAt(id) !== undefined)
      : []
    const size = value.size === 5 || value.size === 10 || value.size === 25 ? value.size : 10
    const difficulty = value.difficulty === 'heroic' ? 'heroic' : 'normal'
    const run: Run = {
      seed: value.seed,
      size,
      difficulty,
      at: value.at,
      cleared,
      carried,
      entered: typeof value.entered === 'number' ? value.entered : cleared.length,
      walked,
      visited: visited.includes(value.at) ? visited : [...visited, value.at],
    }
    // And the room the party is standing in has to be one the doors actually
    // reach. A save written before a gate changed could otherwise resume
    // inside a wing that is now shut.
    return open(run).some((c) => c.id === run.at) ? run : { ...run, at: DOOR }
  } catch {
    return null
  }
}
