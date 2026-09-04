import {
  BURDEN_REACH,
  CHANT_CAST,
  CRUSH_TELEGRAPH,
  FAULT_TELEGRAPH,
  GAZE_TELEGRAPH,
  GRASP_TELEGRAPH,
  REFUGE_TELEGRAPH,
  SCHISM_TELEGRAPH,
  SHALLOWS_TELEGRAPH,
  PUDDLE_TELEGRAPH,
  SOAK_TELEGRAPH,
  SPREAD_RADIUS,
  VIGIL_TELEGRAPH,
  TOLL_TELEGRAPH,
  YOKE_REACH,
  ARENA_RADIUS,
  GLOBAL_COOLDOWN,
  PARTY_RADIUS,
} from '../sim/constants'
import { burdenTaker, dist, getAura, livingParty } from '../sim/combat'
import { CART_RADIUS, FLAG_PICKUP, FLAG_TAKE, RALLY_TELEGRAPH } from '../sim/battleground'
import { BOSS_ID } from '../sim/state'
import { encounterAt } from '../sim/encounters'
import { bgAnchor } from '../sim/bgai'
import { turnView, viewAngle } from './camera'
import {
  ECHO_TELEGRAPH,
  HAND_BEAT,
  SUNDER_MAX,
  VERDICT_LINE,
  schismMuster,
  watched,
} from '../sim/boss'
import type { Actor, BgState, ProjectileKind, SimState, Vec2 } from '../sim/types'
import { iconFor } from './icons'
import type { Effects } from './effects'
import { drawScenery } from './scenery'
import { COLORS, L, classColor } from './theme'
import { drawBody, hasBody } from './lpcimage'
import { drawBolt } from './boltimage'
import { drawFxLoop } from './fximage'
import { chestHeight } from './lpcimage'

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Camera centre, in world units.
 *
 * The view follows the player rather than the arena, so their own token stays
 * pinned to the middle of the play area and everything else — the floor, the
 * boss, the puddles — moves around it. Recomputed once per frame from the
 * same interpolated position the player token is drawn at, so the token lands
 * exactly on the centre with no sub-pixel drift.
 */
const cam: Vec2 = { x: 0, y: 0 }

function actorPos(a: Actor, alpha: number): Vec2 {
  return {
    x: lerp(a.prevPos.x, a.pos.x, alpha),
    y: lerp(a.prevPos.y, a.pos.y, alpha),
  }
}

/**
 * What the view is centred on.
 *
 * The player, when there is one. When there is not — the fight running behind
 * the menus is played by nobody — the middle of everyone still standing, which
 * is not the same as the middle of the arena: two teams at opposite ends of a
 * battleground average out to an empty patch of floor, but a fight that has
 * converged on a flag is framed on the flag. It matters because the background
 * is drawn twice as close as the game, and at that range the arena centre is
 * sometimes a view of nothing at all.
 */
export function focusOn(s: SimState, alpha = 1): Vec2 {
  const player = s.actors.find((a) => a.isPlayer)
  if (player) return actorPos(player, alpha)

  const alive = s.actors.filter((a) => a.alive)
  if (alive.length === 0) return { x: 0, y: 0 }

  let x = 0
  let y = 0
  for (const a of alive) {
    x += a.pos.x
    y += a.pos.y
  }
  const middle = { x: x / alive.length, y: y / alive.length }

  // Onto whoever is nearest that middle, rather than onto the middle itself.
  //
  // The average of a battleground is an empty patch of floor between two
  // crowds, and on a phone drawn at backdrop zoom that patch is the entire
  // frame: measured, about one scene in three had *nobody* on screen at some
  // point in a ninety-second match. The check that guards this had been
  // failing at random for as long as it has existed, because which scene the
  // backdrop rolls is random.
  //
  // Snapping to the nearest body is what makes the guarantee rather than
  // improves the odds — the camera is centred on somebody, so somebody is
  // always in frame. It costs nothing when the fight is together, which is
  // every raid: the nearest body to the middle of a raid *is* the middle.
  let best = alive[0]!
  let closest = Infinity
  for (const a of alive) {
    const d = (a.pos.x - middle.x) ** 2 + (a.pos.y - middle.y) ** 2
    if (d < closest) {
      closest = d
      best = a
    }
  }
  return actorPos(best, alpha)
}

/**
 * The thing the view sits behind, or nothing to leave it where it is.
 *
 * Whatever the mode is about: the boss in a raid, and in a battleground the
 * place this player's own orders point at. The battleground's is the steadier
 * of the two, because it is a place rather than a body — a node or a flag or a
 * rally stands still while the fight moves around it, and it is already held
 * deliberately still by the plan for the same reason a camera would want it
 * to be.
 */
function anchorOf(s: SimState): Vec2 | null {
  const player = s.actors.find((a) => a.isPlayer)
  if (!player) return null
  if (s.mode === 'battleground') return bgAnchor(s, player)
  const b = s.actors.find((a) => a.id === BOSS_ID && a.alive)
  return b ? b.pos : null
}

/**
 * The range within which the view stops caring where the anchor is.
 *
 * The bearing to a thing is undefined at the thing, and near it it is violent:
 * at ten units away a sidestep swings it through a quarter turn. That is not
 * an edge case here — melee spend the whole fight on the boss's edge, so the
 * least stable bearing on the floor is the one most of the raid is standing
 * in.
 *
 * The first answer was to freeze the view inside this, and it was wrong in a
 * way worth writing down. A hard stop leaves the view pointed wherever it
 * happened to be, so a melee who walks through the boss and out the far side
 * is left with the boss behind them and nothing to correct it until they
 * leave. It swapped a camera that moves too much for one that will not move
 * when it must.
 *
 * What is here instead is the swing rate itself scaled by how far out the
 * anchor is. Far away it turns at full rate; close in it barely turns at all;
 * at the anchor it does not turn. Same protection against the whip, no cliff
 * to fall off, and a view that is always still recovering — slowly, but in the
 * right direction.
 */
const HOLD = 90

function updateCamera(s: SimState, alpha: number, clock: number): void {
  const p = focusOn(s, alpha)
  cam.x = p.x
  cam.y = p.y

  const anchor = anchorOf(s)
  if (!anchor) return
  const dx = anchor.x - p.x
  const dy = anchor.y - p.y
  // Turned so the anchor sits straight up the screen. Screen y grows downward,
  // so "up" is a quarter turn the negative way.
  const want = -Math.PI / 2 - Math.atan2(dy, dx)
  turnView(want, clock, Math.min(1, Math.hypot(dx, dy) / HOLD))
}

function worldToScreen(p: Vec2): Vec2 {
  const dx = (p.x - cam.x) * L.scale
  const dy = (p.y - cam.y) * L.scale
  const rot = viewAngle()
  const c = Math.cos(rot)
  const sn = Math.sin(rot)
  // In the projection rather than as a canvas transform, and that is not a
  // detail. `ctx.rotate` would turn the glyphs with the floor, and every
  // nameplate, damage number and body sprite in this renderer is drawn
  // axis-aligned on purpose. Turning the coordinates and nothing else leaves
  // all of them upright for free.
  //
  // The squash is the same trick and the same reason. It is what makes the
  // floor a floor rather than a map of one: distances across the screen and
  // distances into it stop being the same distance, which is the whole of what
  // "looking at it from an angle" means. Bodies are drawn upward from a point
  // on that plane and so stand up out of it untouched.
  return { x: L.cx + dx * c - dy * sn, y: L.cy + (dx * sn + dy * c) * TILT }
}

/**
 * How far the floor is tipped away from the camera.
 *
 * One would be looking straight down; nought would be standing on it. This is
 * the number the renderer has been half-using all along — the footprint under
 * every body was drawn at 0.44 while every mechanic on the same floor was
 * drawn as a true circle, so the arena carried two camera angles at once and
 * read as flat because of it. This is that number, applied to the floor rather
 * than to one thing standing on it.
 */
export const TILT = 0.62

/**
 * A circle lying on the floor, which is an ellipse on the glass.
 *
 * Every ground shape goes through here — the arena, the telegraphs, the cones,
 * the footprints, the rings around a body — so none of them can quietly
 * disagree with the others about where the camera is. The one thing that does
 * not is a projectile, which is in the air and is therefore a sphere seen head
 * on rather than a mark on the ground.
 *
 * The angles are the world's, unchanged. A canvas ellipse takes parametric
 * angles, and the parametric angle of a squashed circle is exactly the bearing
 * it had before the squash — so a cone drawn from the same two numbers the
 * simulation tests covers the same ground it always did.
 */
function floorArc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  start = 0,
  end = Math.PI * 2,
  ccw = false,
): void {
  ctx.ellipse(x, y, r, r * TILT, 0, start, end, ccw)
}

/**
 * A point that far from `p` along a bearing, lying on the floor.
 *
 * The companion to `floorArc` and it exists for the same reason: a bearing and
 * a distance describe a point on the ground, and the ground is tipped. Stepping
 * `reach` along `(cos, sin)` in screen space steps along a plane facing the
 * camera instead, which is how a starburst painted on the floor ends up
 * standing upright in the middle of it.
 */
function floorAt(p: Vec2, angle: number, reach: number): Vec2 {
  return { x: p.x + Math.cos(angle) * reach, y: p.y + Math.sin(angle) * reach * TILT }
}

/** A bearing in the world, as an angle on the glass. */
function screenAngle(a: number): number {
  return a + viewAngle()
}

/** Interpolated screen position: 30Hz simulation, 60fps rendering. */
function screenPos(a: Actor, alpha: number): Vec2 {
  return worldToScreen(actorPos(a, alpha))
}

function font(size: number, bold = false): string {
  return `${bold ? 'bold ' : ''}${Math.round(size * L.ui)}px ui-monospace, monospace`
}

/**
 * Every actor, back to front.
 *
 * Exported so it can be checked. The bug it is guarding against does not show
 * up in what gets drawn, only in what order — and an order is invisible to a
 * check that looks at the finished frame.
 */
export function drawOrder(s: SimState, alpha = 1): Actor[] {
  const depth = new Map(s.actors.map((a) => [a.id, screenPos(a, alpha).y]))
  return [...s.actors].sort((x, y) => depth.get(x.id)! - depth.get(y.id)! || x.id - y.id)
}

export function drawWorld(
  ctx: CanvasRenderingContext2D,
  s: SimState,
  alpha: number,
  clock: number,
  effects: Effects,
): void {
  updateCamera(s, alpha, clock)

  // The shove goes on the world and nowhere else: a heads-up display that
  // shakes is a heads-up display nobody can read.
  const shove = effects.offset()
  ctx.save()
  ctx.translate(shove.x * L.scale, shove.y * L.scale)

  drawArena(ctx, s.mode === 'raid' ? encounterAt(s.encounter).accent : COLORS.boss)
  // Outside the wall and under everything in the fight, which is where it
  // belongs twice over: it is scenery, and the floor it is standing beside is
  // the surface every mechanic is read on.
  drawScenery(ctx, worldToScreen, L.scale, s.seed, s.encounter)
  drawObjectives(ctx, s, clock)
  drawGround(ctx, s, clock)
  drawHunts(ctx, s, alpha)
  drawSpreadRings(ctx, s, alpha)
  drawVerdicts(ctx, s, alpha)
  drawHandoffs(ctx, s, alpha)
  drawCasts(ctx, s, alpha)

  const bg = s.mode === 'battleground'

  // Everything on the floor, in one order, back to front.
  //
  // A body stands up out of its footprint, so whoever is drawn last is the one
  // in front, and that has to be decided by where things are rather than by
  // which list they came out of. Two passes — every hostile, then every party
  // member — meant a party member standing north of the boss still drew over
  // it, which is the one arrangement the sort exists to prevent.
  //
  // Sorted by feet rather than by centre. A body is drawn upwards out of its
  // disc, so what decides which of two overlapping figures is nearer is where
  // each is standing, and that is the bottom of the sprite. Ties break on id,
  // which is stable, so two things on the same row do not swap places frame to
  // frame while a fight nudges them past each other.
  //
  // And by where the feet land on the glass rather than by where they are in
  // the world. Those were the same number until the view could turn, and the
  // sort went on reading the world's y — so "further away" stayed pinned to
  // world north while the camera swung, and at a quarter turn the order was
  // decided by the axis running across the screen instead of the one running
  // into it. Bodies swapped in front of each other as the player walked round
  // the boss.
  for (const a of drawOrder(s, alpha)) {
    if (a.faction === 'boss') {
      drawActor(ctx, a, alpha, clock, false, bg, bossAccent(s), bossBody(s))
    } else {
      drawActor(ctx, a, alpha, clock, standingInFire(s, a), bg)
    }
  }

  drawCarriedFlags(ctx, s, alpha)
  drawProjectiles(ctx, s, alpha)
  // Above the tokens and below the numbers: a hit should be visible on top of
  // whoever took it, and never on top of what the fight is telling you.
  effects.draw(ctx, worldToScreen, L.scale, viewAngle())
  drawFloatingText(ctx, s, alpha)
  ctx.restore()

  drawRaidFlash(ctx, s)
}

