import type { ClassId, DifficultyId, Pick, SpecId } from './classes'
import type { AffixId } from './affix'
import type { MechanicId } from './encounters'
import type { RoomShape } from './room'
import type { TravelState } from './travel'

export type Role = 'tank' | 'healer' | 'dps'
export type Faction = 'party' | 'boss'

export interface Vec2 {
  x: number
  y: number
}

export type AuraId =
  // One damage-over-time per class, so five dealers can each keep their own
  // on the boss without overwriting one another.
  | 'living_bomb'
  | 'serpent_sting'
  | 'rupture'
  | 'flame_shock'
  | 'moonfire'
  | 'rend'
  | 'rake'
  | 'judgement'
  | 'shadow_word_pain'
  | 'immolate'
  | 'renew'
  | 'rejuvenation'
  | 'riptide' // heal over time on a party member
  | 'combo' // rogue and cat: builds on the filler, spent by the finisher
  | 'momentum' // mage: stacks while it stands and casts, gone the moment it moves
  | 'eclipse' // balance druid: the window a finisher opens for its filler
  | 'pact' // warlock: the window it bought with its own health
  // The two a raid cooldown leaves on everybody. Named for what they are
  // rather than for the class that called them, because more than one class
  // brings each and a raid should not be able to stack two of the same thing
  // by bringing two of the classes.
  | 'rally' // less off every unavoidable hit, for a few seconds
  | 'renewal' // a heal on everybody, ticking
  | 'urgency' // everything the raid throws hits harder, briefly
  | 'sprint' // leather melee: brief, expensive speed, for getting out and back
  | 'ward' // priest: damage taken down, applied before the damage arrives
  | 'mending' // druid tank: a slice of what it just took, given back over time
  | 'shield' // damage reduction on the tank
  | 'brace' // the lesser one everybody else carries
  | 'beacon' // heal over time on a party member
  /**
   * Pinned by a spike, which is the one thing in this game that takes a body's
   * feet away.
   *
   * Everything else the floor does is answered by walking. This is answered by
   * somebody else: the person wearing it cannot leave, so the raid has to stop
   * hitting the boss and break the thing holding them. `sourceId` is the
   * spike, so freeing them is a fact about the field rather than a timer.
   */
  | 'spiked'
  /** boss: how much of the room's air it has taken, and how hard it now hits. */
  | 'gorged'
  /**
   * The mark the gorged one's gauge buys, and the only aura here that stays.
   *
   * Every other one is a thing to survive; this is a thing to carry. It splits
   * the boss's hands onto whoever wears it wherever they are standing, and
   * pays the boss five percent of its health if they go down.
   */
  | 'championed'
  /**
   * Blood on a body, six seconds from going off.
   *
   * The carrier cannot dodge it -- it is judged where they are standing when
   * the count ends, so what they can do is be standing somewhere nobody else
   * is. Everyone it catches past the first is a deposit in the gauge, which is
   * the only reason a raid that could simply heal through it does not.
   */
  | 'spilling'
  /**
   * A wound that is filling the gauge while nobody closes it.
   *
   * The one dot in this game that must not be ridden out. It comes off when
   * the body wearing it is taken back above a line, so it is answered early or
   * it is not answered -- a healer who waits for it to be dangerous has
   * already paid every tick of it.
   */
  | 'festering'
  /**
   * Inside the boss, which is the one place in this game that is not the room.
   *
   * A body that is swallowed does nothing, takes nothing from anybody but the
   * thing it is inside, and cannot be reached by a healer. What it costs is
   * not the damage: it is that the raid's front rank is gone for four seconds,
   * and somebody else has to be standing there when the boss looks up.
   */
  | 'swallowed'
  /**
   * Carrying something that will be a body when it stops.
   *
   * The one dot in this game whose expiry is a *place*. What it costs while it
   * runs is small and refuses a third of the healing that lands on it; what it
   * costs when it ends is a small hostile thing standing exactly where the
   * body wearing it was. Both halves of the answer are decisions -- the
   * carrier picks the place, and the healer picks the moment.
   */
  | 'infected'
  /**
   * What the boss has eaten, on whoever is holding it.
   *
   * A tank swap made of the dealers' mistake: every small thing nobody cleared
   * is one the boss swallows, and the count is paid by the tank rather than by
   * the people who left it there.
   */
  | 'engulfed'
  /**
   * Standing in something that has spread, and slowed by it.
   *
   * Refreshed every tick by the floor rather than applied once, so it goes the
   * moment the body leaves. It costs no health at all: what it costs is that
   * fixing a geometry late is slower than fixing it early, which is the only
   * thing the flood is for.
   */
  | 'mired'
  /**
   * Being followed by something that cannot be killed.
   *
   * The one demand in this game answered by walking and only by walking, for
   * twenty-two seconds, by one named body. What makes it more than a chore is
   * that the gathering lands on whoever is wearing it -- so the person who has
   * to keep moving is also the point everybody else has to reach.
   */
  | 'hounded'
  /**
   * What the boss has drunk, on whoever is holding it.
   *
   * A public count with a swap in it: the seventh is a hit nobody survives
   * standing next to, and the sixth is where the other tank takes over.
   */
  | 'dosed'
  /**
   * The one of the three that is real, this minute.
   *
   * Everything without it takes no damage at all -- not reduced, none -- which
   * is the only version of this that asks a question. A ninety percent cut is
   * answered by carrying on and losing a tenth; nothing at all is answered by
   * looking up.
   */
  | 'crowned'
  /** Being drunk from by one of the two that cannot be hurt. */
  | 'drained'
  /** Holding a grain, which is worth most of the drinking. */
  | 'carrying'
  /**
   * Bound: every second spent walking costs more than the one before it.
   *
   * The only demand in this game answered by standing still, and it does not
   * ask for stillness -- the fight is still throwing things that have to be
   * left. It asks which steps are worth paying for.
   */
  | 'bound'
  /**
   * Holding the gift, which is the one thing a fight has ever handed anybody
   * that they want.
   *
   * It makes the body stronger while it lasts and it does not come off by
   * being survived: it comes off by being *given away*, and giving it away
   * leaves both bodies holding one.
   */
  | 'gifted'
  /**
   * The ten seconds after a gift runs out, in which it is a warning.
   *
   * The holder and the raid both know that this body is the problem now. What
   * ends it is touching somebody who has never held one; what ends it badly is
   * nothing, and then the body turns.
   */
  | 'souring'
  /**
   * Bound to somebody, and the two of you pay for the distance between you.
   *
   * The only aura in this game that is about a length. `bearer` is the other
   * end of it.
   */
  | 'bonded'
  /**
   * Off the floor, and out of reach of everything.
   *
   * The storm is the closest thing this game has and it is not close: a
   * storming boss has let go of the tank and is walking, and it can still be
   * hit. This one cannot be hit at all.
   */
  | 'aloft'
  /**
   * One of the wave that came to help rather than to bite.
   *
   * The only body on a boss's side in this game that must not be killed, and
   * it is not weak: what it asks is that a raid look before it swings, which
   * is a decision rather than an accident waiting to happen.
   */
  | 'kindred'
  /**
   * Stepped out of the fight, and back in five seconds.
   *
   * Not dead and not hidden: gone. It answers nothing, takes nothing and is
   * healed by nobody, which is the only price in this game paid in existence
   * rather than in health.
   */
  | 'away'
  /** Came back from the way out, and heals for more because of it. */
  | 'carried'
  /**
   * boss: it has let go and is wandering, billing whoever it passes.
   *
   * The only aura in the game that takes the boss out of the fight's usual
   * shape rather than putting something on a body. While it is up there is no
   * tank and no front, and every rule about standing behind the thing is
   * suspended along with the thing.
   */
  | 'storming'
  /** Threat generation cut, on whoever is holding the boss. */
  | 'slighted'
  /** A summon that came back wrong, and is worth killing first. */
  | 'empowered'
  /**
   * Turned against the raid, briefly and dangerously.
   *
   * The only aura here that changes whose side a body is on. What makes it
   * dangerous is that it also makes them better at it: the fight does not
   * borrow a weak body, it borrows a good one and hands it back afterwards.
   */
  | 'turned'
  /** Followed by a shade, which is answered by not standing still. */
  | 'haunted'
  /** Marked with a spore, which bursts on whoever came to stand with them. */
  | 'spore'
  /**
   * Protected against the breath out, by having stood in a spore when it went.
   *
   * The only aura in this game that is bought before it is needed. Everything
   * else the fight applies is a problem to solve now; this is a problem solved
   * forty seconds early, which is why the mechanic that grants it and the one
   * it answers are linked rather than sold apart.
   */
  | 'inoculated'
  /** A rot that spreads to whoever is standing near the one wearing it. */
  | 'reek'
  /** Stacking on whoever holds the boss, and lethal at ten. */
  | 'swelling'
  /**
   * What a swing into the cold costs, stacking on whoever threw it.
   *
   * The only mark in this game applied by what a body *did* rather than by
   * what was done to it, and it is deliberately unanswerable: it is the rent
   * on a melee place, paid to the healers, and a rent with an answer is not a
   * rent. It is at the bottom of its ladder for the same reason.
   */
  | 'chilled'
  /**
   * Fifteen seconds in which every cast started is a debt, paid all at once.
   *
   * `stacks` is the debt. The answer is to press nothing at all, which is the
   * one answer this game has never asked for -- everything else is answered
   * by standing somewhere else, and standing somewhere else is free while a
   * rotation runs.
   */
  | 'unstable'
  /** Three seconds where the feet do not work, after the band falls in. */
  | 'rooted'
  /**
   * Stacking magic vulnerability for standing anywhere near the boss.
   *
   * Nine percent a stack and no ceiling. It comes off outside the reach and
   * more slowly than it goes on, so what it prices is not a mistake, it is
   * the decision to stay -- and the raid that is winning is the raid that
   * most wants to.
   */
  | 'buffeted'
  | 'enrage' // boss damage amplifier

