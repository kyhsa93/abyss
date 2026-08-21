import { ARENA_RADIUS, DT, MELEE_RANGE, PUDDLE_TELEGRAPH } from './constants'
import {
  addAura,
  adds,
  getAura,
  pushEffect,
  applyDamage,
  boss,
  dist,
  livingParty,
  say,
  topThreatTarget,
} from './combat'
import type { Rng } from './rng'
import { BOSS_ID, clampToArena } from './state'
import { DIFFICULTIES } from './classes'
import { encounterAt, type Encounter, type PhaseTiming } from './encounters'
import { affixAddWave, affixEnrage, affixLinger, affixTiming } from './affix'
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
 *
 * Which of them a given boss leans on, and how hard, is the table in
 * `encounters.ts`. This file stays the one copy of what each mechanic does:
 * a second boss written as a second script would be a second shockwave rule
 * to keep correct, and that one took three attempts.
 */
function fight(s: SimState): Encounter {
  return encounterAt(s.encounter)
}

/** Applies the difficulty's cadence to a phase's timers. */
function scaled(timing: PhaseTiming, s: SimState): PhaseTiming {
  const cadence = DIFFICULTIES[s.difficulty].cadence
  if (cadence === 1) return timing
  return {
    ...timing,
    puddle: timing.puddle * cadence,
    spread: timing.spread * cadence,
    slam: timing.slam * cadence,
    raid: timing.raid * cadence,
    breath: timing.breath * cadence,
    shockwave: timing.shockwave * cadence,
    adds: timing.adds * cadence,
  }
}

/** Every point of boss damage passes through here. */
function hit(s: SimState, amount: number): number {
  return amount * DIFFICULTIES[s.difficulty].damage
}

/** The same, for anything the floor does. */
function mechanic(s: SimState, amount: number): number {
  return hit(s, amount * fight(s).mechanicDamage)
}

const SLAM_CAST = 2

const PUDDLE_RADIUS = 92
const PUDDLE_DAMAGE = 1000

export const BREATH_CAST = 1.9
const BREATH_RANGE = 390
const BREATH_HALF_WIDTH = 0.62
const BREATH_DAMAGE = 700

// The ring expands faster than anyone can run, so escaping outward is not an
// option and the answer has to be to already be inside it. That only works if
// there is time to get there first, hence the telegraph and the generous
// starting radius: the safe pocket is everything within START - BAND.
const SHOCKWAVE_TELEGRAPH = 1.8
const SHOCKWAVE_START = 200
const SHOCKWAVE_GROWTH = 250
const SHOCKWAVE_BAND = 58
const SHOCKWAVE_DAMAGE = 600

/**
 * How far a sweep reaches past the boss's own edge.
 *
 * Wide enough to catch the ranged as well, which is the whole point of it:
 * a melee-only physical hit is a tax on the people whose armour was supposed
 * to be the reward. Everybody takes it and armour decides what it costs, so
 * plate is finally worth the walk rather than a line in a table.
 */
const SWEEP_RANGE = 300
/** As a share of the boss's weapon swing, which armour already answers. */
const SWEEP_SHARE = 0.34

const ADD_HP = 1200
const ADD_DAMAGE = 70
const ADD_SWING = 1.8

