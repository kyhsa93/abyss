import {
  CLASSES,
  DIFFICULTIES,
  RAID_SIZES,
  PARTY_UNIT,
  ROLE_LIMITS,
  SPEC_OPTIONS,
  canSelect,
  countRoles,
  isFixedComposition,
  partyCount,
  makeSlots,
  mitigation,
  specLabel,
  specOf,
  type DifficultyId,
  type Pick,
  type RaidSize,
} from '../sim/classes'
import { COLORS, L } from './theme'

/**
 * Raid setup.
 *
 * Drawn on the same canvas as the fight so it inherits the responsive layout
 * and touch handling. Geometry is computed once and shared by the renderer
 * and the hit test, so the two can never disagree about where a button is.
 */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface RosterLayout {
  sizes: Rect[]
  difficulties: Rect[]
  slots: Rect[]
  /** Left-hand party labels, one per group of five. */
  partyLabels: Rect[]
  classes: Rect[]
  auto: Rect
  random: Rect
  pull: Rect
  titleY: number
  summaryY: number
  slotCols: number
}

export type RosterHit =
  | { kind: 'slot'; index: number }
  | { kind: 'class'; pick: Pick }
  | { kind: 'size'; size: RaidSize }
  | { kind: 'difficulty'; id: DifficultyId }
  | { kind: 'auto' }
  | { kind: 'random' }
  | { kind: 'pull' }

const ROLE_COLOR: Record<string, string> = {
  tank: COLORS.tank,
  healer: COLORS.healer,
  dps: COLORS.player,
}

const DIFFICULTY_ORDER: DifficultyId[] = ['normal', 'heroic']

export function rosterLayout(size: number): RosterLayout {
  const pad = Math.max(8, L.w * 0.02)
  const titleY = Math.max(24, L.h * 0.05)

  // Size and difficulty share a row of tabs.
  const tabH = Math.max(24, Math.min(34, L.h * 0.045))
  const tabY = titleY + 8
  const tabW = Math.min(64, (L.w - pad * 2 - 24) / (RAID_SIZES.length + DIFFICULTY_ORDER.length))

  const sizes = RAID_SIZES.map((_, i) => ({
    x: pad + i * (tabW + 4),
    y: tabY,
    w: tabW,
    h: tabH,
  }))
  const diffW = Math.min(88, tabW * 1.5)
  const difficulties = DIFFICULTY_ORDER.map((_, i) => ({
    x: L.w - pad - (DIFFICULTY_ORDER.length - i) * (diffW + 4) + 4,
    y: tabY,
    w: diffW,
    h: tabH,
  }))

  // One row per party of five, so the raid reads as its groups.
  const slotCols = PARTY_UNIT
  const groups = partyCount(size)
  const gap = Math.max(3, pad * 0.3)
  const rowGap = gap * 2.2
  const labelW = groups > 1 ? Math.max(14, L.w * 0.022) : 0
  const slotW = (L.w - pad * 2 - labelW - gap * (slotCols - 1)) / slotCols
  const slotH = size <= 5 ? Math.min(78, L.h * 0.12) : Math.min(44, L.h * 0.068)
  const slotTop = tabY + tabH + 10

  const slots: Rect[] = []
  const partyLabels: Rect[] = []
  for (let i = 0; i < size; i++) {
    const row = Math.floor(i / slotCols)
    slots.push({
      x: pad + labelW + (i % slotCols) * (slotW + gap),
      y: slotTop + row * (slotH + rowGap),
      w: slotW,
      h: slotH,
    })
  }
  for (let g = 0; g < groups && labelW > 0; g++) {
    partyLabels.push({ x: pad, y: slotTop + g * (slotH + rowGap), w: labelW - 3, h: slotH })
  }

  const summaryY = slotTop + groups * (slotH + rowGap) + 12

  const buttonH = Math.max(38, Math.min(52, L.h * 0.062))
  const gridTop = summaryY + 22
  const gridBottom = L.h - buttonH - pad * 2

  // Fifteen class/role combinations, and on a landscape phone the slot grid
  // has already eaten most of the height. Widen the grid until its rows fit
  // rather than letting it run off the bottom.
  const minCellH = 34
  const candidates = L.portrait ? [3, 4, 5] : [5, 6, 8, 15]
  let cols = candidates[candidates.length - 1]!
  for (const option of candidates) {
    const needed = Math.ceil(SPEC_OPTIONS.length / option)
    if (gridTop + needed * (minCellH + gap) <= gridBottom + gap) {
      cols = option
      break
    }
  }

  const rows = Math.ceil(SPEC_OPTIONS.length / cols)
  const cellW = (L.w - pad * 2 - gap * (cols - 1)) / cols
  const cellH = Math.max(
    minCellH,
    Math.min(64, (gridBottom - gridTop - gap * (rows - 1)) / rows),
  )

  const classes: Rect[] = []
  for (let i = 0; i < SPEC_OPTIONS.length; i++) {
    classes.push({
      x: pad + (i % cols) * (cellW + gap),
      y: gridTop + Math.floor(i / cols) * (cellH + gap),
      w: cellW,
      h: cellH,
    })
  }

  // Three buttons on one row; the fill buttons share a quarter each and PULL
  // takes what is left, so it stays the obvious target.
  const gapB = 6
  const fillW = Math.min(120, (L.w - pad * 2 - gapB * 2) * 0.26)
  const pullW = L.w - pad * 2 - gapB * 2 - fillW * 2
  const buttonY = L.h - buttonH - pad
  return {
    sizes,
    difficulties,
    slots,
    partyLabels,
    classes,
    auto: { x: pad, y: buttonY, w: fillW, h: buttonH },
    random: { x: pad + fillW + gapB, y: buttonY, w: fillW, h: buttonH },
    pull: { x: pad + (fillW + gapB) * 2, y: buttonY, w: pullW, h: buttonH },
    titleY,
    summaryY,
    slotCols,
  }
}

