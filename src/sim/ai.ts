import { ABILITIES } from './abilities'
import { ARENA_RADIUS, DT, MELEE_RANGE, SPREAD_RADIUS } from './constants'
import {
  beginCast,
  boss,
  dist,
  getAura,
  interruptCast,
  livingParty,
  say,
} from './combat'
import type { Rng } from './rng'
import { clampToArena } from './state'
import type { Actor, SimState, Vec2 } from './types'

/**
 * Party AI.
 *
 * Three layers, evaluated in order: stay alive, do your job, fill with damage.
 * On top of that sits a "humanity" layer — reaction delay, fumble rolls and a
 * pull toward the rest of the group — because an AI that always picks the
 * optimal tile at frame zero reads as a robot, not a raider.
 */

const DANGER_MARGIN = 14

export function updatePartyAi(s: SimState, actor: Actor, rng: Rng): void {
  const ai = actor.ai
  if (!ai || !actor.alive) return

  ai.chatCooldown = Math.max(0, ai.chatCooldown - DT)

  const danger = currentDanger(s, actor)

  // Reaction time is rolled once per distinct danger, not per tick, so the
  // AI does not "re-notice" the same puddle every frame.
  if (danger !== ai.reactingTo) {
    ai.reactingTo = danger
    ai.fumbled = false
    if (danger) {
      ai.reactionTimer = ai.reactionDelay * rng.range(0.7, 1.4)
      // A fumble means it reacts far too late — the AI equivalent of
      // tunnel-visioning on your rotation.
      if (rng.chance(ai.mistakeChance)) {
        ai.fumbled = true
        ai.reactionTimer += rng.range(0.8, 1.6)
      }
    } else {
      ai.reactionTimer = 0
    }
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
    if (danger.startsWith('spread')) {
      say(s, actor, 'Spreading out')
    } else if (ai.personality === 'timid') {
      say(s, actor, 'Moving!')
    }
  } else if (!ai.moveTarget) {
    ai.moveTarget = idlePosition(s, actor)
  }

  moveToward(s, actor, ai.moveTarget)
  useAbilities(s, actor, rng)
}

/** A stable key describing what the AI should currently be running from. */
function currentDanger(s: SimState, actor: Actor): string | null {
  if (getAura(actor, 'spread')) return 'spread:self'

  for (const g of s.ground) {
    if (dist(actor.pos, g.pos) <= g.radius + DANGER_MARGIN) {
      return `puddle:${g.id}`
    }
  }

  // Standing next to someone about to detonate is just as lethal.
  for (const other of livingParty(s)) {
    if (other.id === actor.id) continue
    if (getAura(other, 'spread') && dist(actor.pos, other.pos) <= SPREAD_RADIUS + DANGER_MARGIN) {
      return `spread:${other.id}`
    }
  }
  return null
}

/** Cheap re-check of an already chosen destination. */
function isSpotSafe(s: SimState, actor: Actor, spot: Vec2): boolean {
  for (const g of s.ground) {
    if (dist(spot, g.pos) <= g.radius + DANGER_MARGIN) return false
  }

  const carrying = getAura(actor, 'spread') !== undefined
  for (const other of livingParty(s)) {
    if (other.id === actor.id) continue
    const otherCarries = getAura(other, 'spread') !== undefined
    if (!carrying && !otherCarries) continue
    if (dist(spot, other.pos) < SPREAD_RADIUS + DANGER_MARGIN) return false
  }
  return true
}

