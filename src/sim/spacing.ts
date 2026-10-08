import { clearTerrain, inTerrain } from './battleground'
import { canStand, hasteOf } from './combat'
import { DT, MUSTER_PACE } from './constants'
import type { Actor, SimState, Vec2 } from './types'

/**
 * How far apart a raid walks (#316).
 *
 * A raid that is only walking is not being aimed at, so it can afford to be a
 * group of people rather than a pile of them. What this keeps is a floor, not
 * a formation: nobody is given a seat and nothing is aimed at; a body is told
 * "you are too near that one" and nothing else. What makes the walk read as
 * people comes from things that belong to the body and the tick and nothing
 * else -- how long after the leader moves off it notices (`delayOf`), how hard
 * it hurries when it falls behind (`paceOf`), how near it stands (`reachOf`),
 * and a slow swell of both that is out of step with everybody else's (`swell`)
 * -- all read off its id and the tick, so the same body is the same person on
 * every walk and nothing here asks for a random number.
 *
 * Five pieces, in the order a tick meets them:
 *
 *   `trackLeader`  what the leader is doing: still, or walking, and which way
 *   `noticed`      where a follower thinks the leader is
 *   `abreast`      which place it follows: its own side of the way
 *   `glide`        its step, kept from going through anybody
 *   `spaceOut`     everybody nearer than they should be, pushed apart
 *
 * Only while nothing is awake does `spaceOut` run. The moment anything is, the
 * fight's own rule (`huddleApart` in travel.ts) takes over exactly as it was,
 * and a body with something to fight never comes through here at all.
 *
 * Arithmetic is restricted on purpose: `+ - * /`, comparisons, `Math.sqrt`
 * (which every platform rounds the same way), `min`, `max`, `abs`, `floor`,
 * `imul` and bit operations. `lawcheck` greps this file for the rest.
 */

/**
 * Centre to centre, never closer than this when there is room: a body across
 * (18) and most of another of floor between two.
 *
 * It was 27, a body and a half, and on the glass that was bodies touching: the
 * soles of the feet met, and a middle of a raid of twenty-five could not be
 * counted. Thirty-three is where the floor between two reads as floor.
 */
export const MIN_GAP = 33

/**
 * The line the rest of this file works to: `MIN_GAP` and a unit of margin.
 *
 * A step is cut so as not to come nearer than this to anybody, and a pair
 * nearer than this is pushed apart. The margin is why a raid that has come to
 * rest is not made of pairs 26.99 apart: a body that stops exactly on the
 * line is on the wrong side of it as often as the right one.
 */
const KEEP = MIN_GAP + 1

/**
 * The line a raid of this many walks to: `KEEP`, for every size so far.
 *
 * A function of the roster for the checks' sake -- they ask what line a size is
 * held to and draw their own (`KEEP - 4`) from the answer, so that the two are
 * not allowed to disagree.
 */
export function keepOf(size: number): number {
  void size
  return KEEP
}

/**
 * And in a doorway, the line comes down to this, which is a body and half of one.
 *
 * A passage ends when everybody is within reach of the door at once
 * (`exitReach`, travel.ts), and twenty-five bodies a line apart do not fit in
 * the half circle in front of a door even at the reach they are given: measured,
 * with no give at all the raid took from five seconds to three quarters of a
 * minute to be through, and with this it takes about five. Getting through is
 * the point of a door and the spacing is for the walk up to it. It goes back up
 * the moment the leader is not at one.
 *
 * It is not the overlap and a margin, which is what it was (20), and the
 * difference was on the screen: a body's feet touching its neighbour's, the
 * raid drawn in to one point. It is not to be removed, either; the raid that
 * keeps the whole line at a door does not get through it.
 */
const SQUEEZE = 27

/** The nearest the pull towards a door may bring one body to another: a hair under `SQUEEZE`, and clear of overlapping. */
const DRAWN_NO_NEARER = 22

/**
 * At a door, how hard the raid is drawn in on the leader, as a share of a body's stride, and from how far.
 *
 * Walking up to a body that is not walking (everybody at the door has arrived
 * at it) does nothing to the bodies behind it: it blocks them, and the raid
 * stands in a ring with a gap in its middle that nobody can reach. Drawing the
 * ones that are stopped there inward a little each tick, against the push that
 * keeps the raid apart, is what a crowd at a door does. Gentler than the push,
 * so it settles where the two balance and does not shake. And it never takes a
 * body nearer than `DRAWN_NO_NEARER` to another: the push and the pull
 * balancing is not a promise about how near, and it was balancing with bodies
 * on top of one another (the whole raid drawn at once, as it was, compressed
 * the middle of twenty-five to eight apart).
 *
 * Only the ones that have been stopped (`moveTarget` null: nowhere to go
 * this tick, as `glide` says it) and are not yet well inside the door's reach
 * (`DRAW_INSIDE`). A raid that fits through the door on its own legs -- five
 * and ten do -- is not drawn at all, which leaves it at the line it keeps.
 */