function inside(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}

export function hitRoster(x: number, y: number, size: number): RosterHit | null {
  const layout = rosterLayout(size)
  if (inside(layout.pull, x, y)) return { kind: 'pull' }
  if (inside(layout.auto, x, y)) return { kind: 'auto' }
  if (inside(layout.random, x, y)) return { kind: 'random' }

  for (let i = 0; i < layout.sizes.length; i++) {
    if (inside(layout.sizes[i]!, x, y)) return { kind: 'size', size: RAID_SIZES[i]! }
  }
  for (let i = 0; i < layout.difficulties.length; i++) {
    if (inside(layout.difficulties[i]!, x, y)) {
      return { kind: 'difficulty', id: DIFFICULTY_ORDER[i]! }
    }
  }
  for (let i = 0; i < layout.slots.length; i++) {
    if (inside(layout.slots[i]!, x, y)) return { kind: 'slot', index: i }
  }
  for (let i = 0; i < layout.classes.length; i++) {
    if (inside(layout.classes[i]!, x, y)) return { kind: 'class', pick: SPEC_OPTIONS[i]! }
  }
  return null
}

function font(size: number, bold = false): string {
  return `${bold ? 'bold ' : ''}${Math.round(size * L.ui)}px ui-monospace, monospace`
}

function tab(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  label: string,
  active: boolean,
  accent: string,
): void {
  ctx.fillStyle = active ? 'rgba(250, 204, 21, 0.12)' : COLORS.panel
  ctx.fillRect(r.x, r.y, r.w, r.h)
  ctx.strokeStyle = active ? accent : COLORS.panelEdge
  ctx.lineWidth = active ? 2 : 1
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1)
  ctx.fillStyle = active ? accent : COLORS.textDim
  ctx.font = font(11, active)
  ctx.textAlign = 'center'
  ctx.fillText(label, r.x + r.w / 2, r.y + r.h * 0.66)
}