function idlePosition(s: SimState, actor: Actor): Vec2 {
  const b = boss(s)
  if (actor.role === 'tank') {
    // Hold the boss just off centre so casters have room behind.
    return { x: b.pos.x, y: b.pos.y - MELEE_RANGE * 0.7 }
  }
  return { x: b.pos.x - 40, y: b.pos.y + 150 }
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

  let best: Vec2 = { x: actor.pos.x, y: actor.pos.y }
  let bestScore = -Infinity

  const rings = [70, 130, 200]
  // Rotate the sample ring a little each time so movement is not perfectly grid-like.
  const offset = rng.range(0, Math.PI / 8)

  for (let i = 0; i < 16; i++) {
    const angle = offset + (i / 16) * Math.PI * 2
    for (const r of rings) {
      const candidate: Vec2 = {
        x: actor.pos.x + Math.cos(angle) * r,
        y: actor.pos.y + Math.sin(angle) * r,
      }
      clampToArena(candidate, actor.radius)

      let score = 0

      // 1. Ground danger dominates everything else.
      for (const g of s.ground) {
        const d = dist(candidate, g.pos)
        if (d <= g.radius + DANGER_MARGIN) score -= 1000
        else score -= Math.max(0, 200 - d) * 0.5
      }

      // 2. Spread separation.
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

      // 3. Role positioning.
      const bossDist = dist(candidate, b.pos)
      if (actor.role === 'tank') {
        // A tank does not stand in fire to keep melee range; it drags the boss
        // out instead. The boss chases threat, so walking away relocates it.
        if (bossDist > 200) score -= (bossDist - 200) * 3
        else score -= bossDist * 0.35
      } else {
        // Casters want to stay in range but out of the boss's lap.
        if (bossDist < 90) score -= (90 - bossDist) * 4
        if (bossDist > 280) score -= (bossDist - 280) * 4
      }

      // 4. Humanity: drift toward the group.
      score -= dist(candidate, centroid) * ai.clustering

      // 5. Do not run further than necessary.
      score -= dist(candidate, actor.pos) * 0.35

      // 6. Hugging the wall is bad; puddles there trap you.
      score -= Math.max(0, Math.hypot(candidate.x, candidate.y) - (ARENA_RADIUS - 60)) * 2

      if (score > bestScore) {
        bestScore = score
        best = candidate
      }
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

  const stepLen = actor.moveSpeed * DT
  actor.pos.x += ((target.x - actor.pos.x) / d) * stepLen
  actor.pos.y += ((target.y - actor.pos.y) / d) * stepLen
  clampToArena(actor.pos, actor.radius)

  if (actor.castId) interruptCast(s, actor, 'moved')
}

// --- ability priorities -----------------------------------------------------

function useAbilities(s: SimState, actor: Actor, rng: Rng): void {
  if (actor.castId || actor.gcd > 0) return
  // While relocating, only instants are available — exactly the constraint a
  // human healer plays under. Without this the AI starts a cast every tick and
  // movement cancels it every tick, so it heals for nothing.
  const moving = actor.ai!.moveTarget !== null
  if (actor.role === 'tank') tankRotation(s, actor, rng, moving)
  else if (actor.role === 'healer') healerRotation(s, actor, rng, moving)
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

function tankRotation(s: SimState, actor: Actor, rng: Rng, moving: boolean): void {
  const b = boss(s)
  const ai = actor.ai!

  // Defensive on the incoming slam. The fumble roll is what makes the tank
  // occasionally eat it, which is exactly what a real tank does.
  if (b.castId === 'boss_slam' && b.castRemaining < 1.2) {
    const ready = (actor.cooldowns['shield_wall'] ?? 0) <= 0
    if (ready && !rng.chance(ai.mistakeChance)) {
      if (tryCast(s, actor, 'shield_wall', actor.id, rng, moving)) {
        say(s, actor, 'Wall up')
        return
      }
    }
  }

  if (tryCast(s, actor, 'shield_slam', b.id, rng, moving)) return
  tryCast(s, actor, 'cleave', b.id, rng, moving)
}

function healerRotation(s: SimState, actor: Actor, rng: Rng, moving: boolean): void {
  const ai = actor.ai!
  const wounded = lowestHealth(s)
  if (!wounded) return

  const ratio = wounded.hp / wounded.maxHp
  const manaRatio = actor.mana / actor.maxMana

  // Timid healers panic earlier and burn mana; greedy ones let people ride low.
  const emergency = ai.personality === 'timid' ? 0.55 : ai.personality === 'greedy' ? 0.35 : 0.45
  const topOff = ai.personality === 'timid' ? 0.95 : 0.82

  if (ratio < emergency && (actor.cooldowns['flash'] ?? 0) <= 0) {
    if (tryCast(s, actor, 'flash', wounded.id, rng, moving)) {
      say(s, actor, `${wounded.name} is low!`)
      return
    }
  }

  const tank = livingParty(s).find((a) => a.role === 'tank')
  if (tank && !getAura(tank, 'renew') && tank.hp / tank.maxHp < 0.95 && manaRatio > 0.2) {
    if (tryCast(s, actor, 'renew', tank.id, rng, moving)) return
  }

  if (ratio < topOff) {
    if (manaRatio < 0.15 && ratio > 0.6) {
      say(s, actor, 'Low mana')
      return
    }
    tryCast(s, actor, 'heal', wounded.id, rng, moving)
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