const DRAW = 0.2
const DRAW_FROM = 40
/**
 * And only those at the door's edge or past it: a body deeper in than reach less
 * this is through as far as the walk is concerned and is left where it stands.
 */
const DRAW_INSIDE = 25

/** How hard a pair under `KEEP` is pushed, per unit of what is missing. */
const PUSH = 0.35

/**
 * The most a body is moved by anybody in a tick, as a share of its own stride.
 *
 * Under a third, so that two bodies standing on each other come apart over a
 * few steps and not in one frame, and so that a walk is never held up by it.
 */
const SHOVE = 0.3

/**
 * The player is somebody's hands and does not step aside, so the others do:
 * from this much sooner, and by up to their whole stride.
 */
const NOTICE = 9

/** A leader who moves less than this in a tick is standing still. */
const MOVING = 0.5
/** Half a second of standing still is a stop; less is a stick let go of. */
const STOPPED = 15
/** How long a stop is worth counting: past the slowest body's notice (`delayOf`) it changes nothing. */
const IDLE_CAP = 40
/** A run of ticks is not worth counting past this. */
export const RUN_CAP = 255
/** Ticks over which a raid goes from gathering on a stopped leader to walking behind a moving one. */
const RAMP = 30
/** A pair this nearly in line with the walk is pushed across it instead of along it. */
const ALONG = 0.7
/** A step this much of a stride, going round, is worth taking over standing still. */
const WORTH = 0.35
/** Cosine of an eighth of a circle, which is also its sine. */
const EIGHTH = 0.7071067811865476

/** How much of the leader's pace a follower assumes it is still keeping up, until it notices a stop. */
const CARRY = 0.5
/** The nearest a body's reach gets, as a share of the raid's huddle. */
const REACH_LO = 0.6
/** How near a stopped raid, or one at a door, gathers on the leader, as a share of how near it follows. */
const GATHER = 0.25
/** How far to either side of the leader's line a body holds its side, as a share of its reach. */
const LANE = 1.3
/** Ticks from top to top of a body's swell, at the shortest; the longest is twice this. */
const SWELL = 240

/**
 * The fractional parts of the golden ratio and the square roots of 2, 3 and 5,
 * as 32-bit numbers: one irrational for each thing a body is. See `trait`.
 */
const GOLDEN = 0x9e3779b9
const ROOT2 = 0x6a09e667
const ROOT3 = 0xbb67ae85
const ROOT5 = 0x3c6ef372

/**
 * A number from nought up to one that is a property of a body and of nothing else.
 *
 * Fibonacci hashing: the id times an irrational (as the 32 bits that most
 * nearly are it), keeping the fraction, which is `Math.imul` and a shift and
 * nothing else. It is chosen over a scrambling hash for what it does to
 * neighbours: consecutive ids land as far apart as numbers can, so a raid of
 * five, ten or twenty-five has somebody near each end of every trait rather than
 * whatever a scramble happened to give -- ten people who all hesitate for the
 * same tenth of a second is not a raid setting off one at a time. A different
 * irrational per trait keeps the traits from tracking each other.
 */
export function trait(id: number, irrational: number): number {
  return (Math.imul(id, irrational) >>> 0) / 4294967296
}

/**
 * A slow swell, nought to one, that is a property of a body and the tick.
 *
 * Eight to sixteen seconds from top to top, at its own rate and out of step with
 * everybody else's. It is what keeps a raid from being the same raid for the
 * whole of a walk: with only the traits, the same bodies are at the front of
 * every walk in the same order, which is a formation however it was arrived at;
 * with it, who is close and who is hurrying changes as it would in people. A
 * function of the id and the tick, so it is the same on every replay.
 */
export function swell(s: SimState, actor: Actor): number {
  const period = SWELL + Math.floor(trait(actor.id, ROOT3) * SWELL)
  const phase = Math.floor(trait(actor.id, ROOT2) * period)
  const at = (s.tick + phase) % period
  // A triangle: up for half the period and down for the other half.
  return (at < period / 2 ? at : period - at) / (period / 2)
}

