import { ARENA_RADIUS, DT } from './constants'
import type { Rng } from './rng'
import { dist } from './combat'
import type {
  Actor,
  BgCart,
  BgFlag,
  BgKind,
  BgRally,
  BgState,
  Obstacle,
  SimState,
  Team,
  Vec2,
} from './types'

/**
 * The battlegrounds.
 *
 * Both of them are the same fight — ten of the same classes, the same damage
 * path — with a different sentence at the top about what winning is. That is
 * the whole design: a boss is a script you learn, and a battleground is five
 * people you cannot predict, so the rules have to supply the shape the script
 * used to.
 *
 * Blue is always the player's team. Red stands where the boss did, in the
 * faction sense, because the damage path already knows how to credit a hit
 * against that side and how to leave its dead out of the party frames.
 */

/** Capture points, spread so that no two are defensible from one spot. */
const NODE_POSITIONS: Vec2[] = [
  { x: 0, y: -250 },
  { x: -240, y: 180 },
  { x: 240, y: 180 },
]

export const NODE_RADIUS = 105

/**
 * How fast a point turns over, per second, with one person on it.
 *
 * Four seconds from neutral to held. Long enough that walking over a point on
 * the way somewhere else does not take it, short enough that a defender who
 * dies has actually lost something.
 */
const CAPTURE_RATE = 0.25

/** Extra rate per additional body, capped: a zerg is faster, not instant. */
const CAPTURE_CROWD = 0.06
const CAPTURE_CROWD_MAX = 0.18

/** Points per second, per point held. */
const CONQUEST_TICK = 1.6
const CONQUEST_TARGET = 400
const CONQUEST_LIMIT = 300

export const BASE_RADIUS = 80
export const FLAG_PICKUP = 46
/**
 * How long a dropped flag waits before returning itself.
 *
 * Was fifteen, which is a long time to spend unable to score when the rule is
 * that you cannot score while yours is out. Five keeps a dropped flag worth
 * running to without letting one loose flag lock the match.
 */
const FLAG_RESET = 5

/**
 * How long an enemy has to stand on a flag at home before it comes off.
 *
 * See `BgFlag.taking`. Short enough that an undefended flag is still gone —
 * this is not a second capture point — and long enough that somebody standing
 * there is a reason to bring more people.
 */
export const FLAG_TAKE = 2.5

/**
 * How many captures win it, and how long before the score decides.
 *
 * Three and three hundred and sixty, until the harness was asked how long a
 * match actually took: forty-five seconds. The limit was not a limit, it was a
 * number no match ever reached, and a map with a clock nobody can run out is a
 * map with no reason to hurry. Four and a hundred and eighty are both reachable
 * — a side that cannot cap has to stop the other one before the clock does.
 */
const FLAG_TARGET = 4
const FLAG_LIMIT = 180

/**
 * Seconds on your back before you are up again at your own base.
 *
 * It grows across the match rather than sitting still. Every second of a
 * battleground used to cost exactly what every other second cost, which is
 * what made the last minute of one indistinguishable from the first: a fight
 * lost at ten seconds and the same fight lost at two hundred and ninety were
 * both worth twelve seconds of walking. A death late is meant to be the one
 * you cannot take back.
 */
const RESPAWN_EARLY = 10
const RESPAWN_LATE = 17

/** What losing the rally does to a respawn, while the penalty lasts. */
const SLOWED_MULTIPLIER = 2

/**
 * When the rally lands, and how long it is worth standing there, per mode.
 *
 * Seconds rather than a fraction of the time limit, because two of the three
 * limits are not what their matches run to. A flag match finishes around
 * forty-five seconds against a limit of three hundred and sixty, so a rally
 * placed at forty-five percent of the limit landed a hundred and twenty
 * seconds after the match it was supposed to interrupt had already ended —
 * the mechanic was in the build, in the state and in the AI, and the only
 * thing the numbers showed was that nothing had changed.
 *
 * These come off the harness's own match lengths: a little before the halfway
 * point of a typical one, with a window sized so that it is an interruption
 * rather than the match. They are worth re-reading whenever a mode's pace
 * moves, and the reason they are one table instead of one number is that
 * these three paces have never been alike.
 */
