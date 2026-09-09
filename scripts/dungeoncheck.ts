import {
  CHAMBERS,
  CITADEL_REACH,
  PASSAGES,
  chamberAt,
  clearedFrom,
  gateOpen,
  killedOnce,
  padsLit,
  citadelPacks,
  citadelSprings,
  citadelWorld,
  groundFor,
  exitAlong,
  hallFor,
  placeOf,
  reachable,
  roomOf,
  standing,
  support,
  wingCleared,
  wingFights,
  type Chamber,
} from '../src/dungeon'
import { ENCOUNTERS } from '../src/sim/encounters'
import { FIRST_TIER, LADDER, RUNGS_PER_BOSS, cleared as clearedTier, isOpen, tierOf } from '../src/progress'
import { EXIT_REACH, overlapping, packsPlaced, unguarded } from '../src/sim/travel'
import { dist, holdOrFall } from '../src/sim/combat'
import { ARENA_RADIUS, BOSS_WIDTH, MELEE_RANGE, PARTY_RADIUS, YARD } from '../src/sim/constants'
import { createCorridorState, createState, unattended } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { Rng } from '../src/sim/rng'
import { CLASSES, autoParty, pickFor } from '../src/sim/classes'
import { insideRoom } from '../src/sim/room'
import { inTerrain } from '../src/sim/battleground'
import {
  DOOR,
  cleared,
  enter,
  enterable,
  isCleared,
  load,
  roomSeed,
  save,
  startRun,
  stepTo,
  abandon,
  instanceAt,
  instances,
  isSaved,
  lockAt,
  resetsAt,
  walkedTo,
  wayOpen,
  ways,
  wiped,
} from '../src/citadel'

/**
 * The map has to be a map.
 *
 * It is data, so nothing about it fails at run time: a room nothing reaches, a
 * door that opens on a room that does not exist, a route to the top that skips
 * a wing — all of them are a game that quietly lets you past something, which
 * is the one failure a raid must not have. None of it is expensive to prove,
 * and all of it is impossible to notice by reading a diagram.
 */

