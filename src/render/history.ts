import { AWARDS, type Earned } from '../achievements'
import { HISTORY_LIMIT, label, totals, type Attempt } from '../history'
import { COLORS, L, classColor } from './theme'
import { drawBackdrop } from './ambience'

/**
 * The record screen.
 *
 * One block per pull, newest at the top: a line saying which pull it was and
 * then the meter exactly as it stood when the fight ended. The geometry is
 * computed once and shared by the drawing and the hit test, so the two can
 * never disagree about where the button is.
 */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Block {
  header: Rect
  rows: Rect[]
}

export interface HistoryLayout {
  back: Rect
  blocks: Block[]
  /** One per award, in catalogue order, for the other tab. */
  awards: Rect[]
  tabs: Rect[]
  titleY: number
  totalsY: number
  rowH: number
}

export type HistoryTab = 'pulls' | 'awards'
export const HISTORY_TABS: HistoryTab[] = ['pulls', 'awards']

function font(size: number, bold = false): string {
  return `${bold ? 'bold ' : ''}${Math.round(size * L.ui)}px ui-monospace, monospace`
}

/**
 * Fits as many pulls as the screen has room for.
 *
 * Takes the row count of each pull rather than a flat count, because a
 * five-man's board is a third of a twenty-five man's and packing them at a
 * fixed height would waste most of a phone screen on the small ones.
 */
export function historyLayout(rowCounts: number[]): HistoryLayout {
  const pad = Math.max(8, L.w * 0.02)
  const titleY = Math.max(24, L.h * 0.05)
  const totalsY = titleY + 26 * L.ui

  const buttonH = Math.max(38, Math.min(52, L.h * 0.062))
  const top = totalsY + 16 * L.ui
  const bottom = L.h - buttonH - pad * 2

  const rowH = Math.max(13, Math.min(22, L.h * 0.028))
  const headerH = rowH + 4
  const gap = Math.max(6, rowH * 0.4)

  const blocks: Block[] = []
  let y = top
  for (const count of rowCounts) {
    const height = headerH + count * rowH
    if (y + height > bottom) break

    const rows: Rect[] = []
    for (let i = 0; i < count; i++) {
      rows.push({ x: pad, y: y + headerH + i * rowH, w: L.w - pad * 2, h: rowH })
    }
    blocks.push({ header: { x: pad, y, w: L.w - pad * 2, h: headerH }, rows })
    y += height + gap
  }

  // The awards are the same list in the same space, at a row apiece.
  const awardH = Math.max(20, Math.min(34, L.h * 0.042))
  const awardGap = 4
  const awards: Rect[] = []
  for (let i = 0; i < AWARDS.length; i++) {
    const ry = top + i * (awardH + awardGap)
    if (ry + awardH > bottom) break
    awards.push({ x: pad, y: ry, w: L.w - pad * 2, h: awardH })
  }

  // Two tabs, sized off the title line they sit beside.
  const tabW = Math.max(64, Math.min(110, L.w * 0.2))
  const tabH = Math.max(20, Math.min(30, L.h * 0.038))
  const tabs = HISTORY_TABS.map((_, i) => ({
    x: L.w - pad - (HISTORY_TABS.length - i) * (tabW + 6) + 6,
    y: titleY - tabH * 0.75,
    w: tabW,
    h: tabH,
  }))

  return {
    back: { x: pad, y: L.h - buttonH - pad, w: L.w - pad * 2, h: buttonH },
    blocks,
    awards,
    tabs,
    titleY,
    totalsY,
    rowH,
  }
}

const inside = (r: Rect, x: number, y: number) =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h

export function hitHistory(
  x: number,
  y: number,
  rowCounts: number[],
): 'back' | HistoryTab | null {
  const layout = historyLayout(rowCounts)
  if (inside(layout.back, x, y)) return 'back'
  for (let i = 0; i < layout.tabs.length; i++) {
    if (inside(layout.tabs[i]!, x, y)) return HISTORY_TABS[i]!
  }
  return null
}

