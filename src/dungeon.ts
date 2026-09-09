import { ENCOUNTERS } from './sim/encounters'
import type { Corridor, Pack, Spring } from './sim/travel'
import { ROUND_ARENA, fromRoom, pushInside, roomAt, type RoomShape } from './sim/room'
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
   * The shape of the room, for a room with no fight to take its shape from.
   *
   * A room that holds a fight is the room that fight is fought in — see
   * `roomOf` — because walking into a place and fighting in it had better be
   * the same place. This is for the ones that hold nothing: the way in, the
   * hub, the bridge, and the ones still waiting on an issue.
   */
  room?: RoomShape

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
    // A long way in with one door at the far end, which is what the bottom of
    // a spire is: you are a long way from the first thing in it.
    room: { kind: 'hall', halfWidth: 340, front: 760, back: 300 },
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
    id: 'mooring',
    name: 'The Mooring',
    wing: 'lower',
    encounter: null,
    awaiting: 'the boss out of reach (#14)',
    // Open air with an edge, which is the one room in the building that is
    // not indoors.
    room: { kind: 'platform', radius: 420 },
    pad: killed('oratory'),
  },
  {
    id: 'rise',
    name: 'The Rise',
    wing: 'lower',
    encounter: 3,
    pad: killed('mooring'),
  },
  // The room where the citadel stops being a corridor. No fight in it, and
  // that is the point: it is the only place in the building where the player
  // is asked which way to go.
  {
    id: 'crossing',
    name: 'The Upper Crossing',
    wing: 'lower',
    encounter: null,
    // Round and no bigger than it has to be. Six doors lead out of here and
    // the whole point of the room is choosing between them, so all six have to
    // be on the screen at once — a hub you turn around in has hidden its own
    // question.
    room: { kind: 'round', radius: 430 },
    pad: killed('rise'),
  },

  // --- the plagueworks: two rooms side by side, then the one they open ------
  // The wing is entered once and branches inside it, which is the shape the
  // source has and this map did not: the two rooms hung straight off the hub,
  // so the plagueworks was two doors on the crossing rather than a place you
  // go into. It is a hall with a room off either side and the laboratory at
  // the end of it.
  {
    id: 'vats',
    name: 'The Vats',
    wing: 'plague',
    encounter: null,
    // Wide and shallow rather than long: the two rooms are off either side of
    // it, and the one thing this chamber is for is seeing both at once. A
    // deep hall put one of them behind the camera, which is the same mistake
    // the crossing made.
    room: { kind: 'hall', halfWidth: 430, front: 370, back: 330 },
  },
  {
    id: 'sludge',
    name: 'The Sludgeworks',
    wing: 'plague',
    encounter: 4,
  },
  { id: 'airless', name: 'The Airless Room', wing: 'plague', encounter: 2 },
  {
    id: 'laboratory',
    name: 'The Laboratory',
    wing: 'plague',
    encounter: 5,
  },

  // --- the crimson hall -----------------------------------------------------
  {
    id: 'crimson',
    name: 'The Crimson Hall',
    wing: 'crimson',
    encounter: 6,
  },
  {
    id: 'sanctum',
    name: 'The Sanctum',
    wing: 'crimson',
    encounter: 7,
    room: { kind: 'round', radius: 460 },
  },

  // --- the frostwing halls --------------------------------------------------
  {
    id: 'dream',
    name: 'The Dreaming Hall',
    wing: 'frostwing',
    encounter: null,
    awaiting: 'the boss that is healed (#11)',
    // Long, with the thing that has to be kept alive lying down the middle.
    room: { kind: 'hall', halfWidth: 420, front: 700, back: 420 },
  },
  // A landing between the dragon's hall and the lair above it. What is on it
  // is a fact about the door rather than about the room — see the passage.
  {
    id: 'gauntlet',
    name: 'The Frost Gauntlet',
    wing: 'frostwing',
    encounter: null,
    // A bridge: narrow, and long enough that the way on is somewhere you can
    // see and not somewhere you are.
    room: { kind: 'hall', halfWidth: 240, front: 900, back: 420 },
  },
  {
    id: 'lair',
    name: 'The Rimeward Lair',
    wing: 'frostwing',
    encounter: null,
    awaiting: 'the stacking that is answered by leaving (#12)',
    room: { kind: 'platform', radius: 520 },
    pad: killed('dream'),
  },

  // --- the top --------------------------------------------------------------
  {
    id: 'throne',
    name: 'The Frozen Throne',
    wing: 'throne',
    encounter: null,
    awaiting: 'the floor that does not come back (#13)',
    // The top of the spire, and the only way off it is back down the way you
    // came.
    room: { kind: 'platform', radius: 560 },
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
function corridor(
  id: string,
  /** The room through the far door, which is the only way out of a passage. */
  to: string,
  packs: Array<{ pos: Vec2; count: number; pulls: number }>,
  /**
   * And what is still arriving in it, for the one passage where anything is.
   *
   * Written without saying where its bodies walk to, the same way the entry is
   * written without saying where the party comes in: both are the near end of
   * the passage, and a corridor does not know where its near end is until it
   * has been laid between two rooms. `groundFor` fills both in.
   */
  springs?: Array<Omit<Spring, 'toward'>>,
): Corridor {
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
    // Narrow, because a corridor is narrow. At three hundred and sixty either
    // side it was a long room, and a long room is somewhere a raid spreads out
    // and walks round what is standing in it — which is the one thing held
    // ground is not for. The build walks every one of these and says whether a
    // party still fits: nobody in a wall, nobody out of the room, and it still
    // costs something to cross.
    room: { kind: 'hall', halfWidth: 250, front, back: 240 },
    entry: { x: 0, y: front - 60 },
    ways: [{ to, at: { x: 0, y: -120 } }],
    packs,
    ...(springs ? { springs: springs.map((spring) => ({ ...spring, toward: mouth(front) })) } : {}),
  }
}

