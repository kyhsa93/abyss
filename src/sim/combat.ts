import { ABILITIES, type Ability } from './abilities'
import { DIFFICULTIES, RESOURCES, mitigation, specOf } from './classes'
import { CARRIER_FRAGILITY, carrying, clearTerrain } from './battleground'
import { affixHealing, affixSpread } from './affix'
import { encounterAt, type MechanicId } from './encounters'
import { descentDamage } from './descent'
import {
  BURDEN_DAMAGE,
  BURDEN_SLOW,
  BURDEN_PER_HAND,
  CHANT_CAST,
  CHARGE_RAGE,
  CRIT_CHANCE,
  CRIT_MULTIPLIER,
  GLOBAL_COOLDOWN,
  HEALTH,
  HUNT_DURATION,
  MELEE_RANGE,
  SPREAD_RADIUS,
  YOKE_ALONE,
  GRASP_CAP,
  GRASP_PER_HEAD,
  YOKE_REACH,
  YOKE_SHARE,
  MELEE_CALL,
  ENRAGE_GRACE,
  ECHO_BEAT,
} from './constants'
import type { Rng } from './rng'
import { BOSS_ID, PLAYER_ID } from './state'
import type {
  Actor,
  Aura,
  AuraId,
  EffectEvent,
  FloatingText,
  GroundEffect,
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

/**
 * Whether an interlude is running, which is what makes the boss untouchable.
 *
 * Here rather than beside the rest of the boss's code because `applyDamage`
 * has to ask it, and a module that answers damage cannot import the module
 * that deals it.
 */
export function heraldUp(s: SimState): boolean {
  return s.actors.some((a) => a.faction === 'boss' && a.spawn === 'herald' && a.alive)
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

export const AURA_DURATION: Record<AuraId, number> = {
  // Short. A raid cooldown answers one moment, not a stretch of the fight —
  // long enough to cover the hit it was called for and the tail of a second
  // one arriving on its heels, and nowhere near long enough to be held up
  // whenever it happens to be off cooldown.
  rally: 7,
  renewal: 8,
  urgency: 10,
  living_bomb: 12,
  serpent_sting: 15,
  rupture: 12,
  flame_shock: 12,
  moonfire: 14,
  rend: 12,
  rake: 12,
  judgement: 12,
  shadow_word_pain: 15,
  immolate: 12,
  renew: 12,
  rejuvenation: 12,
  riptide: 12,
  shield: 6,
  // Shorter than a wall as well as weaker: it answers one hit rather than a
  // stretch of the fight.
  brace: 4,
  beacon: 12,
  spread: 4,
  // Short enough that a reaction is a reaction rather than a stroll.
  brand: 1.8,
  // Long enough to be several beats rather than one, which is the mechanic:
  // a single piece of floor going out from under somebody is a puddle, and
  // what this asks is that they keep leaving.
  //
  // Measured in beats, not in seconds, which is why it moved when the drum
  // did: `NOTICE_GRANT` slowed `ECHO_BEAT` from 1.05 to 1.45, and five seconds
  // that had been four beats and a bit became three. Four beats is the
  // mechanic — the same number of times you are asked to leave, spread over
  // the longer count a person needs to see each one coming.
  echo: 4 * ECHO_BEAT + 0.2,
  // The count on a judgement. Long enough that a healer who started on it
  // lands the heal, short enough that one who waited out a global cooldown
  // first does not — which is the whole question the mechanic asks.
  verdict: 3,
  // The name on the one who has to cut the note. A shade longer than the note
  // itself, so that the name is still on the body when the count runs out --
  // the ground effect is what resolves the mechanic, and a mark that expired
  // one tick early would leave the note landing on a raid it had never named.
  chant: CHANT_CAST + 0.4,
  // The same: a label saying which stone is yours, alive only for as long as
  // the count on the stones. What decides the mechanic is the ground effect
  // resolving, not this running out.
  refuge: 2.8,
  // Only a label, and only until the split resolves. What decides the
  // mechanic is the ground effect counting down, not this running out; this
  // is what says which group you are in while it does.
  schism: 2.4,
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
  // Long enough that the health went on a stretch of casting rather than on
  // one press, short enough that it cannot be bought before a pull and spent
  // during it.
  pact: 12,
  ward: 10,
  mending: 6,
  rot: 15,
  // Short on purpose: it is for one exit and one return, not for a fight.
  sprint: 5,
  // The fuse on a weight that has to change hands. Long enough to cross the
  // gap to somebody who has not held it, short enough that the crossing has
  // to start now — which is the only place a reaction can be charged for.
  burden: 1.9,
  // Longer, because what it asks for is not one person moving but everybody
  // else arriving, and they are arriving from wherever the rest of the fight
  // left them standing.
  yoke: 1.1,
  // How long the surface stays closed. Long enough that stopping and staying
  // stopped are two different things -- a raid that reads the cast and holds
  // for one global is a raid that starts again inside the window.
  mirror: 4,
  // Only a memory, and only for as long as the thing it was struck on can
  // still be broken. It outlives the vessel's own clock by a little so that a
  // hit landed in the last tenth of a second is still a hit that was landed.
  spoil: 12,
}

/** How many fillers one mouthful of health lights up. See the `pact` case. */
const PACT_CHARGES = 3

/** What a lit filler is worth, for the health it was bought with. */
const PACT_BONUS = 1.5

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
  eclipse: 3,
  pact: PACT_CHARGES,
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

/** How many fillers one finisher lights up. See the `eclipse` case in onCast. */
const ECLIPSE_CHARGES = 3

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
  immolate: { damage: 64 },
  renew: { heal: 66 },
  rejuvenation: { heal: 47 },
  riptide: { heal: 58 },
  beacon: { heal: 62 },
  // The bear's own trickle, refreshed by every hit it takes. Small, constant,
  // and the reason its healer is topping up rather than catching spikes.
  mending: { heal: 62 },
  // Called rather than cast, and on everybody at once. Small a tick and worth
  // it because it lands on twenty-five people: what it answers is a raid that
  // has just taken one hit together, which is the one thing a healer cannot
  // fix one bar at a time.
  renewal: { heal: 54 },
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
    radius?: number
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
    radius: opts.radius ?? 0,
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

/**
 * Whether a hit came from somebody playing rather than from the fight.
 *
 * By what the source is, never by its id: a battleground numbers its red team
 * from `BOSS_ID` up, so the first of them shares the boss's id exactly. An
 * attempt to skip the search for `BOSS_ID` — on the grounds that the boss
 * deals most of the damage in the game — quietly cut every hit that one red
 * player threw to less than half.
 */
function steered(s: SimState, sourceId: number | undefined): boolean {
  if (sourceId === undefined) return false
  const source = s.actors.find((a) => a.id === sourceId)
  return source !== undefined && (source.isPlayer || source.ai !== null)
}

export interface DamageOptions {
  /** Who to credit. Party damage without this is invisible in the report. */
  sourceId?: number
  silent?: boolean
  /** Rolled by the caller, which is the only place with the rng. */
  crit?: boolean
  /**
   * An avoidable mechanic, named. Counted per hit rather than per point,
   * because "ate three puddles" is the thing worth knowing, not the total.
   *
   * It was a flag until the boss notes wanted to say *which* three. Every
   * caller already knew -- a hazard carries its kind and everything else is
   * thrown from a function named after one mechanic -- so the name costs
   * nothing to pass and the flag was throwing it away. Still only ever read
   * as truthy by the fight itself.
   */
  mechanic?: MechanicId
}

export function applyDamage(
  s: SimState,
  target: Actor,
  amount: number,
  school: School,
  opts: DamageOptions = {},
): void {
  if (!target.alive) return

  // Nothing reaches the boss while its herald is standing.
  //
  // The interlude is a room to clear, and a room you may skip by ignoring it
  // is a corridor. The AI would switch on its own — a rotation aims at the
  // lowest-health summon before it aims at the boss — so without this the beat
  // would exist for the party and not for the player, who can keep pressing
  // whatever they like.
  if (target.id === BOSS_ID && s.mode === 'raid' && heraldUp(s)) return

  // Whose hit this is decides what units it is written in. Bodies someone is
  // steering — the player, and everything with an AI profile — swing numbers
  // aimed at a boss's health bar, and those are left alone: in a battleground
  // they are the entire fight. Everything else on the field is the fight
  // itself, boss and adds and whatever the floor is doing, and that damage is
  // written in health bars, so it moves with them.
  let final = amount * (steered(s, opts.sourceId) ? 1 : HEALTH)
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
    // The one everybody else carries, and it does nothing at all about the
    // floor.
    //
    // Weaker than a wall by a wide margin -- a tank's is what lets it be hit
    // on purpose, and eleven specs holding the tank's number would be eleven
    // tanks -- and narrower in the way that matters: it answers what could
    // not have been avoided and is worth nothing against what was. Measured
    // the other way round it ate the mistakes the fight is for. The puddle is
    // the biggest teacher in the game and the gap between a raid that had
    // practised and one that had not fell from five points to one, because a
    // brace was standing in for the practice. A press that makes the fire
    // safe is a press that deletes the fight.
    else if (!opts.mechanic && getAura(target, 'brace')) final *= 0.7
    // The raid's own, and the one thing in this game that does answer a
    // mechanic. That is the division rather than an oversight: a brace is
    // about what you personally could not dodge, and softening the floor with
    // it deleted the puddle's teaching. A raid cooldown is about the hit the
    // fight lands on everybody at once, which nobody was ever meant to dodge —
    // and it is called by name, once or twice in a pull, against twenty to
    // seventy such hits. Covering two of them is a decision. Covering all of
    // them is not on offer.
    if (opts.mechanic && getAura(target, 'rally')) final *= 0.65
    // The enrage is a boss damage amplifier, so it only doubles what the raid
    // is taking. Before the party had a physical attack of its own nothing
    // else reached this line, and reading it as "everything doubles" would
    // now hand the melee a free second wind at the four minute mark.
    //
    // And it grows, which it did not used to. A flat doubling is a wall a raid
    // either gets through or dies to, unless it is neither — a healer and a
    // tank left alive out of twenty-five, taking two people's worth of a
    // mechanic that was written for twenty-five, healing through it forever.
    // That pull is not lost and not won and never ends, and it is reachable:
    // one turned up in the render suite as a twenty-five man still going at
    // five minutes with the boss at forty percent and two people standing.
    //
    // Flat for the first half minute and doubling every half minute after.
    //
    // The grace is what makes this safe to add. A pull that is going to end
    // ends within a few seconds of the enrage, and every one of those sees the
    // number the fight was tuned with, unchanged. Ramping from the first
    // second instead would have quietly made the last ten seconds of every
    // close pull twenty percent worse, which is a balance change wearing a
    // bug fix's clothes.
    const enraged = target.faction === 'party' && getAura(boss(s), 'enrage')
    if (enraged) {
      const since = s.time - encounterAt(s.encounter).enrage - ENRAGE_GRACE
      final *= since > 0 ? 2 * Math.pow(2, since / 30) : 2
    }
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

  if (final > 0 && !opts.silent) remember(s, target, opts.sourceId)

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

/**
 * Who struck what, for the two mechanics that bill at an instant rather than
 * as the hits go in.
 *
 * Silent damage is deliberately not a strike. A dot ticking on the boss is
 * damage nobody pressed, and it keeps ticking whatever the body that applied
 * it decides to do next — billing it would bill a raid for having played the
 * first ten seconds of the fight, identically on a first pull and a ninth,
 * which is exactly the shape that averages skill out. What it catches is a
 * press and a swing, which are the two things a raid can hold.
 */
function remember(s: SimState, target: Actor, sourceId: number | undefined): void {
  if (sourceId === undefined) return
  // By faction as well as by id. One counter numbers every object in the
  // fight, so a body the boss summoned early can carry a raider's id.
  const source = s.actors.find((a) => a.faction === 'party' && a.id === sourceId)
  if (!source) return

  if (target.id === BOSS_ID) {
    const glass = getAura(target, 'mirror')
    if (glass && glass.struck && !glass.struck.includes(source.id)) glass.struck.push(source.id)
    return
  }

  // And the one that must not be broken open remembers whoever put a hand on
  // it. Kept on the striker rather than on the thing struck, so the bill
  // survives the corpse it is a bill for.
  if (target.spawn === 'vessel') {
    const mark = getAura(source, 'spoil')
    if (mark) mark.sourceId = target.id
    else addAura(source, 'spoil', target.id)
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
  if (opts.mechanic) {
    taken.mechanicHits++
    taken.byMechanic[opts.mechanic] = (taken.byMechanic[opts.mechanic] ?? 0) + 1
  }
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
  // the dozen places one is cast. `HEALTH` rides along for the same reason:
  // a heal is a fraction of a bar, so it is worth whatever a bar is worth.
  amount *= HEALTH
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

/**
 * What the fight multiplies its own damage by, and what a mechanic of its
 * multiplies on top.
 *
 * It lives here rather than in `boss.ts` because one mechanic never reached
 * it. The spread's detonation is written where the aura expires, which is
 * outside the timeline, and it applied `760 * difficulty` straight — no
 * boss `mechanicDamage`, no size weight, no descent. So the Choir's signature
 * mechanic ignored the Choir's own dial: turning that dial from 1.35 to 3.0
 * moved its twenty-five man rungs and left its five and ten exactly where
 * they were, because those two rungs are a spread and a rot and the rot is
 * unavoidable.
 *
 * A funnel with something outside it is not a funnel. Both of them read this.
 */
export function fightScale(s: SimState): number {
  return DIFFICULTIES[s.difficulty].damage * descentDamage(s.depth) * sizeScale(s)
}

/** This boss's own weight at this raid size. One unless it says otherwise. */
export function sizeScale(s: SimState): number {
  const table = encounterAt(s.encounter).sizeMechanic
  if (!table) return 1
  const count = s.party.length
  if (count <= 5) return table[5] ?? 1
  if (count <= 10) return table[10] ?? 1
  return table[25] ?? 1
}

export function mechanicScale(s: SimState): number {
  return fightScale(s) * encounterAt(s.encounter).mechanicDamage
}

/**
 * The note, getting louder, and what it does when it finally breaks.
 *
 * A flat drip is the one shape a healer never has to think about: it arrives
 * at the same rate it is covered at, so the fight asks nothing and a raid
 * that has never seen it wins as often as one that has. Measured, the
 * Choir's three normal rungs improved by 0, -5 and +10 points between a first
 * pull and a ninth, against the Warden's 35, 60 and 93 — and the Warden's
 * curve is a puddle, which is to say a spike somebody failed to avoid.
 *
 * This is the same idea for a mechanic that cannot be avoided at all: the
 * spike is not dodged, it is anticipated. The note builds over its fifteen
 * seconds and bursts at the end, so a healer that is watching tops the
 * carrier before it lands and one that is not loses them — which is exactly
 * what this boss already asks for out loud. `demand` says out-heal the
 * singing and the carrier says a note is caught in me.
 *
 * The ramp is centred on one, so the total the drip used to do is unchanged.
 * What moved is when it arrives.
 */
const ROT_RAMP = 1.2
// 200 rather than the 430 this started at. The break is a real spike at that
// size — a fifth of a bar, landing on a body the drip has already worked on —
// and it leaves the ladder where the last round put it. Larger, and it stops
// being the Choir's mechanic and becomes everybody's: the Warden buys `rot` on
// its second rung and holds it for the rest of the ladder, so this number is
// paid four times by the boss it does not belong to.
const ROT_BREAK = 200

export function rotBite(aura: Aura, base: number): number {
  const spent = 1 - Math.max(0, aura.remaining) / AURA_DURATION.rot
  return base * (1 - ROT_RAMP / 2 + ROT_RAMP * spent)
}

/**
 * Whoever could take this weight, and has not had it yet.
 *
 * The chain's memory is what makes this a search rather than a lookup: by the
 * last leg the bodies standing closest are exactly the ones that have already
 * had their turn.
 */
export function freshHands(s: SimState, carrier: Actor): Actor[] {
  const weight = getAura(carrier, 'burden')
  if (!weight) return []
  const held = weight.held ?? [carrier.id]
  return livingParty(s).filter(
    (a) => a.id !== carrier.id && !held.includes(a.id) && !getAura(a, 'burden'),
  )
}

/**
 * The one body being asked to take it, which is the furthest one that can.
 *
 * The furthest rather than the nearest, and this is the entire mechanic.
 *
 * Nearest was the first version and it measured at nothing, for a reason that
 * is worth writing down because it will be true of the next mechanic somebody
 * builds about proximity: this party stands thirty units apart. A raid at rest
 * is already touching, so a handoff to whoever is nearest completes on the
 * tick it is handed out, before anybody has noticed it exists — four hundred
 * of them in one pull and not one dropped. It was not an easy mechanic, it was
 * an absent one, and no amount of shortening the fuse would have found it,
 * because the fuse was never what it was failing to fit inside.
 *
 * Sent to the far side instead, the pass is a run across the arena — the melee
 * stand at the boss and the casters two hundred units out, so the raid is wide
 * even when it is packed. Now the fuse has a journey to be too short for, and
 * the reaction that delays the start of the journey is charged for.
 *
 * It also says something true: a hand that happened to be there did not accept
 * anything. Somebody has to come and get it.
 */
export function burdenTaker(s: SimState, carrier: Actor): Actor | null {
  let best: Actor | null = null
  let furthest = -1
  for (const hand of freshHands(s, carrier)) {
    const d = dist(carrier.pos, hand.pos)
    if (d > furthest) {
      furthest = d
      best = hand
    }
  }
  return best
}

/**
 * The one named to stand with a carrier, read off the mark itself.
 *
 * The mark rather than the carrier, because the one place this has to be right
 * is the one place the carrier no longer has it: aura expiry splices the entry
 * out of the actor before it calls the thing that resolves it, so a lookup
 * through `getAura` answers "nobody was named" for every yoke that ever
 * matured. That read as a mechanic the raid never once answered — thirty-two
 * of them a pull, every one resolved alone — and it was not the raid failing
 * to walk, it was the question being asked of an actor that had already been
 * cleaned up.
 */
export function yokeBearerOf(s: SimState, mark: Aura): Actor | null {
  if (mark.bearer === undefined) return null
  const bearer = s.actors.find((a) => a.id === mark.bearer)
  return bearer && bearer.alive ? bearer : null
}

/**
 * What a weight costs whoever is carrying it, in speed.
 *
 * The one thing the mechanic charges before it resolves. Without it the
 * handoff is free — a carrier walks to the nearest fresh body at exactly the
 * speed it would have moved anyway, and the fuse is the only cost there is.
 * With it, the last leg of a chain is a walk the raid can watch fail.
 *
 * Lives here rather than in either mover, because the player and the AI have
 * separate movement code and a drag that only one of them pays is a drag that
 * makes the mechanic mean two different things.
 */
export function carryDrag(actor: Actor): number {
  return getAura(actor, 'burden') ? BURDEN_SLOW : 1
}

/**
 * How long the next pair of hands gets.
 *
 * Tightening down the chain. A relay whose every leg is the same length is a
 * relay that is either always finished or never started; shortening it means
 * the raid is racing something that is getting harder as it goes, and the
 * last leg is the one that is actually in doubt.
 */
export function burdenFuse(hands: number): number {
  return AURA_DURATION.burden * Math.pow(0.9, Math.max(0, hands))
}

/**
 * The weight going off in the hands it was left in.
 *
 * Priced off the chain rather than off the clock: what it cost the raid is
 * the walking already spent on it, and a burden dropped on its last leg spent
 * the most. `stacks` counts the hands it has been through, so a weight that
 * never moved is the cheap one and a weight that nearly made it is not.
 */
export function dropBurden(s: SimState, carrier: Actor, weight: Aura): void {
  const hands = Math.max(0, weight.stacks - 1)
  const damage = Math.round(BURDEN_DAMAGE * (1 + hands * BURDEN_PER_HAND) * mechanicScale(s))
  applyDamage(s, carrier, damage, 'magic', { sourceId: BOSS_ID, mechanic: 'burden' })
  pushEffect(s, 'impact', carrier.pos, { abilityId: 'boss_burden', power: damage })
  s.sounds.push('raid')
}

/**
 * The yoke coming due, and whether the one who was called for came.
 *
 * The gathering read the other way round, and then narrowed. A gathering is a
 * circle on the floor and the raid walks to a place; this is a debt on a
 * person, and what it asks is that one named body drops what it is doing and
 * goes to stand with them so that it can be halved.
 *
 * The bearer is the whole mechanic. If it arrived, the two of them split it
 * and it is a hit nobody remembers. If it did not, there is nobody to split it
 * with, and the whole of it lands on the one person in the raid who did
 * nothing wrong.
 *
 * That last part is the point. Every other mechanic here bills whoever made
 * the mistake: the one who stood in the fire, the one who did not spread, the
 * one still in the band when it came down. This one bills somebody else, and
 * it is the only thing in the fight that does.
 */
export function shareYoke(s: SimState, carrier: Actor, mark: Aura): void {
  const bearer = yokeBearerOf(s, mark)
  const came = bearer !== null && dist(bearer.pos, carrier.pos) <= YOKE_REACH

  if (!came) {
    const alone = Math.round(YOKE_ALONE * mechanicScale(s))
    applyDamage(s, carrier, alone, 'magic', { sourceId: BOSS_ID, mechanic: 'yoke' })
    pushEffect(s, 'impact', carrier.pos, { abilityId: 'boss_yoke', power: alone })
    s.sounds.push('raid')
    return
  }

  const share = Math.round(YOKE_SHARE * mechanicScale(s))
  for (const a of [carrier, bearer]) {
    applyDamage(s, a, share, 'magic', { sourceId: BOSS_ID, mechanic: 'yoke' })
  }
  pushEffect(s, 'impact', carrier.pos, { abilityId: 'boss_yoke', power: share })
  s.sounds.push('raid')
}

/** What is left of the note when it lets go. */
export function breakRot(s: SimState, carrier: Actor): void {
  const damage = Math.round(ROT_BREAK * fightScale(s))
  applyDamage(s, carrier, damage, 'magic', { sourceId: BOSS_ID, mechanic: 'rot' })
  pushEffect(s, 'impact', carrier.pos, { abilityId: 'boss_rot', power: damage })
  s.sounds.push('raid')
}

/**
 * The one the raid nominated to go and pay the toll, read off the plate.
 *
 * Off the ground effect rather than worked out again, which is the yoke's
 * lesson applied before it could be learnt a second time here. "Whoever can
 * best afford this" moves every time anybody in the raid takes a hit, so a
 * nomination computed on demand is answered by a different person on almost
 * every tick of the count -- and a plate two people set off for and one
 * turned back from is a plate nobody stood on.
 */
export function tollPayer(s: SimState, g: GroundEffect): Actor | null {
  if (g.named === undefined) return null
  const payer = s.actors.find((a) => a.id === g.named)
  return payer && payer.alive ? payer : null
}

/**
 * What the grasp charges the body it took hold of.
 *
 * One bill, raised by everybody else who was still inside when it closed.
 * Divided, this would be the shape that has already failed twice here -- the
 * same total goes into the raid whatever it does, so practice moves who pays
 * and never how much. Concentrated, the raid pays one hit a cast and what
 * practice moves is its size.
 */
export function graspBill(caught: number): number {
  return Math.min(GRASP_CAP, 1 + GRASP_PER_HEAD * Math.max(0, caught - 1))
}

/**
 * Which stone this one was told to take.
 *
 * Kept on the mark, the way the split keeps which group you are in, and for
 * the same reason both of them keep it rather than deriving it: the nearest
 * free stone is a different stone once somebody has started walking, and a
 * raid that re-answers it every tick is a raid where two bodies trade places
 * for two seconds and neither of them arrives.
 */
export function refugeStone(g: GroundEffect, mark: Aura): Vec2 | null {
  const spots = g.spots ?? []
  const at = mark.stacks - 1
  return at >= 0 && at < spots.length ? spots[at]! : null
}

/** Everything a spread debuff hits when it expires on someone. */
export function detonateSpread(s: SimState, carrier: Actor): void {
  for (const a of livingParty(s)) {
    if (dist(a.pos, carrier.pos) <= SPREAD_RADIUS * affixSpread(s.affix)) {
      applyDamage(s, a, 760 * mechanicScale(s), 'magic', {
        sourceId: BOSS_ID,
        mechanic: 'spread',
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
  // Health is a resource for exactly one button, and the same answer covers
  // it: a press you cannot pay for is a press the bar refuses rather than one
  // that kills you for trying.
  if (ability.selfCost && actor.hp <= Math.round(actor.maxHp * ability.selfCost)) return 'resource'

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
  // A raid cooldown comes back faster off somebody standing in it.
  //
  // This is what a melee is for, and it is here because the alternative was
  // dishonest. Doubling the arena made the room a ranged advantage — measured,
  // the hunter gained eighteen points of damage and the two worst-off melee
  // lost eleven and sixteen — and a bigger room *should* favour the specs
  // whose whole constraint is distance. That is not a bug to tune away. But
  // "ranged deal more" is only a trade if melee are worth bringing for
  // something, and until now they were not worth bringing for anything.
  //
  // So the raid's cooldowns are what melee are worth. Inside the two families
  // no spec is the obvious one — a point apart at the top of each — and across
  // them the ranged lead in damage while a raid built with melee in it gets
  // the calls back a third sooner. The gap is the price of the discount, and
  // `rendercheck` is written to say exactly that rather than to say the gap
  // does not exist.
  actor.cooldowns[ability.id] =
    ability.kind === 'raid' && actor.melee ? ability.cooldown * MELEE_CALL : ability.cooldown

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
      const bonus = traitBonus(actor, ability, target) * urgencyOf(actor)
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
    // Everybody at once, which is the only thing here that does that.
    case 'raid': {
      for (const a of s.actors) {
        if (a.faction !== actor.faction || !a.alive) continue
        if (ability.aura) addAura(a, ability.aura, actor.id)
        if (ability.amount > 0) applyHeal(s, a, ability.amount, actor.id)
        pushEffect(s, ability.amount > 0 ? 'heal' : 'cast', a.pos, {
          abilityId: ability.id,
          power: ability.amount,
        })
      }
      s.chat.push({ id: s.nextObjectId++, speaker: actor.name, text: ability.name, age: 0 })
      break
    }
    case 'taunt': {
      taunt(s, actor)
      pushText(s, actor.pos, ability.name, 'miss')
      break
    }
    case 'defensive': {
      if (ability.aura) addAura(actor, ability.aura, actor.id)
      // And the one that is paid for out of the bar. Taken here rather than
      // through `applyDamage`: nothing hit you, so it is not damage taken, it
      // does not belong on anybody's meter, and armour has no opinion about
      // it. A window bought at full charges each time, so a second press does
      // not top up a window that is already open for a fraction of the price.
      if (ability.selfCost) {
        actor.hp = Math.max(1, actor.hp - Math.round(actor.maxHp * ability.selfCost))
        pushText(s, actor.pos, ability.name, 'taken')
        if (ability.aura) {
          const window = getAura(actor, ability.aura)
          if (window) window.stacks = AURA_MAX[ability.aura] ?? 1
        }
      }
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
      clearTerrain(s.obstacles, actor.pos, actor.radius, (dx / gap) * landing, (dy / gap) * landing)

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
    case 'pact': {
      // Bought rather than built: every other window in the game is opened by
      // pressing the right thing in the right order, and this one is opened by
      // handing the healers a problem. What it buys is the same shape as the
      // eclipse -- a few fillers worth half again -- so the two can be read
      // against each other, and the difference is entirely in what it cost.
      if (!isFiller) return 1
      return getAura(actor, 'pact') ? PACT_BONUS : 1
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
    case 'eclipse': {
      // Three charges, spent one filler at a time. It used to be a single
      // charge cleared by the first filler after the finisher, which made the
      // eight second duration decorative: one press in six was buffed and the
      // trait was worth five percent while the others were worth fifteen to
      // twenty. Counting them is what the duration was always for.
      if (isFinisher) {
        clearAura(actor, 'eclipse')
        for (let i = 0; i < ECLIPSE_CHARGES; i++) stackAura(actor, 'eclipse', actor.id)
      } else if (isFiller) {
        const open = getAura(actor, 'eclipse')
        if (open) {
          open.stacks -= 1
          if (open.stacks <= 0) clearAura(actor, 'eclipse')
        }
      }
      break
    }
    case 'pact': {
      // One charge a filler, the same as the eclipse. Nothing else spends it:
      // the dot and the finisher are worth what they are worth, so the window
      // cannot be banked by pressing something bigger inside it.
      if (!isFiller) break
      const open = getAura(actor, 'pact')
      if (open) {
        open.stacks -= 1
        if (open.stacks <= 0) clearAura(actor, 'pact')
      }
      break
    }
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
      //
      // The penalty was 0.85 and it was too much: in a raid where most of the
      // damage arrives as a mechanic on everybody, a tank healer spends most
      // of its output off the tank whatever it would rather do, so the tax
      // was the trait and the bonus was the footnote. It netted 1.07x.
      return target.role === 'tank' ? 1.45 : 0.92
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
    //
    // 0.65 was the largest healer trait in the game by a distance, and an
    // unconditional one: the over-time that carries it is on a ten second
    // cooldown and lasts twelve, so a third off everything the tank took was
    // simply on. In a five-man, where one healer covers the whole party, the
    // priest won 87% of pulls against 64% for the healers whose traits ask
    // them to aim.
    return 0.78
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
/**
 * What the raid's own damage cooldown is worth to this body.
 *
 * On the source rather than on the target, and applied where damage is made
 * rather than where it lands, because it is the raid hitting harder and not
 * the boss being softer. A boss that took more from everything would also take
 * more from the other team in a battleground, which is a different game.
 */
export function urgencyOf(actor: Actor): number {
  return getAura(actor, 'urgency') ? 1.3 : 1
}

export function hasteOf(actor: Actor): number {
  return getAura(actor, 'sprint') ? 1.5 : 1
}
