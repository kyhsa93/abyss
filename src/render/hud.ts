import { ABILITIES, PLAYER_BAR } from '../sim/abilities'
import { ENRAGE_AT } from '../sim/constants'
import { boss } from '../sim/combat'
import type { Actor, SimState } from '../sim/types'
import { CANVAS_H, CANVAS_W, COLORS, roleColor } from './theme'

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

export function drawHud(ctx: CanvasRenderingContext2D, s: SimState): void {
  drawBossFrame(ctx, s)
  drawPartyFrames(ctx, s)
  drawFightInfo(ctx, s)
  drawActionBar(ctx, s)
  drawChat(ctx, s)
  if (s.outcome !== 'ongoing') drawOutcome(ctx, s)
}

function drawBossFrame(ctx: CanvasRenderingContext2D, s: SimState): void {
  const b = boss(s)
  const x = 180
  const w = CANVAS_W - 360

  ctx.fillStyle = COLORS.text
  ctx.font = 'bold 13px ui-monospace, monospace'
  ctx.textAlign = 'left'
  ctx.fillText(b.name, x, 20)

  ctx.textAlign = 'right'
  ctx.fillStyle = COLORS.textDim
  ctx.fillText(`${Math.ceil(b.hp).toLocaleString()} / ${b.maxHp.toLocaleString()}`, x + w, 20)

  bar(ctx, x, 26, w, 14, b.hp / b.maxHp, COLORS.boss)

  // Phase-two marker sits where the transition happens.
  const markX = x + w * 0.7
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.beginPath()
  ctx.moveTo(markX, 26)
  ctx.lineTo(markX, 40)
  ctx.stroke()

  if (b.castId === 'boss_slam') {
    const progress = 1 - b.castRemaining / b.castTotal
    bar(ctx, x + w / 2 - 110, 44, 220, 9, progress, COLORS.bossCast)
    ctx.fillStyle = COLORS.bossCast
    ctx.font = 'bold 10px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText('ABYSSAL SLAM', x + w / 2, 51)
  }
}

function drawPartyFrames(ctx: CanvasRenderingContext2D, s: SimState): void {
  const members = s.actors.filter((a) => a.faction === 'party')
  let y = 90

  for (const m of members) {
    frame(ctx, m, 12, y, s)
    y += 74
  }
}

function frame(
  ctx: CanvasRenderingContext2D,
  a: Actor,
  x: number,
  y: number,
  s: SimState,
): void {
  const w = 150

  ctx.fillStyle = COLORS.panel
  ctx.fillRect(x, y, w, 64)
  ctx.strokeStyle = a.isPlayer ? COLORS.player : COLORS.panelEdge
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 63)

  ctx.fillStyle = a.alive ? roleColor(a.role, a.isPlayer) : COLORS.dead
  ctx.font = 'bold 11px ui-monospace, monospace'
  ctx.textAlign = 'left'
  ctx.fillText(a.name, x + 8, y + 16)

  if (a.ai) {
    ctx.fillStyle = COLORS.textDim
    ctx.font = '9px ui-monospace, monospace'
    ctx.textAlign = 'right'
    ctx.fillText(a.ai.personality, x + w - 8, y + 16)
  }

  const hpRatio = a.hp / a.maxHp
  bar(ctx, x + 8, y + 22, w - 16, 10, hpRatio, hpRatio < 0.35 ? COLORS.hpBarLow : COLORS.hpBar)

  if (a.maxMana > 0) {
    bar(ctx, x + 8, y + 35, w - 16, 5, a.mana / a.maxMana, COLORS.manaBar)
  }

  // Aura chips.
  let ax = x + 8
  for (const aura of a.auras) {
    const color =
      aura.id === 'spread' ? COLORS.spread : aura.id === 'shield' ? '#93c5fd' : '#4ade80'
    ctx.fillStyle = color
    ctx.fillRect(ax, y + 45, 12, 12)
    ctx.fillStyle = '#0a0a0f'
    ctx.font = 'bold 9px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText(aura.id[0]!.toUpperCase(), ax + 6, y + 54)
    ax += 15
  }

  // Cast bar for AI members, so their decisions are legible.
  if (a.castId && a.castTotal > 0) {
    const progress = 1 - a.castRemaining / a.castTotal
    bar(ctx, x + 8, y + 45, w - 16, 8, progress, COLORS.castBar)
    ctx.fillStyle = '#0a0a0f'
    ctx.font = 'bold 8px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText(ABILITIES[a.castId]?.name ?? a.castId, x + w / 2, y + 52)
  }

  if (!a.alive) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(x, y, w, 64)
    ctx.fillStyle = COLORS.hpBarLow
    ctx.font = 'bold 12px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText('DEAD', x + w / 2, y + 36)
  }

  // Threat readout: the tank losing the lead is the classic failure mode.
  const threat = s.threat[a.id]
  if (threat !== undefined && a.alive) {
    ctx.fillStyle = COLORS.textDim
    ctx.font = '9px ui-monospace, monospace'
    ctx.textAlign = 'right'
    ctx.fillText(`threat ${Math.round(threat)}`, x + w - 8, y + 61)
  }
}

