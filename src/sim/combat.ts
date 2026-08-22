import { ABILITIES, type Ability } from './abilities'
import { DIFFICULTIES, RESOURCES, mitigation, specOf } from './classes'
import { CARRIER_FRAGILITY, carrying, clearTerrain } from './battleground'
import { affixHealing, affixSpread } from './affix'
import {
  CHARGE_RAGE,
  CRIT_CHANCE,
  CRIT_MULTIPLIER,
  GLOBAL_COOLDOWN,
  HUNT_DURATION,
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
  FloatingText,
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
  // Long enough that a second tank has to take it, short enough that a party
  // with only one tank gets it back off eventually.
  sunder: 16,
  hunted: HUNT_DURATION,
  enrage: 9999,
  // Bookkeeping for the spec traits. Long enough that a rotation keeps them
  // between presses, short enough that they are gone by the next pull.
  combo: 20,
  momentum: 6,
  eclipse: 8,
  ward: 10,
  mending: 6,
  rot: 15,
  // Short on purpose: it is for one exit and one return, not for a fight.
  sprint: 5,
}

/**
 * How high a trait's counter can go.
 *
 * `addAura` refreshes rather than stacking — several dealers keeping one
 * debuff on a boss must not multiply it — so anything that is meant to count
 * says so here and counts through `stackAura`.
 */
const AURA_MAX: Partial<Record<AuraId, number>> = {
  combo: 5,
  momentum: 3,
  eclipse: 1,
  sunder: 5,
}

/**
 * What each stack of a sunder takes off the armour it broke.
 *
 * Armour rather than a damage multiplier, which is what it was first written
 * as. The two are not the same mechanic wearing different names: a multiplier
 * compounds with everything else that is already scaling — heroic's damage,
 * the enrage — and it did exactly that, taking a ten-man heroic from
 * seventeen percent to three while normal barely moved. Run through the
 * armour curve instead, the same curve plate and cloth already sit on, it
 * bites hardest on the target that had the most to lose and cannot take more
 * than there was.
 *
 * Physical only either way, so it stays the tank's problem rather than the
 * raid's.
 */
const SUNDER_ARMOR = 1200

/** Adds one to a counting aura, up to its cap, and refreshes its clock. */
export function stackAura(actor: Actor, id: AuraId, sourceId: number): void {
  const cap = AURA_MAX[id] ?? 1
  const existing = getAura(actor, id)
  if (!existing) {
    addAura(actor, id, sourceId)
    return
  }
  existing.stacks = Math.min(cap, existing.stacks + 1)
  existing.remaining = AURA_DURATION[id]
}

export function clearAura(actor: Actor, id: AuraId): void {
  const at = actor.auras.findIndex((au) => au.id === id)
  if (at >= 0) actor.auras.splice(at, 1)
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
  renew: { heal: 66 },
  rejuvenation: { heal: 47 },
  riptide: { heal: 58 },
  // The bear's own trickle, refreshed by every hit it takes. Small, constant,
  // and the reason its healer is topping up rather than catching spikes.
  mending: { heal: 62 },
  // The boss's own dot. Unavoidable, slow, and the reason a healer cannot
  // spend a whole fight watching one health bar.
  rot: { damage: 36 },
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
  kind: FloatingText['kind'],
  power = 0,
): void {
  s.texts.push({ id: s.nextObjectId++, text, pos: { x: pos.x, y: pos.y }, age: 0, kind, power })
}