let failures = 0
const expect = (label: string, ok: boolean, detail = ''): void => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok || !detail ? '' : `  -> ${detail}`}`)
}

// --- the graph is a graph ----------------------------------------------------

const ids = new Set(CHAMBERS.map((c) => c.id))
expect(`${CHAMBERS.length} rooms, each named once`, ids.size === CHAMBERS.length, 'two rooms share an id')

const dangling = PASSAGES.flatMap((p) =>
  [p.from, p.to].filter((id) => !ids.has(id)).map((id) => `${p.from}->${p.to} names ${id}`),
)
expect('every passage joins two rooms that exist', dangling.length === 0, dangling.join('; '))

const gatesNamed = PASSAGES.flatMap((p) =>
  p.gate?.kind === 'killed' ? p.gate.chambers.filter((id) => !ids.has(id)).map((id) => `${p.to}: ${id}`) : [],
).concat(
  CHAMBERS.flatMap((c) =>
    c.pad?.kind === 'killed' ? c.pad.chambers.filter((id) => !ids.has(id)).map((id) => `${c.id}: ${id}`) : [],
  ),
)
expect('and every gate names a room that exists', gatesNamed.length === 0, gatesNamed.join('; '))

// A door held shut by a room with nothing in it can never open.
const empty = new Set(
  CHAMBERS.filter((c) => c.encounter === null && c.awaiting === undefined).map((c) => c.id),
)
const unkillable = PASSAGES.flatMap((p) =>
  p.gate?.kind === 'killed' ? p.gate.chambers.filter((id) => empty.has(id)).map((id) => `${p.to} waits on ${id}`) : [],
)
expect('and nothing waits on a room with no fight in it', unkillable.length === 0, unkillable.join('; '))

// --- every fight is one the game has, or is honestly marked as absent --------

const numbered = CHAMBERS.filter((c) => c.encounter !== null)
const strays = numbered.filter((c) => c.encounter! < 0 || c.encounter! >= ENCOUNTERS.length)
expect(
  `${numbered.length} rooms hold a fight the game has`,
  strays.length === 0,
  strays.map((c) => `${c.id}: ${c.encounter}`).join(', '),
)
const twice = numbered.filter((c, i) => numbered.findIndex((o) => o.encounter === c.encounter) !== i)
expect('and no fight is in two rooms', twice.length === 0, twice.map((c) => c.id).join(', '))
const homeless = ENCOUNTERS.map((_, i) => i).filter((i) => !numbered.some((c) => c.encounter === i))
expect('and every fight in the game has a room', homeless.length === 0, homeless.join(', '))
expect(
  `and the ${CHAMBERS.filter((c) => c.awaiting).length} rooms with no fight yet say what they are waiting for`,
  CHAMBERS.every((c) => c.encounter !== null || c.awaiting === undefined || c.awaiting.length > 8),
  'an empty room says nothing about what fills it',
)

// --- the route -----------------------------------------------------------

/** Everything reachable if nothing is ever killed: the first evening's walk. */
const opening = reachable(new Set())
expect(
  'a raid that has killed nothing can reach the first fight and no further',
  opening.has('spire') && !opening.has('oratory'),
  [...opening].join(', '),
)

/** Killing everything reachable, over and over, until nothing new opens. */
function walkThrough(): { order: string[]; cleared: Set<string> } {
  const cleared = new Set<string>()
  const order: string[] = []
  for (let pass = 0; pass < CHAMBERS.length + 1; pass++) {
    let moved = false
    for (const id of reachable(cleared)) {
      const room = chamberAt(id)!
      if (cleared.has(id)) continue
      if (room.encounter === null && room.awaiting === undefined) continue
      cleared.add(id)
      order.push(id)
      moved = true
    }
    if (!moved) break
  }
  return { order, cleared }
}

const walk = walkThrough()
const fights = CHAMBERS.filter((c) => c.encounter !== null || c.awaiting !== undefined)
expect(
  `the whole citadel opens: ${walk.cleared.size} of ${fights.length} fights`,
  walk.cleared.size === fights.length,
  fights.filter((c) => !walk.cleared.has(c.id)).map((c) => c.id).join(', '),
)
expect(
  'and every room, fight or not, is reached',
  reachable(walk.cleared).size === CHAMBERS.length,
  CHAMBERS.filter((c) => !reachable(walk.cleared).has(c.id)).map((c) => c.id).join(', '),
)

// The five rules of the source's own route, each one asked as a question the
// map can answer wrong.
const order = (id: string): number => walk.order.indexOf(id)
expect(
  'the first four are a single file',
  order('spire') < order('oratory') && order('oratory') < order('mooring') && order('mooring') < order('rise'),
  walk.order.join(' -> '),
)
expect(
  'the laboratory waits for both of the rooms beside it',
  order('laboratory') > order('sludge') && order('laboratory') > order('airless'),
  walk.order.join(' -> '),
)
expect(
  'the lair waits for the dragon',
  order('lair') > order('dream'),
  walk.order.join(' -> '),
)
// Last of everything the building actually has in it. A room whose fight is
// not written yet holds no door — see `standing` — so it can be walked into
// after the throne in this sweep without the top having been reached early.
// What must never happen is a *written* fight opening after it, and that is
// the question this asks; the day the laboratory is written it goes back to
// being the flat "last of all" it used to be, with no edit here.
const written = fights.filter((c) => standing(c.id))
expect(
  `and the throne is last of the ${written.length} fights the game has written`,
  written.every((c) => order(c.id) < order('throne')),
  walk.order.join(' -> '),
)

// The one that matters: there is no way to the top that skips a wing. Asked by
// clearing every fight except one and checking the throne stays shut, for each
// fight in turn.
const skips: string[] = []
for (const missed of fights) {
  const cleared = new Set(fights.filter((c) => c.id !== missed.id).map((c) => c.id))
  if (missed.id === 'throne') continue
  // Only a room with something in it can hold the top shut, so only one of
  // those can be proved to. An unwritten room left out of this sweep would
  // "skip" a wing that has nothing in it to skip.
  if (!standing(missed.id)) continue
  if (reachable(cleared).has('throne') && ['plague', 'crimson', 'frostwing'].includes(missed.wing)) {
    skips.push(`without ${missed.id}`)
  }
}
expect('and no wing can be skipped on the way to the top', skips.length === 0, skips.join(', '))

// The three wings in any order, which is the only choice the map offers.
const wings: Array<'plague' | 'crimson' | 'frostwing'> = ['plague', 'crimson', 'frostwing']
const free = wings.filter((wing) => {
  const first = CHAMBERS.find((c) => c.wing === wing)!
  return reachable(new Set(['spire', 'oratory', 'mooring', 'rise'])).has(first.id)
})
expect('the three wings open together and may be taken in any order', free.length === 3, free.join(', '))
for (const wing of wings) {
  const inWing = wingFights(wing)
  if (inWing.length === 0) {
    // Loud rather than quiet. A wing with nothing written in it counts as
    // done, which is the only thing that keeps the throne reachable while
    // half the building is an issue number — and it is exactly the kind of
    // rule that would go on being true after it stopped being right.
    console.log(`--    ${wing}: NOT CHECKED — no fight in it is written yet, so the wing counts as done`)
    continue
  }
  expect(
    `and ${wing} counts as done only when every fight in it is`,
    inWing.every((_, i) => !wingCleared(wing, new Set(inWing.slice(0, i).map((c) => c.id)))),
    'a wing said it was done with a fight still standing in it',
  )
}
// And the ones that were let off are let off for the one reason allowed.
//
// Not a tautology: `wingFights` calls a room empty both when it is waiting on
// an issue and when it names a fight the game does not have, and only the
// first of those is a reason to hand a wing over. A room pointing at an
// encounter index that is out of range would otherwise open the top of the
// building and say nothing.
const freeWings = wings.filter((wing) => wingFights(wing).length === 0)
const namedInFree = freeWings.flatMap((wing) =>
  CHAMBERS.filter((c) => c.wing === wing && c.encounter !== null).map(
    (c) => `${c.id} names ${c.encounter}`,
  ),
)
expect(
  'and a wing that is done for nothing names no fight at all',
  namedInFree.length === 0,
  namedInFree.join(', '),
)

// --- the rooms, as ground ----------------------------------------------------
//
// Standing in a room is how the citadel is crossed, so a room has to be a
// place a party can be in and get out of. Three things can be wrong with one
// and none of them fail at run time: a door nobody can tell from another, a
// room with no way out, and a party that arrives already standing in the
// doorway it came through — which would send it straight back where it came
// from before anybody had touched a key.

const everywhere = () => true
{
  const clashes: string[] = []
  const shut: string[] = []
  const doorstep: string[] = []
  for (const chamber of CHAMBERS) {
    const hall = hallFor(chamber.id, null, everywhere)
    if (hall.ways.length === 0) shut.push(chamber.id)
    for (let i = 0; i < hall.ways.length; i++) {
      for (let j = i + 1; j < hall.ways.length; j++) {
        const gap = dist(hall.ways[i]!.at, hall.ways[j]!.at)
        // Two doors closer than the reach that takes you through one are one
        // door, and which room you end up in is then a coin toss.
        if (gap < EXIT_REACH * 2) {
          clashes.push(`${chamber.id}: ${hall.ways[i]!.to} and ${hall.ways[j]!.to} are ${gap.toFixed(0)} apart`)
        }
      }
    }
    // And the same room entered from each of its own doors: the party has to
    // arrive clear of every one of them, the one it came in by included.
    for (const back of hall.ways) {
      const entered = hallFor(chamber.id, back.to, everywhere)
      for (const way of entered.ways) {
        if (dist(entered.entry, way.at) <= EXIT_REACH) {
          doorstep.push(`${chamber.id} from ${back.to} arrives on the ${way.to} door`)
        }
      }
    }
  }
  expect(`every room has a way out`, shut.length === 0, shut.join(', '))
  expect('and no two doors of one room are the same door', clashes.length === 0, clashes.join('; '))
  expect(
    'and a party arrives clear of every door in the room',
    doorstep.length === 0,
    doorstep.join('; '),
  )

  // The doors are the passages, both ways. A room with a door to somewhere
  // there is no passage would be a way through the building the map does not
  // know about, which is the one thing this file exists to make impossible.
  const invented: string[] = []
  for (const chamber of CHAMBERS) {
    for (const way of hallFor(chamber.id, null, everywhere).ways) {
      const joined = PASSAGES.some(
        (p) =>
          (p.from === chamber.id && p.to === way.to) || (p.to === chamber.id && p.from === way.to),
      )
      if (!joined) invented.push(`${chamber.id} -> ${way.to}`)
    }
  }
  expect('and every door is a passage the map has', invented.length === 0, invented.join(', '))

  // A room the caller will not let the party into has no door to it. The
  // predicate is how the chain reaches the floor, and a door drawn past it
  // would be the ladder walked round.
  const only = (to: string) => to !== 'oratory'
  const past = hallFor('spire', null, only).ways.map((w) => w.to)
  expect(
    'and a room the caller refuses has no door',
    !past.includes('oratory'),
    past.join(', '),
  )
}

// A party put in a room walks out of it, and out of the door it was heading
// for. Simulated rather than reasoned about: the walk is the whole way through
// the building now, and a room the raid cannot cross is a raid that cannot get
// past the front door. Unattended, so the AI leads — which is the case with
// the least help.
{
  const dps = pickFor('warrior', 'dps')!
  const stuck: string[] = []
  const wrong: string[] = []
  // Twenty-five, which is the size the door has to be wide enough for: going
  // through one is everybody being inside `EXIT_REACH` of it at the same
  // moment, and a raid five times as wide is where that stops being free.
  for (const chamber of CHAMBERS) {
    const hall = hallFor(chamber.id, null, everywhere)
    const s = unattended(createCorridorState(4242, autoParty(25, dps), hall, 'normal'))
    s.chamber = chamber.id
    const rng = new Rng(4242)
    let ticks = 0
    while (s.outcome === 'ongoing' && ticks < 30 * 60) {
      step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
      ticks++
    }
    if (s.outcome !== 'victory') {
      stuck.push(`${chamber.id} (${s.outcome} after ${(ticks / 30).toFixed(0)}s)`)
      continue
    }
    const through = s.travel?.through ?? null
    if (through === null || !hall.ways.some((w) => w.to === through)) {
      wrong.push(`${chamber.id} left by ${through ?? 'nothing'}`)
    }
  }
  expect(`a party can cross all ${CHAMBERS.length} rooms`, stuck.length === 0, stuck.join(', '))
  expect(
    'and comes out of one of that room\'s own doors',
    wrong.length === 0,
    wrong.join(', '),
  )
}

// --- one building, one floor -------------------------------------------------
//
// The rooms were separate places: each its own scene with its own origin, and
// a door was a trigger that threw one away and built the next. However that
// door was drawn it was a teleporter, and it was said so. So the citadel is
// assembled into one set of coordinates, and what has to be true of it is that
// the floor has no holes in it — every join walkable, end to end, without
// leaving the ground.
//
// None of that fails at run time. A hole in the floor is a party that cannot
// get to a boss, and the first anyone would know is a raid standing at a wall.
{
  const cells = citadelWorld()
  const onFloor = (p: { x: number; y: number }, r = 20): boolean =>
    cells.some((cell) => insideRoom(cell.room, p, r))

  const holes: string[] = []
  for (const passage of PASSAGES) {
    const a = placeOf(passage.from)
    const b = placeOf(passage.to)
    let broke = -1
    for (let i = 0; i <= 600; i++) {
      const t = i / 600
      if (!onFloor({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) {
        broke = t
        break
      }
    }
    if (broke >= 0) holes.push(`${passage.from}->${passage.to} at ${(broke * 100).toFixed(0)}%`)
  }
  expect(
    `all ${PASSAGES.length} joins are one continuous floor`,
    holes.length === 0,
    holes.join(', '),
  )

  // And a body of any size fits through, not just a point. A doorway a
  // twenty-five man raid cannot get through is a doorway.
  const narrow: string[] = []
  for (const passage of PASSAGES) {
    const a = placeOf(passage.from)
    const b = placeOf(passage.to)
    for (let i = 0; i <= 300; i++) {
      const t = i / 300
      const at = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      if (!onFloor(at, 60)) {
        narrow.push(`${passage.from}->${passage.to}`)
        break
      }
    }
  }
  expect('and wide enough for a body all the way', narrow.length === 0, narrow.join(', '))

  // Two rooms sharing floor would be two fights in one place — but two rooms
  // *touching* is what a building is, and the plan is measured now, so rooms
  // the source stands next to each other stand next to each other here. The
  // great hall's far end and the first fight's chamber overlap by thirteen
  // yards because they do; so do the dragon's hall and the bridge out of it.
  //
  // So the rule is the one that was actually meant. A chamber's middle is
  // where its fight happens and where its name is written, and no chamber's
  // middle may lie inside another. Rooms that no passage joins may not touch
  // at all: a wing bleeding into the wing beside it is a hole in the plan even
  // when neither middle has moved.
  const joined = new Set(PASSAGES.flatMap((p) => [`${p.from}/${p.to}`, `${p.to}/${p.from}`]))
  const swallowed: string[] = []
  const bled: string[] = []
  for (let i = 0; i < CHAMBERS.length; i++) {
    for (let j = i + 1; j < CHAMBERS.length; j++) {
      const a = CHAMBERS[i]!
      const b = CHAMBERS[j]!
      const pa = placeOf(a.id)
      const pb = placeOf(b.id)
      const d = dist(pa, pb)
      const ux = (pb.x - pa.x) / d
      const uy = (pb.y - pa.y) / d
      const ra = exitAlong(roomOf(a.id), ux, uy)
      const rb = exitAlong(roomOf(b.id), -ux, -uy)
      if (d < ra || d < rb) swallowed.push(`${a.id}/${b.id}`)
      else if (!joined.has(`${a.id}/${b.id}`) && d < support(roomOf(a.id), ux, uy) + support(roomOf(b.id), -ux, -uy)) {
        bled.push(`${a.id}/${b.id}`)
      }
    }
  }
  expect('and no room holds another room\u2019s middle', swallowed.length === 0, swallowed.join(', '))
  expect('and rooms nothing joins do not touch', bled.length === 0, bled.join(', '))

  // And the walk between them is the source's walk.
  //
  // This used to check that the building was no larger than the plan needed,
  // which was the right check for a plan of fractions stretched by one number
  // picked to stop rooms overlapping. The plan is in yards off the source now,
  // so there is no scale left to be too generous with — what is worth holding
  // instead is the bare floor, because bare floor between rooms is the whole
  // of what "the map feels enormous" was. It was 1611 yards of it.
  let bare = 0
  for (const passage of PASSAGES) {
    const a = placeOf(passage.from)
    const b = placeOf(passage.to)
    const d = dist(a, b)
    const ux = (b.x - a.x) / d
    const uy = (b.y - a.y) / d
    const gap = d - exitAlong(roomOf(passage.from), ux, uy) - exitAlong(roomOf(passage.to), -ux, -uy)
    bare += Math.max(0, gap)
  }
  expect(
    'and under a thousand yards of the citadel is bare corridor',
    bare / YARD < 1000,
    `${Math.round(bare / YARD)} yards`,
  )
}

// And a body on that floor is held by the building rather than by one room of
// it. This is the branch that turns a door from a trigger into a doorway: a
// party standing in one is inside the passage, not outside the room, so
// nothing pushes it back and nothing has to swap the world underneath it.
{
  const floor = citadelWorld().map((cell) => cell.room)
  const one = (pos: { x: number; y: number }) => {
    const party = autoParty(5, pickFor('warrior', 'dps')!)
    const s = unattended(createCorridorState(1, party, hallFor('crossing', null, () => true), 'normal'))
    s.floor = floor
    const body = s.actors.find((a) => a.faction === 'party')!
    body.pos = { ...pos }
    holdOrFall(s, body)
    return body.pos
  }

  // Standing in a doorway: the passage is floor, so nobody is moved.
  const held: string[] = []
  for (const passage of PASSAGES) {
    const a = placeOf(passage.from)
    const b = placeOf(passage.to)
    const doorway = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const after = one(doorway)
    if (dist(after, doorway) > 0.001) held.push(`${passage.from}->${passage.to}`)
  }
  expect('a body standing in a doorway is left where it is', held.length === 0, held.join(', '))

  // And well outside the building it is put back on the floor rather than
  // left in the dark.
  const far = one({ x: 90000, y: 90000 })
  expect(
    'and one off the building entirely is put back on it',
    citadelWorld().some((cell) => insideRoom(cell.room, far, 0)),
    `${Math.round(far.x)},${Math.round(far.y)}`,
  )
}

// A fight has to survive being put somewhere.
//
// The citadel holds its fights in the rooms the party walks into, which means
// a pull happens four kilometres from the origin instead of on it. Everything
// a fight places has to be placed from the room it is in rather than from the
// middle of the world — and three of them were not: the court of a fight with
// several bodies stood at fixed coordinates, an arc of ground was laid around
// the origin, and every add walked in through a door measured from it. Each
// put the whole thing in the wrong place, and none of them fails at run time:
// the fight simply happens somewhere the party is not.
//
// The window is short on purpose. A room four kilometres from the origin
// computes its distances with fewer bits to spare, and a simulation this
// deterministic turns the last of them into a different decision a minute
// later — so run the two long enough and they diverge for reasons that are
// arithmetic rather than placement, and the check starts measuring the wrong
// thing. A body placed from the middle of the world instead of the middle of
// its room is out by the whole offset on the tick it appears; float takes a
// minute to move anything by ten units.
{
  const off = { x: -4321, y: 987 }
  const misplaced: string[] = []
  for (let e = 0; e < ENCOUNTERS.length; e++) {
    const party = () => autoParty(10, pickFor('warrior', 'dps')!)
    const here = unattended(createState(0x51ed, 3, party(), 'heroic', e))
    const there = unattended(createState(0x51ed, 3, party(), 'heroic', e, null, off))
    const ra = new Rng(0x51ed)
    const rb = new Rng(0x51ed)
    let worst = 0
    let what = ''
    for (let t = 0; t < 30 * 25 && here.outcome === 'ongoing'; t++) {
      step(here, { moveX: 0, moveY: 0, pressed: [] }, ra)
      step(there, { moveX: 0, moveY: 0, pressed: [] }, rb)
      for (const one of here.actors) {
        const two = there.actors.find((x) => x.id === one.id)
        if (!two) continue
        const d = dist({ x: one.pos.x + off.x, y: one.pos.y + off.y }, two.pos)
        if (d > worst) {
          worst = d
          what = `${one.name}(${one.faction})`
        }
      }
      for (let i = 0; i < here.ground.length && i < there.ground.length; i++) {
        const g = here.ground[i]!
        const h = there.ground[i]!
        const d = dist({ x: g.pos.x + off.x, y: g.pos.y + off.y }, h.pos)
        if (d > worst) {
          worst = d
          what = `the ${g.kind} on the floor`
        }
      }
    }
    if (worst > 60) misplaced.push(`${ENCOUNTERS[e]!.name}: ${what} by ${Math.round(worst)}`)
  }
  expect(
    `all ${ENCOUNTERS.length} fights are placed from their own room`,
    misplaced.length === 0,
    misplaced.join('; '),
  )
}

// And going through a door moves nobody.
//
// This is the whole of what "walk there" means and the thing that was wrong
// however the door was drawn: the party reached a marker, the world was thrown
// away and rebuilt, and everybody was set down at the near end of the next
// piece — a few hundred units, instantly, which is a teleport whatever it is
// called. The rooms are in one set of coordinates now and the bodies are
// handed across rather than placed, so the ground under them changes and they
// do not.
//
// Measured rather than argued: walk a party out of a room, build whatever is
// through the door it took, and ask where everybody ended up.
{
  const dps = pickFor('warrior', 'dps')!
  const floor = citadelWorld().map((cell) => cell.room)
  const anywhere = () => true
  const jumped: string[] = []
  let worst = 0
  for (const from of ['threshold', 'spire', 'oratory', 'rise', 'crossing', 'vats', 'dream']) {
    const walking = unattended(
      createCorridorState(9, autoParty(10, dps), hallFor(from, null, anywhere), 'normal'),
    )
    walking.floor = floor
    const rng = new Rng(9)
    for (let t = 0; t < 30 * 140 && walking.outcome === 'ongoing'; t++) {
      step(walking, { moveX: 0, moveY: 0, pressed: [] }, rng)
    }
    const to = walking.travel?.through
    if (to === null || to === undefined) {
      jumped.push(`${from}: never reached a door`)
      continue
    }
    const left = walking.actors
      .filter((a) => a.faction === 'party')
      .map((a) => ({ x: a.pos.x, y: a.pos.y }))
    const ground = groundFor(from, to)
    const next = unattended(
      createCorridorState(
        9,
        autoParty(10, dps),
        ground ?? hallFor(to, from, anywhere),
        'normal',
        4,
        left,
      ),
    )
    const arrived = next.actors.filter((a) => a.faction === 'party')
    for (let i = 0; i < left.length; i++) {
      const moved = dist(left[i]!, arrived[i]!.pos)
      if (moved > worst) worst = moved
    }
  }
  expect(
    'going through a door moves nobody',
    jumped.length === 0 && worst < 0.001,
    jumped.length > 0 ? jumped.join('; ') : `somebody moved ${Math.round(worst)} units`,
  )
}

// One walk, not sixteen.
//
// The floor was continuous and the walking was not: reaching a doorway ended
// the walk, the world was rebuilt on the other side, and the party carried on
// in a new one. Continuous floor with a scene change every twenty seconds is
// still a building you cross by teleporting, which is what was said about it.
//
// A walk across the citadel has every pack in the building already standing
// where it stands, and does not end. Both of those are things that were wrong
// and are worth holding: the packs were pushed into whichever room the party
// happened to be in, so all fifty-two of them stood in the first doorway.
{
  const dps = pickFor('warrior', 'dps')!
  const anywhere = () => true
  const ground = {
    ...hallFor('threshold', null, anywhere),
    id: 'citadel',
    packs: citadelPacks(),
  }
  const s = unattended(
    createCorridorState(5, autoParty(10, dps), ground, 'normal', 4, undefined, true),
  )
  s.floor = citadelWorld().map((cell) => cell.room)
  s.chamber = 'threshold'

  expect(
    `the whole building's ${citadelPacks().length} packs are in the walk`,
    s.actors.filter((a) => a.faction === 'boss').length ===
      citadelPacks().reduce((n, pack) => n + pack.count, 0),
    `${s.actors.filter((a) => a.faction === 'boss').length} bodies`,
  )

  // Spread across it, not heaped where the party is standing.
  //
  // Measured against the party rather than against the entrance hall's middle,
  // which is what it was and stopped being true the day the way in got a
  // passage of its own: there is a pack fourteen hundred units up it now, on
  // purpose, and a check that reads any body within sixteen hundred of the
  // door as heaped reads the citadel's first pack as the bug it was written
  // to catch. What it is actually about is fifty-two bodies clamped onto one
  // doorway, and the shape of that is somebody standing on top of the party.
  const heaped = s.actors.filter(
    (a) =>
      a.faction === 'boss' &&
      s.actors.some((p) => p.faction === 'party' && dist(a.pos, p.pos) < 400),
  ).length
  expect('and standing where they were put, not where the party is', heaped === 0, `${heaped} on top of the party`)

  // And spread across the building rather than all in one stretch of it.
  const far = s.actors.filter((a) => a.faction === 'boss')
  const spread = Math.max(...far.map((a) => dist(a.pos, placeOf('threshold'))))
  expect('and spread over the whole of it', spread > CITADEL_REACH / 2, `${Math.round(spread)} units at the furthest`)

  const rng = new Rng(5)
  for (let t = 0; t < 30 * 120; t++) step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
  expect(
    'and two minutes of walking never ends the walk',
    s.outcome === 'ongoing' && s.travel?.through === null,
    `${s.outcome}, through ${s.travel?.through ?? 'nothing'}`,
  )
}

