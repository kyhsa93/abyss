import type { JoystickView } from '../input'
import { ABILITIES, PLAYER_BAR } from '../sim/abilities'
import { ENRAGE_AT } from '../sim/constants'
import { adds, boss } from '../sim/combat'
import type { Actor, SimState } from '../sim/types'
import { COLORS, L, roleColor } from './theme'

export interface TouchView {
  active: boolean
  joystick: JoystickView | null
  heldSlots: ReadonlySet<number>
}

function font(size: number, bold = false): string {
  return `${bold ? 'bold ' : ''}${Math.round(size * L.ui)}px ui-monospace, monospace`
}

function bar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  ratio: number,
  color: string,
): void {
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = color
  ctx.fillRect(x, y, Math.max(0, Math.min(1, ratio)) * w, h)
  ctx.strokeStyle = COLORS.panelEdge
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
}

export function drawHud(ctx: CanvasRenderingContext2D, s: SimState, touch: TouchView): void {
  drawBossFrame(ctx, s)
  drawPartyFrames(ctx, s)
  drawFightInfo(ctx, s)
  drawTideWarning(ctx, s)
  if (touch.active) drawTouchControls(ctx, s, touch)
  else drawActionBar(ctx, s)
  drawCastBar(ctx, s, touch.active)
  drawChat(ctx, s)
  if (s.outcome !== 'ongoing') drawOutcome(ctx, s, touch.active)
}

function drawBossFrame(ctx: CanvasRenderingContext2D, s: SimState): void {
  const b = boss(s)
  const x = L.bossX
  const w = L.bossW
  const y = L.bossY

  ctx.fillStyle = COLORS.text
  ctx.font = font(13, true)
  ctx.textAlign = 'left'
  ctx.fillText(b.name, x, y)

  ctx.textAlign = 'right'
  ctx.fillStyle = COLORS.textDim
  ctx.font = font(11)
  ctx.fillText(`${Math.ceil(b.hp).toLocaleString()}`, x + w, y)

  bar(ctx, x, y + 6, w, 13 * L.ui, b.hp / b.maxHp, COLORS.boss)

  // Phase-two marker sits where the transition happens.
  const markX = x + w * 0.7
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.beginPath()
  ctx.moveTo(markX, y + 6)
  ctx.lineTo(markX, y + 6 + 13 * L.ui)
  ctx.stroke()

  if (b.castId) {
    const progress = 1 - b.castRemaining / b.castTotal
    const cw = Math.min(220, w * 0.55)
    const label = b.castId === 'boss_breath' ? 'TIDAL BREATH' : 'ABYSSAL SLAM'
    bar(ctx, x + w / 2 - cw / 2, y + 22 * L.ui, cw, 9 * L.ui, progress, COLORS.bossCast)
    ctx.fillStyle = COLORS.bossCast
    ctx.font = font(10, true)
    ctx.textAlign = 'center'
    ctx.fillText(label, x + w / 2, y + 30 * L.ui)
  }

  const summoned = adds(s)
  if (summoned.length > 0) {
    ctx.fillStyle = '#c084fc'
    ctx.font = font(11, true)
    ctx.textAlign = 'left'
    ctx.fillText(`thralls ${summoned.length}`, x, y + 34 * L.ui)
  }
}

/**
 * Countdown to the next party-wide hit.
 *
 * It cannot be dodged, so the only fair thing is to make it legible: an
 * unexplained chunk of missing health reads as the last puddle having a broken
 * hitbox.
 */
function drawTideWarning(ctx: CanvasRenderingContext2D, s: SimState): void {
  const t = s.nextRaidHit
  const imminent = t < 1.4
  const y = L.cy - L.arenaR - 8

  ctx.textAlign = 'center'
  if (imminent) {
    const pulse = 0.6 + 0.4 * Math.sin(s.time * 14)
    ctx.fillStyle = `rgba(248, 113, 113, ${pulse.toFixed(2)})`
    ctx.font = font(14, true)
    ctx.fillText(`CRUSHING TIDE  ${t.toFixed(1)}`, L.cx, y)
  } else {
    ctx.fillStyle = COLORS.textDim
    ctx.font = font(11)
    ctx.fillText(`tide in ${t.toFixed(1)}s`, L.cx, y)
  }
}

