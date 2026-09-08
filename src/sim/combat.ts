import { ABILITIES, type Ability } from './abilities'
import { DIFFICULTIES, RESOURCES, mitigation, specOf } from './classes'
import { CARRIER_FRAGILITY, carrying, clearTerrain } from './battleground'
import { affixHealing } from './affix'
import { encounterAt, type MechanicId } from './encounters'
import {
  CHARGE_RAGE,
  CRIT_CHANCE,
  CRIT_MULTIPLIER,
  GLOBAL_COOLDOWN,
  HEALTH,
  MELEE_RANGE,
  MELEE_CALL,
  ENRAGE_GRACE,
  TURNED_GUARD,
  INHALE_MAX,
  BLOAT_BURST_AT,
  SLIGHT_MAX,
  SLIGHT_SHARE,
} from './constants'
import type { Rng } from './rng'
import { CHAMPION_HEAL } from './boss'
import { pushInside, roomHasOutside, wallGap } from './room'
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
  /**
   * How long a spike stands if nobody breaks it.
   *
   * A cap rather than the mechanic. What is supposed to end this is the raid
   * turning round and hitting the thing, and the number is here so that a raid
   * which does not is punished rather than deadlocked -- a body that could
   * never move again would be a body removed from the fight by a mechanic with
   * no answer, which is the opposite of what this asks.
   */
  spiked: 14,
  /**
   * What the boss has taken, and it does not fade.
   *
   * The breath out is what ends it, so a count that expired on its own would
   * be the mechanic solving itself while the raid watched.
   */
  gorged: 9999,
  /**
   * How long the storm lasts.
   *
   * Long enough to be a stretch of the fight rather than a moment: the raid
   * spends it running, which means the raid spends it not dealing damage, and
   * that is the cost the mechanic charges. Short enough that a raid which
   * handles it gets back to the boss with the enrage still far away.
   */
  storming: 24,
  /** Long enough that the other tank has to actually take it. */
  slighted: 16,
  /** It dies or the wave does; the count is only a floor under both. */
  empowered: 40,
  /**
   * Twelve seconds, which is the number the mechanic is named for.
   *
   * Long enough that the raid has to decide what to do about a body it was
   * relying on, short enough that killing them is never the answer — which is
   * the line this mechanic walks. A minute of it and the raid would simply
   * remove them; a moment of it and nobody would notice.
   */
  turned: 12,
  haunted: 14,
  /**
   * Long enough to walk to, short enough that walking late is not walking.
   *
   * The spore is the one demand here answered by arriving rather than by
   * leaving, and the number is what separates a raid that gathers from a raid
   * that happened to be standing together.
   */
  spore: 7,
  /**
   * Long enough to still be there when the breath out comes.
   *
   * Sized off the breath's cadence rather than off taste: a protection that
   * expires before the thing it protects against is a mechanic that asks the
   * raid to do the work and then takes it away.
   */
  inoculated: 46,
  reek: 9,
  /** It is cleared by the swap, not by the clock. */
  swelling: 9999,
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
  // Short on purpose: it is for one exit and one return, not for a fight.
  sprint: 5,
  // It does not come off. `stackAura` refreshes a duration and this one is
  // never refreshed by anything, so the number only has to outlast a pull --
  // and the enrage is four minutes.
  championed: 3600,
  // The fuse on a spill, and it is a walk rather than a step: six seconds is
  // long enough to get out of a hundred and twenty units and short enough
  // that the raid cannot finish what it was doing first.
  spilling: 6,
  // Long enough to be a decision rather than a tick. A wound that ran its
  // whole term is twelve deposits, which is a fifth of a gauge from one body
  // nobody got to in time.
  festering: 12,
  // Four seconds inside the thing, which is two globals and a swap. Any
  // shorter and the second tank never has to move; any longer and the fight
  // is a fight with a tank missing rather than a fight with a handover in it.
  swallowed: 4,
  // How long the surface stays closed. Long enough that stopping and staying
  // stopped are two different things -- a raid that reads the cast and holds
  // for one global is a raid that starts again inside the window.
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
  // The three the fight counts on a body rather than the party counting on
  // itself, and every one of them was missing.
  //
  // A missing entry is a cap of one, silently, so `stackAura` was refusing to
  // count past the first for all three -- and each of them has a written
  // number somewhere else in the codebase that has never once been reached.
  // The breath in is checked against three in `scheduleInhale` and never got
  // past one, so the breath out has always billed for a single lungful and
  // the doc comment describing what three does to an uninoculated raid was
  // describing something that could not happen. The swelling is documented as
  // lethal at ten and the tanks are told to swap at nine; it has been one
  // stack that never grew. The slight is meant to climb to a tank that cannot
  // hold anything.
  //
  // The numbers are read from the constants that name them rather than
  // written again here, so the two cannot drift apart the way they already
  // had.
  gorged: INHALE_MAX,
  swelling: BLOAT_BURST_AT,
  slighted: SLIGHT_MAX,
}


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
/**
 * Which mechanic a ticking aura belongs to.
 *
 * Only the fight's own. A rogue's rupture is a rogue's, and naming it here
 * would file the party's rotation under the boss's page.
 */
