import { ABILITIES } from './abilities'
import { abilityBar, specOf } from './classes'
import { updatePartyAi } from './ai'
import { resolveBossCast, updateBoss, updateGround } from './boss'
import {
  AURA_TICK,
  addThreat,
  applyDamage,
  applyHeal,
  boss,
  detonateSpread,
  interruptCast,
  dist,
  livingParty,
  pushText,
  spawnBolt,
  resolveAbility,
  beginCast,
  castBlocker,
} from './combat'
import { DT, MANA_REGEN_PER_SEC, MELEE_RANGE } from './constants'
import type { Rng } from './rng'
import { BOSS_ID, clampToArena } from './state'
import type { Actor, PlayerInput, SimState } from './types'

/**
 * Advances the fight by exactly one fixed tick.
 *
 * Order matters and must stay stable: timers, player, party AI, boss, ground,
 * then resolution. Changing the order changes replays.
 */
export function step(s: SimState, input: PlayerInput, rng: Rng): void {
  // Drained before the guard, not after: leaving the last tick's events in
  // place meant the renderer kept replaying them over the results screen.
  s.sounds.length = 0
  if (s.outcome !== 'ongoing') return

  s.tick++
  s.time += DT

  for (const a of s.actors) {
    a.prevPos.x = a.pos.x
    a.prevPos.y = a.pos.y
  }

  for (const a of s.actors) updateTimers(s, a)

  updatePlayer(s, input, rng)

  for (const a of s.actors) {
    if (a.faction === 'party' && a.ai) updatePartyAi(s, a, rng)
  }

  updateAutoAttacks(s)

  updateBoss(s, rng)
  updateGround(s)
  updateProjectiles(s)

  for (const a of s.actors) advanceCast(s, a, rng)

  ageEphemera(s)
  resolveOutcome(s)
}

/**
 * Weapons, swinging on their own.
 *
 * The boss and its thralls have always had this; the party fought with
 * nothing but its spell list, so a rogue standing in melee doing nothing was
 * a rogue doing literally nothing. Melee specs swing, the hunter shoots, and
 * everyone else has no weapon to speak of.
 *
 * It costs no global cooldown and asks for no press: the whole point of white
 * damage is that it is what happens while you are busy deciding.
 */
function updateAutoAttacks(s: SimState): void {
  for (const a of s.actors) {
    if (a.faction !== 'party' || !a.alive) continue
    const auto = specOf({ classId: a.classId, role: a.role }).auto
    if (!auto) continue

    if (a.swingTimer > 0) {
      a.swingTimer -= DT
      continue
    }

    // Whatever the weapon can actually reach, nearest first. Adds walk into
    // the melee on their own, so "closest" and "what the rotation is aimed
    // at" are the same thing nearly all the time, and picking by distance
    // means a tank never stands beside the boss swinging at nothing because
    // its target was a thrall across the floor.
    const target = nearestHostile(s, a, auto.range)
    if (!target) continue

    a.swingTimer = auto.speed
    // Physical, so it answers armour and block the way a weapon should. The
    // boss carries neither, which is a decision it can change without this
    // needing to know.
    applyDamage(s, target, auto.damage, 'physical', { sourceId: a.id })
    if (target.id === BOSS_ID) addThreat(s, a.id, auto.damage)
    // A shot with nothing in the air between the two of them reads as the
    // hunter standing still doing nothing, same as the ranged abilities.
    if (auto.range > MELEE_RANGE) spawnBolt(s, a, target.id, 'bolt')
  }
}

function nearestHostile(s: SimState, from: Actor, range: number): Actor | null {
  let best: Actor | null = null
  let bestGap = Infinity
  for (const other of s.actors) {
    if (other.faction !== 'boss' || !other.alive) continue
    const gap = dist(from.pos, other.pos) - other.radius
    if (gap <= range && gap < bestGap) {
      bestGap = gap
      best = other
    }
  }
  return best
}

function updateTimers(s: SimState, a: Actor): void {
  if (!a.alive) return

  a.gcd = Math.max(0, a.gcd - DT)
  for (const key of Object.keys(a.cooldowns)) {
    const value = a.cooldowns[key]!
    if (value > 0) a.cooldowns[key] = Math.max(0, value - DT)
  }

  if (a.maxMana > 0) {
    a.mana = Math.min(a.maxMana, a.mana + MANA_REGEN_PER_SEC * DT)
  }

  // Iterate backwards so expiry removal does not skip entries. A tick can
  // kill the actor mid-loop (DoT, or a spread detonating on its carrier),
  // which clears the array underneath us — hence the guards.
  for (let i = a.auras.length - 1; i >= 0; i--) {
    if (!a.alive) break
    const aura = a.auras[i]
    if (!aura) continue
    if (aura.id === 'enrage') continue

    aura.remaining -= DT
    aura.tickTimer += DT

    while (aura.tickTimer >= 1) {
      aura.tickTimer -= 1
      const tick = AURA_TICK[aura.id]
      if (!tick) continue
      if (tick.damage !== undefined) {
        applyDamage(s, a, tick.damage, 'none', { sourceId: aura.sourceId, silent: true })
        if (a.faction === 'boss') addThreat(s, aura.sourceId, tick.damage)
      }
      if (tick.heal !== undefined) applyHeal(s, a, tick.heal, aura.sourceId)
    }

    if (aura.remaining <= 0) {
      a.auras.splice(i, 1)
      if (aura.id === 'spread') detonateSpread(s, a)
    }
  }
}

