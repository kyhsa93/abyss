import { Rng } from '../src/sim/rng'
import { createState } from '../src/sim/state'
import { step } from '../src/sim/sim'
import type { PlayerInput, SimState } from '../src/sim/types'

/** Crude stand-in for a competent human: run out of any puddle, else stand still. */
function playerInput(s: SimState, pressed: number[]): PlayerInput {
  const p = s.actors.find((a) => a.isPlayer)!
  let moveX = 0
  let moveY = 0
  for (const g of s.ground) {
    const d = Math.hypot(p.pos.x - g.pos.x, p.pos.y - g.pos.y)
    if (d <= g.radius + 20) {
      moveX += (p.pos.x - g.pos.x) / (d || 1)
      moveY += (p.pos.y - g.pos.y) / (d || 1)
    }
  }
  return { moveX, moveY, pressed }
}

interface Report {
  outcome: string
  time: number
  bossPct: number
  inPuddle: Record<string, number>
  /** Metres walked per second of fight. */
  travel: Record<string, number>
  /** Same, but only while no ground effect exists — pure wasted motion. */
  idleTravel: Record<string, number>
  deaths: Record<string, number>
}

function run(seed: number, attempt: number): Report {
  const s = createState(seed, attempt)
  const rng = new Rng(seed + attempt * 7919)
  const ticksIn: Record<string, number> = {}
  const deaths: Record<string, number> = {}
  const walked: Record<string, number> = {}
  const walkedQuiet: Record<string, number> = {}
  let ticks = 0

  while (s.outcome === 'ongoing' && s.time < 200) {
    const pressed: number[] = []
    // Fire abilities roughly on cooldown.
    if (ticks % 45 === 0) pressed.push(0)
    if (ticks % 360 === 0) pressed.push(1)
    if (ticks % 540 === 0) pressed.push(2)

    // A tick with nothing on the floor is a tick nobody should be running.
    const quiet = s.ground.length === 0
    const before = new Map(s.actors.map((a) => [a.id, { x: a.pos.x, y: a.pos.y }]))

    step(s, playerInput(s, pressed), rng)
    ticks++

    for (const a of s.actors) {
      if (a.faction !== 'party' || !a.alive) continue
      const p = before.get(a.id)
      if (!p) continue
      const d = Math.hypot(a.pos.x - p.x, a.pos.y - p.y)
      walked[a.name] = (walked[a.name] ?? 0) + d
      if (quiet) walkedQuiet[a.name] = (walkedQuiet[a.name] ?? 0) + d
    }

    for (const a of s.actors) {
      if (a.faction !== 'party') continue
      if (!a.alive) {
        if (deaths[a.name] === undefined) deaths[a.name] = Math.round(s.time * 10) / 10
        continue
      }
      // Only detonated puddles actually hurt; standing in a telegraph is fine.
      const inside = s.ground.some(
        (g) => g.detonated && Math.hypot(a.pos.x - g.pos.x, a.pos.y - g.pos.y) <= g.radius,
      )
      if (inside) ticksIn[a.name] = (ticksIn[a.name] ?? 0) + 1
    }
  }

  const boss = s.actors[s.actors.length - 1]!
  const pct: Record<string, number> = {}
  for (const a of s.actors) {
    if (a.faction !== 'party') continue
    pct[a.name] = Math.round(((ticksIn[a.name] ?? 0) / ticks) * 1000) / 10
  }

  const travel: Record<string, number> = {}
  const idleTravel: Record<string, number> = {}
  for (const a of s.actors) {
    if (a.faction !== 'party') continue
    travel[a.name] = (walked[a.name] ?? 0) / Math.max(1, s.time)
    idleTravel[a.name] = (walkedQuiet[a.name] ?? 0) / Math.max(1, s.time)
  }

  return {
    outcome: s.outcome,
    time: Math.round(s.time * 10) / 10,
    bossPct: Math.round((boss.hp / boss.maxHp) * 1000) / 10,
    inPuddle: pct,
    travel,
    idleTravel,
    deaths,
  }
}


const ATTEMPTS = [0, 2, 4, 6, 8]
const AI = ['Bastion', 'Wren', 'Kestrel', 'Vale']

console.log(
  'attempt  wins  time   ' +
    AI.map((n) => (n + ' pud/mv').padEnd(16)).join(''),
)
for (const attempt of ATTEMPTS) {
  let wins = 0
  let time = 0
  const puddle: Record<string, number> = {}
  const travel: Record<string, number> = {}
  const RUNS = 30
  for (let i = 0; i < RUNS; i++) {
    const r = run(1000 + i * 137, attempt)
    if (r.outcome === 'victory') wins++
    time += r.time
    for (const n of AI) {
      puddle[n] = (puddle[n] ?? 0) + (r.inPuddle[n] ?? 0)
      travel[n] = (travel[n] ?? 0) + (r.travel[n] ?? 0)
    }
  }
  console.log(
    String(attempt).padEnd(9),
    `${Math.round((wins / RUNS) * 100)}%`.padEnd(6),
    (time / RUNS).toFixed(0).padEnd(7),
    AI.map((n) =>
      `${(puddle[n]! / RUNS).toFixed(2)}%/${(travel[n]! / RUNS).toFixed(0)}`.padEnd(16),
    ).join(''),
  )
}