const RALLY_SCHEDULE: Record<BgKind, { at: number; window: number }> = {
  conquest: { at: 85, window: 30 },
  escort: { at: 50, window: 26 },
  flags: { at: 38, window: 20 },
}

/**
 * How long before it counts that it can be seen and answered.
 *
 * `telegraph` on the rally counts all the way down from the start of the
 * match, because it is one clock and a second one would be a second thing to
 * keep honest. This is the part of that countdown that is the warning: below
 * it the circle is drawn and the AI starts walking, above it there is nothing
 * on the floor at all. Long enough to cross the map, which is the point of it.
 */
export const RALLY_TELEGRAPH = 9

export const RALLY_RADIUS = 120

/**
 * How far the bar has to lean before it counts as somebody's.
 *
 * A capture point has to be taken outright, because it pays by the second for
 * as long as it is held and a point that paid for being nearly held would pay
 * both sides at once. The rally pays once, at the end, so what it has to
 * answer is a different question — not "who owns this" but "who had the better
 * of it" — and requiring the full bar answered neither: four against four
 * never produces the numbers advantage the bar moves on, so half of all
 * rallies expired untouched at dead level and the mechanic did nothing at all.
 *
 * A deadband rather than a bare sign, so that a genuine standstill still pays
 * nobody. Two sides that spent the window holding each other off have bought
 * the same nothing, and that is the price of not winning rather than a bug.
 */
const RALLY_DECIDED = 0.12

/** Seconds of doubled respawn the losing side owes afterwards. */
const RALLY_PENALTY = 45

/**
 * What winning it is worth, in the currency the mode already counts.
 *
 * The respawn penalty alone was not worth leaving the map for, and the harness
 * said so plainly: a stand-in that ignored the rally entirely and kept playing
 * the objective won more than eight matches in ten, because one extra body on
 * the board for thirty seconds beats making the other side walk further later.
 * A mechanic whose correct answer is to ignore it is not a decision, it is a
 * tax on whoever reads the screen.
 *
 * So it pays now, and the penalty is what it pays on top. Sized against what
 * the thirty seconds cost: a conquest board pays 4.8 a second with everything
 * held, so seventy is about fifteen seconds of a full board; a cart moves
 * about 1.1% of its track a second, so 0.18 is sixteen seconds of pushing.
 * A flag match has no rate to compare against — a capture is the only unit it
 * has — so it pays one, and a third of a match is what a scheduled fight in
 * the middle of a short one is worth.
 */
const RALLY_POINTS = 70
const RALLY_PUSH = 0.18

/**
 * How far off the middle it sits.
 *
 * On x = 0 so it is the same walk for both sides, and never at the origin: the
 * fight already happens in the middle of these maps — the harness measures the
 * centroid of everyone standing wandering inside a radius of about forty on a
 * floor nine hundred across — so a contest placed there would be a contest for
 * the ground everybody was on anyway.
 */
const RALLY_OFFSET_MIN = 170
const RALLY_OFFSET_MAX = 285

const BASES: Record<Team, Vec2> = {
  blue: { x: -ARENA_RADIUS + 90, y: 0 },
  red: { x: ARENA_RADIUS - 90, y: 0 },
}

/** Whether this actor is currently carrying the other team's flag. */
export function carrying(s: SimState, actor: Actor): boolean {
  const bg = s.bg
  if (!bg || bg.kind !== 'flags') return false
  return bg.flags.blue.carrierId === actor.id || bg.flags.red.carrierId === actor.id
}

/**
 * What carrying it costs.
 *
 * Nothing, before this — so a carrier was no easier to catch than anyone else,
 * and with both flags out almost permanently neither side could ever score.
 * A carrier is slower and takes more, which is what turns "kill the carrier"
 * from a suggestion into something that happens.
 */
export const CARRIER_SPEED = 0.82
export const CARRIER_FRAGILITY = 1.25

