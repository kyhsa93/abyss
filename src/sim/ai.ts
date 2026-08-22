import { ABILITIES } from './abilities'
import {
  ARENA_RADIUS,
  DT,
  MELEE_RANGE,
  PUDDLE_TELEGRAPH,
  SOAK_TELEGRAPH,
  SPREAD_RADIUS,
} from './constants'
import { BREATH_CAST, insideCone } from './boss'
import { specOf } from './classes'
import { damageOrder } from './autocast'
import {
  adds,
  beginCast,
  boss,
  dist,
  getAura,
  hasteOf,
  interruptCast,
  livingParty,
  say,
  topThreatTarget,
} from './combat'
import type { Rng } from './rng'
import { clampToArena } from './state'
import type { Actor, AuraId, SimState, Vec2 } from './types'

/**
 * Party AI.
 *
 * Three layers, evaluated in order: stay alive, do your job, fill with damage.
 * On top of that sits a "humanity" layer — reaction delay, fumble rolls and a
 * pull toward the rest of the group — because an AI that always picks the
 * optimal tile at frame zero reads as a robot, not a raider.
 */

const DANGER_MARGIN = 14

/** Casters stay inside ability range but out of the boss's lap. */
const CASTER_MIN_RANGE = 95
const CASTER_MAX_RANGE = 320
const CASTER_IDEAL_RANGE = 225
const HEAL_REACH = 360

export function updatePartyAi(s: SimState, actor: Actor, rng: Rng): void {
  const ai = actor.ai
  if (!ai || !actor.alive) return

  ai.chatCooldown = Math.max(0, ai.chatCooldown - DT)

  const danger = currentDanger(s, actor)

  // Reaction time is rolled once per distinct danger, not per tick, so the
  // AI does not "re-notice" the same puddle every frame.
  if (danger === null) {
    ai.reactingTo = null
    ai.reactionTimer = 0
    ai.fumbled = false
  } else if (ai.reactingTo === null) {
    // Noticing danger at all is what costs reaction time.
    ai.reactingTo = danger
    ai.fumbled = false
    ai.reactionTimer = ai.reactionDelay * rng.range(0.7, 1.4)
    // A fumble means it reacts far too late — the AI equivalent of
    // tunnel-visioning on your rotation.
    if (rng.chance(ai.mistakeChance)) {
      ai.fumbled = true
      ai.reactionTimer += rng.range(0.8, 1.6)
    }
  } else if (danger !== ai.reactingTo) {
    // Already alert: switching threats does not buy another delay, or a party
    // caught between two mechanics would freeze between them. The destination
    // is deliberately kept — isSpotSafe re-validates it against every hazard,
    // and clearing it here made the AI re-pick every tick and jitter in place.
    ai.reactingTo = danger
  }

  if (ai.reactionTimer > 0) ai.reactionTimer -= DT

  const reacting = danger !== null && ai.reactionTimer <= 0

  if (reacting) {
    // Recompute only when there is no destination or the chosen one went bad.
    // Re-picking every tick makes the AI jitter in place and never escape.
    if (!ai.moveTarget || !isSpotSafe(s, actor, ai.moveTarget)) {
      ai.moveTarget = findSafeSpot(s, actor, rng)
    }
    if (actor.castId) {
      // Greedy players try to squeeze the cast out; timid ones bail instantly.
      const nearlyDone = actor.castRemaining < 0.35
      const greedy = ai.personality === 'greedy'
      if (!(greedy && nearlyDone)) interruptCast(s, actor, 'moved')
    }
    if (danger.startsWith('wave')) {
      say(s, actor, 'Inside, get in!')
    } else if (danger.startsWith('breath')) {
      say(s, actor, 'Out of the front')
    } else if (danger.startsWith('spread')) {
      say(s, actor, 'Spreading out')
    } else if (ai.personality === 'timid') {
      say(s, actor, 'Moving!')
    }
  } else if (ai.moveTarget && isSpotSafe(s, actor, actor.pos) && !outOfPosition(s, actor)) {
    // The danger passed and here is fine. Stop; do not walk back to some
    // nominal home. Chasing a home position that is itself defined relative
    // to a moving boss is what made the party pace back and forth.
    ai.moveTarget = null
  } else if (!ai.moveTarget && outOfPosition(s, actor)) {
    ai.moveTarget = idlePosition(s, actor)
  }

  moveToward(s, actor, ai.moveTarget)
  useAbilities(s, actor, rng)
}