// A raid walking is a raid taking up room.
//
// Every one of them used to walk at whoever was leading and stop within sixty
// units of them, which for twenty-five people is a knot with three tokens
// visible and everybody else underneath. Walking is the one time nothing is
// aimed at them, so it is the one time they can afford the space — they walk
// to their own place in the formation instead, opened out and turned the way
// they are going.
{
  const dps = pickFor('warrior', 'dps')!
  const anywhere = () => true
  const tight: string[] = []
  for (const size of [5, 10, 25] as const) {
    const ground = { ...hallFor('threshold', null, anywhere), id: 'citadel', packs: citadelPacks() }
    const s = unattended(
      createCorridorState(5, autoParty(size, dps), ground, 'normal', 4, undefined, true),
    )
    s.floor = citadelWorld().map((cell) => cell.room)
    s.chamber = 'threshold'
    const rng = new Rng(5)
    for (let t = 0; t < 30 * 30; t++) step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
    const bodies = s.actors.filter((a) => a.faction === 'party' && a.alive)
    let closest = Infinity
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        closest = Math.min(closest, dist(bodies[i]!.pos, bodies[j]!.pos))
      }
    }
    // Off the body rather than off a number, because the body has since been
    // measured against the source's and halved. Standing closer than a body's
    // own width is standing inside somebody, which is what it looked like.
    if (closest < PARTY_RADIUS * 1.5) tight.push(`${size}-man: ${Math.round(closest)} apart`)
  }
  expect('a raid walking is not standing inside itself', tight.length === 0, tight.join(', '))
}

