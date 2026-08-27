import { AWARDS, type Earned } from '../achievements'
import { ENCOUNTERS, MECHANIC_NAMES } from '../sim/encounters'
import { HISTORY_LIMIT, label, totals, type Attempt } from '../history'
import { metOverall, pageFor, type Notes } from '../notes'
import { COLORS, L, classColor, MENU_TEXT, fitText } from './theme'
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
  /** One per boss, for the notes tab with no page open. */
  bosses: Rect[]
  /** One per rung of the open boss's ladder, for the page itself. */
  rungs: Rect[]
  tabs: Rect[]
  titleY: number
  totalsY: number
  /** Where an open page writes its two header lines. */
  pageY: number
  rowH: number
}

export type HistoryTab = 'pulls' | 'awards' | 'bosses'
export const HISTORY_TABS: HistoryTab[] = ['pulls', 'awards', 'bosses']

/**
 * What a tap on the record screen was.
 *
 * A union rather than a string now that one of the tabs has something inside
 * it to press: a hit test that answers "bosses" for both the tab and a boss
 * cannot be told apart by the caller.
 */
export type HistoryHit =
  | { kind: 'back' }
  | { kind: 'tab'; tab: HistoryTab }
  | { kind: 'boss'; index: number }

/** The longest ladder any boss has, which is what the page has to hold. */
const LADDER_ROWS = Math.max(...ENCOUNTERS.map((e) => e.ladder.length))

function font(size: number, bold = false): string {
  return `${bold ? 'bold ' : ''}${Math.round(size * L.ui * MENU_TEXT)}px ui-monospace, monospace`
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
  const totalsY = titleY + 26 * L.ui * MENU_TEXT

  const buttonH = Math.max(38, Math.min(52, L.h * 0.062))
  const top = totalsY + 16 * L.ui * MENU_TEXT
  const bottom = L.h - buttonH - pad * 2

  const rowH = Math.max(13, Math.min(22, L.h * 0.028)) * MENU_TEXT
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
  const awardH = Math.max(20, Math.min(34, L.h * 0.042)) * MENU_TEXT
  const awardGap = 4
  const awards: Rect[] = []
  for (let i = 0; i < AWARDS.length; i++) {
    const ry = top + i * (awardH + awardGap)
    if (ry + awardH > bottom) break
    awards.push({ x: pad, y: ry, w: L.w - pad * 2, h: awardH })
  }

  // The boss list is the same list in the same space, at a row apiece, and
  // an open page is that boss's ladder under two lines of header. Both are
  // laid out whichever is showing, since a layout that depended on what was
  // open would have to be recomputed to answer where a press landed.
  const bossH = Math.max(24, Math.min(40, L.h * 0.05)) * MENU_TEXT
  const bossGap = 4
  const bosses: Rect[] = []
  for (let i = 0; i < ENCOUNTERS.length; i++) {
    const ry = top + i * (bossH + bossGap)
    if (ry + bossH > bottom) break
    bosses.push({ x: pad, y: ry, w: L.w - pad * 2, h: bossH })
  }

  const pageY = top + 12 * L.ui * MENU_TEXT
  const rungTop = pageY + 26 * L.ui * MENU_TEXT
  const rungH = Math.max(
    22,
    Math.min(bossH, (bottom - rungTop - bossGap * (LADDER_ROWS - 1)) / LADDER_ROWS),
  )
  const rungs: Rect[] = []
  for (let i = 0; i < LADDER_ROWS; i++) {
    rungs.push({ x: pad, y: rungTop + i * (rungH + bossGap), w: L.w - pad * 2, h: rungH })
  }

  // The tabs, sized off the title line they sit beside.
  const tabW = Math.max(64, Math.min(110, L.w * 0.2))
  const tabH = Math.max(20, Math.min(30, L.h * 0.038)) * MENU_TEXT
  const tabs = HISTORY_TABS.map((_, i) => ({
    x: L.w - pad - (HISTORY_TABS.length - i) * (tabW + 6) + 6,
    // Clamped: the tab is title-height now, and hanging three quarters of it
    // above the title line put its top off the screen.
    y: Math.max(6, titleY - tabH * 0.6),
    w: tabW,
    h: tabH,
  }))

  return {
    back: { x: pad, y: L.h - buttonH - pad, w: L.w - pad * 2, h: buttonH },
    blocks,
    awards,
    bosses,
    rungs,
    tabs,
    titleY,
    totalsY,
    pageY,
    rowH,
  }
}

const inside = (r: Rect, x: number, y: number) =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h

