/**
 * How far apart a raid walks, as numbers (#316).
 *
 * The pure half of the spacing checks in `dungeoncheck`: functions over
 * recorded positions that say whether a walk is a group of bodies or a pile
 * (`overlapping`), a fixed formation (`rankAgreement`), or a string of people
 * who have lost each other (`farthest`). They take positions and nothing else,
 * so the check can run them on invented walks and see that they condemn what
 * they should -- a measurement that cannot fail is not one.
 *
 * Deliberately knows nothing of `src/sim/spacing.ts`: the same checks have to
 * run against the code from before it existed, to prove they catch what it
 * fixes.
 */
import { DT, PARTY_RADIUS } from '../src/sim/constants'
import { step } from '../src/sim/sim'
import { hasteOf } from '../src/sim/combat'
import { awake } from '../src/sim/travel'
import type { Rng } from '../src/sim/rng'
import type { SimState, Vec2 } from '../src/sim/types'

/** Two bodies closer than this are standing inside each other. */
export const OVERLAP = PARTY_RADIUS * 2
/** Closer than this is not a gap: half a body of floor between two. */
export const GAP = 27
/** Closer than this for long is not walking past, it is standing on. */
export const ON_TOP = PARTY_RADIUS

/** One tick of a walk: where every member of the party was, and whether it was quiet. */
export interface Frame {
  tick: number
  /** Nothing awake anywhere in the walk -- the only ticks spacing is judged on. */
  quiet: boolean
  at: Vec2[]
  alive: boolean[]
  /** What a body's own step was this tick, which is the ruler for a shove. */
  stride: number[]
  /** Whether the body was heading somewhere on its own account -- following -- rather than standing or being shoved. */
  going: boolean[]
}

export interface Walk {
  frames: Frame[]
  /** Index into `at` of the body being followed. */
  leader: number
  /** Party members in `at` order, by actor id. */
  ids: number[]
}

/**
 * Steps a state and writes down where the party stood after every tick.
 *
 * `input` is asked for the stick before each tick, so a scenario is a function
 * of the tick and the state: walk at a door, stand still, set off again.
 */
export function record(
  s: SimState,
  rng: Rng,
  ticks: number,
  input: (tick: number, s: SimState) => { moveX: number; moveY: number },
): Walk {
  const party = s.actors.filter((a) => a.faction === 'party')
  const frames: Frame[] = []
  for (let t = 0; t < ticks; t++) {
    if (s.outcome !== 'ongoing') break
    const { moveX, moveY } = input(t, s)
    step(s, { moveX, moveY, pressed: [] }, rng)
    frames.push({
      tick: t,
      quiet: awake(s).length === 0,
      at: party.map((a) => ({ x: a.pos.x, y: a.pos.y })),
      alive: party.map((a) => a.alive),
      stride: party.map((a) => a.moveSpeed * DT * hasteOf(a)),
      going: party.map((a) => a.ai?.moveTarget != null),
    })
  }
  return {
    frames,
    leader: Math.max(0, party.findIndex((a) => a.isPlayer)),
    ids: party.map((a) => a.id),
  }
}

const gap = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y)

/** The quiet frames at or after a tick. */
export function quietFrom(frames: Frame[], from: number, to = Infinity): Frame[] {
  return frames.filter((f) => f.quiet && f.tick >= from && f.tick < to)
}

/** The share of body-pairs, over frames, standing nearer than `below`. */
export function pairShare(frames: Frame[], below: number): number {
  let near = 0
  let pairs = 0
  for (const f of frames) {
    for (let i = 0; i < f.at.length; i++) {
      if (!f.alive[i]) continue
      for (let j = i + 1; j < f.at.length; j++) {
        if (!f.alive[j]) continue
        pairs++
        if (gap(f.at[i]!, f.at[j]!) < below) near++
      }
    }
  }
  return pairs === 0 ? 0 : near / pairs
}

/** The longest run of consecutive frames in which any one pair stood nearer than `below`. */
export function longestRun(frames: Frame[], below: number): number {
  const run = new Map<number, number>()
  let worst = 0
  let last = -2
  for (const f of frames) {
    // A gap in the frames is a break in the run.
    if (f.tick !== last + 1) run.clear()
    last = f.tick
    for (let i = 0; i < f.at.length; i++) {
      if (!f.alive[i]) continue
      for (let j = i + 1; j < f.at.length; j++) {
        if (!f.alive[j]) continue
        const key = i * 64 + j
        if (gap(f.at[i]!, f.at[j]!) < below) {
          const n = (run.get(key) ?? 0) + 1
          run.set(key, n)
          worst = Math.max(worst, n)
        } else run.delete(key)
      }
    }
  }
  return worst
}

/** The nearest two have ever been in the frames. */
export function closest(frames: Frame[]): number {
  let near = Infinity
  for (const f of frames) {
    for (let i = 0; i < f.at.length; i++) {
      if (!f.alive[i]) continue
      for (let j = i + 1; j < f.at.length; j++) {
        if (f.alive[j]) near = Math.min(near, gap(f.at[i]!, f.at[j]!))
      }
    }
  }
  return near
}

/** The furthest any body is from the leader, over the frames. */
export function farthest(frames: Frame[], leader: number): number {
  let far = 0
  for (const f of frames) {
    for (let i = 0; i < f.at.length; i++) {
      if (i !== leader && f.alive[i]) far = Math.max(far, gap(f.at[i]!, f.at[leader]!))
    }
  }
  return far
}

