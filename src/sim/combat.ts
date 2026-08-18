import { ABILITIES, type Ability } from './abilities'
import { DIFFICULTIES, mitigation } from './classes'
import { GLOBAL_COOLDOWN, SPREAD_RADIUS } from './constants'
import type { Rng } from './rng'
import { BOSS_ID } from './state'
import type { Actor, Aura, AuraId, ProjectileKind, SimState } from './types'

export function actorById(s: SimState, id: number): Actor | undefined {
  return s.actors.find((a) => a.id === id)
}

/** The boss proper. Summoned adds share its faction but not its id. */
export function boss(s: SimState): Actor {
  return s.actors.find((a) => a.id === BOSS_ID)!
}

/** Living summoned adds, nearest first is left to the caller. */
export function adds(s: SimState): Actor[] {
  return s.actors.filter((a) => a.faction === 'boss' && a.id !== BOSS_ID && a.alive)
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
  living_bomb: 12,
  serpent_sting: 15,
  rupture: 12,
  flame_shock: 12,
  moonfire: 14,
  rend: 12,
  judgement: 12,
  shadow_word_pain: 15,
  renew: 12,
  rejuvenation: 12,
  riptide: 12,
  shield: 6,
  spread: 4,
  enrage: 9999,
}

/** Per-second effect of each periodic aura. */
export const AURA_TICK: Partial<Record<AuraId, { damage?: number; heal?: number }>> = {
  living_bomb: { damage: 70 },
  serpent_sting: { damage: 60 },
  rupture: { damage: 85 },
  flame_shock: { damage: 65 },
  moonfire: { damage: 62 },
  rend: { damage: 78 },
  judgement: { damage: 68 },
  shadow_word_pain: { damage: 58 },
  renew: { heal: 60 },
  rejuvenation: { heal: 58 },
  riptide: { heal: 62 },
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

/**
 * Damage school.
 *
 * Armour and shields only answer the boss's weapon. Mechanics are magic and
 * ignore both, so a cloth caster and a plate tank take a puddle equally — the
 * tank's job is to stand in front of the swings, not to be immune to the
 * fight. 'none' is party damage going the other way.
 */
export type School = 'physical' | 'magic' | 'none'

export interface DamageOptions {
  /** Who to credit. Party damage without this is invisible in the report. */
  sourceId?: number
  silent?: boolean
  /**
   * An avoidable mechanic. Counted per hit rather than per point, because
   * "ate three puddles" is the thing worth knowing, not the total.
   */
  mechanic?: boolean
}

export function applyDamage(
  s: SimState,
  target: Actor,
  amount: number,
  school: School,
  opts: DamageOptions = {},
): void {
  if (!target.alive) return

  let final = amount
  if (school === 'physical') {
    // Block comes off the top, then armour.
    final = Math.max(0, final - target.block)
    final *= 1 - mitigation(target.armor)
  }
  if (school !== 'none') {
    const shield = getAura(target, 'shield')
    if (shield) final *= 0.4
    const enraged = getAura(boss(s), 'enrage')
    if (enraged) final *= 2
  }

  final = Math.round(final)
  target.hp = Math.max(0, target.hp - final)
  // Ground ticks are silent; 30 floating numbers a second is unreadable.
  if (!opts.silent) pushText(s, target.pos, `-${final}`, 'damage')

  record(s, target, final, opts)
  // Only the player's own hits are audible; everyone's would be a wall of noise.
  if (target.isPlayer && final > 0 && !opts.silent) s.sounds.push('hit')

  if (target.hp <= 0) {
    target.alive = false
    target.castId = null
    target.auras.length = 0
    pushText(s, target.pos, 'DOWN', 'crit')
    if (target.faction === 'party') s.sounds.push('death')
    const tally = s.tally[target.id]
    if (tally && tally.deathAt === null) tally.deathAt = s.time
  }
}

function record(s: SimState, target: Actor, final: number, opts: DamageOptions): void {
  if (target.faction === 'boss') {
    const credit = opts.sourceId === undefined ? undefined : s.tally[opts.sourceId]
    if (credit) credit.damage += final
    return
  }

  const taken = s.tally[target.id]
  if (!taken) return
  taken.damageTaken += final
  if (opts.mechanic) taken.mechanicHits++
}

export function applyHeal(s: SimState, target: Actor, amount: number, sourceId: number): void {
  if (!target.alive) return
  const before = target.hp
  target.hp = Math.min(target.maxHp, target.hp + amount)
  const healed = Math.round(target.hp - before)

  const credit = s.tally[sourceId]
  if (credit) {
    credit.healing += healed
    // Casting a big heal on someone barely hurt is the healer equivalent of
    // standing in fire, so it is tracked separately rather than hidden.
    credit.overhealing += Math.max(0, Math.round(amount) - healed)
  }

  if (healed > 0) {
    if (target.isPlayer) s.sounds.push('heal')
    pushText(s, target.pos, `+${healed}`, 'heal')
    // Healing generates threat too, which is why a healer can pull the boss.
    addThreat(s, sourceId, healed * 0.5)
  }
}

/** Everything a spread debuff hits when it expires on someone. */
export function detonateSpread(s: SimState, carrier: Actor): void {
  for (const a of livingParty(s)) {
    if (dist(a.pos, carrier.pos) <= SPREAD_RADIUS) {
      applyDamage(s, a, 760 * DIFFICULTIES[s.difficulty].damage, 'magic', {
        sourceId: BOSS_ID,
        mechanic: true,
      })
    }
  }
}

/** Anything thrown from further away than melee gets a visible bolt. */
export const PROJECTILE_MIN_RANGE = 120

// Fast enough that the bolt does not lag visibly behind the damage it
// represents, slow enough to actually read as travelling: roughly 0.2s.
const PROJECTILE_SPEED: Record<ProjectileKind, number> = {
  bolt: 850,
  dot: 780,
  heavy: 700,
  heal: 820,
}

/**
 * What a bolt should look like, from the ability's own shape: heals are heals,
 * anything applying a lasting effect reads as a dot, and the expensive button
 * gets the heavy one.
 */
export function projectileKind(ability: Ability): ProjectileKind {
  if (ability.kind === 'heal') return 'heal'
  if (ability.castTime > 0 || ability.amount >= 300) return 'heavy'
  if (ability.aura) return 'dot'
  return 'bolt'
}

function spawnProjectile(s: SimState, from: Actor, targetId: number, ability: Ability): void {
  const kind = projectileKind(ability)
  const speed = PROJECTILE_SPEED[kind]

  s.projectiles.push({
    id: s.nextObjectId++,
    kind,
    pos: { x: from.pos.x, y: from.pos.y },
    prevPos: { x: from.pos.x, y: from.pos.y },
    targetId,
    speed,
    arrived: false,
  })
}

export function canCast(s: SimState, actor: Actor, ability: Ability, targetId: number): boolean {
  if (!actor.alive) return false
  if (actor.castId) return false
  if (actor.gcd > 0 && !ability.offGcd) return false
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

  if (!ability.offGcd) actor.gcd = GLOBAL_COOLDOWN
  actor.cooldowns[ability.id] = ability.cooldown

  if (actor.isPlayer) s.sounds.push('cast')

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

  if (ability.range >= PROJECTILE_MIN_RANGE && target && target.id !== actor.id) {
    spawnProjectile(s, actor, target.id, ability)
  }

  switch (ability.kind) {
    case 'damage': {
      if (!target || !target.alive) return
      applyDamage(s, target, ability.amount, 'none', { sourceId: actor.id })
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
