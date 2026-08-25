import {
  BURDEN_REACH,
  CHANT_CAST,
  CRUSH_TELEGRAPH,
  FAULT_TELEGRAPH,
  GAZE_TELEGRAPH,
  SCHISM_TELEGRAPH,
  SHALLOWS_TELEGRAPH,
  PUDDLE_TELEGRAPH,
  SOAK_TELEGRAPH,
  SPREAD_RADIUS,
  VIGIL_TELEGRAPH,
  YOKE_REACH,
  ARENA_RADIUS,
} from '../sim/constants'
import { burdenTaker, dist, getAura, livingParty } from '../sim/combat'
import { CART_RADIUS, FLAG_PICKUP, FLAG_TAKE, RALLY_TELEGRAPH } from '../sim/battleground'
import { BOSS_ID } from '../sim/state'
import { encounterAt } from '../sim/encounters'
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
import { COLORS, L, classColor } from './theme'

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

function updateCamera(s: SimState, alpha: number): void {
  const p = focusOn(s, alpha)
  cam.x = p.x
  cam.y = p.y
}

function worldToScreen(p: Vec2): Vec2 {
  return { x: L.cx + (p.x - cam.x) * L.scale, y: L.cy + (p.y - cam.y) * L.scale }
}

/** Interpolated screen position: 30Hz simulation, 60fps rendering. */
function screenPos(a: Actor, alpha: number): Vec2 {
  return worldToScreen(actorPos(a, alpha))
}

function font(size: number, bold = false): string {
  return `${bold ? 'bold ' : ''}${Math.round(size * L.ui)}px ui-monospace, monospace`
}

