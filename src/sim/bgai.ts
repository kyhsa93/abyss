import { ABILITIES } from './abilities'
import { specOf } from './classes'
import { beginCast, dist, getAura, hasteOf, interruptCast } from './combat'
import { DT, MELEE_RANGE, SPELL_RANGE } from './constants'
import {
  CARRIER_SPEED,
  NODE_RADIUS,
  carrying,
  clearTerrain,
  inTerrain,
  living,
  other,
  teamOf,
} from './battleground'
import type { Rng } from './rng'
import { clampToArena } from './state'
import type { Actor, AuraId, BgState, SimState, Team, Vec2 } from './types'

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

/** A dealer will cross the map for someone this hurt. */
const FINISHABLE = 0.35

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
 * Somewhere to be, and how far from it is still being there.
 *
 * A capture point pays only while somebody is standing on it, so chasing a
 * kiting caster forty units off the edge is the same as not being there at
 * all. A flag has no such circle: whoever is carrying it is the objective, and
 * following them across the map is the correct play.
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

  if (bg.kind === 'flags') {
    const ours = bg.flags[team]
    const theirs = bg.flags[other(team)]

    // Carrying it: go home, and nothing else matters.
    if (theirs.carrierId === actor.id) return free(bg.bases[team])

    // Our flag is out, so nothing we do on offence can score until it is
    // back. Who goes depends on whether we are also holding theirs.
    if (ours.state !== 'home') {
      const carrier = ours.carrierId
        ? s.actors.find((a) => a.id === ours.carrierId && a.alive)
        : null

      // Both flags out is the state that used to lock a match solid: neither
      // side can cap, and only the tank and the healer were going to do
      // anything about it while three dealers escorted a carrier who had
      // nowhere to score. Standing still is a loss for both sides, so when we
      // already hold theirs, everyone but one escort goes to get ours back.
      const weHoldTheirs =
        theirs.state === 'carried' &&
        s.actors.some((a) => a.id === theirs.carrierId && a.alive && teamOf(a) === team)
      const escort = weHoldTheirs && actor.role === 'healer'
      const chaseIsMine = weHoldTheirs ? !escort : actor.role === 'tank' || actor.role === 'healer'

      if (carrier) {
        if (chaseIsMine) return free(carrier.pos)
      } else if (ours.state === 'dropped' && chaseIsMine) {
        return free(ours.pos)
      }
    }

    // Healers stay with whoever is carrying ours forward.
    const friendlyCarrier = s.actors.find(
      (a) => a.alive && a.id === theirs.carrierId && teamOf(a) === team,
    )
    if (friendlyCarrier && actor.role === 'healer') return free(friendlyCarrier.pos)

    return free(theirs.state === 'home' ? bg.bases[other(team)] : theirs.pos)
  }

  // Conquest.
  //
  // Every actor is assigned a point and stays on it, whoever owns it. Holding
  // one is defending it, and defending it is how it keeps paying — so there is
  // no separate "go and defend" rule, which is the shape that broke this
  // twice.
  //
  // First it sorted the points by distance from the actor and indexed into
  // that list, so a step toward one reordered the list, reassigned the actor
  // and sent it back: ten AI pacing between two points for whole matches,
  // covering four percent of the ground they walked. Committing to a point
  // fixed the pacing and introduced the opposite failure — a contested point
  // called the whole team to it, both teams answered, and nine people stood on
  // one circle for three minutes while the other two sat unattended.
  //
  // A fixed split has neither problem. Five people over three points is
  // two-two-one and stays that way, so nothing is ever unattended and nobody
  // walks anywhere to find that out.
  const ordered = [...bg.nodes].sort(
    (a, b) => dist(bg.bases[team], a.pos) - dist(bg.bases[team], b.pos),
  )
  if (ordered.length === 0) return free(actor.pos)

  const index = s.actors.filter((a) => teamOf(a) === team).indexOf(actor)
  const chosen = ordered[index % ordered.length]!
  bg.assignment[actor.id] = chosen.id
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