// A raid walking is not shaking its head.
//
// The sprite has four sides and the one a body is drawn from is the nearest to
// where it is facing, so a body sitting on a diagonal flips between two of
// them at the slightest wobble. Two things made that happen at once: nothing
// turned a body while it walked, so it faced wherever it happened to be facing
// when the walk began, and the view turned to keep the nearest door at the top
// of the screen, which swept every body across the joins between sides several
// times a room.
//
// A body faces the way it is walking now. What this counts is how often that
// crosses from one side to another over a walk — turning a corner is a couple;
// shaking is dozens.
{
  const dps = pickFor('warrior', 'dps')!
  const anywhere = () => true
  const sideOf = (facing: number): string => {
    const dx = Math.cos(facing)
    const dy = Math.sin(facing)
    return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'L' : 'R') : dy < 0 ? 'U' : 'D'
  }
  const ground = { ...hallFor('threshold', null, anywhere), id: 'citadel', packs: citadelPacks() }
  const s = unattended(
    createCorridorState(5, autoParty(10, dps), ground, 'normal', 4, undefined, true),
  )
  s.floor = citadelWorld().map((cell) => cell.room)
  s.chamber = 'threshold'
  // Walked, not stood. This measured a raid with nobody steering it, and a
  // leaderless raid in a building stays where it is — so for a while it was
  // counting how often a body that never moved changed the side it was drawn
  // from, which is never, and it passed while half the raid walked up the
  // building looking backwards at the camera.
  const rng = new Rng(5)
  const was = new Map<number, string>()
  const flips = new Map<number, number>()
  let backwards = 0
  let samples = 0
  for (let t = 0; t < 30 * 45; t++) {
    step(s, { moveX: 0, moveY: -1, pressed: [] }, rng)
    for (const a of s.actors) {
      if (a.faction !== 'party' || !a.alive) continue
      const now = sideOf(a.facing)
      const before = was.get(a.id)
      if (before !== undefined && before !== now) flips.set(a.id, (flips.get(a.id) ?? 0) + 1)
      was.set(a.id, now)
      samples++
      if (now === 'D') backwards++
    }
  }
  const worst = Math.max(0, ...flips.values())
  expect(
    'a body walking keeps the side it is drawn from',
    worst <= 10,
    `one of them turned ${worst} times in forty-five seconds`,
  )
  // And keeps the *right* side. A follower's station moves with the leader, so
  // it is forever a step past its place and the correcting step points
  // backwards; turned to that step, a column walks up the building facing the
  // camera. Counted rather than eyeballed, because the flip count above is
  // perfectly happy with a raid that faces the wrong way consistently.
  expect(
    'and it is the side it is walking towards',
    samples > 0 && backwards / samples < 0.1,
    `${((backwards / Math.max(1, samples)) * 100).toFixed(0)}% of the time facing the camera`,
  )
}

// --- the pads --------------------------------------------------------------

expect(
  `${CHAMBERS.filter((c) => c.pad).length} pads, one of them lit before anything is killed`,
  padsLit(new Set()).length === 1 && padsLit(new Set())[0]!.id === 'threshold',
  padsLit(new Set()).map((c) => c.id).join(', '),
)
expect(
  'and all of them lit by the end',
  padsLit(walk.cleared).length === CHAMBERS.filter((c) => c.pad).length,
  padsLit(walk.cleared).map((c) => c.id).join(', '),
)
const litEarly = CHAMBERS.filter((c) => c.pad && gateOpen(c.pad, new Set()) && c.id !== 'threshold')
expect('and none of them lit by walking past it', litEarly.length === 0, litEarly.map((c) => c.id).join(', '))

// Read off the chain rather than saved a second time: a boss is killed once
// the chain has moved past its first rung, and that is what clearing it does.
expect(
  'a fight nobody has cleared is not lit',
  clearedFrom(0).size === 0,
  [...clearedFrom(0)].join(', '),
)
expect(
  'and clearing the first rung of the first boss is what opens the second room',
  killedOnce(1, 0) && !killedOnce(1, 1) && !gateOpen({ kind: 'killed', chambers: ['spire'] }, clearedFrom(0)) &&
    gateOpen({ kind: 'killed', chambers: ['spire'] }, clearedFrom(1)),
  `${[...clearedFrom(1)].join(', ')}`,
)
expect(
  'and the chain and the map agree about how many fights there are',
  LADDER.length === ENCOUNTERS.length * RUNGS_PER_BOSS,
  `${LADDER.length} rungs against ${ENCOUNTERS.length} fights`,
)

// --- the corridors -----------------------------------------------------------
//
// A corridor is three numbers a room: where the packs stand, how far they
// notice, and where the two doors are. All three are ways to write a corridor
// that is not one — a stretch that can be jogged through, a pack standing
// inside a wall, or two packs that are one pack for anybody who walks between
// them. The last of those is the corridor's only decision, so it is counted
// rather than forbidden.
{
  const corridors = PASSAGES.filter((p) => p.corridor).map((p) => p.corridor!)
  expect(`${corridors.length} corridor(s) on the map`, corridors.length > 0)
  const jog = corridors.filter((c) => unguarded(c))
  expect(
    'none of them can be walked through without waking anything',
    jog.length === 0,
    jog.map((c) => c.id).join(', '),
  )
  const misplaced = corridors.filter((c) => !packsPlaced(c, []))
  expect(
    'and nothing is standing in a wall',
    misplaced.length === 0,
    misplaced.map((c) => c.id).join(', '),
  )
  const doors = corridors.filter(
    (c) =>
      c.ways.some((w) => dist(c.entry, w.at) < 400) ||
      c.packs.some((p) => dist(p.pos, c.entry) < p.pulls),
  )
  expect(
    'and the way in is not already inside something',
    doors.length === 0,
    doors.map((c) => c.id).join(', '),
  )
  const pairs = corridors.flatMap((c) => overlapping(c).map(() => c.id))
  expect(
    `and ${pairs.length} pack(s) can be pulled into each other, which is the decision`,
    pairs.length > 0,
    'no corridor asks anything of where you stand',
  )
}

