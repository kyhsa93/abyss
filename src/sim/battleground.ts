import { ARENA_RADIUS, DT } from './constants'
import { dist } from './combat'
import type { Actor, BgFlag, BgKind, BgState, Obstacle, SimState, Team, Vec2 } from './types'

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
const FLAG_PICKUP = 46
/**
 * How long a dropped flag waits before returning itself.
 *
 * Was fifteen, which is a long time to spend unable to score when the rule is
 * that you cannot score while yours is out. Five keeps a dropped flag worth
 * running to without letting one loose flag lock the match.
 */
const FLAG_RESET = 5
const FLAG_TARGET = 3
const FLAG_LIMIT = 360

/** Seconds on your back before you are up again at your own base. */
const RESPAWN = 12

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
 * The terrain, per battleground.
 *
 * Placed to make a straight line the wrong answer without making any route
 * long: on the capture map a rock sits between each pair of points, so walking
 * from one to another commits you to a side and lets a defender see you choose
 * it. On the flag map two blocks split the middle into three lanes, which is
 * the difference between a carrier being chased and a carrier being cut off.
 *
 * Nothing sits on a point, a base, or a spawn — a body that starts inside
 * terrain gets pushed out of it, and pushing five people out of one rock is a
 * scrum nobody asked for.
 */
const TERRAIN: Record<BgKind, Obstacle[]> = {
  conquest: [
    { pos: { x: -130, y: -30 }, radius: 62 },
    { pos: { x: 130, y: -30 }, radius: 62 },
    { pos: { x: 0, y: 210 }, radius: 54 },
  ],
  flags: [
    { pos: { x: 0, y: -140 }, radius: 76 },
    { pos: { x: 0, y: 140 }, radius: 76 },
    { pos: { x: -190, y: 0 }, radius: 44 },
    { pos: { x: 190, y: 0 }, radius: 44 },
  ],
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

export function createBattleground(kind: BgKind): BgState {
  return {
    kind,
    score: { blue: 0, red: 0 },
    target: kind === 'conquest' ? CONQUEST_TARGET : FLAG_TARGET,
    timeLimit: kind === 'conquest' ? CONQUEST_LIMIT : FLAG_LIMIT,
    obstacles: TERRAIN[kind].map((rock) => ({ pos: { ...rock.pos }, radius: rock.radius })),
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
    bases: { blue: { ...BASES.blue }, red: { ...BASES.red } },
    respawn: {},
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
  if (bg.kind === 'conquest') updateNodes(s, bg)
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
function updateRespawns(s: SimState, bg: BgState): void {
  for (const a of s.actors) {
    if (a.alive) {
      delete bg.respawn[a.id]
      continue
    }
    if (bg.respawn[a.id] === undefined) {
      bg.respawn[a.id] = RESPAWN
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
        continue
      }
    }

    if (flag.state === 'home' || flag.state === 'dropped') {
      for (const a of living(s, teams[0]).concat(living(s, teams[1]))) {
        if (dist(a.pos, flag.pos) > FLAG_PICKUP) continue
        const mine = teamOf(a) === team

        // Your own flag on the floor goes straight back; theirs gets picked up.
        if (mine) {
          if (flag.state === 'dropped') {
            flag.state = 'home'
            flag.pos = { ...bg.bases[team] }
            bg.objectives[a.id] = (bg.objectives[a.id] ?? 0) + 1
          }
          continue
        }
        flag.state = 'carried'
        flag.carrierId = a.id
        flag.pos.x = a.pos.x
        flag.pos.y = a.pos.y
        break
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
    theirs.pos = { ...bg.bases[other(team)] }
  }
}

function resolve(s: SimState, bg: BgState): void {
  const blue = Math.floor(bg.score.blue)
  const red = Math.floor(bg.score.red)

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