export const AURA_MECHANIC: Partial<Record<AuraId, MechanicId>> = {
  spiked: 'spike',
  reek: 'vilegas',
  haunted: 'shade',
  festering: 'fester',
  swallowed: 'gorge',
}

export const AURA_TICK: Partial<Record<AuraId, { damage?: number; heal?: number }>> = {
  // What being pinned costs while it lasts. Steady rather than sharp: the
  // demand is on everybody else's target list, and a spike that killed its
  // victim before a raid could plausibly turn round would be asking for a
  // reaction nobody has.
  // Climbing, because a flat tick is a bill and a climbing one is a clock.
  //
  // Flat at fifty-eight it cost eight hundred over a full pin, which every
  // healer covered without noticing and which measured at exactly zero points
  // of teaching — a mechanic whose answer is "somebody stop and break it" has
  // to get worse while nobody does. `rotBite` already does this for the rot
  // and the shape is borrowed from there.
  spiked: { damage: 34 },
  reek: { damage: 62 },
  // Flat rather than climbing, and it is the one dot here that should be.
  // What makes it urgent is not that it gets worse -- it is that every tick
  // of it is money in the boss's bar, so the cost of being slow is paid by
  // the raid twenty seconds later rather than by the body wearing it now.
  //
  // Ninety a second for twelve seconds is the same eleven hundred the spec
  // asks for in six ticks of a hundred and eighty; the engine ticks auras
  // once a second, and a bill split finer is the same bill.
  festering: { damage: 90 },
  // What being inside it costs, which is steep and is not the point. The
  // point is the four seconds the raid spends without whoever was holding
  // the boss, and this is only what makes those seconds a real loss rather
  // than a free breather for the body that was tanking.
  swallowed: { damage: 550 },
  haunted: { damage: 74 },
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
  // Less of it for every slight on the body making it.
  //
  // Taken off what is being generated rather than off what has been banked,
  // which is the difference between a clock and an accident. Struck off the
  // pile, one slight was enough to hand the boss to the other tank on the
  // spot -- so the count never reached two, the swap happened every time it
  // landed, and nobody chose anything. Taken off the rate, the tank wearing
  // them falls behind at a speed everybody can see, and the swap happens when
  // the raid decides it should rather than when the fight says so.
  //
  // At `SLIGHT_MAX` it is exactly nothing, which is the original's shape: a
  // tank that has been told often enough that it does not matter stops being
  // able to hold anything at all.
  const slighted = threatOf(s, actorId)
  s.threat[actorId] = (s.threat[actorId] ?? 0) + amount * slighted
}