export interface Aura {
  id: AuraId
  remaining: number
  duration: number
  stacks: number
  /** Actor that applied the aura. */
  sourceId: number
  /** Where it was applied, for auras that remember the spot. */
  at?: Vec2
  /**
   * Everyone this aura has already sat on, for the one that changes hands.
   *
   * The burden is the only thing here whose answer is another person, and
   * without a memory the answer is the same person twice: two bodies standing
   * together pass it back and forth without either of them walking anywhere,
   * which is not a handoff, it is a formality. Kept on the aura rather than on
   * the state because the chain belongs to the weight, not to the fight, and
   * several of them are alive at once.
   */
  held?: number[]
  /**
   * The body this aura has named.
   *
   * Two mechanics name one, and they name it for opposite reasons: the yoke
   * names who has to come and stand with the carrier, and the storm names who
   * it is coming for. What they share is the rule below, which is the reason
   * the field exists at all.
   *
   * Written down when the yoke lands and never recomputed, which took a round
   * to learn. The first version asked "who is furthest from the carrier right
   * now" every tick, and the answer changed as soon as the bearer started
   * walking: two steps in it was no longer the furthest, the name moved to
   * somebody on the other side of the raid, and that one set off too. Nobody
   * ever arrived — thirty-two yokes in a pull and every single one of them
   * resolved with the carrier standing alone.
   *
   * A mechanic that names somebody has to keep naming the same somebody, or it
   * has not named anybody.
   */
  bearer?: number
  /**
   * Everyone who landed a hit on this, for the one that gives it back.
   *
   * The mirror bills at the instant it breaks rather than as the hits go in,
   * so it has to remember who put something in. Ids rather than a count: what
   * it owes is one bill each, not one bill per hit, and paying per hit would
   * make it proportional damage — which is the shape that averages skill out.
   */
  struck?: number[]
  /** Accumulator for periodic ticks. */
  tickTimer: number
  /**
   * A count the mechanic owns, where `tickTimer` belongs to the aura system.
   *
   * `tickTimer` is not free to borrow. `updateTimers` adds to it every frame
   * and drains it back under one every second, so anything measuring a longer
   * beat on it waits for a number that cannot arrive. The storm's re-pick was
   * written on it and fired exactly never: one charge, at a coordinate frozen
   * when the storm began, and then twenty-two seconds of a boss standing on
   * an empty spot while the raid it had already passed through watched.
   */
  beat?: number
}

