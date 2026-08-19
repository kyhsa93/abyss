import { HISTORY_LIMIT, label, totals, type Attempt } from '../history'
import { COLORS, L, roleColor } from './theme'

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
  titleY: number
  totalsY: number
  rowH: number
}

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

  return {
    back: { x: pad, y: L.h - buttonH - pad, w: L.w - pad * 2, h: buttonH },
    blocks,
    titleY,
    totalsY,
    rowH,
  }
}

export function hitHistory(x: number, y: number, rowCounts: number[]): 'back' | null {
  const r = historyLayout(rowCounts).back
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h ? 'back' : null
}

/** Local date and time, short enough to sit in a header. */
function when(at: number): string {
  const d = new Date(at)
  const pad = (n: number) => `${n}`.padStart(2, '0')
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function drawHistory(ctx: CanvasRenderingContext2D, entries: Attempt[]): void {
  const layout = historyLayout(entries.map((e) => e.standings.length))
  const pad = Math.max(8, L.w * 0.02)

  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, L.w, L.h)

  ctx.textAlign = 'left'
  ctx.fillStyle = COLORS.text
  ctx.font = font(16, true)
  ctx.fillText('RECORD', pad, layout.titleY)

  const t = totals(entries)
  ctx.font = font(11)
  ctx.fillStyle = COLORS.textDim
  ctx.fillText(
    [
      `${t.pulls} pull${t.pulls === 1 ? '' : 's'}`,
      `${t.kills} kill${t.kills === 1 ? '' : 's'}`,
      t.bestOwn > 0 ? `your best ${t.bestOwn}` : null,
      t.bestAny > 0 ? `raid best ${t.bestAny}` : null,
    ]
      .filter((p): p is string => p !== null)
      .join('  ·  '),
    pad,
    layout.totalsY,
  )

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
      const colour = row.isPlayer ? COLORS.player : COLORS.text
      const baseline = r.y + r.h - 4

      ctx.globalAlpha = 0.22
      ctx.fillStyle = row.isPlayer ? COLORS.player : roleColor('dps', false)
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