function drawPartyFrames(ctx: CanvasRenderingContext2D, s: SimState): void {
  let y = L.partyY
  for (const m of s.actors) {
    if (m.faction !== 'party') continue
    frame(ctx, m, L.partyX, y, s)
    y += L.partyRow
  }
}

function frame(
  ctx: CanvasRenderingContext2D,
  a: Actor,
  x: number,
  y: number,
  s: SimState,
): void {
  const w = L.partyW
  const h = L.partyRow - 6

  ctx.fillStyle = COLORS.panel
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = a.isPlayer ? COLORS.player : COLORS.panelEdge
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)

  ctx.fillStyle = a.alive ? roleColor(a.role, a.isPlayer) : COLORS.dead
  ctx.font = font(11, true)
  ctx.textAlign = 'left'
  ctx.fillText(a.name, x + 6, y + 13 * L.ui)

  const hpRatio = a.hp / a.maxHp
  const barY = y + h * 0.36
  bar(ctx, x + 6, barY, w - 12, Math.max(6, h * 0.2), hpRatio, hpRatio < 0.35 ? COLORS.hpBarLow : COLORS.hpBar)

  if (a.maxMana > 0) {
    bar(ctx, x + 6, barY + h * 0.24, w - 12, Math.max(3, h * 0.09), a.mana / a.maxMana, COLORS.manaBar)
  }

  // Aura chips along the bottom.
  const chip = Math.max(9, h * 0.2)
  let ax = x + 6
  for (const aura of a.auras) {
    const color =
      aura.id === 'spread' ? COLORS.spread : aura.id === 'shield' ? '#93c5fd' : '#4ade80'
    ctx.fillStyle = color
    ctx.fillRect(ax, y + h - chip - 4, chip, chip)
    ctx.fillStyle = '#0a0a0f'
    ctx.font = font(9, true)
    ctx.textAlign = 'center'
    ctx.fillText(aura.id[0]!.toUpperCase(), ax + chip / 2, y + h - 6)
    ax += chip + 3
  }

  if (a.castId && a.castTotal > 0) {
    const progress = 1 - a.castRemaining / a.castTotal
    bar(ctx, x + 6, y + h - chip - 4, w - 12, chip, progress, COLORS.castBar)
    ctx.fillStyle = '#0a0a0f'
    ctx.font = font(8, true)
    ctx.textAlign = 'center'
    ctx.fillText(ABILITIES[a.castId]?.name ?? a.castId, x + w / 2, y + h - 6)
  }

  if (!a.alive) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(x, y, w, h)
    ctx.fillStyle = COLORS.hpBarLow
    ctx.font = font(12, true)
    ctx.textAlign = 'center'
    ctx.fillText('DEAD', x + w / 2, y + h / 2 + 4)
  }

  // Threat readout: the tank losing the lead is the classic failure mode.
  const threat = s.threat[a.id]
  if (threat !== undefined && a.alive && L.ui > 0.8) {
    ctx.fillStyle = COLORS.textDim
    ctx.font = font(9)
    ctx.textAlign = 'right'
    ctx.fillText(`${Math.round(threat)}`, x + w - 6, y + 13 * L.ui)
  }
}

