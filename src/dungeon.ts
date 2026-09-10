import { ENCOUNTERS } from './sim/encounters'
import type { Corridor, Pack, Spring } from './sim/travel'
import { ROUND_ARENA, atScale, fromRoom, roomAt, type RoomShape } from './sim/room'
import type { Vec2 } from './sim/types'
import { RUNGS_PER_BOSS } from './progress'
import { BUILD_SCALE, YARD } from './sim/constants'

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
  // Two rooms, and it was one.
  //
  // The source's own floor plan — the map the game draws of this floor, not a
  // diagram somebody made of it — puts a small round chamber at the head of a
  // narrow shaft, and then the biggest room on the floor. This had a single
  // middling hall doing the work of both, which loses the two things the way
  // in actually says: that you arrive somewhere tight and step out into
  // something enormous, and that the enormous thing is where an army would
  // camp rather than a corridor you pass through.
  {
    id: 'threshold',
    name: 'The Threshold',
    wing: 'lower',
    encounter: null,
    // The landing at the top of the shaft: twenty-six yards across where the
    // shaft widens for the stair, and about seventy long before it opens into
    // the hall. The narrow run of it is a corridor's fourteen and a half; this
    // is the bulge, which is the part a raid arrives on and the part with
    // walls far enough apart to hold one.
    //
    // It was a thirty-four yard round room, and that was a measurement of the
    // wrong thing. The plan draws a spiral inside the shaft here and I read
    // the spiral — it is a stair symbol, and symbols on that sheet are not
    // drawn to scale while the walls beside them are. Every other room on this
    // floor was measured off a wall and stands; this one was measured off a
    // picture of a staircase, and it put the party in a chamber twice the
    // width of the corridor it opens onto.
    room: { kind: 'hall', halfWidth: 246, front: 644, back: 644 },
    pad: { kind: 'always' },
  },
  {
    id: 'vigil',
    name: 'The Vigil',
    wing: 'lower',
    encounter: null,
    // The great hall, and the largest room in the lower spire — twice as long
    // as it is wide, which is the proportion the plan gives it, with the first
    // fight's chamber no wider than it is. Two bays with a stair between them
    // in the source; one room here, because a stair is a thing this game has
    // no way to be on.
    // A hundred and sixty yards wide by a hundred and eighty-seven long. The
    // width is the source's own: the trigger that fires when a raid walks into
    // this hall is a box a hundred and sixty yards across the way in, and a
    // trigger laid over a doorless hall is laid to its walls — the plan agrees
    // to within two yards. It was a hundred and twenty-six, sized by eye off
    // that plan before the sheet had a scale on it.
    room: { kind: 'hall', halfWidth: 1516, front: 1772, back: 1771 },
  },
  { id: 'spire', name: 'The Spire', wing: 'lower', encounter: 0 },
  {
    id: 'ledge',
    name: 'The Ledge',
    wing: 'lower',
    encounter: null,
    // The way out of the first fight, and it exists because the first fight's
    // room has a hole in the middle of one wall.
    //
    // That room is half a disc with an ice cliff along the straight side (see
    // `apse` in `room.ts`), and the second fight is on the far side of the
    // cliff. The source does not walk anybody across it either: its map draws
    // a walkway right around the outside of the bowl, and a raid that has
    // killed the first boss takes it, climbs the outside of the room and comes
    // down a stair into the hall beyond. There is no height in this game and
    // no path-finding in it, so what is kept is the shape of the journey — out
    // of the side of the room, along a ledge that runs past the ice, and in at
    // the far end — as the one thing a citadel of rooms and doors can hold: a
    // room.
    //
    // Nineteen yards across, which is what the walkway measures on that sheet,
    // and long enough to run the height of the bowl beside it.
    room: { kind: 'hall', halfWidth: 180, front: 900, back: 900 },
    pad: killed('spire'),
  },
  {
    id: 'oratory',
    name: 'The Oratory',
    wing: 'lower',
    encounter: 1,
    pad: killed('spire'),
    // The shape is the fight's own — see `whisper` in `encounters.ts`, where
    // it is now the plan's: very nearly square and no bigger than the first
    // fight's chamber, with a gallery up either side.
  },
  {
    id: 'mooring',
    name: 'The Mooring',
    wing: 'lower',
    encounter: null,
    awaiting: 'the boss out of reach (#14)',
    // Open air with an edge, which is the one room in the building that is not
    // indoors — and by the plan of this floor the largest open ground in the
    // lower spire rather than the smallest arena in the game. It is a rampart:
    // a wide horseshoe of terrace with battlements round the outside and a
    // raised platform at the far end. Round here, because a horseshoe is a
    // concave shape and this game does not buy path-finding.
    //
    // A hundred and seventy-eight yards across. The four triggers that put a
    // raider onto the other ship stand at the corners of the deck in the
    // source — 229 yards apart one way and 127 the other — and a circle that
    // splits the difference is the nearest a platform gets to that. It was 92,
    // which made the one open-air room in the building the smallest arena in
    // the game.
    room: { kind: 'platform', radius: 1686 },
    pad: killed('oratory'),
  },
  {
    id: 'rise',
    name: 'The Rise',
    wing: 'lower',
    encounter: 3,
    pad: killed('mooring'),
    // Measured, and the only room above the lower spire that is: the plan of
    // this floor carries two positions written down in the source's own
    // script — where the raid arrives at the top of the stair and where the
    // boss stands — and they are 44.97 yards apart across 76 pixels of it, so
    // that sheet is 0.592 yards to the pixel. The quatrefoil comes out 104 by
    // 102 yards, and the shape it is here is a circle of that width. See
    // `gorged` in `encounters.ts`.
  },
  // The room where the citadel stops being a corridor. No fight in it, and
  // that is the point: it is the only place in the building where the player
  // is asked which way to go.
  {
    id: 'crossing',
    name: 'The Upper Crossing',
    wing: 'lower',
    encounter: null,
    // A circle with a cross laid in it, and two hundred and forty-four yards
    // across.
    //
    // Measured twice and the two agree. The client's map tile for this floor
    // says which world rectangle it covers, which makes it 1.1465 yards to the
    // pixel, and the hub draws about 210 across on it. The source's own
    // triggers settle it: the doorway west into the plagueworks stands at x
    // 4245.9 and the one east into the crimson hall at x 4489.0, and the two
    // on the other axis at y 2622.1 and y 2872.2 — 243 one way, 250 the other.
    //
    // It was 141, taken off a corridor-width proxy on an unscaled sheet and
    // marked at the time as weaker than a measurement. It was: it was a third
    // of the room. Before that it was less than half of *that*, on the
    // argument that every door had to be on the screen at once — an argument
    // the map in the corner answers instead.
    room: { kind: 'round', radius: 2312 },
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
    // A cross, taller than it is wide, which is what the plan draws: a long
    // bar with the two rooms off the ends of it and the laboratory straight on
    // past the middle. It was the other way round here — wide and shallow, so
    // that both side rooms were in one glance — and that was the right answer
    // to a question the map in the corner now answers instead. What it cost
    // was the shape: the wing's two rooms are up and down from this junction
    // in the source, and a wide room puts them on its short walls.
    // Seventy-five yards wide by a hundred and sixty-six long, off the floor
    // plan at its measured 1.1465 yards to the pixel. It was 37 by 47, which
    // is a junction rather than a hall.
    room: { kind: 'hall', halfWidth: 710, front: 1573, back: 1573 },
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
    // Square-ish with a lobe off each side, which is what the plan draws and
    // is not what "long, with the thing that has to be kept alive lying down
    // the middle" made of it. Round here: four lobes on a square is a shape
    // whose corners this game cannot walk out of.
    // A hundred and twenty-four yards across the walkable middle, off the
    // frostwing plan at its measured 0.7722 yards to the pixel; the lobes
    // reach 178 corner to corner. It was 62, which is half the room.
    room: { kind: 'round', radius: 1175 },
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
    // Twenty-three yards wide and eighty-five long, which is the stem between
    // the two halls on the frostwing plan.
    room: { kind: 'hall', halfWidth: 218, front: 900, back: 710 },
  },
  {
    id: 'lair',
    name: 'The Rimeward Lair',
    wing: 'frostwing',
    encounter: null,
    awaiting: 'the stacking that is answered by leaving (#12)',
    // Open ice at the end of the long way round, and a big room: the plan puts
    // it at the far end of the frostwing halls with nothing else on that
    // reach.
    // A hundred and twenty-six yards across, off the frostwing plan: the
    // cloverleaf's own floor is 104 and the points reach 147. The source's
    // trigger over it is a box 113 by 60, which sits inside that.
    room: { kind: 'platform', radius: 1194 },
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
    // came. Its own floor on the plan: a wide, cracked, ragged-edged shelf of
    // ice with a sigil cut in the middle of it and a stair up at one side —
    // the largest arena in the building, as the last one ought to be, and the
    // one it is most obviously possible to fall off.
    // A hundred and forty yards across. Its map tile covers a known rectangle
    // of the world, which makes that sheet 0.2927 yards to the pixel, and the
    // cracked shelf draws 145 by 135 on it.
    room: { kind: 'platform', radius: 1326 },
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
    room: { kind: 'hall', halfWidth: 143, front, back: 240 },
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
  // The shaft: narrow, short, and held by nobody. What is at the top of it is
  // the way in, and a raid that had to fight before it reached the hall would
  // never see the hall.
  { from: 'threshold', to: 'vigil' },
  {
    from: 'vigil',
    to: 'spire',
    corridor: corridor(
      'spireway',
      'spire',
      [
        { pos: { x: 0, y: 520 }, count: 3, pulls: 240 },
        { pos: { x: -50, y: 180 }, count: 3, pulls: 230 },
      ],
      [
        {
          at: { x: 0, y: 40 },
          every: 4,
          most: 6,
          pulls: 4800,
          stops: 900,
        },
      ],
    ),
  },
  // Out of the side of the first fight's room rather than out of the back of
  // it: the back of it is the cliff.
  { from: 'spire', to: 'ledge', gate: killed('spire') },
  { from: 'ledge', to: 'oratory' },
  {
    from: 'oratory',
    to: 'mooring',
    gate: killed('oratory'),
    corridor: corridor('rampartway', 'mooring', [
      { pos: { x: 0, y: 560 }, count: 3, pulls: 250 },
      { pos: { x: -42, y: 200 }, count: 3, pulls: 230 },
    ]),
  },
  {
    from: 'mooring',
    to: 'rise',
    gate: killed('mooring'),
    corridor: corridor('riseway', 'rise', [
      { pos: { x: 0, y: 700 }, count: 4, pulls: 250 },
      { pos: { x: 50, y: 320 }, count: 3, pulls: 240 },
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
      { pos: { x: -50, y: 380 }, count: 3, pulls: 250 },
      { pos: { x: 46, y: 60 }, count: 4, pulls: 260 },
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
      { pos: { x: 58, y: 540 }, count: 4, pulls: 250 },
      { pos: { x: -46, y: 160 }, count: 3, pulls: 230 },
    ]),
  },
  { from: 'crimson', to: 'sanctum', gate: killed('crimson') },

  {
    from: 'crossing',
    to: 'dream',
    corridor: corridor('dreamway', 'dream', [
      { pos: { x: 0, y: 700 }, count: 4, pulls: 250 },
      { pos: { x: -54, y: 300 }, count: 3, pulls: 260 },
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
      { pos: { x: -54, y: 560 }, count: 3, pulls: 250 },
      { pos: { x: 58, y: 120 }, count: 5, pulls: 240 },
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
  // Yards, measured, with the way on running up the page.
  //
  // Bearings now rather than positions. Where a room stands is worked out from
  // the rooms and the ground between them — see `PLACES` — and what this table
  // still decides is which way one room lies from the next: the plagueworks to
  // the left of the hub, the frostwing halls away to the right, the throne up
  // and off the middle. That is the half of it the source can answer and the
  // half a drawing of a building is actually for.
  //
  // This was a list of fractions of a square, traced off the raid's own map by
  // eye and then stretched by a single number picked so that no two rooms
  // overlapped. That number is a packing constraint, not a measurement, and it
  // is why walking the citadel felt enormous: it left 1611 yards of bare floor
  // between rooms, most of it in stretches with nothing in them.
  //
  // The distances here come from the source instead. The client's map tiles
  // carry the world rectangle each one covers (`UiMapAssignment`), so a pixel
  // on any floor plan converts to yards exactly; and the instance's scripts
  // and area triggers give world positions for the rooms themselves. Between
  // the two, every stretch below is a real distance between two real places.
  //
  // Where the real relationship is horizontal the real distance is used. Where
  // one room is *above* another — the gunship over the Oratory, the Rise over
  // the gunship, the Sanctum over the Crimson Hall — a flat plan cannot nest
  // them, so those are set just clear of each other instead and are the only
  // numbers here that are chosen. The two teleporters are the same case.
  //
  // The lower spire, straight up the left: the entrance, the great hall, the
  // first fight, the second. All four sit on one line at y 2212 in the source,
  // so these are differences in world x and nothing else.
  { id: 'threshold', x: 0, y: 0 },
  { id: 'vigil', x: 0, y: 292 },
  { id: 'spire', x: 0, y: 420 },
  // Due east of the first fight's room and barely past it, which is the
  // bearing the walkway leaves on. Its distance, like every other, is the two
  // rooms and the ground between them — the number here is only which way
  // round the bowl the raid goes.
  //
  // Narrower than it looks: the ground to it is knitted a passage's length
  // back *into* the first fight's room, along this bearing, so a bearing
  // pointed further up the screen drags that knitting across the lip of the
  // cliff and lays floor over the ice. Further down the screen and the way on
  // walks backwards. Both are checked — see "nothing lays floor over the first
  // fight's cliff" and "the lower spire is walked up the screen" — so this is
  // a number with a check either side of it rather than a preference.
  { id: 'ledge', x: 100, y: 430 },
  { id: 'oratory', x: 0, y: 685 },

  // Then the turn along the bottom and up. The gunship is 162 yards from the
  // Oratory in the source and directly over it in height; the Rise is over the
  // gunship again. Both are opened out to clear the rooms either side.
  { id: 'mooring', x: 180, y: 685 },
  { id: 'rise', x: 180, y: 861 },
  { id: 'crossing', x: 180, y: 1041 },

  // The upper spire, laid off the crossing's own world position — the hub is
  // at (4355.5, 2774.4) and every room below is its real offset from that,
  // turned so the plagueworks stays on the left and the crimson wing above.
  { id: 'vats', x: -93, y: 1026 },
  { id: 'airless', x: -184, y: 957 },
  { id: 'sludge', x: -187, y: 1139 },
  { id: 'laboratory', x: -309, y: 1041 },

  { id: 'crimson', x: 183, y: 1242 },
  { id: 'sanctum', x: 183, y: 1385 },

  // Valithria's hall is 320 yards from the hub and Sindragosa's is 208 beyond
  // it, with the gauntlet on the line between them.
  { id: 'dream', x: 470, y: 896 },
  { id: 'gauntlet', x: 470, y: 1000 },
  { id: 'lair', x: 469, y: 1105 },

  // Reached by teleporter in the source, so this is a placed room rather than
  // a measured one, and placed as close in as it will go: the source does not
  // make anybody walk this, so every yard of it is a yard of nothing.
  //
  // Close in is not very close. The crimson hall measures two hundred and
  // thirty yards wide and the frostwing column stands off to the right of it,
  // which leaves one gap in the upper spire big enough for a hundred and forty
  // yard platform — this corner, eighteen yards clear of the hall on one side
  // and nineteen off the lair on the other.
  { id: 'throne', x: 390, y: 1235 },
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
  const written = writtenRoom(id)
  // A room with a fight in it is built at its measurement, because every
  // mechanic in the game is a number of units measured inside one of those
  // rooms — see `BUILD_SCALE`. A room you only cross is built at that scale,
  // and that includes a room whose fight has not been written yet: it is a
  // room you only cross *today*, and the day its fight arrives it is measured
  // again and the plan, which is derived, grows around the difference.
  const fought =
    chamber !== undefined && chamber.encounter !== null && chamber.encounter < ENCOUNTERS.length
  return fought ? written : atScale(written, BUILD_SCALE)
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
  // Where the ray leaves, not where each axis runs out.
  //
  // This used to walk a long way out along the bearing and then clamp, and a
  // clamp is per axis: a bearing a few degrees off the long side of a hall had
  // its across-coordinate pinned to the side wall and its along-coordinate
  // pinned to the *end* wall, so the door landed in the corner. The old note
  // here said so and called it still-the-wall.
  //
  // It is not, because the ground behind the door is not laid to the corner.
  // A passage is laid along the line between two rooms' middles and starts
  // where that line leaves the room — `exitAlong`, the same function used
  // here now. With a corner for a door and a wall-crossing for a passage, the
  // two were in different places: from the second fight's room the door to the
  // airship sat thirteen hundred units off the corridor's mouth, and a party
  // that walked to it found no floor on the other side. Four fifths of the way
  // to the next room there was nothing to stand on.
  //
  // From the room and not from the origin: once the rooms are placed in a
  // building, a bearing taken from the middle of the world points somewhere
  // else entirely, and the build caught that the moment they were.
  const c = roomAt(room)
  const ux = Math.cos(angle)
  const uy = Math.sin(angle)
  const out = Math.max(0, exitAlong(room, ux, uy) - inset)
  return { x: c.x + ux * out, y: c.y + uy * out }
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
 * The room the citadel is entered by, which is where the building starts.
 *
 * The plan is laid outward from it — see `PLACES` — so it is a fact about the
 * map rather than about an evening, and `DOOR` in `citadel.ts` is this.
 */
export const WAY_IN = 'threshold'

/**
 * How far the way in runs, and the shortest any bare stretch of the citadel is
 * allowed to be.
 *
 * Twenty yards: long enough to be a passage you walk down rather than a
 * doorway between two rooms, short enough that nobody is holding a stick
 * through it wondering whether the game has started.
 */
const ENTRY_WALK = 20 * YARD

/**
 * The longest a stretch of nothing is allowed to be.
 *
 * Forty yards, which is about five seconds. Long enough that a door reads as
 * leading somewhere rather than into the next room's wall; short enough that
 * nobody is walking it wondering whether they missed a turn. Anything longer
 * than this in the source is a distance that was measured for a building with
 * a flight path and a mount in it.
 */
const BARE_MOST = 40 * YARD

/** The room as the source measured it, before the building was scaled down. */
function writtenRoom(id: string): RoomShape {
  const chamber = chamberAt(id)
  if (!chamber) return DEFAULT_ROOM
  if (chamber.encounter !== null && chamber.encounter < ENCOUNTERS.length) {
    return ENCOUNTERS[chamber.encounter]!.room ?? ROUND_ARENA
  }
  return chamber.room ?? DEFAULT_ROOM
}

/** Where the source puts a room, which is a bearing here and not a distance. */
function measuredAt(id: string): Vec2 {
  const entry = planOf(id)
  return { x: entry.x * YARD, y: -entry.y * YARD }
}

/**
 * How much ground there is between two rooms, which is a decision now.
 *
 * A held passage answers for itself. `corridor` sizes its hall off the packs
 * standing in it and `bridge` lays that hall at `gap + KNIT * 2 - 60`, so the
 * gap that gives a corridor exactly its own length is that arithmetic run
 * backwards. Anything else is a corridor with half of itself inside a room, or
 * a stretch of nothing in front of one.
 *
 * A bare passage is the walk the source has there, halved like everything else
 * nobody fights in — and then capped, which the halving alone does not do. The
 * source's own way in is a hundred and sixty-four yards of empty floor and
 * half of that is still eighty-two: twelve seconds of holding a stick before
 * the first room. Dead floor is the one thing this building may not have more
 * of, however faithfully it was measured, so no stretch of it is longer than
 * `BARE_MOST` and none is shorter than a passage.
 */
function linkGap(from: string, to: string): number {
  const room = passageBetween(from, to)?.corridor?.room
  if (room && room.kind === 'hall') return room.front - (KNIT * 2 - 60)
  const a = measuredAt(from)
  const b = measuredAt(to)
  const d = Math.hypot(b.x - a.x, b.y - a.y)
  const ux = (b.x - a.x) / d
  const uy = (b.y - a.y) / d
  const bare =
    d - exitAlong(writtenRoom(from), ux, uy) - exitAlong(writtenRoom(to), -ux, -uy)
  return Math.min(BARE_MOST, Math.max(ENTRY_WALK, bare * BUILD_SCALE))
}

/**
 * How much daylight two rooms nothing joins are given.
 *
 * Four yards, which is a wall's worth. Rooms that touch with nothing between
 * them are two rooms a player reads as one, and the build says so — but a plan
 * that only just clears is a plan that stops clearing the next time a room is
 * measured again.
 */
const CLEARANCE = 80

/** The widest a passage is laid, which is what a room has to stand clear of. */
const PASSAGE_HALF = 220

/**
 * Where every room stands, in units, with the way on running up the screen.
 *
 * Two things decide it, and neither of them is a coordinate. The *bearing*
 * from one room to the next is the source's, off the world positions in its
 * own scripts, which is what keeps the plagueworks to the left of the hub and
 * the frostwing halls away to the right. The *distance* is this building's:
 * the wall of the room behind, the ground between, and the wall of the room
 * ahead.
 *
 * It used to be coordinates, and that is the bug this replaces. A position
 * says where a room's middle is and says nothing about its walls, so the
 * ground between two of them was whatever was left over once the walls had
 * been subtracted — and the two numbers came from different measurements. At
 * the way in the leftover was a hundred and sixty-four yards of empty floor,
 * twenty seconds of walking to reach the first room. One room further on it
 * was *minus four*: the passage from the great hall to the first boss is held
 * ground with packs standing in it and a doorway at the top that keeps sending
 * bodies down it, and it came out inverted, so everything written to stand in
 * it stood inside the rooms at either end and a raid walked out of the hall
 * straight into the boss.
 *
 * Both are the same mistake. A corridor that holds a fight cannot be a
 * residue, and neither can a walk that costs twenty seconds. So the residue is
 * gone: every distance in the citadel is now two walls and a stated piece of
 * ground, and `linkGap` is the only place that decides how much ground.
 *
 * The plan is written the way the raid's own map is printed — the way in
 * halfway down the left edge, the lower spire *below* it — and the building is
 * stood up with that flipped, so the walk from the door to the first fight
 * goes up the screen. Which way up a poster was drawn is a fact about the
 * poster. Which way you walk when you come in is a fact about the building,
 * and the one a player is holding: they press up, and up has to be onward.
 *
 * A flip and not a turn, so left stays left.
 */
const PLACES: Map<string, Vec2> = (() => {
  const out = new Map<string, Vec2>([[WAY_IN, { x: 0, y: 0 }]])
  // Which room each one was placed off, and which way. Kept because a room
  // that has to be pushed out later takes everything hung off it along: the
  // distances between them are the point, and a building that shoved one room
  // aside on its own would have a corridor stretched to nothing behind it.
  const parent = new Map<string, { of: string; ux: number; uy: number }>()
  const children = new Map<string, string[]>()

  // Outward from the door, one room at a time, so that every room is placed
  // off one that has already been placed. The citadel has one loop in it — the
  // plagueworks closes back on the laboratory — and the first way round is the
  // one that puts the room down; the other passage is then a door like any
  // other, which is what it is on the floor as well.
  const queue = [WAY_IN]
  while (queue.length > 0) {
    const from = queue.shift()!
    const at = out.get(from)!
    for (const passage of PASSAGES) {
      const to = passage.from === from ? passage.to : passage.to === from ? passage.from : null
      if (to === null || out.has(to)) continue
      const a = measuredAt(from)
      const b = measuredAt(to)
      const d = Math.hypot(b.x - a.x, b.y - a.y)
      const ux = (b.x - a.x) / d
      const uy = (b.y - a.y) / d
      const apart =
        exitAlong(roomOf(from), ux, uy) + linkGap(from, to) + exitAlong(roomOf(to), -ux, -uy)
      out.set(to, { x: at.x + ux * apart, y: at.y + uy * apart })
      parent.set(to, { of: from, ux, uy })
      children.set(from, [...(children.get(from) ?? []), to])
      queue.push(to)
    }
  }

  // And then far enough out that the building does not stand inside itself.
  //
  // Distance along a passage is decided by the rooms at its ends; distance
  // *across* the plan is not decided by anything, and the wings do not care.
  // The crimson hall is two hundred and thirty yards wide and sits off the hub
  // on one bearing while the frostwing halls run off it on another, so pulling
  // both in by the ground between them and the hub walked one through the
  // other. It is the only thing a plan of positions was silently buying, and
  // the price of stating the distances is having to state this too.
  //
  // Pushed along its own passage rather than aside, so a room that moves stays
  // on the bearing the source put it on and the ground behind it grows rather
  // than bends — and its own wing goes with it, since everything hung off it
  // was placed by the same rule.
  const slide = (id: string, dx: number, dy: number): void => {
    const at = out.get(id)!
    out.set(id, { x: at.x + dx, y: at.y + dy })
    for (const child of children.get(id) ?? []) slide(child, dx, dy)
  }
  const shove = (id: string, by: number): void => {
    const link = parent.get(id)
    if (!link) return
    slide(id, link.ux * by, link.uy * by)
  }
  const joined = new Set(PASSAGES.flatMap((p) => [`${p.from}/${p.to}`, `${p.to}/${p.from}`]))
  /**
   * Which of two rooms gives way, and by how much.
   *
   * A room is pushed back out along the passage it was placed by, so the
   * ground behind it grows and its bearing off the source's plan is kept. That
   * makes the useful question "how much of a push actually separates them",
   * which depends on how well its own passage points away from the other room:
   * pushing a room out along a bearing at right angles to the crowding buys
   * nothing and pushing it along a bearing pointed straight away buys all of
   * it.
   *
   * So both are costed and the cheaper one moves. Picking the one further from
   * the door instead — plausible, and what this did first — chose the throne's
   * neighbour every time, because the throne is one door off the hub and the
   * frostwing lair is three: a platform the source reaches by teleporter stayed
   * where the compression had put it and the last room of a wing was pushed
   * three hundred yards up its own corridor to get away from it.
   *
   * The way in never gives way. It is the one room in the plan that is not
   * allowed to move, because it is where the plan is measured from.
   */
  const costOf = (id: string, ux: number, uy: number): number => {
    const link = parent.get(id)
    if (!link) return Infinity
    // Along its own passage, how much of a push separates the two rooms.
    const along = link.ux * ux + link.uy * uy
    return along <= 0.05 ? Infinity : 1 / along
  }
  const givesWay = (a: string, b: string, ux: number, uy: number): string | null => {
    // `ux, uy` points from a to b, so b is pushed that way and a the other.
    const costA = costOf(a, -ux, -uy)
    const costB = costOf(b, ux, uy)
    if (costA === Infinity && costB === Infinity) return null
    return costA <= costB ? a : b
  }
  for (let pass = 0; pass < 24; pass++) {
    let moved = false
    for (const a of CHAMBERS) {
      for (const b of CHAMBERS) {
        if (a.id === b.id) continue
        const pa = out.get(a.id)!
        const pb = out.get(b.id)!
        const d = Math.hypot(pb.x - pa.x, pb.y - pa.y)
        if (d === 0) continue
        const ux = (pb.x - pa.x) / d
        const uy = (pb.y - pa.y) / d
        // Rooms a door joins may stand a doorway apart; rooms nothing joins
        // stand clear of each other, or the floor has a way through that the
        // map has never heard of. The plagueworks is the case that needs
        // saying: its four rooms close a loop, so one of its passages is the
        // way round that did *not* place the room at the far end of it, and
        // that one is as long as the two rooms leave it.
        const want =
          support(roomOf(a.id), ux, uy) +
          support(roomOf(b.id), -ux, -uy) +
          (joined.has(`${a.id}/${b.id}`) ? 0 : CLEARANCE)
        if (d >= want) continue
        const yields = givesWay(a.id, b.id, ux, uy)
        if (yields === null) continue
        const link = parent.get(yields)!
        const away = yields === a.id ? -1 : 1
        shove(yields, (want - d) / Math.max(0.05, (link.ux * ux + link.uy * uy) * away))
        moved = true
      }
    }
    // And clear of the ground between rooms, not only of the rooms.
    //
    // A room nothing touches is still a room a corridor can be laid through,
    // and the floor is the union of both — so the ground from the frost
    // gauntlet to the lair was laid across the throne, and a party that had
    // opened neither could walk into the last room in the building. The build
    // catches it as the floor and the map disagreeing about which rooms exist,
    // which is the same sentence from the player's side.
    //
    // Pushed off the passage rather than out along its own, which is the one
    // place in this layout that leaves a source bearing. The alternative is
    // worse in both directions: a room nearly in line with the passage has to
    // travel an enormous way along its own bearing to clear it, and what came
    // out was a building twice the size to keep one platform out of one
    // corridor. A bearing is a fact about the source; a corridor running
    // through a room is not a fact about anything.
    for (const passage of PASSAGES) {
      const a = out.get(passage.from)!
      const b = out.get(passage.to)!
      for (const c of CHAMBERS) {
        if (c.id === passage.from || c.id === passage.to) continue
        const off = awayFromLine(out.get(c.id)!, a, b)
        if (off.d === 0) continue
        const want = support(roomOf(c.id), -off.ux, -off.uy) + PASSAGE_HALF
        if (off.d >= want) continue
        const by = want - off.d
        slide(c.id, off.ux * by, off.uy * by)
        moved = true
      }
    }
    if (!moved) break
  }
  return out
})()

/**
 * How far a point is off a stretch of ground, and which way.
 *
 * The stretch is a segment rather than a line: past either end the nearest
 * point on it is that end, which is what keeps a room *beside* the hub from
 * being pushed by a passage that stops short of it.
 */
function awayFromLine(p: Vec2, a: Vec2, b: Vec2): { d: number; ux: number; uy: number } {
  const vx = b.x - a.x
  const vy = b.y - a.y
  const len = vx * vx + vy * vy
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len))
  const dx = p.x - (a.x + vx * t)
  const dy = p.y - (a.y + vy * t)
  const d = Math.hypot(dx, dy)
  return d === 0 ? { d: 0, ux: 0, uy: 0 } : { d, ux: dx / d, uy: dy / d }
}


/** Where a room stands in the citadel. */
export function placeOf(id: string): Vec2 {
  return PLACES.get(id) ?? { x: 0, y: 0 }
}

/**
 * The building, squashed into a unit square.
 *
 * The map screen lays rooms out as fractions of the space it has been given,
 * and handed units it put twelve of the seventeen off the edge of a phone. So
 * the normalising happens once, here, rather than in the drawing — the map is
 * a picture of the building and should not be allowed a second opinion about
 * where a room is.
 *
 * Off the built positions rather than off the written plan, which is the same
 * rule: the lower spire's rooms are where the chain puts them, and a map that
 * drew them where the table says would be a map of a building nobody walks.
 */
export const CITADEL_CHART: Array<{ id: string; x: number; y: number }> = (() => {
  const places = CITADEL_PLAN.map((entry) => ({ id: entry.id, ...placeOf(entry.id) }))
  const xs = places.map((e) => e.x)
  const ys = places.map((e) => e.y)
  const x0 = Math.min(...xs)
  const y0 = Math.min(...ys)
  const w = Math.max(...xs) - x0
  const h = Math.max(...ys) - y0
  // No flip: the built positions already have the way on running up the
  // screen, and a fraction of the drawing is measured down from its top.
  return places.map((e) => ({ id: e.id, x: (e.x - x0) / w, y: (e.y - y0) / h }))
})()

/**
 * How far the furthest room stands from the door, in units.
 *
 * Reported rather than chosen. The plan used to be fractions of a square times
 * a single scale, and that scale was the smallest number at which no two rooms
 * overlapped — a packing constraint wearing a measurement's clothes. There is
 * nothing left to reconcile and nothing left to pick; what is still worth
 * having is a size for the building, and this is it.
 */
export const CITADEL_REACH = Math.max(
  ...CITADEL_PLAN.map((entry) => {
    const at = placeOf(entry.id)
    return Math.hypot(at.x, at.y)
  }),
)

/**
 * How far a room reaches in one direction.
 *
 * Less than it reaches to a corner, which is what `roomReach` answers and is
 * the wrong question here: two rooms joined along the y do not have to clear
 * each other's corners, and asking for that made the building half as big
 * again as it needs to be.
 */
export function support(room: RoomShape, ux: number, uy: number): number {
  if (room.kind === 'apse') {
    // The whole bowl, floor and cliff together, because this answers a
    // question about the plan rather than about walking: what the building
    // may not put another room inside. The ice on the far side of the drop is
    // as much a part of this chamber as the floor on the near side of it —
    // it is the thing the raid walks around — so the circle is asked whole.
    // Where the *floor* stops is `exitAlong`, which is asked by the doors.
    const t = room.turn ?? 0
    const vy = ux * Math.sin(-t) + uy * Math.cos(-t)
    return room.radius - room.back * vy
  }
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
  if (room.kind === 'apse') {
    const t = room.turn ?? 0
    const vy = ux * Math.sin(-t) + uy * Math.cos(-t)
    // Out through the curve: the ray from the origin against a circle whose
    // middle is `back` behind it, which is one root of a quadratic and always
    // has exactly one positive one, since the origin is inside that circle.
    const b = vy * room.back
    const curve = -b + Math.sqrt(b * b + room.radius * room.radius - room.back * room.back)
    // Or out over the straight wall, which is only ahead of a ray pointed
    // behind the boss.
    const drop = vy < 0 ? room.back / -vy : Infinity
    return Math.min(curve, drop)
  }
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
