import type { JoystickView } from '../input'
import { ABILITIES } from '../sim/abilities'
import { CLASSES, abilityBar } from '../sim/classes'
import { ENRAGE_AT, GLOBAL_COOLDOWN } from '../sim/constants'
import { adds, boss } from '../sim/combat'
import type { Actor, SimState } from '../sim/types'
import { COLORS, L, roleColor } from './theme'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Small always-visible control that returns to party selection. */
/**
 * Party and mute sit side by side under the fight readout.
 *
 * Not stacked: on a landscape phone the column below the readout runs
 * straight into the top ability button. Not in a corner either — both bottom
 * corners belong to the stick and the buttons on touch.
 */
export function partyButton(): Rect {
  const pair = Math.max(120, Math.min(170, L.w * 0.26))
  const w = (pair - 6) / 2
  const h = Math.max(22, Math.min(30, L.h * 0.04))
  return { x: L.w - w - 8, y: L.infoY + 15 * L.ui * 4 + 6, w, h }
}

/** Mute toggle, immediately left of the party button. */
export function soundButton(): Rect {
  const p = partyButton()
  return { x: p.x - p.w - 6, y: p.y, w: p.w, h: p.h }
}

/** Buttons on the end-of-fight overlay; shared with the hit test in main. */
export function outcomeButtons(): { retry: Rect; party: Rect } {
  const w = Math.min(180, L.w * 0.38)
  const h = Math.max(40, Math.min(54, L.h * 0.07))
  const gap = 12
  const y = L.h - h - Math.max(26, L.h * 0.055)
  return {
    retry: { x: L.w / 2 - w - gap / 2, y, w, h },
    party: { x: L.w / 2 + gap / 2, y, w, h },
  }
}

export interface TouchView {
  active: boolean
  joystick: JoystickView | null
  heldSlots: ReadonlySet<number>
}

function font(size: number, bold = false): string {
  return `${bold ? 'bold ' : ''}${Math.round(size * L.ui)}px ui-monospace, monospace`
}

/**
 * Radial cooldown wipe, clockwise from twelve o'clock.
 *
 * The global cooldown runs on every button at once and is drawn lighter than
 * a real cooldown, so at a glance you can tell "everything is briefly locked"
 * apart from "this one ability is down" — which is the whole point of how the
 * bar reads while you are playing.
 */
function sweep(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  remaining: number,
  total: number,
  shade: number,
): void {
  if (remaining <= 0 || total <= 0) return
  const fraction = Math.max(0, Math.min(1, remaining / total))
  if (fraction <= 0) return

  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fraction)
  ctx.closePath()
  ctx.fillStyle = `rgba(0, 0, 0, ${shade})`
  ctx.fill()
}

/** Casting locks the bar too, exactly as it does in the game this apes. */
function isUsable(player: Actor, abilityId: string): boolean {
  if (!player.alive || player.castId) return false
  if (player.gcd > 0 && !ABILITIES[abilityId]?.offGcd) return false
  return (player.cooldowns[abilityId] ?? 0) <= 0
}