/**
 * How near a body stands to the one it follows, as a share of the raid's huddle.
 *
 * Under way it wanders between `REACH_LO` and the whole huddle on its own swell.
 * Once it has seen that the leader has stopped -- a beat after, a longer or a
 * shorter beat by body (`delayOf`) -- or the leader is at a door, it comes in to
 * a quarter of that and holds there: the swell is for the walk, and a body
 * standing still that stepped in and out with it would be shaking. In the beat
 * it holds the distance it had. Setting off again it climbs back over a second.
 */
export function reachOf(s: SimState, actor: Actor): number {
  const travel = s.travel
  if (!travel) return 1
  const ramp = Math.min(1, travel.leaderRun / RAMP)
  const gathering = travel.leaderAtDoor || travel.leaderIdle >= STOPPED + delayOf(actor)
  const swung = travel.leaderIdle === 0 && !travel.leaderAtDoor ? ramp * swell(s, actor) : 0
  const own = REACH_LO + (1 - REACH_LO) * (1 - swung)
  if (gathering) return own * GATHER
  return own * (travel.leaderIdle > 0 ? 1 : GATHER + (1 - GATHER) * ramp)
}

/**
 * How fast a follower closes a gap, in strides.
 *
 * Its own pace, from 1.2 to the raid's muster pace, by its temper and its swell
 * -- until it is a long way behind, when it hurries like anyone does: at two
 * reaches off, the muster pace whoever it is. A raid whose leader runs through
 * a pack and on is a raid that has to catch up with them, and the ones who
 * could not be bothered to for a stroll are not the ones who are left behind.
 * And no more than its own speed when there is nobody to catch: a body behind a
 * leader who has stopped strolls over, which is also what sets who arrives
 * when.
 *
 * `behind` is how far past its reach it is, in reaches.
 */
export function paceOf(s: SimState, actor: Actor, behind: number): number {
  const travel = s.travel
  const catching = travel && travel.leaderIdle === 0 && !travel.leaderAtDoor ? Math.min(1, travel.leaderRun / RAMP) : 0
  const own = MUSTER_PACE - 0.5 * (1 - 0.5 * trait(actor.id, GOLDEN) - 0.5 * swell(s, actor))
  const hurry = Math.max(0, Math.min(1, behind))
  return 1 + (own + (MUSTER_PACE - own) * hurry - 1) * catching
}

/** How many ticks after the leader sets off a body notices: three to twenty-four, a tenth of a second to eight. */
export function delayOf(actor: Actor): number {
  return 3 + Math.floor(trait(actor.id, ROOT5) * 22)
}

// --- the leader --------------------------------------------------------------

/**
 * Notes what the leader is doing, once a tick, whether or not anything is awake.
 *
 * Two whole numbers and a direction, and nothing about any one follower: how
 * long the leader has been still (so a stop of half a second is a stop and a
 * stick let go of for a frame is not), how long it has been walking since, and
 * which way. The direction is the unit step the leader last took, kept for the
 * rules below that need a side to be on and never turned into an angle.
 */
export function trackLeader(s: SimState, doorReach: number): void {
  const travel = s.travel
  if (!travel) return
  let player: Actor | null = null
  for (const a of s.actors) {
    if (a.isPlayer && a.alive) {
      player = a
      break
    }
  }
  if (player === null) return
  // At a door, for a walk that ends at one: the building has none to end at.
  travel.leaderAtDoor = false
  if (!travel.building) {
    for (const way of travel.corridor.ways) {
      const ex = way.at.x - player.pos.x
      const ey = way.at.y - player.pos.y
      if (ex * ex + ey * ey <= doorReach * doorReach) travel.leaderAtDoor = true
    }
  }
  const dx = player.pos.x - player.prevPos.x
  const dy = player.pos.y - player.prevPos.y
  const d2 = dx * dx + dy * dy
  if (d2 >= MOVING * MOVING) {
    const d = Math.sqrt(d2)
    travel.leaderIdle = 0
    travel.leaderRun = Math.min(RUN_CAP, travel.leaderRun + 1)
    travel.leaderHx = dx / d
    travel.leaderHy = dy / d
  } else {
    travel.leaderIdle = Math.min(IDLE_CAP, travel.leaderIdle + 1)
    if (travel.leaderIdle >= STOPPED) travel.leaderRun = 0
  }
}