export function say(s: SimState, actor: Actor, text: string): void {
  // A boss that does not use a mechanic has no line for it, and an empty
  // speech bubble is worse than silence.
  if (text === '') return
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
  opts: {
    angle?: number
    abilityId?: string | null
    power?: number
    crit?: boolean
    empowered?: boolean
  } = {},
): void {
  s.effects.push({
    kind,
    pos: { x: pos.x, y: pos.y },
    angle: opts.angle ?? 0,
    abilityId: opts.abilityId ?? null,
    power: opts.power ?? 0,
    crit: opts.crit ?? false,
    empowered: opts.empowered ?? false,
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
    const broken = (getAura(target, 'sunder')?.stacks ?? 0) * SUNDER_ARMOR
    final *= 1 - mitigation(Math.max(0, target.armor - broken))
  }
  // Carrying their flag makes you easier to bring down, whatever hit you.
  // Outside a battleground this is never true.
  if (carrying(s, target)) final *= CARRIER_FRAGILITY

  final *= tankTrait(s, target, school)

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
    pushText(
      s,
      target.pos,
      `-${final}`,
      opts.crit ? 'crit' : target.isPlayer ? 'taken' : 'damage',
      final,
    )
  }

  // Rage is earned by being hit as much as by hitting. Ground ticks are
  // silent and land thirty times a second, so letting those pay would hand a
  // tank a full bar for standing in fire — exactly backwards.
  if (final > 0 && !opts.silent) gainPower(target, RESOURCES[target.resource].onHit)
  if (final > 0) mendAfterHit(target, final)

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

/**
 * Whoever is furthest from full on a side, which is what every heal aims at.
 *
 * There were three of these — one in the autocast, one in the party AI and
 * one in the action bar — which is two more than there are answers to the
 * question. They agreed, but only by coincidence.
 */
export function mostHurt(s: SimState, faction: Actor['faction'] = 'party'): Actor | null {
  let best: Actor | null = null
  let ratio = Infinity
  for (const a of s.actors) {
    if (a.faction !== faction || !a.alive) continue
    const r = a.hp / a.maxHp
    if (r < ratio) {
      ratio = r
      best = a
    }
  }
  return best
}

export function applyHeal(s: SimState, target: Actor, amount: number, sourceId: number): void {
  if (!target.alive) return
  const before = target.hp
  // The day's twist, applied where every heal passes rather than at each of
  // the dozen places one is cast.
  target.hp = Math.min(target.maxHp, target.hp + amount * affixHealing(s.affix))
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
    if (mine(target, sourceId)) pushText(s, target.pos, `+${healed}`, 'heal', healed)
    // Healing generates threat too, which is why a healer can pull the boss.
    addThreat(s, sourceId, healed * 0.5)
  }
}

/** Everything a spread debuff hits when it expires on someone. */
export function detonateSpread(s: SimState, carrier: Actor): void {
  for (const a of livingParty(s)) {
    if (dist(a.pos, carrier.pos) <= SPREAD_RADIUS * affixSpread(s.affix)) {
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
      // The spec's own rule decides what this press was worth. Read before it
      // lands, spent after, because a finisher has to be paid at the value it
      // was read at.
      const bonus = traitBonus(actor, ability, target)
      const amount = Math.round(ability.amount * bonus)
      applyDamage(s, target, amount, 'none', { sourceId: actor.id, crit })
      pushEffect(s, 'impact', target.pos, {
        abilityId: ability.id,
        power: amount * (crit ? CRIT_MULTIPLIER : 1),
        crit,
        // A tenth over is rounding; a fifth over is the trait paying, and that
        // is what the extra ring is for.
        empowered: bonus > 1.2,
        // Along the line of the blow, so a cleave falls the way the swing did.
        angle: Math.atan2(target.pos.y - actor.pos.y, target.pos.x - actor.pos.x),
      })
      if (target.id === BOSS_ID) addThreat(s, actor.id, amount * ability.threatMult)
      if (ability.aura) addAura(target, ability.aura, actor.id)
      spendTrait(s, actor, ability, target, crit)
      break
    }
    case 'heal': {
      if (!target || !target.alive) return
      const healBonus = healTrait(actor, target)
      const healed = Math.round(ability.amount * healBonus)
      if (healed > 0) applyHeal(s, target, healed, actor.id)
      pushEffect(s, 'heal', target.pos, {
        abilityId: ability.id,
        power: healed,
        empowered: healBonus > 1.2,
      })
      if (ability.aura) addAura(target, ability.aura, actor.id)
      spendHealTrait(s, actor, ability, target, healed)
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
      // A charge crosses the gap rather than walking it, so it is the one move
      // that can end inside a rock. It stops against one instead: terrain that
      // a cooldown ignores is terrain nobody has to respect.
      clearTerrain(s.bg, actor.pos, actor.radius, (dx / gap) * landing, (dy / gap) * landing)

      // Running at something is the other way a warrior earns rage, and the
      // reason a charge opens a pull rather than waiting one out.
      gainPower(actor, CHARGE_RAGE)
      pushEffect(s, 'dash', from, { angle: Math.atan2(dy, dx), power: landing })
      break
    }
  }
}