function drawFightInfo(ctx: CanvasRenderingContext2D, s: SimState): void {
  const x = CANVAS_W - 12
  const enrageIn = Math.max(0, ENRAGE_AT - s.time)

  ctx.textAlign = 'right'
  ctx.font = '11px ui-monospace, monospace'
  ctx.fillStyle = COLORS.textDim
  ctx.fillText(`pull ${s.attempt + 1}`, x, 90)
  ctx.fillText(`phase ${s.phase}`, x, 106)
  ctx.fillText(`${s.time.toFixed(1)}s`, x, 122)

  ctx.fillStyle = enrageIn < 30 ? COLORS.hpBarLow : COLORS.textDim
  ctx.fillText(`enrage in ${enrageIn.toFixed(0)}s`, x, 138)
}

function drawActionBar(ctx: CanvasRenderingContext2D, s: SimState): void {
  const player = s.actors.find((a) => a.isPlayer)
  if (!player) return

  const slot = 58
  const gap = 8
  const total = PLAYER_BAR.length * slot + (PLAYER_BAR.length - 1) * gap
  let x = (CANVAS_W - total) / 2
  const y = CANVAS_H - 72

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
    ctx.font = 'bold 11px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText(ability.name, x + slot / 2, y + slot / 2 + 4)

    ctx.font = '9px ui-monospace, monospace'
    ctx.fillStyle = COLORS.textDim
    ctx.fillText(ability.key, x + 8, y + 12)

    if (ability.castTime > 0) {
      ctx.fillText(`${ability.castTime}s`, x + slot - 12, y + 12)
    }

    if (cd > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)'
      const h = slot * (cd / ability.cooldown)
      ctx.fillRect(x, y + slot - h, slot, h)
      ctx.fillStyle = COLORS.text
      ctx.font = 'bold 14px ui-monospace, monospace'
      ctx.fillText(cd.toFixed(1), x + slot / 2, y + slot / 2 + 5)
    }

    x += slot + gap
  }

  // Player cast bar, centred under the action bar.
  if (player.castId && player.castTotal > 0) {
    const w = 220
    const progress = 1 - player.castRemaining / player.castTotal
    bar(ctx, (CANVAS_W - w) / 2, y - 20, w, 12, progress, COLORS.castBar)
    ctx.fillStyle = '#0a0a0f'
    ctx.font = 'bold 10px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText(ABILITIES[player.castId]?.name ?? '', CANVAS_W / 2, y - 11)
  }

  ctx.fillStyle = COLORS.textDim
  ctx.font = '10px ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.fillText('WASD move  ·  1/2/3 abilities  ·  R retry', CANVAS_W / 2, CANVAS_H - 8)
}

function drawChat(ctx: CanvasRenderingContext2D, s: SimState): void {
  let y = CANVAS_H - 110
  ctx.textAlign = 'left'
  ctx.font = '11px ui-monospace, monospace'

  for (let i = s.chat.length - 1; i >= 0; i--) {
    const line = s.chat[i]!
    const fade = Math.max(0, 1 - line.age / 6)
    ctx.globalAlpha = fade
    ctx.fillStyle = COLORS.textDim
    ctx.fillText(`[${line.speaker}] ${line.text}`, 12, y)
    ctx.globalAlpha = 1
    y -= 16
  }
}

function drawOutcome(ctx: CanvasRenderingContext2D, s: SimState): void {
  ctx.fillStyle = 'rgba(5, 5, 10, 0.72)'
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  const label =
    s.outcome === 'victory' ? 'KILL' : s.outcome === 'enrage' ? 'ENRAGE WIPE' : 'WIPE'
  const color = s.outcome === 'victory' ? COLORS.hpBar : COLORS.hpBarLow

  ctx.textAlign = 'center'
  ctx.fillStyle = color
  ctx.font = 'bold 42px ui-monospace, monospace'
  ctx.fillText(label, CANVAS_W / 2, CANVAS_H / 2 - 10)

  ctx.fillStyle = COLORS.text
  ctx.font = '13px ui-monospace, monospace'
  ctx.fillText(
    `${s.time.toFixed(1)}s  ·  boss at ${Math.round((boss(s).hp / boss(s).maxHp) * 100)}%`,
    CANVAS_W / 2,
    CANVAS_H / 2 + 22,
  )

  ctx.fillStyle = COLORS.textDim
  ctx.font = '12px ui-monospace, monospace'
  ctx.fillText('press R to pull again', CANVAS_W / 2, CANVAS_H / 2 + 52)

  if (s.outcome !== 'victory') {
    ctx.fillText('the party learns a little each attempt', CANVAS_W / 2, CANVAS_H / 2 + 72)
  }
}
