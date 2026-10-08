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
/**
 * Closer than this is not a gap: the line `spacing.ts` works to, less four.
 *
 * Thirty is a body (18) and two-thirds of one of floor between two, which is
 * where a walk read as a crowd on the glass and below which it read as a pile.
 * Written out here and not read off `spacing.ts`, because this file has to run
 * against code from before that one existed; `dungeoncheck` asserts that the
 * two agree.
 */
export const GAP = 30
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
  /** Share allowed under `line`. */
  gap: number
  /** The line a pair is under, when it is not `GAP`. */
  line?: number
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
  const line = limits.line ?? GAP
  const tight = pairShare(frames, line)
  if (tight > limits.gap) out.push(`${(tight * 100).toFixed(1)}% of pairs under ${line} (limit ${(limits.gap * 100).toFixed(0)}%)`)
  const stuck = longestRun(frames, ON_TOP)
  if (stuck > limits.onTop) out.push(`a pair stood on top of each other for ${stuck} ticks (limit ${limits.onTop})`)
  return out
}

/** A formation: the same places in the same order, half a walk after half a walk. */
export const FIXED_SLOTS = 0.95
/** And a walk with no memory at all: nobody is anybody's. */
export const SHUFFLED = 0.3

// --- the door -----------------------------------------------------------------

/**
 * The frames of a walk from the first one in which the leader is within `reach` of any of `doors`.
 *
 * "Any of them" and not the one the walk is heading for: the spacing gives way
 * at a door whichever door it is (`leaderAtDoor`), so this has to start where
 * that does or a walk past another door is judged by the wrong rule.
 */
export function doorWindow(walk: Walk, doors: Vec2[], reach: number): Frame[] {
  const near = walk.frames.findIndex((f) => doors.some((d) => gap(f.at[walk.leader]!, d) <= reach))
  return near < 0 ? [] : walk.frames.slice(near).filter((f) => f.quiet)
}

/** The first tick of a window to the last, counted: how long it took to get everybody to the door. */
export function ticksOf(frames: Frame[]): number {
  return frames.length === 0 ? 0 : frames[frames.length - 1]!.tick - frames[0]!.tick + 1
}

/** What a door asks of a raid of a given size (#316, 4a). */
export interface DoorLimits {
  /** Longest a single walk may spend in the door's reach, in ticks. */
  ticks: number
  /** Share of pairs allowed under `OVERLAP`. */
  overlap: number
  /** The longest one pair may stay under `OVERLAP`, in ticks. */
  overlapRun: number
  /** Pairs nearer than this, ever, are not allowed: a body on top of a body. */
  never: number
  /** Share of pairs allowed under 27. */
  tight: number
  /** The mean of all the walks' times at a door, when more than one is judged. */
  mean: number
}

/**
 * Twenty-five does not fit in front of a door at a body's width of floor between two (the half circle in front of it
 * is too small), so it is asked less: a body on a body is still forbidden, and
 * touching is let go only for a moment. Ten and five fit, and are asked as they always were.
 */
export function doorLimits(size: number): DoorLimits {
  return size >= 25
    ? { ticks: 180, overlap: 0.005, overlapRun: 10, never: 9, tight: 0.1, mean: 150 }
    : { ticks: 60, overlap: 0.05, overlapRun: Infinity, never: 20, tight: 0.1, mean: 60 }
}

/** What is wrong with the stretch of a walk at a door, in words; nothing when it is fine. */
export function judgeDoor(frames: Frame[], size: number): string[] {
  const out: string[] = []
  const limit = doorLimits(size)
  if (frames.length === 0) return ['the leader never got to the door']
  const took = ticksOf(frames)
  if (took > limit.ticks) out.push(`${took} ticks at the door (limit ${limit.ticks})`)
  const over = pairShare(frames, OVERLAP)
  if (over > limit.overlap) out.push(`${(over * 100).toFixed(2)}% of pairs overlap at the door (limit ${(limit.overlap * 100).toFixed(1)}%)`)
  const run = longestRun(frames, OVERLAP)
  if (run > limit.overlapRun) out.push(`a pair overlapped for ${run} ticks in a row at the door (limit ${limit.overlapRun})`)
  const crushed = pairShare(frames, limit.never)
  if (crushed > 0) out.push(`a pair was nearer than ${limit.never} at the door (nearest ${closest(frames).toFixed(1)})`)
  const tight = pairShare(frames, 27)
  if (tight > limit.tight) out.push(`${(tight * 100).toFixed(1)}% of pairs under 27 at the door (limit ${(limit.tight * 100).toFixed(0)}%)`)
  return out
}

/** The mean time at the door over several walks, against what the raid's size allows. */
export function judgeDoorMean(took: number[], size: number): string[] {
  if (took.length === 0) return ['no walk reached a door']
  const mean = took.reduce((a, b) => a + b, 0) / took.length
  const limit = doorLimits(size).mean
  return mean > limit ? [`${mean.toFixed(0)} ticks at the door on average (limit ${limit})`] : []
}

/** Whether a huddle of this width goes through a door of this reach with the margin to spare. */
export function doorFits(huddle: number, reach: number, margin = 11): boolean {
  return huddle <= reach - margin
}

// --- being held up, which is not the same as being told you have arrived --------

/**
 * How near another body has to be for a body that is not moving to be waiting on it.
 *
 * A line apart and a body's width over: past that nobody is in its way.
 */
export const WAITING_ON = GAP + 20

