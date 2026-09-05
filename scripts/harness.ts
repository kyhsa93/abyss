import { Rng } from '../src/sim/rng'
import { createState, unattended } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { ENCOUNTERS, encounterAt, encounterKit } from '../src/sim/encounters'
import { BATTLEGROUNDS } from '../src/sim/battleground'
import { aiGoal } from '../src/sim/bgai'
import { createBattlegroundState } from '../src/sim/state'
import type { Actor, BgKind, BgState, Vec2 } from '../src/sim/types'
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
  specOf,
} from '../src/sim/classes'
import type { PlayerInput, SimState } from '../src/sim/types'
import { autoPress } from '../src/sim/autocast'
import { boss as bossOf } from '../src/sim/combat'
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

  // `boss(s)` by id, not the last actor: adds and the stalker are appended to
  // the roster as they spawn, so the tail of it is whatever was summoned most
  // recently. Every row for a boss with `adds` or `hunt` in its kit — which is
  // the Choir's and the Tidebreaker's — has been reporting an add's health as
  // the boss's, and reading a won pull as one that left a third of the boss
  // standing.
  const fought = bossOf(s)
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
    bossPct: Math.round((fought.hp / fought.maxHp) * 1000) / 10,
    inPuddle: pct,
    travel,
    idleTravel,
    deaths,
  }
}


/**
 * Which slice of this file to run, or all of it.
 *
 * Every table here is independent of every other one and every pull inside a
 * table is independent of every other pull: the simulation is deterministic
 * from a seed and touches nothing outside itself. So the hour this costs is an
 * hour on one core of however many the machine has, for no reason beyond
 * nobody having split it.
 *
 * Profiled, the split writes itself. The size-and-difficulty table is 1120 of
 * the 1475 seconds — five bosses of six cells each, at up to twenty-five
 * bodies a pull — and everything else in the file put together is 355. So the
 * shards are one per boss of that table, plus one for all the rest, and the
 * wall clock becomes the largest of them rather than the sum.
 *
 * Unset runs everything, in file order, exactly as it always did. That is not
 * a fallback nobody uses: it is what `npm run harness` still does, and it is
 * the thing the sharded run is diffed against.
 */
