import type { ClassId, DifficultyId, Pick, SpecId } from './classes'

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
  | 'renew'
  | 'rejuvenation'
  | 'riptide' // heal over time on a party member
  | 'shield' // damage reduction on the tank
  | 'spread' // detonates on expiry, damages everyone nearby
  | 'enrage' // boss damage amplifier

export interface Aura {
  id: AuraId
  remaining: number
  duration: number
  stacks: number
  /** Actor that applied the aura. */
  sourceId: number
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
}

export type GroundKind = 'puddle' | 'breath' | 'shockwave'

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
  kind: 'damage' | 'heal' | 'miss' | 'crit'
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

export type BgKind = 'conquest' | 'flags'

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

export interface BgFlag {
  team: Team
  state: 'home' | 'carried' | 'dropped'
  pos: Vec2
  carrierId: number | null
  /** Seconds a dropped flag waits before returning itself. */
  dropTimer: number
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

export interface BgState {
  kind: BgKind
  score: Record<Team, number>
  target: number
  /** Seconds before the higher score wins outright. */
  timeLimit: number
  nodes: BgNode[]
  /** Terrain. Empty in a raid, where the floor is the mechanic. */
  obstacles: Obstacle[]
  flags: Record<Team, BgFlag>
  bases: Record<Team, Vec2>
  /** Seconds until each downed actor is back on their feet, keyed by id. */
  respawn: Record<number, number>
  /**
   * The capture point each actor is committed to, by node id, keyed by actor.
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
  /** Timers driving the boss script. */
  nextPuddle: number
  nextSpread: number
  nextSlam: number
  nextRaidHit: number
  nextBreath: number
  nextShockwave: number
  nextAdds: number
  /** Counts down after party-wide damage lands, purely to drive a screen flash. */
  raidFlash: number
  /** Monotonic id source for spawned objects. */
  nextObjectId: number
  /** Number of pulls so far; AI plays better on later attempts. */
  attempt: number
  seed: number
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
