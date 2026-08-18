import {
  ARENA_RADIUS,
  DT,
  ENRAGE_AT,
  MELEE_RANGE,
  PHASE_TWO_HP,
  PUDDLE_TELEGRAPH,
} from './constants'
import {
  addAura,
  adds,
  applyDamage,
  boss,
  dist,
  livingParty,
  say,
  topThreatTarget,
} from './combat'
import type { Rng } from './rng'
import { clampToArena } from './state'
import type { Actor, GroundEffect, SimState } from './types'

/**
 * The boss is deliberately NOT an AI.
 *
 * A raid boss that improvises cannot be learned, and learning the script is
 * the entire point of the genre. So this is a fixed timeline with hard phase
 * transitions; the only randomness is *who* gets targeted, which keeps pulls
 * from being identical without making them unlearnable.
 *
 * Each mechanic asks for a different thing, which is what stops the fight
 * being one dodge repeated: puddles ask you to leave where you stand, the
 * breath asks you to get behind, the shockwave asks you to come *in*, spread
 * asks you to separate, adds ask the dealers to switch targets, and the tide
 * asks nothing of you at all except that the healer kept up.
 */

interface PhaseTiming {
  swing: number
  puddle: number
  spread: number
  slam: number
  puddleCount: number
  /** Unavoidable party-wide damage; the healer's actual test. */
  raid: number
  /** 0 disables the mechanic for that phase. */
  breath: number
  shockwave: number
  adds: number
}

const PHASE: Record<number, PhaseTiming> = {
  1: { swing: 2.0, puddle: 9, spread: 18, slam: 16, puddleCount: 1, raid: 9, breath: 20, shockwave: 0, adds: 0 },
  2: { swing: 1.7, puddle: 8, spread: 15, slam: 13, puddleCount: 2, raid: 8, breath: 16, shockwave: 26, adds: 50 },
  3: { swing: 1.5, puddle: 7, spread: 14, slam: 11, puddleCount: 2, raid: 7, breath: 14, shockwave: 21, adds: 42 },
}

const PHASE_THREE_HP = 0.4

const SLAM_CAST = 2
const SLAM_DAMAGE = 520
const SWING_DAMAGE = 260
const RAID_DAMAGE = 150

const PUDDLE_RADIUS = 70
const PUDDLE_DAMAGE = 1150

export const BREATH_CAST = 1.9
const BREATH_RANGE = 275
const BREATH_HALF_WIDTH = 0.62
const BREATH_DAMAGE = 850

// The ring expands faster than anyone can run, so escaping outward is not an
// option and the answer has to be to already be inside it. That only works if
// there is time to get there first, hence the telegraph and the generous
// starting radius: the safe pocket is everything within START - BAND.
const SHOCKWAVE_TELEGRAPH = 1.8
const SHOCKWAVE_START = 150
const SHOCKWAVE_GROWTH = 190
const SHOCKWAVE_BAND = 45
const SHOCKWAVE_DAMAGE = 720

const ADD_HP = 1200
const ADD_DAMAGE = 70
const ADD_SWING = 1.8

export function updateBoss(s: SimState, rng: Rng): void {
  const b = boss(s)
  if (!b.alive) return

  advancePhase(s, b)
  const timing = PHASE[s.phase]!

  if (s.time >= ENRAGE_AT && !b.auras.some((a) => a.id === 'enrage')) {
    addAura(b, 'enrage', b.id)
    s.chat.push({ id: s.nextObjectId++, speaker: b.name, text: 'ENRAGE', age: 0 })
  }

  const target = topThreatTarget(s)
  faceTarget(s, b, target)

  if (target && !b.castId) {
    const d = dist(b.pos, target.pos)
    if (d > MELEE_RANGE) {
      b.pos.x += ((target.pos.x - b.pos.x) / d) * b.moveSpeed * DT
      b.pos.y += ((target.pos.y - b.pos.y) / d) * b.moveSpeed * DT
      clampToArena(b.pos, b.radius)
    }
  }

  autoAttack(s, b, target, timing)
  scheduleSlam(s, b, target, timing)
  schedulePuddles(s, rng, timing)
  scheduleRaidHit(s, timing)
  scheduleSpread(s, b, rng, timing)
  scheduleBreath(s, b, timing)
  scheduleShockwave(s, b, timing)
  scheduleAdds(s, b, rng, timing)

  updateAdds(s)
}

function advancePhase(s: SimState, b: Actor): void {
  const ratio = b.hp / b.maxHp

  if (s.phase === 1 && ratio <= PHASE_TWO_HP) {
    s.phase = 2
    s.chat.push({ id: s.nextObjectId++, speaker: b.name, text: 'The tide rises!', age: 0 })
    s.nextPuddle = Math.min(s.nextPuddle, 3)
    s.nextSlam = Math.min(s.nextSlam, 5)
    s.nextShockwave = 8
    s.nextAdds = 16
    return
  }

  if (s.phase === 2 && ratio <= PHASE_THREE_HP) {
    s.phase = 3
    s.chat.push({ id: s.nextObjectId++, speaker: b.name, text: 'DROWN WITH ME', age: 0 })
    s.nextBreath = Math.min(s.nextBreath, 4)
    s.nextShockwave = Math.min(s.nextShockwave, 7)
  }
}

