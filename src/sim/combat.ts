import { ABILITIES, type Ability } from './abilities'
import { DIFFICULTIES, RESOURCES, mitigation } from './classes'
import { CARRIER_FRAGILITY, carrying } from './battleground'
import {
  CHARGE_RAGE,
  CRIT_CHANCE,
  CRIT_MULTIPLIER,
  GLOBAL_COOLDOWN,
  MELEE_RANGE,
  SPREAD_RADIUS,
} from './constants'
import type { Rng } from './rng'
import { BOSS_ID, PLAYER_ID } from './state'
import type {
  Actor,
  Aura,
  AuraId,
  EffectEvent,
  ProjectileKind,
  SimState,
  Vec2,
} from './types'

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
  rake: 12,
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
  rake: { damage: 96 },
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

/**
 * Whether a number belongs to the player.
 *
 * Either end counts: what you dealt, and what landed on you. Twenty-four
 * other people trading hits is a wall of numbers over a fight whose actual
 * state is already on the frames and the meter — the same reason only your
 * own hits make a sound.
 */
function mine(target: Actor, sourceId: number | undefined): boolean {
  return target.isPlayer || sourceId === PLAYER_ID
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

/** Tops a resource up without ever going past the bar. */
export function gainPower(a: Actor, amount: number): void {
  if (amount <= 0 || a.maxPower <= 0) return
  a.power = Math.min(a.maxPower, a.power + amount)
}

/**
 * Queues something for the renderer to draw.
 *
 * Output only, like `sounds`: nothing in the simulation ever reads this back,
 * so what it contains cannot change how a pull plays out.
 */
export function pushEffect(
  s: SimState,
  kind: EffectEvent['kind'],
  pos: Vec2,
  opts: { angle?: number; abilityId?: string | null; power?: number; crit?: boolean } = {},
): void {
  s.effects.push({
    kind,
    pos: { x: pos.x, y: pos.y },
    angle: opts.angle ?? 0,
    abilityId: opts.abilityId ?? null,
    power: opts.power ?? 0,
    crit: opts.crit ?? false,
  })
}

export function addThreat(s: SimState, actorId: number, amount: number): void {
  s.threat[actorId] = (s.threat[actorId] ?? 0) + amount
}

/**
 * A taunt buys the lead, not the fight.
 *
 * It puts the caster a nose in front of whoever the boss is currently looking
 * at rather than handing out a pile of threat, so taking the boss back costs
 * nothing but has to be followed by actually holding it. The flat term is
 * what makes it work from a standing start, where every threat value in the
 * table is still zero and a percentage of nothing is nothing.
 */
const TAUNT_LEAD = 1.1
const TAUNT_FLOOR = 40

export function taunt(s: SimState, actor: Actor): void {
  const leader = topThreatTarget(s)
  const top = leader ? (s.threat[leader.id] ?? 0) : 0
  const own = s.threat[actor.id] ?? 0
  s.threat[actor.id] = Math.max(own, top * TAUNT_LEAD + TAUNT_FLOOR)
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
  /** Rolled by the caller, which is the only place with the rng. */
  crit?: boolean
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
  // Carrying their flag makes you easier to bring down, whatever hit you.
  // Outside a battleground this is never true.
  if (carrying(s, target)) final *= CARRIER_FRAGILITY

  if (school !== 'none') {
    const shield = getAura(target, 'shield')
    if (shield) final *= 0.4
    // The enrage is a boss damage amplifier, so it only doubles what the raid
    // is taking. Before the party had a physical attack of its own nothing
    // else reached this line, and reading it as "everything doubles" would
    // now hand the melee a free second wind at the four minute mark.
    const enraged = target.faction === 'party' && getAura(boss(s), 'enrage')
    if (enraged) final *= 2
  }

  if (opts.crit) final *= CRIT_MULTIPLIER

  final = Math.round(final)
  target.hp = Math.max(0, target.hp - final)
  // Ground ticks are silent; 30 floating numbers a second is unreadable.
  if (!opts.silent && mine(target, opts.sourceId)) {
    pushText(s, target.pos, `-${final}`, opts.crit ? 'crit' : 'damage')
  }

  // Rage is earned by being hit as much as by hitting. Ground ticks are
  // silent and land thirty times a second, so letting those pay would hand a
  // tank a full bar for standing in fire — exactly backwards.
  if (final > 0 && !opts.silent) gainPower(target, RESOURCES[target.resource].onHit)

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
  const credit = opts.sourceId === undefined ? undefined : s.tally[opts.sourceId]
  if (credit) credit.damage += final

  // In a raid only the party has a row, so a hit on the boss is credit and
  // nothing else. In a battleground everyone has one, and half a scoreboard
  // is not a scoreboard: what the other team took is what your team dealt.
  if (s.mode === 'raid' && target.faction === 'boss') return

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
    if (mine(target, sourceId)) pushText(s, target.pos, `+${healed}`, 'heal')
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

/**
 * Halved, to roughly 0.4s across a spell's range.
 *
 * These were tuned to arrive almost with the damage they represent. Damage
 * still resolves the instant the ability does, so at half speed the bolt is
 * visibly behind its own number — it reads as the shot travelling rather than
 * as the shot being the hit, which is a different thing to look at and worth
 * the mismatch.
 */
const PROJECTILE_SPEED: Record<ProjectileKind, number> = {
  bolt: 425,
  dot: 390,
  heavy: 350,
  heal: 410,
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

/**
 * Puts a bolt in the air.
 *
 * With a `sourceId` it carries the ability and resolves it on arrival; with
 * none it is scenery, which is what a hunter's auto shot is — the weapon has
 * already dealt its damage where it stands.
 */
export function spawnBolt(
  s: SimState,
  from: Actor,
  targetId: number,
  kind: ProjectileKind,
  abilityId: string | null = null,
  sourceId: number | null = null,
): void {
  const speed = PROJECTILE_SPEED[kind]

  s.projectiles.push({
    id: s.nextObjectId++,
    kind,
    abilityId,
    sourceId,
    pos: { x: from.pos.x, y: from.pos.y },
    prevPos: { x: from.pos.x, y: from.pos.y },
    targetId,
    speed,
    arrived: false,
  })
}

/**
 * Why a cast will not go out, or null if it will.
 *
 * The reasons are ordered the way a player reads them: the ones already
 * visible on the button first, so the one thing the button cannot show —
 * whether you are close enough — is what gets reported.
 */
export type CastBlock = 'locked' | 'resource' | 'target' | 'range' | 'close'

export function castBlocker(
  s: SimState,
  actor: Actor,
  ability: Ability,
  targetId: number,
): CastBlock | null {
  if (!actor.alive || actor.castId) return 'locked'
  if (actor.gcd > 0 && !ability.offGcd) return 'locked'
  if ((actor.cooldowns[ability.id] ?? 0) > 0) return 'locked'
  if (actor.power < ability.cost) return 'resource'

  if (ability.range > 0) {
    const target = actorById(s, targetId)
    if (!target || !target.alive) return 'target'
    const gap = dist(actor.pos, target.pos)
    if (gap > ability.range + target.radius) return 'range'
    // Only a charge has a near edge: being already there is not a reason to
    // spend its cooldown.
    if (ability.minRange && gap < ability.minRange + target.radius) return 'close'
  }
  return null
}

export function canCast(s: SimState, actor: Actor, ability: Ability, targetId: number): boolean {
  return castBlocker(s, actor, ability, targetId) === null
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

  // A cast that never landed costs nothing.
  //
  // Mana is only spent when a cast resolves, so the cooldown was the one
  // charge that survived being broken: stepping out of a puddle a quarter of
  // the way into a Pyroblast took twenty seconds of an ability you never got
  // to use, and the only winning move was to stand in the fire.
  actor.cooldowns[actor.castId] = 0

  // A cast that collapses rather than going off, so it reads as coming apart
  // instead of firing.
  pushEffect(s, 'fizzle', actor.pos, { abilityId: actor.castId })

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
  rng: Rng,
): void {
  const target = actorById(s, targetId)
  // Paid on the press, not on arrival: the cost is what the cast took out of
  // you, and it took it when you cast.
  if (ability.cost > 0) actor.power = Math.max(0, actor.power - ability.cost)

  // Anything thrown lands when it gets there. The bolt used to be scenery
  // travelling after damage that had already happened, which meant a shot at
  // something about to die always counted and a heal was never too late.
  // A charge is the caster crossing the gap, not something thrown across it.
  if (
    ability.kind !== 'charge' &&
    ability.range >= PROJECTILE_MIN_RANGE &&
    target &&
    target.id !== actor.id
  ) {
    spawnBolt(s, actor, target.id, projectileKind(ability), ability.id, actor.id)
    return
  }

  landAbility(s, actor, ability, targetId, rng)
}

/**
 * What an ability does where it lands.
 *
 * Called straight away for anything used in melee or on yourself, and by the
 * projectile when one was thrown. Everything that reads as the hit is in
 * here: the damage, the threat it earns, the aura it leaves and the picture
 * of it arriving.
 */
export function landAbility(
  s: SimState,
  actor: Actor,
  ability: Ability,
  targetId: number,
  rng: Rng,
): void {
  const target = actorById(s, targetId)
  // Rolled here rather than inside applyDamage, because this is where the rng
  // is and because a mechanic must never crit: a puddle that sometimes hits
  // for half again as much is not a thing anyone can play around.
  //
  // In a raid that means the party alone, since a boss that occasionally hits
  // half again as hard makes healing a coin toss. In a battleground both sides
  // are the party — the other team is five of the same classes, and denying
  // them crits is a seven percent damage tax that decided every mirror match
  // before anyone pressed anything.
  const crit =
    (s.mode === 'battleground' || actor.faction === 'party') && rng.chance(CRIT_CHANCE)

  switch (ability.kind) {
    case 'damage': {
      // A target that died while the bolt was in the air takes nothing. The
      // shot is wasted, which is the cost of it having a travel time at all.
      if (!target || !target.alive) return
      applyDamage(s, target, ability.amount, 'none', { sourceId: actor.id, crit })
      pushEffect(s, 'impact', target.pos, {
        abilityId: ability.id,
        power: ability.amount * (crit ? CRIT_MULTIPLIER : 1),
        crit,
      })
      if (target.id === BOSS_ID) addThreat(s, actor.id, ability.amount * ability.threatMult)
      if (ability.aura) addAura(target, ability.aura, actor.id)
      break
    }
    case 'heal': {
      if (!target || !target.alive) return
      if (ability.amount > 0) applyHeal(s, target, ability.amount, actor.id)
      pushEffect(s, 'heal', target.pos, { abilityId: ability.id, power: ability.amount })
      if (ability.aura) addAura(target, ability.aura, actor.id)
      break
    }
    case 'taunt': {
      taunt(s, actor)
      pushText(s, actor.pos, ability.name, 'miss')
      break
    }
    case 'defensive': {
      if (ability.aura) addAura(actor, ability.aura, actor.id)
      break
    }
    case 'charge': {
      if (!target || !target.alive) return
      const dx = target.pos.x - actor.pos.x
      const dy = target.pos.y - actor.pos.y
      const gap = Math.max(0.001, Math.hypot(dx, dy))
      // Stops at swinging distance rather than inside them, so the charge
      // ends where the rotation can carry on.
      const landing = Math.max(0, gap - (target.radius + MELEE_RANGE * 0.7))
      const from = { x: actor.pos.x, y: actor.pos.y }
      actor.pos.x += (dx / gap) * landing
      actor.pos.y += (dy / gap) * landing

      // Running at something is the other way a warrior earns rage, and the
      // reason a charge opens a pull rather than waiting one out.
      gainPower(actor, CHARGE_RAGE)
      pushEffect(s, 'dash', from, { angle: Math.atan2(dy, dx), power: landing })
      break
    }
  }
}