/** What a slot should show: its own cooldown if it has one, else the GCD. */
function slotCooldown(
  player: Actor,
  abilityId: string,
  abilityCooldown: number,
): { remaining: number; total: number; shade: number; showNumber: boolean } {
  const own = player.cooldowns[abilityId] ?? 0
  if (own > 0 && abilityCooldown > 0) {
    return { remaining: own, total: abilityCooldown, shade: 0.62, showNumber: true }
  }
  // Off-GCD abilities stay lit while everything else is swept.
  if (ABILITIES[abilityId]?.offGcd) {
    return { remaining: 0, total: 0, shade: 0, showNumber: false }
  }
  // The global cooldown never shows a number in the real thing; it is too
  // short to read and it would flicker on every press.
  return { remaining: player.gcd, total: GLOBAL_COOLDOWN, shade: 0.34, showNumber: false }
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

export function drawHud(
  ctx: CanvasRenderingContext2D,
  s: SimState,
  touch: TouchView,
  muted: boolean,
): void {
  drawBossFrame(ctx, s)
  drawPartyFrames(ctx, s)
  drawFightInfo(ctx, s)
  drawTideWarning(ctx, s)
  if (touch.active) drawTouchControls(ctx, s, touch)
  else drawActionBar(ctx, s)
  drawCastBar(ctx, s, touch.active)
  drawChat(ctx, s)
  drawPartyButton(ctx)
  drawSoundButton(ctx, muted)
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

  const bar = abilityBar({ classId: player.classId, role: player.role })
  const slot = 58 * L.ui
  const gap = 8 * L.ui
  const total = bar.length * slot + (bar.length - 1) * gap
  let x = (L.w - total) / 2
  const y = L.actionY

  for (const id of bar) {
    const ability = ABILITIES[id]!
    const poor = player.mana < ability.manaCost
    const usable = isUsable(player, id) && !poor

    ctx.fillStyle = COLORS.panel
    ctx.fillRect(x, y, slot, slot)
    ctx.strokeStyle = usable ? COLORS.castBar : poor ? COLORS.manaBar : COLORS.panelEdge
    ctx.lineWidth = usable ? 2 : 1
    ctx.strokeRect(x + 0.5, y + 0.5, slot - 1, slot - 1)

    ctx.fillStyle = usable ? COLORS.text : COLORS.textDim
    ctx.font = font(11, true)
    ctx.textAlign = 'center'
    ctx.fillText(ability.name, x + slot / 2, y + slot / 2 + 4)

    ctx.font = font(9)
    ctx.fillStyle = COLORS.textDim
    ctx.fillText(ability.key, x + 8, y + 12 * L.ui)

    // The wipe is circular even on a square icon, clipped to the slot.
    const state = slotCooldown(player, id, ability.cooldown)
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, slot, slot)
    ctx.clip()
    sweep(ctx, x + slot / 2, y + slot / 2, slot * 0.78, state.remaining, state.total, state.shade)
    ctx.restore()

    if (state.showNumber) {
      ctx.fillStyle = COLORS.text
      ctx.font = font(14, true)
      ctx.fillText(state.remaining.toFixed(1), x + slot / 2, y + slot / 2 + 5)
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

  const bar = abilityBar({ classId: player.classId, role: player.role })
  for (let i = 0; i < bar.length && i < L.btnYs.length; i++) {
    const id = bar[i]!
    const ability = ABILITIES[id]!
    const cy = L.btnYs[i]!
    const poor = player.mana < ability.manaCost
    const usable = isUsable(player, id) && !poor
    const holding = touch.heldSlots.has(i)

    ctx.beginPath()
    ctx.arc(L.btnX, cy, L.btnR, 0, Math.PI * 2)
    ctx.fillStyle = holding ? 'rgba(250, 204, 21, 0.28)' : 'rgba(15, 17, 26, 0.55)'
    ctx.fill()
    ctx.strokeStyle = usable
      ? 'rgba(250, 204, 21, 0.9)'
      : poor
        ? 'rgba(59, 130, 246, 0.8)'
        : 'rgba(107, 114, 128, 0.6)'
    ctx.lineWidth = usable ? 3 : 2
    ctx.stroke()

    const state = slotCooldown(player, id, ability.cooldown)
    sweep(ctx, L.btnX, cy, L.btnR, state.remaining, state.total, state.shade)

    ctx.fillStyle = usable ? COLORS.text : COLORS.textDim
    ctx.font = font(12, true)
    ctx.textAlign = 'center'
    ctx.fillText(ability.name, L.btnX, cy + 4)

    if (state.showNumber) {
      ctx.fillStyle = COLORS.text
      ctx.font = font(15, true)
      ctx.fillText(state.remaining.toFixed(1), L.btnX, cy + 22 * L.ui)
    } else if (ability.castTime > 0) {
      ctx.fillStyle = COLORS.textDim
      ctx.font = font(9)
      ctx.fillText(`${ability.castTime}s`, L.btnX, cy + 20 * L.ui)
    }
  }
}

function drawPartyButton(ctx: CanvasRenderingContext2D): void {
  const r = partyButton()
  ctx.fillStyle = 'rgba(15, 17, 26, 0.7)'
  ctx.fillRect(r.x, r.y, r.w, r.h)
  ctx.strokeStyle = COLORS.panelEdge
  ctx.lineWidth = 1
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1)
  ctx.fillStyle = COLORS.textDim
  ctx.font = font(10)
  ctx.textAlign = 'center'
  ctx.fillText('party', r.x + r.w / 2, r.y + r.h * 0.68)
}

function drawSoundButton(ctx: CanvasRenderingContext2D, muted: boolean): void {
  const r = soundButton()
  ctx.fillStyle = 'rgba(15, 17, 26, 0.7)'
  ctx.fillRect(r.x, r.y, r.w, r.h)
  ctx.strokeStyle = COLORS.panelEdge
  ctx.lineWidth = 1
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1)
  ctx.fillStyle = muted ? COLORS.textDim : COLORS.text
  ctx.font = font(10)
  ctx.textAlign = 'center'
  ctx.fillText(muted ? 'muted' : 'sound', r.x + r.w / 2, r.y + r.h * 0.68)
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

function compact(value: number): string {
  if (value >= 10000) return `${(value / 1000).toFixed(0)}k`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return value.toFixed(0)
}

/**
 * After-action report.
 *
 * A pull that ends with only "wipe" on screen tells you nothing about why.
 * The numbers the genre actually argues over are damage, healing, and how
 * many avoidable mechanics each player ate — so those are the columns.
 */
function drawReport(ctx: CanvasRenderingContext2D, s: SimState, top: number, bottom: number): void {
  const members = s.actors.filter((a) => a.faction === 'party')
  const seconds = Math.max(1, s.time)

  const rows = members
    .map((m) => {
      const t = s.tally[m.id]
      return {
        actor: m,
        dps: (t?.damage ?? 0) / seconds,
        hps: (t?.healing ?? 0) / seconds,
        overheal: t?.overhealing ?? 0,
        healing: t?.healing ?? 0,
        taken: t?.damageTaken ?? 0,
        mechanics: t?.mechanicHits ?? 0,
        deathAt: t?.deathAt ?? null,
      }
    })
    // Whoever contributed most goes on top, damage or healing.
    .sort((a, b) => b.dps + b.hps - (a.dps + a.hps))

  const peak = Math.max(1, ...rows.map((r) => r.dps + r.hps))
  const available = bottom - top
  const rowH = Math.min(30 * L.ui, available / rows.length)
  const width = Math.min(L.w - 40, 560)
  const x = (L.w - width) / 2

  ctx.textAlign = 'left'
  ctx.font = font(9)
  ctx.fillStyle = COLORS.textDim
  ctx.fillText('damage / healing per second', x, top - 6)
  ctx.textAlign = 'right'
  ctx.fillText('taken      mechanics', x + width, top - 6)

  rows.forEach((row, i) => {
    const y = top + i * rowH
    const h = rowH - 4
    const cls = CLASSES[row.actor.classId]
    const colour = roleColor(row.actor.role, row.actor.isPlayer)

    // Contribution bar behind the text, healing shown lighter than damage.
    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    ctx.fillRect(x, y, width, h)
    ctx.fillStyle = colour
    ctx.globalAlpha = 0.22
    ctx.fillRect(x, y, (row.dps / peak) * width, h)
    ctx.globalAlpha = 0.12
    ctx.fillRect(x + (row.dps / peak) * width, y, (row.hps / peak) * width, h)
    ctx.globalAlpha = 1

    ctx.textAlign = 'left'
    ctx.fillStyle = row.actor.isPlayer ? COLORS.player : COLORS.text
    ctx.font = font(11, row.actor.isPlayer)
    ctx.fillText(`${row.actor.name}`, x + 6, y + h * 0.68)

    ctx.fillStyle = COLORS.textDim
    ctx.font = font(9)
    ctx.fillText(cls.name, x + 76 * L.ui, y + h * 0.68)

    if (row.deathAt !== null) {
      ctx.fillStyle = COLORS.hpBarLow
      ctx.fillText(`died ${row.deathAt.toFixed(0)}s`, x + 130 * L.ui, y + h * 0.68)
    }

    ctx.textAlign = 'right'
    ctx.fillStyle = COLORS.text
    ctx.font = font(11, true)
    const contribution =
      row.hps > row.dps
        ? `${compact(row.hps)} hps`
        : `${compact(row.dps)} dps`
    ctx.fillText(contribution, x + width - 150 * L.ui, y + h * 0.68)

    ctx.fillStyle = COLORS.textDim
    ctx.font = font(10)
    ctx.fillText(compact(row.taken), x + width - 78 * L.ui, y + h * 0.68)

    // The column people argue about.
    ctx.fillStyle = row.mechanics > 0 ? COLORS.hpBarLow : COLORS.textDim
    ctx.font = font(11, row.mechanics > 2)
    ctx.fillText(String(row.mechanics), x + width - 8, y + h * 0.68)
  })
}

function drawOutcome(ctx: CanvasRenderingContext2D, s: SimState, touch: boolean): void {
  ctx.fillStyle = 'rgba(5, 5, 10, 0.86)'
  ctx.fillRect(0, 0, L.w, L.h)

  const label =
    s.outcome === 'victory' ? 'KILL' : s.outcome === 'enrage' ? 'ENRAGE WIPE' : 'WIPE'
  const colour = s.outcome === 'victory' ? COLORS.hpBar : COLORS.hpBarLow
  const buttons = outcomeButtons()

  ctx.textAlign = 'center'
  ctx.fillStyle = colour
  ctx.font = font(30, true)
  ctx.fillText(label, L.w / 2, Math.max(40, L.h * 0.11))

  ctx.fillStyle = COLORS.text
  ctx.font = font(12)
  ctx.fillText(
    `${s.time.toFixed(1)}s   ·   boss at ${Math.round((boss(s).hp / boss(s).maxHp) * 100)}%   ·   pull ${s.attempt + 1}`,
    L.w / 2,
    Math.max(62, L.h * 0.16),
  )

  drawReport(ctx, s, Math.max(96, L.h * 0.26), buttons.retry.y - 24)

  for (const [text, rect, accent] of [
    [touch ? 'PULL AGAIN' : 'PULL AGAIN  (R)', buttons.retry, COLORS.castBar],
    ['CHANGE PARTY', buttons.party, COLORS.textDim],
  ] as const) {
    ctx.fillStyle = 'rgba(15, 17, 26, 0.85)'
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
    ctx.strokeStyle = accent
    ctx.lineWidth = 2
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1)
    ctx.fillStyle = accent
    ctx.font = font(12, true)
    ctx.textAlign = 'center'
    ctx.fillText(text, rect.x + rect.w / 2, rect.y + rect.h * 0.62)
  }

  if (s.outcome !== 'victory') {
    ctx.fillStyle = COLORS.textDim
    ctx.font = font(11)
    ctx.fillText(
      'the party learns a little each attempt',
      L.w / 2,
      buttons.retry.y + buttons.retry.h + 20,
    )
  }
}
