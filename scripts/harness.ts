import { Rng } from '../src/sim/rng'
import { createState } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { ENRAGE_AT } from '../src/sim/constants'
import {
  autoParty,
  pickFor,
  type DifficultyId,
  type Pick,
  type RaidSize,
} from '../src/sim/classes'
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

function run(
  seed: number,
  attempt: number,
  party?: Pick[],
  difficulty: DifficultyId = 'normal',
): Report {
  const s = createState(seed, attempt, party, difficulty)
  const rng = new Rng(seed + attempt * 7919)
  const ticksIn: Record<string, number> = {}
  const deaths: Record<string, number> = {}
  const walked: Record<string, number> = {}
  const walkedQuiet: Record<string, number> = {}
  let ticks = 0

  while (s.outcome === 'ongoing' && s.time < ENRAGE_AT + 60) {
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
      // Puddles only. A shockwave is also "detonated" and its radius grows to
      // cover the arena, so counting it here marked the whole party as
      // standing in fire every time one went off.
      const inside = s.ground.some(
        (g) =>
          g.kind === 'puddle' &&
          g.detonated &&
          Math.hypot(a.pos.x - g.pos.x, a.pos.y - g.pos.y) <= g.radius,
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


const ATTEMPTS = [0, 4, 8]

/** Compositions a player might actually build, including bad ones. */
const dps = (classId: Pick['classId']): Pick => pickFor(classId, 'dps')!
const heal = (classId: Pick['classId']): Pick => pickFor(classId, 'healer')!
const tank = (classId: Pick['classId']): Pick => pickFor(classId, 'tank')!

const PARTIES: Array<{ label: string; party: Pick[] }> = [
  { label: 'default  1t 1h 3d', party: [dps('mage'), tank('warrior'), heal('priest'), dps('hunter'), dps('rogue')] },
  { label: 'two heals 1t 2h 2d', party: [dps('mage'), tank('warrior'), heal('priest'), heal('paladin'), dps('rogue')] },
  { label: 'no healer 1t 0h 4d', party: [dps('mage'), tank('warrior'), dps('hunter'), dps('rogue'), dps('shaman')] },
  { label: 'no tank   0t 1h 4d', party: [dps('mage'), dps('druid'), heal('priest'), dps('hunter'), dps('rogue')] },
  { label: 'all melee 1t 1h 3d', party: [dps('rogue'), tank('warrior'), heal('priest'), dps('rogue'), dps('warrior')] },
  { label: 'all caster 1t 1h 3d', party: [dps('mage'), tank('warrior'), heal('priest'), dps('shaman'), dps('druid')] },
  { label: 'druid tank + shaman', party: [dps('mage'), tank('druid'), heal('shaman'), dps('priest'), dps('paladin')] },
]

const RUNS = 60
console.log('composition            ' + ATTEMPTS.map((a) => `pull${a + 1}`.padEnd(9)).join('') + 'avgTime')
for (const { label, party } of PARTIES) {
  const cells: string[] = []
  let time = 0
  let total = 0
  for (const attempt of ATTEMPTS) {
    let wins = 0
    for (let i = 0; i < RUNS; i++) {
      const r = run(1000 + i * 137, attempt, party)
      if (r.outcome === 'victory') wins++
      time += r.time
      total++
    }
    cells.push(`${Math.round((wins / RUNS) * 100)}%`.padEnd(9))
  }
  console.log(label.padEnd(23), cells.join(''), (time / total).toFixed(0))
}

// --- raid size and difficulty, with a balanced composition each time -------
const SIZE_RUNS = 20
const SIZE_ATTEMPTS = [0, 8]
console.log('\nsize / difficulty      ' + SIZE_ATTEMPTS.map((a) => `pull${a + 1}`.padEnd(9)).join('') + 'avgTime  bossHP%')
for (const size of [5, 10, 25] as RaidSize[]) {
  for (const difficulty of ['normal', 'heroic'] as DifficultyId[]) {
    const party = autoParty(size, dps('mage'))
    const cells: string[] = []
    let time = 0
    let left = 0
    let total = 0
    for (const attempt of SIZE_ATTEMPTS) {
      let wins = 0
      for (let i = 0; i < SIZE_RUNS; i++) {
        const r = run(1000 + i * 137, attempt, party, difficulty)
        if (r.outcome === 'victory') wins++
        time += r.time
        left += r.bossPct
        total++
      }
      cells.push(`${Math.round((wins / SIZE_RUNS) * 100)}%`.padEnd(9))
    }
    console.log(
      `${size}-player ${difficulty}`.padEnd(23),
      cells.join(''),
      (time / total).toFixed(0).padEnd(9),
      (left / total).toFixed(0),
    )
  }
}
