import {
  CHAMBERS,
  PASSAGES,
  chamberAt,
  clearedFrom,
  gateOpen,
  killedOnce,
  padsLit,
  citadelPacks,
  citadelWorld,
  groundFor,
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
import { LADDER, RUNGS_PER_BOSS } from '../src/progress'
import { EXIT_REACH, overlapping, packsPlaced, unguarded } from '../src/sim/travel'
import { dist, holdOrFall } from '../src/sim/combat'
import { createCorridorState, createState, unattended } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { Rng } from '../src/sim/rng'
import { autoParty, pickFor } from '../src/sim/classes'
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
  walkedTo,
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

  // Two rooms sharing floor would be two fights in one place. Joined or not,
  // a chamber keeps its own ground; the passages are what overlap, on purpose.
  const shared: string[] = []
  for (let i = 0; i < CHAMBERS.length; i++) {
    for (let j = i + 1; j < CHAMBERS.length; j++) {
      const a = CHAMBERS[i]!
      const b = CHAMBERS[j]!
      const pa = placeOf(a.id)
      const pb = placeOf(b.id)
      const d = dist(pa, pb)
      const ux = (pb.x - pa.x) / d
      const uy = (pb.y - pa.y) / d
      if (d < support(roomOf(a.id), ux, uy) + support(roomOf(b.id), -ux, -uy)) {
        shared.push(`${a.id}/${b.id}`)
      }
    }
  }
  expect('and no two rooms stand in each other', shared.length === 0, shared.join(', '))
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
  const start = placeOf('threshold')
  const heaped = s.actors.filter(
    (a) => a.faction === 'boss' && dist(a.pos, start) < 1600,
  ).length
  expect('and standing where they were put, not where the party is', heaped === 0, `${heaped} in the doorway`)

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
    // A body is forty across. Standing closer than that is standing inside
    // somebody, which is what it looked like.
    if (closest < 20) tight.push(`${size}-man: ${Math.round(closest)} apart`)
  }
  expect('a raid walking is not standing inside itself', tight.length === 0, tight.join(', '))
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
  expect('and giving up on it leaves nothing behind', load() === null)

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
    'at the door, the only way on is the first room',
    from.length === 1 && from[0]!.to === 'spire',
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

if (failures > 0) {
  console.error(`dungeoncheck: ${failures} check(s) failed`)
  process.exit(1)
}
const built = CHAMBERS.filter((c: Chamber) => c.encounter !== null).length
console.log(
  `dungeoncheck: ${CHAMBERS.length} rooms, ${PASSAGES.length} passages, ${built} of ${fights.length} fights built`,
)