export function updateBoss(s: SimState, rng: Rng): void {
  const b = boss(s)
  if (!b.alive) return

  const encounter = fight(s)
  advancePhase(s, b)
  // The day's twist lands on the timers before anything reads them, so every
  // mechanic downstream sees one set of numbers rather than each remembering
  // to ask.
  const timing = affixTiming(scaled(encounter.phases[s.phase]!, s), s.affix)

  const enrageAt = encounter.enrage - affixEnrage(s.affix)
  if (s.time >= enrageAt && !b.auras.some((a) => a.id === 'enrage')) {
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
  scheduleSweep(s, b, timing)
  scheduleRot(s, rng, timing)

  updateAdds(s)
}

function advancePhase(s: SimState, b: Actor): void {
  const encounter = fight(s)
  const ratio = b.hp / b.maxHp

  if (s.phase === 1 && ratio <= encounter.phaseTwoHp) {
    s.phase = 2
    s.sounds.push('phase')
    s.chat.push({ id: s.nextObjectId++, speaker: b.name, text: encounter.lines.phaseTwo, age: 0 })
    // Pulled in rather than reset: a phase break whose new cadence waits out
    // the old timers is a phase break nobody notices.
    s.nextPuddle = Math.min(s.nextPuddle, 3)
    s.nextSlam = Math.min(s.nextSlam, 5)
    // Only for what this boss actually does. Handing a shockwave timer to a
    // boss with no shockwave is harmless today, since the scheduler checks the
    // cadence, and is exactly the kind of thing that stops being harmless.
    if (encounter.phases[2]!.shockwave > 0) s.nextShockwave = 8
    if (encounter.phases[2]!.adds > 0) s.nextAdds = 16
    return
  }

  if (s.phase === 2 && ratio <= encounter.phaseThreeHp) {
    s.phase = 3
    s.sounds.push('phase')
    s.chat.push({ id: s.nextObjectId++, speaker: b.name, text: encounter.lines.phaseThree, age: 0 })
    if (encounter.phases[3]!.breath > 0) s.nextBreath = Math.min(s.nextBreath, 4)
    if (encounter.phases[3]!.shockwave > 0) s.nextShockwave = Math.min(s.nextShockwave, 7)
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
    applyDamage(s, target, hit(s, fight(s).swingDamage), 'physical', { sourceId: b.id })
    b.swingTimer = timing.swing
  } else {
    b.swingTimer = 0.2
  }
}

function scheduleSlam(s: SimState, b: Actor, target: Actor | null, timing: PhaseTiming): void {
  if (timing.slam <= 0) return
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

  s.sounds.push('telegraph')
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
  s.sounds.push('shockwave')
  say(s, b, fight(s).lines.shockwave)
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
  if (timing.puddle <= 0) return
  s.nextPuddle -= DT
  if (s.nextPuddle > 0) return

  const victims = livingParty(s)
  // Mechanics scale with the raid. A fixed number of puddles across a
  // twenty-five man means any given player is almost never targeted, so the
  // bigger raid would be the easier one.
  const spread = Math.max(1, Math.ceil(s.party.length / 8))
  const count = (timing.puddleCount + DIFFICULTIES[s.difficulty].extraPuddle) * spread
  for (let i = 0; i < count && victims.length > 0; i++) {
    const victim = rng.pick(victims)
    const pos = { x: victim.pos.x + rng.range(-20, 20), y: victim.pos.y + rng.range(-20, 20) }
    clampToArena(pos, PUDDLE_RADIUS * 0.5)
    s.sounds.push('telegraph')
    s.ground.push({
      ...blankGround(s),
      kind: 'puddle',
      pos,
      radius: PUDDLE_RADIUS,
      telegraph: PUDDLE_TELEGRAPH,
      lingering: 5.5 * affixLinger(s.affix),
      damage: PUDDLE_DAMAGE,
    })
  }
  s.nextPuddle = timing.puddle
}

function scheduleRaidHit(s: SimState, timing: PhaseTiming): void {
  if (timing.raid <= 0) return
  s.nextRaidHit -= DT
  if (s.nextRaidHit > 0) return

  // Unavoidable, so it is not counted as a mechanic anyone failed.
  s.sounds.push('raid')
  const damage = hit(s, fight(s).raidDamage)
  for (const a of livingParty(s)) applyDamage(s, a, damage, 'magic', { sourceId: BOSS_ID })
  s.nextRaidHit = timing.raid
  // Unavoidable damage with no tell reads as a broken hitbox: the player
  // dodges, loses health anyway, and blames the puddle they just left.
  s.raidFlash = 0.45
}

function scheduleSpread(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.spread <= 0) return
  s.nextSpread -= DT
  if (s.nextSpread > 0) return

  const victims = livingParty(s)
  const marks = Math.max(1, Math.round(s.party.length / 6))
  for (let i = 0; i < marks && victims.length > 0; i++) {
    const victim = rng.pick(victims)
    if (getAura(victim, 'spread')) continue
    addAura(victim, 'spread', b.id)
    if (victim.ai && i === 0) say(s, victim, 'Spread on me, moving out')
  }
  s.nextSpread = timing.spread
}

function scheduleAdds(s: SimState, b: Actor, rng: Rng, timing: PhaseTiming): void {
  if (timing.adds <= 0) return
  s.nextAdds -= DT
  if (s.nextAdds > 0) return

  s.nextAdds = timing.adds
  say(s, b, fight(s).lines.adds)

  const waves =
    (livingParty(s).length >= 20 ? 5 : livingParty(s).length >= 8 ? 3 : 2) *
    affixAddWave(s.affix)
  for (let i = 0; i < waves; i++) {
    const angle = rng.range(0, Math.PI * 2)
    const pos = { x: Math.cos(angle) * 230, y: Math.sin(angle) * 230 }
    clampToArena(pos, 16)
    s.actors.push(makeAdd(s.nextObjectId++, pos.x, pos.y))
  }
}