/**
 * How an AI party member deviates from optimal play.
 *
 * A perfect bot reads as a robot. These knobs are what make it read as a
 * person: it notices danger late, occasionally blows a cooldown, and drifts
 * toward the rest of the group instead of standing on the mathematically
 * ideal tile.
 */
export type Personality = 'steady' | 'greedy' | 'timid'

export interface AiProfile {
  personality: Personality
  /** Base seconds between danger appearing and the AI starting to react. */
  reactionDelay: number
  /** Probability of fumbling any given reaction. */
  mistakeChance: number
  /** How strongly it drifts toward the party centroid when picking a spot. */
  clustering: number

  // --- runtime state ---
  /** Counts down before a spotted danger is acted upon. */
  reactionTimer: number
  /** Danger currently being reacted to, so reaction time is not re-rolled. */
  reactingTo: string | null
  /** Set when a mistake roll failed; the AI reacts late or not at all. */
  fumbled: boolean
  /** Where the AI currently wants to stand. */
  moveTarget: Vec2 | null
  /** Cooldown on chat lines so it does not spam. */
  chatCooldown: number

  // --- the healer's own reaction, kept apart from the one above -------------
  //
  // Every other mechanic in the game is answered by walking, so one timer was
  // enough: notice, wait, move. A judgement is answered by casting, and the
  // two cannot share a slot — a healer that has "reacted" to a mark by
  // clearing its move timer would then be told to stand somewhere, which is
  // the opposite of what answering it takes.
  /** Counts down before a pending judgement is acted upon. */
  callTimer: number
  /** The judgement currently being reacted to, so the delay is rolled once. */
  callTo: string | null
  /** Who this healer has decided to save, once the delay above has run out. */
  answering: number | null

  // --- and the one about what to hit, kept apart from both -----------------
  //
  // A third channel for the same reason there is a second. Deciding what to
  // hit is not deciding where to stand: an actor that spent its danger slot
  // on a target call would then be sent to find a safe tile, and one that
  // spent its healer slot on it would stop answering judgements. The three
  // are answered at the same time in a real pull and so they are kept apart
  // here.
  /** Counts down before a change of target is acted upon. */
  switchTimer: number
  /** The call currently being reacted to, so the delay is rolled once. */
  switchTo: string | null
  /** The call this one has actually adopted, once the delay has run out. */
  striking: string | null

  // --- and the one about a single instant, kept apart from all three -------
  //
  // A fourth, for the fourth kind of answer: not where to stand, not who to
  // heal, not what to hit, but what to be doing at one particular tick --
  // nothing, or a turn, or one press. It cannot borrow any of the others. The
  // walking slot would send a body that has decided to stand still off to
  // find a tile; the target slot already holds a demand that lasts a window,
  // and these resolve on an instant and then let go.
  /** Counts down before an instant's demand is acted upon. */
  beatTimer: number
  /** The demand currently being reacted to, so the delay is rolled once. */
  beatTo: string | null
  /** The demand this one has actually adopted, once the delay has run out. */
  keeping: string | null
}

export interface Actor {
  id: number
  name: string
  classId: ClassId
  /** Which of the class's specs, since one class can fill a role two ways. */
  spec: SpecId
  role: Role
  /** Melee classes must close to the boss to use anything. */
  melee: boolean
  /** Flat armour rating; run through the mitigation curve on every boss hit. */
  armor: number
  /** Flat reduction applied before mitigation, for shield carriers. */
  block: number
  faction: Faction

  pos: Vec2
  /** Position at the previous tick, used for render interpolation. */
  prevPos: Vec2
  radius: number
  moveSpeed: number

  hp: number
  maxHp: number
  /** What this actor spends to act. */
  resource: ResourceId
  power: number
  maxPower: number
  alive: boolean

  /** Global cooldown remaining. */
  gcd: number
  cooldowns: Record<string, number>
  auras: Aura[]

  castId: string | null
  castRemaining: number
  castTotal: number
  castTargetId: number | null

  isPlayer: boolean
  ai: AiProfile | null

  /** Autoattack timer (boss and AI melee). */
  swingTimer: number

  /**
   * Which way this one is turned, in radians.
   *
   * The boss has had a bearing since there was a cone to get behind; the
   * party never did, because nothing had ever asked. Everything the party
   * answers is answered by being somewhere, and where a body is does not
   * depend on which way it is pointing.
   *
   * It is drawn rather than tested: a body faces what it is working on, and
   * a raid all pointing one way regardless of what any of them was doing read
   * as a row of cardboard from above. Nothing decides a mechanic by it today.
   */
  facing: number

