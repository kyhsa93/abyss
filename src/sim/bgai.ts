import { ABILITIES } from './abilities'
import { specOf } from './classes'
import { beginCast, dist, getAura, hasteOf, interruptCast } from './combat'
import { DT, MELEE_RANGE, SPELL_RANGE } from './constants'
import {
  CARRIER_SPEED,
  CART_RADIUS,
  NODE_RADIUS,
  RALLY_TELEGRAPH,
  carrying,
  clearTerrain,
  inTerrain,
  living,
  other,
  teamOf,
} from './battleground'
import type { Rng } from './rng'
import { clampToArena } from './state'
import type { Actor, AuraId, BgPlan, BgState, SimState, Team, Vec2 } from './types'

/**
 * Everyone in a battleground who is not the player, on both sides.
 *
 * Separate from `ai.ts` on purpose. That one plays a raid: it scores tiles by
 * how survivable they are, because a boss puts hazards on the floor and the
 * whole job is being somewhere else. A battleground has no hazards and no
 * threat table — what it has is somewhere you are supposed to be, and five
 * people who would rather you were not there. Sharing one file would mean one
 * scoring function answering two unrelated questions.
 *
 * The enemy runs this same code. A battleground where the other team plays
 * worse than yours is a slower version of a training dummy.
 */

/** How close is close enough to count as standing on an objective. */
const ARRIVED = 24

/** Below this, a healer stops attacking and starts healing. */
const WOUNDED = 0.72

/**
 * How far off the errand the fight may pull somebody, on the flag map.
 *
 * The other two maps leash everybody to their objective — a point pays only
 * while somebody stands on it, so a defender chased off the circle has
 * conceded it. The flag map had no leash anywhere, on the reasoning that a
 * carrier is a moving objective and following one across the map is correct.
 * That is true of following one and of nothing else: with `hold` at zero the
 * combat positioning in `wander` overrode every flag goal there is. A ranged
 * actor whose nearest enemy stood beyond its spell range walked at the enemy
 * instead of the flag, and a melee one chased anybody who came within reach
 * of where it was going. Carriers spent a quarter of their time being sent
 * away from their own base — the single place the flag has to reach.
 */
const FLAG_LEASH = 96

/**
 * The carrier's own, which is tighter than anyone's.
 *
 * Carrying is the one state in this game where the objective is the whole
 * job: there is nothing a carrier can win by turning round. Kept well under
 * `BASE_RADIUS` so that arriving still scores rather than stopping short.
 */
const CARRY_LEASH = 30

/** A dealer will cross the map for someone this hurt. */
const FINISHABLE = 0.35

/**
 * The two jobs a plan can hand out where there is no point to stand on.
 *
 * Negative so they can never collide with a node id, which is what
 * `assignment` holds on the capture map.
 */
export const JOB_FORWARD = -1
export const JOB_HOME = -2

/**
 * The floor on how often a side may change its mind.
 *
 * Long enough that a plan survives being walked to. The failure this guards
 * against is not planning badly, it is planning again before the last plan has
 * had time to happen — an actor sent to a point twelve seconds away and
 * re-sent somewhere else after four has spent the whole match travelling.
 */
const REPLAN_COOLDOWN = 4

/**
 * Both sides' plans, once a tick.
 *
 * Called from `step` rather than from the per-actor update, because a plan is
 * the team's and running it five times would be five plans. The enemy plans on
 * exactly the same code, for the reason everything else here does: a
 * battleground where the other team plays worse than yours is a slower version
 * of a training dummy.
 */
export function updateBattlegroundPlans(s: SimState): void {
  const bg = s.bg
  if (!bg) return
  for (const team of ['blue', 'red'] as const) replan(s, bg, team)
}