// --- and walked -------------------------------------------------------------
//
// The rest of this file is arithmetic on data. This is the corridor actually
// run: a party with nobody steering it, from door to door, against what is
// standing in the way. What it proves is the three things a corridor has to do
// — the packs notice, they get killed, and the party ends up through the far
// door — and the one it must not: nobody walks out of the room.
{
  const dps = pickFor('mage', 'dps')!
  for (const passage of PASSAGES.filter((p) => p.corridor)) {
    const corridor = passage.corridor!
    const chamber = { name: `${passage.from} to ${passage.to}` }
    const s = unattended(createCorridorState(31337, autoParty(10, dps), corridor, 'normal'))
    const rng = new Rng(31337)
    let outside = 0
    let stuck = 0
    const lowest: Record<number, number> = {}
    while (s.outcome === 'ongoing' && s.time < 300) {
      step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
      for (const a of s.actors) {
        if (!a.alive) continue
        if (a.faction === 'party') lowest[a.id] = Math.min(lowest[a.id] ?? a.hp, a.hp)
        if (!insideRoom(s.room, a.pos, a.radius * 0.9)) outside++
        if (inTerrain(s.obstacles, a.pos, a.radius * 0.9)) stuck++
      }
    }
    expect(
      `${chamber.name}: a party with nobody steering it gets through`,
      s.outcome === 'victory',
      `${s.outcome} after ${s.time.toFixed(0)}s`,
    )
    expect(
      `${chamber.name}: and wakes every pack on the way`,
      s.travel?.woken.every(Boolean) === true,
      (s.travel?.woken ?? []).map((w) => (w ? 'woke' : 'slept')).join(', '),
    )
    expect(
      `${chamber.name}: and kills what it wakes`,
      s.actors.filter((a) => a.faction === 'boss' && a.alive).length === 0,
      `${s.actors.filter((a) => a.faction === 'boss' && a.alive).length} left standing`,
    )
    expect(`${chamber.name}: and nobody leaves the room`, outside === 0, `${outside} body-ticks outside`)
    expect(`${chamber.name}: and nobody is held in a wall`, stuck === 0, `${stuck} body-ticks in a rock`)
    // Measured at the worst moment rather than at the end, because the end is
    // after the breather: a corridor that hurt nobody at any point is scenery,
    // and one that hurt somebody and gave none of it back is a tax.
    expect(
      `${chamber.name}: and it costs something`,
      s.actors.some((a) => a.faction === 'party' && (lowest[a.id] ?? a.maxHp) < a.maxHp),
      'nobody was ever hurt in it',
    )
    expect(
      `${chamber.name}: and the walk out of it is a breather`,
      s.actors.some((a) => a.faction === 'party' && a.alive && a.hp > (lowest[a.id] ?? 0)),
      'nobody recovered anything on the way out',
    )
  }
}

// --- an evening in it --------------------------------------------------------
//
// The run holds four things and every one of them is a way to lose an evening
// if it is wrong: where the party is, what is dead, what it walked out of the
// last room with, and whether any of that survives being closed and reopened.
{
  // A stand-in for the browser's, so the save can be exercised at all. The
  // real one is refused in a private window and full on a phone, and the code
  // under test treats both as "no run", which is also what this proves.
  const store = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }

  const fresh = startRun(4242, 10, 'normal')
  expect('an evening starts at the door', fresh.at === DOOR && fresh.cleared.length === 0, fresh.at)
  expect(
    'and the only room it can walk into is the first fight',
    enterable(fresh).length === 1 && enterable(fresh)[0]!.id === 'spire',
    enterable(fresh).map((c) => c.id).join(', '),
  )

  const inSpire = enter(fresh, 'spire')
  expect('walking in moves the party and counts the room', inSpire.at === 'spire' && inSpire.entered === 1)
  expect('and walking somewhere shut does nothing', enter(fresh, 'throne').at === DOOR)

  // A wipe: the room stays alive, the evening does not restart, and the party
  // goes back to what it walked in with rather than to full.
  const hurt = wiped({ ...inSpire, carried: [0.1, 0.2, -1] }, [0.9, 0.8, 0.7])
  expect(
    'a wipe keeps the evening and gives back the way in',
    hurt.cleared.length === 0 && hurt.carried.join() === '0.9,0.8,0.7',
    hurt.carried.join(),
  )

  const won = cleared(inSpire, 'spire', [0.4, -1, 0.9])
  expect('a room won stays won', isCleared(won, 'spire') && won.cleared.length === 1)
  expect(
    'and what walked out of it is what walks into the next',
    won.carried.join() === '0.4,-1,0.9',
    won.carried.join(),
  )
  expect(
    'and the next room is open',
    enterable(won).some((c) => c.id === 'oratory'),
    enterable(won).map((c) => c.id).join(', '),
  )
  expect('and winning it twice does not count twice', cleared(won, 'spire', []).cleared.length === 1)

  // The same room in the same evening is the same fight; a different evening
  // is a different one.
  expect(
    'a room is the same fight all evening',
    roomSeed(won, 'spire') === roomSeed(fresh, 'spire') &&
      roomSeed(won, 'spire') !== roomSeed(won, 'oratory') &&
      roomSeed(startRun(99, 10, 'normal'), 'spire') !== roomSeed(fresh, 'spire'),
    'the seed does not hold still',
  )

  // Saved and reopened.
  save(won)
  const back = load()
  expect(
    'an evening survives being closed',
    back !== null && back.at === won.at && back.cleared.join() === won.cleared.join() &&
      back.carried.join() === won.carried.join() && back.size === 10,
    JSON.stringify(back),
  )
  save(null)
  expect('and stepping out of it leaves nobody standing in it', load() === null)

  // A save from another version: a room that no longer exists, and a party
  // standing somewhere the doors no longer reach.
  store.set('abyss.citadel', JSON.stringify({ ...won, at: 'the-old-name' }))
  expect('a save naming a room that is gone is no run at all', load() === null)
  store.set('abyss.citadel', JSON.stringify({ ...won, at: 'throne' }))
  const stranded = load()
  expect(
    'and a party standing behind a door that closed is put back at the door',
    stranded !== null && stranded.at === DOOR,
    JSON.stringify(stranded),
  )
  store.set('abyss.citadel', 'not json at all')
  expect('and a save that is not a save is no run at all', load() === null)
}

// --- and how it is crossed ---------------------------------------------------
//
// Three ways to get somewhere and one way not to. The pads are the only thing
// on the map that reaches further than a door, which is what they are for.
{
  const fresh = startRun(11, 10, 'normal')
  const from = ways(fresh)
  expect(
    'at the door, the only way on is the great hall',
    from.length === 1 && from[0]!.to === 'vigil',
    from.map((w) => `${w.to}:${w.step.kind}`).join(', '),
  )
  expect('and nothing two doors away answers', stepTo(fresh, 'mooring').kind === 'shut')

  // A door with ground behind it charges once.
  const held = { ...fresh, at: 'oratory', cleared: ['spire', 'oratory'] }
  const walk = stepTo(held, 'mooring')
  expect(
    'a door with ground behind it asks for the walk',
    walk.kind === 'walk' && walk.corridor.packs.length > 1,
    walk.kind,
  )
  const after = walk.kind === 'walk' ? walkedTo(held, walk.key, 'mooring', []) : held
  expect('and the party is through it afterwards', after.at === 'mooring')
  // Either a step or a pad, and never the walk again: what a corridor costs is
  // the price of getting there the first time.
  expect(
    'and it does not ask twice',
    ['step', 'jump'].includes(stepTo({ ...after, at: 'oratory' }, 'mooring').kind),
    stepTo({ ...after, at: 'oratory' }, 'mooring').kind,
  )

  // A pad reaches across the building, and only once it is lit.
  const deep = {
    ...fresh,
    at: 'rise',
    cleared: ['spire', 'oratory', 'mooring', 'rise'],
    visited: ['threshold', 'spire', 'oratory', 'mooring', 'rise'],
  }
  expect(
    'a lit pad reaches a room no door here opens onto',
    stepTo(deep, 'oratory').kind === 'jump' && stepTo(deep, 'threshold').kind === 'jump',
    `${stepTo(deep, 'oratory').kind} / ${stepTo(deep, 'threshold').kind}`,
  )
  expect(
    'and an unlit one does not',
    stepTo(fresh, 'rise').kind === 'shut',
    stepTo(fresh, 'rise').kind,
  )

  // And the evening remembers which ground it has taken.
  save(after)
  const back = load()
  expect(
    'the doors already taken survive being closed',
    back !== null && back.walked.join() === after.walked.join() && back.walked.length === 1,
    JSON.stringify(back?.walked),
  )
  save(null)
}

