import { ABILITIES, PLAYER_BAR } from './abilities'
import { updatePartyAi } from './ai'
import { resolveBossCast, updateBoss, updateGround } from './boss'
import {
  addThreat,
  applyDamage,
  applyHeal,
  boss,
  detonateSpread,
  interruptCast,
  livingParty,
  resolveAbility,
  beginCast,
} from './combat'
import { DT, MANA_REGEN_PER_SEC } from './constants'
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

  updateBoss(s, rng)
  updateGround(s)

  for (const a of s.actors) advanceCast(s, a, rng)

  ageEphemera(s)
  resolveOutcome(s)
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
      if (aura.id === 'ignite') {
        applyDamage(s, a, 55 * aura.stacks, false, true)
        if (a.id === BOSS_ID) addThreat(s, aura.sourceId, 55 * aura.stacks)
      } else if (aura.id === 'renew') {
        applyHeal(s, a, 60, aura.sourceId)
      }
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

  for (const slot of input.pressed) {
    const abilityId = PLAYER_BAR[slot]
    if (!abilityId) continue
    beginCast(s, player, abilityId, BOSS_ID, rng)
  }
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
    return
  }
  if (livingParty(s).length === 0) {
    s.outcome = b.auras.some((a) => a.id === 'enrage') ? 'enrage' : 'wipe'
  }
}