/**
 * The terrain, rolled per match.
 *
 * Mirrored across the vertical axis rather than scattered freely. Both maps
 * are left-right symmetric — two bases facing each other, three points in an
 * isosceles triangle — so a rock that exists on one side and not the other is
 * a rock that favours a team, and no amount of measuring afterwards would tell
 * you which match it decided. A pair either side costs nothing and settles it.
 *
 * The gaps are the part that matters. Rocks are kept apart from each other by
 * more than a body is wide, and away from the arena wall by the same, because
 * two rocks that touch make a concave shape and concave shapes need
 * path-finding — which nothing here has. Sliding round a circle always ends;
 * sliding into the crease between two of them does not.
 */
const ROCK_MIN = 38
const ROCK_MAX = 74

/** A body is 17 across, so this is comfortably more than one abreast. */
const LANE = 64

function rollTerrain(
  kind: BgKind,
  bases: Record<Team, Vec2>,
  nodes: Vec2[],
  rally: Vec2,
  rng: Rng,
): Obstacle[] {
  const rocks: Obstacle[] = []
  // A flag map is mostly a corridor and wants fewer, larger blocks; a capture
  // map has three places to be and can carry more between them.
  const pairs = kind === 'flags' ? 2 : 2 + rng.int(2)
  const centre = rng.chance(0.6)

  const fits = (pos: Vec2, radius: number): boolean => {
    // Inside the floor, with a lane to spare against the wall.
    if (Math.hypot(pos.x, pos.y) + radius > ARENA_RADIUS - LANE) return false
    // Never on something that has to be stood on.
    for (const node of nodes) {
      if (dist(pos, node) < NODE_RADIUS + radius + 24) return false
    }
    if (dist(pos, rally) < RALLY_RADIUS + radius + 24) return false
    for (const team of ['blue', 'red'] as const) {
      if (dist(pos, bases[team]) < BASE_RADIUS + radius + LANE) return false
    }
    // And a lane between it and everything already placed.
    for (const rock of rocks) {
      if (dist(pos, rock.pos) < rock.radius + radius + LANE) return false
    }
    return true
  }

  const place = (pos: Vec2, radius: number): boolean => {
    if (!fits(pos, radius)) return false
    rocks.push({ pos: { x: pos.x, y: pos.y }, radius })
    return true
  }

  if (centre) {
    for (let tries = 0; tries < 12; tries++) {
      const radius = rng.range(ROCK_MIN, ROCK_MAX)
      if (place({ x: 0, y: rng.range(-260, 260) }, radius)) break
    }
  }

  for (let pair = 0; pair < pairs; pair++) {
    for (let tries = 0; tries < 24; tries++) {
      const radius = rng.range(ROCK_MIN, ROCK_MAX)
      // Off the axis by at least a lane, or the pair would overlap itself.
      const x = rng.range(LANE, ARENA_RADIUS - LANE * 2)
      const y = rng.range(-ARENA_RADIUS + LANE, ARENA_RADIUS - LANE)
      const right = { x, y }
      const left = { x: -x, y }
      if (!fits(right, radius) || !fits(left, radius)) continue
      if (dist(right, left) < radius * 2 + LANE) continue
      place(right, radius)
      place(left, radius)
      break
    }
  }

  // A map with nothing on it is a fine roll; one with a wall across it is not,
  // and the lane rules above are what stop the second from happening.
  //
  // Nothing is trimmed after the fact. Capping the list once meant cutting a
  // pair in half, which left a rock on one side of the map with nothing facing
  // it — the exact thing the mirroring is for.
  return rocks
}

/**
 * Puts a body back outside any terrain it has walked into, and slides it.
 *
 * Pushing it back to the surface is not enough on its own. Pushing is along
 * the radius, so a body walking straight at the centre of a rock loses its
 * whole step to the push and stands there re-walking into it: thirty seconds
 * of that, in the check, without covering a quarter of the distance.
 *
 * So the leftover part of the step is redirected along the surface. Whichever
 * way round the rock the step already leaned wins, and dead-on ties go one
 * fixed way rather than nowhere — an arbitrary choice, but it has to be made
 * or the tie is a wall. That is the whole of the path-finding, and it is
 * enough because every rock here is convex: sliding along one always ends.
 */