/**
 * The longest a body stood where it was while a long way from the leader and in nobody's way, over the frames, in ticks.
 *
 * Asked of where the body is and not of where it has been told to go: a body
 * that cannot get on is, by design, told it has arrived (`moveTarget` goes
 * null), so the walk's own account of itself cannot say it is stuck. "Standing
 * still" is a step of under a twentieth of a stride; "a long way" is further
 * than the door's reach; and "in nobody's way" is nobody within `WAITING_ON`
 * -- a body at the back of a crowd that the leader is pressed against a wall
 * ahead of, or in a file that has yet to unfold, is waiting its turn and not
 * stuck, and what is stuck is the body with open floor round it that does not
 * take a step (against a rock, or a wall, with nothing to stop it going round).
 */
export function longestStall(frames: Frame[], leader: number, farther: number): number {
  const run = new Map<number, number>()
  let worst = 0
  for (let k = 1; k < frames.length; k++) {
    const f = frames[k]!
    for (let i = 0; i < f.at.length; i++) {
      if (i === leader || !f.alive[i] || !frames[k - 1]!.alive[i]) {
        run.delete(i)
        continue
      }
      const moved = gap(frames[k - 1]!.at[i]!, f.at[i]!)
      const away = gap(f.at[i]!, f.at[leader]!)
      let waiting = false
      for (let j = 0; j < f.at.length && !waiting; j++) {
        waiting = j !== i && f.alive[j] === true && gap(f.at[i]!, f.at[j]!) < WAITING_ON
      }
      if (moved < 0.05 * f.stride[i]! && away > farther && !waiting) {
        const n = (run.get(i) ?? 0) + 1
        run.set(i, n)
        worst = Math.max(worst, n)
      } else run.delete(i)
    }
  }
  return worst
}

/**
 * How far along the leader's way the slowest living body got over the last `window` ticks, as a share of how far the leader did.
 *
 * Over the end of a walk and not the whole of it: a raid of twenty-five in a
 * file that two bodies wide allows is a file, and the last of it is as far
 * behind the leader as twenty-four gaps are long however well it walks. What
 * says somebody is pinned is that over the last seconds they went nowhere
 * while the leader went somewhere: that has them at the leader's pace (one) in
 * a file that is moving and near nothing in one that is stuck.
 */
export function leastProgress(frames: Frame[], leader: number, window = 90): number {
  if (frames.length < 2) return 1
  const a = frames[Math.max(0, frames.length - 1 - window)]!
  const z = frames[frames.length - 1]!
  const hx = z.at[leader]!.x - a.at[leader]!.x
  const hy = z.at[leader]!.y - a.at[leader]!.y
  const h = Math.hypot(hx, hy)
  if (h < 1e-6) return 1
  let least = Infinity
  for (let i = 0; i < z.at.length; i++) {
    if (i === leader || !z.alive[i] || !a.alive[i]) continue
    least = Math.min(least, ((z.at[i]!.x - a.at[i]!.x) * hx + (z.at[i]!.y - a.at[i]!.y) * hy) / (h * h))
  }
  return least === Infinity ? 1 : least
}

// --- the persistence of a body's place, one number a passage ----------------------

/** A passage on which the same bodies trail in the same order is a formation, whatever the middle of six says. */
export const PASSAGE_FIXED = 0.98

/** What is wrong with the passages' rank agreements, in words; nothing when it is fine. */
export function judgeRanks(rhos: number[]): string[] {
  const out: string[] = []
  if (rhos.length === 0) return ['no passage to judge']
  const sorted = [...rhos].sort((x, y) => x - y)
  const rho = (sorted[Math.floor((sorted.length - 1) / 2)]! + sorted[Math.ceil((sorted.length - 1) / 2)]!) / 2
  const all = rhos.map((r) => r.toFixed(2)).join(' ')
  if (!(rho >= SHUFFLED && rho <= FIXED_SLOTS)) out.push(`rank agreement ${rho.toFixed(2)} over ${rhos.length} passages (wanted ${SHUFFLED} to ${FIXED_SLOTS}; ${all})`)
  const fixed = rhos.filter((r) => r > PASSAGE_FIXED)
  if (fixed.length > 0) out.push(`${fixed.length} passage(s) above ${PASSAGE_FIXED}: the same bodies in the same order (${all})`)
  return out
}

// --- a stop ----------------------------------------------------------------------

/**
 * What is wrong with when the followers of a stopped leader last moved, in words.
 *
 * `last` is the last tick each follower moved (or -1 for one that did not), as
 * `lastMoved` gives it. At least half of them have to have moved at all: a
 * walk in which nobody does has nobody arriving, and a spread of arrivals
 * across nobody is no spread -- the check used to pass it.
 */
export function judgeArrival(last: number[]): string[] {
  const arrived = last.filter((n) => n >= 0)
  if (arrived.length < Math.ceil(last.length / 2)) return [`only ${arrived.length} of ${last.length} followers moved at all after the stop (wanted at least half)`]
  const range = Math.max(...arrived) - Math.min(...arrived)
  return range < 20 ? [`all arrived within ${range} ticks of one another (wanted 20 or more)`] : []
}

// --- the glass -------------------------------------------------------------------

/**
 * How far from the leader the furthest body is, against the edge of the screen, along each axis.
 *
 * `seenX` and `seenY` are how far from the leader the glass reaches, in world
 * units, to the side and up the screen. 1.0 is a body on the edge; over it is a
 * body off it. Along the axes and not in a circle because the glass is not one
 * (a phone held upright shows far more up it than across it), and a raid that
 * has strung out along the way it is walking is judged by the way it is walking.
 */
export function glassRatio(frames: Frame[], leader: number, seenX: number, seenY: number): number {
  let worst = 0
  for (const f of frames) {
    const l = f.at[leader]!
    for (let i = 0; i < f.at.length; i++) {
      if (i === leader || !f.alive[i]) continue
      worst = Math.max(worst, Math.abs(f.at[i]!.x - l.x) / seenX, Math.abs(f.at[i]!.y - l.y) / seenY)
    }
  }
  return worst
}
