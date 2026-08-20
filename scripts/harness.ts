import { Rng } from '../src/sim/rng'
import { createState } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { ENCOUNTERS, encounterAt } from '../src/sim/encounters'
import { BATTLEGROUNDS } from '../src/sim/battleground'
import { aiGoal } from '../src/sim/bgai'
import { createBattlegroundState } from '../src/sim/state'
import type { BgKind } from '../src/sim/types'
import {
  autoParty,
  pickFor,
  type DifficultyId,
  type Pick,
  type RaidSize,
  SLOTS,
  specLabel,
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
  encounter = 0,
): Report {
  const s = createState(seed, attempt, party, difficulty, encounter)
  // The pull's opening countdown is skipped rather than waited out. No time
  // passes during it, so the fight is identical either way — this is only
  // ninety ticks per run of nobody doing anything, times several thousand.
  s.countdown = 0
  const rng = new Rng(seed + attempt * 7919)
  const ticksIn: Record<string, number> = {}
  const deaths: Record<string, number> = {}
  const walked: Record<string, number> = {}
  const walkedQuiet: Record<string, number> = {}
  let ticks = 0

  while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage + 60) {
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
      if (a.faction !== 'party' || a.isPlayer || !a.alive) continue
      const p = before.get(a.id)
      if (!p) continue
      const d = Math.hypot(a.pos.x - p.x, a.pos.y - p.y)
      walked[a.name] = (walked[a.name] ?? 0) + d
      if (quiet) walkedQuiet[a.name] = (walkedQuiet[a.name] ?? 0) + d
    }

    for (const a of s.actors) {
      if (a.faction !== 'party' || a.isPlayer) continue
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
    if (a.faction !== 'party' || a.isPlayer) continue
    pct[a.name] = Math.round(((ticksIn[a.name] ?? 0) / ticks) * 1000) / 10
  }

  const travel: Record<string, number> = {}
  const idleTravel: Record<string, number> = {}
  for (const a of s.actors) {
    if (a.faction !== 'party' || a.isPlayer) continue
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

// --- one row per boss ------------------------------------------------------
//
// Each one leans on different mechanics, so each one has to be tuned against
// the same party rather than assumed to inherit the first one's numbers. The
// mechanic columns are what says they are actually different fights: a boss
// whose puddle count and raid damage match the last one is a reskin.
const BOSS_RUNS = 40
console.log('\nboss                   ' + ATTEMPTS.map((a) => `pull${a + 1}`.padEnd(9)).join('') + 'avgTime  enrage%')
for (let i = 0; i < ENCOUNTERS.length; i++) {
  const cells: string[] = []
  let time = 0
  let total = 0
  let enraged = 0
  for (const attempt of ATTEMPTS) {
    let wins = 0
    for (let n = 0; n < BOSS_RUNS; n++) {
      const r = run(1000 + n * 137, attempt, PARTIES[0]!.party, 'normal', i)
      if (r.outcome === 'victory') wins++
      if (r.outcome === 'enrage') enraged++
      time += r.time
      total++
    }
    cells.push(`${Math.round((wins / BOSS_RUNS) * 100)}%`.padEnd(9))
  }
  console.log(
    ENCOUNTERS[i]!.name.padEnd(23),
    cells.join(''),
    (time / total).toFixed(0).padEnd(9),
    `${Math.round((enraged / total) * 100)}%`,
  )
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

// --- per member, which is the only place AI bugs actually surface ----------
//
// The win rate hides them. A dealer whose weapon never reaches anything still
// gets the boss killed by everyone else, and a tank that spends a fifth of the
// fight in fire still wins whenever the healer keeps up. Both were found by
// reading these two columns, so they are printed per member rather than
// averaged: an average over five people is exactly the thing that hid them.
//
// Two orderings are what the numbers are read for. Puddle uptime should sort
// melee above ranged, because standing next to the boss is standing where it
// aims, and within a reach it should sort greedy above timid — that second
// spread *is* the humanity layer, and if it flattens, personality has stopped
// reaching the simulation. And travel should stay low, since a party that
// paces is one chasing a target that moves.
const DETAIL_RUNS = 20
const DETAIL_ATTEMPTS = [0, 8]
const detailParty = PARTIES[0]!.party

console.log('\nper member, default composition, puddle% / units walked per s')
console.log(
  'member                       ' +
    DETAIL_ATTEMPTS.map((a) => `pull${a + 1}`.padEnd(17)).join(''),
)

const detail = new Map<number, { puddle: Record<string, number>; travel: Record<string, number> }>()
for (const attempt of DETAIL_ATTEMPTS) {
  const puddle: Record<string, number> = {}
  const travel: Record<string, number> = {}
  for (let i = 0; i < DETAIL_RUNS; i++) {
    const r = run(1000 + i * 137, attempt, detailParty)
    for (const name of Object.keys(r.inPuddle)) {
      puddle[name] = (puddle[name] ?? 0) + r.inPuddle[name]!
      travel[name] = (travel[name] ?? 0) + (r.travel[name] ?? 0)
    }
  }
  detail.set(attempt, { puddle, travel })
}

// Slot one is the player, who is a scripted stand-in here rather than the AI
// under test, and whose puddle time would read as somebody's bad decision.
for (let i = 1; i < detailParty.length; i++) {
  const slot = SLOTS[i]!
  const pick = detailParty[i]!
  const label = `${slot.name} ${specLabel(pick)}, ${slot.personality}`
  const cells = DETAIL_ATTEMPTS.map((attempt) => {
    const d = detail.get(attempt)!
    const puddle = (d.puddle[slot.name] ?? 0) / DETAIL_RUNS
    const travel = (d.travel[slot.name] ?? 0) / DETAIL_RUNS
    return `${puddle.toFixed(2)}% / ${travel.toFixed(0)}`.padEnd(17)
  })
  console.log(label.padEnd(29) + cells.join(''))
}


// --- battlegrounds ----------------------------------------------------------
//
// Two questions, and they are not the same one. First, are the rules even:
// with the player's slot driven by the same reasoning everyone else uses, both
// sides should win about half. A lopsided number there is a rule that favours
// a side, not a party that played better. Second, does playing well matter:
// the same match with the player walking objectives should come out ahead of
// the same match with the player standing at the spawn reading the score.
const BG_RUNS = 30

function bgRun(seed: number, kind: BgKind, drive: 'ai' | 'objective' | 'idle') {
  const s = createBattlegroundState(seed, kind)
  s.countdown = 0
  const rng = new Rng(seed)
  let ticks = 0
  let deaths = 0
  const alive = new Map(s.actors.map((a) => [a.id, a.alive]))

  while (s.outcome === 'ongoing' && s.time < s.bg!.timeLimit + 30) {
    const player = s.actors.find((a) => a.isPlayer)!
    const pressed: number[] = []
    if (ticks % 45 === 0) pressed.push(0)
    if (ticks % 300 === 0) pressed.push(1)

    let moveX = 0
    let moveY = 0
    if (drive !== 'idle' && player.alive) {
      const goal = drive === 'ai' ? aiGoal(s, player) : objectiveGoal(s)
      if (goal) {
        const dx = goal.x - player.pos.x
        const dy = goal.y - player.pos.y
        const d = Math.hypot(dx, dy)
        if (d > 12) {
          moveX = dx / d
          moveY = dy / d
        }
      }
    }

    step(s, { moveX, moveY, pressed }, rng)
    ticks++
    for (const a of s.actors) {
      if (alive.get(a.id) && !a.alive) deaths++
      alive.set(a.id, a.alive)
    }
  }

  return { outcome: s.outcome, time: s.time, deaths, state: s }
}

/** A human who understands the objective and nothing else about the fight. */
function objectiveGoal(s: SimState) {
  const bg = s.bg!
  const player = s.actors.find((a) => a.isPlayer)!
  if (bg.kind === 'flags') {
    const theirs = bg.flags.red
    return theirs.carrierId === player.id ? bg.bases.blue : theirs.pos
  }
  const wanted = bg.nodes.filter((n) => n.owner !== 'blue')
  const list = wanted.length > 0 ? wanted : bg.nodes
  let best = list[0]!
  for (const n of list) {
    const d = Math.hypot(player.pos.x - n.pos.x, player.pos.y - n.pos.y)
    if (d < Math.hypot(player.pos.x - best.pos.x, player.pos.y - best.pos.y)) best = n
  }
  return best.pos
}

console.log('\nbattleground           player     win%     avgTime  deaths')
for (const bg of BATTLEGROUNDS) {
  for (const drive of ['ai', 'objective', 'idle'] as const) {
    let wins = 0
    let time = 0
    let deaths = 0
    for (let n = 0; n < BG_RUNS; n++) {
      const r = bgRun(500 + n * 91, bg.kind, drive)
      if (r.outcome === 'victory') wins++
      time += r.time
      deaths += r.deaths
    }
    console.log(
      `${bg.name}`.padEnd(23),
      drive.padEnd(11),
      `${Math.round((wins / BG_RUNS) * 100)}%`.padEnd(9),
      (time / BG_RUNS).toFixed(0).padEnd(9),
      (deaths / BG_RUNS).toFixed(1),
    )
  }
}
