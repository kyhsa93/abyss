import {
  CHAMBERS,
  PASSAGES,
  chamberAt,
  clearedFrom,
  gateOpen,
  killedOnce,
  padsLit,
  reachable,
  wingCleared,
  type Chamber,
} from '../src/dungeon'
import { ENCOUNTERS } from '../src/sim/encounters'
import { LADDER, RUNGS_PER_BOSS } from '../src/progress'
import { overlapping, packsPlaced, unguarded } from '../src/sim/travel'
import { dist } from '../src/sim/combat'
import { createCorridorState, unattended } from '../src/sim/state'
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
  order('spire') < order('oratory') && order('oratory') < order('rampart') && order('rampart') < order('rise'),
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
expect('and the throne is last of all', order('throne') === walk.order.length - 1, walk.order.join(' -> '))

// The one that matters: there is no way to the top that skips a wing. Asked by
// clearing every fight except one and checking the throne stays shut, for each
// fight in turn.
const skips: string[] = []
for (const missed of fights) {
  const cleared = new Set(fights.filter((c) => c.id !== missed.id).map((c) => c.id))
  if (missed.id === 'throne') continue
  if (reachable(cleared).has('throne') && ['plague', 'crimson', 'frostwing'].includes(missed.wing)) {
    skips.push(`without ${missed.id}`)
  }
}
expect('and no wing can be skipped on the way to the top', skips.length === 0, skips.join(', '))

// The three wings in any order, which is the only choice the map offers.
const wings: Array<'plague' | 'crimson' | 'frostwing'> = ['plague', 'crimson', 'frostwing']
const free = wings.filter((wing) => {
  const first = CHAMBERS.find((c) => c.wing === wing)!
  return reachable(new Set(['spire', 'oratory', 'rampart', 'rise'])).has(first.id)
})
expect('the three wings open together and may be taken in any order', free.length === 3, free.join(', '))
for (const wing of wings) {
  expect(
    `and ${wing} counts as done only when every fight in it is`,
    !wingCleared(wing, new Set(CHAMBERS.filter((c) => c.wing === wing).map((c) => c.id).slice(0, 1))),
    'a wing said it was done with one room cleared',
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
    (c) => dist(c.entry, c.exit) < 400 || c.packs.some((p) => dist(p.pos, c.entry) < p.pulls),
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
    while (s.outcome === 'ongoing' && s.time < 300) {
      step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
      for (const a of s.actors) {
        if (!a.alive) continue
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
    expect(
      `${chamber.name}: and it costs something`,
      s.actors.some((a) => a.faction === 'party' && a.hp < a.maxHp),
      'the corridor was free',
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
  expect('and nothing two doors away answers', stepTo(fresh, 'rampart').kind === 'shut')

  // A door with ground behind it charges once.
  const held = { ...fresh, at: 'oratory', cleared: ['spire', 'oratory'] }
  const walk = stepTo(held, 'rampart')
  expect(
    'a door with ground behind it asks for the walk',
    walk.kind === 'walk' && walk.corridor.packs.length > 1,
    walk.kind,
  )
  const after = walk.kind === 'walk' ? walkedTo(held, walk.key, 'rampart', []) : held
  expect('and the party is through it afterwards', after.at === 'rampart')
  // Either a step or a pad, and never the walk again: what a corridor costs is
  // the price of getting there the first time.
  expect(
    'and it does not ask twice',
    ['step', 'jump'].includes(stepTo({ ...after, at: 'oratory' }, 'rampart').kind),
    stepTo({ ...after, at: 'oratory' }, 'rampart').kind,
  )

  // A pad reaches across the building, and only once it is lit.
  const deep = {
    ...fresh,
    at: 'rise',
    cleared: ['spire', 'oratory', 'rampart', 'rise'],
    visited: ['threshold', 'spire', 'oratory', 'rampart', 'rise'],
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
