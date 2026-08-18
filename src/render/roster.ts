import { CLASSES, CLASS_ORDER, PARTY_SIZE, SLOTS, countRoles, type ClassId } from '../sim/classes'
import { COLORS, L } from './theme'

/**
 * Party selection.
 *
 * Drawn on the same canvas as the fight so it inherits the responsive layout
 * and works with touch untouched. Geometry is computed once and shared by the
 * renderer and the hit test, so the two can never disagree about where a
 * button is.
 */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface RosterLayout {
  slots: Rect[]
  classes: Rect[]
  pull: Rect
  titleY: number
  summaryY: number
  hintY: number
}

export type RosterHit =
  | { kind: 'slot'; index: number }
  | { kind: 'class'; classId: ClassId }
  | { kind: 'pull' }

const ROLE_COLOR: Record<string, string> = {
  tank: COLORS.tank,
  healer: COLORS.healer,
  dps: COLORS.player,
}

export function rosterLayout(): RosterLayout {
  const pad = Math.max(8, L.w * 0.02)
  const titleY = Math.max(28, L.h * 0.06)

  const slotGap = pad * 0.5
  const slotW = (L.w - pad * 2 - slotGap * (PARTY_SIZE - 1)) / PARTY_SIZE
  const slotH = Math.min(96, Math.max(64, L.h * 0.13))
  const slotY = titleY + 16

  const slots: Rect[] = []
  for (let i = 0; i < PARTY_SIZE; i++) {
    slots.push({ x: pad + i * (slotW + slotGap), y: slotY, w: slotW, h: slotH })
  }

  const summaryY = slotY + slotH + 22

  const cols = L.portrait ? 2 : 4
  const rows = Math.ceil(CLASS_ORDER.length / cols)
  const gridTop = summaryY + 16
  const pullH = Math.min(58, Math.max(42, L.h * 0.07))
  const gridBottom = L.h - pullH - pad * 2.2
  const cellGap = pad * 0.5
  const cellW = (L.w - pad * 2 - cellGap * (cols - 1)) / cols
  const cellH = Math.max(46, (gridBottom - gridTop - cellGap * (rows - 1)) / rows)

  const classes: Rect[] = []
  for (let i = 0; i < CLASS_ORDER.length; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    classes.push({
      x: pad + col * (cellW + cellGap),
      y: gridTop + row * (cellH + cellGap),
      w: cellW,
      h: cellH,
    })
  }

  const pullW = Math.min(320, L.w - pad * 2)
  return {
    slots,
    classes,
    pull: { x: (L.w - pullW) / 2, y: L.h - pullH - pad, w: pullW, h: pullH },
    titleY,
    summaryY,
    hintY: summaryY + 2,
  }
}

function inside(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}

export function hitRoster(x: number, y: number): RosterHit | null {
  const layout = rosterLayout()
  if (inside(layout.pull, x, y)) return { kind: 'pull' }

  for (let i = 0; i < layout.slots.length; i++) {
    if (inside(layout.slots[i]!, x, y)) return { kind: 'slot', index: i }
  }
  for (let i = 0; i < layout.classes.length; i++) {
    if (inside(layout.classes[i]!, x, y)) return { kind: 'class', classId: CLASS_ORDER[i]! }
  }
  return null
}

function font(size: number, bold = false): string {
  return `${bold ? 'bold ' : ''}${Math.round(size * L.ui)}px ui-monospace, monospace`
}

