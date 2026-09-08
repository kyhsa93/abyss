import { ENCOUNTERS } from './sim/encounters'
import type { Corridor } from './sim/travel'
import type { Vec2 } from './sim/types'
import { RUNGS_PER_BOSS } from './progress'

/**
 * The citadel as a graph: rooms, what joins them, and what opens.
 *
 * Every fight in this game is reached by pressing its name on a menu, which
 * makes the roster a list rather than a place. The source this raid comes from
 * sells something else entirely — an order and a route. There is one way up
 * for the first four fights, the way then splits three ways and the three may
 * be taken in any order, and the top does not open until all three are done.
 * Which of those you did on a given evening is the evening's story, and a list
 * cannot tell it.
 *
 * This file is the map and nothing else. Walking it is #24 and making it a
 * thing the player picks is #25; what is here is data plus the few questions
 * anyone would ask of it, so that both of those are written against something
 * that can be checked rather than against a diagram in an issue.
 *
 * Rooms without a fight are rooms: the way in, the crossing where the three
 * wings meet, the gauntlet before the last of them. Rooms whose fight has not
 * been built yet are on the map with `encounter: null` and the issue that will
 * fill them — the map knows all twelve and only some of them are open, which
 * is exactly the state the citadel is in.
 */

export type WingId = 'lower' | 'plague' | 'crimson' | 'frostwing' | 'throne'

/**
 * What opens a door, and there are only three kinds.
 *
 * More kinds is a worse map. Every gate in the source is one of these three,
 * and a fourth would be a rule the player has to be told rather than one they
 * can see: a door that is shut because something in that room is alive, or
 * because a whole wing is.
 */
export type Gate =
  | { kind: 'always' }
  | { kind: 'killed'; chambers: string[] }
  | { kind: 'wings'; wings: WingId[] }

export interface Chamber {
  id: string
  name: string
  wing: WingId
  /** The fight that lives here, or null for a room that is only a room. */
  encounter: number | null
  /** For a room whose fight is not built yet: what it is waiting for. */
  awaiting?: string

  /**
   * The pad in this room, and what lights it.
   *
   * The source's transporters, which are the reason a citadel this size is
   * playable twice: once a wing is done, the walk to it stops being part of
   * it. In this game the lit pads are also the boss list — see `padsLit` —
   * which is what keeps "learn one fight by repeating it" and "walk in from
   * the door" the same game rather than two.
   */
  pad?: Gate
}

export interface Passage {
  from: string
  to: string
  /** Omitted is `always`. */
  gate?: Gate
  /**
   * The ground between the two, held by somebody.
   *
   * On the passage rather than on a room, which is where it belongs and is not
   * where it started: a corridor is not a place you go, it is the price of
   * going somewhere. Modelled as a room, the walk between the dragon and the
   * lair was a third thing on the map beside them; modelled here it is what
   * the door costs.
   *
   * Walked once and then done for the evening. What it costs is time and
   * health, and paying it twice for the same door would be a toll rather than
   * a corridor — which is also what makes the pads worth lighting.
   */
  corridor?: Corridor
}

/** What a passage is called where a run has to remember it. */
export function passageKey(from: string, to: string): string {
  return from < to ? `${from}:${to}` : `${to}:${from}`
}

/** The passage joining two rooms, in whichever direction it was written. */
export function passageBetween(a: string, b: string): Passage | undefined {
  return PASSAGES.find((p) => (p.from === a && p.to === b) || (p.from === b && p.to === a))
}

const killed = (...chambers: string[]): Gate => ({ kind: 'killed', chambers })

/**
 * The rooms, in the order they are met.
 *
 * Names are this game's own. The rule from the round that took this raid's
 * fights — the shape comes across and the name does not — holds for its rooms
 * too, so nothing here is called what the source calls it.
 */