// Up is onward.
//
// The plan is traced off the raid's own printed map, which has the way in
// halfway down the left edge and the lower spire below it — so the building
// stood up straight off the plan had the party walking down the screen to the
// first fight, into three hundred units of hall, with the seven hundred and
// sixty the entrance hall is long stretching away behind them. Which way up a
// poster was drawn is a fact about the poster. The player presses up, and up
// has to be the way on.
{
  const anywhere = () => true
  // Every step of the lower spire, which is one straight line in the source
  // and had better be one here: the way in, the great hall, the first fight,
  // the second. Pressing up walks the whole of it.
  const backwards: string[] = []
  const climb = ['threshold', 'vigil', 'spire', 'oratory']
  for (let i = 0; i < climb.length - 1; i++) {
    const here = climb[i]!
    const next = climb[i + 1]!
    const hall = hallFor(here, i === 0 ? null : climb[i - 1]!, anywhere)
    const way = hall.ways.find((w) => w.to === next)
    if (!way || way.at.y >= placeOf(here).y - 100) backwards.push(`${here} -> ${next}`)
  }
  expect('the lower spire is walked up the screen, end to end', backwards.length === 0, backwards.join(', '))

  const first = hallFor('threshold', null, anywhere)
  const out = first.ways.find((w) => w.to === 'vigil')
  // And they start below it rather than in the middle of the map, which is
  // where a fresh evening used to put them: the origin of a world whose rooms
  // are all somewhere else, clamped into whichever corner was nearest.
  expect(
    'and a fresh evening starts below the way on, in the room',
    out !== undefined && first.entry.y > out.at.y && insideRoom(first.room, first.entry, 40),
    `entry ${Math.round(first.entry.y)}, door ${Math.round(out?.at.y ?? 0)}`,
  )

  // The lower spire's rooms, in yards, against the plan of the floor they are
  // on — which is calibrated against a distance written down in the source's
  // own scripts, so these are measurements and not proportions.
  const yd = (units: number) => units / YARD
  const said: string[] = []
  const across = (id: string): [number, number] => {
    const r = roomOf(id)
    return r.kind === 'hall' ? [r.halfWidth * 2, r.front + r.back] : [r.radius * 2, r.radius * 2]
  }
  //
  // All seventeen, because every one of them has been measured now and a table
  // that stops at the lower spire is a table that lets the rest drift. The
  // sources are the client's own map tiles — each carries the world rectangle
  // it covers, so a pixel converts to yards exactly — and the instance's
  // scripts and area triggers where those name a room's walls.
  for (const [id, w, d] of [
    ['threshold', 26.0, 68.0],
    ['vigil', 160.0, 187.0],
    ['spire', 118.0, 118.0],
    ['oratory', 116.0, 116.0],
    ['mooring', 178.0, 178.0],
    ['rise', 78.0, 78.0],
    ['crossing', 244.0, 244.0],
    ['vats', 75.0, 166.0],
    ['airless', 103.0, 103.0],
    ['sludge', 100.0, 100.0],
    ['laboratory', 89.0, 124.0],
    ['crimson', 230.0, 160.0],
    ['sanctum', 77.0, 77.0],
    ['dream', 124.0, 124.0],
    ['gauntlet', 23.0, 85.0],
    ['lair', 126.0, 126.0],
    ['throne', 140.0, 140.0],
  ] as const) {
    const [gw, gd] = across(id)
    if (Math.abs(yd(gw) - w) > w * 0.06) said.push(`${id} is ${yd(gw).toFixed(0)} yd wide, not ${w}`)
    if (Math.abs(yd(gd) - d) > d * 0.06) said.push(`${id} is ${yd(gd).toFixed(0)} yd deep, not ${d}`)
  }
  expect('every room is the size the source says it is', said.length === 0, said.join('; '))
}

// The way in is held by somebody still arriving.
//
// Two packs standing in the passage the way every other one has them, and
// behind them a doorway that keeps sending watchmen back down it at the party.
// The three things worth holding: they appear, they walk *out* of the passage
// rather than at whoever is nearest, and walking into the passage turns it off
// for good. A stream you can turn off by standing still would be a wave, and a
// wave measures at nothing.
{
  const dps = pickFor('warrior', 'dps')!
  const anywhere = () => true
  const springs = citadelSprings()
  expect('the way in has a passage that keeps sending bodies out', springs.length === 1, `${springs.length} springs`)

  const spring = springs[0]!
  const inHall = insideRoom({ ...roomOf('vigil'), at: placeOf('vigil') }, spring.toward, 60)
  expect(
    'and where it sends them is out of the passage and into the great hall',
    inHall,
    `${Math.round(spring.toward.x)}, ${Math.round(spring.toward.y)}`,
  )

  // Started in the great hall rather than on the doorstep. The hall is where a
  // raid gathers and it is the room the passage empties into; a party still in
  // the little round chamber at the top of the shaft is a room away from all
  // of this and the passage has not noticed them.
  const build = () => {
    const ground = {
      ...hallFor('vigil', 'threshold', anywhere),
      id: 'citadel',
      packs: citadelPacks(),
      springs: citadelSprings(),
    }
    const s = unattended(
      createCorridorState(5, autoParty(10, dps), ground, 'normal', 4, undefined, true),
    )
    s.floor = citadelWorld().map((cell) => cell.room)
    s.chamber = 'vigil'
    return s
  }

  // Standing in the hall doing nothing. They come.
  const held = build()
  const before = held.actors.filter((a) => a.faction === 'boss').length
  const rng = new Rng(5)
  for (let t = 0; t < 30 * 40; t++) step(held, { moveX: 0, moveY: 0, pressed: [] }, rng)
  const made = held.actors.filter((a) => a.faction === 'boss').length - before
  expect('and standing in the hall does not stop it', made > 0, `${made} came out in forty seconds`)

  // But never more than the cap: a rate, not a bill.
  const mine = citadelPacks().length
  const up = held.actors.filter((a) => a.alive && held.travel!.belongs[a.id] === mine).length
  expect('and no more of them are up at once than it is allowed', up <= spring.most, `${up} up, ${spring.most} allowed`)

  // And they walk out of it: the furthest any of them got from the doorway is
  // most of the way to where it was sending them.
  const out = held.actors.filter((a) => held.travel!.belongs[a.id] === mine)
  const reached = Math.max(0, ...out.map((a) => dist(spring.at, a.pos)))
  const trip = dist(spring.at, spring.toward)
  expect(
    'and they walk out toward the way the party came in by',
    reached > trip * 0.5,
    `${Math.round(reached)} of ${Math.round(trip)} units`,
  )

  // Walk into the passage and it is over. Carried by hand rather than steered,
  // because what is being measured is the rule and not the pathfinding.
  const walked = build()
  for (const a of walked.actors) {
    if (a.faction !== 'party') continue
    a.pos.x = spring.at.x
    a.pos.y = spring.at.y + spring.stops - 40
    a.prevPos.x = a.pos.x
    a.prevPos.y = a.pos.y
  }
  const rng2 = new Rng(5)
  for (let t = 0; t < 30 * 2; t++) step(walked, { moveX: 0, moveY: 0, pressed: [] }, rng2)
  const stopped = walked.travel!.springing[0]!.done
  const sealed = walked.actors.filter((a) => a.faction === 'boss').length
  for (let t = 0; t < 30 * 40; t++) step(walked, { moveX: 0, moveY: 0, pressed: [] }, rng2)
  expect(
    'and walking into the passage turns it off for good',
    stopped && walked.actors.filter((a) => a.faction === 'boss').length <= sealed,
    `${stopped ? 'stopped' : 'still running'}, ${walked.actors.filter((a) => a.faction === 'boss').length} from ${sealed}`,
  )
}

// A raid walking is not walking at a door.
//
// The formation used to be turned by whichever way out the player was nearest
// and, with nobody steering, the whole raid set off for it. Both are the same
// mistake: the citadel is not somewhere the party is trying to get to, so a
// point on a wall is not a thing to arrange twenty-five people around. Left
// alone in a room with six doors off it, a raid stays where it is.
{
  const dps = pickFor('warrior', 'dps')!
  const anywhere = () => true
  const ground = { ...hallFor('crossing', null, anywhere), id: 'citadel', packs: citadelPacks() }
  const s = unattended(
    createCorridorState(5, autoParty(25, dps), ground, 'normal', 4, undefined, true),
  )
  s.floor = citadelWorld().map((cell) => cell.room)
  s.chamber = 'crossing'
  const doors = s.travel!.corridor.ways
  const middle = (): { x: number; y: number } => {
    const bodies = s.actors.filter((a) => a.faction === 'party' && a.alive)
    return {
      x: bodies.reduce((n, a) => n + a.pos.x, 0) / bodies.length,
      y: bodies.reduce((n, a) => n + a.pos.y, 0) / bodies.length,
    }
  }
  const from = middle()
  const rng = new Rng(5)
  for (let t = 0; t < 30 * 60; t++) step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
  const to = middle()
  // The middle of the raid, not the nearest body to a door. Twenty-five people
  // opened out in a room four hundred across put somebody near the wall by
  // arithmetic, and the wall is where the doors are — measuring that would be
  // measuring the formation's width and calling it an intention. What a raid
  // walking at a door looks like is the whole raid arriving somewhere.
  const drift = dist(from, to)
  let toward = Infinity
  for (const door of doors) toward = Math.min(toward, dist(to, door.at) - dist(from, door.at))
  expect(
    `a leaderless raid stays put in a room with ${doors.length} doors off it`,
    drift < 250 && toward > -250,
    `the raid moved ${Math.round(drift)} units, ${Math.round(-toward)} of it at a door`,
  )
}