  /**
   * What kind of thing this is, for the two that are not thralls.
   *
   * Absent means a thrall or a stalker, which is every summon that came
   * before these and every summon the party's own rules already understand:
   * it walks in and it hits somebody, so a rotation aimed at whatever is
   * hurting the raid is already aimed at it.
   *
   * The two named here break that rule in opposite directions, which is why
   * they need a name at all. One hurts nobody and has to be killed anyway;
   * the other hurts somebody and must not be killed. Neither can be read off
   * a health bar, and both are the whole demand.
   *
   * The third is a beast, and what makes it its own kind is not what it does
   * to whoever it reaches but who that is: it has picked somebody rather than
   * walked at whoever was closest, and every hit it lands is a deposit in a
   * gauge. A wave that goes for the nearest body dies where the damage already
   * is, which is a wave nobody had to answer.
   */
  spawn?: 'herald' | 'spike' | 'beast' | 'ooze' | 'crown' | 'ballast' | 'kin' | 'ward'

  /**
   * The body a beast has picked, which is the whole of what makes it one.
   *
   * Absent on everything else in the game: a thrall walks at whoever is
   * nearest, which is a rule the raid answers by standing somewhere else. A
   * beast answers by walking after somebody, and the somebody is chosen when
   * it arrives rather than recomputed -- a wave that re-picked every tick
   * would be a wave that always ends up on the melee, which is a wave nobody
   * had to do anything about.
   *
   * It is not a stalker: when the body it chose goes down it does not go with
   * them, it carries on with whoever is nearest, because it is an ordinary
   * thrall that happens to have chosen.
   */
  quarry?: number

  /**
   * How many other small things this one has taken in.
   *
   * Only an ooze has it, and it is the whole of what makes that mechanic a
   * mechanic rather than a wave: two of them that touch become one that is
   * worth what both were, and the fifth is not a body any more -- it is an
   * event with a radius. Drawn on it as a number, because a raid answering a
   * count it can read is a raid making a decision and one judging a size is a
   * raid guessing.
   */
  eaten?: number

  /**
   * How far above the floor this is, for the one thing in the game that has a
   * height.
   *
   * Only a ballast has it. Nothing else in this fight or any other is anywhere
   * but on the ground, and the reason this one is not is the mechanic: it
   * comes down on a clock, damage sends it back up, and what it costs is
   * reaching the floor. Drawn as the size and darkness of its shadow, which is
   * the only way this camera can say height at all.
   */
  height?: number

  /**
   * How long this body has spent moving while bound, in seconds.
   *
   * Kept on the body rather than on the aura because it is a fact about what
   * the person did, and the aura is a fact about what the fight asked.
   */
  walked?: number

  /**
   * Seconds toward the cold's next turn, in or out of the boss's reach.
   *
   * One accumulator for both directions, since a body is only ever doing one
   * of them: it counts up to the phase's interval while inside the reach and
   * to the shedding interval while outside it, and is reset each time it
   * turns. Kept here rather than on the aura because a body outside the reach
   * with no stacks left still has to be counting -- an aura that has been
   * cleared cannot count anything.
   */
  chill?: number
}

export type GroundKind =
  // A line of patches lit one after the next, outward from the boss. Circles,
  // like the pool, because the shape a person answers is one patch at a time
  // and a line is what the sequence of them looks like from above.
  | 'coldflame'
  // A patch that is simply bad to stand in, and stays.
  | 'decay'
  // A cone off the big arm, drawn on the floor for the whole cast and gone
  // the instant it lands. The only shape here that is not a circle.
  | 'spray'
  // Ground that spreads from the boss and hurts nobody. What it takes is
  // speed, from the raid and from the fight's own bodies alike.
  | 'flood'
  // A broken flask: a large hit where it lands, and floor that stays long
  // enough to decide where the rest of the fight can happen.
  | 'caustic'
  // The circle everybody has to be inside, which is drawn shrinking rather
  // than growing because what it says is "come here" rather than "leave".
  | 'gather'
  // The sludgeworks rising. Patches along an arc of the wall, never in the
  // middle, and it belongs to the room rather than to the thing in it.
  | 'slime'
  // Blood left where a gift was doubled: the one piece of ground in this game
  // that the raid puts there itself.
  | 'stain'
  // The wound on the thing in the middle, which is closed by standing in it.
  | 'bleed'
  // A way out of the fight, for five seconds, for anybody who chooses it.
  | 'portal'
  // A grain to be picked up, which is the only piece of ground in this game
  // that is worth standing on.
  | 'nucleus'
  // A flask on the floor with a long count on it. The only piece of ground in
  // this game that is a *thing* rather than a hazard, and the only one whose
  // count stops while somebody is standing on it.
  | 'decant'
  // The band round the boss that everything has just been dragged into. One
  // object for all three stages of it: it drags while its count is long and
  // it is a plain telegraph once the count is short.
  | 'haul'
  // The room going white, with the shadow behind each coffin left dark. The
  // only ground here whose *safe* set is what is drawn: `spots` carries the
  // coffins, and which side of each one is shelter is worked out from where
  // the boss is standing rather than stored.
  | 'cover'

export interface GroundEffect {
  id: number
  kind: GroundKind
  pos: Vec2
  radius: number
  /** Seconds left before it detonates; <= 0 means it already went off. */
  telegraph: number
  /** Seconds the danger zone lingers after detonation. */
  lingering: number
  damage: number
  detonated: boolean

  /** breath: centre bearing in radians, and half-width of the cone. */
  angle: number
  halfWidth: number
  /** shockwave: expansion speed and the thickness of the lethal band. */
  growth: number
  band: number
  /** shockwave: ids already caught, so the ring hits each actor once. */
  caught: number[]
  /**
   * hand: how far the wedge turns between one pulse and the next, in radians.
   *
   * Signed, because which way it is going is the whole question the mechanic
   * asks: the floor it has just left is the floor that is about to be safe.
   */
  turn: number
  /** hand: pulses left before the sweep is finished with the arena. */
  pulses: number
  /**
   * shallows: the ground that is still ground when the rest of it goes.
   *
   * The only mechanic here whose safe set is a list rather than a shape, so
   * it is the only one that needs somewhere to keep it. `radius` is one
   * patch's, since what the mechanic condemns is everything else.
   */
  spots?: Vec2[]