function drawFightInfo(ctx: CanvasRenderingContext2D, s: SimState): void {
  const enrageIn = Math.max(0, ENRAGE_AT - s.time)
  const line = 15 * L.ui
  let y = L.infoY

  ctx.textAlign = 'right'
  ctx.font = font(11)
  ctx.fillStyle = COLORS.textDim
  ctx.fillText(`pull ${s.attempt + 1}`, L.infoX, y)
  y += line
  ctx.fillText(`phase ${s.phase}`, L.infoX, y)
  y += line
  ctx.fillText(`${s.time.toFixed(1)}s`, L.infoX, y)
  y += line

  ctx.fillStyle = enrageIn < 30 ? COLORS.hpBarLow : COLORS.textDim
  ctx.fillText(`enrage ${enrageIn.toFixed(0)}s`, L.infoX, y)
}

function drawActionBar(ctx: CanvasRenderingContext2D, s: SimState): void {
  const player = s.actors.find((a) => a.isPlayer)
  if (!player) return

  const slot = 58 * L.ui
  const gap = 8 * L.ui
  const total = PLAYER_BAR.length * slot + (PLAYER_BAR.length - 1) * gap
  let x = (L.w - total) / 2
  const y = L.actionY

  for (const id of PLAYER_BAR) {
    const ability = ABILITIES[id]!
    const cd = player.cooldowns[id] ?? 0
    const usable = cd <= 0 && player.gcd <= 0 && player.alive

    ctx.fillStyle = COLORS.panel
    ctx.fillRect(x, y, slot, slot)
    ctx.strokeStyle = usable ? COLORS.castBar : COLORS.panelEdge
    ctx.lineWidth = usable ? 2 : 1
    ctx.strokeRect(x + 0.5, y + 0.5, slot - 1, slot - 1)

    ctx.fillStyle = usable ? COLORS.text : COLORS.textDim
    ctx.font = font(11, true)
    ctx.textAlign = 'center'
    ctx.fillText(ability.name, x + slot / 2, y + slot / 2 + 4)

    ctx.font = font(9)
    ctx.fillStyle = COLORS.textDim
    ctx.fillText(ability.key, x + 8, y + 12 * L.ui)

    if (cd > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)'
      const h = slot * (cd / ability.cooldown)
      ctx.fillRect(x, y + slot - h, slot, h)
      ctx.fillStyle = COLORS.text
      ctx.font = font(14, true)
      ctx.fillText(cd.toFixed(1), x + slot / 2, y + slot / 2 + 5)
    }

    x += slot + gap
  }

  ctx.fillStyle = COLORS.textDim
  ctx.font = font(10)
  ctx.textAlign = 'center'
  ctx.fillText('WASD move  ·  1/2/3 abilities  ·  R retry', L.w / 2, L.h - 8)
}

/** Shown in both modes, but clear of the thumb zones on touch. */
function drawCastBar(ctx: CanvasRenderingContext2D, s: SimState, touch: boolean): void {
  const player = s.actors.find((a) => a.isPlayer)
  if (!player || !player.castId || player.castTotal <= 0) return

  const w = Math.min(220, L.w * 0.4)
  const y = touch ? L.castY : L.actionY - 20
  const progress = 1 - player.castRemaining / player.castTotal
  bar(ctx, (L.w - w) / 2, y, w, 12, progress, COLORS.castBar)
  ctx.fillStyle = '#0a0a0f'
  ctx.font = font(10, true)
  ctx.textAlign = 'center'
  ctx.fillText(ABILITIES[player.castId]?.name ?? '', L.w / 2, y + 9)
}

/**
 * Virtual stick on the left, ability buttons down the right edge. Everything
 * is translucent so it never fully hides the arena underneath.
 */