/**
 * The board, coarsely, as something to compare against last time.
 *
 * Everything in here is discrete and slow: who owns what, how many of us are
 * standing, what the flags are doing, roughly how far the carts have got. What
 * is deliberately *not* in here is anything that flickers — whether a point is
 * contested this tick, exact positions, exact progress — because a reading
 * that changes every tick plans every tick, and planning every tick is the bug
 * this whole arrangement exists to avoid.
 */
function reading(s: SimState, bg: BgState, team: Team): string {
  const parts: string[] = [`n${living(s, team).length}`, `e${living(s, other(team)).length}`]
  if (bg.kind === 'conquest') parts.push(bg.nodes.map((n) => n.owner ?? '-').join(''))
  if (bg.kind === 'flags') {
    parts.push(
      (['blue', 'red'] as const)
        .map((t) => `${bg.flags[t].state[0]}${bg.flags[t].carrierId === null ? '' : 'c'}`)
        .join(''),
      `s${Math.floor(bg.score[team])}${Math.floor(bg.score[other(team)])}`,
    )
  }
  if (bg.kind === 'escort' && bg.carts) {
    parts.push(
      (['blue', 'red'] as const).map((t) => Math.floor(bg.carts![t].progress * 10)).join(''),
    )
  }
  parts.push(bg.rally.settled ? 'r-' : bg.rally.telegraph <= RALLY_TELEGRAPH ? 'r+' : 'r.')
  return parts.join('|')
}

/**
 * Takes the nearest of the pool to a place, and removes it.
 *
 * Jobs used to go out in team order, which is an order that means nothing on
 * the floor: whoever happened to be built first drew the first job whether
 * they were standing on it or across the map from it. Worse on blue, where the
 * first slot is always the player's — so the player was posted to a quiet
 * corner of every capture map they ever played while the other four went and
 * had the match.
 *
 * Ties go to whoever comes first in the pool, which keeps this reproducible
 * from the seed like everything else here.
 */
function claimNearest(pool: Actor[], to: Vec2): Actor | null {
  let best: Actor | null = null
  let bestGap = Infinity
  for (const a of pool) {
    const gap = dist(a.pos, to)
    if (gap < bestGap) {
      bestGap = gap
      best = a
    }
  }
  if (best) pool.splice(pool.indexOf(best), 1)
  return best
}

/**
 * Fills a number of posts, keeping whoever is already standing one.
 *
 * Proximity alone is right for choosing a post and wrong for keeping one. A
 * flag map re-picking its guard by "closest to home" every time the board
 * moved handed the job to whoever happened to be walking back at that instant,
 * took it off them the moment somebody else was nearer, and left the flag
 * unwatched between the two — which cost more than the old fixed order it was
 * meant to improve on. Keeping the incumbent is what makes the job a post
 * rather than a description of where somebody is standing.
 */
function fillPosts(
  bg: BgState,
  pool: Actor[],
  count: number,
  near: Vec2,
  was: Map<number, number | undefined>,
): void {
  let filled = 0
  for (const a of [...pool]) {
    if (filled >= count) break
    if (was.get(a.id) !== JOB_HOME) continue
    bg.assignment[a.id] = JOB_HOME
    pool.splice(pool.indexOf(a), 1)
    filled++
  }
  while (filled < count) {
    const chosen = claimNearest(pool, near)
    if (!chosen) break
    bg.assignment[chosen.id] = JOB_HOME
    filled++
  }
}

function replan(s: SimState, bg: BgState, team: Team): void {
  const plan = bg.plan[team]
  plan.cooldown = Math.max(0, plan.cooldown - DT)
  if (plan.cooldown > 0) return

  const now = reading(s, bg, team)
  if (now === plan.reading) return
  plan.reading = now
  plan.cooldown = REPLAN_COOLDOWN

  if (bg.kind === 'conquest') planConquest(s, bg, team, plan)
  else if (bg.kind === 'flags') planFlags(s, bg, team, plan)
  else planEscort(s, bg, team, plan)
}