/**
 * Whether a follower has yet to notice that the leader has moved off.
 *
 * True only for the first few ticks of a walk that began from a stop, and only
 * for a body whose delay has not run out. A leader who never stopped has been
 * running for as long as `RUN_CAP`, so nobody waits for anything; and a leader
 * who is standing still is not setting off, so a body that has yet to arrive is
 * never made to wait for a walk that is not happening.
 */
export function holdsBack(s: SimState, actor: Actor, lead: Actor): boolean {
  const travel = s.travel
  if (!travel || travel.leaderRun >= delayOf(actor)) return false
  const dx = lead.pos.x - lead.prevPos.x
  const dy = lead.pos.y - lead.prevPos.y
  return dx * dx + dy * dy >= MOVING * MOVING
}

/**
 * Where the leader is, as far as a follower has noticed.
 *
 * For a moment after the leader stops, a follower walks on as though it had
 * not: the place it is heading for carries on at the leader's pace in the
 * leader's direction, for as long as this body's own delay (`delayOf`, the same
 * one that makes it slow off the mark). It then notices, and the ones who had
 * got ahead turn and come back while the ones behind arrive, which is what a
 * stop looks like in people and is the opposite of everybody halting on one
 * tick. Half the distance, so that the overshoot is a few steps and not a
 * dash.
 */
export function noticed(s: SimState, actor: Actor, lead: Actor): Vec2 {
  const travel = s.travel
  if (!travel || travel.leaderIdle === 0) return lead.pos
  const idle = travel.leaderIdle
  const delay = delayOf(actor)
  if (idle >= delay || (travel.leaderHx === 0 && travel.leaderHy === 0)) return lead.pos
  const carry = CARRY * lead.moveSpeed * DT * idle
  seen.x = lead.pos.x + travel.leaderHx * carry
  seen.y = lead.pos.y + travel.leaderHy * carry
  return seen
}

// --- where a follower heads --------------------------------------------------

const aim: Vec2 = { x: 0, y: 0 }
const seen: Vec2 = { x: 0, y: 0 }
const probe: Vec2 = { x: 0, y: 0 }

/**
 * The place a follower follows, when the leader is walking: its own side of the way.
 *
 * Pure pursuit points every follower at the leader, and the leader is somewhere
 * on the line each of them is already walking along, so a raid closes in from
 * behind into a single stream -- the sideways part of the pull is what squeezes
 * it. While the leader is on the move that part of the pull, up to a body's own
 * reach, is dropped: the body follows the place beside it that the leader is
 * abreast of, not the leader, so it keeps the side it is on and closes the
 * distance along the walk and the raid arrives as wide as it left. Beyond its
 * reach the pull is all there, so nobody drifts off. A leader who stops is a
 * leader the raid gathers on, in full; the weight comes up over a second so
 * that the one is not the other's cut.
 *
 * It is the place that is followed and not the way to it: how near is near
 * enough is asked of this place, so a body in no hurry stays behind its own
 * abreast point and catches up in its own time, which is what keeps the raid
 * from being a rank that walks in step.
 *
 * Nothing is remembered: the side a body is on is read off where it is, so a
 * leader who turns takes the raid round with it without it ever having had a
 * shape to turn.
 */
export function abreast(s: SimState, actor: Actor, lead: Vec2, reach: number): Vec2 {
  const travel = s.travel
  if (!travel) return lead
  const hx = travel.leaderHx
  const hy = travel.leaderHy
  if (hx === 0 && hy === 0) return lead
  // At a door the raid gathers, whatever the leader is doing: it is the one
  // place a walk is asked to bring everybody close.
  const w = travel.leaderAtDoor ? 0 : Math.min(1, travel.leaderRun / RAMP)
  if (w <= 0) return lead
  const vx = lead.x - actor.pos.x
  const vy = lead.y - actor.pos.y
  const along = vx * hx + vy * hy
  const across = vx * -hy + vy * hx
  const held = Math.max(-reach * LANE, Math.min(reach * LANE, across))
  const left = across - held * w
  aim.x = actor.pos.x + along * hx + left * -hy
  aim.y = actor.pos.y + along * hy + left * hx
  // Holding a side is not holding it into a wall: if the floor is gone a
  // stride or two towards that place, follow the leader as every follower
  // always did, which is the way round a corner.
  const ax = aim.x - actor.pos.x
  const ay = aim.y - actor.pos.y
  const a2 = ax * ax + ay * ay
  if (a2 > 1e-6) {
    const k = (2 * actor.moveSpeed * DT) / Math.sqrt(a2)
    probe.x = actor.pos.x + ax * k
    probe.y = actor.pos.y + ay * k
    if (!canStand(s, probe, actor.radius) || inTerrain(s.obstacles, probe, actor.radius)) return lead
  }
  return aim
}

