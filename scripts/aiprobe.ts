// Whether the party's AI is actually playing the classes it was given.
//
// A win rate says the raid got there; it does not say the hunter spent the
// fight inside its own bow's near edge, or that the mage started four casts
// for every one it finished. Both of those are invisible in every other number
// this repo prints, and both are the difference between a class and a token
// that deals damage.
//
//   npx tsx scripts/aiprobe.ts [runs] [size] [difficulty]
import { Rng } from '../src/sim/rng'
import { createState } from '../src/sim/state'
import { step } from '../src/sim/sim'
import { ENCOUNTERS, encounterAt } from '../src/sim/encounters'
import { ABILITIES } from '../src/sim/abilities'
import { DEFAULT_PARTY, SPEC_OPTIONS, pickFor, roleOf, specOf, type DifficultyId, type Pick, type RaidSize } from '../src/sim/classes'
import type { Actor, PlayerInput, SimState } from '../src/sim/types'

/**
 * A raid with one of everything, rather than whatever `autoParty` rolled.
 *
 * The default composition is a legal raid and not a survey: it leaves whole
 * classes out, and a class left out is a class this cannot say anything about.
 */
function everyone(size: RaidSize): Pick[] {
  // The five-man the harness reads its per-member columns off, so the two can
  // be compared. Anything wider gets one of everything instead.
  if (size === 5) return DEFAULT_PARTY
  const party: Pick[] = [
    pickFor('warrior', 'tank')!,
    pickFor('paladin', 'tank')!,
    pickFor('priest', 'healer')!,
    pickFor('shaman', 'healer')!,
  ]
  const bench = SPEC_OPTIONS.filter((p) => roleOf(p) === 'dps')
  for (let i = 0; party.length < size; i++) party.push(bench[i % bench.length]!)
  return party
}

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

interface Tally {
  ticks: number
  /** Alive, off the global, not casting: a tick it could have used. */
  free: number
  /** Of those, ones where nothing it owns could reach anything. */
  outOfRange: number
  /** Of those, ones where the nearest thing was inside its weapon's near edge. */
  tooClose: number
  /** Of those, ones where it was already walking back out. */
  tooCloseMoving: number
  /** Ticks spent part-way through a cast. */
  casting: number
  started: number
  /** Ticks spent standing in a puddle that has gone off. */
  puddle: number
  /** Casts that vanished with real time left on them. */
  broken: number
  /** Of those, ones cut with nothing on the floor to run from. */
  tidying: number
  moving: number
}

const rows = new Map<string, Tally>()
const of = (id: string): Tally => {
  let t = rows.get(id)
  if (!t) {
    t = { ticks: 0, free: 0, outOfRange: 0, tooClose: 0, tooCloseMoving: 0, casting: 0, puddle: 0, started: 0, broken: 0, tidying: 0, moving: 0 }
    rows.set(id, t)
  }
  return t
}

/** The widest reach and the widest near edge of everything a spec can point. */
function reach(a: Actor): { far: number; near: number } {
  const kit = specOf({ classId: a.classId, spec: a.spec }).abilities
  const ids = [kit.filler, kit.overTime, kit.finisher, kit.attack].filter(
    (id): id is string => id !== null && id !== undefined,
  )
  let far = 0
  let near = 0
  for (const id of ids) {
    const ability = ABILITIES[id]
    if (!ability || ability.range <= 0) continue
    far = Math.max(far, ability.range)
    near = Math.max(near, ability.minRange ?? 0)
  }
  return { far, near }
}

const [, , runsArg, sizeArg, diffArg] = process.argv
const RUNS = Number(runsArg ?? 12)
const SIZE = Number(sizeArg ?? 10) as RaidSize
const DIFF = (diffArg ?? 'normal') as DifficultyId
const ATTEMPT = Number(process.argv[6] ?? 8)