export const CHAMBERS: Chamber[] = [
  // --- the lower spire: one way up, no choices ------------------------------
  {
    id: 'threshold',
    name: 'The Threshold',
    wing: 'lower',
    encounter: null,
    pad: { kind: 'always' },
  },
  { id: 'spire', name: 'The Spire', wing: 'lower', encounter: 0 },
  {
    id: 'oratory',
    name: 'The Oratory',
    wing: 'lower',
    encounter: 1,
    pad: killed('spire'),
  },
  {
    id: 'rampart',
    name: 'The Rampart',
    wing: 'lower',
    encounter: null,
    awaiting: 'the boss out of reach (#14)',
    pad: killed('oratory'),
  },
  {
    id: 'rise',
    name: 'The Rise',
    wing: 'lower',
    encounter: 3,
    pad: killed('rampart'),
  },
  // The room where the citadel stops being a corridor. No fight in it, and
  // that is the point: it is the only place in the building where the player
  // is asked which way to go.
  {
    id: 'crossing',
    name: 'The Upper Crossing',
    wing: 'lower',
    encounter: null,
    pad: killed('rise'),
  },

  // --- the plagueworks: two rooms side by side, then the one they open ------
  {
    id: 'sludge',
    name: 'The Sludgeworks',
    wing: 'plague',
    encounter: null,
    awaiting: 'the adds that merge (#7)',
  },
  { id: 'airless', name: 'The Airless Room', wing: 'plague', encounter: 2 },
  {
    id: 'laboratory',
    name: 'The Laboratory',
    wing: 'plague',
    encounter: null,
    awaiting: 'the two answers at once (#8)',
  },

  // --- the crimson hall -----------------------------------------------------
  {
    id: 'crimson',
    name: 'The Crimson Hall',
    wing: 'crimson',
    encounter: null,
    awaiting: 'the three bodies, one of them real (#9)',
  },
  {
    id: 'sanctum',
    name: 'The Sanctum',
    wing: 'crimson',
    encounter: null,
    awaiting: 'the gift that has to be passed (#10)',
  },

  // --- the frostwing halls --------------------------------------------------
  {
    id: 'dream',
    name: 'The Dreaming Hall',
    wing: 'frostwing',
    encounter: null,
    awaiting: 'the boss that is healed (#11)',
  },
  // A landing between the dragon's hall and the lair above it. What is on it
  // is a fact about the door rather than about the room — see the passage.
  { id: 'gauntlet', name: 'The Frost Gauntlet', wing: 'frostwing', encounter: null },
  {
    id: 'lair',
    name: 'The Rimeward Lair',
    wing: 'frostwing',
    encounter: null,
    awaiting: 'the stacking that is answered by leaving (#12)',
    pad: killed('dream'),
  },

  // --- the top --------------------------------------------------------------
  {
    id: 'throne',
    name: 'The Frozen Throne',
    wing: 'throne',
    encounter: null,
    awaiting: 'the floor that does not come back (#13)',
  },
]

/**
 * What joins them, and what has to be dead first.
 *
 * Five rules, all of them the source's:
 *
 *   1. The lower spire is a single file. No branches for the first four.
 *   2. The crossing opens three wings and they may be taken in any order.
 *   3. Inside the plagueworks the two side rooms are parallel, and the
 *      laboratory wants both of them dead. Which one goes first is a choice.
 *   4. The gauntlet, and the lair beyond it, open when the dragon is saved.
 *   5. The throne opens when all three wings are finished.
 */
/**
 * A stretch of held ground, written once and hung on the door it guards.
 *
 * The shape is always the same because the question always is: a hall long
 * enough that nothing can be walked past, packs standing where somebody put
 * them, and one pair of circles close enough that taking the first carelessly
 * brings the second. That overlap is the only decision a corridor has.
 *
 * They differ in how much of it there is. The approach to a wing is one pack
 * and a warning; the ground before a lair is three and a lesson.
 */
function corridor(id: string, packs: Array<{ pos: Vec2; count: number; pulls: number }>): Corridor {
  // The hall is as long as what is standing in it, plus room to arrive.
  //
  // Written the other way round first — a length, and packs placed inside it —
  // and the build caught what that produces: a party that walks in already
  // inside the first pack's circle, which is a corridor that pulls itself.
  // The way in has to be outside everything, so it is derived rather than
  // chosen.
  const top = Math.max(...packs.map((p) => p.pos.y + p.pulls))
  const front = top + 200
  return {
    id,
    room: { kind: 'hall', halfWidth: 360, front, back: 240 },
    entry: { x: 0, y: front - 60 },
    exit: { x: 0, y: -120 },
    packs,
  }
}