// A shut way is ground that is not there.
//
// The citadel is one continuous floor, which is the point of it and is also
// what made every gate on the map decorative: a door held shut was a door
// missing from a list of ways out, and a list is not a wall. The floor ran
// through the opening either way, so a party could walk from the entrance
// past the first fight and keep going. What holds a door shut now is that the
// ground behind it has not been laid — the party is stopped at the wall of the
// room they are in, and the ground appears when the thing holding it is down.
//
// Walked rather than asserted about the graph. `reachable` already answers the
// graph's question, and the graph agreeing with itself would prove nothing:
// what is being checked is that the *floor* says the same thing, which is a
// claim about geometry and is where a passage laid across a room it does not
// join would show up.
{
  const STEP = 70
  const BODY = 40
  const walkableFrom = (start: string, cleared: ReadonlySet<string>): Set<string> => {
    const cells = citadelWorld(cleared).map((cell) => cell.room)
    const stands = (p: { x: number; y: number }): boolean =>
      cells.some((cell) => insideRoom(cell, p, BODY))
    const key = (x: number, y: number): string => `${x},${y}`
    const at = placeOf(start)
    const x0 = Math.round(at.x / STEP)
    const y0 = Math.round(at.y / STEP)
    const seen = new Set<string>([key(x0, y0)])
    const queue: Array<[number, number]> = [[x0, y0]]
    // A ceiling on the flood rather than a trust in it terminating: this walks
    // a sixteen-thousand-unit building and a bug in `stands` is an infinite
    // one.
    let budget = 200000
    while (queue.length > 0 && budget-- > 0) {
      const [x, y] = queue.shift()!
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx
        const ny = y + dy
        const k = key(nx, ny)
        if (seen.has(k)) continue
        if (!stands({ x: nx * STEP, y: ny * STEP })) continue
        seen.add(k)
        queue.push([nx, ny])
      }
    }
    const got = new Set<string>()
    for (const k of seen) {
      const [x, y] = k.split(',').map(Number) as [number, number]
      const p = { x: x * STEP, y: y * STEP }
      for (const c of CHAMBERS) {
        if (insideRoom({ ...roomOf(c.id), at: placeOf(c.id) }, p, 0)) got.add(c.id)
      }
    }
    return got
  }

  // Night one: nothing is dead, so the walk ends at the first fight.
  const fresh = walkableFrom('threshold', new Set())
  expect(
    'on the first night the floor reaches the first fight',
    fresh.has('threshold') && fresh.has('spire'),
    [...fresh].sort().join(', '),
  )
  expect(
    'and stops there — the way past it is not ground yet',
    !fresh.has('oratory') && !fresh.has('crossing'),
    [...fresh].sort().join(', '),
  )

  // And the floor says exactly what the map says, room for room, at every
  // stage of an evening. Either one drifting from the other is a wall the
  // player can see through or a door that opens onto nothing.
  const drift: string[] = []
  const stages: Array<[string, string[]]> = [
    ['nothing dead', []],
    ['the first down', ['spire']],
    ['the lower spire done', ['spire', 'oratory', 'mooring', 'rise']],
    ['a wing in', ['spire', 'oratory', 'mooring', 'rise', 'sludge', 'airless']],
  ]
  for (const [name, dead] of stages) {
    const cleared = new Set(dead)
    const floor = walkableFrom('threshold', cleared)
    const map = reachable(cleared)
    const extra = [...floor].filter((id) => !map.has(id))
    const missing = [...map].filter((id) => !floor.has(id))
    if (extra.length > 0 || missing.length > 0) {
      drift.push(`${name}: floor has ${extra.join('/') || 'nothing'} extra, ${missing.join('/') || 'nothing'} missing`)
    }
  }
  expect('and the floor and the map agree at every stage', drift.length === 0, drift.join('; '))

  // Killing the thing lays the ground. Stated on its own because it is the
  // half a player feels: the wall they were stopped by is a way through now.
  const after = walkableFrom('threshold', new Set(['spire']))
  expect(
    'and putting it down lays the ground behind it',
    after.has('oratory'),
    [...after].sort().join(', '),
  )
}

// And the room a fight is in is the whole of the floor while it lasts.
//
// The other half of the same hole. Blocking the way onward stops a party
// walking past a boss; it does not stop them walking *away* from one, and
// with the citadel's whole floor underfoot during a fight — which is what a
// fight inherited, because the walk needs it and nobody switched it off — a
// player could step out of the boss's door and stand in the corridor while
// the raid fought it. The mechanics are clamped to the room, so out there
// nothing could reach them.
//
// What `enterRoom` hands a fight is its own room and nothing else. This walks
// each built fight into every wall it has at full speed.
{
  const dps = pickFor('warrior', 'dps')!
  const escaped: string[] = []
  for (const chamber of CHAMBERS) {
    if (!standing(chamber.id)) continue
    for (const [dx, dy] of [[0, -1], [0, 1], [1, 0], [-1, 0], [0.7, 0.7], [-0.7, -0.7]] as const) {
      const s = unattended(
        createState(11, 1, autoParty(10, dps), 'normal', chamber.encounter!, null, placeOf(chamber.id)),
      )
      s.floor = [s.room]
      s.countdown = 0
      const rng = new Rng(11)
      const me = s.actors.find((a) => a.faction === 'party')!
      me.isPlayer = true
      for (let t = 0; t < 30 * 20 && s.outcome === 'ongoing'; t++) {
        step(s, { moveX: dx, moveY: dy, pressed: [] }, rng)
        if (!me.alive) break
        if (!insideRoom(s.room, me.pos, 0)) {
          escaped.push(`${chamber.id} out the ${dx},${dy} side`)
          break
        }
      }
    }
  }
  expect('nobody walks out of a fight while it is on', escaped.length === 0, escaped.join(', '))
}

// The chain does not hold a door.
//
// Two ways of opening things met in the frame loop and one of them won
// quietly. The progression chain runs a boss's six settings — five normal,
// five heroic, ten, ten heroic, twenty-five, twenty-five heroic — before it
// reaches the next boss at all, and the walk asked it as well as asking the
// building. So the citadel's second room did not open until its first had been
// cleared six times: kill the thing in the way and the way was still shut.
//
// The rule lives in `wayOpen` now, which is here rather than in the frame
// loop, and that is half of the fix — the branch that broke this was in a file
// no check imports.
{
  const start = startRun(4242, 5, 'normal')
  const fresh = { ...start, at: 'spire', cleared: ['spire'], visited: ['threshold', 'spire'] }
  expect(
    'killing the first thing opens the way to the second',
    wayOpen(fresh, 'oratory'),
    stepTo(fresh, 'oratory').kind,
  )
  // And the chain has emphatically not reached it, which is the whole point:
  // if this ever comes back true the check above stops meaning anything.
  expect(
    'and it opens while the chain is still five rungs short of it',
    !isOpen(FIRST_TIER + 1, chamberAt('oratory')!.encounter!, 5, 'normal'),
    `chain rung ${FIRST_TIER + 1}, oratory at ${tierOf(chamberAt('oratory')!.encounter!, 5, 'normal')}`,
  )
  // Every room of the lower spire in turn, since the chain would have held
  // each of them.
  const chain: string[] = []
  const order = ['spire', 'oratory', 'mooring', 'rise']
  for (let i = 0; i < order.length - 1; i++) {
    const at = order[i]!
    const next = order[i + 1]!
    const run = {
      ...start,
      at,
      cleared: order.slice(0, i + 1),
      visited: ['threshold', ...order.slice(0, i + 1)],
    }
    if (!wayOpen(run, next)) chain.push(`${at} -> ${next}`)
  }
  expect('and so does every room of the lower spire', chain.length === 0, chain.join(', '))
}

// And a kill opens one rung, not the gap to wherever it landed.
//
// The other side of the same change. Reaching the second boss no longer means
// having earned its place on the chain, so a kill can land far ahead of where
// the chain is — and `tier + 1` would have handed over everything in between:
// beat the second boss with five people on normal and the first one would open
// at twenty-five heroic, which nothing that evening said anything about.
{
  const jumped: string[] = []
  for (let unlocked = 0; unlocked < LADDER.length; unlocked++) {
    for (const tier of LADDER) {
      const after = clearedTier(unlocked, tier.encounter, tier.size, tier.difficulty)
      if (after > unlocked + 1) jumped.push(`${unlocked} -> ${after}`)
      if (after < unlocked) jumped.push(`${unlocked} -> ${after} (backwards)`)
    }
  }
  expect('a kill opens one rung and never two', jumped.length === 0, jumped.slice(0, 4).join(', '))
  // And the ordinary climb still climbs: six kills at six settings walks the
  // first boss's whole ladder.
  let unlocked = FIRST_TIER
  for (let i = 0; i < RUNGS_PER_BOSS; i++) {
    const rung = LADDER[i]!
    unlocked = clearedTier(unlocked, rung.encounter, rung.size, rung.difficulty)
  }
  expect(
    `and ${RUNGS_PER_BOSS} kills walk the first boss's ladder`,
    unlocked === RUNGS_PER_BOSS,
    `${unlocked}`,
  )
}