export function clearTerrain(
  bg: BgState | null,
  pos: Vec2,
  radius: number,
  moveX = 0,
  moveY = 0,
): void {
  if (!bg) return
  for (const rock of bg.obstacles) {
    const dx = pos.x - rock.pos.x
    const dy = pos.y - rock.pos.y
    const gap = Math.hypot(dx, dy)
    const least = rock.radius + radius
    if (gap >= least) continue

    // Dead centre has no direction to be pushed in; pick one rather than
    // dividing by zero.
    if (gap < 0.001) {
      pos.x = rock.pos.x + least
      continue
    }

    const nx = dx / gap
    const ny = dy / gap
    pos.x = rock.pos.x + nx * least
    pos.y = rock.pos.y + ny * least

    const step = Math.hypot(moveX, moveY)
    if (step < 0.0001) continue

    // The surface, at right angles to the push. Sign by which way the step was
    // already going; a step straight at the centre has no lean, and takes the
    // positive one.
    const tx = -ny
    const ty = nx
    const lean = moveX * tx + moveY * ty
    const dir = lean >= 0 ? 1 : -1
    // How much of the step was spent being pushed back out, returned along the
    // surface instead of thrown away.
    const spent = Math.min(step, least - gap)
    pos.x += tx * dir * spent
    pos.y += ty * dir * spent
  }
}

/** Whether a point is inside terrain, for placement and for checks. */
export function inTerrain(bg: BgState | null, pos: Vec2, radius = 0): boolean {
  if (!bg) return false
  return bg.obstacles.some(
    (rock) => Math.hypot(pos.x - rock.pos.x, pos.y - rock.pos.y) < rock.radius + radius,
  )
}

export function teamOf(actor: Actor): Team {
  return actor.faction === 'party' ? 'blue' : 'red'
}

export function other(team: Team): Team {
  return team === 'blue' ? 'red' : 'blue'
}

/** Everyone still standing on a side, the player included. */
export function living(s: SimState, team: Team): Actor[] {
  return s.actors.filter((a) => a.alive && teamOf(a) === team)
}

/** How close you have to be to push, and how close they have to be to stop it. */
export const CART_RADIUS = 105

/**
 * Units a second with one person on it.
 *
 * Slow enough that the match is the fight rather than the walk: at the first
 * figure a cart crossed the whole map in thirty-five seconds and a game ended
 * inside a minute, which is a footrace with some hitting in it.
 */
const CART_SPEED = 8
/** Each extra body adds this much, up to a cap: a crowd is faster, not instant. */
const CART_CROWD = 1.6
const CART_CROWD_MAX = 5

const ESCORT_LIMIT = 300

function cartFor(team: Team, bases: Record<Team, Vec2>): BgCart {
  return {
    team,
    pos: { ...bases[team] },
    progress: 0,
    contested: false,
    pushers: 0,
  }
}

/** Where a cart sits at a given progress: a straight line between the bases. */
function cartPath(bg: BgState, team: Team, progress: number): Vec2 {
  const from = bg.bases[team]
  const to = bg.bases[other(team)]
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  }
}