/**
 * The single most urgent thing to run from, as a stable key.
 *
 * Returning merely the first hazard found meant an AI reacting to the breath
 * would not notice the puddle detonating under its feet. Rank them instead:
 * already burning beats about to burn beats everything else.
 */
function currentDanger(s: SimState, actor: Actor): string | null {
  let bestKey: string | null = null
  let bestUrgency = -1

  const consider = (key: string, urgency: number): void => {
    if (urgency > bestUrgency) {
      bestUrgency = urgency
      bestKey = key
    }
  }

  if (getAura(actor, 'spread')) consider('spread:self', 62)

  // Something is walking over. It is slower than anyone it picks, so the
  // answer is simply to keep moving — but only for the one it picked, and
  // only while it is close enough to matter. Urgency below a puddle: fire on
  // the floor kills faster than a thing that is still ten paces away.
  const stalker = hunterOf(s, actor)
  if (stalker && dist(actor.pos, stalker.pos) < STALK_ROOM) {
    consider(`hunted:${stalker.id}`, 66)
  }

  for (const g of s.ground) {
    if (g.kind === 'breath') {
      if (!g.detonated && insideCone(actor.pos, g)) {
        consider(`breath:${g.id}`, 70 + (BREATH_CAST - g.telegraph) * 8)
      }
      continue
    }

    if (g.kind === 'shockwave') {
      const d = dist(actor.pos, g.pos)
      if (d > g.radius - g.band - 12) consider(`wave:${g.id}`, 78)
      continue
    }

    // Being outside the circle is the danger, and it gets worse as the timer
    // runs down. Urgency above the cone's: everything else here costs the one
    // who got it wrong, and this one costs everybody who got it right.
    if (g.kind === 'soak') {
      if (!g.detonated && dist(actor.pos, g.pos) > g.radius - actor.radius) {
        consider(`soak:${g.id}`, 84 + (SOAK_TELEGRAPH - g.telegraph) * 6)
      }
      continue
    }

    const d = dist(actor.pos, g.pos)
    if (d <= g.radius + DANGER_MARGIN) {
      // Standing in live fire is the most urgent state there is.
      consider(`puddle:${g.id}`, g.detonated ? 100 : 80 + (PUDDLE_TELEGRAPH - g.telegraph) * 9)
    }
  }

  // Standing next to someone about to detonate is just as lethal.
  for (const other of livingParty(s)) {
    if (other.id === actor.id) continue
    if (getAura(other, 'spread') && dist(actor.pos, other.pos) <= SPREAD_RADIUS + DANGER_MARGIN) {
      consider(`spread:${other.id}`, 55)
    }
  }

  return bestKey
}

/**
 * The thing following this actor, if anything is.
 *
 * Read off the aura rather than searched for by proximity: a stalker that has
 * walked past somebody else is still not their problem.
 */
function hunterOf(s: SimState, actor: Actor): Actor | null {
  const mark = getAura(actor, 'hunted')
  if (!mark) return null
  const stalker = s.actors.find((a) => a.id === mark.sourceId)
  return stalker && stalker.alive ? stalker : null
}

/** How close the thing chasing you has to be before it is worth running. */
const STALK_ROOM = 110