export function drawRoster(
  ctx: CanvasRenderingContext2D,
  party: Pick[],
  difficulty: DifficultyId,
  activeSlot: number,
  clock: number,
): void {
  const layout = rosterLayout(party.length)
  const slots = makeSlots(party.length as RaidSize)

  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, L.w, L.h)

  ctx.textAlign = 'center'
  ctx.fillStyle = COLORS.text
  ctx.font = font(17, true)
  ctx.fillText('FORM YOUR RAID', L.w / 2, layout.titleY)

  RAID_SIZES.forEach((size, i) => {
    tab(ctx, layout.sizes[i]!, `${size}`, size === party.length, COLORS.castBar)
  })
  DIFFICULTY_ORDER.forEach((id, i) => {
    tab(
      ctx,
      layout.difficulties[i]!,
      DIFFICULTIES[id].name,
      id === difficulty,
      id === 'heroic' ? COLORS.hpBarLow : COLORS.castBar,
    )
  })

  // Party numbers down the left, so the rows read as groups rather than wrap.
  ctx.textAlign = 'center'
  for (let g = 0; g < layout.partyLabels.length; g++) {
    const r = layout.partyLabels[g]!
    ctx.fillStyle = COLORS.textDim
    ctx.font = font(9, true)
    ctx.fillText(`${g + 1}`, r.x + r.w / 2, r.y + r.h * 0.6)
  }

  const compact = layout.slots[0]!.h < 60
  for (let i = 0; i < layout.slots.length; i++) {
    const r = layout.slots[i]!
    const pick = party[i]!
    const spec = specOf(pick)
    const active = i === activeSlot

    ctx.fillStyle = active ? 'rgba(250, 204, 21, 0.12)' : COLORS.panel
    ctx.fillRect(r.x, r.y, r.w, r.h)
    ctx.strokeStyle = active ? COLORS.castBar : COLORS.panelEdge
    ctx.lineWidth = active ? 2 : 1
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1)

    // A colour stripe makes the role balance readable at a glance across 25.
    ctx.fillStyle = ROLE_COLOR[spec.role] ?? COLORS.text
    ctx.fillRect(r.x, r.y, r.w, 3)

    const cx = r.x + r.w / 2
    ctx.fillStyle = i === 0 ? COLORS.player : COLORS.textDim
    ctx.font = font(compact ? 8 : 10, i === 0)
    ctx.fillText(i === 0 ? 'YOU' : slots[i]!.name, cx, r.y + (compact ? 15 : 18) * L.ui)

    ctx.fillStyle = ROLE_COLOR[spec.role] ?? COLORS.text
    ctx.font = font(compact ? 9 : 12, true)
    ctx.fillText(specLabel(pick), cx, r.y + r.h * (compact ? 0.72 : 0.62))

    if (!compact) {
      ctx.fillStyle = COLORS.textDim
      ctx.font = font(9)
      ctx.fillText(
        `${Math.round(mitigation(spec.armor) * 100)}% phys · ${spec.hp} hp`,
        cx,
        r.y + r.h - 8 * L.ui,
      )
    }
  }

  const roles = countRoles(party)
  const problems: string[] = []
  if (roles.tank < ROLE_LIMITS.tank.min) problems.push('no tank')
  if (roles.tank > ROLE_LIMITS.tank.max) problems.push(`${roles.tank} tanks, max ${ROLE_LIMITS.tank.max}`)
  if (roles.healer < ROLE_LIMITS.healer.min) problems.push('no healer')
  if (roles.healer > ROLE_LIMITS.healer.max) {
    problems.push(`${roles.healer} healers, max ${ROLE_LIMITS.healer.max}`)
  }

  ctx.textAlign = 'center'
  ctx.font = font(11)
  ctx.fillStyle = problems.length > 0 ? COLORS.hpBarLow : COLORS.textDim
  ctx.fillText(
    problems.length > 0
      ? `${problems.join(' · ')} — this will not hold`
      : `${roles.tank} tank · ${roles.healer} healer · ${roles.dps} damage`,
    L.w / 2,
    layout.summaryY,
  )
  ctx.fillStyle = COLORS.textDim
  ctx.font = font(9)
  ctx.fillText(
    // The trade is worth saying out loud: at a fixed size, picking a role
    // changes two slots, and the second one is not the one you tapped.
    isFixedComposition(party.length)
      ? 'tap a slot, then a class — five-man roles are fixed, picking one trades it'
      : 'tap a slot, then a class',
    L.w / 2,
    layout.summaryY + 13 * L.ui,
  )

  for (let i = 0; i < layout.classes.length; i++) {
    const r = layout.classes[i]!
    const option = SPEC_OPTIONS[i]!
    const spec = specOf(option)
    const current = party[activeSlot]
    const chosen = current?.classId === option.classId && current.role === option.role
    // Past a support cap the pick is not selectable, so it is not offered as
    // one either.
    const locked = !canSelect(party, activeSlot, option)

    ctx.save()
    if (locked) ctx.globalAlpha = 0.32

    ctx.fillStyle = chosen ? 'rgba(74, 222, 128, 0.12)' : COLORS.panel
    ctx.fillRect(r.x, r.y, r.w, r.h)
    ctx.strokeStyle = chosen ? COLORS.player : COLORS.panelEdge
    ctx.lineWidth = chosen ? 2 : 1
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1)

    const cx = r.x + r.w / 2
    ctx.fillStyle = ROLE_COLOR[spec.role] ?? COLORS.text
    ctx.font = font(11, true)
    ctx.fillText(specLabel(option), cx, r.y + r.h * 0.44)

    ctx.fillStyle = COLORS.textDim
    ctx.font = font(8)
    ctx.fillText(
      locked
        ? `max ${ROLE_LIMITS[spec.role].max} ${spec.role === 'dps' ? 'damage' : `${spec.role}s`}`
        : `${spec.melee ? 'melee · ' : ''}${CLASSES[option.classId].armorType} · ${Math.round(mitigation(spec.armor) * 100)}%`,
      cx,
      r.y + r.h * 0.76,
    )
    ctx.restore()
  }

  tab(ctx, layout.auto, 'AUTO', false, COLORS.textDim)
  tab(ctx, layout.random, 'RANDOM', false, COLORS.healer)

  const pulse = 0.75 + 0.25 * Math.sin(clock * 3)
  ctx.fillStyle = `rgba(250, 204, 21, ${(0.14 * pulse).toFixed(2)})`
  ctx.fillRect(layout.pull.x, layout.pull.y, layout.pull.w, layout.pull.h)
  ctx.strokeStyle = COLORS.castBar
  ctx.lineWidth = 2
  ctx.strokeRect(layout.pull.x + 0.5, layout.pull.y + 0.5, layout.pull.w - 1, layout.pull.h - 1)
  ctx.fillStyle = COLORS.castBar
  ctx.font = font(14, true)
  ctx.textAlign = 'center'
  // The label degrades before the button does on a narrow screen.
  const label =
    layout.pull.w > 210
      ? `PULL — ${party.length} player ${DIFFICULTIES[difficulty].name.toLowerCase()}`
      : `PULL ${party.length}`
  ctx.fillText(label, layout.pull.x + layout.pull.w / 2, layout.pull.y + layout.pull.h * 0.62)
}
