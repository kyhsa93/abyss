import { PUDDLE_TELEGRAPH, SPREAD_RADIUS } from '../sim/constants'
import { dist, getAura } from '../sim/combat'
import type { Actor, ProjectileKind, SimState, Vec2 } from '../sim/types'
import { COLORS, L, roleColor } from './theme'

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Interpolated screen position: 30Hz simulation, 60fps rendering. */
function screenPos(a: Actor, alpha: number): Vec2 {
  return {
    x: L.cx + lerp(a.prevPos.x, a.pos.x, alpha) * L.scale,
    y: L.cy + lerp(a.prevPos.y, a.pos.y, alpha) * L.scale,
  }
}

function worldToScreen(p: Vec2): Vec2 {
  return { x: L.cx + p.x * L.scale, y: L.cy + p.y * L.scale }
}

function font(size: number, bold = false): string {
  return `${bold ? 'bold ' : ''}${Math.round(size * L.ui)}px ui-monospace, monospace`
}

export function drawWorld(
  ctx: CanvasRenderingContext2D,
  s: SimState,
  alpha: number,
  clock: number,
): void {
  drawArena(ctx)
  drawGround(ctx, s, clock)
  drawSpreadRings(ctx, s, alpha)

  for (const a of s.actors) {
    if (a.faction === 'boss') drawActor(ctx, a, alpha, clock, false)
  }
  for (const a of s.actors) {
    if (a.faction === 'party') drawActor(ctx, a, alpha, clock, standingInFire(s, a))
  }

  drawProjectiles(ctx, s, alpha)
  drawFloatingText(ctx, s, alpha)
  drawRaidFlash(ctx, s)
}

/** The tell for party-wide damage, which is otherwise invisible and unavoidable. */
function drawRaidFlash(ctx: CanvasRenderingContext2D, s: SimState): void {
  if (s.raidFlash <= 0) return
  const a = Math.min(1, s.raidFlash / 0.45)

  ctx.fillStyle = `rgba(239, 68, 68, ${(0.16 * a).toFixed(3)})`
  ctx.fillRect(0, 0, L.w, L.h)

  ctx.beginPath()
  ctx.arc(L.cx, L.cy, L.arenaR, 0, Math.PI * 2)
  ctx.strokeStyle = `rgba(239, 68, 68, ${(0.85 * a).toFixed(3)})`
  ctx.lineWidth = 2 + 6 * a
  ctx.stroke()
}

function drawArena(ctx: CanvasRenderingContext2D): void {
  ctx.save()
  ctx.beginPath()
  ctx.arc(L.cx, L.cy, L.arenaR, 0, Math.PI * 2)
  ctx.fillStyle = COLORS.floor
  ctx.fill()
  ctx.clip()

  ctx.strokeStyle = COLORS.grid
  ctx.lineWidth = 1
  const step = 64 * L.scale
  for (let g = -L.arenaR; g <= L.arenaR; g += step) {
    ctx.beginPath()
    ctx.moveTo(L.cx + g, L.cy - L.arenaR)
    ctx.lineTo(L.cx + g, L.cy + L.arenaR)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(L.cx - L.arenaR, L.cy + g)
    ctx.lineTo(L.cx + L.arenaR, L.cy + g)
    ctx.stroke()
  }
  ctx.restore()

  ctx.beginPath()
  ctx.arc(L.cx, L.cy, L.arenaR, 0, Math.PI * 2)
  ctx.strokeStyle = COLORS.floorEdge
  ctx.lineWidth = 2
  ctx.stroke()
}

function drawGround(ctx: CanvasRenderingContext2D, s: SimState, clock: number): void {
  for (const g of s.ground) {
    const p = worldToScreen(g.pos)
    const r = g.radius * L.scale

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
  const isBoss = a.faction === 'boss'
  const color = a.alive ? (isBoss ? COLORS.boss : roleColor(a.role, a.isPlayer)) : COLORS.dead

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

  const glyph = isBoss ? 'B' : a.role === 'tank' ? 'T' : a.role === 'healer' ? 'H' : 'D'
  ctx.fillStyle = '#0a0a0f'
  ctx.font = font(isBoss ? 16 : 11, true)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(glyph, p.x, p.y)
  ctx.textBaseline = 'alphabetic'

  // Names cost more than they give on a phone-sized arena.
  if (!isBoss && a.alive && L.ui > 0.8) {
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

interface BoltStyle {
  core: string
  glow: string
  radius: number
}

const BOLT: Record<ProjectileKind, BoltStyle> = {
  strike: { core: '#e0f2fe', glow: 'rgba(125, 211, 252, 0.45)', radius: 3.5 },
  ignite: { core: '#ffedd5', glow: 'rgba(251, 146, 60, 0.5)', radius: 4 },
  burst: { core: '#f5d0fe', glow: 'rgba(217, 70, 239, 0.5)', radius: 6 },
  heal: { core: '#bbf7d0', glow: 'rgba(74, 222, 128, 0.5)', radius: 4 },
}

/**
 * Ranged abilities resolve instantly; these bolts only show where the damage
 * came from. Without them a caster standing still is indistinguishable from
 * one doing nothing at all.
 */
function drawProjectiles(ctx: CanvasRenderingContext2D, s: SimState, alpha: number): void {
  for (const p of s.projectiles) {
    const style = BOLT[p.kind]
    if (!style) continue

    const x = L.cx + lerp(p.prevPos.x, p.pos.x, alpha) * L.scale
    const y = L.cy + lerp(p.prevPos.y, p.pos.y, alpha) * L.scale
    const tailX = L.cx + p.prevPos.x * L.scale
    const tailY = L.cy + p.prevPos.y * L.scale
    const r = Math.max(2, style.radius * L.scale)

    ctx.beginPath()
    ctx.moveTo(tailX, tailY)
    ctx.lineTo(x, y)
    ctx.strokeStyle = style.glow
    ctx.lineWidth = r * 1.5
    ctx.lineCap = 'round'
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(x, y, r * 1.9, 0, Math.PI * 2)
    ctx.fillStyle = style.glow
    ctx.fill()

    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = style.core
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