  /**
   * schism: how many groups the raid is being cut into.
   *
   * The bearing of the first muster point is `angle` and the rest are spaced
   * evenly round from it, so the whole arrangement is two numbers rather than
   * a list of places.
   */
  sides?: number
  /**
   * toll: the body the raid nominated to go and pay it.
   *
   * Written down when the plate is laid and never asked again, for the reason
   * the yoke's bearer is. "Whoever can best afford this" is a question whose
   * answer moves every time anybody takes a hit, and a nomination that moves
   * is a raid where two people set off, one of them turns round halfway, and
   * the plate is unpaid at the count. The choice is made once, out loud, and
   * then it is that person's to walk.
   */
  named?: number

  /**
   * Whether somebody is standing on this and holding its count.
   *
   * Only a flask has it, and only the picture reads it: a count that has
   * stopped and a count that is running look identical otherwise, and which of
   * the two it is decides whether anybody has to do anything about it. Written
   * by the floor rather than derived in the renderer, so the two cannot
   * disagree about what the fight is doing.
   */
  held?: boolean
}

/**
 * Visual class of a bolt, derived from what the ability is rather than from
 * its name. Keying this off ability ids meant that renaming the spell list
 * silently switched the projectiles off for everything but one heal.
 */
export type ProjectileKind = 'bolt' | 'dot' | 'heavy' | 'heal'

/**
 * Purely cosmetic, but simulated rather than animated.
 *
 * Damage still resolves the instant the ability does; the bolt is a tell, not
 * a mechanic. It lives in sim state so replays and any future server-side
 * verification stay identical frame for frame.
 */
export interface Projectile {
  id: number
  kind: ProjectileKind
  /** What threw it, so the renderer can colour it like its own icon. */
  abilityId: string | null
  /**
   * What threw it. Null only where nothing did.
   *
   * This used to mean two things at once -- who threw it, and whether the bolt
   * carries its ability to be resolved on arrival -- and the second meaning
   * was the one being read. So anything drawn after the fact had to claim
   * nothing threw it, and the renderer, which needs the thrower to know what
   * height the shot leaves at, was told a boss's bolt came from nowhere and
   * flew it out of a raider's chest. Carrying is decided by whether the
   * `abilityId` names a real ability now; this says where it came from.
   */
  sourceId: number | null
  pos: Vec2
  prevPos: Vec2
  targetId: number
  speed: number
  arrived: boolean
}

export interface FloatingText {
  id: number
  text: string
  pos: Vec2
  age: number
  /**
   * `damage` is what you dealt and `taken` is what landed on you.
   *
   * The same red for both meant the number that says how you are doing and
   * the number that says how you are being done to were the same picture.
   */
  kind: 'damage' | 'taken' | 'heal' | 'miss' | 'crit'
  /**
   * How big the hit was, for how big the number is drawn.
   *
   * A filler and a finisher differ by a factor of ten and used to be the same
   * twelve pixels, so the only way to tell them apart was to read them.
   */
  power: number
}

/**
 * Something worth drawing that has no state of its own.
 *
 * The same arrangement as `sounds`: the simulation says what happened and the
 * renderer decides what that looks like and for how long. Effects must not
 * live in the simulation — a pull has to replay identically from its seed,
 * and particles that aged inside the state would make that untrue.
 */
export type EffectKind = 'impact' | 'heal' | 'swing' | 'cast' | 'fizzle' | 'dash'

export interface EffectEvent {
  kind: EffectKind
  pos: Vec2
  /** Which way it is facing. Only a swing has one. */
  angle: number
  /** The ability behind it, for its colour. Null for a weapon. */
  abilityId: string | null
  /** How big the hit was, before mitigation. */
  power: number
  /** Worth drawing bigger, and worth a shove of the camera. */
  crit: boolean
  /**
   * How far the thing that caused this reached, in world units, or nought for
   * a hit on one body.
   *
   * A hit is worth a size read off its damage, and for a swing or a bolt that
   * is the whole story. A mechanic is not: a crush covering half the arena and
   * a spire the width of one body detonate with the same numbers on the same
   * frame, and the only difference between them is floor. Without this the
   * renderer had nothing to tell them apart, and the crush had to smuggle its
   * size through `power` — twelve times its own radius, so that the ring came
   * out big — which made the effect log report it as a hit ten times the size
   * of anything else in the game.
   */
  radius: number
  /**
   * The spec's own rule was paying when this landed — a spent bank of combo
   * points, a filler inside an eclipse, a swing with the rage bar near full.
   *
   * Without it the trait exists only in the numbers: a rogue's finisher at
   * five points deals double and looks exactly like one at zero.
   */
  empowered: boolean
}

export interface ChatLine {
  id: number
  speaker: string
  text: string
  age: number
}

/**
 * Per-actor totals for the after-action report.
 *
 * The simulation already knows all of this; without collecting it the player
 * finishes a pull knowing only whether it died, not whether they were the
 * reason.
 */
export interface Tally {
  damage: number
  healing: number
  /** Healing past full, which is the difference between busy and useful. */
  overhealing: number
  damageTaken: number
  /** Avoidable mechanics eaten: the number a raider actually argues about. */
  mechanicHits: number
  /**
   * The same count, split by which mechanic did it.
   *
   * The total says you ate five things and the split says four of them were
   * the same puddle, which is the difference between a bad night and a habit.
   * Written but never read by the simulation -- nothing in a fight may branch
   * on it, the same rule the awards keep.
   */
  byMechanic: Partial<Record<MechanicId, number>>
  deathAt: number | null
}

/**
 * Things worth hearing. Emitted by the simulation and drained by the renderer
 * each frame, so audio never has to guess at state changes by diffing.
 */