export function drawRoster(
  ctx: CanvasRenderingContext2D,
  party: ClassId[],
  activeSlot: number,
  clock: number,
): void {
  const layout = rosterLayout()

  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, L.w, L.h)

  ctx.textAlign = 'center'
  ctx.fillStyle = COLORS.text
  ctx.font = font(19, true)
  ctx.fillText('FORM YOUR PARTY', L.w / 2, layout.titleY)

  // --- slots ---------------------------------------------------------------
  for (let i = 0; i < layout.slots.length; i++) {
    const r = layout.slots[i]!
    const classId = party[i]!
    const cls = CLASSES[classId]
    const active = i === activeSlot

    ctx.fillStyle = active ? 'rgba(250, 204, 21, 0.10)' : COLORS.panel
    ctx.fillRect(r.x, r.y, r.w, r.h)
    ctx.strokeStyle = active ? COLORS.castBar : COLORS.panelEdge
    ctx.lineWidth = active ? 2 : 1
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1)

    const cx = r.x + r.w / 2
    ctx.fillStyle = i === 0 ? COLORS.player : COLORS.textDim
    ctx.font = font(10, i === 0)
    ctx.fillText(i === 0 ? 'YOU' : SLOTS[i]!.name, cx, r.y + 16 * L.ui)

    ctx.fillStyle = ROLE_COLOR[cls.role] ?? COLORS.text
    ctx.font = font(12, true)
    ctx.fillText(cls.name, cx, r.y + r.h * 0.58)

    ctx.fillStyle = COLORS.textDim
    ctx.font = font(9)
    ctx.fillText(cls.melee ? `${cls.role} · melee` : cls.role, cx, r.y + r.h - 10 * L.ui)
  }

  // --- composition summary -------------------------------------------------
  const roles = countRoles(party)
  const problems: string[] = []
  if (roles.tank === 0) problems.push('no tank: the boss will chase whoever it likes')
  if (roles.healer === 0) problems.push('no healer: nothing will out-live the tide')

  ctx.font = font(11)
  if (problems.length > 0) {
    ctx.fillStyle = COLORS.hpBarLow
    ctx.fillText(problems.join('   ·   '), L.w / 2, layout.summaryY)
  } else {
    ctx.fillStyle = COLORS.textDim
    ctx.fillText(
      `${roles.tank} tank · ${roles.healer} healer · ${roles.dps} damage    —    tap a slot, then a class`,
      L.w / 2,
      layout.summaryY,
    )
  }

  // --- class grid ----------------------------------------------------------
  for (let i = 0; i < layout.classes.length; i++) {
    const r = layout.classes[i]!
    const classId = CLASS_ORDER[i]!
    const cls = CLASSES[classId]
    const chosen = party[activeSlot] === classId
    const used = party.includes(classId)

    ctx.fillStyle = chosen ? 'rgba(74, 222, 128, 0.12)' : COLORS.panel
    ctx.fillRect(r.x, r.y, r.w, r.h)
    ctx.strokeStyle = chosen ? COLORS.player : used ? COLORS.panelEdge : 'rgba(107,114,128,0.4)'
    ctx.lineWidth = chosen ? 2 : 1
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1)

    const cx = r.x + r.w / 2
    ctx.textAlign = 'center'
    ctx.fillStyle = ROLE_COLOR[cls.role] ?? COLORS.text
    ctx.font = font(13, true)
    ctx.fillText(cls.name, cx, r.y + r.h * 0.42)

    ctx.fillStyle = COLORS.textDim
    ctx.font = font(9)
    ctx.fillText(
      `${cls.role}${cls.melee ? ' · melee' : ''}   ${cls.hp} hp`,
      cx,
      r.y + r.h * 0.72,
    )
  }

  // --- pull ----------------------------------------------------------------
  const pulse = 0.75 + 0.25 * Math.sin(clock * 3)
  ctx.fillStyle = `rgba(250, 204, 21, ${(0.14 * pulse).toFixed(2)})`
  ctx.fillRect(layout.pull.x, layout.pull.y, layout.pull.w, layout.pull.h)
  ctx.strokeStyle = COLORS.castBar
  ctx.lineWidth = 2
  ctx.strokeRect(layout.pull.x + 0.5, layout.pull.y + 0.5, layout.pull.w - 1, layout.pull.h - 1)
  ctx.fillStyle = COLORS.castBar
  ctx.font = font(15, true)
  ctx.fillText('PULL', layout.pull.x + layout.pull.w / 2, layout.pull.y + layout.pull.h * 0.62)
}