/**
 * One body on each point we hold, and everybody else on one point we do not.
 *
 * The rule it replaces spread the team evenly over all three points forever,
 * whoever owned them, which meant a side that already held a point kept two
 * people standing on something nobody was contesting while a neutral one went
 * untaken. Holding is worth exactly one body — a point pays while it is held
 * and a second defender adds nothing to that — and everything spare is worth
 * more where the bar is not yet over, because the capture rate goes up with
 * numbers and a four-stack takes a point in a third of the time one does.
 *
 * The target is kept until it is ours. Both sides pick the nearest thing they
 * do not own, so both flip one at about the same moment, and re-choosing on
 * every flip pointed everybody at the other end of the map before anybody had
 * arrived at this one.
 */
function planConquest(s: SimState, bg: BgState, team: Team, plan: BgPlan): void {
  const mine = living(s, team)
  if (mine.length === 0) return

  const byDistance = [...bg.nodes].sort(
    (a, b) => dist(bg.bases[team], a.pos) - dist(bg.bases[team], b.pos),
  )
  const held = byDistance.filter((n) => n.owner === team)

  const current = bg.nodes.find((n) => n.id === plan.target)
  const wanted =
    current && current.owner !== team
      ? current
      : (byDistance.find((n) => n.owner !== team) ?? byDistance[0]!)
  plan.target = wanted.id

  // A garrison never larger than the team, or nobody would ever go anywhere,
  // and each post filled by whoever is already closest to it.
  const garrison = Math.min(held.length, Math.max(0, mine.length - 1))
  const pool = [...mine]
  for (let i = 0; i < garrison; i++) {
    const post = held[i]!
    const keeper = claimNearest(pool, post.pos)
    if (keeper) bg.assignment[keeper.id] = post.id
  }
  for (const actor of pool) bg.assignment[actor.id] = wanted.id
}

/**
 * Somebody stays home.
 *
 * Nobody ever did. Both sides ran the whole way to the other base, passed each
 * other in the middle, and ran back, so a carrier was intercepted almost only
 * by accident: eight pickups a match, four captures, and a match that finished
 * in forty-odd seconds against a limit of three hundred and sixty. A flag map
 * where the flag cannot be defended is a relay race.
 *
 * More of them when ahead, because a side that is ahead wins by the clock and
 * a side that is behind cannot afford anybody standing still — which is the
 * first thing on any of these maps that the score itself decides.
 */
function planFlags(s: SimState, bg: BgState, team: Team, plan: BgPlan): void {
  const mine = living(s, team)
  if (mine.length === 0) return

  const ours = bg.flags[team]
  const theirs = bg.flags[other(team)]
  const weHoldTheirs =
    theirs.state === 'carried' &&
    s.actors.some((a) => a.id === theirs.carrierId && a.alive && teamOf(a) === team)

  let home: number
  if (ours.state !== 'home') {
    // Ours is out and nothing scores until it is back. When theirs is already
    // in our hands that makes recovery the whole team's job bar the escort;
    // when it is not, some of us still go and take theirs, because the two
    // halves of a capture are "get ours back" and "have theirs when it lands",
    // and a side that only ever does the first one has to do the second from a
    // standing start every time.
    home = weHoldTheirs ? mine.length - 1 : Math.ceil(mine.length * 0.6)
  } else {
    home = Math.floor(bg.score[team]) > Math.floor(bg.score[other(team)]) ? 2 : 1
  }
  plan.defenders = Math.max(0, Math.min(mine.length, home))

  // A carrier is nobody's defender: what it is holding outranks the plan.
  const was = new Map(mine.map((a) => [a.id, bg.assignment[a.id]]))
  const pool = mine.filter((a) => !carrying(s, a))
  for (const a of mine) bg.assignment[a.id] = JOB_FORWARD
  fillPosts(bg, pool, plan.defenders, bg.bases[team], was)
}