/** Cheap re-check of an already chosen destination. */
function isSpotSafe(s: SimState, actor: Actor, spot: Vec2): boolean {
  for (const g of s.ground) {
    if (g.kind === 'breath') {
      if (!g.detonated && insideCone(spot, g)) return false
      continue
    }
    if (g.kind === 'shockwave') {
      if (dist(spot, g.pos) > g.radius - g.band - 12) return false
      continue
    }
    // Inverted: this is the one piece of ground that is only safe from the
    // inside.
    if (g.kind === 'soak') {
      if (!g.detonated && dist(spot, g.pos) > g.radius - actor.radius) return false
      continue
    }
    if (dist(spot, g.pos) <= g.radius + DANGER_MARGIN) return false
  }

  const chaser = hunterOf(s, actor)
  if (chaser && dist(spot, chaser.pos) < STALK_ROOM * 0.8) return false

  const carrying = getAura(actor, 'spread') !== undefined
  for (const other of livingParty(s)) {
    if (other.id === actor.id) continue
    const otherCarries = getAura(other, 'spread') !== undefined
    if (!carrying && !otherCarries) continue
    if (dist(spot, other.pos) < SPREAD_RADIUS + DANGER_MARGIN) return false
  }
  return true
}

/**
 * True only when the actor genuinely cannot do its job from where it stands.
 *
 * Anything looser than this produces fidgeting: a party that drifts back to a
 * nominal formation every time the floor clears looks busy, not competent.
 */
function outOfPosition(s: SimState, actor: Actor): boolean {
  const b = boss(s)
  const d = dist(actor.pos, b.pos)

  if (actor.role === 'tank' || actor.melee) return d > MELEE_RANGE + b.radius * 0.6

  if (d > CASTER_MAX_RANGE || d < CASTER_MIN_RANGE) return true

  // Its own near edge is wider than the distance a caster is happy at, so a
  // shooter has to be asked about its own rule rather than the shared one.
  //
  // Only about the boss. A thrall standing on a hunter is not worth running
  // from: it shoots past it at the boss instead, and running would cost more
  // uptime than the thrall does.
  if (tooClose(actor, b)) return true

  if (actor.role === 'healer') {
    // A healer also has to be able to reach whoever is hurt.
    const wounded = lowestHealth(s)
    if (wounded && wounded.id !== actor.id && dist(actor.pos, wounded.pos) > HEAL_REACH) {
      return true
    }
  }
  return false
}

/**
 * The smallest correction that fixes the problem: keep the actor's current
 * bearing from the boss and only adjust distance. Returning to a shared home
 * tile would also stack the whole party on one spot for the next puddle.
 */
function idlePosition(s: SimState, actor: Actor): Vec2 {
  const b = boss(s)
  const d = dist(actor.pos, b.pos) || 1
  const want = actor.role === 'tank' || actor.melee ? MELEE_RANGE * 0.8 : CASTER_IDEAL_RANGE

  const bearingX = (actor.pos.x - b.pos.x) / d
  const bearingY = (actor.pos.y - b.pos.y) / d
  return { x: b.pos.x + bearingX * want, y: b.pos.y + bearingY * want }
}

/**
 * Samples positions around the actor and scores them. The clustering term is
 * what makes the result look human: real players regroup toward the pack
 * instead of scattering to mathematically ideal corners.
 */