/** What a body's slights leave of the threat it makes. See `addThreat`. */
function threatOf(s: SimState, actorId: number): number {
  for (const a of s.actors) {
    if (a.id !== actorId) continue
    const stacks = getAura(a, 'slighted')?.stacks ?? 0
    return stacks === 0 ? 1 : Math.max(0, 1 - stacks * SLIGHT_SHARE)
  }
  return 1
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
    // A body inside the boss is not holding it. This is the whole cost of the
    // swallowing: whoever was first on the list is gone for four seconds, so
    // the boss turns to whoever is second, and if nobody has been building
    // anything that is a healer.
    if (getAura(a, 'swallowed')) continue
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

/**
 * Holds a body inside its room, or drops it out of the fight.
 *
 * Every step in this game used to end with the same line: put the body back
 * inside the arena. That is what a wall is, and three of the rooms this game
 * is being given do not have one — the floor ends and there is air under it.
 *
 * Two rules, and the second is why this is a function rather than a branch at
 * each of the six places that move a body:
 *
 *   a room with a wall     the step is clamped, exactly as it always was
 *   a room with an outside a body whose middle has left the floor falls
 *
 * The middle rather than the edge of the body, because "you stepped off" is a
 * sentence a player can read off the screen and "your radius crossed the line"
 * is not.
 *
 * The boss never falls. It is the thing the whole room is arranged around, and
 * a fight that can end by its own boss wandering over the side is a fight with
 * a bug in it rather than a mechanic.
 */
export function holdOrFall(s: SimState, actor: Actor): void {
  if (!roomHasOutside(s.room) || actor.id === BOSS_ID) {
    pushInside(s.room, actor.pos, actor.radius)
    return
  }
  if (wallGap(s.room, actor.pos) >= 0) return
  fall(s, actor)
}

/**
 * What the outside costs, which is everything.
 *
 * Not a large hit: a death. `mechanic-rules.md` rule 1 is that failure is
 * binary at a single moment, and a fall that took a share of a health bar
 * would be the proportional damage that rule was written against — it would
 * average out, and a raid would learn nothing from the third time it happened.
 *
 * Dealt as damage rather than by setting the flag, so that everything that
 * happens when a body goes down happens: the pin it was holding lets go, the
 * report gets a time of death, the sound plays.
 */
export function fall(s: SimState, actor: Actor): void {
  if (!actor.alive) return
  pushText(s, actor.pos, 'FELL', 'crit')
  // Laid on the rim rather than left where it went over. What is drawn after a
  // death is a body on the floor, and a body drawn in the air outside the
  // floor is a rendering bug that reads as one; the rim is where the raid
  // watched it go, which is the same information.
  pushInside(s.room, actor.pos, actor.radius)
  applyDamage(s, actor, actor.maxHp * 10, 'magic', { silent: true })
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

  // And nothing reaches a body the boss has swallowed, except the thing that
  // swallowed it.
  //
  // It is inside the boss: no floor is under it, no wave can walk to it and no
  // healer can see it. `silent` is what tells the two apart -- the wound the
  // gorging itself ticks is applied that way, like every other aura tick, and
  // everything else in the fight is not.
  if (getAura(target, 'swallowed') && !opts.silent) return

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
    final *= 1 - mitigation(target.armor)
  }
  // Carrying their flag makes you easier to bring down, whatever hit you.
  // Outside a battleground this is never true.
  if (carrying(s, target)) final *= CARRIER_FRAGILITY

  final *= tankTrait(s, target, school)

  // What the fight is holding, it holds on to. See `TURNED_GUARD`: this is the
  // window the raid gets to notice whose body it is aiming at, and without it
  // the answer arrives after the funeral.
  if (getAura(target, 'turned') && steered(s, opts.sourceId)) final *= 1 - TURNED_GUARD

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
    // And it grows, which it did not used to.
    //
    // It was put in for a pull that would not end — a twenty-five man still
    // going at five minutes, boss at forty percent, two people standing — and
    // that pull had nothing to do with the enrage. A summon had been handed
    // `BOSS_ID` by the shared id counter and inherited the boss's
    // untouchability with it; see `FIRST_OBJECT_ID`. Fixed there, the same
    // seed wipes at 231 seconds with this ramp and without it.
    //
    // Kept anyway, and worth saying why rather than quietly leaving it in. A
    // flat doubling is a wall a raid either gets through or dies to, unless it
    // is neither, and "neither" is a pull that runs forever — which this game
    // has now produced once, from a cause nobody predicted. This is the floor
    // that says it cannot happen twice, whatever the reason. It is inert on
    // every pull anybody plays: pulls resolve around 110 to 135 seconds and
    // the enrage is at 233.
    //
    // Flat for the first half minute and doubling every half minute after.
    //
    // The grace is what makes this safe to add. A pull that is going to end
    // ends within a few seconds of the enrage, and every one of those sees the
    // number the fight was tuned with, unchanged. Ramping from the first
    // second instead would have quietly made the last ten seconds of every
    // close pull twenty percent worse, which is a balance change wearing a
    // bug fix's clothes.
    // A corridor has no boss to be enraged, and asking for one there is how
    // the walk between two rooms found this line.
    const enraged =
      target.faction === 'party' && s.mode === 'raid' && getAura(boss(s), 'enrage')
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


  record(s, target, final, opts)
  // Only the player's own hits are audible; everyone's would be a wall of noise.
  if (target.isPlayer && final > 0 && !opts.silent) s.sounds.push('hit')

  if (target.hp <= 0) {
    // Read before the auras are cleared, because clearing them is what used to
    // lose it.
    const held = target.auras.find((au) => au.id === 'spiked')
    target.alive = false
    target.castId = null
    target.auras.length = 0
    // A spike broken lets go of whoever it was holding. Here rather than in
    // the mechanic's own file because this is where a thing stops standing,
    // and a pin that outlived the spike would be a body held by nothing.
    if (target.spawn === 'spike') {
      for (const a of s.actors) {
        const held = a.auras.find((au) => au.id === 'spiked' && au.sourceId === target.id)
        if (held) a.auras = a.auras.filter((au) => au !== held)
      }
    }
    // And the other way round, which is the half that was missing.
    //
    // A death clears every aura on the body, so a victim who died while pinned
    // took the pin with them and left the spike standing over a corpse —
    // holding nobody, killable by nothing that mattered, and still top of the
    // raid's target list. Measured on the first boss, ten of them were up at
    // five minutes with one person pinned, and the raid had spent the pull
    // hitting furniture: the boss was at 28% and the fight never ended.
    if (target.faction === 'party' && held) {
      const spike = s.actors.find((a) => a.id === held.sourceId && a.spawn === 'spike')
      if (spike) spike.alive = false
    }
    // The gorged one is paid for a body it marked, wherever and however that
    // body died. This is the fight's failure state and it is deliberately not
    // a damage number: what the raid loses is the attempt, because the enrage
    // clock stops meaning what it meant.
    if (getAura(target, 'championed') && s.mode === 'raid') {
      const b = boss(s)
      if (b && b.alive) {
        b.hp = Math.min(b.maxHp, b.hp + b.maxHp * CHAMPION_HEAL)
        pushText(s, b.pos, 'GORGED', 'crit')
        s.sounds.push('raid')
      }
    }
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
    // Not one of your own that the fight has taken. It is still in the party
    // frames and still counts for the win, and it is not a patient: a healer
    // topping up the thing swinging at the raid is the deadlock version of
    // this mechanic, where the dealers cannot finish it and the healing that
    // would have kept somebody else alive goes into it instead. Stopping
    // relying on them starts here.
    if (getAura(a, 'turned')) continue
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
  // Nor can a heal reach one. The four seconds are the mechanic: a healer who
  // spends them on the body inside the boss is a healer who has spent them on
  // nothing, and the raid is meant to spend them on whoever is holding the
  // boss instead.
  if (getAura(target, 'swallowed')) return
  const before = target.hp
  // The day's twist, applied where every heal passes rather than at each of
  // the dozen places one is cast. `HEALTH` rides along for the same reason:
  // a heal is a fraction of a bar, so it is worth whatever a bar is worth.
  amount *= HEALTH
  target.hp = Math.min(target.maxHp, target.hp + amount * affixHealing(s.affix) * s.healing)
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
 * boss `mechanicDamage` and no size weight. So the Choir's signature
 * mechanic ignored the Choir's own dial: turning that dial from 1.35 to 3.0
 * moved its twenty-five man rungs and left its five and ten exactly where
 * they were, because those two rungs are a spread and a rot and the rot is
 * unavoidable.
 *
 * A funnel with something outside it is not a funnel. Both of them read this.
 */
export function fightScale(s: SimState): number {
  return DIFFICULTIES[s.difficulty].damage * sizeScale(s)
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
 * What a pin costs on the tick it is paid, which climbs the longer it holds.
 *
 * The same shape as the rot's and for a sharper reason. This one's answer is
 * somebody else stopping what they were doing, and a bill that is the same on
 * the tenth second as on the first gives them no reason to hurry: flat at
 * fifty-eight it cost eight hundred over a full pin, which the healers covered
 * without noticing and which measured at exactly zero points of teaching. It
 * ends at three times where it starts, so a raid that ignores one loses the
 * body and a raid that turns immediately barely pays.
 */
export function spikeBite(aura: Aura, base: number): number {
  const spent = 1 - Math.max(0, aura.remaining) / AURA_DURATION.spiked
  return base * (1 + SPIKE_RAMP * spent)
}

/** How much steeper a pin gets by the end of it. See `spikeBite`. */
const SPIKE_RAMP = 2

/** Everything a spread debuff hits when it expires on someone. */

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
export const PROJECTILE_SPEED: Record<ProjectileKind, number> = {
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
 * A bolt naming a real ability carries it and resolves it on arrival. One
 * naming anything else is scenery, which is what a hunter's auto shot is and
 * what every one of a boss's is — the weapon, or the mechanic, has already
 * dealt its damage where it stands.
 *
 * Either way it remembers what threw it, because the picture needs that even
 * when the simulation does not: a shot leaves the chest of whatever loosed it,
 * and a boss's chest is three times the height of a raider's.
 */
export function spawnBolt(
  s: SimState,
  from: Actor,
  targetId: number,
  kind: ProjectileKind,
  abilityId: string | null = null,
  sourceId: number | null = from.id,
  /**
   * Overridden only where the kind's own speed is the wrong answer.
   *
   * A raider's bolt crosses a gap that is most of the arena and the speed is
   * about how the shot feels. A boss's crosses whatever gap the raid happens
   * to be standing at, and at the range most of them stand the kind's speed
   * puts the whole flight inside a fifth of a second. See `throwBolt`.
   */
  speed: number = PROJECTILE_SPEED[kind],
): void {

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
  // A turned mind hits harder than it did a second ago, and that is the whole
  // danger of the mechanic. Borrowing a body and handing it back weakened
  // would be a headcount problem; borrowing the best thing the raid has and
  // pointing it at them is a different question, and it is the one being
  // asked. It rides the same multiplier as the raid's own press because it is
  // the same idea with the sign flipped.
  const rally = getAura(actor, 'urgency') ? 1.3 : 1
  return getAura(actor, 'turned') ? rally * TURNED_POWER : rally
}

/** What the fight gets out of a body it has taken. See `urgencyOf`. */
const TURNED_POWER = 1.3

export function hasteOf(actor: Actor): number {
  return getAura(actor, 'sprint') ? 1.5 : 1
}
