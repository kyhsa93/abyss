import { ARENA_RADIUS, COUNTDOWN_TICKS, HEALTH, bar } from './constants'
import { FIRST_ENCOUNTER, encounterAt, encounterIndex } from './encounters'
import { createBattleground, spawnPoint } from './battleground'
import { descentHealth } from './descent'
import { plannedOpening, rollFloor } from './floor'
import { Rng } from './rng'
import {
  CLASSES,
  DEFAULT_PARTY,
  RESOURCES,
  DIFFICULTIES,
  makeSlots,
  randomParty,
  sizeHealth,
  specOf,
  type Pick,
  type DifficultyId,
  type RaidSize,
  type Slot,
} from './classes'
import type { Actor, AiProfile, BgKind, Personality, SimState, Tally } from './types'
import type { AffixId } from './affix'


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
    callTimer: 0,
    callTo: null,
    answering: null,
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
    block: Math.round(spec.block * HEALTH),
    faction: 'party',
    pos: { x: slot.x, y: slot.y },
    prevPos: { x: slot.x, y: slot.y },
    radius: 17,
    moveSpeed: CLASSES[pick.classId].moveSpeed,
    hp: bar(spec.hp),
    maxHp: bar(spec.hp),
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
    hunting: null,
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
  encounter: number = FIRST_ENCOUNTER,
  affix: AffixId | null = null,
  depth = 0,
): SimState {
  const slots = makeSlots(party.length as RaidSize)
  const members = party.map((pick, i) => makeMember(i + 1, pick, slots[i]!, i === 0, attempt))
  const scale =
    sizeHealth(party.length) * DIFFICULTIES[difficulty].health * descentHealth(depth)
  const fight = encounterAt(encounter)
  // A floor rolls its own fight out of the same vocabulary the bosses are
  // written in; the ladder gets the boss exactly as it was authored.
  const plan = depth > 0 ? rollFloor(seed, depth, party.length, difficulty) : null
  const opening = plan ? { ...fight.opening, ...plannedOpening(plan) } : fight.opening

  const boss: Actor = {
    id: BOSS_ID,
    name: fight.name,
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
    hp: Math.round(fight.hp * scale),
    maxHp: Math.round(fight.hp * scale),
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
    hunting: null,
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
    mode: 'raid',
    bg: null,
    only: null,
    time: 0,
    tick: 0,
    actors: [...members, boss],
    threat,
    ground: [],
    projectiles: [],
    texts: [],
    chat: [],
    outcome: 'ongoing',
    encounter: encounterIndex(encounter),
    affix,
    depth,
    countdown: COUNTDOWN_TICKS,
    phase: 1,
    nextPuddle: opening.puddle,
    nextBrand: opening.brand,
    nextSpire: opening.spire,
    nextVerdict: opening.verdict,
    nextCrush: opening.crush,
    nextHand: opening.hand,
    nextEcho: opening.echo,
    nextFault: opening.fault,
    nextShallows: opening.shallows,
    nextSchism: opening.schism,
    nextSpread: opening.spread,
    nextSlam: opening.slam,
    nextRaidHit: opening.raid,
    nextBreath: opening.breath,
    nextShockwave: opening.shockwave,
    nextAdds: opening.adds,
    nextSweep: opening.sweep,
    nextSunder: opening.sunder,
    nextSoak: opening.soak,
    nextHunt: opening.hunt,
    nextBurden: opening.burden,
    nextYoke: opening.yoke,
    plan,
    nextRot: opening.rot,
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

/** Names for the other side, so a battleground reads as people. */
const RED_NAMES = ['Corvin', 'Sable', 'Thane', 'Ember', 'Grimsby']

/**
 * A battleground: five of yours against five rolled ones.
 *
 * Everything the raid path builds is reused — the same members, the same
 * classes, the same damage numbers. What changes is who is standing opposite
 * and what the tick loop does with them: no boss, no script, no encounter.
 *
 * The other side is rolled from the seed rather than mirrored. A mirror match
 * is the fairest possible test and the least interesting one, since every
 * answer is "the same thing they have".
 */
export function createBattlegroundState(
  seed: number,
  kind: BgKind,
  party: Pick[] = DEFAULT_PARTY,
  /** The other side, when a caller needs it fixed rather than rolled. */
  enemy?: Pick[],
): SimState {
  const rng = new Rng(seed)
  const size = 5
  const slots = makeSlots(size)
  // The terrain is rolled from the same seed as everything else, so a match
  // replays with the map it was played on.
  const bg = createBattleground(kind, rng)

  const blue = party.slice(0, size).map((pick, i) => {
    const actor = makeMember(i + 1, pick, slots[i]!, i === 0, 0)
    const at = spawnPoint(bg, 'blue', i)
    actor.pos = { ...at }
    actor.prevPos = { ...at }
    return actor
  })

  const enemyPicks = enemy?.slice(0, size) ?? randomParty(size, () => rng.range(0, 1))
  const red = enemyPicks.map((pick, i) => {
    const actor = makeMember(BOSS_ID + i, pick, slots[i]!, false, 0)
    actor.faction = 'boss'
    actor.name = RED_NAMES[i] ?? `Red ${i + 1}`
    const at = spawnPoint(bg, 'red', i)
    actor.pos = { ...at }
    actor.prevPos = { ...at }
    return actor
  })

  const threat: Record<number, number> = {}
  const tally: Record<number, Tally> = {}
  // Both sides are tallied here, unlike a raid where only the party is: the
  // report is a scoreboard and half a scoreboard is not one.
  for (const m of [...blue, ...red]) {
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
    mode: 'battleground',
    bg,
    time: 0,
    tick: 0,
    actors: [...blue, ...red],
    threat,
    ground: [],
    projectiles: [],
    texts: [],
    chat: [],
    outcome: 'ongoing',
    encounter: FIRST_ENCOUNTER,
    affix: null,
    depth: 0,
    countdown: COUNTDOWN_TICKS,
    phase: 1,
    nextPuddle: 0,
    nextBrand: 0,
    nextSpire: 0,
    nextVerdict: 0,
    nextCrush: 0,
    nextHand: 0,
    nextEcho: 0,
    nextFault: 0,
    nextShallows: 0,
    nextSchism: 0,
    nextSpread: 0,
    nextSlam: 0,
    nextRaidHit: 0,
    nextBreath: 0,
    nextShockwave: 0,
    nextAdds: 0,
    nextSweep: 0,
    nextSunder: 0,
    nextSoak: 0,
    nextBurden: 0,
    nextYoke: 0,
    nextHunt: 0,
    only: null,
    plan: null,
    nextRot: 0,
    bossFacing: Math.PI,
    raidFlash: 0,
    nextObjectId: 1,
    attempt: 0,
    seed,
    party: party.slice(0, size).map((p) => ({ ...p })),
    difficulty: 'normal',
    tally,
    sounds: [],
    effects: [],
  }
}

/**
 * Hands the player's slot over to the AI.
 *
 * For a fight nobody is playing — the one running behind the menus. Every
 * lookup of the player in the simulation is already written to cope with there
 * being none, because a battleground's other five never had one, so the whole
 * fight simply runs itself.
 */
export function unattended(s: SimState, attempt = 6): SimState {
  const player = s.actors.find((a) => a.isPlayer)
  if (player) {
    player.isPlayer = false
    player.ai = makeAi('steady', attempt)
  }
  return s
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