/** Local date and time, short enough to sit in a header. */
function when(at: number): string {
  const d = new Date(at)
  const pad = (n: number) => `${n}`.padStart(2, '0')
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function drawHistory(
  ctx: CanvasRenderingContext2D,
  entries: Attempt[],
  earned: Earned,
  tab: HistoryTab,
): void {
  const layout = historyLayout(entries.map((e) => e.standings.length))
  const pad = Math.max(8, L.w * 0.02)

  drawBackdrop(ctx)

  ctx.textAlign = 'left'
  ctx.fillStyle = COLORS.text
  ctx.font = font(16, true)
  ctx.fillText('RECORD', pad, layout.titleY)

  HISTORY_TABS.forEach((id, i) => {
    const r = layout.tabs[i]!
    const active = id === tab
    ctx.fillStyle = active ? 'rgba(250, 204, 21, 0.12)' : COLORS.panel
    ctx.fillRect(r.x, r.y, r.w, r.h)
    ctx.strokeStyle = active ? COLORS.castBar : COLORS.panelEdge
    ctx.lineWidth = active ? 2 : 1
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1)
    ctx.fillStyle = active ? COLORS.castBar : COLORS.textDim
    ctx.font = font(10, active)
    ctx.textAlign = 'center'
    ctx.fillText(id === 'pulls' ? 'PULLS' : 'AWARDS', r.x + r.w / 2, r.y + r.h * 0.68)
  })

  const t = totals(entries)
  const held = AWARDS.filter((a) => earned[a.id] !== undefined).length
  ctx.textAlign = 'left'
  ctx.font = font(11)
  ctx.fillStyle = COLORS.textDim
  ctx.fillText(
    tab === 'pulls'
      ? [
          `${t.pulls} pull${t.pulls === 1 ? '' : 's'}`,
          `${t.kills} kill${t.kills === 1 ? '' : 's'}`,
          t.bestOwn > 0 ? `your best ${t.bestOwn}` : null,
          t.bestAny > 0 ? `raid best ${t.bestAny}` : null,
        ]
          .filter((p): p is string => p !== null)
          .join('  ·  ')
      : `${held} of ${AWARDS.length} earned`,
    pad,
    layout.totalsY,
  )

  if (tab === 'awards') {
    drawAwards(ctx, layout, earned)
    drawBack(ctx, layout)
    return
  }

  if (entries.length === 0) {
    ctx.fillStyle = COLORS.textDim
    ctx.font = font(12)
    ctx.textAlign = 'center'
    ctx.fillText('nothing pulled yet', L.w / 2, L.h * 0.4)
  }

  layout.blocks.forEach((block, i) => {
    const entry = entries[i]!
    const won = entry.outcome === 'victory'
    const outcome = won ? 'KILL' : entry.outcome === 'enrage' ? 'ENRAGE' : 'WIPE'

    ctx.textAlign = 'left'
    ctx.font = font(11, true)
    ctx.fillStyle = won ? COLORS.hpBar : COLORS.hpBarLow
    ctx.fillText(outcome, block.header.x, block.header.y + block.header.h - 5)

    ctx.font = font(10)
    ctx.fillStyle = COLORS.textDim
    ctx.fillText(
      `${when(entry.at)}  ·  ${entry.size} ${entry.difficulty}`,
      block.header.x + Math.max(56, L.w * 0.09),
      block.header.y + block.header.h - 5,
    )

    // The meter as it stood, bars and all: this is the record, so it should
    // read the same way it did while the fight was on.
    const peak = Math.max(1, ...entry.standings.map((r) => r.dps + r.hps))
    block.rows.forEach((r, j) => {
      const row = entry.standings[j]!
      const colour = classColor(row.classId)
      const baseline = r.y + r.h - 4

      ctx.globalAlpha = 0.22
      ctx.fillStyle = classColor(row.classId)
      ctx.fillRect(r.x, r.y, ((row.dps + row.hps) / peak) * r.w, r.h - 2)
      ctx.globalAlpha = 1

      ctx.textAlign = 'left'
      ctx.font = font(10, row.isPlayer)
      ctx.fillStyle = colour
      ctx.fillText(`${j + 1}  ${row.name}`, r.x + 6, baseline)

      if (L.w > 520) {
        ctx.fillStyle = COLORS.textDim
        ctx.font = font(9)
        ctx.fillText(label(row.classId, row.spec), r.x + Math.max(110, r.w * 0.2), baseline)
      }

      ctx.textAlign = 'right'
      ctx.font = font(10, row.isPlayer)
      ctx.fillStyle = row.hps > row.dps ? '#4ade80' : colour
      ctx.fillText(
        row.hps > row.dps ? `${row.hps} hps` : `${row.dps} dps`,
        r.x + r.w - 6,
        baseline,
      )
    })
  })

  if (entries.length > layout.blocks.length) {
    ctx.textAlign = 'center'
    ctx.font = font(9)
    ctx.fillStyle = COLORS.textDim
    ctx.fillText(
      `${entries.length - layout.blocks.length} older kept, of ${HISTORY_LIMIT}`,
      L.w / 2,
      layout.back.y - 6,
    )
  }

  drawBack(ctx, layout)
}