/**
 * How far past the mouth of a passage the bodies coming out of it walk.
 *
 * Out of it and into the room behind, so the party is met in the room rather
 * than in the doorway — a fight in a doorway is a fight nobody can see the
 * shape of, and the shape is the only thing this game asks anybody to read.
 */
const SPILL = 260

/** Where a passage's stream is walking, given how long the passage came out. */
function mouth(front: number): Vec2 {
  return { x: 0, y: front - 60 + SPILL }
}

export const PASSAGES: Passage[] = [
  // The way in, which is the only passage in the building that is held by
  // somebody still arriving.
  //
  // Everywhere else the citadel is a place you find things standing in. Here
  // it is a place that has noticed you: two packs down the passage the way
  // every other one has them, and behind them a doorway that keeps sending
  // watchmen back down it toward the door you came in by. The first thing the
  // building does is push, and the answer is to push back up the passage —
  // walk into it and it stops, stand at the entrance and it does not.
  //
  // `stops` is most of the passage's length, so turning it off is a commitment
  // rather than a step; `pulls` covers the whole entrance hall, so it is
  // running before the party is anywhere near it and they walk in on something
  // already happening.
  {
    from: 'threshold',
    to: 'spire',
    corridor: corridor(
      'spireway',
      'spire',
      [
        { pos: { x: 0, y: 520 }, count: 3, pulls: 240 },
        { pos: { x: -120, y: 180 }, count: 3, pulls: 230 },
      ],
      [
        {
          at: { x: 0, y: 40 },
          every: 4,
          most: 6,
          pulls: 2400,
          stops: 900,
        },
      ],
    ),
  },
  { from: 'spire', to: 'oratory', gate: killed('spire') },
  {
    from: 'oratory',
    to: 'mooring',
    gate: killed('oratory'),
    corridor: corridor('rampartway', 'mooring', [
      { pos: { x: 0, y: 560 }, count: 3, pulls: 250 },
      { pos: { x: -100, y: 200 }, count: 3, pulls: 230 },
    ]),
  },
  {
    from: 'mooring',
    to: 'rise',
    gate: killed('mooring'),
    corridor: corridor('riseway', 'rise', [
      { pos: { x: 0, y: 700 }, count: 4, pulls: 250 },
      { pos: { x: 120, y: 320 }, count: 3, pulls: 240 },
    ]),
  },
  { from: 'rise', to: 'crossing', gate: killed('rise') },

  // The way into the plagueworks: one pack on the stair, and a second standing
  // close enough behind it that a careless pull brings both.
  // One way into the wing, and the trapped hall is what it costs.
  {
    from: 'crossing',
    to: 'vats',
    corridor: corridor('plagueway', 'vats', [
      { pos: { x: 0, y: 780 }, count: 3, pulls: 240 },
      { pos: { x: -120, y: 380 }, count: 3, pulls: 250 },
      { pos: { x: 110, y: 60 }, count: 4, pulls: 260 },
    ]),
  },
  // And inside it the two rooms are a step to either side. No ground between:
  // the wing was paid for on the way in, and charging again for each door
  // would make the choice of which to take first cost something, which it does
  // not — that choice is free in the source and is the wing's one decision.
  { from: 'vats', to: 'sludge' },
  { from: 'vats', to: 'airless' },
  { from: 'sludge', to: 'laboratory', gate: killed('sludge', 'airless') },
  { from: 'airless', to: 'laboratory', gate: killed('sludge', 'airless') },

  // The crimson hall's stair, which is long and has three landings on it.
  {
    from: 'crossing',
    to: 'crimson',
    corridor: corridor('crimsonway', 'crimson', [
      { pos: { x: 0, y: 940 }, count: 3, pulls: 230 },
      { pos: { x: 140, y: 540 }, count: 4, pulls: 250 },
      { pos: { x: -110, y: 160 }, count: 3, pulls: 230 },
    ]),
  },
  { from: 'crimson', to: 'sanctum', gate: killed('crimson') },

  {
    from: 'crossing',
    to: 'dream',
    corridor: corridor('dreamway', 'dream', [
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
    corridor: corridor('gauntlet', 'lair', [
      { pos: { x: 0, y: 980 }, count: 4, pulls: 230 },
      { pos: { x: -130, y: 560 }, count: 3, pulls: 250 },
      { pos: { x: 140, y: 120 }, count: 5, pulls: 240 },
    ]),
  },

  { from: 'crossing', to: 'throne', gate: { kind: 'wings', wings: ['plague', 'crimson', 'frostwing'] } },
]

/**
 * Where each room sits on the plan, nought to one in both directions.
 *
 * A drawing rather than a list, and the reason is the shape of the building:
 * one way up, a split into three, and a top that waits for all of them. A
 * column of rows can say which rooms exist and cannot say *that* — and which
 * of the three to do next is the only choice an evening offers.
 *
 * Hand-placed. A building laid out by an algorithm is a building in the wrong
 * places.
 *
 * The middle column is the spire and the throne on top of it, and nothing
 * else: the crimson wing sits off it rather than on it because the door from
 * the crossing to the throne is drawn as a line, and a line down the middle
 * through two rooms of a wing reads as going by way of them. It does not —
 * the throne waits for all three wings and is reached from the crossing.
 *
 * It lives here rather than with the drawing because it is not only a
 * drawing: the doors on the floor of a room are placed by it too, so which
 * way you walk out of the crossing to reach the plagueworks is the way the
 * map says it is. One table, or the picture and the building disagree.
 */
export const CITADEL_PLAN: Array<{ id: string; x: number; y: number }> = [
  // Traced off the raid's own map rather than arranged by hand, which is what
  // this was before and why it was wrong: a tidy column with the wings hung
  // under it is a diagram of the boss order, not a drawing of a building. The
  // real one is a U. You come in halfway up the left side, go *down* past the
  // first two, along the bottom to the ships, and then climb the middle.
  { id: 'threshold', x: 0.1, y: 0.62 },
  { id: 'spire', x: 0.1, y: 0.79 },
  { id: 'oratory', x: 0.1, y: 0.94 },
  { id: 'mooring', x: 0.44, y: 0.94 },
  { id: 'rise', x: 0.44, y: 0.72 },
  { id: 'crossing', x: 0.44, y: 0.46 },

  // The plagueworks goes off to the left and above the way in: a short hall,
  // a room above and a room below it, and the laboratory behind both.
  { id: 'vats', x: 0.3, y: 0.34 },
  { id: 'sludge', x: 0.18, y: 0.2 },
  { id: 'airless', x: 0.18, y: 0.46 },
  { id: 'laboratory', x: 0.05, y: 0.33 },

  // The crimson wing is straight up from the middle, and the throne is up and
  // to the right of it — not above it. Drawn on the middle line, the way to
  // the top ran through two rooms it does not go through.
  { id: 'crimson', x: 0.44, y: 0.22 },
  { id: 'sanctum', x: 0.44, y: 0.05 },

  // The frostwing halls run away to the right, and the lair is reached the
  // long way round from the dragon rather than straight on.
  { id: 'dream', x: 0.68, y: 0.56 },
  { id: 'gauntlet', x: 0.87, y: 0.64 },
  { id: 'lair', x: 0.95, y: 0.42 },

  { id: 'throne', x: 0.73, y: 0.24 },
]

/**
 * The shape of a room, walked into.
 *
 * A room that holds a fight is the room that fight is fought in. That is not a
 * shortcut — walking into a place and then fighting in a different-shaped one
 * would be two rooms wearing one name, and it is also where the variety comes
 * from for free: the fights already carry a long hall, a wide disc and a small
 * one. A room with nothing in it says its own shape, and a room waiting on an
 * issue says the shape it is being built to be.
 */
export function roomOf(id: string): RoomShape {
  const chamber = chamberAt(id)
  if (!chamber) return DEFAULT_ROOM
  if (chamber.encounter !== null && chamber.encounter < ENCOUNTERS.length) {
    return ENCOUNTERS[chamber.encounter]!.room ?? ROUND_ARENA
  }
  return chamber.room ?? DEFAULT_ROOM
}

/** For a room that has said nothing about its own shape. */
const DEFAULT_ROOM: RoomShape = { kind: 'round', radius: 430 }

/**
 * How far in from the wall a doorway sits.
 *
 * In from the wall rather than out from the middle, which is the difference
 * between a door and a marker: the rooms are all different sizes now, and a
 * fixed radius put the crossing's doors halfway across it and the long hall's
 * two hundred units short of either end.
 */
const DOOR_INSET = 90

/**
 * How far in from its door the party arrives.
 *
 * Comfortably more than `EXIT_REACH`, or a party would arrive already through
 * the door it came in by and walk straight back out of the room it just
 * entered.
 */
const ARRIVE_IN = 190

/** The least two doors of one room may be apart, so a thumb can tell them apart. */
const DOOR_GAP = 0.62

function planOf(id: string): { x: number; y: number } {
  return CITADEL_PLAN.find((entry) => entry.id === id) ?? { x: 0.5, y: 0.5 }
}

/** Where the wall is on this bearing, a doorway's width in from it. */
function onWall(room: RoomShape, angle: number, inset = DOOR_INSET): Vec2 {
  // Far out *from the room* and then clamped, so one line answers for every
  // shape there is and a fourth shape answers without being asked. In a hall
  // this lands a diagonal in the corner, which is still the wall; two bearings
  // that land in the same corner are two doors in one place, and the build
  // measures that rather than trusting the angle.
  //
  // From the room and not from the origin: once the rooms are placed in a
  // building, a bearing taken from the middle of the world points somewhere
  // else entirely, and the build caught it the moment they were — two of the
  // oratory's doors came out on top of each other.
  const c = roomAt(room)
  const at = { x: c.x + Math.cos(angle) * 100000, y: c.y + Math.sin(angle) * 100000 }
  pushInside(room, at, inset)
  return at
}

/**
 * Every room this one has a door to, in the order they sit around the wall.
 *
 * The bearing comes off the plan — the map says the plagueworks is away to the
 * left of the crossing, so the door to it is away to the left. Two rooms that
 * sit in the same direction on the plan would otherwise share a door, so they
 * are pushed apart afterwards; the build checks that they came out apart.
 *
 * Which rooms get one is `canGo`'s to answer, and the caller has to answer it
 * with the same thing that will be asked when the party arrives at the door.
 * A door drawn on the floor that then refuses to open is worse than no door:
 * the party walks to it, the step comes back shut, and the room hands them
 * straight back to themselves.
 */
function doorsOf(id: string, canGo: (to: string) => boolean): Array<{ to: string; angle: number }> {
  const here = placeOf(id)
  const found = PASSAGES.flatMap((passage) => {
    const to = passage.from === id ? passage.to : passage.to === id ? passage.from : null
    if (to === null || !canGo(to)) return []
    // Off where the rooms actually stand rather than off the plan they were
    // read from. The two differ by a flip, and a door placed from the plan
    // while the room it opens onto was placed from the world is a door on the
    // wrong wall — every one of them, pointing back the way the party came.
    const there = placeOf(to)
    return [{ to, angle: Math.atan2(there.y - here.y, there.x - here.x) }]
  })
  found.sort((a, b) => a.angle - b.angle)
  // Pushed apart in order, and then evenly if that ran the last one into the
  // first: a room whose doors all point the same way is a room where the plan
  // has nothing to say about which is which, so an even fan is as honest as
  // anything and at least they can be told apart.
  for (let i = 1; i < found.length; i++) {
    found[i]!.angle = Math.max(found[i]!.angle, found[i - 1]!.angle + DOOR_GAP)
  }
  const last = found[found.length - 1]
  const first = found[0]
  if (first && last && last.angle + DOOR_GAP > first.angle + Math.PI * 2) {
    const step = (Math.PI * 2) / found.length
    found.forEach((door, i) => {
      door.angle = first.angle + step * i
    })
  }
  return found
}

/**
 * The room, as ground to be walked across.
 *
 * `from` is the room the party came out of, and it decides where they are
 * standing: at that door, facing in. Null at the start of an evening, which is
 * the one time nobody came from anywhere.
 */
export function hallFor(
  id: string,
  from: string | null,
  canGo: (to: string) => boolean,
): Corridor {
  // The room where it stands, so the door the party walks to is the same point
  // in the same coordinates as the door it walks out of. That is the whole of
  // what stops a doorway being a teleporter: nothing about the party moves
  // when it goes through one, because there is only one set of coordinates.
  const room: RoomShape = { ...roomOf(id), at: placeOf(id) }
  const doors = doorsOf(id, canGo)
  const back = doors.find((door) => door.to === from)
  // A step in from the door they came by, along the same bearing, so the party
  // is standing in the room rather than in its doorway.
  //
  // Nobody came from anywhere on the first night, and the door they came in by
  // is the one door the map does not draw — the street. A room with one way on
  // is that street's hallway, so they start at the other end of it and walk its
  // length; a room with several is a room, and the middle of it is as good an
  // answer as any. It used to be the world's origin, which in a building whose
  // rooms are all somewhere else is a point in none of them: the party was
  // clamped into whichever corner of the entrance hall was nearest the middle
  // of the map, all twenty-five of them onto the same one.
  const arrival = back
    ? onWall(room, back.angle, DOOR_INSET + ARRIVE_IN)
    : doors.length === 1
      ? onWall(room, doors[0]!.angle + Math.PI, DOOR_INSET + ARRIVE_IN)
      : roomAt(room)
  return {
    id: `hall:${id}`,
    room,
    entry: arrival,
    ways: doors.map((door) => ({ to: door.to, at: onWall(room, door.angle) })),
    packs: [],
  }
}

/**
 * The whole citadel, in one set of coordinates.
 *
 * The rooms used to be separate places: each one its own scene with its own
 * origin, and walking out of a door threw the scene away and built the next
 * one with the party stood at its far side. That is a teleporter with a door
 * drawn on it, and it read as one however the door was drawn.
 *
 * So the building is assembled instead. Every room is put where the plan says,
 * at one scale, and every passage between two of them is a cell of its own
 * laid along the line and overlapping both ends — the overlap is the point,
 * because it is what makes the floor continuous. Walking from the threshold to
 * the throne never leaves the union, which is a thing the build proves rather
 * than a thing this comment asserts.
 */
export interface Cell {
  /** A chamber's id, or `from>to` for the ground between two of them. */
  id: string
  room: RoomShape
}

/**
 * How big the building is.
 *
 * Not chosen: it is the smallest scale at which no two joined rooms overlap
 * and every stretch of held ground still fits between the two it joins. The
 * plan is in fractions, the rooms are in units, and this is the number that
 * reconciles them — the build recomputes it and says so if a room grows past
 * what the plan leaves it.
 */
export const CITADEL_SCALE = 16700

/**
 * How far a passage runs inside the rooms at either end of it.
 *
 * The overlap is what makes the floor continuous, and how much of it there has
 * to be is set by the worst junction rather than by taste: a passage meeting a
 * narrow hall on the diagonal leaves the room through a side wall, and the
 * last stretch before it does is a wedge too thin to stand a body in. Knitting
 * further back puts the passage's own width under that wedge. The build walks
 * every centre line with a body's width and says where it runs out.
 */
const KNIT = 220

/**
 * Where a room stands in the citadel.
 *
 * The plan is written the way the raid's own map is printed — the way in
 * halfway down the left edge, the lower spire *below* it — and the building is
 * stood up with that flipped, so the walk from the door to the first fight
 * goes up the screen. Which way up a poster was drawn is a fact about the
 * poster. Which way you walk when you come in is a fact about the building,
 * and the one a player is holding: they press up, and up has to be onward.
 *
 * A flip and not a turn, so left stays left: the plagueworks is away to one
 * side of the crossing on the map and is away to the same side here.
 */
export function placeOf(id: string): Vec2 {
  const entry = planOf(id)
  return { x: (entry.x - 0.5) * CITADEL_SCALE, y: (0.5 - entry.y) * CITADEL_SCALE }
}

/**
 * How far a room reaches in one direction.
 *
 * Less than it reaches to a corner, which is what `roomReach` answers and is
 * the wrong question here: two rooms joined along the y do not have to clear
 * each other's corners, and asking for that made the building half as big
 * again as it needs to be.
 */
export function support(room: RoomShape, ux: number, uy: number): number {
  if (room.kind !== 'hall') return room.radius
  return Math.abs(ux) * room.halfWidth + (uy > 0 ? uy * room.front : -uy * room.back)
}

/**
 * How far along this bearing the floor lasts, which is a different question.
 *
 * `support` answers "what is the furthest this room reaches that way", and for
 * a rectangle that is a corner. Where a passage has to start is where the
 * *ray* leaves the room, which is nearer — and using the corner instead put
 * the near end of two of the passages outside the room they were supposed to
 * be knitted into, so the floor had a hole in it exactly where the build now
 * looks for one.
 */
export function exitAlong(room: RoomShape, ux: number, uy: number): number {
  if (room.kind !== 'hall') return room.radius
  const t = room.turn ?? 0
  const cos = Math.cos(-t)
  const sin = Math.sin(-t)
  const vx = ux * cos - uy * sin
  const vy = ux * sin + uy * cos
  const acrossWall = vx === 0 ? Infinity : room.halfWidth / Math.abs(vx)
  const alongWall = vy === 0 ? Infinity : vy > 0 ? room.front / vy : room.back / -vy
  return Math.min(acrossWall, alongWall)
}

/** The ground between two rooms, laid along the line and knitted into both. */
function bridge(from: string, to: string, corridor?: Corridor): Cell {
  const a = placeOf(from)
  const b = placeOf(to)
  const d = Math.hypot(b.x - a.x, b.y - a.y)
  const ux = (b.x - a.x) / d
  const uy = (b.y - a.y) / d
  const leaves = exitAlong(roomOf(from), ux, uy)
  const enters = exitAlong(roomOf(to), -ux, -uy)
  const wallB = { x: b.x - ux * enters, y: b.y - uy * enters }
  const gap = d - leaves - enters
  // Pointed so that the corridor's own forward — its local -y, which is where
  // every pack in it was placed against — runs from the near room to the far
  // one.
  const turn = Math.atan2(ux, -uy)
  if (corridor && corridor.room.kind === 'hall') {
    // Its far door sits just inside the room it opens onto, and its length
    // grows backwards to reach the room it leaves. The packs keep the spacing
    // they were written with: what stretches is the empty walk in front of
    // them, which is the part of a corridor nobody measured.
    const at = { x: wallB.x + (KNIT - 120) * ux, y: wallB.y + (KNIT - 120) * uy }
    return {
      id: `${from}>${to}`,
      room: { ...corridor.room, front: gap + KNIT * 2 - 60, at, turn },
    }
  }
  // A door with nothing behind it is still floor, and floor is what keeps the
  // building in one piece.
  const half = (gap + KNIT * 2) / 2
  const mid = {
    x: wallB.x + (KNIT - half) * ux,
    y: wallB.y + (KNIT - half) * uy,
  }
  return {
    id: `${from}>${to}`,
    room: { kind: 'hall', halfWidth: 220, front: half, back: half, at: mid, turn },
  }
}

/** The ground behind one door, placed, for a party about to walk it. */
export function groundFor(from: string, to: string): Corridor | null {
  const passage = passageBetween(from, to)
  if (!passage?.corridor) return null
  const cell = bridge(from, to, passage.corridor)
  if (cell.room.kind !== 'hall') return null
  const room = cell.room
  // The packs and the doors were written in the corridor's own frame; the cell
  // says where that frame is, so they are put through it rather than left at
  // the origin.
  const place = (p: Vec2): Vec2 => fromRoom(room, p)
  return {
    ...passage.corridor,
    room,
    entry: place({ x: 0, y: room.front - 60 }),
    ways: passage.corridor.ways.map((way) => ({ to: way.to, at: place(way.at) })),
    packs: passage.corridor.packs.map((pack) => ({ ...pack, pos: place(pack.pos) })),
    ...(passage.corridor.springs
      ? {
          springs: passage.corridor.springs.map((spring) => ({
            ...spring,
            at: place(spring.at),
            // Off the passage's placed length, the same as its entry: what a
            // corridor is written with is the gap between the two rooms it was
            // written for, and what it is laid at is the gap it actually got.
            // Deliberately outside the passage — where they are going is out.
            toward: place(mouth(room.front)),
          })),
        }
      : {}),
  }
}

/**
 * Everything standing in the building, placed.
 *
 * All of it at once, because the party walks the whole citadel in one go now:
 * a pack that only existed while its own corridor was the world was a pack
 * that could not be walked into. They sleep where they were put and notice
 * when somebody comes near, which is what they always did — there are simply
 * no longer any of them that do not exist yet.
 */
export function citadelPacks(cleared?: ReadonlySet<string>): Pack[] {
  return laid(cleared).flatMap((passage) => groundFor(passage.from, passage.to)?.packs ?? [])
}

/** And everything in it that has not arrived yet, placed the same way. */
export function citadelSprings(cleared?: ReadonlySet<string>): Spring[] {
  return laid(cleared).flatMap((passage) => groundFor(passage.from, passage.to)?.springs ?? [])
}

/**
 * Which stretches of ground exist tonight.
 *
 * All of them when nobody asks, which is what the build does: the map's own
 * questions — is the floor continuous, is every fight placed in its own room —
 * are about the building and not about one evening in it.
 *
 * Given what is dead, a passage held shut is not laid at all. That is the
 * whole of what makes a shut door shut: the citadel is one continuous floor
 * now, so a door that is only *absent from a list* is a door you walk through.
 * The party stopped at the wall of the room they are in because the ground
 * they would have crossed is not there, and it appears the moment the thing
 * holding it goes down.
 */
function laid(cleared?: ReadonlySet<string>): Passage[] {
  if (!cleared) return PASSAGES
  return PASSAGES.filter((passage) => passageOpen(passage.gate, cleared))
}

/** Every room and every stretch of ground, placed. */
export function citadelWorld(cleared?: ReadonlySet<string>): Cell[] {
  const cells: Cell[] = CHAMBERS.map((c) => ({
    id: c.id,
    room: { ...roomOf(c.id), at: placeOf(c.id) },
  }))
  for (const passage of laid(cleared)) {
    cells.push(bridge(passage.from, passage.to, passage.corridor))
  }
  return cells
}

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
