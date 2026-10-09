/**
 * The sim's state hash, for comparing two CPU architectures (#350, after #313).
 *
 * `dungeoncheck` failed on an arm64 laptop at a tick that passed on x64 CI, and
 * nothing has put the two machines' numbers side by side. This walks the
 * citadel's first hall (the walk `dungeoncheck` fails in: seed 7) for 2400 ticks
 * at each raid size, and hashes every party body's position, bit for bit, after
 * every tick. Nothing here changes the sim; it reads it.
 *
 * One line per size, one for the library maths, one for the whole, each starting
 * `ARCHPROBE` so it can be grepped out of a CI log and compared by eye:
 *
 *   npm run archprobe
 *
 * The same hash on x64 and arm64 means the sim is the same on both, and what
 * failed on the laptop was a threshold sitting on a boundary. A different hash
 * means a library call or a fused multiply-add differs, and the checkpoints
 * (every 200 ticks) name the span where the two walks part. The `math`
 * line hashes the library calls alone, so it says whether the libm differs
 * before any sim is involved.
 */
import { Rng } from '../src/sim/rng'
import { step } from '../src/sim/sim'
import { autoParty, pickFor } from '../src/sim/classes'
import { createCorridorState } from '../src/sim/state'
import { citadelTerrain, citadelWorld, hallFor, storeyOf } from '../src/dungeon'

const SEED = 7
const TICKS = 2400
/** A checkpoint every this many ticks, so two logs can be diffed down to the span where they part. */
const EVERY = 200
const LEG = 30 * 4

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

const legs = [
  { moveX: 0, moveY: -1 },
  { moveX: 1, moveY: 0 },
  { moveX: 0, moveY: 1 },
  { moveX: -1, moveY: 0 },
]

const hall = (size: 5 | 10 | 25) => {
  const ground = { ...hallFor('threshold', null, () => true), id: 'citadel', packs: [], terrain: citadelTerrain() }
  const s = createCorridorState(SEED, autoParty(size, pickFor('warrior', 'dps')!), ground, 'normal', 4, undefined, true)
  s.chamber = 'threshold'
  s.floor = citadelWorld()
    .filter((cell) => cell.storeys.includes(storeyOf('threshold')))
    .map((cell) => cell.room)
  return s
}

const arch = `${process.arch}/${process.platform} node ${process.version}`
const all = new Hash()
for (const size of [5, 10, 25] as const) {
  const s = hall(size)
  const rng = new Rng(SEED)
  const party = s.actors.filter((a) => a.faction === 'party')
  const run = new Hash()
  const marks: string[] = []
  for (let t = 0; t < TICKS; t++) {
    const leg = legs[Math.floor(t / LEG) % 4]!
    step(s, { moveX: leg.moveX, moveY: leg.moveY, pressed: [] }, rng)
    for (const a of party) {
      run.num(a.pos.x)
      run.num(a.pos.y)
    }
    if ((t + 1) % EVERY === 0) marks.push(run.hex())
  }
  console.log(`ARCHPROBE size ${size} seed ${SEED} ticks ${TICKS} hash ${run.hex()}  checkpoints ${marks.join(',')}`)
  all.num(parseInt(run.hex().slice(0, 8), 16))
  all.num(parseInt(run.hex().slice(8), 16))
}

// The library maths the sim still calls (#313 lists them), over a fixed grid of
// arguments: if these differ, the sim's walk can differ, and no sim code is needed to say so.
const m = new Hash()
for (let i = -200; i <= 200; i++) {
  const x = i * 0.0731 + 0.00137
  for (let j = 1; j <= 40; j++) {
    const y = j * 0.517 - 9.3
    m.num(Math.sin(x * j))
    m.num(Math.cos(x * j))
    m.num(Math.atan2(y, x))
    m.num(Math.hypot(x, y))
    m.num(Math.pow(Math.abs(x) + 1, y / 7))
    m.num(Math.sqrt(x * x + y * y))
  }
}
console.log(`ARCHPROBE math hash ${m.hex()}`)
console.log(`ARCHPROBE all ${arch} hash ${all.hex()} math ${m.hex()}`)
