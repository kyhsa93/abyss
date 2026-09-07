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
const empty = new Set(CHAMBERS.filter((c) => c.encounter === null && c.awaiting === undefined).map((c) => c.id))
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

if (failures > 0) {
  console.error(`dungeoncheck: ${failures} check(s) failed`)
  process.exit(1)
}
const built = CHAMBERS.filter((c: Chamber) => c.encounter !== null).length
console.log(
  `dungeoncheck: ${CHAMBERS.length} rooms, ${PASSAGES.length} passages, ${built} of ${fights.length} fights built`,
)
