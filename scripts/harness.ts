import { Rng } from '../src/sim/rng'
import { createState } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { ENCOUNTERS, encounterAt } from '../src/sim/encounters'
import { BATTLEGROUNDS } from '../src/sim/battleground'
import { aiGoal } from '../src/sim/bgai'
import { createBattlegroundState } from '../src/sim/state'
import type { BgKind, BgState, Vec2 } from '../src/sim/types'
import {
  autoParty,
  pickFor,
  randomAround,
  SPEC_OPTIONS,
  type DifficultyId,
  type Pick,
  type RaidSize,
  SLOTS,
  specLabel,
} from '../src/sim/classes'
import type { PlayerInput, SimState } from '../src/sim/types'
import { autoPress } from '../src/sim/autocast'
import { rollFloor } from '../src/sim/floor'
import { DESCENT_RECOVERY, DESCENT_REVIVE } from '../src/sim/descent'

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
  depth = 0,
): Report {
  const s = createState(seed, attempt, party, difficulty, encounter, null, depth)
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

// --- the descent, which rolls its own fight every floor --------------------
//
// The floors are not authored, so there is nothing to hand-tune and nothing
// to hand-check: what is measured here is the *budget*, by sampling floors
// rather than by looking at any one of them. A curve that stays high is a
// descent with no bottom; one that collapses at floor three is a raid with
// the retry button taken away. Somewhere around half at the top and a tenth
// by floor ten is the shape being aimed at.
const FLOOR_RUNS = 24
console.log('\nfloor    win%     avgTime  bossHP%  bought')
for (const depth of [1, 2, 3, 4, 6, 8, 10, 12]) {
  let wins = 0
  let time = 0
  let left = 0
  const bought: Record<string, number> = {}
  for (let i = 0; i < FLOOR_RUNS; i++) {
    const seed = 5000 + i * 7919
    const plan = rollFloor(seed, depth)
    for (const id of Object.keys(plan.every)) bought[id] = (bought[id] ?? 0) + 1
    const r = run(seed, Math.min(8, depth + 1), undefined, 'normal', (depth - 1) % 3, depth)
    if (r.outcome === 'victory') wins++
    time += r.time
    left += r.bossPct
  }
  const common = Object.entries(bought)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, n]) => `${id} ${Math.round((n / FLOOR_RUNS) * 100)}%`)
    .join('  ')
  console.log(
    `${depth}`.padEnd(9),
    `${Math.round((wins / FLOOR_RUNS) * 100)}%`.padEnd(9),
    (time / FLOOR_RUNS).toFixed(0).padEnd(9),
    (left / FLOOR_RUNS).toFixed(0).padEnd(9),
    common,
  )
}

// --- and the run itself, which is the number the player sees ---------------
//
// The table above measures floors in isolation, which is not the fight anyone
// has: a descent carries its damage forward, so the difficulty of a run is
// the product of its floors rather than the hardest one. This walks whole
// runs the way the game does — half a health bar back between floors, one of
// the fallen up per floor — and reports where they end.
const DESCENT_RUNS = 40
{
  const reached: number[] = []
  for (let n = 0; n < DESCENT_RUNS; n++) {
    let carried: SimState | null = null
    let depth = 0
    for (;;) {
      depth++
      const seed = 9000 + n * 7919 + depth * 137
      const s = createState(
        seed,
        Math.min(8, depth + 1),
        undefined,
        'normal',
        (depth - 1) % 3,
        null,
        depth,
      )
      s.countdown = 0

      if (carried) {
        const before = carried.actors.filter((a) => a.faction === 'party')
        let revived = false
        s.actors
          .filter((a) => a.faction === 'party')
          .forEach((a, i) => {
            const was = before[i]
            if (!was) return
            if (was.alive) {
              a.hp = Math.min(a.maxHp, Math.round(was.hp + a.maxHp * DESCENT_RECOVERY))
              a.power = was.power
              return
            }
            if (!revived) {
              revived = true
              a.hp = Math.round(a.maxHp * DESCENT_REVIVE)
            } else {
              a.alive = false
              a.hp = 0
            }
          })
      }

      const rng = new Rng(seed + 13)
      let ticks = 0
      while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage + 60) {
        const pressed: number[] = []
        if (ticks % 45 === 0) pressed.push(0)
        if (ticks % 360 === 0) pressed.push(1)
        if (ticks % 540 === 0) pressed.push(2)
        step(s, playerInput(s, pressed), rng)
        ticks++
      }
      if (s.outcome !== 'victory') break
      carried = s
      if (depth > 40) break
    }
    reached.push(depth)
  }

  reached.sort((a, b) => a - b)
  const median = reached[Math.floor(reached.length / 2)]!
  const best = reached[reached.length - 1]!
  const worst = reached[0]!
  const mean = reached.reduce((a, b) => a + b, 0) / reached.length
  console.log(
    `\ndescent runs: median floor ${median}, mean ${mean.toFixed(1)}, worst ${worst}, best ${best}`,
  )
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

