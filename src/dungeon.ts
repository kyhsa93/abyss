import { ENCOUNTERS } from './sim/encounters'
import type { Corridor } from './sim/travel'
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
   * A room that is a walk rather than a fight.
   *
   * The source puts held ground between some of its rooms, and what that
   * ground is for is not difficulty: it costs time, it costs health, and it
   * asks where to take the next pack. A chamber with one of these is entered
   * like any other and is over when the party is through the far door.
   */
  corridor?: Corridor
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
    encounter: null,
    awaiting: 'the boss paid by your mistakes (#6)',
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
  // Held ground between the dragon and the lair: the citadel's first corridor.
  //
  // Three packs down a narrow hall, and the numbers are the whole design. The
  // first two notice within four hundred and forty units of each other and
  // their circles are four hundred and eighty across, so taking the first one
  // carelessly brings the second — that overlap is the only decision a
  // corridor has, and it is here on purpose. The third stands clear.
  //
  // Nothing can be walked past: the line from door to door runs inside every
  // circle, which the build checks. A corridor you can jog through is scenery.
  {
    id: 'gauntlet',
    name: 'The Frost Gauntlet',
    wing: 'frostwing',
    encounter: null,
    corridor: {
      id: 'gauntlet',
      room: { kind: 'hall', halfWidth: 360, front: 1360, back: 240 },
      entry: { x: 0, y: 1240 },
      exit: { x: 0, y: -120 },
      packs: [
        { pos: { x: 0, y: 980 }, count: 4, pulls: 230 },
        { pos: { x: -130, y: 560 }, count: 3, pulls: 250 },
        { pos: { x: 140, y: 120 }, count: 5, pulls: 240 },
      ],
    },
  },
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
export const PASSAGES: Passage[] = [
  { from: 'threshold', to: 'spire' },
  { from: 'spire', to: 'oratory', gate: killed('spire') },
  { from: 'oratory', to: 'rampart', gate: killed('oratory') },
  { from: 'rampart', to: 'rise', gate: killed('rampart') },
  { from: 'rise', to: 'crossing', gate: killed('rise') },

  { from: 'crossing', to: 'sludge' },
  { from: 'crossing', to: 'airless' },
  { from: 'sludge', to: 'laboratory', gate: killed('sludge', 'airless') },
  { from: 'airless', to: 'laboratory', gate: killed('sludge', 'airless') },

  { from: 'crossing', to: 'crimson' },
  { from: 'crimson', to: 'sanctum', gate: killed('crimson') },

  { from: 'crossing', to: 'dream' },
  { from: 'dream', to: 'gauntlet', gate: killed('dream') },
  { from: 'gauntlet', to: 'lair' },

  { from: 'crossing', to: 'throne', gate: { kind: 'wings', wings: ['plague', 'crimson', 'frostwing'] } },
]

export function chamberAt(id: string): Chamber | undefined {
  return CHAMBERS.find((c) => c.id === id)
}

/** Every room of a wing that holds a fight, which is what "the wing is done" is about. */
export function wingFights(wing: WingId): Chamber[] {
  return CHAMBERS.filter(
    (c) => c.wing === wing && (c.encounter !== null || c.awaiting !== undefined || c.corridor !== undefined),
  )
}

/** Whether a wing has nothing left alive in it. */
export function wingCleared(wing: WingId, cleared: ReadonlySet<string>): boolean {
  const fights = wingFights(wing)
  return fights.length > 0 && fights.every((c) => cleared.has(c.id))
}

export function gateOpen(gate: Gate | undefined, cleared: ReadonlySet<string>): boolean {
  if (!gate || gate.kind === 'always') return true
  if (gate.kind === 'killed') return gate.chambers.every((id) => cleared.has(id))
  return gate.wings.every((wing) => wingCleared(wing, cleared))
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
      if (!gateOpen(passage.gate, cleared)) continue
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
