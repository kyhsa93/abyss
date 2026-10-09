import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
  RAID_SIZES,
  SPEC_OPTIONS,
  type DifficultyId,
  type Pick,
  type RaidSize,
  makeSlots,
  specLabel,
  specOf,
} from '../src/sim/classes'
import type { PlayerInput, SimState } from '../src/sim/types'
import { autoPress } from '../src/sim/autocast'
import { boss as bossOf } from '../src/sim/combat'
import { BG_DRIVE_COUNT, BOSS_PIECES, COMPOSITION_ROWS, REWARD_DRIVE_COUNT, SIZE_PIECES, rowFile } from './shardplan'

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
  /**
   * The player's own bill, which is the one thing every other row here averages
   * away. The party's numbers say whether the raid coped; these say whether the
   * body a person steers was doing anything.
   */
  playerHits: number
  playerTaken: number
  playerDied: boolean
  /** Party bodies dead at the end of the pull, the player's slot included. */
  partyDeaths: number
  /**
   * The lowest the raid's pooled health got during the pull, as a percentage of
   * its pooled maximum (sum of hp over sum of maxHp across the whole party side,
   * the dead counted as zero), to one decimal. Pooled: one body at the floor is
   * averaged into everyone else.
   */
  minRaidHp: number
  minMemberHp: number
}

/**
 * How the player's own slot is driven.
 *
 * `played` is the stand-in above: out of any puddle, rotation on cooldown. `idle`
 * is a body that is still the player's and does nothing at all -- no movement, no
 * presses. The pair is the only way to ask whether a fight is worth playing, and
 * it is deliberately not `unattended`, which hands the slot to the AI.
 */
type RaidDrive = 'played' | 'idle'