function findSafeSpot(s: SimState, actor: Actor, rng: Rng): Vec2 {
  const centroid = partyCentroid(s, actor)
  const b = boss(s)
  const ai = actor.ai!

  const candidates: Vec2[] = [{ x: actor.pos.x, y: actor.pos.y }]

  // Rings around the actor cover ordinary sidestepping.
  const rings = [80, 160, 260]
  // Rotate the sample ring a little each time so movement is not perfectly grid-like.
  const offset = rng.range(0, Math.PI / 8)
  for (let i = 0; i < 16; i++) {
    const angle = offset + (i / 16) * Math.PI * 2
    for (const r of rings) {
      candidates.push({
        x: actor.pos.x + Math.cos(angle) * r,
        y: actor.pos.y + Math.sin(angle) * r,
      })
    }
  }

  // Some mechanics have their answer somewhere specific and far away, which
  // sampling around the actor will almost never land on. Offer those directly.
  for (const g of s.ground) {
    if (g.kind === 'shockwave') {
      // The pocket inside the ring.
      const pocket = Math.max(52, (g.radius - g.band) * 0.62)
      for (let i = 0; i < 8; i++) {
        const angle = offset + (i / 8) * Math.PI * 2
        candidates.push({
          x: g.pos.x + Math.cos(angle) * pocket,
          y: g.pos.y + Math.sin(angle) * pocket,
        })
      }
    } else if (g.kind === 'soak' && !g.detonated) {
      // Sampling around the actor will not find a circle two hundred units
      // away, so it is offered directly — the same problem the ring's pocket
      // has, and the same answer.
      candidates.push({ x: g.pos.x, y: g.pos.y })
      for (let i = 0; i < 8; i++) {
        const angle = offset + (i / 8) * Math.PI * 2
        candidates.push({
          x: g.pos.x + Math.cos(angle) * g.radius * 0.55,
          y: g.pos.y + Math.sin(angle) * g.radius * 0.55,
        })
      }
    } else if (g.kind === 'breath' && !g.detonated) {
      // Behind and beside the cone. The short ring matters for melee, which
      // has to end up behind the boss rather than away from it.
      for (const side of [Math.PI, Math.PI * 0.6, -Math.PI * 0.6]) {
        for (const r of [60, 150, 250]) {
          candidates.push({
            x: g.pos.x + Math.cos(g.angle + side) * r,
            y: g.pos.y + Math.sin(g.angle + side) * r,
          })
        }
      }
    }
  }

  const chasing = hunterOf(s, actor)

  let best: Vec2 = { x: actor.pos.x, y: actor.pos.y }
  let bestScore = -Infinity

  for (const candidate of candidates) {
    clampToArena(candidate, actor.radius)

    let score = 0

    // 1. Ground danger dominates everything else.
    let ringActive = false
    let soakActive = false
    for (const g of s.ground) {
      if (g.kind === 'breath') {
        if (!g.detonated && insideCone(candidate, g)) score -= 1400
        continue
      }
      if (g.kind === 'soak') {
        if (g.detonated) continue
        soakActive = true
        const d = dist(candidate, g.pos)
        // Worth more than the cone is worth avoiding: a party that trickles
        // in one at a time divides the hit by one and takes it five times.
        if (d > g.radius - actor.radius) score -= 1600
        else score += Math.min(240, (g.radius - d) * 2)
        continue
      }
      if (g.kind === 'shockwave') {
        ringActive = true
        const d = dist(candidate, g.pos)
        // Inside the ring is safe; the band and everything beyond it is not.
        if (d > g.radius - g.band - 12) score -= 1400
        else score += Math.min(200, (g.radius - g.band - d) * 2)
        continue
      }
      const d = dist(candidate, g.pos)
      if (d <= g.radius + DANGER_MARGIN) score -= 1000
      else score -= Math.max(0, 200 - d) * 0.5
    }

    // 2. Whatever is chasing this one. Distance is the whole answer, but
    // only up to a point — running to the far wall to escape something that
    // walks costs more uptime than the thing does.
    if (chasing) {
      const d = dist(candidate, chasing.pos)
      // Below what fire costs, deliberately. The first version weighted this
      // above the floor, so the one being chased would stand in a puddle to
      // put eight paces between itself and something walking — and the
      // mechanic's real damage turned out to be the deaths that caused, not
      // anything the stalker landed itself.
      if (d < STALK_ROOM * 0.8) score -= 700
      else score += Math.min(180, (d - STALK_ROOM * 0.8) * 1.2)
    }

    // 3. Spread separation.
    const carryingSpread = getAura(actor, 'spread') !== undefined
    for (const other of livingParty(s)) {
      if (other.id === actor.id) continue
      const d = dist(candidate, other.pos)
      const otherCarries = getAura(other, 'spread') !== undefined
      if (carryingSpread || otherCarries) {
        if (d < SPREAD_RADIUS + DANGER_MARGIN) score -= 900
        else score += Math.min(d, 260) * 0.4
      }
    }

    // 4. Role positioning.
    const bossDist = dist(candidate, b.pos)
    if (soakActive) {
      // Standing in it beats standing in range of anything. Suspended the
      // same way the ring suspends the casters' spacing, and for melee too:
      // the boss is not going anywhere in five seconds.
    } else if (actor.role === 'tank' || actor.melee) {
      // A tank does not stand in fire to keep melee range; it drags the boss
      // out instead. The boss chases threat, so walking away relocates it.
      if (bossDist > 200) score -= (bossDist - 200) * 3
      else score -= bossDist * 0.35
    } else if (!ringActive) {
      // Casters want to stay in range but out of the boss's lap. Suspended
      // while a ring is out, because hugging the boss is then the answer.
      if (bossDist < 90) score -= (90 - bossDist) * 4
      if (bossDist > 280) score -= (bossDist - 280) * 4
    }

    // 5. Humanity: drift toward the group.
    score -= dist(candidate, centroid) * ai.clustering

    // 6. Do not run further than necessary.
    score -= dist(candidate, actor.pos) * 0.35

    // 7. Hugging the wall is bad; puddles there trap you.
    score -= Math.max(0, Math.hypot(candidate.x, candidate.y) - (ARENA_RADIUS - 60)) * 2

    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }

  return best
}

