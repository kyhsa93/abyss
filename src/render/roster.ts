import { bar } from '../sim/constants'
import {
  CLASSES,
  DIFFICULTIES,
  SPEC_OPTIONS,
  mitigation,
  specLabel,
  specOf,
  type DifficultyId,
  type Pick,
} from '../sim/classes'
import { ENCOUNTERS, MECHANIC_NAMES, encounterKit } from '../sim/encounters'
import { BATTLEGROUNDS } from '../sim/battleground'
import type { BgKind } from '../sim/types'
import { COLORS, L, classColor, MENU_TEXT, fitText } from './theme'
import { drawBackdrop } from './ambience'

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
  classes: Rect[]
  history: Rect
  pull: Rect
  titleY: number
  /** Baseline of the first summary line; the rest step down by `summaryLine`. */
  summaryY: number
  summaryLine: number
  /** Top of the spec grid. Always below the last summary line. */
  gridTop: number
}

/**
 * How many lines of text sit between the tabs and the grid.
 *
 * Counted rather than assumed, because the grid starts under the last of them
 * and a fifth line added without touching this would be drawn over the specs.
 */
const SUMMARY_LINES = 5

export type RosterHit = { kind: 'class'; pick: Pick } | { kind: 'back' } | { kind: 'pull' }

/**
 * What you are queueing for.
 *
 * A raid and the two battlegrounds sit on one row because they answer the same
 * question — what happens when you press PULL — and because the rest of the
 * screen means different things depending on the answer.
 */
export type RosterMode = { kind: 'raid' } | { kind: 'bg'; bg: BgKind }

export function modeLabel(mode: RosterMode): string {
  if (mode.kind === 'raid') return 'RAID'
  return BATTLEGROUNDS.find((b) => b.kind === mode.bg)?.name ?? 'Battleground'
}

export function sameMode(a: RosterMode, b: RosterMode): boolean {
  return a.kind === b.kind && (a.kind !== 'bg' || b.kind !== 'bg' || a.bg === b.bg)
}

/**
 * Where everything on the party screen goes.
 *
 * It takes the mode because the mode decides what exists. Size, difficulty and
 * the boss list are the raid's dials; a battleground is five a side at one
 * difficulty, so drawing them there would be three controls that do nothing —
 * and reserving their rows anyway, which is what this used to do, left a
 * tenth of the screen blank above a grid that had nowhere to go.
 *
 * The summary lines are counted rather than placed by hand. Adding the boss
 * name as a fourth line without moving the grid down is how it ended up drawn
 * across the first row of specs.
 */
/**
 * Where the class grid and its summary go.
 *
 * This screen asks one question now — who are you playing — so it has no tabs
 * on it. What kind of fight, which boss, what size and what difficulty are all
 * answered before you get here, on their own screens.
 */
export function rosterLayout(): RosterLayout {
  const pad = Math.max(8, L.w * 0.02)
  const titleY = Math.max(24, L.h * 0.05)

  // No slot grid: the only pick anyone makes is their own, and the rest of
  // the raid is rolled at the door. A board of twenty-four strangers you did
  // not choose and cannot change is a readout nobody needs before a pull.
  const gap = Math.max(3, pad * 0.3)
  const summaryY = titleY + 26 * L.ui * MENU_TEXT
  const summaryLine = 13 * L.ui * MENU_TEXT

  const buttonH = Math.max(38, Math.min(52, L.h * 0.062))
  // Below the last summary line rather than a fixed step below the first one.
  const gridTop = summaryY + (SUMMARY_LINES - 1) * summaryLine + 14
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
    classes,
    // Named for what it does rather than where it goes: this is the way out
    // of the screen, and the record lives on the front page now.
    history: { x: pad, y: buttonY, w: fillW, h: buttonH },
    pull: { x: pad + fillW + gapB, y: buttonY, w: pullW, h: buttonH },
    titleY,
    summaryY,
    summaryLine,
    gridTop,
  }
}

function inside(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}

export function hitRoster(x: number, y: number): RosterHit | null {
  const layout = rosterLayout()
  if (inside(layout.pull, x, y)) return { kind: 'pull' }
  if (inside(layout.history, x, y)) return { kind: 'back' }

  // Slots are a readout, not a control: the only pick anyone makes is their
  // own, and that is made from the class list.
  for (let i = 0; i < layout.classes.length; i++) {
    if (inside(layout.classes[i]!, x, y)) return { kind: 'class', pick: SPEC_OPTIONS[i]! }
  }
  return null
}

