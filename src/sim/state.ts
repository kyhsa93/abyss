import { BOSS_WIDTH, COUNTDOWN_TICKS, HEALTH, MENDING_START, MUSTER_PACE, PARTY_RADIUS, TICK_RATE, YARD, bar } from './constants'
import { FIRST_ENCOUNTER, encounterAt, encounterIndex, noTimers, openingTimers } from './encounters'
import type { Encounter } from './encounters'
import { battlegroundTerrain, createBattleground, raidTerrain, spawnPoint } from './battleground'
import { Rng } from './rng'
import { ROUND_ARENA, carried, type RoomShape } from './room'
import { createTravelState, type Corridor } from './travel'
import {
  CLASSES,
  DEFAULT_PARTY,
  DEFAULT_RAID,
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
import type { Actor, AiProfile, BgKind, Personality, SimState, Tally, Vec2 } from './types'
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
    switchTimer: 0,
    switchTo: null,
    striking: null,
    beatTimer: 0,
    beatTo: null,
    keeping: null,
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
    radius: PARTY_RADIUS,
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
    facing: 0,
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

/**
 * Where the running id counter starts, which is past everything reserved.
 *
 * The counter is shared: chat lines, floating text, ground effects,
 * projectiles and summoned bodies all take the next number off it. It used to
 * start at one, and the two ids above are constants sitting in the middle of
 * its range, so it walked straight through them.
 *
 * Reaching a hundred is what it costs, and a fight reaches a hundred in about
 * twenty-five seconds. The body summoned on that tick was handed `BOSS_ID` —
 * and the line that makes the boss untouchable while its herald stands reads
 * the id, so the herald was untouchable too. It could not be killed, so it
 * never stopped standing, so the boss was never touchable again: one pull in
 * six ran to five minutes with the boss frozen at exactly its phase-two
 * health and nobody able to do anything about it.
 *
 * That is also what the threat table and the damage tally are keyed on, so
 * the same collision quietly filed a summon's threat and a summon's damage
 * under the boss.
 *
 * Past both, and the counter only ever goes up.
 */
export const FIRST_OBJECT_ID = BOSS_ID + 1

/** What the boss itself holds, once its herald's share is taken off. */
export function bossHealth(fight: Encounter, scale: number): number {
  return Math.round(fight.hp * scale * (1 - (fight.herald?.share ?? 0)))
}

/** What the herald holds, which is the rest of it. */
export function heraldHealth(fight: Encounter, scale: number): number {
  return Math.round(fight.hp * scale * (fight.herald?.share ?? 0))
}

export function createState(
  seed: number,
  attempt: number,
  party: Pick[] = DEFAULT_RAID,
  difficulty: DifficultyId = 'normal',
  encounter: number = FIRST_ENCOUNTER,
  affix: AffixId | null = null,
  /**
   * Where the room stands, for a fight that is one room of a building.
   *
   * A fight was always written around the origin, and on its own it still is:
   * this defaults to nothing and the pull that comes out is the pull that
   * always came out, in the same coordinates, off the same rolls. Given a
   * place, everything the fight puts on the floor moves with it and nothing
   * else about it changes — which is what lets the citadel hold a fight in
   * the room the party walked into rather than swapping the world for one
   * centred on it.
   */
  at: Vec2 = { x: 0, y: 0 },
  /**
   * Where the party already is, for a fight it walked into.
   *
   * The slots are still where everybody is *going*: the count is spent walking
   * to them — see `muster` — so a fight that begins from a doorway begins from
   * the same formation every measurement was taken in, three seconds later. A
   * pull that starts in position, which is every pull the harness runs, hands
   * nothing here and is placed exactly as it always was.
   */
  standing?: Vec2[],
): SimState {
  const slots = makeSlots(party.length as RaidSize)
  // How far the furthest of them has to walk, which is how long the count is.
  // Three seconds for a pull that starts in formation, exactly as it always
  // was; long enough to reach the line for one that came in through a door.
  let furthest = 0
  const members = party.map((pick, i) => {
    const home = { x: slots[i]!.x + at.x, y: slots[i]!.y + at.y }
    const where = standing?.[i] ?? home
    furthest = Math.max(furthest, Math.hypot(where.x - home.x, where.y - home.y))
    return makeMember(i + 1, pick, { ...slots[i]!, x: where.x, y: where.y }, i === 0, attempt)
  })
  const slowest = Math.min(...party.map((pick) => CLASSES[pick.classId].moveSpeed))
  const count = Math.max(
    COUNTDOWN_TICKS,
    Math.ceil((furthest / (slowest * MUSTER_PACE)) * TICK_RATE),
  )
  const scale = sizeHealth(party.length) * DIFFICULTIES[difficulty].health
  const fight = encounterAt(encounter)
  // The room, before anything is placed in it. Everything below that used to
  // read `ARENA_RADIUS` — the terrain's walls, the clamp, the camera — reads
  // this instead, and a fight that names no room gets the circle they all
  // assumed.
  const shape = fight.room ?? ROUND_ARENA
  const room: RoomShape = at.x === 0 && at.y === 0 ? shape : { ...shape, at }
  // What is standing in that room: the fight's own, or rolled.
  //
  // A fight that names its terrain gets exactly that, every pull, because a
  // floor is part of what there is to learn. One that names none gets rocks
  // rolled off the pull's seed, which is where every fight was before any of
  // them was furnished.
  //
  // Copied rather than handed over. The list on the encounter is the fight as
  // written and outlives the pull; `s.obstacles` is a room being fought in,
  // and a mechanic that leaves a wall behind it writes there.
  // Rolled in the room's own frame and then moved, rather than rolled in the
  // room where it stands: the stream of numbers has to be the same one whether
  // or not the room has been put anywhere.
  const rocks = (
    fight.terrain
      ? fight.terrain.map(carried)
      : raidTerrain(
          shape,
          new Rng(seed * 13 + encounter * 7919 + 1049),
          slots.map((slot) => ({ x: slot.x, y: slot.y })),
        )
  ).map((rock) => ({ pos: { x: rock.pos.x + at.x, y: rock.pos.y + at.y }, radius: rock.radius }))
  const opening = fight.opening

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
    pos: { x: at.x, y: at.y },
    prevPos: { x: at.x, y: at.y },
    radius: BOSS_WIDTH / 2,
    // Its own, off `creature_template.speed_run` — a multiplier of the
    // source's base seven yards a second, which is the unit the party's speeds
    // are already in. It was 197 for every boss, which is the first one's
    // 1.21429; the professor's is 1.71429 and the Watcher's 1.14286.
    moveSpeed: Math.round(fight.pace * 7 * YARD),
    // Less whatever its herald is carrying. The interlude's elite is health
    // carved out of the boss rather than health added to the fight, so the
    // raid has the same bar to chew through and the enrage clock keeps meaning
    // what it meant. A fight that simply grew an elite would be a fight with a
    // longer timer wearing a costume.
    // Halfway, on the one fight that is won by filling this rather than
    // emptying it. Everything else about the number is the same number.
    hp: bossHealth(fight, scale) * (fight.saving ? MENDING_START : 1),
    maxHp: bossHealth(fight, scale),
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
    facing: 0,
  }

  // The bodies a fight has beyond the one that carries its bar.
  //
  // One fight is three of them and only one is real at a time. They are made
  // here rather than summoned, because they are not a wave: they are the boss,
  // standing in three places, and a raid that walked in on two of them missing
  // would be a raid told the fight starts later than it does.
  //
  // The first stand is the boss's own, so there are two extra bodies rather
  // than three. Nothing else on the roster declares stands and nothing else
  // gets any.
  const court: Actor[] = []
  if (fight.stands && fight.stands.length > 1) {
    // Written in the room's own frame, like everything else a fight places.
    boss.pos.x = at.x + fight.stands[0]!.x
    boss.pos.y = at.y + fight.stands[0]!.y
    boss.prevPos.x = boss.pos.x
    boss.prevPos.y = boss.pos.y
    for (let i = 1; i < fight.stands.length; i++) {
      const stand = { x: at.x + fight.stands[i]!.x, y: at.y + fight.stands[i]!.y }
      court.push({
        ...boss,
        id: FIRST_OBJECT_ID + i - 1,
        pos: { x: stand.x, y: stand.y },
        prevPos: { x: stand.x, y: stand.y },
        // Its own health so that nothing divides by it, and it is never read:
        // what a body without the crown takes is nothing, and what one with it
        // takes goes to the bar. See `applyDamage`.
        hp: 1,
        maxHp: 1,
        auras: [],
        cooldowns: {},
        spawn: 'crown',
      })
    }
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
      byMechanic: {},
      deathAt: null,
    }
  }

  return {
    mode: 'raid',
    bg: null,
    room,
    chamber: null,
    gauge: 0,
    held: [],
    travel: null,
    nextDoor: 0,
    only: null,
    imposed: null,
    healing: 1,
    time: 0,
    tick: 0,
    actors: [...members, boss, ...court],
    threat,
    ground: [],
    projectiles: [],
    texts: [],
    chat: [],
    outcome: 'ongoing',
    encounter: encounterIndex(encounter),
    affix,
    countdown: count,
    phase: 1,
    phaseAt: 0,
    // Every mechanic, from the boss's own opening table. Written out one
    // field at a time once, and a mechanic left out of one constructor
    // simply never fired.
    next: openingTimers(opening),
    nextSlam: opening.slam,
    nextRaidHit: opening.raid,
    bossFacing: Math.PI / 2,
    raidFlash: 0,
    nextObjectId: FIRST_OBJECT_ID + court.length,
    attempt,
    seed,
    obstacles: rocks,
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
  const rocks = battlegroundTerrain(bg, rng)

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
      byMechanic: {},
      deathAt: null,
    }
  }

  return {
    mode: 'battleground',
    bg,
    // A battleground is played in the yardstick circle and always has been.
    room: ROUND_ARENA,
    chamber: null,
    gauge: 0,
    held: [],
    travel: null,
    nextDoor: 0,
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
    countdown: COUNTDOWN_TICKS,
    phase: 1,
    phaseAt: 0,
    next: noTimers(),
    nextSlam: 0,
    nextRaidHit: 0,
    only: null,
    imposed: null,
    healing: 1,
    bossFacing: Math.PI,
    raidFlash: 0,
    nextObjectId: FIRST_OBJECT_ID,
    attempt: 0,
    seed,
    obstacles: rocks,
    party: party.slice(0, size).map((p) => ({ ...p })),
    difficulty: 'normal',
    tally,
    sounds: [],
    effects: [],
  }
}

/**
 * The party, in a corridor.
 *
 * `travel.ts` owns what a corridor is and how it ticks; what it cannot own is
 * how a raider is built, because that is this file's business and importing it
 * the other way would be a circle. So the walk is handed the one thing it
 * needs — a body per pick, standing where it says — and keeps the rest.
 */
export function createCorridorState(
  seed: number,
  party: Pick[],
  corridor: Corridor,
  difficulty: DifficultyId = 'normal',
  attempt = 4,
  /** Where the party already is, for a walk that is carrying on rather than starting. */
  standing?: Vec2[],
  /** Whether this walk is the whole citadel. See `TravelState.building`. */
  building = false,
): SimState {
  const slots = makeSlots(party.length as RaidSize)
  return createTravelState(
    seed,
    party,
    corridor,
    difficulty,
    (pick, i, at) => makeMember(i + 1, pick, { ...slots[i]!, x: at.x, y: at.y }, i === 0, attempt),
    standing,
    building,
  )
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