function run(
  seed: number,
  attempt: number,
  party?: Pick[],
  difficulty: DifficultyId = 'normal',
  encounter = 0,
  drive: RaidDrive = 'played',
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
  let minRaidHp = 100
  let minMemberHp = 100

  while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage + 60) {
    const pressed: number[] = []
    // Fire abilities roughly on cooldown.
    if (drive === 'played') {
      if (ticks % 45 === 0) pressed.push(0)
      if (ticks % 360 === 0) pressed.push(1)
      if (ticks % 540 === 0) pressed.push(2)
    }

    // A tick with nothing on the floor is a tick nobody should be running.
    const quiet = s.ground.length === 0
    const before = new Map(s.actors.map((a) => [a.id, { x: a.pos.x, y: a.pos.y }]))

    step(s, drive === 'played' ? playerInput(s, pressed) : { moveX: 0, moveY: 0, pressed }, rng)
    ticks++

    let hpNow = 0
    let hpMax = 0
    for (const a of s.actors) {
      if (a.faction !== 'party') continue
      hpNow += a.alive ? a.hp : 0
      hpMax += a.maxHp
      if (a.maxHp > 0) minMemberHp = Math.min(minMemberHp, ((a.alive ? a.hp : 0) / a.maxHp) * 100)
    }
    if (hpMax > 0) minRaidHp = Math.min(minRaidHp, (hpNow / hpMax) * 100)

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
      // Anything on the floor that has gone off. It used to name the pool,
      // because a growing ring is also "detonated" and its radius covers the
      // arena, which marked the whole party as standing in fire. Both of those
      // shapes are gone: what is left is floor that burns where it landed.
      const inside = s.ground.some(
        (g) =>
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

  // The player's slot, by the ledger the fight writes and never reads back.
  const me = s.actors.find((a) => a.isPlayer)
  const bill = me ? s.tally[me.id] : undefined
  return {
    outcome: s.outcome,
    time: Math.round(s.time * 10) / 10,
    bossPct: Math.round((fought.hp / fought.maxHp) * 1000) / 10,
    inPuddle: pct,
    travel,
    idleTravel,
    deaths,
    playerHits: bill?.mechanicHits ?? 0,
    playerTaken: Math.round(bill?.damageTaken ?? 0),
    playerDied: me !== undefined && !me.alive,
    partyDeaths: Object.keys(deaths).length + (me !== undefined && !me.alive ? 1 : 0),
    minRaidHp: Math.round(minRaidHp * 10) / 10,
    minMemberHp: Math.round(minMemberHp * 10) / 10,
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
/**
 * Whether this run is the one that prints that block.
 *
 * A prefix rather than an equality, and the reason is the size table. It is
 * three quarters of the file's cost and it was sharded one shard a boss, which
 * was the right grain while the shards all ran on the four cores of one
 * machine: eight shards, four at a time, two waves. It is the wrong grain now
 * that a shard is a whole runner — a runner sitting on three idle cores while
 * the fourth grinds through six cells of twenty-five-man pulls is most of an
 * hour bought and not used.
 *
 * So the tags go down to the cell — `size:3:25:heroic` — and a prefix match
 * means `size:3` still selects that whole boss and an empty shard still selects
 * everything. Nothing that asked for a shard before has to know.
 */
const want = (tag: string): boolean =>
  SHARD === '' || SHARD === tag || tag.startsWith(`${SHARD}:`)

/**
 * A ceiling on the pulls of every table that is cut into pieces, for one
 * purpose: proving a cut table is the uncut one. The whole of them is an hour
 * on a core and cannot be run twice to compare, so `ABYSS_VERIFY` (in
 * `harnessrun.ts`) runs both ways with two pulls a row and diffs the text. The
 * headers print the real number of pulls, so a table made this way says so.
 * Unset, or not a whole number of at least one, is every pull -- which is what
 * a build runs. Nothing else may set it.
 */
const RUNS_CAP = (() => {
  const n = Number(process.env.ABYSS_RUNS ?? '')
  return Number.isInteger(n) && n >= 1 ? n : Infinity
})()
const capped = (n: number): number => Math.min(n, RUNS_CAP)

/**
 * Whether this run is that tag or anything inside it: `want` for a tag the run
 * is a parent of, and also for a tag the run is a piece of (`reward:6:1` is
 * inside `reward:6`).
 */
const touches = (tag: string): boolean => want(tag) || SHARD.startsWith(`${tag}:`)

/**
 * The pulls of a row that is cut by pull, as numbers, in the order a single
 * process makes them -- or `null` when this run was one piece of the row and
 * has printed its share instead.
 *
 * A row that is an average of its pulls cannot be pasted back with `cat`, and
 * adding partial sums is not adding the pulls: float addition is not
 * associative, and the row's `toFixed` would one day land on the other side of
 * a rounding. So a piece (`size:6:25:normal:2`) prints the raw numbers of every
 * `pieces`th pull (`index n n n`, one line a pull, JS number strings, which
 * round-trip exactly), `<tag>:merge` reads all of them back, and the caller
 * adds them in pull order -- the order the single process adds them in. Pulls
 * are dealt round-robin because the later attempts are not the earlier ones'
 * length.
 */
function pullsOf(tag: string, count: number, pieces: number, pull: (at: number) => number[]): number[][] | null {
  const rest = SHARD.startsWith(`${tag}:`) ? SHARD.slice(tag.length + 1) : ''
  const piece = /^\d+$/.test(rest) ? Number(rest) : null
  if (piece !== null && (pieces === 0 || piece >= pieces)) throw new Error(`${tag} has no piece ${piece}`)
  if (rest === 'merge' && pieces === 0) throw new Error(`${tag} is not cut into pieces`)
  const all = new Array<number[]>(count)
  if (rest === 'merge') {
    for (let k = 0; k < pieces; k++) {
      const file = resolve(process.cwd(), process.env.ABYSS_ROWS ?? 'rows', rowFile(`${tag}:${k}`))
      for (const line of readFileSync(file, 'utf8').split('\n').filter((l) => l !== '')) {
        const nums = line.split(' ').map(Number)
        const at = nums[0]!
        if (nums.some((v) => !Number.isFinite(v)) || !(at >= 0 && at < count) || all[at] !== undefined) {
          throw new Error(`${file} holds a pull that is not numbers or is counted twice: ${line}`)
        }
        all[at] = nums.slice(1)
      }
    }
  } else {
    for (let at = 0; at < count; at++) {
      if (piece !== null && at % pieces !== piece) continue
      all[at] = pull(at)
    }
    if (piece !== null) {
      process.stdout.write(all.flatMap((nums, at) => (nums === undefined ? [] : [`${at} ${nums.join(' ')}\n`])).join(''))
      return null
    }
  }
  for (let at = 0; at < count; at++) if (all[at] === undefined) throw new Error(`${tag} came back with pull ${at} missing`)
  return all
}

const ATTEMPTS = [0, 4, 8]

/** Compositions a player might actually build, including bad ones. */
const dps = (classId: Pick['classId']): Pick => pickFor(classId, 'dps')!
const heal = (classId: Pick['classId']): Pick => pickFor(classId, 'healer')!
const tank = (classId: Pick['classId']): Pick => pickFor(classId, 'tank')!

/**
 * Compositions a player might actually build, including bad ones.
 *
 * Ten, which is the smallest raid there is. They were fives, and a five
 * stopped being a raid the day the five-man went away — the whole table was
 * measuring a setting nobody can play, and every row of it read as nought per
 * cent once the fights stopped hiding mechanics from small rosters.
 *
 * The shapes are the same shapes at the new size: what a raid is meant to
 * field, one short of a tank, one short of a healer, and the two that are all
 * of one reach.
 */
const PARTIES: Array<{ label: string; party: Pick[] }> = [
  {
    label: 'default  2t 2h 6d',
    party: [
      dps('mage'), tank('warrior'), tank('druid'), heal('priest'), heal('paladin'),
      dps('hunter'), dps('rogue'), dps('shaman'), dps('warlock'), dps('druid'),
    ],
  },
  {
    label: 'three heals 2t 3h 5d',
    party: [
      dps('mage'), tank('warrior'), tank('druid'), heal('priest'), heal('paladin'),
      heal('shaman'), dps('hunter'), dps('rogue'), dps('warlock'), dps('druid'),
    ],
  },
  {
    label: 'one healer 2t 1h 7d',
    party: [
      dps('mage'), tank('warrior'), tank('druid'), heal('priest'),
      dps('hunter'), dps('rogue'), dps('shaman'), dps('warlock'), dps('druid'), dps('paladin'),
    ],
  },
  {
    label: 'one tank  1t 2h 7d',
    party: [
      dps('mage'), tank('warrior'), heal('priest'), heal('paladin'),
      dps('hunter'), dps('rogue'), dps('shaman'), dps('warlock'), dps('druid'), dps('mage'),
    ],
  },
  {
    label: 'all melee 2t 2h 6d',
    party: [
      dps('rogue'), tank('warrior'), tank('druid'), heal('priest'), heal('paladin'),
      dps('rogue'), dps('warrior'), dps('shaman'), dps('druid'), dps('paladin'),
    ],
  },
  {
    label: 'all caster 2t 2h 6d',
    party: [
      dps('mage'), tank('warrior'), tank('druid'), heal('priest'), heal('paladin'),
      dps('mage'), dps('warlock'), dps('shaman'), dps('druid'), dps('priest'),
    ],
  },
  {
    label: 'druid tank + shaman',
    party: [
      dps('mage'), tank('druid'), tank('warrior'), heal('shaman'), heal('priest'),
      dps('priest'), dps('paladin'), dps('hunter'), dps('rogue'), dps('warlock'),
    ],
  },
]

const RUNS = capped(60)
// A shard a row (`composition:3`), and `composition` still prints all of them:
// the header belongs to the first row's shard, and a row reads nothing from the
// one above it, so the pieces paste back with `cat`.
if (PARTIES.length !== COMPOSITION_ROWS) {
  throw new Error(`scripts/shardplan.ts says ${COMPOSITION_ROWS} compositions and there are ${PARTIES.length}`)
}
if (want('composition:0')) console.log('composition            ' + ATTEMPTS.map((a) => `pull${a + 1}`.padEnd(9)).join('') + 'avgTime')
for (let row = 0; row < PARTIES.length; row++) {
  if (!want(`composition:${row}`)) continue
  const { label, party } = PARTIES[row]!
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
const BOSS_RUNS = capped(40)
// A shard a boss (`boss:3`), cut the way the composition table is, and the
// longest of them cut again by pull.
if (want('boss:0')) console.log('\nboss                   ' + ATTEMPTS.map((a) => `pull${a + 1}`.padEnd(9)).join('') + 'avgTime  enrage%')
for (let i = 0; i < ENCOUNTERS.length; i++) {
  if (!touches(`boss:${i}`)) continue
  const pulls = pullsOf(`boss:${i}`, ATTEMPTS.length * BOSS_RUNS, BOSS_PIECES[i] ?? 0, (at) => {
    const r = run(1000 + (at % BOSS_RUNS) * 137, ATTEMPTS[Math.floor(at / BOSS_RUNS)]!, PARTIES[0]!.party, 'normal', i)
    return [r.outcome === 'victory' ? 1 : 0, r.outcome === 'enrage' ? 1 : 0, r.time]
  })
  if (pulls === null) continue
  const cells: string[] = []
  let time = 0
  let total = 0
  let enraged = 0
  ATTEMPTS.forEach((_, a) => {
    let wins = 0
    for (let n = 0; n < BOSS_RUNS; n++) {
      const [won, enrage, took] = pulls[a * BOSS_RUNS + n]!
      if (won === 1) wins++
      if (enrage === 1) enraged++
      time += took!
      total++
    }
    cells.push(`${Math.round((wins / BOSS_RUNS) * 100)}%`.padEnd(9))
  })
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
const SIZE_RUNS = capped(40)
const SIZE_ATTEMPTS = [0, 8]
// The header belongs to the first cell of the first boss, which is the shard
// that prints the first row under it.
if (SIZE_PIECES[`size:0:${RAID_SIZES[0]}:normal`] !== undefined) {
  throw new Error('the cell that carries the size table header cannot be cut into pieces')
}
if (want(`size:0:${RAID_SIZES[0]}:normal`)) console.log(
  '\nboss / size / difficulty  ' +
    SIZE_ATTEMPTS.map((a) => `pull${a + 1}`.padEnd(9)).join('') +
    'avgTime  bossHP%  kit' +
    `\n(${SIZE_RUNS} pulls a cell; two standard errors on a win rate is about ` +
    `${(2 * Math.sqrt(0.25 / SIZE_RUNS) * 100).toFixed(0)} points)`,
)
// A big cell is cut by pull, and put back by `size:6:25:normal:merge`.
for (let i = 0; i < ENCOUNTERS.length; i++) {
  for (const size of RAID_SIZES) {
    for (const difficulty of ['normal', 'heroic'] as DifficultyId[]) {
      const cell = `size:${i}:${size}:${difficulty}`
      if (!touches(cell)) continue
      const party = autoParty(size, dps('mage'))
      const pulls = pullsOf(cell, SIZE_ATTEMPTS.length * SIZE_RUNS, SIZE_PIECES[cell] ?? 0, (at) => {
        const r = run(1000 + (at % SIZE_RUNS) * 137, SIZE_ATTEMPTS[Math.floor(at / SIZE_RUNS)]!, party, difficulty, i)
        return [r.outcome === 'victory' ? 1 : 0, r.time, r.bossPct]
      })
      if (pulls === null) continue
      const cells: string[] = []
      let time = 0
      let left = 0
      let total = 0
      SIZE_ATTEMPTS.forEach((_, a) => {
        let wins = 0
        for (let n = 0; n < SIZE_RUNS; n++) {
          const [won, took, bossLeft] = pulls[a * SIZE_RUNS + n]!
          if (won === 1) wins++
          time += took!
          left += bossLeft!
          total++
        }
        cells.push(`${Math.round((wins / SIZE_RUNS) * 100)}%`.padEnd(9))
      })
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
/**
 * The formation that party actually stands in, which is its own.
 *
 * It was `SLOTS`, the five the module keeps for a battleground team, and the
 * sweep read a name off slot six of five the moment the default composition
 * became a raid of ten. The build caught it, in the one shard nothing else
 * runs.
 */
const detailSlots = makeSlots(detailParty.length)

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
  const slot = detailSlots[i]!
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
const BG_RUNS = capped(90)

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
//
// The two environment knobs below exist for one caller: the build's
// `Verify spec parts match harness` step, which has to prove the split table
// equals the single-process one and cannot afford twenty-two minutes to do it.
// Unset they are 20 pulls across every boss, which is the table the band reads.
const envCount = (name: string, whole: number): number => {
  const n = Number(process.env[name] ?? '')
  return Number.isInteger(n) && n >= 1 && n <= whole ? n : whole
}
const SPEC_RUNS = envCount('ABYSS_SPEC_RUNS', 20)
const SPEC_BOSSES = envCount('ABYSS_SPEC_BOSSES', ENCOUNTERS.length)
const SPEC_SIZE: RaidSize = 10
// The table is one shard on a person's terminal and seventeen in the build,
// one a spec: `spec:i` measures SPEC_OPTIONS[i] and prints its four numbers on
// one line, and `spec:merge` reads those seventeen lines back and prints the
// table. Both go through the same sort-and-print below, so the split table is
// the single one by construction rather than by a second copy of the code.
const specShard = /^spec:(\d+)$/.exec(SHARD)
const specRowFile = (i: number): string => resolve(process.cwd(), process.env.ABYSS_ROWS ?? 'rows', rowFile(`spec:${i}`))
if (want('spec') || specShard !== null || SHARD === 'spec:merge') {
  const roleOf = (p: Pick) => specOf(p).role
  /**
   * The raid the spec under test is dropped into, and the slot it lands in.
   *
   * A real composition rather than nine copies of one spec, and that is the
   * whole of what this fixes. The old backdrop was two of the first tank, two
   * of the first healer and six of the first damage spec -- which is a warrior
   * tank, a paladin healer and six warrior damage: a ten-man with no ranged
   * damage in it at all, built out of the weakest damage spec on the table.
   *
   * Measured, that raid wins the first boss and nothing else. Twenty pulls a
   * boss at ten normal: 100%, 10%, 0%. The same size and difficulty with
   * `autoParty`'s mix reads 100%, 100%, 100%, and pressing the raid's
   * cooldowns moves the uniform one by four points -- so what the band was
   * reading was the backdrop, not the spec. Thirteen of fourteen specs failed
   * it at once, in a band of 33 to 47, which cannot mean thirteen specs are
   * traps.
   *
   * It passed for years because there were eight bosses and five of them were
   * invented and easy; the average carried it. Cutting the roster to three
   * took the carry away. `rendercheck` already had the rule written down, in
   * the note above the damage spread: a party built out of one spec "loses for
   * reasons that are not the spec's".
   *
   * `autoParty` puts the spec under test at slot zero and fills the other nine
   * by role, in a fixed order, so the backdrop is identical for every spec of
   * a given role -- which is the property the old lineup was reaching for.
   */
  const SLOT = 0
  const lineup = (test: Pick): Pick[] => autoParty(SPEC_SIZE, test)

  const measure = (test: Pick) => {
    const role = roleOf(test)
    let out = 0
    let taken = 0
    let healedBack = 0
    let wins = 0
    let runs = 0
    for (let boss = 0; boss < SPEC_BOSSES; boss++) {
      // On stderr, so the build log says which boss of which spec is the
      // expensive one; stdout is the table and does not move.
      const began = Date.now()
      for (let n = 0; n < SPEC_RUNS; n++) {
        const seed = 3000 + n * 7919 + boss * 131
        const s = unattended(createState(seed, 6, lineup(test), 'normal', boss))
        s.countdown = 0
        const rng = new Rng(seed + 7919)
        const me = s.actors.filter((a) => a.faction === 'party')[SLOT]!
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
      console.error(`spec ${specLabel(test)}|${ENCOUNTERS[boss]!.name}|${Date.now() - began}`)
    }
    return { out: out / runs, taken: (taken / runs) * 100, healedBack: healedBack / runs, win: (wins / runs) * 100 }
  }

  type Measured = ReturnType<typeof measure>
  const KEYS = ['out', 'taken', 'healedBack', 'win'] as const
  let measured: Measured[]
  if (specShard !== null) {
    const i = Number(specShard[1])
    const test = SPEC_OPTIONS[i]
    if (test === undefined) throw new Error(`no spec ${i}: there are ${SPEC_OPTIONS.length}`)
    const m = measure(test)
    // JS number strings round-trip exactly, so the merge sees the same doubles
    // a single process would have held.
    process.stdout.write(`${KEYS.map((k) => String(m[k])).join(' ')}\n`)
    measured = []
  } else if (SHARD === 'spec:merge') {
    measured = SPEC_OPTIONS.map((_, i) => {
      const nums = readFileSync(specRowFile(i), 'utf8').trim().split(' ').map(Number)
      if (nums.length !== KEYS.length || nums.some((n) => !Number.isFinite(n))) {
        throw new Error(`spec row ${i} is not four numbers: ${specRowFile(i)}`)
      }
      return { out: nums[0]!, taken: nums[1]!, healedBack: nums[2]!, win: nums[3]! }
    })
  } else {
    measured = SPEC_OPTIONS.map((p) => measure(p))
  }
  const rows = measured.map((m, i) => ({ p: SPEC_OPTIONS[i]!, role: roleOf(SPEC_OPTIONS[i]!), ...m }))
  // A `spec:i` shard has printed its one line and has no table to show.
  for (const role of specShard === null ? (['dps', 'healer', 'tank'] as const) : []) {
    const list = rows.filter((r) => r.role === role)
    const key = (r: (typeof list)[number]) => (role === 'tank' ? r.taken : r.out)
    list.sort((a, b) => (role === 'tank' ? key(a) - key(b) : key(b) - key(a)))
    const head =
      role === 'tank'
        ? 'spec                net taken %bar  healed/s   win%'
        : `spec                ${role === 'healer' ? 'hps' : 'dps'}       win%`
    console.log(`\nspec: ${role} (${SPEC_SIZE} normal, ${SPEC_BOSSES} bosses x ${SPEC_RUNS} pulls a row)`)
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
const TEACH_RUNS = capped(30)
// The header belongs to the first boss's shard, which is the one that prints
// the first row under it.
if (want('mechanic:0:0')) {
  console.log(
    `\nmechanic / boss        hits    unpractised  practised   teaches` +
      `\n(${TEACH_RUNS} pulls a row at 10 heroic, one mechanic at a time. ` +
      `The two columns are paired -- same seed, same fight, only practice ` +
      `differs -- so most of what looks like variance here cancels inside ` +
      `the pair and the gap is far tighter than either column. ` +
      `scripts/teachprobe.ts prints the bar that belongs to it.)`,
  )
}
for (let e = 0; e < ENCOUNTERS.length; e++) {
  // A shard a boss. This table was one shard and it was ten minutes on a core
  // — the longest thing left in the file once the spec sweep stopped being
  // run — and it splits with nothing to reconcile: each boss prints its own
  // rows and reads nothing from the boss before it.
  //
  // The rows of one boss are shards of their own where that boss is long
  // (`mechanic:6:2` is the third mechanic of the seventh boss): a row reads
  // nothing from the one above it either, so they paste back with `cat`.
  if (touches(`mechanic:${e}`)) {
    // A ten-man heroic buys four rungs, so a boss's fifth is not in the kit at
    // all and filtering to it leaves an empty fight. Saying so beats printing
    // a zero that reads like a finding.
    const reached = encounterKit(ENCOUNTERS[e]!, 10, 'heroic')
    for (const [k, mech] of ENCOUNTERS[e]!.kit.entries()) {
      if (!want(`mechanic:${e}:${k}`)) continue
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

// --- whether a raid is worth playing ----------------------------------------
//
// The battleground table below has asked this since it existed -- the same match
// with the player standing at the spawn against the player walking objectives --
// and no raid table ever has. Every band in `balancecheck` reads a win rate, and
// a fight that is won either way passes all of them while asking nothing.
//
// It came up by driving the first boss through a browser: a body that pressed
// nothing and never moved took 7.7 mechanic hits a minute over 116 seconds with
// the raid intact, and the same body dodging and running its rotation took 11.6
// over 140 and lost somebody. Both were victories, so nothing noticed.
//
// Heroic only, and that is not a saving. At normal a raid is meant to be
// winnable, so both rows sit near a hundred and the column has no room to say
// anything; heroic is where the fight is supposed to be a question. The idle row
// is a body that is still the player's -- zero movement, nothing pressed -- and
// not `unattended`, which hands the slot to the AI and answers a different and
// much kinder question.
const REWARD_RUNS = capped(90)
const REWARD_SIZE = RAID_SIZES[0]
const REWARD_DRIVES = ['played', 'idle'] as const
if (want('reward:0:0')) console.log(
  `\nraid                   drive      win%     avgTime  bossHP%  hits/min  taken/min  deaths` +
    `\n(${REWARD_RUNS} pulls a row at ${REWARD_SIZE}-man heroic; two standard errors on a ` +
    `difference of win rates is about ` +
    `${(2 * Math.sqrt(0.5 / REWARD_RUNS) * 100).toFixed(0)} points)`,
)
for (let i = 0; i < ENCOUNTERS.length; i++) {
  if (!touches(`reward:${i}`)) continue
  const party = autoParty(REWARD_SIZE, dps('mage'))
  if (REWARD_DRIVES.length !== REWARD_DRIVE_COUNT) {
    throw new Error(`scripts/shardplan.ts says ${REWARD_DRIVE_COUNT} drives and there are ${REWARD_DRIVES.length}`)
  }
  for (const [d, drive] of REWARD_DRIVES.entries()) {
    if (!want(`reward:${i}:${d}`)) continue
    let wins = 0
    let seconds = 0
    let left = 0
    let hits = 0
    let taken = 0
    let died = 0
    for (let n = 0; n < REWARD_RUNS; n++) {
      const r = run(1000 + n * 137, 0, party, 'heroic', i, drive)
      if (r.outcome === 'victory') wins++
      seconds += r.time
      left += r.bossPct
      hits += r.playerHits
      taken += r.playerTaken
      if (r.playerDied) died++
    }
    const perMin = (n: number) => (seconds > 0 ? ((n / seconds) * 60).toFixed(1) : '0')
    console.log(
      `${ENCOUNTERS[i]!.name}`.padEnd(23) +
        drive.padEnd(11) +
        `${Math.round((wins / REWARD_RUNS) * 100)}%`.padEnd(9) +
        `${Math.round(seconds / REWARD_RUNS)}`.padEnd(9) +
        `${Math.round(left / REWARD_RUNS)}%`.padEnd(9) +
        perMin(hits).padEnd(10) +
        perMin(taken).padEnd(11) +
        `${died}/${REWARD_RUNS}`,
    )
  }
}

// Win rate says whether the rules are even. It says nothing about whether the
// match was worth playing: a lead taken in the first ten seconds and held is
// the same hundred percent as one that changed hands four times. The three
// columns after `deaths` are the ones that can tell those apart — how often
// the lead changed, how often the thing that scores changed hands, and how far
// around the map the fight actually went.
if (want('bg:0:0')) console.log(
  `\nbattleground           player     win%     avgTime  deaths  leadChg  turnover  spread` +
    `\n(${BG_RUNS} matches a row; two standard errors on win% is about ` +
    `${(2 * Math.sqrt(0.25 / BG_RUNS) * 100).toFixed(0)} points)`,
)
if (DRIVES.length !== BG_DRIVE_COUNT) {
  throw new Error(`scripts/shardplan.ts says ${BG_DRIVE_COUNT} drives and there are ${DRIVES.length}`)
}
for (const [b, bg] of BATTLEGROUNDS.entries()) {
  for (const [d, drive] of DRIVES.entries()) {
    if (!want(`bg:${b}:${d}`)) continue
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

// --- the crisis table: what a pull feels like short of winning or losing ----
//
// Win rate is one bit per pull. These columns are the rest of the pull: how many
// pulls in a row a seed loses, how many bodies die, and how low the raid's
// pooled health gets. Same cell as the size table's 10-man heroic row (same
// party, seeds and drive), so `pullNo` 1 must read the same win% as that cell's
// pull1. A new table at the end rather than new attempts in the old ones, which
// would move the columns `balancecheck` reads by position.
//
// `memHpP10`/`memHpMin` are the same two cuts of the lowest HP any single body
// in the raid reached during the pull (a dead body counts as 0%): the pooled
// columns bury a near-death in the average. They are appended after `hpMin`, so
// the columns before them print the same bytes. `ABYSS_CRISIS_SEEDS` (default
// 40, which is what every build runs) widens the seed count for a hand-run
// re-measurement of the cells close to a threshold.
const CRISIS_DEFAULT_RUNS = 40
const asked = Number(process.env.ABYSS_CRISIS_SEEDS ?? '')
const CRISIS_RUNS = Number.isInteger(asked) && asked >= 1 ? asked : CRISIS_DEFAULT_RUNS
const CRISIS_ATTEMPTS = [0, 1, 2]
const CRISIS_SIZE = 10 satisfies RaidSize
if (want('crisis:0')) console.log(
  '\n' +
    'crisis'.padEnd(23) +
    'pullNo  win%  streak%  dead/pull  dead0%  hpP10  hpP50  hpMin  memHpP10  memHpMin' +
    `\n(${CRISIS_RUNS} seeds x pulls ${CRISIS_ATTEMPTS[0]! + 1}-${CRISIS_ATTEMPTS.length} a boss at ` +
    `${CRISIS_SIZE}-man heroic, drive played; two standard errors on a win rate is about ` +
    `${(2 * Math.sqrt(0.25 / CRISIS_RUNS) * 100).toFixed(0)} points)`,
)
for (let i = 0; i < ENCOUNTERS.length; i++) {
  if (!want(`crisis:${i}`)) continue
  const party = autoParty(CRISIS_SIZE, dps('mage'))
  // reports[attempt][n]; a seed's streak runs through its attempts in order.
  const reports = CRISIS_ATTEMPTS.map((attempt) =>
    Array.from({ length: CRISIS_RUNS }, (_, n) =>
      run(1000 + n * 137, attempt, party, 'heroic', i),
    ),
  )
  const lostSoFar = new Array<boolean>(CRISIS_RUNS).fill(true)
  CRISIS_ATTEMPTS.forEach((attempt, a) => {
    const rs = reports[a]!
    const wins = rs.filter((r) => r.outcome === 'victory').length
    let streak = 0
    rs.forEach((r, n) => {
      lostSoFar[n] = lostSoFar[n]! && r.outcome !== 'victory'
      if (lostSoFar[n]) streak++
    })
    const dead = rs.reduce((t, r) => t + r.partyDeaths, 0)
    const clean = rs.filter((r) => r.partyDeaths === 0).length
    const hp = rs.map((r) => r.minRaidHp).sort((x, y) => x - y)
    const at = (q: number) => `${Math.round(hp[Math.floor(q * CRISIS_RUNS)]!)}%`
    const mem = rs.map((r) => r.minMemberHp).sort((x, y) => x - y)
    const memAt = (q: number) => `${Math.round(mem[Math.floor(q * CRISIS_RUNS)]!)}%`
    const pct = (k: number) => `${Math.round((k / CRISIS_RUNS) * 100)}%`
    console.log(
      `${ENCOUNTERS[i]!.name}`.padEnd(23) +
        `${attempt + 1}`.padEnd(8) +
        pct(wins).padEnd(6) +
        pct(streak).padEnd(9) +
        (dead / CRISIS_RUNS).toFixed(1).padEnd(11) +
        pct(clean).padEnd(8) +
        at(0.1).padEnd(7) +
        at(0.5).padEnd(7) +
        `${Math.round(hp[0]!)}%`.padEnd(7) +
        memAt(0.1).padEnd(10) +
        `${Math.round(mem[0]!)}%`,
    )
  })
}
