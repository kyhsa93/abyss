import type { ClassId, DifficultyId, Pick, SpecId } from './classes'
import type { AffixId } from './affix'
import type { FloorPlan } from './floor'
import type { MechanicId } from './encounters'

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
  | 'rot' // boss: a stacking magic dot, the healer's slow problem
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
  | 'sunder' // boss: stacks on whoever is holding it, and makes them softer
  | 'hunted' // boss: something has picked you, and it is walking over
  | 'spread' // detonates on expiry, damages everyone nearby
  | 'brand' // boss: leaves ground where it burns out
  | 'echo' // boss: the floor under you gives way on a beat until it fades
  | 'verdict' // boss: judgement pending, and it kills anyone under the line
  | 'burden' // boss: a weight that has to be walked into fresh hands
  | 'yoke' // boss: matures on one, and is paid by whoever came to stand with them
  | 'schism' // boss: which group you belong to, and they must not touch
  | 'chant' // boss: named to cut the note, and the raid pays if it is not cut
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
   * boss: it has let go and is wandering, billing whoever it passes.
   *
   * The only aura in the game that takes the boss out of the fight's usual
   * shape rather than putting something on a body. While it is up there is no
   * tank and no front, and every rule about standing behind the thing is
   * suspended along with the thing.
   */
  | 'storming'
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
  | 'spoil' // boss: you struck the thing that was not to be broken
  | 'refuge' // boss: which of the stones is yours, and there is one each
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
   * The body named to come and stand with this one, for the yoke.
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
   * The gaze asks. It takes whoever is still turned toward the boss at the
   * instant it opens, and since a party fights what it is looking at, the
   * resting state of every body here is the failing one -- which is the only
   * way a mechanic with no shape on the floor can have a wrong answer at all.
   */
  facing: number

  /**
   * Who this one is following, ignoring everything else.
   *
   * Only a stalker has it. Every other hostile in the game goes for whoever
   * is nearest, which is a rule the party answers by standing somewhere else
   * — this one answers by walking after you.
   */
  hunting: number | null

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
   */
  spawn?: 'knell' | 'vessel' | 'herald' | 'spike'
}

export type GroundKind =
  | 'puddle'
  | 'brand'
  | 'crush'
  | 'spire'
  | 'breath'
  | 'shockwave'
  // A line of patches lit one after the next, outward from the boss. Circles,
  // like the pool, because the shape a person answers is one patch at a time
  // and a line is what the sequence of them looks like from above.
  | 'coldflame'
  | 'soak'
  | 'hand'
  | 'echo'
  | 'fault'
  | 'shallows'
  | 'schism'
  // The three whose shape is a moment. They are kept on the ground list with
  // everything else because a telegraph counting down to one instant is what
  // that list is for -- but none of them has an inside or an outside, and
  // `radius` on all three is a picture rather than a test.
  | 'vigil'
  | 'chant'
  | 'gaze'
  // The plate somebody has to walk into and pay at, so that the rest of them
  // do not.
  | 'toll'
  // The reach that takes hold of whoever it is left nearest to, and bills
  // them for everybody else who was slow as well.
  | 'grasp'
  // The stones there are exactly enough of, one body to each.
  | 'refuge'

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
   * Who threw it, when the bolt is carrying the ability rather than
   * illustrating one that already happened. Null means it is scenery.
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
export type Mode = 'raid' | 'battleground'

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
   * How far down this fight is, or zero for one that is not a descent.
   *
   * The boss reads it for its health and its damage; nothing else does.
   */
  depth: number
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
  /** Next cast of the wedge that turns across the arena. */
  /** Next time half the floor gives way. */
  /** Next time everything but a few patches does. */
  nextSlam: number
  nextRaidHit: number
  /** Physical damage to everyone in reach, which armour actually answers. */
  /** Next stack of the boss's armour break on whoever is holding it. */
  /** Next circle the whole party has to stand in. */
  /** Next thing that picks somebody and follows them. */
  /** Next weight that has to be walked into somebody else's hands. */
  /** Next debt that is paid by whoever came to stand with the one who owes it. */
  /**
   * What this floor was rolled to ask for, on a descent.
   *
   * Null on the ladder and in a battleground, where the fight is whatever the
   * boss's own table says it is. On a floor it replaces those cadences
   * entirely: the boss lends its shape, its health and its damage, and the
   * plan decides what it does with them.
   */
  plan: FloorPlan | null

  /**
   * One mechanic, and nothing else, for measuring what a mechanic is worth.
   *
   * Null everywhere the game itself runs. The harness sets it because there is
   * no other way to ask the question it needs answered: a boss's rungs arrive
   * together, so a table of win rates cannot say which of them the raid is
   * actually learning. It reads the same override path a floor already uses.
   */
  only: MechanicId | null
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