/**
 * What a class runs on.
 *
 * Mana is a budget for the whole fight and runs out. Energy and focus refill
 * on their own and are a pacing problem rather than an economy — you are
 * never short of them for long, only right now. Rage is neither: it starts at
 * nothing and is earned by hitting and being hit, so a warrior opens a pull
 * unable to do anything and a tank mid-fight can barely spend it fast enough.
 */
export type ResourceId = 'mana' | 'rage' | 'energy' | 'focus'

export type SoundEvent =
  | 'countdown'
  | 'pull'
  | 'telegraph'
  // Named for the mechanic it was written for, which is gone; the storm uses
  // it, and it is a sound rather than a mechanic.
  | 'shockwave'
  | 'raid'
  | 'hit'
  | 'heal'
  | 'cast'
  | 'blocked'
  | 'death'
  | 'phase'
  | 'victory'
  | 'wipe'

export type Outcome = 'ongoing' | 'victory' | 'wipe' | 'enrage' | 'defeat'

/**
 * What is being played.
 *
 * The two share everything below the rules: the same classes, the same damage
 * path, the same renderer. What differs is who is on the other side and what
 * ends it — a boss on a script, or five of the same classes you brought.
 */
/**
 * What kind of thing is being simulated.
 *
 * `travel` is the walk between two rooms of the citadel: the same bodies and
 * the same combat, with no boss, no script and no floor — see `sim/travel.ts`
 * for why that is a mode rather than a fight with an empty ladder.
 */
export type Mode = 'raid' | 'battleground' | 'travel'

export type Team = 'blue' | 'red'

export type BgKind = 'conquest' | 'flags' | 'escort'

/**
 * A thing that rolls forward while your side is near it and nobody else is.
 *
 * A capture point is somewhere to stand and a flag is something to carry; this
 * is neither. It moves on its own as long as you keep it company, so the fight
 * follows it rather than the other way round, and losing the fight for ten
 * seconds costs you ten seconds of ground rather than an objective.
 */
export interface BgCart {
  team: Team
  pos: Vec2
  /** 0 at its own base, 1 at the other one. */
  progress: number
  /** Both sides in reach: it stops rather than being fought over. */
  contested: boolean
  /** How many of the owning side are pushing right now, for the readout. */
  pushers: number
}

/** A capture point. Held by standing on it and nobody else standing on it. */
export interface BgNode {
  id: number
  /**
   * Seconds this point has been contested without a break.
   *
   * A defender should not turn round every time somebody clips the edge of the
   * circle, so the AI waits for this rather than for the flag itself.
   */
  contestedFor: number
  pos: Vec2
  radius: number
  /**
   * -1 is fully red, +1 fully blue, 0 neutral.
   *
   * A single number rather than an owner plus a timer, because taking a point
   * off the other team is the same act as taking a neutral one — it just
   * starts further away.
   */
  progress: number
  owner: Team | null
  /** Both teams standing on it; progress is frozen rather than fought over. */
  contested: boolean
}

/**
 * The one thing on a battleground's clock.
 *
 * A boss is a script: phases at known health, a telegraph before every hit, an
 * enrage at a known second, and the whole of learning one is learning when
 * things happen. A battleground had none of that — five people you cannot
 * predict, a scoring formula, and three hundred seconds in which every second
 * was the same as every other. The file that runs them says the rules have to
 * supply the shape the script used to; this is that shape.
 *
 * It arrives at a fixed fraction of the match, warns before it counts, and
 * lasts a fixed window. Both sides know where and when, which is what makes it
 * a decision rather than an event: everything you leave to come here is
 * something the other side can take while you do.
 *
 * It sits on the perpendicular bisector of the two bases — always x = 0, never
 * the centre — so it is exactly as far from one base as the other, and far
 * enough off the middle that answering it moves the fight somewhere it would
 * not otherwise have gone.
 */
export interface BgRally {
  pos: Vec2
  radius: number
  /** Seconds until it counts. Above zero it is a warning and nothing else. */
  telegraph: number
  /** Seconds left of the window, once it is live. */
  remaining: number
  /** -1 fully red, +1 fully blue, exactly as a capture point reads. */
  progress: number
  owner: Team | null
  contested: boolean
  /** Set when the window closes and the payout has been handed out, once. */
  settled: boolean
}

export interface BgFlag {
  team: Team
  state: 'home' | 'carried' | 'dropped'
  pos: Vec2
  carrierId: number | null
  /** Seconds a dropped flag waits before returning itself. */
  dropTimer: number
  /**
   * How long an enemy has been standing on it, while it is at home.
   *
   * A flag used to leave the instant anybody touched it, which meant a guard
   * could not guard: being there was worth nothing unless it had already
   * killed the person arriving, and one defender does not kill four attackers.
   * Standing on it long enough is the same act a capture point already asks
   * for, and it answers the same way — anybody defending it in reach stops the
   * clock rather than having to win the fight first.
   *
   * Only at home. A flag lying in a field is picked up on touch, because the
   * fight that dropped it has already happened and making the winner stand
   * over it for three seconds is making them win it twice.
   */
  taking: number
}

/**
 * A lump of terrain nobody can walk through.
 *
 * Circles rather than walls, and that is a decision rather than a shortcut:
 * everything that moves here walks straight at what it wants, so a shape that
 * pushes a body sideways as it slides along is a shape that gets walked around
 * on its own. A concave one would need path-finding, and an AI that gets stuck
 * on scenery is the bug this game has already had twice.
 */
export interface Obstacle {
  pos: Vec2
  radius: number
}