function drawTouchControls(ctx: CanvasRenderingContext2D, s: SimState, touch: TouchView): void {
  const player = s.actors.find((a) => a.isPlayer)
  if (!player) return

  const stick = touch.joystick
  if (stick) {
    ctx.beginPath()
    ctx.arc(stick.originX, stick.originY, L.joyBase, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(15, 17, 26, 0.35)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)'
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(stick.knobX, stick.knobY, L.joyKnob, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(74, 222, 128, 0.35)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.8)'
    ctx.lineWidth = 2
    ctx.stroke()
  }

  for (let i = 0; i < PLAYER_BAR.length && i < L.btnYs.length; i++) {
    const id = PLAYER_BAR[i]!
    const ability = ABILITIES[id]!
    const cy = L.btnYs[i]!
    const cd = player.cooldowns[id] ?? 0
    const usable = cd <= 0 && player.gcd <= 0 && player.alive
    const holding = touch.heldSlots.has(i)

    ctx.beginPath()
    ctx.arc(L.btnX, cy, L.btnR, 0, Math.PI * 2)
    ctx.fillStyle = holding ? 'rgba(250, 204, 21, 0.28)' : 'rgba(15, 17, 26, 0.55)'
    ctx.fill()
    ctx.strokeStyle = usable ? 'rgba(250, 204, 21, 0.9)' : 'rgba(107, 114, 128, 0.6)'
    ctx.lineWidth = usable ? 3 : 2
    ctx.stroke()

    // Cooldown sweeps clockwise from twelve o'clock.
    if (cd > 0 && ability.cooldown > 0) {
      const frac = cd / ability.cooldown
      ctx.beginPath()
      ctx.moveTo(L.btnX, cy)
      ctx.arc(L.btnX, cy, L.btnR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac)
      ctx.closePath()
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
      ctx.fill()
    }

    ctx.fillStyle = usable ? COLORS.text : COLORS.textDim
    ctx.font = font(12, true)
    ctx.textAlign = 'center'
    ctx.fillText(ability.name, L.btnX, cy + 4)

    if (cd > 0) {
      ctx.fillStyle = COLORS.text
      ctx.font = font(15, true)
      ctx.fillText(cd.toFixed(1), L.btnX, cy + 22 * L.ui)
    } else if (ability.castTime > 0) {
      ctx.fillStyle = COLORS.textDim
      ctx.font = font(9)
      ctx.fillText(`${ability.castTime}s`, L.btnX, cy + 20 * L.ui)
    }
  }
}

function drawChat(ctx: CanvasRenderingContext2D, s: SimState): void {
  let y = L.chatY
  ctx.textAlign = 'left'
  ctx.font = font(11)

  for (let i = s.chat.length - 1; i >= 0; i--) {
    const line = s.chat[i]!
    const fade = Math.max(0, 1 - line.age / 6)
    ctx.globalAlpha = fade
    ctx.fillStyle = COLORS.textDim
    ctx.fillText(`[${line.speaker}] ${line.text}`, 10, y)
    ctx.globalAlpha = 1
    y -= 16 * L.ui
  }
}

function drawOutcome(ctx: CanvasRenderingContext2D, s: SimState, touch: boolean): void {
  ctx.fillStyle = 'rgba(5, 5, 10, 0.72)'
  ctx.fillRect(0, 0, L.w, L.h)

  const label =
    s.outcome === 'victory' ? 'KILL' : s.outcome === 'enrage' ? 'ENRAGE WIPE' : 'WIPE'
  const color = s.outcome === 'victory' ? COLORS.hpBar : COLORS.hpBarLow

  ctx.textAlign = 'center'
  ctx.fillStyle = color
  ctx.font = font(42, true)
  ctx.fillText(label, L.w / 2, L.h / 2 - 10)

  ctx.fillStyle = COLORS.text
  ctx.font = font(13)
  ctx.fillText(
    `${s.time.toFixed(1)}s  ·  boss at ${Math.round((boss(s).hp / boss(s).maxHp) * 100)}%`,
    L.w / 2,
    L.h / 2 + 22,
  )

  ctx.fillStyle = COLORS.textDim
  ctx.font = font(12)
  ctx.fillText(touch ? 'tap to pull again' : 'press R to pull again', L.w / 2, L.h / 2 + 52)

  if (s.outcome !== 'victory') {
    ctx.fillText('the party learns a little each attempt', L.w / 2, L.h / 2 + 72)
  }
}