export function hitHistory(
  x: number,
  y: number,
  rowCounts: number[],
  tab: HistoryTab = 'pulls',
  /** Which boss's page is open, if the notes tab has one. */
  open: number | null = null,
): HistoryHit | null {
  const layout = historyLayout(rowCounts)
  if (inside(layout.back, x, y)) return { kind: 'back' }
  for (let i = 0; i < layout.tabs.length; i++) {
    if (inside(layout.tabs[i]!, x, y)) return { kind: 'tab', tab: HISTORY_TABS[i]! }
  }
  // Only the list picks a boss. With a page open the rows under the pointer
  // are that boss's mechanics, and none of them is a thing to press.
  if (tab === 'bosses' && open === null) {
    for (let i = 0; i < layout.bosses.length; i++) {
      if (inside(layout.bosses[i]!, x, y)) return { kind: 'boss', index: i }
    }
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
  notes: Notes = {},
  /** Which boss's page is open on the notes tab, if any. */
  open: number | null = null,
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
    fitText(
      ctx,
      id === 'pulls' ? 'PULLS' : id === 'awards' ? 'AWARDS' : 'BOSSES',
      r.x + r.w / 2,
      r.y + r.h * 0.68,
      r.w - 8,
    )
  })

  const t = totals(entries)
  const held = AWARDS.filter((a) => earned[a.id] !== undefined).length
  const overall = metOverall(notes)
  ctx.textAlign = 'left'
  ctx.font = font(11)
  ctx.fillStyle = COLORS.textDim
  fitText(
    ctx,
    tab === 'pulls'
      ? [
          `${t.pulls} pull${t.pulls === 1 ? '' : 's'}`,
          `${t.kills} kill${t.kills === 1 ? '' : 's'}`,
          t.bestOwn > 0 ? `your best ${t.bestOwn}` : null,
          t.bestAny > 0 ? `raid best ${t.bestAny}` : null,
        ]
          .filter((p): p is string => p !== null)
          .join('  ·  ')
      : tab === 'awards'
        ? `${held} of ${AWARDS.length} earned`
        : `${overall.met} of ${overall.total} mechanics met`,
    pad,
    layout.totalsY,
    L.w - pad * 2,
  )

  if (tab === 'awards') {
    drawAwards(ctx, layout, earned)
    drawBack(ctx, layout, 'BACK')
    return
  }

  if (tab === 'bosses') {
    if (open === null) drawBossList(ctx, layout, notes)
    else drawBossPage(ctx, layout, notes, open)
    // The way out of a page is the way out of the screen, relabelled. A
    // second button for it would be a button that is only there sometimes.
    drawBack(ctx, layout, open === null ? 'BACK' : 'ALL BOSSES')
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
    fitText(
      ctx,
      `${when(entry.at)}  ·  ${entry.size} ${entry.difficulty}`,
      block.header.x + Math.max(56, L.w * 0.09) * MENU_TEXT,
      block.header.y + block.header.h - 5,
      block.header.w - Math.max(56, L.w * 0.09) * MENU_TEXT,
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
      fitText(ctx, `${j + 1}  ${row.name}`, r.x + 6, baseline, Math.max(110, r.w * 0.2) * MENU_TEXT - 16)

      if (L.w > 520) {
        ctx.fillStyle = COLORS.textDim
        ctx.font = font(9)
        fitText(ctx, label(row.classId, row.spec), r.x + Math.max(110, r.w * 0.2) * MENU_TEXT, baseline, r.w * 0.45 - Math.max(110, r.w * 0.2) * (MENU_TEXT - 1))
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

  drawBack(ctx, layout, 'BACK')
}

/**
 * One row per boss: how much of it you have been shown, and how it has gone.
 *
 * A boss never pulled is listed rather than hidden, blank and named. The list
 * is what says how much of the game is still ahead of you, and a list that
 * only showed what you had already met could not say it.
 */
function drawBossList(ctx: CanvasRenderingContext2D, layout: HistoryLayout, notes: Notes): void {
  layout.bosses.forEach((r, i) => {
    const page = pageFor(notes, i)
    if (!page) return
    const known = page.pulls > 0

    ctx.fillStyle = COLORS.panel
    ctx.fillRect(r.x, r.y, r.w, r.h)
    ctx.fillStyle = known ? COLORS.boss : COLORS.panelEdge
    ctx.fillRect(r.x, r.y, 3, r.h)
    ctx.strokeStyle = COLORS.panelEdge
    ctx.lineWidth = 1
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1)

    const baseline = r.y + r.h * 0.66
    ctx.save()
    if (!known) ctx.globalAlpha = 0.45

    // Three columns, each with its own slot: the longest boss name is twenty
    // characters and the longest tally is eighteen, and sized to the text
    // they printed through each other on a phone.
    const nameW = r.w * 0.45
    ctx.textAlign = 'left'
    ctx.font = font(11, known)
    ctx.fillStyle = known ? COLORS.boss : COLORS.textDim
    fitText(ctx, page.name, r.x + 10, baseline, nameW - 10)

    ctx.fillStyle = COLORS.textDim
    ctx.font = font(9)
    fitText(
      ctx,
      known
        ? `${page.pulls} pull${page.pulls === 1 ? '' : 's'}  ·  ${page.kills} kill${page.kills === 1 ? '' : 's'}`
        : 'never pulled',
      r.x + nameW + 8,
      baseline,
      r.w - nameW - 58 * MENU_TEXT,
    )

    ctx.textAlign = 'right'

    // The count is the part the page is for: what is still unmet.
    ctx.fillStyle = page.metCount === page.rungs.length ? COLORS.hpBar : COLORS.text
    ctx.font = font(10, true)
    ctx.fillText(`${page.metCount}/${page.rungs.length}`, r.x + r.w - 10, baseline)
    ctx.restore()
  })

  // The same note the award list carries, for the same reason: a list that
  // silently stops is a list that reads as the whole list.
  if (ENCOUNTERS.length > layout.bosses.length) {
    ctx.textAlign = 'center'
    ctx.font = font(9)
    ctx.fillStyle = COLORS.textDim
    ctx.fillText(`${ENCOUNTERS.length - layout.bosses.length} more below`, L.w / 2, layout.back.y - 6)
  }
}

/**
 * One boss's page: every mechanic it owns, and what each has cost you.
 *
 * The unmet ones keep their names. What a fight is going to ask is the thing
 * worth knowing before it asks, and the setup screen already says a bigger
 * raid or heroic buys the rest -- this is where a player can see which rest.
 */
function drawBossPage(
  ctx: CanvasRenderingContext2D,
  layout: HistoryLayout,
  notes: Notes,
  open: number,
): void {
  const page = pageFor(notes, open)
  if (!page) return
  const pad = Math.max(8, L.w * 0.02)

  ctx.textAlign = 'left'
  ctx.fillStyle = COLORS.boss
  ctx.font = font(13, true)
  fitText(ctx, page.name, pad, layout.pageY, L.w - pad * 2)

  ctx.fillStyle = COLORS.textDim
  ctx.font = font(9)
  fitText(
    ctx,
    page.pulls === 0
      ? 'never pulled -- everything below is still ahead of you'
      : [
          `${page.pulls} pull${page.pulls === 1 ? '' : 's'}`,
          `${page.kills} kill${page.kills === 1 ? '' : 's'}`,
          `phase ${page.phase} at deepest`,
          page.worst !== null ? `most eaten: ${MECHANIC_NAMES[page.worst]}` : null,
        ]
          .filter((part): part is string => part !== null)
          .join('  ·  '),
    pad,
    layout.pageY + 14 * L.ui * MENU_TEXT,
    L.w - pad * 2,
  )

  page.rungs.forEach((rung, i) => {
    const r = layout.rungs[i]
    if (!r) return

    ctx.fillStyle = COLORS.panel
    ctx.fillRect(r.x, r.y, r.w, r.h)
    // The stripe is how it has gone: met and never eaten is the good case and
    // is the only one that gets the kill colour.
    ctx.fillStyle = !rung.met
      ? COLORS.panelEdge
      : rung.hits === 0
        ? COLORS.hpBar
        : COLORS.hpBarLow
    ctx.fillRect(r.x, r.y, 3, r.h)
    ctx.strokeStyle = COLORS.panelEdge
    ctx.lineWidth = 1
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1)

    const baseline = r.y + r.h * 0.68
    ctx.save()
    if (!rung.met) ctx.globalAlpha = 0.45

    ctx.textAlign = 'left'
    ctx.font = font(11, rung.met)
    ctx.fillStyle = rung.met ? COLORS.text : COLORS.textDim
    fitText(ctx, rung.name, r.x + 10, baseline, r.w * 0.5)

    ctx.textAlign = 'right'
    ctx.font = font(10, rung.hits > 0)
    ctx.fillStyle = !rung.met
      ? COLORS.textDim
      : rung.hits === 0
        ? COLORS.hpBar
        : COLORS.hpBarLow
    ctx.fillText(
      !rung.met ? 'not met' : rung.hits === 0 ? 'never caught you' : `caught you ${rung.hits}x`,
      r.x + r.w - 10,
      baseline,
    )
    ctx.restore()
  })
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
    fitText(ctx, award.name, r.x + 10, baseline, Math.max(120, r.w * 0.24) * MENU_TEXT - 16)

    ctx.font = font(9)
    ctx.fillStyle = COLORS.textDim
    fitText(ctx, award.detail, r.x + Math.max(120, r.w * 0.24) * MENU_TEXT, baseline, r.w - Math.max(120, r.w * 0.24) * MENU_TEXT - 130)

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

function drawBack(ctx: CanvasRenderingContext2D, layout: HistoryLayout, text: string): void {
  const back = layout.back

  ctx.fillStyle = 'rgba(15, 17, 26, 0.85)'
  ctx.fillRect(back.x, back.y, back.w, back.h)
  ctx.strokeStyle = COLORS.castBar
  ctx.lineWidth = 2
  ctx.strokeRect(back.x + 0.5, back.y + 0.5, back.w - 1, back.h - 1)
  ctx.fillStyle = COLORS.castBar
  ctx.font = font(14, true)
  ctx.textAlign = 'center'
  fitText(ctx, text, back.x + back.w / 2, back.y + back.h * 0.62, back.w - 24)
}
