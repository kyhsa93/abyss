import { ARENA_RADIUS, COUNTDOWN_TICKS } from './constants'
import {
  CLASSES,
  DEFAULT_PARTY,
  RESOURCES,
  DIFFICULTIES,
  makeSlots,
  sizeHealth,
  specOf,
  type Pick,
  type DifficultyId,
  type RaidSize,
  type Slot,
} from './classes'
import type { Actor, AiProfile, Personality, SimState, Tally } from './types'

/**
 * Raised from 36,000 when the party got weapons.
 *
 * Auto-attacks add about eleven percent to what the raid actually lands —
 * measured rather than assumed, because their theoretical uptime is nothing
 * like their real one: melee walk out of puddles, lose range and die. Left
 * alone that turned a 43% first pull into a 73% one. The health follows the
 * damage, and it follows it by the same fraction at five, ten and
 * twenty-five, so one number covers every size. What the weapons changed is
 * who contributes, not how long the boss lives.
 *
 * Raised again from 40,000 for crits, which add about seven and a half
 * percent on the party's side at a chance of fifteen and a multiplier of one
 * and a half. Same reasoning: the encounter should be the length it was, and
 * what a crit changes is how a hit looks, not how long the fight runs.
 */
const BOSS_MAX_HP = 43000

interface PersonalityTuning {
  reactionDelay: number
  mistakeChance: number
  clustering: number
}

/**
 * Personality is what stops three AI party members from moving as one
 * organism. Greedy players squeeze in one more global before dodging, timid
 * ones bail early and overheal, steady ones sit in between.
 */
const TUNING: Record<Personality, PersonalityTuning> = {
  steady: { reactionDelay: 0.28, mistakeChance: 0.06, clustering: 0.35 },
  // Greedy reacts noticeably late. That is the whole character: it out-damages
  // the others and it is the one standing in the fire when you look over.
  greedy: { reactionDelay: 0.6, mistakeChance: 0.11, clustering: 0.2 },
  timid: { reactionDelay: 0.18, mistakeChance: 0.05, clustering: 0.55 },
}

/**
 * Later pulls produce sharper AI. Real raid groups get better at a fight by
 * repeating it, and faking that progression is most of what makes the party
 * feel like people rather than fixed difficulty knobs.
 */
function makeAi(personality: Personality, attempt: number): AiProfile {
  const t = TUNING[personality]
  const learn = Math.max(0.6, 1 - attempt * 0.08)
  const focus = Math.max(0.35, 1 - attempt * 0.12)
  return {
    personality,
    reactionDelay: t.reactionDelay * learn,
    mistakeChance: t.mistakeChance * focus,
    clustering: t.clustering,
    reactionTimer: 0,
    reactingTo: null,
    fumbled: false,
    moveTarget: null,
    chatCooldown: 0,
  }
}

function makeMember(
  id: number,
  pick: Pick,
  slot: Slot,
  isPlayer: boolean,
  attempt: number,
): Actor {
  const spec = specOf(pick)
  const resource = spec.resource
  return {
    id,
    name: slot.name,
    classId: pick.classId,
    spec: spec.id,
    role: spec.role,
    melee: spec.melee,
    armor: spec.armor,
    block: spec.block,
    faction: 'party',
    pos: { x: slot.x, y: slot.y },
    prevPos: { x: slot.x, y: slot.y },
    radius: 17,
    moveSpeed: CLASSES[pick.classId].moveSpeed,
    hp: spec.hp,
    maxHp: spec.hp,
    resource,
    // Rage is the one you are not handed: a warrior opens a pull with an
    // empty bar and has to hit something before it can do anything.
    power: RESOURCES[resource].startsFull ? spec.power : 0,
    maxPower: spec.power,
    alive: true,
    gcd: 0,
    cooldowns: {},
    auras: [],
    castId: null,
    castRemaining: 0,
    castTotal: 0,
    castTargetId: null,
    isPlayer,
    ai: isPlayer ? null : makeAi(slot.personality, attempt),
    swingTimer: 0,
  }
}

/**
 * The player is always the first slot, and the first slot is always id one.
 *
 * A constant rather than a search, because the damage path asks who is
 * involved on every hit — several times a tick with twenty-five people
 * fighting.
 */
export const PLAYER_ID = 1
export const BOSS_ID = 100

export function createState(
  seed: number,
  attempt: number,
  party: Pick[] = DEFAULT_PARTY,
  difficulty: DifficultyId = 'normal',
): SimState {
  const slots = makeSlots(party.length as RaidSize)
  const members = party.map((pick, i) => makeMember(i + 1, pick, slots[i]!, i === 0, attempt))
  const scale = sizeHealth(party.length) * DIFFICULTIES[difficulty].health

  const boss: Actor = {
    id: BOSS_ID,
    name: 'The Drowned Warden',
    classId: 'warrior',
    spec: 'protection',
    role: 'tank',
    melee: true,
    armor: 0,
    block: 0,
    faction: 'boss',
    pos: { x: 0, y: 0 },
    prevPos: { x: 0, y: 0 },
    radius: 50,
    moveSpeed: 175,
    hp: Math.round(BOSS_MAX_HP * scale),
    maxHp: Math.round(BOSS_MAX_HP * scale),
    resource: 'mana',
    power: 0,
    maxPower: 0,
    alive: true,
    gcd: 0,
    cooldowns: {},
    auras: [],
    castId: null,
    castRemaining: 0,
    castTotal: 0,
    castTargetId: null,
    isPlayer: false,
    ai: null,
    swingTimer: 2,
  }

  const threat: Record<number, number> = {}
  const tally: Record<number, Tally> = {}
  for (const m of members) {
    // Nobody opens with a lead. The boss goes to whoever earns it, which on
    // the first tick of a pull means the tank has to take it with a taunt
    // instead of being handed it.
    threat[m.id] = 0
    tally[m.id] = {
      damage: 0,
      healing: 0,
      overhealing: 0,
      damageTaken: 0,
      mechanicHits: 0,
      deathAt: null,
    }
  }

  return {
    time: 0,
    tick: 0,
    actors: [...members, boss],
    threat,
    ground: [],
    projectiles: [],
    texts: [],
    chat: [],
    outcome: 'ongoing',
    countdown: COUNTDOWN_TICKS,
    phase: 1,
    nextPuddle: 9,
    nextSpread: 17,
    nextSlam: 13,
    nextRaidHit: 11,
    nextBreath: 21,
    nextShockwave: 27,
    nextAdds: 45,
    bossFacing: Math.PI / 2,
    raidFlash: 0,
    nextObjectId: 1,
    attempt,
    seed,
    party: party.map((p) => ({ ...p })),
    difficulty,
    tally,
    sounds: [],
    effects: [],
  }
}

export function clampToArena(pos: { x: number; y: number }, radius: number): void {
  const limit = ARENA_RADIUS - radius
  const dist = Math.hypot(pos.x, pos.y)
  if (dist > limit) {
    const scale = limit / dist
    pos.x *= scale
    pos.y *= scale
  }
}