for (let e = 0; e < ENCOUNTERS.length; e++) {
  for (let n = 0; n < RUNS; n++) {
    const seed = 1000 + n * 137
    const s = createState(seed, ATTEMPT, everyone(SIZE), DIFF, e)
    s.countdown = 0
    const rng = new Rng(seed + 7919)
    const was = new Map<number, { id: string | null; left: number; x: number; y: number }>()
    let ticks = 0
    while (s.outcome === 'ongoing' && s.time < encounterAt(s.encounter).enrage + 60) {
      const pressed: number[] = []
      if (ticks % 45 === 0) pressed.push(0)
      if (ticks % 360 === 0) pressed.push(1)
      if (ticks % 540 === 0) pressed.push(2)
      step(s, playerInput(s, pressed), rng)
      ticks++

      for (const a of s.actors) {
        if (a.faction !== 'party' || a.isPlayer) continue
        const id = `${a.classId}-${a.spec}`
        const t = of(id)
        const before = was.get(a.id)
        was.set(a.id, { id: a.castId, left: a.castRemaining, x: a.pos.x, y: a.pos.y })
        if (!a.alive) continue
        t.ticks++
        if (before && Math.hypot(a.pos.x - before.x, a.pos.y - before.y) > 0.5) t.moving++
        // Puddles only, like the harness: a shockwave is also "detonated" and
        // grows to cover the floor.
        if (
          s.ground.some(
            (g) =>
              g.kind === 'puddle' &&
              g.detonated &&
              Math.hypot(a.pos.x - g.pos.x, a.pos.y - g.pos.y) <= g.radius,
          )
        ) {
          t.puddle++
        }

        // A cast that vanished with real time left on it was cut short. The
        // tick before one lands has about a tick left, so anything past that
        // is a cast somebody walked out of.
        if (before?.id && a.castId === null && before.left > 0.05) {
          t.broken++
          // Nothing it had noticed to run from: this one was cut to tidy up a
          // position rather than to get out of the way of anything.
          if (a.ai !== null && a.ai.reactingTo === null) t.tidying++
        }
        if (before?.id !== a.castId && a.castId !== null) t.started++
        if (a.castId !== null) t.casting++
        if (a.castId !== null || a.gcd > 0) continue

        t.free++
        const { far, near } = reach(a)
        if (far <= 0) continue
        // Whether anything at all is at a distance this kit can use, rather
        // than whether the nearest thing is. A hunter with a thrall standing
        // on it shoots past the thrall at the boss, on purpose, and counting
        // the thrall would call that a hunter that cannot fire.
        let usable = false
        let closest = Infinity
        let farthest = 0
        for (const h of s.actors) {
          if (!h.alive || h.faction === 'party') continue
          const d = Math.hypot(a.pos.x - h.pos.x, a.pos.y - h.pos.y)
          closest = Math.min(closest, d - h.radius)
          farthest = Math.max(farthest, d - h.radius)
          if (d <= far + h.radius && d >= near + h.radius) usable = true
        }
        if (closest === Infinity || usable) continue
        if (farthest > far) t.outOfRange++
        else if (near > 0 && closest < near) {
          t.tooClose++
          if (before && Math.hypot(a.pos.x - before.x, a.pos.y - before.y) > 0.5) t.tooCloseMoving++
        }
      }
    }
  }
}

const pct = (n: number, d: number) => (d === 0 ? '   -  ' : `${((n / d) * 100).toFixed(1)}%`.padStart(6))

// Shares of the whole fight rather than of the free ticks, which sounds like a
// detail and is the difference between a reading and a mirage. "Free" is every
// tick a body could act, and a body that cannot reach anything cannot act, so
// it stays free — which makes out-of-range a huge share of free ticks for
// exactly the bodies that are never out of range for long. Against the fight
// it says what it means.
console.log(
  'spec'.padEnd(24) +
    'idle, nothing in reach'.padStart(24) +
    'idle, too close'.padStart(17) +
    'of those, walking out'.padStart(23) +
    'in fire'.padStart(9) +
    'casting'.padStart(9) +
    'casts cut'.padStart(11) +
    'of those, tidying'.padStart(19) +
    'moving'.padStart(8),
)
for (const [id, t] of [...rows].sort()) {
  console.log(
    id.padEnd(24) +
      pct(t.outOfRange, t.ticks).padStart(24) +
      pct(t.tooClose, t.ticks).padStart(17) +
      pct(t.tooCloseMoving, t.tooClose).padStart(23) +
      pct(t.puddle, t.ticks).padStart(9) +
      pct(t.casting, t.ticks).padStart(9) +
      pct(t.broken, t.started).padStart(11) +
      pct(t.tidying, t.broken).padStart(19) +
      pct(t.moving, t.ticks).padStart(8),
  )
}