/** Turns toward the threat leader, but locks while casting its cone. */
function faceTarget(s: SimState, b: Actor, target: Actor | null): void {
  if (!target || b.castId === 'boss_breath') return
  const want = Math.atan2(target.pos.y - b.pos.y, target.pos.x - b.pos.x)
  let delta = want - s.bossFacing
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  // Turning slowly is what makes getting behind it possible at all.
  s.bossFacing += Math.max(-2.6 * DT, Math.min(2.6 * DT, delta))
}

function autoAttack(s: SimState, b: Actor, target: Actor | null, timing: PhaseTiming): void {
  b.swingTimer -= DT
  if (b.swingTimer > 0 || !target || b.castId) return

  if (dist(b.pos, target.pos) <= MELEE_RANGE + target.radius) {
    applyDamage(s, target, SWING_DAMAGE, true)
    b.swingTimer = timing.swing
  } else {
    b.swingTimer = 0.2
  }
}

function scheduleSlam(s: SimState, b: Actor, target: Actor | null, timing: PhaseTiming): void {
  s.nextSlam -= DT
  if (s.nextSlam > 0 || b.castId) return

  b.castId = 'boss_slam'
  b.castRemaining = SLAM_CAST
  b.castTotal = SLAM_CAST
  b.castTargetId = target ? target.id : null
  s.nextSlam = timing.slam
}

function scheduleBreath(s: SimState, b: Actor, timing: PhaseTiming): void {
  if (timing.breath <= 0) return
  s.nextBreath -= DT
  if (s.nextBreath > 0 || b.castId) return

  b.castId = 'boss_breath'
  b.castRemaining = BREATH_CAST
  b.castTotal = BREATH_CAST
  b.castTargetId = null
  s.nextBreath = timing.breath

  // The cone is telegraphed on the floor for the whole cast.
  s.ground.push({
    ...blankGround(s),
    kind: 'breath',
    pos: { x: b.pos.x, y: b.pos.y },
    radius: BREATH_RANGE,
    telegraph: BREATH_CAST,
    lingering: 0,
    damage: BREATH_DAMAGE,
    angle: s.bossFacing,
    halfWidth: BREATH_HALF_WIDTH,
  })
}

function scheduleShockwave(s: SimState, b: Actor, timing: PhaseTiming): void {
  if (timing.shockwave <= 0) return
  s.nextShockwave -= DT
  if (s.nextShockwave > 0) return

  s.nextShockwave = timing.shockwave
  say(s, b, 'The deep exhales')
  s.ground.push({
    ...blankGround(s),
    kind: 'shockwave',
    pos: { x: b.pos.x, y: b.pos.y },
    radius: SHOCKWAVE_START,
    telegraph: SHOCKWAVE_TELEGRAPH,
    lingering: 99,
    damage: SHOCKWAVE_DAMAGE,
    detonated: false,
    growth: SHOCKWAVE_GROWTH,
    band: SHOCKWAVE_BAND,
  })
}

function schedulePuddles(s: SimState, rng: Rng, timing: PhaseTiming): void {
  s.nextPuddle -= DT
  if (s.nextPuddle > 0) return

  const victims = livingParty(s)
  for (let i = 0; i < timing.puddleCount && victims.length > 0; i++) {
    const victim = rng.pick(victims)
    const pos = { x: victim.pos.x + rng.range(-20, 20), y: victim.pos.y + rng.range(-20, 20) }
    clampToArena(pos, PUDDLE_RADIUS * 0.5)
    s.ground.push({
      ...blankGround(s),
      kind: 'puddle',
      pos,
      radius: PUDDLE_RADIUS,
      telegraph: PUDDLE_TELEGRAPH,
      lingering: 5.5,
      damage: PUDDLE_DAMAGE,
    })
  }
  s.nextPuddle = timing.puddle
}

function scheduleRaidHit(s: SimState, timing: PhaseTiming): void {
  s.nextRaidHit -= DT
  if (s.nextRaidHit > 0) return

  for (const a of livingParty(s)) applyDamage(s, a, RAID_DAMAGE, true)
  s.nextRaidHit = timing.raid
  // Unavoidable damage with no tell reads as a broken hitbox: the player
  // dodges, loses health anyway, and blames the puddle they just left.
  s.raidFlash = 0.45
}

function scheduleSpread(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  s.nextSpread -= DT
  if (s.nextSpread > 0) return

  const victims = livingParty(s)
  if (victims.length > 0) {
    const victim = rng.pick(victims)
    addAura(victim, 'spread', b.id)
    if (victim.ai) say(s, victim, 'Spread on me, moving out')
  }
  s.nextSpread = timing.spread
}

function scheduleAdds(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.adds <= 0) return
  s.nextAdds -= DT
  if (s.nextAdds > 0) return

  s.nextAdds = timing.adds
  say(s, b, 'Rise, drowned ones')

  for (let i = 0; i < 2; i++) {
    const angle = rng.range(0, Math.PI * 2)
    const pos = { x: Math.cos(angle) * 230, y: Math.sin(angle) * 230 }
    clampToArena(pos, 16)
    s.actors.push(makeAdd(s.nextObjectId++, pos.x, pos.y))
  }
}