/**
 * Push or block, decided by which cart is winning rather than by seniority.
 *
 * The split itself is the one that was here — most of the team with its own
 * cart, a couple in front of the other — but it is chosen once per event now
 * instead of read off each actor's index, so being one body down changes it and
 * being ahead frees somebody to go and stop theirs.
 */
function planEscort(s: SimState, bg: BgState, team: Team, plan: BgPlan): void {
  const carts = bg.carts
  const mine = living(s, team)
  if (!carts || mine.length === 0) return

  const ours = carts[team]
  const theirs = carts[other(team)]
  const behind = ours.progress < theirs.progress - 0.08
  const ahead = ours.progress > theirs.progress + 0.08
  const blockers = Math.min(mine.length - 1, behind ? 1 : ahead ? 3 : 2)
  plan.defenders = Math.max(0, blockers)

  const was = new Map(mine.map((a) => [a.id, bg.assignment[a.id]]))
  const pool = [...mine]
  for (const a of mine) bg.assignment[a.id] = JOB_FORWARD
  fillPosts(bg, pool, plan.defenders, theirs.pos, was)
}

/**
 * Where the AI would take this actor, exposed for the harness.
 *
 * The player's slot has no AI, so measuring a battleground with it standing
 * still measures a four-versus-five. Driving it through the same reasoning
 * everyone else uses is what makes a fifty-percent win rate mean the rules
 * are even rather than that the scripted human happened to be good.
 */
export function aiGoal(s: SimState, actor: Actor): Vec2 | null {
  const bg = s.bg
  if (!bg || !actor.alive) return null
  const enemies = living(s, other(teamOf(actor)))
  const target = pickTarget(s, actor, enemies)
  return approach(bg, actor, objective(s, bg, actor), target)
}

/**
 * The place this one's orders point at, for the camera to sit behind.
 *
 * The objective rather than `aiGoal`, and the difference matters here. That
 * one blends in whoever is being fought, which is right for walking and wrong
 * for a camera: it would swing the world every time an enemy moved. This is
 * the blunt answer — a node, a flag, a base, a rally — and it is blunt on
 * purpose, for the reason written over `objective` itself.
 */
export function bgAnchor(s: SimState, actor: Actor): Vec2 | null {
  const bg = s.bg
  if (!bg || !actor.alive) return null
  return objective(s, bg, actor).pos
}

/**
 * Somewhere to be, and how far from it is still being there.
 *
 * A capture point pays only while somebody is standing on it, so chasing a
 * kiting caster forty units off the edge is the same as not being there at
 * all. A flag has no circle of its own, but it still has a leash: the goal
 * moves with whoever is carrying it, and the fight is allowed to happen
 * around that rather than instead of it. See `FLAG_LEASH`.
 */
interface Goal {
  pos: Vec2
  /** Leash. Zero means the fight can go wherever it likes. */
  hold: number
}

export function updateBattlegroundAi(s: SimState, actor: Actor, rng: Rng): void {
  const ai = actor.ai
  const bg = s.bg
  if (!ai || !bg || !actor.alive) return

  ai.chatCooldown = Math.max(0, ai.chatCooldown - DT)

  const team = teamOf(actor)
  const enemies = living(s, other(team))
  const target = pickTarget(s, actor, enemies)
  const goal = objective(s, bg, actor)

  // Standing on the objective is the job; the fight is what happens there. So
  // position comes from the goal, and only the last stretch is about the
  // target — a dealer that chases a kite across the map has left the point.
  const want = approach(bg, actor, goal, target)
  moveToward(s, actor, want)

  useAbilities(s, actor, target, rng)
}

/**
 * Where this actor is trying to be, ignoring who is in the way.
 *
 * Objective first, and deliberately blunt: no dynamic reassignment, no
 * planning. Each actor answers "what does my team need from me" from the
 * board alone, which is stable enough that five of them do not thrash between
 * the same two points.
 */
