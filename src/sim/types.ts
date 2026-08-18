export type Role = 'tank' | 'healer' | 'dps'
export type Faction = 'party' | 'boss'

export interface Vec2 {
  x: number
  y: number
}

export type AuraId =
  | 'ignite' // damage over time on the boss
  | 'renew' // heal over time on a party member
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
  role: Role
  faction: Faction

  pos: Vec2
  /** Position at the previous tick, used for render interpolation. */
  prevPos: Vec2
  radius: number
  moveSpeed: number

  hp: number
  maxHp: number
  mana: number
  maxMana: number
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

export type GroundKind = 'puddle'

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
}

export interface FloatingText {
  id: number
  text: string
  pos: Vec2
  age: number
  kind: 'damage' | 'heal' | 'miss' | 'crit'
}

export interface ChatLine {
  id: number
  speaker: string
  text: string
  age: number
}

export type Outcome = 'ongoing' | 'victory' | 'wipe' | 'enrage'

export interface PlayerInput {
  moveX: number
  moveY: number
  /** Ability slot indices requested this tick. */
  pressed: number[]
}

export interface SimState {
  time: number
  tick: number
  actors: Actor[]
  /** Boss threat table keyed by actor id. */
  threat: Record<number, number>
  ground: GroundEffect[]
  texts: FloatingText[]
  chat: ChatLine[]
  outcome: Outcome
  phase: number
  /** Timers driving the boss script. */
  nextPuddle: number
  nextSpread: number
  nextSlam: number
  /** Monotonic id source for spawned objects. */
  nextObjectId: number
  /** Number of pulls so far; AI plays better on later attempts. */
  attempt: number
  seed: number
}
