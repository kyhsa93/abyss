import {
  CLASSES,
  DIFFICULTIES,
  RAID_SIZES,
  SPEC_OPTIONS,
  mitigation,
  specLabel,
  specOf,
  type DifficultyId,
  type Pick,
  type RaidSize,
} from '../sim/classes'
import { ENCOUNTERS } from '../sim/encounters'
import { COLORS, L, classColor } from './theme'

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
  encounters: Rect[]
  classes: Rect[]
  history: Rect
  pull: Rect
  titleY: number
  summaryY: number
}

export type RosterHit =
  | { kind: 'class'; pick: Pick }
  | { kind: 'size'; size: RaidSize }
  | { kind: 'difficulty'; id: DifficultyId }
  | { kind: 'encounter'; index: number }
  | { kind: 'history' }
  | { kind: 'pull' }

const DIFFICULTY_ORDER: DifficultyId[] = ['normal', 'heroic']

export function rosterLayout(): RosterLayout {
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

  // The bosses get their own row: three names do not fit beside five tabs,
  // and this is the one choice on the screen that is not about your own raid.
  const bossY = tabY + tabH + 6
  const bossW = (L.w - pad * 2 - 4 * (ENCOUNTERS.length - 1)) / ENCOUNTERS.length
  const encounters = ENCOUNTERS.map((_, i) => ({
    x: pad + i * (bossW + 4),
    y: bossY,
    w: bossW,
    h: tabH,
  }))

  // No slot grid: the only pick anyone makes is their own, and the rest of
  // the raid is rolled at the door. A board of twenty-four strangers you did
  // not choose and cannot change is a readout nobody needs before a pull.
  const gap = Math.max(3, pad * 0.3)
  const summaryY = bossY + tabH + 26 * L.ui

  const buttonH = Math.max(38, Math.min(52, L.h * 0.062))
  const gridTop = summaryY + 22
  const gridBottom = L.h - buttonH - pad * 2

  // One tile per spec, filling the screen the slot grid used to take. Widen
  // the grid until its rows fit rather than letting it run off the bottom;
  // the last candidate is the spec count itself, so the fallback is always a
  // single row however many there are — it was a hard-coded fifteen, and the
  // sixteenth spec pushed the grid off the bottom of a landscape phone.
  const minCellH = 34
  const candidates = L.portrait ? [3, 4, 5] : [5, 6, 8, SPEC_OPTIONS.length]
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

  // Two buttons on one row, and PULL takes what is left so it stays the
  // obvious target. AUTO and REROLL both used to sit here: one filled the
  // raid deterministically and the other rolled it, and neither means
  // anything once the raid is neither shown nor chosen.
  const gapB = 6
  const fillW = Math.min(120, (L.w - pad * 2 - gapB) * 0.26)
  const pullW = L.w - pad * 2 - gapB - fillW
  const buttonY = L.h - buttonH - pad
  return {
    sizes,
    difficulties,
    encounters,
    classes,
    history: { x: pad, y: buttonY, w: fillW, h: buttonH },
    pull: { x: pad + fillW + gapB, y: buttonY, w: pullW, h: buttonH },
    titleY,
    summaryY,
  }
}

function inside(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}