/**
 * The award list.
 *
 * Locked ones are drawn too, and say what they want: an award you cannot see
 * the shape of is not something to go and do, it is a surprise you either had
 * or did not.
 */
function drawAwards(ctx: CanvasRenderingContext2D, layout: HistoryLayout, earned: Earned): void {
  layout.awards.forEach((r, i) => {
    const award = AWARDS[i]!
    const at = earned[award.id]
    const has = at !== undefined

    ctx.fillStyle = COLORS.panel
    ctx.fillRect(r.x, r.y, r.w, r.h)
    ctx.fillStyle = has ? COLORS.castBar : COLORS.panelEdge
    ctx.fillRect(r.x, r.y, 3, r.h)
    ctx.strokeStyle = COLORS.panelEdge
    ctx.lineWidth = 1
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1)

    const baseline = r.y + r.h * 0.66
    ctx.save()
    if (!has) ctx.globalAlpha = 0.45

    ctx.textAlign = 'left'
    ctx.font = font(11, has)
    ctx.fillStyle = has ? COLORS.castBar : COLORS.textDim
    ctx.fillText(award.name, r.x + 10, baseline)

    ctx.font = font(9)
    ctx.fillStyle = COLORS.textDim
    ctx.fillText(award.detail, r.x + Math.max(120, r.w * 0.24), baseline)

    if (has) {
      ctx.textAlign = 'right'
      ctx.fillStyle = COLORS.textDim
      ctx.font = font(9)
      ctx.fillText(when(at), r.x + r.w - 10, baseline)
    }
    ctx.restore()
  })

  if (AWARDS.length > layout.awards.length) {
    ctx.textAlign = 'center'
    ctx.font = font(9)
    ctx.fillStyle = COLORS.textDim
    ctx.fillText(
      `${AWARDS.length - layout.awards.length} more below`,
      L.w / 2,
      layout.back.y - 6,
    )
  }
}

/**
 * An award, announced over the results screen.
 *
 * Stacked downward from under the outcome, and it fades on its own: the only
 * input on that screen is the two buttons, and a banner that needed
 * dismissing would be a third.
 */
export function drawAwardBanners(
  ctx: CanvasRenderingContext2D,
  items: { award: { name: string; detail: string }; age: number }[],
): void {
  items.forEach((item, i) => {
    const fade = Math.min(1, item.age / 0.3, (6 - item.age) / 1.2)
    if (fade <= 0) return

    const w = Math.min(L.w - 32, 340)
    const h = 42 * L.ui
    const x = (L.w - w) / 2
    const y = L.h * 0.22 + i * (h + 8)

    ctx.save()
    ctx.globalAlpha = fade
    ctx.fillStyle = 'rgba(15, 17, 26, 0.94)'
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = COLORS.castBar
    ctx.lineWidth = 2
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)

    ctx.textAlign = 'center'
    ctx.fillStyle = COLORS.castBar
    ctx.font = font(12, true)
    ctx.fillText(item.award.name, L.w / 2, y + h * 0.42)
    ctx.fillStyle = COLORS.textDim
    ctx.font = font(9)
    ctx.fillText(item.award.detail, L.w / 2, y + h * 0.78)
    ctx.restore()
  })
}

function drawBack(ctx: CanvasRenderingContext2D, layout: HistoryLayout): void {
  const back = layout.back

  ctx.fillStyle = 'rgba(15, 17, 26, 0.85)'
  ctx.fillRect(back.x, back.y, back.w, back.h)
  ctx.strokeStyle = COLORS.castBar
  ctx.lineWidth = 2
  ctx.strokeRect(back.x + 0.5, back.y + 0.5, back.w - 1, back.h - 1)
  ctx.fillStyle = COLORS.castBar
  ctx.font = font(14, true)
  ctx.textAlign = 'center'
  ctx.fillText('BACK', back.x + back.w / 2, back.y + back.h * 0.62)
}