export const PASSAGES: Passage[] = [
  { from: 'threshold', to: 'spire' },
  { from: 'spire', to: 'oratory', gate: killed('spire') },
  {
    from: 'oratory',
    to: 'rampart',
    gate: killed('oratory'),
    corridor: corridor('rampartway', [
      { pos: { x: 0, y: 560 }, count: 3, pulls: 250 },
      { pos: { x: -100, y: 200 }, count: 3, pulls: 230 },
    ]),
  },
  {
    from: 'rampart',
    to: 'rise',
    gate: killed('rampart'),
    corridor: corridor('riseway', [
      { pos: { x: 0, y: 700 }, count: 4, pulls: 250 },
      { pos: { x: 120, y: 320 }, count: 3, pulls: 240 },
    ]),
  },
  { from: 'rise', to: 'crossing', gate: killed('rise') },

  // The way into the plagueworks: one pack on the stair, and a second standing
  // close enough behind it that a careless pull brings both.
  {
    from: 'crossing',
    to: 'sludge',
    corridor: corridor('sludgeway', [
      { pos: { x: 0, y: 780 }, count: 3, pulls: 240 },
      { pos: { x: -120, y: 380 }, count: 3, pulls: 250 },
    ]),
  },
  {
    from: 'crossing',
    to: 'airless',
    corridor: corridor('airway', [
      { pos: { x: 0, y: 620 }, count: 4, pulls: 260 },
      { pos: { x: 110, y: 240 }, count: 3, pulls: 230 },
    ]),
  },
  { from: 'sludge', to: 'laboratory', gate: killed('sludge', 'airless') },
  { from: 'airless', to: 'laboratory', gate: killed('sludge', 'airless') },

  // The crimson hall's stair, which is long and has three landings on it.
  {
    from: 'crossing',
    to: 'crimson',
    corridor: corridor('crimsonway', [
      { pos: { x: 0, y: 940 }, count: 3, pulls: 230 },
      { pos: { x: 140, y: 540 }, count: 4, pulls: 250 },
      { pos: { x: -110, y: 160 }, count: 3, pulls: 230 },
    ]),
  },
  { from: 'crimson', to: 'sanctum', gate: killed('crimson') },

  {
    from: 'crossing',
    to: 'dream',
    corridor: corridor('dreamway', [
      { pos: { x: 0, y: 700 }, count: 4, pulls: 250 },
      { pos: { x: -130, y: 300 }, count: 3, pulls: 260 },
    ]),
  },
  { from: 'dream', to: 'gauntlet', gate: killed('dream') },
  // The citadel's longest walk, and the one it is named for: three packs, and
  // the first two notice within four hundred and forty units of each other
  // against circles four hundred and eighty across.
  {
    from: 'gauntlet',
    to: 'lair',
    corridor: corridor('gauntlet', [
      { pos: { x: 0, y: 980 }, count: 4, pulls: 230 },
      { pos: { x: -130, y: 560 }, count: 3, pulls: 250 },
      { pos: { x: 140, y: 120 }, count: 5, pulls: 240 },
    ]),
  },

  { from: 'crossing', to: 'throne', gate: { kind: 'wings', wings: ['plague', 'crimson', 'frostwing'] } },
]

export function chamberAt(id: string): Chamber | undefined {
  return CHAMBERS.find((c) => c.id === id)
}

/**
 * Whether there is anything in a room to be stopped by.
 *
 * A room whose fight is not built yet has nothing alive in it, so a door that
 * waited on it would be a door that never opens — and with the map now the
 * only way into a raid, that is not a gap in the citadel but a fight the game
 * has and cannot reach. The way up runs through two unbuilt rooms before the
 * crossing, which is to say every wing above them was sealed off by rooms
 * containing nothing.
 *
 * So an unbuilt room is a room, the same as the threshold and the crossing
 * are: you walk through it. It starts holding its door the day its fight is
 * written, and nothing else has to change for that to happen.
 */
