/**
 * How a raid walks the six passages, as the numbers the spacing checks judge (#316).
 *
 * One row a passage: the share of pairs under the line and under an overlap
 * while walking up to the door, how far the furthest body is from the leader
 * (in a circle, and as a share of the glass of a phone held upright, along each
 * axis), how long the raid is at the door and how near it gets there, and the
 * rank agreement of the two halves of the walk. It is `dungeoncheck`'s ground
 * and `dungeoncheck`'s rulers printed instead of judged, for putting next to
 * the limits, and for comparing one setting of the spacing against another.
 *
 *   npm run spacingprobe            # five, ten, twenty-five
 *   npm run spacingprobe -- 25      # one size
 */
import { PASSAGES, citadelTerrain, citadelWorld, groundFor, hallFor, storeyOf } from '../src/dungeon'
import { autoParty, pickFor } from '../src/sim/classes'
import { createCorridorState } from '../src/sim/state'
import { Rng } from '../src/sim/rng'
import { exitReach, huddle } from '../src/sim/travel'
import { keepOf } from '../src/sim/spacing'
import { computeLayout } from '../src/render/theme'
import { TILT } from '../src/render/draw'
import {
  OVERLAP,
  closest,
  doorWindow,
  farthest,
  firstGoing,
  firstMoved,
  glassRatio,
  judgeDoor,
  lastMoved,
  longestRun,
  longestStall,
  meanFromLeader,
  pairShare,
  quietFrom,
  rankAgreement,
  record,
  ticksOf,
} from './spacingmetric'

const sizes = process.argv[2] ? (process.argv[2].split(",").map(Number) as Array<5 | 10 | 25>) : ([5, 10, 25] as const)
const phone = computeLayout(390, 844)
const seenX = 390 / 2 / phone.scale
const seenY = (844 / 2 - (phone.bannerY + 3)) / (phone.scale * TILT)
const tank = pickFor('warrior', 'tank')!
const pct = (x: number): string => `${(x * 100).toFixed(2)}%`.padStart(7)
const dps = pickFor('warrior', 'dps')!

/** The first hall of the building, with its furniture and nothing awake, as `dungeoncheck` walks it. */
function hall(size: 5 | 10 | 25, seed: number) {
  const ground = { ...hallFor('threshold', null, () => true), id: 'citadel', packs: [], terrain: citadelTerrain() }
  const s = createCorridorState(seed, autoParty(size, dps), ground, 'normal', 4, undefined, true)
  s.chamber = 'threshold'
  s.floor = citadelWorld()
    .filter((cell) => cell.storeys.includes(storeyOf('threshold')))
    .map((cell) => cell.room)
  return s
}