// --- a step that does not go through anybody ---------------------------------

/** The line to work to this tick: `KEEP`, or `SQUEEZE` with the leader at a door. */
function keepNow(s: SimState): number {
  return s.travel?.leaderAtDoor === true ? SQUEEZE : keepOf(s.party.length)
}

/**
 * How much nearer than the line a step may come to somebody, at most, as a raid unpacks:
 * the four between the line a raid rests on and the one the checks count a pair
 * under (`KEEP` less `GAP`, in `spacingmetric.ts`), so that a brush is never one they count.
 */
export const UNPACK = 4

/**
 * How much nearer than the line a step may come to somebody, as a raid unpacks.
 *
 * A raid that has stood still has settled on the line, every body exactly on it
 * from each of its neighbours, and a body on a line it may not cross cannot
 * pass between two others that are on it, even with room: so a raid setting off
 * would unpack from the outside in, one ring waiting for the next, and the
 * ones at the back could not set off until the ones at the front had. A body is
 * let brush past by up to this much for the first second of the walk, while the
 * raid is unpacking, and not otherwise (`spaceOut` pushes it back out to the
 * line a little each tick).
 */
function slackNow(s: SimState): number {
  const travel = s.travel
  if (!travel || travel.leaderIdle > 0) return 0
  return UNPACK * (1 - Math.min(1, travel.leaderRun / RAMP))
}

const slip: Vec2 = { x: 0, y: 0 }
const trial: Vec2 = { x: 0, y: 0 }

/**
 * A step cut down to the part of it that does not go through anybody.
 *
 * Written into `out`. The part of the step that carries the body nearer than
 * `KEEP` to someone is taken off, so it goes as far as there is room and slides
 * along the rest. Twice over, because going round one body can be into the
 * next; and if that still leaves it nearer than it was to somebody it is boxed
 * in and the step is nothing at all.
 */
function cut(s: SimState, actor: Actor, sx: number, sy: number, out: Vec2): void {
  out.x = sx
  out.y = sy
  const base = keepNow(s) - slackNow(s)
  for (let pass = 0; pass < 2; pass++) {
    for (const o of s.actors) {
      if (o === actor || o.faction !== 'party' || !o.alive) continue
      const dx = o.pos.x - actor.pos.x
      const dy = o.pos.y - actor.pos.y
      const d2 = dx * dx + dy * dy
      // The same line `spaceOut` pushes from, or the step comes in to a body
      // that is then pushed straight back out and the two take turns.
      const keep = o.isPlayer ? base + NOTICE : base
      const near = keep + 2 * Math.abs(out.x) + 2 * Math.abs(out.y)
      if (d2 >= near * near || d2 < 1e-6) continue
      const d = Math.sqrt(d2)
      const toward = (out.x * dx + out.y * dy) / d
      const room = Math.max(0, d - keep)
      if (toward <= room) continue
      out.x -= ((toward - room) * dx) / d
      out.y -= ((toward - room) * dy) / d
    }
  }
  // Between two bodies ahead, taking off the part of the step that carries it
  // into each can leave a step that carries it back. A body hemmed in stays.
  if (out.x * sx + out.y * sy <= 0) {
    out.x = 0
    out.y = 0
    return
  }
  for (const o of s.actors) {
    if (o === actor || o.faction !== 'party' || !o.alive) continue
    const dx = o.pos.x - actor.pos.x
    const dy = o.pos.y - actor.pos.y
    const now = dx * dx + dy * dy
    const mx = dx - out.x
    const my = dy - out.y
    const then = mx * mx + my * my
    const keep = o.isPlayer ? base + NOTICE : base
    if (then < keep * keep && then < now) {
      out.x = 0
      out.y = 0
      return
    }
  }
}

/**
 * A walking step that does not go through anybody, and goes round them if it can.
 *
 * The push in `spaceOut` is a third of a stride at most, and a follower closing
 * on the leader goes at a stride and a half, so left to itself the follower
 * wins every tick: the raid streams into the same spot and the push only ever
 * tidies up what has already piled. So the step is cut to what does not come
 * nearer than `KEEP` to anybody (`cut`). Coming up to a crowd a body stops at
 * the edge of it, wherever that is; nothing says where, which is why the crowd
 * has no shape of its own.
 *
 * And a body with barely any step left is not left to wait: it tries the ways
 * round -- an eighth of a circle either side, then a quarter -- and takes
 * whichever gets it furthest the way it was going. Without this the raid
 * queues: the first to arrive stands in the way of the next, and the next
 * waits behind it, in a line, at the edge of the circle everybody was told to
 * stand in.
 *
 * What it takes: the step, and the world as it stands. What it gives: the step
 * to take, in a point that is reused.
 */