/**
 * Which way the match is going, as a sign.
 *
 * Escort has no score to read — the whole state of it is how far each cart
 * got — so the lead there is which cart is further along.
 */
function leadOf(bg: BgState): number {
  if (bg.kind === 'escort' && bg.carts) {
    return Math.sign(bg.carts.blue.progress - bg.carts.red.progress)
  }
  return Math.sign(Math.floor(bg.score.blue) - Math.floor(bg.score.red))
}

/**
 * The state of whatever it is that scores, as a string to compare against the
 * last tick's.
 *
 * Per mode because the three do not score the same way, and counting changes
 * of it is the closest thing to "did this match go back and forth" that can be
 * read off the state rather than reconstructed from events. Sampling is the
 * point: several flag events can land on one tick, and a counter that
 * diffs states across a tick boundary will miscount them — this one only
 * claims to say whether the picture is the same as it was.
 */
function holdingOf(bg: BgState): string {
  if (bg.kind === 'conquest') return bg.nodes.map((n) => n.owner ?? '-').join(',')
  if (bg.kind === 'escort' && bg.carts) {
    return `${bg.carts.blue.contested ? 'C' : '-'}${bg.carts.red.contested ? 'C' : '-'}`
  }
  return (['blue', 'red'] as const).map((t) => bg.flags[t].state[0]).join(',')
}

/**
 * How far the fight travelled, as a radius.
 *
 * The centroid of everyone still standing, sampled once a second; this is the
 * spread of those samples about their own mean. A match fought in one spot
 * scores near zero however long it lasted, and one that moved around the map
 * scores in the hundreds. Win rate cannot see the difference and neither can
 * the clock: a formality and a war both end at the time limit.
 */
function spreadOf(samples: Vec2[]): number {
  if (samples.length < 2) return 0
  let mx = 0
  let my = 0
  for (const c of samples) {
    mx += c.x / samples.length
    my += c.y / samples.length
  }
  let sum = 0
  for (const c of samples) sum += (c.x - mx) ** 2 + (c.y - my) ** 2
  return Math.sqrt(sum / samples.length)
}

