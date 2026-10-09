/**
 * The sim's state hash, for comparing two CPU architectures (#350, after #313;
 * widened in #353).
 *
 * `dungeoncheck` failed on an arm64 laptop at a tick that passed on x64 CI, and
 * nothing had put the two machines' numbers side by side. This walks the
 * citadel's first hall (the walk `dungeoncheck` fails in) and fights the first
 * boss, and hashes every body's position, facing and hp, bit for bit, after
 * every tick. Nothing here changes the sim; it reads it.
 *
 *   npm run archprobe             the full probe (arch.yml)
 *   npm run archprobe -- --quick  seed 7, four-way walk, hall only (the Deploy
 *                                 log; a second or so, logging only)
 *
 * Full probe:
 *   hall    seeds 1-5 and 7, inputs still / diagonal / random, raid sizes 5, 10,
 *           25, HALL_TICKS ticks.
 *   battle  the same seeds and inputs, raid sizes 10 and 25, BATTLE_TICKS ticks
 *           from the first tick of the first boss's fight (countdown skipped).
 *   math    the library calls the sim makes (atan2, cos, sin, hypot, pow, sqrt),
 *           one hash per function, with the number of call sites in `src/sim`.
 *
 * The random input is a fixed sequence made by `Rng(INPUT_SEED)`, never
 * `Math.random`. INPUT_SEED, BATTLE_TICKS and the grids below are recorded on
 * #353 and are not to be changed: a change makes the new verdict incomparable
 * with the old.
 *
 * One `ARCHPROBE all` line closes the output, `key=hash` pairs, so a workflow
 * can compare two machines key by key. Verdicts are drawn from the sim keys
 * (hall/battle pos, facing, hp); the math keys are recorded per function and
 * do not decide anything (#353).
 */
import { Rng } from '../src/sim/rng'
import { step } from '../src/sim/sim'
import { autoParty, pickFor } from '../src/sim/classes'
import { createCorridorState, createState } from '../src/sim/state'
import type { SimState } from '../src/sim/types'
import { citadelTerrain, citadelWorld, hallFor, storeyOf } from '../src/dungeon'

const QUICK = process.argv.includes('--quick')

/** Seeds of the full probe. Seed 7 is the one `dungeoncheck` failed in. */
const SEEDS = QUICK ? [7] : [1, 2, 3, 4, 5, 7]
const HALL_TICKS = 2400
/** Fight length, ticks after the boss fight starts: 20 s at 30 tick/s, inside the 300-900 bound set on #353. */
const BATTLE_TICKS = 600
/** Seed of the random input sequence. Fixed on #353; a change makes old verdicts incomparable. */
const INPUT_SEED = 0x353a
/** A checkpoint every this many ticks, so two logs can be diffed down to the span where they part. */
const EVERY = 200
const LEG = 30 * 4

/** How many places `src/sim` calls each library function (counted at #353; lawcheck's list). */
const SIM_CALLS = { atan2: 25, cos: 23, sin: 23, hypot: 28, pow: 1, sqrt: 12 }

const buf = new DataView(new ArrayBuffer(8))
/** FNV-1a over the 64 bits of each number, in two 32-bit lanes (no BigInt, so no engine-specific path). */
class Hash {
  a = 0x811c9dc5
  b = 0x01000193 ^ 0x9e3779b9
  num(n: number): void {
    buf.setFloat64(0, n)
    for (let i = 0; i < 8; i++) {
      const byte = buf.getUint8(i)
      this.a = Math.imul(this.a ^ byte, 0x01000193)
      this.b = Math.imul(this.b ^ byte ^ 0x5b, 0x01000193)
    }
  }
  hex(): string {
    return (this.a >>> 0).toString(16).padStart(8, '0') + (this.b >>> 0).toString(16).padStart(8, '0')
  }
}

type Move = { moveX: number; moveY: number }
const FOUR_WAY: Move[] = [
  { moveX: 0, moveY: -1 },
  { moveX: 1, moveY: 0 },
  { moveX: 0, moveY: 1 },
  { moveX: -1, moveY: 0 },
]
/** Eight directions and standing still. */
const NINE: Move[] = [
  { moveX: 0, moveY: 0 },
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => ({ moveX: Math.round(Math.cos((k * Math.PI) / 4)), moveY: Math.round(Math.sin((k * Math.PI) / 4)) })),
]

/** One move per tick, `length` ticks (or more): a direction held for 15-60 ticks, then another. */
function randomInputs(length: number): Move[] {
  const rng = new Rng(INPUT_SEED)
  const out: Move[] = []
  while (out.length < length) {
    const m = NINE[rng.int(NINE.length)]!
    const hold = 15 + rng.int(46)
    for (let i = 0; i < hold; i++) out.push(m)
  }
  return out
}

type Input = { name: string; at: (t: number) => Move }
const inputs = (length: number): Input[] => {
  const random = randomInputs(length)
  return [
    { name: 'still', at: () => ({ moveX: 0, moveY: 0 }) },
    { name: 'diagonal', at: () => ({ moveX: 1, moveY: 1 }) },
    { name: 'random', at: (t) => random[t]! },
  ]
}
const quickInput: Input = { name: 'fourway', at: (t) => FOUR_WAY[Math.floor(t / LEG) % 4]! }

