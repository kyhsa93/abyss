import { PUDDLE_TELEGRAPH, SPREAD_RADIUS } from '../sim/constants'
import { dist, getAura } from '../sim/combat'
import { BOSS_ID } from '../sim/state'
import type { Actor, ProjectileKind, SimState, Vec2 } from '../sim/types'
import { iconFor } from './icons'
import type { Effects } from './effects'
import { COLORS, L, roleColor } from './theme'

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

function updateCamera(s: SimState, alpha: number): void {
  const player = s.actors.find((a) => a.isPlayer)
  // With no player in the fight there is nothing to follow, so fall back to
  // the arena centre and the view behaves exactly as it did before.
  const p = player ? actorPos(player, alpha) : { x: 0, y: 0 }
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
  drawGround(ctx, s, clock)
  drawSpreadRings(ctx, s, alpha)
  drawCasts(ctx, s, alpha)

  for (const a of s.actors) {
    if (a.faction === 'boss') drawActor(ctx, a, alpha, clock, false)
  }

  for (const a of s.actors) {
    if (a.faction === 'party') drawActor(ctx, a, alpha, clock, standingInFire(s, a))
  }

  drawProjectiles(ctx, s, alpha)
  // Above the tokens and below the numbers: a hit should be visible on top of
  // whoever took it, and never on top of what the fight is telling you.
  effects.draw(ctx, worldToScreen, L.scale)
  drawFloatingText(ctx, s, alpha)
  ctx.restore()

  drawRaidFlash(ctx, s)
}

/** The tell for party-wide damage, which is otherwise invisible and unavoidable. */
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
      ctx.strokeStyle = COLORS.puddleEdge
      ctx.lineWidth = 2
      ctx.setLineDash([6, 6])
      ctx.lineDashOffset = -clock * 20
      ctx.stroke()
      ctx.restore()
    }
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
}

/** Expanding ring: lethal band, safe interior. */
function drawShockwave(
  ctx: CanvasRenderingContext2D,
  g: SimState['ground'][number],
  p: Vec2,
  r: number,
): void {
  const band = g.band * L.scale

  ctx.beginPath()
  ctx.arc(p.x, p.y, Math.max(1, r), 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.30)'
  ctx.lineWidth = band * 2
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(p.x, p.y, Math.max(1, r), 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(253, 224, 71, 0.95)'
  ctx.lineWidth = 3
  ctx.stroke()

  // Inner edge marks where it is safe to stand.
  const inner = Math.max(1, r - band)
  ctx.beginPath()
  ctx.arc(p.x, p.y, inner, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(74, 222, 128, 0.5)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([5, 7])
  ctx.stroke()
  ctx.setLineDash([])
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

function drawActor(
  ctx: CanvasRenderingContext2D,
  a: Actor,
  alpha: number,
  clock: number,
  burning: boolean,
): void {
  const p = screenPos(a, alpha)
  const r = Math.max(4, a.radius * L.scale)
  const isBoss = a.id === BOSS_ID
  const isAdd = a.faction === 'boss' && !isBoss
  const color = a.alive
    ? isBoss
      ? COLORS.boss
      : isAdd
        ? '#a855f7'
        : roleColor(a.role, a.isPlayer)
    : COLORS.dead

  if (a.isPlayer && a.alive) {
    // A soft pulse so the player never loses their own token in a crowd.
    ctx.beginPath()
    ctx.arc(p.x, p.y, r + 7 + Math.sin(clock * 4) * 1.5, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.35)'
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

  const glyph = isBoss ? 'B' : isAdd ? 'x' : a.role === 'tank' ? 'T' : a.role === 'healer' ? 'H' : 'D'
  ctx.fillStyle = '#0a0a0f'
  ctx.font = font(isBoss ? 16 : 11, true)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(glyph, p.x, p.y)
  ctx.textBaseline = 'alphabetic'

  // Adds show a health pip instead of a name; there can be several.
  if (isAdd && a.alive) {
    const w = r * 2.4
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(p.x - w / 2, p.y - r - 9, w, 4)
    ctx.fillStyle = '#a855f7'
    ctx.fillRect(p.x - w / 2, p.y - r - 9, w * (a.hp / a.maxHp), 4)
  }

  // Names cost more than they give on a phone-sized arena.
  if (!isBoss && !isAdd && a.alive && L.ui > 0.8) {
    ctx.fillStyle = COLORS.textDim
    ctx.font = font(10)
    ctx.fillText(a.name, p.x, p.y - r - 8)
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

function drawFloatingText(ctx: CanvasRenderingContext2D, s: SimState, alpha: number): void {
  ctx.textAlign = 'center'
  for (const t of s.texts) {
    const age = t.age + alpha * (1 / 30)
    const life = Math.min(1, age / 1.1)
    const p = worldToScreen(t.pos)
    ctx.save()
    ctx.globalAlpha = 1 - life
    ctx.fillStyle =
      t.kind === 'heal'
        ? '#4ade80'
        : t.kind === 'crit'
          ? '#fbbf24'
          : t.kind === 'miss'
            ? '#94a3b8'
            : '#fca5a5'
    ctx.font = font(t.kind === 'crit' ? 15 : 12, true)
    ctx.fillText(t.text, p.x, p.y - 20 * L.ui - life * 26)
    ctx.restore()
  }
}