export function standing(id: string): boolean {
  const chamber = chamberAt(id)
  if (!chamber) return false
  return chamber.encounter !== null && chamber.encounter < ENCOUNTERS.length
}

/** Every room of a wing that holds a fight, which is what "the wing is done" is about. */
export function wingFights(wing: WingId): Chamber[] {
  return CHAMBERS.filter((c) => c.wing === wing && standing(c.id))
}

/**
 * Whether a wing has nothing left alive in it.
 *
 * A wing whose fights are all still to be written has nothing alive in it and
 * is therefore done, by the same rule as `standing`: the top of the building
 * must not be sealed off by rooms that are empty because nobody has filled
 * them yet. It stops being done the day one of them is written.
 */
export function wingCleared(wing: WingId, cleared: ReadonlySet<string>): boolean {
  return wingFights(wing).every((c) => cleared.has(c.id))
}

/**
 * Whether a gate is open, asked strictly: every room it names has to be down.
 *
 * This is the question a *pad* asks, and a pad is earned rather than needed —
 * it is a walk you no longer have to make, so a pad lit by an empty room would
 * be a shortcut handed over for nothing. A door asks the looser question in
 * `passageOpen`, because a door that never opens is content nobody can reach.
 */
export function gateOpen(gate: Gate | undefined, cleared: ReadonlySet<string>): boolean {
  if (!gate || gate.kind === 'always') return true
  if (gate.kind === 'killed') return gate.chambers.every((id) => cleared.has(id))
  return gate.wings.every((wing) => wingCleared(wing, cleared))
}

/** The same question a door asks: a room with nothing in it cannot hold one shut. */
export function passageOpen(gate: Gate | undefined, cleared: ReadonlySet<string>): boolean {
  if (gate?.kind !== 'killed') return gateOpen(gate, cleared)
  return gate.chambers.every((id) => !standing(id) || cleared.has(id))
}

/**
 * Everywhere you can walk to, given what is dead.
 *
 * From the threshold outward rather than by asking each room whether its own
 * door is open: a room whose door is open behind a room whose door is not is
 * not reachable, and a map that answered otherwise would be a map with a hole
 * in it. That is the property the build checks.
 */
export function reachable(cleared: ReadonlySet<string>): Set<string> {
  const seen = new Set<string>(['threshold'])
  const queue = ['threshold']
  while (queue.length > 0) {
    const here = queue.shift()!
    for (const passage of PASSAGES) {
      // Passages run both ways. Nothing in this citadel is a one-way drop, and
      // a player who wants to walk back down to a room they have cleared is
      // allowed to — there is simply nothing there for them, which is a
      // different thing from a locked door behind you.
      const next = passage.from === here ? passage.to : passage.to === here ? passage.from : null
      if (next === null || seen.has(next)) continue
      if (!passageOpen(passage.gate, cleared)) continue
      seen.add(next)
      queue.push(next)
    }
  }
  return seen
}

/**
 * Which pads are lit, read off the progression rather than saved again.
 *
 * `progress.ts` already holds one number for everything the player has opened,
 * and a second record of which rooms are unlocked would be a second truth to
 * keep in step. A boss counts as killed the moment the chain has moved past
 * its first rung, which is exactly what clearing it once does.
 */
export function killedOnce(unlocked: number, encounter: number): boolean {
  return unlocked > encounter * RUNGS_PER_BOSS
}

/** The rooms whose fights the chain says are done. */
export function clearedFrom(unlocked: number): Set<string> {
  return new Set(
    CHAMBERS.filter((c) => c.encounter !== null && killedOnce(unlocked, c.encounter)).map((c) => c.id),
  )
}

/** The pads a player may travel to, which is the boss list read as places. */
export function padsLit(cleared: ReadonlySet<string>): Chamber[] {
  return CHAMBERS.filter((c) => c.pad !== undefined && gateOpen(c.pad, cleared))
}

/** Whether every fight named on the map is one the game actually has. */
export function builtFights(): Chamber[] {
  return CHAMBERS.filter((c) => c.encounter !== null && c.encounter < ENCOUNTERS.length)
}
