import type { JoystickView } from '../input'
import { ABILITIES } from '../sim/abilities'
import { standings } from '../history'
import { CLASSES, PARTY_UNIT, abilityBar, partyCount } from '../sim/classes'
import { playerTarget } from '../sim/sim'
import { ENRAGE_AT, GLOBAL_COOLDOWN } from '../sim/constants'
import { adds, boss, castBlocker } from '../sim/combat'
import type { Actor, SimState } from '../sim/types'
import { drawIcon } from './icons'
import { COLORS, L, WORLD_RADIUS, classColor, resourceColor } from './theme'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
  /** Meter only: how many party members its list has room for. */
  rows?: number
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
  return { x: L.infoX - w, y: L.infoY + 15 * L.ui * 4 + 6, w, h }
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

/**
 * Live meter, bottom right.
 *
 * Where "bottom right" is depends on what is already there. In portrait the
 * stick owns the bottom left and the buttons the bottom right, and without
 * them the centred action bar is wide enough to reach the corner anyway, so
 * the meter sits above whichever of the two is on screen. In landscape the
 * buttons are a column against the right edge and the room is beside them,
 * above the cast bar. On a wide screen with no touch controls it takes the
 * corner it is named after.
 */
export function meterRect(touch: boolean): Rect {
  const w = Math.max(132, Math.min(210, L.w * 0.24))
  // A short screen cannot spare seven lines, and a meter that runs off the
  // bottom is worse than a shorter one.
  const rows = L.h > 560 ? 5 : 3
  const h = (rows + 2) * 13 * L.ui + 10

  const buttonTop = Math.min(...L.btnPos.map((b) => b.y)) - L.btnR
  const buttonLeft = Math.min(...L.btnPos.map((b) => b.x)) - L.btnR

  const right = touch && !L.portrait ? buttonLeft - 10 : L.w - 10
  const bottom = L.portrait
    ? // Portrait has no free bottom corner in either mode: the thumbs take it
      // on touch, and the action bar is wide enough to reach it without them.
      (touch ? buttonTop : L.actionY) - 10
    : touch
      ? L.castY - 8
      : L.h - 10

  return { x: right - w, y: bottom - h, w, h, rows }
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
 * Draws centred text that stays inside `maxWidth`.
 *
 * Shrinks a couple of steps first, then clips with an ellipsis. Ability names
 * range from "Rend" to "Shadow Word: Pain" and the long ones used to run
 * straight out of the button.
 */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxWidth: number,
  baseSize: number,
): void {
  for (let size = baseSize; size >= baseSize - 2; size--) {
    ctx.font = font(size)
    if (ctx.measureText(text).width <= maxWidth) {
      ctx.fillText(text, cx, y)
      return
    }
  }

  ctx.font = font(Math.max(6, baseSize - 2))
  let clipped = text
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1)
  }
  ctx.fillText(`${clipped}…`, cx, y)
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

/**
 * What a slot should look like right now.
 *
 * Both bars draw from this rather than working it out themselves, which is
 * how the touch layout ended up able to disagree with the keyboard one about
 * whether a button was live.
 */
export type SlotStatus = 'ready' | 'range' | 'resource' | 'locked'

export function slotStatus(s: SimState, player: Actor, abilityId: string): SlotStatus {
  const ability = ABILITIES[abilityId]
  if (!ability) return 'locked'
  if (!isUsable(player, abilityId)) return 'locked'
  if (player.power < ability.cost) return 'resource'

  const target = ability.kind === 'taunt' ? boss(s).id : playerTarget(s)
  // Too far and too close are the same answer on a button: not from here.
  const blocked = castBlocker(s, player, ability, target)
  return blocked === 'range' || blocked === 'close' ? 'range' : 'ready'
}

const SLOT_BORDER: Record<SlotStatus, string> = {
  ready: COLORS.castBar,
  range: COLORS.hpBarLow,
  // Filled in per player: what "cannot afford it" looks like depends on what
  // they are short of.
  resource: COLORS.manaBar,
  locked: COLORS.panelEdge,
}

const SLOT_RING: Record<SlotStatus, string> = {
  ready: 'rgba(250, 204, 21, 0.9)',
  range: 'rgba(248, 113, 113, 0.85)',
  resource: 'rgba(107, 114, 128, 0.6)',
  locked: 'rgba(107, 114, 128, 0.6)',
}