/**
 * What one side has decided to do, and when it may decide again.
 *
 * The alternative to this is what was here before: every actor answered "where
 * should I be" from its own index in the team, forever. That is stable — it was
 * written to stop the AI pacing between two points, and it did — but stable
 * turned out to mean the match had no decisions in it at all. Nothing in the
 * assignment read the score, the clock, or where anybody was; ten people walked
 * to fixed spots and hit each other until a timer ran out. A stand-in that knew
 * only "walk at whatever we do not own" beat the real thing on every map.
 *
 * The pacing bug came from recomputing a *continuous* quantity — distance —
 * every tick, so a step toward a point reordered the list and sent the actor
 * back. This recomputes a discrete one, and only when it changes: a point
 * changing hands, a flag taken or returned, somebody dying. `cooldown` is the
 * floor on how often that may happen at all, and `target` is what keeps a plan
 * from swapping the thing it is halfway to reaching.
 */
export interface BgPlan {
  /** Seconds before this side may reconsider, whatever happens. */
  cooldown: number
  /**
   * The board as it was when this plan was made, coarsely.
   *
   * Compared as a string against the board now. Deliberately coarse — cart
   * progress in tenths, no raw contested flag — because a reading that changes
   * every tick is a reading that plans every tick, which is the bug this
   * replaces wearing a different hat.
   */
  reading: string
  /**
   * What this side is currently trying to take, by node id, or -1.
   *
   * Held until it is taken rather than re-chosen each time the plan runs. Two
   * sides that both pick the nearest thing they do not own will each flip a
   * point, and without this the flip re-points everybody at the other one
   * before anybody has arrived — the pacing bug again, at one third the speed.
   */
  target: number
  /** How many are held back rather than sent forward. Read by the flag map. */
  defenders: number
}

export interface BgState {
  kind: BgKind
  score: Record<Team, number>
  target: number
  /** Seconds before the higher score wins outright. */
  timeLimit: number
  /** See `BgRally`. Every mode has one; it is the same mechanic in all three. */
  rally: BgRally
  /**
   * Seconds of doubled respawn each side still owes, for losing the rally.
   *
   * The payout is time rather than score because the three modes do not score
   * alike — a capture point pays by the second, a flag pays in whole caps —
   * and a reward that has to be denominated three ways is three mechanics
   * wearing one name. Bodies are the currency all three actually run on.
   */
  slowed: Record<Team, number>
  nodes: BgNode[]
  /** One per side in an escort, empty otherwise. */
  carts: Record<Team, BgCart> | null
  flags: Record<Team, BgFlag>
  bases: Record<Team, Vec2>
  /** Seconds until each downed actor is back on their feet, keyed by id. */
  respawn: Record<number, number>
  /** See `BgPlan`. One per side; the enemy plans exactly as you do. */
  plan: Record<Team, BgPlan>
  /**
   * What each actor has been given to do, keyed by actor.
   *
   * A node id on the capture map. On the other two it is a job rather than a
   * place — see `JOB_FORWARD` and `JOB_HOME` — because a flag map's two useful
   * answers are "go and get theirs" and "ours is the one that has to be here",
   * and neither of those is a fixed point on the floor.
   *
   * Kept until it is taken, lost, or the actor dies, because an objective is a
   * decision rather than a preference: recomputing "which point is nearest"
   * every tick made walking toward one reorder the list, which reassigned the
   * actor to another, which sent it back — a loop that paced people between
   * two points for whole matches.
   *
   * It lives here rather than on the AI profile so that the player's own slot
   * plays by the same rule. It has none, and giving one side a member that
   * re-decides every tick while the other side commits is a difference between
   * the teams that has nothing to do with who is playing.
   */
  assignment: Record<number, number>
  /** Captures and returns, for the report. */
  objectives: Record<number, number>
}

export interface PlayerInput {
  moveX: number
  moveY: number
  /** Ability slot indices requested this tick. */
  pressed: number[]
  /**
   * A class the player is asking for its raid cooldown, if any.
   *
   * The one input in this game that is not about the player's own body, and
   * the only one with a decision in it: what a fight lands on everybody comes
   * twenty to seventy times a pull and a roster brings ten or so answers, so
   * the question is never whether to press but which moment is worth it.
   */
  call?: ClassId | null
}

export interface SimState {
  mode: Mode
  /** Present only in a battleground; `mode` is what says which to read. */
  bg: BgState | null
  time: number
  tick: number
  actors: Actor[]
  /** Direction the boss faces, in radians; drives its frontal cone. */
  bossFacing: number
  /** Boss threat table keyed by actor id. */
  threat: Record<number, number>
  ground: GroundEffect[]
  projectiles: Projectile[]
  texts: FloatingText[]
  chat: ChatLine[]
  outcome: Outcome
  /** Which boss this is, as an index into `ENCOUNTERS`. */
  encounter: number
  /**
   * The day's twist, or none.
   *
   * Only a daily carries one: a raid you are learning has to be the same fight
   * on the ninth pull as on the first, and the daily is the one that is meant
   * to be new.
   */
  affix: AffixId | null
  /**
   * Ticks left before the pull starts, counting down to zero.
   *
   * Ticks rather than seconds because a float subtracted every tick does not
   * land on zero. Nothing ages while it runs — see `step`. It lives in the
   * state rather than in the frame loop because the simulation is the thing
   * that must not start, and a countdown held outside it would be a second
   * clock to keep honest.
   */
  countdown: number
  phase: number
  /**
   * When the phase last changed, in fight seconds.
   *
   * Kept so the picture can mark the moment rather than only the state. A
   * phase break already has a line, a sound, a screen flash and a burst, and
   * all four are over inside half a second; what it did not have was anything
   * that says *the boss is different now* a glance later. The renderer reads
   * this to swell the thing at the moment it turns, and the boss keeps the
   * size and the colour afterwards.
   */
  phaseAt: number
  /** Seconds banked toward the storm's next bill. See `updateStorm`. */
  stormTimer?: number
  /** Timers driving the boss script. */
  /**
   * Seconds to the next of each mechanic, keyed by the mechanic.
   *
   * Twenty-one separate `nextThing` fields once, which meant a new mechanic
   * added a field, two constructors and a line to every place that seeds
   * timers -- and a constructor that missed one left a mechanic that never
   * fired, silently, since zero is also a legal cadence. Keyed by id it is
   * one field, and the compiler will not accept a map that is missing one.
   */
  next: Record<MechanicId, number>
  /** Next slam on whoever is holding the boss. */
  nextSlam: number
  /** Next unavoidable hit on the whole raid. */
  nextRaidHit: number