function objective(s: SimState, bg: BgState, actor: Actor): Goal {
  const team = teamOf(actor)
  const free = (pos: Vec2): Goal => ({ pos, hold: 0 })
  // Inside two thirds of the circle, so a leashed fight still has room to
  // move rather than everyone standing on the same pixel.
  const point = (pos: Vec2): Goal => ({ pos, hold: NODE_RADIUS * 0.66 })
  const index = s.actors.filter((a) => teamOf(a) === team).indexOf(actor)

  // The rally outranks whatever the map itself is asking for, while it is up.
  //
  // Not everybody: the last of the five stays on the map, because a rally that
  // empties both sides of the board is thirty seconds in which the match it
  // interrupts does not exist. The one left behind is the last index rather
  // than the first, since blue's first is the player's slot and a mechanic the
  // player is quietly excused from is a mechanic they never see.
  //
  // A carrier is excused too, and only a carrier. Everything a rally is worth
  // is worth less than the flag already in your hands.
  const rally = bg.rally
  const called =
    !rally.settled &&
    rally.telegraph <= RALLY_TELEGRAPH &&
    index < s.actors.filter((a) => teamOf(a) === team).length - 1 &&
    !carrying(s, actor)
  if (called) return { pos: rally.pos, hold: rally.radius * 0.66 }

  // What the plan gave this one. See `updateBattlegroundPlans`.
  const job = bg.assignment[actor.id]
  const held = job === JOB_HOME

  if (bg.kind === 'flags') {
    // An errand on the flag map: go there, and let the fight happen there
    // rather than wherever the nearest enemy has wandered off to.
    const errand = (pos: Vec2): Goal => ({ pos, hold: FLAG_LEASH })
    const ours = bg.flags[team]
    const theirs = bg.flags[other(team)]

    // Carrying it: go home, and nothing else matters.
    if (theirs.carrierId === actor.id) {
      return { pos: bg.bases[team], hold: CARRY_LEASH }
    }

    if (ours.state !== 'home') {
      // Ours is out and nothing this side does scores until it is back, so
      // whoever the plan held back goes and gets it. Both flags out is the
      // state that used to lock a match solid — neither side able to cap while
      // three dealers escorted a carrier with nowhere to score — and the plan
      // answers it by holding back all but the escort.
      const carrier = ours.carrierId
        ? s.actors.find((a) => a.id === ours.carrierId && a.alive)
        : null
      if (held) {
        if (carrier) return errand(carrier.pos)
        if (ours.state === 'dropped') return errand(ours.pos)
      }
    } else if (held) {
      // Ours is home and this one is what keeps it that way. On it rather than
      // near it: a flag is taken by touching it, so a guard standing off to one
      // side is a guard watching it leave.
      return errand(ours.pos)
    }

    // Healers stay with whoever is carrying ours forward.
    const friendlyCarrier = s.actors.find(
      (a) => a.alive && a.id === theirs.carrierId && teamOf(a) === team,
    )
    if (friendlyCarrier && actor.role === 'healer') return errand(friendlyCarrier.pos)

    return errand(theirs.state === 'home' ? bg.bases[other(team)] : theirs.pos)
  }

  if (bg.kind === 'escort' && bg.carts) {
    // Most of the team with its own cart, the rest in front of the other one.
    // Which of the two this is comes from the plan rather than from this
    // actor's place in the team, so being a body down changes it and being
    // ahead frees somebody to go and stop theirs.
    //
    // The objective moves, so the leash goes around the cart rather than
    // around a fixed circle on the floor.
    const pos = held ? bg.carts[other(team)].pos : bg.carts[team].pos
    return { pos, hold: CART_RADIUS * 0.72 }
  }

  // Conquest. The plan names a point; this walks to it.
  //
  // What it used to do was index into the points sorted by distance, which is
  // stable and answers nothing: a side already holding a point kept two people
  // standing on something nobody was contesting while a neutral one went
  // untaken. Two earlier versions did read the board, and both thrashed —
  // sorting by distance from the actor meant a step toward a point reordered
  // the list and sent it back, and calling everybody to a contested point put
  // nine people on one circle while the other two sat unattended. The plan is
  // where that judgement lives now, on a cooldown and off discrete events.
  const chosen =
    bg.nodes.find((n) => n.id === job) ??
    [...bg.nodes].sort(
      (a, b) => dist(bg.bases[team], a.pos) - dist(bg.bases[team], b.pos),
    )[0]
  if (!chosen) return free(actor.pos)
  return point(chosen.pos)
}