/** The border a slot wears, with the resource colours filled in. */
function slotBorder(player: Actor, status: SlotStatus, ring: boolean): string {
  if (status === 'resource') return resourceColor(player.resource)
  return ring ? SLOT_RING[status] : SLOT_BORDER[status]
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
  drawMinimap(ctx, s)
  drawMeter(ctx, s, touch.active)
  if (touch.active) drawTouchControls(ctx, s, touch)
  else drawActionBar(ctx, s)
  drawCastBar(ctx, s, touch.active)
  drawChat(ctx, s)
  drawPartyButton(ctx)
  drawSoundButton(ctx, muted)
  if (s.outcome !== 'ongoing') drawOutcome(ctx, s, touch.active)
}

/**
 * Minimap.
 *
 * The whole floor at a glance: where the fire is, where the boss is looking,
 * and which way the party went. It draws the same world the arena does, at
 * arena-radius-to-map-radius, with a box marking the part of it currently on
 * screen — with a camera that follows the player, that box is the only thing
 * telling you how much of the floor you cannot see.
 */
function drawMinimap(ctx: CanvasRenderingContext2D, s: SimState): void {
  const { mapX: cx, mapY: cy, mapR: r } = L
  const k = r / WORLD_RADIUS
  const at = (p: { x: number; y: number }) => ({ x: cx + p.x * k, y: cy + p.y * k })

  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(10, 10, 15, 0.82)'
  ctx.fill()
  ctx.clip()

  // Ground first, so nobody standing in it is hidden by it.
  for (const g of s.ground) {
    const p = at(g.pos)
    const gr = Math.max(1, g.radius * k)

    if (g.kind === 'breath') {
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.arc(p.x, p.y, gr, g.angle - g.halfWidth, g.angle + g.halfWidth)
      ctx.closePath()
      ctx.fillStyle = g.detonated ? 'rgba(56, 189, 248, 0.5)' : 'rgba(56, 189, 248, 0.2)'
      ctx.fill()
      continue
    }

    if (g.kind === 'shockwave') {
      ctx.beginPath()
      ctx.arc(p.x, p.y, gr, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.9)'
      ctx.lineWidth = Math.max(1, g.band * k)
      ctx.stroke()
      continue
    }

    ctx.beginPath()
    ctx.arc(p.x, p.y, gr, 0, Math.PI * 2)
    ctx.fillStyle = g.detonated ? COLORS.puddle : COLORS.telegraph
    ctx.fill()
    if (!g.detonated) {
      ctx.strokeStyle = COLORS.telegraphEdge
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }

  // The slice of the floor actually on screen. Drawn under the tokens so it
  // never hides one.
  const player = s.actors.find((a) => a.isPlayer)
  if (player) {
    const halfW = L.w / 2 / L.scale
    const halfH = L.h / 2 / L.scale
    const view = at(player.pos)
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.35)'
    ctx.lineWidth = 1
    ctx.strokeRect(view.x - halfW * k, view.y - halfH * k, halfW * 2 * k, halfH * 2 * k)
  }

  for (const a of s.actors) {
    if (!a.alive) continue
    const p = at(a.pos)
    const isBoss = a.id === boss(s).id
    const dot = isBoss ? Math.max(3, r * 0.11) : Math.max(2, r * 0.055)

    ctx.beginPath()
    ctx.arc(p.x, p.y, dot, 0, Math.PI * 2)
    ctx.fillStyle =
      a.faction === 'boss' ? (isBoss ? COLORS.boss : '#a855f7') : classColor(a.classId)
    ctx.fill()

    // Your own token gets a ring; on a map this size a colour alone is not
    // enough to pick yourself out of twenty-five dots.
    if (a.isPlayer) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, dot + 2.5, 0, Math.PI * 2)
      ctx.strokeStyle = COLORS.player
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }
  ctx.restore()

  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.strokeStyle = COLORS.panelEdge
  ctx.lineWidth = 1.5
  ctx.stroke()
}