function makeAdd(id: number, x: number, y: number): Actor {
  return {
    id,
    name: 'Thrall',
    classId: 'rogue',
    role: 'dps',
    melee: true,
    armour: 0,
    faction: 'boss',
    pos: { x, y },
    prevPos: { x, y },
    radius: 15,
    moveSpeed: 130,
    hp: ADD_HP,
    maxHp: ADD_HP,
    mana: 0,
    maxMana: 0,
    alive: true,
    gcd: 0,
    cooldowns: {},
    auras: [],
    castId: null,
    castRemaining: 0,
    castTotal: 0,
    castTargetId: null,
    isPlayer: false,
    ai: null,
    swingTimer: 1.5,
  }
}

/** Adds simply chase the nearest living party member. */
function updateAdds(s: SimState): void {
  for (const add of adds(s)) {
    let nearest: Actor | null = null
    let best = Infinity
    for (const p of livingParty(s)) {
      const d = dist(add.pos, p.pos)
      if (d < best) {
        best = d
        nearest = p
      }
    }
    if (!nearest) continue

    if (best > MELEE_RANGE) {
      add.pos.x += ((nearest.pos.x - add.pos.x) / best) * add.moveSpeed * DT
      add.pos.y += ((nearest.pos.y - add.pos.y) / best) * add.moveSpeed * DT
      clampToArena(add.pos, add.radius)
    }

    add.swingTimer -= DT
    if (add.swingTimer <= 0 && best <= MELEE_RANGE + nearest.radius) {
      applyDamage(s, nearest, ADD_DAMAGE, true)
      add.swingTimer = ADD_SWING
    }
  }

  // Corpses are dropped once they stop being useful to draw.
  s.actors = s.actors.filter((a) => a.faction !== 'boss' || a.alive || a.id === boss(s).id)
}

function blankGround(s: SimState): GroundEffect {
  return {
    id: s.nextObjectId++,
    kind: 'puddle',
    pos: { x: 0, y: 0 },
    radius: 0,
    telegraph: 0,
    lingering: 0,
    damage: 0,
    detonated: false,
    angle: 0,
    halfWidth: 0,
    growth: 0,
    band: 0,
    caught: [],
  }
}

/** Resolves the boss cast that just finished. */
export function resolveBossCast(s: SimState, castId: string, targetId: number | null): void {
  const b = boss(s)

  if (castId === 'boss_slam') {
    const target = s.actors.find((a) => a.id === targetId)
    if (target && target.alive && dist(b.pos, target.pos) <= MELEE_RANGE + target.radius + 20) {
      applyDamage(s, target, SLAM_DAMAGE, true)
    }
    return
  }

  if (castId === 'boss_breath') {
    const cone = s.ground.find((g) => g.kind === 'breath' && !g.detonated)
    if (!cone) return
    cone.detonated = true
    cone.lingering = 0.3
    for (const a of livingParty(s)) {
      if (insideCone(a.pos, cone)) applyDamage(s, a, cone.damage, true)
    }
  }
}

export function insideCone(p: { x: number; y: number }, cone: GroundEffect): boolean {
  const dx = p.x - cone.pos.x
  const dy = p.y - cone.pos.y
  const d = Math.hypot(dx, dy)
  if (d > cone.radius) return false

  let delta = Math.atan2(dy, dx) - cone.angle
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  return Math.abs(delta) <= cone.halfWidth
}

/** Ground damage is applied once per second while standing in a live puddle. */
export function updateGround(s: SimState): void {
  for (const g of s.ground) {
    if (g.kind === 'shockwave') {
      if (!g.detonated) {
        g.telegraph -= DT
        if (g.telegraph <= 0) g.detonated = true
        continue
      }
      g.radius += g.growth * DT
      for (const a of livingParty(s)) {
        if (g.caught.includes(a.id)) continue
        const d = dist(a.pos, g.pos)
        // The ring outruns everyone, so the answer is to be inside it, not
        // ahead of it: run toward the boss, not away.
        if (d >= g.radius - g.band && d <= g.radius + g.band) {
          g.caught.push(a.id)
          applyDamage(s, a, g.damage, true)
        }
      }
      if (g.radius > ARENA_RADIUS + g.band) g.lingering = 0
      continue
    }

    if (g.kind === 'breath') {
      // Purely a telegraph; the damage lands when the cast resolves.
      if (!g.detonated) g.telegraph -= DT
      else g.lingering -= DT
      continue
    }

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
    for (const a of livingParty(s)) {
      if (dist(a.pos, g.pos) <= g.radius - a.radius * 0.6) {
        applyDamage(s, a, 110 * DT, true, true)
      }
    }
  }

  s.ground = s.ground.filter((g) => {
    if (g.kind === 'breath') return !g.detonated || g.lingering > 0
    if (g.kind === 'shockwave') return g.lingering > 0
    return !g.detonated || g.lingering > 0
  })
}