function partyCentroid(s: SimState, exclude: Actor): Vec2 {
  let x = 0
  let y = 0
  let n = 0
  for (const a of livingParty(s)) {
    if (a.id === exclude.id) continue
    x += a.pos.x
    y += a.pos.y
    n++
  }
  return n === 0 ? { x: 0, y: 0 } : { x: x / n, y: y / n }
}

function moveToward(s: SimState, actor: Actor, target: Vec2 | null): void {
  if (!target) return
  const d = dist(actor.pos, target)
  if (d < 6) {
    actor.ai!.moveTarget = null
    return
  }

  const stepLen = actor.moveSpeed * DT * hasteOf(actor)
  actor.pos.x += ((target.x - actor.pos.x) / d) * stepLen
  actor.pos.y += ((target.y - actor.pos.y) / d) * stepLen
  clampToArena(actor.pos, actor.radius)

  if (actor.castId) interruptCast(s, actor, 'moved')
}

// --- ability priorities -----------------------------------------------------

function useAbilities(s: SimState, actor: Actor, rng: Rng): void {
  if (actor.castId) return
  // Off-GCD defensives are still worth checking while the global is running.
  if (actor.gcd > 0 && !canUseOffGcd(s, actor)) return
  // While relocating, only instants are available — exactly the constraint a
  // human healer plays under. Without this the AI starts a cast every tick and
  // movement cancels it every tick, so it heals for nothing.
  const moving = actor.ai!.moveTarget !== null
  if (actor.role === 'tank') tankRotation(s, actor, rng, moving)
  else if (actor.role === 'healer') healerRotation(s, actor, rng, moving)
  else dpsRotation(s, actor, rng, moving)
}

/** The spec an actor is playing. */
function specFor(actor: Actor) {
  return specOf({ classId: actor.classId, spec: actor.spec })
}

/** Is there anything worth pressing that ignores the global cooldown? */
function canUseOffGcd(s: SimState, actor: Actor): boolean {
  const kit = specFor(actor).abilities
  if (!kit.defensive) return false
  const ability = ABILITIES[kit.defensive]
  if (!ability?.offGcd) return false
  if ((actor.cooldowns[kit.defensive] ?? 0) > 0) return false
  const b = boss(s)
  return b.castId === 'boss_slam' && b.castRemaining < 1.2
}