const UP = { moveX: 0, moveY: -1 }
const STILL = { moveX: 0, moveY: 0 }
for (const size of sizes) {
  const line = keepOf(size) - 4
  // The hall: straight on for eight seconds; round it twice; five seconds and stood ten, then off again.
  {
    const straight = record(hall(size, 7), new Rng(7), 30 * 8, () => UP)
    const q = quietFrom(straight.frames, 90)
    const legs = [UP, { moveX: 1, moveY: 0 }, { moveX: 0, moveY: 1 }, { moveX: -1, moveY: 0 }]
    const loop = record(hall(size, 7), new Rng(7), 30 * 4 * 8, (t) => legs[Math.floor(t / 120) % 4]!)
    const lq = quietFrom(loop.frames, 90)
    const SHORT = 150
    const REST = 450
    const rest = record(hall(size, 7), new Rng(7), REST + 150, (t) => (t < SHORT || t >= REST ? UP : STILL))
    const stoppedFrames = (k: number) => quietFrom(rest.frames, SHORT + k, REST)
    const last: number[] = []
    const first: number[] = []
    const moved: number[] = []
    rest.ids.forEach((_, i) => {
      if (i === rest.leader) return
      last.push(lastMoved(rest.frames.filter((f) => f.tick >= SHORT && f.tick < REST), i, 0.4 * rest.frames[SHORT]!.stride[i]!))
      first.push(firstGoing(rest.frames, i, REST) - REST)
      moved.push(firstMoved(rest.frames, i, REST, 0.4 * rest.frames[REST]!.stride[i]!) - REST)
    })
    const arrived = last.filter((n) => n >= 0)
    console.log(
      `\n${size}-man hall  straight: <18 ${pct(pairShare(q, OVERLAP))} <${line} ${pct(pairShare(q, line))} nearest ${closest(q).toFixed(1)} far ${farthest(q, straight.leader).toFixed(0)}` +
        ` | corners: <18 ${pct(pairShare(lq, OVERLAP))} longest ${longestRun(lq, OVERLAP)} ticks` +
        ` | stopped: <18 at 3s ${pct(pairShare(stoppedFrames(90), OVERLAP))}, <${line} at 5s ${pct(pairShare(stoppedFrames(150), line))}, arrived ${arrived.length}/${last.length} over ${arrived.length > 0 ? Math.max(...arrived) - Math.min(...arrived) : 0} ticks` +
        ` | set off: planned ${Math.min(...first)}..${Math.max(...first)}, moved ${Math.min(...moved)}..${Math.max(...moved)}`,
    )
  }
  console.log(`\n${size}-man  keep ${keepOf(size)}  huddle ${huddle(size)}  exitReach ${exitReach(size)}  glass ${seenX.toFixed(0)} across, ${seenY.toFixed(0)} up`)
  console.log('passage'.padEnd(26) + `<18      <${line}     far  glass | door: ticks  <18      <27      <9  run18 nearest | rho  stall`)
  const took: number[] = []
  const rhos: number[] = []
  let worstGlass = 0
  for (const p of PASSAGES) {
    const c = groundFor(p.from, p.to)
    if (!c) continue
    const ground = { ...c, packs: [], springs: [], alarms: [], jets: [], defenders: [] }
    const way = ground.ways.find((x) => x.to === p.to) ?? ground.ways[0]!
    const s = createCorridorState(1000, autoParty(size, tank), ground, 'normal', 4)
    const w = record(s, new Rng(1000), 30 * 60, (_t, st) => {
      const me = st.actors.find((a) => a.isPlayer)!
      return { moveX: way.at.x - me.pos.x, moveY: way.at.y - me.pos.y }
    })
    const doors = ground.ways.map((x) => x.at)
    const win = doorWindow(w, doors, exitReach(size))
    const end = win.length === 0 ? w.frames.length : win[0]!.tick
    const q = quietFrom(w.frames, 90, end)
    const out = quietFrom(w.frames, 300, end)
    const ratio = glassRatio(out, w.leader, seenX, seenY)
    worstGlass = Math.max(worstGlass, ratio)
    const mid = Math.floor((150 + end) / 2)
    const rho = rankAgreement(
      meanFromLeader(quietFrom(w.frames, 150, mid), w.leader, w.ids.length),
      meanFromLeader(quietFrom(w.frames, mid, end), w.leader, w.ids.length),
    )
    took.push(ticksOf(win))
    rhos.push(rho)
    console.log(
      `${p.from}->${p.to}`.padEnd(26) +
        `${pct(pairShare(q, OVERLAP))} ${pct(pairShare(q, line))} ${farthest(out, w.leader).toFixed(0).padStart(5)} ${ratio.toFixed(2).padStart(5)} | ` +
        `${String(ticksOf(win)).padStart(10)} ${pct(pairShare(win, OVERLAP))} ${pct(pairShare(win, 27))} ${pct(pairShare(win, 9))} ${String(longestRun(win, OVERLAP)).padStart(5)} ${closest(win).toFixed(1).padStart(7)} | ` +
        `${rho.toFixed(2)} ${String(longestStall(w.frames, w.leader, exitReach(size))).padStart(5)}` +
        (judgeDoor(win, size).length > 0 ? '  <- door: ' + judgeDoor(win, size).join('; ') : ''),
    )
  }
  const mean = took.reduce((a, b) => a + b, 0) / took.length
  console.log(`door ticks mean ${mean.toFixed(0)} max ${Math.max(...took)}   worst glass ratio ${worstGlass.toFixed(2)}   rho ${rhos.map((r) => r.toFixed(2)).join(' ')}`)
}