/**
 * The spec's own rule, as a multiplier on what it just landed.
 *
 * Read here rather than baked into the ability numbers, because the whole
 * point is that the same press is worth different amounts depending on what
 * the player did before it. Nine damage specs used to be one rotation with the
 * numbers moved ten percent; this is where they stop being that.
 */
function traitBonus(actor: Actor, ability: Ability, target: Actor): number {
  const spec = specOf({ classId: actor.classId, spec: actor.spec })
  const kit = spec.abilities
  const isFiller = ability.id === kit.filler
  const isFinisher = ability.id === kit.finisher

  switch (spec.trait) {
    case 'combo': {
      // Five points is double. Spending them is the decision; the filler is
      // just how you get there.
      if (!isFinisher) return 1
      const points = getAura(actor, 'combo')?.stacks ?? 0
      return 1 + points * 0.2
    }
    case 'momentum': {
      // Compounds while it stands still and casts. Everything about a mage is
      // the argument between that and the floor.
      const stacks = getAura(actor, 'momentum')?.stacks ?? 0
      return 1 + stacks * 0.18
    }
    case 'eclipse': {
      // The finisher opens a window; the filler is what the window is for.
      if (!isFiller) return 1
      return getAura(actor, 'eclipse') ? 1.55 : 1
    }
    case 'distance': {
      // Paid for the range it keeps, which is also the range that makes it
      // useless the moment something walks onto it.
      const gap = dist(actor.pos, target.pos)
      const far = Math.min(1, Math.max(0, (gap - 150) / 180))
      return 1 + far * 0.35
    }
    case 'affliction': {
      // Worth more on something already marked, so the debuff is a setup
      // rather than a tax paid once and forgotten.
      if (!isFiller || !kit.overTime) return 1
      return getAura(target, kit.overTime as AuraId) ? 1.4 : 1
    }
    case 'overflow': {
      // Rage past the point of spending it. A warrior opens a fight unable to
      // do anything and ends it unable to spend fast enough.
      if (!isFiller) return 1
      return actor.power >= actor.maxPower * 0.8 ? 1.5 : 1
    }
    case 'chain':
      return 1
    default:
      return 1
  }
}

/**
 * What the press did to the spec's own counter, after it landed.
 *
 * Separate from the bonus because spending is not the same as reading: the
 * finisher has to be paid at the value it was read at.
 */
function spendTrait(
  s: SimState,
  actor: Actor,
  ability: Ability,
  target: Actor,
  crit: boolean,
): void {
  const spec = specOf({ classId: actor.classId, spec: actor.spec })
  const kit = spec.abilities
  const isFiller = ability.id === kit.filler
  const isFinisher = ability.id === kit.finisher

  switch (spec.trait) {
    case 'combo':
      if (isFiller) stackAura(actor, 'combo', actor.id)
      else if (isFinisher) clearAura(actor, 'combo')
      break
    case 'momentum':
      // Only a real cast compounds. An instant is not standing still.
      if (ability.castTime > 0) stackAura(actor, 'momentum', actor.id)
      break
    case 'eclipse':
      if (isFinisher) stackAura(actor, 'eclipse', actor.id)
      else if (isFiller) clearAura(actor, 'eclipse')
      break
    case 'chain': {
      // Jumps to whatever else is standing near, for a third each hop. Worth
      // nothing on a lone boss and worth a great deal in a crowd, which is the
      // whole personality.
      if (!isFinisher) break
      const hostile = s.actors.filter(
        (a) =>
          a.alive &&
          a.id !== target.id &&
          a.faction !== actor.faction &&
          dist(target.pos, a.pos) < 190,
      )
      let power = ability.amount * 0.34
      for (const next of hostile.slice(0, 2)) {
        applyDamage(s, next, Math.round(power), 'none', { sourceId: actor.id, crit })
        pushEffect(s, 'impact', next.pos, { abilityId: ability.id, power, crit })
        if (next.id === BOSS_ID) addThreat(s, actor.id, power * ability.threatMult)
        power *= 0.6
      }
      break
    }
    default:
      break
  }
}

/**
 * A healer's own rule, as a multiplier on what it just healed.
 *
 * The four of them used to be one healer: a cast heal, an over-time and an
 * instant, within ten percent of each other on every number. What separates
 * them now is who the heal is for and what it needs you to have done first.
 */