export function createBattleground(kind: BgKind, rng: Rng): BgState {
  const bases: Record<Team, Vec2> = {
    blue: { ...BASES.blue },
    red: { ...BASES.red },
  }
  const nodes = kind === 'conquest' ? NODE_POSITIONS : []
  const timeLimit =
    kind === 'conquest' ? CONQUEST_LIMIT : kind === 'flags' ? FLAG_LIMIT : ESCORT_LIMIT

  // Rolled before the terrain, so the terrain can be told to keep off it. The
  // other way round would put a rock in the middle of the one circle both
  // teams are about to be told to stand in.
  const rally: BgRally = {
    pos: {
      x: 0,
      y: (rng.chance(0.5) ? 1 : -1) * rng.range(RALLY_OFFSET_MIN, RALLY_OFFSET_MAX),
    },
    radius: RALLY_RADIUS,
    telegraph: RALLY_SCHEDULE[kind].at,
    remaining: RALLY_SCHEDULE[kind].window,
    progress: 0,
    owner: null,
    contested: false,
    settled: false,
  }

  return {
    kind,
    score: { blue: 0, red: 0 },
    target: kind === 'conquest' ? CONQUEST_TARGET : kind === 'flags' ? FLAG_TARGET : 1,
    timeLimit,
    rally,
    slowed: { blue: 0, red: 0 },
    obstacles: rollTerrain(kind, bases, nodes, rally.pos, rng),
    carts:
      kind === 'escort'
        ? { blue: cartFor('blue', bases), red: cartFor('red', bases) }
        : null,
    nodes:
      kind === 'conquest'
        ? NODE_POSITIONS.map((pos, i) => ({
            id: i,
            pos: { ...pos },
            radius: NODE_RADIUS,
            progress: 0,
            owner: null,
            contested: false,
            contestedFor: 0,
          }))
        : [],
    flags:
      kind === 'flags'
        ? {
            blue: flagAtHome('blue'),
            red: flagAtHome('red'),
          }
        : { blue: flagAtHome('blue'), red: flagAtHome('red') },
    bases,
    respawn: {},
    plan: {
      blue: { cooldown: 0, reading: '', target: -1, defenders: 0 },
      red: { cooldown: 0, reading: '', target: -1, defenders: 0 },
    },
    assignment: {},
    objectives: {},
  }
}

function flagAtHome(team: Team): BgFlag {
  return {
    team,
    state: 'home',
    pos: { ...BASES[team] },
    carrierId: null,
    dropTimer: 0,
    taking: 0,
  }
}

/** Where a team's people start, and come back to. */
export function spawnPoint(bg: BgState, team: Team, index: number): Vec2 {
  const base = bg.bases[team]
  const spread = (index - 2) * 34
  return { x: base.x, y: base.y + spread }
}

export function updateBattleground(s: SimState): void {
  const bg = s.bg
  if (!bg) return

  updateRespawns(s, bg)
  updateRally(s, bg)
  if (bg.kind === 'conquest') updateNodes(s, bg)
  else if (bg.kind === 'escort') updateCarts(s, bg)
  else updateFlags(s, bg)

  resolve(s, bg)
}

/**
 * Team order for this tick, alternating.
 *
 * Whoever is checked first wins every tie, and in a symmetric match ties are
 * not rare events — both teams leave their base at the same moment and reach
 * the other flag on the same tick. Blue went first everywhere, took the flag
 * first, and since you cannot capture while your own flag is out, red spent
 * the rest of the match carrying something it could never score. Ninety
 * percent of matches went to whichever side the loops happened to name first.
 *
 * Alternating by tick keeps it deterministic — the same seed still replays —
 * while making "first" a coin that is not always the same coin.
 */
function order(s: SimState): readonly [Team, Team] {
  return s.tick % 2 === 0 ? (['blue', 'red'] as const) : (['red', 'blue'] as const)
}

/**
 * The dead come back rather than staying down.
 *
 * A raid wipes; a battleground does not. Without respawns the first team to
 * win a fight wins the match, and every objective after that is a formality —
 * which is a deathmatch with extra reading.
 */
/**
 * How long this one stays down.
 *
 * Two things move it. The clock, so that the same death costs more the later
 * it happens and the last fight of a match is the one worth winning; and the
 * rally, whose loser walks twice as far for as long as the penalty lasts.
 */
function respawnDelay(s: SimState, bg: BgState, team: Team): number {
  const through = Math.min(1, s.time / bg.timeLimit)
  const base = RESPAWN_EARLY + (RESPAWN_LATE - RESPAWN_EARLY) * through
  return bg.slowed[team] > 0 ? base * SLOWED_MULTIPLIER : base
}

/**
 * The rally, counting down and then counting bodies.
 *
 * Held exactly as a capture point is — numbers on the circle, a crowd is
 * faster, an even fight freezes it — because it is the same act and the player
 * has already learned that one on the capture map. What differs is that it is
 * on a clock everybody can see, it is somewhere nobody would otherwise be, and
 * it pays once.
 */
