import { ARENA_RADIUS } from './constants'
import type { Actor, AiProfile, Personality, Role, SimState } from './types'

const BOSS_MAX_HP = 30000

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

interface ActorSpec {
  id: number
  name: string
  role: Role
  hp: number
  mana: number
  x: number
  y: number
  speed: number
  isPlayer: boolean
  personality: Personality | null
}

function makeActor(spec: ActorSpec, attempt: number): Actor {
  return {
    id: spec.id,
    name: spec.name,
    role: spec.role,
    faction: 'party',
    pos: { x: spec.x, y: spec.y },
    prevPos: { x: spec.x, y: spec.y },
    radius: 13,
    moveSpeed: spec.speed,
    hp: spec.hp,
    maxHp: spec.hp,
    mana: spec.mana,
    maxMana: spec.mana,
    alive: true,
    gcd: 0,
    cooldowns: {},
    auras: [],
    castId: null,
    castRemaining: 0,
    castTotal: 0,
    castTargetId: null,
    isPlayer: spec.isPlayer,
    ai: spec.personality ? makeAi(spec.personality, attempt) : null,
    swingTimer: 0,
  }
}

export const PLAYER_ID = 1
export const TANK_ID = 2
export const HEALER_ID = 3
export const DPS_A_ID = 4
export const DPS_B_ID = 5
export const BOSS_ID = 100

export function createState(seed: number, attempt: number): SimState {
  const player = makeActor(
    {
      id: PLAYER_ID,
      name: 'You',
      role: 'dps',
      hp: 3300,
      mana: 0,
      x: 60,
      y: 120,
      speed: 165,
      isPlayer: true,
      personality: null,
    },
    attempt,
  )

  const tank = makeActor(
    {
      id: TANK_ID,
      name: 'Bastion',
      role: 'tank',
      hp: 5400,
      mana: 0,
      x: 0,
      y: -55,
      speed: 155,
      isPlayer: false,
      personality: 'steady',
    },
    attempt,
  )

  const healer = makeActor(
    {
      id: HEALER_ID,
      name: 'Wren',
      role: 'healer',
      hp: 3000,
      mana: 1000,
      x: -60,
      y: 130,
      speed: 155,
      isPlayer: false,
      personality: 'timid',
    },
    attempt,
  )

  const kestrel = makeActor(
    {
      id: DPS_A_ID,
      name: 'Kestrel',
      role: 'dps',
      hp: 3300,
      mana: 0,
      x: 95,
      y: 100,
      speed: 165,
      isPlayer: false,
      personality: 'greedy',
    },
    attempt,
  )

  const vale = makeActor(
    {
      id: DPS_B_ID,
      name: 'Vale',
      role: 'dps',
      hp: 3300,
      mana: 0,
      x: -100,
      y: 95,
      speed: 165,
      isPlayer: false,
      personality: 'steady',
    },
    attempt,
  )

  const boss: Actor = {
    id: BOSS_ID,
    name: 'The Drowned Warden',
    role: 'tank',
    faction: 'boss',
    pos: { x: 0, y: 0 },
    prevPos: { x: 0, y: 0 },
    radius: 38,
    // Faster than anyone in the party (155-165). You cannot outrun it, only
    // out-position it, which is what keeps threat and tanking meaningful.
    moveSpeed: 175,
    hp: BOSS_MAX_HP,
    maxHp: BOSS_MAX_HP,
    mana: 0,
    maxMana: 0,
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

  return {
    time: 0,
    tick: 0,
    actors: [player, tank, healer, kestrel, vale, boss],
    // The tank opens with a threat lead so the pull is not a coin flip.
    threat: { [PLAYER_ID]: 0, [TANK_ID]: 400, [HEALER_ID]: 0, [DPS_A_ID]: 0, [DPS_B_ID]: 0 },
    ground: [],
    projectiles: [],
    texts: [],
    chat: [],
    outcome: 'ongoing',
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