// The building is a place you are saved to, not a session you can restart.
//
// It was one evening at a time with a button to throw it away, and that makes
// every fight in it optional: walk in, wipe, give up, walk in again with
// everything back up. Nothing cost anything, so nothing was a decision — and
// an order with three wings taken in any order is a decision the game was
// declining to charge for.
//
// The source's rule instead. A lock a week; four settings are four separate
// buildings; what you kill stays dead until the lock turns over; and you are
// bound to one the moment something in it dies, not before.
{
  const store = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }

  // A Wednesday, and the same hour a week on. Written as instants rather than
  // taken off the clock, or this check would pass or fail by the day it ran.
  const week = 7 * 24 * 60 * 60 * 1000
  const monday = Date.UTC(2026, 8, 7, 12)
  const thursday = Date.UTC(2026, 8, 10, 12)
  const nextWeek = monday + week
  expect(
    'a week is one lock and the Wednesday in it turns it over',
    lockAt(monday) === lockAt(monday + 60_000) &&
      lockAt(thursday) === lockAt(monday) + 1 &&
      lockAt(nextWeek) === lockAt(monday) + 1,
    `${lockAt(monday)} / ${lockAt(thursday)} / ${lockAt(nextWeek)}`,
  )
  expect(
    'and the lock says when it turns over',
    resetsAt(lockAt(monday)) > monday && resetsAt(lockAt(monday)) <= monday + week,
    `${(resetsAt(lockAt(monday)) - monday) / (60 * 60 * 1000)} hours`,
  )

  // What is killed stays killed, and only for this lock.
  store.clear()
  const ten = cleared(startRun(1, 10, 'normal'), 'spire', [])
  save(ten, monday)
  expect(
    'what is dead in an instance is still dead when you come back to it',
    load(monday)?.cleared.join() === 'spire',
    JSON.stringify(load(monday)?.cleared),
  )
  expect(
    'and it is standing again on the other side of the reset',
    load(thursday) === null && instanceAt(10, 'normal', thursday) === null,
    JSON.stringify(load(thursday)),
  )

  // Four settings, four buildings.
  store.clear()
  save(cleared(startRun(1, 10, 'normal'), 'spire', []), monday)
  save(startRun(2, 25, 'heroic'), monday)
  expect(
    'four settings are four separate instances',
    instanceAt(10, 'normal', monday)?.cleared.join() === 'spire' &&
      instanceAt(25, 'heroic', monday)?.cleared.length === 0 &&
      instanceAt(5, 'normal', monday) === null,
    instances(monday).map((r) => `${r.size}${r.difficulty[0]}:${r.cleared.length}`).join(', '),
  )

  // Bound by the first kill and not before.
  store.clear()
  const looked = startRun(3, 10, 'normal')
  expect('an instance nobody has killed anything in is not saved', !isSaved(looked))
  save(looked, monday)
  abandon(looked, monday)
  expect(
    'and giving that one up leaves nothing behind',
    instanceAt(10, 'normal', monday) === null,
    JSON.stringify(instanceAt(10, 'normal', monday)),
  )
  const bound = cleared(looked, 'spire', [])
  expect('one with something dead in it is saved', isSaved(bound))
  save(bound, monday)
  abandon(bound, monday)
  expect(
    'and giving that one up only walks out of the door',
    load(monday) === null && instanceAt(10, 'normal', monday)?.cleared.join() === 'spire',
    JSON.stringify(instanceAt(10, 'normal', monday)),
  )

  // And a save from before there were instances is somebody's evening, not
  // rubbish to be swept up: it belongs to the setting it was played at.
  store.clear()
  store.set('abyss.citadel', JSON.stringify(cleared(startRun(4, 25, 'normal'), 'spire', [])))
  expect(
    'a save from before the lock keeps its evening, at its own setting',
    instanceAt(25, 'normal', monday)?.cleared.join() === 'spire' &&
      instanceAt(10, 'normal', monday) === null,
    JSON.stringify(instances(monday).map((r) => r.size)),
  )
  store.clear()
}

// The scale, in the unit the source is written in.
//
// A yard is however many units a body's own width says it is: a character
// measures 0.95 across by the game's own model geometry and eighteen units
// here. That is the only length in this game taken off the source's data
// rather than off a picture, which is why it is the one the scale hangs on —
// and read at it the fights land where they should, a spread mark at five and
// a half yards and a soak at seven.
//
// It used to hang on the first fight's floor instead, called ninety-four and a
// half yards. That number came off a plan calibrated against the wrong sheet;
// the floor measures a hundred and eighteen.
//
// Three things were not built to it, and they are the three a player sees
// against each other. Every number on the right is measured: a character's
// model geometry is 0.95 yards across and Marrowgar's is 9.69, off the game's
// own model data; melee reach is five yards; a character runs seven a second.
{
  const yd = (units: number) => units / YARD
  const said: string[] = []
  const near = (what: string, got: number, want: number, slack: number) => {
    if (Math.abs(got - want) > slack) said.push(`${what}: ${got.toFixed(2)} yd, wanted ${want}`)
  }
  near('a body is as wide as a character', yd(PARTY_RADIUS * 2), 0.95, 0.12)
  near('a boss is as wide as one', yd(BOSS_WIDTH), 9.69, 1.0)
  near('melee reach past an edge', yd(MELEE_RANGE), 5.0, 0.6)
  const speeds = Object.values(CLASSES).map((c) => c.moveSpeed)
  near('the slowest runs', yd(Math.min(...speeds)), 7.0, 0.8)
  near('the fastest runs', yd(Math.max(...speeds)), 7.0, 0.8)
  expect('the body, the boss, the reach and the pace are the source\'s', said.length === 0, said.join('; '))

  // And the ratios those produce, which are what is actually looked at.
  //
  // A hundred and twenty-four bodies across, not a hundred: the floor used to
  // be ninety-four and a half yards because that number *defined* the yard,
  // and it is a hundred and eighteen now that the yard is defined by a body
  // and the floor is measured off the client's own map tile.
  const room = ARENA_RADIUS * 2
  expect(
    'so the first fight\'s floor is a hundred and twenty bodies across, as it is there',
    room / (PARTY_RADIUS * 2) > 115 && room / (PARTY_RADIUS * 2) < 132,
    `${(room / (PARTY_RADIUS * 2)).toFixed(0)} bodies`,
  )
  expect(
    'and a boss is ten of them, as it is there',
    BOSS_WIDTH / (PARTY_RADIUS * 2) > 9 && BOSS_WIDTH / (PARTY_RADIUS * 2) < 11.5,
    `${(BOSS_WIDTH / (PARTY_RADIUS * 2)).toFixed(1)} bodies`,
  )
  // The classes still differ from each other by a tenth, which is a fact about
  // the classes and not about the scale.
  expect(
    'and the classes are still a tenth apart end to end',
    Math.max(...speeds) / Math.min(...speeds) < 1.2,
    `${(Math.max(...speeds) / Math.min(...speeds)).toFixed(3)}`,
  )
}

// A door has ground behind it.
//
// Doors and passages were placed by two different rules and nobody had put
// them side by side. A passage is laid along the line between two rooms'
// middles and starts where that line leaves the room; a door was placed by
// walking a long way out along a bearing and clamping each axis, which for a
// shallow bearing in a hall lands in the *corner*. From the second fight's
// room, the door to the airship sat thirteen hundred units off the mouth of
// the passage it opens onto — a party that walked to it found four fifths of
// the way to the next room with nothing to stand on.
//
// So: every door on the map, and the ground between it and the room it opens
// onto, walked with a body's width.
{
  const cells = citadelWorld().map((cell) => cell.room)
  const stands = (p: { x: number; y: number }) => cells.some((c) => insideRoom(c, p, 40))
  const dry: string[] = []
  for (const passage of PASSAGES) {
    for (const [from, to] of [
      [passage.from, passage.to],
      [passage.to, passage.from],
    ] as const) {
      const door = hallFor(from, null, () => true).ways.find((w) => w.to === to)
      if (!door) {
        dry.push(`${from} has no door to ${to}`)
        continue
      }
      const goal = placeOf(to)
      for (let i = 0; i <= 40; i++) {
        const t = i / 40
        const at = { x: door.at.x + (goal.x - door.at.x) * t, y: door.at.y + (goal.y - door.at.y) * t }
        if (!stands(at)) {
          dry.push(`${from} -> ${to} at ${(t * 100).toFixed(0)}%`)
          break
        }
      }
    }
  }
  expect('every door has ground between it and the room it opens onto', dry.length === 0, dry.join(', '))
}

if (failures > 0) {
  console.error(`dungeoncheck: ${failures} check(s) failed`)
  process.exit(1)
}
const built = CHAMBERS.filter((c: Chamber) => c.encounter !== null).length
console.log(
  `dungeoncheck: ${CHAMBERS.length} rooms, ${PASSAGES.length} passages, ${built} of ${fights.length} fights built`,
)
