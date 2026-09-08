import {
  BLOAT_BURST_AT,
  BLOAT_SWAP_AT,
  GLOBAL_COOLDOWN,
  INHALE_MAX,
  PARTY_RADIUS,
  PUDDLE_TELEGRAPH,
  REEK_REACH,
  SHADE_REACH,
  SPORE_REACH,
  SPILL_RADIUS,
  GORGE_RADIUS,
  STORM_REACH,
} from '../sim/constants'
import { AURA_DURATION, dist, getAura } from '../sim/combat'
import { CART_RADIUS, FLAG_PICKUP, FLAG_TAKE, RALLY_TELEGRAPH } from '../sim/battleground'
import { BOSS_ID } from '../sim/state'
import { playerTarget } from '../sim/sim'
import { encounterAt } from '../sim/encounters'
import { chamberAt } from '../dungeon'
import { bgAnchor } from '../sim/bgai'
import { EXIT_REACH, awake, heading, travelAnchor } from '../sim/travel'
import { turnView, viewAngle } from './camera'
import type { Actor, BgState, ProjectileKind, SimState, Vec2 } from '../sim/types'
import { iconFor } from './icons'
import type { Effects } from './effects'
import { drawGrave, drawObstacles, floorTexture } from './scenery'
import { EDGE_LAP, roomHasOutside } from '../sim/room'
import { COLORS, L, classColor, setWorldRoom, worldReach, worldRoom } from './theme'
import { bodyHeight, drawBody, hasBody } from './lpcimage'
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
 * Whatever the mode is about: what the player is fighting in a raid, and in a
 * battleground the place this player's own orders point at. The
 * battleground's is the steadier of the two, because it is a place rather than
 * a body — a node or a flag or a rally stands still while the fight moves
 * around it, and it is already held deliberately still by the plan for the
 * same reason a camera would want it to be.
 *
 * The raid's used to be the boss and only ever the boss, which is right until
 * the fight puts something else in front of you. A thrall, a stalker, a
 * herald: those are the whole of what the raid is doing while they stand, and
 * the camera stayed pointed past them at a boss nobody was hitting. This
 * module's first sentence says the thing you are working on stays at the top
 * of the screen, and for the minute an interlude lasts it was not true.
 *
 * `playerTarget` rather than a second opinion about what the player is
 * fighting. It is what the health bar at the top reads, what a press aims at,
 * and what the rotation is already built around — three places that would have
 * to agree with a fourth if this asked the question itself.
 */