function updateRally(s: SimState, bg: BgState): void {
  for (const team of ['blue', 'red'] as const) {
    if (bg.slowed[team] > 0) bg.slowed[team] = Math.max(0, bg.slowed[team] - DT)
  }

  const rally = bg.rally
  if (rally.settled) return

  if (rally.telegraph > 0) {
    rally.telegraph -= DT
    // The same warning a boss gives before it puts something on the floor.
    if (rally.telegraph <= 0) s.sounds.push('telegraph')
    return
  }

  const near = (team: Team): number =>
    living(s, team).filter((a) => dist(a.pos, rally.pos) <= rally.radius).length
  const blue = near('blue')
  const red = near('red')

  rally.contested = blue > 0 && red > 0
  const lead = blue - red
  if (lead !== 0) {
    const crowd = Math.abs(lead) - 1
    let rate = CAPTURE_RATE + Math.min(CAPTURE_CROWD_MAX, crowd * CAPTURE_CROWD)
    if (rally.contested) rate *= 0.5
    const toward = lead > 0 ? 1 : -1
    rally.progress = Math.max(-1, Math.min(1, rally.progress + toward * rate * DT))
  }

  rally.owner =
    rally.progress >= RALLY_DECIDED ? 'blue' : rally.progress <= -RALLY_DECIDED ? 'red' : null

  rally.remaining -= DT
  if (rally.remaining > 0) return

  // It pays whoever finished holding it, and pays nobody if it ended level.
  // Nobody is a real outcome here: two sides that fought each other to a
  // standstill on it have spent the same thirty seconds and bought the same
  // nothing, which is the price of not winning rather than a bug.
  rally.settled = true
  if (rally.owner) {
    bg.slowed[other(rally.owner)] = RALLY_PENALTY
    award(bg, rally.owner)
    s.sounds.push('phase')
  }
}

/** The rally's payout, in whatever the mode counts. */
function award(bg: BgState, team: Team): void {
  if (bg.kind === 'conquest') {
    bg.score[team] += RALLY_POINTS
    return
  }
  if (bg.kind === 'escort' && bg.carts) {
    const cart = bg.carts[team]
    cart.progress = Math.min(1, cart.progress + RALLY_PUSH)
    cart.pos = cartPath(bg, team, cart.progress)
    return
  }
  bg.score[team] += 1
}

function updateRespawns(s: SimState, bg: BgState): void {
  for (const a of s.actors) {
    if (a.alive) {
      delete bg.respawn[a.id]
      continue
    }
    if (bg.respawn[a.id] === undefined) {
      bg.respawn[a.id] = respawnDelay(s, bg, teamOf(a))
      continue
    }
    bg.respawn[a.id]! -= DT
    if (bg.respawn[a.id]! > 0) continue

    const team = teamOf(a)
    const index = s.actors.filter((o) => teamOf(o) === team).indexOf(a)
    const at = spawnPoint(bg, team, Math.max(0, index))
    a.alive = true
    // A fresh body has no unfinished business: whatever it was walking to is
    // half a map away and probably resolved without it.
    delete bg.assignment[a.id]
    a.hp = a.maxHp
    a.power = a.maxPower
    a.auras.length = 0
    a.castId = null
    a.castRemaining = 0
    a.gcd = 0
    a.pos.x = at.x
    a.pos.y = at.y
    a.prevPos.x = at.x
    a.prevPos.y = at.y
    delete bg.respawn[a.id]
  }
}

