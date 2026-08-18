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
  deaths: Record<string, number>
}

function run(seed: number, attempt: number): Report {
  const s = createState(seed, attempt)
  const rng = new Rng(seed + attempt * 7919)
  const ticksIn: Record<string, number> = {}
  const deaths: Record<string, number> = {}
  let ticks = 0

  while (s.outcome === 'ongoing' && s.time < 200) {
    const pressed: number[] = []
    // Fire abilities roughly on cooldown.
    if (ticks % 45 === 0) pressed.push(0)
    if (ticks % 360 === 0) pressed.push(1)
    if (ticks % 540 === 0) pressed.push(2)

    step(s, playerInput(s, pressed), rng)
    ticks++

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

  return {
    outcome: s.outcome,
    time: Math.round(s.time * 10) / 10,
    bossPct: Math.round((boss.hp / boss.maxHp) * 1000) / 10,
    inPuddle: pct,
    deaths,
  }
}


const ATTEMPTS = [0, 2, 4, 6, 8]
const NAMES = ['You', 'Bastion', 'Wren', 'Kestrel', 'Vale']

console.log('attempt  runs  wins  winRate  avgTime  bossLeft%  ' + NAMES.map((n) => n.padEnd(8)).join(''))
for (const attempt of ATTEMPTS) {
  let wins = 0
  let time = 0
  let left = 0
  const puddle: Record<string, number> = {}
  const RUNS = 30
  for (let i = 0; i < RUNS; i++) {
    const r = run(1000 + i * 137, attempt)
    if (r.outcome === 'victory') wins++
    time += r.time
    left += r.bossPct
    for (const n of NAMES) puddle[n] = (puddle[n] ?? 0) + (r.inPuddle[n] ?? 0)
  }
  console.log(
    String(attempt).padEnd(9),
    String(RUNS).padEnd(6),
    String(wins).padEnd(6),
    `${Math.round((wins / RUNS) * 100)}%`.padEnd(9),
    (time / RUNS).toFixed(1).padEnd(9),
    (left / RUNS).toFixed(1).padEnd(11),
    NAMES.map((n) => `${(puddle[n]! / RUNS).toFixed(2)}%`.padEnd(8)).join(''),
  )
}