export function drawWorld(
  ctx: CanvasRenderingContext2D,
  s: SimState,
  alpha: number,
  clock: number,
  effects: Effects,
): void {
  updateCamera(s, alpha)

  // The shove goes on the world and nowhere else: a heads-up display that
  // shakes is a heads-up display nobody can read.
  const shove = effects.offset()
  ctx.save()
  ctx.translate(shove.x * L.scale, shove.y * L.scale)

  drawArena(ctx)
  drawObjectives(ctx, s, clock)
  drawGround(ctx, s, clock)
  drawHunts(ctx, s, alpha)
  drawSpreadRings(ctx, s, alpha)
  drawVerdicts(ctx, s, alpha)
  drawHandoffs(ctx, s, alpha)
  drawCasts(ctx, s, alpha)

  const bg = s.mode === 'battleground'
  for (const a of s.actors) {
    if (a.faction === 'boss') drawActor(ctx, a, alpha, clock, false, bg, bossAccent(s))
  }

  for (const a of s.actors) {
    if (a.faction === 'party') drawActor(ctx, a, alpha, clock, standingInFire(s, a), bg)
  }

  drawCarriedFlags(ctx, s, alpha)
  drawProjectiles(ctx, s, alpha)
  // Above the tokens and below the numbers: a hit should be visible on top of
  // whoever took it, and never on top of what the fight is telling you.
  effects.draw(ctx, worldToScreen, L.scale)
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
    ctx.arc(at.x, at.y, r, 0, Math.PI * 2)
    ctx.fillStyle = COLORS.floorEdge
    ctx.fill()
    // A lighter rim, so it reads as something standing up off the floor rather
    // than a hole in it. Everything else here is drawn as a flat disc.
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(at.x - r * 0.18, at.y - r * 0.18, r * 0.62, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  for (const node of bg.nodes) {
    const at = worldToScreen(node.pos)
    const r = node.radius * L.scale

    ctx.beginPath()
    ctx.arc(at.x, at.y, r, 0, Math.PI * 2)
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
      ctx.arc(at.x, at.y, r - 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.abs(node.progress))
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
      ctx.arc(at.x, at.y, r, 0, Math.PI * 2)
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
    ctx.arc(base.x, base.y, 80 * L.scale, 0, Math.PI * 2)
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
      ctx.arc(
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
    ctx.arc(at.x, at.y, r * (1 - through * 0.18), 0, Math.PI * 2)
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
  ctx.arc(at.x, at.y, r, 0, Math.PI * 2)
  ctx.fillStyle = rally.owner ? tint(teamColour(rally.owner), 0.12) : COLORS.telegraph
  ctx.fill()
  ctx.strokeStyle = rally.owner ? teamColour(rally.owner) : COLORS.telegraphEdge
  ctx.lineWidth = rally.contested ? 2 + Math.sin(clock * 8) : 2
  ctx.stroke()

  if (rally.progress !== 0) {
    const toward = rally.progress > 0 ? 'blue' : 'red'
    ctx.beginPath()
    ctx.arc(
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
  ctx.arc(c.x, c.y, L.arenaR, 0, Math.PI * 2)
  ctx.strokeStyle = `rgba(239, 68, 68, ${(0.85 * a).toFixed(3)})`
  ctx.lineWidth = 2 + 6 * a
  ctx.stroke()
}

function drawArena(ctx: CanvasRenderingContext2D): void {
  // The arena is centred on the world origin; the camera decides where that
  // lands on screen. The grid is drawn in world space too, so it slides past
  // the player and makes their own movement readable.
  const c = worldToScreen({ x: 0, y: 0 })

  ctx.save()
  ctx.beginPath()
  ctx.arc(c.x, c.y, L.arenaR, 0, Math.PI * 2)
  ctx.fillStyle = COLORS.floor
  ctx.fill()
  ctx.clip()

  ctx.strokeStyle = COLORS.grid
  ctx.lineWidth = 1
  const step = 64 * L.scale
  for (let g = -L.arenaR; g <= L.arenaR; g += step) {
    ctx.beginPath()
    ctx.moveTo(c.x + g, c.y - L.arenaR)
    ctx.lineTo(c.x + g, c.y + L.arenaR)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(c.x - L.arenaR, c.y + g)
    ctx.lineTo(c.x + L.arenaR, c.y + g)
    ctx.stroke()
  }
  ctx.restore()

  ctx.beginPath()
  ctx.arc(c.x, c.y, L.arenaR, 0, Math.PI * 2)
  ctx.strokeStyle = COLORS.floorEdge
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
      drawFault(ctx, g, p)
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

    if (!g.detonated) {
      // Telegraph fills from the centre outward as the timer runs down.
      const progress = 1 - g.telegraph / PUDDLE_TELEGRAPH
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.fillStyle = COLORS.telegraph
      ctx.fill()

      ctx.beginPath()
      ctx.arc(p.x, p.y, r * progress, 0, Math.PI * 2)
      ctx.fillStyle = COLORS.telegraph
      ctx.fill()

      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.strokeStyle = COLORS.telegraphEdge
      ctx.lineWidth = 2
      ctx.stroke()
    } else {
      // Never fade below the point where it still hurts you.
      const fade = 0.62 + 0.38 * Math.min(1, g.lingering / 1.2)
      ctx.save()
      ctx.globalAlpha = fade
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.fillStyle = COLORS.puddle
      ctx.fill()

      // A core that breathes. Flat colour reads as a hole in the floor; this
      // reads as something still burning in it, and it is the same shape and
      // the same edge, so what is safe has not moved.
      ctx.beginPath()
      ctx.arc(p.x, p.y, r * (0.52 + 0.06 * Math.sin(clock * 3 + g.id)), 0, Math.PI * 2)
      ctx.fillStyle = COLORS.puddle
      ctx.fill()

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
function drawFault(ctx: CanvasRenderingContext2D, g: SimState['ground'][number], p: Vec2): void {
  if (g.detonated) return
  const closing = Math.max(0, Math.min(1, 1 - g.telegraph / FAULT_TELEGRAPH))
  const c = worldToScreen({ x: 0, y: 0 })
  const radius = L.arenaR
  const nx = Math.cos(g.angle)
  const ny = Math.sin(g.angle)

  // Where the line crosses the wall. The boss is always inside the arena, so
  // the line always crosses it twice; the guard is for the frame where the
  // camera has not caught up rather than for a case the fight can produce.
  const away = (p.x - c.x) * nx + (p.y - c.y) * ny
  const half = Math.sqrt(Math.max(0, radius * radius - away * away))
  if (half <= 0) return
  const foot = { x: c.x + nx * away, y: c.y + ny * away }
  const from = { x: foot.x - ny * half, y: foot.y + nx * half }
  const to = { x: foot.x + ny * half, y: foot.y - nx * half }

  // Of the two arcs between those crossings, the condemned one is whichever
  // contains the bearing the fault points along.
  const a1 = Math.atan2(from.y - c.y, from.x - c.x)
  const a2 = Math.atan2(to.y - c.y, to.x - c.x)
  const turn = (x: number): number => ((x % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  const sweep = turn(a1 - a2)
  const forward = turn(g.angle - a2) < sweep

  ctx.save()
  ctx.beginPath()
  ctx.moveTo(to.x, to.y)
  ctx.arc(c.x, c.y, radius, a2, a1, !forward)
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
  ctx.arc(c.x, c.y, L.arenaR, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(29, 78, 216, ${(0.18 + 0.3 * closing).toFixed(3)})`
  ctx.fill()

  for (const spot of g.spots ?? []) {
    const at = worldToScreen(spot)
    ctx.beginPath()
    ctx.arc(at.x, at.y, r, 0, Math.PI * 2)
    ctx.fillStyle = COLORS.floor
    ctx.fill()

    ctx.beginPath()
    ctx.arc(at.x, at.y, r, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(147, 197, 253, 0.9)'
    ctx.lineWidth = 2 + 6 * closing
    ctx.setLineDash([8, 6])
    ctx.lineDashOffset = -clock * 24
    ctx.stroke()
    ctx.setLineDash([])
  }
  ctx.restore()
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
  ctx.arc(p.x, p.y, r, g.angle - g.halfWidth, g.angle + g.halfWidth)
  ctx.closePath()
  ctx.fillStyle = firing ? 'rgba(56, 189, 248, 0.5)' : 'rgba(56, 189, 248, 0.14)'
  ctx.fill()

  if (!firing) {
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.arc(p.x, p.y, r * progress, g.angle - g.halfWidth, g.angle + g.halfWidth)
    ctx.closePath()
    ctx.fillStyle = 'rgba(56, 189, 248, 0.22)'
    ctx.fill()
  }

  ctx.beginPath()
  ctx.moveTo(p.x, p.y)
  ctx.arc(p.x, p.y, r, g.angle - g.halfWidth, g.angle + g.halfWidth)
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
    ctx.arc(p.x, p.y, r * at, g.angle - g.halfWidth * 0.85, g.angle + g.halfWidth * 0.85)
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
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
  ctx.fillStyle = ready ? 'rgba(45, 212, 191, 0.16)' : 'rgba(45, 212, 191, 0.10)'
  ctx.fill()

  // The rim closes in as the timer runs down, so the shape says how long is
  // left without anybody reading a number.
  ctx.beginPath()
  ctx.arc(p.x, p.y, Math.max(2, r * (1 - closing * 0.55)), 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(94, 234, 212, 0.55)'
  ctx.lineWidth = 2
  ctx.setLineDash([5, 6])
  ctx.lineDashOffset = clock * 26
  ctx.stroke()
  ctx.setLineDash([])

  ctx.beginPath()
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
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
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(220, 38, 38, ${(0.07 + 0.21 * closing).toFixed(3)})`
  ctx.fill()
  ctx.strokeStyle = 'rgba(248, 113, 113, 0.9)'
  ctx.lineWidth = 2 + 6 * closing
  ctx.stroke()

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const from = r * (0.55 + 0.4 * closing)
    ctx.beginPath()
    ctx.moveTo(p.x + Math.cos(a) * from, p.y + Math.sin(a) * from)
    ctx.lineTo(p.x + Math.cos(a) * (r + 18), p.y + Math.sin(a) * (r + 18))
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
  ctx.arc(arena.x, arena.y, L.arenaR, 0, Math.PI * 2)
  ctx.clip()

  // Where it is going, first, so the live wedge is drawn over the top of it.
  if (g.pulses > 1) {
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.arc(p.x, p.y, reach, g.angle + g.turn - g.halfWidth, g.angle + g.turn + g.halfWidth)
    ctx.closePath()
    ctx.fillStyle = 'rgba(132, 204, 22, 0.07)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(132, 204, 22, 0.30)'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  ctx.beginPath()
  ctx.moveTo(p.x, p.y)
  ctx.arc(p.x, p.y, reach, g.angle - g.halfWidth, g.angle + g.halfWidth)
  ctx.closePath()
  ctx.fillStyle = `rgba(132, 204, 22, ${(0.09 + 0.20 * closing).toFixed(3)})`
  ctx.fill()
  ctx.strokeStyle = `rgba(190, 242, 100, ${(0.55 + 0.4 * closing).toFixed(3)})`
  ctx.lineWidth = 2 + 3 * closing
  ctx.stroke()

  // And an arrow of the turn along the leading edge, because which way it is
  // going is the only thing here worth knowing and a wedge does not say.
  const lead = g.angle + Math.sign(g.turn) * g.halfWidth
  for (let i = 1; i <= 3; i++) {
    const out = reach * (i / 4)
    const from = { x: p.x + Math.cos(lead) * out, y: p.y + Math.sin(lead) * out }
    const to = {
      x: p.x + Math.cos(lead + Math.sign(g.turn) * 0.22) * out,
      y: p.y + Math.sin(lead + Math.sign(g.turn) * 0.22) * out,
    }
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
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(192, 132, 252, ${(0.08 + 0.22 * closing).toFixed(3)})`
  ctx.fill()
  ctx.strokeStyle = 'rgba(216, 180, 254, 0.85)'
  ctx.lineWidth = 2
  ctx.stroke()

  // A second ring falling in on the spot: the beat arriving.
  ctx.beginPath()
  ctx.arc(p.x, p.y, Math.max(1, r * (1 - closing)), 0, Math.PI * 2)
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
      const x = p.x + Math.cos(a) * reach
      const y = p.y + Math.sin(a) * reach
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
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
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(244, 114, 182, 0.75)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(p.x, p.y, r * left, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(244, 114, 182, 0.35)'
    ctx.lineWidth = 3
    ctx.stroke()
  } else {
    // Spokes rather than a disc, so it reads as a scar and not as a pool.
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(244, 114, 182, 0.16)'
    ctx.fill()
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(p.x + Math.cos(a) * r * 0.35, p.y + Math.sin(a) * r * 0.35)
      ctx.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r)
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
    ctx.arc(muster.x, muster.y, (26 + 10 * closing) * L.scale, 0, Math.PI * 2)
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
    ctx.arc(at.x, at.y, g.radius * L.scale, 0, Math.PI * 2)
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
  const from = g.angle + g.halfWidth
  const to = g.angle - g.halfWidth + Math.PI * 2

  // Three rings of wake behind the edge, so the ring reads as travelling
  // rather than as a circle that keeps being redrawn bigger.
  for (let i = 3; i >= 1; i--) {
    const behind = Math.max(1, r - band * i * 0.9)
    ctx.beginPath()
    ctx.arc(p.x, p.y, behind, from, to)
    ctx.strokeStyle = `rgba(250, 204, 21, ${(0.16 / i).toFixed(3)})`
    ctx.lineWidth = band
    ctx.stroke()
  }

  ctx.beginPath()
  ctx.arc(p.x, p.y, Math.max(1, r), from, to)
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.30)'
  ctx.lineWidth = band * 2
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(p.x, p.y, Math.max(1, r), from, to)
  ctx.strokeStyle = 'rgba(253, 224, 71, 0.95)'
  ctx.lineWidth = 3
  ctx.stroke()

  // And the gap itself, marked out to the rim rather than at the ring's own
  // radius: the raid has to pick a bearing before the ring arrives, so what
  // it needs to see is the wedge, not the hole in a line.
  const reach = ARENA_RADIUS * L.scale
  ctx.beginPath()
  ctx.moveTo(p.x, p.y)
  ctx.arc(p.x, p.y, reach, g.angle - g.halfWidth, g.angle + g.halfWidth)
  ctx.closePath()
  ctx.fillStyle = 'rgba(74, 222, 128, 0.07)'
  ctx.fill()

  for (const edge of [g.angle - g.halfWidth, g.angle + g.halfWidth]) {
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
    ctx.arc(p.x, p.y, (a.radius + 7) * L.scale, 0, Math.PI * 2)
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
    ctx.arc(p.x, p.y, SPREAD_RADIUS * L.scale, 0, Math.PI * 2)
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
  ctx.arc(p.x, p.y, (carrier.radius + 13) * L.scale, 0, Math.PI * 2)
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
    ctx.arc(q.x, q.y, reach * L.scale, 0, Math.PI * 2)
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
    ctx.arc(p.x, p.y, gather, 0, Math.PI * 2)
    ctx.strokeStyle = tint(colour, 0.2 + 0.5 * progress)
    ctx.lineWidth = Math.max(1, 2 * L.scale)
    ctx.setLineDash([5, 6])
    ctx.lineDashOffset = -progress * 40
    ctx.stroke()
    ctx.setLineDash([])

    // And a dial around the token, filling clockwise from noon.
    ctx.beginPath()
    ctx.arc(p.x, p.y, base + 5 * L.scale, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress)
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
    ctx.beginPath()
    ctx.arc(p.x, p.y, r + 7 + Math.sin(clock * 4) * 1.5, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.35)'
    ctx.lineWidth = 2
    ctx.stroke()
  }

  // Whose side, before whose class. Ten class colours on one screen say what
  // everyone is playing and nothing about who is about to hit you.
  if (hostile && a.alive) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2)
    ctx.strokeStyle = COLORS.boss
    ctx.lineWidth = 2
    ctx.stroke()
  }

  ctx.beginPath()
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.globalAlpha = a.alive ? 1 : 0.4
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.strokeStyle = '#0a0a0f'
  ctx.lineWidth = 2
  ctx.stroke()

  // Residual puddle damage is silent by design; without this you lose health
  // with nothing on screen explaining it.
  if (burning) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, r + 3.5, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(248, 113, 113, ${(0.55 + 0.45 * Math.sin(clock * 12)).toFixed(2)})`
    ctx.lineWidth = 3
    ctx.stroke()
  }

  if (getAura(a, 'shield')) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2)
    ctx.strokeStyle = '#93c5fd'
    ctx.lineWidth = 3
    ctx.stroke()
  }

  // Whatever picked this one, drawn as a line to it.
  //
  // A stalker looks like every other add on the floor, and the mechanic is
  // entirely about which one of you it is coming for — so the answer is drawn
  // rather than left to be worked out from six moving circles.
  const hunted = getAura(a, 'hunted')
  if (hunted && a.alive) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, r + 9 + Math.sin(clock * 7) * 2, 0, Math.PI * 2)
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
      ctx.arc(p.x, p.y, r + 6, from + 0.12, from + (Math.PI * 2) / SUNDER_MAX - 0.12)
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
}

const BOLT: Record<ProjectileKind, BoltStyle> = {
  bolt: { core: '#e0f2fe', glow: 'rgba(125, 211, 252, 0.45)', radius: 3.5 },
  dot: { core: '#ffedd5', glow: 'rgba(251, 146, 60, 0.5)', radius: 4 },
  heavy: { core: '#f5d0fe', glow: 'rgba(217, 70, 239, 0.5)', radius: 6 },
  heal: { core: '#bbf7d0', glow: 'rgba(74, 222, 128, 0.5)', radius: 4 },
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

    const head = worldToScreen({
      x: lerp(p.prevPos.x, p.pos.x, alpha),
      y: lerp(p.prevPos.y, p.pos.y, alpha),
    })
    const tail = worldToScreen(p.prevPos)
    const x = head.x
    const y = head.y
    const tailX = tail.x
    const tailY = tail.y
    const r = Math.max(2, style.radius * L.scale)

    // The trail behind it, thinning and fading toward where it came from.
    const path = trails.get(p.id)
    if (path && path.length > 1) {
      ctx.lineCap = 'round'
      for (let i = 1; i < path.length; i++) {
        const from = worldToScreen(path[i - 1]!)
        const to = worldToScreen(path[i]!)
        const fade = i / path.length
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(to.x, to.y)
        ctx.strokeStyle = tint(core, 0.35 * fade)
        ctx.lineWidth = Math.max(1, r * 1.2 * fade)
        ctx.stroke()
      }
    }

    ctx.beginPath()
    ctx.moveTo(tailX, tailY)
    ctx.lineTo(x, y)
    ctx.strokeStyle = glow
    ctx.lineWidth = r * 1.5
    ctx.lineCap = 'round'
    ctx.stroke()

    // A halo that actually falls off, rather than a flat disc with a hard
    // edge pretending to be one.
    const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2)
    halo.addColorStop(0, tint(core, 0.5))
    halo.addColorStop(0.45, tint(core, 0.22))
    halo.addColorStop(1, tint(core, 0))
    ctx.beginPath()
    ctx.arc(x, y, r * 3.2, 0, Math.PI * 2)
    ctx.fillStyle = halo
    ctx.fill()

    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = core
    ctx.fill()
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
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
  ctx.strokeStyle = `rgba(245, 158, 11, ${(0.3 + 0.6 * closing).toFixed(3)})`
  ctx.lineWidth = 3 + 26 * closing
  ctx.stroke()

  // And the count itself, as a ring falling in on the boss. It is the only
  // part of the picture that says when, and the mechanic is nothing but when.
  ctx.beginPath()
  ctx.arc(p.x, p.y, Math.max(1, 70 * L.scale * (1 - closing)), 0, Math.PI * 2)
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
    ctx.arc(p.x, p.y, Math.max(1, r * phase), 0, Math.PI * 2)
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
    ctx.arc(at.x, at.y, (a.radius + 10) * L.scale, 0, Math.PI * 2)
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
  ctx.arc(p.x, p.y, r * (1 - 0.35 * closing), 0, Math.PI * 2)
  ctx.strokeStyle = `rgba(217, 70, 239, ${(0.4 + 0.5 * closing).toFixed(3)})`
  ctx.lineWidth = 2 + 5 * closing
  ctx.stroke()

  for (const a of s.actors) {
    if (a.faction !== 'party' || !a.alive) continue
    const at = worldToScreen(a.pos)
    const looking = watched(a, g)
    ctx.beginPath()
    ctx.arc(at.x, at.y, (a.radius + 7) * L.scale, 0, Math.PI * 2)
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
      at.x + Math.cos(a.facing) * (a.radius + 16) * L.scale,
      at.y + Math.sin(a.facing) * (a.radius + 16) * L.scale,
    )
    ctx.strokeStyle = looking ? 'rgba(240, 171, 252, 0.8)' : 'rgba(148, 163, 184, 0.5)'
    ctx.lineWidth = 2
    ctx.stroke()
  }
  ctx.restore()
}
