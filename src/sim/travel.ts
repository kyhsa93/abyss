import { ABILITIES } from './abilities'
import { clearTerrain, inTerrain } from './battleground'
import { DIFFICULTIES, makeSlots, specOf, type DifficultyId, type Pick, type RaidSize } from './classes'
import { DT, HEALTH, MELEE_RANGE, PARTY_RADIUS } from './constants'
import {
  applyDamage,
  beginCast,
  dist,
  getAura,
  hasteOf,
  holdOrFall,
  interruptCast,
  livingParty,
  pushEffect,
} from './combat'
import { turnToward } from './boss'
import { ROUND_ARENA, pushInside, type RoomShape } from './room'
import type { Rng } from './rng'
import type { Actor, SimState, Vec2 } from './types'

/**
 * The walk between two rooms.
 *
 * A citadel whose rooms are reached by pressing their names is a list of
 * fights with a map drawn over it. What the source puts between its rooms is
 * ground held by something, and what that ground is for is not difficulty —
 * it is the three things a corridor does: it costs time, it costs health, and
 * it makes you decide where to take the next pack.
 *
 * So this is deliberately not a fight. There is no script, no phase, no
 * mechanic and no enrage: packs stand where they were put, they notice at a
 * distance, and they come. Everything a raid boss owns is somewhere else.
 *
 * `docs/mechanic-rules.md` says a wave of adds measures at nothing as a
 * teaching mechanic, and that is the reason this exists in the shape it does:
 * trash is not a thing to learn, it is a thing to spend. What can be learned
 * about a corridor is which pack to wake first and where to stand while it
 * arrives, and both of those are decisions about the room rather than about
 * the pack.
 */

/** One group of bodies, standing where somebody put them. */
export interface Pack {
  pos: Vec2
  count: number
  /**
   * How far away it notices.
   *
   * The only number in a corridor that is a design decision. Two packs whose
   * circles overlap are one pack for anybody who walks between them, and that
   * is the corridor's single mistake to make — so the overlap is a thing the
   * build measures rather than a thing that happens.
   */
  pulls: number
}

/**
 * A place that keeps sending bodies out until somebody walks up to it.
 *
 * A pack is a thing standing still that you decide when to wake. This is the
 * other half of what held ground is, and the citadel had none of it: ground
 * that is being held *now*, by somebody who is still arriving. It is what the
 * front door of the building is for — you come in, and what the place makes of
 * that is a line of watchmen coming down the passage at you.
 *
 * Two distances and no script. It notices you from `pulls`, the way a pack
 * does, and it stops for good at `stops`, which is near enough to be inside
 * the passage: the tap is turned off by walking into it rather than by killing
 * anything, so the answer to a stream is to commit to it. Standing at the door
 * trading with whatever comes out is the mistake, and it is a mistake the
 * player can make for as long as they like.
 *
 * `most` is what keeps it from being a wave. A wave of adds measures at
 * nothing — `docs/mechanic-rules.md` is explicit — because it is not a
 * decision, it is a bill. A cap turns the bill into a rate: the ground in
 * front of you is held by a fixed number of bodies, and how long you leave it
 * held is yours.
 */
export interface Spring {
  /** Where they come out of. */
  at: Vec2
  /** Where they walk, which is out of the passage rather than at anybody. */
  toward: Vec2
  /** Seconds between one and the next. */
  every: number
  /** The most of them that may be up at once. */
  most: number
  /** How far off it notices somebody and starts. */
  pulls: number
  /** And how near they have to get for it to stop for good. */
  stops: number
}

/**
 * A way out, and what is on the other side of it.
 *
 * A corridor had one, because a corridor is a passage and a passage joins two
 * rooms. A room is the other thing this walks you across and has as many as
 * it has doors — which is what makes the citadel something you go through
 * rather than something you pick out of a list: at the crossing the three
 * wings are three doors on the floor, and choosing one is walking to it.
 */
export interface Way {
  /** The chamber through this door. */
  to: string
  at: Vec2
}