/**
 * Physical damage to everyone standing in reach.
 *
 * The only thing a boss throws that armour answers. Everything else it does is
 * magic and ignores armour entirely, which meant a melee dealer's plate was a
 * line in a table: it took the same mechanic damage as a mage in cloth, died
 * at the same rate, and paid for the privilege by standing where the boss was
 * aiming. This is what makes the armour worth the walk.
 *
 * It is telegraphed by the swing itself rather than by a circle on the floor:
 * being in reach is the tell, and getting out is the answer.
 */
function scheduleSweep(s: SimState, b: Actor, timing: PhaseTiming): void {
  if (timing.sweep <= 0) return
  s.nextSweep -= DT
  if (s.nextSweep > 0) return

  s.nextSweep = timing.sweep
  s.sounds.push('raid')
  say(s, b, 'Sweeping')

  const reach = SWEEP_RANGE + b.radius
  for (const a of livingParty(s)) {
    if (dist(a.pos, b.pos) > reach) continue
    // Physical, so armour and block both answer it. A tank barely notices; a
    // caster that wandered into melee should not survive making a habit of it.
    applyDamage(s, a, hit(s, fight(s).swingDamage * SWEEP_SHARE), 'physical', {
      sourceId: b.id,
      mechanic: true,
    })
  }
  pushEffect(s, 'swing', b.pos, { power: SWEEP_RANGE, angle: 0 })
}

/**
 * A dot on somebody, which armour does not answer.
 *
 * The counterweight to the sweep: one mechanic that plate solves and one it
 * cannot touch, so no single stat block is the right answer to the fight.
 */
function scheduleRot(s: SimState, rng: Rng, timing: PhaseTiming): void {
  if (timing.rot <= 0) return
  s.nextRot -= DT
  if (s.nextRot > 0) return

  s.nextRot = timing.rot
  const victims = livingParty(s).filter((a) => !getAura(a, 'rot'))
  if (victims.length === 0) return

  const victim = rng.pick(victims)
  addAura(victim, 'rot', BOSS_ID)
  s.sounds.push('telegraph')
  if (victim.ai) say(s, victim, 'Rotting — need a heal')
}

function makeAdd(id: number, x: number, y: number): Actor {
  return {
    id,
    name: 'Thrall',
    classId: 'rogue',
    spec: 'assassination',
    role: 'dps',
    melee: true,
    armor: 0,
    block: 0,
    faction: 'boss',
    pos: { x, y },
    prevPos: { x, y },
    radius: 20,
    moveSpeed: 130,
    hp: ADD_HP,
    maxHp: ADD_HP,
    resource: 'mana',
    power: 0,
    maxPower: 0,
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
      applyDamage(s, nearest, hit(s, ADD_DAMAGE), 'physical', { sourceId: add.id })
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
      applyDamage(s, target, hit(s, fight(s).slamDamage), 'physical', { sourceId: b.id })
    }
    return
  }

  if (castId === 'boss_breath') {
    const cone = s.ground.find((g) => g.kind === 'breath' && !g.detonated)
    if (!cone) return
    cone.detonated = true
    cone.lingering = 0.3
    for (const a of livingParty(s)) {
      if (insideCone(a.pos, cone)) applyDamage(s, a, mechanic(s, cone.damage), 'magic', { sourceId: b.id, mechanic: true })
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
          applyDamage(s, a, mechanic(s, g.damage), 'magic', { sourceId: BOSS_ID, mechanic: true })
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
            applyDamage(s, a, mechanic(s, g.damage), 'magic', { sourceId: BOSS_ID, mechanic: true })
          }
        }
      }
      continue
    }

    g.lingering -= DT
    for (const a of livingParty(s)) {
      if (dist(a.pos, g.pos) <= g.radius - a.radius * 0.6) {
        // Per-tick residue: silent, and not a separate "mechanic hit" each frame.
        applyDamage(s, a, mechanic(s, 110 * DT), 'magic', { sourceId: BOSS_ID, silent: true })
      }
    }
  }

  s.ground = s.ground.filter((g) => {
    if (g.kind === 'breath') return !g.detonated || g.lingering > 0
    if (g.kind === 'shockwave') return g.lingering > 0
    return !g.detonated || g.lingering > 0
  })
}