function updatePlayer(s: SimState, input: PlayerInput, rng: Rng): void {
  const player = s.actors.find((a) => a.isPlayer)
  if (!player || !player.alive) return

  const len = Math.hypot(input.moveX, input.moveY)
  if (len > 0.01) {
    const stepLen = player.moveSpeed * DT
    player.pos.x += (input.moveX / len) * stepLen
    player.pos.y += (input.moveY / len) * stepLen
    clampToArena(player.pos, player.radius)
    // Moving breaks your own cast — the core tension with Burst.
    if (player.castId) interruptCast(s, player, 'moved')
  }

  const bar = abilityBar({ classId: player.classId, role: player.role })
  for (const slot of input.pressed) {
    const abilityId = bar[slot]
    const ability = ABILITIES[abilityId ?? '']
    if (!abilityId || !ability) continue
    // Target the nearest add if one is up, otherwise the boss. A taunt is the
    // exception: adds keep no threat table, so aiming one at an add would be
    // a wasted cooldown on the button whose whole job is the boss.
    const target = ability.kind === 'taunt' ? BOSS_ID : playerTarget(s)

    // A press that goes nowhere used to be silent, which reads as the button
    // being broken. Cooldowns and empty mana are already on the button; being
    // too far away is the one reason nothing on screen was saying.
    if (castBlocker(s, player, ability, target) === 'range') {
      reportOutOfRange(s, player)
      continue
    }
    beginCast(s, player, abilityId, target, rng)
  }
}

const OUT_OF_RANGE = 'Out of range'

/**
 * One notice at a time.
 *
 * Three fingers on three buttons is three presses in a tick, and stacking
 * three copies of the same words on top of each other is how you make a
 * message unreadable.
 */
function reportOutOfRange(s: SimState, player: Actor): void {
  if (s.texts.some((t) => t.text === OUT_OF_RANGE && t.age < 0.5)) return
  pushText(s, player.pos, OUT_OF_RANGE, 'miss')
  s.sounds.push('blocked')
}

/**
 * Adds are the priority target while they are alive.
 *
 * Exported because the action bar has to answer the same question to know
 * whether a slot is in range of anything, and two answers to "what are you
 * aiming at" is one too many.
 */
export function playerTarget(s: SimState): number {
  let best: number = BOSS_ID
  let bestHp = Infinity
  for (const a of s.actors) {
    if (a.faction !== 'boss' || !a.alive || a.id === BOSS_ID) continue
    if (a.hp < bestHp) {
      bestHp = a.hp
      best = a.id
    }
  }
  return best
}

function advanceCast(s: SimState, a: Actor, rng: Rng): void {
  if (!a.alive || !a.castId) return

  a.castRemaining -= DT
  if (a.castRemaining > 0) return

  const castId = a.castId
  const targetId = a.castTargetId
  a.castId = null
  a.castRemaining = 0
  a.castTotal = 0
  a.castTargetId = null

  if (a.faction === 'boss') {
    resolveBossCast(s, castId, targetId)
    return
  }

  const ability = ABILITIES[castId]
  if (ability && targetId !== null) resolveAbility(s, a, ability, targetId, rng)
}

/** Homes on the target so a bolt still lands if its victim walks away. */
function updateProjectiles(s: SimState): void {
  for (const p of s.projectiles) {
    p.prevPos.x = p.pos.x
    p.prevPos.y = p.pos.y

    const target = s.actors.find((a) => a.id === p.targetId)
    if (!target) {
      p.arrived = true
      continue
    }

    const dx = target.pos.x - p.pos.x
    const dy = target.pos.y - p.pos.y
    const d = Math.hypot(dx, dy)
    const stepLen = p.speed * DT

    if (d <= stepLen + target.radius) {
      p.pos.x = target.pos.x
      p.pos.y = target.pos.y
      p.arrived = true
      continue
    }

    p.pos.x += (dx / d) * stepLen
    p.pos.y += (dy / d) * stepLen
  }

  s.projectiles = s.projectiles.filter((p) => !p.arrived)
}

function ageEphemera(s: SimState): void {
  s.raidFlash = Math.max(0, s.raidFlash - DT)
  for (const t of s.texts) t.age += DT
  s.texts = s.texts.filter((t) => t.age < 1.1)

  for (const c of s.chat) c.age += DT
  s.chat = s.chat.filter((c) => c.age < 6)
}

function resolveOutcome(s: SimState): void {
  const b = boss(s)
  if (!b.alive || b.hp <= 0) {
    s.outcome = 'victory'
    s.sounds.push('victory')
    return
  }
  if (livingParty(s).length === 0) {
    s.outcome = b.auras.some((a) => a.id === 'enrage') ? 'enrage' : 'wipe'
    s.sounds.push('wipe')
  }
}