/** A stretch of ground: a room to stand in, or a passage to cross. */
export interface Corridor {
  id: string
  room: RoomShape
  /** Where the party comes in. */
  entry: Vec2
  /** Where it can go. One for a passage; one per door for a room. */
  ways: Way[]
  packs: Pack[]
  /** What is still arriving, if anything is. Most ground is held by nobody. */
  springs?: Spring[]
}

export interface TravelState {
  corridor: Corridor
  /** Which packs have noticed, by index. Nothing ever goes back to sleep. */
  woken: boolean[]
  /**
   * Which pack each body belongs to, by actor id.
   *
   * Springs are counted as packs past the end of the list, one each, so that
   * everything alive in a passage answers `awake` the same way. Theirs are
   * awake from the moment they are made — a body that walked out of a doorway
   * at you is not asleep — and `listen` never reaches them because it only
   * walks the packs that were written down.
   */
  belongs: Record<number, number>
  /** Where each body that came out of a spring is walking, while it still is. */
  streaming: Record<number, Vec2>
  /** What each spring has done: when the next one is due, and whether it is over. */
  springing: Array<{ timer: number; done: boolean }>
  /**
   * The door the party actually went through, once it is through one.
   *
   * Read after the walk rather than decided before it. With one way out this
   * is the only answer there was; with three it is the evening's choice, and
   * it was made by walking rather than by pressing.
   *
   * Never set while `building` is on: a walk across a whole citadel does not
   * end at a door, it carries on through it.
   */
  through: string | null
  /**
   * Whether this walk is the whole building rather than one stretch of it.
   *
   * A corridor is a thing you get to the end of; a citadel is not. With this
   * on, the party is on the building's own floor with every pack in it already
   * standing where it stands, the room they are in is read off where they are,
   * and nothing about reaching a doorway ends anything. It is the difference
   * between sixteen walks with a scene change between each and one walk.
   */
  building: boolean
}

/** How close counts as through the far door. */
export const EXIT_REACH = 90

/** What a body of trash is worth, which is a fraction of what an add is. */
const TRASH_HP = 900
const TRASH_DAMAGE = 55
const TRASH_SWING = 1.8

/** Where the party stands when it comes in, spread across the entry. */
function entryPlaces(size: RaidSize, entry: Vec2, facing: number): Vec2[] {
  // The raid's own formation, turned to face the way it is walking. The slots
  // are written for a room whose boss is at the origin and whose door is at
  // `+y`, so the same shape rotated is a party walking rather than standing.
  const c = Math.cos(facing - Math.PI / 2)
  const s = Math.sin(facing - Math.PI / 2)
  return makeSlots(size).map((slot) => ({
    x: entry.x + slot.x * c - slot.y * s,
    y: entry.y + slot.x * s + slot.y * c,
  }))
}

function makeTrash(id: number, x: number, y: number, hp: number): Actor {
  return {
    id,
    name: 'Watchman',
    classId: 'rogue',
    spec: 'assassination',
    role: 'dps',
    melee: true,
    armor: 0,
    block: 0,
    faction: 'boss',
    pos: { x, y },
    prevPos: { x, y },
    radius: 20,
    moveSpeed: 206,
    hp,
    maxHp: hp,
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
    swingTimer: TRASH_SWING,
    facing: 0,
  }
}