function font(size: number, bold = false): string {
  return `${bold ? 'bold ' : ''}${Math.round(size * L.ui * MENU_TEXT)}px ui-monospace, monospace`
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
  fitText(ctx, label, r.x + r.w / 2, r.y + r.h * 0.66, r.w - 10)
}

export function drawRoster(
  ctx: CanvasRenderingContext2D,
  party: Pick[],
  difficulty: DifficultyId,
  clock: number,
  encounter: number,
  mode: RosterMode = { kind: 'raid' },
): void {
  // Slot zero is the player's, and the only one they choose.
  const activeSlot = 0
  const layout = rosterLayout()

  drawBackdrop(ctx)

  ctx.textAlign = 'center'
  ctx.fillStyle = COLORS.text
  ctx.font = font(17, true)
  ctx.fillText('PICK YOUR CLASS', L.w / 2, layout.titleY)

  // What you are playing, which is the only thing on this screen you decide,
  // and then what you are walking into. Four lines, stepping down from the
  // same baseline the grid was placed under.
  const line = (n: number) => layout.summaryY + n * layout.summaryLine
  const own = party[activeSlot]
  const spec = own ? specOf(own) : null
  ctx.textAlign = 'center'
  ctx.font = font(13, true)
  ctx.fillStyle = own ? classColor(own.classId) : COLORS.text
  ctx.fillText(own ? specLabel(own) : 'pick a class', L.w / 2, line(0))

  ctx.fillStyle = COLORS.textDim
  ctx.font = font(10)
  fitText(
    ctx,
    spec
      ? `${spec.role} · ${spec.resource} · ${Math.round(mitigation(spec.armor) * 100)}% phys · ${bar(spec.hp)} hp`
      : '',
    L.w / 2,
    line(1),
    L.w - 16,
  )

  const fight = mode.kind === 'raid' ? ENCOUNTERS[encounter] : null
  const bg = mode.kind === 'bg' ? BATTLEGROUNDS.find((b) => b.kind === mode.bg) : null

  ctx.font = font(9)
  fitText(
    ctx,
    mode.kind === 'raid'
      ? `${party.length} player ${DIFFICULTIES[difficulty].name.toLowerCase()} — the rest of the raid is rolled at the door`
      : 'five against five — the other five are rolled at the door',
    L.w / 2,
    line(2),
    L.w - 16,
  )

  const headline = fight ?? bg
  if (headline) {
    ctx.fillStyle = mode.kind === 'raid' ? COLORS.boss : COLORS.tank
    ctx.font = font(10, true)
    fitText(ctx, `${headline.name} — ${headline.demand}`, L.w / 2, line(3), L.w - 16)
  }

  // And the same list the setup screen showed, repeated where the pull button
  // is. The size and the difficulty were chosen a screen ago and cannot be
  // changed here, so this is the last place the player can read what they
  // bought before walking into it.
  if (fight) {
    ctx.fillStyle = COLORS.textDim
    ctx.font = font(9)
    fitText(
      ctx,
      encounterKit(fight, party.length, difficulty)
        .map((id) => MECHANIC_NAMES[id])
        .join(' · '),
      L.w / 2,
      line(4),
      L.w - 16,
    )
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
    fitText(ctx, specLabel(option), cx, r.y + r.h * 0.44, r.w - 8)

    ctx.fillStyle = COLORS.textDim
    ctx.font = font(8)
    fitText(
      ctx,
      `${spec.melee ? 'melee · ' : ''}${CLASSES[option.classId].armorType} · ${Math.round(mitigation(spec.armor) * 100)}%`,
      cx,
      r.y + r.h * 0.76,
      r.w - 8,
    )
    ctx.restore()
  }

  tab(ctx, layout.history, 'BACK', false, COLORS.text)

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
    mode.kind !== 'raid'
      ? layout.pull.w > 210
        ? `ENTER — ${modeLabel(mode).toUpperCase()}`
        : 'ENTER'
      : layout.pull.w > 210
        ? `PULL — ${party.length} player ${DIFFICULTIES[difficulty].name.toLowerCase()}`
        : `PULL ${party.length}`
  fitText(ctx, label, layout.pull.x + layout.pull.w / 2, layout.pull.y + layout.pull.h * 0.62, layout.pull.w - 12)
}