const SHARD = process.env.ABYSS_SHARD ?? ''
const want = (tag: string): boolean => SHARD === '' || SHARD === tag

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
if (want('composition')) console.log('composition            ' + ATTEMPTS.map((a) => `pull${a + 1}`.padEnd(9)).join('') + 'avgTime')
if (want('composition')) for (const { label, party } of PARTIES) {
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
if (want('boss')) console.log('\nboss                   ' + ATTEMPTS.map((a) => `pull${a + 1}`.padEnd(9)).join('') + 'avgTime  enrage%')
if (want('boss')) for (let i = 0; i < ENCOUNTERS.length; i++) {
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

// --- raid size and difficulty, per boss ------------------------------------
//
// Both axes buy a rung of the boss's ladder now, not just a taller health bar,
// so this table is where that either works or does not. What is being read is
// the shape down each block: heroic should cost something at every size, and a
// bigger raid should not be the easier one — and the kit column says, in
// words, what the raid is being asked for that the row above was not.
// Fourteen for a long time, which is two standard errors of twenty-seven
// points — wider than most of the gaps this table is read for. A rung that
// swung from 93% to 43% between two neighbouring tuning values could not be
// told from the same rung sampled twice, and a round of tuning was spent
// chasing the difference. Forty brings it to sixteen.
const SIZE_RUNS = 40
const SIZE_ATTEMPTS = [0, 8]
if (want('size:0')) console.log(
  '\nboss / size / difficulty  ' +
    SIZE_ATTEMPTS.map((a) => `pull${a + 1}`.padEnd(9)).join('') +
    'avgTime  bossHP%  kit' +
    `\n(${SIZE_RUNS} pulls a cell; two standard errors on a win rate is about ` +
    `${(2 * Math.sqrt(0.25 / SIZE_RUNS) * 100).toFixed(0)} points)`,
)
for (let i = 0; i < ENCOUNTERS.length; i++) {
  if (!want(`size:${i}`)) continue
  for (const size of [5, 10, 25] as RaidSize[]) {
    for (const difficulty of ['normal', 'heroic'] as DifficultyId[]) {
      const party = autoParty(size, dps('mage'))
      const cells: string[] = []
      let time = 0
      let left = 0
      let total = 0
      for (const attempt of SIZE_ATTEMPTS) {
        let wins = 0
        for (let n = 0; n < SIZE_RUNS; n++) {
          const r = run(1000 + n * 137, attempt, party, difficulty, i)
          if (r.outcome === 'victory') wins++
          time += r.time
          left += r.bossPct
          total++
        }
        cells.push(`${Math.round((wins / SIZE_RUNS) * 100)}%`.padEnd(9))
      }
      console.log(
        `${ENCOUNTERS[i]!.short} ${size} ${difficulty}`.padEnd(26),
        cells.join(''),
        (time / total).toFixed(0).padEnd(9),
        (left / total).toFixed(0).padEnd(9),
        encounterKit(ENCOUNTERS[i]!, size, difficulty).join(','),
      )
    }
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
if (want('descent')) console.log('\nfloor    win%     avgTime  bossHP%  bought')
if (want('descent')) for (const depth of [1, 2, 3, 4, 6, 8, 10, 12]) {
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
if (want('run')) {
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

if (want('member')) console.log('\nper member, default composition, puddle% / units walked per s')
if (want('member')) console.log(
  'member                       ' +
    DETAIL_ATTEMPTS.map((a) => `pull${a + 1}`.padEnd(17)).join(''),
)

const detail = new Map<number, { puddle: Record<string, number>; travel: Record<string, number> }>()
if (want('member')) for (const attempt of DETAIL_ATTEMPTS) {
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
if (want('member')) for (let i = 1; i < detailParty.length; i++) {
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
/**
 * Matches per row below.
 *
 * Thirty put two standard errors at about eighteen points, which is wider than
 * most of the differences these rows are read for — and they were read for
 * them anyway, including by the round that added the rally. A win rate is a
 * coin flip counted a few times; at this width, "43% against 57%" is one
 * sample of the same number twice. Ninety brings it to about ten points, which
 * is still not small, so a row is worth acting on when it moves further than
 * that and not before.
 */
const BG_RUNS = 90

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

/**
 * The drivers, worst to best, as a ladder rather than a set.
 *
 * The three that were here answered "do the rules work" — a side with nobody
 * in it loses, a side with somebody in it does not — and they all landed in
 * the same place above `idle`, which says nothing about whether playing *well*
 * is worth anything. `sharp` is the top of the ladder: it does the two things
 * a good player does in a game with no hazards to dodge, which are to be on
 * the objective and to not die for nothing.
 */
type Drive = 'idle' | 'objective' | 'ai' | 'sharp'
const DRIVES: Drive[] = ['idle', 'objective', 'ai', 'sharp']

/**
 * Below this the sharp driver leaves, and above this it comes back.
 *
 * A death is worth ten to seventeen seconds of walking, which is the largest
 * single thing a person in a battleground can avoid: everything else they can
 * do is worth a fraction of one body's presence, and dying is worth all of it
 * for a sixth of a match.
 */
const SHARP_FLEE = 0.35
const SHARP_RETURN = 0.7

/**
 * Where a good player goes when it is losing a fight.
 *
 * Directly away from the nearest enemy rather than home: the point is to
 * break contact and come back, and walking to your own base to heal is
 * conceding the objective for the whole round trip.
 */
function sharpGoal(s: SimState, fleeing: boolean): Vec2 | null {
  const player = s.actors.find((a) => a.isPlayer)!
  if (!fleeing) return aiGoal(s, player)

  let nearest: Actor | null = null
  let gap = Infinity
  for (const a of s.actors) {
    if (!a.alive || a.faction !== 'boss') continue
    const d = Math.hypot(a.pos.x - player.pos.x, a.pos.y - player.pos.y)
    if (d < gap) {
      gap = d
      nearest = a
    }
  }
  if (!nearest) return aiGoal(s, player)
  const away = Math.atan2(player.pos.y - nearest.pos.y, player.pos.x - nearest.pos.x)
  return { x: player.pos.x + Math.cos(away) * 200, y: player.pos.y + Math.sin(away) * 200 }
}

function bgRun(seed: number, kind: BgKind, drive: Drive) {
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

  let fleeing = false
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

    // Hysteresis on the retreat, or a player at exactly the threshold spends
    // the fight turning round on the spot.
    if (drive === 'sharp' && player.alive) {
      const share = player.hp / player.maxHp
      if (share < SHARP_FLEE) fleeing = true
      else if (share > SHARP_RETURN) fleeing = false
    }

    let moveX = 0
    let moveY = 0
    if (drive !== 'idle' && player.alive) {
      const goal =
        drive === 'sharp'
          ? sharpGoal(s, fleeing)
          : drive === 'ai'
            ? aiGoal(s, player)
            : objectiveGoal(s)
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


// --- what each spec is worth ------------------------------------------------
//
// One spec under test in an otherwise identical raid, rather than a raid built
// out of it: six of the same melee is a party with no ranged in it, and that
// loses for reasons that are not the spec's.
//
// The spread at the bottom of each block is the number to watch. It was 1.61x
// on damage and 1.41x on healing when this table was written, and both had got
// there without any check noticing, because nothing in the harness had ever
// looked at a spec on its own.
//
// Twenty, up from eight, and the reason is arithmetic rather than taste. Eight
// pulls across five bosses was forty samples and two standard errors on a win
// rate is about sixteen points there; across eight bosses it is the same
// forty-per-row against a floor the band checks to the point. The paladin tank
// read 48% against a floor of 50 and read 53% at this count, having changed
// nothing — a band failing inside its own error, which the damage spread did
// twice before it and which this file's own comments warn about by name.
const SPEC_RUNS = 20
const SPEC_SIZE: RaidSize = 10
if (want('spec')) {
  const roleOf = (p: Pick) => specOf(p).role
  const ref: Record<string, Pick> = {
    tank: SPEC_OPTIONS.find((p) => roleOf(p) === 'tank')!,
    healer: SPEC_OPTIONS.find((p) => roleOf(p) === 'healer')!,
    dps: SPEC_OPTIONS.find((p) => roleOf(p) === 'dps')!,
  }
  const TANKS = 2
  const HEALERS = 2
  const slotOf: Record<string, number> = { tank: 0, healer: TANKS, dps: TANKS + HEALERS }

  const lineup = (test: Pick): Pick[] => {
    const out: Pick[] = []
    for (let i = 0; i < TANKS; i++) out.push(ref.tank!)
    for (let i = 0; i < HEALERS; i++) out.push(ref.healer!)
    while (out.length < SPEC_SIZE) out.push(ref.dps!)
    out[slotOf[roleOf(test)]!] = test
    return out
  }

  const measure = (test: Pick) => {
    const role = roleOf(test)
    let out = 0
    let taken = 0
    let healedBack = 0
    let wins = 0
    let runs = 0
    for (let boss = 0; boss < ENCOUNTERS.length; boss++) {
      for (let n = 0; n < SPEC_RUNS; n++) {
        const seed = 3000 + n * 7919 + boss * 131
        const s = unattended(createState(seed, 6, lineup(test), 'normal', boss))
        s.countdown = 0
        const rng = new Rng(seed + 7919)
        const me = s.actors.filter((a) => a.faction === 'party')[slotOf[role]!]!
        let healed = 0
        let prevTaken = 0
        let prevHp = me.hp
        while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage + 60) {
          step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
          const now = s.tally[me.id]!.damageTaken
          if (me.alive) {
            const gain = me.hp - prevHp + (now - prevTaken)
            if (gain > 0) healed += gain
          }
          prevTaken = now
          prevHp = me.hp
        }
        const t = s.tally[me.id]!
        const secs = Math.max(1, s.time)
        out += (role === 'healer' ? t.healing : t.damage) / secs
        // The tank column is net of what its own trait hands back: a bear
        // takes three and a half times a warrior's damage and heals most of it
        // again, so raw damage taken says the opposite of what it looks like.
        taken += (t.damageTaken - healed) / secs / me.maxHp
        healedBack += healed / secs
        if (s.outcome === 'victory') wins++
        runs++
      }
    }
    return { out: out / runs, taken: (taken / runs) * 100, healedBack: healedBack / runs, win: (wins / runs) * 100 }
  }

  const rows = SPEC_OPTIONS.map((p) => ({ p, role: roleOf(p), ...measure(p) }))
  for (const role of ['dps', 'healer', 'tank'] as const) {
    const list = rows.filter((r) => r.role === role)
    const key = (r: (typeof list)[number]) => (role === 'tank' ? r.taken : r.out)
    list.sort((a, b) => (role === 'tank' ? key(a) - key(b) : key(b) - key(a)))
    const head =
      role === 'tank'
        ? 'spec                net taken %bar  healed/s   win%'
        : `spec                ${role === 'healer' ? 'hps' : 'dps'}       win%`
    console.log(`\nspec: ${role} (${SPEC_SIZE} normal, ${ENCOUNTERS.length} bosses x ${SPEC_RUNS} pulls a row)`)
    console.log(head)
    for (const r of list) {
      console.log(
        role === 'tank'
          ? `${specLabel(r.p).padEnd(20)}${r.taken.toFixed(2).padEnd(14)}${r.healedBack.toFixed(0).padEnd(10)}${r.win.toFixed(0)}%`
          : `${specLabel(r.p).padEnd(20)}${r.out.toFixed(0).padEnd(10)}${r.win.toFixed(0)}%`,
      )
    }
    const vals = list.map(key)
    console.log(
      `  spread ${(Math.max(...vals) / Math.max(1e-9, Math.min(...vals))).toFixed(2)}x` +
        `  (${Math.max(...vals).toFixed(2)} vs ${Math.min(...vals).toFixed(2)})`,
    )
  }
}


// --- what a mechanic is worth -----------------------------------------------
//
// Win rates cannot say which rung a raid is actually learning: a boss's
// mechanics arrive together, so the table above reports the sum and nothing
// about the parts. This runs each of them alone, twice — once against a raid
// that has never seen the fight and once against one that has — and reports
// the gap between how many died.
//
// Ten-man rather than twenty-five, and heroic so that every rung of every
// ladder is in play. Twenty-five saturates: the Warden's puddle wipes a raid
// that has practised as reliably as one that has not, so the gap reads zero
// for the mechanic that teaches most. A rung has to be survivable by somebody
// before it can measure who.
//
// That gap is the only thing here that measures teaching, and it is not what
// `mechanicHits` measures. A sweep lands seven times a pull and the gap is
// zero: you are in reach or you are not, and practice does not move it. The
// Tidebreaker's cone lands four tenths of a time and the gap is twenty-nine,
// because what it costs is not the hit, it is having to be somewhere else.
// Reading the hit count instead is how four separate rounds of tuning in this
// file's history went after the wrong mechanic.
const TEACH_RUNS = 30
if (want('mechanic')) {
  console.log(
    `\nmechanic / boss        hits    unpractised  practised   teaches` +
      `\n(${TEACH_RUNS} pulls a row at 10 heroic, one mechanic at a time. ` +
      `The two columns are paired -- same seed, same fight, only practice ` +
      `differs -- so most of what looks like variance here cancels inside ` +
      `the pair and the gap is far tighter than either column. ` +
      `scripts/teachprobe.ts prints the bar that belongs to it.)`,
  )
  for (let e = 0; e < ENCOUNTERS.length; e++) {
    // A ten-man heroic buys four rungs, so a boss's fifth is not in the kit at
    // all and filtering to it leaves an empty fight. Saying so beats printing
    // a zero that reads like a finding.
    const reached = encounterKit(ENCOUNTERS[e]!, 10, 'heroic')
    for (const mech of ENCOUNTERS[e]!.ladder) {
      if (!reached.includes(mech)) {
        console.log(`${mech} / ${ENCOUNTERS[e]!.short}`.padEnd(23), '   —  a ten-man heroic never meets it')
        continue
      }
      let raw = 0
      let green = 0
      let veteran = 0
      for (let n = 0; n < TEACH_RUNS; n++) {
        const seed = 3000 + n * 7919
        for (const attempt of [0, 8]) {
          const s = unattended(
            createState(seed, attempt, autoParty(10, dps('mage')), 'heroic', e),
          )
          s.only = mech
          s.countdown = 0
          const rng = new Rng(seed + 7919)
          while (s.outcome === 'ongoing' && s.time < encounterAt(e).enrage + 60) {
            step(s, { moveX: 0, moveY: 0, pressed: [] }, rng)
          }
          const party = s.actors.filter((a) => a.faction === 'party')
          const dead = party.filter((a) => !a.alive).length / party.length
          if (attempt === 0) {
            green += dead
            for (const a of party) raw += s.tally[a.id]!.mechanicHits / party.length
          } else veteran += dead
        }
      }
      const green0 = (green / TEACH_RUNS) * 100
      const vet = (veteran / TEACH_RUNS) * 100
      console.log(
        `${mech} / ${ENCOUNTERS[e]!.short}`.padEnd(23),
        (raw / TEACH_RUNS).toFixed(1).padStart(4),
        `${green0.toFixed(0)}%`.padStart(12),
        `${vet.toFixed(0)}%`.padStart(11),
        `${(green0 - vet).toFixed(0)}pp`.padStart(9),
      )
    }
  }
}

// Win rate says whether the rules are even. It says nothing about whether the
// match was worth playing: a lead taken in the first ten seconds and held is
// the same hundred percent as one that changed hands four times. The three
// columns after `deaths` are the ones that can tell those apart — how often
// the lead changed, how often the thing that scores changed hands, and how far
// around the map the fight actually went.
if (want('bg')) console.log(
  `\nbattleground           player     win%     avgTime  deaths  leadChg  turnover  spread` +
    `\n(${BG_RUNS} matches a row; two standard errors on win% is about ` +
    `${(2 * Math.sqrt(0.25 / BG_RUNS) * 100).toFixed(0)} points)`,
)
if (want('bg')) for (const bg of BATTLEGROUNDS) {
  for (const drive of DRIVES) {
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