const hall = (seed: number, size: 5 | 10 | 25) => {
  const ground = { ...hallFor('threshold', null, () => true), id: 'citadel', packs: [], terrain: citadelTerrain() }
  const s = createCorridorState(seed, autoParty(size, pickFor('warrior', 'dps')!), ground, 'normal', 4, undefined, true)
  s.chamber = 'threshold'
  s.floor = citadelWorld()
    .filter((cell) => cell.storeys.includes(storeyOf('threshold')))
    .map((cell) => cell.room)
  return s
}

/** The first boss's fight, begun at once (the countdown is skipped); the player's body takes the input, the rest of the raid plays itself. */
const battle = (seed: number, size: 10 | 25) => {
  const s = createState(seed, 1, autoParty(size, pickFor('warrior', 'dps')!), 'normal')
  s.countdown = 0
  return s
}

/** Position, facing and hp of every body, kept apart so each can be said to match or not. */
class Trio {
  pos = new Hash()
  face = new Hash()
  hp = new Hash()
  observe(s: SimState, only?: string): void {
    for (const a of s.actors) {
      if (only !== undefined && a.faction !== only) continue
      this.pos.num(a.pos.x)
      this.pos.num(a.pos.y)
      this.face.num(a.facing)
      this.hp.num(a.hp)
    }
  }
  fold(into: Trio): void {
    for (const [k, h] of [['pos', this.pos], ['face', this.face], ['hp', this.hp]] as const) {
      into[k].num(parseInt(h.hex().slice(0, 8), 16))
      into[k].num(parseInt(h.hex().slice(8), 16))
    }
  }
  text(): string {
    return `pos ${this.pos.hex()} facing ${this.face.hex()} hp ${this.hp.hex()}`
  }
}

function walk(kind: string, s: SimState, seed: number, input: Input, size: number, ticks: number, only: string | undefined, total: Trio): void {
  const rng = new Rng(seed)
  const run = new Trio()
  const marks: string[] = []
  for (let t = 0; t < ticks; t++) {
    const m = input.at(t)
    step(s, { moveX: m.moveX, moveY: m.moveY, pressed: [] }, rng)
    run.observe(s, only)
    if ((t + 1) % EVERY === 0) marks.push(run.pos.hex())
  }
  console.log(`ARCHPROBE ${kind} seed ${seed} input ${input.name} size ${size} ticks ${ticks} ${run.text()}  checkpoints ${marks.join(',')}`)
  run.fold(total)
}

const arch = `${process.arch}/${process.platform} node ${process.version}`
const hallTotal = new Trio()
const battleTotal = new Trio()
const list = QUICK ? [quickInput] : inputs(Math.max(HALL_TICKS, BATTLE_TICKS))
for (const seed of SEEDS) {
  for (const input of list) {
    for (const size of [5, 10, 25] as const) walk('hall', hall(seed, size), seed, input, size, HALL_TICKS, 'party', hallTotal)
    if (!QUICK) for (const size of [10, 25] as const) walk('battle', battle(seed, size), seed, input, size, BATTLE_TICKS, undefined, battleTotal)
  }
}

// The library maths the sim still calls (#313 lists them), over a fixed grid of
// arguments, one hash per function: if one differs, the sim's walk can differ,
// and no sim code is needed to say so. Recorded, not decided on (#353).
const fns = {
  sin: (x: number, _y: number, j: number) => Math.sin(x * j),
  cos: (x: number, _y: number, j: number) => Math.cos(x * j),
  atan2: (x: number, y: number) => Math.atan2(y, x),
  hypot: (x: number, y: number) => Math.hypot(x, y),
  pow: (x: number, y: number) => Math.pow(Math.abs(x) + 1, y / 7),
  sqrt: (x: number, y: number) => Math.sqrt(x * x + y * y),
}
const names = Object.keys(fns) as (keyof typeof fns)[]
const math = Object.fromEntries(names.map((n) => [n, new Hash()])) as Record<keyof typeof fns, Hash>
for (let i = -200; i <= 200; i++) {
  const x = i * 0.0731 + 0.00137
  for (let j = 1; j <= 40; j++) {
    const y = j * 0.517 - 9.3
    for (const n of names) math[n].num(fns[n](x, y, j))
  }
}
for (const n of names) console.log(`ARCHPROBE math ${n} hash ${math[n].hex()} sim-call-sites ${SIM_CALLS[n]}`)

const pairs = [
  `hall-pos=${hallTotal.pos.hex()}`,
  `hall-facing=${hallTotal.face.hex()}`,
  `hall-hp=${hallTotal.hp.hex()}`,
  ...(QUICK ? [] : [`battle-pos=${battleTotal.pos.hex()}`, `battle-facing=${battleTotal.face.hex()}`, `battle-hp=${battleTotal.hp.hex()}`]),
  ...names.map((n) => `math-${n}=${math[n].hex()}`),
]
console.log(`ARCHPROBE all ${arch} ${pairs.join(' ')}`)
