import { DT, ENRAGE_AT, MELEE_RANGE, PHASE_TWO_HP, PUDDLE_TELEGRAPH } from './constants'
import {
  addAura,
  applyDamage,
  boss,
  dist,
  livingParty,
  say,
  topThreatTarget,
} from './combat'
import type { Rng } from './rng'
import { clampToArena } from './state'
import type { GroundEffect, SimState } from './types'

/**
 * The boss is deliberately NOT an AI.
 *
 * A raid boss that improvises cannot be learned, and learning the script is
 * the entire point of the genre. So this is a fixed timeline with hard phase
 * transitions; the only randomness is *who* gets targeted, which keeps pulls
 * from being identical without making them unlearnable.
 */

interface PhaseTiming {
  swing: number
  puddle: number
  spread: number
  slam: number
  puddleCount: number
  /** Unavoidable party-wide damage; the healer's actual test. */
  raid: number
}

const PHASE: Record<number, PhaseTiming> = {
  1: { swing: 2.0, puddle: 9, spread: 18, slam: 16, puddleCount: 1, raid: 9 },
  2: { swing: 1.5, puddle: 8, spread: 15, slam: 12, puddleCount: 2, raid: 7 },
}

const SLAM_CAST = 2
const SLAM_DAMAGE = 420
const SWING_DAMAGE = 140
const PUDDLE_RADIUS = 70
const PUDDLE_DAMAGE = 1100
const RAID_DAMAGE = 150

export function updateBoss(s: SimState, rng: Rng): void {
  const b = boss(s)
  if (!b.alive) return

  const timing = PHASE[s.phase]!

  // --- phase transition ---
  if (s.phase === 1 && b.hp / b.maxHp <= PHASE_TWO_HP) {
    s.phase = 2
    s.chat.push({
      id: s.nextObjectId++,
      speaker: b.name,
      text: 'The tide rises!',
      age: 0,
    })
    // Pull every timer in so the phase change is immediately felt.
    s.nextPuddle = Math.min(s.nextPuddle, 3)
    s.nextSlam = Math.min(s.nextSlam, 5)
  }

  // --- enrage: a hard DPS check, not a soft one ---
  if (s.time >= ENRAGE_AT && !b.auras.some((a) => a.id === 'enrage')) {
    addAura(b, 'enrage', b.id)
    s.chat.push({ id: s.nextObjectId++, speaker: b.name, text: 'ENRAGE', age: 0 })
  }

  const target = topThreatTarget(s)

  // --- movement: walk to the current threat leader ---
  if (target && !b.castId) {
    const d = dist(b.pos, target.pos)
    if (d > MELEE_RANGE) {
      const dx = (target.pos.x - b.pos.x) / d
      const dy = (target.pos.y - b.pos.y) / d
      b.pos.x += dx * b.moveSpeed * DT
      b.pos.y += dy * b.moveSpeed * DT
      clampToArena(b.pos, b.radius)
    }
  }

  // --- autoattack ---
  b.swingTimer -= DT
  if (b.swingTimer <= 0 && target && !b.castId) {
    if (dist(b.pos, target.pos) <= MELEE_RANGE + target.radius) {
      applyDamage(s, target, SWING_DAMAGE, true)
      b.swingTimer = timing.swing
    } else {
      b.swingTimer = 0.2
    }
  }

  // --- slam: forces the tank to use a defensive ---
  s.nextSlam -= DT
  if (s.nextSlam <= 0 && !b.castId) {
    b.castId = 'boss_slam'
    b.castRemaining = SLAM_CAST
    b.castTotal = SLAM_CAST
    b.castTargetId = target ? target.id : null
    s.nextSlam = timing.slam
  }

  // --- puddles: shrink the usable floor over time ---
  s.nextPuddle -= DT
  if (s.nextPuddle <= 0) {
    const victims = livingParty(s)
    for (let i = 0; i < timing.puddleCount && victims.length > 0; i++) {
      const victim = rng.pick(victims)
      spawnPuddle(s, victim.pos.x, victim.pos.y, rng)
    }
    s.nextPuddle = timing.puddle
  }

  // --- unavoidable party damage ---
  //
  // Everything else in the fight can be dodged, and a competent party dodges
  // nearly all of it. Without a floor of damage the healer is never tested and
  // the encounter has no failure mode except the enrage timer.
  s.nextRaidHit -= DT
  if (s.nextRaidHit <= 0) {
    for (const a of livingParty(s)) applyDamage(s, a, RAID_DAMAGE, true)
    s.nextRaidHit = timing.raid
    // Unavoidable damage with no tell reads as a broken hitbox: the player
    // dodges, loses health anyway, and blames the puddle they just left.
    s.raidFlash = 0.45
  }

  // --- spread: someone has to walk away from the group ---
  s.nextSpread -= DT
  if (s.nextSpread <= 0) {
    const victims = livingParty(s)
    if (victims.length > 0) {
      const victim = rng.pick(victims)
      addAura(victim, 'spread', b.id)
      if (victim.ai) say(s, victim, 'Spread on me, moving out')
    }
    s.nextSpread = timing.spread
  }
}

function spawnPuddle(s: SimState, x: number, y: number, rng: Rng): void {
  // Scatter slightly so repeat puddles do not stack perfectly on one tile.
  const jx = x + rng.range(-20, 20)
  const jy = y + rng.range(-20, 20)
  const pos = { x: jx, y: jy }
  clampToArena(pos, PUDDLE_RADIUS * 0.5)

  const puddle: GroundEffect = {
    id: s.nextObjectId++,
    kind: 'puddle',
    pos,
    radius: PUDDLE_RADIUS,
    telegraph: PUDDLE_TELEGRAPH,
    lingering: 5.5,
    damage: PUDDLE_DAMAGE,
    detonated: false,
  }
  s.ground.push(puddle)
}

/** Resolves the boss cast that just finished. */
export function resolveBossCast(s: SimState, castId: string, targetId: number | null): void {
  if (castId !== 'boss_slam') return
  const b = boss(s)
  const target = s.actors.find((a) => a.id === targetId)
  if (target && target.alive && dist(b.pos, target.pos) <= MELEE_RANGE + target.radius + 20) {
    applyDamage(s, target, SLAM_DAMAGE, true)
  }
}

/** Ground damage is applied once per second while standing in a live puddle. */
export function updateGround(s: SimState): void {
  for (const g of s.ground) {
    if (!g.detonated) {
      g.telegraph -= DT
      if (g.telegraph <= 0) {
        g.detonated = true
        for (const a of livingParty(s)) {
          if (dist(a.pos, g.pos) <= g.radius - a.radius * 0.6) {
            applyDamage(s, a, g.damage, true)
          }
        }
      }
      continue
    }

    g.lingering -= DT
    // Residual damage: 130/sec, applied in per-tick slices.
    for (const a of livingParty(s)) {
      if (dist(a.pos, g.pos) <= g.radius) applyDamage(s, a, 130 * DT, true, true)
    }
  }
  s.ground = s.ground.filter((g) => !g.detonated || g.lingering > 0)
}