/**
 * The objective, adjusted for what the actor needs from its target.
 *
 * Melee have to be on top of someone; casters have to not be. Both give that
 * up when the objective is far away, since a point nobody is standing on
 * scores for nobody.
 */
function approach(bg: BgState, actor: Actor, goal: Goal, target: Actor | null): Vec2 {
  const want = wander(bg, actor, goal, target)
  if (goal.hold <= 0) return want

  // Leashed. Whatever the fight wanted, it happens on the point: a defender
  // pulled off the circle by a kiting caster has conceded the thing they were
  // defending, and the caster has conceded nothing.
  const away = dist(want, goal.pos)
  if (away <= goal.hold) return want
  const scale = goal.hold / away
  return {
    x: goal.pos.x + (want.x - goal.pos.x) * scale,
    y: goal.pos.y + (want.y - goal.pos.y) * scale,
  }
}

function wander(bg: BgState, actor: Actor, goal: Goal, target: Actor | null): Vec2 {
  const toGoal = dist(actor.pos, goal.pos)
  if (!target) return toGoal > ARRIVED ? goal.pos : actor.pos

  const range = dist(actor.pos, target.pos)
  const near = nearEdge(actor)

  if (actor.melee || actor.role === 'tank') {
    // Close on the target, unless that means abandoning the objective.
    if (dist(target.pos, goal.pos) < NODE_RADIUS + 60 || toGoal < ARRIVED) {
      return range > MELEE_RANGE * 0.8 ? target.pos : actor.pos
    }
    return goal.pos
  }

  // Ranged: back off if something walked onto them, otherwise stand still and
  // shoot. Standing still is what a caster wants — every cast is a root.
  if (range < near + target.radius) {
    const away = Math.atan2(actor.pos.y - target.pos.y, actor.pos.x - target.pos.x)
    const out = { x: target.pos.x + Math.cos(away) * (near + 40), y: target.pos.y + Math.sin(away) * (near + 40) }
    clampToArena(out, actor.radius)
    // Backing into a rock is backing into a corner: the push-out would hold
    // the actor against it while it kept trying. Stand where you are instead
    // and let the rock be cover.
    if (inTerrain(bg, out, actor.radius)) return actor.pos
    return out
  }
  if (range > SPELL_RANGE * 0.9) return target.pos
  return toGoal > ARRIVED ? goal.pos : actor.pos
}

function nearEdge(actor: Actor): number {
  const kit = specOf({ classId: actor.classId, spec: actor.spec }).abilities
  const ids = [kit.filler, kit.overTime, kit.finisher].filter((id): id is string => id !== null)
  return Math.max(0, ...ids.map((id) => ABILITIES[id]?.minRange ?? 0))
}

/**
 * Who to hit.
 *
 * Closest, unless somebody is nearly dead or is carrying the flag. A team that
 * all picks the nearest enemy never finishes anyone; a team that all picks the
 * lowest walks past the person hitting them. This is the compromise, and the
 * flag carrier overrides both because a carrier left alone wins the match.
 */