function anchorOf(s: SimState): Vec2 | null {
  const player = s.actors.find((a) => a.isPlayer)
  if (!player) return null
  if (s.mode === 'battleground') return bgAnchor(s, player)
  // In a corridor the thing the view is arranged around is whatever woke up,
  // and the way out when nothing has.
  if (s.mode === 'travel') return travelAnchor(s)
  const target = s.actors.find((a) => a.id === playerTarget(s) && a.alive)
  if (target) return target.pos
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
  // Which room this is, before anything is measured against it: the layout's
  // scale is how much world fits on the glass, and that is a fact about the
  // room rather than a constant.
  setWorldRoom(s.room)
  updateCamera(s, alpha, clock)

  // The shove goes on the world and nowhere else: a heads-up display that
  // shakes is a heads-up display nobody can read.
  const shove = effects.offset()
  ctx.save()
  ctx.translate(shove.x * L.scale, shove.y * L.scale)

  drawArena(
    ctx,
    s.mode === 'raid' ? encounterAt(s.encounter).accent : COLORS.boss,
    s.seed,
    s.encounter,
    s.mode === 'raid' ? s.gauge : 0,
  )
  drawTerrain(ctx, s)
  drawObjectives(ctx, s, clock)
  drawDoors(ctx, s, clock)
  drawGround(ctx, s, clock)
  drawShades(ctx, s, clock)
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
  drawSwallowed(ctx, s, alpha, clock)

  for (const a of drawOrder(s, alpha)) {
    // A body inside the boss is not on the floor. It is drawn as a ring under
    // the boss instead -- see `drawSwallowed` -- because "where did they go"
    // has to be answerable, and a figure standing in the middle of the arena
    // taking no damage and casting nothing would answer it wrongly.
    if (getAura(a, 'swallowed')) continue
    if (a.faction === 'boss') {
      drawActor(
        ctx,
        a,
        alpha,
        clock,
        false,
        bg,
        bossAccent(s),
        bossBody(s),
        s.seed,
        s.phase,
        s.time - s.phaseAt,
        a.id === BOSS_ID ? s.gauge : 0,
      )
    } else {
      drawActor(ctx, a, alpha, clock, standingInFire(s, a), bg, COLORS.boss, undefined, s.seed, s.phase)
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
/**
 * The rocks, which are the one thing on this floor a body cannot walk through.
 *
 * Drawn out of `drawObjectives` when the terrain stopped belonging to
 * battlegrounds: a raid has rocks now, and a raid has no objectives to draw
 * them under.
 *
 * Under the mechanics and over the floor. A telegraph that runs across a rock
 * is still a telegraph — the rock does not stop it, it only stops you standing
 * there — so the shape has to be read on top of the stone rather than cut out
 * of it.
 */
function drawTerrain(ctx: CanvasRenderingContext2D, s: SimState): void {
  // The ground it is standing on, always. A body has a footprint under it for
  // the same reason: what says where a thing is on a tipped floor is the patch
  // it occupies, not the picture standing up out of it.
  for (const rock of s.obstacles) {
    const at = worldToScreen(rock.pos)
    ctx.beginPath()
    floorArc(ctx, at.x, at.y, rock.radius * L.scale, 0, Math.PI * 2)
    ctx.fillStyle = COLORS.floorEdge
    ctx.fill()
  }

  // And the rock itself, if the sheet is here. When it is not, the disc is
  // outlined instead — the same fallback the bodies have, and a fight is still
  // completely readable in shapes.
  if (drawObstacles(ctx, worldToScreen, L.scale, s.obstacles)) return

  for (const rock of s.obstacles) {
    const at = worldToScreen(rock.pos)
    const r = rock.radius * L.scale
    ctx.beginPath()
    floorArc(ctx, at.x, at.y, r, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.beginPath()
    floorArc(ctx, at.x - r * 0.18, at.y - r * 0.18, r * 0.62, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)'
    ctx.lineWidth = 1
    ctx.stroke()
  }
}

function drawObjectives(ctx: CanvasRenderingContext2D, s: SimState, clock: number): void {
  const bg = s.bg
  if (!bg) return

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
  arenaPath(ctx, c)
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
/**
 * How much of the stone is let through.
 *
 * The one number in this file that has to be looked at rather than reasoned
 * about, so it was: rendered against a telegraph at several values and judged
 * on whether the telegraph still reads first.
 */
const FLOOR_STONE = 0.35

/**
 * How far a full gauge stains the floor it is standing on.
 *
 * A fifth, which is the largest a wash over the whole room can be before it
 * starts arguing with what is drawn on it. The rule the generated floor was
 * thrown out for applies here too and applies harder, because this one moves:
 * the ground may say something, and it may not have an opinion loud enough to
 * be read before a telegraph is.
 */
const FLOOR_GORGE = 0.2

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

function drawArena(
  ctx: CanvasRenderingContext2D,
  accent: string = COLORS.boss,
  seed = 0,
  encounter = 0,
  /**
   * How full the gorged one's gauge is, which its room wears.
   *
   * The only room in the game that says something about the fight in it rather
   * than about itself. It is worth the exception because of what that fight
   * is: the bar is filled by the raid's own mistakes, and a mistake that shows
   * up as a number on a boss frame is a mistake nobody feels. The floor going
   * darker under everybody is the version of it that cannot be missed, and it
   * costs one wash in the encounter's own colour.
   *
   * Zero everywhere else, which is every other room.
   */
  gauge = 0,
): void {
  // The arena is centred on the world origin; the camera decides where that
  // lands on screen. The grid is drawn in world space too, so it slides past
  // the player and makes their own movement readable.
  const c = worldToScreen({ x: 0, y: 0 })

  ctx.save()
  ctx.beginPath()
  arenaPath(ctx, c)
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

  // The floor's own stone, laid in world space so it lies down with the grid.
  //
  // Under the slabs rather than instead of them: the slabs are a hash of the
  // cell and never repeat, and the stone is thirty-two pixels that repeat
  // forever, so the two answer different halves of the same question — one
  // stops the ground being a flat fill at arm's length, the other stops it
  // being one at a glance.
  //
  // Dark and low. What the generated floor was thrown out for was competing
  // with the telegraphs drawn on it, and the lesson was not "no picture" but
  // "the ground must not have opinions": a texture that adds light argues with
  // every mechanic, and one that only breaks up a tone does not.
  const stone = floorTexture(ctx, seed, encounter)
  if (stone) {
    ctx.save()
    ctx.globalAlpha = FLOOR_STONE
    ctx.fillStyle = stone
    ctx.fillRect(-L.w, -L.h, L.w * 2, L.h * 2)
    ctx.restore()
  }

  const reach = worldReach() * L.scale
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

  // What the raid has let happen, on the ground it is standing on.
  //
  // Inside the clip and over the slabs, so it darkens the stone rather than
  // sitting on top of the mechanics: everything drawn after this -- the
  // telegraphs, the circles, the bodies -- is drawn over it and stays exactly
  // as readable as it was. A full bar is a floor a fifth of the way to the
  // boss's own colour, which is a room that has visibly changed without ever
  // becoming a thing to read.
  if (gauge > 0) {
    ctx.save()
    ctx.beginPath()
    arenaPath(ctx, c)
    ctx.clip()
    ctx.globalAlpha = Math.min(1, gauge) * FLOOR_GORGE
    ctx.fillStyle = accent
    ctx.fillRect(c.x - L.w, c.y - L.h, L.w * 2, L.h * 2)
    ctx.restore()
  }

  ctx.beginPath()
  arenaPath(ctx, c)
  ctx.strokeStyle = COLORS.floorEdge
  ctx.lineWidth = 2
  ctx.stroke()

  // The bowl's far side, which is a fact about a disc with a wall around it. A
  // rectangle's walls are four flats and read nothing like this band; a
  // platform has no wall at all, and drawing one there would be the single
  // most misleading thing on the screen — the whole of what a player has to
  // read off that room is that the floor ends.
  if (worldRoom().kind === 'round') drawFarWall(ctx, c)
  drawBrink(ctx, c)
}

/**
 * The last lane of a floor that has nothing under it.
 *
 * Drawn as ground rather than as a warning: a hazard ring painted round the
 * rim would read as a mechanic that had just been cast, and this is a fact
 * about the room that is true for the whole fight. What it has to say is only
 * "the floor is thinning here", which is what the fade does.
 *
 * The AI reads the same strip as a reason to move (`onEdge`), so what is drawn
 * and what is played are the same lane.
 */
function drawBrink(ctx: CanvasRenderingContext2D, c: Vec2): void {
  const room = worldRoom()
  // Narrowed on the kind rather than through `roomHasOutside`, which answers
  // the question but does not tell the compiler that the answer implies a
  // radius. Both are checked so the two cannot drift apart.
  if (room.kind !== 'platform' || !roomHasOutside(room)) return
  const outer = room.radius * L.scale
  const inner = Math.max(1, outer - EDGE_LAP * L.scale)

  ctx.save()
  ctx.beginPath()
  floorArc(ctx, c.x, c.y, outer, 0, Math.PI * 2)
  floorArc(ctx, c.x, c.y, inner, 0, Math.PI * 2, true)
  ctx.fillStyle = 'rgba(10, 10, 16, 0.45)'
  ctx.fill('evenodd')

  // And the line itself, brighter than the wall's, because it is the one edge
  // in this game that is worth looking at.
  ctx.beginPath()
  floorArc(ctx, c.x, c.y, outer, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.55)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()
}

/** How far the room reaches, on the glass. */
function floorReach(): number {
  return worldReach() * L.scale
}

/**
 * The outline of the floor, in screen space.
 *
 * The one place the room's shape reaches the picture. A disc is the ellipse it
 * always was; a rectangle is its four corners run through the same projection
 * every body on the floor goes through, so it turns and tips with the camera
 * like the ground it is.
 */
function arenaPath(ctx: CanvasRenderingContext2D, c: Vec2): void {
  const room = worldRoom()
  if (room.kind !== 'hall') {
    floorArc(ctx, c.x, c.y, room.radius * L.scale, 0, Math.PI * 2)
    return
  }
  const corners: Vec2[] = [
    { x: -room.halfWidth, y: -room.back },
    { x: room.halfWidth, y: -room.back },
    { x: room.halfWidth, y: room.front },
    { x: -room.halfWidth, y: room.front },
  ]
  corners.forEach((corner, i) => {
    const at = worldToScreen(corner)
    if (i === 0) ctx.moveTo(at.x, at.y)
    else ctx.lineTo(at.x, at.y)
  })
  ctx.closePath()
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
  const rx = floorReach()
  const ry = rx * TILT
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

/**
 * The thing walking after somebody, drawn where it actually is.
 *
 * It is not ground and it is not a body: it is a place kept on the mark, and
 * it closes at most of a walking pace. Nothing drew it, so the one demand the
 * mechanic makes -- keep moving, it cannot corner you -- was being made about
 * something the player could not see. The card said "it follows the one it
 * picked" and the screen said nothing at all.
 *
 * Drawn as the gap rather than as a shape: a line from the thing to the body
 * it wants, so what is readable is how much room is left, which is the only
 * number the person being followed has to act on.
 */
function drawShades(ctx: CanvasRenderingContext2D, s: SimState, clock: number): void {
  for (const a of s.actors) {
    if (a.faction !== 'party' || !a.alive) continue
    const mark = getAura(a, 'haunted')
    if (!mark?.at) continue
    const at = worldToScreen(mark.at)
    const on = worldToScreen(a.pos)
    const colour = iconFor('boss_shade').colour

    ctx.save()
    ctx.beginPath()
    ctx.moveTo(at.x, at.y)
    ctx.lineTo(on.x, on.y)
    ctx.strokeStyle = colour
    ctx.globalAlpha = 0.35
    ctx.lineWidth = 2
    ctx.setLineDash([4, 6])
    ctx.lineDashOffset = -clock * 30
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1

    footprint(ctx, at.x, at.y, SHADE_REACH * L.scale)
    ctx.fillStyle = 'rgba(103, 232, 249, 0.12)'
    ctx.fill()
    ctx.strokeStyle = colour
    ctx.lineWidth = 2.5
    ctx.stroke()
    ctx.restore()
  }
}

/**
 * What is written over a door, which is the room it opens onto.
 *
 * The building's own name for it and not the fight's: a party walking has not
 * met what is in there yet, and a door labelled with a boss would be telling
 * them something the room has not.
 */
function doorName(id: string): string {
  return (chamberAt(id)?.name ?? id).toUpperCase()
}

/**
 * The ways out, on the floor.
 *
 * A door you cannot see is a menu with extra steps, so this is the whole of
 * what makes the citadel walkable: a mouth in the wall where the room opens,
 * the name of what is through it, and a brighter one for the door the party
 * is nearest — which is the door it will take, because the raid follows you.
 *
 * Drawn with the rest of the floor and under the bodies. A door is ground.
 */
function drawDoors(ctx: CanvasRenderingContext2D, s: SimState, clock: number): void {
  const travel = s.travel
  if (!travel || travel.corridor.ways.length === 0) return
  // Nothing while something is awake: a way out you cannot take yet is
  // something to read after the fight, and the floor is busy.
  if (awake(s).length > 0) return
  const going = heading(s)
  const pulse = 0.55 + 0.45 * Math.sin(clock * 2.6)
  const r = EXIT_REACH * L.scale
  for (const way of travel.corridor.ways) {
    const lit = way.to === going?.to
    const at = worldToScreen(way.at)
    ctx.save()
    ctx.globalAlpha = lit ? pulse : 0.4
    ctx.beginPath()
    floorArc(ctx, at.x, at.y, r)
    ctx.fillStyle = lit ? 'rgba(250, 204, 21, 0.20)' : 'rgba(168, 162, 158, 0.10)'
    ctx.fill()
    ctx.strokeStyle = lit ? COLORS.castBar : COLORS.panelEdge
    ctx.lineWidth = lit ? 2 : 1
    ctx.setLineDash(lit ? [] : [5, 5])
    ctx.stroke()
    ctx.setLineDash([])
    // And what is behind it, because a door with no name is a coin toss.
    ctx.globalAlpha = lit ? 1 : 0.65
    ctx.fillStyle = lit ? COLORS.castBar : COLORS.textDim
    ctx.font = font(11, lit)
    ctx.textAlign = 'center'
    ctx.fillText(doorName(way.to), at.x, at.y - r * TILT - 6)
    ctx.restore()
  }
}

function drawGround(ctx: CanvasRenderingContext2D, s: SimState, clock: number): void {
  for (const g of s.ground) {
    const p = worldToScreen(g.pos)
    const r = g.radius * L.scale

    if (!g.detonated) {
      // Telegraph fills from the centre outward as the timer runs down.
      //
      // Against the pool's count because that is the one this path was written
      // for, and clamped because it is not the only shape that comes down it.
      // Anything with a longer count than a pool's reads as negative progress
      // here — the cold line's far patches wait two and two thirds seconds —
      // and a negative radius is not a small circle, it is an exception thrown
      // out of `ellipse` that takes the whole frame with it.
      //
      // Only a real browser catches that. `rendercheck` draws through a stub
      // that records calls and never validates them, so this passed every
      // check in the repo and threw on the first frame of two of the eight
      // bosses. What it should be is each hazard's own count, which means the
      // ground remembering what it was born with; the clamp is the honest
      // version of what is here until it does.
      const progress = Math.max(0, Math.min(1, 1 - g.telegraph / PUDDLE_TELEGRAPH))
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

/** Frontal cone: fills toward the tip as the cast completes. */


/** Expanding ring: lethal band, safe interior. */


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

/**
 * Whoever the boss is holding, and the floor it is about to throw them onto.
 *
 * Two things a picture has to say and neither of them fits on a body: the
 * swallowed one is not drawn at all, so the ring under the boss in their own
 * colour is the only answer to "where did they go", and the circle around it
 * is the floor everybody else has four seconds to leave.
 *
 * Drawn under the bodies rather than over them, because it is floor. The count
 * is the circle's own edge going solid rather than a number: the last second
 * is the one that matters and a digit is read too late.
 */
function drawSwallowed(
  ctx: CanvasRenderingContext2D,
  s: SimState,
  alpha: number,
  clock: number,
): void {
  const inside = s.actors.filter((a) => getAura(a, 'swallowed'))
  if (inside.length === 0) return
  const b = s.actors.find((a) => a.id === BOSS_ID)
  if (!b) return
  const p = screenPos(b, alpha)

  const soonest = Math.min(...inside.map((a) => getAura(a, 'swallowed')!.remaining))
  const close = soonest <= 0.8
  footprint(ctx, p.x, p.y, GORGE_RADIUS * L.scale)
  ctx.fillStyle = 'rgba(69, 10, 10, 0.14)'
  ctx.fill()
  ctx.strokeStyle = iconFor('boss_gorge').colour
  ctx.lineWidth = close ? 3.5 : 2
  if (!close) {
    ctx.setLineDash([7, 6])
    ctx.lineDashOffset = clock * 12
  }
  ctx.stroke()
  ctx.setLineDash([])

  // And one ring per body inside, tight to the boss and in the colour of
  // whoever it is, so the raid can see which of them it is holding.
  let lap = 0
  for (const a of inside) {
    footprint(ctx, p.x, p.y, Math.max(4, b.radius * L.scale) + 6 + lap * 4)
    ctx.strokeStyle = classColor(a.classId)
    ctx.lineWidth = 2
    ctx.stroke()
    lap++
  }
}

function bossBody(s: SimState): string | null {
  return s.mode === 'raid' ? `boss-${encounterAt(s.encounter).id}` : null
}

/** The floor under anything hostile. */
const ENEMY_EDGE = '#f87171'

/** How long the ring off a phase break takes to cross the floor. */
const BREAK_RING = 0.9

/**
 * The lurch at the moment a boss is pushed into its next phase.
 *
 * It grows past where it is going to settle and comes back, because a thing
 * that simply is bigger a frame later is a thing nobody saw get bigger.
 */
/**
 * How much bigger a full gauge makes the thing in the middle.
 *
 * Thirty percent, which is about what a phase does -- so a boss that has been
 * fed reads as a fight a phase further along than it is, which is exactly what
 * it is. Any less and nobody sees it; any more and the fight the raid played
 * well and the fight it played badly are two different creatures.
 */
const GORGE_SWELL = 0.3

function breakSwell(since: number): number {
  if (!(since >= 0) || since > BREAK_RING) return 1
  return 1 + 0.35 * Math.sin((since / BREAK_RING) * Math.PI) ** 2
}

/**
 * How far into the fight's turn the boss is, nought to one.
 *
 * Phases are counted from one and there are three, so this is the fraction of
 * the ground it has given up — what the picture grows and reddens by.
 */
function phaseHeat(phase: number): number {
  return Math.max(0, Math.min(1, (phase - 1) / 2))
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
  /** The fight's own seed, so what marks a death is not the same every pull. */
  seed = 0,
  /** Which phase the fight is in, which is a thing the boss wears. */
  phase = 1,
  /** Seconds since the phase turned, for the moment it turns. */
  sinceBreak = Infinity,
  /**
   * How full the boss's gauge is, which it wears.
   *
   * The one fight in this game whose difficulty is something the raid built
   * puts that on the boss's own silhouette rather than in a bar in a corner: a
   * number nobody looks at is a mechanic nobody feels, and this design lives
   * or dies on the raid noticing it fill.
   */
  gauge = 0,
): void {
  const p = screenPos(a, alpha)
  const r = Math.max(4, a.radius * L.scale)
  // In a battleground the other side is five people, not a boss and its
  // thralls: they keep their class colours and are told apart by a ring.
  const isBoss = a.id === BOSS_ID && !battleground
  const isAdd = a.faction === 'boss' && !isBoss && !battleground
  const hostile = battleground && a.faction === 'boss'
  // Everything that is trying to kill the party, under one name: a boss, its
  // thralls, and the other five in a battleground.
  const enemy = a.alive && (isBoss || isAdd || hostile)
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

  // And the one body that changed sides without changing faction.
  //
  // A turned mind keeps its class colour, its name and its party frame,
  // because which of your own it is is the whole question — and until this,
  // that was all it kept. Nothing on the floor said it had turned. The one
  // mechanic in the game that asks a raid to stop hitting something was
  // answered by the roster reading an aura and by a player reading a chat
  // line that had already scrolled.
  //
  // The enemy ring, because it is hostile and that has to be the first true
  // thing on screen. Dashed rather than solid, because the answer is not the
  // answer a solid one gives: everything else wearing that ring is asking to
  // be killed and this one is asking to be left alone, and a dash is what this
  // renderer already uses for a body that is marked rather than merely there.
  if (a.alive && a.faction === 'party' && getAura(a, 'turned')) {
    footprint(ctx, p.x, p.y, r + 4 + Math.sin(clock * 6) * 1.5)
    ctx.strokeStyle = COLORS.boss
    ctx.lineWidth = 2.5
    ctx.setLineDash([5, 4])
    ctx.lineDashOffset = -clock * 24
    ctx.stroke()
    ctx.setLineDash([])
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
  //
  // Except under something that wants to kill you, which is the one thing on
  // this floor worth spending a colour on. Ten class colours and a purple for
  // thralls said what everything was and left the fight's own bodies reading
  // as more of the crowd; the ground under an enemy is red, and only under an
  // enemy, so what is dangerous is answerable at a glance rather than by
  // reading tokens. The boss's own accent stays where it always was — on its
  // frame and its casts — because three bosses in the same red read as one
  // boss, and that argument is about identity rather than about threat.
  ctx.fillStyle = enemy
    ? `rgba(220, 38, 38, ${(bodied ? 0.34 : 0.62) + (isBoss ? phaseHeat(phase) * 0.26 : 0)})`
    : bodied
      ? 'rgba(6, 8, 10, 0.5)'
      : color
  ctx.globalAlpha = a.alive ? 1 : 0.4
  ctx.fill()

  // Its own colour, inside the red rather than instead of it.
  //
  // Red is what the floor under an enemy says and it has to say the same thing
  // under all of them, or it is not answering the question it was put there
  // for. But three bosses in the same red read as one boss, which is why each
  // has an accent at all — so the accent moves to a core on the disc and the
  // ring keeps it too. Threat on the outside, identity in the middle.
  //
  // And the core takes more of the disc for every ground the boss has given,
  // which is the other half of the same argument. The red under it deepens
  // with the phase already; if only the threat channel moves then a boss on
  // its last third is a redder version of the boss on its first, and what has
  // changed is how dangerous it is rather than what it is. Both move: it gets
  // more dangerous and it gets more its own colour.
  if (isBoss && a.alive) {
    footprint(ctx, p.x, p.y, r * (0.52 + phaseHeat(phase) * 0.18))
    ctx.fillStyle = accent
    ctx.globalAlpha = 0.85
    ctx.fill()
  }

  // How many breaths it is holding, which is the whole trade one fight is made
  // of and was the only part of it drawn nowhere at all. It sits on the boss,
  // and the party frames only carry the party -- so a raid watching the room
  // get easier while the tank's bar fell faster had no way to connect the two.
  //
  // Rings outside the body rather than a colour on it: what has to be read is
  // a number between nought and three, and the fight's argument is that the
  // number going up is the room going quiet. A count answers that and a shade
  // does not.
  // How far the thing that has let go actually reaches, which the card tells
  // you to keep away from and nothing was drawing. A boss that stops tanking
  // and comes for the room is the one danger in this game whose shape is the
  // boss itself, so there is no hazard on the floor to read it off -- and
  // "keep away" without a distance is not an instruction.
  //
  // Filled faintly and edged hard, because the bill inside it is a gradient
  // and the edge is not: outside is nothing at all, and how far in you are
  // only decides how badly you failed.
  if (isBoss && a.alive && getAura(a, 'storming')) {
    footprint(ctx, p.x, p.y, STORM_REACH * L.scale)
    ctx.fillStyle = 'rgba(220, 38, 38, 0.10)'
    ctx.fill()
    ctx.strokeStyle = iconFor('boss_bonestorm').colour
    ctx.lineWidth = 3
    ctx.stroke()
  }

  const gorged = getAura(a, 'gorged')
  if (isBoss && a.alive && gorged && gorged.stacks > 0) {
    for (let i = 0; i < Math.min(gorged.stacks, INHALE_MAX); i++) {
      footprint(ctx, p.x, p.y, r + 7 + i * 5)
      ctx.strokeStyle = iconFor('boss_inhale').colour
      ctx.lineWidth = 2
      ctx.globalAlpha = 0.75
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  ctx.globalAlpha = 1
  ctx.strokeStyle = enemy ? (isBoss ? accent : ENEMY_EDGE) : bodied ? color : '#0a0a0f'
  ctx.lineWidth = enemy && isBoss ? 3 : 2
  ctx.stroke()

  // The moment it turns: one ring off the floor, out past anything else the
  // fight draws and gone in a second. The break already had a line, a sound, a
  // screen flash and a burst, and every one of them is over before a player
  // who was looking at their own feet has looked up.
  if (isBoss && a.alive && sinceBreak >= 0 && sinceBreak < BREAK_RING) {
    const out = sinceBreak / BREAK_RING
    footprint(ctx, p.x, p.y, r + out * r * 9)
    ctx.strokeStyle = `rgba(248, 113, 113, ${(0.85 * (1 - out) ** 1.5).toFixed(3)})`
    ctx.lineWidth = 3 + 7 * (1 - out)
    ctx.stroke()
  }

  // The boss wears its phase on the floor: another ring for every ground it
  // has given, breathing faster each time.
  //
  // In its own colour rather than in the red every enemy shares. The red on
  // the disc answers "is this dangerous", which is a question with the same
  // answer under all eight of them; these rings answer "what has this one
  // turned into", which does not. Drawn red they said a boss had turned and
  // never which boss, so the one moment in a fight that is supposed to look
  // like a different fight looked identical across the roster.
  //
  // The first boss is where that showed. Its second break says *The floor is
  // bone now* and nothing in the frame agreed with the sentence: the thing is
  // bone-white, and what it laid on the floor when it turned was the same
  // pink every other boss lays. Bone rings under a bone boss are the
  // sentence, and the drowned one gets the same treatment in its own colour
  // without a line of code that knows which boss it is drawing.
  if (isBoss && a.alive && phase > 1) {
    for (let ring = 1; ring < phase; ring++) {
      const beat = 0.5 + 0.5 * Math.sin(clock * (2.2 + phase * 0.9) - ring * 0.8)
      footprint(ctx, p.x, p.y, r + 6 + ring * 6 + beat * 3)
      // Carried on the alpha channel rather than baked into the colour, so
      // the accent can stay the hex string the encounter table wrote.
      ctx.globalAlpha = Math.max(0, 0.5 - ring * 0.12 + beat * 0.25)
      ctx.strokeStyle = accent
      ctx.lineWidth = 2
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }


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
      // A boss stands taller for every phase it has been pushed into, and the
      // disc under it does not: the disc is the ground it occupies and the
      // simulation decides that, while how big the thing looming out of it
      // looks is the picture's to say. Fifteen percent a phase, which is a
      // silhouette that has visibly changed between one glance and the next
      // without becoming a different creature.
      isBoss ? r * (1 + phaseHeat(phase) * 0.3 + gauge * GORGE_SWELL) * breakSwell(sinceBreak) : r,
      screenAngle(a.facing),
      (a.pos.x + a.pos.y) * STRIDE,
      step > 0.2,
      casting,
      a.alive ? 1 : 0.4,
      a.id,
    )
  }


  // A headstone where a raider went down, over its own disc for the same
  // reason a body is: the disc is the floor and the stone is standing on it.
  if (!a.alive && a.faction === 'party') {
    drawGrave(ctx, p.x, p.y, bodyHeight(r) * 0.78, a.id, seed)
  }

  // Whatever picked this one, drawn as a line to it.
  //
  // A stalker looks like every other add on the floor, and the mechanic is
  // entirely about which one of you it is coming for — so the answer is drawn
  // rather than left to be worked out from six moving circles.
  // The one out of the wave that came back wrong.
  //
  // Nothing said which. It is the same body as the other three, drawn the same
  // way, and the only thing separating it was a health bar that is longer --
  // which reads as "this one is fine" rather than "this one is the problem".
  // The fight names it in chat once and the raid is told to kill it first, and
  // a raid cannot be told which one if the picture does not say.
  //
  // In the mechanic's own colour, and pulsing, because it is not a place to
  // leave or a count to read: it is a target call, and the only thing the ring
  // has to do is answer "which one".
  if (a.alive && getAura(a, 'empowered')) {
    footprint(ctx, p.x, p.y, r + 6 + Math.sin(clock * 5) * 2)
    ctx.strokeStyle = iconFor('boss_empower').colour
    ctx.lineWidth = 3
    ctx.stroke()
  }

  // --- the air fight, which had nothing on the screen at all -----------------
  //
  // One boss puts nothing on the floor and summons nothing: every demand it
  // makes is an aura on a body. Five of them were drawn nowhere, so a pull
  // against it was floating numbers over a party standing in an empty room,
  // and two of the five have a *radius* -- a place to be inside, and a place
  // to be outside of -- which nothing said where.
  //
  // Each is drawn as the shape of its own answer rather than as another status
  // ring. A place to go is filled and a place to leave is not; a count is a
  // count of marks rather than a colour that deepens, because the two that
  // matter are read as "how many more" and a shade is not a number.

  // Somewhere to be. Filled, faintly, because it is the one friendly circle
  // the game draws -- everything else this shape has ever meant is "leave".
  if (a.alive && getAura(a, 'spore')) {
    const reach = SPORE_REACH * L.scale
    footprint(ctx, p.x, p.y, reach)
    ctx.fillStyle = 'rgba(190, 242, 100, 0.10)'
    ctx.fill()
    ctx.strokeStyle = iconFor('boss_spore').colour
    ctx.lineWidth = 2
    ctx.setLineDash([6, 5])
    ctx.lineDashOffset = clock * 14
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Somewhere to leave, and the only one of these a body can give somebody
  // else. Unfilled and solid: a hard edge to be outside of rather than an area
  // to stand in, which is the spore's circle read the other way round.
  if (a.alive && getAura(a, 'reek')) {
    footprint(ctx, p.x, p.y, REEK_REACH * L.scale)
    ctx.strokeStyle = iconFor('boss_vilegas').colour
    ctx.lineWidth = 2.5
    ctx.stroke()
    footprint(ctx, p.x, p.y, r + 3)
    ctx.strokeStyle = iconFor('boss_vilegas').colour
    ctx.lineWidth = 2
    ctx.stroke()
  }

  // Already safe, and it has to be legible at a glance because it is the one
  // fact that decides whether the breath out kills you. A closed ring tight to
  // the body: nothing to walk to, nothing to walk out of.
  if (a.alive && getAura(a, 'inoculated')) {
    footprint(ctx, p.x, p.y, r + 5)
    ctx.strokeStyle = iconFor('boss_pungent').colour
    ctx.lineWidth = 2
    ctx.stroke()
  }

  // The count on whoever is holding the boss, which the constants call public
  // and which nothing was making public. Ticks around the body, one per stack,
  // so the answer -- swap before the last one -- is a thing you count rather
  // than a colour you interpret. The one that would burst is drawn apart.
  const swelling = getAura(a, 'swelling')
  if (a.alive && swelling && swelling.stacks > 0) {
    for (let i = 0; i < Math.min(swelling.stacks, BLOAT_BURST_AT); i++) {
      const from = -Math.PI / 2 + (i * Math.PI * 2) / BLOAT_BURST_AT
      ctx.beginPath()
      floorArc(ctx, p.x, p.y, r + 7, from + 0.1, from + (Math.PI * 2) / BLOAT_BURST_AT - 0.1)
      ctx.strokeStyle =
        i >= BLOAT_SWAP_AT - 1 ? iconFor('boss_bloat').colour : 'rgba(161, 98, 7, 0.55)'
      ctx.lineWidth = i >= BLOAT_SWAP_AT - 1 ? 3.5 : 2.5
      ctx.stroke()
    }
  }

  // Blood filling up under somebody, and the count is the circle rather than a
  // number beside it. It grows from nothing to its full width over the six
  // seconds, so what the raid reads is not "there is a mark on them" but "how
  // long have I got" -- and the edge it is going to have is the edge everybody
  // has to be outside of, which is the one fact the picture owes them.
  const spilling = a.alive ? getAura(a, 'spilling') : undefined
  if (spilling) {
    const ripe = 1 - Math.max(0, Math.min(1, spilling.remaining / AURA_DURATION.spilling))
    footprint(ctx, p.x, p.y, SPILL_RADIUS * ripe * L.scale)
    ctx.fillStyle = 'rgba(153, 27, 27, 0.12)'
    ctx.fill()
    ctx.strokeStyle = iconFor('boss_spill').colour
    ctx.lineWidth = 2.5
    ctx.stroke()
    // And where it is going to reach, faintly, from the moment it lands: the
    // circle that is still growing is not yet the circle anybody has to be
    // outside of, and a raid that walks to the edge of what it can see walks
    // to the wrong edge.
    footprint(ctx, p.x, p.y, SPILL_RADIUS * L.scale)
    ctx.strokeStyle = 'rgba(153, 27, 27, 0.35)'
    ctx.lineWidth = 1
    ctx.setLineDash([5, 6])
    ctx.stroke()
    ctx.setLineDash([])
  }

  // A wound that is feeding the boss. A ring tight to the body that boils
  // rather than pulses -- it is not counting down to anything, and a pulse in
  // this game means "soon".
  if (a.alive && getAura(a, 'festering')) {
    footprint(ctx, p.x, p.y, r + 6)
    ctx.strokeStyle = iconFor('boss_fester').colour
    ctx.lineWidth = 2 + Math.sin(clock * 8) * 0.8
    ctx.stroke()
  }

  // The mark, which never comes off. Two closed rings, and deliberately not
  // dashed, not moving and not pulsing: everything else this game draws around
  // a body is a thing that ends, and the one difference a player has to read
  // here is that this one does not.
  if (a.alive && getAura(a, 'championed')) {
    for (const lap of [5, 9]) {
      footprint(ctx, p.x, p.y, r + lap)
      ctx.strokeStyle = iconFor('boss_champion').colour
      ctx.lineWidth = 2.5
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

