import { ABILITIES, type Ability } from './abilities'
import { GLOBAL_COOLDOWN, SPREAD_RADIUS } from './constants'
import type { Rng } from './rng'
import { BOSS_ID } from './state'
import type { Actor, Aura, AuraId, SimState } from './types'

export function actorById(s: SimState, id: number): Actor | undefined {
  return s.actors.find((a) => a.id === id)
}

export function boss(s: SimState): Actor {
  return s.actors[s.actors.length - 1]!
}

export function party(s: SimState): Actor[] {
  return s.actors.filter((a) => a.faction === 'party')
}

export function livingParty(s: SimState): Actor[] {
  return s.actors.filter((a) => a.faction === 'party' && a.alive)
}

export function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function getAura(actor: Actor, id: AuraId): Aura | undefined {
  return actor.auras.find((au) => au.id === id)
}

const AURA_DURATION: Record<AuraId, number> = {
  ignite: 12,
  renew: 12,
  shield: 6,
  spread: 4,
  enrage: 9999,
}

export function addAura(actor: Actor, id: AuraId, sourceId: number): void {
  const existing = getAura(actor, id)
  const duration = AURA_DURATION[id]
  if (existing) {
    // Refresh, never stack: with three dealers, stacking Ignite would let the
    // party triple its own damage-over-time for free.
    existing.remaining = duration
    return
  }
  actor.auras.push({
    id,
    remaining: duration,
    duration,
    stacks: 1,
    sourceId,
    tickTimer: 0,
  })
}

export function pushText(
  s: SimState,
  pos: { x: number; y: number },
  text: string,
  kind: 'damage' | 'heal' | 'miss' | 'crit',
): void {
  s.texts.push({ id: s.nextObjectId++, text, pos: { x: pos.x, y: pos.y }, age: 0, kind })
}

export function say(s: SimState, actor: Actor, text: string): void {
  if (actor.ai && actor.ai.chatCooldown > 0) return
  if (actor.ai) actor.ai.chatCooldown = 4
  s.chat.push({ id: s.nextObjectId++, speaker: actor.name, text, age: 0 })
  if (s.chat.length > 5) s.chat.shift()
}

export function addThreat(s: SimState, actorId: number, amount: number): void {
  s.threat[actorId] = (s.threat[actorId] ?? 0) + amount
}

/** Highest-threat living party member. Ties break by id so it stays deterministic. */
export function topThreatTarget(s: SimState): Actor | null {
  let best: Actor | null = null
  let bestValue = -1
  for (const a of livingParty(s)) {
    const value = s.threat[a.id] ?? 0
    if (value > bestValue) {
      bestValue = value
      best = a
    }
  }
  return best
}

export function applyDamage(
  s: SimState,
  target: Actor,
  amount: number,
  fromBoss: boolean,
  silent = false,
): void {
  if (!target.alive) return

  let final = amount
  if (fromBoss) {
    const shield = getAura(target, 'shield')
    if (shield) final *= 0.4
    const enraged = getAura(boss(s), 'enrage')
    if (enraged) final *= 2
  }

  final = Math.round(final)
  target.hp = Math.max(0, target.hp - final)
  // Ground ticks are silent; 30 floating numbers a second is unreadable.
  if (!silent) pushText(s, target.pos, `-${final}`, 'damage')

  if (target.hp <= 0) {
    target.alive = false
    target.castId = null
    target.auras.length = 0
    pushText(s, target.pos, 'DOWN', 'crit')
  }
}

export function applyHeal(s: SimState, target: Actor, amount: number, sourceId: number): void {
  if (!target.alive) return
  const before = target.hp
  target.hp = Math.min(target.maxHp, target.hp + amount)
  const healed = Math.round(target.hp - before)
  if (healed > 0) {
    pushText(s, target.pos, `+${healed}`, 'heal')
    // Healing generates threat too, which is why a healer can pull the boss.
    addThreat(s, sourceId, healed * 0.5)
  }
}

/** Everything a spread debuff hits when it expires on someone. */
export function detonateSpread(s: SimState, carrier: Actor): void {
  for (const a of livingParty(s)) {
    if (dist(a.pos, carrier.pos) <= SPREAD_RADIUS) {
      applyDamage(s, a, 850, true)
    }
  }
}

export function canCast(s: SimState, actor: Actor, ability: Ability, targetId: number): boolean {
  if (!actor.alive) return false
  if (actor.castId) return false
  if (actor.gcd > 0) return false
  if ((actor.cooldowns[ability.id] ?? 0) > 0) return false
  if (actor.mana < ability.manaCost) return false

  if (ability.range > 0) {
    const target = actorById(s, targetId)
    if (!target || !target.alive) return false
    if (dist(actor.pos, target.pos) > ability.range + target.radius) return false
  }
  return true
}

/** Starts a cast, or resolves it immediately for instant abilities. */
export function beginCast(s: SimState, actor: Actor, abilityId: string, targetId: number, rng: Rng): boolean {
  const ability = ABILITIES[abilityId]
  if (!ability || !canCast(s, actor, ability, targetId)) return false

  actor.gcd = GLOBAL_COOLDOWN
  actor.cooldowns[ability.id] = ability.cooldown

  if (ability.castTime <= 0) {
    resolveAbility(s, actor, ability, targetId, rng)
    return true
  }

  actor.castId = ability.id
  actor.castRemaining = ability.castTime
  actor.castTotal = ability.castTime
  actor.castTargetId = targetId
  return true
}

export function interruptCast(s: SimState, actor: Actor, reason: string): void {
  if (!actor.castId) return
  actor.castId = null
  actor.castRemaining = 0
  actor.castTargetId = null
  pushText(s, actor.pos, reason, 'miss')
}

export function resolveAbility(
  s: SimState,
  actor: Actor,
  ability: Ability,
  targetId: number,
  _rng: Rng,
): void {
  const target = actorById(s, targetId)
  if (ability.manaCost > 0) actor.mana = Math.max(0, actor.mana - ability.manaCost)

  switch (ability.kind) {
    case 'damage': {
      if (!target || !target.alive) return
      applyDamage(s, target, ability.amount, false)
      if (target.id === BOSS_ID) addThreat(s, actor.id, ability.amount * ability.threatMult)
      if (ability.aura) addAura(target, ability.aura, actor.id)
      break
    }
    case 'heal': {
      if (!target || !target.alive) return
      if (ability.amount > 0) applyHeal(s, target, ability.amount, actor.id)
      if (ability.aura) addAura(target, ability.aura, actor.id)
      break
    }
    case 'defensive': {
      if (ability.aura) addAura(actor, ability.aura, actor.id)
      break
    }
  }
}