function updateNodes(s: SimState, bg: BgState): void {
  for (const node of bg.nodes) {
    const blue = living(s, 'blue').filter((a) => dist(a.pos, node.pos) <= node.radius).length
    const red = living(s, 'red').filter((a) => dist(a.pos, node.pos) <= node.radius).length

    node.contested = blue > 0 && red > 0
    node.contestedFor = node.contested ? node.contestedFor + DT : 0
    if (blue === 0 && red === 0) continue

    // Numbers count on a contested point rather than freezing it. Freezing it
    // meant a fight on the circle stopped the circle, and with a healer on
    // each side those fights do not resolve: the bar sat still for a third of
    // every match and pushing harder changed nothing anybody could see.
    // Even numbers still stop it — that is a fight, not a capture — but three
    // against one moves, at half speed, because bringing more people is
    // supposed to be the answer to a point you do not hold.
    const lead = blue - red
    if (lead === 0) continue

    const crowd = Math.abs(lead) - 1
    let rate = CAPTURE_RATE + Math.min(CAPTURE_CROWD_MAX, crowd * CAPTURE_CROWD)
    if (node.contested) rate *= 0.5
    const toward = lead > 0 ? 1 : -1
    node.progress = Math.max(-1, Math.min(1, node.progress + toward * rate * DT))

    // A point pays only at the extreme, so taking one off the other team
    // costs the whole bar rather than a fraction of it — and the moment it
    // leaves that extreme it stops paying anybody, which is what makes a
    // defender worth leaving behind.
    node.owner = node.progress >= 1 ? 'blue' : node.progress <= -1 ? 'red' : null
  }

  for (const team of order(s)) {
    const owned = bg.nodes.filter((n) => n.owner === team).length
    if (owned > 0) bg.score[team] += owned * CONQUEST_TICK * DT
  }
}

function updateFlags(s: SimState, bg: BgState): void {
  const teams = order(s)
  for (const team of teams) {
    const flag = bg.flags[team]

    if (flag.state === 'carried') {
      const carrier = s.actors.find((a) => a.id === flag.carrierId)
      if (!carrier || !carrier.alive) {
        // Dropped where they fell, and it walks itself home if nobody comes.
        flag.state = 'dropped'
        flag.carrierId = null
        flag.dropTimer = FLAG_RESET
      } else {
        flag.pos.x = carrier.pos.x
        flag.pos.y = carrier.pos.y
      }
    }

    if (flag.state === 'dropped') {
      flag.dropTimer -= DT
      if (flag.dropTimer <= 0) {
        flag.state = 'home'
        flag.pos = { ...bg.bases[team] }
        flag.taking = 0
        continue
      }
    }

    if (flag.state === 'dropped') {
      for (const a of living(s, teams[0]).concat(living(s, teams[1]))) {
        if (dist(a.pos, flag.pos) > FLAG_PICKUP) continue

        // Your own flag on the floor goes straight back; theirs is picked up
        // on touch, because whoever is standing over it has already won the
        // fight that put it there.
        if (teamOf(a) === team) {
          flag.state = 'home'
          flag.pos = { ...bg.bases[team] }
          flag.taking = 0
          bg.objectives[a.id] = (bg.objectives[a.id] ?? 0) + 1
          break
        }
        flag.state = 'carried'
        flag.carrierId = a.id
        flag.pos.x = a.pos.x
        flag.pos.y = a.pos.y
        break
      }
    } else if (flag.state === 'home') {
      // At home it has to be stood on, and anybody defending it stops that.
      const reach = living(s, teams[0])
        .concat(living(s, teams[1]))
        .filter((a) => dist(a.pos, flag.pos) <= FLAG_PICKUP)
      const takers = reach.filter((a) => teamOf(a) !== team)
      const guards = reach.length - takers.length

      if (takers.length === 0 || guards > 0) {
        // Lost faster than it is earned, so trading the circle back and forth
        // is not a way of taking a flag one second at a time.
        flag.taking = Math.max(0, flag.taking - DT * 2)
      } else {
        flag.taking += DT
        if (flag.taking >= FLAG_TAKE) {
          const taker = takers[0]!
          flag.state = 'carried'
          flag.carrierId = taker.id
          flag.pos.x = taker.pos.x
          flag.pos.y = taker.pos.y
          flag.taking = 0
        }
      }
    }
  }

  // Scoring is checked after both flags have moved, since it asks about one
  // flag's carrier and the other flag's whereabouts at the same instant.
  for (const team of teams) {
    const theirs = bg.flags[other(team)]
    if (theirs.state !== 'carried') continue
    const carrier = s.actors.find((a) => a.id === theirs.carrierId)
    if (!carrier || !carrier.alive) continue
    if (dist(carrier.pos, bg.bases[team]) > BASE_RADIUS) continue
    // The rule that keeps a match from being two carriers passing each other:
    // you cannot cap while your own flag is out.
    if (bg.flags[team].state !== 'home') continue

    bg.score[team] += 1
    bg.objectives[carrier.id] = (bg.objectives[carrier.id] ?? 0) + 1
    theirs.state = 'home'
    theirs.carrierId = null
    theirs.taking = 0
    theirs.pos = { ...bg.bases[other(team)] }
  }
}