export function glide(s: SimState, actor: Actor, sx: number, sy: number): Vec2 {
  const len2 = sx * sx + sy * sy
  cut(s, actor, sx, sy, slip)
  if (len2 === 0) return slip
  const len = Math.sqrt(len2)
  const fx = sx / len
  const fy = sy / len
  // A step that ends off the floor is not a step: it is undone the moment it is
  // taken, and a body that takes it every tick is a body standing still with
  // somewhere to be. One that ends in the furniture is a step along it, which is
  // what `clearTerrain` turns it into, so it is judged as that -- see `settles`.
  let best = settles(s, actor, slip.x, slip.y) ? landed.x * fx + landed.y * fy : -Infinity
  if (best >= WORTH * len) return slip
  let bx = slip.x
  let by = slip.y
  // Eighth, then quarter; left, then right; the first of equals wins, so a
  // body in a symmetrical jam goes the same way every tick.
  for (let k = 0; k < 4; k++) {
    const quarter = k >= 2
    const side = k % 2 === 0 ? 1 : -1
    const c = quarter ? 0 : EIGHTH
    const sn = (quarter ? 1 : EIGHTH) * side
    cut(s, actor, (fx * c - fy * sn) * len, (fx * sn + fy * c) * len, trial)
    if (!settles(s, actor, trial.x, trial.y)) continue
    const gain = landed.x * fx + landed.y * fy
    // Only a way round that gets somewhere: one that goes nowhere much is a
    // body dithering from side to side, a step a tick, in a pocket it cannot leave.
    // Unless the way on is the floor running out: a wall the leader got past by
    // a doorway a few steps along is got past by going along it, and that is
    // sideways, which gets nowhere until it has got somewhere.
    if (gain > best + 1e-9 && gain >= (best === -Infinity ? -1e-9 : WORTH * len)) {
      best = gain
      bx = trial.x
      by = trial.y
    }
  }
  if (best === -Infinity) {
    bx = 0
    by = 0
  }
  slip.x = bx
  slip.y = by
  return slip
}

const landed: Vec2 = { x: 0, y: 0 }
const fin: Vec2 = { x: 0, y: 0 }

/**
 * Whether a step from where the body is ends somewhere it can stand, and what it comes to.
 *
 * The step as the walk takes it -- taken, then pushed off the furniture along
 * it (`clearTerrain`) -- and not the step as it was asked for: a body walking at
 * a rock does not stop at the rock, it goes round it, and a step that was thrown
 * out for ending inside one is a body stood against it for good. `landed` is
 * where it ends up, relative to where it stood.
 */
function settles(s: SimState, actor: Actor, sx: number, sy: number): boolean {
  fin.x = actor.pos.x + sx
  fin.y = actor.pos.y + sy
  clearTerrain(s.obstacles, fin, actor.radius, sx, sy)
  landed.x = fin.x - actor.pos.x
  landed.y = fin.y - actor.pos.y
  if (!canStand(s, fin, actor.radius)) return false
  // And the slide along a rock is no licence to slide into somebody: where it
  // comes to is held to the line as the step was.
  const base = keepNow(s) - slackNow(s)
  for (const o of s.actors) {
    if (o === actor || o.faction !== 'party' || !o.alive) continue
    const keep = o.isPlayer ? base + NOTICE : base
    const nx = o.pos.x - actor.pos.x
    const ny = o.pos.y - actor.pos.y
    const mx = o.pos.x - fin.x
    const my = o.pos.y - fin.y
    const then = mx * mx + my * my
    if (then < keep * keep && then < nx * nx + ny * ny) return false
  }
  return true
}

// --- everybody nearer than they should be ------------------------------------

// Reused tick to tick: the walk allocates nothing for this. A raid is at most
// twenty-five; the arrays grow if that is ever not true.
const bodies: Actor[] = []
let pushX = new Float64Array(32)
let pushY = new Float64Array(32)
let blocked = new Uint8Array(32)
/** Bodies that are getting out of the player's way: they may take their whole stride to do it. */
let yielding = new Uint8Array(32)

