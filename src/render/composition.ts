import { summary } from '../compose'
import {
  CLASSES,
  SPEC_OPTIONS,
  makeSlots,
  specLabel,
  specOf,
  type Pick,
  type RaidSize,
} from '../sim/classes'
import { COLORS, L, classColor, MENU_TEXT, fitText } from './theme'
import { drawBackdrop } from './ambience'
import type { Composing } from '../compose'

/**
 * The raid, laid out and changeable.
 *
 * Its own screen rather than a panel on the class screen, because it answers
 * its own question — who is coming — and the class screen already answers one.
 * That is the rule the rest of these screens were split along.
 *
 * Geometry is computed once and shared by the drawing and the hit test, so
 * the two can never disagree about where a name is.
 */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface CompositionLayout {
  slots: Rect[]
  /** The spec tiles, drawn over the board while a slot is open. */
  specs: Rect[]
  back: Rect
  auto: Rect
  reroll: Rect
  titleY: number
  summaryY: number
  noteY: number
  boardTop: number
  boardBottom: number
}

export type CompositionHit =
  | { kind: 'slot'; index: number }
  | { kind: 'spec'; pick: Pick }
  | { kind: 'back' }
  | { kind: 'auto' }
  | { kind: 'reroll' }
  | { kind: 'dismiss' }

function pad(): number {
  return Math.max(8, L.w * 0.02)
}

function font(size: number, bold = false): string {
  return `${bold ? 'bold ' : ''}${Math.round(size * L.ui * MENU_TEXT)}px ui-monospace, monospace`
}

function inside(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}

/**
 * A grid of `count` tiles that fits between two lines.
 *
 * Shared by the board and the spec list because they are the same problem at
 * two sizes — five names or twenty-five, seventeen specs either way — and
 * because a second copy of this is how one of them ends up running off the
 * bottom of a landscape phone while the other does not.
 */
function grid(count: number, top: number, bottom: number, minH: number): Rect[] {
  const p = pad()
  const gap = Math.max(3, p * 0.3)
  const candidates = L.portrait ? [2, 3, 4, 5] : [4, 5, 6, 8, count]
  let cols = candidates[candidates.length - 1]!
  for (const option of candidates) {
    const rows = Math.ceil(count / option)
    if (top + rows * (minH + gap) <= bottom + gap) {
      cols = option
      break
    }
  }
  cols = Math.max(1, Math.min(cols, count))

  const rows = Math.ceil(count / cols)
  const cellW = (L.w - p * 2 - gap * (cols - 1)) / cols
  const cellH = Math.max(minH, Math.min(58, (bottom - top - gap * (rows - 1)) / rows))

  const out: Rect[] = []
  for (let i = 0; i < count; i++) {
    out.push({
      x: p + (i % cols) * (cellW + gap),
      y: top + Math.floor(i / cols) * (cellH + gap),
      w: cellW,
      h: cellH,
    })
  }
  return out
}

export function compositionLayout(size: number): CompositionLayout {
  const p = pad()
  const titleY = Math.max(24, L.h * 0.05)
  const summaryY = titleY + 22 * L.ui * MENU_TEXT
  const noteY = summaryY + 14 * L.ui * MENU_TEXT

  const buttonH = Math.max(38, Math.min(52, L.h * 0.062))
  const boardTop = noteY + 14 * L.ui * MENU_TEXT
  const boardBottom = L.h - buttonH - p * 2

  // Twenty-five names want a shorter tile than five do; the floor is what a
  // thumb can hit rather than what the text needs.
  const minH = size > 10 ? 30 : 38

  const gapB = 6
  const sideW = Math.min(110, (L.w - p * 2 - gapB * 2) / 3)
  const buttonY = L.h - buttonH - p
  return {
    slots: grid(size, boardTop, boardBottom, minH),
    specs: grid(SPEC_OPTIONS.length, boardTop, boardBottom, 34),
    back: { x: p, y: buttonY, w: sideW, h: buttonH },
    auto: { x: p + sideW + gapB, y: buttonY, w: sideW, h: buttonH },
    reroll: {
      x: p + (sideW + gapB) * 2,
      y: buttonY,
      w: L.w - p * 2 - (sideW + gapB) * 2,
      h: buttonH,
    },
    titleY,
    summaryY,
    noteY,
    boardTop,
    boardBottom,
  }
}

/**
 * Where a press lands.
 *
 * Takes the open slot because an open list covers the board: a tap on the
 * area the board occupies is a tap on a spec while the list is up, and
 * reading it as the name underneath would change somebody the player cannot
 * see. Anywhere else inside that area dismisses, which is why the list needs
 * no close button of its own.
 */