export function hitRoster(x: number, y: number): RosterHit | null {
  const layout = rosterLayout()
  if (inside(layout.pull, x, y)) return { kind: 'pull' }
  if (inside(layout.history, x, y)) return { kind: 'history' }

  for (let i = 0; i < layout.sizes.length; i++) {
    if (inside(layout.sizes[i]!, x, y)) return { kind: 'size', size: RAID_SIZES[i]! }
  }
  for (let i = 0; i < layout.difficulties.length; i++) {
    if (inside(layout.difficulties[i]!, x, y)) {
      return { kind: 'difficulty', id: DIFFICULTY_ORDER[i]! }
    }
  }
  // Whether the boss is reachable yet is the caller's business: the hit test
  // says what was pressed, not what is allowed.
  for (let i = 0; i < layout.encounters.length; i++) {
    if (inside(layout.encounters[i]!, x, y)) return { kind: 'encounter', index: i }
  }
  // Slots are a readout, not a control: the only pick anyone makes is their
  // own, and that is made from the class list.
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
  clock: number,
  encounter: number,
  /** Highest boss reached; anything past it is drawn locked and refuses taps. */
  unlocked: number,
): void {
  // Slot zero is the player's, and the only one they choose.
  const activeSlot = 0
  const layout = rosterLayout()

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

  ENCOUNTERS.forEach((fight, i) => {
    const locked = i > unlocked
    const r = layout.encounters[i]!
    if (locked) {
      // Named rather than hidden. A boss you cannot reach yet is information;
      // an empty slot where one will appear is a puzzle.
      ctx.fillStyle = COLORS.panel
      ctx.fillRect(r.x, r.y, r.w, r.h)
      ctx.strokeStyle = COLORS.panelEdge
      ctx.lineWidth = 1
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1)
      ctx.fillStyle = COLORS.dead
      ctx.font = font(11)
      ctx.textAlign = 'center'
      ctx.fillText(`${fight.short} 🔒`, r.x + r.w / 2, r.y + r.h * 0.66)
      return
    }
    tab(ctx, r, fight.short, i === encounter, COLORS.boss)
  })

  // What you are playing, which is the only thing on this screen you decide.
  const own = party[activeSlot]
  const spec = own ? specOf(own) : null
  ctx.textAlign = 'center'
  ctx.font = font(13, true)
  ctx.fillStyle = own ? classColor(own.classId) : COLORS.text
  ctx.fillText(own ? specLabel(own) : 'pick a class', L.w / 2, layout.summaryY)

  ctx.fillStyle = COLORS.textDim
  ctx.font = font(10)
  ctx.fillText(
    spec
      ? `${spec.role} · ${spec.resource} · ${Math.round(mitigation(spec.armor) * 100)}% phys · ${spec.hp} hp`
      : '',
    L.w / 2,
    layout.summaryY + 15 * L.ui,
  )

  ctx.font = font(9)
  ctx.fillText(
    `${party.length} player ${DIFFICULTIES[difficulty].name.toLowerCase()} — the rest of the raid is rolled at the door`,
    L.w / 2,
    layout.summaryY + 28 * L.ui,
  )

  const fight = ENCOUNTERS[encounter]
  if (fight) {
    ctx.fillStyle = COLORS.boss
    ctx.font = font(10, true)
    ctx.fillText(`${fight.name} — ${fight.demand}`, L.w / 2, layout.summaryY + 41 * L.ui)
  }

  for (let i = 0; i < layout.classes.length; i++) {
    const r = layout.classes[i]!
    const option = SPEC_OPTIONS[i]!
    const spec = specOf(option)
    const current = party[activeSlot]
    const chosen = current?.classId === option.classId && current.spec === option.spec

    ctx.save()

    ctx.fillStyle = chosen ? 'rgba(74, 222, 128, 0.12)' : COLORS.panel
    ctx.fillRect(r.x, r.y, r.w, r.h)
    ctx.strokeStyle = chosen ? COLORS.player : COLORS.panelEdge
    ctx.lineWidth = chosen ? 2 : 1
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1)

    const cx = r.x + r.w / 2
    ctx.fillStyle = classColor(option.classId)
    ctx.font = font(11, true)
    ctx.fillText(specLabel(option), cx, r.y + r.h * 0.44)

    ctx.fillStyle = COLORS.textDim
    ctx.font = font(8)
    ctx.fillText(
      `${spec.melee ? 'melee · ' : ''}${CLASSES[option.classId].armorType} · ${Math.round(mitigation(spec.armor) * 100)}%`,
      cx,
      r.y + r.h * 0.76,
    )
    ctx.restore()
  }

  tab(ctx, layout.history, 'RECORD', false, COLORS.text)

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