/** Each body's mean distance from the leader over the frames; NaN for one never seen. */
export function meanFromLeader(frames: Frame[], leader: number, bodies: number): number[] {
  const sum = new Array<number>(bodies).fill(0)
  const n = new Array<number>(bodies).fill(0)
  for (const f of frames) {
    for (let i = 0; i < bodies; i++) {
      if (i === leader || !f.alive[i]) continue
      sum[i]! += gap(f.at[i]!, f.at[leader]!)
      n[i]!++
    }
  }
  return sum.map((v, i) => (n[i]! === 0 ? NaN : v / n[i]!))
}

/** Ranks, ties sharing the middle of the ranks they span. */
function ranks(values: number[]): number[] {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0])
  const out = new Array<number>(values.length).fill(0)
  let i = 0
  while (i < order.length) {
    let j = i
    while (j + 1 < order.length && order[j + 1]![0] === order[i]![0]) j++
    for (let k = i; k <= j; k++) out[order[k]![1]] = (i + j) / 2
    i = j + 1
  }
  return out
}

/**
 * How well one ordering of the bodies predicts another, from -1 to 1.
 *
 * Spearman's: the Pearson correlation of the ranks. The persistence of a
 * body's place in the walk -- who is forever behind -- read as how well the
 * first half of a walk orders them like the second.
 */
export function rankAgreement(a: number[], b: number[]): number {
  const keep = a.map((_, i) => i).filter((i) => !Number.isNaN(a[i]!) && !Number.isNaN(b[i]!))
  if (keep.length < 3) return NaN
  const ra = ranks(keep.map((i) => a[i]!))
  const rb = ranks(keep.map((i) => b[i]!))
  const mean = (keep.length - 1) / 2
  let num = 0
  let da = 0
  let db = 0
  for (let k = 0; k < keep.length; k++) {
    num += (ra[k]! - mean) * (rb[k]! - mean)
    da += (ra[k]! - mean) ** 2
    db += (rb[k]! - mean) ** 2
  }
  // Nobody ordered at all -- every body the same distance -- agrees with nothing.
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db)
}

/** How far each body moved on each tick of a window of frames, per body. */
export function stepsOf(frames: Frame[], body: number): number[] {
  const out: number[] = []
  for (let k = 1; k < frames.length; k++) {
    const a = frames[k - 1]!.at[body]!
    const b = frames[k]!.at[body]!
    out.push(gap(a, b))
  }
  return out
}

/** How many times a body's direction of travel turned back on itself. */
export function reversals(frames: Frame[], body: number): number {
  let turned = 0
  let px = 0
  let py = 0
  for (let k = 1; k < frames.length; k++) {
    const a = frames[k - 1]!.at[body]!
    const b = frames[k]!.at[body]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    // A creep of a few hundredths of a unit is a body standing still with
    // somewhere to be, not one turning round.
    if (dx * dx + dy * dy < 0.0025) continue
    if (px * dx + py * dy < 0) turned++
    px = dx
    py = dy
  }
  return turned
}

/** The last frame a body moved further than `over` in one tick, or -1. */
export function lastMoved(frames: Frame[], body: number, over: number): number {
  let last = -1
  for (let k = 1; k < frames.length; k++) {
    if (gap(frames[k - 1]!.at[body]!, frames[k]!.at[body]!) > over) last = frames[k]!.tick
  }
  return last
}

/** The first frame at or after `from` in which a body was heading somewhere on its own account, or -1. */
export function firstGoing(frames: Frame[], body: number, from: number): number {
  for (const f of frames) if (f.tick >= from && f.going[body]) return f.tick
  return -1
}

/** The first frame at or after `from` where a body moved further than `over` in one tick, or -1. */
export function firstMoved(frames: Frame[], body: number, from: number, over: number): number {
  for (let k = 1; k < frames.length; k++) {
    if (frames[k]!.tick >= from && gap(frames[k - 1]!.at[body]!, frames[k]!.at[body]!) > over) {
      return frames[k]!.tick
    }
  }
  return -1
}

export interface Limits {
  /** Share of pairs allowed under `OVERLAP`. */
  overlap: number
  /** Share allowed under `GAP`. */
  gap: number
  /** The longest a pair may stay under `ON_TOP`, in ticks. */
  onTop: number
}

/**
 * What is wrong with a stretch of walking, in words; nothing when it is fine.
 *
 * The frames are the ones to be judged -- the caller has already thrown away
 * the first seconds and anything not quiet.
 */
export function judgeSpacing(frames: Frame[], limits: Limits): string[] {
  const out: string[] = []
  if (frames.length === 0) return ['no quiet frames to judge']
  const over = pairShare(frames, OVERLAP)
  if (over > limits.overlap) out.push(`${(over * 100).toFixed(2)}% of pairs overlap (limit ${(limits.overlap * 100).toFixed(0)}%)`)
  const tight = pairShare(frames, GAP)
  if (tight > limits.gap) out.push(`${(tight * 100).toFixed(1)}% of pairs under ${GAP} (limit ${(limits.gap * 100).toFixed(0)}%)`)
  const stuck = longestRun(frames, ON_TOP)
  if (stuck > limits.onTop) out.push(`a pair stood on top of each other for ${stuck} ticks (limit ${limits.onTop})`)
  return out
}

/** A formation: the same places in the same order, half a walk after half a walk. */
export const FIXED_SLOTS = 0.95
/** And a walk with no memory at all: nobody is anybody's. */
export const SHUFFLED = 0.3