/**
 * Every pair that is too near, pushed apart a little, all at once.
 *
 * Read off where everybody stood at the start of the tick and applied after all
 * of it is known, so nobody's answer depends on whose turn it was. The player
 * is never pushed, and the other of the pair makes up the difference; a body
 * that could not stand where the push would put it (`blocked`) is passed over
 * the same way.
 *
 * Pushed along the line between the two, except when that line lies along the
 * walk: then across it, because pushing a pair apart along the walk turns a
 * queue into a longer queue, and sideways is where a raid has room. Which side
 * is the side they are already on, so the pair do not swap every tick, and the
 * lower id's when they are exactly in line. And only the one behind steps
 * aside: both stepping aside, in opposite directions, is a column in which
 * every body is pushed one way by the body in front and the other by the body
 * behind, and the line stays a line.
 */
function gather(n: number, hx: number, hy: number, KEEP: number): void {
  pushX.fill(0, 0, n)
  pushY.fill(0, 0, n)
  const lead = hx !== 0 || hy !== 0
  for (let i = 0; i < n; i++) {
    const a = bodies[i]!
    for (let j = i + 1; j < n; j++) {
      const b = bodies[j]!
      const dx = b.pos.x - a.pos.x
      const dy = b.pos.y - a.pos.y
      const hold = a.isPlayer || b.isPlayer ? KEEP + NOTICE : KEEP
      const d2 = dx * dx + dy * dy
      if (d2 >= hold * hold) continue
      const d = Math.sqrt(d2)
      const force = PUSH * (hold - d)
      let ux: number
      let uy: number
      if (d > 0.01) {
        ux = dx / d
        uy = dy / d
      } else {
        // Exactly on top of each other: no direction to read off, so across
        // the walk, or any, and the order they were listed in decides who goes
        // which way.
        ux = lead ? -hy : 1
        uy = lead ? hx : 0
      }
      let wa = a.isPlayer || blocked[i] === 1 ? 0 : 0.5
      let wb = b.isPlayer || blocked[j] === 1 ? 0 : 0.5
      if (lead && Math.abs(ux * hx + uy * hy) > ALONG) {
        const cross = ux * -hy + uy * hx
        const side = Math.abs(cross) > 0.05 ? (cross > 0 ? 1 : -1) : a.id < b.id ? 1 : -1
        ux = -hy * side
        uy = hx * side
        if (a.pos.x * hx + a.pos.y * hy < b.pos.x * hx + b.pos.y * hy) {
          if (wa > 0) wb = 0
        } else if (wb > 0) wa = 0
      }
      if (wa === 0 && wb === 0) continue
      if (wa === 0) wb = 1
      else if (wb === 0) wa = 1
      if (a.isPlayer) yielding[j] = 1
      else if (b.isPlayer) yielding[i] = 1
      pushX[i]! -= ux * force * wa
      pushY[i]! -= uy * force * wa
      pushX[j]! += ux * force * wb
      pushY[j]! += uy * force * wb
    }
  }
}

/** Cuts a body's push to its share of a stride. Zero stays zero. */
function cap(i: number): void {
  const a = bodies[i]!
  const x = pushX[i]!
  const y = pushY[i]!
  const m2 = x * x + y * y
  if (m2 === 0) return
  const most = (yielding[i] === 1 ? 1 : SHOVE) * a.moveSpeed * DT * hasteOf(a)
  if (m2 <= most * most) return
  const k = most / Math.sqrt(m2)
  pushX[i] = x * k
  pushY[i] = y * k
}

/** Whether the body would be left alone where its push would put it. */
function standsAfter(s: SimState, i: number): boolean {
  const a = bodies[i]!
  probe.x = a.pos.x + pushX[i]!
  probe.y = a.pos.y + pushY[i]!
  return canStand(s, probe, a.radius) && !inTerrain(s.obstacles, probe, a.radius)
}

let pullX = new Float64Array(32)
let pullY = new Float64Array(32)

/**
 * Draws every body but the player in towards the player, a little. See `DRAW`.
 *
 * Every body's pull is worked out first and none applied until all of them are
 * checked, against where everybody would stand with only the push -- so that
 * whether one body is drawn in does not depend on whether the one before it
 * in the list was. A body whose pull would leave it nearer than
 * `DRAWN_NO_NEARER` to somebody is not drawn this tick.
 */