export function hitComposition(x: number, y: number, c: Composing): CompositionHit | null {
  const layout = compositionLayout(c.party.length)
  if (inside(layout.back, x, y)) return { kind: 'back' }
  if (inside(layout.auto, x, y)) return { kind: 'auto' }
  if (inside(layout.reroll, x, y)) return { kind: 'reroll' }

  if (c.selected !== null) {
    for (let i = 0; i < layout.specs.length; i++) {
      if (inside(layout.specs[i]!, x, y)) return { kind: 'spec', pick: SPEC_OPTIONS[i]! }
    }
    return { kind: 'dismiss' }
  }

  for (let i = 0; i < layout.slots.length; i++) {
    if (inside(layout.slots[i]!, x, y)) return { kind: 'slot', index: i }
  }
  return null
}

const ROLE_MARK: Record<string, string> = { tank: 'T', healer: 'H', dps: 'D' }

function tile(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  accent: string,
  active: boolean,
): void {
  ctx.fillStyle = active ? 'rgba(74, 222, 128, 0.12)' : COLORS.panel
  ctx.fillRect(r.x, r.y, r.w, r.h)
  ctx.strokeStyle = active ? accent : COLORS.panelEdge
  ctx.lineWidth = active ? 2 : 1
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1)
}

function button(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  label: string,
  accent = COLORS.text,
): void {
  ctx.fillStyle = COLORS.panel
  ctx.fillRect(r.x, r.y, r.w, r.h)
  ctx.strokeStyle = COLORS.panelEdge
  ctx.lineWidth = 1
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1)
  ctx.fillStyle = accent
  ctx.font = font(11, true)
  ctx.textAlign = 'center'
  fitText(ctx, label, r.x + r.w / 2, r.y + r.h * 0.64, r.w - 10)
}

export function drawComposition(ctx: CanvasRenderingContext2D, c: Composing): void {
  const layout = compositionLayout(c.party.length)
  const names = makeSlots(c.party.length as RaidSize)

  drawBackdrop(ctx)

  ctx.textAlign = 'center'
  ctx.fillStyle = COLORS.text
  ctx.font = font(17, true)
  ctx.fillText('THE RAID', L.w / 2, layout.titleY)

  ctx.font = font(11, true)
  ctx.fillStyle = COLORS.textDim
  fitText(ctx, summary(c.party), L.w / 2, layout.summaryY, L.w - 16)

  // One line that is either the rule you just broke or how to use the board.
  // A refusal has to outrank the instruction: a tap that did nothing and said
  // nothing is indistinguishable from a tap that missed.
  ctx.font = font(9)
  ctx.fillStyle = c.refused ? COLORS.hpBarLow : COLORS.textDim
  fitText(
    ctx,
    c.refused ??
      (c.selected === null
        ? 'tap anyone to change what they play'
        : `what does ${names[c.selected]?.name ?? 'this slot'} play?`),
    L.w / 2,
    layout.noteY,
    L.w - 16,
  )

  for (let i = 0; i < layout.slots.length; i++) {
    const r = layout.slots[i]!
    const pick = c.party[i]
    if (!pick) continue
    const spec = specOf(pick)
    const colour = classColor(pick.classId)
    tile(ctx, r, colour, c.selected === i)

    const cx = r.x + r.w / 2
    ctx.fillStyle = i === 0 ? COLORS.player : COLORS.text
    ctx.font = font(10, i === 0)
    fitText(ctx, i === 0 ? 'You' : (names[i]?.name ?? `#${i + 1}`), cx, r.y + r.h * 0.42, r.w - 8)

    ctx.fillStyle = colour
    ctx.font = font(9)
    fitText(ctx, `${ROLE_MARK[spec.role] ?? '?'} ${specLabel(pick)}`, cx, r.y + r.h * 0.8, r.w - 8)
  }

  // The list, over the board rather than beside it: twenty-five names and
  // seventeen specs do not both fit on a phone, and the one being changed is
  // named on the line above.
  if (c.selected !== null) {
    ctx.fillStyle = 'rgba(5, 5, 10, 0.86)'
    ctx.fillRect(0, layout.boardTop - 6, L.w, layout.boardBottom - layout.boardTop + 12)

    const current = c.party[c.selected]
    for (let i = 0; i < layout.specs.length; i++) {
      const r = layout.specs[i]!
      const option = SPEC_OPTIONS[i]!
      const spec = specOf(option)
      const chosen = current?.classId === option.classId && current.spec === option.spec
      tile(ctx, r, COLORS.player, chosen)

      const cx = r.x + r.w / 2
      ctx.fillStyle = classColor(option.classId)
      ctx.font = font(10, true)
      fitText(ctx, specLabel(option), cx, r.y + r.h * 0.45, r.w - 8)

      ctx.fillStyle = COLORS.textDim
      ctx.font = font(8)
      fitText(
        ctx,
        `${spec.role} · ${CLASSES[option.classId].armorType}`,
        cx,
        r.y + r.h * 0.78,
        r.w - 8,
      )
    }
  }

  button(ctx, layout.back, c.selected === null ? 'BACK' : 'CANCEL')
  button(ctx, layout.auto, 'AUTO')
  button(ctx, layout.reroll, 'REROLL')
}