/**
 * Points, bases and flags — the parts of a battleground that are not people.
 *
 * Drawn under everything else, on the floor, because that is what they are:
 * places. A capture point reads as a ring whose colour says who holds it and
 * whose fill says how far the other team has got with taking it, which is one
 * number the score alone never shows — a point at 90% looks exactly like a
 * point at 10% until the moment it flips.
 */
function drawObjectives(ctx: CanvasRenderingContext2D, s: SimState, clock: number): void {
  const bg = s.bg
  if (!bg) return

  // Terrain first, under the objectives: a rock beside a point is scenery, and
  // the point is the thing being read.
  for (const rock of bg.obstacles) {
    const at = worldToScreen(rock.pos)
    const r = rock.radius * L.scale

    ctx.beginPath()
    floorArc(ctx, at.x, at.y, r, 0, Math.PI * 2)
    ctx.fillStyle = COLORS.floorEdge
    ctx.fill()
    // A lighter rim, so it reads as something standing up off the floor rather
    // than a hole in it. Everything else here is drawn as a flat disc.
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.beginPath()
    floorArc(ctx, at.x - r * 0.18, at.y - r * 0.18, r * 0.62, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  for (const node of bg.nodes) {
    const at = worldToScreen(node.pos)
    const r = node.radius * L.scale

    ctx.beginPath()
    floorArc(ctx, at.x, at.y, r, 0, Math.PI * 2)
    ctx.fillStyle = node.owner ? tint(teamColour(node.owner), 0.1) : 'rgba(120, 130, 150, 0.07)'
    ctx.fill()
    ctx.strokeStyle = node.owner ? teamColour(node.owner) : COLORS.floorEdge
    // Contested points pulse, since "nobody is taking this" and "both teams
    // are standing on it" are otherwise the same still picture.
    ctx.lineWidth = node.contested ? 2 + Math.sin(clock * 8) : 2
    ctx.stroke()

    // The capture bar, drawn as an arc from the top so it reads as a dial.
    if (node.progress !== 0) {
      const toward = node.progress > 0 ? 'blue' : 'red'
      ctx.beginPath()
      floorArc(ctx, at.x, at.y, r - 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.abs(node.progress))
      ctx.strokeStyle = teamColour(toward)
      ctx.lineWidth = 4
      ctx.stroke()
    }
  }

  // The carts, and the line each one is walking.
  if (bg.carts) {
    for (const team of ['blue', 'red'] as const) {
      const cart = bg.carts[team]
      const from = worldToScreen(bg.bases[team])
      const to = worldToScreen(bg.bases[team === 'blue' ? 'red' : 'blue'])
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.strokeStyle = tint(teamColour(team), 0.18)
      ctx.setLineDash([8, 10])
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.setLineDash([])

      const at = worldToScreen(cart.pos)
      const r = CART_RADIUS * L.scale
      // The circle you have to be inside to push it, drawn faintly, and the
      // cart itself as a solid square — the one thing on the floor that is not
      // a person and not a hazard.
      ctx.beginPath()
      floorArc(ctx, at.x, at.y, r, 0, Math.PI * 2)
      ctx.strokeStyle = cart.contested ? COLORS.hpBarLow : tint(teamColour(team), 0.45)
      ctx.lineWidth = cart.contested ? 2 + Math.sin(clock * 8) : 1.5
      ctx.stroke()

      const size = Math.max(7, 16 * L.scale)
      ctx.fillStyle = teamColour(team)
      ctx.fillRect(at.x - size / 2, at.y - size / 2, size, size)
      ctx.strokeStyle = '#0a0a0f'
      ctx.lineWidth = 2
      ctx.strokeRect(at.x - size / 2, at.y - size / 2, size, size)
    }
  }

  // Above the early return below, which is the flag map's and not everybody's.
  // Every mode has a rally; putting this after that line drew it on one map in
  // three and left the other two with a mechanic that ran, paid out and never
  // appeared.
  drawRally(ctx, bg, clock)

  if (bg.kind !== 'flags') return

  for (const team of ['blue', 'red'] as const) {
    const base = worldToScreen(bg.bases[team])
    ctx.beginPath()
    floorArc(ctx, base.x, base.y, 80 * L.scale, 0, Math.PI * 2)
    ctx.strokeStyle = tint(teamColour(team), 0.5)
    ctx.setLineDash([6, 6])
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.setLineDash([])

    // Only a flag that is not being carried is drawn here; a carried one is
    // drawn on its carrier, where the eye is already looking.
    const flag = bg.flags[team]
    if (flag.state === 'carried') continue
    const at = worldToScreen(flag.pos)

    // Somebody is lifting it. Without this the rule is invisible: a flag being
    // taken and a flag standing there are the same picture right up until the
    // moment it leaves, which gives a defender nothing to answer.
    if (flag.taking > 0) {
      ctx.beginPath()
      floorArc(ctx, 
        at.x,
        at.y,
        FLAG_PICKUP * L.scale,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * Math.min(1, flag.taking / FLAG_TAKE),
      )
      ctx.strokeStyle = COLORS.telegraphEdge
      ctx.lineWidth = 3
      ctx.stroke()
    }
    const lift = flag.state === 'home' ? 0 : Math.sin(clock * 4) * 3
    ctx.fillStyle = teamColour(team)
    ctx.fillRect(at.x - 1.5, at.y - 20 + lift, 3, 20)
    ctx.beginPath()
    ctx.moveTo(at.x + 1.5, at.y - 20 + lift)
    ctx.lineTo(at.x + 16, at.y - 15 + lift)
    ctx.lineTo(at.x + 1.5, at.y - 10 + lift)
    ctx.closePath()
    ctx.fill()
  }
}

/**
 * The rally: the one thing on a battleground that arrives on a clock.
 *
 * Drawn in two states, because they ask for different things. During the
 * warning it is a dashed ring that closes as the countdown runs out — a shape
 * that says *not yet* and says how long — and the seconds are printed inside
 * it, since "go now" and "go in eight seconds" are different instructions and
 * a ring alone cannot tell them apart. Once it is live it reads as a capture
 * point, dial and all, because that is exactly what it is by then and the
 * player has already learned to read one of those on the other map.
 *
 * Nothing at all before the warning, and nothing after it settles. A circle
 * that is always on the floor is scenery, and the whole of this mechanic is
 * that it is not there and then it is.
 */
function drawRally(ctx: CanvasRenderingContext2D, bg: BgState, clock: number): void {
  const rally = bg.rally
  if (rally.settled) return
  if (rally.telegraph > RALLY_TELEGRAPH) return

  const at = worldToScreen(rally.pos)
  const r = rally.radius * L.scale

  if (rally.telegraph > 0) {
    // The ring tightens as the countdown runs down, so the shape carries the
    // same number the text does for anyone not reading it.
    const through = 1 - rally.telegraph / RALLY_TELEGRAPH
    ctx.beginPath()
    floorArc(ctx, at.x, at.y, r * (1 - through * 0.18), 0, Math.PI * 2)
    ctx.strokeStyle = COLORS.telegraphEdge
    ctx.setLineDash([10, 8])
    ctx.lineWidth = 2 + Math.sin(clock * 6)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = COLORS.telegraphEdge
    ctx.font = font(18, true)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(Math.ceil(rally.telegraph).toString(), at.x, at.y)
    return
  }

  ctx.beginPath()
  floorArc(ctx, at.x, at.y, r, 0, Math.PI * 2)
  ctx.fillStyle = rally.owner ? tint(teamColour(rally.owner), 0.12) : COLORS.telegraph
  ctx.fill()
  ctx.strokeStyle = rally.owner ? teamColour(rally.owner) : COLORS.telegraphEdge
  ctx.lineWidth = rally.contested ? 2 + Math.sin(clock * 8) : 2
  ctx.stroke()

  if (rally.progress !== 0) {
    const toward = rally.progress > 0 ? 'blue' : 'red'
    ctx.beginPath()
    floorArc(ctx, 
      at.x,
      at.y,
      r - 5,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * Math.abs(rally.progress),
    )
    ctx.strokeStyle = teamColour(toward)
    ctx.lineWidth = 4
    ctx.stroke()
  }
}

export function teamColour(team: 'blue' | 'red'): string {
  return team === 'blue' ? COLORS.tank : COLORS.boss
}

/** The tell for party-wide damage, which is otherwise invisible and unavoidable. */
/** A flag in someone's hands, drawn over them so the carrier is unmistakable. */
function drawCarriedFlags(ctx: CanvasRenderingContext2D, s: SimState, alpha: number): void {
  const bg = s.bg
  if (!bg || bg.kind !== 'flags') return

  for (const team of ['blue', 'red'] as const) {
    const flag = bg.flags[team]
    if (flag.state !== 'carried') continue
    const carrier = s.actors.find((a) => a.id === flag.carrierId)
    if (!carrier || !carrier.alive) continue

    const at = screenPos(carrier, alpha)
    const top = at.y - carrier.radius * L.scale - 26
    ctx.fillStyle = teamColour(team)
    ctx.fillRect(at.x - 1.5, top, 3, 22)
    ctx.beginPath()
    ctx.moveTo(at.x + 1.5, top)
    ctx.lineTo(at.x + 15, top + 5)
    ctx.lineTo(at.x + 1.5, top + 10)
    ctx.closePath()
    ctx.fill()
  }
}

function drawRaidFlash(ctx: CanvasRenderingContext2D, s: SimState): void {
  if (s.raidFlash <= 0) return
  const a = Math.min(1, s.raidFlash / 0.45)

  ctx.fillStyle = `rgba(239, 68, 68, ${(0.16 * a).toFixed(3)})`
  ctx.fillRect(0, 0, L.w, L.h)

  const c = worldToScreen({ x: 0, y: 0 })
  ctx.beginPath()
  floorArc(ctx, c.x, c.y, L.arenaR, 0, Math.PI * 2)
  ctx.strokeStyle = `rgba(239, 68, 68, ${(0.85 * a).toFixed(3)})`
  ctx.lineWidth = 2 + 6 * a
  ctx.stroke()
}

/**
 * Slabs, drawn rather than loaded.
 *
 * The generated floor that briefly lived here was thrown out with the rest of
 * the generated art, and what replaced it is code because the floor is the one
 * surface that must not have opinions. Every mechanic is drawn on it —
 * puddles, telegraphs, the grasp — and those are the things a player is
 * reading. When the picture was here it had to be knocked down to a third of
 * its strength before it stopped competing, which is another way of saying
 * that what the ground needs is not to be a flat fill, and nothing more.
 *
 * Code buys three things a picture could not. It costs no bytes and no
 * request. Its contrast is exact rather than negotiated, so it cannot creep
 * back up against a telegraph. And it takes the encounter's own accent, so a
 * new boss arrives with its own floor and no new asset.
 *
 * The pattern is a hash of the cell, not a random: the arena is drawn in world
 * space and slides past the player, so a slab has to be the same slab every
 * frame or the floor boils.
 */
function slabAccent(colour: string, alpha: number): string {
  // The accent table is all six-digit hex, which is the only form this reads.
  if (!/^#[0-9a-f]{6}$/i.test(colour)) return colour
  const r = parseInt(colour.slice(1, 3), 16)
  const g = parseInt(colour.slice(3, 5), 16)
  const b = parseInt(colour.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function slabTone(gx: number, gy: number): number {
  // Cheap integer hash. Only the low bits are used, so quality past "does not
  // repeat visibly at this size" would be wasted.
  let h = (gx * 374761393 + gy * 668265263) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  return ((h ^ (h >>> 16)) >>> 8) & 0xff
}

function drawArena(ctx: CanvasRenderingContext2D, accent: string = COLORS.boss): void {
  // The arena is centred on the world origin; the camera decides where that
  // lands on screen. The grid is drawn in world space too, so it slides past
  // the player and makes their own movement readable.
  const c = worldToScreen({ x: 0, y: 0 })

  ctx.save()
  ctx.beginPath()
  floorArc(ctx, c.x, c.y, L.arenaR, 0, Math.PI * 2)
  ctx.fillStyle = COLORS.floor
  ctx.fill()
  ctx.clip()

  // Slabs first, under everything, and deliberately near the threshold of
  // being seen at all. The first pass at these read as a chequerboard, which
  // is a pattern competing with the telegraphs drawn on top of it; what is
  // wanted is only that the ground is not a flat fill. About a third of the
  // cells are lifted, by under one percent each, and a rare one takes a trace
  // of the encounter's accent.
  // The floor's own texture, drawn in world coordinates.
  //
  // This is the one place a canvas transform is the right tool rather than the
  // wrong one. Everywhere else the renderer turns coordinates and leaves the
  // canvas alone, because a transform would turn the glyphs with the floor.
  // Here there are no glyphs — there is nothing but the floor — and what is
  // wanted is exactly that the slabs and the grid lie down on it.
  //
  // Without it they did not. Both were laid out in screen space, so the ground
  // stayed square and axis-aligned while the world above it turned and tipped:
  // the player walked, the arena wall swung round, and the floor they were
  // walking on held perfectly still. A grid is most of what says which way a
  // plane is facing, so it was the one surface undoing the illusion the rest of
  // the frame was building.
  //
  // Same composition as `worldToScreen`, in the order canvas applies it: tip,
  // then turn. The zoom is not in here and must not be — it is multiplied into
  // the coordinates below instead. `Ambience` draws this same arena as the menu
  // backdrop, and the check that the backdrop holds one distance across every
  // zoom step works by watching what the frame passes to `ctx.scale`; a zoom
  // handed to the canvas rather than to the numbers walks straight into it.
  ctx.translate(c.x, c.y)
  ctx.scale(1, TILT)
  ctx.rotate(viewAngle())

  const reach = ARENA_RADIUS * L.scale
  const slab = 64 * L.scale
  const cols = Math.ceil((reach * 2) / slab) + 1
  for (let gx = 0; gx < cols; gx++) {
    for (let gy = 0; gy < cols; gy++) {
      const wx = -Math.ceil(reach / slab) + gx
      const wy = -Math.ceil(reach / slab) + gy
      const tone = slabTone(wx, wy)
      if (tone < 168) continue
      ctx.fillStyle =
        tone > 246
          ? slabAccent(accent, 0.022)
          : `rgba(255, 255, 255, ${(0.006 + (tone & 15) * 0.0007).toFixed(4)})`
      ctx.fillRect(wx * slab, wy * slab, slab - 1, slab - 1)
    }
  }

  ctx.strokeStyle = COLORS.grid
  ctx.lineWidth = 1
  for (let g = -reach; g <= reach; g += slab) {
    ctx.beginPath()
    ctx.moveTo(g, -reach)
    ctx.lineTo(g, reach)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-reach, g)
    ctx.lineTo(reach, g)
    ctx.stroke()
  }
  ctx.restore()

  ctx.beginPath()
  floorArc(ctx, c.x, c.y, L.arenaR, 0, Math.PI * 2)
  ctx.strokeStyle = COLORS.floorEdge
  ctx.lineWidth = 2
  ctx.stroke()

  drawFarWall(ctx, c)
}

/**
 * How tall the arena's wall stands, in world units.
 *
 * Low. It is there to say that the floor ends in something rather than at a
 * line, and a wall tall enough to be scenery is a wall that takes screen off
 * the top of the fight — which on a phone is the half the raid is standing in.
 */
const WALL = 34

/**
 * The inside of the far wall.
 *
 * Only the far half, and that is not an optimisation. Standing inside a bowl
 * you see the inner face of the side away from you and nothing of the side you
 * are on: the near wall is below the camera, and drawing a band there would be
 * a wall growing downward out of the floor in front of you.
 *
 * Which half is far is a fact about the ellipse rather than about the camera.
 * Screen y grows downward, so the far half is the top of it — parametric
 * angles from half a turn to a whole one — and that stays true however the
 * view is turned, because the tilt is applied after the turn.
 *
 * Drawn under everything, like the floor it belongs to. A body standing at the
 * back of the arena is in front of the wall behind it, which is what a raid
 * inside a bowl looks like.
 */
function drawFarWall(ctx: CanvasRenderingContext2D, c: Vec2): void {
  const rx = L.arenaR
  const ry = L.arenaR * TILT
  const h = WALL * L.scale
  if (h < 1) return

  ctx.beginPath()
  // Along the base, then back along the rim: the second arc runs the other way
  // so the two ends meet and the band closes on itself.
  ctx.ellipse(c.x, c.y, rx, ry, 0, Math.PI, Math.PI * 2)
  ctx.ellipse(c.x, c.y - h, rx, ry, 0, Math.PI * 2, Math.PI, true)
  ctx.closePath()

  // Lit from above, which is the one light this game has ever implied — every
  // body casts its shadow straight down onto its own footprint.
  const wash = ctx.createLinearGradient(0, c.y - ry - h, 0, c.y - ry + h)
  wash.addColorStop(0, 'rgba(148, 163, 184, 0.16)')
  wash.addColorStop(1, 'rgba(10, 10, 16, 0.55)')
  ctx.fillStyle = wash
  ctx.fill()

  // The rim, so the wall ends in an edge rather than in a fade.
  ctx.beginPath()
  ctx.ellipse(c.x, c.y - h, rx, ry, 0, Math.PI, Math.PI * 2)
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.30)'
  ctx.lineWidth = 2
  ctx.stroke()
}

function drawGround(ctx: CanvasRenderingContext2D, s: SimState, clock: number): void {
  for (const g of s.ground) {
    const p = worldToScreen(g.pos)
    const r = g.radius * L.scale

    if (g.kind === 'breath') {
      drawBreath(ctx, g, p, r)
      continue
    }

    if (g.kind === 'shockwave') {
      drawShockwave(ctx, g, p, r)
      continue
    }

    if (g.kind === 'brand') {
      drawBrand(ctx, g, p, r)
      continue
    }

    if (g.kind === 'crush') {
      drawCrush(ctx, g, p, r)
      continue
    }

    if (g.kind === 'spire') {
      drawSpire(ctx, g, p, r)
      continue
    }

    if (g.kind === 'soak') {
      drawSoak(ctx, s, g, p, r, clock)
      continue
    }

    if (g.kind === 'hand') {
      drawHand(ctx, g, p, worldToScreen({ x: 0, y: 0 }))
      continue
    }

    if (g.kind === 'echo') {
      drawEcho(ctx, g, p, r)
      continue
    }

    if (g.kind === 'fault') {
      drawFault(ctx, g)
      continue
    }

    if (g.kind === 'schism') {
      drawSchism(ctx, s, g, p, clock)
      continue
    }

    if (g.kind === 'shallows') {
      drawShallows(ctx, g, r, clock)
      continue
    }

    if (g.kind === 'vigil') {
      drawVigil(ctx, g, p, r)
      continue
    }

    if (g.kind === 'chant') {
      drawChant(ctx, s, g, p, r)
      continue
    }

    if (g.kind === 'gaze') {
      drawGaze(ctx, s, g, p, r)
      continue
    }

    if (g.kind === 'toll') {
      drawToll(ctx, s, g, p, r, clock)
      continue
    }

    if (g.kind === 'grasp') {
      drawGrasp(ctx, g, p, r, clock)
      continue
    }

    if (g.kind === 'refuge') {
      drawRefuge(ctx, s, g, r, clock)
      continue
    }

    if (!g.detonated) {
      // Telegraph fills from the centre outward as the timer runs down.
      const progress = 1 - g.telegraph / PUDDLE_TELEGRAPH
      ctx.beginPath()
      floorArc(ctx, p.x, p.y, r, 0, Math.PI * 2)
      ctx.fillStyle = COLORS.telegraph
      ctx.fill()

      ctx.beginPath()
      floorArc(ctx, p.x, p.y, r * progress, 0, Math.PI * 2)
      ctx.fillStyle = COLORS.telegraph
      ctx.fill()

      ctx.beginPath()
      floorArc(ctx, p.x, p.y, r, 0, Math.PI * 2)
      ctx.strokeStyle = COLORS.telegraphEdge
      ctx.lineWidth = 2
      ctx.stroke()
    } else {
      // Never fade below the point where it still hurts you.
      const fade = 0.62 + 0.38 * Math.min(1, g.lingering / 1.2)
      ctx.save()
      ctx.globalAlpha = fade
      ctx.beginPath()
      floorArc(ctx, p.x, p.y, r, 0, Math.PI * 2)
      ctx.fillStyle = COLORS.puddle
      ctx.fill()

      // A core that breathes. Flat colour reads as a hole in the floor; this
      // reads as something still burning in it, and it is the same shape and
      // the same edge, so what is safe has not moved.
      ctx.beginPath()
      floorArc(ctx, p.x, p.y, r * (0.52 + 0.06 * Math.sin(clock * 3 + g.id)), 0, Math.PI * 2)
      ctx.fillStyle = COLORS.puddle
      ctx.fill()

      // Something actually burning in it.
      for (const [i, spot] of flamesIn(g.radius).entries()) {
        const at = worldToScreen({ x: g.pos.x + spot.dx, y: g.pos.y + spot.dy })
        drawFxLoop(ctx, 'flame', at.x, at.y, FLAME * L.scale, clock, 1.4, fade * 0.7, g.id * 0.37 + i * 0.23)
      }

      ctx.strokeStyle = COLORS.puddleEdge
      ctx.lineWidth = 2
      ctx.setLineDash([6, 6])
      ctx.lineDashOffset = -clock * 20
      ctx.stroke()
      ctx.restore()
    }
  }
}

/**
 * The line across the floor, and the half of it that is going.
 *
 * Drawn as the exact piece of arena that is condemned rather than as a line
 * with a hint of shading — a mechanic whose answer is "be on the other side"
 * has to say which side, and the only unambiguous way to say it is to colour
 * one of them in. The chord and the arc are worked out rather than clipped so
 * the shape is the shape the simulation tests: what is filled is what is hit.
 */
// No screen point needed any more: the geometry is worked out in the world and
// projected, so the only thing this takes from the fight is the fault itself.
function drawFault(ctx: CanvasRenderingContext2D, g: SimState['ground'][number]): void {
  if (g.detonated) return
  const closing = Math.max(0, Math.min(1, 1 - g.telegraph / FAULT_TELEGRAPH))
  const c = worldToScreen({ x: 0, y: 0 })
  const radius = L.arenaR

  // Worked out in the world and then projected, rather than worked out on the
  // glass. It used to step along `(cos, sin)` in screen space from a bearing
  // the fight gave it, which was the same thing until the floor was tipped —
  // a world bearing does not arrive on screen as a unit vector once the y is
  // squashed, so the line drifted off the ground the simulation was testing.
  // Here the chord is a chord of a circle, which is what it is.
  const nx = Math.cos(g.angle)
  const ny = Math.sin(g.angle)

  // Where the line crosses the wall. The boss is always inside the arena, so
  // the line always crosses it twice; the guard is for the frame where the
  // camera has not caught up rather than for a case the fight can produce.
  const away = g.pos.x * nx + g.pos.y * ny
  const half = Math.sqrt(Math.max(0, ARENA_RADIUS * ARENA_RADIUS - away * away))
  if (half <= 0) return
  const footW = { x: nx * away, y: ny * away }
  const fromW = { x: footW.x - ny * half, y: footW.y + nx * half }
  const toW = { x: footW.x + ny * half, y: footW.y - nx * half }
  const from = worldToScreen(fromW)
  const to = worldToScreen(toW)

  // Of the two arcs between those crossings, the condemned one is whichever
  // contains the bearing the fault points along. Read as bearings on the
  // glass, since that is what a canvas ellipse takes.
  const angle = screenAngle(g.angle)
  const a1 = screenAngle(Math.atan2(fromW.y, fromW.x))
  const a2 = screenAngle(Math.atan2(toW.y, toW.x))
  const turn = (x: number): number => ((x % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  const sweep = turn(a1 - a2)
  const forward = turn(angle - a2) < sweep

  ctx.save()
  ctx.beginPath()
  ctx.moveTo(to.x, to.y)
  floorArc(ctx, c.x, c.y, radius, a2, a1, !forward)
  ctx.closePath()
  ctx.fillStyle = `rgba(71, 85, 105, ${(0.24 + 0.34 * closing).toFixed(3)})`
  ctx.fill()

  // The line itself, which is the thing being read.
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.strokeStyle = 'rgba(203, 213, 225, 0.95)'
  ctx.lineWidth = 2 + 7 * closing
  ctx.stroke()
  ctx.restore()
}

/**
 * The arena going under, and the patches it leaves.
 *
 * The opposite picture to everything else on this floor, and it has to be:
 * every other shape here is a bright thing on dark ground meaning *not here*,
 * and this one means *only here*. So the wash goes over the whole arena and
 * the patches are cut back out of it in the floor's own colour — the safe
 * ground reads as ground, and the danger is the absence of it.
 */
function drawShallows(
  ctx: CanvasRenderingContext2D,
  g: SimState['ground'][number],
  r: number,
  clock: number,
): void {
  if (g.detonated) return
  const closing = Math.max(0, Math.min(1, 1 - g.telegraph / SHALLOWS_TELEGRAPH))
  const c = worldToScreen({ x: 0, y: 0 })

  ctx.save()
  ctx.beginPath()
  floorArc(ctx, c.x, c.y, L.arenaR, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(29, 78, 216, ${(0.18 + 0.3 * closing).toFixed(3)})`
  ctx.fill()

  for (const spot of g.spots ?? []) {
    const at = worldToScreen(spot)
    ctx.beginPath()
    floorArc(ctx, at.x, at.y, r, 0, Math.PI * 2)
    ctx.fillStyle = COLORS.floor
    ctx.fill()

    ctx.beginPath()
    floorArc(ctx, at.x, at.y, r, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(147, 197, 253, 0.9)'
    ctx.lineWidth = 2 + 6 * closing
    ctx.setLineDash([8, 6])
    ctx.lineDashOffset = -clock * 24
    ctx.stroke()
    ctx.setLineDash([])
  }
  ctx.restore()
}

/**
 * The plate, and whether anybody is standing on it.
 *
 * The count is drawn as a ring closing the way the gathering's is, because it
 * is the same kind of question -- a place somebody has to be at a moment --
 * and the difference is the number in the middle, which is one or nothing
 * rather than a tally of the raid.
 */
function drawToll(
  ctx: CanvasRenderingContext2D,
  s: SimState,
  g: SimState['ground'][number],
  p: Vec2,
  r: number,
  clock: number,
): void {
  if (g.detonated) return
  const paid = s.actors.some(
    (a) => a.faction === 'party' && a.alive && dist(a.pos, g.pos) <= g.radius,
  )
  const closing = Math.max(0, Math.min(1, 1 - g.telegraph / TOLL_TELEGRAPH))

  ctx.beginPath()
  floorArc(ctx, p.x, p.y, r, 0, Math.PI * 2)
  ctx.fillStyle = paid ? 'rgba(245, 158, 11, 0.20)' : 'rgba(245, 158, 11, 0.10)'
  ctx.fill()

  ctx.beginPath()
  floorArc(ctx, p.x, p.y, Math.max(2, r * (1 - closing * 0.7)), 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(252, 211, 77, 0.6)'
  ctx.lineWidth = 2
  ctx.setLineDash([5, 6])
  ctx.lineDashOffset = clock * 22
  ctx.stroke()
  ctx.setLineDash([])

  ctx.beginPath()
  floorArc(ctx, p.x, p.y, r, 0, Math.PI * 2)
  ctx.strokeStyle = paid ? '#fcd34d' : 'rgba(252, 211, 77, 0.8)'
  ctx.lineWidth = paid ? 3 : 2
  ctx.stroke()

  ctx.fillStyle = paid ? '#fcd34d' : '#e2e8f0'
  ctx.font = font(15, true)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(paid ? '1' : '0', p.x, p.y)
  ctx.textBaseline = 'alphabetic'
}

/**
 * The reach, closing inward.
 *
 * Drawn the other way round from every telegraph here: the ring shrinks
 * toward the middle rather than filling out to the rim, because what is
 * coming is not the circle going off, it is the circle taking hold of
 * whatever is left nearest its centre.
 */
function drawGrasp(
  ctx: CanvasRenderingContext2D,
  g: SimState['ground'][number],
  p: Vec2,
  r: number,
  clock: number,
): void {
  if (g.detonated) return
  const closing = Math.max(0, Math.min(1, 1 - g.telegraph / GRASP_TELEGRAPH))

  ctx.beginPath()
  floorArc(ctx, p.x, p.y, r, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(124, 58, 237, ${(0.08 + 0.14 * closing).toFixed(3)})`
  ctx.fill()

  ctx.beginPath()
  floorArc(ctx, p.x, p.y, r, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(167, 139, 250, 0.75)'
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.beginPath()
  floorArc(ctx, p.x, p.y, Math.max(3, r * (1 - closing)), 0, Math.PI * 2)
  ctx.strokeStyle = '#a78bfa'
  ctx.lineWidth = 2 + 4 * closing
  ctx.setLineDash([7, 5])
  ctx.lineDashOffset = -clock * 30
  ctx.stroke()
  ctx.setLineDash([])
}

/**
 * The stones, and which one is being walked to.
 *
 * The player's own is drawn heavier than the rest. Every other piece of
 * ground in this game means the same thing to everybody looking at it; these
 * mean "yours" and "somebody else's", and a picture that cannot say which is
 * a picture of a mechanic nobody can perform.
 */
function drawRefuge(
  ctx: CanvasRenderingContext2D,
  s: SimState,
  g: SimState['ground'][number],
  r: number,
  clock: number,
): void {
  if (g.detonated) return
  const closing = Math.max(0, Math.min(1, 1 - g.telegraph / REFUGE_TELEGRAPH))
  const player = s.actors.find((a) => a.isPlayer)
  const mark = player ? getAura(player, 'refuge') : undefined
  const mine = mark ? mark.stacks - 1 : -1

  const spots = g.spots ?? []
  for (let i = 0; i < spots.length; i++) {
    const at = worldToScreen(spots[i]!)
    const own = i === mine

    ctx.beginPath()
    floorArc(ctx, at.x, at.y, r, 0, Math.PI * 2)
    ctx.fillStyle = own ? 'rgba(6, 182, 212, 0.22)' : 'rgba(6, 182, 212, 0.08)'
    ctx.fill()

    ctx.beginPath()
    floorArc(ctx, at.x, at.y, r, 0, Math.PI * 2)
    ctx.strokeStyle = own ? '#67e8f9' : 'rgba(103, 232, 249, 0.45)'
    ctx.lineWidth = own ? 2 + 5 * closing : 2
    ctx.setLineDash([8, 6])
    ctx.lineDashOffset = -clock * 20
    ctx.stroke()
    ctx.setLineDash([])
  }
}

/** Frontal cone: fills toward the tip as the cast completes. */
function drawBreath(
  ctx: CanvasRenderingContext2D,
  g: SimState['ground'][number],
  p: Vec2,
  r: number,
): void {
  const firing = g.detonated
  const progress = firing ? 1 : 1 - g.telegraph / Math.max(0.001, 1.9)

  ctx.beginPath()
  ctx.moveTo(p.x, p.y)
  // The wedge is drawn against screen coordinates, so its bearing has to be
  // one too: the shape the simulation tests is a bearing in the world, and
  // the world is turned under the camera.
  const angle = screenAngle(g.angle)
  floorArc(ctx, p.x, p.y, r, angle - g.halfWidth, angle + g.halfWidth)
  ctx.closePath()
  ctx.fillStyle = firing ? 'rgba(56, 189, 248, 0.5)' : 'rgba(56, 189, 248, 0.14)'
  ctx.fill()

  if (!firing) {
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    floorArc(ctx, p.x, p.y, r * progress, angle - g.halfWidth, angle + g.halfWidth)
    ctx.closePath()
    ctx.fillStyle = 'rgba(56, 189, 248, 0.22)'
    ctx.fill()
  }

  ctx.beginPath()
  ctx.moveTo(p.x, p.y)
  floorArc(ctx, p.x, p.y, r, angle - g.halfWidth, angle + g.halfWidth)
  ctx.closePath()
  ctx.strokeStyle = firing ? 'rgba(125, 211, 252, 0.95)' : 'rgba(125, 211, 252, 0.7)'
  ctx.lineWidth = 2
  ctx.stroke()

  // While it is actually going off, three arcs running out along the cone.
  // The shape says where it reaches; this says which way it is going, which
  // the shape alone never did.
  if (!firing) return
  const run = 1 - g.lingering / 0.3
  for (let i = 0; i < 3; i++) {
    const at = ((run + i / 3) % 1) * 0.9 + 0.1
    ctx.beginPath()
    floorArc(ctx, p.x, p.y, r * at, angle - g.halfWidth * 0.85, angle + g.halfWidth * 0.85)
    ctx.strokeStyle = `rgba(224, 242, 254, ${(0.5 * (1 - at)).toFixed(3)})`
    ctx.lineWidth = 3
    ctx.stroke()
  }
}

/**
 * The circle to be standing in, and how many are.
 *
 * Drawn as the one piece of ground that fills from the outside in, because
 * everything else on this floor fills outward as it becomes dangerous and
 * this one becomes safe. The headcount is the mechanic: what lands is divided
 * by it, so a number that is not yet everybody is the whole tell.
 */
function drawSoak(
  ctx: CanvasRenderingContext2D,
  s: SimState,
  g: SimState['ground'][number],
  p: Vec2,
  r: number,
  clock: number,
): void {
  const party = s.actors.filter((a) => a.faction === 'party' && a.alive)
  const inside = party.filter((a) => dist(a.pos, g.pos) <= g.radius).length
  const ready = inside >= party.length
  const closing = 1 - g.telegraph / SOAK_TELEGRAPH

  ctx.beginPath()
  floorArc(ctx, p.x, p.y, r, 0, Math.PI * 2)
  ctx.fillStyle = ready ? 'rgba(45, 212, 191, 0.16)' : 'rgba(45, 212, 191, 0.10)'
  ctx.fill()

  // The rim closes in as the timer runs down, so the shape says how long is
  // left without anybody reading a number.
  ctx.beginPath()
  floorArc(ctx, p.x, p.y, Math.max(2, r * (1 - closing * 0.55)), 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(94, 234, 212, 0.55)'
  ctx.lineWidth = 2
  ctx.setLineDash([5, 6])
  ctx.lineDashOffset = clock * 26
  ctx.stroke()
  ctx.setLineDash([])

  ctx.beginPath()
  floorArc(ctx, p.x, p.y, r, 0, Math.PI * 2)
  ctx.strokeStyle = ready ? '#5eead4' : 'rgba(94, 234, 212, 0.8)'
  ctx.lineWidth = ready ? 3 : 2
  ctx.stroke()

  ctx.fillStyle = ready ? '#5eead4' : '#e2e8f0'
  ctx.font = font(15, true)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${inside}/${party.length}`, p.x, p.y)
  ctx.textBaseline = 'alphabetic'
}

/**
 * The band about to cave in, and how long is left of it.
 *
 * A disc rather than a scar, filling and brightening as the second runs out —
 * the one thing this shape has to say is *when*, because where is already
 * obvious to anyone standing in it. It draws nothing after it lands: there is
 * nothing left to avoid, and a mark on the floor would say otherwise.
 *
 * Arrows pointing outward rather than a rim closing in. The gathering's rim
 * closes because the answer is to be inside; this one's answer is out, and
 * the picture should not have to be read twice to say which.
 */
function drawCrush(
  ctx: CanvasRenderingContext2D,
  g: SimState['ground'][number],
  p: Vec2,
  r: number,
): void {
  if (g.detonated) return
  const closing = Math.max(0, Math.min(1, 1 - g.telegraph / CRUSH_TELEGRAPH))

  ctx.save()
  ctx.beginPath()
  floorArc(ctx, p.x, p.y, r, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(220, 38, 38, ${(0.07 + 0.21 * closing).toFixed(3)})`
  ctx.fill()
  ctx.strokeStyle = 'rgba(248, 113, 113, 0.9)'
  ctx.lineWidth = 2 + 6 * closing
  ctx.stroke()

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const from = r * (0.55 + 0.4 * closing)
    ctx.beginPath()
    const near = floorAt(p, a, from)
    ctx.moveTo(near.x, near.y)
    const far = floorAt(p, a, r + 18)
    ctx.lineTo(far.x, far.y)
    ctx.strokeStyle = `rgba(254, 202, 202, ${(0.25 + 0.5 * closing).toFixed(3)})`
    ctx.lineWidth = 2
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * The wedge that turns, drawn as two wedges rather than one.
 *
 * The pulse about to land is the bright one and the pulse after it is the
 * faint one, and the faint one is the whole picture: this mechanic is not
 * answered by seeing where the danger is, it is answered by seeing where the
 * danger is going. A player shown only the live wedge would step out of it
 * along the shortest line, which half the time is into the next beat.
 */
function drawHand(
  ctx: CanvasRenderingContext2D,
  g: SimState['ground'][number],
  p: Vec2,
  arena: Vec2,
): void {
  const closing = Math.max(0, Math.min(1, 1 - g.telegraph / HAND_BEAT))
  // The shape itself reaches past the wall, so that it covers the arena from
  // wherever the boss happens to be standing. What gets drawn is clipped
  // back to the floor: a wedge painted over the void outside would read as
  // ground that can be stood on.
  const reach = ARENA_RADIUS * 2 * L.scale
  ctx.save()
  ctx.beginPath()
  floorArc(ctx, arena.x, arena.y, L.arenaR, 0, Math.PI * 2)
  ctx.clip()

  // The wedge is drawn against screen coordinates, so its bearing has to be
  // one too: the shape the simulation tests is a bearing in the world, and
  // the world is turned under the camera.
  const angle = screenAngle(g.angle)

  // Where it is going, first, so the live wedge is drawn over the top of it.
  if (g.pulses > 1) {
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    floorArc(ctx, p.x, p.y, reach, angle + g.turn - g.halfWidth, angle + g.turn + g.halfWidth)
    ctx.closePath()
    ctx.fillStyle = 'rgba(132, 204, 22, 0.07)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(132, 204, 22, 0.30)'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  ctx.beginPath()
  ctx.moveTo(p.x, p.y)
  floorArc(ctx, p.x, p.y, reach, angle - g.halfWidth, angle + g.halfWidth)
  ctx.closePath()
  ctx.fillStyle = `rgba(132, 204, 22, ${(0.09 + 0.20 * closing).toFixed(3)})`
  ctx.fill()
  ctx.strokeStyle = `rgba(190, 242, 100, ${(0.55 + 0.4 * closing).toFixed(3)})`
  ctx.lineWidth = 2 + 3 * closing
  ctx.stroke()

  // And an arrow of the turn along the leading edge, because which way it is
  // going is the only thing here worth knowing and a wedge does not say.
  const lead = angle + Math.sign(g.turn) * g.halfWidth
  for (let i = 1; i <= 3; i++) {
    const out = reach * (i / 4)
    const from = floorAt(p, lead, out)
    const to = floorAt(p, lead + Math.sign(g.turn) * 0.22, out)
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.strokeStyle = 'rgba(190, 242, 100, 0.75)'
    ctx.lineWidth = 3
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * The floor answering under whoever it marked.
 *
 * Closing inward like the brand's ring, because both are ground that has
 * been chosen rather than ground that was already there — and in a different
 * colour, since the brand is a place to stay off afterwards and this one has
 * nothing afterwards at all.
 */
function drawEcho(
  ctx: CanvasRenderingContext2D,
  g: SimState['ground'][number],
  p: Vec2,
  r: number,
): void {
  if (g.detonated) return
  const closing = Math.max(0, Math.min(1, 1 - g.telegraph / ECHO_TELEGRAPH))

  ctx.beginPath()
  floorArc(ctx, p.x, p.y, r, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(192, 132, 252, ${(0.08 + 0.22 * closing).toFixed(3)})`
  ctx.fill()
  ctx.strokeStyle = 'rgba(216, 180, 254, 0.85)'
  ctx.lineWidth = 2
  ctx.stroke()

  // A second ring falling in on the spot: the beat arriving.
  ctx.beginPath()
  floorArc(ctx, p.x, p.y, Math.max(1, r * (1 - closing)), 0, Math.PI * 2)
  ctx.strokeStyle = `rgba(216, 180, 254, ${(0.35 + 0.5 * closing).toFixed(3)})`
  ctx.lineWidth = 3
  ctx.stroke()
}


/**
 * Stone coming up through the floor, and then stone.
 *
 * Drawn as a shard rather than a disc on purpose. The pools are stains the
 * floor washes out; this is a thing standing in the room, and a raid deciding
 * where it can still walk in a minute has to read that difference at a glance
 * rather than by remembering which boss it is fighting. Warm stone, not the
 * fault's cold slate: one is the ground coming apart and this is the ground
 * standing up.
 */
function drawSpire(
  ctx: CanvasRenderingContext2D,
  g: SimState['ground'][number],
  p: Vec2,
  r: number,
): void {
  // Nine points, alternating long and short, at a fixed skew per spire so two
  // of them side by side are not the same picture twice.
  const teeth = 9
  const skew = (g.id % 7) * 0.31

  const shard = (reachLong: number, reachShort: number, points: number, turn: number): void => {
    ctx.beginPath()
    for (let i = 0; i < points * 2; i++) {
      const a = skew + turn + (i / (points * 2)) * Math.PI * 2
      const reach = i % 2 === 0 ? reachLong : reachShort
      const at = floorAt(p, a, reach)
      if (i === 0) ctx.moveTo(at.x, at.y)
      else ctx.lineTo(at.x, at.y)
    }
    ctx.closePath()
  }

  ctx.save()
  if (!g.detonated) {
    // Fills as the count runs out, so the eye is pulled to the middle of the
    // spot rather than to its edge.
    const left = Math.max(0, Math.min(1, g.telegraph / PUDDLE_TELEGRAPH))
    shard(r, r * 0.62, teeth, 0)
    ctx.fillStyle = `rgba(168, 162, 158, ${0.34 * (1 - left)})`
    ctx.fill()
    ctx.strokeStyle = 'rgba(168, 162, 158, 0.85)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.restore()
    return
  }

  // Up. Solid enough to read as an object, with a smaller shard inside it so
  // it has a face rather than a silhouette.
  shard(r, r * 0.58, teeth, 0)
  ctx.fillStyle = 'rgba(120, 113, 108, 0.55)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(214, 211, 209, 0.9)'
  ctx.lineWidth = 2
  ctx.stroke()

  shard(r * 0.5, r * 0.24, 5, 0.35)
  ctx.fillStyle = 'rgba(231, 229, 228, 0.28)'
  ctx.fill()
  ctx.restore()
}

/** Expanding ring: lethal band, safe interior. */
/**
 * A brand's ground: the same danger as a puddle and deliberately not the same
 * picture. Two bosses that drop hazardous floor should not be two bosses that
 * look identical while they do it, which is the whole reason the ladders were
 * pulled apart in the first place.
 */
function drawBrand(
  ctx: CanvasRenderingContext2D,
  g: SimState['ground'][number],
  p: Vec2,
  r: number,
): void {
  const live = g.detonated
  ctx.save()
  ctx.globalAlpha = live ? 0.62 + 0.38 * Math.min(1, g.lingering / 1.5) : 1

  if (!live) {
    // Filling inward rather than outward: the ring closes on the spot.
    const left = Math.max(0, Math.min(1, g.telegraph / PUDDLE_TELEGRAPH))
    ctx.beginPath()
    floorArc(ctx, p.x, p.y, r, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(244, 114, 182, 0.75)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.beginPath()
    floorArc(ctx, p.x, p.y, r * left, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(244, 114, 182, 0.35)'
    ctx.lineWidth = 3
    ctx.stroke()
  } else {
    // Spokes rather than a disc, so it reads as a scar and not as a pool.
    ctx.beginPath()
    floorArc(ctx, p.x, p.y, r, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(244, 114, 182, 0.16)'
    ctx.fill()
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2
      ctx.beginPath()
      const inner = floorAt(p, a, r * 0.35)
      const outer = floorAt(p, a, r)
      ctx.moveTo(inner.x, inner.y)
      ctx.lineTo(outer.x, outer.y)
      ctx.strokeStyle = 'rgba(244, 114, 182, 0.7)'
      ctx.lineWidth = 2
      ctx.stroke()
    }
  }
  ctx.restore()
}

/**
 * The split: where each group goes, and how much room it has to keep.
 *
 * The only mechanic here whose picture is not a piece of floor, because the
 * danger is not on the floor. What is drawn is the arrangement being asked
 * for — a muster point per group, with a line from the boss to each so the
 * bearings read at a glance — and, on each marked body, the circle nobody
 * wearing another mark may be inside of.
 */
function drawSchism(
  ctx: CanvasRenderingContext2D,
  s: SimState,
  g: SimState['ground'][number],
  p: Vec2,
  clock: number,
): void {
  if (g.detonated) return
  const closing = Math.max(0, Math.min(1, 1 - g.telegraph / SCHISM_TELEGRAPH))
  const sides = g.sides ?? 2

  ctx.save()
  for (let side = 0; side < sides; side++) {
    const muster = worldToScreen(schismMuster(g, side))
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(muster.x, muster.y)
    ctx.strokeStyle = 'rgba(5, 150, 105, 0.35)'
    ctx.lineWidth = 2
    ctx.setLineDash([8, 10])
    ctx.lineDashOffset = -clock * 30
    ctx.stroke()
    ctx.setLineDash([])

    ctx.beginPath()
    floorArc(ctx, muster.x, muster.y, (26 + 10 * closing) * L.scale, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(52, 211, 153, ${(0.4 + 0.5 * closing).toFixed(3)})`
    ctx.lineWidth = 2 + 3 * closing
    ctx.stroke()
  }

  // The room each marked body has to keep from the other groups.
  for (const a of s.actors) {
    if (a.faction !== 'party' || !a.alive) continue
    if (!getAura(a, 'schism')) continue
    const at = worldToScreen(a.pos)
    ctx.beginPath()
    floorArc(ctx, at.x, at.y, g.radius * L.scale, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(5, 150, 105, ${(0.12 + 0.2 * closing).toFixed(3)})`
    ctx.lineWidth = 1
    ctx.stroke()
  }
  ctx.restore()
}

function drawShockwave(
  ctx: CanvasRenderingContext2D,
  g: SimState['ground'][number],
  p: Vec2,
  r: number,
): void {
  const band = g.band * L.scale
  // The ring is drawn everywhere except its gap, because the gap is the
  // answer and an answer you cannot see is not one. Arcs run from the far
  // edge of the wedge round to its near edge.
  // The wedge is drawn against screen coordinates, so its bearing has to be
  // one too: the shape the simulation tests is a bearing in the world, and
  // the world is turned under the camera.
  const angle = screenAngle(g.angle)
  const from = angle + g.halfWidth
  const to = angle - g.halfWidth + Math.PI * 2

  // Three rings of wake behind the edge, so the ring reads as travelling
  // rather than as a circle that keeps being redrawn bigger.
  for (let i = 3; i >= 1; i--) {
    const behind = Math.max(1, r - band * i * 0.9)
    ctx.beginPath()
    floorArc(ctx, p.x, p.y, behind, from, to)
    ctx.strokeStyle = `rgba(250, 204, 21, ${(0.16 / i).toFixed(3)})`
    ctx.lineWidth = band
    ctx.stroke()
  }

  ctx.beginPath()
  floorArc(ctx, p.x, p.y, Math.max(1, r), from, to)
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.30)'
  ctx.lineWidth = band * 2
  ctx.stroke()

  ctx.beginPath()
  floorArc(ctx, p.x, p.y, Math.max(1, r), from, to)
  ctx.strokeStyle = 'rgba(253, 224, 71, 0.95)'
  ctx.lineWidth = 3
  ctx.stroke()

  // And the gap itself, marked out to the rim rather than at the ring's own
  // radius: the raid has to pick a bearing before the ring arrives, so what
  // it needs to see is the wedge, not the hole in a line.
  const reach = ARENA_RADIUS * L.scale
  ctx.beginPath()
  ctx.moveTo(p.x, p.y)
  floorArc(ctx, p.x, p.y, reach, angle - g.halfWidth, angle + g.halfWidth)
  ctx.closePath()
  ctx.fillStyle = 'rgba(74, 222, 128, 0.07)'
  ctx.fill()

  for (const edge of [angle - g.halfWidth, angle + g.halfWidth]) {
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(p.x + Math.cos(edge) * reach, p.y + Math.sin(edge) * reach)
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.45)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([5, 7])
    ctx.stroke()
    ctx.setLineDash([])
  }
}


/**
 * A line from the thing that is hunting somebody to whoever it is hunting.
 *
 * Drawn under the tokens with the rest of the floor, because it is a fact
 * about the fight rather than a thing on a person: at a glance it says which
 * one of the circles on screen is coming for which one of you, which is the
 * whole of what the mechanic asks.
 */
function drawHunts(ctx: CanvasRenderingContext2D, s: SimState, alpha: number): void {
  for (const a of s.actors) {
    if (a.hunting === null || !a.alive) continue
    const quarry = s.actors.find((other) => other.id === a.hunting)
    if (!quarry || !quarry.alive) continue

    const from = screenPos(a, alpha)
    const to = screenPos(quarry, alpha)
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.strokeStyle = 'rgba(251, 146, 60, 0.45)'
    ctx.lineWidth = 2
    ctx.setLineDash([7, 7])
    ctx.lineDashOffset = -s.time * 40
    ctx.stroke()
    ctx.setLineDash([])
  }
}

/**
 * A judgement pending on somebody, and how far off the line they are.
 *
 * Drawn as a bar rather than as a shape on the floor, because the floor has
 * nothing to do with it: the only fact that decides this one is a health bar,
 * and the picture has to say so or the mechanic reads as a hit with no tell.
 * The mark fills as the count runs down and the notch is the line — over the
 * notch when it fills and it passes over you, under it and it takes you.
 */
function drawVerdicts(ctx: CanvasRenderingContext2D, s: SimState, alpha: number): void {
  for (const a of s.actors) {
    if (a.faction !== 'party' || !a.alive) continue
    const mark = getAura(a, 'verdict')
    if (!mark) continue

    const p = screenPos(a, alpha)
    const safe = a.hp / a.maxHp > VERDICT_LINE
    const w = 44 * L.ui
    const h = 5 * L.ui
    const y = p.y - a.radius * L.scale - 30 * L.ui
    const spent = 1 - Math.max(0, mark.remaining) / mark.duration

    ctx.save()
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)'
    ctx.fillRect(p.x - w / 2, y, w, h)
    ctx.fillStyle = safe ? 'rgba(129, 140, 248, 0.9)' : 'rgba(244, 63, 94, 0.95)'
    ctx.fillRect(p.x - w / 2, y, w * spent, h)

    // The line itself, at the share of the bar it asks for.
    ctx.beginPath()
    ctx.moveTo(p.x - w / 2 + w * VERDICT_LINE, y - 2 * L.ui)
    ctx.lineTo(p.x - w / 2 + w * VERDICT_LINE, y + h + 2 * L.ui)
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.9)'
    ctx.lineWidth = Math.max(1, L.ui)
    ctx.stroke()

    // And a ring on the token, so it is findable without reading the bar.
    ctx.beginPath()
    floorArc(ctx, p.x, p.y, (a.radius + 7) * L.scale, 0, Math.PI * 2)
    ctx.strokeStyle = safe ? 'rgba(129, 140, 248, 0.55)' : 'rgba(244, 63, 94, 0.85)'
    ctx.lineWidth = 1 + spent * 3
    ctx.stroke()
    ctx.restore()
  }
}

function drawSpreadRings(ctx: CanvasRenderingContext2D, s: SimState, alpha: number): void {
  for (const a of s.actors) {
    if (a.faction !== 'party' || !a.alive) continue
    const aura = getAura(a, 'spread')
    if (!aura) continue

    const p = screenPos(a, alpha)
    const urgency = 1 - aura.remaining / aura.duration

    ctx.save()
    ctx.beginPath()
    floorArc(ctx, p.x, p.y, SPREAD_RADIUS * L.scale, 0, Math.PI * 2)
    ctx.strokeStyle = COLORS.spread
    ctx.lineWidth = 1 + urgency * 3
    ctx.setLineDash([4, 8])
    ctx.stroke()
    ctx.restore()

    ctx.fillStyle = COLORS.spread
    ctx.font = font(11, true)
    ctx.textAlign = 'center'
    ctx.fillText(aura.remaining.toFixed(1), p.x, p.y - a.radius * L.scale - 22 * L.ui)
  }
}

/**
 * The two mechanics whose answer is another person, drawn as the line between
 * them.
 *
 * Everything else on this floor is a shape you are inside or outside of, and
 * it can be drawn where it is and understood. These two are a relationship —
 * this one has to reach that one, before this number runs out — and a
 * relationship drawn as two separate marks is two marks nobody connects. So
 * the picture is the line itself, with the clock on the carrier and the target
 * ringed at the distance that counts as arrived.
 *
 * Drawn under the tokens and over the floor, with the party's own spread rings,
 * because it is the same kind of thing: information about people rather than
 * about ground.
 */
function drawHandoffs(ctx: CanvasRenderingContext2D, s: SimState, alpha: number): void {
  for (const a of s.actors) {
    if (a.faction !== 'party' || !a.alive) continue

    const weight = getAura(a, 'burden')
    if (weight) {
      const taker = burdenTaker(s, a)
      drawHandoff(
        ctx,
        s,
        alpha,
        a,
        taker,
        weight.remaining,
        BURDEN_REACH,
        'rgba(129, 140, 248, ',
        weight.stacks,
      )
    }

    const owed = getAura(a, 'yoke')
    if (owed) {
      const bearer =
        owed.bearer === undefined
          ? null
          : (livingParty(s).find((b) => b.id === owed.bearer) ?? null)
      drawHandoff(ctx, s, alpha, a, bearer, owed.remaining, YOKE_REACH, 'rgba(240, 171, 252, ', 0)
    }
  }
}

/**
 * One carrier, one person it has to reach, and how long it has.
 *
 * The line goes solid as the two close, which is the only feedback either of
 * them gets that the answer is working: a dashed line at full length reads as
 * a demand and a solid short one reads as a demand that has been met.
 */
function drawHandoff(
  ctx: CanvasRenderingContext2D,
  s: SimState,
  alpha: number,
  carrier: Actor,
  other: Actor | null,
  remaining: number,
  reach: number,
  rgb: string,
  stacks: number,
): void {
  const p = screenPos(carrier, alpha)

  ctx.save()
  // The clock, on the one who is holding it.
  ctx.beginPath()
  floorArc(ctx, p.x, p.y, (carrier.radius + 13) * L.scale, 0, Math.PI * 2)
  ctx.strokeStyle = `${rgb}0.75)`
  ctx.lineWidth = 2
  ctx.stroke()

  if (other) {
    const q = screenPos(other, alpha)
    const gap = dist(carrier.pos, other.pos)
    // Closing tightens the line rather than colouring it, so it reads at a
    // glance and in the corner of an eye.
    const closed = Math.max(0, Math.min(1, 1 - (gap - reach) / 320))
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(q.x, q.y)
    ctx.strokeStyle = `${rgb}${(0.25 + 0.5 * closed).toFixed(3)})`
    ctx.lineWidth = 1 + closed * 2
    ctx.setLineDash(gap <= reach ? [] : [5, 7])
    ctx.lineDashOffset = -s.time * 50
    ctx.stroke()
    ctx.setLineDash([])

    // Where "arrived" is, on the one being reached for.
    ctx.beginPath()
    floorArc(ctx, q.x, q.y, reach * L.scale, 0, Math.PI * 2)
    ctx.strokeStyle = `${rgb}0.3)`
    ctx.lineWidth = 1
    ctx.stroke()
  }
  ctx.restore()

  ctx.fillStyle = `${rgb}0.95)`
  ctx.font = font(11, true)
  ctx.textAlign = 'center'
  // The chain's leg, where there is one. A burden on its third pair of hands
  // is a different thing from one that has not moved, and the number is the
  // only place that says so.
  const label = stacks > 1 ? `${remaining.toFixed(1)} (${stacks})` : remaining.toFixed(1)
  ctx.fillText(label, p.x, p.y - carrier.radius * L.scale - 34 * L.ui)
}

/**
 * A cast in progress, on the caster.
 *
 * Drawn under the tokens, and gathering rather than expanding: everything
 * that leaves a token is something that already happened, so a cast has to
 * close in to read as something about to. The arc is the same number as the
 * cast bar on the frame, put where you are actually looking.
 */
function drawCasts(ctx: CanvasRenderingContext2D, s: SimState, alpha: number): void {
  ctx.save()
  ctx.lineCap = 'round'

  for (const a of s.actors) {
    if (!a.alive || !a.castId || a.castTotal <= 0) continue

    const p = screenPos(a, alpha)
    const progress = Math.max(0, Math.min(1, 1 - a.castRemaining / a.castTotal))
    const colour = castColour(a.castId)
    const base = Math.max(4, a.radius * L.scale)

    // Closes from a way out to the edge of the token as the cast completes.
    const gather = base + (1 - progress) * 34 * L.scale
    ctx.beginPath()
    floorArc(ctx, p.x, p.y, gather, 0, Math.PI * 2)
    ctx.strokeStyle = tint(colour, 0.2 + 0.5 * progress)
    ctx.lineWidth = Math.max(1, 2 * L.scale)
    ctx.setLineDash([5, 6])
    ctx.lineDashOffset = -progress * 40
    ctx.stroke()
    ctx.setLineDash([])

    // And a dial around the token, filling clockwise from noon.
    ctx.beginPath()
    floorArc(ctx, p.x, p.y, base + 5 * L.scale, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress)
    ctx.strokeStyle = tint(colour, 0.9)
    ctx.lineWidth = Math.max(1.5, 3 * L.scale)
    ctx.stroke()
  }

  ctx.restore()
  ctx.lineCap = 'butt'
}

/** The boss's casts are not abilities, so they wear its own cast colour. */
function castColour(castId: string): string {
  return castId.startsWith('boss_') ? COLORS.bossCast : iconFor(castId).colour
}

/** Mirrors the simulation's hit test, including the rim grace. */
function standingInFire(s: SimState, a: Actor): boolean {
  if (!a.alive) return false
  return s.ground.some(
    (g) => g.detonated && dist(a.pos, g.pos) <= g.radius - a.radius * 0.6,
  )
}

/** What colour this fight's boss is. A battleground has none. */
/**
 * The boss's body key, or nothing outside a raid.
 *
 * A battleground has no boss, so this is the one place that knows which of the
 * five belongs to the large hostile thing on the floor.
 */
/**
 * How wide a flame on the floor is drawn, in world units.
 *
 * A size of its own rather than a share of the pool it is in, which is what
 * this was first written as and was wrong twice over. A pool can be three
 * times the width of the person standing in it, so a sprite scaled to fill one
 * covered a quarter of the arena — and worse, it stopped being a picture: this
 * is a thirty-two pixel drawing, and at eight times its size the flame was an
 * orange smear with no shape in it at all.
 *
 * A fire is fire-sized. A bigger pool gets more of them rather than a larger
 * one, which is also what a burning pool actually looks like.
 */
const FLAME = 34

/**
 * How many flames a pool of a given radius is worth, and where they sit.
 *
 * Enough to read as burning and few enough to stay out of the way. They are
 * kept well inside the edge, because the edge is the whole of what a pool is
 * telling anybody — it is the line between standing here and not — and a
 * sprite that reached it would be redrawing the one measurement the player is
 * making. Same reason the floor texture came out and the hit effects came
 * down: whatever the floor is holding wins.
 *
 * Placement is off the pool's own id, so it is the same picture every frame
 * and a different one from the pool beside it.
 */
function flamesIn(radius: number): Array<{ dx: number; dy: number }> {
  const spots = [{ dx: 0, dy: 0 }]
  const ring = Math.min(4, Math.floor(radius / FLAME))
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2
    const at = radius * 0.46
    spots.push({ dx: Math.cos(a) * at, dy: Math.sin(a) * at })
  }
  return spots
}

/**
 * How long the swing for an instant lasts, in seconds.
 *
 * Short, and much shorter than the global cooldown it is read off. It is the
 * time a blow takes rather than the time until the next one is allowed, and
 * those are different numbers — stretched to the full global, a body would
 * still be finishing its last swing as the next one began.
 */
const SWING_TIME = 0.4

/**
 * How far through the swing an instant is, or null if it is not swinging.
 *
 * Read off the global cooldown, which is the only mark an instant leaves on
 * the actor: it resolves on the tick it is pressed, so by the time anything
 * draws it, it is over. The global is set at the press and counts down, which
 * makes the elapsed time exactly what is wanted.
 *
 * It cannot fire twice for one press. A cast-time ability sets the global at
 * the same moment it starts casting, so the two overlap only at the front of
 * the cast — where `castId` is set and wins. By the time a cast resolves its
 * global is either spent or well past this window.
 *
 * Abilities that skip the global get nothing, which is the honest limit of
 * reading the global rather than a decision: nineteen do, and they are the
 * ones a rotation presses without paying for, so a body playing no swing for
 * them is closer to right than one that does.
 */
function swingProgress(a: Actor): number | null {
  const gone = GLOBAL_COOLDOWN - a.gcd
  if (a.gcd <= 0 || gone >= SWING_TIME) return null
  return Math.max(0, Math.min(1, gone / SWING_TIME))
}

/**
 * How much of the walk cycle one unit of travel is worth.
 *
 * Half what it was, which is to say a stride now covers about two body widths
 * instead of one. At the old rate the legs were turning over faster than the
 * body was crossing the floor, and a raid of twenty-five of them read as
 * scurrying rather than walking.
 *
 * Only the walk. A cast is animated off how far through the cast it is, and
 * that has to stay where it is: the animation lasts exactly as long as the
 * thing it is showing, and slowing it would leave a swing finished and stood
 * there while the cast bar was still running.
 */
const STRIDE = 0.16

// The footprint used to carry its own flattening — 0.44, its own constant —
// because it was the only thing in the renderer that admitted the floor is
// looked across rather than straight down. Everything else on that floor was
// still a true circle. It goes through `floorArc` with the rest of them now,
// and the number it used to hold has become the camera's.

/**
 * The patch of floor an actor is standing on.
 *
 * Centred on the actor's own position, because that is where its feet are: the
 * simulation's `pos` is a point on the ground, so the ellipse around it is the
 * ground it occupies and the body is drawn upwards out of the middle of it.
 *
 * Every ring an actor wears goes through here. A status ring left as a circle
 * around an elliptical footprint would read as two different floors.
 */
function footprint(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number): void {
  ctx.beginPath()
  floorArc(ctx, x, y, rx)
}

function bossBody(s: SimState): string | null {
  return s.mode === 'raid' ? `boss-${encounterAt(s.encounter).id}` : null
}

function bossAccent(s: SimState): string {
  return s.mode === 'raid' ? encounterAt(s.encounter).accent : COLORS.boss
}

function drawActor(
  ctx: CanvasRenderingContext2D,
  a: Actor,
  alpha: number,
  clock: number,
  burning: boolean,
  battleground = false,
  /** The boss's own colour. Three bosses in the same red read as one boss. */
  accent: string = COLORS.boss,
  /**
   * Which body to stand on the disc, for the one actor whose identity is not
   * on itself. A party member carries its class and spec; a boss's is a
   * property of the encounter, so the caller that knows it passes it.
   */
  bossBody: string | null = null,
): void {
  const p = screenPos(a, alpha)
  const r = Math.max(4, a.radius * L.scale)
  // In a battleground the other side is five people, not a boss and its
  // thralls: they keep their class colours and are told apart by a ring.
  const isBoss = a.id === BOSS_ID && !battleground
  const isAdd = a.faction === 'boss' && !isBoss && !battleground
  const hostile = battleground && a.faction === 'boss'
  // Colour says the class, the glyph says the role. You are still the one
  // with a ring around you, which is what picks you out of twenty-five.
  const color = a.alive
    ? isBoss
      ? accent
      : isAdd
        ? '#a855f7'
        : classColor(a.classId)
    : COLORS.dead

  if (a.isPlayer && a.alive) {
    // A soft pulse so the player never loses their own token in a crowd.
    footprint(ctx, p.x, p.y, r + 7 + Math.sin(clock * 4) * 1.5)
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.35)'
    ctx.lineWidth = 2
    ctx.stroke()
  }

  // Whose side, before whose class. Ten class colours on one screen say what
  // everyone is playing and nothing about who is about to hit you.
  if (hostile && a.alive) {
    footprint(ctx, p.x, p.y, r + 4)
    ctx.strokeStyle = COLORS.boss
    ctx.lineWidth = 2
    ctx.stroke()
  }

  // A summon gets its own body rather than the boss's, which would say it is
  // the boss, and rather than a class's, which it does not have. The two named
  // kinds are drawn apart on purpose: telling them apart is the whole demand
  // of the fights that spawn them, and a health bar cannot carry it.
  const token = isBoss
    ? bossBody
    : isAdd
      ? `add-${a.spawn ?? 'thrall'}`
      : `${a.classId}-${a.spec}`
  const bodied = token !== null && a.alive && hasBody(token)

  footprint(ctx, p.x, p.y, r)
  // Under a walking body the disc is the ground it stands in rather than the
  // body itself, so it drops to a shade and the class colour moves out to the
  // ring. Left a solid colour it was a bright plate across every sprite's feet.
  ctx.fillStyle = bodied ? 'rgba(6, 8, 10, 0.5)' : color
  ctx.globalAlpha = a.alive ? 1 : 0.4
  ctx.fill()

  ctx.globalAlpha = 1
  ctx.strokeStyle = bodied ? color : '#0a0a0f'
  ctx.lineWidth = 2
  ctx.stroke()


  // Residual puddle damage is silent by design; without this you lose health
  // with nothing on screen explaining it.
  if (burning) {
    footprint(ctx, p.x, p.y, r + 3.5)
    ctx.strokeStyle = `rgba(248, 113, 113, ${(0.55 + 0.45 * Math.sin(clock * 12)).toFixed(2)})`
    ctx.lineWidth = 3
    ctx.stroke()
  }

  if (getAura(a, 'shield')) {
    footprint(ctx, p.x, p.y, r + 5)
    ctx.strokeStyle = '#93c5fd'
    ctx.lineWidth = 3
    ctx.stroke()
  }

  // The body last, over every ring that is on the ground.
  //
  // All of those are marks on the floor — the footprint, the fire you are
  // standing in, the shield around you — and a mark on the floor belongs under
  // the thing standing on it. Stroked after, the footprint was a hoop drawn
  // across a pair of ankles.
  if (token && bodied) {
    // The cycle is driven by ground covered rather than by the clock, so feet
    // keep pace with the floor: something slowed to a crawl walks slowly
    // instead of running on the spot.
    const step = Math.hypot(a.pos.x - a.prevPos.x, a.pos.y - a.prevPos.y)
    // How far through the cast, so the animation lasts exactly as long as the
    // thing it is showing. A swing that finishes early and then stands there
    // reads as the cast having been cancelled.
    //
    // An instant has no cast to be part of the way through — it resolves on
    // the tick it is pressed and never sets `castId` — so most of what a spec
    // presses used to happen with the body standing perfectly still. Seventy
    // three of the abilities in this game are instants; a rogue's whole
    // rotation is.
    //
    // What they do have is the global cooldown, which starts when they are
    // pressed and is already on the actor. The animation is played over the
    // front of it rather than across the whole thing: a global is a second and
    // a half and a swing is not, and one stretched over the whole window would
    // still be swinging when the next press lands.
    const casting =
      a.castId !== null && a.castTotal > 0
        ? Math.max(0, Math.min(1, 1 - a.castRemaining / a.castTotal))
        : swingProgress(a)
    drawBody(
      ctx,
      token,
      p.x,
      p.y,
      r,
      screenAngle(a.facing),
      (a.pos.x + a.pos.y) * STRIDE,
      step > 0.2,
      casting,
      a.alive ? 1 : 0.4,
      a.id,
    )
  }


  // Whatever picked this one, drawn as a line to it.
  //
  // A stalker looks like every other add on the floor, and the mechanic is
  // entirely about which one of you it is coming for — so the answer is drawn
  // rather than left to be worked out from six moving circles.
  const hunted = getAura(a, 'hunted')
  if (hunted && a.alive) {
    ctx.beginPath()
    floorArc(ctx, p.x, p.y, r + 9 + Math.sin(clock * 7) * 2, 0, Math.PI * 2)
    ctx.strokeStyle = '#fb923c'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 5])
    ctx.lineDashOffset = -clock * 30
    ctx.stroke()
    ctx.setLineDash([])
  }

  // The armour break, as arcs around whoever is holding the boss. A stack is
  // a decision — swap, or hold it — and a decision that is only visible as
  // the health bar dropping faster is not one anybody gets to make.
  const sunder = getAura(a, 'sunder')
  if (sunder) {
    for (let i = 0; i < sunder.stacks; i++) {
      const from = -Math.PI / 2 + (i * Math.PI * 2) / SUNDER_MAX
      ctx.beginPath()
      floorArc(ctx, p.x, p.y, r + 6, from + 0.12, from + (Math.PI * 2) / SUNDER_MAX - 0.12)
      ctx.strokeStyle = '#b45309'
      ctx.lineWidth = 3
      ctx.stroke()
    }
  }

  const glyph = isBoss ? 'B' : isAdd ? 'x' : a.role === 'tank' ? 'T' : a.role === 'healer' ? 'H' : 'D'
  ctx.fillStyle = '#0a0a0f'
  ctx.font = font(isBoss ? 16 : 11, true)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(glyph, p.x, p.y)
  ctx.textBaseline = 'alphabetic'

  // A bar over anybody who is hurt, and over nobody who is not.
  //
  // Always-on bars would be twenty-seven of them in a twenty-five man, which
  // is wallpaper rather than information — the party frames already carry that
  // in a grid you can read. Showing them only below full turns the arena
  // itself into the readout exactly when it matters, and leaves it clean when
  // it does not. One line, no number: at seven pixels a token on a portrait
  // phone, colour and length are the only things that survive.
  const hurt = a.alive && a.hp < a.maxHp * 0.95
  if (hurt) {
    const ratio = Math.max(0, Math.min(1, a.hp / a.maxHp))
    const w = Math.max(14, r * 2.4)
    const bx = p.x - w / 2
    const by = p.y - r - 9
    ctx.fillStyle = 'rgba(0, 0, 0, 0.62)'
    ctx.fillRect(bx - 1, by - 1, w + 2, 5)
    // Red once it is genuinely dangerous, so a glance sorts "chipped" from
    // "about to die" without reading a number that is not there.
    ctx.fillStyle = isAdd
      ? '#a855f7'
      : ratio < 0.35
        ? COLORS.hpBarLow
        : hostile || isBoss
          ? COLORS.boss
          : COLORS.hpBar
    ctx.fillRect(bx, by, w * ratio, 3)
  }

  // The name, above whatever else is up there.
  //
  // It used to be drawn only while somebody was at full health, on the
  // grounds that a hurt body is already carrying a bar where the name would
  // go — which meant a name vanished the moment its owner became worth
  // looking at. It sits above the bar instead, and the bar keeps the place it
  // had.
  //
  // Everyone, at every size and on every screen. There was a rule here that
  // withheld them from a twenty-five man on a small screen, on the grounds
  // that twenty-five names is mush — but a name you cannot rely on being
  // there is worse than a crowded one, and picking a particular body out of
  // the crowd is exactly what the raid size makes hard.
  if (a.faction === 'party' && a.alive) {
    ctx.fillStyle = COLORS.textDim
    ctx.font = font(9)
    ctx.fillText(a.name, p.x, p.y - r - (hurt ? 15 : 8))
  }

  if (a.castId && a.castTotal > 0) {
    const w = (isBoss ? 90 : 48) * L.ui
    const progress = 1 - a.castRemaining / a.castTotal
    const bx = p.x - w / 2
    const by = p.y + r + 8
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(bx, by, w, 5)
    ctx.fillStyle = isBoss ? COLORS.bossCast : COLORS.castBar
    ctx.fillRect(bx, by, w * progress, 5)
  }
}

/** Six-digit hex to a translucent rgba, for the halo around a bolt's core. */
function tint(colour: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(colour)) return colour
  const r = parseInt(colour.slice(1, 3), 16)
  const g = parseInt(colour.slice(3, 5), 16)
  const b = parseInt(colour.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

interface BoltStyle {
  core: string
  glow: string
  radius: number
  /**
   * How wide the sprite is drawn, in the same units as `radius`.
   *
   * Its own number rather than a multiple of the radius, which is what this
   * was first written as and was wrong twice over. The radii run from 3.5 to
   * 6, so one multiplier big enough for a dart to read at all made the heavy
   * orb nearly as tall as the person who threw it — and a sprite has a size it
   * stops being legible below that has nothing to do with how big the thing it
   * depicts is meant to be. Splitting them lets the heavy bolt stay the
   * biggest without the smallest one disappearing.
   */
  sprite: number
}

const BOLT: Record<ProjectileKind, BoltStyle> = {
  bolt: { core: '#e0f2fe', glow: 'rgba(125, 211, 252, 0.45)', radius: 3.5, sprite: 7 },
  dot: { core: '#ffedd5', glow: 'rgba(251, 146, 60, 0.5)', radius: 4, sprite: 8 },
  heavy: { core: '#f5d0fe', glow: 'rgba(217, 70, 239, 0.5)', radius: 6, sprite: 10 },
  heal: { core: '#bbf7d0', glow: 'rgba(74, 222, 128, 0.5)', radius: 4, sprite: 8 },
}

/**
 * Ranged abilities resolve instantly; these bolts only show where the damage
 * came from. Without them a caster standing still is indistinguishable from
 * one doing nothing at all.
 */
/**
 * Where each bolt has been, in world space.
 *
 * Renderer-side and keyed by projectile id, like the camera: a trail is
 * decoration and has no business in a state that has to replay identically.
 * Only appended when the bolt has actually moved, so its length is a number
 * of ticks rather than a number of frames.
 */
const TRAIL = 5
const trails = new Map<number, Vec2[]>()

function updateTrails(s: SimState): void {
  const live = new Set<number>()
  for (const p of s.projectiles) {
    live.add(p.id)
    const path = trails.get(p.id) ?? []
    const last = path[path.length - 1]
    if (!last || last.x !== p.pos.x || last.y !== p.pos.y) {
      path.push({ x: p.pos.x, y: p.pos.y })
      if (path.length > TRAIL) path.shift()
      trails.set(p.id, path)
    }
  }
  for (const id of [...trails.keys()]) if (!live.has(id)) trails.delete(id)
}

function drawProjectiles(ctx: CanvasRenderingContext2D, s: SimState, alpha: number): void {
  updateTrails(s)

  for (const p of s.projectiles) {
    const style = BOLT[p.kind]
    if (!style) continue

    // The shape and speed come from the kind, the colour from the ability's
    // own icon: fifty-one spells were flying as four colours of dot, and the
    // table that tells them apart already existed.
    const core = p.abilityId ? iconFor(p.abilityId).colour : style.core
    const glow = p.abilityId ? tint(core, 0.45) : style.glow

    // Flying at chest height rather than along the floor. A projectile's
    // position is a point on the ground — every position in the simulation is
    // — so a bolt aimed at somebody arrived between their ankles.
    //
    // From the thrower's chest to the target's, rather than either one alone.
    // The two things worth aiming at here differ by a factor of three: held at
    // a raider's chest a bolt strikes the boss at the knee, and held at the
    // boss's it leaves the caster from somewhere above their head.
    //
    // How far along it is comes from the two distances rather than from a
    // launch point, which is not kept and would be wrong by the time it
    // mattered anyway — both ends of this walk around while the bolt is in the
    // air.
    const thrower = p.sourceId === null ? undefined : s.actors.find((a) => a.id === p.sourceId)
    const struck = s.actors.find((a) => a.id === p.targetId)
    const leaves = chestHeight(thrower?.radius ?? PARTY_RADIUS)
    const lands = chestHeight(struck?.radius ?? PARTY_RADIUS)
    const gone = thrower ? dist(p.pos, thrower.pos) : 0
    const left = struck ? dist(p.pos, struck.pos) : 0
    const along = gone + left > 0.01 ? gone / (gone + left) : 1
    const lift = (leaves + (lands - leaves) * along) * L.scale

    const head = worldToScreen({
      x: lerp(p.prevPos.x, p.pos.x, alpha),
      y: lerp(p.prevPos.y, p.pos.y, alpha),
    })
    const tail = worldToScreen(p.prevPos)
    const x = head.x
    const y = head.y - lift
    const tailX = tail.x
    const tailY = tail.y - lift
    const r = Math.max(2, style.radius * L.scale)

    // The trail behind it, thinning and fading toward where it came from.
    const path = trails.get(p.id)
    if (path && path.length > 1) {
      ctx.lineCap = 'round'
      for (let i = 1; i < path.length; i++) {
        const from = worldToScreen(path[i - 1]!)
        const to = worldToScreen(path[i]!)
        from.y -= lift
        to.y -= lift
        const fade = i / path.length
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(to.x, to.y)
        ctx.strokeStyle = tint(core, 0.35 * fade)
        ctx.lineWidth = Math.max(1, r * 1.2 * fade)
        ctx.stroke()
      }
    }

    // A halo that actually falls off, rather than a flat disc with a hard
    // edge pretending to be one. It goes down first either way: under the disc
    // it is the glow, under the sprite it is what lifts a sixteen-pixel body
    // off a floor busy with telegraphs.
    const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2)
    halo.addColorStop(0, tint(core, 0.5))
    halo.addColorStop(0.45, tint(core, 0.22))
    halo.addColorStop(1, tint(core, 0))
    ctx.beginPath()
    ctx.arc(x, y, r * 3.2, 0, Math.PI * 2)
    ctx.fillStyle = halo
    ctx.fill()

    // Which way it is going, out of where it has just been. The trail is the
    // better source than this frame's step: interpolation can put the head and
    // the tail on the same point between ticks, and a bolt that has not moved
    // this frame still knows which way it was thrown.
    const from =
      path && path.length > 1
        ? { x: worldToScreen(path[0]!).x, y: worldToScreen(path[0]!).y - lift }
        : { x: tailX, y: tailY }
    const angle = Math.atan2(y - from.y, x - from.x)

    // The body, if the sheet is there. It replaces the core disc rather than
    // covering it: unlike the hit effects, a bolt in flight has nothing
    // underneath it to keep saying what school it is — so the sprite is
    // greyscale and takes the same colour the disc did.
    const sprite = Math.max(6, style.sprite * L.scale)
    if (!drawBolt(ctx, p.kind, x, y, sprite, angle, core, s.time)) {
      ctx.beginPath()
      ctx.moveTo(tailX, tailY)
      ctx.lineTo(x, y)
      ctx.strokeStyle = glow
      ctx.lineWidth = r * 1.5
      ctx.lineCap = 'round'
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = core
      ctx.fill()
    }
  }
  ctx.lineCap = 'butt'
}

/** How big a hit has to be to be drawn at full size. */
const BIG_HIT = 1400

/**
 * Your own numbers, over a floor that is full of other things.
 *
 * Four things were wrong with these and all four were the same thing: they
 * were drawn as if the arena behind them were empty. Twelve pixels of pale
 * red with no outline over a magenta puddle is not a number, it is texture;
 * the alpha started falling on the frame they appeared, so they spent most of
 * their life half gone; every hit landed on the same point, so a fast
 * rotation stacked four of them into one smudge; and a filler and a finisher
 * differ by a factor of ten and were the same size, which meant the only way
 * to tell a big hit from a small one was to stop and read it.
 */
/**
 * How much bigger the numbers and messages float than they used to.
 *
 * Everything about the text is multiplied, not only the font: the lanes it
 * fans into, how far it rises, and how high above the body it starts. Doubling
 * the glyphs alone would put twice-as-wide numbers into lanes sized for the
 * old ones, and four hits at once would go back to being the smudge the lanes
 * exist to prevent. The outline follows the font already, so it comes along.
 */
const TEXT_SCALE = 2

function drawFloatingText(ctx: CanvasRenderingContext2D, s: SimState, alpha: number): void {
  ctx.textAlign = 'center'
  for (const t of s.texts) {
    const age = t.age + alpha * (1 / 30)
    const life = Math.min(1, age / 1.1)
    const p = worldToScreen(t.pos)

    // Full strength for the first half, then out. A number that starts fading
    // immediately is only properly visible on the frame it appears.
    const fade = life < 0.5 ? 1 : 1 - (life - 0.5) / 0.5

    // Fanned out rather than stacked. The id is what the simulation already
    // hands out in order, so consecutive hits take consecutive lanes and a
    // burst of four reads as four numbers instead of one smudge.
    const lane = (t.id % 4) - 1.5
    // The lanes widen with the type. Bigger numbers need more room between
    // them or fanning them out stops separating anything — which is why the
    // scale below multiplies this too, and not only the font.
    const drift = lane * 19 * L.ui * TEXT_SCALE
    const rise = (30 + Math.abs(lane) * 7) * TEXT_SCALE

    const heavy = Math.min(1, t.power / BIG_HIT)
    const size =
      TEXT_SCALE *
      (t.kind === 'miss'
        ? // Why a press did nothing — out of range, out of mana, on cooldown.
          // It is a sentence rather than a number, and it was the smallest
          // thing on the screen.
          16
        : (t.kind === 'crit' ? 22 : 18) + heavy * (t.kind === 'crit' ? 12 : 9))

    const colour =
      t.kind === 'heal'
        ? '#4ade80'
        : t.kind === 'crit'
          ? '#fbbf24'
          : t.kind === 'miss'
            ? '#94a3b8'
            : t.kind === 'taken'
              ? '#f87171'
              : // What you dealt, in something that is not another shade of the
                // floor: the numbers a player is actually watching.
                '#f8fafc'

    ctx.save()
    ctx.globalAlpha = fade
    ctx.font = font(size, true)
    const x = p.x + drift * life
    const y = p.y - 20 * L.ui * TEXT_SCALE - life * rise

    // The outline is the whole fix. Everything else here is a refinement of
    // something that is already legible.
    ctx.lineWidth = Math.max(3, size * 0.28)
    ctx.strokeStyle = 'rgba(6, 7, 12, 0.92)'
    ctx.lineJoin = 'round'
    ctx.strokeText(t.text, x, y)
    ctx.fillStyle = colour
    ctx.fillText(t.text, x, y)
    ctx.restore()
  }
}

/**
 * The count that punishes working, drawn as the room closing rather than as a
 * shape on the floor.
 *
 * Every other picture in here answers "where is it". This one has to answer
 * "how long have I got", because there is no where — so it is a ring at the
 * arena's own edge that thickens inward as the count runs out, with nothing
 * drawn on the floor at all. A player who reads it as somewhere to leave has
 * been told the wrong thing, and a filled circle would tell them exactly that.
 */
function drawVigil(
  ctx: CanvasRenderingContext2D,
  g: SimState['ground'][number],
  p: Vec2,
  r: number,
): void {
  if (g.detonated) return
  const closing = Math.max(0, Math.min(1, 1 - g.telegraph / VIGIL_TELEGRAPH))

  ctx.save()
  ctx.beginPath()
  floorArc(ctx, p.x, p.y, r, 0, Math.PI * 2)
  ctx.strokeStyle = `rgba(245, 158, 11, ${(0.3 + 0.6 * closing).toFixed(3)})`
  ctx.lineWidth = 3 + 26 * closing
  ctx.stroke()

  // And the count itself, as a ring falling in on the boss. It is the only
  // part of the picture that says when, and the mechanic is nothing but when.
  ctx.beginPath()
  floorArc(ctx, p.x, p.y, Math.max(1, 70 * L.scale * (1 - closing)), 0, Math.PI * 2)
  ctx.strokeStyle = `rgba(253, 230, 138, ${(0.35 + 0.55 * closing).toFixed(3)})`
  ctx.lineWidth = 2 + 4 * closing
  ctx.stroke()
  ctx.restore()
}

/**
 * The note, and the line to the one body that can cut it.
 *
 * The line is the whole picture. Twenty-four people cannot do anything about
 * this and one can, so what has to be legible at a glance is which of them it
 * is — a ring on the boss alone would be a mechanic nobody knows is theirs.
 */
function drawChant(
  ctx: CanvasRenderingContext2D,
  s: SimState,
  g: SimState['ground'][number],
  p: Vec2,
  r: number,
): void {
  if (g.detonated) return
  const closing = Math.max(0, Math.min(1, 1 - g.telegraph / CHANT_CAST))

  ctx.save()
  for (let i = 0; i < 3; i++) {
    const phase = (closing + i / 3) % 1
    ctx.beginPath()
    floorArc(ctx, p.x, p.y, Math.max(1, r * phase), 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(124, 58, 237, ${(0.5 * (1 - phase)).toFixed(3)})`
    ctx.lineWidth = 3
    ctx.stroke()
  }

  for (const a of s.actors) {
    if (a.faction !== 'party' || !a.alive) continue
    if (!getAura(a, 'chant')) continue
    const at = worldToScreen(a.pos)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(at.x, at.y)
    ctx.strokeStyle = `rgba(167, 139, 250, ${(0.4 + 0.5 * closing).toFixed(3)})`
    ctx.lineWidth = 2 + 3 * closing
    ctx.stroke()

    ctx.beginPath()
    floorArc(ctx, at.x, at.y, (a.radius + 10) * L.scale, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(124, 58, 237, ${(0.55 + 0.4 * closing).toFixed(3)})`
    ctx.lineWidth = 2 + 3 * closing
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * The thing about to look at you, and a mark on everyone still looking back.
 *
 * Both halves are needed and the second is the one that teaches. A ring on the
 * boss says something is coming; the marks say who it is coming for, and since
 * that is decided by a bearing rather than by a tile there is nothing else on
 * the screen a player could work it out from.
 */
function drawGaze(
  ctx: CanvasRenderingContext2D,
  s: SimState,
  g: SimState['ground'][number],
  p: Vec2,
  r: number,
): void {
  if (g.detonated) return
  const closing = Math.max(0, Math.min(1, 1 - g.telegraph / GAZE_TELEGRAPH))

  ctx.save()
  ctx.beginPath()
  floorArc(ctx, p.x, p.y, r * (1 - 0.35 * closing), 0, Math.PI * 2)
  ctx.strokeStyle = `rgba(217, 70, 239, ${(0.4 + 0.5 * closing).toFixed(3)})`
  ctx.lineWidth = 2 + 5 * closing
  ctx.stroke()

  for (const a of s.actors) {
    if (a.faction !== 'party' || !a.alive) continue
    const at = worldToScreen(a.pos)
    const looking = watched(a, g)
    ctx.beginPath()
    floorArc(ctx, at.x, at.y, (a.radius + 7) * L.scale, 0, Math.PI * 2)
    ctx.strokeStyle = looking
      ? `rgba(240, 171, 252, ${(0.35 + 0.55 * closing).toFixed(3)})`
      : 'rgba(148, 163, 184, 0.25)'
    ctx.lineWidth = looking ? 2 + 3 * closing : 1
    ctx.stroke()

    // The bearing itself, as a stub off each body. Without it the marks are a
    // rule the player is told about rather than one they can see obeyed.
    ctx.beginPath()
    ctx.moveTo(at.x, at.y)
    ctx.lineTo(
      at.x + Math.cos(screenAngle(a.facing)) * (a.radius + 16) * L.scale,
      at.y + Math.sin(screenAngle(a.facing)) * (a.radius + 16) * L.scale,
    )
    ctx.strokeStyle = looking ? 'rgba(240, 171, 252, 0.8)' : 'rgba(148, 163, 184, 0.5)'
    ctx.lineWidth = 2
    ctx.stroke()
  }
  ctx.restore()
}