  /**
   * One mechanic, and nothing else, for measuring what a mechanic is worth.
   *
   * Null everywhere the game itself runs. The harness sets it because there is
   * no other way to ask the question it needs answered: a boss's rungs arrive
   * together, so a table of win rates cannot say which of them the raid is
   * actually learning.
   */
  only: MechanicId | null

  /**
   * Cadences put on the boss in place of its own, keyed by mechanic. Anything
   * left out is switched off.
   *
   * Null everywhere the game itself runs, and it has one caller: the render
   * check, asking a boss for a mechanic no boss owns any more. Twenty-seven
   * of those are still implemented and on their way out a family at a time
   * (see `RETIRING`), and until each one goes it is live code -- so it is
   * checked, and nothing else can make it fire.
   *
   * It goes when `RETIRING` empties. What is left then is a game where every
   * fight throws its own kit and only that, which is the whole point of the
   * removal, and a field that lets a check say otherwise would be the one
   * remaining way to pretend a boss can be handed somebody else's mechanic.
   */
  imposed: Partial<Record<MechanicId, number>> | null

  /**
   * What a healer's output is worth, for the same measurement.
   *
   * One everywhere the game itself runs, and its sibling above is why it has
   * to exist. Narrowing a fight to a single rung also takes away most of what
   * the healers were losing ground to, and a raid with nothing else to cover
   * covers one mechanic without noticing -- so the death rate the field table
   * is written in reads nought for every mechanic in the game, including the
   * four the table itself records at between four and thirty-eight points.
   *
   * The mechanic is not touched. What is put back is the pressure the
   * isolation removed, and it is put back on the healers rather than on the
   * thing being measured, so what the number says is still what that mechanic
   * costs a raid that is already busy.
   */
  healing: number
  /** A magic dot on somebody, which armour does not. */
  /** Counts down after party-wide damage lands, purely to drive a screen flash. */
  raidFlash: number
  /** Monotonic id source for spawned objects. */
  nextObjectId: number
  /** Number of pulls so far; AI plays better on later attempts. */
  attempt: number
  seed: number
  /**
   * What the floor has standing on it that a body cannot walk through.
   *
   * On the state rather than on the battleground, which is where it started
   * and where it stopped making sense the moment a raid wanted some. Terrain
   * is a fact about the arena; a battleground is a set of rules played in one.
   */
  obstacles: Obstacle[]
  /**
   * The shape of the room this is being fought in.
   *
   * A fact about the fight rather than a constant, which is the whole of what
   * changed: the clamp, the camera, the AI's sampling and the terrain roll all
   * used to read one radius out of `constants.ts`, so every boss stood in the
   * same circle by construction. They read this now. A fight that does not
   * name a room gets `ROUND_ARENA`, which is that same circle.
   */
  /**
   * Which room of the citadel this is, or null for a fight that is not part of
   * an evening.
   *
   * The simulation does nothing with it. It is here for the same reason
   * `depth` is: what happens when the fight ends is decided outside, and the
   * screen that decides has nothing else to read — a descent goes deeper, a
   * rung goes to the next rung, and a room goes back to the map.
   */
  chamber: string | null
  /**
   * The gorged one's gauge, from nothing to full.
   *
   * The only number in this game that is filled by the raid rather than by the
   * fight's clock. Everything else a boss does is scheduled; this is a running
   * total of what the raid let happen -- bodies caught in a spill, hits landed
   * by what walked in, a wound left to fester -- and what it buys when it
   * fills is the mark.
   *
   * Zero in every fight that does not sell it, which is every fight but one.
   */
  gauge: number
  /**
   * Everybody who has ever held the gift, on the fight that passes one.
   *
   * On the state rather than on a body because it has to outlive the aura: a
   * holder is looking for somebody who has *never* held one, and a body that
   * had one two minutes ago is not that. It is also the only list in this game
   * that only ever grows -- when everybody is on it the fight has run out of
   * clean bodies, and what happens then is the raid stops doubling.
   *
   * Empty in every fight that does not pass anything, which is every fight
   * but one.
   */
  held: number[]
  /**
   * The corridor being walked, or null everywhere else.
   *
   * Beside `bg` and read the same way: `mode` is what says which of them to
   * look at.
   */
  travel: TravelState | null
  room: RoomShape
  /**
   * Every piece of ground a body may stand on, when there is more than one.
   *
   * `room` is the room a *fight* happens in and stays that: a mechanic is
   * placed in the room that threw it and must not spill down a corridor. This
   * is the other question — where a body is allowed to be — and it is only
   * different while the party is walking a building. A fight on its own, and
   * a battleground, leave it empty and are confined to `room` exactly as they
   * always were.
   */
  floor?: RoomShape[]
  /**
   * Which door the next thing summoned comes through.
   *
   * A counter rather than a roll. The only randomness in this game is who gets
   * picked, and a wave that also rolls its doorway takes away the one thing
   * about a wave that can be learned — left, then right, then left. Kept on
   * the state so a second wave carries on where the first stopped and the same
   * seed replays the same order.
   */
  nextDoor: number
  /** Class and role of each raid slot, in order. */
  party: Pick[]
  difficulty: DifficultyId
  /** Keyed by actor id. */
  tally: Record<number, Tally>
  /** Cleared at the top of every tick; purely an output channel. */
  sounds: SoundEvent[]
  /** The same, for things to draw. See `EffectEvent`. */
  effects: EffectEvent[]
}