export function createTravelState(
  seed: number,
  party: Pick[],
  corridor: Corridor,
  difficulty: DifficultyId = 'normal',
  make: (pick: Pick, index: number, at: Vec2) => Actor,
  /**
   * Where the party already is, when it is already somewhere.
   *
   * Walking out of one stretch of ground and onto the next is one walk, so the
   * bodies do not get put anywhere: they are where the last tick left them,
   * and the ground under them changed rather than they did. Without this the
   * party was set down at the near end of whatever it walked into, which is a
   * teleport of a few hundred units every time it goes through a door — and a
   * few hundred units is what the whole of this was about.
   */
  standing?: Vec2[],
  /** Whether this is the whole building. See `TravelState.building`. */
  building = false,
): SimState {
  const size = party.length as RaidSize
  // Facing the middle of the ways out, which for a passage is the far door
  // and for a room is roughly onward. The party arrives walking, not milling.
  const aim = corridor.ways.reduce(
    (acc, way) => ({ x: acc.x + way.at.x / corridor.ways.length, y: acc.y + way.at.y / corridor.ways.length }),
    { x: 0, y: 0 },
  )
  const facing = Math.atan2(aim.y - corridor.entry.y, aim.x - corridor.entry.x)
  const places = entryPlaces(size, corridor.entry, facing)
  const actors = party.map((pick, i) => {
    const at = standing?.[i] ? { ...standing[i]! } : (places[i] ?? corridor.entry)
    // Only a body that was put here is pushed into this room. One that walked
    // in is already standing on the building's floor, and a doorway belongs to
    // the passage as much as to the room.
    if (!standing?.[i]) pushInside(corridor.room, at, PARTY_RADIUS)
    return make(pick, i, at)
  })

  const belongs: Record<number, number> = {}
  let nextId = 900
  const hp = Math.round(TRASH_HP * DIFFICULTIES[difficulty].health)
  corridor.packs.forEach((pack, index) => {
    for (let i = 0; i < pack.count; i++) {
      // Around their own spot, which is where they were put rather than where
      // a roll landed them: a pack somebody walked past yesterday is standing
      // in the same place today.
      const angle = (i / pack.count) * Math.PI * 2
      const spread = 34 + (i % 2) * 22
      const at = { x: pack.pos.x + Math.cos(angle) * spread, y: pack.pos.y + Math.sin(angle) * spread }
      // Into the room, for a walk that *is* one room. Not for a building: the
      // packs of a citadel stand in fifteen different stretches of it, and
      // pushing them into whichever room the party happens to be standing in
      // put all fifty-two of them in the doorway of the first one.
      if (!building) pushInside(corridor.room, at, 20)
      const body = makeTrash(nextId++, at.x, at.y, hp)
      belongs[body.id] = index
      actors.push(body)
    }
  })

  const threat: Record<number, number> = {}
  const tally: SimState['tally'] = {}
  for (const a of actors) {
    threat[a.id] = 0
    tally[a.id] = {
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
    mode: 'travel',
    bg: null,
    room: corridor.room,
    chamber: null,
    gauge: 0,
    held: [],
    travel: {
      corridor,
      // The written packs asleep, and one entry per spring already awake —
      // see `TravelState.belongs` for why a spring is a pack here.
      woken: [...corridor.packs.map(() => false), ...(corridor.springs ?? []).map(() => true)],
      belongs,
      streaming: {},
      // The first body out of a spring is not free: it takes as long to come
      // as every one after it, so walking in and straight back out is a walk
      // that met nobody.
      springing: (corridor.springs ?? []).map((spring) => ({ timer: spring.every, done: false })),
      through: null,
      building,
    },
    nextDoor: 0,
    only: null,
    healing: 1,
    time: 0,
    tick: 0,
    actors,
    threat,
    ground: [],
    projectiles: [],
    texts: [],
    chat: [],
    outcome: 'ongoing',
    countdown: 0,
    phase: 1,
    phaseAt: 0,
    encounter: 0,
    affix: null,
    bossFacing: facing,
    raidFlash: 0,
    nextObjectId: nextId,
    attempt: 0,
    seed,
    obstacles: [],
    party: party.map((p) => ({ ...p })),
    difficulty,
    tally,
    sounds: [],
    effects: [],
    // The three clocks a boss keeps. A corridor has no boss and no script, so
    // they are set to something that never comes round rather than left out —
    // the shape of the state is one shape, and code that reads it should not
    // have to ask which mode it is in first.
    next: {} as SimState['next'],
    nextSlam: Infinity,
    nextRaidHit: Infinity,
    imposed: null,
  }
}

/** Whatever is awake and still standing. */
export function awake(s: SimState): Actor[] {
  const travel = s.travel
  if (!travel) return []
  return s.actors.filter(
    (a) => a.faction === 'boss' && a.alive && travel.woken[travel.belongs[a.id] ?? -1] === true,
  )
}

/**
 * The door the party is heading for.
 *
 * The one the player is nearest, which is how a room with three doors is
 * answered without a menu: the raid goes where you go. With one way out the
 * question does not arise and this is that door.
 */
export function heading(s: SimState): Way | null {
  const corridor = s.travel?.corridor
  if (!corridor || corridor.ways.length === 0) return null
  const lead = s.actors.find((a) => a.isPlayer && a.alive)
  if (!lead || corridor.ways.length === 1) return corridor.ways[0]!
  let best = corridor.ways[0]!
  let near = Infinity
  for (const way of corridor.ways) {
    const d = dist(lead.pos, way.at)
    if (d < near) {
      near = d
      best = way
    }
  }
  return best
}

/**
 * How near a fight has to be before the raid is in it.
 *
 * A walk across the whole citadel has fifty-two bodies on the same floor as
 * the party, and a passage that keeps sending more comes out of a doorway the
 * length of a hall away. Without a distance, "the nearest thing that is awake"
 * is an order to charge it — twenty-five people setting off up a corridor at
 * something they can barely see, which is both the wrong answer to a stream
 * and the wrong answer to a pull.
 *
 * Measured from whoever is leading rather than from each body, so the raid
 * commits or holds together. What comes to them is fought; what is a room away
 * is walked past.
 */
const ENGAGE = 900

/** Whoever the raid is walking behind: the player, or the first still standing. */
function leader(s: SimState): Actor | null {
  return (
    s.actors.find((a) => a.isPlayer && a.alive) ??
    s.actors.find((a) => a.faction === 'party' && a.alive) ??
    null
  )
}

/** What is awake and near enough to be the raid's problem. */
function engaged(s: SimState): Actor[] {
  const lead = leader(s)
  if (!lead) return []
  const near = awake(s).filter((a) => dist(a.pos, lead.pos) <= ENGAGE)
  near.sort((a, b) => dist(a.pos, lead.pos) - dist(b.pos, lead.pos))
  return near
}


/**
 * A pack notices.
 *
 * Distance to any living body, and once. Nothing goes back to sleep: a pack
 * that lost interest would make walking away from a fight a strategy, and the
 * corridor's whole point is that what you wake you pay for.
 */
function listen(s: SimState): void {
  const travel = s.travel!
  travel.corridor.packs.forEach((pack, index) => {
    if (travel.woken[index]) return
    for (const body of livingParty(s)) {
      if (dist(body.pos, pack.pos) <= pack.pulls) {
        travel.woken[index] = true
        s.sounds.push('telegraph')
        return
      }
    }
  })
}

/** And anything that has been hit is awake, whatever the distance. */
export function wakeFor(s: SimState, victim: Actor): void {
  const travel = s.travel
  if (!travel) return
  const index = travel.belongs[victim.id]
  if (index !== undefined) travel.woken[index] = true
}

/** A body that was not there when the walk started, given the books it needs. */
function enrol(s: SimState, body: Actor): void {
  s.actors.push(body)
  s.threat[body.id] = 0
  s.tally[body.id] = {
    damage: 0,
    healing: 0,
    overhealing: 0,
    damageTaken: 0,
    mechanicHits: 0,
    byMechanic: {},
    deathAt: null,
  }
}

/**
 * The passage sends another one out.
 *
 * Deterministic to the last body: the ring they come out on is stepped by the
 * golden angle off how many are already up, so two runs of the same seed put
 * the same watchman in the same doorway at the same second. Nothing here draws
 * from the rng — a mode that spent rolls at a rate set by how long the player
 * stood still would be a mode whose replays are not replays.
 */
function springStep(s: SimState): void {
  const travel = s.travel!
  const springs = travel.corridor.springs
  if (!springs || springs.length === 0) return
  const alive = livingParty(s)
  if (alive.length === 0) return
  const hp = Math.round(TRASH_HP * DIFFICULTIES[s.difficulty].health)

  springs.forEach((spring, i) => {
    const seat = travel.springing[i]
    if (!seat || seat.done) return
    let near = Infinity
    for (const a of alive) near = Math.min(near, dist(a.pos, spring.at))
    // Walked into, and that is the end of it. Not killed empty: what turns a
    // stream off is the party being where it comes from.
    if (near <= spring.stops) {
      seat.done = true
      return
    }
    // Rooms away and it is doing nothing. Otherwise a passage the party left
    // behind an hour ago would still be filling itself up.
    if (near > spring.pulls) return

    seat.timer -= DT
    if (seat.timer > 0) return
    seat.timer = spring.every

    const mine = travel.corridor.packs.length + i
    const up = s.actors.filter((a) => a.alive && travel.belongs[a.id] === mine).length
    if (up >= spring.most) return

    // Off the count rather than off a roll, so the doorway fills evenly and
    // the same run twice is the same run.
    const angle = up * 2.39996
    const body = makeTrash(
      s.nextObjectId++,
      spring.at.x + Math.cos(angle) * 26,
      spring.at.y + Math.sin(angle) * 26,
      hp,
    )
    travel.belongs[body.id] = mine
    travel.streaming[body.id] = { ...spring.toward }
    enrol(s, body)
    s.sounds.push('telegraph')
  })
}

/** How near a streaming body has to get to be counted out of the passage. */
const STREAMED = 70

function trashStep(s: SimState): void {
  for (const body of awake(s)) {
    let nearest: Actor | null = null
    let best = Infinity
    for (const p of livingParty(s)) {
      const d = dist(body.pos, p.pos)
      if (d < best) {
        best = d
        nearest = p
      }
    }
    if (!nearest) continue
    // A body that just came out of a passage is walking out of it, not at
    // anybody. That is the difference between a stream and a spawn: they
    // arrive going somewhere, and the party is met by them rather than
    // teleported a fight. Once they are out, they are trash like any other.
    const came = s.travel!.streaming[body.id]
    if (came && dist(body.pos, came) <= STREAMED) delete s.travel!.streaming[body.id]
    const out = s.travel!.streaming[body.id] ?? null
    const going = out ?? nearest.pos
    const far = dist(body.pos, going) || 1
    // Close enough to a body is melee; close enough to a place is arrived.
    // Written out rather than left to the fact that one number happens to be
    // smaller than the other, which is how a body ends up walking on the spot
    // a hand's breadth from where it was going.
    const stop = out ? STREAMED : MELEE_RANGE
    turnToward(body, Math.atan2(going.y - body.pos.y, going.x - body.pos.x))
    if (far > stop) {
      const stepX = ((going.x - body.pos.x) / far) * body.moveSpeed * DT
      const stepY = ((going.y - body.pos.y) / far) * body.moveSpeed * DT
      body.pos.x += stepX
      body.pos.y += stepY
      holdOrFall(s, body)
      clearTerrain(s.obstacles, body.pos, body.radius, stepX, stepY)
    }
    body.swingTimer -= DT
    if (body.swingTimer <= 0 && best <= MELEE_RANGE + nearest.radius) {
      body.swingTimer = TRASH_SWING
      applyDamage(s, nearest, TRASH_DAMAGE * HEALTH, 'physical', { sourceId: body.id })
      pushEffect(s, 'impact', nearest.pos, { abilityId: 'swing', power: TRASH_DAMAGE })
    }
  }
}

/**
 * The corridor's own tick: who notices, who swings, and whether it is over.
 *
 * Over is the party through the far door with nothing awake behind it. Walking
 * out with a pack still on you is not allowed — not because it would be unfair
 * but because what it would mean is a pack arriving in the next boss's room,
 * and a boss fight with somebody else's trash in it is two fights nobody
 * tuned.
 */
/**
 * What a quiet stretch of corridor gives back, a second.
 *
 * The recovery between rooms was a flat fraction handed over for having opened
 * a door, which is the shape a thing has when nobody has decided what buys it.
 * This is what buys it: the walk itself, and only the part of it where nothing
 * is awake. A raid that clears a corridor and then walks it arrives healthier
 * than one that runs the last stretch with a pack still up — and how much
 * healthier is a decision rather than a constant.
 *
 * Small on purpose. Over a corridor's quiet half it is worth a few percent a
 * body, which is a breather rather than a heal.
 */
const CORRIDOR_MEND = 0.014

export function updateTravel(s: SimState, rng: Rng): void {
  const travel = s.travel
  if (!travel) return
  listen(s)
  springStep(s)
  trashStep(s)
  void rng

  // Nothing awake: the party is walking, and walking is when a raid catches
  // its breath. Never the dead, who are carried.
  if (awake(s).length === 0) {
    for (const a of livingParty(s)) {
      if (a.hp >= a.maxHp) continue
      a.hp = Math.min(a.maxHp, a.hp + a.maxHp * CORRIDOR_MEND * DT)
    }
  }

  const alive = livingParty(s)
  if (alive.length === 0) {
    s.outcome = 'wipe'
    s.sounds.push('wipe')
    return
  }
  if (awake(s).length > 0) return
  // A walk across the whole building does not finish. There is nowhere it is
  // trying to get to: the party is somewhere in a citadel and stays there
  // until something in it stops them.
  if (travel.building) return
  // Everybody through the same door, rather than whoever got there first: a
  // passage left behind by half a party is a party in two rooms, which is the
  // one state the citadel does not model — and with several doors, half a
  // party through each is two evenings.
  for (const way of travel.corridor.ways) {
    if (!alive.every((a) => dist(a.pos, way.at) <= EXIT_REACH)) continue
    travel.through = way.to
    s.outcome = 'victory'
    s.sounds.push('victory')
    return
  }
}

// --- the party, walking ------------------------------------------------------

/** How far from the exit a body stands while it waits for the rest. */
const GATHER = 60

/**
 * How much wider the raid stands when it is only walking.
 *
 * The fight formation, opened out. Twenty-five people crossing a citadel in a
 * sixty-unit huddle is not a raid moving, it is a raid stuck in a doorway —
 * and it was one thing on the screen: a knot of tokens with two or three
 * visible and everybody else underneath. Walking is the one time nothing is
 * being aimed at them, so it is the one time they can afford to take up room.
 */
const MARCH_SPREAD = 1.8

/**
 * Where one body walks, which is its own place in the marching order.
 *
 * The raid's own formation, opened out and turned to face the way it is going,
 * hung off whoever is leading rather than off the room — so it holds its shape
 * through a doorway and across a room that is not the one it started in.
 *
 * Measured from the leader's own slot rather than from the middle of the
 * formation, so that the body everybody is following does not walk away from
 * itself.
 *
 * Turned by the leader and not by the door. It was the door first, and what
 * that produces is a raid that swings round the moment the player is nearer a
 * different one: the formation was arranged about a point on the wall rather
 * than about the walk, and in a room with several ways out it turned while
 * nobody was turning. The leader already faces the way they are walking, so
 * their bearing is the walk's bearing and costs nothing to read.
 */
function station(s: SimState, actor: Actor, lead: Actor): Vec2 {
  const slots = makeSlots(s.party.length as RaidSize)
  const mine = slots[actor.id - 1]
  const theirs = slots[lead.id - 1]
  if (!mine || !theirs || actor.id === lead.id) return lead.pos
  const aim = lead.facing
  const c = Math.cos(aim - Math.PI / 2)
  const sn = Math.sin(aim - Math.PI / 2)
  const dx = (mine.x - theirs.x) * MARCH_SPREAD
  const dy = (mine.y - theirs.y) * MARCH_SPREAD
  return { x: lead.pos.x + dx * c - dy * sn, y: lead.pos.y + dx * sn + dy * c }
}

function cast(s: SimState, actor: Actor, id: string, targetId: number, rng: Rng, moving: boolean): boolean {
  const ability = ABILITIES[id]
  if (!ability) return false
  if (moving && ability.castTime > 0) return false
  return beginCast(s, actor, id, targetId, rng)
}

function mostHurt(s: SimState): Actor | null {
  let best: Actor | null = null
  let ratio = Infinity
  for (const a of livingParty(s)) {
    const r = a.hp / a.maxHp
    if (r < ratio) {
      ratio = r
      best = a
    }
  }
  return best
}

/**
 * What a body does in a corridor.
 *
 * A rotation rather than *the* rotation. The raid AI is built around a boss —
 * a thing to stand at a range from, whose mechanics are the reason to move —
 * and none of that exists here. What is left is the shape a battleground
 * already uses: hit the nearest thing, heal whoever is worst, and otherwise
 * walk.
 *
 * The party follows the player rather than the exit whenever there is one. A
 * corridor is the one place in this game where the person is in front and the
 * AI is behind, and a party that walked to the far door on its own would be a
 * party that pulled the corridor for you.
 *
 * And in a building it follows the player or nobody at all. A single stretch
 * of held ground is a thing that has to be crossed — with nobody driving,
 * walking to the far door is the only way it ever ends — but a citadel is not
 * going anywhere, and a leaderless raid that set off for the nearest door
 * would be a raid touring the building by itself.
 */
export function updateTravelAi(s: SimState, actor: Actor, rng: Rng): void {
  const ai = actor.ai
  if (!ai || !actor.alive || !s.travel) return
  ai.chatCooldown = Math.max(0, ai.chatCooldown - DT)

  const foes = engaged(s)
  let target: Actor | null = null
  let best = Infinity
  for (const foe of foes) {
    const d = dist(actor.pos, foe.pos)
    if (d < best) {
      best = d
      target = foe
    }
  }

  const player = s.actors.find((a) => a.isPlayer && a.alive) ?? null
  // Whoever the raid is walking behind, for a building: the player, or the
  // first of them still standing when there is none. A raid with nobody
  // leading walked at the door itself, which put every one of them on the
  // same point.
  const lead = leader(s)
  // The formation is for crossing a building, where nothing has to arrive
  // anywhere together. A single stretch of held ground is over when everybody
  // is through the far door at once, and a raid strung out in marching order
  // never is — so a corridor keeps the huddle it was measured with, following
  // the player if there is one and the way out if there is not.
  const marching = s.travel.building && lead !== null && actor.id !== lead.id
  const want = target
    ? standAt(s, actor, target)
    : marching
      ? follow(s, actor, station(s, actor, lead!), 24)
      : player
        ? follow(s, actor, player.pos)
        : s.travel.building
          ? actor.pos
          : follow(s, actor, heading(s)?.at ?? actor.pos)
  moveToward(s, actor, want)

  const moving = ai.moveTarget !== null
  if (actor.castId || actor.gcd > 0) return
  const kit = specOf({ classId: actor.classId, spec: actor.spec }).abilities

  if (actor.role === 'healer') {
    const hurt = mostHurt(s)
    if (hurt && hurt.hp / hurt.maxHp < 0.8) {
      if (kit.finisher && hurt.hp / hurt.maxHp < 0.45) {
        if (cast(s, actor, kit.finisher, hurt.id, rng, moving)) return
      }
      if (cast(s, actor, kit.filler, hurt.id, rng, moving)) return
    }
    if (kit.attack && target) cast(s, actor, kit.attack, target.id, rng, moving)
    return
  }
  if (!target) return
  if (kit.overTime) {
    const dot = getAura(target, kit.overTime as Parameters<typeof getAura>[1])
    if (!dot || dot.remaining < 3) {
      if (cast(s, actor, kit.overTime, target.id, rng, moving)) return
    }
  }
  if (kit.finisher && cast(s, actor, kit.finisher, target.id, rng, moving)) return
  cast(s, actor, kit.filler, target.id, rng, moving)
}

/** Where to stand to fight this: in its face, or at the range you shoot from. */
function standAt(s: SimState, actor: Actor, target: Actor): Vec2 {
  const reach = actor.melee || actor.role === 'tank' ? MELEE_RANGE * 0.8 : 220
  const d = dist(actor.pos, target.pos) || 1
  if (Math.abs(d - reach) < 40) return actor.pos
  const t = (d - reach) / d
  const want = { x: actor.pos.x + (target.pos.x - actor.pos.x) * t, y: actor.pos.y + (target.pos.y - actor.pos.y) * t }
  // Into the room, for a walk that is one room. Not for a building — the same
  // rule `follow` has, and it was missing here, which is worse than it sounds:
  // the player walks up the passage, the pack that comes out of it is a room
  // away from the room the raid is standing in, and every one of them clamped
  // their answer back through the wall. The raid held the entrance hall while
  // the person they were following was killed forty feet away.
  if (s.travel?.building !== true) pushInside(s.room, want, actor.radius)
  return want
}

/** Behind whoever is leading, at the distance a party walks at. */
function follow(s: SimState, actor: Actor, lead: Vec2, close = GATHER): Vec2 {
  const d = dist(actor.pos, lead)
  if (d <= close) return actor.pos
  const t = (d - close * 0.6) / d
  const want = { x: actor.pos.x + (lead.x - actor.pos.x) * t, y: actor.pos.y + (lead.y - actor.pos.y) * t }
  // Into the room, for a walk that is one room. Not for a building: clamping
  // where somebody is *going* to the room they are currently in is a party
  // that cannot follow its leader through a door.
  if (s.travel?.building !== true) pushInside(s.room, want, actor.radius)
  return want
}

function moveToward(s: SimState, actor: Actor, target: Vec2 | null): void {
  if (!target) return
  const d = dist(actor.pos, target)
  const step = actor.moveSpeed * DT * hasteOf(actor)
  // A step, not six units — see the same window in `ai.ts` for what a fixed
  // one costs once a step is bigger than it.
  if (d < Math.max(6, step)) {
    actor.ai!.moveTarget = null
    return
  }
  actor.ai!.moveTarget = { x: target.x, y: target.y }
  const stepX = ((target.x - actor.pos.x) / d) * step
  const stepY = ((target.y - actor.pos.y) / d) * step
  // Facing the way it is walking. Nothing turned a body while it walked, so a
  // raid crossing a citadel faced whatever it happened to be facing when the
  // walk began — sideways, mostly. The six-unit deadzone above is what keeps
  // this steady: a body that has arrived stops rather than shuffling, so the
  // bearing it turns to is a walk rather than a correction.
  turnToward(actor, Math.atan2(stepY, stepX))
  actor.pos.x += stepX
  actor.pos.y += stepY
  holdOrFall(s, actor)
  clearTerrain(s.obstacles, actor.pos, actor.radius, stepX, stepY)
  if (actor.castId) interruptCast(s, actor, 'moved')
}

/** Whether a corridor can be crossed without waking anything, which it must not. */
export function unguarded(corridor: Corridor): boolean {
  // Every way out, because a corridor is only guarded if it is guarded
  // whichever door you are making for.
  return corridor.ways.some((way) => {
    const along = { x: way.at.x - corridor.entry.x, y: way.at.y - corridor.entry.y }
    for (let i = 0; i <= 40; i++) {
      const at = { x: corridor.entry.x + (along.x * i) / 40, y: corridor.entry.y + (along.y * i) / 40 }
      if (corridor.packs.some((pack) => dist(at, pack.pos) <= pack.pulls)) return false
    }
    return true
  })
}

/** Packs whose reach overlaps, which is the corridor's one mistake to make. */
export function overlapping(corridor: Corridor): Array<[number, number]> {
  const pairs: Array<[number, number]> = []
  corridor.packs.forEach((a, i) => {
    corridor.packs.forEach((b, j) => {
      if (j <= i) return
      if (dist(a.pos, b.pos) < a.pulls + b.pulls) pairs.push([i, j])
    })
  })
  return pairs
}

/** Whether anything was put inside a wall. */
export function packsPlaced(corridor: Corridor, obstacles: SimState['obstacles']): boolean {
  return corridor.packs.every(
    (pack) => !inTerrain(obstacles, pack.pos, 40) && pushedInside(corridor.room, pack.pos),
  )
}

function pushedInside(room: RoomShape, pos: Vec2): boolean {
  const at = { x: pos.x, y: pos.y }
  pushInside(room, at, 40)
  return Math.abs(at.x - pos.x) < 0.001 && Math.abs(at.y - pos.y) < 0.001
}

/** The yardstick corridor, for anything that needs one before the map has any. */
export const PLAIN_CORRIDOR: Corridor = {
  id: 'plain',
  room: ROUND_ARENA,
  entry: { x: 0, y: 700 },
  ways: [{ to: 'plain', at: { x: 0, y: -700 } }],
  packs: [{ pos: { x: 0, y: 200 }, count: 4, pulls: 260 }],
}