function healTrait(actor: Actor, target: Actor): number {
  const spec = specOf({ classId: actor.classId, spec: actor.spec })
  switch (spec.trait) {
    case 'anchor':
      // Everything is worth more on the tank and less on everybody else. The
      // one healer that is a tank healer rather than a raid healer.
      return target.role === 'tank' ? 1.45 : 0.85
    case 'bloom': {
      // A direct heal on somebody already mending bursts. The over-time is the
      // setup rather than a trickle you top up between real heals.
      const kit = spec.abilities
      if (!kit.overTime) return 1
      return getAura(target, kit.overTime as AuraId) ? 1.5 : 0.9
    }
    default:
      return 1
  }
}

/** What the heal did afterwards: the chain hop, and the ward. */
function spendHealTrait(
  s: SimState,
  actor: Actor,
  ability: Ability,
  target: Actor,
  healed: number,
): void {
  const spec = specOf({ classId: actor.classId, spec: actor.spec })

  if (spec.trait === 'chain' && ability.id === spec.abilities.finisher) {
    // Jumps to whoever is standing near the target, for a third each hop —
    // worth everything on a stacked party and nothing on a spread one.
    const near = s.actors
      .filter(
        (a) =>
          a.alive &&
          a.faction === actor.faction &&
          a.id !== target.id &&
          dist(target.pos, a.pos) < 160,
      )
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)
    let power = healed * 0.4
    for (const next of near.slice(0, 2)) {
      applyHeal(s, next, Math.round(power), actor.id)
      pushEffect(s, 'heal', next.pos, { abilityId: ability.id, power })
      power *= 0.6
    }
  }

  if (spec.trait === 'ward' && ability.id === spec.abilities.overTime) {
    // The reduction goes on before the hit rather than the heal after it: the
    // one healer that has to know what the boss does next.
    addAura(target, 'ward', actor.id)
  }
}

/**
 * A tank's own rule, as a multiplier on what is about to land on it.
 *
 * The three of them had different health and armour and the same job. This is
 * where they stop having the same job: one spends rage on not being hit, one
 * runs a reduction on a clock a healer can plan around, and one takes it and
 * gives a slice of it back.
 */
function tankTrait(s: SimState, target: Actor, school: School): number {
  // A boss and its thralls borrow a class and a spec for their name and their
  // colour; they are not playing one. Without this the raid boss inherited the
  // warrior tank's trait — and since it has no rage bar at all, `power >= 0`
  // was always true and it quietly took a quarter less damage from everything
  // for as long as the trait existed. Every balance number measured in that
  // window was measured against a boss with free armour.
  if (s.mode === 'raid' && target.faction === 'boss') return 1

  const spec = specOf({ classId: target.classId, spec: target.spec })

  if (getAura(target, 'ward')) {
    // Not a tank trait, but it lands here: a ward put on before the hit.
    return 0.65
  }

  switch (spec.trait) {
    case 'guard':
      // Rage is earned by being hit, and spent on being hit less. A warrior
      // that has been in the fight is a warrior that is hard to move.
      return school === 'physical' && target.maxPower > 0 && target.power >= target.maxPower * 0.6
        ? 0.75
        : 1
    case 'cadence': {
      // On a clock rather than on a decision, so the healer can see it coming.
      // Two seconds in every eight.
      const phase = s.time % 8
      return phase < 2.5 ? 0.58 : 1
    }
    default:
      return 1
  }
}

/** The druid tank's slice of what it just took, handed back over time. */
export function mendAfterHit(target: Actor, amount: number): void {
  const spec = specOf({ classId: target.classId, spec: target.spec })
  if (spec.trait !== 'thick' || amount <= 0) return
  addAura(target, 'mending', target.id)
}

/**
 * How fast this actor is moving right now, as a multiplier.
 *
 * One aura for now, and deliberately large: a sprint that shaves ten percent
 * off a walk is a sprint nobody notices. Half again for five seconds is a
 * button that visibly gets a rogue out of a puddle and back onto the boss,
 * which is what it is for.
 */
export function hasteOf(actor: Actor): number {
  return getAura(actor, 'sprint') ? 1.5 : 1
}