/** beginCast, but refuses cast-time abilities while the actor is on the move. */
function tryCast(
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

/**
 * Inside the near edge of everything this actor could point at it.
 *
 * Read off the kit rather than the class: whatever the widest near edge among
 * its abilities is, that is the distance at which it is useless.
 */
function tooClose(actor: Actor, target: Actor): boolean {
  const kit = specFor(actor).abilities
  const ids = [kit.filler, kit.overTime, kit.finisher].filter((id): id is string => id !== null)
  const near = Math.max(0, ...ids.map((id) => ABILITIES[id]?.minRange ?? 0))
  if (near === 0) return false
  return dist(actor.pos, target.pos) < near + target.radius
}

/**
 * Closing a gap the class can close itself.
 *
 * Melee spend the opening seconds walking, and a warrior has a button for
 * exactly that. Tried before the rotation, since nothing else it presses will
 * land from out there anyway.
 */
function tryCharge(s: SimState, actor: Actor, target: Actor, rng: Rng, moving: boolean): boolean {
  const kit = specFor(actor).abilities
  if (!kit.mobility) return false
  return tryCast(s, actor, kit.mobility, target.id, rng, moving)
}

/** Stacks of armour break that make handing the boss over the right call. */
const SWAP_AT = 3

function tankRotation(s: SimState, actor: Actor, rng: Rng, moving: boolean): void {
  const b = boss(s)
  const ai = actor.ai!
  const kit = specFor(actor).abilities

  if (tryCharge(s, actor, b, rng, moving)) return

  // The swap.
  //
  // The rule below deliberately refuses to taunt off another tank, because a
  // pair that trades on cooldown drags the boss through the melee all fight.
  // A stack of armour breaks is the one reason to do it anyway: the holder is
  // taking nearly double by the top of it, and the answer is the other tank,
  // not the healer. Only downward — taunting a fresher stack onto a heavier
  // one is the trade backwards.
  const mine = getAura(actor, 'sunder')?.stacks ?? 0
  if (kit.taunt && mine < SWAP_AT) {
    const holder = topThreatTarget(s)
    const theirs = holder ? (getAura(holder, 'sunder')?.stacks ?? 0) : 0
    if (holder && holder.id !== actor.id && holder.role === 'tank' && theirs >= SWAP_AT && theirs > mine) {
      if (!rng.chance(ai.mistakeChance) && tryCast(s, actor, kit.taunt, b.id, rng, moving)) {
        say(s, actor, `Swapping — you are at ${theirs}`)
        return
      }
    }
  }

  // Defensive on the incoming slam. The fumble roll is what makes the tank
  // occasionally eat it, which is exactly what a real tank does.
  if (kit.defensive && b.castId === 'boss_slam' && b.castRemaining < 1.2) {
    const ready = (actor.cooldowns[kit.defensive] ?? 0) <= 0
    if (ready && !rng.chance(ai.mistakeChance)) {
      if (tryCast(s, actor, kit.defensive, actor.id, rng, moving)) {
        say(s, actor, 'Wall up')
        return
      }
    }
  }

  // Take the boss back off whoever it wandered to.
  //
  // Only when the holder is not a tank: with two tanks in a raid, a rule that
  // says "taunt whenever you are not the target" makes them trade the boss
  // back and forth on cooldown for the whole fight, which drags it through
  // the melee and looks like a bug.
  if (kit.taunt) {
    const holder = topThreatTarget(s)
    if (holder && holder.id !== actor.id && holder.role !== 'tank') {
      if (!rng.chance(ai.mistakeChance) && tryCast(s, actor, kit.taunt, b.id, rng, moving)) {
        say(s, actor, `Taunting off ${holder.name}`)
        return
      }
    }
  }

  if (kit.threat && tryCast(s, actor, kit.threat, b.id, rng, moving)) return
  tryCast(s, actor, kit.filler, b.id, rng, moving)
}

function healerRotation(s: SimState, actor: Actor, rng: Rng, moving: boolean): void {
  const ai = actor.ai!
  const kit = specFor(actor).abilities
  const wounded = lowestHealth(s)
  if (!wounded) return

  const ratio = wounded.hp / wounded.maxHp
  const powerLeft = actor.maxPower > 0 ? actor.power / actor.maxPower : 1

  // Timid healers panic earlier and burn mana; greedy ones let people ride low.
  const emergency = ai.personality === 'timid' ? 0.55 : ai.personality === 'greedy' ? 0.35 : 0.45
  const topOff = ai.personality === 'timid' ? 0.95 : 0.82

  if (kit.finisher && ratio < emergency && (actor.cooldowns[kit.finisher] ?? 0) <= 0) {
    if (tryCast(s, actor, kit.finisher, wounded.id, rng, moving)) {
      say(s, actor, `${wounded.name} is low!`)
      return
    }
  }

  if (kit.overTime) {
    const tank = livingParty(s).find((a) => a.role === 'tank')
    const on = tank ?? wounded
    if (!getAura(on, kit.overTime as AuraId) && on.hp / on.maxHp < 0.95 && powerLeft > 0.2) {
      if (tryCast(s, actor, kit.overTime, on.id, rng, moving)) return
    }
  }

  if (ratio < topOff) {
    if (powerLeft < 0.15 && ratio > 0.6) {
      say(s, actor, 'Low mana')
      return
    }
    tryCast(s, actor, kit.filler, wounded.id, rng, moving)
    return
  }

  // Nobody needs healing: help kill it, but keep enough mana in reserve to
  // answer the next spike.
  if (kit.attack && powerLeft > 0.55) {
    const summoned = adds(s)
    const target = summoned.length > 0 ? summoned[0]! : boss(s)
    tryCast(s, actor, kit.attack, target.id, rng, moving)
  }
}

function dpsRotation(s: SimState, actor: Actor, rng: Rng, moving: boolean): void {
  const b = boss(s)
  if (!b.alive) return
  const kit = specFor(actor).abilities

  // Adds first: they beeline for whoever is closest and shred a healer.
  const summoned = adds(s)
  let target = b
  if (summoned.length > 0) {
    let focus = summoned[0]!
    for (const a of summoned) if (a.hp < focus.hp) focus = a
    target = focus
  }

  // A bow has a near edge, and a thrall's whole plan is to stand on you. The
  // one it cannot shoot is not a target, so it shoots past it at the boss
  // rather than standing there doing nothing at all.
  if (tooClose(actor, target)) target = tooClose(actor, b) ? target : b

  if (tryCharge(s, actor, target, rng, moving)) return

  // The priority comes from the spec's trait, and it is the same one the
  // player's autocast uses: an AI that does not know a rogue banks points
  // plays a rogue as a warrior with different words on the buttons.
  const ai = actor.ai!
  const dangerNear = s.ground.some(
    (g) => g.kind === 'puddle' && !g.detonated && dist(actor.pos, g.pos) < g.radius + 130,
  )

  for (const id of damageOrder(actor, target)) {
    // Keep the dot up, but only refresh near the end so several dealers do not
    // all spend a global on the same debuff.
    if (id === kit.overTime) {
      const dot = getAura(target, kit.overTime as AuraId)
      if (dot && dot.remaining >= 3) continue
    }

    // A long cast roots you. Steady dealers refuse it with a telegraph nearby;
    // greedy ones gamble roughly half the time, which is where their deaths
    // come from — and why they read as a specific kind of player.
    // Only a long cast is a gamble worth refusing. A mage's filler is a cast
    // now, and refusing every cast near a telegraph left it pressing nothing
    // at all for the parts of a fight that have anything on the floor.
    const ability = ABILITIES[id]
    if (ability && ability.castTime > 1.5 && dangerNear) {
      if (!(ai.personality === 'greedy' && rng.chance(0.5))) continue
    }

    if (tryCast(s, actor, id, target.id, rng, moving)) return
  }
}

function lowestHealth(s: SimState): Actor | null {
  let best: Actor | null = null
  let bestRatio = Infinity
  for (const a of livingParty(s)) {
    const ratio = a.hp / a.maxHp
    if (ratio < bestRatio) {
      bestRatio = ratio
      best = a
    }
  }
  return best
}