function bgRun(seed: number, kind: BgKind, drive: 'ai' | 'objective' | 'idle') {
  // Both sides rolled, and rolled the same way.
  //
  // Blue used to be handed DEFAULT_PARTY while red was rolled, so every
  // battleground figure below was one fixed lineup against the field rather
  // than the map's own balance. That lineup is poor on two of the three maps,
  // which came out as blue losing ninety-seven percent of escorts — a number
  // that says nothing about escorting. The game itself never did this: it
  // rolls blue with `randomAround` and red with `randomParty`, both from the
  // role targets, and this is the same arrangement.
  const roll = new Rng(seed + 104729)
  const lead = SPEC_OPTIONS[roll.int(SPEC_OPTIONS.length)]!
  const s = createBattlegroundState(seed, kind, randomAround(5, lead, () => roll.next()))
  s.countdown = 0
  const rng = new Rng(seed)
  let ticks = 0
  let deaths = 0
  const alive = new Map(s.actors.map((a) => [a.id, a.alive]))

  let leadChanges = 0
  let lastLead = 0
  let turnovers = 0
  let holding = holdingOf(s.bg!)
  const centroids: Vec2[] = []

  while (s.outcome === 'ongoing' && s.time < s.bg!.timeLimit + 30) {
    const player = s.actors.find((a) => a.isPlayer)!
    // The rotation the game itself presses when auto is on, rather than a
    // slot on a timer. A stand-in that fires slot zero every second and a half
    // regardless of range contributes almost nothing to a five-versus-five,
    // which made every driver below look the same: the positions differed and
    // the damage did not, so standing correctly paid nothing and the naive
    // walk-at-the-objective driver won. Positioning is the thing these rows
    // are comparing, and it can only be compared by someone who is fighting.
    const pressed = autoPress(s)

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

    // Only a lead that was somebody's and became somebody else's counts. Going
    // level and back is not a change of who is winning.
    const lead = leadOf(s.bg!)
    if (lead !== 0 && lastLead !== 0 && lead !== lastLead) leadChanges++
    if (lead !== 0) lastLead = lead

    const now = holdingOf(s.bg!)
    if (now !== holding) {
      turnovers++
      holding = now
    }

    if (ticks % 30 === 0) {
      const standing = s.actors.filter((a) => a.alive)
      if (standing.length > 0) {
        centroids.push({
          x: standing.reduce((n, a) => n + a.pos.x, 0) / standing.length,
          y: standing.reduce((n, a) => n + a.pos.y, 0) / standing.length,
        })
      }
    }
  }

  return {
    outcome: s.outcome,
    time: s.time,
    deaths,
    leadChanges,
    turnovers,
    spread: spreadOf(centroids),
    state: s,
  }
}

/** A human who understands the objective and nothing else about the fight. */
function objectiveGoal(s: SimState) {
  const bg = s.bg!
  const player = s.actors.find((a) => a.isPlayer)!
  // Walks with their own cart, which is the simplest thing a person can do
  // on this map and therefore the right thing for the stand-in to do.
  if (bg.kind === 'escort' && bg.carts) return bg.carts.blue.pos
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

// Win rate says whether the rules are even. It says nothing about whether the
// match was worth playing: a lead taken in the first ten seconds and held is
// the same hundred percent as one that changed hands four times. The three
// columns after `deaths` are the ones that can tell those apart — how often
// the lead changed, how often the thing that scores changed hands, and how far
// around the map the fight actually went.
console.log(
  '\nbattleground           player     win%     avgTime  deaths  leadChg  turnover  spread',
)
for (const bg of BATTLEGROUNDS) {
  for (const drive of ['ai', 'objective', 'idle'] as const) {
    let wins = 0
    let time = 0
    let deaths = 0
    let leadChanges = 0
    let turnovers = 0
    let spread = 0
    for (let n = 0; n < BG_RUNS; n++) {
      const r = bgRun(500 + n * 91, bg.kind, drive)
      if (r.outcome === 'victory') wins++
      time += r.time
      deaths += r.deaths
      leadChanges += r.leadChanges
      turnovers += r.turnovers
      spread += r.spread
    }
    console.log(
      `${bg.name}`.padEnd(23),
      drive.padEnd(11),
      `${Math.round((wins / BG_RUNS) * 100)}%`.padEnd(9),
      (time / BG_RUNS).toFixed(0).padEnd(9),
      (deaths / BG_RUNS).toFixed(1).padEnd(8),
      (leadChanges / BG_RUNS).toFixed(1).padEnd(9),
      (turnovers / BG_RUNS).toFixed(1).padEnd(10),
      (spread / BG_RUNS).toFixed(0),
    )
  }
}