/**
 * Both carts, rolling.
 *
 * Symmetric on purpose — each side has its own to push and the other's to
 * stop, so there is no attacker and no defender and nobody is handed the
 * better half of an asymmetric map. Standing with it is the whole input;
 * everything else is the fight that decides who gets to.
 */
function updateCarts(s: SimState, bg: BgState): void {
  const carts = bg.carts
  if (!carts) return

  for (const team of order(s)) {
    const cart = carts[team]
    const near = (side: Team) =>
      living(s, side).filter((a) => dist(a.pos, cart.pos) <= CART_RADIUS).length

    const mine = near(team)
    const theirs = near(other(team))
    cart.pushers = mine
    cart.contested = mine > 0 && theirs > 0

    // Even numbers still roll, slowly; being outnumbered stops it.
    //
    // Freezing on a tie made a single missing body decisive: five against four
    // is one cart moving and one standing still, so the side that lost one
    // fight lost the match, and the harness's weaker stand-in never won a
    // single game. A tie creeping forward keeps a bad minute from being the
    // whole story.
    // Nobody on it at all is not a tie: an empty cart sits where it is. Zero
    // against zero counted as even numbers for one round of this and carts
    // rolled across an empty map on their own.
    if (mine === 0) continue

    const lead = mine - theirs
    if (lead < 0) continue

    const speed =
      lead === 0
        ? CART_SPEED * 0.4
        : CART_SPEED + Math.min(CART_CROWD_MAX, (lead - 1) * CART_CROWD)
    const span = dist(bg.bases[team], bg.bases[other(team)])
    cart.progress = Math.min(1, cart.progress + (speed * DT) / span)
    cart.pos = cartPath(bg, team, cart.progress)
  }
}

function resolve(s: SimState, bg: BgState): void {
  const blue = Math.floor(bg.score.blue)
  const red = Math.floor(bg.score.red)

  if (bg.kind === 'escort' && bg.carts) {
    const home = bg.carts.blue.progress
    const away = bg.carts.red.progress
    if (home >= 1 || away >= 1) {
      s.outcome = home >= away ? 'victory' : 'defeat'
      return
    }
    if (s.time >= bg.timeLimit) {
      // Whoever pushed theirs further, and the player on a dead heat.
      s.outcome = home >= away ? 'victory' : 'defeat'
    }
    return
  }

  if (blue >= bg.target || red >= bg.target) {
    s.outcome = blue >= red ? 'victory' : 'defeat'
    return
  }
  if (s.time >= bg.timeLimit) {
    // A draw would be the one outcome nobody can act on, so the clock breaks
    // ties toward whoever is ahead and toward the player when it is level.
    s.outcome = blue >= red ? 'victory' : 'defeat'
  }
}

/** Held points, for the readout and for the AI's sense of who is winning. */
export function held(bg: BgState, team: Team): number {
  return bg.nodes.filter((n) => n.owner === team).length
}

export const BATTLEGROUNDS: Array<{ kind: BgKind; name: string; demand: string }> = [
  {
    kind: 'escort',
    name: 'The Long Haul',
    demand: 'walk yours forward, and stand in front of theirs',
  },
  {
    kind: 'conquest',
    name: 'The Three Cairns',
    demand: 'hold ground, and the clock does the rest',
  },
  {
    kind: 'flags',
    name: 'Ebb and Flow',
    demand: 'carry theirs home while yours is still standing',
  },
]