function short(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`
}

/**
 * Live contribution meter.
 *
 * Ranked on damage plus healing, the same way the after-action report ranks,
 * so a healer is not permanently last on a board that only counts damage. The
 * player's own row is always on it: the question the meter answers during a
 * pull is "am I pulling my weight", and a row that drops off the bottom at
 * rank six answers nothing.
 */
function drawMeter(ctx: CanvasRenderingContext2D, s: SimState, touch: boolean): void {
  const rect = meterRect(touch)

  // The same ranking the record keeps, from the same function: two of them
  // would eventually be two different answers to the same question.
  const ranked = standings(s).map((row, i) => ({ ...row, rank: i + 1 }))

  const limit = rect.rows ?? 5
  const shown = ranked.slice(0, limit)
  const playerRow = ranked.find((r) => r.isPlayer)
  if (playerRow && !shown.includes(playerRow)) shown[shown.length - 1] = playerRow

  const line = 13 * L.ui
  const peak = Math.max(1, ...ranked.map((r) => r.dps + r.hps))

  ctx.fillStyle = COLORS.panel
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
  ctx.strokeStyle = COLORS.panelEdge
  ctx.lineWidth = 1
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1)

  const pad = 5
  const inner = rect.w - pad * 2
  let y = rect.y + pad + line * 0.8

  ctx.textAlign = 'left'
  ctx.font = font(9)
  ctx.fillStyle = COLORS.textDim
  ctx.fillText('per second', rect.x + pad, y)
  ctx.textAlign = 'right'
  ctx.fillText(`${s.time.toFixed(0)}s`, rect.x + rect.w - pad, y)
  y += line

  for (const row of shown) {
    const colour = classColor(row.classId)
    const total = row.dps + row.hps

    // Damage and healing stack in one bar, healing lighter, exactly as the
    // after-action report draws them.
    ctx.globalAlpha = 0.24
    ctx.fillStyle = colour
    ctx.fillRect(rect.x + pad, y - line * 0.72, (row.dps / peak) * inner, line * 0.86)
    ctx.globalAlpha = 0.13
    ctx.fillRect(
      rect.x + pad + (row.dps / peak) * inner,
      y - line * 0.72,
      (row.hps / peak) * inner,
      line * 0.86,
    )
    ctx.globalAlpha = 1

    ctx.textAlign = 'left'
    ctx.font = font(9, row.isPlayer)
    ctx.fillStyle = row.isPlayer ? COLORS.player : COLORS.text
    fitLeft(ctx, `${row.rank} ${row.name}`, rect.x + pad + 2, y, inner - 40 * L.ui)

    ctx.textAlign = 'right'
    ctx.fillStyle = row.hps > row.dps ? '#4ade80' : COLORS.textDim
    ctx.fillText(short(total), rect.x + rect.w - pad - 2, y)
    y += line
  }

  const raidDps = ranked.reduce((sum, r) => sum + r.dps, 0)
  const raidHps = ranked.reduce((sum, r) => sum + r.hps, 0)
  ctx.textAlign = 'left'
  ctx.font = font(9)
  ctx.fillStyle = COLORS.textDim
  ctx.fillText(`raid ${short(raidDps)} · heal ${short(raidHps)}`, rect.x + pad, y)
}

/** Left-aligned counterpart to fitText: clips rather than shrinking. */
function fitLeft(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
): void {
  let clipped = text
  while (clipped.length > 1 && ctx.measureText(clipped).width > maxWidth) {
    clipped = clipped.slice(0, -1)
  }
  ctx.fillText(clipped, x, y)
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
  const y = L.bannerY

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

/**
 * Where every party frame goes.
 *
 * A party is a column, read top to bottom, and the columns run left to right
 * three at a time before wrapping — so a five-man is one column, a ten-man is
 * two side by side, and a twenty-five man is three columns and then two more
 * underneath. Stacking all twenty-five in one column, which is what this used
 * to do, ran two full screens off the bottom.
 *
 * Everything is sized off the viewport rather than clamped to a fixed pixel
 * range: the frames were built for a five-man and stayed that size when the
 * raid did not.
 */
export function partyFrames(count: number): Rect[] {
  const gap = 4
  const parties = partyCount(count)
  const deep = Math.min(count, PARTY_UNIT)

  // The whole block fits in the top half of the screen. Everything else is
  // derived from that: the frames are as tall as half a screen divided by the
  // rows it has to hold, and as wide as that height allows.
  const ceiling = L.h * 0.5
  const budget = L.w * (L.portrait ? 0.44 : 0.34)

  // One shape, three columns wide at most. Width follows height rather than
  // being chosen on its own, so a frame never ends up long and thin on one
  // screen and square on another.
  const ASPECT = 2.9

  const sized = (cols: number) => {
    const rows = Math.ceil(parties / cols) * deep
    const byHeight = (ceiling - gap * (rows - 1)) / rows
    const byWidth = (budget - gap * (cols - 1)) / cols / ASPECT
    const h = Math.max(14, Math.min(40, byHeight, byWidth))
    return { cols, rows, h, w: h * ASPECT }
  }

  // Parties go side by side, three at a time, because that is what the frames
  // are for: a ten-man is two groups and reads as two. Narrower is only
  // considered when three has been squeezed below the point of legibility,
  // and then only if it actually comes out bigger — on a short screen fewer
  // columns means more rows, which is worse in the direction that is already
  // the binding one.
  const legible = 48
  let best = sized(Math.min(3, parties))
  if (best.w < legible) {
    for (let cols = best.cols - 1; cols >= 1; cols--) {
      const option = sized(cols)
      if (option.w > best.w) best = option
    }
  }

  const rects: Rect[] = []
  for (let i = 0; i < count; i++) {
    const party = Math.floor(i / PARTY_UNIT)
    const col = party % best.cols
    const bandRow = Math.floor(party / best.cols)
    const withinParty = i % PARTY_UNIT
    rects.push({
      x: L.partyX + col * (best.w + gap),
      y: L.partyY + (bandRow * deep + withinParty) * (best.h + gap),
      w: best.w,
      h: best.h,
    })
  }
  return rects
}

function drawPartyFrames(ctx: CanvasRenderingContext2D, s: SimState): void {
  const members = s.actors.filter((a) => a.faction === 'party')
  const rects = partyFrames(members.length)
  members.forEach((m, i) => {
    const r = rects[i]
    if (r) frame(ctx, m, r, s)
  })
}

function frame(ctx: CanvasRenderingContext2D, a: Actor, rect: Rect, s: SimState): void {
  const { x, y, w, h } = rect
  // Text shrinks with the frame. At twenty-five players a name written for a
  // five-man frame is wider than the frame it is in.
  const k = Math.min(1, h / 44)

  ctx.fillStyle = COLORS.panel
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = a.isPlayer ? COLORS.player : COLORS.panelEdge
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)

  ctx.fillStyle = a.alive ? classColor(a.classId) : COLORS.dead
  ctx.font = font(11 * k, true)
  ctx.textAlign = 'left'
  ctx.fillText(a.name, x + 5, y + 12 * L.ui * k)

  const hpRatio = a.hp / a.maxHp
  const barY = y + h * 0.36
  bar(ctx, x + 5, barY, w - 10, Math.max(4, h * 0.2), hpRatio, hpRatio < 0.35 ? COLORS.hpBarLow : COLORS.hpBar)

  if (a.maxPower > 0) {
    bar(
      ctx,
      x + 5,
      barY + h * 0.24,
      w - 10,
      Math.max(2, h * 0.09),
      a.power / a.maxPower,
      resourceColor(a.resource),
    )
  }

  // Aura chips along the bottom.
  const chip = Math.max(7, h * 0.2)
  let ax = x + 5
  for (const aura of a.auras) {
    const color =
      aura.id === 'spread' ? COLORS.spread : aura.id === 'shield' ? '#93c5fd' : '#4ade80'
    ctx.fillStyle = color
    ctx.fillRect(ax, y + h - chip - 4, chip, chip)
    ctx.fillStyle = '#0a0a0f'
    ctx.font = font(9 * k, true)
    ctx.textAlign = 'center'
    ctx.fillText(aura.id[0]!.toUpperCase(), ax + chip / 2, y + h - 5)
    ax += chip + 3
  }

  if (a.castId && a.castTotal > 0) {
    const progress = 1 - a.castRemaining / a.castTotal
    bar(ctx, x + 5, y + h - chip - 4, w - 10, chip, progress, COLORS.castBar)
    ctx.fillStyle = '#0a0a0f'
    ctx.font = font(8 * k, true)
    ctx.textAlign = 'center'
    ctx.fillText(ABILITIES[a.castId]?.name ?? a.castId, x + w / 2, y + h - 6)
  }

  if (!a.alive) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(x, y, w, h)
    ctx.fillStyle = COLORS.hpBarLow
    ctx.font = font(12 * k, true)
    ctx.textAlign = 'center'
    ctx.fillText('DEAD', x + w / 2, y + h / 2 + 4 * k)
  }

  // Threat readout: the tank losing the lead is the classic failure mode.
  const threat = s.threat[a.id]
  if (threat !== undefined && a.alive && L.ui > 0.8 && k > 0.7) {
    ctx.fillStyle = COLORS.textDim
    ctx.font = font(9 * k)
    ctx.textAlign = 'right'
    ctx.fillText(`${Math.round(threat)}`, x + w - 5, y + 12 * L.ui * k)
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

  const bar = abilityBar({ classId: player.classId, spec: player.spec })
  const slot = 58 * L.ui
  const gap = 8 * L.ui
  const total = bar.length * slot + (bar.length - 1) * gap
  let x = (L.w - total) / 2
  const y = L.actionY

  for (const id of bar) {
    const ability = ABILITIES[id]!
    const status = slotStatus(s, player, id)
    const usable = status === 'ready'

    ctx.fillStyle = COLORS.panel
    ctx.fillRect(x, y, slot, slot)
    ctx.strokeStyle = slotBorder(player, status, false)
    ctx.lineWidth = usable ? 2 : 1
    ctx.strokeRect(x + 0.5, y + 0.5, slot - 1, slot - 1)

    drawIcon(ctx, id, x + slot / 2, y + slot / 2, slot * 0.56, !usable)

    ctx.font = font(9)
    ctx.fillStyle = COLORS.textDim
    ctx.textAlign = 'left'
    // The slot is the key. It used to be a field on the ability, which could
    // not survive one ability sitting in different slots in two specs.
    ctx.fillText(`${bar.indexOf(id) + 1}`, x + 5, y + 12 * L.ui)

    // The wipe is circular even on a square icon, clipped to the slot.
    const state = slotCooldown(player, id, ability.cooldown)
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, slot, slot)
    ctx.clip()
    sweep(ctx, x + slot / 2, y + slot / 2, slot * 0.78, state.remaining, state.total, state.shade)
    ctx.restore()

    if (state.showNumber) {
      ctx.textAlign = 'center'
      ctx.fillStyle = COLORS.text
      ctx.font = font(14, true)
      ctx.fillText(state.remaining.toFixed(1), x + slot / 2, y + slot / 2 + 5)
    }

    // The name lives under the slot, where it cannot overflow into a neighbour.
    ctx.textAlign = 'center'
    ctx.fillStyle = usable ? COLORS.text : COLORS.textDim
    fitText(ctx, ability.name, x + slot / 2, y + slot + 11 * L.ui, slot + gap - 2, 9)

    x += slot + gap
  }
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

  const bar = abilityBar({ classId: player.classId, spec: player.spec })
  for (let i = 0; i < bar.length && i < L.btnPos.length; i++) {
    const id = bar[i]!
    const ability = ABILITIES[id]!
    const { x: bx, y: cy } = L.btnPos[i]!
    const status = slotStatus(s, player, id)
    const usable = status === 'ready'
    const holding = touch.heldSlots.has(i)

    ctx.beginPath()
    ctx.arc(bx, cy, L.btnR, 0, Math.PI * 2)
    ctx.fillStyle = holding ? 'rgba(250, 204, 21, 0.28)' : 'rgba(15, 17, 26, 0.55)'
    ctx.fill()
    ctx.strokeStyle = slotBorder(player, status, true)
    ctx.lineWidth = usable ? 3 : 2
    ctx.stroke()

    const state = slotCooldown(player, id, ability.cooldown)

    // Icon sits above centre so the name has room inside the button.
    drawIcon(ctx, id, bx, cy - L.btnR * 0.18, L.btnR * 0.92, !usable)
    sweep(ctx, bx, cy, L.btnR, state.remaining, state.total, state.shade)

    ctx.textAlign = 'center'
    if (state.showNumber) {
      ctx.fillStyle = COLORS.text
      ctx.font = font(15, true)
      ctx.fillText(state.remaining.toFixed(1), bx, cy + L.btnR * 0.12)
    } else {
      ctx.fillStyle = usable ? COLORS.text : COLORS.textDim
      fitText(ctx, ability.name, bx, cy + L.btnR * 0.62, L.btnR * 1.8, 9)
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
    const colour = classColor(row.actor.classId)

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