function draw(n: number, door: Vec2 | null, reach: number): void {
  let lead: Actor | null = null
  for (let i = 0; i < n; i++) {
    if (bodies[i]!.isPlayer) lead = bodies[i]!
  }
  if (lead === null || door === null) return
  for (let i = 0; i < n; i++) {
    pullX[i] = 0
    pullY[i] = 0
    const a = bodies[i]!
    if (a.isPlayer || blocked[i] === 1) continue
    // The pull is for getting everybody inside the door's reach, and for the
    // ones the crowd has stopped: a body that is still walking in gets there on
    // its own legs, and one that is in already is not made to crowd in further.
    if (a.ai?.moveTarget !== null) continue
    const ex = door.x - a.pos.x
    const ey = door.y - a.pos.y
    const inside = reach - DRAW_INSIDE
    if (ex * ex + ey * ey <= inside * inside) continue
    const dx = lead.pos.x - a.pos.x
    const dy = lead.pos.y - a.pos.y
    const d2 = dx * dx + dy * dy
    if (d2 <= DRAW_FROM * DRAW_FROM) continue
    const d = Math.sqrt(d2)
    const pull = Math.min(DRAW * a.moveSpeed * DT * hasteOf(a), d - DRAW_FROM)
    const px = a.pos.x + pushX[i]! + (dx / d) * pull
    const py = a.pos.y + pushY[i]! + (dy / d) * pull
    let clear = true
    for (let j = 0; j < n && clear; j++) {
      if (j === i) continue
      const o = bodies[j]!
      const ox = o.pos.x + pushX[j]! - px
      const oy = o.pos.y + pushY[j]! - py
      if (ox * ox + oy * oy < DRAWN_NO_NEARER * DRAWN_NO_NEARER) clear = false
    }
    if (!clear) continue
    pullX[i] = (dx / d) * pull
    pullY[i] = (dy / d) * pull
  }
  for (let i = 0; i < n; i++) {
    pushX[i]! += pullX[i]!
    pushY[i]! += pullY[i]!
  }
}

/** The door the leader is at, which is the nearest of those within reach; null when it is at none. */
function doorOf(s: SimState, reach: number): Vec2 | null {
  const travel = s.travel
  if (!travel) return null
  let lead: Actor | null = null
  for (const a of s.actors) {
    if (a.isPlayer && a.alive) lead = a
  }
  if (lead === null) return null
  let at: Vec2 | null = null
  let near = reach * reach
  for (const way of travel.corridor.ways) {
    const ex = way.at.x - lead.pos.x
    const ey = way.at.y - lead.pos.y
    const d2 = ex * ex + ey * ey
    if (d2 <= near) {
      near = d2
      at = way.at
    }
  }
  return at
}

/**
 * The raid, kept apart while it only walks.
 *
 * Called in place of `huddleApart` on every tick on which nothing is awake. A
 * push that would put somebody off the floor or into the furniture is dropped
 * and its partner takes it instead; if neither can, that pair is left as they
 * are for the tick -- a corridor two bodies wide does not hold a raid of
 * twenty-five at arm's length, and a raid that cannot walk down it because of
 * that is worse than one that overlaps for a few yards. Nothing is remembered,
 * so the first open floor after it undoes it.
 */
export function spaceOut(s: SimState, doorReach: number): void {
  const travel = s.travel
  if (!travel) return
  let n = 0
  for (const a of s.actors) {
    if (a.faction !== 'party' || !a.alive) continue
    bodies[n++] = a
  }
  bodies.length = n
  if (n < 2) return
  if (blocked.length < n) {
    pushX = new Float64Array(n)
    pushY = new Float64Array(n)
    pullX = new Float64Array(n)
    pullY = new Float64Array(n)
    blocked = new Uint8Array(n)
    yielding = new Uint8Array(n)
  }
  blocked.fill(0, 0, n)
  yielding.fill(0, 0, n)
  const hx = travel.leaderHx
  const hy = travel.leaderHy

  const keep = keepNow(s)
  const door = travel.leaderAtDoor ? doorOf(s, doorReach) : null
  gather(n, hx, hy, keep)
  if (travel.leaderAtDoor) draw(n, door, doorReach)
  let again = false
  for (let i = 0; i < n; i++) {
    cap(i)
    if ((pushX[i] !== 0 || pushY[i] !== 0) && !standsAfter(s, i)) {
      blocked[i] = 1
      again = true
    }
  }
  if (again) {
    gather(n, hx, hy, keep)
    if (travel.leaderAtDoor) draw(n, door, doorReach)
    for (let i = 0; i < n; i++) cap(i)
  }
  for (let i = 0; i < n; i++) {
    if (pushX[i] === 0 && pushY[i] === 0) continue
    if (again && !standsAfter(s, i)) continue
    const a = bodies[i]!
    a.pos.x += pushX[i]!
    a.pos.y += pushY[i]!
  }
}