function pickTarget(s: SimState, actor: Actor, enemies: Actor[]): Actor | null {
  if (enemies.length === 0) return null
  const bg = s.bg

  if (bg?.kind === 'flags') {
    const ours = bg.flags[teamOf(actor)]
    const carrier = enemies.find((a) => a.id === ours.carrierId)
    if (carrier) return carrier
  }

  let best = enemies[0]!
  let bestScore = -Infinity
  for (const enemy of enemies) {
    const ratio = enemy.hp / enemy.maxHp
    const d = dist(actor.pos, enemy.pos)
    // Distance is the base, health is a bonus that grows as they get closer
    // to dying, so a finishable target is worth walking for and a healthy one
    // is not.
    let score = -d
    if (ratio < FINISHABLE) score += 400
    else score += (1 - ratio) * 160
    if (score > bestScore) {
      bestScore = score
      best = enemy
    }
  }
  return best
}

function moveToward(s: SimState, actor: Actor, target: Vec2 | null): void {
  const ai = actor.ai!
  if (!target) {
    ai.moveTarget = null
    return
  }
  const d = dist(actor.pos, target)
  if (d < 6) {
    ai.moveTarget = null
    return
  }
  ai.moveTarget = { x: target.x, y: target.y }

  const step = actor.moveSpeed * DT * (carrying(s, actor) ? CARRIER_SPEED : 1) * hasteOf(actor)
  const stepX = ((target.x - actor.pos.x) / d) * step
  const stepY = ((target.y - actor.pos.y) / d) * step
  actor.pos.x += stepX
  actor.pos.y += stepY
  clampToArena(actor.pos, actor.radius)
  clearTerrain(s.bg, actor.pos, actor.radius, stepX, stepY)

  if (actor.castId) interruptCast(s, actor, 'moved')
}

function useAbilities(s: SimState, actor: Actor, target: Actor | null, rng: Rng): void {
  if (actor.castId) return
  if (actor.gcd > 0) return
  const moving = actor.ai!.moveTarget !== null
  const kit = specOf({ classId: actor.classId, spec: actor.spec }).abilities

  if (actor.role === 'healer') {
    const hurt = mostHurt(s, teamOf(actor))
    if (hurt && hurt.hp / hurt.maxHp < WOUNDED) {
      if (kit.finisher && hurt.hp / hurt.maxHp < 0.45) {
        if (cast(s, actor, kit.finisher, hurt.id, rng, moving)) return
      }
      if (cast(s, actor, kit.filler, hurt.id, rng, moving)) return
    }
    // Nobody to heal: a healer that only heals is a healer doing nothing for
    // most of a battleground.
    if (kit.attack && target) {
      if (cast(s, actor, kit.attack, target.id, rng, moving)) return
    }
    return
  }

  if (!target) return

  if (kit.mobility && dist(actor.pos, target.pos) > MELEE_RANGE * 2) {
    if (cast(s, actor, kit.mobility, target.id, rng, moving)) return
  }

  if (kit.overTime) {
    const dot = getAura(target, kit.overTime as AuraId)
    if (!dot || dot.remaining < 3) {
      if (cast(s, actor, kit.overTime, target.id, rng, moving)) return
    }
  }

  if (kit.finisher && cast(s, actor, kit.finisher, target.id, rng, moving)) return
  if (actor.role === 'tank' && kit.threat) {
    if (cast(s, actor, kit.threat, target.id, rng, moving)) return
  }
  cast(s, actor, kit.filler, target.id, rng, moving)
}

function cast(
  s: SimState,
  actor: Actor,
  id: string,
  targetId: number,
  rng: Rng,
  moving: boolean,
): boolean {
  const ability = ABILITIES[id]
  if (!ability) return false
  if (moving && ability.castTime > 0) return false
  return beginCast(s, actor, id, targetId, rng)
}

function mostHurt(s: SimState, team: Team): Actor | null {
  let best: Actor | null = null
  let ratio = Infinity
  for (const a of living(s, team)) {
    const r = a.hp / a.maxHp
    if (r < ratio) {
      ratio = r
      best = a
    }
  }
  return best
}

